import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {parseCommitMessages, generateReleaseNotes} from '../src/rules.js'

const release = readFileSync(new URL('../.github/workflows/release.yaml', import.meta.url), 'utf8')
const tests = readFileSync(new URL('../.github/workflows/test.yaml', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const readmeRelease = readme.match(/### Pre-release preparation and Post-release cleanup\n[\s\S]*?```yaml\n([\s\S]*?)```/)?.[1]
if (!readmeRelease) throw new Error('Missing release lifecycle example in README')
let directory

function step(name, workflow = release) {
  const body = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0]
  if (!body) throw new Error(`Missing workflow step: ${name}`)
  return body
}

function script(name, workflow = release) {
  const body = step(name, workflow).split('        run: |\n')[1]
  if (!body) throw new Error(`Missing workflow script: ${name}`)
  return body.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
}

function command(binary, args, env = {}) {
  const result = spawnSync(binary, args, {
    cwd: directory, encoding: 'utf8',
    env: {...process.env, ...env}, timeout: 15000,
  })
  if (result.error) throw result.error
  return result
}

function git(...args) {
  const result = command('git', args)
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

function run(name, env, workflow = release) {
  return command('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script(name, workflow)], env)
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'semrelease-workflow-'))
})
afterEach(() => rmSync(directory, {recursive: true, force: true}))

test('prepared SHA is tested and published without a publication-time build', () => {
  const prepared = release.split('\n  testPrepared:\n')[1].split('\n  release:\n')[0]
  expect(prepared).toContain('target-sha: ${{ needs.prepare.outputs.release-sha }}')
  expect(prepared).toContain('packaged: true')
  const publish = release.split('\n  release:\n')[1].split('\n  mergeToMain:\n')[0]
  expect(publish).toContain('needs: [prepare, testPrepared, dryrun]')
  expect(publish.match(/needs\.prepare\.outputs\.release-sha/g)).toHaveLength(4)
  expect(publish).not.toMatch(/npm (ci|run prepare)/)
  expect(release.indexOf('- name: Update metadata')).toBeLessThan(release.indexOf('- name: Build release bundle'))
  for (const name of ['test_non_auto', 'test_auto', 'test_dry_run']) {
    const job = tests.split(`\n  ${name}:\n`)[1].split(/\n {2}[a-z_]+:\n/)[0]
    expect(job).toContain('npm ci --ignore-scripts')
    expect(job).toContain('if: ${{ !inputs.packaged }}')
    expect(job).not.toMatch(/run: npm ci\n/)
  }
})

test('PR target selection is disabled when a caller supplies an explicit SHA', () => {
  expect(tests).toContain("PR_BASE_SHA: ${{ !inputs.target-sha && github.event_name == 'pull_request' && github.event.pull_request.base.sha || '' }}")
  expect(tests).toContain("PR_BASE_BRANCH: ${{ !inputs.target-sha && github.event_name == 'pull_request' && github.event.pull_request.base.ref || '' }}")
  expect(tests.match(/ref: \$\{\{ needs\.pin\.outputs\.target-sha }}/g)).toHaveLength(5)
  expect(tests.match(/target-sha: \$\{\{ needs\.pin\.outputs\.action-target-sha }}/g)).toHaveLength(3)
  expect(tests.match(/branches:.*needs\.pin\.outputs\.action-branch/g)).toHaveLength(3)
})

test.each([
  {name: 'PR', base: 'b'.repeat(40), branch: 'feature-base', push: ''},
  {name: 'push', base: '', branch: '', push: 'feature/new-action'},
  {name: 'explicit workflow-call SHA', base: '', branch: '', push: ''},
  {name: 'tag push', base: '', branch: '', push: ''},
])('pin script separates code and action targets for $name', ({base, branch, push}) => {
  const body = tests.split('        run: |\n')[1].split('\n  # lint')[0]
    .split('\n').map(line => line.replace(/^ {10}/, '')).join('\n')
  const sha = 'a'.repeat(40)
  const result = command('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', body], {
    TARGET_SHA: sha, PR_BASE_SHA: base, PR_BASE_BRANCH: branch, PUSH_BRANCH: push, GITHUB_OUTPUT: 'pin-output',
  })
  expect(result.status).toBe(0)
  expect(readFileSync(path.join(directory, 'pin-output'), 'utf8')).toBe(
    `target-sha=${sha}\naction-target-sha=${base || sha}\naction-branch=${branch}\npush-branch=${push}\n`,
  )
})

