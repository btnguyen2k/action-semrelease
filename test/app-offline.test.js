import {jest} from '@jest/globals'

const context = {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha'}
const inputs = {}
let octokit
let savedGithubToken
const getOctokit = jest.fn(() => octokit)
const warning = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({
  getInput: name => inputs[name] || '',
  info: jest.fn(),
  warning,
}))
jest.unstable_mockModule('@actions/github', () => ({
  context,
  getOctokit,
}))

const {semrelease} = await import('../src/app.js')

function apiError(status) {
  return Object.assign(new Error(`API error ${status}`), {status})
}

function fileResponse(text) {
  return {data: {type: 'file', encoding: 'base64', content: Buffer.from(text).toString('base64')}}
}

function assertNoWrites() {
  for (const method of ['createTag', 'deleteRef', 'createRef']) {
    expect(octokit.rest.git[method]).not.toHaveBeenCalled()
  }
  expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.useFakeTimers({advanceTimers: 1000})
  savedGithubToken = process.env.GITHUB_TOKEN
  delete process.env.GITHUB_TOKEN
  getOctokit.mockClear()
  warning.mockClear()
  for (const key of Object.keys(inputs)) delete inputs[key]
  Object.assign(inputs, {
    'github-token': 'offline-token',
    'target-sha': 'target',
    'dry-run': 'false',
    'tag-major-release': 'false',
    'tag-minor-release': 'false',
    'tag-prefix': 'v',
    branches: 'main',
    'tag-only': 'false',
  })
  context.sha = 'event-sha'
  octokit = {
    rest: {
      git: {
        getCommit: jest.fn().mockResolvedValue({data: {sha: 'target'}}),
        getRef: jest.fn().mockRejectedValue(apiError(404)),
        getTag: jest.fn(),
        createTag: jest.fn().mockResolvedValue({data: {sha: 'tag-object'}}),
        deleteRef: jest.fn().mockResolvedValue({}),
        createRef: jest.fn().mockResolvedValue({data: {ref: 'created'}}),
      },
      repos: {
        listReleases: jest.fn().mockResolvedValue({data: []}),
        listTags: jest.fn().mockResolvedValue({data: []}),
        getContent: jest.fn().mockResolvedValue(fileResponse('#!VERSION=1.2.3\nfix: issue')),
        getReleaseByTag: jest.fn().mockRejectedValue(apiError(404)),
        createRelease: jest.fn().mockResolvedValue({data: {id: 1}}),
        getCommit: jest.fn().mockResolvedValue({data: {sha: 'branch-tip'}}),
        compareCommits: jest.fn().mockResolvedValue({data: {status: 'ahead'}}),
        listCommits: jest.fn().mockResolvedValue({data: [
          {sha: 'target', commit: {message: 'fix: from history'}},
        ]}),
      },
    },
  }
})

test('AUTH-01: missing token fails before client creation or API calls', async() => {
  delete inputs['github-token']
  await expect(semrelease()).rejects.toThrow('github-token is required')
  expect(getOctokit).not.toHaveBeenCalled()
  for (const methods of Object.values(octokit.rest)) {
    for (const method of Object.values(methods)) expect(method).not.toHaveBeenCalled()
  }
})

test('AUTH-02: input token takes precedence over environment token', async() => {
  process.env.GITHUB_TOKEN = 'environment-token'
  await semrelease()
  expect(getOctokit).toHaveBeenCalledTimes(1)
  expect(getOctokit).toHaveBeenCalledWith('offline-token', {request: {timeout: 30000}})
})

test('AUTH-02: environment token is used when input is absent', async() => {
  delete inputs['github-token']
  process.env.GITHUB_TOKEN = 'environment-token'
  await semrelease()
  expect(getOctokit).toHaveBeenCalledTimes(1)
  expect(getOctokit).toHaveBeenCalledWith('environment-token', {request: {timeout: 30000}})
})

