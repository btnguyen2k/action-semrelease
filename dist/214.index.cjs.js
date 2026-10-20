"use strict";
exports.id = 214;
exports.ids = [214];
exports.modules = {

/***/ 2214:
/***/ ((__unused_webpack___webpack_module__, __unused_webpack___webpack_exports__, __webpack_require__) => {


// EXTERNAL MODULE: ./node_modules/@actions/core/lib/core.js + 14 modules
var core = __webpack_require__(3078);
// EXTERNAL MODULE: ./node_modules/@actions/github/lib/github.js + 22 modules
var lib_github = __webpack_require__(2413);
// EXTERNAL MODULE: external "node:fs"
var external_node_fs_ = __webpack_require__(3024);
;// CONCATENATED MODULE: ./src/github-read.js


const networkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])

async function github_read_readGithub(operation, request) {
  let waited = 0
  for (let attempt = 1; ; attempt++) {
    try {
      return await request()
    } catch (error) {
      const headers = error.response?.headers || {}
      const retryAfter = headers['retry-after']
      const reset = headers['x-ratelimit-reset']
      const rateLimited = error.status === 429 || error.status === 403 && (
        retryAfter !== undefined || String(headers['x-ratelimit-remaining']) === '0'
        || /secondary rate limit/i.test(error.message)
      )
      const transient = rateLimited || [500, 502, 503, 504].includes(error.status)
        || networkCodes.has(error.code) || networkCodes.has(error.cause?.code)
      if (!transient) throw error

      let delay = 1000 * 2 ** (attempt - 1)
      if (rateLimited) delay = Math.max(delay, 60000)
      if (retryAfter !== undefined) {
        const seconds = Number(retryAfter)
        const until = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
        if (Number.isFinite(until)) delay = Math.max(1000 * 2 ** (attempt - 1), until)
      }
      if (String(headers['x-ratelimit-remaining']) === '0' && reset !== undefined) {
        const until = Number(reset) * 1000 - Date.now() + 1000
        if (Number.isFinite(until)) delay = Math.max(delay, until)
      }
      if (attempt >= 3 || waited + delay > 120000) {
        core/* warning */.$e(`GitHub read ${operation} failed: retry limit or 120-second wait budget reached. No further retry will be attempted.`)
        throw error
      }
      core/* warning */.$e(`GitHub read ${operation} failed transiently; retry ${attempt}/2 in ${delay}ms.`)
      await new Promise(resolve => setTimeout(resolve, delay))
      waited += delay
    }
  }
}

// EXTERNAL MODULE: external "node:crypto"
var external_node_crypto_ = __webpack_require__(7598);
// EXTERNAL MODULE: external "node:fs/promises"
var promises_ = __webpack_require__(1455);
// EXTERNAL MODULE: external "node:os"
var external_node_os_ = __webpack_require__(8161);
// EXTERNAL MODULE: external "node:path"
var external_node_path_ = __webpack_require__(6760);
// EXTERNAL MODULE: external "node:stream"
var external_node_stream_ = __webpack_require__(7075);
// EXTERNAL MODULE: external "node:stream/promises"
var external_node_stream_promises_ = __webpack_require__(6466);
;// CONCATENATED MODULE: ./src/artifacts.js











const maxFileSize = 2 * 1024 ** 3
const maxTotalSize = 10 * 1024 ** 3

function getArtifactOptions(isTagOnly) {
  if (isTagOnly) return {artifactIds: [], artifactRunId: ''}
  const rawIds = core/* getInput */.V4('artifact-ids').split(/[,;\s]+/).filter(Boolean)
  const rawRun = core/* getInput */.V4('artifact-run-id')
  if (rawIds.length === 0) return {artifactIds: [], artifactRunId: ''}
  const artifactIds = [...new Set(rawIds.map(id => parseId(id, 'artifact-ids')))]
  const artifactRunId = parseId(rawRun || String(lib_github/* context */._.runId || ''), 'artifact-run-id')
  return {artifactIds, artifactRunId}
}

function parseId(value, input) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${input} must contain positive safe integer IDs; received ${JSON.stringify(value)}`)
  }
  return Number(value)
}

async function prepareArtifacts(octokit, {artifactIds, artifactRunId, targetSha}) {
  if (artifactIds.length === 0) return {assets: [], cleanup: async() => {}}
  const repo = lib_github/* context */._.repo
  const {data: run} = await github_read_readGithub(`artifact run ${artifactRunId}`, () =>
    octokit.rest.actions.getWorkflowRun({...repo, run_id: artifactRunId}))
  if (run.id !== artifactRunId
    || run.repository?.full_name?.toLowerCase() !== `${repo.owner}/${repo.repo}`.toLowerCase()
    || run.head_repository?.id !== run.repository?.id || !run.repository?.id) {
    throw new Error(`Artifact run ${artifactRunId} must originate from the current repository, not a fork`)
  }
  if (run.head_sha !== targetSha) {
    throw new Error(`Artifact run ${artifactRunId} commit ${run.head_sha} does not match release target ${targetSha}`)
  }
  if (artifactRunId !== lib_github/* context */._.runId && (run.status !== 'completed' || run.conclusion !== 'success')) {
    throw new Error(`Artifact run ${artifactRunId} must have completed successfully`)
  }

  const artifacts = []
  const names = new Set()
  let totalSize = 0
  for (const id of artifactIds) {
    const {data: artifact} = await github_read_readGithub(`artifact ${id}`, () =>
      octokit.rest.actions.getArtifact({...repo, artifact_id: id}))
    if (artifact.id !== id || artifact.workflow_run?.id !== artifactRunId
      || artifact.workflow_run?.repository_id !== run.repository.id
      || artifact.workflow_run?.head_repository_id !== run.repository.id
      || artifact.workflow_run?.head_sha !== targetSha) {
      throw new Error(`Artifact ${id} does not belong to the expected repository, run and target commit`)
    }
    if (artifact.expired || Date.parse(artifact.expires_at) <= Date.now()) {
      throw new Error(`Artifact ${id} has expired`)
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(artifact.digest || '')) {
      throw new Error(`Artifact ${id} has no supported SHA-256 digest; upload it with a current upload-artifact action`)
    }
    const name = artifact.name
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name) || name.endsWith('.')) {
      throw new Error(`Artifact ${id} has an unsupported release filename: ${name}`)
    }
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate release asset filename: ${name}`)
    if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0) {
      throw new Error(`Artifact ${id} has an invalid size`)
    }
    if (artifact.size_in_bytes >= maxFileSize) throw new Error(`Release asset ${name} must be smaller than 2 GiB`)
    totalSize += artifact.size_in_bytes
    if (totalSize > maxTotalSize) throw new Error('Release assets exceed 10 GiB in total')
    names.add(name.toLowerCase())
    artifacts.push(artifact)
  }

  const directory = await (0,promises_.mkdtemp)(external_node_path_.join((0,external_node_os_.tmpdir)(), 'semrelease-artifacts-'))
  const cleanup = () => (0,promises_.rm)(directory, {recursive: true, force: true})
  const assets = []
  try {
    for (const artifact of artifacts) {
      const filename = external_node_path_.join(directory, String(artifact.id))
      const size = await github_read_readGithub(`download artifact ${artifact.id}`, async() => {
        const {data} = await octokit.rest.actions.downloadArtifact({
          ...repo, artifact_id: artifact.id, archive_format: 'zip',
          request: {parseSuccessResponseBody: false, signal: AbortSignal.timeout(300000)},
        })
        const hash = (0,external_node_crypto_.createHash)('sha256')
        let downloaded = 0
        await (0,external_node_stream_promises_.pipeline)(data, new external_node_stream_.Transform({
          transform(chunk, encoding, callback) {
            downloaded += chunk.length
            if (downloaded > artifact.size_in_bytes) return callback(new Error(`Artifact ${artifact.id} exceeds its declared size`))
            hash.update(chunk)
            callback(null, chunk)
          },
        }), (0,external_node_fs_.createWriteStream)(filename))
        if (downloaded !== artifact.size_in_bytes) throw new Error(`Artifact ${artifact.id} size mismatch`)
        if (`sha256:${hash.digest('hex')}` !== artifact.digest.toLowerCase()) {
          throw new Error(`Artifact ${artifact.id} SHA-256 digest mismatch`)
        }
        return downloaded
      })
      assets.push({name: artifact.name, filename, size})
    }
    assets.sort((a, b) => a.name < b.name ? -1 : 1)
    return {assets, cleanup}
  } catch (error) {
    await cleanup()
    throw error
  }
}

