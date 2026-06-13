// ─────────────────────────────────────────────────────────────
// GitHub OAuth Integration Routes
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import githubService from '../services/github.js';
import ingestionService from '../services/ingestion.js';
import aiService from '../services/ai.js';

const router = Router();

const GITHUB_OAUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API = 'https://api.github.com';

// ── GET /api/github/connect ───────────────────────────────────
// Start GitHub OAuth flow
router.get('/connect', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Generate state token to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store state with userId temporarily (in production, use Redis)
    // For now, we'll rely on the frontend to send the token back
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ 
        error: 'GitHub OAuth not configured. Missing GITHUB_CLIENT_ID.' 
      });
    }
    
    const referer = req.headers.referer;
    let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
    if (referer) {
      try {
        const parsedUrl = new URL(referer);
        frontendUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
      } catch (e) {}
    }

    if (!global.githubOAuthStates) {
      global.githubOAuthStates = {};
    }
    global.githubOAuthStates[state] = {
      userId,
      frontendUrl,
      expiresAt: Date.now() + 600000, // 10 minutes
    };
    
    // Omit `redirect_uri` so GitHub will use the OAuth app's registered callback URL.
    const authUrl = `${GITHUB_OAUTH_URL}?client_id=${clientId}&scope=repo,user&state=${state}`;
    
    res.json({ authUrl });
  } catch (err) {
    console.error('[GitHub] Connect error:', err.message);
    res.status(500).json({ error: 'Failed to initiate GitHub connection.' });
  }
});

// ── GET /api/github/callback ──────────────────────────────────
// Handle GitHub OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter.' });
    }
    
    // Verify state token
    if (!global.githubOAuthStates || !global.githubOAuthStates[state]) {
      return res.status(400).json({ error: 'Invalid state parameter. OAuth flow may have expired.' });
    }
    
    const stateData = global.githubOAuthStates[state];
    
    // Check if state expired
    if (Date.now() > stateData.expiresAt) {
      delete global.githubOAuthStates[state];
      return res.status(400).json({ error: 'OAuth state expired. Please try again.' });
    }
    
    const userId = stateData.userId;
    delete global.githubOAuthStates[state]; // Consume state
    
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: 'GitHub OAuth not configured.' });
    }

    // Exchange code for access token. Do not send `redirect_uri` here so GitHub
    // will validate against the app's registered callback URL and avoid mismatches.
    const tokenResponse = await axios.post(
      GITHUB_TOKEN_URL,
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
      },
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );
    
    const { access_token, error, error_description } = tokenResponse.data;
    const frontendUrl = stateData.frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5000';

    if (error) {
      console.error('[GitHub] Token exchange error:', error_description);
      return res.redirect(`${frontendUrl}/#login?error=${encodeURIComponent(error_description)}`);
    }
    
    if (!access_token) {
      return res.redirect(`${frontendUrl}/#login?error=No access token received`);
    }
    
    // Fetch GitHub user info
    const userResponse = await axios.get(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: 'application/json',
      },
    });
    
    const githubUser = userResponse.data;
    
    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        githubId: String(githubUser.id),
        githubUsername: githubUser.login,
        githubToken: access_token, // Store encrypted token in production
        githubConnectedAt: new Date(),
      },
    });
    
    req.session = req.session || {};
    req.session.githubToken = access_token;
    await new Promise((resolve) => {
      req.session.save((err) => {
        if (err) console.error('[GitHub] Session save error:', err);
        resolve();
      });
    });

    console.log(`[GitHub] User connected: ${updatedUser.email} -> @${githubUser.login}`);
    
    // Redirect to dashboard with success
    res.redirect(`${frontendUrl}/#dashboard?github=connected`);
  } catch (err) {
    console.error('[GitHub] Callback error:', err.message);
    const frontendUrl = (state && global.githubOAuthStates && global.githubOAuthStates[state]?.frontendUrl)
      || process.env.FRONTEND_URL
      || 'http://localhost:5000';
    res.redirect(`${frontendUrl}/#login?error=OAuth callback failed`);
  }
});

