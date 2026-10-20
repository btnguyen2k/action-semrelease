import {jest} from '@jest/globals'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import {Readable} from 'node:stream'
import {getOctokit} from '@actions/github'
import {artifactMetadata, artifactRun, artifactDownload} from './artifact-fixtures.js'

const context = {repo: {owner: 'owner', repo: 'repo'}, runId: 101}
const inputs = {}
const directories = []
jest.unstable_mockModule('@actions/core', () => ({
  getInput: name => inputs[name] || '', info: jest.fn(), warning: jest.fn(),
}))
jest.unstable_mockModule('@actions/github', () => ({context}))
jest.unstable_mockModule('node:fs/promises', () => ({
  ...fs,
  mkdtemp: async prefix => {
    const directory = await fs.mkdtemp(prefix)
    directories.push(directory)
    return directory
  },
}))
const {getArtifactOptions, prepareArtifacts, uploadArtifactAsset} = await import('../src/artifacts.js')
let bytes, metadata, run, octokit
const options = {artifactIds: [11], artifactRunId: 101, targetSha: 'target'}

beforeEach(() => {
  for (const key of Object.keys(inputs)) delete inputs[key]
  directories.length = 0
  context.runId = 101
  bytes = Buffer.from([80, 75, 3, 4, 0, 255])
  metadata = artifactMetadata(bytes)
  run = artifactRun()
  octokit = {rest: {
    actions: {
      getWorkflowRun: jest.fn(async() => ({data: run})),
      getArtifact: jest.fn(async() => ({data: metadata})),
      downloadArtifact: jest.fn(async() => artifactDownload(bytes)),
    },
    repos: {uploadReleaseAsset: jest.fn(async params => {
      const chunks = []
      for await (const chunk of params.data) chunks.push(chunk)
      return {data: {state: 'uploaded', name: params.name, size: Buffer.concat(chunks).length}}
    })},
  }}
})

afterEach(async() => {
  for (const directory of directories) {
    await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'})
  }
})

test('smart separators, duplicate removal and default current run', () => {
  inputs['artifact-ids'] = ' 11,12;;13  11\t14\n15\r\n'
  expect(getArtifactOptions(false)).toEqual({artifactIds: [11, 12, 13, 14, 15], artifactRunId: 101})
  inputs['artifact-run-id'] = '202'
  expect(getArtifactOptions(false).artifactRunId).toBe(202)
})

test.each(['', ', ; \n'])('empty artifact list %j does not require a run', value => {
  inputs['artifact-ids'] = value
  inputs['artifact-run-id'] = 'invalid'
  expect(getArtifactOptions(false)).toEqual({artifactIds: [], artifactRunId: ''})
})

test.each(['0', '-1', '1.5', '1e2', 'abc', '9007199254740992'])('invalid ID %s fails explicitly', value => {
  inputs['artifact-ids'] = value
  expect(() => getArtifactOptions(false)).toThrow('artifact-ids must contain positive safe integer IDs')
})

test('invalid explicit or missing default run fails when artifacts are configured', () => {
  inputs['artifact-ids'] = '11'
  inputs['artifact-run-id'] = 'invalid'
  expect(() => getArtifactOptions(false)).toThrow('artifact-run-id')
  delete inputs['artifact-run-id']
  delete context.runId
  expect(() => getArtifactOptions(false)).toThrow('artifact-run-id')
})

test('tag-only ignores both inputs even when malformed', () => {
  inputs['artifact-ids'] = 'not-an-id'
  inputs['artifact-run-id'] = 'bad'
  expect(getArtifactOptions(true)).toEqual({artifactIds: [], artifactRunId: ''})
})

test('no artifacts performs no reads or writes', async() => {
  const prepared = await prepareArtifacts(octokit, {...options, artifactIds: []})
  expect(prepared.assets).toEqual([])
  await prepared.cleanup()
  for (const api of Object.values(octokit.rest.actions)) expect(api).not.toHaveBeenCalled()
})

test.each(['my-package.zip', 'my-app-setup.exe'])('downloads and uploads %s byte-for-byte, without extraction', async name => {
  metadata.name = name
  const prepared = await prepareArtifacts(octokit, options)
  try {
    expect(octokit.rest.actions.getWorkflowRun).toHaveBeenCalledWith({owner: 'owner', repo: 'repo', run_id: 101})
    expect(octokit.rest.actions.getArtifact).toHaveBeenCalledWith({owner: 'owner', repo: 'repo', artifact_id: 11})
    expect(octokit.rest.actions.downloadArtifact).toHaveBeenCalledWith({
      owner: 'owner', repo: 'repo', artifact_id: 11, archive_format: 'zip',
      request: {parseSuccessResponseBody: false, signal: expect.any(AbortSignal)},
    })
    expect(prepared.assets).toEqual([{name, filename: path.join(directories[0], '11'), size: bytes.length}])
    expect(await fs.readFile(prepared.assets[0].filename)).toEqual(bytes)
    await uploadArtifactAsset(octokit, {upload_url: 'https://uploads.example/assets{?name,label}'}, prepared.assets[0])
    expect(octokit.rest.repos.uploadReleaseAsset.mock.calls[0][0]).toMatchObject({
      url: 'https://uploads.example/assets{?name,label}', name,
      headers: {'content-type': 'application/octet-stream', 'content-length': bytes.length},
    })
  } finally {
    await prepared.cleanup()
  }
})

