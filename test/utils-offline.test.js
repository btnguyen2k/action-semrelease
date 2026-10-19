import {jest} from '@jest/globals'

jest.unstable_mockModule('@actions/github', () => ({
  context: {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha'},
}))

const utils = await import('../src/utils.js')

beforeEach(() => jest.useFakeTimers({advanceTimers: 1000}))
afterEach(() => jest.useRealTimers())

function apiError(status) {
  return Object.assign(new Error(`API error ${status}`), {status})
}

function makeOctokit() {
  return {
    rest: {
      repos: {
        getContent: jest.fn(),
        getCommit: jest.fn(),
        listCommits: jest.fn(),
      },
      git: {
        getRef: jest.fn(),
        getTag: jest.fn(),
        deleteRef: jest.fn(),
      },
    },
  }
}

describe('normalizeReleaseVersion', () => {
  test.each([
    ['4', '4.0.0'],
    ['4.1', '4.1.0'],
    ['0', '0.0.0'],
    ['v4.1', '4.1.0'],
    ['4.1.2', '4.1.2'],
    ['4-rc.1', '4.0.0-rc.1'],
    ['4.1+build.7', '4.1.0+build.7'],
    ['4.1.2-rc.1+build.7', '4.1.2-rc.1+build.7'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(utils.normalizeReleaseVersion(input).semver).toBe(expected)
  })

  test.each(['', 'word', '04', '4.01', '1.2.3.4', '1.', '1-01', '1+'])(
    'rejects %s', input => {
      expect(() => utils.normalizeReleaseVersion(input)).toThrow('Invalid version number')
    },
  )
})

describe('readReleaseLinesAtCommit', () => {
  test('reads UTF-8 content at the requested commit', async() => {
    const octokit = makeOctokit()
    octokit.rest.repos.getContent.mockResolvedValue({data: {
      type: 'file',
      encoding: 'base64',
      content: Buffer.from('#!VERSION=4.1\r\nfix: café\n').toString('base64'),
    }})
    expect(await utils.readReleaseLinesAtCommit(octokit, 'target')).toEqual([
      '#!VERSION=4.1', 'fix: café', '',
    ])
    expect(octokit.rest.repos.getContent).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', path: '.semrelease/this_release', ref: 'target',
    })
  })

  test('missing file returns null', async() => {
    const octokit = makeOctokit()
    octokit.rest.repos.getContent.mockRejectedValue(apiError(404))
    expect(await utils.readReleaseLinesAtCommit(octokit, 'target')).toBeNull()
  })

  test.each([403, 500])('propagates HTTP %s', async status => {
    const octokit = makeOctokit()
    const error = apiError(status)
    octokit.rest.repos.getContent.mockRejectedValue(error)
    await expect(utils.readReleaseLinesAtCommit(octokit, 'target')).rejects.toBe(error)
  })

  test.each([
    [],
    {type: 'dir', encoding: 'base64'},
    {type: 'file', encoding: 'none'},
  ])('rejects unsupported file response %j', async data => {
    const octokit = makeOctokit()
    octokit.rest.repos.getContent.mockResolvedValue({data})
    await expect(utils.readReleaseLinesAtCommit(octokit, 'target')).rejects.toThrow('base64-encoded file')
  })

  test('parses supplied lines without reading a local file', async() => {
    const lines = ['# comment', '#!VERSION=4.1', '- fix: issue', '', '= feat: feature']
    expect(await utils.loadCommitMessagesFromFile('does-not-exist', lines)).toEqual([
      'fix: issue', 'feat: feature',
    ])
    expect(await utils.getReleaseOptionsFromFile('does-not-exist', lines)).toEqual({
      releaseVersion: '4.1',
    })
    expect(await utils.loadCommitMessagesFromFile('does-not-exist', null)).toBeNull()
    expect(await utils.getReleaseOptionsFromFile('does-not-exist', null)).toEqual({})
  })

  test('validates metadata entries after stripping bullets but before trimming summaries', async() => {
    const onMessage = jest.fn()
    const lines = ['# comment ', '#!VERSION=4.1', ' - fix: issue ', '', '= feat: feature']
    expect(await utils.loadCommitMessagesFromFile('metadata', lines, onMessage)).toEqual([
      'fix: issue', 'feat: feature',
    ])
    expect(onMessage.mock.calls).toEqual([['fix: issue '], ['feat: feature']])
  })

  test('propagates metadata validation errors', async() => {
    const error = new Error('Invalid summary')
    await expect(utils.loadCommitMessagesFromFile('metadata', ['fix: Issue'], () => {
      throw error
    })).rejects.toBe(error)
  })
})

