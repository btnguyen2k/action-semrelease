import {jest} from '@jest/globals'
import {stat} from 'node:fs/promises'
import path from 'node:path'
import {artifactMetadata, artifactRun, artifactDownload} from './artifact-fixtures.js'

const context = {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha', runId: 101}
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

function setReleaseMessages(source, messages) {
  if (source === 'pinned file') {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(messages.join('\n')))
  } else {
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    octokit.rest.repos.listCommits.mockResolvedValue({data: messages.map((message, index) => ({
      sha: index === 0 ? 'target' : `ancestor-${index}`,
      commit: {message},
    }))})
  }
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
      actions: {
        getWorkflowRun: jest.fn(),
        getArtifact: jest.fn(),
        downloadArtifact: jest.fn(),
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

describe.each([1, 2])('TAG-01: exact tag with %s annotated objects', depth => {
  function mockAnnotatedTag(commitSha) {
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'tag', sha: 'annotation-1'}}})
    octokit.rest.git.getTag.mockImplementation(async({tag_sha}) => ({
      data: {object: depth === 2 && tag_sha === 'annotation-1'
        ? {type: 'tag', sha: 'annotation-2'}
        : {type: 'commit', sha: commitSha}},
    }))
  }

  test.each([false, true])('matching target reuses tag with existing release: %s', async releaseExists => {
    mockAnnotatedTag('target')
    if (releaseExists) octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})

    const result = await semrelease()

    expect(result).toMatchObject(releaseExists
      ? {result: 'SKIPPED', releaseVersion: '', releaseNotes: ''}
      : {result: 'SUCCESS', releaseVersion: '1.2.3', releaseNotes: '### Fixed/Improvements\n\n- Fix: issue'})
    expect(octokit.rest.git.createTag).not.toHaveBeenCalled()
    expect(octokit.rest.git.createRef).not.toHaveBeenCalled()
    expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
    expect(octokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith(expect.objectContaining({
      tag: 'v1.2.3',
    }))
    const expectedObjects = depth === 1 ? ['annotation-1'] : ['annotation-1', 'annotation-2']
    expect(octokit.rest.git.getTag.mock.calls.map(([params]) => params.tag_sha)).toEqual(
      releaseExists ? expectedObjects : [...expectedObjects, ...expectedObjects],
    )
    if (releaseExists) assertNoWrites()
    else {
      expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
      expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({
        tag_name: 'v1.2.3', body: result.releaseNotes,
      }))
    }
  })

  test.each([false, true])('conflicting target fails before release lookup with existing release: %s', async releaseExists => {
    mockAnnotatedTag('other')
    if (releaseExists) octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})

    await expect(semrelease()).rejects.toThrow(
      'Refusing to move release tag v1.2.3: it points to other, expected target',
    )

    expect(octokit.rest.git.getTag).toHaveBeenCalledTimes(depth)
    expect(octokit.rest.repos.getReleaseByTag).not.toHaveBeenCalled()
    assertNoWrites()
  })
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

