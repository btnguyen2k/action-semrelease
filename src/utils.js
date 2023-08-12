module.exports = {
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
  parseReleaseNotes,
  incMajorSemver,
  incMinorSemver,
  incPatchSemver,
}

const github = require('@actions/github')

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

async function getAllBranches(octokit) {
  const params = {owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
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

async function getAllCommits(octokit, filter = {}) {
  const params = {...filter, owner: github.context.repo.owner, repo: github.context.repo.repo, page: 1, per_page: 100}
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

const fs = require('fs')
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

const releaseNotesFilenames = [
  "RELEASE-NOTES.md", "RELEASE_NOTES.MD", "RELEASE-NOTES",
  "RELEASE_NOTES.md", "RELEASE_NOTES.MD", "RELEASE_NOTES",
  "release-notes.md", "release-notes",
  "release_notes.md", "release_notes",
]

const changelogFilenames = [
  "CHANGELOG.md", "CHANGELOG.MD", "CHANGELOG",
  "CHANGE-LOG.md", "CHANGE-LOG.MD", "CHANGE-LOG",
  "CHANGE_LOG.md", "CHANGE_LOG.MD", "CHANGE_LOG",
  "changelog.md", "changelog",
  "change-log.md", "change-log",
  "change_log.md", "change_log",
]

function parseReleaseNotes() {
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
