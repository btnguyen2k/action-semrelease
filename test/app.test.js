import * as app from '../src/app.js'

function setup() {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'true'
  process.env['GITHUB_REPOSITORY'] = 'btnguyen2k/action-semrelease-test'
}

test('test dry-run/auto-skipped-empty', async() => {
  setup()
  const save = process.cwd()
  try {
    // setup env for this test
    process.env['INPUT_branches'] = process.env['BRANCHES'] = 'test-auto-skipped-empty'
    process.env['INPUT_target-sha'] = 'af740f2b9f1856d99ef5a23d086fc6affd53324c'

    process.chdir('testdata/auto-skipped-empty-repo')
    const {result, reason} = await app.semrelease()
    expect(result).toBe('SKIPPED')
    expect(reason).toBe('No release info found, or release notes are empty.')
  } finally {
    // unset env of this test
    delete process.env['INPUT_branches']
    delete process.env['BRANCHES']
    delete process.env['INPUT_target-sha']

    process.chdir(save)
  }
})

test('test dry-run/auto-branch-test-auto-v0.0.1', async() => {
  setup()
  const save = process.cwd()
  try {
    // setup env for this test
    process.env['INPUT_branches'] = process.env['BRANCHES'] = 'test-auto-v0.0.1'
    process.env['INPUT_target-sha'] = 'b5610a3b1bbd1c178668e54cccef1130abf682c9'

    process.chdir('testdata/auto-branch-test-auto-v0.0.1')
    const {result, releaseVersion, releaseNotes} = await app.semrelease()
    expect(result).toBe('SUCCESS')
    expect(releaseVersion).toBe('0.0.1')
    expect(releaseNotes).toBe('### Fixed/Improvements\n\n- Fixed a bug that caused random crash after login')
  } finally {
    // unset env of this test
    delete process.env['INPUT_branches']
    delete process.env['BRANCHES']
    delete process.env['INPUT_target-sha']

    process.chdir(save)
  }
})

test('test dry-run/auto-forced-version-v10.11.12', async() => {
  setup()
  const save = process.cwd()
  try {
    // setup env for this test
    process.env['INPUT_branches'] = process.env['BRANCHES'] = 'test-auto-forced-version-v10.11.12'
    process.env['INPUT_target-sha'] = '0036c04655999dd616237e9fa393ce17755881af'

    process.chdir('testdata/auto-forced-version-v10.11.12')
    const {result, releaseVersion, releaseNotes} = await app.semrelease()
    expect(result).toBe('SUCCESS')
    expect(releaseVersion).toBe('10.11.12')
    expect(releaseNotes).toBe('### Changes\n\n- BREAKING CHANGE: demo.\n\n### Added/Refactoring/Deprecation\n\n- New feature: dummy.')
  } finally {
    // unset env of this test
    delete process.env['INPUT_branches']
    delete process.env['BRANCHES']
    delete process.env['INPUT_target-sha']

    process.chdir(save)
  }
})
