import * as core from '@actions/core'
import * as app from './app.js'

async function run() {
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