test('creates the exact tag at the resolved target without deleting refs', async() => {
  const result = await semrelease()
  expect(result).toMatchObject({result: 'SUCCESS', releaseVersion: '1.2.3'})
  expect(octokit.rest.git.getCommit).toHaveBeenCalledWith(expect.objectContaining({commit_sha: 'target'}))
  expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({
    tag: 'v1.2.3', object: 'target', type: 'commit',
  }))
  expect(octokit.rest.git.createRef).toHaveBeenCalledWith(expect.objectContaining({
    ref: 'refs/tags/v1.2.3', sha: 'tag-object',
  }))
  expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
  expect(octokit.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ref: 'target'}))
})

test('falls back to the event SHA and uses the canonical resolved SHA', async() => {
  delete inputs['target-sha']
  await semrelease()
  expect(octokit.rest.git.getCommit).toHaveBeenCalledWith(expect.objectContaining({commit_sha: 'event-sha'}))
  expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({object: 'target'}))
})

test('missing target fails before mutation', async() => {
  context.sha = ''
  delete inputs['target-sha']
  await expect(semrelease()).rejects.toThrow('target-sha or github.context.sha is required')
  assertNoWrites()
})

test('unknown target fails before mutation', async() => {
  octokit.rest.git.getCommit.mockRejectedValue(apiError(404))
  await expect(semrelease()).rejects.toThrow('does not exist in this repository')
  assertNoWrites()
})

test.each([403, 500])('TARGET-01: target lookup HTTP %s stops before metadata or mutations', async status => {
  const error = apiError(status)
  octokit.rest.git.getCommit.mockRejectedValue(error)
  await expect(semrelease()).rejects.toBe(error)
  expect(octokit.rest.git.getCommit).toHaveBeenCalledTimes(status === 500 ? 3 : 1)
  expect(octokit.rest.git.getCommit).toHaveBeenCalledWith({
    owner: 'owner', repo: 'repo', commit_sha: 'target',
  })
  for (const method of Object.values(octokit.rest.repos)) {
    expect(method).not.toHaveBeenCalled()
  }
  expect(octokit.rest.git.getRef).not.toHaveBeenCalled()
  expect(octokit.rest.git.getTag).not.toHaveBeenCalled()
  assertNoWrites()
})

