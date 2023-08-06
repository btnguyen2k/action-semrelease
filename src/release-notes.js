const fs = require('fs')
const reSemver = /^#+.*?[\s:-]v?((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?)/

function parse(file) {
  const releaseNotes = []
  let enterReleaseNotes = false
  let version = ''
  const data = fs.readFileSync(file, {encoding: 'utf8'}).toString()
  const lines = data.split(/\r?\n/)
  for (const line of lines) {
    const matches = line.match(reSemver)
    if (matches) {
      if (enterReleaseNotes) {
        break
      }
      enterReleaseNotes = true
      version = matches[1]
    } else if (enterReleaseNotes) {
      releaseNotes.push(line)
    }
  }
  if (version !== '') {
    return {
      release_version: version,
      release_notes: releaseNotes.join('\n')
    }
  }
}

const releaseNoteFilenames = [
  "RELEASE-NOTES.md", "RELEASE_NOTES.MD", "RELEASE-NOTES",
  "RELEASE_NOTES.md", "RELEASE_NOTES.MD", "RELEASE_NOTES",
  "release-notes.md", "release-notes",
  "release_notes.md", "release_notes",
]

function parseReleaseNotes() {
  for (const file of releaseNoteFilenames) {
    if (fs.existsSync(file)) {
      return parse(file)
    }
  }
}

module.exports = parseReleaseNotes
