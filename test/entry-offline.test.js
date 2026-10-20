import {jest} from '@jest/globals'

const semrelease = jest.fn()
const setOutput = jest.fn()
const setFailed = jest.fn()

jest.unstable_mockModule('@actions/core', () => ({setOutput, setFailed}))
jest.unstable_mockModule('../src/app.js', () => ({semrelease}))

beforeEach(() => {
  semrelease.mockReset()
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

async function runEntry() {
  await jest.isolateModulesAsync(async() => {
    await import('../src/index.js')
    // The entrypoint starts, but does not export, its completion promise.
    await new Promise(resolve => setImmediate(resolve))
  })
}

test.each([
  {
    result: 'SUCCESS',
    releaseVersion: '2.3.5',
    releaseNotes: '### Fixed/Improvements\n\n- Fix: first issue\n- Fix: second issue',
  },
  {result: 'SKIPPED', releaseVersion: '', releaseNotes: ''},
])('ENTRY-01: publishes exact $result outputs without failing the step', async response => {
  semrelease.mockResolvedValue(response)

  await runEntry()

  expect(semrelease).toHaveBeenCalledTimes(1)
  expect(semrelease).toHaveBeenCalledWith()
  expect(setOutput.mock.calls).toEqual([
    ['result', response.result],
    ['releaseVersion', response.releaseVersion],
    ['releaseNotes', response.releaseNotes],
  ])
  expect(setFailed).not.toHaveBeenCalled()
})

test.each(['Target is not reachable', 'Commit message style check failed'])(
  'ENTRY-02: rejection publishes FAILED and fails the step without release outputs: %s', async message => {
    semrelease.mockRejectedValue(new Error(message))

    await runEntry()

    expect(semrelease).toHaveBeenCalledTimes(1)
    expect(setOutput.mock.calls).toEqual([['result', 'FAILED']])
    expect(setFailed).toHaveBeenCalledTimes(1)
    expect(setFailed).toHaveBeenCalledWith(`❌ ${message}`)
  },
)
