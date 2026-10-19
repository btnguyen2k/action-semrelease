import * as rules from '../src/rules.js'
import {jest} from '@jest/globals'

describe('parseCommitMessages', () => {
  const ignoredMessages = [
    'No version bump',
    'Because nothing changed',
    'Or no commit messages that match the rules',
  ]
  const majorMessages = [
    'chore(deps): bump libx from 1.0.0 to 2.0.0',
    'Removed function `ValidateGitHubToken()`',
    'Replaced function `ParseChangeLog()` with `ParseReleaseMeta()`',
  ]
  const minorMessages = [
    'New feature: auto mode',
    'chore(CI): cleanup tests',
    'Added function `ParseReleaseMeta()`',
  ]
  const patchMessages = [
    'Security: bump libsec to version x.y.z',
    'Improved performance of `ParseReleaseMeta()`',
    'Optimized package size',
  ]

  test.each([
    {name: 'empty messages', messages: [], major: 0, minor: 0, patch: 0},
    {name: 'no recognized changes', messages: ignoredMessages, major: 0, minor: 0, patch: 0},
    {name: 'major only', messages: majorMessages, major: 2, minor: 0, patch: 0},
    {name: 'minor only', messages: minorMessages, major: 0, minor: 2, patch: 0},
    {name: 'patch only', messages: patchMessages, major: 0, minor: 0, patch: 3},
    {name: 'major + minor', messages: [...majorMessages, ...minorMessages], major: 2, minor: 2, patch: 0},
    {name: 'major + patch', messages: [...majorMessages, ...patchMessages], major: 2, minor: 0, patch: 3},
    {name: 'minor + patch', messages: [...minorMessages, ...patchMessages], major: 0, minor: 2, patch: 3},
    {name: 'major + minor + patch', messages: [...majorMessages, ...minorMessages, ...patchMessages], major: 2, minor: 2, patch: 3},
    {name: 'legacy headers with bodies', messages: ['Fix\n\nRepair the parser.', '[fix]\n\nRepair the parser.'], major: 0, minor: 0, patch: 2},
    {name: 'patch syntax variants and ignored messages', messages: [
      'Fixing incident #123',
      '+ [FIXED] - Issue #123',
      '- (fixes): bug #456',
      '[filter message] will be ignored',
      'Missing header on login page has been fixed',
      '+ The random crash issue is now fixed',
      '- Other minor issues are fixing',
      '+ Another filter message',
      'Patching the login flow that caused the app to crash',
      '+ [patched]: product categories',
      '- (patches): authentication flow',
      '> patched(API): authorization with JWT',
      '- [dep] Update dependencies.',
      '[patch] Update Azure locations and product categories',
    ], major: 0, minor: 0, patch: 12},
  ])('$name', ({messages, major, minor, patch}) => {
    const callbackBumpMajor = jest.fn()
    const callbackBumpMinor = jest.fn()
    const callbackBumpPatch = jest.fn()
    rules.parseCommitMessages(messages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch)
    expect(callbackBumpMajor).toHaveBeenCalledTimes(major)
    expect(callbackBumpMinor).toHaveBeenCalledTimes(minor)
    expect(callbackBumpPatch).toHaveBeenCalledTimes(patch)
  })
})

describe('dependency and revert aliases', () => {
  test.each(['dep', 'deps', 'dependency', 'dependencies'].flatMap(type => [
    `${type}: update parser`,
    `${type}(dev): update parser`,
    `[${type}]: update parser`,
    `(${type}) update parser`,
  ]))('%s produces PATCH and appears in Others', message => {
    const major = jest.fn()
    const minor = jest.fn()
    const patch = jest.fn()
    rules.parseCommitMessages([message], major, minor, patch)
    expect(major).not.toHaveBeenCalled()
    expect(minor).not.toHaveBeenCalled()
    expect(patch).toHaveBeenCalledTimes(1)
    expect(rules.generateReleaseNotes([message])).toBe(
      `### Others\n\n- ${message.charAt(0).toUpperCase()}${message.slice(1)}`,
    )
  })

  test.each([
    'revert: undo the previous change',
    'REVERT(api): restore the previous behavior',
    '[revert]: undo the previous change',
    '(revert) undo the previous change',
    'Revert "feat: add cache"',
    'Reverted the previous change',
    'Reverting the previous change',
    'Reverts the previous change',
    'The previous changes are now reverted',
  ])('%s produces PATCH and appears in Fixed/Improvements', message => {
    const major = jest.fn()
    const minor = jest.fn()
    const patch = jest.fn()
    rules.parseCommitMessages([message], major, minor, patch)
    expect(major).not.toHaveBeenCalled()
    expect(minor).not.toHaveBeenCalled()
    expect(patch).toHaveBeenCalledTimes(1)
    expect(rules.generateReleaseNotes([message])).toBe(
      `### Fixed/Improvements\n\n- ${message.charAt(0).toUpperCase()}${message.slice(1)}`,
    )
  })
})