test('all smoke tests select the event branch without hardcoded branch lists', () => {
  expect(tests).toContain("PUSH_BRANCH: ${{ !inputs.target-sha && github.event_name == 'push' && github.ref_type == 'branch' && github.ref_name || '' }}")
  expect(tests.match(/branches:.*needs\.pin\.outputs\.push-branch/g)).toHaveLength(3)
  expect(tests.match(/branches: \$\{\{ needs\.pin\.outputs\.action-branch \|\| needs\.pin\.outputs\.push-branch \|\| github\.base_ref \|\| github\.ref_name }}/g)).toHaveLength(1)
  expect(tests.match(/branches: \$\{\{ format\('\{0}, not-exists', needs\.pin\.outputs\.action-branch \|\| needs\.pin\.outputs\.push-branch \|\| github\.base_ref \|\| github\.ref_name\) }}/g)).toHaveLength(2)
  expect(tests).not.toMatch(/branches:.*(?:main,|master,|release,|dev,)/)
})

test('Codecov checks token availability through the units job environment', () => {
  const units = tests.split('\n  units:\n')[1].split('\n  # test the action itself')[0]
  expect(units).toContain("    env:\n      CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}")
  expect(units).toContain("      - name: Upload coverage reports to Codecov\n        if: ${{ env.CODECOV_TOKEN != '' }}")
})

test('metadata script preserves literal notes and rejects duplicate release sections', () => {
  mkdirSync(path.join(directory, 'src'))
  mkdirSync(path.join(directory, 'test'))
  writeFileSync(path.join(directory, 'package.json'), '{\n  "version": "0.0.0"\n}\n')
  writeFileSync(path.join(directory, 'RELEASE-NOTES.md'), '# Releases\n\n## 2020-01-01 - v0.1.0\n')
  const placeholder = ['<<', 'VERSION', '>>'].join('')
  writeFileSync(path.join(directory, 'src', 'version.js'), `export const version = "${placeholder}"\n`)
  writeFileSync(path.join(directory, 'test', 'version.js'), `// ${placeholder}\n`)
  const notes = "It's literal: $(touch injected)\n- C:\\new\\test\n- `do not execute`"
  const env = {VERSION: '1.2.3+build.7', RELEASE_NOTES: notes, TAG_PREFIX: 'v', FILE_CHANGELOG: 'RELEASE-NOTES.md'}
  const first = run('Update metadata', env)
  expect(first.status).toBe(0)
  const changelog = readFileSync(path.join(directory, 'RELEASE-NOTES.md'), 'utf8')
  expect(changelog).toContain(notes)
  expect(existsSync(path.join(directory, 'injected'))).toBe(false)
  expect(readFileSync(path.join(directory, 'src', 'version.js'), 'utf8')).toContain('v1.2.3+build.7')
  expect(JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version).toBe(env.VERSION)
  const again = run('Update metadata', env)
  expect(again.status).toBe(1)
  expect(again.stdout).toContain('Changelog already contains this version')
  expect(readFileSync(path.join(directory, 'RELEASE-NOTES.md'), 'utf8')).toBe(changelog)
})

