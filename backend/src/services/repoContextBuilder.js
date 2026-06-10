// ─────────────────────────────────────────────────────────────
// GitSense AI — Deep Repository Context Builder
//
// Constructs a rich, condensed repo context string from the
// GitHub API (file tree, config files, top source files) that
// gets injected into every AI system prompt. Includes an
// in-memory cache with TTL to avoid redundant API calls.
// ─────────────────────────────────────────────────────────────

import githubService from './github.js';

// ── Priority file patterns (fetched first, in order) ──
const PRIORITY_FILES = [
  'README.md', 'readme.md', 'README.rst', 'README.txt',
  'package.json', 'tsconfig.json', 'jsconfig.json',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile',
  'Cargo.toml', 'go.mod', 'go.sum',
  'Makefile', 'CMakeLists.txt',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.env.example', '.env.sample',
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  'Gemfile', 'composer.json',
  '.github/workflows/ci.yml', '.github/workflows/main.yml',
  '.github/workflows/build.yml', '.github/workflows/test.yml',
];

// ── Entry point file names (high priority source files) ──
const ENTRY_POINTS = [
  'index.js', 'index.ts', 'index.jsx', 'index.tsx',
  'main.js', 'main.ts', 'main.py', 'main.go', 'main.rs',
  'app.js', 'app.ts', 'app.py',
  'server.js', 'server.ts',
  'manage.py', 'wsgi.py', 'asgi.py',
  'lib.rs', 'mod.rs',
  'Program.cs', 'Startup.cs',
];

// ── Directories to skip in tree display ──
const SKIP_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.parcel-cache', 'coverage', '.nyc_output', 'vendor',
  '.idea', '.vscode', '.vs', 'target', 'bin', 'obj',
  'eggs', '*.egg-info', '.tox', '.mypy_cache',
];

// ── Source file extensions to consider ──
const SOURCE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.m',
  '.sh', '.bash', '.zsh',
];

const MAX_CONTEXT_CHARS = 80_000;
const MAX_FILE_SIZE = 102_400; // 100KB per file
const CACHE_TTL = 600_000; // 10 minutes

class RepoContextBuilder {
  constructor() {
    this._cache = new Map();
  }

