const core = require('@actions/core')
const github = require('@actions/github')
const utils = require('./utils')

const inputDryRun = 'dry-run'
const inputGithubToken = 'github-token'
const outputReleaseVersion = 'releaseVersion'
const outputReleaseNotes = 'releaseNotes'
const outputResult = 'result'

// most @actions toolkit packages have async methods
async function run() {
  try {
    const isDryRun = (core.getInput(inputDryRun) || 'false').toLowerCase() === 'true'

    const releaseNotes = utils.parseReleaseNotes()
    if (releaseNotes === undefined) {
      throw new Error('No release version/notes found')
    }

    const tagName = `v${releaseNotes.release_version}`
    const githubToken = core.getInput(inputGithubToken)
    const octokit = github.getOctokit(githubToken)
    if (await utils.getReleaseByTag(octokit, tagName)) {
      core.info(`Release ${tagName} already exists, skipped.`)
      core.setOutput(outputResult, 'SKIPPED')
      return
    }

    core.info(`Release version: ${releaseNotes.release_version}`)
    core.setOutput(outputReleaseVersion, releaseNotes.release_version)
    core.info(`Creating tag ${tagName}...`)
    if (!isDryRun) {
      core.warning(`Dry-run mode, skipped.`)
    } else {

    }

    core.info(`Release notes:\n${releaseNotes.release_notes}`)
    core.setOutput(outputReleaseNotes, releaseNotes.release_notes)
    core.info(`Creating release ${tagName}...`)
    if (!isDryRun) {
      core.warning(`Dry-run mode, skipped.`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
