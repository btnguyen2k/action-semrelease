const process = require('process')
const cp = require('child_process')
const path = require('path')

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['INPUT_dry-run'] = 'true'
  const ip = path.join(__dirname, '../src/index.js')
  const result = cp.execSync(`node ${ip}`, {env: process.env}).toString()
  console.log(result)
})
