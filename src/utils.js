export {
  getOptions,
  loadCommitMessagesFromFile,
  loadCommitMessagesFromRepo,
  getReleaseOptionsFromFile,
  readReleaseLinesAtCommit,
  resolveTagCommit,
  normalizeReleaseVersion,

  deleteRefSilently,
  getAllBranches,
  getCommit,
  getAllCommits,
  getReleaseByTag,
  findLatestRelease,
  findLatestTag,
  getRefByTagName,
  getTag,

  parseSemver,
  incMajorSemver,
  incMinorSemver,
  incPatchSemver,
}

import * as github from '@actions/github'
import * as core from '@actions/core'
import fs from 'node:fs'

async function readFileAsLines(filename) {
  return await fs.promises.readFile(filename, {encoding: 'utf8'})
    .catch(err => {
      if (err.code === 'ENOENT') return null
      throw err
    }).then(data => data ? data.split(/\r?\n/) : null)
}

/**
 * Loads commit messages from the specified file (default .semrelease/this_release).
 * @param commitLogsFile
 * @returns {Promise<string[]|null>}
 */
async function loadCommitMessagesFromFile(commitLogsFile, lines) {
  return await (lines === undefined ? readFileAsLines(commitLogsFile || '.semrelease/this_release') : Promise.resolve(lines))
    .then(commitLogs => commitLogs ? commitLogs
      // trim spaces, leading bullet chars (- and =) && remove empty and comment lines
      .map(line => line.replace(/^[\s=-]*/, '').trim())
      .filter(line => line !== '' && !line.startsWith('#')) : null)
}

/**
 * Loads commit messages from the GitHub repository.
 * @param octokit
 * @param filterCommits
 * @param branches
 * @param scanPath
 * @returns {Promise<string[]>}
 */
async function loadCommitMessagesFromRepo(octokit, filterCommits, branches, scanPath, targetSha) {
  const commitMessages = []
  let reachable
  if (targetSha) {
    const params = {...filterCommits, sha: targetSha}
    if (scanPath) params.path = scanPath
    reachable = new Set((await getAllCommits(octokit, params)).map(commit => commit.sha))
  }
  for (const branch of branches) {
    let sha = branch
    if (targetSha) {
      try {
        const {data: tip} = await octokit.rest.repos.getCommit({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          ref: branch,
        })
        sha = tip.sha
      } catch (error) {
        if (error.status !== 404) throw error
        continue
      }
    }
    const params = {...filterCommits, sha}
    if (scanPath) {
      params.path = scanPath
    }
    const commits = await getAllCommits(octokit, params)
    for (const commit of commits) {
      if (reachable && !reachable.has(commit.sha)) continue
      // trim spaces, leading bullet chars (- and =)
      const commitMsg = commit.commit.message.replace(/^[\s=-]*/, '').trim()
      commitMessages.push(commitMsg)
    }
  }

  // remove empty and duplicated lines
  return commitMessages
    .filter(line => line !== '')
    .filter((line, index, self) => self.indexOf(line) === index)
}

/**
 * Convenience function to construct Option struct from inputs and environment variables.
 * @returns {{isTagMajorRelease: boolean, tagPrefix: string, targetSha: string, isTagOnly: boolean, scanPath: string, isDryRun: *, isTagMinorRelease: boolean, branches: string[]}}
 */
function getOptions() {
  const inputDryRun = 'dry-run'
  const defaultDryRun = 'false'
  const inputTagMajorRelease = 'tag-major-release'
  const defaultTagMajorRelease = 'true'
  const inputTagMinorRelease = 'tag-minor-release'
  const defaultTagMinorRelease = 'false'
  const inputTagPrefix = 'tag-prefix'
  const defaultTagPrefix = 'v'
  const inputBranches = 'branches'
  const defaultBranches = 'main,master'
  const inputTagOnly = 'tag-only'
  const defaultTagOnly = 'false'
  const inputPath = 'path'
  const defaultPath = ''

  return {
    isDryRun: optDryRun(),
    targetSha: core.getInput('target-sha') || github.context.sha,
    isTagMajorRelease: String(core.getInput(inputTagMajorRelease) || defaultTagMajorRelease).toLowerCase() === 'true',
    isTagMinorRelease: String(core.getInput(inputTagMinorRelease) || defaultTagMinorRelease).toLowerCase() === 'true',
    tagPrefix: String(core.getInput(inputTagPrefix) || process.env['TAG_PREFIX'] || defaultTagPrefix),
    branches: optBranches(),
    isTagOnly: String(core.getInput(inputTagOnly) || process.env['TAG_ONLY'] || defaultTagOnly).toLowerCase() === 'true',
    scanPath: String(core.getInput(inputPath) || process.env['SCAN_PATH'] || defaultPath),
  }

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
    const branchesStr = String(core.getInput(inputBranches) || process.env['BRANCHES'] || defaultBranches)
    const branches = branchesStr.trim().split(/[,;\s]+/)
    return branches.filter(branch => branch.trim() !== '')
  }
}

async function getReleaseOptionsFromFile(commitLogsFile, lines) {
  const releaseOptions = {}
  await (lines === undefined ? readFileAsLines(commitLogsFile || '.semrelease/this_release') : Promise.resolve(lines))
    .then(commitLogs => {
      if (commitLogs) {
        commitLogs.forEach(line => {
          const parts = line.trim().split('=')
          if (parts.length === 2) {
            if (parts[0].trim().toUpperCase() === '#!VERSION') {
              releaseOptions['releaseVersion'] = parts[1].trim()
            }
          }
        })
      }
    })
  return releaseOptions
}

