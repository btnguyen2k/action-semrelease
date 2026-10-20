import {jest} from '@jest/globals'

const warning = jest.fn()
jest.unstable_mockModule('@actions/core', () => ({warning}))
const {readGithub} = await import('../src/github-read.js')

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => jest.useRealTimers())

test.each([
  {status: 500}, {status: 502}, {status: 503}, {status: 504},
  {code: 'ECONNRESET'}, {cause: {code: 'ETIMEDOUT'}},
])('retries transient read %j and returns success', async details => {
  const error = Object.assign(new Error('Transient failure'), details)
  const request = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('ok')
  const result = readGithub('test read', request)
  await jest.advanceTimersByTimeAsync(999)
  expect(request).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe('ok')
  expect(request).toHaveBeenCalledTimes(2)
})

test.each([400, 401, 403, 404, 409, 422])('does not retry permanent HTTP %s', async status => {
  const error = Object.assign(new Error('Permanent failure'), {status})
  const request = jest.fn().mockRejectedValue(error)
  await expect(readGithub('test read', request)).rejects.toBe(error)
  expect(request).toHaveBeenCalledTimes(1)
})

test('stops after three attempts and preserves the original error', async() => {
  const error = Object.assign(new Error('Unavailable'), {status: 503})
  const request = jest.fn().mockRejectedValue(error)
  const assertion = expect(readGithub('test read', request)).rejects.toBe(error)
  await jest.runAllTimersAsync()
  await assertion
  expect(request).toHaveBeenCalledTimes(3)
  expect(warning).toHaveBeenCalledWith(expect.stringContaining('retry limit'))
})

test.each([
  {status: 429, headers: {'retry-after': '5'}, delay: 5000},
  {status: 503, headers: {'retry-after': '5'}, delay: 5000},
  {status: 429, headers: {'retry-after': 'Thu, 01 Jan 2026 00:00:10 GMT'}, delay: 10000},
  {status: 403, headers: {'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1767225665'}, delay: 66000},
  {status: 429, headers: {}, delay: 60000},
])('honors server delay $delay for HTTP $status', async({status, headers, delay}) => {
  const error = Object.assign(new Error('Rate limit'), {status, response: {headers}})
  const request = jest.fn().mockRejectedValueOnce(error).mockResolvedValue('ok')
  const result = readGithub('test read', request)
  await jest.advanceTimersByTimeAsync(delay - 1)
  expect(request).toHaveBeenCalledTimes(1)
  await jest.advanceTimersByTimeAsync(1)
  await expect(result).resolves.toBe('ok')
})

test('fails rather than retrying before a rate-limit delay beyond the budget', async() => {
  const error = Object.assign(new Error('Rate limit'), {
    status: 429, response: {headers: {'retry-after': '121'}},
  })
  const request = jest.fn().mockRejectedValue(error)
  await expect(readGithub('test read', request)).rejects.toBe(error)
  expect(request).toHaveBeenCalledTimes(1)
  expect(jest.getTimerCount()).toBe(0)
})

test('enforces cumulative wait budget', async() => {
  const error = Object.assign(new Error('Rate limit'), {
    status: 429, response: {headers: {'retry-after': '70'}},
  })
  const request = jest.fn().mockRejectedValue(error)
  const assertion = expect(readGithub('test read', request)).rejects.toBe(error)
  await jest.runAllTimersAsync()
  await assertion
  expect(request).toHaveBeenCalledTimes(2)
})
