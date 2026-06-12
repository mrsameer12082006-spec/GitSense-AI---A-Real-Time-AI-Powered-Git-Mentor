// ─────────────────────────────────────────────────────────────
// GitSense AI — Repository Ingestion Pipeline Service
//
// Ingests repository data (commits, files, PRs, branches, issues)
// into SQLite using `@xenova/transformers` for local vector embeddings.
// ─────────────────────────────────────────────────────────────

import prisma from '../lib/prisma.js';
import githubService from './github.js';
import embeddingService from './embedding.js';

function analyzeRepoIssues(tree, fileContents, branches, defaultBranch) {
  const issues = [];
  
  // 1. Dependency/Structure
  const packageJsonPath = Object.keys(fileContents).find(p => p.toLowerCase().endsWith('package.json'));
  if (packageJsonPath) {
    try {
      const pkg = JSON.parse(fileContents[packageJsonPath]);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      
      const deprecatedDeps = {
        'request': 'The "request" package has been deprecated since 2020. Use axios or native fetch instead.',
        'node-sass': 'The "node-sass" package is deprecated. Use "sass" (dart-sass) instead.',
        'moment': 'The "moment" package is in maintenance mode. Consider using modern alternatives like date-fns, luxon, or dayjs.',
        'body-parser': 'Express 4.16+ has built-in body parsing middleware (express.json() and express.urlencoded()). separate "body-parser" is redundant.'
      };

      for (const [dep, replacement] of Object.entries(deprecatedDeps)) {
        if (deps[dep]) {
          issues.push({
            category: 'dependency',
            title: `Deprecated Dependency: ${dep}`,
            severity: 'medium',
            file: packageJsonPath,
            description: replacement
          });
        }
      }
    } catch (e) {
      issues.push({
        category: 'dependency',
        title: 'Malformed package.json',
        severity: 'high',
        file: packageJsonPath,
        description: 'Failed to parse package.json. Ensure it is valid JSON.'
      });
    }
  }

  // Check lockfile presence
  const hasLockfile = tree.some(node => {
    const name = node.path.split('/').pop();
    return ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(name);
  });
  if (!hasLockfile) {
    issues.push({
      category: 'dependency',
      title: 'Missing Lockfile',
      severity: 'medium',
      file: 'Root',
      description: 'No lockfile (package-lock.json, yarn.lock, or pnpm-lock.yaml) was found in the repository. Lockfiles ensure consistent dependency installations across environments.'
    });
  }

  // Check node_modules in .gitignore
  const gitignorePath = Object.keys(fileContents).find(p => p.toLowerCase().endsWith('.gitignore'));
  if (gitignorePath) {
    const gitignoreContent = fileContents[gitignorePath] || '';
    const hasNodeModules = gitignoreContent.split('\n').some(line => {
      const clean = line.trim();
      return clean === 'node_modules' || clean === 'node_modules/' || clean === '**/node_modules';
    });
    if (!hasNodeModules) {
      issues.push({
        category: 'dependency',
        title: 'Missing node_modules in .gitignore',
        severity: 'high',
        file: gitignorePath,
        description: 'The node_modules directory is not ignored in .gitignore. Committing node_modules to Git bloats the repository size.'
      });
    }
  }

  // 2. Security/Safety
  const apiKeyRegex = /(sk-[a-zA-Z0-9]{20,})/i;
  const genericSecretRegex = /(api[_-]?key|client[_-]?secret|private[_-]?key|password|db_conn|database_url)\s*=\s*["']([^"']{8,})["']/i;
  
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (!content) continue;
    const lowerPath = filePath.toLowerCase();
    if (lowerPath.endsWith('.gitignore') || lowerPath.endsWith('package.json') || lowerPath.endsWith('package-lock.json') || lowerPath.endsWith('yarn.lock') || lowerPath.endsWith('pnpm-lock.yaml')) {
      continue;
    }
    
    const hasApiKey = apiKeyRegex.exec(content);
    const hasSecret = genericSecretRegex.exec(content);
    
    if (hasApiKey) {
      issues.push({
        category: 'security',
        title: 'Hardcoded API Key Detected',
        severity: 'high',
        file: filePath,
        description: `Found a potential hardcoded API key (${hasApiKey[1].substring(0, 6)}...) in code. Secrets should be loaded from environment variables.`
      });
    } else if (hasSecret) {
      const value = hasSecret[2];
      const isPlaceholder = ['your_', 'placeholder', 'dummy', '<', '>', 'todo', 'my_key', 'mysecret'].some(ph => value.toLowerCase().includes(ph));
      if (!isPlaceholder) {
        issues.push({
          category: 'security',
          title: `Potential Hardcoded Secret: ${hasSecret[1]}`,
          severity: 'high',
          file: filePath,
          description: `A hardcoded assignment for "${hasSecret[1]}" was detected. Use process.env variables instead.`
        });
      }
    }
  }

  // Check committed .env files
  const committedEnvFiles = tree.filter(node => {
    const name = node.path.split('/').pop();
    return name === '.env' || name.endsWith('.env');
  });
  for (const envFile of committedEnvFiles) {
    issues.push({
      category: 'security',
      title: 'Committed Environment File',
      severity: 'high',
      file: envFile.path,
      description: `The environment file "${envFile.path}" is tracked by Git. This can expose environment credentials and secrets.`
    });
  }

  // 3. Code Quality
  const hasTests = tree.some(node => {
    const lowerPath = node.path.toLowerCase();
    return lowerPath.includes('test') || lowerPath.includes('spec') || lowerPath.includes('__tests__');
  });
  if (!hasTests) {
    issues.push({
      category: 'quality',
      title: 'No Automated Tests Found',
      severity: 'medium',
      file: 'Root',
      description: 'Could not locate any test files, test suites, or test directories (e.g. __tests__, *.test.js, etc.). Automated tests ensure code reliability.'
    });
  }

  // Check route file try/catch
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (!content) continue;
    const isRouteFile = filePath.toLowerCase().includes('route') || filePath.toLowerCase().includes('controller');
    if (isRouteFile) {
      if (content.includes('async') && !content.includes('try') && !content.includes('catch')) {
        issues.push({
          category: 'quality',
          title: 'Asynchronous Route Handlers Missing Error Handling',
          severity: 'medium',
          file: filePath,
          description: 'This route/controller file contains asynchronous code but lacks try/catch blocks. Unhandled promise rejections can crash the Node process.'
        });
      }
    }
  }

  // Console logs in controllers
  for (const [filePath, content] of Object.entries(fileContents)) {
    if (!content) continue;
    if (filePath.toLowerCase().includes('controller')) {
      const logs = content.match(/console\.log\(/g) || [];
      if (logs.length > 0) {
        issues.push({
          category: 'quality',
          title: 'Console Logs left in Controllers',
          severity: 'low',
          file: filePath,
          description: `Found ${logs.length} instance(s) of console.log() in a controller. Consider using a production-ready logger (e.g., winston or pino).`
        });
      }
    }
  }

  // 4. Documentation
  const readmePath = Object.keys(fileContents).find(p => p.toLowerCase().endsWith('readme.md'));
  if (!readmePath) {
    issues.push({
      category: 'documentation',
      title: 'Missing README.md',
      severity: 'high',
      file: 'Root',
      description: 'The repository is missing a README.md file in the root. Every repository should have a README with description, installation and usage instructions.'
    });
  } else {
    const readmeContent = fileContents[readmePath] || '';
    const words = readmeContent.trim().split(/\s+/).filter(Boolean);
    if (words.length < 100) {
      issues.push({
        category: 'documentation',
        title: 'Short README.md',
        severity: 'low',
        file: readmePath,
        description: `The README.md file is very brief (${words.length} words). Consider expanding it with project setup instructions.`
      });
    }

    const hasSetupInstructions = ['install', 'npm', 'yarn', 'run', 'setup', 'start'].some(kw => readmeContent.toLowerCase().includes(kw));
    if (!hasSetupInstructions) {
      issues.push({
        category: 'documentation',
        title: 'Missing Setup / Installation Instructions',
        severity: 'medium',
        file: readmePath,
        description: 'The README.md does not seem to contain instructions on how to install dependencies or run the project.'
      });
    }
  }

  // 5. Branch Hygiene
  if (branches.length > 10) {
    issues.push({
      category: 'hygiene',
      title: 'High Branch Count',
      severity: 'low',
      file: 'Branches',
      description: `The repository has ${branches.length} branches. Stale/inactive branches should be pruned or merged to maintain clean branch hygiene.`
    });
  }

  const defaultBranchObj = branches.find(b => b.name === defaultBranch);
  if (defaultBranchObj && !defaultBranchObj.protected) {
    issues.push({
      category: 'hygiene',
      title: `Branch Protection Disabled on "${defaultBranch}"`,
      severity: 'medium',
      file: `Branch: ${defaultBranch}`,
      description: `The default branch "${defaultBranch}" does not have branch protection rules configured. Consider enabling protections to prevent force pushes or unreviewed merges.`
    });
  }

  return issues;
}

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

      // ── Step 1: Fetch all initial repository metadata in parallel (10% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 10, 'Fetching branches, commits, PRs, issues, and file tree...', io);
      
      const [branches, commits, prs, mergedPrs, openIssues, closedIssues, tree] = await Promise.all([
        githubService.getBranches(owner, repoName, token),
        githubService.getCommits(owner, repoName, token, 100),
        githubService.getPullRequests(owner, repoName, token),
        githubService.getMergedPRs(owner, repoName, token),
        githubService.getIssues(owner, repoName, token),
        githubService.getClosedIssues(owner, repoName, token),
        githubService.getFileTree(owner, repoName, defaultBranch, token)
      ]);

      // ── Step 1b: Process Branches in Parallel ──
      const branchComparisonsPromises = branches.map(async (branch) => {
        let comparisonStr = '';
        if (branch.name !== defaultBranch) {
          try {
            const comp = await githubService.getBranchComparison(owner, repoName, defaultBranch, branch.name, token);
            comparisonStr = `Ahead of ${defaultBranch} by ${comp.aheadBy} commits, behind by ${comp.behindBy} commits.`;
          } catch (e) {
            comparisonStr = 'Ahead/behind comparison unavailable.';
          }
        } else {
          comparisonStr = 'This is the default branch.';
        }

        return {
          sourceType: 'branch',
          sourceId: branch.name,
          priority: 1,
          content: `Branch Name: ${branch.name}\nLatest Commit SHA: ${branch.sha}\nStatus: ${comparisonStr}`,
          metadata: { branchName: branch.name, sha: branch.sha },
        };
      });
      const branchChunks = await Promise.all(branchComparisonsPromises);
      rawChunks.push(...branchChunks);

      // ── Step 2: Fetch and Process Commits Details in Parallel (25% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 25, 'Processing recent commits details...', io);
      const detailedCommitsCount = Math.min(commits.length, 15);
      const commitDetailsPromises = [];
      for (let i = 0; i < detailedCommitsCount; i++) {
        commitDetailsPromises.push(
          githubService.getCommitDetails(owner, repoName, commits[i].sha, token)
            .then(details => ({ sha: commits[i].sha, details }))
            .catch((err) => {
              console.warn(`[Ingestion] Failed to get commit details for ${commits[i].sha}:`, err.message);
              return { sha: commits[i].sha, details: null };
            })
        );
      }
      const allCommitDetailsResults = await Promise.all(commitDetailsPromises);
      const commitDetailsMap = new Map(allCommitDetailsResults.map(r => [r.sha, r.details]));

      for (let i = 0; i < commits.length; i++) {
        const c = commits[i];
        let filesChangedText = '';
        let patchDetails = '';

        const details = commitDetailsMap.get(c.sha);
        if (details && details.files) {
          const fileNames = details.files.map(f => `${f.filename} (${f.status}: +${f.additions} -${f.deletions})`).join(', ');
          filesChangedText = `Files Changed: ${fileNames}`;
          
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

        rawChunks.push({
          sourceType: 'commit',
          sourceId: c.sha,
          priority: 1,
          content: `Commit Hash: ${c.sha} (${c.hash})\nAuthor: ${c.author}\nDate: ${c.date}\nMessage: ${c.message}\n${filesChangedText}${patchDetails}`,
          metadata: { sha: c.sha, author: c.author, date: c.date, message: c.message },
        });
      }

      // ── Step 3: Fetch and Process PRs in Parallel (45% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 45, 'Processing pull requests discussion...', io);
      const allPRs = [...prs, ...mergedPrs].slice(0, 30); // Limit to 30 PRs for performance

      const prCommentsPromises = allPRs.map(pr =>
        githubService.getPRComments(owner, repoName, pr.number, token)
          .then(comments => ({ number: pr.number, comments }))
          .catch((err) => {
            console.warn(`[Ingestion] Failed to fetch PR comments for #${pr.number}:`, err.message);
            return { number: pr.number, comments: [] };
          })
      );
      const allPrCommentsResults = await Promise.all(prCommentsPromises);
      const prCommentsMap = new Map(allPrCommentsResults.map(r => [r.number, r.comments]));

      for (const pr of allPRs) {
        const comments = prCommentsMap.get(pr.number) || [];
        let commentsText = '';
        if (comments.length > 0) {
          commentsText = '\nDiscussion / Comments:\n' + comments.map(c => `[${c.author} on ${c.createdAt}]: ${c.body}`).join('\n');
        }

        rawChunks.push({
          sourceType: 'pr',
          sourceId: String(pr.number),
          priority: 2,
          content: `Pull Request #${pr.number}: ${pr.title}\nAuthor: ${pr.author}\nStatus: ${pr.status || (pr.mergedAt ? 'Merged' : 'Closed')}\nCreated At: ${pr.createdAt}\nMerged At: ${pr.mergedAt || 'N/A'}\nBase: ${pr.baseBranch} <-- Head: ${pr.headBranch}\nBody:\n${pr.body || 'No description provided.'}${commentsText}`,
          metadata: { number: pr.number, title: pr.title, author: pr.author, state: pr.status || 'closed' },
        });
      }

      // ── Step 4: Fetch and Process Issues in Parallel (60% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 60, 'Processing issue comments...', io);
      const allIssues = [...openIssues, ...closedIssues].slice(0, 30); // Limit to 30 issues

      const issueCommentsPromises = allIssues.map(issue =>
        githubService.getIssueComments(owner, repoName, issue.number, token)
          .then(comments => ({ number: issue.number, comments }))
          .catch((err) => {
            console.warn(`[Ingestion] Failed to fetch issue comments for #${issue.number}:`, err.message);
            return { number: issue.number, comments: [] };
          })
      );
      const allIssueCommentsResults = await Promise.all(issueCommentsPromises);
      const issueCommentsMap = new Map(allIssueCommentsResults.map(r => [r.number, r.comments]));

      for (const issue of allIssues) {
        const comments = issueCommentsMap.get(issue.number) || [];
        let commentsText = '';
        if (comments.length > 0) {
          commentsText = '\nComments:\n' + comments.map(c => `[${c.author} on ${c.createdAt}]: ${c.body}`).join('\n');
        }

        rawChunks.push({
          sourceType: 'issue',
          sourceId: String(issue.number),
          priority: 1,
          content: `Issue #${issue.number}: ${issue.title}\nAuthor: ${issue.author}\nStatus: ${issue.closedAt ? 'Closed' : 'Open'}\nLabels: ${(issue.labels || []).join(', ') || 'none'}\nCreated At: ${issue.createdAt}\nBody:\n${issue.body || 'No details provided.'}${commentsText}`,
          metadata: { number: issue.number, title: issue.title, author: issue.author },
        });
      }

      // ── Step 5: Ingest Code Files & Deep Repository Analysis (80% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 65, 'Analyzing repository file structure...', io);
      
      const allowedExtensions = [
        '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.c', '.cpp', '.h', '.cs',
        '.sh', '.html', '.css', '.md', '.markdown', '.json', '.yml', '.yaml', '.toml',
        '.ini', '.dockerfile', 'dockerfile', '.gitignore'
      ];
      
      const potentialFiles = tree.filter(node => {
        if (node.type !== 'blob') return false;
        const lowerPath = node.path.toLowerCase();
        
        if (
          lowerPath.includes('node_modules/') ||
          lowerPath.includes('dist/') ||
          lowerPath.includes('build/') ||
          lowerPath.includes('.git/')
        ) {
          return false;
        }

        if (node.size && node.size > 102400) return false;

        const isAllowedExtension = allowedExtensions.some(ext => lowerPath.endsWith(ext) || lowerPath.split('/').pop() === ext);
        return isAllowedExtension;
      });

      const scoredFiles = potentialFiles.map(file => {
        const lowerPath = file.path.toLowerCase();
        const fileName = lowerPath.split('/').pop();
        let priority = 0;
        
        if (fileName === 'readme.md') {
          priority = 1000;
        } else if (['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.gitignore'].includes(fileName)) {
          priority = 100;
        } else if (lowerPath.endsWith('.md') || lowerPath.endsWith('.txt')) {
          priority = 90;
        } else if (
          ['index.js', 'index.ts', 'app.js', 'app.ts', 'server.js', 'server.ts', 'main.js', 'main.ts'].includes(fileName) ||
          lowerPath.includes('route') ||
          lowerPath.includes('controller')
        ) {
          priority = 80;
        } else {
          priority = 50;
        }
        
        return { file, priority };
      });

      scoredFiles.sort((a, b) => b.priority - a.priority);

      // Select top 50 files
      const filesToDownload = scoredFiles.slice(0, 50).map(sf => sf.file);
      console.log(`[Ingestion] Downloading ${filesToDownload.length} selected configuration, documentation, and code files.`);

      const fileContents = {};
      let fetchedCount = 0;
      
      const downloadBatchSize = 10;
      const downloadBatches = [];
      for (let i = 0; i < filesToDownload.length; i += downloadBatchSize) {
        downloadBatches.push(filesToDownload.slice(i, i + downloadBatchSize));
      }

      for (let bIdx = 0; bIdx < downloadBatches.length; bIdx++) {
        const batch = downloadBatches[bIdx];
        
        const downloadPromises = batch.map(async (file) => {
          try {
            const content = await githubService.getFileContent(owner, repoName, file.path, token);
            return { filePath: file.path, content };
          } catch (err) {
            console.warn(`[Ingestion] Failed to download content for ${file.path}:`, err.message);
            return { filePath: file.path, content: null };
          }
        });

        const downloadedResults = await Promise.all(downloadPromises);
        for (const res of downloadedResults) {
          if (res.content !== null) {
            fileContents[res.filePath] = res.content;
            fetchedCount++;
          }
        }

        const progressVal = 65 + Math.floor((bIdx / downloadBatches.length) * 15);
        await this._updateProgress(
          job.id,
          repositoryId,
          'running',
          progressVal,
          `Reading your repository... (analyzing ${fetchedCount} files)`,
          io
        );
      }

      // Run deep repository analysis and build realIssues list
      const realIssues = analyzeRepoIssues(tree, fileContents, branches, defaultBranch);
      console.log(`[Ingestion] Rule-based analysis complete. Found ${realIssues.length} issues.`);

      // Store issues in rawChunks format for any text chunks we want to embed
      for (const [filePath, content] of Object.entries(fileContents)) {
        if (!content || !content.trim()) continue;

        const fileName = filePath.split('/').pop().toLowerCase();
        if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore'].includes(fileName)) {
          continue;
        }

        const isReadme = filePath.toLowerCase().endsWith('readme.md');
        const isConfig = ['package.json', 'tsconfig.json', 'dockerfile'].some(n => filePath.toLowerCase().endsWith(n)) || filePath.includes('.github/workflows/');
        
        const priority = isReadme ? 3 : (isConfig ? 2 : 1);
        const type = isReadme ? 'readme' : (isConfig ? 'config' : 'file');

        const chunks = this._chunkText(content, 2000, 400);
        chunks.forEach((chunkContent, chunkIdx) => {
          rawChunks.push({
            sourceType: type,
            sourceId: filePath,
            priority,
            content: `File: ${filePath} (Part ${chunkIdx + 1}/${chunks.length})\nPath: ${filePath}\nContent:\n${chunkContent}`,
            metadata: { filePath, part: chunkIdx + 1, totalParts: chunks.length },
          });
        });
      }

      // ── Step 6: Generate Embeddings (95% progress) ──
      await this._updateProgress(job.id, repositoryId, 'running', 85, `Generating embeddings for ${rawChunks.length} content chunks...`, io);
      
      // Warm up model
      await embeddingService.warmup();

      // Batch embeddings generation to avoid memory pressure
      const batchSize = 32;
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

      // Store issues in repository metadata
      let metadataObj = {};
      if (repo.metadata) {
        try {
          metadataObj = JSON.parse(repo.metadata);
        } catch (e) {
          metadataObj = {};
        }
      }
      metadataObj.realIssues = realIssues || [];
      const updatedMetadata = JSON.stringify(metadataObj);

      // Complete job
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          lastIngestedAt: new Date(),
          chunkCount: rawChunks.length,
          ingestionStatus: 'completed',
          metadata: updatedMetadata,
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
  _chunkText(text, chunkSize = 2000, overlap = 400) {
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