async function readReleaseLinesAtCommit(octokit, targetSha) {
  try {
    const {data: file} = await octokit.rest.repos.getContent({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      path: '.semrelease/this_release',
      ref: targetSha,
    })
    if (Array.isArray(file) || file.type !== 'file' || file.encoding !== 'base64') {
      throw new Error('Expected .semrelease/this_release to be a base64-encoded file')
    }
    return Buffer.from(file.content, 'base64').toString('utf8').split(/\r?\n/)
  } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

async function resolveTagCommit(octokit, tagName) {
  const ref = await getRefByTagName(octokit, tagName)
  if (!ref) return null
  let object = ref.object
  for (let depth = 0; depth < 16; depth++) {
    if (object.type === 'commit') return object.sha
    if (object.type !== 'tag') {
      throw new Error(`Tag ${tagName} references unsupported object type ${object.type}`)
    }
    const tag = await getTag(octokit, object.sha)
    if (!tag) throw new Error(`Tag object ${object.sha} for ${tagName} was not found`)
    object = tag.object
  }
  throw new Error(`Tag ${tagName} contains too many nested tag objects`)
}

function normalizeReleaseVersion(text) {
  let version = parseSemver(text)
  if (!version) {
    const partial = text.match(/^v?((?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?)([-+].*)?$/)
    if (partial) {
      const components = partial[1].split('.')
      while (components.length < 3) components.push('0')
      version = parseSemver(components.join('.') + (partial[2] || ''))
    }
  }
  if (!version) throw new Error(`Invalid version number: ${text}`)
  return version
}

/*----------------------------------------------------------------------*/

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

async function getAllBranches(octokit, overrideParams) {
  const defaultParams = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
  const params = overrideParams ? {...defaultParams, ...overrideParams} : defaultParams
  const branches = []
  for (;;) {
    const {data: page} = await octokit.rest.repos.listBranches(params)
    branches.push(...page)
    if (page.length < params.per_page) {
      break
    }
    params.page++
  }
  return branches
}

async function getCommit(octokit, sha) {
  try {
    const {data: commitInfo} = await octokit.rest.git.getCommit({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      commit_sha: sha,
    })
    return commitInfo
  } catch (error) {
    if (error.status === 404) {
      return null
    }
    throw error
  }
}

async function getAllCommits(octokit, overrideParams) {
  const defaultParams = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
  const params = overrideParams ? {...defaultParams, ...overrideParams} : defaultParams
  const commits = []
  try {
    for (; ;) {
      const {data: page} = await octokit.rest.repos.listCommits(params)
      commits.push(...page)
      if (page.length < params.per_page) {
        break
      }
      params.page++
    }
  } catch (error) {
    if (error.status !== 404) {
      throw error
    }
  }
  return commits
}

async function getReleaseByTag(octokit, tagName) {
  try {
    const {data: releaseInfo} = await octokit.rest.repos.getReleaseByTag({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      tag: tagName,
    })
    return releaseInfo
  } catch (error) {
    if (error.status === 404) {
      return null
    }
    throw error
  }
}

async function findLatestRelease(octokit, tagPrefix) {
  const params = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
  try {
    for (; ;) {
      const {data: page} = await octokit.rest.repos.listReleases(params)
      for (const release of page) {
        if (release.tag_name.startsWith(tagPrefix) && release.tag_name.slice(tagPrefix.length).match(reSemverRaw)) {
          return release
        }
      }
      if (page.length < params.per_page) {
        break
      }
      params.page++
    }
  } catch (error) {
    if (error.status !== 404) {
      throw error
    }
  }
  return null
}

async function getRefByTagName(octokit, tagName) {
  try {
    const {data: refInfo} = await octokit.rest.git.getRef({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: `tags/${tagName}`
    })
    return refInfo
  } catch (error) {
    if (error.status === 404) {
      return null
    }
    throw error
  }
}

async function findLatestTag(octokit, tagPrefix) {
  const params = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
  try {
    for (; ;) {
      const {data: page} = await octokit.rest.repos.listTags(params)
      for (const tag of page) {
        if (tag.name.startsWith(tagPrefix) && tag.name.slice(tagPrefix.length).match(reSemverRaw)) {
          return tag
        }
      }
      if (page.length < params.per_page) {
        break
      }
      params.page++
    }
  } catch (error) {
    if (error.status !== 404) {
      throw error
    }
  }
  return null
}

async function getTag(octokit, sha) {
  try {
    const {data: tagInfo} = await octokit.rest.git.getTag({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      tag_sha: sha,
    })
    return tagInfo
  } catch (error) {
    if (error.status === 404) {
      return null
    }
    throw error
  }
}

/*----------------------------------------------------------------------*/

const reSemver = /^v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)$/
const reSemverRaw = /^((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)$/

function parseSemver(text) {
  const matches = text.match(reSemver)
  if (matches) {
    return {
      semver: matches[1],
      major: matches[2],
      minor: matches[3],
      patch: matches[4],
      prerelease: matches[5] || '',
    }
  }
  return null
}

function incMajorSemver(version) {
  return {
    semver: `${parseInt(version.major) + 1}.0.0`,
    major: `${parseInt(version.major) + 1}`,
    minor: '0',
    patch: '0',
    prerelease: '',
  }
}

function incMinorSemver(version) {
  return {
    semver: `${version.major}.${parseInt(version.minor) + 1}.0`,
    major: `${version.major}`,
    minor: `${parseInt(version.minor) + 1}`,
    patch: '0',
    prerelease: '',
  }
}

function incPatchSemver(version) {
  return {
    semver: `${version.major}.${version.minor}.${parseInt(version.patch) + 1}`,
    major: `${version.major}`,
    minor: `${version.minor}`,
    patch: `${parseInt(version.patch) + 1}`,
    prerelease: '',
  }
}
