import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import aiService from '../services/ai.js';
import githubService from '../services/github.js';
import userMemoryService from '../services/userMemory.js';
import ragService from '../services/rag.js';
import personaClassifier from '../services/personaClassifier.js';
import citationVerifier from '../services/citationVerifier.js';
import localGitService from '../services/localGit.js';
import fs from 'fs/promises';
import path from 'path';

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

    // Set headers for Server-Sent Events immediately so that all subsequent errors are streamed correctly
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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

    // 1a. Detect if this is a branch merge request
    let isMergeRequest = false;
    let mergeSource = '';
    let mergeTarget = '';

    if (repoRecord) {
      try {
        const classification = await aiService.generateCompletion([
          {
            role: 'system',
            content: `Analyze the user's message and determine if they want to merge one Git branch into another.
Return a valid JSON object ONLY:
{
  "isMergeRequest": true,
  "sourceBranch": "source branch name (e.g. feature/login)",
  "targetBranch": "target branch name (e.g. main)"
}
If they don't specify the target branch, default targetBranch to "${repoRecord.defaultBranch || 'main'}".
If it is not a merge request, return {"isMergeRequest": false}.
Do not wrap it in markdown code blocks, just raw JSON.`
          },
          { role: 'user', content: message }
        ], 0.1);

        console.log(`[Chat] Merge classification result: ${classification}`);
        const parsed = JSON.parse(classification.replace(/```json|```/g, '').trim());
        if (parsed.isMergeRequest && parsed.sourceBranch && parsed.targetBranch) {
          isMergeRequest = true;
          mergeSource = parsed.sourceBranch;
          mergeTarget = parsed.targetBranch;
        }
      } catch (err) {
        console.error('[Chat] Merge classification error:', err.message);
      }
    }

    if (isMergeRequest) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      const token = user?.githubToken || process.env.GITHUB_TOKEN || null;

      // Headers already set at route entry

      res.write(`data: ${JSON.stringify({ token: `🔄 **Initiating Merge Request**\n\nAttempting to merge \`${mergeSource}\` into \`${mergeTarget}\`...\n\n` })}\n\n`);

      try {
        res.write(`data: ${JSON.stringify({ token: `Checking out branch \`${mergeTarget}\` and fetching updates...\n` })}\n\n`);
        
        const mergeResult = await localGitService.mergeBranches(
          repoRecord.id,
          repoRecord.owner,
          repoRecord.name,
          mergeSource,
          mergeTarget,
          token
        );

        if (mergeResult.success) {
          res.write(`data: ${JSON.stringify({ token: `✅ **Merge Succeeded!**\n\nNo conflicts were detected. Committing changes locally...\n` })}\n\n`);
          
          let pushed = false;
          try {
            if (token) {
              pushed = await localGitService.pushBranch(repoRecord.id, repoRecord.owner, repoRecord.name, mergeResult.actualTarget, token);
            }
          } catch (pushErr) {
            console.warn('[Chat] Push failed:', pushErr.message);
          }

          const successText = pushed
            ? `Merged \`${mergeResult.actualSource}\` into \`${mergeResult.actualTarget}\` and pushed changes to GitHub successfully!`
            : `Merged \`${mergeResult.actualSource}\` into \`${mergeResult.actualTarget}\` successfully (local only; could not push to remote due to write permissions).`;

          res.write(`data: ${JSON.stringify({ token: `\n\n${successText}` })}\n\n`);

          if (conversation) {
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: 'assistant',
                content: successText,
                metadata: JSON.stringify({
                  personaLevel: 2,
                  personaLabel: 'Git Developer'
                })
              }
            });
          }

          res.write(`data: ${JSON.stringify({ done: true, conversationId: conversation?.id, response: { text: successText } })}\n\n`);
          res.end();
          return;
        } else {
          res.write(`data: ${JSON.stringify({ token: `⚠️ **Merge Conflict Detected!**\n\nConflicts found in files:\n${mergeResult.conflicts.map(f => `- \`${f}\``).join('\n')}\n\nAnalyzing conflicts and generating resolution recommendations...\n` })}\n\n`);

          const conflictFile = mergeResult.conflicts[0];
          const repoPath = localGitService.getRepoPath(repoRecord.id);
          const fullFilePath = path.join(repoPath, conflictFile);
          
          let fileContent = '';
          try {
            fileContent = await fs.readFile(fullFilePath, 'utf8');
          } catch (readErr) {
            console.error('[Chat] Failed to read conflict file:', readErr.message);
          }

          const conflictRegex = /<<<<<<<[\s\S]*?>>>>>>>.*/;
          const match = fileContent.match(conflictRegex);
          const conflictLines = match ? match[0] : '';

          const aiResolution = await aiService.generateCompletion([
            {
              role: 'system',
              content: `You are a senior git engineer. Resolve the merge conflict in ${conflictFile} between branch ${mergeResult.actualTarget} and branch ${mergeResult.actualSource}.
Here is the conflicting section of the file:
${conflictLines}

Analyze the conflict and recommend the best merged version of this code.
Return a valid JSON object ONLY:
{
  "recommendedResolution": "complete resolved code block to replace the conflict region",
  "explanation": "clear, concise explanation of why this resolution is correct"
}
Do not wrap it in markdown code blocks, just raw JSON.`
            },
            { role: 'user', content: `Resolve this conflict.` }
          ], 0.2);

          let parsedResolution = { recommendedResolution: '', explanation: 'No recommended resolution generated.' };
          try {
            parsedResolution = JSON.parse(aiResolution.replace(/```json|```/g, '').trim());
          } catch (parseErr) {
            console.error('[Chat] Failed to parse AI resolution:', parseErr.message);
          }

          const responseText = `⚠️ **Merge Conflict Detected**: A conflict was found in **${conflictFile}** while trying to merge **${mergeResult.actualSource}** into **${mergeResult.actualTarget}**.\n\nPlease choose one of the resolution options below.`;

          const conflictResolutionMetadata = {
            conflictFile,
            conflictLines,
            branchA: mergeResult.actualTarget,
            branchB: mergeResult.actualSource,
            recommendedResolution: parsedResolution.recommendedResolution,
            explanation: parsedResolution.explanation
          };

          if (conversation) {
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: 'assistant',
                content: responseText,
                metadata: JSON.stringify({
                  personaLevel: 2,
                  personaLabel: 'Git Developer',
                  conflictResolution: conflictResolutionMetadata
                })
              }
            });
          }

          res.write(`data: ${JSON.stringify({ 
            done: true, 
            conversationId: conversation?.id,
            response: {
              text: responseText,
              conflictResolution: conflictResolutionMetadata,
              personaLevel: 2,
              personaLabel: 'Git Developer'
            }
          })}\n\n`);

          res.end();
          return;
        }
      } catch (mergeErr) {
        console.error('[Chat] Merge execution failed:', mergeErr);
        res.write(`data: ${JSON.stringify({ token: `❌ **Merge Failed**\n\nError: ${mergeErr.message}` })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true, conversationId: conversation?.id, response: { text: `Merge failed: ${mergeErr.message}` } })}\n\n`);
        res.end();
        return;
      }
    }

    // 1. Classify User Persona
    const persona = personaClassifier.classify(message, history);
    console.log(`[Chat] Classified user persona: level ${persona.level} (${persona.label})`);

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

    // Headers already set at route entry

    // Get completion stream from AI Service with persona level
    const stream = await aiService.getCompletionStream(
      message,
      unifiedContext,
      history,
      persona.level,
      repoRecord?.name || ''
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
