import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import aiService from '../services/ai.js';
import repoContextService from '../services/repoContext.js';
import ragService from '../services/rag.js';
import userMemoryService from '../services/userMemory.js';
import webSearchService from '../services/webSearch.js';

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

    // Get conversation history (prior to saving the new message to prevent duplication)
    let history = [];
    if (conversation) {
      try {
        const historyMessages = await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'asc' },
          take: 30, // Retrieve up to last 30 messages for conversation memory (Problem 2)
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

    // Save user message (after history query)
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

    // 1. Build repository context (Priority 1)
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

    // 2. Retrieve PDF Knowledge Base context (RAG - Priority 2)
    let kbContext = '';
    try {
      const relevantChunks = await ragService.retrieveRelevantChunks(message, 4);
      kbContext = ragService.formatChunksForContext(relevantChunks);
    } catch (ragErr) {
      console.error('[Chat] Failed to retrieve RAG chunks:', ragErr.message);
    }

    // 3. Retrieve Cross-Conversation & Repo-Specific Memories (Priority 3)
    let crossConvMemory = '';
    let repoMemory = '';
    try {
      crossConvMemory = await userMemoryService.buildCrossConversationContext(req.user.id, conversation?.id);
      if (repoRecord) {
        repoMemory = await userMemoryService.buildRepositoryMemoryContext(req.user.id, repoRecord.id);
      }
    } catch (memErr) {
      console.error('[Chat] Failed to build memory contexts:', memErr.message);
    }

    // 4. Retrieve Web Search Fallback (Priority 5)
    let webSearchContext = '';
    const lowerMsg = message.toLowerCase();
    const isGeneralGitQuery = 
      lowerMsg.includes('how to') || 
      lowerMsg.includes('explain') || 
      lowerMsg.includes('error') || 
      lowerMsg.includes('what is') ||
      lowerMsg.includes('documentation') ||
      lowerMsg.includes('git ') ||
      lowerMsg.includes('github ');

    // Perform web search fallback only if we lack connected repository or PDF documentation details
    if (isGeneralGitQuery && !kbContext && !repoRecord) {
      try {
        const searchResults = await webSearchService.search(`${message} git documentation`);
        webSearchContext = webSearchService.formatResultsForContext(searchResults);
      } catch (searchErr) {
        console.error('[Chat] Web search failed:', searchErr.message);
      }
    }

    // 5. Assemble Context Pipeline in Strict Priority Order (Problem 11 & 6)
    let unifiedContext = '';
    
    // Priority 1: Current repository context
    unifiedContext += `## 1. CURRENT REPOSITORY CONTEXT (Priority 1):\n`;
    if (repoRecord) {
      unifiedContext += `${repoContext || 'Repository connection is active, but live metadata is currently loading.'}\n\n`;
    } else {
      unifiedContext += `No connected repository. Answer based on general Git knowledge.\n\n`;
    }

    // Priority 2: Uploaded PDFs / Knowledge Base (RAG)
    if (kbContext) {
      unifiedContext += `## 2. KNOWLEDGE BASE REFERENCE (RAG - Priority 2):\n${kbContext}\n`;
    }

    // Priority 3: Previous conversations & memories
    if (repoMemory || crossConvMemory) {
      unifiedContext += `## 3. CONVERSATION & USER MEMORIES (Priority 3):\n`;
      if (repoMemory) unifiedContext += repoMemory;
      if (crossConvMemory) unifiedContext += crossConvMemory;
      unifiedContext += '\n';
    }

    // Priority 5: Web search fallback
    if (webSearchContext) {
      unifiedContext += `## 4. WEB SEARCH FALLBACK (Priority 5):\n${webSearchContext}\n`;
    }

    // Generate AI response
    console.log(`[Chat] Assembled Context Length: ${unifiedContext.length} chars. History Length: ${history.length}.`);
    const aiResponse = await aiService.generateResponse(message, unifiedContext, history);
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
        if (aiResponse.conflictResolution) metadata.conflictResolution = aiResponse.conflictResolution;

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
        conflictResolution: aiResponse.conflictResolution,
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
