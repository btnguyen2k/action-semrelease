const app = require('../src/app')

function setup() {
  process.env['INPUT_dry-run'] = process.env['DRY_RUN'] = 'true'
  process.env['INPUT_github-token'] = process.env['GITHUB_TOKEN'] || ''
  process.env['INPUT_tag-prefix'] = process.env['TAG_PREFIX'] || 'v'
  process.env['INPUT_auto-mode'] = process.env['AUTO_MODE'] = 'true'
  process.env['INPUT_branches'] = process.env['BRANCHES'] = 'dev'
  process.env['GITHUB_REPOSITORY'] = 'btnguyen2k/action-semrelease'
}

test('dry-run', async() => {
  setup()
  const {result, releaseVersion, releaseNotes} = await app.semrelease()
  console.log('Result: ', result)
  console.log('Release Version: ', releaseVersion)
  console.log('Release Notes: ', releaseNotes)
})
