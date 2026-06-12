// ─────────────────────────────────────────────────────────────
// GitSense AI — Git Error Detector & Diagnostic Command Generator
//
// Detects Git error types from user messages and generates
// structured fix commands for the frontend execution panel.
// ─────────────────────────────────────────────────────────────

const ERROR_PATTERNS = {
  merge_conflict: [
    /merge conflict/i,
    /conflict(?:s|ed|ing)?\s+(?:in|with|between|on)/i,
    /CONFLICT\s*\(content\)/i,
    /both modified/i,
    /fix conflicts?\s+and\s+then/i,
    /<<<<<<</,
    /=======/,
    />>>>>>>/,
    /unmerged\s+(?:files|paths)/i,
    /needs merge/i,
    /automatic merge failed/i,
    /merge\s+(?:is\s+)?not\s+possible/i,
  ],

  push_rejected: [
    /\[rejected\]/i,
    /failed to push/i,
    /push\s+(?:was\s+)?rejected/i,
    /non-fast-forward/i,
    /updates were rejected/i,
    /tip of your current branch is behind/i,
    /fetch first/i,
    /cannot push/i,
    /remote rejected/i,
    /error:\s+failed\s+to\s+push/i,
  ],

  build_error: [
    /build fail/i,
    /compilation error/i,
    /syntax error/i,
    /module not found/i,
    /cannot find module/i,
    /npm\s+err/i,
    /yarn\s+error/i,
    /enoent/i,
    /command failed/i,
    /exit code [1-9]/i,
    /segmentation fault/i,
  ],

  not_git_repo: [
    /not a git repository/i,
    /fatal:\s+not\s+a\s+git/i,
    /\.git.*does not exist/i,
    /git init/i,
    /no \.git/i,
  ],

  branch_error: [
    /branch.*(?:not found|doesn't exist|does not exist)/i,
    /pathspec.*did not match/i,
    /cannot delete.*checked out/i,
    /already exists/i,
    /invalid ref/i,
    /refname.*is ambiguous/i,
    /cannot checkout/i,
    /error.*switch/i,
    /detached head/i,
    /HEAD detached/i,
  ],

  permission_error: [
    /permission denied/i,
    /access denied/i,
    /authentication failed/i,
    /could not read from remote/i,
    /403\s+forbidden/i,
    /401\s+unauthorized/i,
    /fatal:.*authentication/i,
    /ssh.*permission/i,
    /credential/i,
    /token.*expired/i,
    /invalid.*token/i,
  ],
};

/**
 * Detect the Git error type from a user message.
 * @param {string} message - The user's chat message
 * @returns {{ errorType: string, confidence: number } | null}
 */
export function detectGitError(message) {
  if (!message || message.trim().length < 5) return null;

  const msg = message.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const [errorType, patterns] of Object.entries(ERROR_PATTERNS)) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      const score = matchCount / patterns.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = errorType;
      }
    }
  }

  if (bestMatch && bestScore > 0) {
    return { errorType: bestMatch, confidence: bestScore };
  }

  return null;
}

/**
 * Generate a structured diagnostic response for a detected Git error.
 * @param {string} errorType
 * @param {string} branchName - Current branch name
 * @param {string} repoName - Connected repo name
 * @returns {{ title: string, explanation: string, commands: Array }}
 */
