import aiService from './ai.js';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean human-readable time formatter for rate limit reset.
 */
function formatResetTime(resetTimeSec) {
  return new Date(resetTimeSec * 1000).toLocaleTimeString();
}

/**
 * Core HTTP Fetcher with Auth, Logging, and Error Handling.
 */
export const fetchWithAuth = async (url, token, method = 'GET', body = null) => {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  };
  
  const response = await fetch(url, options);
  
  if (response.status === 204) return { success: true };
  if (response.status === 401) throw new Error('GitHub token invalid');
  if (response.status === 403) {
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining === '0') throw new Error('GitHub API rate limit exceeded');
    throw new Error('Token lacks write permission — needs repo scope');
  }
  if (response.status === 404) throw new Error('Resource not found: ' + url);
  if (response.status >= 400) {
    const err = await response.json();
    throw new Error(err.message || 'GitHub API error ' + response.status);
  }
  
  return response.json();
};

/**
 * Sleep helper for throttling.
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Independent Gitignore Detector.
 */
async function hasGitignoreLocally(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await hasGitignoreLocally(fullPath);
        if (found) return true;
      } else if (entry.name === '.gitignore') {
        return true;
      }
    }
  } catch (e) {
    // Ignore read errors
  }
  return false;
}

/**
 * Independent Gitignore Detector.
 */
