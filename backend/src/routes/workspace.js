import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { exec, spawn } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';

const execAsync = util.promisify(exec);
const router = Router();
const prisma = new PrismaClient();

const REPO_DIR = path.join(process.cwd(), 'data', 'repos');

// All workspace routes require authentication
router.use(authenticate);

// Helper: get repo record + token + ensure local clone exists
async function getRepoContext(req) {
  const repository = await prisma.repository.findFirst({
    where: { id: req.params.repoId, userId: req.user.id },
  });
  if (!repository) throw new Error('REPO_NOT_FOUND');

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const token = user?.githubToken || process.env.GITHUB_TOKEN || null;

  // Ensure local clone exists
  const repoPath = path.join(REPO_DIR, repository.id);
  try {
    await fs.access(repoPath);
  } catch {
    // Clone it
    const cloneUrl = token
      ? `https://${token}@github.com/${repository.owner}/${repository.name}.git`
      : `https://github.com/${repository.owner}/${repository.name}.git`;
    await fs.mkdir(REPO_DIR, { recursive: true });
    await execAsync(`git clone "${cloneUrl}" "${repoPath}"`);
  }

  return { repository, token, repoPath };
}

// Helper: run a command safely, return { stdout, stderr, exitCode }
async function runCmd(cmd, cwd, timeoutMs = 15000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message || 'Command failed',
      exitCode: err.code || 1,
    };
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/exec
// Execute a shell command in the cloned repo directory
// ─────────────────────────────────────────────────────────
router.post('/:repoId/exec', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'Command string is required.' });
    }

    // Block dangerous commands
    const blocked = ['rm -rf /', 'format', 'del /s', 'shutdown', 'reboot', 'mkfs'];
    const lowerCmd = command.toLowerCase().trim();
    if (blocked.some(b => lowerCmd.includes(b))) {
      return res.status(403).json({ error: 'This command is blocked for safety.' });
    }

    const { repoPath } = await getRepoContext(req);
    const result = await runCmd(command, repoPath, 30000);

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] exec error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/workspace/:repoId/git/status
// Get real git status from the cloned repo
// ─────────────────────────────────────────────────────────
router.get('/:repoId/git/status', async (req, res) => {
  try {
    const { repoPath, repository } = await getRepoContext(req);

    // Get branch name
    const branchResult = await runCmd('git rev-parse --abbrev-ref HEAD', repoPath);
    const branch = branchResult.stdout.trim() || repository.defaultBranch || 'main';

    // Get porcelain status
    const statusResult = await runCmd('git status --porcelain', repoPath);
    const lines = statusResult.stdout.trim().split('\n').filter(Boolean);

    const staged = [];
    const unstaged = [];

    for (const line of lines) {
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const filePath = line.substring(3).trim();

      // Staged changes (index column has a letter)
      if (indexStatus !== ' ' && indexStatus !== '?') {
        staged.push({ file: filePath, status: indexStatus });
      }
      // Unstaged changes (work tree column has a letter, or untracked ??)
      if (workTreeStatus !== ' ' || indexStatus === '?') {
        const st = indexStatus === '?' ? '?' : workTreeStatus;
        unstaged.push({ file: filePath, status: st });
      }
    }

    // Check if clean
    const clean = lines.length === 0;

    res.json({ branch, staged, unstaged, clean });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/add
// Stage files: { files: ['.'] } or { files: ['src/app.js'] }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/add', async (req, res) => {
  try {
    const { files } = req.body;
    const fileList = Array.isArray(files) ? files.join(' ') : '.';
    const { repoPath } = await getRepoContext(req);

    const result = await runCmd(`git add ${fileList}`, repoPath);
    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git add error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/commit
// Commit with message: { message: "fix: something" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/commit', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Commit message is required.' });
    }
    const { repoPath } = await getRepoContext(req);

    // Set git user config if not set (needed for commits)
    await runCmd(`git config user.email "${req.user.email || 'gitsense@user.ai'}"`, repoPath);
    await runCmd(`git config user.name "${req.user.name || 'GitSense User'}"`, repoPath);

    const safeMsg = message.replace(/"/g, '\\"');
    const result = await runCmd(`git commit -m "${safeMsg}"`, repoPath);

    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git commit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/push
// Push to remote: { branch: "main" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/push', async (req, res) => {
  try {
    const { repoPath, repository } = await getRepoContext(req);
    const branch = req.body.branch || repository.defaultBranch || 'main';

    const result = await runCmd(`git push origin ${branch}`, repoPath, 30000);

    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git push error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/pull
// Pull from remote: { branch: "main" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/pull', async (req, res) => {
  try {
    const { repoPath, repository } = await getRepoContext(req);
    const branch = req.body.branch || repository.defaultBranch || 'main';

    const result = await runCmd(`git pull origin ${branch}`, repoPath, 30000);

    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git pull error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PUT /api/workspace/:repoId/file
// Save file content to the local clone AND push via GitHub API
// Body: { path: "src/auth.js", content: "...", commitMessage: "..." }
// ─────────────────────────────────────────────────────────
router.put('/:repoId/file', async (req, res) => {
  try {
    const { path: filePath, content, commitMessage } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'File path and content are required.' });
    }

    const { repoPath, repository, token } = await getRepoContext(req);
    const msg = commitMessage || `Update ${filePath} via GitSense AI`;

    // 1. Write file to local clone
    const fullPath = path.join(repoPath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');

    // 2. Also save via GitHub Contents API if token is available
    let githubSaved = false;
    if (token) {
      try {
        // First get the current file SHA (needed for updates)
        const getUrl = `https://api.github.com/repos/${repository.owner}/${repository.name}/contents/${filePath}`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        };

        let sha = null;
        try {
          const existing = await axios.get(getUrl, { headers });
          sha = existing.data.sha;
        } catch (e) {
          // File doesn't exist yet on GitHub, that's fine
        }

        const putBody = {
          message: msg,
          content: Buffer.from(content, 'utf8').toString('base64'),
          ...(sha ? { sha } : {}),
        };

        await axios.put(getUrl, putBody, { headers });
        githubSaved = true;
      } catch (ghErr) {
        console.error('[Workspace] GitHub save error:', ghErr.response?.data || ghErr.message);
        // Still saved locally, just not to GitHub
      }
    }

    res.json({
      success: true,
      savedLocally: true,
      savedToGithub: githubSaved,
      message: githubSaved
        ? `File saved and pushed to GitHub.`
        : `File saved locally. Connect GitHub token to push directly.`,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] file save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/run
// Run code (Node.js or Python) and return output
// Body: { code: "...", language: "javascript" | "python" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/run', async (req, res) => {
  try {
    const { code, language } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required.' });
    }

    const { repoPath } = await getRepoContext(req);

    // Write temp file
    const ext = language === 'python' ? '.py' : '.js';
    const tmpFile = path.join(repoPath, `_gitsense_run${ext}`);
    await fs.writeFile(tmpFile, code, 'utf8');

    // Execute
    const cmd = language === 'python' ? `python "${tmpFile}"` : `node "${tmpFile}"`;
    const result = await runCmd(cmd, repoPath, 15000);

    // Cleanup temp file
    try {
      await fs.unlink(tmpFile);
    } catch {}

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] run error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
