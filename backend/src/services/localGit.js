import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = util.promisify(exec);
const REPO_DIR = path.join(process.cwd(), 'data', 'repos');

class LocalGitService {
  constructor() {
    this._ensureRepoDir();
  }

  async _ensureRepoDir() {
    try {
      await fs.mkdir(REPO_DIR, { recursive: true });
    } catch (err) {
      console.error('[LocalGit] Failed to create repo dir:', err);
    }
  }

  getRepoPath(repositoryId) {
    return path.join(REPO_DIR, repositoryId);
  }
  async ensureClone(repositoryId, owner, repoName, token) {
    const repoPath = this.getRepoPath(repositoryId);
    const gitFolderPath = path.join(repoPath, '.git');
    
    let existsAndHasGit = false;
    try {
      await fs.access(repoPath);
      await fs.access(gitFolderPath);
      existsAndHasGit = true;
    } catch (err) {
      // One of them doesn't exist
    }

    if (existsAndHasGit) {
      console.log(`[LocalGit] Repo directory exists and has .git folder: ${repoPath}. Skipping clone.`);
      try {
        await execAsync('git fetch --all', { cwd: repoPath });
      } catch (e) {
        console.error('[LocalGit] Fetch failed:', e.message);
      }
      return repoPath;
    } else {
      // If directory exists but has no .git folder, delete it and re-clone
      try {
        await fs.rm(repoPath, { recursive: true, force: true });
      } catch (rmErr) {
        console.error(`[LocalGit] Failed to clean existing repo directory: ${rmErr.message}`);
      }
      
      const cloneUrl = `https://${token}@github.com/${owner}/${repoName}.git`;
      console.log(`[LocalGit] Cloning repository ${owner}/${repoName} into ${repoPath}...`);
      await execAsync(`git clone ${cloneUrl} "${repoPath}"`);
      return repoPath;
    }
  }
  async getGitState(repositoryId) {
    const repoPath = this.getRepoPath(repositoryId);
    const state = {
      detachedHead: false,
      uncommittedChanges: [],
      stashes: []
    };

    try {
      await fs.access(repoPath);
    } catch {
      return state; // No clone yet
    }

    try {
      // Check Detached HEAD
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
      if (branchOut.trim() === 'HEAD') {
        state.detachedHead = true;
        const { stdout: hashOut } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
        state.headHash = hashOut.trim();
        try {
          const { stdout: reflogOut } = await execAsync('git reflog', { cwd: repoPath });
          const match = reflogOut.match(/checkout: moving from ([^\s]+) to/);
          if (match) {
            state.lastBranch = match[1];
          }
        } catch (e) {}
      }

      // Check Uncommitted changes
      const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: repoPath });
      if (statusOut.trim()) {
        const lines = statusOut.trim().split('\n');
        for (const line of lines) {
          if (!line) continue;
          const statusStr = line.substring(0, 2);
          const file = line.substring(3);
          state.uncommittedChanges.push({ file, statusStr });
        }
      }

