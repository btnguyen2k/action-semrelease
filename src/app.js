const core = require('@actions/core')
const github = require('@actions/github')
const utils = require('./utils')
const rules = require('./rules')

const inputGithubToken = 'github-token'
const outputResultSkipped = 'SKIPPED'
const outputResultSuccess = 'SUCCESS'

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

async function computeReleaseMeta(octokit, options) {
  let lastVersion = utils.parseSemver('0.0.0')
  const filterCommits = {}
  const latestRelease = await utils.findLatestRelease(octokit, options.tagPrefix)
  if (latestRelease) {
    // first, check if there is a release for the tag-prefix
    lastVersion = utils.parseSemver(latestRelease.tag_name.slice(options.tagPrefix.length))
    filterCommits.since = latestRelease.created_at
    core.info(`ℹ️ Found latest release <${latestRelease.tag_name}> (tag ${latestRelease.tag_name}) at <${latestRelease.created_at}>`)
  } else {
    // if no release found for the tag-prefix, check if there is a tag that matches the tag-prefix
    core.info(`⚠️ No release found for tag-prefix <${options.tagPrefix}>, checking tags...`)
    const latestTag = await utils.findLatestTag(octokit, options.tagPrefix)
    if (latestTag) {
      lastVersion = utils.parseSemver(latestTag.name.slice(options.tagPrefix.length))
      const commit = await utils.getCommit(octokit, latestTag.commit.sha)
      filterCommits.since = commit.committer.date
      core.info(`ℹ️ Found latest tag <${latestTag.name}> at <${commit.committer.date}>`)
    } else {
      // nothing found
      core.info(`ℹ️ No release/tag found for tag-prefix <${options.tagPrefix}>`)
    }
  }

  const commitLogsFile = '.semrelease/this_release'

  // firstly, try to load commit messages from .semrelease/this_release
  core.info(`ℹ️ Try loading commit messages from file ${commitLogsFile}...`)
  let commitMessages = await utils.loadCommitMessagesFromFile(commitLogsFile)
  if (!commitMessages || commitMessages.length === 0) {
    // if the file does not exist or no commit messages found, load commit messages from GitHub repo
    core.info(`ℹ️ File ${commitLogsFile} does not exist or no commit messages found, loading commit messages from repo...`)
    core.info(`🕘 Fetching commits from branch <${options.branches}>...`)
    commitMessages = await utils.loadCommitMessagesFromRepo(octokit, filterCommits, options.branches, options.scanPath)
  }

  const msgsBumpMajor = []
  const msgsBumpMinor = []
  const msgsBumpPatch = []
  // secondly, parse commit messages to detect changes/updates
  rules.parseCommitMessages(commitMessages, (rule, msg) => {
    core.info(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMajor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    core.info(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMinor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    core.info(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpPatch.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  })

  if (msgsBumpMajor.length+msgsBumpMinor.length+msgsBumpPatch.length === 0) {
    core.info(`📣 No changes/updates detected.`)
    return {
      release_version: lastVersion,
      release_notes: '',
    }
  }

  const releaseOptions = await utils.getReleaseOptionsFromFile(commitLogsFile)
  core.info(`ℹ️ releaseOptions: ${JSON.stringify(releaseOptions, null, 2)}`)
  if (releaseOptions.releaseVersion) {
    core.info(`✴️ Release version forced to ${releaseOptions.releaseVersion}.`)
    const version = utils.parseSemver(releaseOptions.releaseVersion)
    if (version) {
      return {
        release_version: version,
        release_notes: rules.generateReleaseNotes(commitMessages),
      }
    }
    throw new Error(`Invalid version number: ${releaseOptions.releaseVersion}`)
  }

  const version = msgsBumpMajor.length > 0
    ? utils.incMajorSemver(lastVersion)
    : msgsBumpMinor.length > 0
      ? utils.incMinorSemver(lastVersion)
      : utils.incPatchSemver(lastVersion)
  if (parseInt(version.major) > parseInt(lastVersion.major)) {
    core.info(`📣 Breaking changes detected, releasing new MAJOR version...`)
  } else if (parseInt(version.minor) > parseInt(lastVersion.minor)) {
    core.info(`📣 New functionality updates detected, releasing new MINOR version...`)
  } else {
    core.info(`📣 Bug fix/patch/improvement updates detected, releasing new PATCH version...`)
  }
  return {
    release_version: version,
    release_notes: rules.generateReleaseNotes(commitMessages),
  }
}

async function semrelease() {
  const RESULT_SKIPPED = {
    result: outputResultSkipped,
    releaseVersion: '',
    releaseNotes: '',
  }

  // build GitHub client
  const githubToken = core.getInput(inputGithubToken) || process.env['GITHUB_TOKEN']
  if (!githubToken) {
    throw new Error('github-token is required')
  }
  const octokit = github.getOctokit(githubToken)

  // fetch options
  const options = utils.getOptions()
  core.info(`ℹ️ options: ${JSON.stringify(options, null, 2)}`)

  if (options.isAutoMode || options.changelogFile) {
    core.warning(`⚠️ DEPRECATION WARNING`)
    core.warning(`⚠️ auto-mode and changelog-file inputs are deprecated and will be removed in future versions.`)
    core.warning(`⚠️ See https://github.com/btnguyen2k/action-semrelease for more details.`)
  }

  // fetch release info
  // v3.4.0: auto-mode is now deprecated
  const releaseMeta = await computeReleaseMeta(octokit, options)
  // const releaseMeta = options.isAutoMode
  //   ? await computeReleaseMeta(octokit, options)
  //   : utils.parseReleaseMeta(options.changelogFile)
  if (!releaseMeta || releaseMeta.release_version === '' || releaseMeta.release_notes === '') {
    core.info(`⚠️ No release info found, or release notes are empty, skipped.`)
    RESULT_SKIPPED.reason = 'No release info found, or release notes are empty.'
    return RESULT_SKIPPED
  }

  core.info(`ℹ️ Release version: ${releaseMeta.release_version.semver}`)
  const tagName = `${options.tagPrefix}${releaseMeta.release_version.semver}`
  if (await utils.getReleaseByTag(octokit, tagName)) {
    core.info(`⚠️ Release ${tagName} already exists, skipped.`)
    RESULT_SKIPPED.reason = `Release ${tagName} already exists.`
    return RESULT_SKIPPED
  }

  // create tags
  await createTag(octokit, tagName, options.isDryRun)
  if (options.isTagMajorRelease) {
    await createTag(octokit, `${options.tagPrefix}${releaseMeta.release_version.major}`, options.isDryRun)
  }
  if (options.isTagMinorRelease) {
    await createTag(octokit, `${options.tagPrefix}${releaseMeta.release_version.major}.${releaseMeta.release_version.minor}`, options.isDryRun)
  }

  // create release
  const isPrerelease = releaseMeta.release_version.prerelease !== ''
  core.info(`ℹ️ Release notes:\n${releaseMeta.release_notes}`)
  if (!options.isTagOnly) {
    await createRelease(octokit, tagName, releaseMeta, isPrerelease, options.isDryRun)
  } else {
    core.info(`⚠️ Tag-only mode enabled, skipped creating release.`)
  }

  return {
    result: outputResultSuccess,
    releaseVersion: releaseMeta.release_version.semver,
    releaseNotes: releaseMeta.release_notes,
  }
}

module.exports = {
  semrelease,
}
