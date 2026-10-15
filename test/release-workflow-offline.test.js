import {readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'

const release = readFileSync(new URL('../.github/workflows/release.yaml', import.meta.url), 'utf8')
const tests = readFileSync(new URL('../.github/workflows/test.yaml', import.meta.url), 'utf8')
let directory

function script(name) {
  const step = release.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0]
  const body = step?.split('        run: |\n')[1]
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

function run(name, env) {
  return command('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script(name)], env)
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
