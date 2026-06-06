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

// ── GET /api/repos/:id/health ───────────────────────────────
// Get repository health report (calculates from GitHub + simulated workspace)
router.get('/:id/health', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    // 1. Get real remote health issues
    const remoteHealth = await githubService.getRepoHealth(
      repository.owner,
      repository.name,
      token
    );

    // 2. Parse current metadata to get simulated workspace state
    let meta = {};
    try {
      meta = repository.metadata ? JSON.parse(repository.metadata) : {};
    } catch {
      meta = {};
    }

    // Initialize simulated workspace state if not present
    if (meta.simulatedState === undefined) {
      meta.simulatedState = {
        uncommittedChanges: [
          { file: 'frontend/src/sections/Hero.jsx', status: 'MODIFIED', color: '#7C5CFF' },
          { file: 'backend/src/routes/auth.js', status: 'MODIFIED', color: '#7C5CFF' }
        ],
        stashes: [
          { id: 'stash@{0}', description: 'WIP on auth flow fixes' }
        ],
        detachedHead: false,
        resolvedIssues: []
      };
      
      // Save it back to db
      await prisma.repository.update({
        where: { id: repository.id },
        data: { metadata: JSON.stringify(meta) }
      });
    }

    const sim = meta.simulatedState;
    const issues = [...remoteHealth.issues];

    // Filter out issues that have been resolved/fixed by the user
    let finalIssues = issues.filter(issue => !sim.resolvedIssues?.includes(issue.id));

    // Deduct points and append issues from simulated local workspace
    let score = remoteHealth.score;

    // Check simulated uncommitted changes
    if (sim.uncommittedChanges && sim.uncommittedChanges.length > 0 && !sim.resolvedIssues?.includes('local-uncommitted-changes')) {
      score -= 10;
      finalIssues.push({
        id: 'local-uncommitted-changes',
        type: 'uncommitted_changes',
        title: 'Uncommitted Changes in Workspace',
        description: `${sim.uncommittedChanges.length} files have uncommitted changes. These might get overwritten if you pull.`,
        severity: 'medium',
        safeToFix: true,
        fixAction: 'stash_changes',
        payload: { files: sim.uncommittedChanges.map(f => f.file) },
        command: 'git stash'
      });
    }

    // Check simulated stashes
    if (sim.stashes && sim.stashes.length > 0 && !sim.resolvedIssues?.includes('local-unused-stash')) {
      score -= 3;
      finalIssues.push({
        id: 'local-unused-stash',
        type: 'unused_stash',
        title: 'Stashed Changes (Messy Workspace)',
        description: `You have ${sim.stashes.length} unused stash entry. Clean up your stash stack if no longer needed.`,
        severity: 'low',
        safeToFix: true,
        fixAction: 'prune_stash',
        payload: {},
        command: 'git stash clear'
      });
    }

    // Check simulated detached HEAD
    if (sim.detachedHead && !sim.resolvedIssues?.includes('detached-head-state')) {
      score -= 20;
      finalIssues.push({
        id: 'detached-head-state',
        type: 'detached_head',
        title: 'Detached HEAD State',
        description: 'You are in a detached HEAD state. Commits made here will not update any branch unless checked out to a branch.',
        severity: 'high',
        safeToFix: false,
        fixAction: 'attach_head',
        payload: { defaultBranch: repository.defaultBranch },
        command: `git checkout ${repository.defaultBranch}`
      });
    }

    score = Math.max(0, Math.min(100, score));
    let status = 'Clean Repository';
    if (score < 70) {
      status = 'Repository Requires Attention';
    } else if (score < 100) {
      status = 'Repository Requires Attention';
    }

    res.json({
      health: {
        score,
        status,
        issues: finalIssues,
        simulatedState: sim
      }
    });
  } catch (err) {
    console.error('[Repos] health error:', err);
    res.status(500).json({ error: 'Failed to calculate repository health.' });
  }
});

