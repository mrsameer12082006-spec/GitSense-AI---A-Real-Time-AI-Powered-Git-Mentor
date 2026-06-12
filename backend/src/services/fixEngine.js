import { fetchWithAuth, detectMissingGitignore, detectStaleBranches } from './githubScanner.js';

/**
 * Sleep helper.
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Helper to get the contents of a repo to analyze project type.
 */
async function detectProjectType(owner, repo, token) {
  try {
    const files = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents`, token);
    if (!Array.isArray(files)) return 'Default';

    const names = files.map(f => f.name);
    if (names.includes('package.json')) return 'Node';
    if (names.includes('requirements.txt') || names.includes('setup.py')) return 'Python';
    if (names.includes('go.mod')) return 'Go';
    if (names.includes('composer.json')) return 'PHP';

    return 'Default';
  } catch (e) {
    console.error('[Fix Engine] Project type detection failed:', e.message);
    return 'Default';
  }
}

/**
 * 1. FIX: Missing Gitignore
 */
export async function fixMissingGitignore(owner, repo, token, defaultBranch, onProgress) {
  const steps = [];
  const logStep = (step, status, message) => {
    steps.push(message);
    if (onProgress) onProgress(step, status, message);
  };

  try {
    logStep('detect_type', 'running', 'Detecting project type');
    const projectType = await detectProjectType(owner, repo, token);
    
    logStep('build_content', 'running', 'Building gitignore content');
    let content = '';
    if (projectType === 'Node') {
      content = `node_modules/
.env
.env.local
.env.production
.env.development
dist/
build/
.DS_Store
Thumbs.db
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.vite/
coverage/
.nyc_output/
*.log
.cache/`;
    } else if (projectType === 'Python') {
      content = `__pycache__/
*.py[cod]
*$py.class
.env
venv/
env/
.venv/
dist/
build/
*.egg-info/
.pytest_cache/
.DS_Store
*.log`;
    } else {
      content = `bin/
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
node_modules/
.env
.DS_Store
dist/
build/`;
    }

    logStep('create_file', 'running', 'Creating file on GitHub');
    const base64Content = Buffer.from(content).toString('base64');
    
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.gitignore`;
    const body = {
      message: 'chore: add .gitignore for project',
      content: base64Content,
      branch: defaultBranch
    };

    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'GitSense-AI'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(putUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });

    if (res.status === 422) {
      throw new Error('gitignore file already exists in this repository — the detection may have been a false positive.');
    }

    if (res.status === 403) {
      throw new Error('your GitHub token does not have write access to this repository. You need to reconnect with a token that has the repo scope.');
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to write file via GitHub API: ${res.status} - ${errText}`);
    }

    logStep('verify_file', 'running', 'Verifying file exists');
    const verifyIssue = await detectMissingGitignore(owner, repo, token, defaultBranch);
    
    if (verifyIssue === null) {
      logStep('complete', 'complete', 'Complete');
      return { success: true, steps, verification: 'Passes verify checks. .gitignore exists.' };
    } else {
      throw new Error('Verification failed. .gitignore check still reports file missing.');
    }
  } catch (err) {
    console.error('[Fix Engine] Gitignore fix error:', err.message);
    logStep('error', 'failed', `Error: ${err.message}`);
    return { success: false, steps, error: err.message };
  }
}

/**
 * 2. FIX: Delete Stale Branch
 */
export async function fixStaleBranch(owner, repo, token, defaultBranch, branchName, onProgress) {
  const steps = [];
  const logStep = (step, status, message) => {
    steps.push(message);
    if (onProgress) onProgress(step, status, message);
  };

  try {
    logStep('confirm_exists', 'running', 'Confirming branch exists');
    try {
      await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branchName)}`, token);
    } catch (err) {
      throw new Error(`Branch ${branchName} does not exist or cannot be accessed.`);
    }

    logStep('delete_branch', 'running', 'Deleting remote branch');
    const deleteUrl = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`;
    
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GitSense-AI'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers
    });

    if (res.status !== 204 && res.status !== 200) {
      const text = await res.text();
      throw new Error(`Failed to delete branch reference: status ${res.status} - ${text}`);
    }

    logStep('verify_deletion', 'running', 'Verifying deletion');
    const verifyIssue = await detectStaleBranches(owner, repo, token, defaultBranch);
    
    const isStillStale = verifyIssue && verifyIssue.rawState?.stale?.some(s => s.branchName === branchName);
    
    if (!isStillStale) {
      logStep('complete', 'complete', 'Complete');
      return { success: true, steps, verification: `Branch "${branchName}" no longer exists in stale branch list.` };
    } else {
      throw new Error(`Verification failed. Stale branch "${branchName}" is still detected.`);
    }
  } catch (err) {
    console.error('[Fix Engine] Stale branch delete error:', err.message);
    logStep('error', 'failed', `Error: ${err.message}`);
    return { success: false, steps, error: err.message };
  }
}

/**
 * 3. FIX: Post Coordination Comments on Colliding PRs
 */
export async function fixBranchCollisions(owner, repo, token, prNumber1, prNumber2, collidingFiles, onProgress) {
  const steps = [];
  const logStep = (step, status, message) => {
    steps.push(message);
    if (onProgress) onProgress(step, status, message);
  };

  try {
    const filesListStr = collidingFiles.map(f => `\`${f}\``).join(', ');
    
    logStep('post_pr1', 'running', `Posting warning comment on PR #${prNumber1}...`);
    const commentBody1 = `⚠️ **Cross-Branch Collision Alert**: GitSense AI detected that this PR touches files also modified in open PR #${prNumber2}.\n\n* **Overlapping files**: ${filesListStr}\n* **Action Plan**: Coordinate with the author of PR #${prNumber2} to merge sequentially and rebase features.`;
    
    await postIssueComment(owner, repo, token, prNumber1, commentBody1);

    logStep('post_pr2', 'running', `Posting warning comment on PR #${prNumber2}...`);
    const commentBody2 = `⚠️ **Cross-Branch Collision Alert**: GitSense AI detected that this PR touches files also modified in open PR #${prNumber1}.\n\n* **Overlapping files**: ${filesListStr}\n* **Action Plan**: Coordinate with the author of PR #${prNumber1} to merge sequentially and rebase features.`;
    
    await postIssueComment(owner, repo, token, prNumber2, commentBody2);

    logStep('verify_comments', 'running', 'Verifying comment posts were uploaded successfully...');
    
    const pr1Verified = await verifyCommentPosted(owner, repo, token, prNumber1, `PR #${prNumber2}`);
    const pr2Verified = await verifyCommentPosted(owner, repo, token, prNumber2, `PR #${prNumber1}`);

    if (pr1Verified && pr2Verified) {
      logStep('success', 'complete', `Successfully posted coordination warnings on PR #${prNumber1} and PR #${prNumber2}!`);
      return { success: true, steps, verification: 'Coordination warnings successfully published.' };
    } else {
      throw new Error('Comments could not be fully verified on both PR feeds.');
    }
  } catch (err) {
    console.error('[Fix Engine] PR Collision fix error:', err.message);
    logStep('error', 'failed', `Error: ${err.message}`);
    return { success: false, steps, error: err.message };
  }
}

