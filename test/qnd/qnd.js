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

  const tag = await utils.findLatestTag(octokit, 'g18/v')
  console.log('tag:', tag)

  const commit = await utils.getCommit(octokit, tag.commit.sha)
  console.log('commit:', commit)

  const commits = await utils.getAllCommits(octokit, {since: commit.committer.date, path: 'g18/'})
  console.log('commits:', commits)
}

main()
