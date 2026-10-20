import {createHash} from 'node:crypto'
import {Readable} from 'node:stream'

export function artifactMetadata(bytes, id = 11, name = 'my-package.zip') {
  return {
    id, name, size_in_bytes: bytes.length, expired: false, expires_at: '2099-01-01T00:00:00Z',
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    workflow_run: {id: 101, repository_id: 1, head_repository_id: 1, head_sha: 'target'},
  }
}

export function artifactRun() {
  return {
    id: 101, repository: {id: 1, full_name: 'owner/repo'}, head_repository: {id: 1},
    head_sha: 'target', status: 'in_progress', conclusion: null,
  }
}

export function artifactDownload(bytes) {
  return {data: Readable.from([bytes])}
}