export function generateDiagnosticCommands(errorType, branchName = 'main', repoName = '') {
  const branch = branchName || 'main';

  const diagnostics = {
    merge_conflict: {
      title: 'Merge Conflict Detected',
      explanation: `There are conflicting changes between branches that Git cannot automatically resolve. You need to manually review the conflicted files, choose which changes to keep, and then commit the resolution.`,
      commands: [
        { step: 1, desc: 'Check conflicted files', cmd: 'git status', expectedOutput: 'Lists files marked as "both modified"' },
        { step: 2, desc: 'View conflict markers in files', cmd: 'git diff --name-only --diff-filter=U', expectedOutput: 'Shows only unmerged file paths' },
        { step: 3, desc: 'After resolving, stage fixes', cmd: 'git add .', expectedOutput: 'All resolved files staged for commit' },
        { step: 4, desc: 'Complete the merge commit', cmd: 'git commit -m "resolve: merge conflicts"', expectedOutput: 'Merge commit created successfully' },
        { step: 5, desc: 'Push resolved changes', cmd: `git push origin ${branch}`, expectedOutput: 'Changes pushed to remote' },
      ]
    },

    push_rejected: {
      title: 'Push Rejected by Remote',
      explanation: `Your local branch is behind the remote branch. The remote has commits that your local branch doesn't have yet. You need to pull the latest changes first, resolve any conflicts, and then push again.`,
      commands: [
        { step: 1, desc: 'Check current branch status', cmd: 'git status', expectedOutput: 'Shows your branch is behind origin' },
        { step: 2, desc: 'Pull and rebase remote changes', cmd: `git pull --rebase origin ${branch}`, expectedOutput: 'Successfully rebased on remote changes' },
        { step: 3, desc: 'Verify no conflicts remain', cmd: 'git status', expectedOutput: 'Working tree clean, nothing to commit' },
        { step: 4, desc: 'Push updated branch', cmd: `git push origin ${branch}`, expectedOutput: 'Push successful with new commits' },
      ]
    },

    build_error: {
      title: 'Build or Dependency Error',
      explanation: `The project encountered a build or dependency installation error. This is often caused by missing packages, incompatible versions, or corrupted node_modules. Try cleaning and reinstalling.`,
      commands: [
        { step: 1, desc: 'Remove node_modules and lockfile', cmd: 'rm -rf node_modules package-lock.json', expectedOutput: 'Old dependencies removed' },
        { step: 2, desc: 'Clear npm cache', cmd: 'npm cache clean --force', expectedOutput: 'Cache cleared successfully' },
        { step: 3, desc: 'Reinstall all dependencies', cmd: 'npm install', expectedOutput: 'All packages installed without errors' },
        { step: 4, desc: 'Try building again', cmd: 'npm run build', expectedOutput: 'Build completes without errors' },
      ]
    },

    not_git_repo: {
      title: 'Not a Git Repository',
      explanation: `The current directory is not initialized as a Git repository. You need to either initialize a new repo or clone an existing one.`,
      commands: [
        { step: 1, desc: 'Check current directory', cmd: 'pwd', expectedOutput: 'Shows your current working directory' },
        { step: 2, desc: 'Initialize a new Git repo', cmd: 'git init', expectedOutput: 'Initialized empty Git repository' },
        { step: 3, desc: 'Verify Git is initialized', cmd: 'git status', expectedOutput: 'Shows branch info (initial commit)' },
      ]
    },

    branch_error: {
      title: 'Branch Operation Failed',
      explanation: `The branch operation failed — the target branch may not exist, is already checked out, or the ref name is invalid. Let's diagnose the exact issue.`,
      commands: [
        { step: 1, desc: 'List all local branches', cmd: 'git branch -a', expectedOutput: 'Lists all local and remote branches' },
        { step: 2, desc: 'Show current branch', cmd: 'git branch --show-current', expectedOutput: 'Shows active branch name' },
        { step: 3, desc: 'Fetch latest remote refs', cmd: 'git fetch --all --prune', expectedOutput: 'Remote refs updated and stale refs pruned' },
        { step: 4, desc: 'Check branch tracking status', cmd: 'git branch -vv', expectedOutput: 'Shows tracking info for each branch' },
      ]
    },

    permission_error: {
      title: 'Authentication/Permission Error',
      explanation: `Git cannot authenticate with the remote server. Your credentials (SSH key, token, or password) may be expired, invalid, or not configured for this repository.`,
      commands: [
        { step: 1, desc: 'Check remote URL configuration', cmd: 'git remote -v', expectedOutput: 'Shows fetch/push URLs for remotes' },
        { step: 2, desc: 'Test SSH connection to GitHub', cmd: 'ssh -T git@github.com', expectedOutput: 'Authenticated as your GitHub username' },
        { step: 3, desc: 'Verify credential helper', cmd: 'git config --global credential.helper', expectedOutput: 'Shows configured credential helper' },
      ]
    },

    generic: {
      title: 'Git Diagnostic Check',
      explanation: `The error is ambiguous. Running diagnostic commands to understand the current state of your repository.`,
      commands: [
        { step: 1, desc: 'Check repository status', cmd: 'git status', expectedOutput: 'Shows working tree and staging area state' },
        { step: 2, desc: 'View recent commit history', cmd: 'git log --oneline -5', expectedOutput: 'Shows last 5 commits in compact format' },
        { step: 3, desc: 'Check remote configuration', cmd: 'git remote -v', expectedOutput: 'Shows configured remote URLs' },
        { step: 4, desc: 'Verify current branch', cmd: 'git branch --show-current', expectedOutput: 'Shows active branch name' },
      ]
    },
  };

  return diagnostics[errorType] || diagnostics.generic;
}

/**
 * Build the full structured diagnosis object for the frontend.
 * @param {string} userMessage
 * @param {string} branchName
 * @param {string} repoName
 * @returns {{ errorType: string, title: string, explanation: string, commands: Array } | null}
 */
export function diagnoseGitError(userMessage, branchName = 'main', repoName = '') {
  const detection = detectGitError(userMessage);
  if (!detection) return null;

  const { errorType } = detection;
  const diagnostic = generateDiagnosticCommands(errorType, branchName, repoName);

  return {
    errorType,
    ...diagnostic,
  };
}

export default { detectGitError, generateDiagnosticCommands, diagnoseGitError };
