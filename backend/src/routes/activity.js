import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import githubService from '../services/github.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── GET /api/activity/:repoId ───────────────────────────────
// Get recent activity for a repository (live from GitHub API)
router.get('/:repoId', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.repoId, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || null;

    const [commits, prs, issues, workflows] = await Promise.allSettled([
      githubService.getCommits(repository.owner, repository.name, token, 5),
      githubService.getPullRequests(repository.owner, repository.name, token),
      githubService.getIssues(repository.owner, repository.name, token),
      githubService.getWorkflowRuns(repository.owner, repository.name, token),
    ]);

    res.json({
      activity: {
        commits: commits.status === 'fulfilled' ? commits.value : [],
        pullRequests: prs.status === 'fulfilled' ? prs.value.slice(0, 5) : [],
        issues: issues.status === 'fulfilled' ? issues.value.slice(0, 5) : [],
        pipelines: workflows.status === 'fulfilled' ? workflows.value : [],
      },
    });
  } catch (err) {
    console.error('[Activity] error:', err);
    res.status(500).json({ error: 'Failed to fetch activity.' });
  }
});

// ── GET /api/activity/:repoId/stats ─────────────────────────
// Get aggregated stats for a repository
router.get('/:repoId/stats', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.repoId, userId: req.user.id },
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

    res.json({ stats: insights });
  } catch (err) {
    console.error('[Activity] stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

export default router;
