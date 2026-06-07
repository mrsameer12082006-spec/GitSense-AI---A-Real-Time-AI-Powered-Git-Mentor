import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import githubService from '../services/github.js';
import ingestionService from '../services/ingestion.js';
import localGitService from '../services/localGit.js';
import aiService from '../services/ai.js';
import axios from 'axios';
import { scanRepository } from '../services/githubScanner.js';

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


// Helper to limit concurrency
// ── POST /api/repos/:id/scan & /api/repo/scan ─────────────────
router.post('/scan', async (req, res) => {
  try {
    const { owner, repo, token } = req.body;
    const finalToken = token || process.env.GITHUB_TOKEN;
    
    console.log(`[Scan API] Start scan:`, {
      owner,
      repo,
      tokenPresent: !!finalToken,
      tokenPrefix: finalToken ? finalToken.substring(0, 10) + '...' : 'none'
    });

    if (!owner || !repo || !finalToken) {
      console.warn(`[Scan API] Missing params: owner=${owner}, repo=${repo}, tokenPresent=${!!finalToken}`);
      return res.status(400).json({ error: 'owner, repo, and token are all required.' });
    }

    const result = await scanRepository(owner, repo, finalToken);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[Scan API] Uncaught scan error:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error during repository scan' });
  }
});

// Backwards compatibility endpoint for repo ID route
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

    if (!token) {
      return res.status(400).json({ error: 'GitHub authorization token is missing. Please connect your GitHub account.' });
    }

    console.log(`[Scan Compatibility API] Starting scan for repository ${repository.fullName}`);
    const result = await scanRepository(repository.owner, repository.name, token);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[Scan Compatibility API] Error during scan:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error during repository scan' });
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
