const reBreakingChange = /^[^a-z]*(break(ing)?\s+)?change([ds])?(\([^)]+\)\s*)?:?\s+/i
const reBreakingChange1 = /^[^a-z]*\[(break(ing)?\s+)?change([ds])?]:?\s+/i
const reBreakingChange2 = /^[^a-z]*\((break(ing)?\s+)?change([ds])?\):?\s+/i
const reBreakingUpdate = /^[^a-z]*break(ing)?(\([^)]+\)\s*)?:?\s+/i
const reBreakingUpdate1 = /^[^a-z]*\[break(ing)?]:?\s+/i
const reBreakingUpdate2 = /^[^a-z]*\(break(ing)?\):?\s+/i
const reRemoved = /^[^a-z]*rem(ov(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reRemoved1 = /^[^a-z]*\[rem(ov(e|ing|es|ed))?]:?\s+/i
const reRemoved2 = /^[^a-z]*\(rem(ov(e|ing|es|ed))?\):?\s+/i
const reRemoved3 = /^[^a-z]*.+(is|are|been)( now)? removed.*/i
const reRemoved4 = /^[^a-z]*.+no longer (available|support(s|ed)?).*/i
const reRenamed = /^[^a-z]*ren(am(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reRenamed1 = /^[^a-z]*\[ren(am(e|ing|es|ed))?]:?\s+/i
const reRenamed2 = /^[^a-z]*\(ren(am(e|ing|es|ed))?\):?\s+/i
const reReplaced = /^[^a-z]*repl(ac(e|ing|es|ed))?(\([^)]+\)\s*)?:?\s+/i
const reReplaced1 = /^[^a-z]*\[repl(ac(e|ing|es|ed))?]:?\s+/i
const reReplaced2 = /^[^a-z]*\(repl(ac(e|ing|es|ed))?\):?\s+/i
const reRedesigned = /^[^a-z]*redesign(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reRedesigned1 = /^[^a-z]*\[redesign(ing|ed|s)?]:?\s+/i
const reRedesigned2 = /^[^a-z]*\(redesign(ing|ed|s)?\):?\s+/i

const reDeprecated = /^[^a-z]*depr(ecat(e|ing|ed|es))?(\([^)]+\)\s*)?:?\s+/i
const reDeprecated1 = /^[^a-z]*\[depr(ecat(e|ing|ed|es))?]:?\s+/i
const reDeprecated2 = /^[^a-z]*\(depr(ecat(e|ing|ed|es))?\):?\s+/i
const reDeprecated3 = /^[^a-z]*.+(is|are|been)( now)? deprecated.*/i
const reRefactored = /^[^a-z]*refactor(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reRefactored1 = /^[^a-z]*\[refactor(ing|ed|s)?]:?\s+/i
const reRefactored2 = /^[^a-z]*\(refactor(ing|ed|s)?\):?\s+/i
const reRefactored3 = /^[^a-z]*.+(is|are|been)( now)? refactor(ed|ing).*/i
const reAdded = /^[^a-z]*add(ing|ed|s)?(\([^)]+\)\s*)?:?\s+/i
const reAdded1 = /^[^a-z]*\[add(ing|ed|s)?]:?\s+/i
const reAdded2 = /^[^a-z]*\(add(ing|ed|s)?\):?\s+/i
const reNewFeature = /^[^a-z]*(new\s+)?feat(ure(s)?)?(\([^)]+\)\s*)?:?\s+/i
const reNewFeature1 = /^[^a-z]*\[(new\s+)?feat(ure(s)?)?]:?\s+/i
const reNewFeature2 = /^[^a-z]*\((new\s+)?feat(ure(s)?)?\):?\s+/i

const reBugFix = /^[^a-z]*fix(ing|ed|es)?(\([^)]+\)\s*)?:?\s+/i
const reBugFix1 = /^[^a-z]*\[fix(ing|ed|es)?]:?\s+/i
const reBugFix2 = /^[^a-z]*\(fix(ing|ed|es)?\):?\s+/i
const reBugFix3 = /^[^a-z]*.+(is|are|been)( now)? fix(ed|ing).*/i
const rePatch = /^[^a-z]*patch(ing|ed|es)?(\([^)]+\)\s*)?:?\s+/i
const rePatch1 = /^[^a-z]*\[patch(ing|ed|es)?]:?\s+/i
const rePatch2 = /^[^a-z]*\(patch(ing|ed|es)?\):?\s+/i
const rePatch3 = /^[^a-z]*.+(is|are|been)( now)? patch(ed|ing).*/i
const reImprovement = /^[^a-z]*impr(ov(ing|es|ed|ement)?)?(\([^)]+\)\s*)?:?\s+/i
const reImprovement1 = /^[^a-z]*\[impr(ov(ing|es|ed|ement)?)?]:?\s+/i
const reImprovement2 = /^[^a-z]*\(impr(ov(ing|es|ed|ement)?)?\):?\s+/i
const reImprovement3 = /^[^a-z]*.+(is|are|been)( now)? improv(ed|ing).*/i
const reOptimization = /^[^a-z]*optimiz(e|ing|ation|es|ed)(\([^)]+\)\s*)?:?\s+/i
const reOptimization1 = /^[^a-z]*\[optimiz(e|ing|ation|es|ed)]:?\s+/i
const reOptimization2 = /^[^a-z]*\(optimiz(e|ing|ation|es|ed)\):?\s+/i
const reOptimization3 = /^[^a-z]*.+(is|are|been)( now)? optimiz(ed|ing).*/i
const rePerformance = /^[^a-z]*perf(ormance)?(\([^)]+\)\s*)?:?\s+/i
const rePerformance1 = /^[^a-z]*\[perf(ormance)?]:?\s+/i
const rePerformance2 = /^[^a-z]*\(perf(ormance)?\):?\s+/i
const reSecurity = /^[^a-z]*sec(urity)?(\([^)]+\)\s*)?:?\s+/i
const reSecurity1 = /^[^a-z]*\[sec(urity)?]:?\s+/i
const reSecurity2 = /^[^a-z]*\(sec(urity)?\):?\s+/i
const reDependency = /^[^a-z]*dep(endenc(y|ies))?(\([^)]+\)\s*)?:?\s+/i
const reDependency1 = /^[^a-z]*\[dep(endenc(y|ies))?]:?\s+/i
const reDependency2 = /^[^a-z]*\(dep(endenc(y|ies))?\):?\s+/i