describe('type-based header classification', () => {
  test.each([
    {message: 'fix: breaking change', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'fix:', bump: '', section: ''},
    {message: 'fix:repair the parser', bump: '', section: ''},
    {message: 'fix:\n\nExplain the change.', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'fix: repair an API that is now removed', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'fix: handle a method that is now deprecated', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'fix(old API is removed): repair the response', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'fix: repair the response\n\nBREAKING CHANGE: the API is now removed', bump: 'patch', section: 'Fixed/Improvements'},
    {message: 'feat: restore an API that is no longer supported', bump: 'minor', section: 'Added/Refactoring/Deprecation'},
    {message: 'refactor: simplify an API that is now removed', bump: 'minor', section: 'Added/Refactoring/Deprecation'},
    {message: 'breaking: fix the request parser', bump: 'major', section: 'Changes'},
    {message: 'breaking change(api): remove the old parser', bump: 'major', section: 'Changes'},
    {message: 'new feature: add a parser', bump: 'minor', section: 'Added/Refactoring/Deprecation'},
    {message: 'docs: explain why the API is no longer available', bump: '', section: ''},
    {message: 'chore(API is removed): refresh configuration', bump: '', section: ''},
    {message: 'docs: explain the API\n\nfix: the API is now removed', bump: '', section: ''},
  ])('$message', ({message, bump, section}) => {
    const callbacks = {major: jest.fn(), minor: jest.fn(), patch: jest.fn()}
    rules.parseCommitMessages([message], callbacks.major, callbacks.minor, callbacks.patch)
    for (const [level, callback] of Object.entries(callbacks)) {
      expect(callback).toHaveBeenCalledTimes(level === bump ? 1 : 0)
      if (level === bump) expect(callback).toHaveBeenCalledWith(expect.any(Object), message)
    }
    expect(rules.generateReleaseNotes([message])).toBe(section
      ? `### ${section}\n\n- ${message.charAt(0).toUpperCase()}${message.slice(1)}`
      : '')
  })
})