async function uploadArtifactAsset(octokit, release, asset) {
  const data = (0,external_node_fs_.createReadStream)(asset.filename)
  try {
    const {data: uploaded} = await octokit.rest.repos.uploadReleaseAsset({
      url: release.upload_url,
      name: asset.name,
      headers: {'content-type': 'application/octet-stream', 'content-length': asset.size},
      data,
      request: {signal: AbortSignal.timeout(300000)},
    })
    if (uploaded.state !== 'uploaded' || uploaded.name !== asset.name || uploaded.size !== asset.size) {
      throw new Error(`Release asset ${asset.name} upload response does not match the expected file`)
    }
    core/* info */.pq(`Uploaded release asset ${asset.name} (${asset.size} bytes)`)
  } finally {
    data.destroy()
  }
}

;// CONCATENATED MODULE: ./src/utils.js


;





const reCommitMessagePrefix = /^[\s=+-]*/

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
 * @param lines
 * @param {(message: string) => void} [onMessage] Receives entries before trailing whitespace is trimmed.
 * @returns {Promise<string[]|null>}
 */
async function loadCommitMessagesFromFile(commitLogsFile, lines, onMessage) {
  return await (lines === undefined ? readFileAsLines(commitLogsFile || '.semrelease/this_release') : Promise.resolve(lines))
    .then(commitLogs => commitLogs ? commitLogs
      // Strip metadata bullets before validation, but preserve summary whitespace.
      .map(line => line.replace(reCommitMessagePrefix, ''))
      .filter(line => line.trim() !== '' && !line.startsWith('#'))
      .map(line => {
        onMessage?.(line)
        return line.trim()
      }) : null)
}

