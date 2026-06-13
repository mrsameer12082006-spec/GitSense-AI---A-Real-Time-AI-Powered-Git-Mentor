import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import githubService from '../services/github.js';
import ingestionService from '../services/ingestion.js';
import localGitService from '../services/localGit.js';
import aiService from '../services/ai.js';
import axios from 'axios';
import { scanRepository, fetchWithAuth } from '../services/githubScanner.js';
import {
  fixMissingGitignore,
  fixStaleBranch,
  fixBranchCollisions,
  triggerRerunFailedJobs,
  diagnoseCiFailureLog,
  createGitignore,
  deleteStaleBranch,
  postCollisionComment,
  rerunFailedJobs
} from '../services/fixEngine.js';
import path from 'path';
import fs from 'fs/promises';

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
    const { owner, repo, token, issueType } = req.body;
    const finalToken = token || process.env.GITHUB_TOKEN;
    
    console.log(`[Scan API] Start scan:`, {
      owner,
      repo,
      tokenPresent: !!finalToken,
      tokenPrefix: finalToken ? finalToken.substring(0, 10) + '...' : 'none',
      issueType: issueType || 'all'
    });

    if (!owner || !repo || !finalToken) {
      console.warn(`[Scan API] Missing params: owner=${owner}, repo=${repo}, tokenPresent=${!!finalToken}`);
      return res.status(400).json({ error: 'owner, repo, and token are all required.' });
    }

    const result = await scanRepository(owner, repo, finalToken, issueType);
    return res.status(200).json({
      ...result,
      hasWriteAccess: req.session ? !!req.session.hasWriteAccess : false
    });
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
    return res.status(200).json({
      ...result,
      hasWriteAccess: req.session ? !!req.session.hasWriteAccess : false
    });
  } catch (err) {
    console.error(`[Scan Compatibility API] Error during scan:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error during repository scan' });
  }
});

// ── GET /api/repo/fix (SSE Progress Stream) ──────────────────
router.get('/fix', async (req, res) => {
  const { owner, repo, token, issueId, action, defaultBranch, branchName, prNumber1, prNumber2, collidingFiles, runId } = req.query;

  console.log(`[Fix SSE API] Start fix stream for issueId=${issueId}, action=${action}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (step, status, message) => {
    res.write(`data: ${JSON.stringify({ step, status, message })}\n\n`);
  };

  const finalToken = token || process.env.GITHUB_TOKEN;

  if (!owner || !repo || !finalToken) {
    sendSSE('error', 'failed', 'Missing owner, repo, or token query parameters.');
    res.end();
    return;
  }

  try {
    let fixResult = null;

    if (action === 'create_gitignore') {
      fixResult = await fixMissingGitignore(owner, repo, finalToken, defaultBranch || 'main', sendSSE);
    } else if (action === 'delete_stale_branch') {
      fixResult = await fixStaleBranch(owner, repo, finalToken, defaultBranch || 'main', branchName, sendSSE);
    } else if (action === 'coordinate_collisions') {
      let files = [];
      try {
        files = JSON.parse(collidingFiles || '[]');
      } catch (_) {}
      fixResult = await fixBranchCollisions(owner, repo, finalToken, prNumber1, prNumber2, files, sendSSE);
    } else if (action === 'rerun_ci_jobs') {
      fixResult = await triggerRerunFailedJobs(owner, repo, finalToken, runId, sendSSE);
    } else {
      sendSSE('error', 'failed', `Unsupported or unrecognized auto-fix action: ${action}`);
      res.end();
      return;
    }

    if (fixResult && fixResult.success) {
      sendSSE('done', 'complete', fixResult.verification || 'Fix applied and verified successfully!');
    } else {
      sendSSE('done', 'failed', fixResult?.error || 'Fix execution failed verification.');
    }
  } catch (err) {
    console.error(`[Fix SSE API] Stream error:`, err);
    sendSSE('done', 'failed', err.message || 'Server error occurred during fix execution.');
  } finally {
    res.end();
  }
});

