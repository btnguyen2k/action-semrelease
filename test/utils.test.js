const utils = require('../src/utils')
const github = require('@actions/github')

test('parse release-notes', () => {
  const releaseNotes = utils.parseReleaseNotes()
  expect(releaseNotes).toBeDefined()
})

test('parse release-notes - specific changelog file', () => {
  const releaseNotes = utils.parseReleaseNotes('testdata/CHANGELOG.md')
  expect(releaseNotes).toBeDefined()
})

test('parse release-notes from change-log file', () => {
  const save = process.cwd()
  try {
    process.chdir('testdata/')
    const releaseNotes = utils.parseReleaseNotes()
    expect(releaseNotes).toBeDefined()
  } finally {
    process.chdir(save)
  }
})

test('incMajorSemver', () => {
  const version = {
    semver: '1.2.3-rc.1',
    major: '1',
    minor: '2',
    patch: '3',
    prerelease: 'rc.1',
  }
  const expected = {
    semver: '2.0.0',
    major: '2',
    minor: '0',
    patch: '0',
    prerelease: '',
  }
  expect(utils.incMajorSemver(version)).toEqual(expected)
})

test('incMinorSemver', () => {
  const version = {
    semver: '1.2.3-rc.1',
    major: '1',
    minor: '2',
    patch: '3',
    prerelease: 'rc.1',
  }
  const expected = {
    semver: '1.3.0',
    major: '1',
    minor: '3',
    patch: '0',
    prerelease: '',
  }
  expect(utils.incMinorSemver(version)).toEqual(expected)
})

test('incPatchSemver', () => {
  const version = {
    semver: '1.2.3-rc.1',
    major: '1',
    minor: '2',
    patch: '3',
    prerelease: 'rc.1',
  }
  const expected = {
    semver: '1.2.4',
    major: '1',
    minor: '2',
    patch: '4',
    prerelease: '',
  }
  expect(utils.incPatchSemver(version)).toEqual(expected)
})

test('parseSemver', () => {
  const version = '1.2.3-rc.1'
  const expected = {
    semver: '1.2.3-rc.1',
    major: '1',
    minor: '2',
    patch: '3',
    prerelease: 'rc.1',
  }
  expect(utils.parseSemver(version)).toEqual(expected)
})

test('parseSemver - null', () => {
  const version = '1.2.3.invalid'
  expect(utils.parseSemver(version)).toBeNull()
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

  test('test getCommit', async() => {
    try {
      await utils.getCommit(octokit)
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

  test('test findLatestRelease', async() => {
    try {
      await utils.findLatestRelease(octokit, 'v')
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

  test('test findLatestTag', async() => {
    try {
      await utils.findLatestTag(octokit, 'v')
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
  test('test getAllBranches - long', async() => {
    const branches = await utils.getAllBranches(octokit, {owner: 'btnguyen2k', repo: 'long-repo', per_page: 10})
    expect(branches.length).toBeGreaterThan(100)
  })

  test('test getAllCommits', async() => {
    const commits = await utils.getAllCommits(octokit, {sha: 'main'})
    expect(commits.length).toBeGreaterThan(0)
  })
  test('test getAllCommits - long', async() => {
    const commits = await utils.getAllCommits(octokit, {owner: 'btnguyen2k', repo: 'long-repo', sha: 'main'})
    expect(commits.length).toBeGreaterThan(0)
  })

  test('test getCommit', async() => {
    const tagInfo = await utils.findLatestTag(octokit, 'v')
    expect(tagInfo).not.toBeNull()

    const commitInfo = await utils.getCommit(octokit, tagInfo.commit.sha)
    expect(commitInfo).not.toBeNull()
  })
  test('test getCommit - not-exists', async() => {
    const commitInfo = await utils.getCommit(octokit, 'not-exists')
    expect(commitInfo).toBeNull()
  })

  test('test getReleaseByTag - not-exists', async() => {
    const releaseInfo = await utils.getReleaseByTag(octokit, 'vNotExists')
    expect(releaseInfo).toBeNull()
  })
  test('test getReleaseByTag - exists', async() => {
    const releaseInfo = await utils.getReleaseByTag(octokit, 'v1.0.0')
    expect(releaseInfo).not.toBeNull()
  })

  test('test findLatestRelease', async() => {
    const release = await utils.findLatestRelease(octokit, 'v')
    expect(release).not.toBeNull()
  })
  // test('test findLatestRelease - long', async() => {
  //   const saved = process.env['GITHUB_REPOSITORY']
  //   try {
  //     process.env['GITHUB_REPOSITORY'] = 'btnguyen2k/long-repo'
  //     const release = await utils.findLatestRelease(octokit, 'v')
  //     expect(release).not.toBeNull()
  //   } finally {
  //     process.env['GITHUB_REPOSITORY'] = saved
  //   }
  // })
  test('test findLatestRelease - not-found', async() => {
    const release = await utils.findLatestRelease(octokit, 'nf')
    expect(release).toBeNull()
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

  test('test findLatestTag', async() => {
    const tag = await utils.findLatestTag(octokit, 'v')
    expect(tag).not.toBeNull()
  })
  test('test findLatestTag - not-found', async() => {
    const tag = await utils.findLatestTag(octokit, 'nf')
    expect(tag).toBeNull()
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