describe('META-02: version directives', () => {
  test.each([
    ['#!VERSION=4.1', '4.1'],
    ['  #!version = v4.1-rc.1  ', 'v4.1-rc.1'],
    ['#!VERSION=4.1.2+build.7', '4.1.2+build.7'],
  ])('accepts one valid directive %s', async(directive, version) => {
    expect(await utils.getReleaseOptionsFromFile('metadata', ['# comment', directive]))
      .toEqual({releaseVersion: version})
  })

  test.each([
    ['#!VERSION=1.0.0', '#!VERSION=2.0.0'],
    ['#!VERSION=1.0.0', '#!version=1.0.0'],
    ['#!VERSION=invalid', '#!VERSION='],
  ])('rejects multiple directives %j', async(first, second) => {
    await expect(utils.getReleaseOptionsFromFile('metadata', [first, '# comment', second]))
      .rejects.toThrow('Multiple version directives in metadata at lines 1, 3')
  })

  test.each(['#!VERSION=', '#!VERSION=  ', '#!VERSION', '#!VERSION 2.0.0', '#!VERSION=2.0.0=extra'])(
    'rejects malformed directive %s', async directive => {
      await expect(utils.getReleaseOptionsFromFile('metadata', ['# comment', directive]))
        .rejects.toThrow('Malformed version directive in metadata at line 2')
    },
  )

  test.each(['invalid', '04', '1.2.3.4', '1-01'])('rejects invalid version %s', async version => {
    await expect(utils.getReleaseOptionsFromFile('metadata', [`#!VERSION=${version}`]))
      .rejects.toThrow(`Invalid version number in metadata at line 1: ${version}`)
  })

  test('ignores ordinary comments and other directives', async() => {
    expect(await utils.getReleaseOptionsFromFile('metadata', ['# VERSION=invalid', '#!OTHER=value']))
      .toEqual({})
  })
})

describe('resolveTagCommit', () => {
  test('missing ref returns null', async() => {
    const octokit = makeOctokit()
    octokit.rest.git.getRef.mockRejectedValue(apiError(404))
    expect(await utils.resolveTagCommit(octokit, 'v1.0.0')).toBeNull()
  })

  test('lightweight tag resolves without reading tag objects', async() => {
    const octokit = makeOctokit()
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
    expect(await utils.resolveTagCommit(octokit, 'v1.0.0')).toBe('target')
    expect(octokit.rest.git.getTag).not.toHaveBeenCalled()
  })

  test('nested annotated tags resolve to a commit', async() => {
    const octokit = makeOctokit()
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'tag', sha: 'outer'}}})
    octokit.rest.git.getTag
      .mockResolvedValueOnce({data: {object: {type: 'tag', sha: 'inner'}}})
      .mockResolvedValueOnce({data: {object: {type: 'commit', sha: 'target'}}})
    expect(await utils.resolveTagCommit(octokit, 'v1.0.0')).toBe('target')
    expect(octokit.rest.git.getTag.mock.calls.map(([params]) => params.tag_sha)).toEqual(['outer', 'inner'])
  })

  test('unsupported object type fails', async() => {
    const octokit = makeOctokit()
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'tree', sha: 'tree'}}})
    await expect(utils.resolveTagCommit(octokit, 'v1.0.0')).rejects.toThrow('unsupported object type')
  })

  test('missing annotated object fails', async() => {
    const octokit = makeOctokit()
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'tag', sha: 'missing'}}})
    octokit.rest.git.getTag.mockRejectedValue(apiError(404))
    await expect(utils.resolveTagCommit(octokit, 'v1.0.0')).rejects.toThrow('was not found')
  })

  test('excessive nesting fails', async() => {
    const octokit = makeOctokit()
    const data = {object: {type: 'tag', sha: 'cycle'}}
    octokit.rest.git.getRef.mockResolvedValue({data})
    octokit.rest.git.getTag.mockResolvedValue({data})
    await expect(utils.resolveTagCommit(octokit, 'v1.0.0')).rejects.toThrow('too many nested')
    expect(octokit.rest.git.getTag).toHaveBeenCalledTimes(16)
  })

  test('propagates unexpected tag API errors', async() => {
    const octokit = makeOctokit()
    const error = apiError(500)
    octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'tag', sha: 'tag'}}})
    octokit.rest.git.getTag.mockRejectedValue(error)
    await expect(utils.resolveTagCommit(octokit, 'v1.0.0')).rejects.toBe(error)
  })
})