      // Check Stashes
      try {
        const { stdout: stashOut } = await execAsync('git stash list --date=unix', { cwd: repoPath });
        if (stashOut.trim()) {
          const now = Math.floor(Date.now() / 1000);
          const lines = stashOut.trim().split('\n');
          for (const line of lines) {
            if (!line) continue;
            const match = line.match(/stash@\{(\d+)\}: ([A-Za-z]+) (.*?): (.*)/);
            // git stash list might not show unix timestamp easily without custom format.
            // Let's use standard git log format for stashes
            // git log --format="%gd: %gs | %ct" -g refs/stash
          }
        }
        
        // Better stash command
        const { stdout: stashLog } = await execAsync('git log --format="%gd|%gs|%ct" -g refs/stash', { cwd: repoPath });
        if (stashLog.trim()) {
          const now = Math.floor(Date.now() / 1000);
          const lines = stashLog.trim().split('\n');
          for (const line of lines) {
            if (!line) continue;
            const parts = line.split('|');
            if (parts.length >= 3) {
              const [id, msg, tsStr] = parts;
              const ts = parseInt(tsStr, 10);
              const daysOld = (now - ts) / (60 * 60 * 24);
              if (daysOld > 14) {
                state.stashes.push({ id, message: msg, daysOld: Math.floor(daysOld) });
              }
            }
          }
        }
      } catch (e) {}

    } catch (err) {
      console.error('[LocalGit] getGitState error:', err);
    }
    return state;
  }

  async checkoutBranch(repositoryId, branchName) {
    const repoPath = this.getRepoPath(repositoryId);
    await execAsync(`git checkout ${branchName}`, { cwd: repoPath });
  }

  async fetchAndMerge(repositoryId, branchName) {
    const repoPath = this.getRepoPath(repositoryId);
    await execAsync(`git fetch origin`, { cwd: repoPath });
    try {
      await execAsync(`git merge origin/${branchName}`, { cwd: repoPath });
      return { success: true };
    } catch (err) {
      // If merge conflict
      if (err.message.includes('CONFLICT')) {
        const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: repoPath });
        const conflictingFiles = stdout.trim().split('\n').filter(Boolean);
        // Abort the merge so we don't leave repo in bad state
        await execAsync('git merge --abort', { cwd: repoPath });
        return { success: false, conflicts: conflictingFiles };
      }
      throw err;
    }
  }

  async removeLargeFile(repositoryId, filePath) {
    const repoPath = this.getRepoPath(repositoryId);
    await execAsync(`git rm --cached "${filePath}"`, { cwd: repoPath });
    await fs.appendFile(path.join(repoPath, '.gitignore'), `\n${filePath}`);
    await execAsync(`git add .gitignore`, { cwd: repoPath });
    await execAsync(`git commit -m "chore: remove large file ${filePath} and ignore"`, { cwd: repoPath });
    // Note: We're not pushing here unless requested, maybe user wants to push later.
  }

  async abortMerge(repositoryId) {
    const repoPath = this.getRepoPath(repositoryId);
    try {
      await execAsync('git merge --abort', { cwd: repoPath });
    } catch {}
    try {
      await execAsync('git checkout .', { cwd: repoPath });
    } catch {}
    try {
      await execAsync('git clean -fd', { cwd: repoPath });
    } catch {}
  }

  async findClosestBranch(repositoryId, branchName) {
    const repoPath = this.getRepoPath(repositoryId);
    try {
      const { stdout } = await execAsync('git branch -a', { cwd: repoPath });
      const branches = stdout.split('\n')
        .map(b => b.replace(/^\*?\s+/, '').trim())
        .filter(Boolean);
      
      const cleanBranchName = branchName.toLowerCase().trim();

      // 1. Exact match (stripping remotes/origin/)
      for (const b of branches) {
        const simpleName = b.replace(/^remotes\/origin\//, '');
        if (simpleName.toLowerCase() === cleanBranchName) {
          return { name: simpleName, isRemote: b.startsWith('remotes/') };
        }
      }

      // 2. Fuzzy match: check if the branch contains the cleanBranchName or vice versa
      for (const b of branches) {
        const simpleName = b.replace(/^remotes\/origin\//, '');
        if (simpleName.toLowerCase().includes(cleanBranchName) || cleanBranchName.includes(simpleName.toLowerCase())) {
          return { name: simpleName, isRemote: b.startsWith('remotes/') };
        }
      }
    } catch (err) {
      console.error('[LocalGit] findClosestBranch error:', err.message);
    }
    return null;
  }

  async mergeBranches(repositoryId, owner, repoName, sourceBranch, targetBranch, token) {
    const repoPath = await this.ensureClone(repositoryId, owner, repoName, token);

    // 1. Clean up any stuck state first
    await this.abortMerge(repositoryId);

    // 2. Fetch origin
    await execAsync('git fetch origin', { cwd: repoPath });

    // 3. Resolve actual branch names in the local/remote repository
    const resolvedTarget = await this.findClosestBranch(repositoryId, targetBranch);
    const resolvedSource = await this.findClosestBranch(repositoryId, sourceBranch);

    const actualTarget = resolvedTarget ? resolvedTarget.name : targetBranch;
    const actualSource = resolvedSource ? resolvedSource.name : sourceBranch;
    const isSourceRemote = resolvedSource ? resolvedSource.isRemote : true;

    console.log(`[LocalGit] Resolved merge branches: source="${sourceBranch}" -> "${actualSource}" (remote: ${isSourceRemote}), target="${targetBranch}" -> "${actualTarget}"`);

    // 4. Checkout target branch and sync with origin
    try {
      await execAsync(`git checkout ${actualTarget}`, { cwd: repoPath });
    } catch (checkoutErr) {
      // If target branch doesn't exist locally, create it tracking origin
      await execAsync(`git checkout -b ${actualTarget} origin/${actualTarget}`, { cwd: repoPath });
    }
    await execAsync(`git reset --hard origin/${actualTarget}`, { cwd: repoPath }).catch(() => {});

    // 5. Try merging source branch
    const mergeCmd = isSourceRemote ? `git merge origin/${actualSource}` : `git merge ${actualSource}`;
    try {
      await execAsync(mergeCmd, { cwd: repoPath });
      return { success: true, merged: true, actualSource, actualTarget };
    } catch (err) {
      if (err.message.includes('CONFLICT') || err.message.includes('conflict') || err.message.includes('Conflict')) {
        const { stdout } = await execAsync('git diff --name-only --diff-filter=U', { cwd: repoPath });
        const conflictingFiles = stdout.trim().split('\n').filter(Boolean);
        return { success: false, conflicts: conflictingFiles, actualSource, actualTarget };
      }
      throw err;
    }
  }

  async pushBranch(repositoryId, owner, repoName, branchName, token) {
    const repoPath = this.getRepoPath(repositoryId);
    if (token) {
      const remoteUrl = `https://${token}@github.com/${owner}/${repoName}.git`;
      await execAsync(`git remote set-url origin "${remoteUrl}"`, { cwd: repoPath });
      await execAsync(`git push origin ${branchName}`, { cwd: repoPath });
      return true;
    }
    return false;
  }

  async commitMerge(repositoryId, message) {
    const repoPath = this.getRepoPath(repositoryId);
    await execAsync(`git -c user.name="GitSense AI" -c user.email="gitsense@ai.com" commit -m "${message}"`, { cwd: repoPath });
  }

  async addFile(repositoryId, filePath) {
    const repoPath = this.getRepoPath(repositoryId);
    await execAsync(`git add "${filePath}"`, { cwd: repoPath });
  }
}

export default new LocalGitService();
