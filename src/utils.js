module.exports = {
  getTagByName,
  getReleaseByTag,
  parseReleaseNotes,
}

const github = require('@actions/github')

async function getTagByName(octokit, tagName) {
  try {
    const {data: tagInfo} = await octokit.rest.git.getRef({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      reg: `tags/${tagName}`,
    })
    return tagInfo
  } catch (error) {
    if (error.status === 404) {
      return null
    }
    throw error
  }
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

/*----------------------------------------------------------------------*/

const fs = require('fs')
const reSemver = /^#+.*?[\s:-]v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)/

function parse(file) {
  const releaseNotes = []
  let enterReleaseNotes = false
  const version = {
  }
  const data = fs.readFileSync(file, {encoding: 'utf8'}).toString()
  const lines = data.split(/\r?\n/)
  for (const line of lines) {
    const matches = line.match(reSemver)
    if (matches) {
      if (enterReleaseNotes) {
        break
      }
      enterReleaseNotes = true
      version.semver = matches[1]
      version.major = matches[2]
      version.minor = matches[3]
      version.patch = matches[4]
      version.prerelease = matches[5] || ''
    } else if (enterReleaseNotes) {
      releaseNotes.push(line)
    }
  }
  if (version !== '') {
    return {
      release_version: version,
      release_notes: releaseNotes.join('\n').trim()
    }
  }
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
      if (result === undefined) {
        break
      }
      return result
    }
  }
  for (const file of changelogFilenames) {
    if (fs.existsSync(file)) {
      return parse(file)
    }
  }
}
