// ─────────────────────────────────────────────────────────────
// GitSense AI — Repository Ingestion Pipeline Service
//
// Ingests repository data (commits, files, PRs, branches, issues)
// into SQLite using `@xenova/transformers` for local vector embeddings.
// ─────────────────────────────────────────────────────────────

import prisma from '../lib/prisma.js';
import githubService from './github.js';
import embeddingService from './embedding.js';

class IngestionService {
  /**
   * Helper to update IngestionJob progress in database and emit Socket.io event
   */
  async _updateProgress(jobId, repositoryId, status, progress, currentStep, io = null, error = null) {
    try {
      await prisma.ingestionJob.update({
        where: { id: jobId },
        data: {
          status,
          progress,
          currentStep,
          errorMessage: error,
          completedAt: status === 'completed' || status === 'failed' ? new Date() : null,
        },
      });

      // Update repository status
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          ingestionStatus: status,
        },
      });

      // Emit to sockets
      if (io) {
        io.emit('ingestion_progress', {
          repositoryId,
          jobId,
          status,
          progress,
          currentStep,
          error,
        });
      }
    } catch (err) {
      console.error('[Ingestion] Failed to update progress:', err.message);
    }
  }

  /**
   * Full repository ingestion pipeline
   */
  async ingestRepository(repositoryId, userId, io = null) {
    console.log(`[Ingestion] Starting ingestion for repository: ${repositoryId}`);

    // 1. Create ingestion job entry
    const job = await prisma.ingestionJob.create({
      data: {
        repositoryId,
        status: 'running',
        progress: 0,
        currentStep: 'Initializing ingestion pipeline...',
      },
    });

    try {
      // 2. Fetch repository details
      const repo = await prisma.repository.findUnique({
        where: { id: repositoryId },
        include: { user: true },
      });

      if (!repo) {
        throw new Error('Repository record not found.');
      }

      const token = repo.user.githubToken;
      const owner = repo.owner;
      const repoName = repo.name;
      const defaultBranch = repo.defaultBranch || 'main';

      await this._updateProgress(job.id, repositoryId, 'running', 5, 'Validating connection to GitHub...', io);

      // Validate repository exists and is accessible
      const validation = await githubService.validateRepo(owner, repoName, token);
      if (!validation.exists) {
        throw new Error(validation.error || 'GitHub repository is not accessible.');
      }

      // Collect all chunks to embed at the end
      const rawChunks = [];

      // ── Step 1: Ingest Branches (10% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 10, 'Fetching repository branches...', io);
      const branches = await githubService.getBranches(owner, repoName, token);
      
      for (const branch of branches) {
        // Find ahead/behind comparison against default branch
        let comparisonStr = '';
        if (branch.name !== defaultBranch) {
          const comp = await githubService.getBranchComparison(owner, repoName, defaultBranch, branch.name, token);
          comparisonStr = `Ahead of ${defaultBranch} by ${comp.aheadBy} commits, behind by ${comp.behindBy} commits.`;
        } else {
          comparisonStr = 'This is the default branch.';
        }

        rawChunks.push({
          sourceType: 'branch',
          sourceId: branch.name,
          priority: 1,
          content: `Branch Name: ${branch.name}\nLatest Commit SHA: ${branch.sha}\nStatus: ${comparisonStr}`,
          metadata: { branchName: branch.name, sha: branch.sha },
        });
      }

      // ── Step 2: Ingest Commits (25% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 15, 'Fetching recent commits...', io);
      // Fetch up to 100 commits to build the commit history context
      const commits = await githubService.getCommits(owner, repoName, token, 100);
      
      // Fetch details for the latest 15 commits (to get diffs/files changed)
      const detailedCommitsCount = Math.min(commits.length, 15);
      for (let i = 0; i < commits.length; i++) {
        const c = commits[i];
        let filesChangedText = '';
        let patchDetails = '';

        if (i < detailedCommitsCount) {
          try {
            const details = await githubService.getCommitDetails(owner, repoName, c.sha, token);
            if (details && details.files) {
              const fileNames = details.files.map(f => `${f.filename} (${f.status}: +${f.additions} -${f.deletions})`).join(', ');
              filesChangedText = `Files Changed: ${fileNames}`;
              
              // Include snippets of patches for first 5 commits
              if (i < 5) {
                const patches = details.files
                  .filter(f => f.patch)
                  .map(f => `--- a/${f.filename}\n+++ b/${f.filename}\n${f.patch.substring(0, 1000)}`)
                  .join('\n\n');
                if (patches) {
                  patchDetails = `\nPatch Diff (Truncated):\n${patches}`;
                }
              }
            }
          } catch (err) {
            console.warn(`[Ingestion] Failed to get commit details for ${c.hash}:`, err.message);
          }
        }

        rawChunks.push({
          sourceType: 'commit',
          sourceId: c.sha,
          priority: 1,
          content: `Commit Hash: ${c.sha} (${c.hash})\nAuthor: ${c.author}\nDate: ${c.date}\nMessage: ${c.message}\n${filesChangedText}${patchDetails}`,
          metadata: { sha: c.sha, author: c.author, date: c.date, message: c.message },
        });
      }

      // ── Step 3: Ingest Pull Requests (45% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 35, 'Fetching pull requests...', io);
      const prs = await githubService.getPullRequests(owner, repoName, token);
      const mergedPrs = await githubService.getMergedPRs(owner, repoName, token);
      const allPRs = [...prs, ...mergedPrs].slice(0, 30); // Limit to 30 PRs for performance

      for (const pr of allPRs) {
        // Fetch comments for context
        let commentsText = '';
        try {
          const comments = await githubService.getPRComments(owner, repoName, pr.number, token);
          if (comments.length > 0) {
            commentsText = '\nDiscussion / Comments:\n' + comments.map(c => `[${c.author} on ${c.createdAt}]: ${c.body}`).join('\n');
          }
        } catch (err) {
          console.warn(`[Ingestion] Failed to fetch PR comments for #${pr.number}`);
        }

        rawChunks.push({
          sourceType: 'pr',
          sourceId: String(pr.number),
          priority: 2,
          content: `Pull Request #${pr.number}: ${pr.title}\nAuthor: ${pr.author}\nStatus: ${pr.status || (pr.mergedAt ? 'Merged' : 'Closed')}\nCreated At: ${pr.createdAt}\nMerged At: ${pr.mergedAt || 'N/A'}\nBase: ${pr.baseBranch} <-- Head: ${pr.headBranch}\nBody:\n${pr.body || 'No description provided.'}${commentsText}`,
          metadata: { number: pr.number, title: pr.title, author: pr.author, state: pr.status || 'closed' },
        });
      }

      // ── Step 4: Ingest Issues (60% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 50, 'Fetching issues...', io);
      const openIssues = await githubService.getIssues(owner, repoName, token);
      const closedIssues = await githubService.getClosedIssues(owner, repoName, token);
      const allIssues = [...openIssues, ...closedIssues].slice(0, 30); // Limit to 30 issues

      for (const issue of allIssues) {
        let commentsText = '';
        try {
          const comments = await githubService.getIssueComments(owner, repoName, issue.number, token);
          if (comments.length > 0) {
            commentsText = '\nComments:\n' + comments.map(c => `[${c.author} on ${c.createdAt}]: ${c.body}`).join('\n');
          }
        } catch (err) {
          console.warn(`[Ingestion] Failed to fetch issue comments for #${issue.number}`);
        }

        rawChunks.push({
          sourceType: 'issue',
          sourceId: String(issue.number),
          priority: 1,
          content: `Issue #${issue.number}: ${issue.title}\nAuthor: ${issue.author}\nStatus: ${issue.closedAt ? 'Closed' : 'Open'}\nLabels: ${(issue.labels || []).join(', ') || 'none'}\nCreated At: ${issue.createdAt}\nBody:\n${issue.body || 'No details provided.'}${commentsText}`,
          metadata: { number: issue.number, title: issue.title, author: issue.author },
        });
      }

      // ── Step 5: Ingest Code Files (80% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 65, 'Analyzing repository file structure...', io);
      const tree = await githubService.getFileTree(owner, repoName, defaultBranch, token);
      
      // Filter for files we care about (max 60 files, size < 100KB, code/docs extensions)
      const allowedExtensions = [
        '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.cs',
        '.sh', '.html', '.css', '.md', '.markdown', '.json', '.yml', '.yaml', '.toml',
        '.ini', '.dockerfile', 'dockerfile', 'package.json', 'tsconfig.json'
      ];
      
      const fileList = tree.filter(node => {
        if (node.type !== 'blob') return false;
        const lowerPath = node.path.toLowerCase();
        
        // Exclude common noise directories/files
        if (
          lowerPath.includes('node_modules/') ||
          lowerPath.includes('dist/') ||
          lowerPath.includes('build/') ||
          lowerPath.includes('package-lock.json') ||
          lowerPath.includes('yarn.lock') ||
          lowerPath.includes('pnpm-lock.yaml') ||
          lowerPath.includes('.git/') ||
          lowerPath.includes('.github/workflows/') // Workflow files are handled separately if needed, but let them pass if within size
        ) {
          return false;
        }

        // Check size limit: max 100KB (102,400 bytes)
        if (node.size && node.size > 102400) return false;

        const isAllowedExtension = allowedExtensions.some(ext => lowerPath.endsWith(ext) || lowerPath.split('/').pop() === ext);
        return isAllowedExtension;
      });

      // Limit files to ingest
      const filesToIngest = fileList.slice(0, 80);
      console.log(`[Ingestion] Ingesting ${filesToIngest.length} code/doc files.`);

      for (let idx = 0; idx < filesToIngest.length; idx++) {
        const file = filesToIngest[idx];
        const pct = 65 + Math.floor((idx / filesToIngest.length) * 15);
        if (idx % 10 === 0) {
          await this._updateProgress(job.id, repositoryId, 'running', pct, `Downloading files: ${file.path} (${idx + 1}/${filesToIngest.length})...`, io);
        }

        try {
          const content = await githubService.getFileContent(owner, repoName, file.path, token);
          if (content && content.trim()) {
            const isReadme = file.path.toLowerCase().endsWith('readme.md');
            const isConfig = ['package.json', 'tsconfig.json', 'dockerfile'].some(n => file.path.toLowerCase().endsWith(n)) || file.path.includes('.github/workflows/');
            
            const priority = isReadme ? 3 : (isConfig ? 2 : 1);
            const type = isReadme ? 'readme' : (isConfig ? 'config' : 'file');

            // Chunk large files
            const chunks = this._chunkText(content, 1200, 150);
            chunks.forEach((chunkContent, chunkIdx) => {
              rawChunks.push({
                sourceType: type,
                sourceId: file.path,
                priority,
                content: `File: ${file.path} (Part ${chunkIdx + 1}/${chunks.length})\nPath: ${file.path}\nContent:\n${chunkContent}`,
                metadata: { filePath: file.path, part: chunkIdx + 1, totalParts: chunks.length },
              });
            });
          }
        } catch (err) {
          console.warn(`[Ingestion] Failed to download content for ${file.path}:`, err.message);
        }
      }

      // ── Step 6: Generate Embeddings (95% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 85, `Generating embeddings for ${rawChunks.length} content chunks...`, io);
      
      // Warm up model
      await embeddingService.warmup();

      // Batch embeddings generation to avoid memory pressure
      const batchSize = 16;
      const textsToEmbed = rawChunks.map(c => c.content);
      console.log(`[Ingestion] Generating embeddings for ${textsToEmbed.length} chunks...`);
      
      const embeddings = [];
      for (let i = 0; i < textsToEmbed.length; i += batchSize) {
        const batch = textsToEmbed.slice(i, i + batchSize);
        
        // Progress update every few batches
        if (i % 64 === 0) {
          const embPct = 85 + Math.floor((i / textsToEmbed.length) * 10);
          await this._updateProgress(job.id, repositoryId, 'running', embPct, `Generating embeddings: ${i}/${textsToEmbed.length} chunks...`, io);
        }

        const batchEmbs = await embeddingService.embedBatch(batch);
        embeddings.push(...batchEmbs);
      }

      await this._updateProgress(job.id, repositoryId, 'running', 95, 'Saving vectorized chunks to SQLite database...', io);

      // ── Step 7: Clear old chunks and Save to Database ──
      await prisma.$transaction([
        prisma.repoChunk.deleteMany({
          where: { repositoryId },
        }),
        prisma.repoChunk.createMany({
          data: rawChunks.map((chunk, idx) => ({
            repositoryId,
            sourceType: chunk.sourceType,
            sourceId: chunk.sourceId,
            content: chunk.content,
            embedding: JSON.stringify(embeddings[idx] || []),
            metadata: JSON.stringify(chunk.metadata),
            priority: chunk.priority,
          })),
        }),
      ]);

      // Complete job
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          lastIngestedAt: new Date(),
          chunkCount: rawChunks.length,
          ingestionStatus: 'completed',
        },
      });

      await this._updateProgress(
        job.id,
        repositoryId,
        'completed',
        100,
        `Ingestion completed successfully! Indexed ${rawChunks.length} chunks.`,
        io
      );

      console.log(`[Ingestion] Ingestion successful for repository ${repositoryId}. Created ${rawChunks.length} chunks.`);
    } catch (err) {
      console.error('[Ingestion] Error during repository ingestion:', err);
      await this._updateProgress(
        job.id,
        repositoryId,
        'failed',
        job.progress,
        'Ingestion failed.',
        io,
        err.message || String(err)
      );
    }
  }

  /**
   * Incremental Sync — for simplicity in development, redirects to ingestRepository
   */
  async incrementalSync(repositoryId, userId, io = null) {
    return this.ingestRepository(repositoryId, userId, io);
  }

  /**
   * Simple character-based text splitter with overlap
   */
  _chunkText(text, chunkSize = 1200, overlap = 150) {
    const chunks = [];
    if (text.length <= chunkSize) {
      return [text];
    }
    
    let index = 0;
    while (index < text.length) {
      const chunk = text.substring(index, index + chunkSize);
      chunks.push(chunk);
      index += (chunkSize - overlap);
      if (index >= text.length) break;
    }
    return chunks;
  }
}

export default new IngestionService();
