import axios from 'axios';

const GITHUB_API = 'https://api.github.com';

/**
 * GitHub API service — wraps all GitHub REST API interactions.
 * All methods accept an optional token for authenticated requests.
 */
class GitHubService {
  constructor() {
    this.cache = new Map();
    this.CACHE_TTL = 60_000; // 60 seconds
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
    const h = { Accept: 'application/vnd.github.v3+json' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
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
      throw new Error('Failed to fetch repository details.');
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

  /**
   * Get comprehensive repository insights (aggregated data).
   */
  async getRepoInsights(owner, repo, token = null) {
    const [details, commits, prs, issues, contributors, workflows] = await Promise.all([
      this.getRepoDetails(owner, repo, token),
      this.getCommits(owner, repo, token, 5),
      this.getPullRequests(owner, repo, token),
      this.getIssues(owner, repo, token),
      this.getContributors(owner, repo, token),
      this.getWorkflowRuns(owner, repo, token),
    ]);

    return {
      commits: details.starCount !== undefined ? commits.length : 0,
      totalCommitAuthors: [...new Set(commits.map((c) => c.author))].length,
      openPRs: prs.length,
      issues: issues.length,
      contributors: contributors.length,
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
}

// Singleton export
export default new GitHubService();
