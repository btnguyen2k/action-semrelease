const core = require('@actions/core')
const github = require('@actions/github')
const utils = require('./utils')

const inputDryRun = 'dry-run'
const inputGithubToken = 'github-token'
const inputTagMajorRelease = 'tag-major-release'
const inputTagMinorRelease = 'tag-minor-release'
const inputTagPrefix = 'tag-prefix'

const outputReleaseVersion = 'releaseVersion'
const outputReleaseNotes = 'releaseNotes'
const outputResult = 'result'

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

    const refFull = `refs/tags/${tagName}`
    const refShort = `tags/${tagName}`
    core.info(`🕘 Cleaning ${refFull}...`)
    await utils.deleteRefSilently(octokit, refShort)
    const createRefParams = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: refFull,
      sha: tagInfo.sha,
    }
    core.info(`🕘 Creating ${refFull}...`)
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
    const isDryRun = String(core.getInput(inputDryRun) || process.env['DRY_RUN'] || 'false').toLowerCase() === 'true'
    const isTagMajorRelease = String(core.getInput(inputTagMajorRelease) || 'true').toLowerCase() === 'true'
    const isTagMinorRelease = String(core.getInput(inputTagMinorRelease) ||  'false').toLowerCase() === 'true'
    const tagPrefix = String(core.getInput(inputTagPrefix) || process.env['TAG_PREFIX'] || 'v')
    console.log(`ℹ️ isDryRun: ${isDryRun}`)
    console.log(`ℹ️ isTagMajorRelease: ${isTagMajorRelease}`)
    console.log(`ℹ️ isTagMinorRelease: ${isTagMinorRelease}`)
    console.log(`ℹ️ tagPrefix: ${tagPrefix}`)

    const releaseNotes = utils.parseReleaseNotes()
    if (!releaseNotes) {
      throw new Error('No release version/notes found')
    }

    const githubToken = core.getInput(inputGithubToken) || process.env['GITHUB_TOKEN']
    const octokit = github.getOctokit(githubToken)
    const tagName = `${tagPrefix}${releaseNotes.release_version.semver}`
    if (await utils.getReleaseByTag(octokit, tagName)) {
      core.info(`⚠️ Release ${tagName} already exists, skipped.`)
      core.setOutput(outputResult, 'SKIPPED')
      return
    }
    core.info(`ℹ️ Release version: ${releaseNotes.release_version.semver}`)
    core.setOutput(outputReleaseVersion, releaseNotes.release_version.semver)
    await createTag(octokit, tagName, isDryRun)
    if (isTagMajorRelease) {
      await createTag(octokit, `${tagPrefix}${releaseNotes.release_version.major}`, isDryRun)
    }
    if (isTagMinorRelease) {
      await createTag(octokit, `${tagPrefix}${releaseNotes.release_version.major}.${releaseNotes.release_version.minor}`, isDryRun)
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
