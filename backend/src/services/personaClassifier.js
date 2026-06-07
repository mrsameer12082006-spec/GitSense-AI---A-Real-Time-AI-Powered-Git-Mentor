// ─────────────────────────────────────────────────────────────
// GitSense AI — Persona Classifier (Adaptive Language System)
//
// Automatically detects user experience level (1-4) and injects
// the appropriate language rules into the AI system prompt.
// ─────────────────────────────────────────────────────────────

// ── Vocabulary keyword sets by level ──
const LEVEL_4_KEYWORDS = [
  'reflog', 'bisect', 'blame', 'worktree', 'blob', 'tree object',
  'head detached', 'detached head', 'interactive rebase', 'octopus merge',
  'fast-forward', 'three-way merge', 'rerere', 'submodule', 'subtree',
  'git internals', 'packfile', 'dangling commit', 'orphan branch',
  'plumbing', 'porcelain', 'object database', 'blast radius',
  'technical debt', 'churn rate', 'code ownership', 'bus factor',
  'cyclomatic complexity', 'coupling', 'cohesion'
];

const LEVEL_3_KEYWORDS = [
  'rebase', 'squash', 'cherry-pick', 'cherry pick', 'ci', 'cd',
  'pipeline', 'staging', 'stash', 'reset --hard', 'reset --soft',
  'amend', 'force push', 'upstream', 'origin', 'remote tracking',
  'merge conflict', 'resolve conflict', 'branching strategy',
  'gitflow', 'trunk-based', 'feature flag', 'hotfix', 'release branch',
  'code review', 'pr review', 'merge strategy', 'revert'
];

const LEVEL_2_KEYWORDS = [
  'branch', 'commit', 'push', 'pull', 'clone', 'merge', 'checkout',
  'add', 'git status', 'git log', 'git diff', 'fetch', 'remote',
  'pull request', 'pr', 'issue', 'fork', 'repository', 'repo',
  'main', 'master', 'head', 'tag', 'release'
];