describe('HIST-01: configured branch validation', () => {
  test.each([404, 422])('default missing master HTTP %s warns and releases from main', async status => {
    delete inputs.branches
    octokit.rest.repos.getCommit.mockImplementation(async({ref}) => {
      if (ref === 'master') throw apiError(status)
      return {data: {sha: 'branch-tip'}}
    })
    expect((await semrelease()).result).toBe('SUCCESS')
    expect(octokit.rest.repos.getCommit.mock.calls.map(([params]) => params.ref)).toEqual(['main', 'master'])
    expect(warning).toHaveBeenCalledWith(`Branch master does not exist (HTTP ${status}); skipping it.`)
  })

  test('all missing branches fail before reading metadata or writing', async() => {
    inputs.branches = 'missing404,missing422'
    octokit.rest.repos.getCommit.mockImplementation(async({ref}) => {
      throw apiError(ref === 'missing404' ? 404 : 422)
    })
    await expect(semrelease()).rejects.toThrow('None of the configured branches exist')
    expect(warning).toHaveBeenCalledTimes(2)
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    expect(octokit.rest.repos.listReleases).not.toHaveBeenCalled()
    expect(octokit.rest.repos.compareCommits).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test('empty branch list fails before metadata or writes', async() => {
    inputs.branches = ', ; '
    await expect(semrelease()).rejects.toThrow('At least one branch is required')
    expect(octokit.rest.repos.getCommit).not.toHaveBeenCalled()
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test.each([403, 500])('branch lookup HTTP %s propagates without warning or writes', async status => {
    const error = apiError(status)
    octokit.rest.repos.getCommit.mockRejectedValue(error)
    await expect(semrelease()).rejects.toBe(error)
    if (status === 403) expect(warning).not.toHaveBeenCalled()
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    assertNoWrites()
  })
})

describe('HIST-02: target membership in pinned branches', () => {
  test('target equal to branch tip succeeds without comparison', async() => {
    octokit.rest.repos.getCommit.mockResolvedValue({data: {sha: 'target'}})
    expect((await semrelease()).result).toBe('SUCCESS')
    expect(octokit.rest.repos.compareCommits).not.toHaveBeenCalled()
  })

  test.each(['ahead', 'identical'])('comparison status %s accepts target membership', async status => {
    inputs.path = 'src'
    octokit.rest.repos.compareCommits.mockResolvedValue({data: {status}})
    expect((await semrelease()).result).toBe('SUCCESS')
    expect(octokit.rest.repos.compareCommits).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', base: 'target', head: 'branch-tip',
    })
    expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
  })

  test.each(['behind', 'diverged'])('comparison status %s fails despite usable metadata file', async status => {
    octokit.rest.repos.compareCommits.mockResolvedValue({data: {status}})
    await expect(semrelease()).rejects.toThrow('Target commit target is not reachable from any configured branch')
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    expect(octokit.rest.repos.listReleases).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test('event SHA is subject to the same membership validation', async() => {
    delete inputs['target-sha']
    octokit.rest.repos.compareCommits.mockResolvedValue({data: {status: 'diverged'}})
    await expect(semrelease()).rejects.toThrow('not reachable from any configured branch')
    expect(octokit.rest.git.getCommit).toHaveBeenCalledWith(expect.objectContaining({commit_sha: 'event-sha'}))
    assertNoWrites()
  })

  test.each([404, 422, 403, 500])('comparison HTTP %s propagates, not treated as missing branch', async status => {
    const error = apiError(status)
    octokit.rest.repos.compareCommits.mockRejectedValue(error)
    await expect(semrelease()).rejects.toBe(error)
    if (status !== 500) expect(warning).not.toHaveBeenCalled()
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test('accepts membership in a later branch and reuses deduplicated pinned tips for filtered history', async() => {
    inputs.branches = 'main,dev,main'
    inputs.path = 'src'
    octokit.rest.repos.getCommit.mockImplementation(async({ref}) => ({data: {sha: `${ref}-tip`}}))
    octokit.rest.repos.compareCommits.mockImplementation(async({head}) => ({
      data: {status: head === 'main-tip' ? 'diverged' : 'ahead'},
    }))
    octokit.rest.repos.getContent.mockImplementation(async() => {
      octokit.rest.repos.getCommit.mockResolvedValue({data: {sha: 'force-pushed-tip'}})
      throw apiError(404)
    })
    octokit.rest.repos.listReleases.mockResolvedValue({data: [
      {tag_name: 'v2.3.4', created_at: '2026-01-01T00:00:00Z'},
    ]})
    octokit.rest.repos.listCommits.mockImplementation(async({sha}) => ({
      data: sha === 'main-tip'
        ? [{sha: 'unreachable', commit: {message: 'Breaking change: unrelated'}}]
        : [{sha: 'target', commit: {message: 'Fix: target change'}}],
    }))

    expect((await semrelease()).releaseVersion).toBe('2.3.5')
    expect(octokit.rest.repos.getCommit.mock.calls.map(([params]) => params.ref)).toEqual(['main', 'dev'])
    expect(octokit.rest.repos.compareCommits.mock.calls.map(([params]) => params)).toEqual([
      {owner: 'owner', repo: 'repo', base: 'target', head: 'main-tip'},
      {owner: 'owner', repo: 'repo', base: 'target', head: 'dev-tip'},
    ])
    expect(octokit.rest.repos.listCommits.mock.calls.map(([params]) => params.sha)).toEqual([
      'target', 'main-tip', 'dev-tip',
    ])
    for (const [params] of octokit.rest.repos.listCommits.mock.calls) {
      expect(params).toMatchObject({path: 'src', since: '2026-01-01T00:00:00Z'})
    }
  })
})

describe('release baseline selection', () => {
  test.each([
    {id: 'BASE-01', source: 'release', since: '2026-01-02T00:00:00Z'},
    {id: 'BASE-02', source: 'tag', since: '2026-01-01T00:00:00Z'},
  ])('$id: uses the $source version and date for history fallback', async({source, since}) => {
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    octokit.rest.repos.listTags.mockResolvedValue({data: [
      {name: source === 'release' ? 'v9.0.0' : 'v2.3.4', commit: {sha: 'baseline'}},
    ]})
    if (source === 'release') {
      octokit.rest.repos.listReleases.mockResolvedValue({data: [
        {tag_name: 'v2.3.4', created_at: since},
      ]})
    } else {
      octokit.rest.git.getCommit.mockImplementation(async({commit_sha}) => ({
        data: commit_sha === 'baseline'
          ? {sha: 'baseline', committer: {date: since}}
          : {sha: 'target'},
      }))
    }

    const result = await semrelease()

    expect(result).toEqual({
      result: 'SUCCESS',
      releaseVersion: '2.3.5',
      releaseNotes: '### Fixed/Improvements\n\n- Fix: from history',
    })
    expect(octokit.rest.repos.listCommits.mock.calls.map(([params]) => ({
      sha: params.sha, since: params.since,
    }))).toEqual([
      {sha: 'target', since},
      {sha: 'branch-tip', since},
    ])
    expect(octokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({
      tag: 'v2.3.5', object: 'target',
    }))
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: 'refs/tags/v2.3.5', sha: 'tag-object',
    }))
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({
      tag_name: 'v2.3.5', body: result.releaseNotes,
    }))
    if (source === 'release') {
      expect(octokit.rest.repos.listTags).not.toHaveBeenCalled()
      expect(octokit.rest.git.getCommit.mock.calls.map(([params]) => params.commit_sha)).toEqual(['target'])
    } else {
      expect(octokit.rest.repos.listTags).toHaveBeenCalledTimes(1)
      expect(octokit.rest.git.getCommit.mock.calls.map(([params]) => params.commit_sha)).toEqual(['target', 'baseline'])
    }
  })

  test('BASE-03: missing tag baseline commit fails explicitly before metadata or writes', async() => {
    octokit.rest.repos.listTags.mockResolvedValue({data: [
      {name: 'v2.3.4', commit: {sha: 'missing-baseline'}},
    ]})
    octokit.rest.git.getCommit.mockImplementation(async({commit_sha}) => {
      if (commit_sha === 'missing-baseline') throw apiError(404)
      return {data: {sha: 'target'}}
    })

    await expect(semrelease()).rejects.toThrow(
      'Baseline commit missing-baseline for tag v2.3.4 does not exist in this repository',
    )

    expect(octokit.rest.repos.compareCommits).toHaveBeenCalledTimes(1)
    expect(octokit.rest.git.getCommit.mock.calls.map(([params]) => params.commit_sha)).toEqual([
      'target', 'missing-baseline',
    ])
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled()
    expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
    expect(octokit.rest.git.getRef).not.toHaveBeenCalled()
    expect(octokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled()
    assertNoWrites()
  })
})

test('reuses an existing matching tag without recreating it', async() => {
  octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
  expect((await semrelease()).result).toBe('SUCCESS')
  expect(octokit.rest.git.createTag).not.toHaveBeenCalled()
  expect(octokit.rest.git.createRef).not.toHaveBeenCalled()
  expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
  expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
})

test.each([false, true])('rejects conflicting tag even if release exists: %s', async releaseExists => {
  octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'other'}}})
  if (releaseExists) octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})
  await expect(semrelease()).rejects.toThrow('Refusing to move release tag')
  assertNoWrites()
})