export async function detectMissingGitignore(owner, repo, token, defaultBranch = 'main') {
  try {
    // 1. Check if the file exists in the local workspace clone first (recursively, handling subdirectories)
    const repos = await prisma.repository.findMany({
      where: { owner, name: repo }
    });
    
    let existsLocally = false;
    for (const r of repos) {
      const localRepoPath = path.join(process.cwd(), 'data', 'repos', r.id);
      if (await hasGitignoreLocally(localRepoPath)) {
        existsLocally = true;
        break;
      }
    }
    
    if (existsLocally) {
      console.log(`[Detector] Missing Gitignore -> Check succeeded. Gitignore exists locally.`);
      return null; // File exists locally, no issue
    }

    // 2. Fall back to checking GitHub API recursively
    const treeRes = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
    const hasGitignoreOnGithub = Array.isArray(treeRes?.tree) && treeRes.tree.some(item => 
      item.type === 'blob' && (item.path.toLowerCase() === '.gitignore' || item.path.toLowerCase().endsWith('/.gitignore'))
    );

    if (hasGitignoreOnGithub) {
      console.log(`[Detector] Missing Gitignore -> Check succeeded. Gitignore exists on GitHub.`);
      return null; // File exists on GitHub, no issue
    }

    // 3. Extract all file extensions/paths present in the repo to perform the smart checks
    const paths = Array.isArray(treeRes?.tree) ? treeRes.tree.filter(item => item.type === 'blob').map(item => item.path) : [];

    // Do NOT flag empty or single-file repos
    if (paths.length <= 1) {
      console.log(`[Detector] Missing Gitignore -> Checked tree. Repo is empty or single-file. Skipping flag.`);
      return null;
    }

    let shouldFlag = false;
    let reason = '';

    for (const p of paths) {
      const lowercasePath = p.toLowerCase();
      const ext = path.extname(lowercasePath);
      const base = path.basename(lowercasePath);

      // Check build configurations / build systems
      if (base === 'package.json') {
        shouldFlag = true;
        reason = 'Repo contains package.json but no .gitignore — node_modules may get committed accidentally';
        break;
      }
      if (base === 'pom.xml') {
        shouldFlag = true;
        reason = 'Repo contains pom.xml but no .gitignore — target/ build artifacts may get committed accidentally';
        break;
      }
      if (base === 'build.gradle') {
        shouldFlag = true;
        reason = 'Repo contains build.gradle but no .gitignore — build/ artifacts may get committed accidentally';
        break;
      }
      if (base === 'requirements.txt') {
        shouldFlag = true;
        reason = 'Repo contains requirements.txt but no .gitignore — Python virtual environments or cached files may get committed accidentally';
        break;
      }
      if (base === 'cargo.toml') {
        shouldFlag = true;
        reason = 'Repo contains Cargo.toml but no .gitignore — target/ build artifacts may get committed accidentally';
        break;
      }
      if (base === 'go.mod') {
        shouldFlag = true;
        reason = 'Repo contains go.mod but no .gitignore — vendor/ or binary artifacts may get committed accidentally';
        break;
      }

      // Check sensitive files
      if (base === '.env' || base.endsWith('.env') || base === '.env.example') {
        shouldFlag = true;
        reason = `Repo contains sensitive environment file (${base}) but no .gitignore — credentials may be leaked`;
        break;
      }

      // Check languages
      if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
        shouldFlag = true;
        reason = `Repo contains JavaScript/TypeScript files (${base}) but no .gitignore — node_modules or build output may get committed accidentally`;
        break;
      }
      if (ext === '.py') {
        shouldFlag = true;
        reason = `Repo contains Python files (${base}) but no .gitignore — __pycache__ or venv/ directories may get committed accidentally`;
        break;
      }
      if (['.java', '.kt'].includes(ext)) {
        shouldFlag = true;
        reason = `Repo contains Java/Kotlin source files (${base}) but no .gitignore — compiled .class or target/ files may get committed accidentally`;
        break;
      }
      if (ext === '.cs') {
        shouldFlag = true;
        reason = `Repo contains C# files (${base}) but no .gitignore — bin/ or obj/ build directories may get committed accidentally`;
        break;
      }
    }

    if (!shouldFlag) {
      console.log(`[Detector] Missing Gitignore -> Smart check passed. No flag needed for this repository.`);
      return null;
    }

    console.log(`[Detector] Missing Gitignore -> Smart check failed (${reason}). Flagging issue.`);
    return {
      id: 'missing-gitignore',
      type: 'missing_gitignore',
      category: 'Repository Quality',
      severity: 'warning',
      title: 'Missing .gitignore File',
      affectedResource: '.gitignore',
      reason,
      autoFixable: true,
      manualFixCommands: [
        `touch .gitignore`,
        `echo "node_modules/\n.env" >> .gitignore`,
        `git add .gitignore`,
        `git commit -m "Add .gitignore"`
      ],
      fixType: 'create_gitignore',
      fixRiskLevel: 'Safe',
      fixDescription: 'Create a default .gitignore file with standard node_modules and .env exclusions.',
      isFixed: false,
      rawState: { status: 404, reason }
    };
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('404')) {
      console.log(`[Detector] Missing Gitignore -> 404 tree/ref. Skip flagging empty repository.`);
      return null;
    }
    console.warn(`[Detector] Missing Gitignore check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent Merge Conflict Detector.
 */
export async function detectMergeConflicts(owner, repo, token) {
  try {
    const prs = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token);
    if (!Array.isArray(prs) || prs.length === 0) {
      return null;
    }

    const conflicts = [];
    for (const pr of prs) {
      let prDetail = null;
      // Retry logic for mergeable status
      for (let attempt = 1; attempt <= 3; attempt++) {
        const detail = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`, token);
        if (detail.mergeable !== null) {
          prDetail = detail;
          break;
        }
        console.log(`[Detector] PR #${pr.number} mergeable is null. Waiting 2s before retry (Attempt ${attempt}/3)`);
        await sleep(2000);
      }

      if (prDetail && prDetail.mergeable === false) {
        // Fetch conflict files
        const filesRes = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/files`, token);
        const fileNames = (filesRes || []).map(f => f.filename);

        conflicts.push({
          prNumber: pr.number,
          title: pr.title,
          headBranch: prDetail.head.ref,
          baseBranch: prDetail.base.ref,
          author: pr.user?.login || 'unknown',
          conflictingFiles: fileNames
        });
      }
    }

    if (conflicts.length > 0) {
      return {
        id: 'pr-merge-conflicts',
        category: 'Pull Requests',
        severity: 'critical',
        title: `${conflicts.length} Pull Request(s) Have Merge Conflicts`,
        affectedResource: conflicts.map(c => `PR #${c.prNumber}`).join(', '),
        manualFixCommands: conflicts.map(c => 
          `# Resolve conflicts for PR #${c.prNumber} (${c.headBranch} -> ${c.baseBranch})\n` +
          `git checkout ${c.headBranch}\n` +
          `git fetch origin\n` +
          `git merge origin/${c.baseBranch}\n` +
          `# Fix conflict markers in: ${c.conflictingFiles.join(', ')}\n` +
          `git add .\n` +
          `git commit -m "Resolve merge conflicts with ${c.baseBranch}"\n` +
          `git push origin ${c.headBranch}`
        ),
        fixType: 'resolve_merge_conflicts',
        fixRiskLevel: 'Requires manual merging',
        fixDescription: 'Merge the base target branch into the PR branch, resolve the conflict lines, and push updates.',
        isFixed: false,
        rawState: { conflicts }
      };
    }
    return null;
  } catch (err) {
    console.warn(`[Detector] Merge conflicts check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent Branch Divergence Detector.
 */
export async function detectBranchDivergence(owner, repo, token, defaultBranch) {
  try {
    const branches = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, token);
    const branchesToCompare = branches.filter(b => b.name !== defaultBranch);
    if (branchesToCompare.length === 0) return null;

    const diverged = [];

    // Slice into batches of 5
    for (let i = 0; i < branchesToCompare.length; i += 5) {
      const batch = branchesToCompare.slice(i, i + 5);
      
      const batchPromises = batch.map(async (branch) => {
        try {
          const comp = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/compare/${defaultBranch}...${branch.name}`, token);
          const behindBy = comp.behind_by || 0;
          const aheadBy = comp.ahead_by || 0;
          const status = comp.status || 'unknown';

          if (behindBy > 10) {
            // Fetch recent commits to get changed files
            const commits = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch.name}&per_page=3`, token);
            const commitFiles = new Set();

            for (const commit of commits) {
              try {
                const detail = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`, token);
                if (detail.files) {
                  detail.files.forEach(f => commitFiles.add(f.filename));
                }
              } catch (e) {
                // Ignore single commit detail fail
              }
            }

            const compareFiles = (comp.files || []).map(f => f.filename);
            const conflictRiskFiles = compareFiles.filter(f => commitFiles.has(f));

            diverged.push({
              branchName: branch.name,
              behindBy,
              aheadBy,
              status,
              conflictRiskFiles
            });
          }
        } catch (e) {
          // Skip if branch compare fails (e.g. no common ancestor / 404)
          console.warn(`[Detector] Branch Compare failed for ${branch.name}: ${e.message}`);
        }
      });

      await Promise.all(batchPromises);
      if (i + 5 < branchesToCompare.length) {
        console.log(`[Detector] Divergence -> Pausing 500ms between branch comparison batches...`);
        await sleep(500);
      }
    }

    if (diverged.length > 0) {
      return {
        id: 'branch-divergence',
        category: 'Branch Divergence',
        severity: diverged.some(d => d.behindBy > 30) ? 'critical' : 'warning',
        title: `${diverged.length} Branch(es) Have Diverged From Base`,
        affectedResource: diverged.map(d => d.branchName).join(', '),
        manualFixCommands: diverged.map(d => 
          `# Re-sync branch '${d.branchName}'\n` +
          `git checkout ${d.branchName}\n` +
          `git fetch origin\n` +
          `git merge origin/${defaultBranch}`
        ),
        fixType: 'sync_branches',
        fixRiskLevel: 'Medium - May require merge conflicts resolution',
        fixDescription: `Fetch and merge the base branch '${defaultBranch}' into the diverged branch files.`,
        isFixed: false,
        rawState: { diverged }
      };
    }
    return null;
  } catch (err) {
    console.warn(`[Detector] Branch divergence check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent Stale Branch Detector.
 */
export async function detectStaleBranches(owner, repo, token, defaultBranch) {
  try {
    const branches = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, token);
    const branchesToCheck = branches.filter(b => b.name !== defaultBranch);
    if (branchesToCheck.length === 0) return null;

    const stale = [];

    for (const branch of branchesToCheck) {
      try {
        const commits = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch.name}&per_page=1`, token);
        if (commits && commits.length > 0) {
          const firstCommit = commits[0];
          const dateStr = firstCommit.commit.committer?.date || firstCommit.commit.author?.date;
          if (dateStr) {
            const ageDays = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays > 30) {
              // Verify if fully merged
              const comp = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/compare/${defaultBranch}...${branch.name}`, token);
              if (comp.ahead_by > 0) {
                stale.push({
                  branchName: branch.name,
                  lastCommitDate: dateStr,
                  authorName: firstCommit.commit.author?.name || 'unknown',
                  aheadBy: comp.ahead_by
                });
              }
            }
          }
        }
      } catch (e) {
        console.warn(`[Detector] Stale Check failed for ${branch.name}: ${e.message}`);
      }
    }

    if (stale.length > 0) {
      return {
        id: 'stale-branches',
        category: 'Multi-Branch Quality',
        severity: 'warning',
        title: `${stale.length} Forgotten Unmerged Branch(es) Found`,
        affectedResource: stale.map(s => s.branchName).join(', '),
        manualFixCommands: stale.map(s => 
          `# Review and prune unmerged stale branch '${s.branchName}'\n` +
          `git checkout ${s.branchName}\n` +
          `# If safe, delete remote branch\n` +
          `git push origin --delete ${s.branchName}`
        ),
        fixType: 'prune_stale_branches',
        fixRiskLevel: 'Safe - Prunes abandoned remote branches',
        fixDescription: 'Review stale and forgotten branches with the author and delete remote branches.',
        isFixed: false,
        rawState: { stale }
      };
    }
    return null;
  } catch (err) {
    console.warn(`[Detector] Stale branches check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent Cross-branch Collision Detector.
 */
export async function detectBranchCollisions(owner, repo, token) {
  try {
    const prs = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`, token);
    if (!prs || prs.length === 0) return null;

    const fileMap = new Map(); // path -> Array of PR numbers

    for (const pr of prs) {
      try {
        const files = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/files`, token);
        for (const file of files) {
          const arr = fileMap.get(file.filename) || [];
          arr.push(pr.number);
          fileMap.set(file.filename, arr);
        }
      } catch (e) {
        console.warn(`[Detector] File list fetch failed for PR #${pr.number}: ${e.message}`);
      }
    }

    const collisions = [];
    for (const [filePath, prNumbers] of fileMap.entries()) {
      if (prNumbers.length >= 2) {
        collisions.push({
          filePath,
          prNumbers
        });
      }
    }

    if (collisions.length > 0) {
      return {
        id: 'cross-branch-collisions',
        category: 'Multi-Branch Quality',
        severity: 'warning',
        title: `${collisions.length} Cross-Branch Collision File(s) Detected`,
        affectedResource: collisions.map(c => c.filePath).join(', '),
        manualFixCommands: collisions.map(c => 
          `# Compare changes between conflict PRs touching '${c.filePath}'\n` +
          `# PR Numbers: ${c.prNumbers.join(', ')}`
        ),
        fixType: 'coordinate_collisions',
        fixRiskLevel: 'Safe - Communication only',
        fixDescription: 'Coordinate developers working on the same files concurrently to align commits and avoid downstream conflicts.',
        isFixed: false,
        rawState: { collisions }
      };
    }
    return null;
  } catch (err) {
    console.warn(`[Detector] Branch collision check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent CI Failure Detector.
 */
export async function detectCIFailures(owner, repo, token, defaultBranch) {
  try {
    const runsRes = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/actions/runs?branch=${defaultBranch}&per_page=10`, token);
    if (!runsRes || !runsRes.workflow_runs || runsRes.workflow_runs.length === 0) {
      return null;
    }

    const completedRuns = runsRes.workflow_runs.filter(r => r.status === 'completed');
    if (completedRuns.length === 0) return null;

    const latestRun = completedRuns[0];
    if (latestRun.conclusion === 'failure' || latestRun.conclusion === 'timed_out') {
      let failedJob = 'unknown';
      let failedStep = 'unknown';

      try {
        const jobsRes = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${latestRun.id}/jobs`, token);
        const job = (jobsRes.jobs || []).find(j => j.conclusion === 'failure');
        if (job) {
          failedJob = job.name;
          const step = (job.steps || []).find(s => s.conclusion === 'failure');
          if (step) {
            failedStep = step.name;
          }
        }
      } catch (e) {
        // job detail call failed
      }

      return {
        id: 'ci-pipeline-failure',
        category: 'CI/CD Pipelines',
        severity: 'critical',
        title: `CI Run Fail: Job '${failedJob}', Step '${failedStep}'`,
        affectedResource: latestRun.name,
        manualFixCommands: [
          `# Inspect failed Action logs\n` +
          `gh run view ${latestRun.id} --log`
        ],
        fixType: 'resolve_ci_failure',
        fixRiskLevel: 'Investigation required',
        fixDescription: `Check build configurations and logs for job '${failedJob}', step '${failedStep}'.`,
        isFixed: false,
        rawState: {
          runId: latestRun.id,
          conclusion: latestRun.conclusion,
          failedJob,
          failedStep
        }
      };
    }
    return null;
  } catch (err) {
    console.warn(`[Detector] CI failures check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Independent Large Files Detector.
 */
export async function detectLargeFiles(owner, repo, token, defaultBranch) {
  try {
    const treeRes = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
    if (!treeRes || !Array.isArray(treeRes.tree)) {
      return null;
    }

    const largeFiles = treeRes.tree.filter(item => item.type === 'blob' && item.size && item.size > 5 * 1024 * 1024);
    if (largeFiles.length === 0) {
      return null;
    }

    return {
      id: 'large-files-tracked',
      category: 'Repository Quality',
      severity: 'warning',
      title: `${largeFiles.length} Large File(s) Tracked in Git`,
      affectedResource: largeFiles.map(f => f.path).join(', '),
      manualFixCommands: largeFiles.map(f => 
        `# Untrack large file: ${f.path}\n` +
        `git rm --cached ${f.path}\n` +
        `echo "${f.path.split('.').pop() || ''}" >> .gitignore`
      ),
      fixType: 'remove_large_file',
      fixRiskLevel: 'Medium - Requires manual history rewriting',
      fixDescription: 'Remove large binary files from git index and add them to .gitignore.',
      isFixed: false,
      rawState: { 
        largeFiles: largeFiles.map(f => ({
          path: f.path,
          size: f.size
        }))
      }
    };
  } catch (err) {
    console.warn(`[Detector] Large files check skipped due to error: ${err.message}`);
    return null;
  }
}