/**
 * Loads commit messages from the GitHub repository.
 * @param octokit
 * @param filterCommits
 * @param branches
 * @param scanPath
 * @returns {Promise<string[]>}
 */
async function resolveBranchTips(octokit, branches) {
  if (branches.length === 0) throw new Error('At least one branch is required')
  const tips = []
  for (const branch of new Set(branches)) {
    try {
      const {data: tip} = await github_read_readGithub(`resolve branch ${branch}`, () => octokit.rest.repos.getCommit({
        owner: lib_github/* context */._.repo.owner,
        repo: lib_github/* context */._.repo.repo,
        ref: branch,
      }))
      tips.push(tip.sha)
    } catch (error) {
      if (error.status !== 404 && error.status !== 422) throw error
      core/* warning */.$e(`Branch ${branch} does not exist (HTTP ${error.status}); skipping it.`)
    }
  }
  if (tips.length === 0) throw new Error('None of the configured branches exist')
  return tips
}

async function validateReleaseBranches(octokit, branches, targetSha) {
  const tips = await resolveBranchTips(octokit, branches)
  for (const sha of tips) {
    if (sha === targetSha) return tips
    const {data: comparison} = await github_read_readGithub(`compare ${targetSha} to ${sha}`, () => octokit.rest.repos.compareCommits({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      base: targetSha,
      head: sha,
    }))
    if (comparison.status === 'ahead' || comparison.status === 'identical') return tips
  }
  throw new Error(`Target commit ${targetSha} is not reachable from any configured branch`)
}

async function loadCommitMessagesFromRepo(octokit, filterCommits, branches, scanPath, targetSha, branchTips, onMessage) {
  const commitMessages = []
  const tips = targetSha ? branchTips ?? await resolveBranchTips(octokit, branches) : branches
  let reachable
  if (targetSha) {
    const params = {...filterCommits, sha: targetSha}
    if (scanPath) params.path = scanPath
    reachable = new Set((await getAllCommits(octokit, params)).map(commit => commit.sha))
  }
  for (const sha of tips) {
    const params = {...filterCommits, sha}
    if (scanPath) {
      params.path = scanPath
    }
    const commits = await getAllCommits(octokit, params)
    for (const commit of commits) {
      if (reachable && !reachable.has(commit.sha)) continue
      commitMessages.push(commit.commit.message)
    }
  }

  const messages = [...new Set(commitMessages)].map(message => {
    onMessage?.(message)
    return message.replace(reCommitMessagePrefix, '').trim()
  })
  return [...new Set(messages.filter(message => message !== ''))]
}

