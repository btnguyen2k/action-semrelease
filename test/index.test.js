const cp = require('child_process')
const path = require('path')

test('test dry-run', () => {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] || 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'

  const ip = path.join(__dirname, '../src/index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})