// ── GET /api/github/status ────────────────────────────────────
// Check GitHub connection status
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        githubUsername: true,
        githubLink: true,
        githubId: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    // Connected if githubUsername is set (both OAuth and URL/username-only)
    const connected = !!user.githubUsername;
    
    res.json({
      connected,
      githubUsername: user.githubUsername || null,
      githubLink: user.githubLink || null,
    });
  } catch (err) {
    console.error('[GitHub] Status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch GitHub status.' });
  }
});

// ── POST /api/github/link-profile ─────────────────────────────
// Link GitHub account by profile URL or username
router.post('/link-profile', authenticate, async (req, res) => {
  try {
    const { profileUrl } = req.body;
    if (!profileUrl) {
      return res.status(400).json({ error: 'profileUrl is required.' });
    }
    
    // Extract username
    let username = profileUrl.trim();
    if (username.startsWith('http://') || username.startsWith('https://')) {
      try {
        const parsed = new URL(username);
        const paths = parsed.pathname.split('/').filter(Boolean);
        if (paths.length > 0) {
          username = paths[0];
        } else {
          return res.status(400).json({ error: 'Invalid GitHub Profile URL.' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format.' });
      }
    }
    
    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        githubUsername: username,
        githubLink: `https://github.com/${username}`,
        githubId: null, // Clear OAuth ID to decouple
        githubToken: null, // Clear OAuth Token to decouple
        githubConnectedAt: new Date(),
      },
    });
    
    console.log(`[GitHub] Profile linked: ${req.user.email} -> @${username}`);
    
    res.json({
      message: 'GitHub profile linked successfully.',
      githubUsername: username,
      githubLink: updatedUser.githubLink,
    });
  } catch (err) {
    console.error('[GitHub] Link profile error:', err.message);
    res.status(500).json({ error: 'Failed to link GitHub profile.' });
  }
});

// ── GET /api/github/repos ─────────────────────────────────────
// List user's GitHub repositories
router.get('/repos', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        githubToken: true,
        githubLink: true,
        githubUsername: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    let repos = [];
    
    // If user has OAuth token, use it to fetch all repos (public + private)
    if (user.githubToken) {
      try {
        repos = await githubService.getUserRepos(user.githubToken);
      } catch (err) {
        console.warn('[GitHub] Failed to fetch repos with OAuth token:', err.message);
        // Fallback to public repos
        repos = [];
      }
    }
    
    // If no OAuth token or fallback needed, try to fetch public repos using githubLink/username
    if (repos.length === 0 && user.githubUsername) {
      try {
        const { data } = await axios.get(`${GITHUB_API}/users/${user.githubUsername}/repos`, {
          params: {
            type: 'public',
            sort: 'updated',
            per_page: 50,
          },
          headers: {
            Authorization: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : undefined,
          },
        });
        
        repos = data.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          owner: r.owner.login,
          url: r.html_url,
          defaultBranch: r.default_branch,
          isPrivate: r.private,
          description: r.description,
          language: r.language,
          stars: r.stargazers_count,
          forks: r.forks_count,
          updatedAt: r.updated_at,
        }));
      } catch (err) {
        console.warn('[GitHub] Failed to fetch public repos:', err.message);
      }
    }
    
    res.json({ repos });
  } catch (err) {
    console.error('[GitHub] Repos error:', err.message);
    res.status(500).json({ error: 'Failed to fetch repositories.' });
  }
});