/**
 * 4. FIX: Re-run Failed Jobs in Actions Workflow Run
 */
export async function triggerRerunFailedJobs(owner, repo, token, runId, onProgress) {
  const steps = [];
  const logStep = (step, status, message) => {
    steps.push(message);
    if (onProgress) onProgress(step, status, message);
  };

  try {
    logStep('trigger_rerun', 'running', 'Triggering job rerun');
    const rerunUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`;
    
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'GitSense-AI'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(rerunUrl, {
      method: 'POST',
      headers
    });

    if (res.status !== 201 && res.status !== 200) {
      const text = await res.text();
      throw new Error(`Failed to request rerun: status ${res.status} - ${text}`);
    }

    logStep('wait_start', 'running', 'Waiting for run to start');
    let completionReport = null;

    logStep('monitor_status', 'running', 'Monitoring run status');
    for (let i = 1; i <= 30; i++) {
      await sleep(8000);
      const runDetail = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, token);
      const status = runDetail.status;
      const conclusion = runDetail.conclusion;

      console.log(`[Fix Engine SSE] Poll ${i}/30 -> status: ${status}, conclusion: ${conclusion}`);
      logStep('monitor_status', 'running', 'Monitoring run status');

      if (status === 'completed') {
        completionReport = runDetail;
        break;
      }
    }

    if (!completionReport) {
      throw new Error('Workflow run did not complete within the timeout window.');
    }

    if (completionReport.conclusion === 'success') {
      logStep('complete', 'complete', 'Run passed');
      return { success: true, steps, verification: `Run concluded with success. Status is green.` };
    } else {
      logStep('complete', 'failed', 'Run failed');
      throw new Error(`Workflow run finished with conclusion "${completionReport.conclusion}". Tests/jobs are still failing.`);
    }
  } catch (err) {
    console.error('[Fix Engine] Workflow rerun error:', err.message);
    logStep('error', 'failed', `Error: ${err.message}`);
    return { success: false, steps, error: err.message };
  }
}

/**
 * Helper to fetch and parse failure logs from a job to extract context.
 */
export async function diagnoseCiFailureLog(owner, repo, token, jobId) {
  try {
    const logsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;
    console.log(`[Fix Engine] Fetching logs from: ${logsUrl}`);

    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'GitSense-AI'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(logsUrl, { headers });
    if (!res.ok) {
      throw new Error(`Failed to retrieve job logs: status ${res.status}`);
    }

    const logText = await res.text();
    const lines = logText.split('\n');
    const matches = [];

    // Keywords to search for
    const errorKeywords = ['ERROR', 'FAILED', 'exit code', 'AssertionError'];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (errorKeywords.some(keyword => line.includes(keyword))) {
        matches.push(i);
      }
    }

    // Merge overlapping context windows
    const snippets = [];
    const windowSize = 10;
    let currentStart = -1;
    let currentEnd = -1;

    for (const matchIdx of matches) {
      const start = Math.max(0, matchIdx - windowSize);
      const end = Math.min(lines.length - 1, matchIdx + windowSize);

      if (currentStart === -1) {
        currentStart = start;
        currentEnd = end;
      } else if (start <= currentEnd + 1) {
        // overlap
        currentEnd = Math.max(currentEnd, end);
      } else {
        snippets.push({
          startLine: currentStart + 1,
          endLine: currentEnd + 1,
          content: lines.slice(currentStart, currentEnd + 1).join('\n')
        });
        currentStart = start;
        currentEnd = end;
      }
    }

    if (currentStart !== -1) {
      snippets.push({
        startLine: currentStart + 1,
        endLine: currentEnd + 1,
        content: lines.slice(currentStart, currentEnd + 1).join('\n')
      });
    }

    return snippets;
  } catch (err) {
    console.error('[Fix Engine] Diagnose job logs error:', err.message);
    throw err;
  }
}

/**
 * Base GitHub API comment post wrapper.
 */
async function postIssueComment(owner, repo, token, number, body) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'GitSense-AI'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to post comment on issue/PR #${number}: status ${res.status} - ${text}`);
  }
  return await res.json();
}

