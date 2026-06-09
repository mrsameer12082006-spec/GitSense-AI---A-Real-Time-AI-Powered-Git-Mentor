import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import ingestionService from '../services/ingestion.js';

const router = Router();
router.use(authenticate);

// POST /api/repos/:id/ingest - Start repository ingestion
router.post('/:id/ingest', async (req, res) => {
  try {
    const repositoryId = req.params.id;
    const userId = req.user.id;

    // Check if repository exists and belongs to user
    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    // Check if there is already an active job running
    const existingJob = await prisma.ingestionJob.findFirst({
      where: { repositoryId, status: 'running' },
    });

    if (existingJob) {
      return res.status(400).json({ error: 'Ingestion is already running for this repository.', jobId: existingJob.id });
    }

    // Trigger ingestion in the background
    const io = req.app.get('io');
    
    // Launch in background
    ingestionService.ingestRepository(repositoryId, userId, io).catch((err) => {
      console.error(`[Ingestion Route] Background ingestion failed for ${repositoryId}:`, err);
    });

    res.json({ message: 'Ingestion pipeline triggered successfully.' });
  } catch (err) {
    console.error('[Ingestion Route] Error triggering ingestion:', err);
    res.status(500).json({ error: 'Failed to start ingestion.' });
  }
});

// GET /api/repos/:id/ingestion-status - Check progress of ingestion
router.get('/:id/ingestion-status', async (req, res) => {
  try {
    const repositoryId = req.params.id;
    const userId = req.user.id;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    const job = await prisma.ingestionJob.findFirst({
      where: { repositoryId },
      orderBy: { startedAt: 'desc' },
    });

    res.json({
      status: job ? job.status : 'none',
      progress: job ? job.progress : 0,
      currentStep: job ? job.currentStep : 'Not started',
      errorMessage: job ? job.errorMessage : null,
      lastIngestedAt: repo.lastIngestedAt,
      chunkCount: repo.chunkCount,
    });
  } catch (err) {
    console.error('[Ingestion Route] Error checking status:', err);
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

// POST /api/repos/:id/sync - Manually trigger sync (re-ingest)
router.post('/:id/sync', async (req, res) => {
  try {
    const repositoryId = req.params.id;
    const userId = req.user.id;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    const existingJob = await prisma.ingestionJob.findFirst({
      where: { repositoryId, status: 'running' },
    });

    if (existingJob) {
      return res.status(400).json({ error: 'Sync is already running.', jobId: existingJob.id });
    }

    const io = req.app.get('io');
    ingestionService.incrementalSync(repositoryId, userId, io).catch((err) => {
      console.error(`[Ingestion Route] Background sync failed for ${repositoryId}:`, err);
    });

    res.json({ message: 'Sync pipeline triggered successfully.' });
  } catch (err) {
    console.error('[Ingestion Route] Error triggering sync:', err);
    res.status(500).json({ error: 'Failed to start sync.' });
  }
});

// GET /api/repos/:id/chunks/stats - Get stats on chunks count
router.get('/:id/chunks/stats', async (req, res) => {
  try {
    const repositoryId = req.params.id;
    const userId = req.user.id;

    const repo = await prisma.repository.findFirst({
      where: { id: repositoryId, userId },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or access denied.' });
    }

    const stats = await prisma.repoChunk.groupBy({
      by: ['sourceType'],
      where: { repositoryId },
      _count: {
        _all: true,
      },
    });

    const counts = {
      commit: 0,
      file: 0,
      pr: 0,
      issue: 0,
      branch: 0,
      readme: 0,
      config: 0,
    };

    stats.forEach((s) => {
      if (s.sourceType in counts) {
        counts[s.sourceType] = s._count._all;
      }
    });

    const total = Object.values(counts).reduce((acc, curr) => acc + curr, 0);

    res.json({ counts, total });
  } catch (err) {
    console.error('[Ingestion Route] Error fetching chunk stats:', err);
    res.status(500).json({ error: 'Failed to fetch chunk stats.' });
  }
});

export default router;
