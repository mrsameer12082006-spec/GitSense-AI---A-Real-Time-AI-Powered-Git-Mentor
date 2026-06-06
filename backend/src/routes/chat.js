import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import aiService from '../services/ai.js';
import repoContextService from '../services/repoContext.js';
import githubService from '../services/github.js';
import userMemoryService from '../services/userMemory.js';
import ragService from '../services/rag.js';
import webSearchService from '../services/webSearch.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

// ── POST /api/chat ──────────────────────────────────────────
// Send a message and get an AI response streamed via SSE
router.post('/', async (req, res) => {
  try {
    const { message, conversationId, repositoryId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    console.log(`[Chat] Streaming request - User ID: ${req.user.id}, Repo ID: ${repositoryId || 'none'}`);

    // Get repository
    let repoRecord = null;
    if (repositoryId) {
      repoRecord = await prisma.repository.findFirst({
        where: { id: repositoryId, userId: req.user.id },
      });
    } else {
      repoRecord = await prisma.repository.findFirst({
        where: { userId: req.user.id, isConnected: true },
      });
    }

    // Get or create conversation
    let conversation = null;
    if (conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: req.user.id },
      });
    } else {
      conversation = await prisma.conversation.create({
        data: {
          userId: req.user.id,
          repositoryId: repoRecord?.id || null,
          title: 'New Conversation',
        },
      });
    }

    // Get conversation history
    let history = [];
    if (conversation) {
      const historyMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 30,
      });
      history = historyMessages.map((m) => ({
        role: m.role,
        content: m.content,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
      }));
    }

    // Save user message
    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message,
        },
      });
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

    // Build unified context (Priority order)
    let unifiedContext = `## 1. CURRENT REPOSITORY CONTEXT:\n`;
    if (repoRecord) {
      unifiedContext += `${repoContext || 'Repository connection is active, but live metadata is loading.'}\n\n`;
    } else {
      unifiedContext += `No connected repository. Answer based on general Git knowledge.\n\n`;
    }

    // 2. Add User Memory Context (Phase 4)
    let crossConversationContext = '';
    let repositoryMemoryContext = '';
    try {
      crossConversationContext = await userMemoryService.buildCrossConversationContext(req.user.id, conversation?.id);
      if (repoRecord) {
        repositoryMemoryContext = await userMemoryService.buildRepositoryMemoryContext(req.user.id, repoRecord.id);
      }
    } catch (err) {
      console.error('[Chat] Failed to build user memory context:', err.message);
    }

    if (crossConversationContext || repositoryMemoryContext) {
      unifiedContext += `## 2. PAST CONVERSATION MEMORY:\n`;
      if (crossConversationContext) unifiedContext += crossConversationContext;
      if (repositoryMemoryContext) unifiedContext += repositoryMemoryContext;
      unifiedContext += `\n`;
    }

    // 3. Add RAG Context (Phase 4)
    let ragContext = '';
    try {
      const relevantChunks = await ragService.retrieveRelevantChunks(message, 3);
      ragContext = ragService.formatChunksForContext(relevantChunks);
    } catch (err) {
      console.error('[Chat] Failed to retrieve RAG chunks:', err.message);
    }

    if (ragContext) {
      unifiedContext += `## 3. PDF KNOWLEDGE BASE CONTEXT:\n${ragContext}\n`;
    }

    // 4. Add Web Search fallback context (Phase 4)
    let webSearchContext = '';
    const queryLower = message.toLowerCase();
    const shouldSearch = !repoRecord || queryLower.includes('how') || queryLower.includes('why') || queryLower.includes('error') || queryLower.includes('failed') || queryLower.includes('git') || queryLower.includes('github') || queryLower.includes('setup') || queryLower.includes('config');
    if (shouldSearch) {
      try {
        const searchResults = await webSearchService.search(message);
        webSearchContext = webSearchService.formatResultsForContext(searchResults);
      } catch (err) {
        console.error('[Chat] Web search failed:', err.message);
      }
    }

    if (webSearchContext) {
      unifiedContext += `## 4. WEB SEARCH FALLBACK CONTEXT:\n${webSearchContext}\n`;
    }

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get completion stream from AI Service
    const stream = await aiService.getCompletionStream(message, unifiedContext, history);

    // Read and pipe the stream to res
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let streamBuffer = '';
    let aiCompletionText = '';
    let done = false;

    // Helper to unescape JSON properties manually during streaming
    function extractTextFromPartialJson(buffer) {
      const textKey = '"text"';
      const startIdx = buffer.indexOf(textKey);
      if (startIdx === -1) return '';
      
      const colonIdx = buffer.indexOf(':', startIdx + textKey.length);
      if (colonIdx === -1) return '';
      
      const firstQuoteIdx = buffer.indexOf('"', colonIdx + 1);
      if (firstQuoteIdx === -1) return '';
      
      let endQuoteIdx = -1;
      for (let i = firstQuoteIdx + 1; i < buffer.length; i++) {
        if (buffer[i] === '"' && buffer[i - 1] !== '\\') {
          endQuoteIdx = i;
          break;
        }
      }
      
      const rawVal = endQuoteIdx === -1 
        ? buffer.substring(firstQuoteIdx + 1)
        : buffer.substring(firstQuoteIdx + 1, endQuoteIdx);
        
      try {
        return JSON.parse(`"${rawVal.endsWith('\\') ? rawVal.slice(0, -1) : rawVal}"`);
      } catch {
        return rawVal
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }

    let lastSentText = '';

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        const chunk = decoder.decode(value, { stream: !done });
        streamBuffer += chunk;

        // Extract raw JSON stream tokens (data: {...})
        const lines = streamBuffer.split('\n');
        // Keep the last incomplete line in streamBuffer
        streamBuffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine === 'data: [DONE]') continue;
          if (cleanLine.startsWith('data: ')) {
            try {
              const parsedData = JSON.parse(cleanLine.substring(6));
              const delta = parsedData.choices?.[0]?.delta?.content || '';
              
              // Accumulate raw completion buffer
              aiCompletionText += delta;
              
              // Extract current mapped "text" property
              const currentFullText = extractTextFromPartialJson(aiCompletionText);
              if (currentFullText.length > lastSentText.length) {
                const tokenToSend = currentFullText.substring(lastSentText.length);
                res.write(`data: ${JSON.stringify({ token: tokenToSend })}\n\n`);
                lastSentText = currentFullText;
              }
            } catch (err) {
              // Ignore line parsing errors on incomplete buffers
            }
          }
        }
      }
    }

    // Process remainder of streamBuffer if any
    const finalLines = streamBuffer.split('\n');
    for (const line of finalLines) {
      const cleanLine = line.trim();
      if (cleanLine.startsWith('data: ')) {
        try {
          const parsedData = JSON.parse(cleanLine.substring(6));
          aiCompletionText += parsedData.choices?.[0]?.delta?.content || '';
        } catch {}
      } else {
        aiCompletionText += line;
      }
    }

    // Extract complete JSON object from the fully accumulated completion
    let parsedAI = { text: 'I apologize, I could not generate a response.' };
    try {
      parsedAI = JSON.parse(aiCompletionText);
    } catch {
      const textVal = extractTextFromPartialJson(aiCompletionText);
      if (textVal) {
        parsedAI = { text: textVal };
      } else {
        parsedAI = { text: aiCompletionText };
      }
    }

    // Fallback if parsedAI.text is empty or undefined/null
    if (!parsedAI || typeof parsedAI !== 'object' || !parsedAI.text || !parsedAI.text.trim()) {
      const fallbackText = extractTextFromPartialJson(aiCompletionText);
      parsedAI = {
        ...parsedAI,
        text: fallbackText || aiCompletionText || 'I apologize, I could not generate a response.'
      };
    }

    // Fetch repository issues (Self-diagnosis)
    let diagnosedIssue = null;
    if (repoRecord) {
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const healthDetails = await githubService.getRepoHealth(
          repoRecord.owner,
          repoRecord.name,
          user.githubToken
        );
        if (healthDetails.issues && healthDetails.issues.length > 0) {
          const firstIssue = healthDetails.issues[0];
          diagnosedIssue = {
            id: firstIssue.id,
            title: firstIssue.title,
            description: firstIssue.description,
            severity: firstIssue.severity,
            command: firstIssue.command,
            fixAction: firstIssue.fixAction,
          };
        }
      } catch (healthErr) {
        console.error('[Chat] Health diagnosis error:', healthErr);
      }
    }

    // Save AI response in database
    if (conversation) {
      const metadata = {};
      if (parsedAI.insight) metadata.insight = parsedAI.insight;
      if (parsedAI.recommendation) metadata.recommendation = parsedAI.recommendation;
      if (parsedAI.codeBlock) metadata.codeBlock = parsedAI.codeBlock;
      if (parsedAI.commandBlock) metadata.commandBlock = parsedAI.commandBlock;
      if (parsedAI.diff) metadata.diff = parsedAI.diff;
      if (parsedAI.conflictResolution) metadata.conflictResolution = parsedAI.conflictResolution;
      if (diagnosedIssue) metadata.diagnosedIssue = diagnosedIssue;

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: parsedAI.text,
          metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        },
      });

      // Update title if new conversation
      if (!conversationId) {
        try {
          const title = await aiService.generateTitle(message);
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { title },
          });
        } catch {}
      }

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    // Send final event with complete parsed metadata and diagnosis issue
    res.write(`data: ${JSON.stringify({ 
      done: true, 
      conversationId: conversation?.id,
      response: {
        text: parsedAI.text,
        insight: parsedAI.insight,
        recommendation: parsedAI.recommendation,
        codeBlock: parsedAI.codeBlock,
        commandBlock: parsedAI.commandBlock,
        diff: parsedAI.diff,
        conflictResolution: parsedAI.conflictResolution,
        diagnosedIssue,
      }
    })}\n\n`);

    res.end();
  } catch (err) {
    console.error('[Chat] Unhandled streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'Streaming failed.' })}\n\n`);
    res.end();
  }
});

export default router;
