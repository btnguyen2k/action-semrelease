import * as core from '@actions/core'

const networkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'])

export async function readGithub(operation, request) {
  let waited = 0
  for (let attempt = 1; ; attempt++) {
    try {
      return await request()
    } catch (error) {
      const headers = error.response?.headers || {}
      const retryAfter = headers['retry-after']
      const reset = headers['x-ratelimit-reset']
      const rateLimited = error.status === 429 || error.status === 403 && (
        retryAfter !== undefined || String(headers['x-ratelimit-remaining']) === '0'
        || /secondary rate limit/i.test(error.message)
      )
      const transient = rateLimited || [500, 502, 503, 504].includes(error.status)
        || networkCodes.has(error.code) || networkCodes.has(error.cause?.code)
      if (!transient) throw error

      let delay = 1000 * 2 ** (attempt - 1)
      if (rateLimited) delay = Math.max(delay, 60000)
      if (retryAfter !== undefined) {
        const seconds = Number(retryAfter)
        const until = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()
        if (Number.isFinite(until)) delay = Math.max(1000 * 2 ** (attempt - 1), until)
      }
      if (String(headers['x-ratelimit-remaining']) === '0' && reset !== undefined) {
        const until = Number(reset) * 1000 - Date.now() + 1000
        if (Number.isFinite(until)) delay = Math.max(delay, until)
      }
      if (attempt >= 3 || waited + delay > 120000) {
        core.warning(`GitHub read ${operation} failed: retry limit or 120-second wait budget reached. No further retry will be attempted.`)
        throw error
      }
      core.warning(`GitHub read ${operation} failed transiently; retry ${attempt}/2 in ${delay}ms.`)
      await new Promise(resolve => setTimeout(resolve, delay))
      waited += delay
    }
  }
}
