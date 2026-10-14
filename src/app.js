import * as core from '@actions/core'
import * as github from '@actions/github'
import * as utils from './utils.js'
import * as rules from './rules.js'
import {prepareArtifacts, uploadArtifactAsset} from './artifacts.js'

const inputGithubToken = 'github-token'
const outputResultSkipped = 'SKIPPED'
const outputResultSuccess = 'SUCCESS'

async function verifyReleaseTag(octokit, tagName, targetSha) {
  const existing = await utils.resolveTagCommit(octokit, tagName)
  if (existing && existing !== targetSha) {
    throw new Error(`Refusing to move release tag ${tagName}: it points to ${existing}, expected ${targetSha}`)
  }
  return existing
}

async function createTag(octokit, tagName, targetSha, dryRun, movable = false) {
  if (!movable && await verifyReleaseTag(octokit, tagName, targetSha)) {
    core.info(`Release tag ${tagName} already points to ${targetSha}; reusing it.`)
    return
  }
  core.info(`🕘 Creating tag ${tagName}...`)
  const createTagParams = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    tag: tagName,
    message: `Release ${tagName}`,
    object: targetSha,
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
    if (movable) await utils.deleteRefSilently(octokit, refShort)
    const createRefParams = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: refFull,
      sha: tagInfo.sha,
    }
    core.info(`🕘 Creating ${refFull}...`)
    try {
      const {data: refInfo} = await octokit.rest.git.createRef(createRefParams)
      core.info(`✅ Ref created: ${JSON.stringify(refInfo, null, 2)}`)
    } catch (error) {
      if (movable || error.status !== 422) throw error
      if (!await verifyReleaseTag(octokit, tagName, targetSha)) throw error
      core.info(`Release tag ${tagName} concurrently created at ${targetSha}; reusing it.`)
    }
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
    return releaseInfo
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
      if (!commit) {
        throw new Error(`Baseline commit ${latestTag.commit.sha} for tag ${latestTag.name} does not exist in this repository`)
      }
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
  const releaseLines = await utils.readReleaseLinesAtCommit(octokit, options.targetSha)
  const releaseOptions = await utils.getReleaseOptionsFromFile(commitLogsFile, releaseLines)
  let commitMessages = await utils.loadCommitMessagesFromFile(commitLogsFile, releaseLines)
  if (!commitMessages || commitMessages.length === 0) {
    // if the file does not exist or no commit messages found, load commit messages from GitHub repo
    core.info(`ℹ️ File ${commitLogsFile} does not exist or no commit messages found, loading commit messages from repo...`)
    core.info(`🕘 Fetching commits from branch <${options.branches}>...`)
    commitMessages = await utils.loadCommitMessagesFromRepo(octokit, filterCommits, options.branches, options.scanPath, options.targetSha, options.branchTips)
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

  core.info(`ℹ️ releaseOptions: ${JSON.stringify(releaseOptions, null, 2)}`)
  if (releaseOptions.releaseVersion) {
    core.info(`✴️ Release version forced to ${releaseOptions.releaseVersion}.`)
    return {
      release_version: utils.normalizeReleaseVersion(releaseOptions.releaseVersion),
      release_notes: rules.generateReleaseNotes(commitMessages),
    }
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
    release_version: utils.normalizeReleaseVersion(version.semver),
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
  const octokit = github.getOctokit(githubToken, {request: {timeout: 30000}})

  // fetch options
  const options = utils.getOptions()
  if (!options.targetSha) throw new Error('target-sha or github.context.sha is required')
  const targetCommit = await utils.getCommit(octokit, options.targetSha)
  if (!targetCommit) throw new Error(`Target commit ${options.targetSha} does not exist in this repository`)
  options.targetSha = targetCommit.sha
  options.branchTips = await utils.validateReleaseBranches(octokit, options.branches, options.targetSha)
  core.info(`ℹ️ options: ${JSON.stringify(options, null, 2)}`)

  // fetch release info
  const releaseMeta = await computeReleaseMeta(octokit, options)
  if (!releaseMeta || releaseMeta.release_version === '' || releaseMeta.release_notes === '') {
    core.info(`⚠️ No release info found, or release notes are empty, skipped.`)
    RESULT_SKIPPED.reason = 'No release info found, or release notes are empty.'
    return RESULT_SKIPPED
  }

  core.info(`ℹ️ Release version: ${releaseMeta.release_version.semver}`)
  const tagName = `${options.tagPrefix}${releaseMeta.release_version.semver}`
  const existingTag = await verifyReleaseTag(octokit, tagName, options.targetSha)
  if (await utils.getReleaseByTag(octokit, tagName)) {
    if (!existingTag) {
      throw new Error(`Release ${tagName} exists but its exact tag is missing. Inspect the release and manually restore or clean up its state before retrying; no automatic repair was performed.`)
    }
    core.info(`⚠️ Release ${tagName} already exists, skipped.`)
    RESULT_SKIPPED.reason = `Release ${tagName} already exists.`
    return RESULT_SKIPPED
  }

  const prepared = await prepareArtifacts(octokit, options)
  let stage = `creating exact tag ${tagName}`
  try {
    await createTag(octokit, tagName, options.targetSha, options.isDryRun)
    if (options.isTagMajorRelease) {
      const alias = `${options.tagPrefix}${releaseMeta.release_version.major}`
      stage = `updating major alias ${alias}`
      await createTag(octokit, alias, options.targetSha, options.isDryRun, true)
    }
    if (options.isTagMinorRelease) {
      const alias = `${options.tagPrefix}${releaseMeta.release_version.major}.${releaseMeta.release_version.minor}`
      stage = `updating minor alias ${alias}`
      await createTag(octokit, alias, options.targetSha, options.isDryRun, true)
    }

    stage = `publishing release ${tagName}`
    const isPrerelease = releaseMeta.release_version.prerelease !== ''
    core.info(`ℹ️ Release notes:\n${releaseMeta.release_notes}`)
    if (!options.isTagOnly) {
      const release = await createRelease(octokit, tagName, releaseMeta, isPrerelease, options.isDryRun)
      for (const asset of prepared.assets) {
        stage = `uploading release asset ${asset.name}`
        if (options.isDryRun) {
          core.info(`[DRY-RUN] Upload release asset ${asset.name} (${asset.size} bytes)`)
        } else {
          await uploadArtifactAsset(octokit, release, asset)
        }
      }
    } else {
      core.info(`⚠️ Tag-only mode enabled, skipped creating release.`)
    }
  } catch (error) {
    core.warning(
      `Release ${tagName} at ${options.targetSha} failed while ${stage}. `
      + 'Partial changes may remain; no automatic rollback was performed. '
      + 'Inspect the operation logs, tags, enabled aliases, release and uploaded assets; manually clean up or restore '
      + 'only changes from this failed run before retrying. Do not delete pre-existing tags or releases.',
    )
    throw error
  } finally {
    await prepared.cleanup()
  }

  return {
    result: outputResultSuccess,
    releaseVersion: releaseMeta.release_version.semver,
    releaseNotes: releaseMeta.release_notes,
  }
}

export {
  semrelease,
}
