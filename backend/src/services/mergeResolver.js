import { Octokit } from '@octokit/rest';
import aiService from './ai.js';

/**
 * Helper to call a function with exponential backoff on GitHub API rate limits.
 */
async function callWithBackoff(fn) {
  let delay = 1000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err.status === 403 && (
        err.message?.toLowerCase().includes('rate limit') ||
        err.response?.headers?.['x-ratelimit-remaining'] === '0'
      );
      if (isRateLimit && attempt < 3) {
        console.warn(`[Merge Resolver] GitHub API rate limit hit. Backing off for ${delay}ms (Attempt ${attempt}/3)`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

/**
 * Helper to get the contents of a file on a specific ref.
 */
async function getFileContent(octokit, owner, repo, path, ref) {
  try {
    const res = await callWithBackoff(() =>
      octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref
      })
    );
    if (res.data && typeof res.data.content === 'string') {
      return Buffer.from(res.data.content, 'base64').toString('utf8');
    }
    return '';
  } catch (err) {
    if (err.status === 404) {
      return null; // File does not exist on this branch
    }
    throw err;
  }
}

/**
 * Resolves conflicts on a PR via AI, commits resolved files, polls mergeable status, and merges the PR.
 * 
 * @param {string} owner Repo owner
 * @param {string} repo Repo name
 * @param {number} prNumber Pull request number
 * @param {string} featureBranch Feature branch name
 * @param {Octokit} octokit Octokit instance
 * @param {any} groq Optional Groq AI client instance
 */
export async function resolveAndMerge(owner, repo, prNumber, featureBranch, octokit, groq) {
  try {
    console.log(`[Merge Resolver] Checking PR #${prNumber} on ${owner}/${repo}...`);

    // 1. Fetch PR details
    let prResponse = await callWithBackoff(() =>
      octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      })
    );
    let pr = prResponse.data;

    // Wait if GitHub mergeability is still computing (null)
    if (pr.mergeable === null) {
      console.log(`[Merge Resolver] PR #${prNumber} mergeable state is null. Waiting for computation...`);
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        prResponse = await callWithBackoff(() =>
          octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber
          })
        );
        pr = prResponse.data;
        if (pr.mergeable !== null) {
          break;
        }
      }
    }

    const baseBranch = pr.base.ref;
    console.log(`[Merge Resolver] PR #${prNumber}: mergeable=${pr.mergeable}, base=${baseBranch}, head=${featureBranch}`);

    // If PR is already mergeable, we can merge directly
    if (pr.mergeable === true || pr.mergeable_state === 'clean') {
      console.log(`[Merge Resolver] PR #${prNumber} is already mergeable. Proceeding directly to merge.`);
      return await executeMergeAndCleanup(owner, repo, prNumber, featureBranch, octokit, []);
    }

    // 2. Fetch all changed files in the PR
    console.log(`[Merge Resolver] Fetching changed files for PR #${prNumber}...`);
    const filesResponse = await callWithBackoff(() =>
      octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100
      })
    );
    const files = filesResponse.data;

    const resolvedFiles = [];

    // 3. For each changed file, fetch contents from base + head, and merge via AI
    for (const file of files) {
      const path = file.filename;
      console.log(`[Merge Resolver] Fetching content for file: ${path}`);

      const baseContent = await getFileContent(octokit, owner, repo, path, baseBranch);
      const headContent = await getFileContent(octokit, owner, repo, path, featureBranch);

      // Skip files that were added/deleted or unchanged
      if (baseContent === null || headContent === null) {
        console.log(`[Merge Resolver] Skipping ${path} because it is newly created or deleted.`);
        continue;
      }
      if (baseContent === headContent) {
        console.log(`[Merge Resolver] Skipping ${path} because base and head contents are identical.`);
        continue;
      }

      console.log(`[Merge Resolver] Running AI conflict resolution for: ${path}`);

      // Call AI to resolve conflict
      const systemPrompt = `You are a code merge conflict resolver. Given the BASE version and the FEATURE version of a file, produce the final merged file that incorporates the intent of the FEATURE changes while preserving working code from BASE. Return ONLY the final merged file content, no explanation. If you cannot safely resolve the conflicts (e.g., because the changes are too contradictory, delete essential parts, or are completely unclear), reply with exactly "UNABLE_TO_RESOLVE".`;
      const userMessage = `BASE VERSION:\n---\n${baseContent}\n---\n\nFEATURE VERSION:\n---\n${headContent}\n---`;

      let aiResponse = '';
      if (groq && typeof groq.chat?.completions?.create === 'function') {
        const completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.2
        });
        aiResponse = completion.choices[0]?.message?.content || '';
      } else {
        // Fallback to our existing aiService wrapper
        aiResponse = await aiService.generateCompletion([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ], 0.2);
      }

      let resolvedContent = aiResponse.trim();
      // Clean up markdown block wrapping if present
      if (resolvedContent.startsWith('```')) {
        const firstNewline = resolvedContent.indexOf('\n');
        if (firstNewline !== -1) {
          resolvedContent = resolvedContent.substring(firstNewline + 1);
        }
        if (resolvedContent.endsWith('```')) {
          resolvedContent = resolvedContent.substring(0, resolvedContent.length - 3);
        }
        resolvedContent = resolvedContent.trim();
      }

      if (resolvedContent === 'UNABLE_TO_RESOLVE' || resolvedContent.includes('UNABLE_TO_RESOLVE')) {
        console.error(`[Merge Resolver] AI failed to resolve conflict for: ${path}`);
        return {
          success: false,
          reason: `AI could not safely resolve conflict in ${path}`,
          requiresManual: true
        };
      }

      // 4. Commit resolved file content back to the feature branch
      console.log(`[Merge Resolver] Committing resolved content for ${path} back to feature branch...`);
      let currentFileSha = null;
      try {
        const contentRes = await callWithBackoff(() =>
          octokit.rest.repos.getContent({
            owner,
            repo,
            path,
            ref: featureBranch
          })
        );
        if (contentRes.data && !Array.isArray(contentRes.data)) {
          currentFileSha = contentRes.data.sha;
        }
      } catch (err) {
        // file doesn't exist yet or other content retrieval error
      }

      await callWithBackoff(() =>
        octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo,
          path,
          message: `fix: AI resolved merge conflict in ${path}`,
          content: Buffer.from(resolvedContent).toString('base64'),
          sha: currentFileSha || undefined,
          branch: featureBranch
        })
      );

      resolvedFiles.push(path);
    }

    // 5. Wait for mergeable status to update
    console.log(`[Merge Resolver] Polling PR #${prNumber} mergeable status...`);
    let mergeable = false;
    for (let retry = 1; retry <= 10; retry++) {
      console.log(`[Merge Resolver] Poll attempt ${retry}/10...`);
      await new Promise(r => setTimeout(r, 2000));
      
      const prCheck = await callWithBackoff(() =>
        octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: prNumber
        })
      );

      if (prCheck.data.mergeable === true || prCheck.data.mergeable_state === 'clean') {
        mergeable = true;
        break;
      }
    }

    if (!mergeable) {
      console.warn(`[Merge Resolver] PR #${prNumber} mergeable state never became true/clean after polling.`);
      return {
        success: false,
        reason: 'PR mergeable status remains unclean or blocked after updates.',
        requiresManual: true
      };
    }

    // 6. Merge the PR
    return await executeMergeAndCleanup(owner, repo, prNumber, featureBranch, octokit, resolvedFiles);

  } catch (err) {
    console.error(`[Merge Resolver Error]`, err);
    return {
      success: false,
      reason: err.message || 'An unexpected error occurred during merge resolution.',
      requiresManual: true
    };
  }
}

/**
 * Helper to execute squash-merge and branch deletion.
 */
async function executeMergeAndCleanup(owner, repo, prNumber, featureBranch, octokit, resolvedFiles) {
  console.log(`[Merge Resolver] Merging PR #${prNumber} via squash...`);
  await callWithBackoff(() =>
    octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: prNumber,
      merge_method: 'squash',
      commit_title: 'GitSense AI: auto-fix merged',
      commit_message: 'Automated merge by GitSense AI engine'
    })
  );

  console.log(`[Merge Resolver] Deleting feature branch: ${featureBranch}...`);
  try {
    await callWithBackoff(() =>
      octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${featureBranch}`
      })
    );
  } catch (err) {
    // If ref deletion fails, log it but don't fail the resolution since PR is merged
    console.warn(`[Merge Resolver] Ref deletion for ${featureBranch} failed:`, err.message);
  }

  return {
    success: true,
    merged: true,
    conflictsResolved: resolvedFiles,
    mergeMethod: 'squash',
    message: resolvedFiles.length > 0 
      ? `AI resolved ${resolvedFiles.length} conflicts and merged successfully`
      : 'PR merged successfully'
  };
}
