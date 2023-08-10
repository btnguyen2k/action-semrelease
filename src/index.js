const core = require('@actions/core')
const github = require('@actions/github')
const utils = require('./utils')

const inputDryRun = 'dry-run'
const defaultDryRun = 'false'
const inputAutoMode = 'auto-mode'
const defaultAutoMode = 'false'
const inputGithubToken = 'github-token'
const inputTagMajorRelease = 'tag-major-release'
const defaultTagMajorRelease = 'true'
const inputTagMinorRelease = 'tag-minor-release'
const defaultTagMinorRelease = 'false'
const inputTagPrefix = 'tag-prefix'
const defaultTagPrefix = 'v'
const inputBranches = 'branches'
const defaultBranches = 'main,master'

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

const fs = require('fs')

// dry-run mode is enabled if any of the following is true:
// - input.dry-run is set to true
// - env.DRY_RUN is set to true
// - file .semrelease-dry-run is present in the root of the repo
function optDryRun() {
  const inputOrEnvDryRun = String(core.getInput(inputDryRun) || process.env['DRY_RUN'] || defaultDryRun).toLowerCase() === 'true'
  const fileDryRun = fs.existsSync('.semrelease-dry-run')
  return inputOrEnvDryRun || fileDryRun
}

function optBranches() {
  const branchesStr = String(core.getInput(inputBranches) || process.env['TAG_PREFIX'] || defaultBranches)
  const branches = branchesStr.trim().split(/[,;\s]+/)
  return branches.filter(branch => branch.trim() !== '')
}

function generateReleaseNotes(addedMessages, changedMessages, deprecatedMessages, removedMessages, fixedMessages, securityMessages) {
  let releaseNotes = ''

  if (changedMessages && changedMessages.length > 0) {
    releaseNotes += `### Changed\n\n${changedMessages.join('\n')}\n\n`
  }

  if (removedMessages && removedMessages.length > 0) {
    releaseNotes += `### Removed\n\n${removedMessages.join('\n')}\n\n`
  }

  if (addedMessages && addedMessages.length > 0) {
    releaseNotes += `### Added/Refactoring\n\n${addedMessages.join('\n')}\n\n`
  }

  if (deprecatedMessages && deprecatedMessages.length > 0) {
    releaseNotes += `### Deprecated\n\n${deprecatedMessages.join('\n')}\n\n`
  }

  if (fixedMessages && fixedMessages.length > 0) {
    releaseNotes += `### Fixed/Improvement\n\n${fixedMessages.join('\n')}\n\n`
  }

  if (securityMessages && securityMessages.length > 0) {
    releaseNotes += `### Security\n\n${securityMessages.join('\n')}\n\n`
  }

  return releaseNotes
}

const reBreak = /^[^a-z]*break(king)?(\([^)]+\)\s*)?:?\s+/i
const reChanged = /^[^a-z]*(break(ing)?\s+)?change(d|s)?(\([^)]+\)\s*)?:?\s+/i
const reRemoved = /^[^a-z]*rem(ove(d)?)?(\([^)]+\)\s*)?:?\s+/i

const reDeprecated = /^[^a-z]*deprecate(d)?(\([^)]+\)\s*)?:?\s+/i
const reRefactor = /^[^a-z]*refactor(ed)?(\([^)]+\)\s*)?:?\s+/i
const reAddMsg = /^[^a-z]*add(ed)?(\([^)]+\)\s*)?:?\s+/i
const reFeatureMsg = /^[^a-z]*(new\s+)?feat(ure)?(\([^)]+\)\s*)?:?\s+/i

const reFixMsg = /^[^a-z]*fix(ed)?(\([^)]+\)\s*)?:?\s+/i
const rePatchMsg = /^[^a-z]*patch(ed)?(\([^)]+\)\s*)?:?\s+/i
const reImprove = /^[^a-z]*improve(d|ment)?(\([^)]+\)\s*)?:?\s+/i
const reBump = /^[^a-z]*bump(ed)?(\([^)]+\)\s*)?:?\s+/i

const reSecurityMsg = /^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i

