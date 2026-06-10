import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import aiService from '../services/ai.js';
import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import { resolveAndMerge } from '../services/mergeResolver.js';
import repoContextBuilder from '../services/repoContextBuilder.js';

const router = Router();

router.use(authenticate);

router.post('/execute', async (req, res) => {
  try {
    const { owner, repo, fixPlan } = req.body;

    if (!owner || !repo || !fixPlan) {
      return res.status(400).json({ success: false, error: 'owner, repo, and fixPlan are required.' });
    }

    if (!fixPlan.actions || !Array.isArray(fixPlan.actions)) {
      return res.status(400).json({ success: false, error: 'fixPlan.actions must be an array.' });
    }

    // Get the authenticated user's GitHub token from the database
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    const token = user?.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    const results = [];
    const errors = [];
    let allSuccessful = true;

    for (const action of fixPlan.actions) {
      const timestamp = new Date().toISOString();
      const issueType = fixPlan.issue || 'unknown';
      console.log(`[Fix Executor] Attempting action type=${action.type} for issue=${issueType} on ${owner}/${repo} at ${timestamp}`);

      try {
        if (action.type === 'create_file' || action.type === 'update_file') {
          if (!action.path) {
            throw new Error("Action path is required for file operations.");
          }

          // 1. Get SHA first to see if file exists (handle 404 cleanly)
          let sha = null;
          const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${action.path.startsWith('/') ? action.path.slice(1) : action.path}`;
          
          try {
            const getRes = await fetch(getUrl, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'GitSense-AI'
              }
            });

            if (getRes.status === 200) {
              const getData = await getRes.json();
              sha = getData.sha;
            } else if (getRes.status !== 404) {
              const errText = await getRes.text();
              throw new Error(`Failed to check existing file SHA: status ${getRes.status} - ${errText}`);
            }
          } catch (getErr) {
            // Handle if fetch failed, but if it is 404, we ignore it because it's a new file
            if (!getErr.message.includes('404') && !getErr.message.includes('not found') && !getErr.message.includes('Resource not found')) {
              throw getErr;
            }
          }

          // 2. PUT file contents
          const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${action.path.startsWith('/') ? action.path.slice(1) : action.path}`;
          const body = {
            message: action.message || `chore: Update ${action.path} via GitSense AI`,
            content: Buffer.from(action.content || '').toString('base64'),
          };
          if (sha) {
            body.sha = sha;
          }
          if (action.branch) {
            body.branch = action.branch;
          }

          const putRes = await fetch(putUrl, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'GitSense-AI'
            },
            body: JSON.stringify(body)
          });

          if (!putRes.ok) {
            const errText = await putRes.text();
            throw new Error(`Failed to write file via GitHub API: status ${putRes.status} - ${errText}`);
          }

          const putData = await putRes.json();
          const logMsg = `Successfully executed ${action.type} for path ${action.path}`;
          console.log(`[Fix Executor] [SUCCESS] ${logMsg}`);
          
          results.push({
            action,
            status: 'success',
            response: putData,
            timestamp
          });
        } else if (action.type === 'delete_branch') {
          if (!action.branch) {
            throw new Error("Action branch is required for branch deletion.");
          }

          const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(action.branch)}`;
          const deleteRes = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'GitSense-AI'
            }
          });

          if (!deleteRes.ok && deleteRes.status !== 204 && deleteRes.status !== 200) {
            const errText = await deleteRes.text();
            throw new Error(`Failed to delete branch via GitHub API: status ${deleteRes.status} - ${errText}`);
          }

          const logMsg = `Successfully deleted branch ${action.branch}`;
          console.log(`[Fix Executor] [SUCCESS] ${logMsg}`);
          
          results.push({
            action,
            status: 'success',
            timestamp
          });
        } else if (action.type === 'update_settings') {
          const settingsUrl = `https://api.github.com/repos/${owner}/${repo}`;
          const body = {};
          if (action.default_branch) body.default_branch = action.default_branch;
          
          const patchRes = await fetch(settingsUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/vnd.github+json',
              'User-Agent': 'GitSense-AI'
            },
            body: JSON.stringify(body)
          });

          if (!patchRes.ok) {
            const errText = await patchRes.text();
            throw new Error(`Failed to update repo settings: status ${patchRes.status} - ${errText}`);
          }

          const patchData = await patchRes.json();
          results.push({
            action,
            status: 'success',
            response: patchData,
            timestamp
          });
        } else {
          throw new Error(`Unsupported action type: ${action.type}`);
        }
      } catch (err) {
        console.error(`[Fix Executor] [FAILED] issue=${issueType}, action=${action.type}, error=${err.message}`);
        allSuccessful = false;
        errors.push({
          action,
          error: err.message,
          timestamp
        });
        results.push({
          action,
          status: 'failed',
          error: err.message,
          timestamp
        });
      }
    }

    return res.status(allSuccessful ? 200 : 207).json({
      success: allSuccessful,
      results,
      errors
    });

  } catch (err) {
    console.error(`[Fix Executor Route Error]`, err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred during fix execution.' });
  }
});