/**
 * Fetch and verify if comment was posted.
 */
async function verifyCommentPosted(owner, repo, token, prNumber, signatureText) {
  try {
    const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
    const comments = await fetchWithAuth(commentsUrl, token);
    
    if (!Array.isArray(comments)) return false;

    // Check if any comment contains the signatureText and "Cross-Branch Collision Alert"
    return comments.some(c => 
      c.body?.includes('Cross-Branch Collision Alert') && 
      c.body?.includes(signatureText)
    );
  } catch (e) {
    return false;
  }
}

/**
 * Creates .gitignore via PUT request and double-verifies it.
 */
export async function createGitignore(owner, repo, token, projectType) {
  const steps = [];
  steps.push('Detecting project type');

  let detectedType = projectType;
  if (!detectedType) {
    try {
      const contents = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents`, token);
      if (Array.isArray(contents)) {
        const names = contents.map(f => f.name);
        if (names.includes('package.json')) {
          detectedType = 'node';
        } else if (names.includes('requirements.txt')) {
          detectedType = 'python';
        } else if (names.includes('go.mod')) {
          detectedType = 'go';
        } else {
          detectedType = 'general';
        }
      } else {
        detectedType = 'general';
      }
    } catch (e) {
      detectedType = 'general';
    }
  }

  steps.push('Building gitignore content');
  let content = '';
  if (detectedType === 'node') {
    content = `node_modules/
.env
.env.local
.env.production
.env.development
dist/
build/
.DS_Store
Thumbs.db
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.vite/
coverage/
.nyc_output/
*.log
.cache/`;
  } else if (detectedType === 'python') {
    content = `__pycache__/
*.py[cod]
*$py.class
.env
venv/
env/
.venv/
dist/
build/
*.egg-info/
.pytest_cache/
.DS_Store
*.log`;
  } else {
    content = `bin/
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
node_modules/
.env
.DS_Store
dist/
build/`;
  }

  const base64Content = Buffer.from(content).toString('base64');

  steps.push('Creating file on GitHub');
  const metadata = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}`, token);
  const defaultBranch = metadata.default_branch || 'main';

  const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.gitignore`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'GitSense-AI'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(putUrl, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: 'chore: add .gitignore for project',
      content: base64Content,
      branch: defaultBranch
    })
  });

  if (res.status === 422) {
    throw new Error('gitignore file already exists in this repository — the detection may have been a false positive.');
  }

  if (res.status === 403) {
    throw new Error('your GitHub token does not have write access to this repository. You need to reconnect with a token that has the repo scope.');
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create gitignore: GitHub returned ${res.status} - ${errText}`);
  }

  const resData = await res.json();
  const fileUrl = resData.content?.html_url || `https://github.com/${owner}/${repo}/blob/${defaultBranch}/.gitignore`;

  steps.push('Verifying file exists');
  try {
    const verifyObj = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/contents/.gitignore`, token);
    if (verifyObj && verifyObj.type === 'file') {
      steps.push('Complete');
      return {
        success: true,
        steps,
        verificationResult: {
          fileUrl,
          message: '.gitignore created and verified successfully'
        }
      };
    } else {
      throw new Error('Verification failed: .gitignore check returned unexpected type.');
    }
  } catch (err) {
    throw new Error(`Verification failed: ${err.message}`);
  }
}

/**
 * Deletes remote stale branch reference and double-verifies.
 */
export async function deleteStaleBranch(owner, repo, token, branchName) {
  // Step one — verify the branch still exists before trying to delete it.
  try {
    await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branchName)}`, token);
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('404')) {
      return { 
        success: true, 
        deletedBranch: branchName, 
        message: 'branch no longer exists — already cleaned up' 
      };
    }
    throw err;
  }

  // Step two — check if the branch has an open pull request.
  const headParam = `${owner}:${branchName}`;
  const prs = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(headParam)}`, token);
  if (prs && prs.length > 0) {
    const pr = prs[0];
    throw new Error(`this branch has an open pull request number ${pr.number} titled ${pr.title} — close or merge the PR before deleting the branch`);
  }

  // Step three — call the GitHub API to delete the branch.
  try {
    await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`, token, 'DELETE');
  } catch (err) {
    if (err.message.includes('needs repo scope') || err.message.includes('403')) {
      throw new Error('token needs repo scope — trigger the reconnect flow');
    }
    throw err;
  }

  // Step four — verify deletion.
  let deletedConfirmed = false;
  try {
    await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branchName)}`, token);
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('404')) {
      deletedConfirmed = true;
    }
  }
  if (!deletedConfirmed) {
    throw new Error('Verification failed — branch still exists after deletion attempt.');
  }

  // Step five — return the success result object.
  return {
    success: true,
    deletedBranch: branchName,
    message: 'Branch ingestion was successfully deleted from the remote repository'
  };
}

/**
 * Posts warning comments on colliding branches' PRs and verifies.
 */
export async function postCollisionComment(owner, repo, token, prNumber1, prNumber2, collidingFiles) {
  const steps = [];
  steps.push('Posting warning comments on PRs');

  const filesListStr = collidingFiles.map(f => `\`${f}\``).join(', ');
  
  const commentBody1 = `⚠️ **Cross-Branch Collision Alert**: GitSense AI detected that this PR touches files also modified in open PR #${prNumber2}.\n\n* **Overlapping files**: ${filesListStr}\n* **Action Plan**: Coordinate with the author of PR #${prNumber2} to merge sequentially and rebase features.`;
  await postIssueComment(owner, repo, token, prNumber1, commentBody1);

  const commentBody2 = `⚠️ **Cross-Branch Collision Alert**: GitSense AI detected that this PR touches files also modified in open PR #${prNumber1}.\n\n* **Overlapping files**: ${filesListStr}\n* **Action Plan**: Coordinate with the author of PR #${prNumber1} to merge sequentially and rebase features.`;
  await postIssueComment(owner, repo, token, prNumber2, commentBody2);

  steps.push('Verifying comment posts');
  const pr1Verified = await verifyCommentPosted(owner, repo, token, prNumber1, `PR #${prNumber2}`);
  const pr2Verified = await verifyCommentPosted(owner, repo, token, prNumber2, `PR #${prNumber1}`);

  if (pr1Verified && pr2Verified) {
    steps.push('Complete');
    return {
      success: true,
      steps,
      verificationResult: {
        message: 'Coordination warning comments posted and verified'
      }
    };
  } else {
    throw new Error('Verification failed: Could not find posted comments on GitHub.');
  }
}