describe.each(['release', 'tag'])('BASE-04: historical target with latest %s baseline', source => {
  const since = '2026-02-01T00:00:00Z'
  beforeEach(() => {
    octokit.rest.git.getCommit.mockImplementation(async({commit_sha}) => ({
      data: {sha: commit_sha, committer: {
        date: commit_sha === 'target' ? '2026-01-01T00:00:00Z' : since,
      }},
    }))
    if (source === 'release') {
      octokit.rest.repos.listReleases.mockResolvedValue({data: [
        {tag_name: 'v2.3.4', created_at: since, target_commitish: 'newer-baseline'},
      ]})
    } else {
      octokit.rest.repos.listTags.mockResolvedValue({data: [
        {name: 'v2.3.4', commit: {sha: 'newer-baseline'}},
      ]})
    }
  })

  test.each([
    {text: 'Fix: historical change', version: '2.3.5'},
    {text: '#!VERSION=1.8.0\nFix: historical change', version: '1.8.0'},
  ])('file metadata produces $version at the historical target', async({text, version}) => {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(text))
    expect(await semrelease()).toMatchObject({
      result: 'SUCCESS', releaseVersion: version,
      releaseNotes: '### Fixed/Improvements\n\n- Fix: historical change',
    })
    expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({
      tag: `v${version}`, object: 'target',
    }))
    expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
    expect(octokit.rest.repos.compareCommits).toHaveBeenCalledTimes(1)
    expect(octokit.rest.repos.compareCommits).toHaveBeenCalledWith(expect.objectContaining({
      base: 'target', head: 'branch-tip',
    }))
  })

  test('history fallback retains the newer baseline date and skips empty results', async() => {
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    octokit.rest.repos.listCommits.mockResolvedValue({data: []})
    expect(await semrelease()).toMatchObject({
      result: 'SKIPPED', releaseVersion: '', releaseNotes: '',
    })
    expect(octokit.rest.repos.listCommits.mock.calls.map(([params]) => ({
      sha: params.sha, since: params.since,
    }))).toEqual([{sha: 'target', since}, {sha: 'branch-tip', since}])
    assertNoWrites()
  })
})

