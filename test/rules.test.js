const rules = require('../src/rules')

describe('parseCommitMessages', () => {
  test('major only', () => {
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

  test('minor only', () => {
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

  test('patch only', () => {
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

  test('all', () => {
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
})

describe('generateReleaseNotes', () => {
  test('empty', () => {
    const releaseNotes = rules.generateReleaseNotes([])
    expect(releaseNotes).toEqual('')
  })

  test('breaking changes', () => {
    const commitMessages = [
      'Breaking change - Remove API [X].',
      '[breaking changed] method [Y] no longer return null',
      '(breaking changes) redesign [Z] to improve performance',
      'Breaking change(API): changed signature of `ParseChangeLog()`',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',

      'Breaking API change: Modified [Y] signatures for consistency',
      '[BREAK] - Removed function `ValidateGitHubToken()`',
      'breaking(API): change signature of `ParseChangeLog()`',
      '(breaking) removed API `xyz`',

      'chore(CI): cleanup tests',
      'Renaming method `Abc` to `Xyz`',
      '[Renamed] - constant `XYZ` to `Abc` ',
      '(rename): variable `XYZ` to `Abc`',
      'ren(API): API getXYZ() renames to GetXyz()',
      'Renames class `Abc` to `Xyz`',
      'RENAME(class): `Abc` to `Xyz`',

      'chore(import): remove unused import',

      'Replacing method `Abc` with `Xyz`',
      '[Replaced] - constant `XYZ` with `Abc`',
      '(replaces): variable `XYZ` with `Abc`',
      'repl(API): API getXYZ() with GetXyz()',
      'replace(class): `Abc` with `Xyz`',

      'Redesigning login flow',
      '[REDESIGN] - login with social network accounts',
      '(redesigns): authentication flow',
      'redesigned(API): authorization with JWT',
    ]
    const expected = `### Changes\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })

  test('removed', () => {
    const commitMessages = [
      'Removing method `Abc`',
      '[removed] - parameter `xyz` from function `Abc`',
      '(REMOVE): constant `XYZ`',
      'removes(API): API getXYZ() no longer available',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
      'Rem(class): Removed class `Abc`',
      'Function `Abc` is removed',
      'JWT support has been removed',
      'Login with social networks are removed',
      'Parsing of `ChangeLog` file is no longer available',
      'Changing username is no longer supported',
      'We no longer support login using SMS',
    ]
    const expected = `### Removed\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })

  test('added/refactoring', () => {
    const commitMessages = [
      'Deprecating function `ParseChangeLog()`',
      '[DEPRECATED] - method `Abc`',
      '(deprecates): constant `XYZ`',
      'deprecate(API) getXYZ()',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
      'Global variable `XYZ` is now deprecated and will be removed in the next release',
      'JWT support has been deprecated and will be removed in future versions',
      'Login with social networks are deprecated and will be removed in future versions',
      'chore(CI): cleanup tests',

      'Refactoring API names for consistency',
      '[REFACTOR] - method `Abc`',
      '(refactors) constant `XYZ`',
      'refactor(API) getXYZ()',
      'Refactored package Reflection',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
      'The class Hashing is refactored to use SHA256',
      'The function `ParseChangeLog()` has been refactored to use `ParseReleaseMeta()`',
      'All API methods are now refactoring to use async/await',

      'chore(import): remove unused import',
      'Added new function `ParseReleaseMeta()`',
      '[ADD] - SMS support',
      '(adding): login with social network accounts',
      'adds(API): Authen(JWT)',

      'New feature: login with one-time password',
      '[FEATURE] - login with biometrics',
      '(features): authentication flow',
      'feature(API): authorization with OAuth',
      'new feat(login): login with social network accounts',
      'chore(code) cleanup unused functions',
    ]
    const expected = `### Added/Refactoring/Deprecation\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })

  test('fixed', () => {
    const commitMessages = [
      'Fixing the random crash issue',
      '[FIX] - Issue #123',
      '(fixes): bug #456',
      'fixed(API) `ParseCommitMessages()` now correctly handles files with unicode characters',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
      'Issue with sending one-time password via SMS has been fixed',

      'chore(CI): cleanup tests',
      'Patching the login flow that caused the app to crash',
      '[PATCH] - login with social network accounts',
      '(patches): authentication flow',
      'patch(API): authorization with JWT',
      'The random crash issue has been patched',

      'Improving performance of `ParseReleaseMeta()`',
      '[IMPROVEMENT] - login with biometrics',
      '(improves): authentication flow',
      'impr(API): authorization with OAuth',
      'Improved: login with social network accounts',
      'The hashing algorithm has been improved to handle large files',
      'chore(Build): combined all build scripts into a single file',

      'Optimizing package size',
      '[OPTIMIZE] - login with social network accounts',
      '(optimizes): authentication flow',
      'Optimization(API): authorization with JWT',
      'Docker image size has been optimized',
      'chore(Release): combined all release scripts into a single file',
      'performance(API): improved performance of `ParseReleaseMeta()`',
      'perf(Build) - optimized build scripts for faster build times',
      '[Performance] faster loading screen',
    ]
    const expected = `### Fixed/Improvements\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })

  test('security', () => {
    const commitMessages = [
      'Security: bump libsec to version x.y.z',
      '[SEC] - Issue #123 fixed',
      '(security): bug #456 fixed',
      'security(API) all API calls are now encrypted',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
    ]
    const expected = `### Security\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })

  test('other', () => {
    const commitMessages = [
      'Dep(dev): bump eslint from 8.7.6 to 9.9.0',
      'dependencies - upgrade @actions/core to 1.10.0',
      'chore(deps): bump libx from 1.0.0 to 2.0.0',
      '[DEPENDENCY] bump liby to 3.0.0',
    ]
    const expected = `### Others\n\n` + commitMessages
      .filter(msg => !msg.startsWith('chore('))
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })
})
