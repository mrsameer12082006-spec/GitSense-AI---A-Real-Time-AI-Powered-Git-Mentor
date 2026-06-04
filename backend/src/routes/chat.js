import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import aiService from '../services/ai.js';
import repoContextService from '../services/repoContext.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── POST /api/chat ──────────────────────────────────────────
// Send a message and get an AI response
router.post('/', async (req, res) => {
  try {
    const { message, conversationId, repositoryId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    console.log(`[Chat] Incoming request - User ID: ${req.user.id}, Repo ID: ${repositoryId || 'none'}, Message: "${message}"`);

    // Get user's connected repository
    let repoRecord = null;
    try {
      if (repositoryId) {
        repoRecord = await prisma.repository.findFirst({
          where: { id: repositoryId, userId: req.user.id },
        });
      } else {
        repoRecord = await prisma.repository.findFirst({
          where: { userId: req.user.id, isConnected: true },
        });
      }
    } catch (dbErr) {
      console.error('[Chat] DB error fetching repository:', dbErr.message);
    }

    // Get or create conversation
    let conversation = null;
    let tempConvId = conversationId || `temp-${Date.now()}`;
    let tempConvTitle = 'New Conversation';

    try {
      if (conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, userId: req.user.id },
        });
      } else {
        // Create a new conversation
        conversation = await prisma.conversation.create({
          data: {
            userId: req.user.id,
            repositoryId: repoRecord?.id || null,
            title: 'New Conversation',
          },
        });
      }
      if (conversation) {
        tempConvId = conversation.id;
        tempConvTitle = conversation.title;
      }
    } catch (dbErr) {
      console.error('[Chat] DB error getting/creating conversation:', dbErr.message);
    }

    // Save user message
    if (conversation) {
      try {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'user',
            content: message,
          },
        });
      } catch (dbErr) {
        console.error('[Chat] DB error saving user message:', dbErr.message);
      }
    }

    // Build repository context
    let repoContext = '';
    if (repoRecord) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const token = user?.githubToken || null;

      try {
        repoContext = await repoContextService.buildContext(
          { owner: repoRecord.owner, name: repoRecord.name },
          token
        );
      } catch (err) {
        console.error('[Chat] Failed to build repo context:', err.message);
        repoContext = `Repository: ${repoRecord.fullName} (context unavailable)`;
      }
    }

    // Get conversation history
    let history = [];
    if (conversation) {
      try {
        const historyMessages = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 20, // Last 20 messages
        });
        history = historyMessages.map((m) => ({
          role: m.role,
          content: m.content,
          metadata: m.metadata ? JSON.parse(m.metadata) : null,
        }));
      } catch (dbErr) {
        console.error('[Chat] DB error fetching history:', dbErr.message);
      }
    }

    // Generate AI response
    console.log(`[Chat] Querying AI service with history length: ${history.length}...`);
    const aiResponse = await aiService.generateResponse(message, repoContext, history);
    console.log('[Chat] AI response received:', JSON.stringify(aiResponse).substring(0, 100) + '...');

    // Save AI response
    if (conversation) {
      try {
        const metadata = {};
        if (aiResponse.insight) metadata.insight = aiResponse.insight;
        if (aiResponse.recommendation) metadata.recommendation = aiResponse.recommendation;
        if (aiResponse.codeBlock) metadata.codeBlock = aiResponse.codeBlock;
        if (aiResponse.commandBlock) metadata.commandBlock = aiResponse.commandBlock;
        if (aiResponse.diff) metadata.diff = aiResponse.diff;

        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse.text,
            metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
          },
        });

        // Auto-generate title for new conversations (first message)
        if (!conversationId) {
          try {
            const title = await aiService.generateTitle(message);
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: { title },
            });
            tempConvTitle = title;
          } catch (titleErr) {
            console.error('[Chat] Failed to generate conversation title:', titleErr.message);
          }
        }

        // Update conversation timestamp
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });
      } catch (dbErr) {
        console.error('[Chat] DB error saving AI response/updating conversation:', dbErr.message);
      }
    }

    res.json({
      conversationId: tempConvId,
      conversationTitle: tempConvTitle,
      response: {
        sender: 'ai',
        text: aiResponse.text,
        insight: aiResponse.insight,
        recommendation: aiResponse.recommendation,
        codeBlock: aiResponse.codeBlock,
        commandBlock: aiResponse.commandBlock,
        diff: aiResponse.diff,
      },
    });
  } catch (err) {
    console.error('[Chat] Unhandled server error in POST /api/chat:', err);
    res.status(500).json({ 
      error: err.message || 'Internal server error processing message.',
      details: String(err)
    });
  }
});

export default router;
