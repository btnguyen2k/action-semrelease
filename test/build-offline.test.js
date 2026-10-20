import {execSync, spawnSync} from 'node:child_process'
import {cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

test('BUILD-01: clean build preserves the CommonJS boundary and loads the configured bundle offline', async() => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'semrelease-build-'))
  try {
    await mkdir(path.join(workspace, 'dist'))
    await Promise.all([
      cp(path.join(root, 'src'), path.join(workspace, 'src'), {recursive: true}),
      cp(path.join(root, 'package.json'), path.join(workspace, 'package.json')),
      cp(path.join(root, 'action.yml'), path.join(workspace, 'action.yml')),
      cp(path.join(root, 'dist', 'package.json'), path.join(workspace, 'dist', 'package.json')),
      symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir'),
      writeFile(path.join(workspace, 'dist', 'stale.js'), 'throw new Error("stale artifact")'),
    ])
    const boundary = await readFile(path.join(workspace, 'dist', 'package.json'), 'utf8')
    expect(JSON.parse(boundary)).toEqual({type: 'commonjs'})
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !key.toUpperCase().startsWith('INPUT_') && !['GITHUB_TOKEN', 'NODE_OPTIONS', 'NODE_V8_COVERAGE'].includes(key.toUpperCase())))
    execSync('npm run prepare', {cwd: workspace, env, timeout: 90000, stdio: 'pipe'})

    expect(await readFile(path.join(workspace, 'dist', 'package.json'), 'utf8')).toBe(boundary)
    await expect(stat(path.join(workspace, 'dist', 'stale.js'))).rejects.toMatchObject({code: 'ENOENT'})
    const metadata = await readFile(path.join(workspace, 'action.yml'), 'utf8')
    const main = metadata.match(/^\s+main:\s*'([^']+)'/m)?.[1]
    expect(main).toBe('dist/index.cjs')
    const entry = path.join(workspace, ...main.split('/'))
    expect((await stat(entry)).isFile()).toBe(true)

    // Remove source and dependency access so only packaged code can satisfy imports.
    await rm(path.join(workspace, 'src'), {recursive: true})
    await rm(path.join(workspace, 'node_modules'))
    const guard = path.join(workspace, 'no-network.cjs')
    await writeFile(guard, [
      "require('node:net').Socket.prototype.connect = function() {",
      "  process.stderr.write('BUILD-01: unexpected network access\\n')",
      "  throw new Error('BUILD-01: network disabled')",
      '}',
    ].join('\n'))
    const output = path.join(workspace, 'github-output')
    await writeFile(output, '')
    const child = spawnSync(process.execPath, ['--require', guard, entry], {
      cwd: workspace,
      env: {...env, GITHUB_REPOSITORY: 'owner/repo', GITHUB_OUTPUT: output},
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(child.error).toBeUndefined()
    expect(child.signal).toBeNull()
    expect(child.status).toBe(1)
    expect(child.stdout).toContain('github-token is required')
    expect(child.stdout).toContain('::error::')
    expect(child.stderr).toBe('')
    const outputs = await readFile(output, 'utf8')
    expect(outputs).toMatch(/^result<<([^\r\n]+)\r?\nFAILED\r?\n\1\r?\n$/)
  } finally {
    await rm(workspace, {recursive: true, force: true})
  }
}, 120000)