// Task 1: POST /sync-branch
router.post('/sync-branch', async (req, res) => {
  try {
    const { owner, repo, branch, base = 'master' } = req.body;
    if (!owner || !repo || !branch) {
      return res.status(400).json({ success: false, error: 'owner, repo, and branch are required.' });
    }

    const token = req.session?.githubToken || req.session?.accessToken || (await prisma.user.findUnique({ where: { id: req.user.id } }))?.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    // Attempt to merge base into branch
    const mergeUrl = `https://api.github.com/repos/${owner}/${repo}/merges`;
    const mergeRes = await fetch(mergeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        base: branch,
        head: base,
        commit_message: `chore: Sync branch ${branch} with ${base} via GitSense AI`
      })
    });

    if (mergeRes.status === 200 || mergeRes.status === 201 || mergeRes.status === 204) {
      return res.json({ success: true, merged: true, message: 'Branch synced successfully.' });
    }

    if (mergeRes.status === 409) {
      // Conflict occurred. Let's compare to find differing files
      const compareUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`;
      const compareRes = await fetch(compareUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        }
      });

      if (!compareRes.ok) {
        return res.status(409).json({
          success: false,
          conflict: true,
          error: 'Merge conflict occurred, and failed to compare branches to list conflict files.',
          files: []
        });
      }

      const compareData = await compareRes.json();
      const files = (compareData.files || []).map(f => f.filename);

      return res.status(409).json({
        success: false,
        conflict: true,
        message: 'Merge conflict occurred.',
        files
      });
    }

    const errText = await mergeRes.text();
    return res.status(mergeRes.status).json({
      success: false,
      error: `Failed to sync branch: status ${mergeRes.status} - ${errText}`
    });
  } catch (err) {
    console.error('[Sync Branch Route Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred during branch sync.' });
  }
});

// Task 2: POST /analyze-conflict
router.post('/analyze-conflict', async (req, res) => {
  try {
    const { owner, repo, branch, base = 'master', files } = req.body;
    if (!owner || !repo || !branch || !files || !Array.isArray(files)) {
      return res.status(400).json({ success: false, error: 'owner, repo, branch, and files array are required.' });
    }

    const token = req.session?.githubToken || req.session?.accessToken || (await prisma.user.findUnique({ where: { id: req.user.id } }))?.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    const conflictData = [];

    // Helper to fetch file content
    const fetchContent = async (path, ref) => {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path.startsWith('/') ? path.slice(1) : path}?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        }
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = await res.json();
      return Buffer.from(data.content, 'base64').toString('utf8');
    };

    for (const file of files) {
      try {
        const baseContent = await fetchContent(file, base);
        const branchContent = await fetchContent(file, branch);
        conflictData.push({
          file,
          baseBranch: base,
          baseContent: baseContent || '(File does not exist on base branch)',
          featureBranch: branch,
          featureContent: branchContent || '(File does not exist on feature branch)'
        });
      } catch (err) {
        console.error(`Failed to fetch contents for conflict file: ${file}`, err.message);
        conflictData.push({
          file,
          error: `Could not load file contents: ${err.message}`
        });
      }
    }

    // Prompt AI to resolve the conflicts
    const systemPrompt = `You are a Senior Full-Stack Engineer. Your task is to resolve git merge conflicts between a base branch and a feature branch.
You must output a single valid JSON object containing an explanation of the conflicts and the fully resolved content for each file.
Ensure the resolved code is complete, correct, syntactically sound, and preserves the logic of both branches where possible.

Response schema:
{
  "explanation": "Brief explanation of the conflicts and how they were resolved.",
  "resolutions": [
    {
      "file": "path/to/file",
      "content": "Full resolved content of the file"
    }
  ]
}`;

    const userMessage = `Please resolve the conflicts for the following files:
${JSON.stringify(conflictData, null, 2)}`;

    const aiRes = await aiService.generateCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ], 0.2);

    let cleanJson = aiRes.trim();
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.substring(7);
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.substring(3);
    }
    if (cleanJson.endsWith('```')) {
      cleanJson = cleanJson.substring(0, cleanJson.length - 3);
    }
    cleanJson = cleanJson.trim();

    const result = JSON.parse(cleanJson);
    return res.json({ success: true, ...result });

  } catch (err) {
    console.error('[Analyze Conflict Route Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred during conflict analysis.' });
  }
});