describe('PAGE-01: commit pagination errors', () => {
  const fullPage = Array.from({length: 100}, (_, index) => ({
    sha: `commit-${index}`, commit: {message: `fix: ${index}`},
  }))

  describe.each([2, 3, 4])('failure on page %s', failedPage => {
    test.each([404, 403, 422, 429, 500, undefined])('propagates error with status %s', async status => {
      jest.useFakeTimers()
      const octokit = makeOctokit()
      const error = status === undefined ? new Error('Network failure') : apiError(status)
      const requests = []
      octokit.rest.repos.listCommits.mockImplementation(async({page}) => {
        requests.push(page)
        if (page === failedPage) throw error
        return {data: fullPage}
      })

      const assertion = expect(utils.getAllCommits(octokit, {sha: 'target'})).rejects.toBe(error)
      await jest.runAllTimersAsync()
      await assertion
      const expected = Array.from({length: failedPage}, (_, index) => index + 1)
      if (status === 500 || status === 429) expected.push(failedPage, failedPage)
      expect(requests).toEqual(expected)
    })
  })

  test('exactly 100 commits completes with an empty successful second page', async() => {
    const octokit = makeOctokit()
    const requests = []
    octokit.rest.repos.listCommits.mockImplementation(async({page}) => {
      requests.push(page)
      return {data: page === 1 ? fullPage : []}
    })
    expect(await utils.getAllCommits(octokit)).toEqual(fullPage)
    expect(requests).toEqual([1, 2])
  })

  test('first-page 404 retains the existing empty-result behavior', async() => {
    const octokit = makeOctokit()
    octokit.rest.repos.listCommits.mockRejectedValue(apiError(404))
    expect(await utils.getAllCommits(octokit)).toEqual([])
    expect(octokit.rest.repos.listCommits).toHaveBeenCalledTimes(1)
  })

  test('404 fails even when the requested starting page is 2', async() => {
    const octokit = makeOctokit()
    const error = apiError(404)
    octokit.rest.repos.listCommits.mockRejectedValue(error)
    await expect(utils.getAllCommits(octokit, {page: 2})).rejects.toBe(error)
    expect(octokit.rest.repos.listCommits).toHaveBeenCalledTimes(1)
  })
})

test.each([
  {method: 'listReleases', helper: 'findLatestRelease', item: {tag_name: 'unmatched'}},
  {method: 'listTags', helper: 'findLatestTag', item: {name: 'unmatched'}},
])('later-page 404 in $method fails rather than selecting a fallback baseline', async({method, helper, item}) => {
  const octokit = makeOctokit()
  const error = apiError(404)
  octokit.rest.repos[method] = jest.fn()
    .mockResolvedValueOnce({data: Array.from({length: 100}, () => item)})
    .mockRejectedValueOnce(error)
  await expect(utils[helper](octokit, 'v')).rejects.toBe(error)
  expect(octokit.rest.repos[method]).toHaveBeenCalledTimes(2)
})

test.each([false, true])('deletion 422 verifies whether the reference still exists: %s', async exists => {
  const octokit = makeOctokit()
  const error = apiError(422)
  octokit.rest.git.deleteRef.mockRejectedValue(error)
  if (exists) octokit.rest.git.getRef.mockResolvedValue({data: {object: {type: 'commit', sha: 'target'}}})
  else octokit.rest.git.getRef.mockRejectedValue(apiError(404))
  if (exists) await expect(utils.deleteRefSilently(octokit, 'tags/v1')).rejects.toBe(error)
  else await expect(utils.deleteRefSilently(octokit, 'tags/v1')).resolves.toBeUndefined()
  expect(octokit.rest.git.deleteRef).toHaveBeenCalledTimes(1)
  expect(octokit.rest.git.getRef).toHaveBeenCalledWith(expect.objectContaining({ref: 'tags/v1'}))
})