test.each([false, true])('RELEASE-01: existing release with missing exact tag fails in dry-run=%s', async dryRun => {
  inputs['dry-run'] = String(dryRun)
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})
  await expect(semrelease()).rejects.toThrow(
    'Release v1.2.3 exists but its exact tag is missing. Inspect the release and manually restore or clean up its state before retrying',
  )
  assertNoWrites()
})

test('existing release is skipped after matching tag verification', async() => {
  octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
  octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})
  expect(await semrelease()).toMatchObject({
    result: 'SKIPPED', releaseVersion: '', releaseNotes: '',
  })
  assertNoWrites()
})

test.each(['target', 'other', null])('handles createRef race resolving to %s', async racedSha => {
  const conflict = apiError(422)
  octokit.rest.git.getRef
    .mockRejectedValueOnce(apiError(404))
    .mockRejectedValueOnce(apiError(404))
  if (racedSha) {
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: racedSha}}})
  }
  octokit.rest.git.createRef.mockRejectedValue(conflict)
  if (racedSha === 'target') {
    expect((await semrelease()).result).toBe('SUCCESS')
  } else if (racedSha) {
    await expect(semrelease()).rejects.toThrow('Refusing to move release tag')
  } else {
    await expect(semrelease()).rejects.toBe(conflict)
  }
  expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
})

test('unexpected ref creation error propagates', async() => {
  const error = apiError(500)
  octokit.rest.git.createRef.mockRejectedValue(error)
  await expect(semrelease()).rejects.toBe(error)
  expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('failed while creating exact tag v1.2.3'))
})

