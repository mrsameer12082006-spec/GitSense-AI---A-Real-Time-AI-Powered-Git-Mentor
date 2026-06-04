// ─────────────────────────────────────────────────────────────
// GitSense AI — Auth Routes (Signup + Login)
// POST /api/auth/signup
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { generateToken } from '../middleware/auth.js';

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

export default router;
