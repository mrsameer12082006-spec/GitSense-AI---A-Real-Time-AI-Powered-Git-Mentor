import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import aiService from '../services/ai.js';
import githubService from '../services/github.js';
import userMemoryService from '../services/userMemory.js';
import ragService from '../services/rag.js';
import personaClassifier from '../services/personaClassifier.js';
import citationVerifier from '../services/citationVerifier.js';
import styleDetector from '../services/styleDetector.js';
import repoContextBuilder from '../services/repoContextBuilder.js';
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

    // 1. Classify User Persona
    const persona = personaClassifier.classify(message, history);
    console.log(`[Chat] Classified user persona: level ${persona.level} (${persona.label})`);

    // 1b. Detect communication style from last 3 user messages
    let styleInstruction = '';
    try {
      const userMessages = history
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .slice(-3);
      userMessages.push(message); // Include current message
      const recentMessages = userMessages.slice(-3);
      const styleProfile = styleDetector.detectStyle(recentMessages);
      styleInstruction = styleDetector.buildStyleInstruction(styleProfile);
      if (styleInstruction) {
        console.log(`[Chat] Style detected — hinglish: ${styleProfile.hinglish}, casual: ${styleProfile.casual}, technical: ${styleProfile.technical}, emoji: ${styleProfile.emojiHeavy}, length: ${styleProfile.lengthPreference}`);
      }
    } catch (err) {
      console.error('[Chat] Style detection failed (non-fatal):', err.message);
    }

    // 2. Expand query & Retrieve Repository Chunks using Vector Store
    let repoContext = '';
    let relevantChunks = [];
    if (repoRecord) {
      try {
        relevantChunks = await ragService.retrieveWithExpansion(message, repoRecord.id);
        repoContext = ragService.formatChunksForContext(relevantChunks);
      } catch (err) {
        console.error('[Chat] Failed to retrieve repository chunks:', err.message);
        repoContext = `Repository: ${repoRecord.fullName} (context unavailable)`;
      }
    }

    // Build unified context
    let unifiedContext = ``;
    if (repoRecord) {
      unifiedContext += `${repoContext}\n\n`;
    } else {
      unifiedContext += `No connected repository. Answer based on general Git knowledge.\n\n`;
    }

    // 2b. Deep repository context (file tree + configs + source files)
    if (repoRecord) {
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const deepContext = await repoContextBuilder.buildDeepContext(
          { owner: repoRecord.owner, name: repoRecord.name, defaultBranch: repoRecord.defaultBranch, id: repoRecord.id },
          user?.githubToken || null
        );
        if (deepContext) {
          unifiedContext += `\n${deepContext}\n\n`;
        }
      } catch (err) {
        console.error('[Chat] Deep context build failed (non-fatal):', err.message);
      }
    }

    // 2c. Live file fetch for mentioned files
    if (repoRecord) {
      try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
        const liveFileContext = await repoContextBuilder.fetchMentionedFiles(
          message, unifiedContext,
          { owner: repoRecord.owner, name: repoRecord.name },
          user?.githubToken || null
        );
        if (liveFileContext) {
          unifiedContext += liveFileContext + '\n\n';
        }
      } catch (err) {
        console.error('[Chat] Live file fetch failed (non-fatal):', err.message);
      }
    }

    // 2d. Web search for external library/framework questions
    try {
      const searchQuery = repoContextBuilder.detectExternalQuery(message, unifiedContext);
      if (searchQuery) {
        console.log(`[Chat] External query detected, searching: "${searchQuery}"`);
        const searchResults = await webSearchService.search(searchQuery);
        const searchContext = webSearchService.formatResultsForContext(searchResults);
        if (searchContext) {
          unifiedContext += `\n${searchContext}\n`;
        }
      }
    } catch (err) {
      console.error('[Chat] Web search failed (non-fatal):', err.message);
    }

    // Add Past Conversation Memory if any
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
      unifiedContext += `### PAST CONVERSATION MEMORY:\n`;
      if (crossConversationContext) unifiedContext += crossConversationContext;
      if (repositoryMemoryContext) unifiedContext += repositoryMemoryContext;
      unifiedContext += `\n`;
    }

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get completion stream from AI Service with persona level and style instruction
    const stream = await aiService.getCompletionStream(
      message,
      unifiedContext,
      history,
      persona.level,
      repoRecord?.name || '',
      styleInstruction
    );

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

        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine || cleanLine === 'data: [DONE]') continue;
          if (cleanLine.startsWith('data: ')) {
            try {
              const parsedData = JSON.parse(cleanLine.substring(6));
              const delta = parsedData.choices?.[0]?.delta?.content || '';
              
              aiCompletionText += delta;
              
              const currentFullText = extractTextFromPartialJson(aiCompletionText);
              if (currentFullText.length > lastSentText.length) {
                const tokenToSend = currentFullText.substring(lastSentText.length);
                res.write(`data: ${JSON.stringify({ token: tokenToSend })}\n\n`);
                lastSentText = currentFullText;
              }
            } catch (err) {
              // Ignore line parsing errors
            }
          }
        }
      }
    }

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

    // Extract complete JSON object
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

    if (!parsedAI || typeof parsedAI !== 'object' || !parsedAI.text || !parsedAI.text.trim()) {
      const fallbackText = extractTextFromPartialJson(aiCompletionText);
      parsedAI = {
        ...parsedAI,
        text: fallbackText || aiCompletionText || 'I apologize, I could not generate a response.'
      };
    }

    // 3. Post-Process: Citation Verification against retrieved chunks
    if (relevantChunks.length > 0) {
      try {
        const verification = citationVerifier.verify(parsedAI.text, relevantChunks);
        parsedAI.text = verification.verifiedText;
        if (!verification.isClean) {
          console.log('[Chat] Citation verifier flagged and modified references:', verification.flaggedItems);
        }
      } catch (err) {
        console.error('[Chat] Citation verification failed:', err.message);
      }
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
      const metadata = {
        personaLevel: persona.level,
        personaLabel: persona.label
      };
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
        personaLevel: persona.level,
        personaLabel: persona.label
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
