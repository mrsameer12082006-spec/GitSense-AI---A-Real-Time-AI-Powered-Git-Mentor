import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import buildRepoContext from '../utils/buildRepoContext.js';
import userMemoryService from '../services/userMemory.js';
import selfImprovementService from '../services/selfImprovement.js';
import styleDetector from '../services/styleDetector.js';
import aiService from '../services/ai.js';
import embeddingService from '../services/embedding.js';
import { diagnoseGitError } from '../utils/gitErrorDetector.js';

const router = Router();
const prisma = new PrismaClient();

// Apply auth middleware to protect this route
router.use(authenticate);

// Helper keywords for classifying repository-specific questions
const REPO_KEYWORDS = [
  'repo', 'repository', 'branch', 'branches', 'commit', 'commits', 
  'issue', 'issues', 'pull request', 'pull requests', 'pr ', 'prs',
  'codebase', 'file', 'files', 'directory', 'folder', 'git status',
  'git log', 'git diff', 'changes', 'latest', 'recent', 'who wrote',
  'contributor', 'contributors', 'who made', 'readme', 'package.json',
  'what is this', 'about this', 'tell me about', 'describe', 'overview',
  'code', 'content', 'inside', 'structure', 'what does', 'how does',
  'explain this', 'whats in', 'what\'s in', 'tech stack', 'dependencies',
  'features', 'purpose', 'functionality'
];

const NEGATIVE_FEEDBACK_PHRASES = [
  "no that's wrong", "you didn't answer", "bhai yeh nahi pooch raha tha",
  "tu samjha nahi", "wrong answer", "incorrect", "that is wrong", "not what i asked",
  "not what i wanted", "that's wrong", "you did not answer", "tu samjha nahi bhai"
];

const SUCCESS_FEEDBACK_PHRASES = [
  "perfect", "exactly", "yes that's it", "bilkul sahi", "exactly right", "spot on"
];

function isRepoSpecificQuery(message) {
  const msg = message.toLowerCase().trim();
  return REPO_KEYWORDS.some(keyword => msg.includes(keyword));
}

