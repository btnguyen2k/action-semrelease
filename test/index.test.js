const cp = require('child_process')
const path = require('path')

test('test dry-run/non-auto', () => {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'false'

  const ip = path.join(__dirname, '../src/index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})

test('test dry-run/auto-mode', () => {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'true'
  process.env['INPUT_branches'] = process.env['BRANCHES'] = 'main,dev'

  const ip = path.join(__dirname, '../src/index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})
