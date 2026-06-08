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
router.get('/me', async (req, res) => {
  // Check if session has auth state
  if (req.session && req.session.isAuthenticated && req.session.accessToken) {
    return res.status(200).json({
      isAuthenticated: true,
      user: req.session.user,
      token: req.session.accessToken,
      hasWriteAccess: req.session.hasWriteAccess ?? false,
      scopes: req.session.tokenScopes ?? ''
    });
  }

  // Fallback to JWT authentication from header or query parameter
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    try {
      const jwt = (await import('jsonwebtoken')).default;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          githubLink: true,
          githubToken: true,
          avatarUrl: true,
          createdAt: true,
        },
      });

      if (user) {
        req.session = req.session || {};
        req.session.accessToken = user.githubToken || '';
        req.session.user = {
          id: user.id,
          login: user.name,
          name: user.name,
          avatar_url: user.avatarUrl || '',
          email: user.email
        };
        req.session.tokenScopes = decoded.githubScopes || '';
        req.session.hasWriteAccess = (decoded.githubScopes || '').includes('repo');
        req.session.isAuthenticated = true;

        return res.status(200).json({
          isAuthenticated: true,
          user: req.session.user,
          token: user.githubToken || token,
          hasWriteAccess: req.session.hasWriteAccess,
          scopes: req.session.tokenScopes
        });
      }
    } catch (err) {
      console.warn('[Auth /me] JWT validation fallback failed:', err.message);
    }
  }

  return res.status(401).json({
    isAuthenticated: false,
    user: null,
    token: null
  });
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
  const forceReauth = req.query.force_reauth === 'true' || req.query.force_reauth === '1';

  if (!clientId) {
    return res.status(500).json({ error: 'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID in .env' });
  }

  const scope = 'repo,read:user,user:email';
  let url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${encodeURIComponent(scope)}`;

  if (forceReauth) {
    url += '&prompt=consent';
    return res.redirect(url);
  }

  // If this is a direct browser navigation requesting HTML, redirect them directly
  if (req.accepts('html') && !req.xhr) {
    return res.redirect(url);
  }

  res.json({ url });
});

// ── GET /api/auth/github/callback ───────────────────────────
router.get('/github/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const dashboardUrl = `${frontendUrl}/#dashboard`;

  try {
    const { code, error } = req.query;

    if (error) {
      return res.redirect(`${dashboardUrl}?auth=error&reason=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect(`${dashboardUrl}?auth=error&reason=no_code`);
    }

    console.log('[Auth Callback] Exchanges code for access token');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      const reason = tokenData.error || 'no_token';
      console.error('[Auth Callback] Error or no token received:', tokenData);
      return res.redirect(`${dashboardUrl}?auth=error&reason=${encodeURIComponent(reason)}`);
    }

    const accessToken = tokenData.access_token;
    console.log('[Auth Callback] Token received');

    // Fetch user details
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (!userResponse.ok) {
      console.error('[Auth Callback] User profile fetch failed');
      return res.redirect(`${dashboardUrl}?auth=error&reason=user_fetch_failed`);
    }

    const githubUser = await userResponse.json();
    const scopes = userResponse.headers.get('X-OAuth-Scopes') || '';
    console.log(`[Auth Callback] GitHub user: ${githubUser.login}, scopes: ${scopes}`);

    let email = githubUser.email;
    if (!email) {
      try {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github+json'
          }
        });
        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          const primaryEmail = emails.find(e => e.primary);
          email = primaryEmail?.email || `${githubUser.login}@github.com`;
        } else {
          email = `${githubUser.login}@github.com`;
        }
      } catch (err) {
        email = `${githubUser.login}@github.com`;
      }
    }

    const dummyHash = await bcrypt.hash(`github-oauth-${githubUser.id}`, 12);
    await prisma.user.upsert({
      where: { githubId: String(githubUser.id) },
      update: {
        githubToken: accessToken,
        name: githubUser.name || githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
      create: {
        email,
        name: githubUser.name || githubUser.login,
        githubId: String(githubUser.id),
        githubToken: accessToken,
        avatarUrl: githubUser.avatar_url,
        passwordHash: dummyHash,
      },
    });

    req.session.accessToken = accessToken;
    req.session.user = {
      id: githubUser.id,
      login: githubUser.login,
      name: githubUser.name || githubUser.login,
      avatar_url: githubUser.avatar_url,
      email: email
    };
    req.session.tokenScopes = scopes;
    req.session.hasWriteAccess = scopes.includes('repo');
    req.session.isAuthenticated = true;

    req.session.save((err) => {
      if (err) {
        console.error('[Auth Callback] Session save error:', err);
        return res.redirect(`${dashboardUrl}?auth=error&reason=session_save_failed`);
      }
      console.log('[Auth Callback] Session saved successfully. Redirecting to dashboard.');
      res.redirect(`${dashboardUrl}?auth=success`);
    });

  } catch (err) {
    console.error('[Auth Callback] Critical error:', err.stack);
    res.redirect(`${dashboardUrl}?auth=error&reason=server_error`);
  }
});

export default router;
