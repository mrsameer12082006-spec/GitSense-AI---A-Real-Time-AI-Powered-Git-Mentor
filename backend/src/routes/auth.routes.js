// ─────────────────────────────────────────────────────────────
// GitSense AI — Auth Routes (Signup + Login)
// POST /api/auth/signup
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import prisma from '../lib/prisma.js';
import { authenticate, generateToken } from '../middleware/auth.js';

const router = Router();

// JWT generation is handled by middleware/auth.js (reads JWT_SECRET from env)

// ── POST /api/auth/signup ───────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, githubLink, password } = req.body;

    // Validate all fields
    if (!name || !email || !githubLink || !password) {
      return res.status(400).json({
        error: 'All fields are required: name, email, githubLink, password.',
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user in Neon database
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        githubLink: githubLink.trim(),
        passwordHash,
      },
    });

    // Generate JWT token
    const token = generateToken(user);

    console.log(`[Auth] User signed up: ${user.email}`);

    // Return success (never return passwordHash)
    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        githubLink: user.githubLink,
      },
    });
  } catch (err) {
    console.error('[Auth] Signup error:', err.message);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate fields
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    // Normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Compare password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    console.log(`[Auth] User logged in: ${user.email}`);

    // Return success (never return passwordHash)
    res.json({
      message: 'Login successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        githubLink: user.githubLink,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        githubLink: true,
        githubToken: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      user: {
        ...user,
        githubScopes: req.user.githubScopes || ''
      }
    });
  } catch (err) {
    console.error('[Auth] Me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch user profile.' });
  }
});

// ── PUT /api/auth/profile ────────────────────────────────────
// Update user profile details (name, email, githubLink)
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, email, githubLink } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already taken by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        NOT: { id: req.user.id }
      }
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name: name.trim(),
        email: normalizedEmail,
        githubLink: githubLink ? githubLink.trim() : null
      }
    });

    res.json({
      message: 'Profile updated successfully!',
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        githubLink: updatedUser.githubLink
      }
    });
  } catch (err) {
    console.error('[Auth] Update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

router.get('/github', (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL;
  const forceReauth = req.query.force_reauth === 'true';

  if (!clientId) {
    return res.status(500).json({ error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in .env' });
  }

  const scope = 'repo,read:user,user:email';
  let url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}`;

  if (forceReauth) {
    url += '&prompt=consent';
    return res.redirect(url);
  }

  res.json({ url });
});

// ── GET /api/auth/github/callback ───────────────────────────
// Exchanges authorization code for access token
router.get('/github/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing.' });
    }

    // Exchange code for token
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    // Debug: log token response when things fail to help diagnose redirect/credential issues
    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      console.error('[Auth] GitHub token response:', tokenResponse.data);
      const message = tokenResponse.data.error_description || tokenResponse.data.error || 'Failed to obtain access token from GitHub.';
      return res.status(400).json({ error: message });
    }

    // Fetch user info from GitHub
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const ghUser = userResponse.data;

    // Fetch email if not public
    let email = ghUser.email;
    if (!email) {
      try {
        const emailsResponse = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const primaryEmail = emailsResponse.data.find((e) => e.primary);
        email = primaryEmail?.email || `${ghUser.login}@github.com`;
      } catch (emailErr) {
        email = `${ghUser.login}@github.com`;
      }
    }

    // Hash dummy password to satisfy prisma required passwordHash field
    const dummyHash = await bcrypt.hash(`github-oauth-${ghUser.id}`, 12);

    const scopesResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const scopes = scopesResponse.headers.get('X-OAuth-Scopes') || '';
    req.session = req.session || {};
    req.session.tokenScopes = scopes;
    req.session.hasWriteAccess = scopes.includes('repo');

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { githubId: String(ghUser.id) },
      update: {
        githubToken: accessToken,
        name: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url,
      },
      create: {
        email,
        name: ghUser.name || ghUser.login,
        githubId: String(ghUser.id),
        githubToken: accessToken,
        avatarUrl: ghUser.avatar_url,
        passwordHash: dummyHash,
      },
    });

    const token = generateToken(user, scopes);

    // Redirect back to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/#dashboard?token=${token}`);
  } catch (err) {
    console.error('[Auth] GitHub callback error:', err);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/#login?error=github_auth_failed`);
  }
});

export default router;