// ── POST /api/repo/fix ──────────────────
router.post('/fix', async (req, res) => {
  try {
    const { owner, repo, token, fixType, params } = req.body;
    const finalToken = token || process.env.GITHUB_TOKEN;

    console.log(`[Fix POST API] Received request for fixType=${fixType} on ${owner}/${repo}`);

    if (!owner || !repo || !finalToken) {
      return res.status(400).json({ success: false, error: 'owner, repo, and token are required.' });
    }

    let result = null;

    switch (fixType) {
      case 'gitignore': {
        const projectType = params?.projectType;
        result = await createGitignore(owner, repo, finalToken, projectType);
        break;
      }
      case 'delete-branch': {
        const branchName = params?.branchName;
        if (!branchName) {
          return res.status(400).json({ success: false, error: 'branchName parameter is required.' });
        }
        result = await deleteStaleBranch(owner, repo, finalToken, branchName);
        break;
      }
      case 'sync-branch': {
        const defaultBranch = params?.defaultBranch || 'main';
        const branchName = params?.branchName;
        result = {
          success: true,
          steps: ['Generating manual sync commands'],
          verificationResult: {
            message: 'Manual sync commands generated.',
            commands: [
              `git checkout ${branchName}`,
              `git fetch origin`,
              `git merge origin/${defaultBranch}`,
              `git push origin ${branchName}`
            ]
          }
        };
        break;
      }
      case 'post-pr-comment': {
        const { prNumber1, prNumber2, collidingFiles } = params || {};
        if (!prNumber1 || !prNumber2) {
          return res.status(400).json({ success: false, error: 'prNumber1 and prNumber2 are required.' });
        }
        let files = [];
        if (typeof collidingFiles === 'string') {
          try {
            files = JSON.parse(collidingFiles);
          } catch (_) {}
        } else if (Array.isArray(collidingFiles)) {
          files = collidingFiles;
        }
        result = await postCollisionComment(owner, repo, finalToken, prNumber1, prNumber2, files);
        break;
      }
      case 'rerun-ci': {
        const runId = params?.runId;
        if (!runId) {
          return res.status(400).json({ success: false, error: 'runId parameter is required.' });
        }
        result = await rerunFailedJobs(owner, repo, finalToken, runId);
        break;
      }
      default:
        return res.status(400).json({ success: false, error: `Unsupported fixType: ${fixType}` });
    }

    return res.status(200).json({
      success: true,
      steps: result.steps || [],
      verificationResult: result.verificationResult || {},
      ...result
    });

  } catch (err) {
    console.error(`[Fix POST API] Error executing fix:`, err);
    return res.status(400).json({
      success: false,
      error: err.message || 'Error occurred during fix execution.'
    });
  }
});

