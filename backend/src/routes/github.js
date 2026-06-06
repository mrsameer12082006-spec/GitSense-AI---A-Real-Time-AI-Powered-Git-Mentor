// ─────────────────────────────────────────────────────────────
// GitHub OAuth Integration Routes
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.js';
import prisma from '../lib/prisma.js';
import githubService from '../services/github.js';

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
    
    // Store state in a simple in-memory map (in production, use Redis/session)
    // Map structure: state -> { userId, expiresAt }
    if (!global.githubOAuthStates) {
      global.githubOAuthStates = {};
    }
    global.githubOAuthStates[state] = {
      userId,
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
    
    if (error) {
      console.error('[GitHub] Token exchange error:', error_description);
      return res.redirect(`${process.env.FRONTEND_URL}/#login?error=${encodeURIComponent(error_description)}`);
    }
    
    if (!access_token) {
      return res.redirect(`${process.env.FRONTEND_URL}/#login?error=No access token received`);
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
    
    console.log(`[GitHub] User connected: ${updatedUser.email} -> @${githubUser.login}`);
    
    // Redirect to dashboard with success
    res.redirect(`${process.env.FRONTEND_URL}/#dashboard?github=connected`);
  } catch (err) {
    console.error('[GitHub] Callback error:', err.message);
    res.redirect(`${process.env.FRONTEND_URL}/#login?error=OAuth callback failed`);
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
    
    const connected = !!user.githubId;
    
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
    
    res.status(201).json({
      message: 'Repository imported successfully!',
      repository: importedRepo,
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

export default router;
