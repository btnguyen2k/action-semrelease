const core = require('@actions/core')
const github = require('@actions/github')
const parseReleaseNotes = require('./release-notes')

// most @actions toolkit packages have async methods
async function run() {
  try {
    const inputDryRun = core.getInput('dry-run') || 'false'
    const isDryRun = inputDryRun.toLowerCase() === 'true'

    const releaseNotes = parseReleaseNotes()
    if (releaseNotes === undefined) {
      throw new Error('No release version/notes found')
    }
    core.info(`Release version: ${releaseNotes.release_version}`)
    core.info(`Release notes:\n${releaseNotes.release_notes}`)
    core.setOutput('releaseVersion', releaseNotes.release_version)
    core.setOutput('releaseNotes', releaseNotes.release_notes)

    const githubToken = core.getInput('github-token')
    const octokit = github.getOctokit(githubToken)
    const releaseTag = await octokit.rest.git.getRef({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: `releases/tag/v${releaseNotes.release_version}`
    })
    core.info(`Major tag: ${releaseTag}`)

    if (!isDryRun) {
      return
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
