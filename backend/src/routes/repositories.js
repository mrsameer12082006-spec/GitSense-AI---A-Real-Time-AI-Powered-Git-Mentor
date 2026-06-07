import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import githubService from '../services/github.js';
import ingestionService from '../services/ingestion.js';
import localGitService from '../services/localGit.js';
import aiService from '../services/ai.js';

const router = Router();
const prisma = new PrismaClient();

// All repository routes require authentication
router.use(authenticate);

// ── POST /api/repos/connect-url ─────────────────────────────
// Connect a repository by pasting its GitHub URL
router.post('/connect-url', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Repository URL is required.' });
    }

    // Parse URL to extract owner/repo
    const parsed = githubService.parseRepoUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid GitHub URL. Use format: https://github.com/owner/repo' });
    }

    // Get user's GitHub token if they have one
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    // Validate repo exists
    const validation = await githubService.validateRepo(parsed.owner, parsed.repo, token);
    if (!validation.exists) {
      return res.status(404).json({ error: validation.error });
    }

    const repoData = validation.data;

    // Disconnect any previously connected repos for this user
    await prisma.repository.updateMany({
      where: { userId: req.user.id, isConnected: true },
      data: { isConnected: false },
    });

    // Upsert repository
    const repository = await prisma.repository.upsert({
      where: {
        userId_fullName: {
          userId: req.user.id,
          fullName: repoData.full_name,
        },
      },
      update: {
        isConnected: true,
        connectionMethod: 'url',
        defaultBranch: repoData.default_branch,
        url: repoData.html_url,
        metadata: JSON.stringify({
          description: repoData.description,
          language: repoData.language,
          isPrivate: repoData.private,
        }),
      },
      create: {
        userId: req.user.id,
        name: repoData.name,
        owner: repoData.owner.login,
        fullName: repoData.full_name,
        url: repoData.html_url,
        defaultBranch: repoData.default_branch,
        connectionMethod: 'url',
        metadata: JSON.stringify({
          description: repoData.description,
          language: repoData.language,
          isPrivate: repoData.private,
        }),
      },
    });

    // Trigger ingestion in background
    const io = req.app.get('io');
    ingestionService.ingestRepository(repository.id, req.user.id, io).catch((err) => {
      console.error('[Repos] Auto-ingestion background task failed:', err);
    });

    res.json({
      message: 'Repository connected successfully.',
      repository: {
        id: repository.id,
        name: repository.name,
        owner: repository.owner,
        fullName: repository.fullName,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
        connectionMethod: repository.connectionMethod,
      },
    });
  } catch (err) {
    console.error('[Repos] connect-url error:', err);
    res.status(500).json({ error: 'Failed to connect repository.' });
  }
});

// ── POST /api/repos/connect-github ──────────────────────────
// Connect a repository via GitHub OAuth (user must be authenticated with GitHub)
router.post('/connect-github', async (req, res) => {
  try {
    const { repoFullName } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.githubToken) {
      return res.status(400).json({ error: 'GitHub account not connected. Please connect via GitHub OAuth first.' });
    }

    if (!repoFullName) {
      // List available repos
      const repos = await githubService.getUserRepos(user.githubToken);
      return res.json({ repos });
    }

    // Connect specific repo
    const [owner, repo] = repoFullName.split('/');
    const details = await githubService.getRepoDetails(owner, repo, user.githubToken);

    // Disconnect any previously connected repos
    await prisma.repository.updateMany({
      where: { userId: req.user.id, isConnected: true },
      data: { isConnected: false },
    });

    const repository = await prisma.repository.upsert({
      where: {
        userId_fullName: {
          userId: req.user.id,
          fullName: details.fullName,
        },
      },
      update: {
        isConnected: true,
        connectionMethod: 'oauth',
        defaultBranch: details.defaultBranch,
        url: details.url,
      },
      create: {
        userId: req.user.id,
        name: details.name,
        owner: details.owner,
        fullName: details.fullName,
        url: details.url,
        defaultBranch: details.defaultBranch,
        connectionMethod: 'oauth',
      },
    });

    // Trigger ingestion in background
    const io = req.app.get('io');
    ingestionService.ingestRepository(repository.id, req.user.id, io).catch((err) => {
      console.error('[Repos] Auto-ingestion background task failed:', err);
    });

    res.json({
      message: 'Repository connected successfully.',
      repository: {
        id: repository.id,
        name: repository.name,
        owner: repository.owner,
        fullName: repository.fullName,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
      },
    });
  } catch (err) {
    console.error('[Repos] connect-github error:', err);
    res.status(500).json({ error: 'Failed to connect repository.' });
  }
});

