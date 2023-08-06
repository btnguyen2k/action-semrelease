const parseReleaseNotes = require('../src/release-notes')

test('parse release notes', () => {
  const releaseNotes = parseReleaseNotes()
  expect(releaseNotes).toBeDefined()
})