// ── POST /api/repos/:id/fix ──────────────────────────────────
// Perform safe autonomous repair actions, or request confirmation for dangerous ones
router.post('/:id/fix', async (req, res) => {
  try {
    const { issueId, action } = req.body;
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    // Load simulated state
    let meta = {};
    try {
      meta = repository.metadata ? JSON.parse(repository.metadata) : {};
    } catch {
      meta = {};
    }
    
    if (!meta.simulatedState) {
      meta.simulatedState = { uncommittedChanges: [], stashes: [], detachedHead: false, resolvedIssues: [] };
    }

    // Determine if this fix is safe or dangerous
    let isDangerous = false;
    let impactText = '';

    if (action === 'resolve_conflict') {
      isDangerous = true;
      impactText = 'This will merge code blocks from the source branch into your target branch. It may rewrite local changes and create automatic resolution markers if not fully synced.';
    } else if (action === 'attach_head') {
      isDangerous = true;
      impactText = 'This will checkout a branch and abandon any un-named commits made while in detached HEAD state unless they are cherry-picked first.';
    }

    if (isDangerous) {
      return res.json({
        confirmed: false,
        requiresConfirmation: true,
        impact: impactText,
        message: 'This operation carries potential risks of data loss or history rewriting. Please confirm to proceed.'
      });
    }

    // Execute safe operations
    const sim = meta.simulatedState;
    if (!sim.resolvedIssues) sim.resolvedIssues = [];

    if (action === 'stash_changes') {
      sim.stashes.push({ id: `stash@{${sim.stashes.length}}`, description: 'Autostash: Stashed changes' });
      sim.uncommittedChanges = [];
      sim.resolvedIssues.push(issueId);
    } else if (action === 'prune_stash') {
      sim.stashes = [];
      sim.resolvedIssues.push(issueId);
    } else if (action === 'prune_branch') {
      sim.resolvedIssues.push(issueId);
    } else {
      sim.resolvedIssues.push(issueId);
    }

    // Update db
    await prisma.repository.update({
      where: { id: repository.id },
      data: { metadata: JSON.stringify(meta) }
    });

    let activityText = '';
    if (action === 'stash_changes') activityText = 'Stashed uncommitted changes safely.';
    else if (action === 'prune_stash') activityText = 'Cleared unused workspace stash stack.';
    else if (action === 'prune_branch') activityText = 'Cleaned stale branches and pruned references.';
    else activityText = `Executed autonomous repository fix: ${action}.`;

    try {
      await prisma.activity.create({
        data: {
          repositoryId: repository.id,
          type: 'branch',
          payload: JSON.stringify({ message: activityText, author: 'GitSense AI Doctor' })
        }
      });
    } catch (actErr) {
      console.error('[Fix] Failed to create activity log:', actErr.message);
    }

    res.json({
      confirmed: true,
      requiresConfirmation: false,
      message: 'Autonomous fix executed successfully.',
      activity: activityText
    });
  } catch (err) {
    console.error('[Repos] fix error:', err);
    res.status(500).json({ error: 'Failed to apply repository fix.' });
  }
});

// ── POST /api/repos/:id/confirm-fix ──────────────────────────
// Execute confirmed dangerous repairs
router.post('/:id/confirm-fix', async (req, res) => {
  try {
    const { issueId, action } = req.body;
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    // Load simulated state
    let meta = {};
    try {
      meta = repository.metadata ? JSON.parse(repository.metadata) : {};
    } catch {
      meta = {};
    }
    
    if (!meta.simulatedState) {
      meta.simulatedState = { uncommittedChanges: [], stashes: [], detachedHead: false, resolvedIssues: [] };
    }

    const sim = meta.simulatedState;
    if (!sim.resolvedIssues) sim.resolvedIssues = [];

    let activityText = '';
    if (action === 'resolve_conflict') {
      sim.resolvedIssues.push(issueId);
      activityText = 'Successfully resolved merge conflicts in branch feature/login.';
    } else if (action === 'attach_head') {
      sim.detachedHead = false;
      sim.resolvedIssues.push(issueId);
      activityText = `Successfully resolved detached HEAD state, checked out to ${repository.defaultBranch}.`;
    } else {
      sim.resolvedIssues.push(issueId);
      activityText = `Executed confirmed git operations for ${action}.`;
    }

    // Update db
    await prisma.repository.update({
      where: { id: repository.id },
      data: { metadata: JSON.stringify(meta) }
    });

    try {
      await prisma.activity.create({
        data: {
          repositoryId: repository.id,
          type: 'branch',
          payload: JSON.stringify({ message: activityText, author: 'GitSense AI Doctor' })
        }
      });
    } catch (actErr) {
      console.error('[Confirm-Fix] Failed to create activity log:', actErr.message);
    }

    res.json({
      success: true,
      message: 'Autonomous repair operation successfully applied.',
      activity: activityText
    });
  } catch (err) {
    console.error('[Repos] confirm-fix error:', err);
    res.status(500).json({ error: 'Failed to confirm and apply repository fix.' });
  }
});

// ── POST /api/repos/:id/simulate-issue ───────────────────────
// Helper to simulate specific repository issues for demoing
router.post('/:id/simulate-issue', async (req, res) => {
  try {
    const { type } = req.body;
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    let meta = repository.metadata ? JSON.parse(repository.metadata) : {};
    if (!meta.simulatedState) {
      meta.simulatedState = { uncommittedChanges: [], stashes: [], detachedHead: false, resolvedIssues: [] };
    }

    const sim = meta.simulatedState;
    sim.resolvedIssues = [];

    if (type === 'uncommitted') {
      sim.uncommittedChanges = [
        { file: 'frontend/src/sections/Hero.jsx', status: 'MODIFIED', color: '#7C5CFF' },
        { file: 'backend/src/routes/auth.js', status: 'MODIFIED', color: '#7C5CFF' }
      ];
    } else if (type === 'detached_head') {
      sim.detachedHead = true;
    } else if (type === 'clean') {
      sim.uncommittedChanges = [];
      sim.stashes = [];
      sim.detachedHead = false;
      sim.resolvedIssues = [];
    }

    await prisma.repository.update({
      where: { id: repository.id },
      data: { metadata: JSON.stringify(meta) }
    });

    res.json({ success: true, simulatedState: sim });
  } catch (err) {
    console.error('[Repos] simulate-issue error:', err);
    res.status(500).json({ error: 'Failed to toggle simulation state.' });
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
