import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── GET /api/conversations ──────────────────────────────────
// List all conversations for the current user, grouped by date
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    const where = { userId: req.user.id };

    if (search) {
      where.title = { contains: search };
    }

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        repository: { select: { name: true, fullName: true } },
        _count: { select: { messages: true } },
      },
    });

    // Group by date
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const grouped = {
      today: [],
      week: [],
      month: [],
      older: [],
    };

    for (const conv of conversations) {
      const convDate = new Date(conv.updatedAt);
      const item = {
        id: conv.id,
        title: conv.title,
        repositoryName: conv.repository?.name || null,
        messageCount: conv._count.messages,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };

      if (convDate >= todayStart) {
        grouped.today.push(item);
      } else if (convDate >= weekAgo) {
        grouped.week.push(item);
      } else if (convDate >= monthAgo) {
        grouped.month.push(item);
      } else {
        grouped.older.push(item);
      }
    }

    res.json({ conversations: grouped });
  } catch (err) {
    console.error('[Conversations] list error:', err);
    res.status(500).json({ error: 'Failed to fetch conversations.' });
  }
});

// ── POST /api/conversations ─────────────────────────────────
// Create a new conversation
router.post('/', async (req, res) => {
  try {
    const { title, repositoryId } = req.body;

    const conversation = await prisma.conversation.create({
      data: {
        userId: req.user.id,
        repositoryId: repositoryId || null,
        title: title || 'New Conversation',
      },
    });

    res.status(201).json({ conversation });
  } catch (err) {
    console.error('[Conversations] create error:', err);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

// ── GET /api/conversations/:id ──────────────────────────────
// Get a conversation with all messages
router.get('/:id', async (req, res) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        repository: { select: { name: true, fullName: true, owner: true } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    // Parse message metadata from JSON strings
    const messages = conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      metadata: m.metadata ? JSON.parse(m.metadata) : null,
      createdAt: m.createdAt,
    }));

    res.json({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        repository: conversation.repository,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
      messages,
    });
  } catch (err) {
    console.error('[Conversations] get error:', err);
    res.status(500).json({ error: 'Failed to fetch conversation.' });
  }
});

// ── PUT /api/conversations/:id ──────────────────────────────
// Rename a conversation
router.put('/:id', async (req, res) => {
  try {
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const conversation = await prisma.conversation.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { title },
    });

    if (conversation.count === 0) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json({ message: 'Conversation renamed.', title });
  } catch (err) {
    console.error('[Conversations] rename error:', err);
    res.status(500).json({ error: 'Failed to rename conversation.' });
  }
});

// ── DELETE /api/conversations/:id ───────────────────────────
// Delete a conversation and all its messages
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await prisma.conversation.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    res.json({ message: 'Conversation deleted.' });
  } catch (err) {
    console.error('[Conversations] delete error:', err);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

export default router;
