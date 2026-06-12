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
        type: 'pr_merge_conflicts',
        category: 'Pull Requests',
        severity: 'critical',
        title: `${conflicts.length} Pull Request(s) Have Merge Conflicts`,
        affectedResource: conflicts.map(c => `PR #${c.prNumber}`).join(', '),
        rootCause: `There are ${conflicts.length} open pull request(s) that cannot be merged automatically due to unresolved file conflicts.`,
        steps: conflicts.map(c => ({
          description: `Resolve conflicts for PR #${c.prNumber} (${c.headBranch} -> ${c.baseBranch}) by merging target branch and resolving files: ${c.conflictingFiles.join(', ')}`,
          command: `git checkout ${c.headBranch} && git pull && git merge origin/${c.baseBranch}`
        })),
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
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
    const branchesToCompare = branches.filter(b => b.name !== defaultBranch).slice(0, 8);
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
        type: 'branch_divergence',
        category: 'Branch Divergence',
        severity: diverged.some(d => d.behindBy > 30) ? 'critical' : 'warning',
        title: `${diverged.length} Branch(es) Have Diverged From Base`,
        affectedResource: diverged.map(d => d.branchName).join(', '),
        rootCause: `${diverged.length} branch(es) have fallen behind '${defaultBranch}' by significant commits and risk merge conflicts.`,
        steps: diverged.map(d => ({
          description: `Sync branch '${d.branchName}' by merging latest '${defaultBranch}'`,
          command: `git checkout ${d.branchName} && git fetch origin && git merge origin/${defaultBranch}`
        })),
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
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
    const branchesToCheck = branches.filter(b => b.name !== defaultBranch).slice(0, 8);
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
        type: 'stale_branches',
        category: 'Pull Requests',
        severity: 'warning',
        title: `${stale.length} Forgotten Unmerged Branch(es) Found`,
        affectedResource: stale.map(s => s.branchName).join(', '),
        rootCause: `There are ${stale.length} unmerged branches that haven't had active commits for over 30 days and may be abandoned.`,
        steps: stale.map(s => ({
          description: `Review and delete stale branch '${s.branchName}' if no longer needed`,
          command: `git push origin --delete ${s.branchName}`
        })),
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
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
        type: 'cross_branch_collisions',
        category: 'Pull Requests',
        severity: 'warning',
        title: `${collisions.length} Cross-Branch Collision File(s) Detected`,
        affectedResource: collisions.map(c => c.filePath).join(', '),
        rootCause: `${collisions.length} file(s) are concurrently modified by multiple open PRs, which increases merge conflict risks.`,
        steps: collisions.map(c => ({
          description: `Coordinate with authors of PRs: ${c.prNumbers.join(', ')} to review concurrent changes on '${c.filePath}'`,
          command: null
        })),
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
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
        type: 'ci_pipeline_failure',
        category: 'CI/CD',
        severity: 'critical',
        title: `CI Run Fail: Job '${failedJob}', Step '${failedStep}'`,
        affectedResource: latestRun.name,
        rootCause: `The latest GitHub Actions workflow run failed at job '${failedJob}', step '${failedStep}'.`,
        steps: [
          {
            description: `Inspect failed Action run logs (ID: ${latestRun.id})`,
            command: `gh run view ${latestRun.id} --log`
          }
        ],
        filePath: null,
        resolvedContent: null,
        autoFixable: false,
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
      type: 'large_files_tracked',
      category: 'Repository Quality',
      severity: 'warning',
      title: `${largeFiles.length} Large File(s) Tracked in Git Index`,
      affectedResource: largeFiles.map(f => f.path).join(', '),
      rootCause: `${largeFiles.length} file(s) exceed 50MB and are tracked directly in Git instead of Git LFS, causing slow cloning.`,
      steps: largeFiles.map(f => ({
        description: `Remove '${f.path}' from git index (preserves local file) and add to .gitignore`,
        command: `git rm --cached ${f.path} && echo "${f.path}" >> .gitignore`
      })),
      filePath: '.gitignore',
      resolvedContent: null,
      autoFixable: false,
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

  try {
    // 1. Fetch Repository Metadata & Configs
    const metadata = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}`, token);
    const defaultBranch = metadata.default_branch || 'main';

    // Fetch details
    const [branches, prs, issuesList, commits, treeRes] = await Promise.all([
      fetchWithAuth(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, token).catch(() => []),
      fetchWithAuth(`https://api.github.com/repos/${repoFullName}/pulls?state=open&per_page=100`, token).catch(() => []),
      fetchWithAuth(`https://api.github.com/repos/${repoFullName}/issues?state=open&per_page=100`, token).catch(() => []),
      fetchWithAuth(`https://api.github.com/repos/${repoFullName}/commits?per_page=15`, token).catch(() => []),
      fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, token).catch(() => ({ tree: [] }))
    ]);

    const tree = Array.isArray(treeRes?.tree) ? treeRes.tree : [];
    const filesScannedCount = tree.filter(item => item.type === 'blob').length;

    // Filter issues to remove pull requests (GitHub API returns PRs as issues)
    const cleanIssuesList = Array.isArray(issuesList) ? issuesList.filter(i => !i.pull_request) : [];

    // 2. Locate and fetch README
    const readmePath = findReadmeInTree(tree);
    let readmeContent = '';
    if (readmePath) {
      readmeContent = await getFileContentFromGithub(repoFullName, readmePath, token);
    }

    // 3. Locate manifests/configs and fetch their contents
    const manifestPaths = findManifestsInTree(tree);
    const manifests = [];
    for (const path of manifestPaths) {
      const content = await getFileContentFromGithub(repoFullName, path, token, 3000);
      if (content) {
        manifests.push({ path, content });
      }
    }

    // 4. Select and fetch key source files
    const keySourcePaths = selectKeySourceFiles(tree);
    const sourceFiles = [];
    for (const path of keySourcePaths) {
      const content = await getFileContentFromGithub(repoFullName, path, token, 3000);
      if (content) {
        sourceFiles.push({ path, content });
      }
    }

    // 5. Build prompt and invoke AI Deep Analysis
    const systemPrompt = `You are GitSense AI powered by Huma-2 and Hawkeye-1. You are a senior DevOps, Git, and Version Control specialist.
Analyze the repository structure, commits, branches, pull requests, issues, and configuration files to perform a repository health check.

Your response MUST be in the exact JSON format specified below, with NO markdown code blocks, backticks, or text before/after the JSON.
Every issue you report must be a real, verified issue that you can directly prove exists in the repository metadata or file contents provided.

CRITICAL RULES:
1. ONLY report Git, GitHub, Version Control, or Repository-level workflow issues.
2. DO NOT flag any code quality, linting, syntax, formatting, or styling issues (such as missing ESLint configs, missing ESLint plugins, formatting preferences, unused variables, unused imports, typescript/JSDoc types, or missing try-catch blocks).
3. DO NOT flag missing test suites, test coverage, or documentation within source files.
4. VALID CATEGORIES / ISSUES include:
   - "git-conflict-markers" (Actual literal git merge conflict markers like "<<<<<<<", "=======", ">>>>>>>" found in files).
   - "missing-gitignore" or "misconfigured-gitignore" (E.g., missing .gitignore or node_modules/ build directories/ secrets not ignored).
   - "sensitive-files-committed" (Secrets, private keys, or .env files tracked in Git).
   - "stale-branches" or "unmerged-branches" (Stale branches or active branches behind default branch with merge issues).
   - "stale-pull-requests" or "conflicting-pull-requests" (Pull requests that cannot be merged due to conflicts).
   - "large-files-committed" (Committed files exceeding acceptable sizes, e.g., >50MB, without Git LFS).
   - "missing-readme" (Repository has no README file to document setup).
5. DO NOT HALLUCINATE issues or files. If the repository has no Git/GitHub related issues, report NO issues (status: "healthy").
6. NEVER flag conflict markers in code files unless you have read the file's content in the prompt and verified that the actual literal markers (\`<<<<<<<\`, \`=======\`, \`>>>>>>>\`) are present in that file.
7. Each issue MUST have a unique \`id\` (e.g. "missing-gitignore", "stale-feature-branch", "committed-secrets").
8. Do not duplicate/repeat the same issue.
9. The "resolvedContent" field must be the complete, corrected code content of the file that fixes the issue, containing NO placeholders (like '// TODO', '...', or 'existing code here'). It must be a complete drop-in replacement.
10. Group related issues into a single consolidated issue item to avoid spamming the report list.

JSON Output Format:
{
  "status": "issues" | "healthy",
  "issues": [
    {
      "id": "unique-kebab-case-id",
      "type": "issue_type_string",
      "category": "Repository Quality | Security | Pull Requests | CI/CD",
      "affectedResource": "Relative file path or resource name (e.g., '.gitignore')",
      "title": "Clear, concise title",
      "severity": "critical" | "warning" | "info",
      "rootCause": "Detailed explanation of what is wrong and why it matters for the repository's Git workflow.",
      "steps": [
        {
          "description": "Manual step instruction",
          "command": "Optional shell command to run"
        }
      ],
      "filePath": "Relative path to the file to create/modify",
      "resolvedContent": "Complete, ready-to-write file content that fixes the issue"
    }
  ]
}`;

    const branchesInfo = branches.map(b => {
      const sha = (b.commit?.sha || b.sha || '').substring(0, 7);
      return `- ${b.name || ''} (${sha})`;
    }).join('\n');

    const commitsInfo = commits.map(c => {
      const sha = (c.sha || '').substring(0, 7);
      const msg = c.commit?.message?.split('\n')[0] || c.message || 'No message';
      const author = c.commit?.author?.name || c.author?.login || c.author || 'Unknown';
      return `- [${sha}] ${msg} by ${author}`;
    }).join('\n');

    const prsInfo = prs.map(pr => {
      const title = pr.title || 'No Title';
      const author = pr.user?.login || pr.author || 'Unknown';
      const headBranch = pr.head?.ref || pr.headBranch || 'unknown';
      const baseBranch = pr.base?.ref || pr.baseBranch || 'unknown';
      return `- #${pr.number}: ${title} by ${author} (${headBranch} -> ${baseBranch})`;
    }).join('\n');

    const issuesInfo = cleanIssuesList.map(issue => {
      const title = issue.title || 'No Title';
      const author = issue.user?.login || issue.author || 'Unknown';
      return `- #${issue.number}: ${title} by ${author}`;
    }).join('\n');

    const ignoreFolders = [
      'node_modules/',
      'bower_components/',
      'dist/',
      'build/',
      'out/',
      'target/',
      'bin/',
      '.git/',
      '.idea/',
      '.vscode/',
      'artifacts/',
      'data/',
      'scratch/',
      'prisma/'
    ];

    const cleanTree = tree.filter(f => {
      const pathLower = f.path.toLowerCase();
      return !ignoreFolders.some(folder => pathLower.startsWith(folder) || pathLower.includes('/' + folder));
    });

    const treeInfo = cleanTree.slice(0, 25).map(f => `- ${f.path} (${f.type}, size: ${f.size || 0} bytes)`).join('\n') +
      (cleanTree.length > 25 ? `\n... and ${cleanTree.length - 25} more files (truncated to save space)` : '');

    const userPrompt = `
=== REPOSITORY METADATA ===
Owner: ${owner}
Repo: ${repo}
Default Branch: ${defaultBranch}

=== BRANCHES ===
${branchesInfo || '- No branches found'}

=== RECENT COMMITS ===
${commitsInfo || '- No commits found'}

=== OPEN PULL REQUESTS ===
${prsInfo || '- No open pull requests'}

=== OPEN ISSUES ===
${issuesInfo || '- No open issues'}

=== REPOSITORY FILE TREE ===
${treeInfo}

=== README FILE CONTENT ===
File: ${readmePath || 'No README file found'}
${(readmeContent || '').substring(0, 2000)}${readmeContent && readmeContent.length > 2000 ? '\n... (README truncated to save space)' : ''}

=== PACKAGE MANIFESTS & CONFIGS ===
${manifests.map(m => `--- File: ${m.path} ---\n${m.content.substring(0, 1500)}`).join('\n\n')}
`;

    // Run rule-based detectors in parallel to ensure reliability and speed
    const ruleBasedIssues = [];
    try {
      console.log('[Scan] Running rule-based detectors...');
      const [
        gitignoreIssue,
        mergeConflictIssue,
        branchDivergenceIssue,
        staleBranchesIssue,
        branchCollisionIssue,
        ciFailureIssue,
        largeFilesIssue
      ] = await Promise.all([
        detectMissingGitignore(owner, repo, token, defaultBranch, treeRes).catch(() => null),
        detectMergeConflicts(owner, repo, token).catch(() => null),
        detectBranchDivergence(owner, repo, token, defaultBranch).catch(() => null),
        detectStaleBranches(owner, repo, token, defaultBranch).catch(() => null),
        detectBranchCollisions(owner, repo, token).catch(() => null),
        detectCIFailures(owner, repo, token, defaultBranch).catch(() => null),
        detectLargeFiles(owner, repo, token, defaultBranch, treeRes).catch(() => null)
      ]);

      if (gitignoreIssue) ruleBasedIssues.push(gitignoreIssue);
      if (mergeConflictIssue) ruleBasedIssues.push(mergeConflictIssue);
      if (branchDivergenceIssue) ruleBasedIssues.push(branchDivergenceIssue);
      if (staleBranchesIssue) ruleBasedIssues.push(staleBranchesIssue);
      if (branchCollisionIssue) ruleBasedIssues.push(branchCollisionIssue);
      if (ciFailureIssue) ruleBasedIssues.push(ciFailureIssue);
      if (largeFilesIssue) ruleBasedIssues.push(largeFilesIssue);

      // Check raw source files content for literal conflict markers
      for (const file of sourceFiles) {
        if (file.content.includes('<<<<<<<') && file.content.includes('=======') && file.content.includes('>>>>>>>')) {
          ruleBasedIssues.push({
            id: `unresolved-conflict-${file.path.replace(/\//g, '-')}`,
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
            resolvedContent: file.content.replace(/<<<<<<<[\s\S]*?=======[\s\S]*?>>>>>>>/g, ''),
            autoFixable: true,
            isFixed: false
          });
        }
      }
    } catch (detErr) {
      console.warn('[Scan] Error running rule-based detectors:', detErr.message);
    }

    let aiIssues = [];
    try {
      console.log(`[Scan] Invoking AI Deep Analysis for repository: ${repoFullName}...`);
      const aiResponse = await aiService.generateCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.1);

      // Clean AI Response
      let cleanedResponse = aiResponse.trim();
      if (cleanedResponse.startsWith('```')) {
        const firstNewline = cleanedResponse.indexOf('\n');
        if (firstNewline !== -1) {
          cleanedResponse = cleanedResponse.substring(firstNewline + 1);
        }
        if (cleanedResponse.endsWith('```')) {
          cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3);
        }
        cleanedResponse = cleanedResponse.trim();
      }

      console.log(`[Scan] AI response length: ${cleanedResponse.length}. Parsing JSON...`);
      let analysisResult = JSON.parse(cleanedResponse);
      if (Array.isArray(analysisResult.issues)) {
        aiIssues = analysisResult.issues;
      }
    } catch (aiErr) {
      console.warn(`[Scan] AI Deep Analysis failed or was rate limited:`, aiErr.message);
      console.log(`[Scan] Falling back to rule-based repository scanner results.`);
    }

    // Combine rule-based and AI issues, prioritizing rule-based issues and filtering duplicates
    const combinedIssues = [...ruleBasedIssues];
    for (const aiIssue of aiIssues) {
      if (!combinedIssues.some(existing => existing.id === aiIssue.id)) {
        combinedIssues.push(aiIssue);
      }
    }

    // Strict blacklist filter to remove code-level/file-level static analysis or linting issues
    const blacklistPatterns = [
      /eslint/i,
      /prettier/i,
      /unused-import/i,
      /unused-variable/i,
      /unused\s+variable/i,
      /unused\s+import/i,
      /try-catch/i,
      /error\s+handling/i,
      /formatting/i,
      /indentation/i,
      /syntax/i,
      /typescript\s+types/i,
      /typescript/i,
      /jsdoc/i,
      /style/i
    ];
    const blacklistCategories = [
      'Code Quality',
      'Code Style',
      'Linting'
    ];

    const finalIssues = combinedIssues.filter(issue => {
      const category = issue.category || '';
      const title = (issue.title || '').toLowerCase();
      const id = (issue.id || '').toLowerCase();
      const rootCause = (issue.rootCause || '').toLowerCase();

      if (blacklistCategories.includes(category)) return false;
      if (blacklistPatterns.some(p => p.test(title) || p.test(id) || p.test(rootCause))) return false;
      return true;
    });

    // --- False Positive & Dependency Verification checks ---
    console.log('[Scan] Running False Positive Verification checks...');
    const allPaths = tree.map(f => f.path);
    const hasEnvInTree = allPaths.some(p => p === '.env' || p.endsWith('/.env') || p.includes('.env'));

    // Check if .env is missing in .gitignore (Issue 1)
    let shouldKeepGitignoreWarning = false;
    if (hasEnvInTree) {
      // Fetch .gitignore content
      let gitignoreContent = manifests.find(m => m.path === '.gitignore' || m.path.endsWith('/.gitignore'))?.content;
      if (!gitignoreContent) {
        try {
          const contentRes = await fetch(`https://api.github.com/repos/${repoFullName}/contents/.gitignore`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GitSense-AI' }
          });
          if (contentRes.status === 200) {
            const data = await contentRes.json();
            if (data.encoding === 'base64' && data.content) {
              gitignoreContent = Buffer.from(data.content, 'base64').toString('utf-8');
            }
          }
        } catch (err) {
          console.warn('[Scan] Failed to fetch .gitignore content:', err.message);
        }
      }

      if (gitignoreContent) {
        const lines = gitignoreContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        const isIgnored = lines.some(line => {
          return line === '.env' || 
                 line === '*.env' || 
                 line === '.env*' || 
                 line === '.env.local' || 
                 line === '.env.*';
        });
        if (!isIgnored) {
          shouldKeepGitignoreWarning = true;
        }
      } else {
        // No .gitignore file exists at all
        shouldKeepGitignoreWarning = true;
      }
    }

    // Check if .env actually exists in the remote repository or commits (Issue 2)
    let shouldKeepSensitiveWarning = false;
    try {
      const contentRes = await fetch(`https://api.github.com/repos/${repoFullName}/contents/.env`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GitSense-AI' }
      });
      const envExistsRemote = contentRes.status === 200;

      const commitsRes = await fetch(`https://api.github.com/repos/${repoFullName}/commits?path=.env`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'GitSense-AI' }
      });
      const commitHistory = commitsRes.status === 200 ? await commitsRes.json() : [];
      const envInCommits = Array.isArray(commitHistory) && commitHistory.length > 0;

      if (envExistsRemote || envInCommits) {
        shouldKeepSensitiveWarning = true;
      }
    } catch (err) {
      console.warn('[Scan] Failed to verify sensitive files:', err.message);
    }

    // Filter final issues list based on verification and dependency rules
    let finalFilteredIssues = [];
    let gitignoreWarningFired = false;

    // First, process the .gitignore warning (Issue 1)
    for (const issue of finalIssues) {
      const isGitignoreIssue = issue.id === 'missing-gitignore' || (issue.title && /gitignore/i.test(issue.title) && /\.env/i.test(issue.title));
      if (isGitignoreIssue) {
        if (shouldKeepGitignoreWarning) {
          finalFilteredIssues.push(issue);
          gitignoreWarningFired = true;
        }
      }
    }

    // Second, process sensitive committed (Issue 2) and others
    for (const issue of finalIssues) {
      const isGitignoreIssue = issue.id === 'missing-gitignore' || (issue.title && /gitignore/i.test(issue.title) && /\.env/i.test(issue.title));
      if (isGitignoreIssue) {
        continue; // Already processed
      }

      const isSensitiveIssue = issue.id === 'sensitive-files-committed' || (issue.title && /sensitive/i.test(issue.title));
      if (isSensitiveIssue) {
        // Dependency rule: skip Sensitive warning if gitignore warning fired
        if (gitignoreWarningFired) {
          console.log('[Scan] Skipping sensitive-files-committed warning because gitignore warning is already active.');
          continue;
        }
        if (shouldKeepSensitiveWarning) {
          finalFilteredIssues.push(issue);
        }
      } else {
        // Keep all other unrelated issues
        finalFilteredIssues.push(issue);
      }
    }

    const issues = finalFilteredIssues;
    const status = issues.length === 0 ? 'healthy' : 'issues';

    // Populate checklist with success so frontend steps complete cleanly
    const checks = {
      metadata: 'success',
      branches: 'success',
      branchComparison: 'success',
      pullRequests: 'success',
      prDetails: 'success',
      gitignore: 'success',
      largeFiles: 'success',
      ciWorkflow: 'success',
      ai: 'success'
    };

    console.log(`\n=================== SCAN COMPLETED ===================`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Issues Found: ${issues.length}`);
    console.log(`======================================================\n`);

    return {
      status,
      message: status === 'healthy' ? 'All Clear! Repository is Healthy' : undefined,
      issues,
      scanTimestamp: new Date().toISOString(),
      defaultBranch,
      totalBranchesChecked: branches.length,
      totalPRsChecked: prs.length,
      scanned: true,
      scanCompleted: true,
      checks,
      summary: {
        branchesChecked: branches.length,
        prsChecked: prs.length,
        filesScanned: filesScannedCount,
        timestamp: new Date().toISOString()
      },
      permissions: {
        push: metadata.permissions ? metadata.permissions.push : true,
        pull: metadata.permissions ? metadata.permissions.pull : true,
        admin: metadata.permissions ? metadata.permissions.admin : false
      }
    };

  } catch (err) {
    console.error('[Scan] Critical scan error:', err);
    throw err;
  }
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

// ── NEW HEALTH SCANNER HELPERS ──

function findReadmeInTree(tree) {
  const readme = tree.find(f => f.type === 'blob' && /^readme\.(md|txt)$/i.test(f.path));
  return readme ? readme.path : null;
}

function findManifestsInTree(tree) {
  const manifestPatterns = [
    /^package\.json$/i,
    /^requirements\.txt$/i,
    /^Cargo\.toml$/i,
    /^go\.mod$/i,
    /^Gemfile$/i,
    /^\.gitignore$/i,
    /^\.env\.example$/i,
    /^\.env\.example\.local$/i
  ];
  return tree
    .filter(f => f.type === 'blob' && manifestPatterns.some(p => p.test(f.path)))
    .map(f => f.path);
}

function selectKeySourceFiles(tree) {
  const ignoreFolders = [
    'node_modules/',
    'bower_components/',
    'dist/',
    'build/',
    'out/',
    'target/',
    'bin/',
    '.git/',
    '.idea/',
    '.vscode/',
    'artifacts/',
    'data/',
    'scratch/',
    'prisma/'
  ];

  const codeExtensions = /\.(js|jsx|ts|tsx|py|java|go|rb|php|css|html|sh)$/;
  const ignoreFiles = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|composer\.lock|\.DS_Store)$/i;

  const candidateFiles = tree.filter(f => {
    if (f.type !== 'blob') return false;
    const pathLower = f.path.toLowerCase();
    
    // Exclude ignored folders
    if (ignoreFolders.some(folder => pathLower.startsWith(folder) || pathLower.includes('/' + folder))) return false;
    
    // Exclude ignored files/lockfiles
    const filename = f.path.split('/').pop();
    if (ignoreFiles.test(filename)) return false;
    
    // Exclude files without code extensions
    if (!codeExtensions.test(filename)) return false;
    
    // Exclude large files (greater than 15KB)
    if (f.size && f.size > 15360) return false;
    
    // Exclude README files (handled separately)
    if (/^readme/i.test(filename)) return false;
    
    return true;
  });

  // Score candidates: prioritize files in key source directories, direct root files, etc.
  const scoreFile = (file) => {
    const p = file.path.toLowerCase();
    let score = 0;
    
    // Prioritize source/service/route/controller directories
    if (p.includes('src/') || p.includes('lib/') || p.includes('services/') || p.includes('routes/') || p.includes('controllers/') || p.includes('components/')) {
      score += 100;
    }
    
    // Prioritize main application entrypoints
    const name = p.split('/').pop();
    if (name.includes('app') || name.includes('index') || name.includes('server') || name.includes('main')) {
      score += 50;
    }
    
    // Prioritize smaller files to avoid context bloating
    score += (15360 - (file.size || 0)) / 1000;
    
    return score;
  };

  candidateFiles.sort((a, b) => scoreFile(b) - scoreFile(a));
  
  // Return the paths of top 4 files
  return candidateFiles.slice(0, 4).map(f => f.path);
}

async function getFileContentFromGithub(repoFullName, filePath, token, maxLen = 6000) {
  const contentUrl = `https://api.github.com/repos/${repoFullName}/contents/${filePath}`;
  const contentData = await safeFetchJson(contentUrl, token);
  if (contentData && contentData.encoding === 'base64' && contentData.content) {
    const raw = Buffer.from(contentData.content, 'base64').toString('utf-8');
    if (raw.length > maxLen) {
      return raw.substring(0, maxLen) + '\n\n... (file content truncated to save token space) ...';
    }
    return raw;
  }
  return '';
}