// ── GET /api/repo/ci-diagnostics ──────────────────────────────
router.get('/ci-diagnostics', async (req, res) => {
  try {
    const { owner, repo, token, runId } = req.query;
    if (!owner || !repo || !runId) {
      return res.status(400).json({ error: 'owner, repo, and runId query params are required.' });
    }
    const finalToken = token || process.env.GITHUB_TOKEN;
    
    // Fetch jobs list for the run to locate the failed job ID
    const jobsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`;
    const jobsRes = await fetchWithAuth(jobsUrl, finalToken);
    const failedJob = (jobsRes.jobs || []).find(j => j.conclusion === 'failure');
    
    if (!failedJob) {
      return res.status(404).json({ error: 'No failed jobs found for this workflow run.' });
    }
    
    const snippets = await diagnoseCiFailureLog(owner, repo, finalToken, failedJob.id);
    return res.status(200).json({ snippets, jobName: failedJob.name });
  } catch (err) {
    console.error(`[Diagnostics API] Error:`, err);
    return res.status(500).json({ error: err.message || 'Failed to fetch job failure diagnostics.' });
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
      } else if (fixType === 'resolve_conflict' || req.body.action === 'resolve_conflict') {
        const payloadState = rawState || req.body.rawState || {};
        const { conflictFile, branchA, branchB, branchOption, recommendedResolution } = payloadState;
        
        if (!conflictFile) {
          return res.status(400).json({ success: false, error: 'conflictFile parameter is required.' });
        }

        const repoPath = localGitService.getRepoPath(repository.id);
        const fullFilePath = path.join(repoPath, conflictFile);

        // 1. Read current conflicting file content
        let fileContent = await fs.readFile(fullFilePath, 'utf8');

        // Helper to replace the conflict markers in fileContent
        const resolveConflictMarkers = (content, option, recResolution) => {
          const conflictRegex = /<<<<<<<[\s\S]*?=======[\s\S]*?>>>>>>>[^\n]*/;
          
          if (option === 'A' || option === 'B') {
            const globalRegex = /<<<<<<<[\s\S]*?=======[\s\S]*?>>>>>>>[^\n]*/g;
            return content.replace(globalRegex, (match) => {
              if (option === 'A') {
                const innerMatch = match.match(/<<<<<<<[^\n]*\n([\s\S]*?)\n=======/);
                return innerMatch ? innerMatch[1] : '';
              } else {
                const innerMatch = match.match(/\n=======[\s\S]*?\n([\s\S]*?)\n>>>>>>>/);
                return innerMatch ? innerMatch[1] : '';
              }
            });
          } else {
            // Option is recommended AI resolution
            return content.replace(conflictRegex, recResolution);
          }
        };

        const resolvedContent = resolveConflictMarkers(fileContent, branchOption, recommendedResolution);

        // 2. Write resolved content back to the file
        await fs.writeFile(fullFilePath, resolvedContent, 'utf8');

        // 3. Stage the file
        await localGitService.addFile(repository.id, conflictFile);

        // 4. Commit the merge
        const commitMsg = `chore: resolve merge conflict in ${conflictFile} accepting ${
          branchOption === 'recommended' ? 'AI recommended resolution' : `branch ${branchOption}`
        }`;
        await localGitService.commitMerge(repository.id, commitMsg);

        // 5. Try pushing to remote
        let pushed = false;
        try {
          if (token) {
            pushed = await localGitService.pushBranch(repository.id, repository.owner, repository.name, branchA || repository.defaultBranch, token);
          }
        } catch (pushErr) {
          console.warn('[Repos] Failed to push conflict resolution to origin:', pushErr.message);
        }

        result = {
          success: true,
          message: pushed
            ? `Successfully resolved conflict in ${conflictFile}, completed the merge, and pushed to GitHub.`
            : `Successfully resolved conflict in ${conflictFile} and completed the merge locally. (Remote push skipped/failed).`
        };
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
// Fetch file raw content (try local clone first, then fallback to GitHub API)
router.get('/:id/contents/file', async (req, res) => {
  try {
    const repository = await prisma.repository.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!repository) {
      return res.status(404).json({ error: 'Repository not found.' });
    }

    const pathQuery = req.query.path;
    if (!pathQuery) {
      return res.status(400).json({ error: 'File path is required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const token = user?.githubToken || process.env.GITHUB_TOKEN || null;

    // 1. Ensure local clone exists, and read from it (offline-first, includes local edits)
    try {
      const repoPath = await localGitService.ensureClone(repository.id, repository.owner, repository.name, token);
      const safePath = path.normalize(pathQuery).replace(/^(\.\.[\/\\])+/, '');
      const fullFilePath = path.join(repoPath, safePath);
      const fileContent = await fs.readFile(fullFilePath, 'utf8');
      return res.json({ content: fileContent });
    } catch (localErr) {
      console.warn(`[Repos] Local read/clone failed for ${pathQuery}, falling back to GitHub API:`, localErr.message);
    }

    // 2. Fallback to GitHub API
    const fileContent = await githubService.getFileContent(repository.owner, repository.name, pathQuery, token);
    res.json({ content: fileContent });
  } catch (err) {
    console.error('[Repos] Fetch file content error:', err);
    res.status(500).json({ error: 'Failed to fetch file content.' });
  }
});

export default router;
