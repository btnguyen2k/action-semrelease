const reBreakingChange = /^[^a-z]*(break(ing)?\s+)?change([ds])?(\([^)]+\)\s*)?:?\s+/i
const reBreakingUpdate = /^[^a-z]*break(ing)?(\([^)]+\)\s*)?:?\s+/i
const reRemoved = /^[^a-z]*rem(ove([ds])?)?(\([^)]+\)\s*)?:?\s+/i
const reRenamed = /^[^a-z]*ren(ame([ds])?)?(\([^)]+\)\s*)?:?\s+/i
const reReplaced = /^[^a-z]*repl(ace([ds])?)?(\([^)]+\)\s*)?:?\s+/i
const reRedesigned = /^[^a-z]*redesign(ed|s)?(\([^)]+\)\s*)?:?\s+/i

const reDeprecated = /^[^a-z]*depr(ecate([ds])?)?(\([^)]+\)\s*)?:?\s+/i
const reRefactored = /^[^a-z]*refactor(ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reNew = /^[^a-z]*add(ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reAdded = /^[^a-z]*(new\s+)?feat(ure)?(\([^)]+\)\s*)?:?\s+/i

const reBugFix = /^[^a-z]*fix(ed|es)?(\([^)]+\)\s*)?:?\s+/i
const rePatch = /^[^a-z]*patch(ed|es)?(\([^)]+\)\s*)?:?\s+/i
const reImprovement = /^[^a-z]*improve(s|d|ment)?(\([^)]+\)\s*)?:?\s+/i
const reDependency = /^[^a-z]*dep(endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
const rePerformance = /^[^a-z]*perf(ormance)?(\([^)]+\)\s*)?:?\s+/i
const reOptimization = /^[^a-z]*optimiz(e|ation|es|ed)(\([^)]+\)\s*)?:?\s+/i
const reSecurity = /^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i

const commentRules = {
  'major': [
    {label: 'breaking change', re: reBreakingChange}, // breaking changes
    {label: 'breaking change', re: reBreakingUpdate}, // other breaking updates
    {label: 'breaking change', re: reRemoved}, // removed features
    {label: 'breaking change', re: reRenamed}, // renamed items
    {label: 'breaking change', re: reReplaced}, // replaced items
    {label: 'breaking change', re: reRedesigned}, // redesigned functionality
  ],
  'minor': [
    {label: 'deprecated feature update', re: reDeprecated}, // deprecated features
    {label: 'refactoring update', re: reRefactored}, // refactoring
    {label: 'new feature update', re: reNew}, // added functionality
    {label: 'new feature update', re: reAdded}, // new features
  ],
  'patch': [
    {label: 'bug fix update', re: reBugFix}, // bug fixes
    {label: 'patch update', re: rePatch}, // other patches
    {label: 'improvement update', re: reImprovement}, // improvements
    {label: 'dependency update', re: reDependency}, // dependency updates
    {label: 'performance update', re: rePerformance}, // performance improvements
    {label: 'optimization update', re: reOptimization}, // optimizations
    {label: 'security update', re: reSecurity}, // security updates
  ],
}

const releaseNotesSections = [
  {
    title: '### Changes',
    rules: [reBreakingChange, reBreakingUpdate, reRenamed, reReplaced, reRedesigned]
  },
  {
    title: '### Removed',
    rules: [reRemoved]
  },
  {
    title: '### Added/Refactoring',
    rules: [reDeprecated, reRefactored, reNew, reAdded]
  },
  {
    title: '### Fixed/Improvement',
    rules: [reBugFix, rePatch, reImprovement, rePerformance, reOptimization]
  },
  {
    title: '### Security',
    rules: [reSecurity]
  },
  {
    title: '### Others',
    rules: [reDependency]
  }
]

module.exports = {
  parseCommitMessages,
  generateReleaseNotes
}

/**
 * Parse commit messages and call callback functions when a rule is matched.
 * @param commitMessages
 * @param callbackBumpMajor
 * @param callbackBumpMinor
 * @param callbackBumpPatch
 */
function parseCommitMessages(commitMessages, callbackBumpMajor, callbackBumpMinor, callbackBumpPatch) {
  for (const msg of commitMessages) {
    let rule = commentRules.major.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpMajor(rule, msg)
    }

    rule = commentRules.minor.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpMinor(rule, msg)
    }

    rule = commentRules.patch.find(rule => msg.match(rule.re))
    if (rule) {
      callbackBumpPatch(rule, msg)
    }
  }
}

/**
 * Generate release notes text from commit messages.
 * @param commitMessages
 * @returns {string}
 */
function generateReleaseNotes(commitMessages) {
  const sections = releaseNotesSections.map(section => {
    const messages = commitMessages.filter(message => {
      return section.rules.some(rule => rule.test(message))
    }).map(message => '- ' + message.charAt(0).toUpperCase() + message.slice(1)) // capitalize the first letter && create bullet points

    return {title: section.title, messages}
  })

  const releaseNotes = sections.map(section => {
    if (section.messages.length > 0) {
      return `${section.title}\n\n${section.messages.join('\n')}\n\n`
    }
  }).join('')

  return releaseNotes.trim()
}
