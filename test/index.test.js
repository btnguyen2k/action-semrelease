const process = require('process')
const cp = require('child_process')
const path = require('path')

test('test runs', () => {
  process.env['INPUT_dry-run'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN']
  const ip = path.join(__dirname, '../src/index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})