async function computeReleaseNotes(octokit) {
  let lastVersion = null
  const filterCommits = {}
  const latestRelease = await utils.getLatestRelease(octokit)
  if (latestRelease) {
    lastVersion = utils.parseSemver(latestRelease.tag_name)
    filterCommits.since = latestRelease.created_at
  } else {
    lastVersion = utils.parseSemver('0.0.0')
  }

  const branches = optBranches()
  const messages = []
  for (const branch of branches) {
    core.info(`🕘 Fetching commits from branch <${branch}>...`)
    const commits = await utils.getAllCommits(octokit, {...filterCommits, sha: branch})
    for (const commit of commits) {
      messages.push(commit.commit.message.trim())
    }
  }

  const changedMessages = []
  const removedMessages = []
  const addedMessages = []
  const deprecatedMessages = []
  const fixedMessages = []
  const securityMessages = []
  for (const msg of messages) {
    if (msg.match(reBreak) || msg.match(reChanged)) {
      changedMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }

    if (msg.match(reRemoved)) {
      removedMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }

    if (msg.match(reDeprecated)) {
      deprecatedMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }

    if (msg.match(reRefactor) || msg.match(reAddMsg) || msg.match(reFeatureMsg)) {
      addedMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }

    if (msg.match(reFixMsg) || msg.match(rePatchMsg) || msg.match(reImprove) || msg.match(reBump)) {
      fixedMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }

    if (msg.match(reSecurityMsg)) {
      securityMessages.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
    }
  }
  const version = changedMessages.length > 0 || removedMessages.length > 0
    ? utils.incMajorSemver(lastVersion)
    : addedMessages.length > 0 || deprecatedMessages.length > 0
      ? utils.incMinorSemver(lastVersion)
      : fixedMessages.length > 0 || securityMessages.length > 0
        ? utils.incPatchSemver(lastVersion)
        : lastVersion
  return {
    release_version: version,
    release_notes: generateReleaseNotes(addedMessages, changedMessages, deprecatedMessages, removedMessages, fixedMessages, securityMessages),
  }
}

async function run() {
  try {
    const isDryRun = optDryRun()
    const isAutoMode = String(core.getInput(inputAutoMode) || process.env['AUTO_MODE'] || defaultAutoMode).toLowerCase() === 'true'
    const isTagMajorRelease = String(core.getInput(inputTagMajorRelease) || defaultTagMajorRelease).toLowerCase() === 'true'
    const isTagMinorRelease = String(core.getInput(inputTagMinorRelease) || defaultTagMinorRelease).toLowerCase() === 'true'
    const tagPrefix = String(core.getInput(inputTagPrefix) || process.env['TAG_PREFIX'] || defaultTagPrefix)
    console.log(`ℹ️ isDryRun: ${isDryRun}`)
    console.log(`ℹ️ isAutoMode: ${isAutoMode}`)
    console.log(`ℹ️ isTagMajorRelease: ${isTagMajorRelease}`)
    console.log(`ℹ️ isTagMinorRelease: ${isTagMinorRelease}`)
    console.log(`ℹ️ tagPrefix: ${tagPrefix}`)

    const githubToken = core.getInput(inputGithubToken) || process.env['GITHUB_TOKEN']
    if (!githubToken) {
      throw new Error('github-token is required')
    }
    const octokit = github.getOctokit(githubToken)

    const releaseNotes = isAutoMode ? await computeReleaseNotes(octokit) : utils.parseReleaseNotes()
    if (!releaseNotes) {
      throw new Error('No release version/notes found')
    }

    if (releaseNotes.release_notes === '') {
      core.info(`⚠️ Empty release notes, skipped.`)
      core.setOutput(outputResult, 'SKIPPED')
      return
    }

    core.info(`ℹ️ Release version: ${releaseNotes.release_version.semver}`)
    const tagName = `${tagPrefix}${releaseNotes.release_version.semver}`
    if (await utils.getReleaseByTag(octokit, tagName)) {
      core.info(`⚠️ Release ${tagName} already exists, skipped.`)
      core.setOutput(outputResult, 'SKIPPED')
      return
    }

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
