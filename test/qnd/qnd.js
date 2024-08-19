const utils = require('../../src/utils')
const github = require('@actions/github')

function getOctokitInstance() {
  const githubToken = process.env['GITHUB_TOKEN'] || ''
  if (!githubToken) {
    console.log('SKIPPED: GITHUB_TOKEN not set')
    return null
  }
  return github.getOctokit(githubToken)
}

async function main() {
  const octokit = getOctokitInstance()
  if (!octokit) {
    console.log('octokit not available')
    return
  }

  // const reBreakingChange = /^[^a-z]*(break(ing)?\s+)?change([ds])?(\([^)]+\)\s*)?:?\s+/i
  // const reBreakingUpdate = /^[^a-z]*break(ing)?(\([^)]+\)\s*)?:?\s+/i
  // const reRemoved = /^[^a-z]*rem(ove([ds])?)?(\([^)]+\)\s*)?:?\s+/i
  // const reRenamed = /^[^a-z]*ren(ame([ds])?)?(\([^)]+\)\s*)?:?\s+/i
  // const reReplaced = /^[^a-z]*repl(ace([ds])?)?(\([^)]+\)\s*)?:?\s+/i
  // const reRedesigned = /^[^a-z]*redesign(ed|s)?(\([^)]+\)\s*)?:?\s+/i
  //
  // const reDeprecated = /^[^a-z]*depr(ecate([ds])?)?(\([^)]+\)\s*)?:?\s+/i
  // const reRefactored = /^[^a-z]*refactor(ed|s)?(\([^)]+\)\s*)?:?\s+/i
  // const reNew = /^[^a-z]*add(ed|s)?(\([^)]+\)\s*)?:?\s+/i
  // const reAdded = /^[^a-z]*(new\s+)?feat(ure)?(\([^)]+\)\s*)?:?\s+/i
  //
  // const reBugFix = /^[^a-z]*fix(ed|es)?(\([^)]+\)\s*)?:?\s+/i
  // const rePatch = /^[^a-z]*patch(ed|es)?(\([^)]+\)\s*)?:?\s+/i
  // const reImprovement = /^[^a-z]*improve(s|d|ment)?(\([^)]+\)\s*)?:?\s+/i
  // const reDependency = /^[^a-z]*dep(endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
  // const rePerformance = /^[^a-z]*perf(ormance)?(\([^)]+\)\s*)?:?\s+/i
  // const reOptimization = /^[^a-z]*optimiz(e|ation|es|ed)(\([^)]+\)\s*)?:?\s+/i
  // const reSecurity = /^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i
  //
  // const releaseNotesSections = [
  //   {
  //     title: '### Changes',
  //     rules: [reBreakingChange, reBreakingUpdate, reRenamed, reReplaced, reRedesigned]
  //   },
  //   {
  //     title: '### Removed',
  //     rules: [reRemoved]
  //   },
  //   {
  //     title: '### Added/Refactoring',
  //     rules: [reDeprecated, reRefactored, reNew, reAdded]
  //   },
  //   {
  //     title: '### Fixed/Improvement',
  //     rules: [reBugFix, rePatch, reImprovement, rePerformance, reOptimization]
  //   },
  //   {
  //     title: '### Security',
  //     rules: [reSecurity]
  //   },
  //   {
  //     title: '### Other',
  //     rules: [reDependency]
  //   }
  // ]

  const commits = await utils.getAllCommits(octokit)
  const commitMessages = commits.map(commit => commit.commit.message)

  const rules = require('../../src/rules')
  const releaseNotes = rules.generateReleaseNotes(commitMessages)
  console.log(releaseNotes)
}

main().catch(error => {console.log(error)})