describe('pinned commit history', () => {
  function commit(sha, message) {
    return {sha, commit: {message}}
  }

  test('validates each distinct raw reachable message before normalization', async() => {
    const octokit = makeOctokit()
    const onMessage = jest.fn()
    const included = [commit('target', 'fix: issue'), commit('ancestor', 'fix: issue ')]
    octokit.rest.repos.listCommits.mockImplementation(async({sha}) => ({
      data: sha === 'target' ? included : [...included, commit('newer', 'Invalid newer message')],
    }))
    expect(await utils.loadCommitMessagesFromRepo(
      octokit, {}, ['main', 'dev'], '', 'target', ['main-tip', 'dev-tip'], onMessage,
    )).toEqual(['fix: issue'])
    expect(onMessage.mock.calls).toEqual([['fix: issue'], ['fix: issue ']])
  })

  test('excludes newer/unreachable commits and deduplicates branches', async() => {
    const octokit = makeOctokit()
    const included = commit('included', 'fix: issue')
    octokit.rest.repos.getCommit.mockImplementation(async({ref}) => ({data: {sha: `${ref}-tip`}}))
    octokit.rest.repos.listCommits.mockImplementation(async({sha}) => ({
      data: sha === 'target'
        ? [included]
        : [commit('newer', 'feat: not released'), included],
    }))
    expect(await utils.loadCommitMessagesFromRepo(
      octokit, {since: '2026-01-01'}, ['main', 'dev'], 'src', 'target',
    )).toEqual(['fix: issue'])
    expect(octokit.rest.repos.listCommits.mock.calls.map(([params]) => params.sha)).toEqual([
      'target', 'main-tip', 'dev-tip',
    ])
    for (const [params] of octokit.rest.repos.listCommits.mock.calls) {
      expect(params).toMatchObject({since: '2026-01-01', path: 'src'})
    }
  })

  test('pagination always uses the initially resolved branch SHA', async() => {
    const octokit = makeOctokit()
    const page = Array.from({length: 100}, (_, index) => commit(`sha-${index}`, `fix: ${index}`))
    const requests = []
    octokit.rest.repos.getCommit.mockResolvedValue({data: {sha: 'original-tip'}})
    octokit.rest.repos.listCommits.mockImplementation(async({sha, page: number}) => {
      requests.push([sha, number])
      if (sha === 'target') return {data: number === 1 ? page : []}
      octokit.rest.repos.getCommit.mockResolvedValue({data: {sha: 'pushed-tip'}})
      return {data: number === 1 ? page : []}
    })
    expect(await utils.loadCommitMessagesFromRepo(octokit, {}, ['main'], '', 'target')).toHaveLength(100)
    expect(octokit.rest.repos.getCommit).toHaveBeenCalledTimes(1)
    expect(requests).toEqual([
      ['target', 1], ['target', 2], ['original-tip', 1], ['original-tip', 2],
    ])
  })

  test.each([404, 422])('fails when the only branch lookup returns HTTP %s', async status => {
    const octokit = makeOctokit()
    octokit.rest.repos.listCommits.mockResolvedValue({data: []})
    octokit.rest.repos.getCommit.mockRejectedValue(apiError(status))
    await expect(utils.loadCommitMessagesFromRepo(octokit, {}, ['missing'], '', 'target'))
      .rejects.toThrow('None of the configured branches exist')
  })

  test.each([403, 500])('propagates branch lookup HTTP %s', async status => {
    const octokit = makeOctokit()
    const error = apiError(status)
    octokit.rest.repos.listCommits.mockResolvedValue({data: []})
    octokit.rest.repos.getCommit.mockRejectedValue(error)
    await expect(utils.loadCommitMessagesFromRepo(octokit, {}, ['main'], '', 'target')).rejects.toBe(error)
  })
})
