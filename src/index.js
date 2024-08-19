const core = require('@actions/core')

async function run() {
  const app = require('./app')
  const {result, releaseVersion, releaseNotes} = await app.semrelease()
  core.setOutput('result', result)
  core.setOutput('releaseVersion', releaseVersion)
  core.setOutput('releaseNotes', releaseNotes)
}

run().then(() => console.log(`✅ DONE.`)).catch(e => {
  console.log(`❌ ${e}`)
  core.setOutput('result', 'FAILED')
  core.setFailed(`❌ ${e.message}`)
})