test.each([
  {failedTag: 'v1.2.3', attempted: ['v1.2.3'], createdRefs: [], deletedRefs: []},
  {failedTag: 'v1', attempted: ['v1.2.3', 'v1'], createdRefs: ['refs/tags/v1.2.3'], deletedRefs: []},
  {
    failedTag: 'v1.2',
    attempted: ['v1.2.3', 'v1', 'v1.2'],
    createdRefs: ['refs/tags/v1.2.3', 'refs/tags/v1'],
    deletedRefs: ['tags/v1'],
  },
])('TAG-03: tag-object failure for $failedTag stops downstream writes', async({
  failedTag, attempted, createdRefs, deletedRefs,
}) => {
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  const error = apiError(500)
  octokit.rest.git.createTag.mockImplementation(async({tag}) => {
    if (tag === failedTag) throw error
    return {data: {sha: `object-${tag}`}}
  })

  await expect(semrelease()).rejects.toBe(error)

  expect(octokit.rest.git.createTag.mock.calls.map(([params]) => params.tag)).toEqual(attempted)
  expect(octokit.rest.git.createRef.mock.calls.map(([params]) => ({
    ref: params.ref, sha: params.sha,
  }))).toEqual(createdRefs.map(ref => ({
    ref, sha: `object-${ref.slice('refs/tags/'.length)}`,
  })))
  expect(octokit.rest.git.deleteRef.mock.calls.map(([params]) => params.ref)).toEqual(deletedRefs)
  expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('manually clean up or restore'))
})

describe.each(['v1', 'v1.2'])('ALIAS-02: failure updating %s', failedAlias => {
  test.each(['deleteRef', 'createRef'])('%s failure stops publication without rollback', async method => {
    inputs['tag-major-release'] = 'true'
    inputs['tag-minor-release'] = 'true'
    const error = apiError(500)
    octokit.rest.git[method].mockImplementation(async({ref}) => {
      if (ref === `${method === 'deleteRef' ? 'tags/' : 'refs/tags/'}${failedAlias}`) throw error
      return {}
    })

    await expect(semrelease()).rejects.toBe(error)

    expect(octokit.rest.git.createTag.mock.calls.map(([params]) => params.tag)).toEqual(
      failedAlias === 'v1' ? ['v1.2.3', 'v1'] : ['v1.2.3', 'v1', 'v1.2'],
    )
    expect(octokit.rest.git.deleteRef.mock.calls.map(([params]) => params.ref)).toEqual(
      failedAlias === 'v1' ? ['tags/v1'] : ['tags/v1', 'tags/v1.2'],
    )
    const createdRefs = ['refs/tags/v1.2.3']
    if (failedAlias === 'v1.2') createdRefs.push('refs/tags/v1')
    if (method === 'createRef') createdRefs.push(`refs/tags/${failedAlias}`)
    expect(octokit.rest.git.createRef.mock.calls.map(([params]) => params.ref)).toEqual(createdRefs)
    expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(
      `failed while updating ${failedAlias === 'v1' ? 'major' : 'minor'} alias ${failedAlias}`,
    ))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('no automatic rollback'))
  })
})

test('enabled aliases are recreated separately from the exact tag', async() => {
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  await semrelease()
  expect(octokit.rest.git.createTag.mock.calls.map(([params]) => params.tag)).toEqual([
    'v1.2.3', 'v1', 'v1.2',
  ])
  expect(octokit.rest.git.deleteRef.mock.calls.map(([params]) => params.ref)).toEqual(['tags/v1', 'tags/v1.2'])
  for (const [params] of octokit.rest.git.createTag.mock.calls) expect(params.object).toBe('target')
})

test('dry-run makes no mutation calls even with aliases enabled', async() => {
  inputs['dry-run'] = 'true'
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  expect((await semrelease()).result).toBe('SUCCESS')
  assertNoWrites()
})

