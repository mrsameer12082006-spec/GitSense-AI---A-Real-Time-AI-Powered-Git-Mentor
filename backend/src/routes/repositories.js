import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import githubService from '../services/github.js';

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

export default router;