const commentRules = {
  'major': [
    {label: 'breaking change', re: reBreakingChange}, // breaking changes
    {label: 'breaking change', re: reBreakingChange1}, // breaking changes
    {label: 'breaking change', re: reBreakingChange2}, // breaking changes
    {label: 'breaking change', re: reBreakingUpdate}, // other breaking updates
    {label: 'breaking change', re: reBreakingUpdate1}, // other breaking updates
    {label: 'breaking change', re: reBreakingUpdate2}, // other breaking updates
    {label: 'breaking change', re: reRemoved}, // removed features
    {label: 'breaking change', re: reRemoved1}, // removed features
    {label: 'breaking change', re: reRemoved2}, // removed features
    {label: 'breaking change', re: reRemoved3}, // removed features
    {label: 'breaking change', re: reRemoved4}, // removed features
    {label: 'breaking change', re: reRenamed}, // renamed items
    {label: 'breaking change', re: reRenamed1}, // renamed items
    {label: 'breaking change', re: reRenamed2}, // renamed items
    {label: 'breaking change', re: reReplaced}, // replaced items
    {label: 'breaking change', re: reReplaced1}, // replaced items
    {label: 'breaking change', re: reReplaced2}, // replaced items
    {label: 'breaking change', re: reRedesigned}, // redesigned functionality
    {label: 'breaking change', re: reRedesigned1}, // redesigned functionality
    {label: 'breaking change', re: reRedesigned2}, // redesigned functionality
  ],
  'minor': [
    {label: 'deprecated feature update', re: reDeprecated}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated1}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated2}, // deprecated features
    {label: 'deprecated feature update', re: reDeprecated3}, // deprecated features
    {label: 'refactoring update', re: reRefactored}, // refactoring
    {label: 'refactoring update', re: reRefactored1}, // refactoring
    {label: 'refactoring update', re: reRefactored2}, // refactoring
    {label: 'refactoring update', re: reRefactored3}, // refactoring
    {label: 'new functionality update', re: reAdded}, // added functionality
    {label: 'new functionality update', re: reAdded1}, // added functionality
    {label: 'new functionality update', re: reAdded2}, // added functionality
    {label: 'new feature update', re: reNewFeature}, // new features
    {label: 'new feature update', re: reNewFeature1}, // new features
    {label: 'new feature update', re: reNewFeature2}, // new features
  ],
  'patch': [
    {label: 'bug fix update', re: reBugFix}, // bug fixes
    {label: 'bug fix update', re: reBugFix1}, // bug fixes
    {label: 'bug fix update', re: reBugFix2}, // bug fixes
    {label: 'bug fix update', re: reBugFix3}, // bug fixes
    {label: 'patch update', re: rePatch}, // other patches
    {label: 'patch update', re: rePatch1}, // other patches
    {label: 'patch update', re: rePatch2}, // other patches
    {label: 'patch update', re: rePatch3}, // other patches
    {label: 'improvement update', re: reImprovement}, // improvements
    {label: 'improvement update', re: reImprovement1}, // improvements
    {label: 'improvement update', re: reImprovement2}, // improvements
    {label: 'improvement update', re: reImprovement3}, // improvements
    {label: 'optimization update', re: reOptimization}, // optimizations
    {label: 'optimization update', re: reOptimization1}, // optimizations
    {label: 'optimization update', re: reOptimization2}, // optimizations
    {label: 'optimization update', re: reOptimization3}, // optimizations
    {label: 'performance update', re: rePerformance}, // performance improvements
    {label: 'performance update', re: rePerformance1}, // performance improvements
    {label: 'performance update', re: rePerformance2}, // performance improvements
    {label: 'security update', re: reSecurity}, // security updates
    {label: 'security update', re: reSecurity1}, // security updates
    {label: 'security update', re: reSecurity2}, // security updates
    {label: 'dependency update', re: reDependency}, // dependency updates
    {label: 'dependency update', re: reDependency1}, // dependency updates
    {label: 'dependency update', re: reDependency2}, // dependency updates
  ],
}

