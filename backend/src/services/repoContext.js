import githubService from './github.js';

/**
 * Repository Context Builder
 * 
 * Fetches the current state of a GitHub repository and converts
 * raw API data into a structured, human-readable context string
 * that can be injected into an AI system prompt.
 */
class RepoContextService {
  /**
   * Build a complete context string for the AI from repository data.
   * @param {{ owner: string, name: string }} repo
   * @param {string|null} token — GitHub access token
   * @returns {Promise<string>}
   */
  async buildContext(repo, token = null) {
    const { owner, name } = repo;

    // Fetch all data concurrently
    const [details, commits, prs, issues, contributors, branches, workflows] = await Promise.allSettled([
      githubService.getRepoDetails(owner, name, token),
      githubService.getCommits(owner, name, token, 10),
      githubService.getPullRequests(owner, name, token),
      githubService.getIssues(owner, name, token),
      githubService.getContributors(owner, name, token),
      githubService.getBranches(owner, name, token),
      githubService.getWorkflowRuns(owner, name, token),
    ]);

    const d = details.status === 'fulfilled' ? details.value : {};
    const c = commits.status === 'fulfilled' ? commits.value : [];
    const p = prs.status === 'fulfilled' ? prs.value : [];
    const i = issues.status === 'fulfilled' ? issues.value : [];
    const co = contributors.status === 'fulfilled' ? contributors.value : [];
    const b = branches.status === 'fulfilled' ? branches.value : [];
    const w = workflows.status === 'fulfilled' ? workflows.value : [];

    // Build structured context
    const sections = [];

    // Repository Overview
    sections.push(`## Repository: ${d.fullName || `${owner}/${name}`}`);
    sections.push(`- **Default Branch**: ${d.defaultBranch || 'main'}`);
    sections.push(`- **Language**: ${d.language || 'Unknown'}`);
    sections.push(`- **Visibility**: ${d.isPrivate ? 'Private' : 'Public'}`);
    sections.push(`- **Stars**: ${d.starCount ?? 'N/A'} | **Forks**: ${d.forkCount ?? 'N/A'}`);
    if (d.description) sections.push(`- **Description**: ${d.description}`);

    // Branches
    if (b.length > 0) {
      sections.push(`\n## Branches (${b.length} total)`);
      b.slice(0, 10).forEach((br) => {
        sections.push(`- \`${br.name}\`${br.protected ? ' (protected)' : ''}`);
      });
    }

    // Recent Commits
    if (c.length > 0) {
      sections.push(`\n## Recent Commits (last ${c.length})`);
      c.forEach((commit) => {
        sections.push(`- \`${commit.hash}\` ${commit.message} — by ${commit.author} (${commit.time})`);
      });
    }

    // Open Pull Requests
    if (p.length > 0) {
      sections.push(`\n## Open Pull Requests (${p.length})`);
      p.forEach((pr) => {
        sections.push(`- ${pr.id} "${pr.title}" — by ${pr.author} [${pr.status}] (${pr.headBranch} → ${pr.baseBranch})`);
      });
    } else {
      sections.push('\n## Open Pull Requests: None');
    }

    // Open Issues
    if (i.length > 0) {
      sections.push(`\n## Open Issues (${i.length})`);
      i.slice(0, 5).forEach((issue) => {
        const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
        sections.push(`- ${issue.id} "${issue.title}" — by ${issue.author}${labels}`);
      });
    } else {
      sections.push('\n## Open Issues: None');
    }

    // Contributors
    if (co.length > 0) {
      sections.push(`\n## Contributors (${co.length})`);
      co.slice(0, 5).forEach((contributor) => {
        sections.push(`- ${contributor.login} (${contributor.contributions} commits)`);
      });
    }

    // CI/CD Status
    if (w.length > 0) {
      sections.push(`\n## CI/CD Pipeline Status`);
      w.forEach((run) => {
        const emoji = run.status === 'Passed' ? '✅' : run.status === 'Failed' ? '❌' : '⏳';
        sections.push(`- ${emoji} ${run.name} — ${run.status} (branch: ${run.branch})`);
      });
    }

    return sections.join('\n');
  }

  /**
   * Build a minimal context (lighter API load) for quick responses.
   */
  async buildMinimalContext(repo, token = null) {
    const { owner, name } = repo;

    const [details, commits] = await Promise.allSettled([
      githubService.getRepoDetails(owner, name, token),
      githubService.getCommits(owner, name, token, 5),
    ]);

    const d = details.status === 'fulfilled' ? details.value : {};
    const c = commits.status === 'fulfilled' ? commits.value : [];

    return [
      `Repository: ${d.fullName || `${owner}/${name}`}`,
      `Branch: ${d.defaultBranch || 'main'}`,
      `Language: ${d.language || 'Unknown'}`,
      `Recent commits: ${c.map((cm) => `${cm.hash} ${cm.message}`).join('; ') || 'None'}`,
    ].join('\n');
  }
}

export default new RepoContextService();
