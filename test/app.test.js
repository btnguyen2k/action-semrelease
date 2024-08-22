const app = require('../src/app')

function setupNonAuto() {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'false'
}

test('test dry-run/non-auto-skipped-nometa', async() => {
  setupNonAuto()
  const save = process.cwd()
  try {
    process.chdir('testdata/non-auto-skipped-nometa')
    const {result, reason} = await app.semrelease()
    expect(result).toBe('SKIPPED')
    expect(reason).toBe('No release info found, or release notes are empty.')
  } finally {
    process.chdir(save)
  }
})

test('test dry-run/non-auto-skipped-empty-release-notes', async() => {
  setupNonAuto()
  const save = process.cwd()
  try {
    process.chdir('testdata/non-auto-skipped-empty-release-notes')
    const {result, reason} = await app.semrelease()
    expect(result).toBe('SKIPPED')
    expect(reason).toBe('No release info found, or release notes are empty.')
  } finally {
    process.chdir(save)
  }
})

test('test dry-run/non-auto-skipped-tag-existed', async() => {
  setupNonAuto()
  const save = process.cwd()
  try {
    process.chdir('testdata/non-auto-skipped-tag-existed')
    const {result, reason} = await app.semrelease()
    expect(result).toBe('SKIPPED')
    expect(reason).toBe('Release v3.2.1 already exists.')
  } finally {
    process.chdir(save)
  }
})

test('test dry-run/non-auto', async() => {
  setupNonAuto()
  const save = process.cwd()
  try {
    process.chdir('testdata/non-auto')
    const {result, releaseVersion, releaseNotes} = await app.semrelease()
    expect(result).toBe('SUCCESS')
    expect(releaseVersion).toBe('0.1.2')
    expect(releaseNotes).toBe('### Updates\nThis version is not really released. It is used to test the release notes generation.')
  } finally {
    process.chdir(save)
  }
})

/*----------------------------------------------------------------------*/

function setupAuto() {
  setupNonAuto()
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'true'
  process.env['GITHUB_REPOSITORY'] = 'btnguyen2k/action-semrelease-test'
}

test('test dry-run/auto-skipped-empty', async() => {
  setupAuto()
  const save = process.cwd()
  try {
    process.env['INPUT_branches'] = process.env['BRANCHES'] = 'test-auto-skipped-empty'

    process.chdir('testdata/auto-skipped-empty-repo')
    const {result, reason} = await app.semrelease()
    expect(result).toBe('SKIPPED')
    expect(reason).toBe('No release info found, or release notes are empty.')
  } finally {
    process.chdir(save)
  }
})

test('test dry-run/auto-branch-test-auto-v0.0.1', async() => {
  setupAuto()
  const save = process.cwd()
  try {
    process.env['INPUT_branches'] = process.env['BRANCHES'] = 'test-auto-v0.0.1'

    process.chdir('testdata/auto-branch-test-auto-v0.0.1')
    const {result, releaseVersion, releaseNotes} = await app.semrelease()
    expect(result).toBe('SUCCESS')
    expect(releaseVersion).toBe('0.0.1')
    expect(releaseNotes).toBe('### Fixed/Improvement\n\n- Fixed a bug that caused random crash after login')
  } finally {
    process.chdir(save)
  }
})
