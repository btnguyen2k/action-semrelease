const utils = require('../src/utils')
const github = require('@actions/github')

test('parse release notes', () => {
  const releaseNotes = utils.parseReleaseNotes()
  expect(releaseNotes).toBeDefined()
})

function getOctokitInstance() {
  const githubToken = process.env['GITHUB_TOKEN'] || ''
  if (!githubToken) {
    console.log('SKIPPED: GITHUB_TOKEN not set')
    return null
  }
  return github.getOctokit(githubToken)
}

describe('must error', () => {
  const octokit = github.getOctokit('dummy')
  test('test deleteRefSilently', async() => {
    try {
      await utils.deleteRefSilently(octokit, 'refs/tags/vNotExists')
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })

  test('test getAllCommits', async() => {
    try {
      await utils.getAllCommits(octokit)
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })

  test('test getReleaseByTag', async() => {
    try {
      await utils.getReleaseByTag(octokit, 'v1.0.0')
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })

  test('test getLatestRelease', async() => {
    try {
      await utils.getLatestRelease(octokit)
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })

  test('test getRefByTagName', async() => {
    try {
      await utils.getRefByTagName(octokit, 'v1.0.0')
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })

  test('test getTag', async() => {
    try {
      await utils.getTag(octokit, 'v1.0.0')
    } catch (error) {
      expect(error.status === 401 || error.status === 403).toBeTruthy()
    }
  })
})

describe('with octokit', () => {
  const octokit = getOctokitInstance()
  if (!octokit) {
    test.skip('octokit not available', () => {})
    return
  }

  test('test deleteRefSilently', async() => {
    try {
      await utils.deleteRefSilently(octokit, 'refs/tags/vNotExists')
    } catch (error) {
      if (error.status !== 403) {
        throw error
      }
    }
  })

  test('test getAllBranches', async() => {
    const testBranches = {main: true, dev: true}
    const branches = await utils.getAllBranches(octokit)
    expect(branches.length).toBeGreaterThan(0)
    for (const branch of branches) {
      if (testBranches[branch.name]) {
        delete testBranches[branch.name]
      }
    }
    expect(Object.keys(testBranches).length).toBe(0)
  })

  test('test getAllCommits', async() => {
    const commits = await utils.getAllCommits(octokit, {sha: 'main'})
    expect(commits.length).toBeGreaterThan(0)
  })

  test('test getReleaseByTag - not-exists', async() => {
    const releaseInfo = await utils.getReleaseByTag(octokit, 'vNotExists')
    expect(releaseInfo).toBeNull()
  })

  test('test getReleaseByTag - exists', async() => {
    const releaseInfo = await utils.getReleaseByTag(octokit, 'v1.0.0')
    expect(releaseInfo).not.toBeNull()
  })

  test('test getLatestRelease', async() => {
    const release = await utils.getLatestRelease(octokit)
    expect(release).not.toBeNull()
  })

  test('test getRefByTagName - not-exists', async() => {
    const release = await utils.getRefByTagName(octokit, 'vNotExists')
    expect(release).toBeNull()
  })
  test('test getRefByTagName - exists', async() => {
    const release = await utils.getRefByTagName(octokit, 'v1.0.0')
    expect(release).not.toBeNull()
  })

  test('test getReleaseByTag - not-exists', async() => {
    const release = await utils.getReleaseByTag(octokit, 'vNotExists')
    expect(release).toBeNull()
  })
  test('test getReleaseByTag - exists', async() => {
    const release = await utils.getReleaseByTag(octokit, 'v1.0.0')
    expect(release).not.toBeNull()
  })

  test('test getTag - not-exists', async() => {
    const release = await utils.getTag(octokit, 'vNotExists')
    expect(release).toBeNull()
  })
  test('test getTag - exists', async() => {
    const release = await utils.getTag(octokit, '2c547afacd7a353c94d4e099fb80cd415691723a')
    expect(release).not.toBeNull()
  })
})