// Task 3: POST /apply-resolution
router.post('/apply-resolution', async (req, res) => {
  try {
    const { owner, repo, branch, base = 'master', resolutions } = req.body;
    if (!owner || !repo || !branch || !resolutions || !Array.isArray(resolutions)) {
      return res.status(400).json({ success: false, error: 'owner, repo, branch, and resolutions are required.' });
    }

    const token = req.session?.githubToken || req.session?.accessToken || (await prisma.user.findUnique({ where: { id: req.user.id } }))?.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    // 1. Get the latest commit SHA of the target branch (branch)
    const refUrl = `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
    const refRes = await fetch(refUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      }
    });

    if (!refRes.ok) {
      const errText = await refRes.text();
      return res.status(refRes.status).json({ success: false, error: `Failed to find ref for branch ${branch}: ${errText}` });
    }

    const refData = await refRes.json();
    const baseCommitSha = refData.object.sha;

    // 2. Create a new branch 'sync/{branch}-resolved-{timestamp}'
    const timestamp = Date.now();
    const newBranchName = `sync/${branch}-resolved-${timestamp}`;
    const createRefUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
    const createRefRes = await fetch(createRefUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha: baseCommitSha
      })
    });

    if (!createRefRes.ok) {
      const errText = await createRefRes.text();
      return res.status(createRefRes.status).json({ success: false, error: `Failed to create resolution branch: ${errText}` });
    }

    // 3. Get the tree SHA of the latest commit
    const commitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommitSha}`;
    const commitRes = await fetch(commitUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      }
    });

    if (!commitRes.ok) {
      const errText = await commitRes.text();
      return res.status(commitRes.status).json({ success: false, error: `Failed to fetch base commit tree: ${errText}` });
    }

    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 4. Create new Git tree with the resolved content
    const treeItems = resolutions.map(res => ({
      path: res.file.startsWith('/') ? res.file.slice(1) : res.file,
      mode: '100644',
      type: 'blob',
      content: res.content
    }));

    const createTreeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees`;
    const createTreeRes = await fetch(createTreeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });

    if (!createTreeRes.ok) {
      const errText = await createTreeRes.text();
      return res.status(createTreeRes.status).json({ success: false, error: `Failed to create new Git tree: ${errText}` });
    }

    const newTreeData = await createTreeRes.json();
    const newTreeSha = newTreeData.sha;

    // 5. Create a new commit
    const createCommitUrl = `https://api.github.com/repos/${owner}/${repo}/git/commits`;
    const createCommitRes = await fetch(createCommitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        message: `chore: Resolve sync conflicts with ${base}`,
        tree: newTreeSha,
        parents: [baseCommitSha]
      })
    });

    if (!createCommitRes.ok) {
      const errText = await createCommitRes.text();
      return res.status(createCommitRes.status).json({ success: false, error: `Failed to create resolution commit: ${errText}` });
    }

    const newCommitData = await createCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 6. Update reference
    const updateRefUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(newBranchName)}`;
    const updateRefRes = await fetch(updateRefUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        sha: newCommitSha,
        force: true
      })
    });

    if (!updateRefRes.ok) {
      const errText = await updateRefRes.text();
      return res.status(updateRefRes.status).json({ success: false, error: `Failed to update ref to new commit: ${errText}` });
    }

    // 7. Create Pull Request pointing head (newBranchName) to base (branch)
    const pullsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const pullsRes = await fetch(pullsUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      },
      body: JSON.stringify({
        title: `chore: Resolve merge conflicts and sync with ${base}`,
        head: newBranchName,
        base: branch,
        body: `### Merge Conflict Resolution Details\n\nThis Pull Request was generated automatically by **GitSense AI** to resolve merge conflicts encountered when syncing branch \`${branch}\` with \`${base}\`.\n\n#### Resolved Files:\n${resolutions.map(r => `- \`${r.file}\``).join('\n')}\n\nPlease review and merge to complete the sync process.`
      })
    });

    if (!pullsRes.ok) {
      const errText = await pullsRes.text();
      return res.status(pullsRes.status).json({ success: false, error: `Failed to create Pull Request: ${errText}` });
    }

    const prData = await pullsRes.json();
    
    // Kick off conflict resolution / merge check in the background
    const jobId = crypto.randomUUID();
    runBackgroundMerge(jobId, owner, repo, prData.number, newBranchName, token);

    return res.json({
      success: true,
      branchName: newBranchName,
      jobId,
      pullRequest: {
        number: prData.number,
        html_url: prData.html_url,
        title: prData.title
      }
    });

  } catch (err) {
    console.error('[Apply Resolution Route Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred during applying resolutions.' });
  }
});

