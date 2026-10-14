import * as core from '@actions/core'
import * as github from '@actions/github'
import {createHash} from 'node:crypto'
import {createReadStream, createWriteStream} from 'node:fs'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {Transform} from 'node:stream'
import {pipeline} from 'node:stream/promises'
import {readGithub} from './github-read.js'

const maxFileSize = 2 * 1024 ** 3
const maxTotalSize = 10 * 1024 ** 3

export function getArtifactOptions(isTagOnly) {
  if (isTagOnly) return {artifactIds: [], artifactRunId: ''}
  const rawIds = core.getInput('artifact-ids').split(/[,;\s]+/).filter(Boolean)
  const rawRun = core.getInput('artifact-run-id')
  if (rawIds.length === 0) return {artifactIds: [], artifactRunId: ''}
  const artifactIds = [...new Set(rawIds.map(id => parseId(id, 'artifact-ids')))]
  const artifactRunId = parseId(rawRun || String(github.context.runId || ''), 'artifact-run-id')
  return {artifactIds, artifactRunId}
}

function parseId(value, input) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${input} must contain positive safe integer IDs; received ${JSON.stringify(value)}`)
  }
  return Number(value)
}

export async function prepareArtifacts(octokit, {artifactIds, artifactRunId, targetSha}) {
  if (artifactIds.length === 0) return {assets: [], cleanup: async() => {}}
  const repo = github.context.repo
  const {data: run} = await readGithub(`artifact run ${artifactRunId}`, () =>
    octokit.rest.actions.getWorkflowRun({...repo, run_id: artifactRunId}))
  if (run.id !== artifactRunId
    || run.repository?.full_name?.toLowerCase() !== `${repo.owner}/${repo.repo}`.toLowerCase()
    || run.head_repository?.id !== run.repository?.id || !run.repository?.id) {
    throw new Error(`Artifact run ${artifactRunId} must originate from the current repository, not a fork`)
  }
  if (run.head_sha !== targetSha) {
    throw new Error(`Artifact run ${artifactRunId} commit ${run.head_sha} does not match release target ${targetSha}`)
  }
  if (artifactRunId !== github.context.runId && (run.status !== 'completed' || run.conclusion !== 'success')) {
    throw new Error(`Artifact run ${artifactRunId} must have completed successfully`)
  }

  const artifacts = []
  const names = new Set()
  let totalSize = 0
  for (const id of artifactIds) {
    const {data: artifact} = await readGithub(`artifact ${id}`, () =>
      octokit.rest.actions.getArtifact({...repo, artifact_id: id}))
    if (artifact.id !== id || artifact.workflow_run?.id !== artifactRunId
      || artifact.workflow_run?.repository_id !== run.repository.id
      || artifact.workflow_run?.head_repository_id !== run.repository.id
      || artifact.workflow_run?.head_sha !== targetSha) {
      throw new Error(`Artifact ${id} does not belong to the expected repository, run and target commit`)
    }
    if (artifact.expired || Date.parse(artifact.expires_at) <= Date.now()) {
      throw new Error(`Artifact ${id} has expired`)
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(artifact.digest || '')) {
      throw new Error(`Artifact ${id} has no supported SHA-256 digest; upload it with a current upload-artifact action`)
    }
    const name = artifact.name
    if (typeof name !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name) || name.endsWith('.')) {
      throw new Error(`Artifact ${id} has an unsupported release filename: ${name}`)
    }
    if (names.has(name.toLowerCase())) throw new Error(`Duplicate release asset filename: ${name}`)
    if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 0) {
      throw new Error(`Artifact ${id} has an invalid size`)
    }
    if (artifact.size_in_bytes >= maxFileSize) throw new Error(`Release asset ${name} must be smaller than 2 GiB`)
    totalSize += artifact.size_in_bytes
    if (totalSize > maxTotalSize) throw new Error('Release assets exceed 10 GiB in total')
    names.add(name.toLowerCase())
    artifacts.push(artifact)
  }

  const directory = await mkdtemp(path.join(tmpdir(), 'semrelease-artifacts-'))
  const cleanup = () => rm(directory, {recursive: true, force: true})
  const assets = []
  try {
    for (const artifact of artifacts) {
      const filename = path.join(directory, String(artifact.id))
      const size = await readGithub(`download artifact ${artifact.id}`, async() => {
        const {data} = await octokit.rest.actions.downloadArtifact({
          ...repo, artifact_id: artifact.id, archive_format: 'zip',
          request: {parseSuccessResponseBody: false, signal: AbortSignal.timeout(300000)},
        })
        const hash = createHash('sha256')
        let downloaded = 0
        await pipeline(data, new Transform({
          transform(chunk, encoding, callback) {
            downloaded += chunk.length
            if (downloaded > artifact.size_in_bytes) return callback(new Error(`Artifact ${artifact.id} exceeds its declared size`))
            hash.update(chunk)
            callback(null, chunk)
          },
        }), createWriteStream(filename))
        if (downloaded !== artifact.size_in_bytes) throw new Error(`Artifact ${artifact.id} size mismatch`)
        if (`sha256:${hash.digest('hex')}` !== artifact.digest.toLowerCase()) {
          throw new Error(`Artifact ${artifact.id} SHA-256 digest mismatch`)
        }
        return downloaded
      })
      assets.push({name: artifact.name, filename, size})
    }
    assets.sort((a, b) => a.name < b.name ? -1 : 1)
    return {assets, cleanup}
  } catch (error) {
    await cleanup()
    throw error
  }
}

export async function uploadArtifactAsset(octokit, release, asset) {
  const data = createReadStream(asset.filename)
  try {
    const {data: uploaded} = await octokit.rest.repos.uploadReleaseAsset({
      url: release.upload_url,
      name: asset.name,
      headers: {'content-type': 'application/octet-stream', 'content-length': asset.size},
      data,
      request: {signal: AbortSignal.timeout(300000)},
    })
    if (uploaded.state !== 'uploaded' || uploaded.name !== asset.name || uploaded.size !== asset.size) {
      throw new Error(`Release asset ${asset.name} upload response does not match the expected file`)
    }
    core.info(`Uploaded release asset ${asset.name} (${asset.size} bytes)`)
  } finally {
    data.destroy()
  }
}