/**
 * Reruns failed jobs in Actions run and polls status.
 */
export async function rerunFailedJobs(owner, repo, token, runId) {
  const steps = [];
  steps.push('Triggering job rerun');

  const rerunUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'GitSense-AI'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(rerunUrl, {
    method: 'POST',
    headers
  });

  if (res.status !== 201 && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Failed to request rerun: status ${res.status} - ${text}`);
  }

  steps.push('Waiting for run to start');
  let completionReport = null;

  steps.push('Monitoring run status');
  for (let i = 1; i <= 30; i++) {
    await sleep(8000);
    const runDetail = await fetchWithAuth(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, token);
    const status = runDetail.status;
    const conclusion = runDetail.conclusion;

    console.log(`[Fix Engine POST] Poll ${i}/30 -> status: ${status}, conclusion: ${conclusion}`);
    if (status === 'completed') {
      completionReport = runDetail;
      break;
    }
  }

  if (!completionReport) {
    throw new Error('Workflow run did not complete within the timeout window.');
  }

  if (completionReport.conclusion === 'success') {
    steps.push('Run passed');
    steps.push('Complete');
    return {
      success: true,
      steps,
      verificationResult: {
        message: 'Workflow re-run succeeded!'
      }
    };
  } else {
    steps.push('Run failed');
    throw new Error(`Workflow run finished with conclusion "${completionReport.conclusion}".`);
  }
}