// ── GET /api/repos/current ──────────────────────────────────
// Get the currently connected repository for the user
router.get('/current', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { userId: req.user.id, isConnected: true },
    });

    if (!repository) {
      return res.json({ connected: false, repository: null });
    }

    res.json({
      connected: true,
      repository: {
        id: repository.id,
        name: repository.name,
        owner: repository.owner,
        fullName: repository.fullName,
        url: repository.url,
        defaultBranch: repository.defaultBranch,
        connectionMethod: repository.connectionMethod,
      },
    });
  } catch (err) {
    console.error('[Repos] current error:', err);
    res.status(500).json({ error: 'Failed to fetch current repository.' });
  }
});

// ── GET /api/repos/:id/insights ─────────────────────────────
// Get aggregated insights for a connected repository
router.get('/:id/insights', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    const insights = await githubService.getRepoInsights(
      repository.owner,
      repository.name,
      token
    );

    res.json({ insights });
  } catch (err) {
    console.error('[Repos] insights error:', err);
    res.status(500).json({ error: 'Failed to fetch repository insights.' });
  }
});

// ── DELETE /api/repos/:id ───────────────────────────────────
// Disconnect a repository
router.delete('/:id', async (req, res) => {
  try {
    await prisma.repository.update({
      where: { id: req.params.id },
      data: { isConnected: false },
    });

    res.json({ message: 'Repository disconnected.' });
  } catch (err) {
    console.error('[Repos] delete error:', err);
    res.status(500).json({ error: 'Failed to disconnect repository.' });
  }
});