// ── POST /api/github/import ───────────────────────────────────
// Import a repository
router.post('/import', authenticate, async (req, res) => {
  try {
    const { fullName, url } = req.body;
    
    if (!fullName && !url) {
      return res.status(400).json({ error: 'fullName or url is required.' });
    }
    
    let owner, repo;
    
    if (fullName) {
      const parts = fullName.split('/');
      if (parts.length !== 2) {
        return res.status(400).json({ error: 'Invalid fullName format. Use: owner/repo' });
      }
      owner = parts[0];
      repo = parts[1];
    } else if (url) {
      const parsed = githubService.parseRepoUrl(url);
      if (!parsed) {
        return res.status(400).json({ error: 'Invalid GitHub URL.' });
      }
      owner = parsed.owner;
      repo = parsed.repo;
    }
    
    // Get user's GitHub token if available
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true },
    });
    
    const token = user?.githubToken || null;
    
    // Validate repo exists
    const validation = await githubService.validateRepo(owner, repo, token);
    if (!validation.exists) {
      return res.status(404).json({ error: validation.error });
    }
    
    const repoData = validation.data;
    
    // Disconnect any previously connected repos for this user
    await prisma.repository.updateMany({
      where: { userId: req.user.id, isConnected: true },
      data: { isConnected: false },
    });
    
    // Upsert repository
    const importedRepo = await prisma.repository.upsert({
      where: {
        userId_fullName: {
          userId: req.user.id,
          fullName: `${owner}/${repo}`,
        },
      },
      update: {
        isConnected: true,
        connectionMethod: 'oauth',
      },
      create: {
        userId: req.user.id,
        name: repo,
        owner,
        fullName: `${owner}/${repo}`,
        url: repoData.html_url,
        defaultBranch: repoData.default_branch,
        isConnected: true,
        connectionMethod: 'oauth',
      },
    });
    
    console.log(`[GitHub] Repository imported: ${req.user.email} -> ${importedRepo.fullName}`);
    
    // Trigger ingestion in background
    const io = req.app.get('io');
    ingestionService.ingestRepository(importedRepo.id, req.user.id, io).catch((err) => {
      console.error('[GitHub] Auto-ingestion background task failed:', err);
    });
    
    res.status(201).json({
      message: 'Repository imported successfully!',
      repository: {
        id: importedRepo.id,
        name: importedRepo.name,
        owner: importedRepo.owner,
        fullName: importedRepo.fullName,
        url: importedRepo.url,
        defaultBranch: importedRepo.defaultBranch,
        connectionMethod: importedRepo.connectionMethod,
      },
    });
  } catch (err) {
    console.error('[GitHub] Import error:', err.message);
    res.status(500).json({ error: 'Failed to import repository.' });
  }
});

// ── POST /api/github/disconnect ───────────────────────────────
// Disconnect GitHub account
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        githubId: null,
        githubUsername: null,
        githubToken: null,
        githubConnectedAt: null,
      },
    });
    
    console.log(`[GitHub] GitHub disconnected for user: ${req.user.email}`);
    
    res.json({ message: 'GitHub account disconnected.' });
  } catch (err) {
    console.error('[GitHub] Disconnect error:', err.message);
    res.status(500).json({ error: 'Failed to disconnect GitHub.' });
  }
});

function getGitignoreTemplate(type) {
  const templates = {
    Python:  '__pycache__/\n*.pyc\n*.pyo\nvenv/\n.env\n*.egg-info/\ndist/\nbuild/\n',
    Node:    'node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\ncoverage/\n',
    Java:    '*.class\ntarget/\n.idea/\n*.iml\n.env\nbuild/\n',
    default: '*.log\n.env\n.DS_Store\nbuild/\ndist/\n'
  };
  return templates[type] || templates.default;
}