/**
 * Convenience function to construct Option struct from inputs and environment variables.
 * @returns {{isTagMajorRelease: boolean, tagPrefix: string, targetSha: string, isTagOnly: boolean, artifactIds: number[], artifactRunId: number|string, scanPath: string, isDryRun: *, isTagMinorRelease: boolean, branches: string[], styleCheck: boolean}}
 */
function getOptions() {
  const inputDryRun = 'dry-run'
  const defaultDryRun = 'false'
  const inputTagMajorRelease = 'tag-major-release'
  const defaultTagMajorRelease = 'false'
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

  const isTagOnly = String(core/* getInput */.V4(inputTagOnly) || process.env['TAG_ONLY'] || defaultTagOnly).toLowerCase() === 'true'
  return {
    isDryRun: optDryRun(),
    styleCheck: optStyleCheck(),
    targetSha: core/* getInput */.V4('target-sha') || lib_github/* context */._.sha,
    isTagMajorRelease: String(core/* getInput */.V4(inputTagMajorRelease) || defaultTagMajorRelease).toLowerCase() === 'true',
    isTagMinorRelease: String(core/* getInput */.V4(inputTagMinorRelease) || defaultTagMinorRelease).toLowerCase() === 'true',
    tagPrefix: String(core/* getInput */.V4(inputTagPrefix) || process.env['TAG_PREFIX'] || defaultTagPrefix),
    branches: optBranches(),
    isTagOnly,
    ...getArtifactOptions(isTagOnly),
    scanPath: String(core/* getInput */.V4(inputPath) || process.env['SCAN_PATH'] || defaultPath),
  }

  // dry-run mode is enabled if any of the following is true:
  // - input.dry-run is set to true
  // - env.DRY_RUN is set to true
  // - file .semrelease-dry-run is present in the root of the repo
  function optDryRun() {
    const inputOrEnvDryRun = String(core/* getInput */.V4(inputDryRun) || process.env['DRY_RUN'] || defaultDryRun).toLowerCase() === 'true'
    const fileDryRun = external_node_fs_.existsSync('.semrelease-dry-run')
    return inputOrEnvDryRun || fileDryRun
  }

  function optBranches() {
    const branchesStr = String(core/* getInput */.V4(inputBranches) || process.env['BRANCHES'] || defaultBranches)
    const branches = branchesStr.trim().split(/[,;\s]+/)
    return branches.filter(branch => branch.trim() !== '')
  }

  function optStyleCheck() {
    const value = String(core/* getInput */.V4('style-check') || 'false').trim().toLowerCase()
    if (value !== 'true' && value !== 'false') {
      throw new Error('style-check must be true or false')
    }
    return value === 'true'
  }
}