test('tag-only never creates a release', async() => {
  inputs['tag-only'] = 'true'
  expect((await semrelease()).result).toBe('SUCCESS')
  expect(octokit.rest.git.createRef).toHaveBeenCalledTimes(1)
  expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
})

test('normalizes a partial prerelease version and marks the release accordingly', async() => {
  octokit.rest.repos.getContent.mockResolvedValue(fileResponse('#!VERSION=4.1-rc.1\nfix: issue'))
  expect((await semrelease()).releaseVersion).toBe('4.1.0-rc.1')
  expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({
    tag_name: 'v4.1.0-rc.1', prerelease: true, name: 'Pre-release v4.1.0-rc.1',
  }))
})

test('invalid forced version fails before writing tags', async() => {
  octokit.rest.repos.getContent.mockResolvedValue(fileResponse('#!VERSION=invalid\nfix: issue'))
  await expect(semrelease()).rejects.toThrow('Invalid version number')
  assertNoWrites()
})

test.each([
  '#!VERSION=1.0.0\n#!VERSION=2.0.0',
  '#!VERSION=',
  '#!VERSION 2.0.0',
  '#!VERSION=2.0.0=extra',
  '#!VERSION=invalid',
])('META-02: invalid metadata fails before fallback or publication: %s', async text => {
  octokit.rest.repos.getContent.mockResolvedValue(fileResponse(text))
  await expect(semrelease()).rejects.toThrow(/version (directive|number)/i)
  expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
  expect(octokit.rest.git.getRef).not.toHaveBeenCalled()
  assertNoWrites()
})

describe.each(['pinned file', 'pinned history'])('VERSION-01: version bumps from %s', source => {
  const major = 'Breaking change: remove legacy API'
  const minor = 'Added new API'
  const patch = 'Fix: incorrect API response'

  test.each([
    {name: 'major only', messages: [major], version: '3.0.0'},
    {name: 'minor only', messages: [minor], version: '2.4.0'},
    {name: 'patch only', messages: [patch], version: '2.3.5'},
    {name: 'major + minor', messages: [minor, major], version: '3.0.0'},
    {name: 'major + patch', messages: [patch, major], version: '3.0.0'},
    {name: 'minor + patch', messages: [patch, minor], version: '2.4.0'},
    {name: 'major + minor + patch', messages: [patch, minor, major], version: '3.0.0'},
  ])('$name bumps 2.3.4 to $version', async({messages, version}) => {
    octokit.rest.repos.listReleases.mockResolvedValue({data: [
      {tag_name: 'v2.3.4', created_at: '2026-01-01T00:00:00Z'},
    ]})
    if (source === 'pinned file') {
      octokit.rest.repos.getContent.mockResolvedValue(fileResponse(messages.join('\n')))
    } else {
      octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
      octokit.rest.repos.listCommits.mockResolvedValue({data: messages.map((message, index) => ({
        sha: index === 0 ? 'target' : `ancestor-${index}`,
        commit: {message},
      }))})
    }

    const result = await semrelease()
    expect(result).toMatchObject({result: 'SUCCESS', releaseVersion: version})
    expect(result.releaseNotes).not.toBe('')
    expect(octokit.rest.git.createTag).toHaveBeenCalledTimes(1)
    expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({
      tag: `v${version}`, object: 'target',
    }))
    expect(octokit.rest.git.createRef).toHaveBeenCalledTimes(1)
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith(expect.objectContaining({
      ref: `refs/tags/v${version}`, sha: 'tag-object',
    }))
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({
      tag_name: `v${version}`, body: result.releaseNotes,
    }))
    if (source === 'pinned file') {
      expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
    } else {
      expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith(expect.objectContaining({
        sha: 'target', since: '2026-01-01T00:00:00Z',
      }))
    }
  })
})