describe('checkCommitMessageStyle', () => {
  test.each([
    'fix: repair the request parser',
    'feat(api): add a parser',
    'BREAKING CHANGE: remove the old parser',
    'new feature: add a parser',
    'fix(Any Scope): repair the parser',
    'fix:repair the parser',
    'fix: repair the parser\nExplain the change.',
    'fix: repair the parser\r\nExplain the change.',
    'fix: repair the\nparser',
    'fix: repair the parser\n\nExplain the change.\n\nBREAKING CHANGE: details.',
    'fix: repair the parser\r\n\r\nExplain the change.',
  ])('accepts %s', message => {
    expect(rules.checkCommitMessageStyle(message)).toEqual([])
  })

  test.each([
    {message: 'fix(api):', issue: 'summary must not be empty'},
    {message: 'fix: ', issue: 'summary must not be empty'},
    {message: 'fix:\trepair the parser', issue: 'surrounding whitespace'},
    {message: 'fix:  repair the parser', issue: 'surrounding whitespace'},
    {message: 'fix: repair the parser ', issue: 'surrounding whitespace'},
    {message: 'fix: Repair the parser', issue: 'capital letter'},
    {message: 'fix:Repair the parser', issue: 'capital letter'},
    {message: 'fix: \u00C9viter les erreurs', issue: 'capital letter'},
    {message: 'fix: \u01C5ep the parser', issue: 'capital letter'},
    {message: 'fix: repair the parser.', issue: 'period'},
    {message: 'fix: Repair the parser.\nvalid body without a blank separator', issue: 'capital letter'},
  ])('rejects $message: $issue', ({message, issue}) => {
    expect(rules.checkCommitMessageStyle(message)).toEqual(
      expect.arrayContaining([expect.stringContaining(issue)]),
    )
  })

  test.each([
    '',
    ': Invalid summary.',
    'Fix the parser.',
    '[fix]: Repair the parser.',
    '(fix): Repair the parser.',
    'feat!: Add a parser.',
    ' fix: Repair the parser.',
    'fix(): Repair the parser.',
    'fix( ): Repair the parser.',
    'fix( api): Repair the parser.',
    'fix(api ): Repair the parser.',
    'fix(api(core)): Repair the parser.',
    'fix(api) : Repair the parser.',
    'fix(api: Repair the parser.',
    'custom-type(any-scope): Invalid summary.',
    'chore(CI): Refresh the workflow.',
    'docs: Update the documentation.',
    'build: Update dependencies.',
    'ci: Update the workflow.',
    'style: Format the source.',
    'test: Update the fixtures.',
    'deprecation: Deprecate the parser.',
    'fix extra: Repair the parser.',
    'new feature extra: Add a parser.',
    'breaking API change: Remove the parser.',
  ])('ignores unsupported or malformed headers: %s', message => {
    expect(rules.checkCommitMessageStyle(message)).toEqual([])
  })

  test.each([
    'change', 'changed', 'changes', 'break change', 'break changed', 'break changes',
    'breaking change', 'breaking changed', 'breaking changes', 'break', 'breaking',
    'rem', 'remove', 'removing', 'removes', 'removed',
    'ren', 'rename', 'renaming', 'renames', 'renamed',
    'repl', 'replace', 'replacing', 'replaces', 'replaced',
    'redesign', 'redesigning', 'redesigned', 'redesigns',
    'depr', 'deprecate', 'deprecating', 'deprecated', 'deprecates',
    'refactor', 'refactoring', 'refactored', 'refactors',
    'add', 'adding', 'added', 'adds', 'feat', 'feature', 'features',
    'new feat', 'new feature', 'new features',
    'fix', 'fixing', 'fixed', 'fixes', 'patch', 'patching', 'patched', 'patches',
    'impr', 'improv', 'improving', 'improves', 'improved', 'improvement',
    'optimize', 'optimizing', 'optimization', 'optimizes', 'optimized',
    'perf', 'performance', 'sec', 'security', 'dep', 'deps', 'dependency', 'dependencies',
    'revert', 'reverting', 'reverted', 'reverts',
  ].flatMap(type => [
    `${type}: Invalid summary.`,
    `${type.toUpperCase()}(Any Scope): Invalid summary.`,
  ]))('checks the summary for every recognized type and alias: %s', message => {
    expect(rules.checkCommitMessageStyle(message)).toEqual([
      'summary must not start with a capital letter',
      'summary must not end with a period',
    ])
  })
})

describe('generateReleaseNotes', () => {
  test.each([
    {title: 'Changes', prefix: 'breaking change'},
    {title: 'Removed', prefix: 'removed'},
    {title: 'Added/Refactoring/Deprecation', prefix: 'feat'},
    {title: 'Fixed/Improvements', prefix: 'fix'},
    {title: 'Security', prefix: 'security'},
    {title: 'Others', prefix: 'dep'},
  ])('sorts rendered messages in $title without mutating input or dropping duplicates', ({title, prefix}) => {
    const messages = Object.freeze([
      `${prefix}: zebra`,
      `${prefix.toUpperCase()}: Beta`,
      'chore: ignored',
      `${prefix}: alpha`,
      `${prefix}: alpha`,
    ])
    const capitalized = prefix.charAt(0).toUpperCase() + prefix.slice(1)
    const expected = `### ${title}\n\n- ${prefix.toUpperCase()}: Beta`
      + `\n- ${capitalized}: alpha\n- ${capitalized}: alpha\n- ${capitalized}: zebra`

    expect(rules.generateReleaseNotes(messages)).toBe(expected)
    expect(rules.generateReleaseNotes([...messages].reverse())).toBe(expected)
  })

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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
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
      .map(msg => `- ${msg.charAt(0).toUpperCase()+msg.slice(1)}`).sort().join('\n')
    const releaseNotes = rules.generateReleaseNotes(commitMessages)
    expect(releaseNotes).toEqual(expected)
  })
})