// ── Question structure patterns ──
const LEVEL_4_PATTERNS = [
  /\b(analyze|identify|assess|evaluate|audit|measure|quantify)\b/i,
  /\b(blast radius|impact analysis|risk assessment|health score)\b/i,
  /\b(pattern|trend|metric|signal|indicator)\b/i,
  /\bwhat('s| is) the (health|state|risk|quality)\b/i,
];

const LEVEL_3_PATTERNS = [
  /\bshould I .+ or .+/i,
  /\b(best practice|best approach|trade-?off|strategy)\b/i,
  /\bwhy is (the )?ci\b/i,
  /\bwhat('s| is) the best (way|approach|strategy)\b/i,
  /\bhow (should|would) (I|we|you)\b/i,
];

const LEVEL_2_PATTERNS = [
  /\bhow (do|can|to) I\b/i,
  /\bwhat (should|do) I\b/i,
  /\bcan I\b/i,
  /\bI (need|want) to\b/i,
  /\bstep by step\b/i,
  /\bhelp me\b/i,
];

const LEVEL_1_PATTERNS = [
  /\bwhat is (a |an )?(commit|branch|merge|pull request|repository|fork|pr)\b/i,
  /\bwhat (did|has) the team\b/i,
  /\bis the project\b/i,
  /\bhow many (bugs|issues|updates|changes)\b/i,
  /\bwhat does .+ mean\b/i,
  /\bwhat happened\b/i,
  /\bproject (status|health|progress|update)\b/i,
  /\bteam (activity|update|progress)\b/i,
];

class PersonaClassifier {
  /**
   * Classify the user's experience level based on their message
   * and conversation history.
   *
   * @param {string} message - Current user message
   * @param {{ role: string, content: string }[]} history - Previous messages
   * @returns {{ level: number, label: string, confidence: number }}
   */
  classify(message, history = []) {
    const vocabScore = this._scoreVocabulary(message);
    const structureScore = this._scoreQuestionStructure(message);
    const historyModifier = this._scoreHistory(history);

    // Average the first two scores, then apply history modifier
    const rawScore = (vocabScore + structureScore) / 2 + historyModifier;

    // Clamp to [1, 4] and round
    const level = Math.max(1, Math.min(4, Math.round(rawScore)));

    const labels = {
      1: 'Non-Technical / Project Manager',
      2: 'Junior Developer',
      3: 'Mid-Level Developer',
      4: 'Senior Developer / Tech Lead',
    };

    return {
      level,
      label: labels[level],
      confidence: Math.abs(rawScore - level) < 0.3 ? 'high' : 'medium',
    };
  }

  /**
   * Signal 1: Vocabulary-based scoring
   */
  _scoreVocabulary(message) {
    const lower = message.toLowerCase();

    // Check from highest to lowest
    for (const keyword of LEVEL_4_KEYWORDS) {
      if (lower.includes(keyword)) return 4;
    }
    for (const keyword of LEVEL_3_KEYWORDS) {
      if (lower.includes(keyword)) return 3;
    }
    for (const keyword of LEVEL_2_KEYWORDS) {
      if (lower.includes(keyword)) return 2;
    }

    // No git/technical keywords found
    return 1;
  }

  /**
   * Signal 2: Question structure scoring
   */
  _scoreQuestionStructure(message) {
    for (const pattern of LEVEL_4_PATTERNS) {
      if (pattern.test(message)) return 4;
    }
    for (const pattern of LEVEL_3_PATTERNS) {
      if (pattern.test(message)) return 3;
    }
    for (const pattern of LEVEL_2_PATTERNS) {
      if (pattern.test(message)) return 2;
    }
    for (const pattern of LEVEL_1_PATTERNS) {
      if (pattern.test(message)) return 1;
    }

    // Default to mid-level if question structure is ambiguous
    return 2;
  }

  /**
   * Signal 3: Conversation history modifier
   */
  _scoreHistory(history) {
    if (!history || history.length === 0) return 0;

    const userMessages = history
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .slice(-5); // Look at last 5 user messages

    if (userMessages.length === 0) return 0;

    let modifier = 0;

    // Check if user has used advanced terms correctly in prior messages
    const allText = userMessages.join(' ').toLowerCase();
    const advancedTermsUsed = LEVEL_4_KEYWORDS.filter(k => allText.includes(k));
    const intermediateTermsUsed = LEVEL_3_KEYWORDS.filter(k => allText.includes(k));

    if (advancedTermsUsed.length >= 2) modifier += 1;
    else if (intermediateTermsUsed.length >= 3) modifier += 0.5;

    // Check for signs of confusion (basic Git mistakes)
    const confusionSignals = [
      /what('s| is) (a )?(commit|branch|merge)/i,
      /I don'?t (understand|know|get)/i,
      /what does .+ mean/i,
      /confused/i,
      /help me understand/i,
    ];

    const confusionCount = confusionSignals.filter(p =>
      userMessages.some(msg => p.test(msg))
    ).length;

    if (confusionCount >= 2) modifier -= 1;
    else if (confusionCount === 1) modifier -= 0.5;

    return modifier;
  }

  /**
   * Get the persona-specific system prompt rules.
   * @param {number} level - 1 to 4
   * @returns {string}
   */
  getPersonaRules(level) {
    const rules = {
      1: `## LANGUAGE ADAPTATION — PERSONA: Non-Technical User / Project Manager
TONE: Warm, patient, reassuring — like a knowledgeable colleague explaining over coffee.
RULES:
- Use ZERO technical jargon. Replace every Git term with plain English.
- "commit" → "a saved change" or "an update someone made"
- "branch" → "a separate working copy of the project"
- "merge" → "combining two versions of the work together"
- "pull request" → "a proposal to add new work that needs team approval"
- "repository" → "the project folder where all the code lives"
- "CI pipeline" → "the automatic testing system"
- Use analogies from everyday life.
- NEVER show raw Git commands. Show outcomes and summaries only.
- NEVER use the words "simply", "just", or "easy".
- Explain what something DOES before explaining what it IS CALLED.`,

      2: `## LANGUAGE ADAPTATION — PERSONA: Junior Developer
TONE: Encouraging, clear — like a senior developer doing a friendly code review.
RULES:
- Use correct technical terms but ALWAYS define them briefly the first time.
- Show actual Git commands they need to run.
- Explain what each command does in ONE simple sentence before showing it.
- Give step-by-step instructions, numbered clearly.
- Warn about risks BEFORE any destructive action.
- Validate their thinking when they are on the right track.
- Use encouraging language.
- Show examples using their actual branch names and repo context.
- NEVER use the words "simply", "just", or "easy".`,

      3: `## LANGUAGE ADAPTATION — PERSONA: Mid-Level Developer
TONE: Direct, collegial — like two experienced engineers at a whiteboard.
RULES:
- Use full technical vocabulary without explanation.
- Reference specific files, commit hashes, and branch names from context directly.
- Discuss tradeoffs between approaches.
- Give a recommendation WITH reasoning.
- Show commands without over-explaining them.
- Point out non-obvious implications.
- Trust them to handle complexity.`,

      4: `## LANGUAGE ADAPTATION — PERSONA: Senior Developer / Tech Lead
TONE: Concise, data-first — like a technical report that respects the reader's time.
RULES:
- Be maximally concise and data-dense.
- Lead with the answer, follow with evidence.
- NO step-by-step hand-holding.
- Reference raw data: commit hashes, line counts, churn patterns, PR cycle times.
- Use technical terminology freely including Git internals.
- Offer PROACTIVE observations if the data shows something important.
- Skip all explanatory scaffolding.`,
    };

    return rules[level] || rules[2];
  }
}

export default new PersonaClassifier();
