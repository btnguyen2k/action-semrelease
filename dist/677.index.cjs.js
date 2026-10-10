"use strict";
exports.id = 677;
exports.ids = [677];
exports.modules = {

/***/ 3677:
/***/ ((__unused_webpack___webpack_module__, __unused_webpack___webpack_exports__, __webpack_require__) => {


// EXTERNAL MODULE: ./node_modules/@actions/core/lib/core.js + 14 modules
var lib_core = __webpack_require__(3078);
// EXTERNAL MODULE: ./node_modules/@actions/github/lib/github.js + 22 modules
var lib_github = __webpack_require__(2413);
// EXTERNAL MODULE: external "node:fs"
var external_node_fs_ = __webpack_require__(3024);
;// CONCATENATED MODULE: ./src/utils.js


;



async function readFileAsLines(filename) {
  return await external_node_fs_.promises.readFile(filename, {encoding: 'utf8'})
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
async function loadCommitMessagesFromFile(commitLogsFile) {
  return await readFileAsLines(commitLogsFile || '.semrelease/this_release')
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
async function loadCommitMessagesFromRepo(octokit, filterCommits, branches, scanPath) {
  const commitMessages = []
  for (const branch of branches) {
    const params = {...filterCommits, sha: branch}
    if (scanPath) {
      params.path = scanPath
    }
    const commits = await getAllCommits(octokit, params)
    for (const commit of commits) {
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
 * @returns {{isTagMajorRelease: boolean, tagPrefix: string, changelogFile: string, isTagOnly: boolean, scanPath: string, isAutoMode: boolean, isDryRun: *, isTagMinorRelease: boolean, branches: string[]}}
 */
function getOptions() {
  const inputDryRun = 'dry-run'
  const defaultDryRun = 'false'
  const inputAutoMode = 'auto-mode'
  const defaultAutoMode = 'false'
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
  const inputChangelogFile = 'changelog-file'
  const defaultChangelogFile = ''

  return {
    isDryRun: optDryRun(),
    isAutoMode: String(lib_core/* getInput */.V4(inputAutoMode) || process.env['AUTO_MODE'] || defaultAutoMode).toLowerCase() === 'true',
    isTagMajorRelease: String(lib_core/* getInput */.V4(inputTagMajorRelease) || defaultTagMajorRelease).toLowerCase() === 'true',
    isTagMinorRelease: String(lib_core/* getInput */.V4(inputTagMinorRelease) || defaultTagMinorRelease).toLowerCase() === 'true',
    tagPrefix: String(lib_core/* getInput */.V4(inputTagPrefix) || process.env['TAG_PREFIX'] || defaultTagPrefix),
    branches: optBranches(),
    isTagOnly: String(lib_core/* getInput */.V4(inputTagOnly) || process.env['TAG_ONLY'] || defaultTagOnly).toLowerCase() === 'true',
    scanPath: String(lib_core/* getInput */.V4(inputPath) || process.env['SCAN_PATH'] || defaultPath),
    changelogFile: String(lib_core/* getInput */.V4(inputChangelogFile) || process.env['CHANGELOG_FILE'] || defaultChangelogFile),
  }

  // dry-run mode is enabled if any of the following is true:
  // - input.dry-run is set to true
  // - env.DRY_RUN is set to true
  // - file .semrelease-dry-run is present in the root of the repo
  function optDryRun() {
    const inputOrEnvDryRun = String(lib_core/* getInput */.V4(inputDryRun) || process.env['DRY_RUN'] || defaultDryRun).toLowerCase() === 'true'
    const fileDryRun = external_node_fs_.existsSync('.semrelease-dry-run')
    return inputOrEnvDryRun || fileDryRun
  }

  function optBranches() {
    const branchesStr = String(lib_core/* getInput */.V4(inputBranches) || process.env['BRANCHES'] || defaultBranches)
    const branches = branchesStr.trim().split(/[,;\s]+/)
    return branches.filter(branch => branch.trim() !== '')
  }
}

async function getReleaseOptionsFromFile(commitLogsFile) {
  const releaseOptions = {}
  await readFileAsLines(commitLogsFile || '.semrelease/this_release')
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

/*----------------------------------------------------------------------*/

async function deleteRefSilently(octokit, ref) {
  try {
    await octokit.rest.git.deleteRef({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
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
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
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
  const defaultParams = {owner: lib_github/* context */._.repo.owner, repo: lib_github/* context */._.repo.repo, page: 1, per_page: 100}
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
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
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
  const params = {owner: lib_github/* context */._.repo.owner, repo: lib_github/* context */._.repo.repo, page: 1, per_page: 100}
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
  const params = {owner: lib_github/* context */._.repo.owner, repo: lib_github/* context */._.repo.repo, page: 1, per_page: 100}
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

const reSemverInHeading = /^#+.*?[\s:-]v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)/
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

/**
 * Parses release notes from specified file.
 * @param file
 * @returns {{release_notes: string, release_version: string}|null}
 */
function parse(file) {
  const releaseNotes = []
  let enterReleaseNotes = false
  let version = null
  const data = fs.readFileSync(file, {encoding: 'utf8'}).toString()
  const lines = data.split(/\r?\n/)
  for (const line of lines) {
    const matches = line.match(reSemverInHeading)
    if (matches) {
      if (enterReleaseNotes) {
        break
      }
      enterReleaseNotes = true
      version = parseSemver(matches[1].trim())
    } else if (enterReleaseNotes) {
      releaseNotes.push(line.trim())
    }
  }
  return version !== null ?{
    release_version: version,
    release_notes: releaseNotes.join('\n').trim()
  } : null
}

const releaseNotesFilenames = (/* unused pure expression or super */ null && ([
  "RELEASE-NOTES.md", "RELEASE_NOTES.MD", "RELEASE-NOTES",
  "RELEASE_NOTES.md", "RELEASE_NOTES.MD", "RELEASE_NOTES",
  "release-notes.md", "release-notes",
  "release_notes.md", "release_notes",
]))

const changelogFilenames = (/* unused pure expression or super */ null && ([
  "CHANGELOG.md", "CHANGELOG.MD", "CHANGELOG",
  "CHANGE-LOG.md", "CHANGE-LOG.MD", "CHANGE-LOG",
  "CHANGE_LOG.md", "CHANGE_LOG.MD", "CHANGE_LOG",
  "changelog.md", "changelog",
  "change-log.md", "change-log",
  "change_log.md", "change_log",
]))

/**
 * Parses release metadata from specified change log file.
 *
 * If the specified file does not exist, the function will try to scan common release notes files.
 *
 * @param changelogFile
 * @returns {{release_notes: string, release_version: string}|null}
 */
function parseReleaseMeta(changelogFile) {
  core.warning(`⚠️ DEPRECATION WARNING`)
  core.warning(`⚠️ Parsing changelog file for release info is deprecated and will be removed in future versions.`)
  core.warning(`⚠️ Please use .senrelease/this_release file instead. See https://github.com/btnguyen2k/action-semrelease for more details.`)
  if (changelogFile && fs.existsSync(changelogFile)) {
    // changelog file is specified and exists
    return parse(changelogFile)
  }

  // scan common release notes files
  for (const file of releaseNotesFilenames) {
    if (fs.existsSync(file)) {
      const result = parse(file)
      if (!result) {
        // release notes file exists but no release info found, so skip to check changelog file
        break
      }
      // release notes file exists and release info found
      return result
    }
  }

  // scan common changelog files
  for (const file of changelogFilenames) {
    if (fs.existsSync(file)) {
      return parse(file)
    }
  }
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

;// CONCATENATED MODULE: ./src/rules.js
const reBreakingChange = /^[^a-z]*(break(ing)?\s+)?change([ds])?(\([^)]+\)\s*)?:?\s+/i
const reBreakingChange1 = /^[^a-z]*\[(break(ing)?\s+)?change([ds])?]:?\s+/i
const reBreakingChange2 = /^[^a-z]*\((break(ing)?\s+)?change([ds])?\):?\s+/i
const reBreakingUpdate = /^[^a-z]*break(ing)?(\([^)]+\)\s*)?:?\s+/i
const reBreakingUpdate1 = /^[^a-z]*\[break(ing)?]:?\s+/i
const reBreakingUpdate2 = /^[^a-z]*\(break(ing)?\):?\s+/i
const reRemoved = /^[^a-z]*rem(ov(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reRemoved1 = /^[^a-z]*\[rem(ov(e|ing|es|ed))?]:?\s+/i
const reRemoved2 = /^[^a-z]*\(rem(ov(e|ing|es|ed))?\):?\s+/i
const reRemoved3 = /^[^a-z]*.+(is|are|been)( now)? removed.*/i
const reRemoved4 = /^[^a-z]*.+no longer (available|support(s|ed)?).*/i
const reRenamed = /^[^a-z]*ren(am(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reRenamed1 = /^[^a-z]*\[ren(am(e|ing|es|ed))?]:?\s+/i
const reRenamed2 = /^[^a-z]*\(ren(am(e|ing|es|ed))?\):?\s+/i
const reReplaced = /^[^a-z]*repl(ac(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reReplaced1 = /^[^a-z]*\[repl(ac(e|ing|es|ed))?]:?\s+/i
const reReplaced2 = /^[^a-z]*\(repl(ac(e|ing|es|ed))?\):?\s+/i
const reRedesigned = /^[^a-z]*redesign(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reRedesigned1 = /^[^a-z]*\[redesign(ing|ed|s)?]:?\s+/i
const reRedesigned2 = /^[^a-z]*\(redesign(ing|ed|s)?\):?\s+/i

const reDeprecated = /^[^a-z]*depr(ecat(e|ing|ed|es))?(\([^)]+\)\s*)?:?\s+/i
const reDeprecated1 = /^[^a-z]*\[depr(ecat(e|ing|ed|es))?]:?\s+/i
const reDeprecated2 = /^[^a-z]*\(depr(ecat(e|ing|ed|es))?\):?\s+/i
const reDeprecated3 = /^[^a-z]*.+(is|are|been)( now)? deprecated.*/i
const reRefactored = /^[^a-z]*refactor(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reRefactored1 = /^[^a-z]*\[refactor(ing|ed|s)?]:?\s+/i
const reRefactored2 = /^[^a-z]*\(refactor(ing|ed|s)?\):?\s+/i
const reRefactored3 = /^[^a-z]*.+(is|are|been)( now)? refactor(ed|ing).*/i
const reAdded = /^[^a-z]*add(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reAdded1 = /^[^a-z]*\[add(ing|ed|s)?]:?\s+/i
const reAdded2 = /^[^a-z]*\(add(ing|ed|s)?\):?\s+/i
const reNewFeature = /^[^a-z]*(new\s+)?feat(ure(s)?)?(\([^)]+\)\s*)?:?\s+/i
const reNewFeature1 = /^[^a-z]*\[(new\s+)?feat(ure(s)?)?]:?\s+/i
const reNewFeature2 = /^[^a-z]*\((new\s+)?feat(ure(s)?)?\):?\s+/i

const reBugFix = /^[^a-z]*fix(ing|ed|es)?(\([^)]+\)\s*)?:?\s+/i
const reBugFix1 = /^[^a-z]*\[fix(ing|ed|es)?]:?\s+/i
const reBugFix2 = /^[^a-z]*\(fix(ing|ed|es)?\):?\s+/i
const reBugFix3 = /^[^a-z]*.+(is|are|been)( now)? fix(ed|ing).*/i
const rePatch = /^[^a-z]*patch(ing|ed|es)?(\([^)]+\)\s*)?:?\s+/i
const rePatch1 = /^[^a-z]*\[patch(ing|ed|es)?]:?\s+/i
const rePatch2 = /^[^a-z]*\(patch(ing|ed|es)?\):?\s+/i
const rePatch3 = /^[^a-z]*.+(is|are|been)( now)? patch(ed|ing).*/i
const reImprovement = /^[^a-z]*impr(ov(ing|es|ed|ement)?)?(\([^)]+\)\s*)?:?\s+/i
const reImprovement1 = /^[^a-z]*\[impr(ov(ing|es|ed|ement)?)?]:?\s+/i
const reImprovement2 = /^[^a-z]*\(impr(ov(ing|es|ed|ement)?)?\):?\s+/i
const reImprovement3 = /^[^a-z]*.+(is|are|been)( now)? improv(ed|ing).*/i
const reOptimization = /^[^a-z]*optimiz(e|ing|ation|es|ed)(\([^)]+\)\s*)?:?\s+/i
const reOptimization1 = /^[^a-z]*\[optimiz(e|ing|ation|es|ed)]:?\s+/i
const reOptimization2 = /^[^a-z]*\(optimiz(e|ing|ation|es|ed)\):?\s+/i
const reOptimization3 = /^[^a-z]*.+(is|are|been)( now)? optimiz(ed|ing).*/i
const rePerformance = /^[^a-z]*perf(ormance)?(\([^)]+\)\s*)?:?\s+/i
const rePerformance1 = /^[^a-z]*\[perf(ormance)?]:?\s+/i
const rePerformance2 = /^[^a-z]*\(perf(ormance)?\):?\s+/i
const reSecurity = /^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i
const reSecurity1 = /^[^a-z]*\[sec(urity)?]:?\s+/i
const reSecurity2 = /^[^a-z]*\(sec(urity)?\):?\s+/i
const reDependency = /^[^a-z]*dep(endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
const reDependency1 = /^[^a-z]*\[dep(endenc(y|ies))?]:?\s+/i
const reDependency2 = /^[^a-z]*\(dep(endenc(y|ies))?\):?\s+/i

const commentRules = {
  'major': [
    {label: 'breaking change', re: reBreakingChange}, // breaking changes
    {label: 'breaking change', re: reBreakingChange1}, // breaking changes
    {label: 'breaking change', re: reBreakingChange2}, // breaking changes
    {label: 'breaking change', re: reBreakingUpdate}, // other breaking updates
    {label: 'breaking change', re: reBreakingUpdate1}, // other breaking updates
    {label: 'breaking change', re: reBreakingUpdate2}, // other breaking updates
    {label: 'breaking change', re: reRemoved}, // removed features
    {label: 'breaking change', re: reRemoved1}, // removed features
    {label: 'breaking change', re: reRemoved2}, // removed features
    {label: 'breaking change', re: reRemoved3}, // removed features
    {label: 'breaking change', re: reRemoved4}, // removed features
    {label: 'breaking change', re: reRenamed}, // renamed items
    {label: 'breaking change', re: reRenamed1}, // renamed items
    {label: 'breaking change', re: reRenamed2}, // renamed items
    {label: 'breaking change', re: reReplaced}, // replaced items
    {label: 'breaking change', re: reReplaced1}, // replaced items
    {label: 'breaking change', re: reReplaced2}, // replaced items
    {label: 'breaking change', re: reRedesigned}, // redesigned functionality
    {label: 'breaking change', re: reRedesigned1}, // redesigned functionality
    {label: 'breaking change', re: reRedesigned2}, // redesigned functionality
  ],
  'minor': [
    {label: 'deprecated feature update', re: reDeprecated}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated1}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated2}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated3}, // deprecated features
    {label: 'refactoring update', re: reRefactored}, // refactoring
    {label: 'refactoring update', re: reRefactored1}, // refactoring
    {label: 'refactoring update', re: reRefactored2}, // refactoring
    {label: 'refactoring update', re: reRefactored3}, // refactoring
    {label: 'new functionality update', re: reAdded}, // added functionality
    {label: 'new functionality update', re: reAdded1}, // added functionality
    {label: 'new functionality update', re: reAdded2}, // added functionality
    {label: 'new feature update', re: reNewFeature}, // new features
    {label: 'new feature update', re: reNewFeature1}, // new features
    {label: 'new feature update', re: reNewFeature2}, // new features
  ],
  'patch': [
    {label: 'bug fix update', re: reBugFix}, // bug fixes
    {label: 'bug fix update', re: reBugFix1}, // bug fixes
    {label: 'bug fix update', re: reBugFix2}, // bug fixes
    {label: 'bug fix update', re: reBugFix3}, // bug fixes
    {label: 'patch update', re: rePatch}, // other patches
    {label: 'patch update', re: rePatch1}, // other patches
    {label: 'patch update', re: rePatch2}, // other patches
    {label: 'patch update', re: rePatch3}, // other patches
    {label: 'improvement update', re: reImprovement}, // improvements
    {label: 'improvement update', re: reImprovement1}, // improvements
    {label: 'improvement update', re: reImprovement2}, // improvements
    {label: 'improvement update', re: reImprovement3}, // improvements
    {label: 'optimization update', re: reOptimization}, // optimizations
    {label: 'optimization update', re: reOptimization1}, // optimizations
    {label: 'optimization update', re: reOptimization2}, // optimizations
    {label: 'optimization update', re: reOptimization3}, // optimizations
    {label: 'performance update', re: rePerformance}, // performance improvements
    {label: 'performance update', re: rePerformance1}, // performance improvements
    {label: 'performance update', re: rePerformance2}, // performance improvements
    {label: 'security update', re: reSecurity}, // security updates
    {label: 'security update', re: reSecurity1}, // security updates
    {label: 'security update', re: reSecurity2}, // security updates
    {label: 'dependency update', re: reDependency}, // dependency updates
    {label: 'dependency update', re: reDependency1}, // dependency updates
    {label: 'dependency update', re: reDependency2}, // dependency updates
  ],
}

const releaseNotesSections = [
  {
    title: '### Changes',
    rules: [
      reBreakingChange, reBreakingChange1, reBreakingChange2,
      reBreakingUpdate, reBreakingUpdate1, reBreakingUpdate2,
      reRenamed, reRenamed1, reRenamed2,
      reReplaced, reReplaced1, reReplaced2,
      reRedesigned, reRedesigned1, reRedesigned2
    ]
  },
  {
    title: '### Removed',
    rules: [reRemoved, reRemoved1, reRemoved2, reRemoved3, reRemoved4]
  },
  {
    title: '### Added/Refactoring/Deprecation',
    rules: [
      reDeprecated, reDeprecated1, reDeprecated2, reDeprecated3,
      reRefactored, reRefactored1, reRefactored2, reRefactored3,
      reAdded, reAdded1, reAdded2,
      reNewFeature, reNewFeature1, reNewFeature2
    ]
  },
  {
    title: '### Fixed/Improvements',
    rules: [
      reBugFix, reBugFix1, reBugFix2, reBugFix3,
      rePatch, rePatch1, rePatch2, rePatch3,
      reImprovement, reImprovement1, reImprovement2, reImprovement3,
      reOptimization, reOptimization1, reOptimization2, reOptimization3,
      rePerformance, rePerformance1, rePerformance2
    ]
  },
  {
    title: '### Security',
    rules: [reSecurity, reSecurity1, reSecurity2]
  },
  {
    title: '### Others',
    rules: [reDependency, reDependency1, reDependency2]
  }
]



/**
 * Parse commit messages and call callback functions when a rule is matched.
 * @param commitMessages
 * @param callbackBumpMajor
 * @param callbackBumpMinor
 * @param callbackBumpPatch
 */
function parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch) {
  for (const msg of commitMessages) {
    let rule = commentRules.major.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpMajor(rule, msg)
    }

    rule = commentRules.minor.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpMinor(rule, msg)
    }

    rule = commentRules.patch.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpPatch(rule, msg)
    }
  }
}

/**
 * Generate release notes text from commit messages.
 * @param commitMessages
 * @returns {string}
 */
function generateReleaseNotes(commitMessages) {
  const sections = releaseNotesSections.map(section => {
    const messages = commitMessages.filter(message => {
      return section.rules.some(rule => rule.test(message))
    }).map(message => '- ' + message.charAt(0).toUpperCase() + message.slice(1)) // capitalize the first letter && create bullet points

    return {title: section.title, messages}
  })

  const releaseNotes = sections.map(section => {
    if (section.messages.length > 0) {
      return `${section.title}\n\n${section.messages.join('\n')}\n\n`
    }
  }).join('')

  return releaseNotes.trim()
}

;// CONCATENATED MODULE: ./src/app.js





const inputGithubToken = 'github-token'
const outputResultSkipped = 'SKIPPED'
const outputResultSuccess = 'SUCCESS'

async function createTag(octokit, tagName, dryRun) {
  lib_core/* info */.pq(`🕘 Creating tag ${tagName}...`)
  const createTagParams = {
    owner: lib_github/* context */._.repo.owner,
    repo: lib_github/* context */._.repo.repo,
    tag: tagName,
    message: `Release ${tagName}`,
    object: lib_github/* context */._.sha,
    type: 'commit',
  }
  if (dryRun) {
    lib_core/* info */.pq(`♻️ [DRY-RUN], creating tag: ${JSON.stringify(createTagParams, null, 2)}`)
  } else {
    const {data: tagInfo} = await octokit.rest.git.createTag(createTagParams)
    lib_core/* info */.pq(`✅ Tag created: ${JSON.stringify(tagInfo, null, 2)}`)

    const refFull = `refs/tags/${tagName}`
    const refShort = `tags/${tagName}`
    lib_core/* info */.pq(`🕘 Cleaning ${refFull}...`)
    await deleteRefSilently(octokit, refShort)
    const createRefParams = {
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      ref: refFull,
      sha: tagInfo.sha,
    }
    lib_core/* info */.pq(`🕘 Creating ${refFull}...`)
    const {data: refInfo} = await octokit.rest.git.createRef(createRefParams)
    lib_core/* info */.pq(`✅ Ref created: ${JSON.stringify(refInfo, null, 2)}`)
  }
}

async function createRelease(octokit, tagName, releaseNotes, isPrerelease, dryRun) {
  lib_core/* info */.pq(`🕘 Creating release ${tagName}...`)
  const createReleaseParams = {
    owner: lib_github/* context */._.repo.owner,
    repo: lib_github/* context */._.repo.repo,
    tag_name: tagName,
    name: isPrerelease ? `Pre-release ${tagName}` : `Release ${tagName}`,
    body: releaseNotes.release_notes,
    prerelease: isPrerelease,
  }
  if (dryRun) {
    lib_core/* info */.pq(`♻️ [DRY-RUN], creating release: ${JSON.stringify(createReleaseParams, null, 2)}`)
  } else {
    const {data: releaseInfo} = await octokit.rest.repos.createRelease(createReleaseParams)
    lib_core/* info */.pq(`✅ Release created: ${JSON.stringify(releaseInfo, null, 2)}`)
  }
}

async function computeReleaseMeta(octokit, options) {
  let lastVersion = parseSemver('0.0.0')
  const filterCommits = {}
  const latestRelease = await findLatestRelease(octokit, options.tagPrefix)
  if (latestRelease) {
    // first, check if there is a release for the tag-prefix
    lastVersion = parseSemver(latestRelease.tag_name.slice(options.tagPrefix.length))
    filterCommits.since = latestRelease.created_at
    lib_core/* info */.pq(`ℹ️ Found latest release <${latestRelease.tag_name}> (tag ${latestRelease.tag_name}) at <${latestRelease.created_at}>`)
  } else {
    // if no release found for the tag-prefix, check if there is a tag that matches the tag-prefix
    lib_core/* info */.pq(`⚠️ No release found for tag-prefix <${options.tagPrefix}>, checking tags...`)
    const latestTag = await findLatestTag(octokit, options.tagPrefix)
    if (latestTag) {
      lastVersion = parseSemver(latestTag.name.slice(options.tagPrefix.length))
      const commit = await getCommit(octokit, latestTag.commit.sha)
      filterCommits.since = commit.committer.date
      lib_core/* info */.pq(`ℹ️ Found latest tag <${latestTag.name}> at <${commit.committer.date}>`)
    } else {
      // nothing found
      lib_core/* info */.pq(`ℹ️ No release/tag found for tag-prefix <${options.tagPrefix}>`)
    }
  }

  const commitLogsFile = '.semrelease/this_release'

  // firstly, try to load commit messages from .semrelease/this_release
  lib_core/* info */.pq(`ℹ️ Try loading commit messages from file ${commitLogsFile}...`)
  let commitMessages = await loadCommitMessagesFromFile(commitLogsFile)
  if (!commitMessages || commitMessages.length === 0) {
    // if the file does not exist or no commit messages found, load commit messages from GitHub repo
    lib_core/* info */.pq(`ℹ️ File ${commitLogsFile} does not exist or no commit messages found, loading commit messages from repo...`)
    lib_core/* info */.pq(`🕘 Fetching commits from branch <${options.branches}>...`)
    commitMessages = await loadCommitMessagesFromRepo(octokit, filterCommits, options.branches, options.scanPath)
  }

  const msgsBumpMajor = []
  const msgsBumpMinor = []
  const msgsBumpPatch = []
  // secondly, parse commit messages to detect changes/updates
  parseCommitMessages(commitMessages, (rule, msg) => {
    lib_core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMajor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    lib_core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMinor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    lib_core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpPatch.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  })

  if (msgsBumpMajor.length+msgsBumpMinor.length+msgsBumpPatch.length === 0) {
    lib_core/* info */.pq(`📣 No changes/updates detected.`)
    return {
      release_version: lastVersion,
      release_notes: '',
    }
  }

  const releaseOptions = await getReleaseOptionsFromFile(commitLogsFile)
  lib_core/* info */.pq(`ℹ️ releaseOptions: ${JSON.stringify(releaseOptions, null, 2)}`)
  if (releaseOptions.releaseVersion) {
    lib_core/* info */.pq(`✴️ Release version forced to ${releaseOptions.releaseVersion}.`)
    const version = parseSemver(releaseOptions.releaseVersion)
    if (version) {
      return {
        release_version: version,
        release_notes: generateReleaseNotes(commitMessages),
      }
    }
    throw new Error(`Invalid version number: ${releaseOptions.releaseVersion}`)
  }

  const version = msgsBumpMajor.length > 0
    ? incMajorSemver(lastVersion)
    : msgsBumpMinor.length > 0
      ? incMinorSemver(lastVersion)
      : incPatchSemver(lastVersion)
  if (parseInt(version.major) > parseInt(lastVersion.major)) {
    lib_core/* info */.pq(`📣 Breaking changes detected, releasing new MAJOR version...`)
  } else if (parseInt(version.minor) > parseInt(lastVersion.minor)) {
    lib_core/* info */.pq(`📣 New functionality updates detected, releasing new MINOR version...`)
  } else {
    lib_core/* info */.pq(`📣 Bug fix/patch/improvement updates detected, releasing new PATCH version...`)
  }
  return {
    release_version: version,
    release_notes: generateReleaseNotes(commitMessages),
  }
}

async function semrelease() {
  const RESULT_SKIPPED = {
    result: outputResultSkipped,
    releaseVersion: '',
    releaseNotes: '',
  }

  // build GitHub client
  const githubToken = lib_core/* getInput */.V4(inputGithubToken) || process.env['GITHUB_TOKEN']
  if (!githubToken) {
    throw new Error('github-token is required')
  }
  const octokit = lib_github/* getOctokit */.Q(githubToken)

  // fetch options
  const options = getOptions()
  lib_core/* info */.pq(`ℹ️ options: ${JSON.stringify(options, null, 2)}`)

  if (options.isAutoMode || options.changelogFile) {
    lib_core/* warning */.$e(`⚠️ DEPRECATION WARNING`)
    lib_core/* warning */.$e(`⚠️ auto-mode and changelog-file inputs are deprecated and will be removed in future versions.`)
    lib_core/* warning */.$e(`⚠️ See https://github.com/btnguyen2k/action-semrelease for more details.`)
  }

  // fetch release info
  // v3.4.0: auto-mode is now deprecated
  const releaseMeta = await computeReleaseMeta(octokit, options)
  // const releaseMeta = options.isAutoMode
  //   ? await computeReleaseMeta(octokit, options)
  //   : utils.parseReleaseMeta(options.changelogFile)
  if (!releaseMeta || releaseMeta.release_version === '' || releaseMeta.release_notes === '') {
    lib_core/* info */.pq(`⚠️ No release info found, or release notes are empty, skipped.`)
    RESULT_SKIPPED.reason = 'No release info found, or release notes are empty.'
    return RESULT_SKIPPED
  }

  lib_core/* info */.pq(`ℹ️ Release version: ${releaseMeta.release_version.semver}`)
  const tagName = `${options.tagPrefix}${releaseMeta.release_version.semver}`
  if (await getReleaseByTag(octokit, tagName)) {
    lib_core/* info */.pq(`⚠️ Release ${tagName} already exists, skipped.`)
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
  lib_core/* info */.pq(`ℹ️ Release notes:\n${releaseMeta.release_notes}`)
  if (!options.isTagOnly) {
    await createRelease(octokit, tagName, releaseMeta, isPrerelease, options.isDryRun)
  } else {
    lib_core/* info */.pq(`⚠️ Tag-only mode enabled, skipped creating release.`)
  }

  return {
    result: outputResultSuccess,
    releaseVersion: releaseMeta.release_version.semver,
    releaseNotes: releaseMeta.release_notes,
  }
}



;// CONCATENATED MODULE: ./src/index.js



async function run() {
  const {result, releaseVersion, releaseNotes} = await semrelease()
  lib_core/* setOutput */.uH('result', result)
  lib_core/* setOutput */.uH('releaseVersion', releaseVersion)
  lib_core/* setOutput */.uH('releaseNotes', releaseNotes)
}

run().then(() => console.log(`✅ DONE.`)).catch(e => {
  console.log(`❌ ${e}`)
  lib_core/* setOutput */.uH('result', 'FAILED')
  lib_core/* setFailed */.C1(`❌ ${e.message}`)
})


/***/ })

};
;
//# sourceMappingURL=677.index.cjs.js.map