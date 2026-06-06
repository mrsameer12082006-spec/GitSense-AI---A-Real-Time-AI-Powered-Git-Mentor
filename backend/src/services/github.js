import axios from 'axios';

const GITHUB_API = 'https://api.github.com';

/**
 * GitHub API service — wraps all GitHub REST API interactions.
 * All methods accept an optional token for authenticated requests.
 */
class GitHubService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 300_000; // 5 minutes (300 seconds)
  }

  /**
   * Get cached value or null if expired.
   */
  _getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.ts < this.CACHE_TTL) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, ts: Date.now() });
  }

  _headers(token) {
    const h = { 
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitSense-AI'
    };
    const finalToken = token || process.env.GITHUB_TOKEN;
    if (finalToken) h.Authorization = `Bearer ${finalToken}`;
    return h;
  }

  /**
   * Helper to perform a GET request and parse the Link header for total page count.
   * This is the most efficient way to get total counts (commits, pulls, contributors) on GitHub REST API.
   */
  async _getTotalCount(endpoint, params = {}, token = null) {
    try {
      const response = await axios.get(`${GITHUB_API}${endpoint}`, {
        headers: this._headers(token),
        params: { ...params, per_page: 1 },
      });
      const linkHeader = response.headers.link;
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
      return Array.isArray(response.data) ? response.data.length : 0;
    } catch (err) {
      console.error(`[GitHub] _getTotalCount error for ${endpoint}:`, err.message);
      return 0;
    }
  }

  /**
   * Validate a GitHub repo URL and extract owner/repo.
   * @param {string} url
   * @returns {{ owner: string, repo: string } | null}
   */
  parseRepoUrl(url) {
    // Support formats:
    // https://github.com/owner/repo
    // https://github.com/owner/repo.git
    // github.com/owner/repo
    const patterns = [
      /(?:https?:\/\/)?github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
    return null;
  }

  /**
   * Validate that a repository exists and is accessible.
   */
  async validateRepo(owner, repo, token = null) {
    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: this._headers(token),
      });
      return { exists: true, data };
    } catch (err) {
      if (err.response?.status === 404) {
        return { exists: false, error: 'Repository not found. It may be private or deleted.' };
      }
      if (err.response?.status === 403) {
        const errMsg = err.response?.data?.message || '';
        if (errMsg.includes('rate limit exceeded') || errMsg.includes('Rate limit exceeded')) {
          return { exists: false, error: 'GitHub API rate limit exceeded. Please add GITHUB_TOKEN="your_token" to your backend/.env file and restart the backend.' };
        }
        return { exists: false, error: 'Access forbidden. The repository may be private.' };
      }
      return { exists: false, error: 'Failed to validate repository.' };
    }
  }

  /**
   * List all repositories for authenticated user.
   */
  async getUserRepos(token) {
    const cacheKey = `repos:${token.slice(-8)}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/user/repos`, {
        headers: this._headers(token),
        params: { sort: 'updated', per_page: 50 },
      });

      const repos = data.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        url: r.html_url,
        defaultBranch: r.default_branch,
        isPrivate: r.private,
        description: r.description,
        language: r.language,
        updatedAt: r.updated_at,
      }));

      this._setCache(cacheKey, repos);
      return repos;
    } catch (err) {
      console.error('[GitHub] getUserRepos error:', err.message);
      throw new Error('Failed to fetch repositories from GitHub.');
    }
  }

  /**
   * Get detailed info about a specific repository.
   */
  async getRepoDetails(owner, repo, token = null) {
    const cacheKey = `details:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, {
        headers: this._headers(token),
      });

      const details = {
        name: data.name,
        fullName: data.full_name,
        owner: data.owner.login,
        url: data.html_url,
        defaultBranch: data.default_branch,
        isPrivate: data.private,
        description: data.description,
        language: data.language,
        starCount: data.stargazers_count,
        forkCount: data.forks_count,
        openIssuesCount: data.open_issues_count,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };

      this._setCache(cacheKey, details);
      return details;
    } catch (err) {
      console.error('[GitHub] getRepoDetails error:', err.message);
      return {};
    }
  }

  /**
   * Get recent commits.
   */
  async getCommits(owner, repo, token = null, limit = 10) {
    const cacheKey = `commits:${owner}/${repo}:${limit}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
        headers: this._headers(token),
        params: { per_page: limit },
      });

      const commits = data.map((c) => ({
        sha: c.sha,
        hash: c.sha.substring(0, 7),
        message: c.commit.message.split('\n')[0], // First line only
        author: c.commit.author?.name || c.author?.login || 'Unknown',
        authorAvatar: c.author?.avatar_url,
        date: c.commit.author?.date,
        time: this._timeAgo(c.commit.author?.date),
      }));

      this._setCache(cacheKey, commits);
      return commits;
    } catch (err) {
      console.error('[GitHub] getCommits error:', err.message);
      return [];
    }
  }

  /**
   * Get open pull requests.
   */
  async getPullRequests(owner, repo, token = null) {
    const cacheKey = `prs:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/pulls`, {
        headers: this._headers(token),
        params: { state: 'open', per_page: 20 },
      });

      const prs = data.map((pr) => ({
        id: `#${pr.number}`,
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        status: pr.draft ? 'Draft' : (pr.requested_reviewers?.length > 0 ? 'In Review' : 'Open'),
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        url: pr.html_url,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
      }));

      this._setCache(cacheKey, prs);
      return prs;
    } catch (err) {
      console.error('[GitHub] getPullRequests error:', err.message);
      return [];
    }
  }

  /**
   * Get open issues (excluding pull requests).
   */
  async getIssues(owner, repo, token = null) {
    const cacheKey = `issues:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/issues`, {
        headers: this._headers(token),
        params: { state: 'open', per_page: 20 },
      });

      // GitHub API returns PRs in issues endpoint, filter them out
      const issues = data
        .filter((i) => !i.pull_request)
        .map((i) => ({
          id: `#${i.number}`,
          number: i.number,
          title: i.title,
          author: i.user.login,
          labels: i.labels.map((l) => l.name),
          createdAt: i.created_at,
          url: i.html_url,
        }));

      this._setCache(cacheKey, issues);
      return issues;
    } catch (err) {
      console.error('[GitHub] getIssues error:', err.message);
      return [];
    }
  }

  /**
   * Get contributors.
   */
  async getContributors(owner, repo, token = null) {
    const cacheKey = `contributors:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contributors`, {
        headers: this._headers(token),
        params: { per_page: 30 },
      });

      const contributors = data.map((c) => ({
        login: c.login,
        avatarUrl: c.avatar_url,
        contributions: c.contributions,
      }));

      this._setCache(cacheKey, contributors);
      return contributors;
    } catch (err) {
      console.error('[GitHub] getContributors error:', err.message);
      return [];
    }
  }

  /**
   * Get branches for a repo.
   */
  async getBranches(owner, repo, token = null) {
    const cacheKey = `branches:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/branches`, {
        headers: this._headers(token),
        params: { per_page: 30 },
      });

      const branches = data.map((b) => ({
        name: b.name,
        protected: b.protected,
        sha: b.commit.sha,
      }));

      this._setCache(cacheKey, branches);
      return branches;
    } catch (err) {
      console.error('[GitHub] getBranches error:', err.message);
      return [];
    }
  }

  /**
   * Get recent workflow runs (CI/CD).
   */
  async getWorkflowRuns(owner, repo, token = null) {
    const cacheKey = `workflows:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs`, {
        headers: this._headers(token),
        params: { per_page: 5 },
      });

      const runs = (data.workflow_runs || []).map((r) => ({
        name: r.name,
        status: r.conclusion === 'success' ? 'Passed' : r.conclusion === 'failure' ? 'Failed' : r.status,
        branch: r.head_branch,
        createdAt: r.created_at,
        url: r.html_url,
      }));

      this._setCache(cacheKey, runs);
      return runs;
    } catch (err) {
      // Actions API may not be available for all repos
      console.error('[GitHub] getWorkflowRuns error:', err.message);
      return [];
    }
  }

  async getRepoInsights(owner, repo, token = null) {
    const cacheKey = `insights:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const [
        details,
        commits,
        prs,
        issues,
        contributors,
        workflows,
        totalCommits,
        totalPRs,
        totalContributors
      ] = await Promise.all([
        this.getRepoDetails(owner, repo, token).catch(() => ({})),
        this.getCommits(owner, repo, token, 30).catch(() => []),
        this.getPullRequests(owner, repo, token).catch(() => []),
        this.getIssues(owner, repo, token).catch(() => []),
        this.getContributors(owner, repo, token).catch(() => []),
        this.getWorkflowRuns(owner, repo, token).catch(() => []),
        this._getTotalCount(`/repos/${owner}/${repo}/commits`, {}, token),
        this._getTotalCount(`/repos/${owner}/${repo}/pulls`, { state: 'open' }, token),
        this._getTotalCount(`/repos/${owner}/${repo}/contributors`, {}, token),
      ]);

      const openIssuesCountCombined = details.openIssuesCount !== undefined ? details.openIssuesCount : (issues.length + prs.length);
      const openPRsCount = totalPRs || prs.length || 0;
      const issuesCount = Math.max(0, openIssuesCountCombined - openPRsCount);

      const insights = {
        commits: totalCommits || commits.length || 0,
        totalCommitAuthors: [...new Set(commits.map((c) => c.author))].length,
        openPRs: openPRsCount,
        issues: issuesCount,
        contributors: totalContributors || contributors.length || 0,
        securityStatus: 'Clean', // Placeholder — would need Security API
        latestCommits: commits.slice(0, 3),
        activePRs: prs.slice(0, 3).map((pr) => ({
          id: pr.id,
          title: pr.title,
          status: pr.status,
          author: pr.author,
        })),
        pipelines: workflows.slice(0, 3).map((w) => ({
          name: w.name,
          status: w.status,
        })),
      };

      this._setCache(cacheKey, insights);
      return insights;
    } catch (err) {
      console.error('[GitHub] getRepoInsights error:', err.message);
      return {
        commits: 0,
        totalCommitAuthors: 0,
        openPRs: 0,
        issues: 0,
        contributors: 0,
        securityStatus: 'N/A',
        latestCommits: [],
        activePRs: [],
        pipelines: []
      };
    }
  }

  /**
   * Convert a date string to a human-readable "time ago" string.
   */
  _timeAgo(dateString) {
    if (!dateString) return 'unknown';
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  }

  /**
   * Get dynamic repository health analysis.
   * Scans remote branches, PR conflicts, and failed workflows.
   */
  async getRepoHealth(owner, repo, token = null) {
    try {
      // 1. Get branches
      const branches = await this.getBranches(owner, repo, token);
      
      const staleBranches = [];
      const now = Date.now();
      const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;

      // Fetch branch commit details for top 5 branches to avoid aggressive rate limits
      const branchDetailsPromises = branches.slice(0, 5).map(async (b) => {
        try {
          const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits/${b.sha}`, {
            headers: this._headers(token),
          });
          const dateStr = data.commit?.committer?.date || data.commit?.author?.date;
          if (dateStr) {
            const commitTime = new Date(dateStr).getTime();
            const ageInMs = now - commitTime;
            if (ageInMs > ninetyDaysInMs) {
              staleBranches.push({
                name: b.name,
                sha: b.sha,
                lastCommitDate: dateStr,
                ageDays: Math.floor(ageInMs / (24 * 60 * 60 * 1000))
              });
            }
          }
        } catch (err) {
          // Rate limit or missing permissions, continue
        }
      });
      await Promise.allSettled(branchDetailsPromises);

      // 2. Fetch Pull Requests and check for conflicts
      const prs = await this.getPullRequests(owner, repo, token);
      const conflictPRs = [];

      // For the first 3 open PRs, fetch details to see if mergeable is false
      const prDetailsPromises = prs.slice(0, 3).map(async (pr) => {
        try {
          const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${pr.number}`, {
            headers: this._headers(token),
          });
          if (data.mergeable === false || data.mergeable_state === 'dirty') {
            conflictPRs.push({
              number: pr.number,
              title: pr.title,
              author: pr.author,
              headBranch: pr.headBranch,
              baseBranch: pr.baseBranch,
              url: pr.url
            });
          }
        } catch (err) {
          // Silently continue
        }
      });
      await Promise.allSettled(prDetailsPromises);

      // 3. Fetch workflows and check for CI/CD failures
      const workflowRuns = await this.getWorkflowRuns(owner, repo, token);
      const failedWorkflows = workflowRuns.filter(run => run.status === 'Failed' || run.status === 'failure');

      // 4. Calculate Health Score
      let score = 100;
      const issues = [];

      // Add issues for Stale Branches
      staleBranches.forEach(b => {
        score -= 5;
        issues.push({
          id: `stale-branch-${b.name}`,
          type: 'stale_branch',
          title: `Stale branch: ${b.name}`,
          description: `This branch has not had any updates in ${b.ageDays} days. Consider deleting or archiving it.`,
          severity: 'low',
          safeToFix: true,
          fixAction: 'prune_branch',
          payload: { branchName: b.name },
          command: `git push origin --delete ${b.name}`
        });
      });

      // Add issues for Merge Conflicts
      conflictPRs.forEach(pr => {
        score -= 15;
        issues.push({
          id: `conflict-pr-${pr.number}`,
          type: 'merge_conflict',
          title: `Merge Conflict in PR #${pr.number}`,
          description: `Pull request #${pr.number} "${pr.title}" has merge conflicts between '${pr.headBranch}' and '${pr.baseBranch}'.`,
          severity: 'high',
          safeToFix: false,
          fixAction: 'resolve_conflict',
          payload: { prNumber: pr.number, headBranch: pr.headBranch, baseBranch: pr.baseBranch },
          command: `git checkout ${pr.headBranch}\ngit merge ${pr.baseBranch}`
        });
      });

      // Add issues for CI/CD Failures
      failedWorkflows.forEach(run => {
        score -= 10;
        issues.push({
          id: `failed-ci-${run.name.replace(/\s+/g, '-').toLowerCase()}`,
          type: 'ci_failure',
          title: `CI/CD Build Failure: ${run.name}`,
          description: `The latest workflow run on branch '${run.branch}' failed. Inspect logs for details.`,
          severity: 'medium',
          safeToFix: false,
          fixAction: 'view_ci_logs',
          payload: { runUrl: run.url },
          command: `git log -n 5`
        });
      });

      score = Math.max(0, Math.min(100, score));

      let status = 'Clean Repository';
      if (score < 70) {
        status = 'Repository Requires Attention';
      } else if (score < 100) {
        status = 'Repository Requires Attention';
      }

      return {
        score,
        status,
        issues,
        staleBranches,
        conflictPRs,
        failedWorkflows
      };
    } catch (err) {
      console.error('[GitHub] getRepoHealth error:', err.message);
      return {
        score: 100,
        status: 'Clean Repository',
        issues: [],
        staleBranches: [],
        conflictPRs: [],
        failedWorkflows: []
      };
    }
  }

  /**
   * Get contents at a path (for file tree).
   */
  async getRepoContents(owner, repo, path = '', token = null) {
    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        headers: this._headers(token),
      });
      return data;
    } catch (err) {
      console.error('[GitHub] getRepoContents error:', err.message);
      throw new Error('Failed to fetch repository contents.');
    }
  }

  /**
   * Get file content by path.
   */
  async getFileContent(owner, repo, path, token = null) {
    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
        headers: this._headers(token),
      });
      if (Array.isArray(data)) {
        throw new Error('Path is a directory, not a file.');
      }
      if (data.encoding === 'base64' && data.content) {
        return Buffer.from(data.content, 'base64').toString('utf8');
      }
      return data.content || '';
    } catch (err) {
      console.error('[GitHub] getFileContent error:', err.message);
      throw new Error('Failed to fetch file content.');
    }
  }

  /**
   * Get specific commit details.
   */
  async getCommitDetails(owner, repo, sha, token = null) {
    try {
      const { data } = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits/${sha}`, {
        headers: this._headers(token),
      });
      return {
        sha: data.sha,
        hash: data.sha.substring(0, 7),
        message: data.commit?.message || '',
        author: data.commit?.author?.name || data.author?.login || 'Unknown',
        date: data.commit?.author?.date || '',
        time: this._timeAgo(data.commit?.author?.date),
        stats: data.stats,
        files: (data.files || []).map(f => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch
        }))
      };
    } catch (err) {
      console.error('[GitHub] getCommitDetails error:', err.message);
      throw new Error('Failed to fetch commit details.');
    }
  }
}

// Singleton export
export default new GitHubService();
