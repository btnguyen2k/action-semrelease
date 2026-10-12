import {jest} from '@jest/globals'

const context = {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha'}
const inputs = {}
let octokit
let savedGithubToken
const getOctokit = jest.fn(() => octokit)

jest.unstable_mockModule('@actions/core', () => ({
  getInput: name => inputs[name] || '',
  info: jest.fn(),
  warning: jest.fn(),
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
  savedGithubToken = process.env.GITHUB_TOKEN
  delete process.env.GITHUB_TOKEN
  getOctokit.mockClear()
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
  expect(getOctokit).toHaveBeenCalledWith('offline-token')
})

test('AUTH-02: environment token is used when input is absent', async() => {
  delete inputs['github-token']
  process.env.GITHUB_TOKEN = 'environment-token'
  await semrelease()
  expect(getOctokit).toHaveBeenCalledTimes(1)
  expect(getOctokit).toHaveBeenCalledWith('environment-token')
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
  expect(octokit.rest.git.getCommit).toHaveBeenCalledTimes(1)
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

test.each(['', '# comment', 'unrecognized message', '#!VERSION=4.1'])(
  'falls back to pinned history when file yields no notes: %s', async text => {
    octokit.rest.repos.getContent.mockResolvedValue(fileResponse(text))
    const result = await semrelease()
    expect(result.releaseVersion).toBe(text.includes('VERSION') ? '4.1.0' : '0.0.1')
    expect(result.releaseNotes).toBe('### Fixed/Improvements\n\n- Fix: from history')
    expect(octokit.rest.repos.listCommits).toHaveBeenCalledWith(expect.objectContaining({sha: 'target'}))
  },
)

test('recognized file messages bypass history scanning', async() => {
  await semrelease()
  expect(octokit.rest.repos.listCommits).not.toHaveBeenCalled()
  expect(octokit.rest.repos.getCommit).not.toHaveBeenCalled()
})

test('empty history skips without mutations', async() => {
  octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
  octokit.rest.repos.listCommits.mockResolvedValue({data: []})
  expect((await semrelease()).result).toBe('SKIPPED')
  assertNoWrites()
})

test('release publication failure propagates without undoing the exact tag', async() => {
  const error = apiError(422)
  octokit.rest.repos.createRelease.mockRejectedValue(error)
  await expect(semrelease()).rejects.toBe(error)
  expect(octokit.rest.git.createRef).toHaveBeenCalledTimes(1)
  expect(octokit.rest.git.deleteRef).not.toHaveBeenCalled()
})

afterEach(() => {
  if (savedGithubToken === undefined) delete process.env.GITHUB_TOKEN
  else process.env.GITHUB_TOKEN = savedGithubToken
  jest.restoreAllMocks()
})