function repository() {
  git('init', '--quiet', '--initial-branch=release')
  git('config', 'user.name', 'Workflow Test')
  git('config', 'user.email', 'test@example.invalid')
  mkdirSync(path.join(directory, 'dist'))
  mkdirSync(path.join(directory, 'src'))
  mkdirSync(path.join(directory, 'test'))
  writeFileSync(path.join(directory, 'dist', 'package.json'), '{"type":"commonjs"}')
  writeFileSync(path.join(directory, 'package.json'), '{"version":"1.0.0"}')
  writeFileSync(path.join(directory, 'README.md'), '# Test')
  git('add', '.')
  git('commit', '--quiet', '-m', 'source')
  const source = git('rev-parse', 'HEAD')
  // Use a nested bare repository as a local-only push destination.
  git('init', '--quiet', '--bare', 'remote.git')
  git('remote', 'add', 'origin', path.join(directory, 'remote.git'))
  git('push', '--quiet', 'origin', 'HEAD:release')
  git('checkout', '--quiet', '--detach', source)
  return {SOURCE_SHA: source, VERSION: '1.0.0', BRANCH_TO_RELEASE: 'release', GITHUB_OUTPUT: 'job-output'}
}

test('preparation commits new bundles and metadata together, emits the pushed SHA, and handles no changes', () => {
  const env = repository()
  writeFileSync(path.join(directory, 'dist', 'index.cjs'), 'console.log("bundle")')
  writeFileSync(path.join(directory, 'package.json'), '{"version":"1.0.1"}')
  writeFileSync(path.join(directory, 'unrelated.txt'), 'do not commit')
  const result = run('Commit prepared release', env)
  expect(result.status).toBe(0)
  const sha = git('rev-parse', 'HEAD')
  expect(sha).not.toBe(env.SOURCE_SHA)
  expect(readFileSync(path.join(directory, 'job-output'), 'utf8')).toBe(`release-sha=${sha}\n`)
  expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').split('\n'))
    .toEqual(['dist/index.cjs', 'package.json'])
  expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(sha)
  expect(run('Commit prepared release', {...env, SOURCE_SHA: sha}).status).toBe(0)
  expect(git('rev-parse', 'HEAD')).toBe(sha)
})

test('preparation refuses a branch that advanced beyond the source', () => {
  const env = repository()
  expect(run('Commit prepared release', {...env, SOURCE_SHA: '0'.repeat(40)}).status).toBe(1)
  expect(git('rev-parse', 'HEAD')).toBe(env.SOURCE_SHA)
})

test.each(['version', 'notes', 'result', 'branch'])('publication preflight rejects changed %s', field => {
  const env = repository()
  const plan = {
    ...env, RELEASE_SHA: env.SOURCE_SHA, EXPECTED_VERSION: '1.0.0', EXPECTED_NOTES: 'notes',
    ACTUAL_VERSION: '1.0.0', ACTUAL_NOTES: 'notes', ACTUAL_RESULT: 'SUCCESS',
  }
  expect(run('Check release plan and branch', plan).status).toBe(0)
  const key = {version: 'ACTUAL_VERSION', notes: 'ACTUAL_NOTES', result: 'ACTUAL_RESULT', branch: 'RELEASE_SHA'}[field]
  expect(run('Check release plan and branch', {...plan, [key]: 'changed'}).status).toBe(1)
})