// ── POST /api/github/apply-fix ───────────────────────────────
// Auto-apply resolved code fix to a GitHub file and push commit
router.post('/apply-fix', authenticate, async (req, res) => {
  try {
    const { repoFullName, filePath, resolvedContent, issueTitle, issueType, gitignoreTemplate } = req.body;
    
    if (!repoFullName || !issueTitle || (issueType !== 'missing-gitignore' && issueType !== 'missing_gitignore' && (!filePath || !resolvedContent))) {
      return res.status(400).json({ error: 'repoFullName, filePath, resolvedContent, and issueTitle are required.' });
    }

    const token = req.session?.githubToken || req.body?.githubToken || (await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true }
    }))?.githubToken || process.env.GITHUB_TOKEN;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'GitHub token missing. Please reconnect your GitHub account.'
      });
    }

    // Handle missing gitignore file creation case specifically (no SHA required)
    if (issueType === 'missing-gitignore' || issueType === 'missing_gitignore') {
      const template = getGitignoreTemplate(gitignoreTemplate);
      const createRes = await fetch(
        `https://api.github.com/repos/${repoFullName}/contents/.gitignore`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'GitSense-AI'
          },
          body: JSON.stringify({
            message: 'GitSense AI: Add .gitignore',
            content: Buffer.from(template).toString('base64')
          })
        }
      );
      
      if (!createRes.ok) {
        const errText = await createRes.text();
        return res.status(createRes.status).json({ success: false, error: `Failed to create .gitignore on GitHub: ${errText}` });
      }
      
      const result = await createRes.json();
      return res.json({ success: true, commitUrl: result.commit.html_url });
    }

    console.log(`[GitHub API] Auto-fixing ${repoFullName} -> File: ${filePath}`);

    // Step 1: Get current file SHA (required by GitHub API for updates)
    const fileRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
      { 
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        } 
      }
    );
    
    let sha = undefined;
    if (fileRes.status === 200) {
      const fileData = await fileRes.json();
      sha = fileData.sha;
    } else if (fileRes.status !== 404) {
      const errText = await fileRes.text();
      return res.status(fileRes.status).json({ error: `Failed to retrieve existing file info: ${errText}` });
    }

    // Step 2: Push resolved content
    const updateRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'GitSense-AI'
        },
        body: JSON.stringify({
          message: `GitSense AI Fix: ${issueTitle}`,
          content: Buffer.from(resolvedContent).toString('base64'),
          sha
        })
      }
    );

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      return res.status(updateRes.status).json({ error: `Failed to update file on GitHub: ${errText}` });
    }

    const result = await updateRes.json();
    res.json({ success: true, commitUrl: result.commit.html_url });
  } catch (err) {
    console.error('[GitHub] Apply fix error:', err);
    res.status(500).json({ error: err.message || 'Server error occurred while applying the fix.' });
  }
});

// ── POST /api/github/generate-fix ───────────────────────────
// Generate the resolved content for an issue on-demand using AI
router.post('/generate-fix', authenticate, async (req, res) => {
  try {
    const { repoFullName, issueType, filePath, rootCause, issueTitle } = req.body;
    
    const token = req.session?.githubToken || req.body?.githubToken || (await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { githubToken: true }
    }))?.githubToken;
    
    let currentContent = '';
    if (repoFullName && filePath && token) {
      try {
        const [owner, repoName] = repoFullName.split('/');
        currentContent = await githubService.getFileContent(owner, repoName, filePath, token);
      } catch (err) {
        console.warn(`[Generate Fix] Could not fetch content for ${filePath} (may not exist yet):`, err.message);
      }
    }

    const systemPrompt = `You are GitSense AI. You are a senior frontend/backend developer.
Your task is to fix the following issue in the repository file.
You must return only the corrected and fully resolved content of the file that fixes the issue.
Do NOT include any markdown code block wrappers (like \`\`\`), explanation, backticks, or any other text. Return ONLY the raw file content that will be written directly to the file.
Ensure the resolved content contains NO placeholders (like '// TODO' or '...'). It must be the complete, ready-to-write file.`;

    const userPrompt = `Issue Title: ${issueTitle || ''}
Issue Type: ${issueType || ''}
File Path: ${filePath || ''}
Root Cause of Issue: ${rootCause || ''}

Current File Content:
${currentContent || '(File is currently empty or does not exist)'}
`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    console.log(`[GitHub API] Generating fix using AI for: ${repoFullName} -> File: ${filePath}`);
    const aiResponse = await aiService.generateCompletion(messages, 0.2);
    
    let resolvedContent = aiResponse.trim();
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

    res.json({ success: true, resolvedContent });
  } catch (err) {
    console.error('[GitHub] Generate fix error:', err);
    res.status(500).json({ error: err.message || 'Server error occurred while generating the AI fix.' });
  }
});

export default router;