test('real Octokit streams download and upload bodies using the returned upload URL', async() => {
  const uploaded = []
  const fetch = jest.fn(async(url, init) => {
    if (url.endsWith('/actions/runs/101')) return Response.json(run)
    if (url.endsWith('/actions/artifacts/11')) return Response.json(metadata)
    if (url.endsWith('/actions/artifacts/11/zip')) return new Response(bytes)
    const destination = new URL(url)
    expect(destination.origin + destination.pathname).toBe('https://uploads.example/releases/42/assets')
    expect([...destination.searchParams]).toEqual([['name', 'my-package.zip']])
    expect(init.method).toBe('POST')
    expect(init.headers['content-type']).toBe('application/octet-stream')
    expect(init.headers['content-length']).toBe(String(bytes.length))
    for await (const chunk of init.body) uploaded.push(chunk)
    return Response.json({state: 'uploaded', name: metadata.name, size: bytes.length}, {status: 201})
  })
  const client = getOctokit('offline-token', {request: {fetch}})
  const prepared = await prepareArtifacts(client, options)
  try {
    await uploadArtifactAsset(client, {upload_url: 'https://uploads.example/releases/42/assets{?name,label}'}, prepared.assets[0])
    expect(Buffer.concat(uploaded)).toEqual(bytes)
    expect(fetch).toHaveBeenCalledTimes(4)
  } finally {
    await prepared.cleanup()
  }
})

test('another successful run at the same commit is accepted', async() => {
  context.runId = 202
  run.status = 'completed'
  run.conclusion = 'success'
  const prepared = await prepareArtifacts(octokit, options)
  await prepared.cleanup()
})

test.each([
  ['run ID', r => { r.id = 102 }],
  ['repository', r => { r.repository.full_name = 'other/repo' }],
  ['fork', r => { r.head_repository.id = 2 }],
  ['missing repository', r => { delete r.repository }],
  ['commit', r => { r.head_sha = 'other' }],
  ['incomplete external run', () => { context.runId = 202 }],
  ['failed external run', r => { context.runId = 202; r.status = 'completed'; r.conclusion = 'failure' }],
])('rejects wrong source run: %s', async(name, change) => {
  change(run)
  await expect(prepareArtifacts(octokit, options)).rejects.toThrow(/Artifact run/)
  expect(octokit.rest.actions.getArtifact).not.toHaveBeenCalled()
})

test.each([
  ['wrong ID', a => { a.id = 12 }],
  ['wrong run', a => { a.workflow_run.id = 999 }],
  ['wrong repo', a => { a.workflow_run.repository_id = 2 }],
  ['fork', a => { a.workflow_run.head_repository_id = 2 }],
  ['wrong SHA', a => { a.workflow_run.head_sha = 'other' }],
  ['missing run', a => { delete a.workflow_run }],
  ['expired', a => { a.expired = true }],
  ['past expiration', a => { a.expires_at = '2020-01-01T00:00:00Z' }],
  ['missing digest', a => { delete a.digest }],
  ['unsupported digest', a => { a.digest = 'md5:abcd' }],
  ['unsafe name', a => { a.name = '../app.exe' }],
  ['unsupported name', a => { a.name = 'app setup.exe' }],
  ['trailing period', a => { a.name = 'app.' }],
  ['missing name', a => { delete a.name }],
  ['invalid size', a => { a.size_in_bytes = -1 }],
])('rejects artifact metadata: %s', async(name, change) => {
  change(metadata)
  await expect(prepareArtifacts(octokit, options)).rejects.toThrow(/Artifact 11/)
  expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled()
})

test.each([403, 404, 410])('artifact lookup HTTP %s propagates without download', async status => {
  const error = Object.assign(new Error('artifact unavailable'), {status})
  octokit.rest.actions.getArtifact.mockRejectedValue(error)
  await expect(prepareArtifacts(octokit, options)).rejects.toBe(error)
  expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled()
})

test('digest mismatch rejects the download and removes temporary files', async() => {
  metadata.digest = `sha256:${'0'.repeat(64)}`
  await expect(prepareArtifacts(octokit, options)).rejects.toThrow('SHA-256 digest mismatch')
})

test.each([
  {size: 5, message: 'exceeds its declared size'},
  {size: 7, message: 'size mismatch'},
])('download size $size mismatch fails before upload', async({size, message}) => {
  metadata.size_in_bytes = size
  await expect(prepareArtifacts(octokit, options)).rejects.toThrow(message)
})

test('2 GiB per-file limit rejects before download', async() => {
  metadata.size_in_bytes = 2 * 1024 ** 3
  await expect(prepareArtifacts(octokit, options)).rejects.toThrow('smaller than 2 GiB')
  expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled()
})

