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
  const branches = await utils.getAllBranches(octokit)
  console.log(branches)

  // const latestRelease = await utils.getLatestRelease(octokit)
  // const tagName = latestRelease.tag_name
  const refInfo = await utils.getRefByTagName(octokit, 'v1.0.0')
  console.log(refInfo)

  const tagInfo = await utils.getTag(octokit, refInfo.object.sha)
  console.log(tagInfo)

  // const commits = await utils.getCommits(octokit, {since: tagInfo.tagger.date, sha: '*'})
  // console.log('Num commits:', commits.length)
  // for (const commit of commits) {
  //   const commitInfo = {
  //     sha: commit.sha,
  //     message: commit.commit.message,
  //   }
  //   console.log(commitInfo)
  // }
}

main()
