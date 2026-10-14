import {jest} from '@jest/globals'
import * as core from '@actions/core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

jest.unstable_mockModule('@actions/github', () => ({
  context: {repo: {owner: 'owner', repo: 'repo'}, sha: 'event-sha', runId: 101},
}))

const {getOptions} = await import('../src/utils.js')
const environmentNames = [
  'INPUT_TARGET-SHA', 'INPUT_DRY-RUN', 'INPUT_TAG-MAJOR-RELEASE',
  'INPUT_TAG-MINOR-RELEASE', 'INPUT_TAG-PREFIX', 'INPUT_BRANCHES',
  'INPUT_TAG-ONLY', 'INPUT_PATH', 'DRY_RUN', 'TAG_PREFIX', 'BRANCHES',
  'TAG_ONLY', 'SCAN_PATH',
  'INPUT_ARTIFACT-IDS', 'INPUT_ARTIFACT-RUN-ID',
]
let savedEnvironment
let savedDirectory
let directory

beforeEach(() => {
  savedEnvironment = new Map(environmentNames.map(name => [name, process.env[name]]))
  for (const name of environmentNames) delete process.env[name]
  savedDirectory = process.cwd()
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'semrelease-inputs-'))
  process.chdir(directory)
})

afterEach(() => {
  process.chdir(savedDirectory)
  const marker = path.join(directory, '.semrelease-dry-run')
  if (fs.existsSync(marker)) fs.unlinkSync(marker)
  fs.rmdirSync(directory)
  for (const [name, value] of savedEnvironment) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('target-sha input mapping', () => {
  test('real core.getInput reads the uppercase input and overrides the event SHA', () => {
    process.env['INPUT_TARGET-SHA'] = '  explicit-sha  '
    expect(core.getInput('target-sha')).toBe('explicit-sha')
    expect(getOptions().targetSha).toBe('explicit-sha')
  })

  test('missing input falls back to the event SHA', () => {
    expect(getOptions().targetSha).toBe('event-sha')
  })
})

describe('input precedence and normalization', () => {
  test('inputs override environment fallbacks and trim whitespace', () => {
    Object.assign(process.env, {
      TAG_PREFIX: 'env-prefix', BRANCHES: 'env-branch', SCAN_PATH: 'env-path',
      TAG_ONLY: 'true', DRY_RUN: 'true',
      'INPUT_TAG-PREFIX': '  input-prefix  ',
      INPUT_BRANCHES: '  input-branch  ',
      INPUT_PATH: '  input-path  ',
      'INPUT_TAG-ONLY': ' false ',
      'INPUT_DRY-RUN': ' false ',
    })
    expect(getOptions()).toMatchObject({
      tagPrefix: 'input-prefix', branches: ['input-branch'], scanPath: 'input-path',
      isTagOnly: false, isDryRun: false,
    })
  })

  test('uses supported environment fallbacks when inputs are absent', () => {
    Object.assign(process.env, {
      TAG_PREFIX: 'env-prefix', BRANCHES: 'main;dev', SCAN_PATH: 'src',
      TAG_ONLY: 'TrUe', DRY_RUN: 'TRUE',
    })
    expect(getOptions()).toMatchObject({
      tagPrefix: 'env-prefix', branches: ['main', 'dev'], scanPath: 'src',
      isTagOnly: true, isDryRun: true,
    })
  })

  test('boolean inputs are case-insensitive and whitespace is trimmed', () => {
    Object.assign(process.env, {
      'INPUT_DRY-RUN': ' TrUe ',
      'INPUT_TAG-MAJOR-RELEASE': ' FALSE ',
      'INPUT_TAG-MINOR-RELEASE': ' TRUE ',
      'INPUT_TAG-ONLY': ' tRuE ',
    })
    expect(getOptions()).toMatchObject({
      isDryRun: true, isTagMajorRelease: false,
      isTagMinorRelease: true, isTagOnly: true,
    })
  })
})

describe('branch-list parsing', () => {
  test('accepts commas, semicolons and whitespace while removing empty entries', () => {
    process.env.INPUT_BRANCHES = ' main,, dev; ;release\tfeature\nhotfix '
    expect(getOptions().branches).toEqual(['main', 'dev', 'release', 'feature', 'hotfix'])
  })

  test('separator-only input produces an empty list', () => {
    process.env.INPUT_BRANCHES = ', ; ,'
    expect(getOptions().branches).toEqual([])
  })

  test('empty input uses the default branch list', () => {
    process.env.INPUT_BRANCHES = ''
    expect(getOptions().branches).toEqual(['main', 'master'])
  })
})

test('ALIAS-01: both version aliases default to disabled', () => {
  expect(getOptions()).toMatchObject({isTagMajorRelease: false, isTagMinorRelease: false})
})

test('artifact inputs use smart separators and default to the current run', () => {
  process.env['INPUT_ARTIFACT-IDS'] = ' 11,12;13\n14 11 '
  expect(getOptions()).toMatchObject({artifactIds: [11, 12, 13, 14], artifactRunId: 101})
  process.env['INPUT_ARTIFACT-RUN-ID'] = ' 202 '
  expect(getOptions().artifactRunId).toBe(202)
})

test('tag-only ignores invalid artifact inputs', () => {
  process.env['INPUT_TAG-ONLY'] = 'true'
  process.env['INPUT_ARTIFACT-IDS'] = 'invalid'
  process.env['INPUT_ARTIFACT-RUN-ID'] = 'invalid'
  expect(getOptions()).toMatchObject({artifactIds: [], artifactRunId: ''})
})

describe('dry-run marker', () => {
  test('without the marker dry-run defaults to false', () => {
    expect(getOptions().isDryRun).toBe(false)
  })

  test('marker enables dry-run even when input and environment say false', () => {
    process.env['INPUT_DRY-RUN'] = 'false'
    process.env.DRY_RUN = 'false'
    fs.writeFileSync('.semrelease-dry-run', '')
    expect(getOptions().isDryRun).toBe(true)
  })
})
