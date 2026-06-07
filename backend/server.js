import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

// Route imports
import authRoutes from './src/routes/auth.routes.js';
import repoRoutes from './src/routes/repositories.js';
import chatRoutes from './src/routes/chat.js';
import conversationRoutes from './src/routes/conversations.js';
import activityRoutes from './src/routes/activity.js';
import kbRoutes from './src/routes/kb.js';
import githubRoutes from './src/routes/github.js';
import ingestionRoutes from './src/routes/ingestion.js';
import aiService from './src/services/ai.js';

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5001;

// ── Socket.io ──
const io = new SocketIO(httpServer, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Make io accessible in routes
app.set('io', io);

// ── Middleware ──
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting — 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ── Health Check ──
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Backend running' });
});

// ── AI Provider Connection Test ──
app.get('/api/test-ai', async (_req, res) => {
  try {
    const apiKey = process.env.TRUGEN_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(401).json({
        status: 'error',
        error: 'Neither TRUGEN_API_KEY nor GROQ_API_KEY environment variable is defined in .env'
      });
    }

    console.log('[Test-AI] Sending test ping request...');
    const result = await aiService.generateResponse('Hello');
    console.log('[Test-AI] AI connection test result:', result);

    const config = aiService._getAIConfig();
    const activeProvider = config.primary?.isGroq ? 'groq' : 'truegen';

    res.json({
      status: 'success',
      apiKeyConfigured: true,
      provider: activeProvider,
      result
    });
  } catch (err) {
    console.error('[Test-AI] Error during test connection:', err);
    res.status(500).json({
      status: 'error',
      apiKeyConfigured: !!(process.env.TRUGEN_API_KEY || process.env.GROQ_API_KEY),
      error: err.message || String(err)
    });
  }
});

// ── API Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/repos', repoRoutes);
app.use('/api/repos', ingestionRoutes);
app.use('/api/github', githubRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/kb', kbRoutes);

// ── 404 handler ──
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ── Global Error Handler ──
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// ── Start ──
httpServer.listen(PORT, () => {
  console.log(`\n  🚀 GitSense AI Backend running on http://localhost:${PORT}`);
  console.log(`  📡 Socket.io ready`);
  console.log(`  🔗 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
});

// ── Port Error Handling ──
httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ ERROR: Port ${PORT} is already in use.`);
    console.error(`\nTo kill the process using port ${PORT} on Windows, run:\n  netstat -ano | findstr :${PORT}\n  taskkill /PID <PID> /F\n`);
    process.exit(1);
  } else {
    console.error('[Server] Startup error:', err);
    process.exit(1);
  }
});

export default app;
