// const utils = require('../../src/utils')
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

  const str = 'v1.2.3\n\n'
  console.log(str)
  console.log(str.trim())
}

main()
