const utils = require('../../src/utils')
const github = require('@actions/github')

function getOctokitInstance() {
  const githubToken = process.env['GITHUB_TOKEN'] || ''
  if (!githubToken) {
    console.log('SKIPPED: GITHUB_TOKEN not set')
    return null
  }
  return github.getOctokit(githubToken)
}

async function main() {
  const octokit = getOctokitInstance()
  if (!octokit) {
    console.log('octokit not available')
    return
  }

  const release = await utils.getReleaseByTag(octokit, 'v1.1.0')
  console.log(release)
  const commits = await utils.getAllCommits(octokit, {since: release.created_at})
  console.log(commits)
}

main()
