import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { exec, spawn, execFile } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';

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

export default router;