// ── POST /api/repos/:id/scan ────────────────────────────────
// Real repository health scanning system
router.post('/:id/scan', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    let issues = [];

    // Ensure local clone exists
    await localGitService.ensureClone(repository.id, repository.owner, repository.name, token);

    // Category 1: Git State Issues
    const gitState = await localGitService.getGitState(repository.id);
    
    if (gitState.detachedHead) {
      issues.push({
        id: 'git-state-detached-head',
        category: 'Git State',
        severity: 'critical',
        title: 'Detached HEAD State',
        affectedResource: gitState.headHash || 'HEAD',
        manualFixCommands: [
          `# Checkout back to the last known branch`,
          `git checkout ${gitState.lastBranch || repository.defaultBranch || 'main'}`
        ],
        fixType: 'checkout_branch',
        fixRiskLevel: 'Safe — no data loss',
        fixDescription: `Check out to ${gitState.lastBranch || repository.defaultBranch || 'main'}.`,
        isFixed: false,
        rawState: gitState
      });
    }

    if (gitState.uncommittedChanges && gitState.uncommittedChanges.length > 0) {
      issues.push({
        id: 'git-state-uncommitted',
        category: 'Git State',
        severity: 'warning',
        title: 'Uncommitted Changes',
        affectedResource: `${gitState.uncommittedChanges.length} files`,
        manualFixCommands: [
          `# Stash uncommitted changes`,
          `git stash`
        ],
        fixType: 'stash_changes',
        fixRiskLevel: 'Safe — no data loss',
        fixDescription: 'Stash all uncommitted changes safely.',
        isFixed: false,
        rawState: gitState
      });
    }

    if (gitState.stashes && gitState.stashes.length > 0) {
      issues.push({
        id: 'git-state-old-stashes',
        category: 'Git State',
        severity: 'info',
        title: 'Old Stash Entries Found',
        affectedResource: `${gitState.stashes.length} stashes`,
        manualFixCommands: [
          `# View all stashes`,
          `git stash list`,
          `# Drop the oldest stash`,
          `git stash drop ${gitState.stashes[0].id}`
        ],
        fixType: 'prune_stashes',
        fixRiskLevel: 'Safe — no data loss',
        fixDescription: 'Remove stashes older than 14 days.',
        isFixed: false,
        rawState: gitState
      });
    }

    // Category 2: Branch Divergence Issues
    try {
      const branches = await githubService.getBranches(repository.owner, repository.name, token);
      for (const branch of branches) {
        if (branch.name === repository.defaultBranch) continue;
        const comp = await githubService.getBranchComparison(repository.owner, repository.name, repository.defaultBranch, branch.name, token);
        if (comp.behindBy > 10) {
          issues.push({
            id: `branch-divergence-${branch.name}`,
            category: 'Branch Divergence',
            severity: comp.behindBy > 30 ? 'critical' : 'warning',
            title: `Branch Diverged from ${repository.defaultBranch}`,
            affectedResource: branch.name,
            manualFixCommands: [
              `# Checkout the diverged branch`,
              `git checkout ${branch.name}`,
              `# Fetch and merge default branch`,
              `git fetch origin`,
              `git merge origin/${repository.defaultBranch}`
            ],
            fixType: 'sync_branch',
            fixRiskLevel: 'May require conflict resolution',
            fixDescription: `Fetch and merge ${repository.defaultBranch} into ${branch.name}.`,
            isFixed: false,
            rawState: { branch: branch.name, behind: comp.behindBy, defaultBranch: repository.defaultBranch }
          });
        }
      }
    } catch (e) {
      console.warn('Branch divergence check failed:', e.message);
    }

    // Category 3: File and Repository Quality Issues
    try {
      const tree = await githubService.getFileTree(repository.owner, repository.name, repository.defaultBranch, token);
      let hasGitIgnore = false;
      for (const node of tree) {
        if (node.path === '.gitignore') hasGitIgnore = true;
        // Large file check > 5MB (5242880 bytes)
        if (node.type === 'blob' && node.size > 5242880) {
          issues.push({
            id: `large-file-${node.path}`,
            category: 'Repository Quality',
            severity: 'critical',
            title: 'Large Binary File Tracked',
            affectedResource: node.path,
            manualFixCommands: [
              `# Remove file from git cache but keep locally`,
              `git rm --cached "${node.path}"`,
              `# Add to gitignore`,
              `echo "${node.path}" >> .gitignore`,
              `# Commit removal`,
              `git commit -m "Remove large file ${node.path}"`
            ],
            fixType: 'remove_large_file',
            fixRiskLevel: 'Destructive — creates new commit',
            fixDescription: `Remove ${node.path} from Git and add it to .gitignore.`,
            isFixed: false,
            rawState: { path: node.path, size: node.size }
          });
        }

        // Secrets check
        const isSecret = ['.env', 'secret', 'password', 'key', 'credentials', 'id_rsa'].some(s => node.path.toLowerCase().includes(s));
        if (node.type === 'blob' && isSecret) {
          issues.push({
            id: `secret-file-${node.path}`,
            category: 'Repository Quality',
            severity: 'critical',
            title: 'Potential Secret File Tracked',
            affectedResource: node.path,
            manualFixCommands: [
              `# Remove secret from git cache`,
              `git rm --cached "${node.path}"`,
              `# Add to gitignore`,
              `echo "${node.path}" >> .gitignore`,
              `git commit -m "Remove secret file ${node.path}"`
            ],
            fixType: 'remove_secret_file',
            fixRiskLevel: 'Destructive — creates new commit',
            fixDescription: `Remove ${node.path} from Git and add to .gitignore.`,
            isFixed: false,
            rawState: { path: node.path }
          });
        }
      }

      if (!hasGitIgnore) {
        issues.push({
          id: 'missing-gitignore',
          category: 'Repository Quality',
          severity: 'warning',
          title: 'Missing .gitignore File',
          affectedResource: '.gitignore',
          manualFixCommands: [
            `# Create .gitignore`,
            `touch .gitignore`,
            `# Add basic patterns`,
            `echo "node_modules/\n.env\n.DS_Store" > .gitignore`,
            `git add .gitignore`,
            `git commit -m "Add .gitignore"`
          ],
          fixType: 'create_gitignore',
          fixRiskLevel: 'Destructive — creates new commit',
          fixDescription: 'Create a .gitignore file with standard rules.',
          isFixed: false,
          rawState: {}
        });
      }
    } catch (e) {
      console.warn('Quality check failed:', e.message);
    }

    // Category 4: Pull Request Issues
    try {
      const prs = await githubService.getPullRequests(repository.owner, repository.name, token);
      const now = new Date();
      for (const pr of prs) {
        const prDate = new Date(pr.createdAt);
        const daysOld = (now - prDate) / (1000 * 60 * 60 * 24);
        
        if (daysOld > 14) {
          issues.push({
            id: `stale-pr-${pr.number}`,
            category: 'Pull Requests',
            severity: 'warning',
            title: 'Stale Pull Request',
            affectedResource: `PR #${pr.number}`,
            manualFixCommands: [
              `# Review PR on GitHub`,
              `gh pr view ${pr.number}`
            ],
            fixType: 'notify_stale_pr',
            fixRiskLevel: 'Safe — no data loss',
            fixDescription: 'Post a comment on the PR tagging the author.',
            isFixed: false,
            rawState: { number: pr.number, author: pr.author, daysOld: Math.floor(daysOld) }
          });
        }
      }
    } catch (e) {
      console.warn('PR check failed:', e.message);
    }

    // Pass issues through AI layer
    const diagnosedIssues = await aiService.diagnoseIssues(issues, 'intermediate');

    res.json({ issues: diagnosedIssues });
  } catch (err) {
    console.error('[Repos] scan error:', err);
    res.status(500).json({ error: 'Failed to scan repository.' });
  }
});