  /**
   * Build a deep context string for the connected repository.
   * Fetches file tree, priority files, and top source files.
   * Results are cached for 10 minutes per repository.
   *
   * @param {{ owner: string, name: string, defaultBranch?: string, id?: string }} repo
   * @param {string|null} token — GitHub access token
   * @returns {Promise<string>}
   */
  async buildDeepContext(repo, token = null) {
    const cacheKey = repo.id || `${repo.owner}/${repo.name}`;
    const cached = this._getCache(cacheKey);
    if (cached) {
      console.log(`[RepoContextBuilder] Returning cached context for ${cacheKey}`);
      return cached;
    }

    console.log(`[RepoContextBuilder] Building deep context for ${repo.owner}/${repo.name}...`);
    const { owner, name } = repo;
    const branch = repo.defaultBranch || 'main';

    let totalChars = 0;
    const sections = [];

    // ── 1. Fetch full file tree ──
    let tree = [];
    try {
      tree = await githubService.getFileTree(owner, name, branch, token);
    } catch (err) {
      console.error('[RepoContextBuilder] Failed to fetch file tree:', err.message);
    }

    // Filter and format tree (skip noise directories)
    const filteredTree = tree.filter(node => {
      const lowerPath = node.path.toLowerCase();
      return !SKIP_DIRS.some(skip => {
        if (skip.includes('*')) return false; // Skip glob patterns
        return lowerPath === skip || lowerPath.startsWith(skip + '/');
      });
    });

    // Build compact tree string (cap at 80 entries to save budget for actual file contents)
    const treeEntries = filteredTree.slice(0, 80);
    const treeStr = treeEntries.map(n => {
      const icon = n.type === 'tree' ? '📁' : '📄';
      const sizeStr = n.size ? ` (${this._formatSize(n.size)})` : '';
      return `${icon} ${n.path}${sizeStr}`;
    }).join('\n');

    const treeTruncated = filteredTree.length > 80
      ? `\n... and ${filteredTree.length - 80} more files/directories`
      : '';

    const treeSection = `## REPOSITORY FILE TREE (${filteredTree.length} items)\n${treeStr}${treeTruncated}`;
    totalChars += treeSection.length;
    sections.push(treeSection);

    // ── 2. Fetch priority/config files ──
    const configSection = [];
    const fileBlobs = filteredTree.filter(n => n.type === 'blob');
    const filePathSet = new Set(fileBlobs.map(n => n.path));

    // Also check for workflow files
    const workflowFiles = fileBlobs
      .filter(n => n.path.startsWith('.github/workflows/') && (n.path.endsWith('.yml') || n.path.endsWith('.yaml')))
      .map(n => n.path);

    const priorityPaths = [
      ...PRIORITY_FILES.filter(p => filePathSet.has(p)),
      ...workflowFiles.filter(p => !PRIORITY_FILES.includes(p)),
    ];

    // Deduplicate and limit to top 3 priority files to keep it extremely fast and small
    const uniquePriority = [...new Set(priorityPaths)].slice(0, 3);

    const priorityPromises = uniquePriority.map(async (filePath) => {
      const node = fileBlobs.find(n => n.path === filePath);
      if (node && node.size && node.size > MAX_FILE_SIZE) return null;
      try {
        const content = await githubService.getFileContent(owner, name, filePath, token);
        if (content && content.trim()) {
          const truncated = content.substring(0, 1500); // Cap individual config at 1.5KB
          return `### CONFIG: ${filePath}\n\`\`\`\n${truncated}\n\`\`\``;
        }
      } catch (err) {
        console.warn(`[RepoContextBuilder] Failed to fetch config file ${filePath}:`, err.message);
      }
      return null;
    });

    const priorityResults = await Promise.allSettled(priorityPromises);
    for (const result of priorityResults) {
      if (result.status === 'fulfilled' && result.value) {
        configSection.push(result.value);
        totalChars += result.value.length;
      }
    }

    if (configSection.length > 0) {
      sections.push(`## CONFIGURATION & MANIFEST FILES\n${configSection.join('\n\n')}`);
    }

    // ── 3. Fetch top source files in parallel ──
    const sourceSection = [];

    // Score source files by importance
    const sourceFiles = fileBlobs
      .filter(n => {
        const ext = this._getExtension(n.path);
        return SOURCE_EXTENSIONS.includes(ext);
      })
      .filter(n => !n.path.includes('node_modules/') && !n.path.includes('dist/'))
      .filter(n => !uniquePriority.includes(n.path)) // Don't re-fetch config files
      .filter(n => !n.size || n.size <= MAX_FILE_SIZE)
      .map(n => ({
        ...n,
        score: this._scoreSourceFile(n.path),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2); // Limit to top 2 key files

    const sourcePromises = sourceFiles.map(async (file) => {
      try {
        const content = await githubService.getFileContent(owner, name, file.path, token);
        if (content && content.trim()) {
        const maxLen = 800;
        const truncated = content.substring(0, maxLen);
          const wasTruncated = content.length > maxLen;
          return `### SOURCE: ${file.path}${wasTruncated ? ' (truncated)' : ''}\n\`\`\`\n${truncated}\n\`\`\``;
        }
      } catch (err) {
        console.warn(`[RepoContextBuilder] Failed to fetch source file ${file.path}:`, err.message);
      }
      return null;
    });

    const sourceResults = await Promise.allSettled(sourcePromises);
    for (const result of sourceResults) {
      if (result.status === 'fulfilled' && result.value) {
        sourceSection.push(result.value);
        totalChars += result.value.length;
      }
    }

    if (sourceSection.length > 0) {
      sections.push(`## KEY SOURCE FILES\n${sourceSection.join('\n\n')}`);
    }

    // ── 4. Extract dependency summary from package.json ──
    const pkgEntry = configSection.find(s => s.includes('CONFIG: package.json'));
    if (pkgEntry) {
      try {
        const jsonMatch = pkgEntry.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          const pkg = JSON.parse(jsonMatch[1]);
          const deps = Object.keys(pkg.dependencies || {});
          const devDeps = Object.keys(pkg.devDependencies || {});
          const scripts = Object.entries(pkg.scripts || {}).map(([k, v]) => `  ${k}: ${v}`).join('\n');
          const depSummary = `## DEPENDENCY SUMMARY\n- **Dependencies** (${deps.length}): ${deps.slice(0, 10).join(', ')}${deps.length > 10 ? ` ... +${deps.length - 10} more` : ''}\n- **Dev Dependencies** (${devDeps.length}): ${devDeps.slice(0, 8).join(', ')}${devDeps.length > 8 ? ` ... +${devDeps.length - 8} more` : ''}`;
          sections.push(depSummary);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    const contextString = sections.join('\n\n');
    console.log(`[RepoContextBuilder] Built deep context: ${contextString.length} chars, tree: ${filteredTree.length} files, configs: ${configSection.length}, sources: ${sourceSection.length}`);

    this._setCache(cacheKey, contextString);
    return contextString;
  }

  /**
   * Detect file paths mentioned in user message and fetch them live if not in context.
   * @param {string} message — user's message
   * @param {string} existingContext — the current context string
   * @param {{ owner: string, name: string }} repo
   * @param {string|null} token
   * @returns {Promise<string>} — additional context string for mentioned files
   */
  async fetchMentionedFiles(message, existingContext, repo, token = null) {
    const mentionedPaths = this._extractFilePaths(message);
    if (mentionedPaths.length === 0) return '';

    const additions = [];
    for (const filePath of mentionedPaths.slice(0, 3)) { // Max 3 live fetches per message
      // Skip if already in context
      if (existingContext.includes(filePath)) continue;

      try {
        const content = await githubService.getFileContent(repo.owner, repo.name, filePath, token);
        if (content && content.trim()) {
          const truncated = content.substring(0, 8000);
          additions.push(`### LIVE-FETCHED FILE: ${filePath}\n\`\`\`\n${truncated}\n\`\`\``);
        }
      } catch (err) {
        additions.push(`### FILE NOT FOUND: ${filePath}\nThis file does not exist in the repository.`);
      }
    }

    return additions.length > 0
      ? `\n## ADDITIONAL FILES (fetched on-demand)\n${additions.join('\n\n')}`
      : '';
  }

  /**
   * Detect if user is asking about an external library/framework.
   * Returns a search query string or null.
   * @param {string} message
   * @param {string} existingContext
   * @returns {string|null}
   */
  detectExternalQuery(message, existingContext) {
    const lower = message.toLowerCase();

    // Patterns that suggest external library questions
    const externalPatterns = [
      /how (?:does|do|to use|to install|to configure|to set up)\s+(\w[\w.-]+)/i,
      /what is\s+(\w[\w.-]+)\s+(?:library|package|module|framework)/i,
      /(?:docs|documentation|api)\s+(?:for|of)\s+(\w[\w.-]+)/i,
      /(\w[\w.-]+)\s+(?:docs|documentation|api|guide|tutorial)/i,
    ];

    for (const pattern of externalPatterns) {
      const match = message.match(pattern);
      if (match) {
        const term = match[1];
        // Don't trigger for repo-internal terms
        if (!existingContext.includes(term) && term.length > 2) {
          return `${term} documentation usage examples`;
        }
      }
    }

    // Check for npm/pip package names in the message
    const packagePatterns = [
      /\b(express|react|next|vue|angular|fastify|prisma|mongoose|sequelize|axios|lodash|moment|dayjs)\b/i,
      /\bnpm\s+(?:install|i)\s+([\w@/-]+)/i,
      /\bpip\s+install\s+([\w-]+)/i,
      /\bcargo\s+add\s+([\w-]+)/i,
    ];

    for (const pattern of packagePatterns) {
      const match = message.match(pattern);
      if (match) {
        const pkg = match[1];
        // Only trigger if user is asking about usage, not just mentioning
        if (lower.includes('how') || lower.includes('docs') || lower.includes('example') || lower.includes('configure') || lower.includes('setup') || lower.includes('usage')) {
          return `${pkg} npm package documentation usage guide`;
        }
      }
    }

    return null;
  }

  /**
   * Fetch and decode README.md, package.json, and all root level files using GitHub API
   * Decodes base64 content and structures it for injection.
   * Results are cached for 10 minutes to prevent hitting API rate limits.
   */
  async fetchCriticalFiles(repo, token = null) {
    const { owner, name } = repo;
    const cacheKey = `critical:${repo.id || `${owner}/${name}`}`;
    const cached = this._getCache(cacheKey);
    if (cached) {
      console.log(`[RepoContextBuilder] Returning cached critical files for ${cacheKey}`);
      return cached;
    }

    console.log(`[RepoContextBuilder] Fetching critical files for ${owner}/${name}...`);
    let readmeContent = null;
    let readmeName = 'README.md';
    let packageJsonContent = null;
    const rootFiles = [];

    const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.eot', '.exe', '.dll', '.so', '.dylib', '.DS_Store', '.git', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.gitignore'];
    const isBinaryOrLockFile = (filename) => {
      const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
      if (BINARY_EXTENSIONS.includes(ext)) return true;
      if (BINARY_EXTENSIONS.includes(filename.toLowerCase())) return true;
      return false;
    };

    try {
      const rootItems = await githubService.getRepoContents(owner, name, '', token);
      if (Array.isArray(rootItems)) {
        // Find README candidates
        const readmeItem = rootItems.find(item => 
          item.type === 'file' && 
          (item.name.toLowerCase() === 'readme.md' || 
           item.name.toLowerCase() === 'readme.rst' || 
           item.name.toLowerCase() === 'readme.txt' ||
           item.name.toLowerCase() === 'readme')
        );

        if (readmeItem) {
          try {
            readmeContent = await githubService.getFileContent(owner, name, readmeItem.path, token);
            if (readmeContent) {
              readmeContent = readmeContent.substring(0, 4000); // Cap README at 4KB
              readmeName = readmeItem.name;
            }
          } catch (err) {
            // ignore
          }
        }

        try {
          packageJsonContent = await githubService.getFileContent(owner, name, 'package.json', token);
          if (packageJsonContent) packageJsonContent = packageJsonContent.substring(0, 2000); // Cap package.json at 2KB
        } catch (err) {
          // ignore
        }

        const otherFiles = rootItems.filter(item => 
          item.type === 'file' && 
          item.name !== readmeName && 
          item.name !== 'package.json' &&
          !isBinaryOrLockFile(item.name) &&
          (!item.size || item.size < 50000)
        ).slice(0, 3);

        const otherPromises = otherFiles.map(async (item) => {
          try {
            const content = await githubService.getFileContent(owner, name, item.path, token);
            return { name: item.name, content: content ? content.substring(0, 600) : null }; // Cap other files at 600 chars
          } catch (err) {
            return { name: item.name, content: null };
          }
        });

        const otherResults = await Promise.all(otherPromises);
        for (const res of otherResults) {
          if (res.content) {
            rootFiles.push(res);
          }
        }
      }
    } catch (err) {
      console.error('[RepoContextBuilder] Failed to list root contents:', err.message);
    }

    // Fallback direct-fetch if list failed or readme/package.json not found
    if (!readmeContent) {
      const candidates = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'readme'];
      for (const candidate of candidates) {
        try {
          const content = await githubService.getFileContent(owner, name, candidate, token);
          if (content !== null && content !== undefined) {
            readmeContent = content.substring(0, 4000);
            readmeName = candidate;
            break;
          }
        } catch (err) {
          // ignore
        }
      }
    }

    if (!packageJsonContent) {
      try {
        const content = await githubService.getFileContent(owner, name, 'package.json', token);
        if (content !== null && content !== undefined) {
          packageJsonContent = content.substring(0, 2000);
        }
      } catch (err) {
        // ignore
      }
    }

    let criticalContext = '';

    if (readmeContent !== null && readmeContent.trim()) {
      criticalContext += `Here is the FULL ACTUAL CONTENT of README.md from the connected repo:\n`;
      criticalContext += `${readmeContent}\n\n`;
      criticalContext += `Use this exact content to answer any question about the README. Do not summarize from memory. Do not guess. Read this content and answer from it directly.\n\n`;
    } else {
      criticalContext += `Here is the FULL ACTUAL CONTENT of README.md from the connected repo:\n`;
      criticalContext += `I tried to read your README.md but it returned empty or does not exist in this repo.\n\n`;
    }

    if (packageJsonContent !== null && packageJsonContent.trim()) {
      criticalContext += `Here is the FULL ACTUAL CONTENT of package.json from the connected repo:\n`;
      criticalContext += `${packageJsonContent}\n\n`;
      criticalContext += `Use this exact content to answer any question about the project dependencies, scripts, or package metadata. Do not guess or summarize from memory.\n\n`;
    }

    if (rootFiles.length > 0) {
      criticalContext += `Here is the ACTUAL CONTENT of other root-level files in the repository:\n\n`;
      for (const file of rootFiles) {
        criticalContext += `### FILE: ${file.name}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
    }

    this._setCache(cacheKey, criticalContext);
    return criticalContext;
  }

  /**
   * Invalidate cache for a specific repository.
   * Call this after auto-fix/merge actions.
   */
  invalidateCache(repositoryId) {
    if (this._cache.has(repositoryId)) {
      this._cache.delete(repositoryId);
      console.log(`[RepoContextBuilder] Cache invalidated for ${repositoryId}`);
    }
    // Also invalidate any owner/name keys
    for (const [key] of this._cache) {
      if (key.includes('/')) {
        this._cache.delete(key);
      }
    }
  }

  // ─── Private helpers ───────────────────────────────────────

  _getCache(key) {
    const entry = this._cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) {
      return entry.data;
    }
    this._cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    this._cache.set(key, { data, ts: Date.now() });
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  _getExtension(path) {
    const dot = path.lastIndexOf('.');
    return dot !== -1 ? path.substring(dot) : '';
  }

  _scoreSourceFile(filePath) {
    const basename = filePath.split('/').pop();
    let score = 0;

    // Entry point files get highest priority
    if (ENTRY_POINTS.some(ep => basename === ep)) score += 100;

    // Files in src/ or lib/ directories
    if (filePath.startsWith('src/') || filePath.startsWith('lib/')) score += 30;

    // Shallow files (closer to root) are more important
    const depth = filePath.split('/').length;
    score += Math.max(0, 20 - depth * 3);

    // Route/controller/service files
    if (/\b(route|controller|service|handler|middleware|model|schema|util|helper|config)\b/i.test(filePath)) {
      score += 25;
    }

    // Test files get lower priority
    if (/\b(test|spec|__test__|__spec__)\b/i.test(filePath)) {
      score -= 20;
    }

    return score;
  }

  _extractFilePaths(message) {
    const paths = [];

    // Match patterns like src/services/ai.js, package.json, etc.
    const pathRegex = /(?:^|\s|`|'|")((?:[\w.-]+\/)*[\w.-]+\.(?:js|jsx|ts|tsx|py|go|rs|java|kt|c|cpp|h|cs|rb|php|json|yml|yaml|toml|md|sh|css|html|sql|graphql|proto|env))\b/gi;
    let match;
    while ((match = pathRegex.exec(message)) !== null) {
      const p = match[1].trim();
      if (p.length > 2 && !p.startsWith('http')) {
        paths.push(p);
      }
    }

    return [...new Set(paths)];
  }
}

export default new RepoContextBuilder();