test('10 GiB cumulative limit rejects before download', async() => {
  octokit.rest.actions.getArtifact.mockImplementation(async({artifact_id}) => ({
    data: {...artifactMetadata(bytes, artifact_id, `file-${artifact_id}`), size_in_bytes: 2 * 1024 ** 3 - 1},
  }))
  await expect(prepareArtifacts(octokit, {...options, artifactIds: [11, 12, 13, 14, 15, 16]}))
    .rejects.toThrow('exceed 10 GiB')
  expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled()
})

test.each([
  {sizes: [2 * 1024 ** 3 - 1], title: 'just below the per-file limit'},
  {sizes: [...Array(5).fill(2 * 1024 ** 3 - 1), 5], title: 'exactly the total limit'},
])('permits metadata $title before attempting download', async({sizes}) => {
  const ids = sizes.map((size, index) => index + 11)
  octokit.rest.actions.getArtifact.mockImplementation(async({artifact_id}) => ({
    data: {...artifactMetadata(bytes, artifact_id, `file-${artifact_id}`), size_in_bytes: sizes[artifact_id - 11]},
  }))
  const error = Object.assign(new Error('download intentionally unavailable'), {status: 410})
  octokit.rest.actions.downloadArtifact.mockRejectedValue(error)
  await expect(prepareArtifacts(octokit, {...options, artifactIds: ids})).rejects.toBe(error)
  expect(octokit.rest.actions.downloadArtifact).toHaveBeenCalledTimes(1)
})

test('duplicate release filenames across artifacts fail before download', async() => {
  octokit.rest.actions.getArtifact.mockImplementation(async({artifact_id}) => ({
    data: artifactMetadata(bytes, artifact_id, artifact_id === 11 ? 'app.exe' : 'APP.exe'),
  }))
  await expect(prepareArtifacts(octokit, {...options, artifactIds: [11, 12]})).rejects.toThrow('Duplicate release asset')
  expect(octokit.rest.actions.downloadArtifact).not.toHaveBeenCalled()
})

test('uploads can use a deterministic filename order independent of ID order', async() => {
  const names = ['z.exe', 'a.zip', 'b.tar']
  octokit.rest.actions.getArtifact.mockImplementation(async({artifact_id}) => ({
    data: artifactMetadata(bytes, artifact_id, names[artifact_id - 11]),
  }))
  const prepared = await prepareArtifacts(octokit, {...options, artifactIds: [11, 12, 13]})
  try {
    expect(prepared.assets.map(asset => asset.name)).toEqual(['a.zip', 'b.tar', 'z.exe'])
  } finally {
    await prepared.cleanup()
  }
})

test('download failures propagate without uploads', async() => {
  const error = Object.assign(new Error('gone'), {status: 410})
  octokit.rest.actions.downloadArtifact.mockRejectedValue(error)
  await expect(prepareArtifacts(octokit, options)).rejects.toBe(error)
  expect(octokit.rest.actions.downloadArtifact).toHaveBeenCalledTimes(1)
})

test('a transient interrupted download restarts from scratch and preserves exact bytes', async() => {
  const error = Object.assign(new Error('connection reset'), {code: 'ECONNRESET'})
  octokit.rest.actions.downloadArtifact.mockResolvedValueOnce({data: Readable.from((async function* () {
    yield bytes.subarray(0, 2)
    throw error
  })())})
  const prepared = await prepareArtifacts(octokit, options)
  try {
    expect(octokit.rest.actions.downloadArtifact).toHaveBeenCalledTimes(2)
    expect(await fs.readFile(prepared.assets[0].filename)).toEqual(bytes)
  } finally {
    await prepared.cleanup()
  }
})

test('upload failure is not retried and closes the file stream', async() => {
  const prepared = await prepareArtifacts(octokit, options)
  const error = Object.assign(new Error('write failed'), {status: 503})
  octokit.rest.repos.uploadReleaseAsset.mockRejectedValue(error)
  try {
    await expect(uploadArtifactAsset(octokit, {upload_url: 'https://uploads.example/assets'}, prepared.assets[0])).rejects.toBe(error)
    expect(octokit.rest.repos.uploadReleaseAsset).toHaveBeenCalledTimes(1)
    expect(octokit.rest.repos.uploadReleaseAsset.mock.calls[0][0].data.destroyed).toBe(true)
  } finally {
    await prepared.cleanup()
  }
})

test.each([
  {state: 'starter', name: 'my-package.zip', size: 6},
  {state: 'uploaded', name: 'renamed.zip', size: 6},
  {state: 'uploaded', name: 'my-package.zip', size: 0},
])('invalid upload response %j fails explicitly', async data => {
  const prepared = await prepareArtifacts(octokit, options)
  octokit.rest.repos.uploadReleaseAsset.mockResolvedValue({data})
  try {
    await expect(uploadArtifactAsset(octokit, {upload_url: 'https://uploads.example/assets'}, prepared.assets[0]))
      .rejects.toThrow('upload response does not match')
  } finally {
    await prepared.cleanup()
  }
})
