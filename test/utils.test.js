const utils = require('../src/utils')

test('parse release notes', () => {
  const releaseNotes = utils.parseReleaseNotes()
  expect(releaseNotes).toBeDefined()
})
