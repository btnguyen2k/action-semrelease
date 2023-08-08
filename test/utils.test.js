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

  test('test getReleaseByTag - not-exists', async() => {
    const tagInfo = await utils.getReleaseByTag(octokit, 'vNotExists')
    expect(tagInfo).toBeNull()
  })

  test('test getReleaseByTag - exists', async() => {
    const tagInfo = await utils.getReleaseByTag(octokit, 'v1.0.0')
    expect(tagInfo).not.toBeNull()
  })
})
