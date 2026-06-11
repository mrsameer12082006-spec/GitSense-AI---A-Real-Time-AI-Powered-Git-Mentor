import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import buildRepoContext from '../utils/buildRepoContext.js';

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
  'contributor', 'contributors', 'who made', 'readme', 'package.json'
];

/**
 * Checks if the message contains repository-specific keywords
 */
function isRepoSpecificQuery(message) {
  const msg = message.toLowerCase().trim();
  return REPO_KEYWORDS.some(keyword => msg.includes(keyword));
}

/**
 * Determines if the query is a greeting, small talk, or a simple acknowledgment/ender
 */
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

  // Retrieve user's GitHub OAuth Token from DB if needed
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

  // Safe fetch helper to handle network or API response errors gracefully
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

  // Step 2: Build appropriate system prompt
  let systemPrompt = '';

  if (!hasConnectedRepo) {
    // Prompt for when NO repo is connected
    systemPrompt = `You are GitSense AI, an intelligent GitHub repository assistant. 
Currently, no repository is connected. You can answer general developer and Git questions, greet the user, or have normal conversations. 
Always reply naturally and casually as a friendly human developer assistant. 
If the user asks questions about their specific repository branches, commits, or issues, politely advise them to connect or import a repository first using the panel on the left.`;
  } else if (isCasual) {
    // Prompt for connected repo, but message is casual (greeting/acknowledgement/small talk)
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

  // Step 3: Call Groq with correct message structure
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq API returned status ${groqRes.status}: ${errText}`);
    }

    const data = await groqRes.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated.';

    // Save conversation history to Database so dashboard loads correctly
    let finalConversationId = conversationId;
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

    // Return the response structure that the frontend expects
    res.json({
      reply,
      conversationId: finalConversationId,
      response: {
        sender: 'ai',
        text: reply
      }
    });

  } catch (err) {
    console.error('[Chat] Groq API error:', err.message);
    res.status(500).json({ error: 'AI service failed. Please try again.' });
  }
});

export default router;
