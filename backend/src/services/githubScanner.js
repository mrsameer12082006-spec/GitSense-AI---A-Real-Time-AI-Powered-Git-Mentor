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
export async function detectMissingGitignore(owner, repo, token, defaultBranch = 'main', preFetchedTree = null) {
  try {
    const repoFullName = `${owner}/${repo}`;
    
    // 1. Check if the file exists in the local workspace clone first
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

    // 2. Check if .gitignore exists in GitHub root
    const rootRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/`,
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        } 
      }
    );
    if (rootRes.status === 200) {
      const rootFiles = await rootRes.json();
      if (Array.isArray(rootFiles)) {
        const hasGitignore = rootFiles.some(f => f.name === '.gitignore');
        if (hasGitignore) return null;
      }
    }

    // 3. Get full repo tree
    const treeRes = preFetchedTree || await fetchWithAuth(`https://api.github.com/repos/${repoFullName}/git/trees/${defaultBranch}?recursive=1`, token);
    const allPaths = Array.isArray(treeRes?.tree) ? treeRes.tree.map(f => f.path) : [];

    const hasGitignoreInTree = allPaths.some(p => p.toLowerCase() === '.gitignore' || p.toLowerCase().endsWith('/.gitignore'));
    if (hasGitignoreInTree) return null;

    // Do NOT flag empty or single-file repos
    if (allPaths.length <= 1) {
      return null;
    }

    // 4. Detect language
    const hasPython = allPaths.some(p => p.endsWith('.py'));
    const hasNode   = allPaths.some(p => p.endsWith('package.json'));
    const hasJava   = allPaths.some(p => p.endsWith('.java'));

    // 5. Check if artifact directories/files ACTUALLY exist in repo
    const committedArtifacts = [];
    if (hasPython) {
      if (allPaths.some(p => p.includes('__pycache__'))) committedArtifacts.push('__pycache__/');
      if (allPaths.some(p => p.includes('venv/')))       committedArtifacts.push('venv/');
      if (allPaths.some(p => p.endsWith('.pyc')))        committedArtifacts.push('*.pyc files');
    }
    if (hasNode) {
      if (allPaths.some(p => p.includes('node_modules'))) committedArtifacts.push('node_modules/');
      if (allPaths.some(p => p.includes('dist/')))        committedArtifacts.push('dist/');
    }
    if (hasJava) {
      if (allPaths.some(p => p.endsWith('.class'))) committedArtifacts.push('*.class files');
      if (allPaths.some(p => p.includes('target/'))) committedArtifacts.push('target/');
    }

    // 6. Check for .env committed (always critical)
    const hasEnvCommitted = allPaths.some(p => p === '.env' || p.endsWith('/.env'));

    const shouldWarn = committedArtifacts.length > 0 || hasEnvCommitted;

    if (!shouldWarn) {
      // Repo is clean — .gitignore is recommended but not a warning
      return {
        id: 'missing-gitignore',
        type: 'missing_gitignore',
        category: 'Repository Quality',
        affectedResource: '.gitignore',
        title: '.gitignore Recommended',
        severity: 'info',
        rootCause: `This ${hasPython ? 'Python' : hasNode ? 'Node.js' : 'code'} repo has no .gitignore yet. No artifacts are committed currently, but adding one is good practice to prevent accidental commits later.`,
        steps: [
          {
            description: 'Create a .gitignore for this project type',
            command: hasPython
              ? 'curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore'
              : 'npx gitignore node'
          },
          { description: 'Commit the .gitignore', command: 'git add .gitignore && git commit -m "chore: add .gitignore"' }
        ],
        autoFixable: true,
        gitignoreTemplate: hasPython ? 'Python' : hasNode ? 'Node' : hasJava ? 'Java' : 'default',
        fixType: 'create_gitignore',
        fixRiskLevel: 'Safe',
        fixDescription: 'Create a default .gitignore file with standard node_modules and .env exclusions.',
        isFixed: false,
        rawState: { status: 404, hasPython, hasNode, hasJava }
      };
    }

    // Artifacts ARE committed — real warning
    const artifactList = [
      ...committedArtifacts,
      ...(hasEnvCommitted ? ['.env (security risk!)'] : [])
    ].join(', ');

    return {
      id: 'missing-gitignore',
      type: 'missing_gitignore',
      category: 'Repository Quality',
      affectedResource: '.gitignore',
      title: 'Generated/Sensitive Files Committed Without .gitignore',
      severity: hasEnvCommitted ? 'critical' : 'warning',
      rootCause: `The following files should NOT be in version control but are committed: ${artifactList}. A .gitignore is missing which caused these to be tracked.`,
      steps: [
        {
          description: 'Create .gitignore first',
          command: hasPython
            ? 'curl -o .gitignore https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore'
            : 'npx gitignore node'
        },
        { description: 'Remove committed artifacts from tracking', command: `git rm -r --cached ${committedArtifacts[0] || '.env'}` },
        { description: 'Commit the cleanup', command: 'git add . && git commit -m "chore: remove artifacts and add .gitignore"' }
      ],
      autoFixable: true,
      gitignoreTemplate: hasPython ? 'Python' : hasNode ? 'Node' : hasJava ? 'Java' : 'default',
      fixType: 'create_gitignore',
      fixRiskLevel: 'Safe',
      fixDescription: 'Create a default .gitignore file with standard node_modules and .env exclusions.',
      isFixed: false,
      rawState: { status: 404, committedArtifacts, hasEnvCommitted }
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

    // Fetch files touched by each open PR in parallel
    const prFilesPromises = prs.map(async (pr) => {
      try {
        const files = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/files`, token);
        return { prNumber: pr.number, files };
      } catch (e) {
        console.warn(`[Detector] File list fetch failed for PR #${pr.number}: ${e.message}`);
        return { prNumber: pr.number, files: [] };
      }
    });

    const prFilesResults = await Promise.all(prFilesPromises);
    for (const res of prFilesResults) {
      for (const file of res.files) {
        const arr = fileMap.get(file.filename) || [];
        arr.push(res.prNumber);
        fileMap.set(file.filename, arr);
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
export async function detectLargeFiles(owner, repo, token, defaultBranch, preFetchedTree = null) {
  try {
    const treeRes = preFetchedTree || await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
    if (!treeRes || !treeRes.tree) return null;

    // Filter files larger than 50MB (52,428,800 bytes)
    const largeFiles = treeRes.tree.filter(f => f.type === 'blob' && f.size && f.size > 52428800);
    if (largeFiles.length === 0) return null;

    return {
      id: 'large-files-tracked',
      category: 'Repository Size & Bloat',
      severity: 'warning',
      title: `${largeFiles.length} Large File(s) Tracked in Git Index`,
      affectedResource: largeFiles.map(f => f.path).join(', '),
      manualFixCommands: largeFiles.map(f => 
        `# Remove large file from index (preserves local file)\n` +
        `git rm --cached ${f.path}\n` +
        `# Add it to gitignore to prevent re-adding\n` +
        `echo "${f.path}" >> .gitignore`
      ),
      fixType: 'remove_large_files',
      fixRiskLevel: 'Low - Index change only',
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

  const repoFullName = `${owner}/${repo}`;

  // Call Repo Metadata
  const metadata = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}`, token);
  const defaultBranch = metadata.default_branch || 'main';

  // Fetch all branches
  let branches = [];
  try {
    const branchesRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        }
      }
    );
    if (branchesRes.ok) {
      branches = await branchesRes.json();
    }
  } catch (err) {
    console.warn(`[Scan] Failed to fetch branches: ${err.message}`);
  }
  const totalBranchesChecked = branches.length || 1;

  // Fetch all open PRs
  let prs = [];
  try {
    const prsRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/pulls?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        }
      }
    );
    if (prsRes.ok) {
      prs = await prsRes.json();
    }
  } catch (err) {
    console.warn(`[Scan] Failed to fetch PRs: ${err.message}`);
  }
  const totalPRsChecked = prs.length;

  // Pre-fetch recursive tree once to avoid duplicate slow network requests in detectors
  let preFetchedTree = null;
  try {
    preFetchedTree = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token);
  } catch (err) {
    console.warn(`[Scan] Failed to pre-fetch recursive tree: ${err.message}`);
  }

  const rawIssues = [];
  const checks = {};
  let scanCompleted = true;

  checks['metadata'] = 'success';
  checks['ai'] = 'success';

  // Layer 1 - Branch Divergence Check
  try {
    for (const branch of branches) {
      if (branch.name === defaultBranch) continue;
      await checkBranchDivergence(repoFullName, token, rawIssues, defaultBranch, branch.name);
    }
    checks['branch-divergence'] = 'success';
    checks['branchComparison'] = 'success';
  } catch (err) {
    console.error('[Scan] Layer 1 failed:', err.message);
    scanCompleted = false;
    checks['branch-divergence'] = 'failed';
    checks['branchComparison'] = 'failed';
  }

  // Layer 2 - PR Conflict Check
  try {
    await checkPRConflicts(repoFullName, token, rawIssues, prs);
    checks['pr-merge-conflicts'] = 'success';
    checks['prDetails'] = 'success';
  } catch (err) {
    console.error('[Scan] Layer 2 failed:', err.message);
    scanCompleted = false;
    checks['pr-merge-conflicts'] = 'failed';
    checks['prDetails'] = 'failed';
  }

  // Layer 3 - Unresolved Conflict Markers File Scan
  try {
    await scanFileConflictMarkers(repoFullName, token, rawIssues, defaultBranch, preFetchedTree);
    checks['conflict-markers'] = 'success';
  } catch (err) {
    console.error('[Scan] Layer 3 failed:', err.message);
    scanCompleted = false;
    checks['conflict-markers'] = 'failed';
  }

  // Run additional quality checks
  try {
    const gitignoreIssue = await detectMissingGitignore(owner, repo, token, defaultBranch, preFetchedTree);
    if (gitignoreIssue) rawIssues.push(gitignoreIssue);
    checks['missing-gitignore'] = 'success';
    checks['gitignore'] = 'success';
  } catch (err) {
    console.error('[Scan] Gitignore check failed:', err.message);
    checks['missing-gitignore'] = 'failed';
    checks['gitignore'] = 'failed';
  }

  try {
    const staleIssue = await detectStaleBranches(owner, repo, token, defaultBranch);
    if (staleIssue) rawIssues.push(staleIssue);
    checks['stale-branches'] = 'success';
    checks['branches'] = 'success';
  } catch (err) {
    console.error('[Scan] Stale branches check failed:', err.message);
    checks['stale-branches'] = 'failed';
    checks['branches'] = 'failed';
  }

  try {
    const collisionIssue = await detectBranchCollisions(owner, repo, token);
    if (collisionIssue) rawIssues.push(collisionIssue);
    checks['cross-branch-collisions'] = 'success';
    checks['pullRequests'] = 'success';
  } catch (err) {
    console.error('[Scan] Branch collisions check failed:', err.message);
    checks['cross-branch-collisions'] = 'failed';
    checks['pullRequests'] = 'failed';
  }

  try {
    const ciIssue = await detectCIFailures(owner, repo, token, defaultBranch);
    if (ciIssue) rawIssues.push(ciIssue);
    checks['ci-pipeline-failure'] = 'success';
    checks['ciWorkflow'] = 'success';
  } catch (err) {
    console.error('[Scan] CI check failed:', err.message);
    checks['ci-pipeline-failure'] = 'failed';
    checks['ciWorkflow'] = 'failed';
  }

  try {
    const largeFilesIssue = await detectLargeFiles(owner, repo, token, defaultBranch, preFetchedTree);
    if (largeFilesIssue) rawIssues.push(largeFilesIssue);
    checks['large-files-tracked'] = 'success';
    checks['largeFiles'] = 'success';
  } catch (err) {
    console.error('[Scan] Large files check failed:', err.message);
    checks['large-files-tracked'] = 'failed';
    checks['largeFiles'] = 'failed';
  }

  // Diagnose issues with AI service
  const diagnosedIssues = await aiService.diagnoseIssues(rawIssues, 'intermediate', token, owner, repo);

  console.log(`\n=================== SCAN COMPLETED ===================`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Issues Found: ${diagnosedIssues.length}`);
  console.log(`======================================================\n`);

  const filesScannedCount = Array.isArray(preFetchedTree?.tree) ? preFetchedTree.tree.filter(item => item.type === 'blob').length : 0;

  const status = diagnosedIssues.length === 0 ? 'healthy' : 'issues';

  return {
    status,
    message: status === 'healthy' ? 'All Clear! Repository is Healthy' : undefined,
    issues: diagnosedIssues,
    scanTimestamp: new Date().toISOString(),
    defaultBranch,
    totalBranchesChecked,
    totalPRsChecked,
    scanned: true,
    scanCompleted,
    checks,
    summary: {
      branchesChecked: totalBranchesChecked,
      prsChecked: totalPRsChecked,
      filesScanned: filesScannedCount,
      timestamp: new Date().toISOString()
    },
    permissions: {
      push: metadata.permissions ? metadata.permissions.push : true,
      pull: metadata.permissions ? metadata.permissions.pull : true,
      admin: metadata.permissions ? metadata.permissions.admin : false
    }
  };
}

/**
 * Helper to perform safe fetch calls catching any network/status error and continuing.
 */
async function safeFetchJson(url, token) {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      }
    });
    if (!res.ok) {
      console.warn(`[safeFetchJson] status ${res.status} for URL: ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[safeFetchJson] error for URL: ${url}`, err.message);
    return null;
  }
}

/**
 * Layer 1 — Branch divergence check:
 */
async function checkBranchDivergence(repoFullName, token, issues, baseBranch, headBranch) {
  const url = `https://api.github.com/repos/${repoFullName}/compare/${baseBranch}...${headBranch}`;
  const compareData = await safeFetchJson(url, token);
  
  if (compareData && compareData.ahead_by > 0 && compareData.behind_by > 0) {
    issues.push({
      id: `branch-divergence-${headBranch}`,
      category: 'Branch Divergence',
      title: `Merge Conflict Risk: ${headBranch} diverged from ${baseBranch}`,
      severity: 'critical',
      rootCause: `Branch '${headBranch}' is ${compareData.ahead_by} commits ahead`,
      rootCause2: `and ${compareData.behind_by} commits behind '${baseBranch}'.`,
      rootCause3: `These branches have diverged and will conflict on merge.`,
      steps: [
        { description: 'Switch to the head branch', command: `git checkout ${headBranch}` },
        { description: 'Rebase onto base branch', command: `git rebase ${baseBranch}` },
        { description: 'Resolve any conflicts, then push', command: 'git push --force-with-lease' }
      ],
      filePath: null,
      resolvedContent: null,
      autoFixable: false,
      isFixed: false
    });
  }
}

/**
 * Layer 2 — PR conflict check:
 */
async function checkPRConflicts(repoFullName, token, issues, prsList) {
  const prs = prsList || [];
  for (const pr of prs) {
    const detailUrl = `https://api.github.com/repos/${repoFullName}/pulls/${pr.number}`;
    const prData = await safeFetchJson(detailUrl, token);
    
    if (prData && prData.mergeable === false) {
      issues.push({
        id: `pr-merge-conflicts-${pr.number}`,
        category: 'Pull Requests',
        title: `PR #${pr.number} has merge conflicts`,
        severity: 'critical',
        rootCause: `Pull Request '${pr.title}' cannot be merged automatically.`,
        rootCause2: `Conflicting changes exist between ${pr.head.ref} and ${pr.base.ref}.`,
        steps: [
          { description: 'Checkout the PR branch', command: `git checkout ${pr.head.ref}` },
          { description: 'Merge base branch in', command: `git merge ${pr.base.ref}` },
          { description: 'Fix conflicts, commit, push', command: 'git add . && git commit -m "fix: resolve conflicts" && git push' }
        ],
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
        isFixed: false
      });
    }
  }
}

/**
 * Layer 3 — File content scan for unresolved conflict markers:
 */
async function scanFileConflictMarkers(repoFullName, token, issues, defaultBranch, preFetchedTree) {
  let tree = preFetchedTree;
  if (!tree) {
    const url = `https://api.github.com/repos/${repoFullName}/git/trees/${defaultBranch}?recursive=1`;
    tree = await safeFetchJson(url, token);
  }
  
  if (tree && Array.isArray(tree.tree)) {
    const codeFiles = tree.tree.filter(f =>
      f.type === 'blob' &&
      /\.(js|jsx|ts|tsx|py|java|go|rb|php|css|html)$/.test(f.path)
    );
    
    for (const file of codeFiles.slice(0, 50)) {
      const contentUrl = `https://api.github.com/repos/${repoFullName}/contents/${file.path}`;
      const contentData = await safeFetchJson(contentUrl, token);
      
      if (contentData && contentData.encoding === 'base64' && contentData.content) {
        const decoded = Buffer.from(contentData.content, 'base64').toString('utf-8');
        
        if (decoded.includes('<<<<<<<') && decoded.includes('=======') && decoded.includes('>>>>>>>')) {
          issues.push({
            id: `unresolved-conflict-${file.path}`,
            category: 'Repository Quality',
            title: `Unresolved conflict markers in ${file.path}`,
            severity: 'critical',
            rootCause: `File '${file.path}' contains unresolved Git conflict markers.`,
            rootCause2: `This file was left in a conflicted state after a failed merge.`,
            steps: [
              { description: 'Open file and search for conflict markers', command: `grep -n '<<<<<<' ${file.path}` },
              { description: 'Manually edit to remove markers and keep correct code', command: '' },
              { description: 'Stage and commit the resolved file', command: `git add ${file.path} && git commit -m "fix: resolve conflict in ${file.path}"` }
            ],
            filePath: file.path,
            resolvedContent: null,
            autoFixable: true,
            isFixed: false
          });
        }
      }
    }
  }
}