test.each([
  {name: 'defaults', major: undefined, minor: undefined, aliases: []},
  {name: 'major only', major: 'true', minor: 'false', aliases: ['v1']},
  {name: 'minor only', major: 'false', minor: 'true', aliases: ['v1.2']},
  {name: 'both disabled', major: 'false', minor: 'false', aliases: []},
])('ALIAS-01: $name creates only selected aliases', async({major, minor, aliases}) => {
  delete inputs['tag-major-release']
  delete inputs['tag-minor-release']
  if (major !== undefined) inputs['tag-major-release'] = major
  if (minor !== undefined) inputs['tag-minor-release'] = minor

  expect(await semrelease()).toMatchObject({result: 'SUCCESS', releaseVersion: '1.2.3'})

  const tags = ['v1.2.3', ...aliases]
  expect(octokit.rest.git.createTag.mock.calls.map(([params]) => ({
    tag: params.tag, object: params.object,
  }))).toEqual(tags.map(tag => ({tag, object: 'target'})))
  expect(octokit.rest.git.createRef.mock.calls.map(([params]) => params.ref))
    .toEqual(tags.map(tag => `refs/tags/${tag}`))
  expect(octokit.rest.git.deleteRef.mock.calls.map(([params]) => params.ref))
    .toEqual(aliases.map(tag => `tags/${tag}`))
  expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
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

test.each(['lightweight', 'annotated'])('ALIAS-03: reuses %s exact tag while refreshing enabled aliases', async type => {
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  octokit.rest.git.getRef.mockResolvedValue({data: {object: type === 'annotated'
    ? {type: 'tag', sha: 'existing-annotation'}
    : {type: 'commit', sha: 'target'}}})
  octokit.rest.git.getTag.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
  octokit.rest.git.createTag.mockImplementation(async({tag}) => ({
    data: {sha: `object-${tag}`},
  }))

  const result = await semrelease()

  expect(result).toEqual({
    result: 'SUCCESS', releaseVersion: '1.2.3',
    releaseNotes: '### Fixed/Improvements\n\n- Fix: issue',
  })
  expect(octokit.rest.git.createTag.mock.calls.map(([params]) => ({
    tag: params.tag, object: params.object, type: params.type,
  }))).toEqual([
    {tag: 'v1', object: 'target', type: 'commit'},
    {tag: 'v1.2', object: 'target', type: 'commit'},
  ])
  expect(octokit.rest.git.deleteRef.mock.calls.map(([params]) => params.ref))
    .toEqual(['tags/v1', 'tags/v1.2'])
  expect(octokit.rest.git.createRef.mock.calls.map(([params]) => ({
    ref: params.ref, sha: params.sha,
  }))).toEqual([
    {ref: 'refs/tags/v1', sha: 'object-v1'},
    {ref: 'refs/tags/v1.2', sha: 'object-v1.2'},
  ])
  expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
  expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith({
    owner: 'owner', repo: 'repo', tag_name: 'v1.2.3',
    name: 'Release v1.2.3', body: result.releaseNotes, prerelease: false,
  })
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

test.each([
  {version: '1.2.3+build.7', prerelease: false, name: 'Release'},
  {version: '1.2.3-rc.1+build.7', prerelease: true, name: 'Pre-release'},
])('RELEASE-03: custom prefix preserves $version in outputs and publication', async({version, prerelease, name}) => {
  inputs['tag-prefix'] = 'service-'
  inputs['tag-major-release'] = 'true'
  inputs['tag-minor-release'] = 'true'
  octokit.rest.repos.getContent.mockResolvedValue(fileResponse(`#!VERSION=${version}\nfix: issue`))
  octokit.rest.git.createTag.mockImplementation(async({tag}) => ({data: {sha: `object-${tag}`}}))
  const notes = '### Fixed/Improvements\n\n- Fix: issue'
  const tagName = `service-${version}`
  const tags = [tagName, 'service-1', 'service-1.2']

  expect(await semrelease()).toEqual({
    result: 'SUCCESS', releaseVersion: version, releaseNotes: notes,
  })
  expect(octokit.rest.git.createTag.mock.calls).toEqual(tags.map(tag => [{
    owner: 'owner', repo: 'repo', tag, message: `Release ${tag}`, object: 'target', type: 'commit',
  }]))
  expect(octokit.rest.git.createRef.mock.calls).toEqual(tags.map(tag => [{
    owner: 'owner', repo: 'repo', ref: `refs/tags/${tag}`, sha: `object-${tag}`,
  }]))
  expect(octokit.rest.git.deleteRef.mock.calls).toEqual([
    [{owner: 'owner', repo: 'repo', ref: 'tags/service-1'}],
    [{owner: 'owner', repo: 'repo', ref: 'tags/service-1.2'}],
  ])
  expect(octokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
    owner: 'owner', repo: 'repo', tag: tagName,
  })
  expect(octokit.rest.repos.createRelease.mock.calls).toEqual([[{
    owner: 'owner', repo: 'repo', tag_name: tagName,
    name: `${name} ${tagName}`, body: notes, prerelease,
  }]])
})

test.each(['pinned file', 'history'])('sorts published release notes by category from %s', async source => {
  const messages = [
    'dep: zebra', 'security: zebra', 'fix: zebra', 'feat: zebra', 'removed: zebra', 'breaking change: zebra',
    'dep: alpha', 'security: alpha', 'fix: alpha', 'feat: alpha', 'removed: alpha', 'breaking change: alpha',
    'chore: ignored',
  ]
  if (source === 'pinned file') {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(messages.join('\n')))
  } else {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(''))
    octokit.rest.repos.listCommits.mockResolvedValue({data: messages.map((message, index) => ({
      sha: `commit-${index}`, commit: {message},
    }))})
  }
  const notes = '### Changes\n\n- Breaking change: alpha\n- Breaking change: zebra'
    + '\n\n### Removed\n\n- Removed: alpha\n- Removed: zebra'
    + '\n\n### Added/Refactoring/Deprecation\n\n- Feat: alpha\n- Feat: zebra'
    + '\n\n### Fixed/Improvements\n\n- Fix: alpha\n- Fix: zebra'
    + '\n\n### Security\n\n- Security: alpha\n- Security: zebra'
    + '\n\n### Others\n\n- Dep: alpha\n- Dep: zebra'
  expect(await semrelease()).toEqual({
    result: 'SUCCESS', releaseVersion: '1.0.0', releaseNotes: notes,
  })
  expect(octokit.rest.repos.createRelease.mock.calls).toEqual([[{
    owner: 'owner', repo: 'repo', tag_name: 'v1.0.0',
    name: 'Release v1.0.0', body: notes, prerelease: false,
  }]])
})

describe('release assets from Actions artifacts', () => {
  let files
  beforeEach(() => {
    inputs['artifact-ids'] = '11;12'
    files = new Map([
      [11, {name: 'my-package.zip', bytes: Buffer.from('package')}],
      [12, {name: 'my-app-setup.exe', bytes: Buffer.from([77, 90, 0, 255])}],
    ])
    octokit.rest.actions.getWorkflowRun.mockResolvedValue({data: artifactRun()})
    octokit.rest.actions.getArtifact.mockImplementation(async({artifact_id}) => {
      const file = files.get(artifact_id)
      return {data: artifactMetadata(file.bytes, artifact_id, file.name)}
    })
    octokit.rest.actions.downloadArtifact.mockImplementation(async({artifact_id}) =>
      artifactDownload(files.get(artifact_id).bytes))
    octokit.rest.repos.createRelease.mockResolvedValue({data: {id: 1, upload_url: 'https://uploads.example/assets{?name,label}'}})
    octokit.rest.repos.uploadReleaseAsset = jest.fn(async params => {
      const data = []
      for await (const chunk of params.data) data.push(chunk)
      return {data: {state: 'uploaded', name: params.name, size: Buffer.concat(data).length}}
    })
  })

  test('validates all assets before writes, uploads after release, and cleans files', async() => {
    expect((await semrelease()).result).toBe('SUCCESS')
    expect(octokit.rest.actions.downloadArtifact.mock.invocationCallOrder[0])
      .toBeLessThan(octokit.rest.git.createTag.mock.invocationCallOrder[0])
    expect(octokit.rest.repos.createRelease.mock.invocationCallOrder[0])
      .toBeLessThan(octokit.rest.repos.uploadReleaseAsset.mock.invocationCallOrder[0])
    expect(octokit.rest.repos.uploadReleaseAsset.mock.calls.map(([params]) => params.name))
      .toEqual(['my-app-setup.exe', 'my-package.zip'])
    for (const [params] of octokit.rest.repos.uploadReleaseAsset.mock.calls) {
      await expect(stat(path.dirname(params.data.path))).rejects.toMatchObject({code: 'ENOENT'})
    }
  })

  test('dry-run validates/downloads files but does not write', async() => {
    inputs['dry-run'] = 'true'
    expect((await semrelease()).result).toBe('SUCCESS')
    expect(octokit.rest.actions.downloadArtifact).toHaveBeenCalledTimes(2)
    assertNoWrites()
    expect(octokit.rest.repos.uploadReleaseAsset).not.toHaveBeenCalled()
  })

  test('tag-only ignores malformed artifact inputs with no artifact reads', async() => {
    inputs['tag-only'] = 'true'
    inputs['artifact-ids'] = 'invalid'
    inputs['artifact-run-id'] = 'invalid'
    expect((await semrelease()).result).toBe('SUCCESS')
    for (const api of Object.values(octokit.rest.actions)) expect(api).not.toHaveBeenCalled()
    expect(octokit.rest.repos.createRelease).not.toHaveBeenCalled()
    expect(octokit.rest.repos.uploadReleaseAsset).not.toHaveBeenCalled()
  })

  test('wrong target commit prevents all publication writes', async() => {
    octokit.rest.actions.getWorkflowRun.mockResolvedValue({data: {...artifactRun(), head_sha: 'other'}})
    await expect(semrelease()).rejects.toThrow('does not match release target')
    assertNoWrites()
    expect(octokit.rest.repos.uploadReleaseAsset).not.toHaveBeenCalled()
  })

  test('a later artifact download failure prevents all writes', async() => {
    const download = octokit.rest.actions.downloadArtifact.getMockImplementation()
    const error = Object.assign(new Error('artifact expired during download'), {status: 410})
    octokit.rest.actions.downloadArtifact.mockImplementation(async params => {
      if (params.artifact_id === 12) throw error
      return download(params)
    })
    await expect(semrelease()).rejects.toBe(error)
    assertNoWrites()
    expect(octokit.rest.repos.uploadReleaseAsset).not.toHaveBeenCalled()
  })

  test.each(['no release notes', 'existing release'])('%s skips before downloading artifacts', async mode => {
    if (mode === 'no release notes') {
      octokit.rest.repos.getContent.mockResolvedValue(fileResponse('chore: ignored'))
    } else {
      octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
      octokit.rest.repos.getReleaseByTag.mockResolvedValue({data: {id: 1}})
    }
    expect((await semrelease()).result).toBe('SKIPPED')
    for (const api of Object.values(octokit.rest.actions)) expect(api).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test.each([0, 1])('upload failure at position %s stops subsequent uploads without retry/rollback', async failure => {
    const error = Object.assign(new Error('upload unavailable'), {status: 503})
    const upload = octokit.rest.repos.uploadReleaseAsset.getMockImplementation()
    octokit.rest.repos.uploadReleaseAsset.mockImplementation(async params => {
      if (params.name === ['my-app-setup.exe', 'my-package.zip'][failure]) throw error
      return upload(params)
    })
    await expect(semrelease()).rejects.toBe(error)
    await jest.runAllTimersAsync()
    expect(octokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(failure + 1)
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
    expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(`uploading release asset ${['my-app-setup.exe', 'my-package.zip'][failure]}`))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('no automatic rollback'))
    for (const [params] of octokit.rest.repos.uploadReleaseAsset.mock.calls) {
      await expect(stat(path.dirname(params.data.path))).rejects.toMatchObject({code: 'ENOENT'})
    }
  })
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
    {name: 'deps alias', messages: ['deps: update parser'], version: '2.3.5'},
    {name: 'revert', messages: ['revert: undo the previous change'], version: '2.3.5'},
    {name: 'refactor stays minor', messages: ['refactor: simplify parsing'], version: '2.4.0'},
    {name: 'breaking wording in fix', messages: ['fix: breaking change'], version: '2.3.5'},
    {name: 'removal wording in fix', messages: ['fix: repair an API that is now removed'], version: '2.3.5'},
    {name: 'major + minor', messages: [minor, major], version: '3.0.0'},
    {name: 'major + patch', messages: [patch, major], version: '3.0.0'},
    {name: 'minor + patch', messages: [patch, minor], version: '2.4.0'},
    {name: 'major + minor + patch', messages: [patch, minor, major], version: '3.0.0'},
  ])('$name bumps 2.3.4 to $version', async({messages, version}) => {
    octokit.rest.repos.listReleases.mockResolvedValue({data: [
      {tag_name: 'v2.3.4', created_at: '2026-01-01T00:00:00Z'},
    ]})
    setReleaseMessages(source, messages)

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

describe.each(['pinned file', 'pinned history'])('STYLE-01: messages from %s', source => {
  test.each([undefined, 'false'])('warns for every invalid summary and continues with style-check=%s', async strict => {
    if (strict !== undefined) inputs['style-check'] = strict
    setReleaseMessages(source, ['fix: Repair the parser.', 'deps: Update the parser.'])
    expect(await semrelease()).toMatchObject({result: 'SUCCESS', releaseVersion: '0.0.1'})
    expect(warning).toHaveBeenCalledTimes(2)
    for (const [message] of warning.mock.calls) {
      expect(message).toContain('Commit message style:')
      expect(message).toContain('capital letter')
      expect(message).toContain('period')
    }
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledTimes(1)
  })

  test.each([
    'fix: Repair the parser.',
    'fix: repair the parser ',
    'fix:  repair the parser',
    'fix:',
    'fix:\trepair the parser',
    'refactor: Simplify parsing.',
    'deprecate(api): Deprecate the parser.',
  ])('strict mode rejects %s before any write', async message => {
    inputs['style-check'] = 'true'
    setReleaseMessages(source, ['fix: a valid summary', message])
    await expect(semrelease()).rejects.toThrow('Commit message style check failed')
    expect(octokit.rest.git.getRef).not.toHaveBeenCalled()
    assertNoWrites()
  })

  test('valid strict-mode messages publish without warnings', async() => {
    inputs['style-check'] = 'true'
    setReleaseMessages(source, ['deps(dev): update parser', 'revert: undo the previous change'])
    expect(await semrelease()).toMatchObject({result: 'SUCCESS', releaseVersion: '0.0.1'})
    expect(warning).not.toHaveBeenCalled()
  })

  test.each(['false', 'true'])('invalid headers are skipped by style-check=%s without changing release rules', async strict => {
    inputs['style-check'] = strict
    setReleaseMessages(source, [
      'fix: a valid summary',
      'unsupported(api): Invalid summary.',
      'chore(CI): Refresh configuration.',
      'fix(): Repair the parser.',
      'fix( api): Repair the parser.',
      'fix(api ): Repair the parser.',
      'fix extra: Repair the parser.',
      '[fix]: Repair the parser.',
      'unrecognized message',
      '',
    ])
    const result = await semrelease()
    expect(result).toMatchObject({result: 'SUCCESS', releaseVersion: '0.0.1'})
    expect(result.releaseNotes).toContain('- [fix]: Repair the parser.')
    expect(warning).not.toHaveBeenCalled()
  })

  test.each(['false', 'true'])('non-bumping types skip without style warnings or history fallback in style-check=%s', async strict => {
    inputs['style-check'] = strict
    setReleaseMessages(source, ['docs: Explain why the API is no longer supported.'])
    expect((await semrelease()).result).toBe('SKIPPED')
    expect(warning).not.toHaveBeenCalled()
    if (source === 'pinned file') expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
    assertNoWrites()
  })
})

test('STYLE-02: strict metadata checks ignore comments, directives and supported bullets', async() => {
  inputs['style-check'] = 'true'
  octokit.rest.repos.getContent.mockResolvedValue(fileResponse(
    '# Release details.\n#!VERSION=4.1\n\n- fix: repair the parser\n= deps: update the parser',
  ))
  expect(await semrelease()).toMatchObject({result: 'SUCCESS', releaseVersion: '4.1.0'})
  expect(warning).not.toHaveBeenCalled()
  expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
})

test.each([
  'fix: repair the parser\n\nThe old API is now removed.\n\nBREAKING CHANGE: details.',
  'fix: repair the parser\r\n\r\nThe old API is now removed.',
  'fix: repair the parser\nThe old API is now removed.',
  'fix: repair the parser\r\nThe old API is now removed.',
  'fix: repair the\nparser',
])('STYLE-03: only the first-line summary is checked, not body content or formatting: %s', async message => {
  inputs['style-check'] = 'true'
  setReleaseMessages('pinned history', [message])
  const result = await semrelease()
  expect(result).toMatchObject({
    result: 'SUCCESS', releaseVersion: '0.0.1',
    releaseNotes: `### Fixed/Improvements\n\n- ${message.charAt(0).toUpperCase()}${message.slice(1)}`,
  })
  expect(warning).not.toHaveBeenCalled()
})

test.each(['fix:\n\nrepair the parser', 'fix: \r\nrepair the parser'])(
  'STYLE-03: body content cannot supply an empty first-line summary: %s', async message => {
    inputs['style-check'] = 'true'
    setReleaseMessages('pinned history', [message])
    await expect(semrelease()).rejects.toThrow('Commit message style check failed')
    assertNoWrites()
  },
)

test('STYLE-03: invalid raw history headers are ignored by style-check before normalization', async() => {
  inputs['style-check'] = 'true'
  setReleaseMessages('pinned history', ['fix: a valid summary', ' fix: Repair the parser.', ''])
  expect(await semrelease()).toMatchObject({result: 'SUCCESS', releaseVersion: '0.0.1'})
  expect(warning).not.toHaveBeenCalled()
})

test('STYLE-03: warnings identify the header and reasons without quoting the body', async() => {
  setReleaseMessages('pinned history', ['fix: Repair the parser.\n\nDo not include this body in the warning.'])
  expect((await semrelease()).result).toBe('SUCCESS')
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('"fix: Repair the parser."'))
  expect(warning.mock.calls[0][0]).not.toContain('Do not include this body')
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

describe('HIST-04: filtered merge history', () => {
  const since = '2026-01-01T00:00:00Z'
  const commit = (sha, message, date, parents = []) => ({
    sha, commit: {message, committer: {date}}, parents: parents.map(parent => ({sha: parent})),
  })

  test('uses filtered API results, includes merged ancestry, excludes post-target commits, and deduplicates branches', async() => {
    inputs.branches = 'main,release'
    inputs.path = 'src'
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    octokit.rest.repos.listReleases.mockResolvedValue({data: [
      {tag_name: 'v2.3.4', created_at: since},
    ]})
    octokit.rest.repos.getCommit.mockImplementation(async({ref}) => ({data: {sha: `${ref}-tip`}}))
    const boundary = commit('boundary', 'Fix: boundary response', since)
    const feature = commit('feature', 'Added merged feature', '2026-01-02T00:00:00Z', ['boundary'])
    const merge = commit('merge', 'Merge feature branch', '2026-01-03T00:00:00Z', ['boundary', 'feature'])
    const target = commit('target', 'Fix: target response', '2026-01-04T00:00:00Z', ['merge'])
    const newer = commit('newer', 'Breaking change: future API', '2026-01-05T00:00:00Z', ['target'])
    // GitHub applies date/path filters; these fixtures represent its filtered responses.
    octokit.rest.repos.listCommits.mockImplementation(async({sha}) => ({
      data: sha === 'target' ? [target, merge, feature, boundary] : [newer, target, merge, feature, boundary],
    }))

    const result = await semrelease()

    expect(result).toEqual({
      result: 'SUCCESS', releaseVersion: '2.4.0',
      releaseNotes: '### Added/Refactoring/Deprecation\n\n- Added merged feature'
        + '\n\n### Fixed/Improvements\n\n- Fix: boundary response\n- Fix: target response',
    })
    expect(octokit.rest.repos.listCommits.mock.calls.map(([params]) => ({...params}))).toEqual(
      ['target', 'main-tip', 'release-tip'].map(sha => ({
        owner: 'owner', repo: 'repo', page: 1, per_page: 100, sha, path: 'src', since,
      })),
    )
    expect(octokit.rest.git.createTag).toHaveBeenCalledWith(expect.objectContaining({
      tag: 'v2.4.0', object: 'target',
    }))
    expect(octokit.rest.repos.createRelease).toHaveBeenCalledWith(expect.objectContaining({
      tag_name: 'v2.4.0', body: result.releaseNotes,
    }))
  })

  test('empty filtered results skip without writes', async() => {
    inputs.path = 'src'
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    octokit.rest.repos.listReleases.mockResolvedValue({data: [
      {tag_name: 'v2.3.4', created_at: since},
    ]})
    octokit.rest.repos.listCommits.mockResolvedValue({data: []})

    expect(await semrelease()).toMatchObject({
      result: 'SKIPPED', releaseVersion: '', releaseNotes: '',
    })
    expect(octokit.rest.repos.listCommits).toHaveBeenCalledTimes(2)
    for (const [params] of octokit.rest.repos.listCommits.mock.calls) {
      expect(params).toMatchObject({path: 'src', since})
    }
    assertNoWrites()
  })
})

describe.each([
  {name: 'tag object', stop: 0, stage: 'creating exact tag v1.2.3'},
  {name: 'exact ref', stop: 1, stage: 'creating exact tag v1.2.3'},
  {name: 'alias deletion', stop: 3, stage: 'updating major alias v1'},
  {name: 'alias ref', stop: 4, stage: 'updating major alias v1'},
  {name: 'publication', stop: 8, stage: 'publishing release v1.2.3'},
])('WRITE-01: $name failure', ({stop, stage}) => {
  test.each(['server', 'rate limit', 'network'])('%s error never retries writes or rolls back', async kind => {
    inputs['tag-major-release'] = 'true'
    inputs['tag-minor-release'] = 'true'
    const error = kind === 'server' ? apiError(503) : kind === 'rate limit'
      ? Object.assign(apiError(429), {response: {headers: {'retry-after': '60'}}})
      : Object.assign(new Error('Connection reset'), {code: 'ECONNRESET'})
    const expected = [
      'createTag:v1.2.3', 'createRef:refs/tags/v1.2.3',
      'createTag:v1', 'deleteRef:tags/v1', 'createRef:refs/tags/v1',
      'createTag:v1.2', 'deleteRef:tags/v1.2', 'createRef:refs/tags/v1.2',
      'createRelease:v1.2.3',
    ]
    const writes = []
    for (const method of ['createTag', 'deleteRef', 'createRef', 'createRelease']) {
      const api = method === 'createRelease' ? octokit.rest.repos : octokit.rest.git
      api[method].mockImplementation(async params => {
        writes.push(`${method}:${params.tag || params.ref || params.tag_name}`)
        if (writes.length === stop + 1) throw error
        return {data: {sha: 'tag-object'}}
      })
    }

    const assertion = expect(semrelease()).rejects.toBe(error)
    await jest.runAllTimersAsync()
    await assertion

    expect(writes).toEqual(expected.slice(0, stop + 1))
    expect(writes.filter(write => write === expected[stop])).toHaveLength(1)
    expect(warning).toHaveBeenCalledTimes(1)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(`failed while ${stage}`))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('no automatic rollback'))
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('manually clean up or restore'))
  })
})

afterEach(() => {
  jest.useRealTimers()
  if (savedGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = savedGithubToken
  jest.restoreAllMocks()
})
