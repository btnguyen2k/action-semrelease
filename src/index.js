const core = require('@actions/core')
const parseReleaseNotes = require('./release-notes')

// most @actions toolkit packages have async methods
async function run() {
  try {
    const isDryRun = core.getInput('dry-run')
    const releaseNotes = parseReleaseNotes()
    if (releaseNotes === undefined) {
      throw new Error('No release version/notes found')
    }
    if (isDryRun === 'true') {
      core.info(`Release version: ${releaseNotes.version}`)
      core.info(`Release notes:\n${releaseNotes.release_notes}`)
      return
    }
    core.setOutput('releaseVersion', releaseNotes.release_version)
    core.setOutput('releaseNotes', releaseNotes.release_notes)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
