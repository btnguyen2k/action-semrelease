import {jest} from '@jest/globals'

const context = {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha'}
const inputs = {}
let octokit

jest.unstable_mockModule('@actions/core', () => ({
  getInput: name => inputs[name] || '',
  info: jest.fn(),
  warning: jest.fn(),
}))
jest.unstable_mockModule('@actions/github', () => ({
  context,
  getOctokit: () => octokit,
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
  jest.restoreAllMocks()
})