// Task 4: GET /check-mergeability
router.get('/check-mergeability', async (req, res) => {
  try {
    const { owner, repo, branch } = req.query;
    if (!owner || !repo || !branch) {
      return res.status(400).json({ success: false, error: 'owner, repo, and branch query parameters are required.' });
    }

    const token = req.session?.githubToken || req.session?.accessToken || (await prisma.user.findUnique({ where: { id: req.user.id } }))?.githubToken || process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    // List pull requests for this repository
    const pullsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(owner)}:${encodeURIComponent(branch)}`;
    const pullsRes = await fetch(pullsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      }
    });

    if (!pullsRes.ok) {
      const errText = await pullsRes.text();
      return res.status(pullsRes.status).json({ success: false, error: `Failed to list open pull requests: ${errText}` });
    }

    const prList = await pullsRes.json();
    if (prList.length === 0) {
      return res.json({
        success: true,
        hasPR: false,
        mergeable: true,
        mergeable_state: 'clean',
        conflict_files: []
      });
    }

    const firstPr = prList[0];
    // Fetch details for this specific PR to get mergeable & mergeable_state
    const prDetailsUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${firstPr.number}`;
    const prDetailsRes = await fetch(prDetailsUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'GitSense-AI'
      }
    });

    if (!prDetailsRes.ok) {
      const errText = await prDetailsRes.text();
      return res.status(prDetailsRes.status).json({ success: false, error: `Failed to fetch PR details for #${firstPr.number}: ${errText}` });
    }

    const prDetails = await prDetailsRes.json();
    
    // If conflict, get files changed/conflicted via compare API to base
    let conflict_files = [];
    if (prDetails.mergeable === false || prDetails.mergeable_state === 'dirty') {
      const compareUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(prDetails.base.ref)}...${encodeURIComponent(branch)}`;
      const compareRes = await fetch(compareUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        }
      });
      if (compareRes.ok) {
        const compareData = await compareRes.json();
        conflict_files = (compareData.files || []).map(f => f.filename);
      }
    }

    return res.json({
      success: true,
      hasPR: true,
      prNumber: prDetails.number,
      prUrl: prDetails.html_url,
      mergeable: prDetails.mergeable,
      mergeable_state: prDetails.mergeable_state, // e.g. "clean", "dirty", "blocked", "unstable", "unknown"
      conflict_files
    });

  } catch (err) {
    console.error('[Check Mergeability Route Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred checking mergeability.' });
  }
});

// In-memory merge jobs map
export const mergeJobs = new Map();

async function runBackgroundMerge(jobId, owner, repo, prNumber, featureBranch, token) {
  mergeJobs.set(jobId, {
    id: jobId,
    status: 'processing',
    progress: 'Initiating conflict resolution...',
    error: null,
    result: null
  });

  try {
    const octokit = new Octokit({ auth: token });
    const result = await resolveAndMerge(owner, repo, prNumber, featureBranch, octokit, null);
    
    if (result.success) {
      // Invalidate deep context cache so next chat uses fresh repo data
      repoContextBuilder.invalidateCache(`${owner}/${repo}`);
      mergeJobs.set(jobId, {
        id: jobId,
        status: 'completed',
        progress: 'Resolved conflicts and merged PR successfully.',
        error: null,
        result
      });
    } else {
      mergeJobs.set(jobId, {
        id: jobId,
        status: 'failed',
        progress: 'Failed to resolve conflicts automatically.',
        error: result.reason || 'Could not resolve conflicts.',
        result
      });
    }
  } catch (err) {
    console.error(`[Background Merge Error] Job ${jobId} failed:`, err);
    mergeJobs.set(jobId, {
      id: jobId,
      status: 'failed',
      progress: 'Error during resolution/merge execution.',
      error: err.message || 'Unknown error occurred.',
      result: { success: false, reason: err.message, requiresManual: true }
    });
  }
}

router.post('/merge', async (req, res) => {
  try {
    const { owner, repo, prNumber, featureBranch } = req.body;
    if (!owner || !repo || !prNumber || !featureBranch) {
      return res.status(400).json({ success: false, error: 'owner, repo, prNumber, and featureBranch are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    const token = user?.githubToken || process.env.GITHUB_TOKEN;

    if (!token) {
      return res.status(400).json({ success: false, error: 'GitHub token not found. Please connect your GitHub account.' });
    }

    const jobId = crypto.randomUUID();
    runBackgroundMerge(jobId, owner, repo, Number(prNumber), featureBranch, token);

    return res.json({
      success: true,
      jobId,
      message: 'Merge conflict resolution started.'
    });
  } catch (err) {
    console.error('[Merge Route Error]', err);
    return res.status(500).json({ success: false, error: err.message || 'Server error occurred during merge initiation.' });
  }
});

router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = mergeJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found.' });
  }
  return res.json({
    success: true,
    job
  });
});

export default router;