// ── POST /api/repos/:id/fix ──────────────────────────────────
// Execute real fixes
router.post('/:id/fix', async (req, res) => {
  try {
    const { issueId, fixType, rawState } = req.body;
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    // We can use SSE, but for simpler integration, returning JSON with status
    // Or if SSE is preferred, we need res.setHeader('Content-Type', 'text/event-stream').
    // Since we don't have the SSE frontend built for this specific path yet, we return JSON.
    
    let result = { success: true, message: 'Fix applied successfully.' };

    try {
      if (fixType === 'checkout_branch') {
        const branch = rawState?.lastBranch || repository.defaultBranch;
        await localGitService.checkoutBranch(repository.id, branch);
      } else if (fixType === 'sync_branch') {
        const mergeResult = await localGitService.fetchAndMerge(repository.id, rawState.defaultBranch);
        if (!mergeResult.success) {
          result = { success: false, message: 'Merge conflict detected.', conflicts: mergeResult.conflicts };
        }
      } else if (fixType === 'remove_large_file' || fixType === 'remove_secret_file') {
        await localGitService.removeLargeFile(repository.id, rawState.path);
      } else if (fixType === 'create_gitignore') {
        // We'll create via GitHub API
        const content = Buffer.from('node_modules/\n.env\n.DS_Store\n__pycache__/\ndist/\nbuild/').toString('base64');
        await fetch(`https://api.github.com/repos/${repository.owner}/${repository.name}/contents/.gitignore`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: 'chore: Add .gitignore via GitSense AI',
            content: content
          })
        });
      } else if (fixType === 'notify_stale_pr') {
        await fetch(`https://api.github.com/repos/${repository.owner}/${repository.name}/issues/${rawState.number}/comments`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            body: `@${rawState.author} GitSense AI detected that this PR has been open for ${rawState.daysOld} days without review. Please review or close it.`
          })
        });
      }

      res.json(result);
    } catch (execErr) {
      console.error('[Repos] fix execution error:', execErr);
      res.status(500).json({ success: false, error: execErr.message });
    }
  } catch (err) {
    console.error('[Repos] fix route error:', err);
    res.status(500).json({ success: false, error: 'Failed to apply fix.' });
  }
});

// ── GET /api/repos/connect-github ──────────────────────────
// List repositories of authenticated GitHub account
router.get('/connect-github', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.githubToken) {
      return res.status(400).json({ error: 'GitHub account not connected. Please connect via GitHub OAuth first.' });
    }
    const repos = await githubService.getUserRepos(user.githubToken);
    res.json({ repos });
  } catch (err) {
    console.error('[Repos] List repos error:', err);
    res.status(500).json({ error: 'Failed to list GitHub repositories.' });
  }
});

// ── GET /api/repos/:id/commits ──────────────────────────────
// Fetch commit list for connected repository
router.get('/:id/commits', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    const result = await githubService.getBranchAwareCommits(
      repository.owner,
      repository.name,
      repository.defaultBranch,
      token
    );
    res.json(result);
  } catch (err) {
    console.error('[Repos] Fetch commits error:', err);
    res.status(500).json({ error: 'Failed to fetch commits.' });
  }
});

// ── GET /api/repos/:id/commits/:sha ──────────────────────────
// Fetch commit details including diff stats
router.get('/:id/commits/:sha', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    const commit = await githubService.getCommitDetails(repository.owner, repository.name, req.params.sha, token);
    res.json({ commit });
  } catch (err) {
    console.error('[Repos] Fetch commit details error:', err);
    res.status(500).json({ error: 'Failed to fetch commit details.' });
  }
});

// ── GET /api/repos/:id/contents ──────────────────────────────
// Fetch directory listing
router.get('/:id/contents', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;
    const path = req.query.path || '';

    const contents = await githubService.getRepoContents(repository.owner, repository.name, path, token);
    res.json({ contents });
  } catch (err) {
    console.error('[Repos] Fetch contents error:', err);
    res.status(500).json({ error: 'Failed to fetch directory contents.' });
  }
});

// ── GET /api/repos/:id/contents/file ─────────────────────────
// Fetch file raw content
router.get('/:id/contents/file', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;
    const path = req.query.path;

    if (!path) {
      return res.status(400).json({ error: 'File path is required.' });
    }

    const fileContent = await githubService.getFileContent(repository.owner, repository.name, path, token);
    res.json({ content: fileContent });
  } catch (err) {
    console.error('[Repos] Fetch file content error:', err);
    res.status(500).json({ error: 'Failed to fetch file content.' });
  }
});

export default router;
