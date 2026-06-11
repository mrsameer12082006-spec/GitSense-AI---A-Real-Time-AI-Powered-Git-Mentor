/**
 * Builds a structured, dense context string from repository data.
 *
 * @param {Object} repoData
 * @param {string} repoData.owner
 * @param {string} repoData.name
 * @param {string} [repoData.description]
 * @param {string} [repoData.language]
 * @param {string} [repoData.default_branch]
 * @param {number} [repoData.stargazers_count]
 * @param {number} [repoData.forks_count]
 * @param {number} [repoData.open_issues_count]
 * @param {Array} [repoData.branches]
 * @param {Array} [repoData.recent_commits]
 * @param {Array} [repoData.open_issues]
 * @returns {string} Structured context string
 */
export default function buildRepoContext(repoData) {
  const {
    owner = 'Unknown',
    name = 'Unknown',
    description = 'No description',
    language = 'Unknown',
    default_branch = 'main',
    stargazers_count = 0,
    forks_count = 0,
    open_issues_count = 0,
    branches = [],
    recent_commits = [],
    open_issues = []
  } = repoData || {};

  const branchList = Array.isArray(branches)
    ? branches.slice(0, 10).map(b => typeof b === 'string' ? b : (b.name || '')).filter(Boolean).join(', ')
    : 'N/A';

  const commitList = Array.isArray(recent_commits)
    ? recent_commits.slice(0, 5).map(c => {
        const sha = c.sha?.slice(0, 7) || 'N/A';
        const author = c.commit?.author?.name || c.author || 'Unknown';
        const message = c.commit?.message?.split('\n')[0] || c.message || 'No message';
        return `- ${sha} | ${author} | ${message}`;
      }).join('\n')
    : 'No commits found';

  const issueList = Array.isArray(open_issues)
    ? open_issues.slice(0, 5).map(i => `- #${i.number} | ${i.title} | ${i.state}`).join('\n')
    : 'No open issues';

  return `REPOSITORY CONTEXT:
- Repo: ${owner}/${name}
- Description: ${description}
- Language: ${language}
- Default Branch: ${default_branch}
- Stars: ${stargazers_count} | Forks: ${forks_count} | Open Issues: ${open_issues_count}

RECENT BRANCHES: ${branchList || 'N/A'}

RECENT COMMITS (last 5):
${commitList}

OPEN ISSUES (top 5):
${issueList}`;
}
