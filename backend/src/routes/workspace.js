import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { exec, spawn, execFile } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import githubService from '../services/github.js';
import aiService from '../services/ai.js';

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);
const router = Router();
const prisma = new PrismaClient();

// Keep track of active running processes for terminal and runner
const activeProcesses = new Map();

// Helper to kill process tree cleanly (Windows-safe taskkill, Unix process group kill)
function killProcessTree(pid) {
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /f /t`, (err) => {
      if (err) console.error(`[Workspace] taskkill error for pid ${pid}:`, err);
    });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

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
      stderr: err.stderr || (err.stdout ? '' : (err.message || 'Command failed')),
      exitCode: err.code || 1,
    };
  }
}

// Helper: run a git command safely using execFile to avoid shell parsing issues (especially on Windows)
async function runGitCmd(args, cwd, timeoutMs = 15000) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || (err.stdout ? '' : (err.message || 'Git command failed')),
      exitCode: err.code || 1,
    };
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/exec
// Execute a shell command in the cloned repo directory (Streaming)
// ─────────────────────────────────────────────────────────
router.post('/:repoId/exec', async (req, res) => {
  try {
    const { command, shell } = req.body;
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

    // Setup chunked response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Spawn execution in requested shell
    let cmd, args;
    const requestedShell = shell || 'PowerShell';
    if (requestedShell === 'PowerShell') {
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command];
    } else if (requestedShell === 'Bash') {
      cmd = 'bash.exe';
      args = ['-c', command];
    } else {
      cmd = 'cmd.exe';
      args = ['/c', command];
    }

    const processKey = `${req.user.id}-${req.params.repoId}-exec`;
    if (activeProcesses.has(processKey)) {
      const oldChild = activeProcesses.get(processKey);
      killProcessTree(oldChild.pid);
      activeProcesses.delete(processKey);
    }

    const child = spawn(cmd, args, {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcesses.set(processKey, child);

    const writeChunk = (data) => {
      res.write(JSON.stringify(data) + '\n');
    };

    child.stdout.on('data', (data) => {
      writeChunk({ type: 'stdout', text: data.toString() });
    });

    child.stderr.on('data', (data) => {
      writeChunk({ type: 'stderr', text: data.toString() });
    });

    const cleanup = () => {
      if (activeProcesses.get(processKey) === child) {
        activeProcesses.delete(processKey);
      }
    };

    let resolved = false;
    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        writeChunk({ type: 'exit', exitCode: code || 0 });
        res.end();
        cleanup();
      }
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        writeChunk({ type: 'stderr', text: err.message });
        writeChunk({ type: 'exit', exitCode: 1 });
        res.end();
        cleanup();
      }
    });

    req.on('close', () => {
      if (!resolved) {
        resolved = true;
        killProcessTree(child.pid);
        cleanup();
      }
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
    const branchResult = await runGitCmd(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
    const branch = branchResult.stdout.trim() || repository.defaultBranch || 'main';

    // Get porcelain status
    const statusResult = await runGitCmd(['status', '--porcelain'], repoPath);
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
    const fileList = Array.isArray(files) ? files : ['.'];
    const { repoPath } = await getRepoContext(req);

    const result = await runGitCmd(['add', ...fileList], repoPath);
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
    await runGitCmd(['config', 'user.email', req.user.email || 'gitsense@user.ai'], repoPath);
    await runGitCmd(['config', 'user.name', req.user.name || 'GitSense User'], repoPath);

    const result = await runGitCmd(['commit', '-m', message], repoPath);

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

    const result = await runGitCmd(['push', 'origin', branch], repoPath, 30000);

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

    const result = await runGitCmd(['pull', 'origin', branch], repoPath, 30000);

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
// GET /api/workspace/:repoId/git/branches
// Get all unique branches (local and remote-tracking)
// ─────────────────────────────────────────────────────────
router.get('/:repoId/git/branches', async (req, res) => {
  try {
    const { repoPath } = await getRepoContext(req);

    // Get all local and remote branches
    const result = await runGitCmd(['branch', '-a', '--format=%(refname:short)'], repoPath);
    const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean);

    const branchesSet = new Set();
    for (const line of lines) {
      if (line.includes('HEAD')) continue;
      // Strip remote prefix "origin/" to list branches cleanly
      const cleanName = line.startsWith('origin/') ? line.substring(7) : line;
      branchesSet.add(cleanName);
    }

    res.json({ branches: Array.from(branchesSet) });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git branches error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/checkout
// Switch to a branch: { branch: "main" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/checkout', async (req, res) => {
  try {
    const { branch } = req.body;
    if (!branch || typeof branch !== 'string') {
      return res.status(400).json({ error: 'Branch name is required.' });
    }
    const { repoPath } = await getRepoContext(req);

    const result = await runGitCmd(['checkout', branch], repoPath);

    res.json({
      success: result.exitCode === 0,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] git checkout error:', err);
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

    // 2. Also save via GitHub Contents API if token is available (unless localOnly is specified)
    let githubSaved = false;
    if (token && !req.body.localOnly) {
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
// Run code (Node.js or Python) and stream output (Streaming)
// Body: { code: "...", language: "javascript" | "python" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/run', async (req, res) => {
  let tmpFile = null;
  try {
    const { code, language } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Code is required.' });
    }

    const { repoPath } = await getRepoContext(req);

    // Write temp file
    const ext = language === 'python' ? '.py' : '.js';
    tmpFile = path.join(repoPath, `_gitsense_run${ext}`);
    await fs.writeFile(tmpFile, code, 'utf8');

    // Setup chunked response headers
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const cmd = language === 'python' ? 'python' : 'node';
    const args = [tmpFile];

    const processKey = `${req.user.id}-${req.params.repoId}-run`;
    if (activeProcesses.has(processKey)) {
      const oldChild = activeProcesses.get(processKey);
      killProcessTree(oldChild.pid);
      activeProcesses.delete(processKey);
    }

    const child = spawn(cmd, args, {
      cwd: repoPath,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeProcesses.set(processKey, child);

    const writeChunk = (data) => {
      res.write(JSON.stringify(data) + '\n');
    };

    child.stdout.on('data', (data) => {
      writeChunk({ type: 'stdout', text: data.toString() });
    });

    child.stderr.on('data', (data) => {
      writeChunk({ type: 'stderr', text: data.toString() });
    });

    const cleanup = async () => {
      if (activeProcesses.get(processKey) === child) {
        activeProcesses.delete(processKey);
      }
      if (tmpFile) {
        try {
          await fs.unlink(tmpFile);
        } catch {}
        tmpFile = null;
      }
    };

    let resolved = false;
    child.on('close', async (code) => {
      if (!resolved) {
        resolved = true;
        writeChunk({ type: 'exit', exitCode: code || 0 });
        res.end();
        await cleanup();
      }
    });

    child.on('error', async (err) => {
      if (!resolved) {
        resolved = true;
        writeChunk({ type: 'stderr', text: err.message });
        writeChunk({ type: 'exit', exitCode: 1 });
        res.end();
        await cleanup();
      }
    });

    req.on('close', async () => {
      if (!resolved) {
        resolved = true;
        killProcessTree(child.pid);
        await cleanup();
      }
    });

  } catch (err) {
    if (tmpFile) {
      try {
        await fs.unlink(tmpFile);
      } catch {}
    }
    if (err.message === 'REPO_NOT_FOUND') {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    console.error('[Workspace] run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/input
// Send stdin input to a running process
// Body: { text: "...", type: "run" | "exec" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/input', async (req, res) => {
  try {
    const { text, type } = req.body;
    if (text === undefined || !type) {
      return res.status(400).json({ error: 'Input text and type are required.' });
    }

    const processKey = `${req.user.id}-${req.params.repoId}-${type}`;
    const child = activeProcesses.get(processKey);
    if (!child) {
      return res.status(404).json({ error: 'No active process found for this workspace and type.' });
    }

    // Write input to the process's stdin
    child.stdin.write(text + '\n');
    res.json({ success: true });
  } catch (err) {
    console.error('[Workspace] input error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/kill
// Kill a running process
// Body: { type: "run" | "exec" }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/kill', async (req, res) => {
  try {
    const { type } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'Process type is required.' });
    }

    const processKey = `${req.user.id}-${req.params.repoId}-${type}`;
    const child = activeProcesses.get(processKey);
    if (!child) {
      return res.status(404).json({ error: 'No active process found for this workspace and type.' });
    }

    killProcessTree(child.pid);
    activeProcesses.delete(processKey);
    res.json({ success: true, message: 'Process terminated.' });
  } catch (err) {
    console.error('[Workspace] kill error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/merge-check
// Trial merge source branch into target branch to check for conflicts
// Body: { sourceBranch: "...", targetBranch: "..." }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/merge-check', async (req, res) => {
  let tempBranch = `gs-temp-check-${Date.now()}`;
  let context;
  try {
    const { sourceBranch, targetBranch } = req.body;
    if (!sourceBranch || !targetBranch) {
      return res.status(400).json({ error: 'Source and target branches are required.' });
    }

    context = await getRepoContext(req);
    const { repoPath } = context;

    // 1. Fetch origin to make sure we are up to date
    await runGitCmd(['fetch', 'origin'], repoPath);

    // 2. Checkout target branch and sync
    await runGitCmd(['checkout', targetBranch], repoPath);
    await runGitCmd(['reset', '--hard', `origin/${targetBranch}`], repoPath).catch(() => {});

    // 3. Create a temp branch off target branch
    await runGitCmd(['checkout', '-b', tempBranch], repoPath);

    // 4. Try merging source branch
    const mergeRes = await runGitCmd(['merge', `origin/${sourceBranch}`], repoPath);

    if (mergeRes.exitCode === 0) {
      res.json({ success: true, hasConflicts: false });
    } else {
      // Check if it's a conflict
      const diffRes = await runGitCmd(['diff', '--name-only', '--diff-filter=U'], repoPath);
      const conflicts = diffRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      if (conflicts.length === 0) {
        return res.status(400).json({
          success: false,
          error: mergeRes.stderr || mergeRes.stdout || 'Merge failed for a non-conflict reason.'
        });
      }
      res.json({ success: true, hasConflicts: true, conflicts });
    }
  } catch (err) {
    console.error('[Workspace] merge-check error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (context) {
      const { repoPath, repository } = context;
      // Abort any active merge on the temp branch
      await runGitCmd(['merge', '--abort'], repoPath).catch(() => {});
      // Switch back to target/default branch
      await runGitCmd(['checkout', repository.defaultBranch || 'main'], repoPath).catch(() => {});
      // Delete the temp branch
      await runGitCmd(['branch', '-D', tempBranch], repoPath).catch(() => {});
    }
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/merge-create-branch
// Create a new resolution branch off target branch and merge source branch
// Body: { sourceBranch: "...", targetBranch: "...", resolutionBranch: "..." }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/merge-create-branch', async (req, res) => {
  try {
    const { sourceBranch, targetBranch, resolutionBranch } = req.body;
    if (!sourceBranch || !targetBranch || !resolutionBranch) {
      return res.status(400).json({ error: 'Source, target and resolution branches are required.' });
    }

    const { repoPath } = await getRepoContext(req);

    // 1. Fetch origin
    await runGitCmd(['fetch', 'origin'], repoPath);

    // 2. Checkout target branch and sync
    await runGitCmd(['checkout', targetBranch], repoPath);
    await runGitCmd(['reset', '--hard', `origin/${targetBranch}`], repoPath).catch(() => {});

    // 3. Delete resolution branch if it already exists locally
    await runGitCmd(['checkout', targetBranch], repoPath);
    await runGitCmd(['branch', '-D', resolutionBranch], repoPath).catch(() => {});

    // 4. Create resolution branch and check it out
    await runGitCmd(['checkout', '-b', resolutionBranch], repoPath);

    // 5. Merge source branch
    const mergeRes = await runGitCmd(['merge', `origin/${sourceBranch}`], repoPath);

    // 6. Get conflicts list
    const diffRes = await runGitCmd(['diff', '--name-only', '--diff-filter=U'], repoPath);
    const conflictsList = diffRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);

    if (mergeRes.exitCode !== 0 && conflictsList.length === 0) {
      await runGitCmd(['checkout', targetBranch], repoPath);
      await runGitCmd(['branch', '-D', resolutionBranch], repoPath).catch(() => {});
      return res.status(400).json({
        success: false,
        error: mergeRes.stderr || mergeRes.stdout || 'Merge failed for a non-conflict reason.'
      });
    }

    const conflicts = [];
    for (const file of conflictsList) {
      const fullPath = path.join(repoPath, file);
      let content = '';
      try {
        content = await fs.readFile(fullPath, 'utf8');
      } catch (readErr) {
        console.error(`Failed to read conflicting file ${file}:`, readErr.message);
      }

      // Extract raw conflict sections
      const conflictBlocks = [];
      const lines = content.split('\n');
      let insideConflict = false;
      let currentBlock = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('<<<<<<<')) {
          insideConflict = true;
          currentBlock = [line];
        } else if (line.startsWith('>>>>>>>')) {
          if (insideConflict) {
            currentBlock.push(line);
            conflictBlocks.push(currentBlock.join('\n'));
            insideConflict = false;
            currentBlock = [];
          }
        } else if (insideConflict) {
          currentBlock.push(line);
        }
      }

      conflicts.push({
        file,
        content,
        conflictBlocks
      });
    }

    res.json({
      success: true,
      mergedCleanly: mergeRes.exitCode === 0 && conflicts.length === 0,
      conflicts
    });
  } catch (err) {
    console.error('[Workspace] merge-create-branch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/merge-resolve-ai
// Request AI to resolve conflicts in a file
// Body: { conflictFile: "...", rawConflictBlock: "..." }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/merge-resolve-ai', async (req, res) => {
  try {
    const { conflictFile, rawConflictBlock } = req.body;
    if (!conflictFile || !rawConflictBlock) {
      return res.status(400).json({ error: 'Conflict file and rawConflictBlock are required.' });
    }

    console.log(`[Workspace] Running AI Conflict Resolution for: ${conflictFile}`);

    const aiPrompt = `You are a senior git engineer. Resolve the merge conflict in file: "${conflictFile}".
Here is the conflicting section of the file:
${rawConflictBlock}

Analyze the conflict and recommend the best merged version of this code.
Return a valid JSON object ONLY:
{
  "recommendedResolution": "complete resolved code block to replace the conflict region",
  "explanation": "clear, concise explanation of why this resolution is correct"
}
Do not wrap it in markdown code blocks, just raw JSON.`;

    const aiResult = await aiService.generateCompletion([
      { role: 'system', content: aiPrompt },
      { role: 'user', content: 'Resolve this conflict.' }
    ], 0.2);

    let parsedResolution = { recommendedResolution: '', explanation: 'No resolution generated.' };
    try {
      parsedResolution = JSON.parse(aiResult.replace(/```json|```/g, '').trim());
    } catch (parseErr) {
      console.error('[Workspace] Failed to parse AI conflict resolution response:', parseErr.message, 'Raw response:', aiResult);
      parsedResolution = {
        recommendedResolution: aiResult,
        explanation: 'AI returned unformatted response, parsed directly.'
      };
    }

    res.json({
      success: true,
      recommendedResolution: parsedResolution.recommendedResolution,
      explanation: parsedResolution.explanation
    });
  } catch (err) {
    console.error('[Workspace] merge-resolve-ai error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/merge-apply-resolution
// Save resolved file, git add, and commit merge if all resolved
// Body: { conflictFile: "...", resolutionBranch: "...", resolvedContent: "..." }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/merge-apply-resolution', async (req, res) => {
  try {
    const { conflictFile, resolutionBranch, resolvedContent } = req.body;
    if (!conflictFile || !resolutionBranch || resolvedContent === undefined) {
      return res.status(400).json({ error: 'Conflict file, resolution branch, and resolvedContent are required.' });
    }

    const { repoPath } = await getRepoContext(req);

    // 1. Switch to resolution branch just to be safe
    await runGitCmd(['checkout', resolutionBranch], repoPath);

    // 2. Write resolved content to file
    const fullPath = path.join(repoPath, conflictFile);
    await fs.writeFile(fullPath, resolvedContent, 'utf8');

    // 3. Git add the file
    await runGitCmd(['add', conflictFile], repoPath);

    // 4. Check if other files remain in conflict
    const diffRes = await runGitCmd(['diff', '--name-only', '--diff-filter=U'], repoPath);
    const remainingConflicts = diffRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);

    let allResolved = remainingConflicts.length === 0;

    if (allResolved) {
      // 5. Commit the merge
      await runGitCmd([
        '-c', 'user.name=GitSense AI',
        '-c', 'user.email=gitsense@ai.com',
        'commit',
        '-m', `chore: resolve merge conflicts in ${conflictFile} using GitSense AI`
      ], repoPath);
    }

    res.json({
      success: true,
      allResolved,
      remainingConflicts
    });
  } catch (err) {
    console.error('[Workspace] merge-apply-resolution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/workspace/:repoId/git/merge-push-and-finalize
// Push resolution branch, and optionally merge & push to target branch
// Body: { resolutionBranch: "...", targetBranch: "...", mergeIntoTarget: true/false }
// ─────────────────────────────────────────────────────────
router.post('/:repoId/git/merge-push-and-finalize', async (req, res) => {
  try {
    const { resolutionBranch, targetBranch, mergeIntoTarget } = req.body;
    if (!resolutionBranch || !targetBranch) {
      return res.status(400).json({ error: 'Resolution branch and target branch are required.' });
    }

    const { repository, token, repoPath } = await getRepoContext(req);

    let pushedResolution = false;
    let pushedTarget = false;

    // 1. Configure remote url with token
    if (token) {
      const remoteUrl = `https://${token}@github.com/${repository.owner}/${repository.name}.git`;
      await runGitCmd(['remote', 'set-url', 'origin', remoteUrl], repoPath);
    }

    // 2. Push resolution branch
    const pushRes = await runGitCmd(['push', '-u', 'origin', resolutionBranch], repoPath);
    pushedResolution = pushRes.exitCode === 0;

    // 3. Merge into target and push target branch if requested
    if (mergeIntoTarget) {
      await runGitCmd(['checkout', targetBranch], repoPath);
      const mergeRes = await runGitCmd(['merge', resolutionBranch], repoPath);
      if (mergeRes.exitCode === 0) {
        const pushTargetRes = await runGitCmd(['push', 'origin', targetBranch], repoPath);
        pushedTarget = pushTargetRes.exitCode === 0;
      }
    }

    // 4. Invalidate GitHub commits cache
    githubService.clearCache(repository.owner, repository.name);

    res.json({
      success: true,
      pushedResolution,
      pushedTarget,
      message: mergeIntoTarget 
        ? `Merge finalized: pushed ${resolutionBranch} and merged into ${targetBranch} on GitHub.` 
        : `Resolution branch ${resolutionBranch} pushed to GitHub.`
    });
  } catch (err) {
    console.error('[Workspace] merge-push-and-finalize error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