async function getReleaseOptionsFromFile(commitLogsFile, lines) {
  const filename = commitLogsFile || '.semrelease/this_release'
  const commitLogs = lines === undefined ? await readFileAsLines(filename) : lines
  const directives = (commitLogs || [])
    .map((text, index) => ({text: text.trim(), line: index + 1}))
    .filter(({text}) => /^#!VERSION\b/i.test(text))
  if (directives.length > 1) {
    throw new Error(`Multiple version directives in ${filename} at lines ${directives.map(({line}) => line).join(', ')}; only one is allowed`)
  }
  if (directives.length === 0) return {}
  const {text, line} = directives[0]
  const match = text.match(/^#!VERSION\s*=\s*([^=]+)$/i)
  if (!match || !match[1].trim()) {
    throw new Error(`Malformed version directive in ${filename} at line ${line}; expected #!VERSION=<version>`)
  }
  const releaseVersion = match[1].trim()
  try {
    normalizeReleaseVersion(releaseVersion)
  } catch (error) {
    throw new Error(`Invalid version number in ${filename} at line ${line}: ${releaseVersion}`, {cause: error})
  }
  return {releaseVersion}
}

async function readReleaseLinesAtCommit(octokit, targetSha) {
  try {
    const {data: file} = await github_read_readGithub(`release metadata at ${targetSha}`, () => octokit.rest.repos.getContent({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      path: '.semrelease/this_release',
      ref: targetSha,
    }))
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
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      ref,
    })
  } catch (error) {
    if (error.status === 404) return
    if (error.status === 422 && !await getRefByTagName(octokit, ref.replace(/^tags\//, ''))) return
    throw error
  }
}

async function getAllBranches(octokit, overrideParams) {
  const defaultParams = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
  const params = overrideParams ? {...defaultParams, ...overrideParams} : defaultParams
  const branches = []
  for (;;) {
    const {data: page} = await readGithub(`branches page ${params.page}`, () => octokit.rest.repos.listBranches(params))
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
    const {data: commitInfo} = await github_read_readGithub(`commit ${sha}`, () => octokit.rest.git.getCommit({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      commit_sha: sha,
    }))
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
      const {data: page} = await github_read_readGithub(`commits ${params.sha || 'default branch'} page ${params.page}`, () => octokit.rest.repos.listCommits(params))
      commits.push(...page)
      if (page.length < params.per_page) {
        break
      }
      params.page++
    }
  } catch (error) {
    if (params.page > 1) throw error
    if (error.status !== 404) {
      throw error
    }
  }
  return commits
}

async function getReleaseByTag(octokit, tagName) {
  try {
    const {data: releaseInfo} = await github_read_readGithub(`release ${tagName}`, () => octokit.rest.repos.getReleaseByTag({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      tag: tagName,
    }))
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
      const {data: page} = await github_read_readGithub(`releases page ${params.page}`, () => octokit.rest.repos.listReleases(params))
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
    if (params.page > 1) throw error
    if (error.status !== 404) {
      throw error
    }
  }
  return null
}

async function getRefByTagName(octokit, tagName) {
  try {
    const {data: refInfo} = await github_read_readGithub(`tag reference ${tagName}`, () => octokit.rest.git.getRef({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      ref: `tags/${tagName}`
    }))
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
      const {data: page} = await github_read_readGithub(`tags page ${params.page}`, () => octokit.rest.repos.listTags(params))
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
    if (params.page > 1) throw error
    if (error.status !== 404) {
      throw error
    }
  }
  return null
}

async function getTag(octokit, sha) {
  try {
    const {data: tagInfo} = await github_read_readGithub(`tag object ${sha}`, () => octokit.rest.git.getTag({
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      tag_sha: sha,
    }))
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

;// CONCATENATED MODULE: ./src/rules.js
const reCommitPrefix = /^([a-z][a-z0-9-]*(?: [a-z][a-z0-9-]*)*)(?:\(([^()\r\n]+)\))?:(\s*)/i
const reLineBreak = /\r\n?|\n/

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
const reDependency = /^[^a-z]*dep(s|endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
const reDependency1 = /^[^a-z]*\[dep(s|endenc(y|ies))?]:?\s+/i
const reDependency2 = /^[^a-z]*\(dep(s|endenc(y|ies))?\):?\s+/i
const reRevert = /^[^a-z]*revert(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reRevert1 = /^[^a-z]*\[revert(ing|ed|s)?]:?\s+/i
const reRevert2 = /^[^a-z]*\(revert(ing|ed|s)?\):?\s+/i
const reRevert3 = /^[^a-z]*.+(is|are|been)( now)? revert(ed|ing).*/i

const commitTypeRules = [
  reBreakingChange, reBreakingUpdate, reRemoved, reRenamed, reReplaced, reRedesigned,
  reDeprecated, reRefactored, reAdded, reNewFeature,
  reBugFix, rePatch, reImprovement, reOptimization, rePerformance, reSecurity, reDependency, reRevert
]

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
    {label: 'revert update', re: reRevert},
    {label: 'revert update', re: reRevert1},
    {label: 'revert update', re: reRevert2},
    {label: 'revert update', re: reRevert3},
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
      rePerformance, rePerformance1, rePerformance2,
      reRevert, reRevert1, reRevert2, reRevert3
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



function getRuleMessage(message) {
  const match = message.match(reCommitPrefix)
  // Typed headers classify by type, never by words in their scope or summary.
  return match ? `${match[1]}:${match[3]}` : message
}

/**
 * Check only the first-line summary of a recognized typed header.
 * @param {string} message
 * @returns {string[]}
 */
function checkCommitMessageStyle(message) {
  const header = message.split(reLineBreak, 1)[0]
  const match = header.match(reCommitPrefix)
  if (!match) return []
  if (match[2] !== undefined && (match[2].trim() === '' || match[2] !== match[2].trim())) {
    return []
  }
  const typePrefix = `${match[1]}: `
  if (!commitTypeRules.some(rule => rule.exec(typePrefix)?.[0] === typePrefix)) return []

  const summary = (match[3] + header.slice(match[0].length)).replace(/^ /, '')
  const trimmed = summary.trim()
  const issues = []
  if (trimmed === '') issues.push('summary must not be empty')
  if (summary !== trimmed) issues.push('summary must not have surrounding whitespace')
  if (/^[\p{Lu}\p{Lt}]/u.test(trimmed)) issues.push('summary must not start with a capital letter')
  if (trimmed.endsWith('.')) issues.push('summary must not end with a period')
  return issues
}

/**
 * Parse commit messages and call callback functions when a rule is matched.
 * @param commitMessages
 * @param callbackBumpMajor
 * @param callbackBumpMinor
 * @param callbackBumpPatch
 */
function parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch) {
  for (const msg of commitMessages) {
    const ruleMessage = getRuleMessage(msg)
    let rule = commentRules.major.find(rule => rule.re.test(ruleMessage))
    if (rule) {
      callbackBumpMajor(rule, msg)
    }

    rule = commentRules.minor.find(rule => rule.re.test(ruleMessage))
    if (rule) {
      callbackBumpMinor(rule, msg)
    }

    rule = commentRules.patch.find(rule => rule.re.test(ruleMessage))
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
      const ruleMessage = getRuleMessage(message)
      return section.rules.some(rule => rule.test(ruleMessage))
    }).map(message => '- ' + message.charAt(0).toUpperCase() + message.slice(1)).sort()

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

async function verifyReleaseTag(octokit, tagName, targetSha) {
  const existing = await resolveTagCommit(octokit, tagName)
  if (existing && existing !== targetSha) {
    throw new Error(`Refusing to move release tag ${tagName}: it points to ${existing}, expected ${targetSha}`)
  }
  return existing
}

async function createTag(octokit, tagName, targetSha, dryRun, movable = false) {
  if (!movable && await verifyReleaseTag(octokit, tagName, targetSha)) {
    core/* info */.pq(`Release tag ${tagName} already points to ${targetSha}; reusing it.`)
    return
  }
  core/* info */.pq(`🕘 Creating tag ${tagName}...`)
  const createTagParams = {
    owner: lib_github/* context */._.repo.owner,
    repo: lib_github/* context */._.repo.repo,
    tag: tagName,
    message: `Release ${tagName}`,
    object: targetSha,
    type: 'commit',
  }
  if (dryRun) {
    core/* info */.pq(`♻️ [DRY-RUN], creating tag: ${JSON.stringify(createTagParams, null, 2)}`)
  } else {
    const {data: tagInfo} = await octokit.rest.git.createTag(createTagParams)
    core/* info */.pq(`✅ Tag created: ${JSON.stringify(tagInfo, null, 2)}`)

    const refFull = `refs/tags/${tagName}`
    const refShort = `tags/${tagName}`
    core/* info */.pq(`🕘 Cleaning ${refFull}...`)
    if (movable) await deleteRefSilently(octokit, refShort)
    const createRefParams = {
      owner: lib_github/* context */._.repo.owner,
      repo: lib_github/* context */._.repo.repo,
      ref: refFull,
      sha: tagInfo.sha,
    }
    core/* info */.pq(`🕘 Creating ${refFull}...`)
    try {
      const {data: refInfo} = await octokit.rest.git.createRef(createRefParams)
      core/* info */.pq(`✅ Ref created: ${JSON.stringify(refInfo, null, 2)}`)
    } catch (error) {
      if (movable || error.status !== 422) throw error
      if (!await verifyReleaseTag(octokit, tagName, targetSha)) throw error
      core/* info */.pq(`Release tag ${tagName} concurrently created at ${targetSha}; reusing it.`)
    }
  }
}

async function createRelease(octokit, tagName, releaseNotes, isPrerelease, dryRun) {
  core/* info */.pq(`🕘 Creating release ${tagName}...`)
  const createReleaseParams = {
    owner: lib_github/* context */._.repo.owner,
    repo: lib_github/* context */._.repo.repo,
    tag_name: tagName,
    name: isPrerelease ? `Pre-release ${tagName}` : `Release ${tagName}`,
    body: releaseNotes.release_notes,
    prerelease: isPrerelease,
  }
  if (dryRun) {
    core/* info */.pq(`♻️ [DRY-RUN], creating release: ${JSON.stringify(createReleaseParams, null, 2)}`)
  } else {
    const {data: releaseInfo} = await octokit.rest.repos.createRelease(createReleaseParams)
    core/* info */.pq(`✅ Release created: ${JSON.stringify(releaseInfo, null, 2)}`)
    return releaseInfo
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
    core/* info */.pq(`ℹ️ Found latest release <${latestRelease.tag_name}> (tag ${latestRelease.tag_name}) at <${latestRelease.created_at}>`)
  } else {
    // if no release found for the tag-prefix, check if there is a tag that matches the tag-prefix
    core/* info */.pq(`⚠️ No release found for tag-prefix <${options.tagPrefix}>, checking tags...`)
    const latestTag = await findLatestTag(octokit, options.tagPrefix)
    if (latestTag) {
      lastVersion = parseSemver(latestTag.name.slice(options.tagPrefix.length))
      const commit = await getCommit(octokit, latestTag.commit.sha)
      if (!commit) {
        throw new Error(`Baseline commit ${latestTag.commit.sha} for tag ${latestTag.name} does not exist in this repository`)
      }
      filterCommits.since = commit.committer.date
      core/* info */.pq(`ℹ️ Found latest tag <${latestTag.name}> at <${commit.committer.date}>`)
    } else {
      // nothing found
      core/* info */.pq(`ℹ️ No release/tag found for tag-prefix <${options.tagPrefix}>`)
    }
  }

  const commitLogsFile = '.semrelease/this_release'
  const checkStyle = message => {
    const issues = checkCommitMessageStyle(message)
    if (issues.length === 0) return
    const header = message.split(/\r\n?|\n/, 1)[0]
    const diagnostic = `${JSON.stringify(header)}: ${issues.join('; ')}`
    if (options.styleCheck) throw new Error(`Commit message style check failed: ${diagnostic}`)
    core/* warning */.$e(`⚠️ Commit message style: ${diagnostic}`)
  }

  // firstly, try to load commit messages from .semrelease/this_release
  core/* info */.pq(`ℹ️ Try loading commit messages from file ${commitLogsFile}...`)
  const releaseLines = await readReleaseLinesAtCommit(octokit, options.targetSha)
  const releaseOptions = await getReleaseOptionsFromFile(commitLogsFile, releaseLines)
  let commitMessages = await loadCommitMessagesFromFile(commitLogsFile, releaseLines, checkStyle)
  if (!commitMessages || commitMessages.length === 0) {
    // if the file does not exist or no commit messages found, load commit messages from GitHub repo
    core/* info */.pq(`ℹ️ File ${commitLogsFile} does not exist or no commit messages found, loading commit messages from repo...`)
    core/* info */.pq(`🕘 Fetching commits from branch <${options.branches}>...`)
    commitMessages = await loadCommitMessagesFromRepo(octokit, filterCommits, options.branches, options.scanPath, options.targetSha, options.branchTips, checkStyle)
  }

  const msgsBumpMajor = []
  const msgsBumpMinor = []
  const msgsBumpPatch = []
  // secondly, parse commit messages to detect changes/updates
  parseCommitMessages(commitMessages, (rule, msg) => {
    core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMajor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpMinor.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  }, (rule, msg) => {
    core/* info */.pq(`⤴️ Detected ${rule.label} from commit message: ${msg}`)
    msgsBumpPatch.push(`- ${msg.replace(/^\d+\.\s*/, '')}`)
  })

  if (msgsBumpMajor.length+msgsBumpMinor.length+msgsBumpPatch.length === 0) {
    core/* info */.pq(`📣 No changes/updates detected.`)
    return {
      release_version: lastVersion,
      release_notes: '',
    }
  }

  core/* info */.pq(`ℹ️ releaseOptions: ${JSON.stringify(releaseOptions, null, 2)}`)
  if (releaseOptions.releaseVersion) {
    core/* info */.pq(`✴️ Release version forced to ${releaseOptions.releaseVersion}.`)
    return {
      release_version: normalizeReleaseVersion(releaseOptions.releaseVersion),
      release_notes: generateReleaseNotes(commitMessages),
    }
  }

  const version = msgsBumpMajor.length > 0
    ? incMajorSemver(lastVersion)
    : msgsBumpMinor.length > 0
      ? incMinorSemver(lastVersion)
      : incPatchSemver(lastVersion)
  if (parseInt(version.major) > parseInt(lastVersion.major)) {
    core/* info */.pq(`📣 Breaking changes detected, releasing new MAJOR version...`)
  } else if (parseInt(version.minor) > parseInt(lastVersion.minor)) {
    core/* info */.pq(`📣 New functionality updates detected, releasing new MINOR version...`)
  } else {
    core/* info */.pq(`📣 Bug fix/patch/improvement updates detected, releasing new PATCH version...`)
  }
  return {
    release_version: normalizeReleaseVersion(version.semver),
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
  const githubToken = core/* getInput */.V4(inputGithubToken) || process.env['GITHUB_TOKEN']
  if (!githubToken) {
    throw new Error('github-token is required')
  }
  const octokit = lib_github/* getOctokit */.Q(githubToken, {request: {timeout: 30000}})

  // fetch options
  const options = getOptions()
  if (!options.targetSha) throw new Error('target-sha or github.context.sha is required')
  const targetCommit = await getCommit(octokit, options.targetSha)
  if (!targetCommit) throw new Error(`Target commit ${options.targetSha} does not exist in this repository`)
  options.targetSha = targetCommit.sha
  options.branchTips = await validateReleaseBranches(octokit, options.branches, options.targetSha)
  core/* info */.pq(`ℹ️ options: ${JSON.stringify(options, null, 2)}`)

  // fetch release info
  const releaseMeta = await computeReleaseMeta(octokit, options)
  if (!releaseMeta || releaseMeta.release_version === '' || releaseMeta.release_notes === '') {
    core/* info */.pq(`⚠️ No release info found, or release notes are empty, skipped.`)
    RESULT_SKIPPED.reason = 'No release info found, or release notes are empty.'
    return RESULT_SKIPPED
  }

  core/* info */.pq(`ℹ️ Release version: ${releaseMeta.release_version.semver}`)
  const tagName = `${options.tagPrefix}${releaseMeta.release_version.semver}`
  const existingTag = await verifyReleaseTag(octokit, tagName, options.targetSha)
  if (await getReleaseByTag(octokit, tagName)) {
    if (!existingTag) {
      throw new Error(`Release ${tagName} exists but its exact tag is missing. Inspect the release and manually restore or clean up its state before retrying; no automatic repair was performed.`)
    }
    core/* info */.pq(`⚠️ Release ${tagName} already exists, skipped.`)
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
    core/* info */.pq(`ℹ️ Release notes:\n${releaseMeta.release_notes}`)
    if (!options.isTagOnly) {
      const release = await createRelease(octokit, tagName, releaseMeta, isPrerelease, options.isDryRun)
      for (const asset of prepared.assets) {
        stage = `uploading release asset ${asset.name}`
        if (options.isDryRun) {
          core/* info */.pq(`[DRY-RUN] Upload release asset ${asset.name} (${asset.size} bytes)`)
        } else {
          await uploadArtifactAsset(octokit, release, asset)
        }
      }
    } else {
      core/* info */.pq(`⚠️ Tag-only mode enabled, skipped creating release.`)
    }
  } catch (error) {
    core/* warning */.$e(
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



;// CONCATENATED MODULE: ./src/index.js



async function run() {
  const {result, releaseVersion, releaseNotes} = await semrelease()
  core/* setOutput */.uH('result', result)
  core/* setOutput */.uH('releaseVersion', releaseVersion)
  core/* setOutput */.uH('releaseNotes', releaseNotes)
}

run().then(() => console.log(`✅ DONE.`)).catch(e => {
  console.log(`❌ ${e}`)
  core/* setOutput */.uH('result', 'FAILED')
  core/* setFailed */.C1(`❌ ${e.message}`)
})


/***/ })

};
;
//# sourceMappingURL=214.index.cjs.js.map