function isCasualQuery(message) {
  const msg = message.toLowerCase().trim();
  
  // Greetings / Small Talk
  const casualGreetings = /^(hi|hello|hey|yo|greetings|good\s+morning|good\s+afternoon|good\s+evening|sup|what's\s+up|whats\s+up|hola|howdy|hello\s+there)([\s.!?].*)?$/i;
  
  // Acknowledgements & Enders
  const acknowledgements = /^(ok|okay|nothing|nvm|nevermind|never\s+mind|cool|thanks|thank\s+you|awesome|got\s+it|sure|yes|no|perfect|great|bye|goodbye|talk\s+later)([\s.!?].*)?$/i;

  if (casualGreetings.test(msg) || acknowledgements.test(msg)) {
    return true;
  }

  // Very short query without repo keywords is likely casual noise
  if (msg.length < 4 && !isRepoSpecificQuery(msg)) {
    return true;
  }

  return false;
}

function isFailureSignal(msg) {
  const clean = msg.toLowerCase();
  return NEGATIVE_FEEDBACK_PHRASES.some(phrase => clean.includes(phrase));
}

function isSuccessSignal(msg) {
  const clean = msg.toLowerCase();
  return SUCCESS_FEEDBACK_PHRASES.some(phrase => clean.includes(phrase));
}

function getSimilarity(s1, s2) {
  const clean1 = s1.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const clean2 = s2.toLowerCase().replace(/[^\w\s]/g, '').trim();
  if (clean1 === clean2) return 1.0;
  
  const words1 = clean1.split(/\s+/).filter(Boolean);
  const words2 = clean2.split(/\s+/).filter(Boolean);
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

// POST /api/chat - AI Chat endpoint
router.post('/', async (req, res) => {
  const { message, repoOwner, repoName, conversationId } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const hasConnectedRepo = !!(repoOwner && repoName);

  // If no repository is connected, block only if they ask a repo-specific question
  if (!hasConnectedRepo) {
    if (isRepoSpecificQuery(message)) {
      return res.status(400).json({
        error: 'NO_REPO_SELECTED',
        message: 'Please connect a repository first.'
      });
    }
  }

  // Check user feedback signals or repeated questions BEFORE message logging
  let isRepeated = false;
  let isFailure = false;
  let isSuccess = false;
  let finalConversationId = conversationId;

  let chatHistory = [];
  if (finalConversationId) {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId: finalConversationId },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      messages.reverse();
      chatHistory = messages;

      const userMsgs = chatHistory.filter(m => m.role === 'user');
      const assistantMsgs = chatHistory.filter(m => m.role === 'assistant');
      const lastUserMsg = userMsgs[userMsgs.length - 1];
      const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];

      if (lastUserMsg && lastAssistantMsg) {
        // Check repeated question (semantic similarity > 0.8)
        const similarity = getSimilarity(message, lastUserMsg.content);
        if (similarity > 0.8) {
          isRepeated = true;
        }

        // Check explicit failure signal
        if (isFailureSignal(message)) {
          isFailure = true;
        }

        // Check success signal
        if (isSuccessSignal(message)) {
          isSuccess = true;
        }

        // Action on failure/repeated signals
        if (isRepeated || isFailure) {
          await selfImprovementService.logSignal(finalConversationId, 'failure', {
            userMessage: lastUserMsg.content,
            aiResponse: lastAssistantMsg.content
          });

          if (isFailure) {
            const rule = await selfImprovementService.extractCorrectionRule(
              lastUserMsg.content,
              lastAssistantMsg.content,
              message
            );
            req.session.sessionCorrections = req.session.sessionCorrections || [];
            req.session.sessionCorrections.push(rule);
            console.log('[Chat] Added correction rule for current session:', rule);
          }
        } else if (isSuccess) {
          await selfImprovementService.logSignal(finalConversationId, 'success', {
            userMessage: lastUserMsg.content,
            aiResponse: lastAssistantMsg.content
          });
        }
      }
    } catch (err) {
      console.error('[Chat] Error checking signals and loading history:', err.message);
    }
  }

  // Retrieve user's GitHub OAuth Token from DB
  let token = null;
  if (hasConnectedRepo) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { githubToken: true }
      });
      token = user?.githubToken;
    } catch (err) {
      console.error('[Chat] Database error fetching user token:', err.message);
    }
  }

  // Safe fetch helper
  async function safeFetchJson(url, headers, defaultValue = {}) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        console.warn(`[Chat] Fetch to ${url} failed with status ${response.status}`);
        return defaultValue;
      }
      return await response.json();
    } catch (err) {
      console.warn(`[Chat] Fetch to ${url} error:`, err.message);
      return defaultValue;
    }
  }

  // Step 1: Fetch repo data ONLY if repo is connected AND query is NOT casual
  let repoMeta = {};
  let branches = [];
  let commits = [];
  let issues = [];
  let repoContext = '';

  const isCasual = isCasualQuery(message);
  const shouldFetchRepo = hasConnectedRepo && !isCasual;

  if (shouldFetchRepo) {
    try {
      const headers = {
        Accept: 'application/vnd.github+json'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const base = `https://api.github.com/repos/${repoOwner}/${repoName}`;

      const [metaRes, branchRes, commitRes, issueRes] = await Promise.all([
        safeFetchJson(base, headers, {}),
        safeFetchJson(`${base}/branches?per_page=10`, headers, []),
        safeFetchJson(`${base}/commits?per_page=7`, headers, []),
        safeFetchJson(`${base}/issues?state=open&per_page=7`, headers, [])
      ]);

      repoMeta = metaRes;
      branches = branchRes;
      commits = commitRes;
      issues = issueRes;

      const repoData = {
        owner: repoOwner,
        name: repoName,
        description: repoMeta.description,
        language: repoMeta.language,
        default_branch: repoMeta.default_branch,
        stargazers_count: repoMeta.stargazers_count,
        forks_count: repoMeta.forks_count,
        open_issues_count: repoMeta.open_issues_count,
        branches,
        recent_commits: commits,
        open_issues: issues
      };

      repoContext = buildRepoContext(repoData);
    } catch (err) {
      console.error('[Chat] GitHub data fetch error:', err.message);
    }
  }

  // Step 2: ChatGPT-Style Tone/Style Mirroring
  let detectedStyle = req.session.detectedStyle || null;
  try {
    let currentMsgCount = 1;
    if (finalConversationId) {
      const dbMsgCount = await prisma.message.count({
        where: { conversationId: finalConversationId, role: 'user' }
      });
      currentMsgCount = dbMsgCount + 1;
    }

    if (!detectedStyle || currentMsgCount % 3 === 0) {
      let messagesToAnalyze = [message];
      if (finalConversationId) {
        const pastUserMsgs = await prisma.message.findMany({
          where: { conversationId: finalConversationId, role: 'user' },
          orderBy: { createdAt: 'desc' },
          take: 2,
          select: { content: true }
        });
        messagesToAnalyze = [message, ...pastUserMsgs.map(m => m.content)].slice(0, 3);
      }
      detectedStyle = styleDetector.detectStyle(messagesToAnalyze);
      req.session.detectedStyle = detectedStyle;
      console.log('[Chat] Updated detected communication style:', detectedStyle);
    }
  } catch (err) {
    console.error('[Chat] Style detection failed (non-fatal):', err.message);
  }

  const styleInstruction = detectedStyle
    ? styleDetector.buildStyleInstruction(detectedStyle)
    : '';

  // Step 3: Fetch persistent memory profile
  let memoryProfileText = '';
  try {
    const userMemory = await userMemoryService.getUserMemory(req.user.id);
    if (userMemory) {
      memoryProfileText = `\n\n### USER PROFILE & PERSISTENT MEMORY
The user you are interacting with has the following profile and preferences:
- Skill Level: ${userMemory.skillLevel || 'intermediate'}
- Communication Preference: Language: ${userMemory.communicationStyle?.preferredLanguage || 'English'}, Tone: ${userMemory.communicationStyle?.tone || 'casual'}
- Technical Preferences: 
  * Languages: ${(userMemory.technicalProfile?.languages || []).join(', ') || 'None identified yet'}
  * Frameworks: ${(userMemory.technicalProfile?.frameworks || []).join(', ') || 'None identified yet'}
  * Coding Style: ${(userMemory.technicalProfile?.codingStyle || []).join(', ') || 'None identified yet'}
- Common Problems Faced: ${(userMemory.preferences || []).join(', ') || 'None identified yet'}
- Explicit Corrections/Lessons Taught: ${(userMemory.corrections || []).map(c => `"${c}"`).join(', ') || 'None'}`;
    }
  } catch (err) {
    console.error('[Chat] Failed to build memory context:', err.message);
  }

  // Step 4: Fetch active global prompt patches
  let patchesText = '';
  try {
    const patches = selfImprovementService.getAppliedPatches();
    if (patches && patches.length > 0) {
      patchesText = `\n\n### CONTINUOUS SELF-IMPROVEMENT GUIDELINES
You must adhere to these additional instructions generated from analyzing previous failures:
${patches.map((p, idx) => `${idx + 1}. ${p.patch}`).join('\n')}`;
    }
  } catch (err) {
    console.error('[Chat] Failed to get prompt patches:', err.message);
  }

  // Step 5: Session-specific corrections
  let sessionCorrectionsText = '';
  if (req.session.sessionCorrections && req.session.sessionCorrections.length > 0) {
    sessionCorrectionsText = `\n\n### SESSION CORRECTION RULES
You MUST follow these immediate correction rules based on your mistakes in this session:
${req.session.sessionCorrections.map((r, idx) => `- ${r}`).join('\n')}`;
  }

  // Fetch repository metadata & realIssues from DB
  let realIssues = [];
  if (hasConnectedRepo) {
    try {
      const dbRepo = await prisma.repository.findFirst({
        where: { owner: repoOwner, name: repoName, userId: req.user.id }
      });
      if (dbRepo && dbRepo.metadata) {
        const metaObj = JSON.parse(dbRepo.metadata);
        if (metaObj && Array.isArray(metaObj.realIssues)) {
          realIssues = metaObj.realIssues;
        }
      }
    } catch (err) {
      console.error('[Chat] Failed to fetch repo metadata from DB:', err.message);
    }
  }

  // Build appropriate base system prompt
  let systemPrompt = '';

  if (!hasConnectedRepo) {
    // Prompt for when NO repo is connected
    systemPrompt = `You are GitSense AI, an intelligent GitHub repository assistant. 
Currently, no repository is connected. You can answer general developer and Git questions, greet the user, or have normal conversations. 
Always reply naturally and casually as a friendly human developer assistant. 
If the user asks questions about their specific repository branches, commits, or issues, politely advise them to connect or import a repository first using the panel on the left.`;
  } else if (isCasual) {
    // Prompt for connected repo, but message is casual
    systemPrompt = `You are GitSense AI, an intelligent GitHub repository assistant. 
A repository (${repoOwner}/${repoName}) is connected to this workspace, but the user is currently just greeting you, making small talk, or acknowledging a message (e.g., "hello", "hey", "ok", "thanks").
Respond naturally, casually, and briefly as a human developer assistant. Do NOT output or list repository branches, commits, or issues in your response unless specifically asked.`;
  } else {
    // Prompt for connected repo, and message is repo-specific or a general developer query
    const language = repoMeta.language || 'Unknown';
    systemPrompt = `You are GitSense AI, an expert GitHub repository assistant.
You have been provided complete, live data for the repository ${repoOwner}/${repoName} below.

CRITICAL RULES — follow these without exception:
1. NEVER say you don't have repository data. You do. It is provided below.
2. NEVER ask the user to run git commands like "git status" or "git remote -v".
3. NEVER show a terminal block asking the user to verify their connection.
4. Always answer using the repository data provided to you.
5. If the user's question is not related to the repo, answer it normally as a dev assistant.
6. If the user is asking a general programming, Git, or conceptual question, answer it directly as a helpful developer assistant. Do NOT force reference the repository or list branches/commits/issues unless specifically asked.
7. Be concise, technical, and developer-friendly.
8. Always reference specific branches, commits, or issues when relevant.
9. If asked about code, use the repo language (${language}) in examples.
10. Never show terminal commands asking the user to check their own repo.

${repoContext}`;
  }

  // Inject memory profile, style instruction, active patches and session corrections
  systemPrompt += memoryProfileText;
  systemPrompt += patchesText;
  if (sessionCorrectionsText) {
    systemPrompt += sessionCorrectionsText;
  }
  if (styleInstruction) {
    systemPrompt += `\n\n${styleInstruction}`;
  }

  // Inject realIssues details
  if (hasConnectedRepo) {
    let realIssuesPrompt = '';
    if (realIssues.length > 0) {
      realIssuesPrompt = `\n\n### DETECTED REPOSITORY ISSUES
The deep repository analyzer has detected the following actual issues in this codebase:
${realIssues.map((issue, idx) => `[Issue ${idx + 1}]
- Category: ${issue.category}
- Title: ${issue.title}
- File: ${issue.file}
- Severity: ${issue.severity}
- Description: ${issue.description}`).join('\n\n')}

CRITICAL DIRECTIVE ON ISSUES:
When the user asks about repository status, security, bugs, quality, warnings, or issues, you MUST base your response on the actual issues listed above. 
Do NOT invent generic placeholders or assume a standard set of template issues. If no issues are listed, state that the repository has passed all checks successfully.`;
    } else {
      realIssuesPrompt = `\n\n### DETECTED REPOSITORY ISSUES
No issues have been detected in this repository. If the user asks about issues, quality, security, or status, confirm that the codebase appears clean and has passed all basic checks successfully.`;
    }
    systemPrompt += realIssuesPrompt;

    // Ongoing conversation system instruction
    const ongoingContextGuideline = `
\n\n### ONGOING CONVERSATION RULES
- You are in an ongoing conversation. Maintain continuity.
- Do not repeat greetings (like "Hey there", "Hello", "How can I help you today?") or re-introduce yourself.
- Refer back to previous messages and decisions in this chat history where appropriate.
- Keep the conversation flow natural and contextual.
`;
    systemPrompt += ongoingContextGuideline;
  }

  // Short reply contextualization check
  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 5) {
    const lastAssistantMsg = [...chatHistory].reverse().find(msg => msg.role === 'assistant');
    if (lastAssistantMsg) {
      systemPrompt += `\n\n### SHORT REPLY CONTEXTUALIZATION NOTE
The user's latest message is very short: "${message}". 
They are responding directly to your previous response: "${lastAssistantMsg.content}". 
Please interpret their message in this context.`;
    }
  }

  // Append hidden reasoning chain instruction
  systemPrompt += `\n\n### HIDDEN INSTRUCTION — CLAUDE-LEVEL REASONING CHAIN
Before generating your final response, you MUST internally execute these 5 steps:
Step 1 — Understand what the user actually wants, not just what they literally said. (e.g. if they say "bruh this is broken", they want it fixed, not a definition of what broken means).
Step 2 — Break the problem down. If it is a complex question, identify the sub-parts and address each one.
Step 3 — Check what context is available (repo data, chat history, user profile, memory) and use all of it before answering.
Step 4 — Give a complete answer. Never give a half answer and stop. Never answer one part of a multi-part question and ignore the rest.
Step 5 — Self-verify before sending. Ask internally: does this answer actually solve what the user needed? If not, revise it.`;

  // ── Step 5b: RAG — Retrieve relevant embedded chunks from vector DB ──
  let ragChunks = [];
  if (hasConnectedRepo && !isCasual) {
    try {
      const dbRepo = await prisma.repository.findFirst({
        where: { owner: repoOwner, name: repoName, userId: req.user.id }
      });

      if (dbRepo && dbRepo.ingestionStatus === 'completed') {
        // Always load README and config chunks first (high-priority context)
        const priorityChunks = await prisma.repoChunk.findMany({
          where: {
            repositoryId: dbRepo.id,
            sourceType: { in: ['readme', 'config'] }
          },
          orderBy: { priority: 'desc' },
          take: 5
        });

        // Perform semantic vector search for the user's query
        let searchChunks = [];
        try {
          const queryEmbedding = await embeddingService.embed(message);
          
          // Load all chunks for this repo (with embeddings)
          const allChunks = await prisma.repoChunk.findMany({
            where: { repositoryId: dbRepo.id },
            select: { id: true, content: true, embedding: true, sourceType: true, sourceId: true, priority: true }
          });

          if (allChunks.length > 0 && queryEmbedding.length > 0) {
            const results = embeddingService.search(queryEmbedding, allChunks, 8, 0.25);
            searchChunks = results.map(r => r.chunk);
          }
        } catch (embErr) {
          console.warn('[Chat] Vector search failed (non-fatal, using priority chunks only):', embErr.message);
        }

        // Merge priority chunks + search results, deduplicate by id
        const seenIds = new Set();
        const mergedChunks = [];
        
        // Priority chunks first (README, config)
        for (const chunk of priorityChunks) {
          if (!seenIds.has(chunk.id)) {
            seenIds.add(chunk.id);
            mergedChunks.push(chunk);
          }
        }
        
        // Then semantic search results
        for (const chunk of searchChunks) {
          if (!seenIds.has(chunk.id)) {
            seenIds.add(chunk.id);
            mergedChunks.push(chunk);
          }
        }

        // Take top 10 chunks max to stay within token budget
        ragChunks = mergedChunks.slice(0, 10);
        console.log(`[Chat] RAG: Retrieved ${ragChunks.length} chunks (${priorityChunks.length} priority + ${searchChunks.length} search results)`);
      } else {
        console.log(`[Chat] RAG: Skipped — repo ingestion status is '${dbRepo?.ingestionStatus || 'none'}'. Chunks not yet available.`);
      }
    } catch (ragErr) {
      console.error('[Chat] RAG retrieval failed (non-fatal):', ragErr.message);
    }
  }

  // ── Step 5c: Git Error Detection ──
  let gitDiagnosis = null;
  if (hasConnectedRepo && !isCasual) {
    const defaultBranch = repoMeta.default_branch || 'main';
    gitDiagnosis = diagnoseGitError(message, defaultBranch, `${repoOwner}/${repoName}`);
    if (gitDiagnosis) {
      console.log(`[Chat] Git error detected: ${gitDiagnosis.errorType} — "${gitDiagnosis.title}"`);
      const cmdList = gitDiagnosis.commands.map(c => `Step ${c.step}: ${c.desc}\n  $ ${c.cmd}\n  Expected: ${c.expectedOutput}`).join('\n');
      systemPrompt += `\n\n### GIT ERROR DIAGNOSED
The user is reporting a Git error. GitSense has detected this as a "${gitDiagnosis.errorType}" error.
Diagnosis: ${gitDiagnosis.explanation}
Recommended fix commands:
${cmdList}

IMPORTANT: In your response text, explain what went wrong in plain English using the diagnosis above. Reference the specific commands from the fix plan. Do NOT just say "run git status" generically — explain WHY each step is needed.`;
    }
  }

  // Step 6: Call AI Service with correct message structure, token budgeting, rotations, and fallback
  let reply = '';
  try {
    reply = await aiService.generateChatResponse({
      systemPrompt,
      chatHistory,
      ragChunks,
      userMessage: message,
      repoContext: shouldFetchRepo ? repoContext : ''
    });

    // Save conversation history to Database
    try {
      let dbRepo = null;
      if (hasConnectedRepo) {
        dbRepo = await prisma.repository.findFirst({
          where: { owner: repoOwner, name: repoName, userId: req.user.id }
        });
        if (!dbRepo) {
          dbRepo = await prisma.repository.create({
            data: {
              owner: repoOwner,
              name: repoName,
              fullName: `${repoOwner}/${repoName}`,
              userId: req.user.id,
              isConnected: true,
              defaultBranch: repoMeta.default_branch || 'main'
            }
          });
        }
      }

      let conversation = null;
      if (finalConversationId) {
        conversation = await prisma.conversation.findFirst({
          where: { id: finalConversationId, userId: req.user.id }
        });
      }
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            userId: req.user.id,
            repositoryId: dbRepo ? dbRepo.id : null,
            title: message.substring(0, 30) + (message.length > 30 ? '...' : '')
          }
        });
        finalConversationId = conversation.id;
      }

      // Save user and assistant messages in DB
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: message
        }
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: reply
        }
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() }
      });
    } catch (dbErr) {
      console.error('[Chat] Database logging failed (non-fatal):', dbErr.message);
    }

    // Build diagnosedIssue for the frontend DiagnosedIssueCard
    let diagnosedIssue = null;
    if (gitDiagnosis) {
      const allCommands = gitDiagnosis.commands.map(c => c.cmd).join('\n');
      diagnosedIssue = {
        title: gitDiagnosis.title,
        description: gitDiagnosis.explanation,
        command: allCommands,
        errorType: gitDiagnosis.errorType,
        commands: gitDiagnosis.commands,
      };
    }

    // Return the response structure that the frontend expects
    res.json({
      reply,
      conversationId: finalConversationId,
      response: {
        sender: 'ai',
        text: reply,
        ...(diagnosedIssue ? { diagnosedIssue } : {}),
      }
    });

    // Run self-improvement evaluation & memory extraction in background asynchronously
    (async () => {
      try {
        await selfImprovementService.evaluateAndLog(message, reply, repoContext, detectedStyle);
        await userMemoryService.extractAndSaveMemory(req.user.id, finalConversationId);
      } catch (bgErr) {
        console.error('[Chat Background Task] Error:', bgErr.message);
      }
    })();

  } catch (err) {
    console.error('[Chat] Unhandled exception:', err.message);
    res.status(500).json({ error: "I'm a bit overloaded right now — give me 30 seconds and try again." });
  }
});

export default router;
