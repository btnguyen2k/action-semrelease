const core = require('@actions/core')
const github = require('@actions/github')
const utils = require('./utils')
const process = require("process")

const inputDryRun = 'dry-run'
const inputGithubToken = 'github-token'
const inputTagMajorRelease = 'tag-major-release'
const inputTagMinorRelease = 'tag-minor-release'

const outputReleaseVersion = 'releaseVersion'
const outputReleaseNotes = 'releaseNotes'
const outputResult = 'result'

async function deleteRefSilently(octokit, ref) {
  try {
    await octokit.rest.git.deleteRef({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref,
    })
  } catch (error) {
    if (error.status !== 404 && error.status !== 422) {
      throw error
    }
  }
}

async function createTag(octokit, tagName, dryRun) {
  core.info(`🕘 Creating tag ${tagName}...`)
  const createTagParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    tag: tagName,
    message: `Release ${tagName}`,
    object: github.context.sha,
    type: 'commit',
  }
  if (dryRun) {
    core.info(`♻️ [DRY-RUN], creating tag: ${JSON.stringify(createTagParams, null, 2)}`)
  } else {
    const {data: tagInfo} = await octokit.rest.git.createTag(createTagParams)
    core.info(`✅ Tag created: ${JSON.stringify(tagInfo, null, 2)}`)

    const ref = `refs/tags/${tagName}`
    await deleteRefSilently(octokit, ref)
    const createRefParams = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: ref,
      sha: tagInfo.sha,
    }
    core.info(`🕘 Creating refs/tags/${tagName}...`)
    const {data: refInfo} = await octokit.rest.git.createRef(createRefParams)
    core.info(`✅ Ref created: ${JSON.stringify(refInfo, null, 2)}`)
  }
}

async function createRelease(octokit, tagName, releaseNotes, isPrerelease, dryRun) {
  core.info(`🕘 Creating release ${tagName}...`)
  const createReleaseParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    tag_name: tagName,
    name: isPrerelease ? `Pre-release ${tagName}` : `Release ${tagName}`,
    body: releaseNotes.release_notes,
    prerelease: isPrerelease,
  }
  if (dryRun) {
    core.info(`♻️ [DRY-RUN], creating release: ${JSON.stringify(createReleaseParams, null, 2)}`)
  } else {
    const {data: releaseInfo} = await octokit.rest.repos.createRelease(createReleaseParams)
    core.info(`✅ Release created: ${JSON.stringify(releaseInfo, null, 2)}`)
  }
}

// most @actions toolkit packages have async methods
async function run() {
  try {
    const isDryRun = (core.getInput(inputDryRun) || 'false').toLowerCase() === 'true'
    const isTagMajorRelease = (core.getInput(inputTagMajorRelease) || 'true').toLowerCase() === 'true'
    const isTagMinorRelease = (core.getInput(inputTagMinorRelease) || 'false').toLowerCase() === 'true'

    const releaseNotes = utils.parseReleaseNotes()
    if (releaseNotes === undefined) {
      throw new Error('No release version/notes found')
    }

    const githubToken = core.getInput(inputGithubToken) || process.env['GITHUB_TOKEN']
    const octokit = github.getOctokit(githubToken)
    const tagName = `v${releaseNotes.release_version.semver}`
    if (await utils.getReleaseByTag(octokit, tagName)) {
      core.info(`⚠️ Release ${tagName} already exists, skipped.`)
      core.setOutput(outputResult, 'SKIPPED')
      return
    }

    core.info(`ℹ️ Release version: ${releaseNotes.release_version.semver}`)
    core.setOutput(outputReleaseVersion, releaseNotes.release_version.semver)
    await createTag(octokit, tagName, isDryRun)
    if (isTagMajorRelease) {
      await createTag(octokit, `v${releaseNotes.release_version.major}`, isDryRun)
    }
    if (isTagMinorRelease) {
      await createTag(octokit, `v${releaseNotes.release_version.major}.${releaseNotes.release_version.minor}`, isDryRun)
    }

    const isPrerelease = releaseNotes.release_version.prerelease != ''
    core.info(`ℹ️ Release notes:\n${releaseNotes.release_notes}`)
    core.setOutput(outputReleaseNotes, releaseNotes.release_notes)
    await createRelease(octokit, tagName, releaseNotes, isPrerelease, isDryRun)

    core.setOutput(outputResult, 'SUCCESS')
  } catch (error) {
    console.log(error)
    core.setOutput(outputResult, 'FAILED')
    core.setFailed(`❌ ${error.message}`)
  }
}

run()
