const rules = require('../src/rules')

test('parseCommitMessages - major only', () => {
  const commitMessages = [
    'chore(deps): bump libx from 1.0.0 to 2.0.0',
    'Removed function `ValidateGitHubToken()`',
    'Replaced function `ParseChangeLog()` with `ParseReleaseMeta()`',
  ]
  const callbackBumpMajor = jest.fn()
  const callbackBumpMinor = jest.fn()
  const callbackBumpPatch = jest.fn()
  rules.parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch)
  expect(callbackBumpMajor).toHaveBeenCalledTimes(2)
  expect(callbackBumpMinor).toHaveBeenCalledTimes(0)
  expect(callbackBumpPatch).toHaveBeenCalledTimes(0)
})

test('parseCommitMessages - minor only', () => {
  const commitMessages = [
    'New feature: auto mode',
    'chore(CI): cleanup tests',
    'Added function `ParseReleaseMeta()`',
  ]
  const callbackBumpMajor = jest.fn()
  const callbackBumpMinor = jest.fn()
  const callbackBumpPatch = jest.fn()
  rules.parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch)
  expect(callbackBumpMajor).toHaveBeenCalledTimes(0)
  expect(callbackBumpMinor).toHaveBeenCalledTimes(2)
  expect(callbackBumpPatch).toHaveBeenCalledTimes(0)
})

test('parseCommitMessages - patch only', () => {
  const commitMessages = [
    'Security: bump libsec to version x.y.z',
    'Improved performance of `ParseReleaseMeta()`',
    'Optimized package size',
  ]
  const callbackBumpMajor = jest.fn()
  const callbackBumpMinor = jest.fn()
  const callbackBumpPatch = jest.fn()
  rules.parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch)
  expect(callbackBumpMajor).toHaveBeenCalledTimes(0)
  expect(callbackBumpMinor).toHaveBeenCalledTimes(0)
  expect(callbackBumpPatch).toHaveBeenCalledTimes(3)
})

test('parseCommitMessages - all', () => {
  const commitMessages = [
    'chore(deps): bump libx from 1.0.0 to 2.0.0',
    'Removed function `ValidateGitHubToken()`',
    'Replaced function `ParseChangeLog()` with `ParseReleaseMeta()`',
    'New feature: auto mode',
    'chore(CI): cleanup tests',
    'Added function `ParseReleaseMeta()`',
    'Security: bump libsec to version x.y.z',
    'Improved performance of `ParseReleaseMeta()`',
    'Optimized package size',
  ]
  const callbackBumpMajor = jest.fn()
  const callbackBumpMinor = jest.fn()
  const callbackBumpPatch = jest.fn()
  rules.parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch)
  expect(callbackBumpMajor).toHaveBeenCalledTimes(2)
  expect(callbackBumpMinor).toHaveBeenCalledTimes(2)
  expect(callbackBumpPatch).toHaveBeenCalledTimes(3)
})

test('generateReleaseNotes - empty', () => {
  const releaseNotes = rules.generateReleaseNotes([])
  expect(releaseNotes).toEqual('')
})

test('generateReleaseNotes - changes', () => {
  const commitMessages = [
    'Renamed constant `GitHubToken` to `GITHUB_TOKEN`',
    'Replaced function `ParseChangeLog()` with `ParseReleaseMeta()`',
  ]
  const expected = `### Changes\n\n${commitMessages[0]}\n${commitMessages[1]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})

test('generateReleaseNotes - removed', () => {
  const commitMessages = [
    'Removed function `ValidateGitHubToken()`',
  ]
  const expected = `### Removed\n\n${commitMessages[0]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})

test('generateReleaseNotes - added/refactoring', () => {
  const commitMessages = [
    'New feature: auto mode',
    'chore(CI): cleanup tests',
    'Added function `ParseReleaseMeta()`',
  ]
  const expected = `### Added/Refactoring\n\n${commitMessages[0]}\n${commitMessages[2]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})

test('generateReleaseNotes - fixed', () => {
  const commitMessages = [
    'Improved performance of `ParseReleaseMeta()`',
    'Fixed the random crash issue',
    'Optimized package size',
  ]
  const expected = `### Fixed/Improvement\n\n${commitMessages[0]}\n${commitMessages[1]}\n${commitMessages[2]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})

test('generateReleaseNotes - security', () => {
  const commitMessages = [
    'Security: bump libsec to version x.y.z',
  ]
  const expected = `### Security\n\n${commitMessages[0]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})

test('generateReleaseNotes - other', () => {
  const commitMessages = [
    'Dep(dev): bump eslint from 8.7.6 to 9.9.0',
    'Dep: upgrade @actions/core to 1.10.0',
  ]
  const expected = `### Others\n\n${commitMessages[0]}\n${commitMessages[1]}`
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  expect(releaseNotes).toEqual(expected)
})