/**
 * Main Repository Scan Orchestrator.
 */
export async function scanRepository(owner, repo, token, targetIssueType = null) {
  const startTime = new Date();
  console.log(`\n=================== SCAN STARTED ===================`);
  console.log(`Timestamp: ${startTime.toISOString()}`);
  console.log(`Repository: ${owner}/${repo}`);
  console.log(`Token Present: ${token ? 'YES' : 'NO'}`);
  if (token) {
    console.log(`Token Prefix: ${token.substring(0, 10)}...`);
  }
  console.log(`Target Issue Type: ${targetIssueType || 'ALL'}`);
  console.log(`====================================================\n`);

  // Call Repo Metadata
  const metadata = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}`, token);
  const defaultBranch = metadata.default_branch || 'main';

  // Fetch branches and PRs count for scan stats
  let totalBranchesChecked = 0;
  let totalPRsChecked = 0;
  try {
    const branches = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=1`, token);
    totalBranchesChecked = branches.length;
    const prs = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=1`, token);
    totalPRsChecked = prs.length;
  } catch (err) {
    // Continue if stats fails
  }

  // Construct target promises
  const promises = [];
  
  if (!targetIssueType || targetIssueType === 'missing-gitignore') {
    promises.push(detectMissingGitignore(owner, repo, token, defaultBranch));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'pr-merge-conflicts') {
    promises.push(detectMergeConflicts(owner, repo, token));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'branch-divergence') {
    promises.push(detectBranchDivergence(owner, repo, token, defaultBranch));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'stale-branches') {
    promises.push(detectStaleBranches(owner, repo, token, defaultBranch));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'cross-branch-collisions') {
    promises.push(detectBranchCollisions(owner, repo, token));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'ci-pipeline-failure') {
    promises.push(detectCIFailures(owner, repo, token, defaultBranch));
  } else {
    promises.push(Promise.resolve(null));
  }

  if (!targetIssueType || targetIssueType === 'large-files-tracked') {
    promises.push(detectLargeFiles(owner, repo, token, defaultBranch));
  } else {
    promises.push(Promise.resolve(null));
  }

  const results = await Promise.allSettled(promises);

  const rawIssues = [];
  results.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value !== null) {
      rawIssues.push(res.value);
    } else if (res.status === 'rejected') {
      console.error(`[Scan] Detector ${idx} failed to run:`, res.reason);
    }
  });

  // Diagnose issues with AI service
  const diagnosedIssues = await aiService.diagnoseIssues(rawIssues, 'intermediate');

  console.log(`\n=================== SCAN COMPLETED ===================`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Issues Found: ${diagnosedIssues.length}`);
  console.log(`======================================================\n`);

  return {
    issues: diagnosedIssues,
    scanTimestamp: new Date().toISOString(),
    defaultBranch,
    totalBranchesChecked,
    totalPRsChecked,
    scanned: true,
    permissions: {
      push: metadata.permissions ? metadata.permissions.push : true,
      pull: metadata.permissions ? metadata.permissions.pull : true,
      admin: metadata.permissions ? metadata.permissions.admin : false
    }
  };
}