test.each(['', '# comment', '#!VERSION=4.1'])(
  'falls back to pinned history when file contains no messages: %s', async text => {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(text))
    const result = await semrelease()
    expect(result.releaseVersion).toBe(text.includes('VERSION') ? '4.1.0' : '0.0.1')
    expect(result.releaseNotes).toBe('### Fixed/Improvements\n\n- Fix: from history')
    expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith(expect.objectContaining({sha: 'target'}))
  },
)

describe('META-01: pinned file message precedence', () => {
  test.each([false, true])('qualifying file messages take precedence with forced version: %s', async forced => {
    const text = `${forced ? '#!VERSION=4.1\n' : ''}Fix: from file`
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(text))
    const result = await semrelease()
    expect(result).toEqual({
      result: 'SUCCESS',
      releaseVersion: forced ? '4.1.0' : '0.0.1',
      releaseNotes: '### Fixed/Improvements\n\n- Fix: from file',
    })
    expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
  })

  test.each([false, true])('unqualified file messages skip without history fallback with forced version: %s', async forced => {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(
      `${forced ? '#!VERSION=4.1\n' : ''}unrecognized message\nchore(CI): maintenance`,
    ))
    expect(await semrelease()).toMatchObject({
      result: 'SKIPPED', releaseVersion: '', releaseNotes: '',
      reason: 'No release info found, or release notes are empty.',
    })
    expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test.each([
    {name: 'empty', commits: []},
    {name: 'unrecognized', commits: [{sha: 'target', commit: {message: 'unrecognized history message'}}]},
  ])(
    'version-only file skips when history is $name', async({commits}) => {
      octokit.rest.repos.getContent.mockResolvedValue(fileResponse('#!VERSION=4.1'))
      octokit.rest.repos.listCommits.mockResolvedValue({data: commits})
      expect(await semrelease()).toMatchObject({
        result: 'SKIPPED', releaseVersion: '', releaseNotes: '',
      })
      expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith(expect.objectContaining({sha: 'target'}))
      assertNoWrites()
    },
  )
})

test('recognized file messages bypass history scanning but still validate branches', async() => {
  await semrelease()
  expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
  expect(octokit.rest.repos.getCommit).toHaveBeenCalledTimes(1)
  expect(octokit.rest.repos.compareCommits).toHaveBeenCalledTimes(1)
})

test('empty history skips without mutations', async() => {
  octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
  octokit.rest.repos.listCommits.mockResolvedValue({data: []})
  expect((await semrelease()).result).toBe('SKIPPED')
  assertNoWrites()
})

test.each(['target', 'branch-tip'])('PAGE-01: later-page failure scanning %s stops publication', async failedSha => {
  octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
  const error = apiError(404)
  const fullPage = Array.from({length: 100}, (_, index) => ({
    sha: `commit-${index}`, commit: {message: `fix: issue ${index}`},
  }))
  const requests = []
  octokit.rest.repos.listCommits.mockImplementation(async({sha, page}) => {
    requests.push([sha, page])
    if (sha === failedSha && page === 2) throw error
    return {data: page === 1 ? fullPage : []}
  })

  await expect(semrelease()).rejects.toBe(error)

  expect(requests).toEqual(failedSha === 'target'
    ? [['target', 1], ['target', 2]]
    : [['target', 1], ['target', 2], ['branch-tip', 1], ['branch-tip', 2]])
  expect(octokit.rest.git.getRef).not.toHaveBeenCalled()
  expect(octokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled()
  assertNoWrites()
})

test('release publication failure propagates without undoing the exact tag', async() => {
  const error = apiError(422)
  octokit.rest.repos.createRelease.mockRejectedValue(error)
  await expect(semrelease()).rejects.toBe(error)
  expect(octokit.rest.git.createRef).toHaveBeenCalledTimes(1)
  expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('failed while publishing release v1.2.3'))
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('manually clean up or restore'))
})

afterEach(() => {
  jest.useRealTimers()
  if (savedGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = savedGithubToken
  jest.restoreAllMocks()
})