describe('README release lifecycle', () => {
  function environment() {
    return {
      ...repository(), RELEASE_BRANCH: 'release', TAG_PREFIX: 'v', DRY_RUN: 'false',
      PREPARE_CHANGELOG: 'true', CLEANUP_RELEASE_FILE: 'false',
    }
  }

  function execute(name, env) {
    return run(name, env, readmeRelease)
  }

  function advanceBranch(source) {
    writeFileSync(path.join(directory, 'branch-change.txt'), 'concurrent branch update\n')
    git('add', 'branch-change.txt')
    git('commit', '--quiet', '-m', 'concurrent branch update', '--', 'branch-change.txt')
    git('push', '--quiet', 'origin', 'HEAD:release')
    const advanced = git('rev-parse', 'HEAD')
    git('checkout', '--quiet', '--detach', source)
    return advanced
  }

  function expectMaintenanceCommit() {
    const message = git('log', '-1', '--format=%B')
    const bumps = []
    const bump = () => bumps.push(true)
    parseCommitMessages([message], bump, bump, bump)
    expect(bumps).toEqual([])
    const messages = ['fix: repair the parser']
    expect(generateReleaseNotes([...messages, message])).toBe(generateReleaseNotes(messages))
  }

  test('preparation and cleanup are optional and all publishing writes require real mode', () => {
    expect(readme).toContain('Preparation and cleanup are optional, repository-owned steps.')
    expect(readme).not.toContain('must manually clean up')
    expect(readmeRelease).toContain("  DRY_RUN: 'true'")
    expect(readmeRelease).toContain("  CLEANUP_RELEASE_FILE: 'false'")
    expect(readmeRelease).toContain('  group: release-publication\n  cancel-in-progress: false')
    expect(readmeRelease).toContain('    shell: bash')
    expect(readmeRelease.match(/uses: btnguyen2k\/action-semrelease@v5/g)).toHaveLength(3)
    for (const name of ['Prepare changelog', 'Capture release target', 'Verify release target', 'Check publication plan', 'Publish release', 'Optional metadata cleanup']) {
      expect(step(name, readmeRelease)).toContain("steps.source.outputs.dry-run == 'false'")
    }
    expect(step('Prepare changelog', readmeRelease)).toContain("env.PREPARE_CHANGELOG == 'true'")
    expect(step('Optional metadata cleanup', readmeRelease)).toContain("env.CLEANUP_RELEASE_FILE == 'true'")
    expect(step('Optional metadata cleanup', readmeRelease)).toContain("steps.publish.outputs.result == 'SUCCESS'")
    expect(step('Plan release', readmeRelease)).toContain('target-sha: ${{ steps.source.outputs.sha }}')
    for (const name of ['Verify release target', 'Publish release']) {
      expect(step(name, readmeRelease)).toContain('target-sha: ${{ steps.target.outputs.sha }}')
    }
    expect(step('Publish release', readmeRelease)).toContain('dry-run: false')
    expect(readmeRelease.indexOf('- name: Check publication plan')).toBeLessThan(readmeRelease.indexOf('- name: Publish release'))
    expect(readmeRelease).not.toMatch(/git commit -am|git push -f|--force|--global|sed -i|continue-on-error|always\(\)/)
  })

  test.each(['Read release settings', 'Prepare changelog', 'Capture release target', 'Check publication plan', 'Optional metadata cleanup'])('%s has valid Bash syntax and no embedded workflow expressions', name => {
    const body = script(name, readmeRelease)
    expect(body).not.toContain('${{')
    expect(command('bash', ['--noprofile', '--norc', '-n', '-c', body]).status).toBe(0)
  })

  test.each([
    {name: 'real mode', dryRun: 'false', marker: '', expected: 'false'},
    {name: 'requested preview', dryRun: 'true', marker: '', expected: 'true'},
    {name: 'marker file', dryRun: 'false', marker: 'file', expected: 'true'},
    {name: 'marker directory', dryRun: 'false', marker: 'directory', expected: 'true'},
  ])('settings pin the source and resolve $name before write guards', ({dryRun, marker, expected}) => {
    const env = environment()
    if (marker === 'file') writeFileSync(path.join(directory, '.semrelease-dry-run'), '')
    if (marker === 'directory') mkdirSync(path.join(directory, '.semrelease-dry-run'))
    const result = execute('Read release settings', {...env, DRY_RUN: dryRun})
    expect(result.status).toBe(0)
    expect(readFileSync(path.join(directory, 'job-output'), 'utf8')).toBe(`sha=${env.SOURCE_SHA}\ndry-run=${expected}\n`)
    expect(git('rev-parse', 'HEAD')).toBe(env.SOURCE_SHA)
  })

  test.each(['DRY_RUN', 'PREPARE_CHANGELOG', 'CLEANUP_RELEASE_FILE'])('settings reject an invalid %s instead of silently publishing', flag => {
    const env = environment()
    const result = execute('Read release settings', {...env, [flag]: 'yes'})
    expect(result.status).toBe(1)
    expect(result.stdout).toContain(`${flag} must be true or false`)
    expect(existsSync(path.join(directory, 'job-output'))).toBe(false)
  })

  test('preparation preserves history and literal notes, commits only its file, and captures the pushed target', () => {
    const env = environment()
    const history = '# Changelog\n\n## 2020-01-01 - v4.0.0-rc2\n\nOriginal history\n'
    writeFileSync(path.join(directory, 'CHANGELOG.md'), history)
    git('add', 'CHANGELOG.md')
    git('commit', '--quiet', '-m', 'changelog baseline')
    git('push', '--quiet', 'origin', 'HEAD:release')
    env.SOURCE_SHA = git('rev-parse', 'HEAD')
    writeFileSync(path.join(directory, 'README.md'), 'unrelated tracked change')
    git('add', 'README.md')
    const notes = "It's literal: $(touch injected)\n- C:\\new\\test\n- migrate from v4.0.0-rc2\n- `touch injected-too`"
    const result = execute('Prepare changelog', {...env, VERSION: '5.0.0', RELEASE_NOTES: notes})
    expect(result.status).toBe(0)
    const content = readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8')
    expect(content.startsWith(history)).toBe(true)
    expect(content).toContain(notes)
    expect(existsSync(path.join(directory, 'injected'))).toBe(false)
    expect(existsSync(path.join(directory, 'injected-too'))).toBe(false)
    const prepared = git('rev-parse', 'HEAD')
    expect(prepared).not.toBe(env.SOURCE_SHA)
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('CHANGELOG.md')
    expect(git('diff', '--cached', '--name-only')).toBe('README.md')
    expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(prepared)
    expectMaintenanceCommit()
    expect(execute('Capture release target', env).status).toBe(0)
    expect(readFileSync(path.join(directory, 'job-output'), 'utf8')).toBe(`sha=${prepared}\n`)
  })

  test('preparation creates and commits a new changelog', () => {
    const env = environment()
    expect(existsSync(path.join(directory, 'CHANGELOG.md'))).toBe(false)
    expect(execute('Prepare changelog', {...env, RELEASE_NOTES: 'release notes'}).status).toBe(0)
    expect(readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8')).toMatch(
      /^# Changelog\n\n## \d{4}-\d{2}-\d{2} - v1\.0\.0\n\nrelease notes\n$/,
    )
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('CHANGELOG.md')
    expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(git('rev-parse', 'HEAD'))
  })

  test.each(['## v1.0.0\n', '## 2020-01-01 - v1.0.0\r\n'])('preparation refuses an already-prepared version in %j', heading => {
    const env = environment()
    const content = '# Changelog\n\n' + heading
    writeFileSync(path.join(directory, 'CHANGELOG.md'), content)
    const result = execute('Prepare changelog', {...env, RELEASE_NOTES: 'notes'})
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Changelog already contains this version')
    expect(readFileSync(path.join(directory, 'CHANGELOG.md'), 'utf8')).toBe(content)
    expect(git('rev-parse', 'HEAD')).toBe(env.SOURCE_SHA)
  })

  test('preparation rejects a changed branch before editing and can capture an unprepared source', () => {
    const env = environment()
    const advanced = advanceBranch(env.SOURCE_SHA)
    const result = execute('Prepare changelog', {...env, RELEASE_NOTES: 'notes'})
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('Release branch changed')
    expect(existsSync(path.join(directory, 'CHANGELOG.md'))).toBe(false)
    expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(advanced)
    expect(execute('Capture release target', env).status).toBe(0)
    expect(readFileSync(path.join(directory, 'job-output'), 'utf8')).toBe(`sha=${env.SOURCE_SHA}\n`)
  })

  test.each(['version', 'notes', 'result', 'branch'])('publication rejects a changed %s before the publishing step', field => {
    const env = environment()
    const plan = {
      ...env, RELEASE_SHA: env.SOURCE_SHA, EXPECTED_VERSION: '1.0.0', EXPECTED_NOTES: 'literal\nnotes',
      ACTUAL_VERSION: '1.0.0', ACTUAL_NOTES: 'literal\nnotes', ACTUAL_RESULT: 'SUCCESS',
    }
    expect(execute('Check publication plan', plan).status).toBe(0)
    if (field === 'branch') {
      advanceBranch(env.SOURCE_SHA)
    } else {
      const key = {version: 'ACTUAL_VERSION', notes: 'ACTUAL_NOTES', result: 'ACTUAL_RESULT'}[field]
      plan[key] = {version: '1.0.1', notes: 'different\nnotes', result: 'SKIPPED'}[field]
    }
    expect(execute('Check publication plan', plan).status).toBe(1)
  })

  test('cleanup skips an absent optional metadata file without creating it', () => {
    const env = environment()
    const result = execute('Optional metadata cleanup', {...env, RELEASE_SHA: env.SOURCE_SHA})
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('No metadata file to clean')
    expect(existsSync(path.join(directory, '.semrelease'))).toBe(false)
    expect(git('rev-parse', 'HEAD')).toBe(env.SOURCE_SHA)
  })

  test('cleanup rejects branch movement without editing published metadata', () => {
    const env = environment()
    mkdirSync(path.join(directory, '.semrelease'))
    const metadata = path.join(directory, '.semrelease', 'this_release')
    const original = '#!VERSION=1.0.0\n- fix: repair the parser\n'
    writeFileSync(metadata, original)
    git('add', '.semrelease/this_release')
    git('commit', '--quiet', '-m', 'release metadata')
    git('push', '--quiet', 'origin', 'HEAD:release')
    const published = git('rev-parse', 'HEAD')
    const advanced = advanceBranch(published)
    const result = execute('Optional metadata cleanup', {...env, RELEASE_SHA: published})
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('finish cleanup separately')
    expect(readFileSync(metadata, 'utf8')).toBe(original)
    expect(git('rev-parse', 'HEAD')).toBe(published)
    expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(advanced)
  })

  test('cleanup is scoped and idempotent and leaves the release tag pinned', () => {
    const env = environment()
    mkdirSync(path.join(directory, '.semrelease'))
    const metadata = path.join(directory, '.semrelease', 'this_release')
    const original = '#!VERSION=1.0.0\n- fix: repair the parser\n'
    writeFileSync(metadata, original)
    git('add', '.semrelease/this_release')
    git('commit', '--quiet', '-m', 'release metadata')
    git('push', '--quiet', 'origin', 'HEAD:release')
    const published = git('rev-parse', 'HEAD')
    git('tag', 'v1.0.0', published)
    git('push', '--quiet', 'origin', 'refs/tags/v1.0.0')
    writeFileSync(path.join(directory, 'README.md'), 'unrelated staged change')
    git('add', 'README.md')
    expect(execute('Optional metadata cleanup', {...env, RELEASE_SHA: published}).status).toBe(0)
    expect(readFileSync(metadata, 'utf8')).toBe('# Released v1.0.0.\n')
    const cleaned = git('rev-parse', 'HEAD')
    expect(cleaned).not.toBe(published)
    expect(git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')).toBe('.semrelease/this_release')
    expect(git('diff', '--cached', '--name-only')).toBe('README.md')
    expect(git('ls-remote', 'origin', 'refs/heads/release').split(/\s/)[0]).toBe(cleaned)
    expect(git('ls-remote', 'origin', 'refs/tags/v1.0.0').split(/\s/)[0]).toBe(published)
    expectMaintenanceCommit()
    expect(execute('Optional metadata cleanup', {...env, RELEASE_SHA: cleaned}).status).toBe(0)
    expect(git('rev-parse', 'HEAD')).toBe(cleaned)
  })
})