const releaseNotesSections = [
  {
    title: '### Changes',
    rules: [
      reBreakingChange, reBreakingChange1, reBreakingChange2,
      reBreakingUpdate, reBreakingUpdate1, reBreakingUpdate2,
      reRenamed, reRenamed1, reRenamed2,
      reReplaced, reReplaced1, reReplaced2,
      reRedesigned, reRedesigned1, reRedesigned2
    ]
  },
  {
    title: '### Removed',
    rules: [reRemoved, reRemoved1, reRemoved2, reRemoved3, reRemoved4]
  },
  {
    title: '### Added/Refactoring/Deprecation',
    rules: [
      reDeprecated, reDeprecated1, reDeprecated2, reDeprecated3,
      reRefactored, reRefactored1, reRefactored2, reRefactored3,
      reAdded, reAdded1, reAdded2,
      reNewFeature, reNewFeature1, reNewFeature2
    ]
  },
  {
    title: '### Fixed/Improvements',
    rules: [
      reBugFix, reBugFix1, reBugFix2, reBugFix3,
      rePatch, rePatch1, rePatch2, rePatch3,
      reImprovement, reImprovement1, reImprovement2, reImprovement3,
      reOptimization, reOptimization1, reOptimization2, reOptimization3,
      rePerformance, rePerformance1, rePerformance2
    ]
  },
  {
    title: '### Security',
    rules: [reSecurity, reSecurity1, reSecurity2]
  },
  {
    title: '### Others',
    rules: [reDependency, reDependency1, reDependency2]
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
