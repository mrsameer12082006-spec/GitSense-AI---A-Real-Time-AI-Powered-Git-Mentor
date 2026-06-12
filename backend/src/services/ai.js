// ─────────────────────────────────────────────────────────────
// GitSense AI — AI Service (Groq / TruGen AI OpenAI-Compatible)
// ─────────────────────────────────────────────────────────────

import personaClassifier from './personaClassifier.js';
import githubService from './github.js';

/**
 * AI Service — handles interactions with either TruGen AI or Groq API endpoints.
 * 
 * Returns structured responses or streams them using Server-Sent Events.
 */
class AIService {
  constructor() {
    this.model = 'llama-3.3-70b-versatile';
    this.trugenAvailable = true;
    this.groqAvailable = true;
    this.geminiAvailable = true;
  }

  /**
   * Health checks the configured providers by performing light API pings.
   * Marks providers returning 404 or >= 500 as unavailable.
   */
  async checkProviderHealth() {
    const trugenKey = process.env.TRUGEN_API_KEY;
    if (trugenKey && !trugenKey.startsWith('gsk_')) {
      try {
        const trugenBaseURL = process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1';
        const res = await fetch(`${trugenBaseURL}/models`, {
          headers: {
            'Authorization': `Bearer ${trugenKey}`,
            'x-api-key': trugenKey
          }
        });
        if (res.status === 404 || res.status >= 500) {
          console.warn(`[AI Health Check] TruGen returned status ${res.status}. Marking TruGen as unavailable.`);
          this.trugenAvailable = false;
        } else {
          this.trugenAvailable = true;
        }
      } catch (err) {
        console.warn(`[AI Health Check] TruGen ping failed: ${err.message}. Marking TruGen as unavailable.`);
        this.trugenAvailable = false;
      }
    } else {
      this.trugenAvailable = false;
    }

    const groqKey = process.env.GROQ_API_KEY || (trugenKey && trugenKey.startsWith('gsk_') ? trugenKey : null);
    if (groqKey) {
      try {
        const res = await fetch(`https://api.groq.com/openai/v1/models`, {
          headers: {
            'Authorization': `Bearer ${groqKey}`
          }
        });
        if (res.status === 404 || res.status >= 500) {
          console.warn(`[AI Health Check] Groq returned status ${res.status}. Marking Groq as unavailable.`);
          this.groqAvailable = false;
        } else {
          this.groqAvailable = true;
        }
      } catch (err) {
        console.warn(`[AI Health Check] Groq ping failed: ${err.message}. Marking Groq as unavailable.`);
        this.groqAvailable = false;
      }
    } else {
      this.groqAvailable = false;
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    this.geminiAvailable = !!geminiKey;

    console.log(`[AI Health Check] Health check summary — Groq: ${this.groqAvailable ? 'AVAILABLE' : 'OFFLINE'}, TruGen: ${this.trugenAvailable ? 'AVAILABLE' : 'OFFLINE'}, Gemini: ${this.geminiAvailable ? 'AVAILABLE' : 'OFFLINE'}`);
  }

  /**
   * Helper to dynamically get config for TruGen AI, Groq, and Gemini.
   * Prioritizes Groq over TruGen, skipping unavailable providers.
   */
  _getAIConfig() {
    const trugenKey = process.env.TRUGEN_API_KEY;
    const groqKey = process.env.GROQ_API_KEY || (trugenKey && trugenKey.startsWith('gsk_') ? trugenKey : null);
    const geminiKey = process.env.GEMINI_API_KEY;

    let primary = null;
    let fallback = null;
    let gemini = null;

    const trugenBaseURL = process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1';
    const trugenModel = process.env.TRUGEN_MODEL || 'llama-3.3-70b-versatile';

    const groqBaseURL = 'https://api.groq.com/openai/v1';
    const groqModel = 'llama-3.3-70b-versatile';

    if (groqKey && this.groqAvailable) {
      primary = {
        apiKey: groqKey,
        baseURL: groqBaseURL,
        model: groqModel,
        isGroq: true,
        name: 'Groq'
      };
    }

    if (trugenKey && !trugenKey.startsWith('gsk_') && this.trugenAvailable) {
      const trugenConfig = {
        apiKey: trugenKey,
        baseURL: trugenBaseURL,
        model: trugenModel,
        isGroq: false,
        name: 'TruGen'
      };
      if (!primary) {
        primary = trugenConfig;
      } else {
        fallback = trugenConfig;
      }
    }

    if (geminiKey && this.geminiAvailable) {
      gemini = {
        apiKey: geminiKey,
        name: 'Gemini'
      };
    }

    return { primary, fallback, gemini };
  }

  /**
   * Generates the system prompt including strict mentorship guidelines, connected contexts, and persona rules.
   */
  _buildSystemPrompt(repoContext = '', personaLevel = 2, repoName = '', styleInstruction = '') {
    const personaRules = personaClassifier.getPersonaRules(personaLevel);

    return `You are GitSense AI (powered by Huma-2 for conversational logic and Hawkeye-1 for visual code analysis), an expert Git repository analyst with deep knowledge of the connected codebase. You answer questions using only the verified repository data provided below. You never invent commit hashes, file names, branch names, function names, or any technical details that are not explicitly present in the context. If the answer is not in the context, say I do not have enough repository data to answer this accurately and suggest what action the user should take to get more information.

## RULE 1 — STRICT GITHUB AND REPOSITORY ONLY BOUNDARY
Your entire knowledge and purpose is limited to the following domains only:
1. The connected GitHub repository including its files, commits, branches, pull requests, issues, contributors, and code.
2. Git commands, Git workflows, and Git best practices.
3. GitHub features such as Actions, Pages, Packages, Security, and Collaboration.
4. Software development concepts directly relevant to understanding or improving the connected repository (code review, CI/CD pipelines, merge strategies, refactoring, dependency management).

You do not answer questions about anything outside these four domains. If a user asks something outside this scope you respond with exactly this format:
"That question is outside my area of expertise. I am specialized in your GitHub repository and Git workflows. Here is what I can help you with instead:" and then list three relevant things they could ask about their actual repo.
You never pretend to be a general AI assistant. You never answer general programming tutorials, career advice, life advice, or any topic not directly connected to the repository and Git.

${personaRules}

${styleInstruction ? styleInstruction + '\n\n' : ''}## RULE 4 — GITHUB-NATIVE LANGUAGE AND CONCEPTS
Speak GitHub's own vocabulary natively. Use the exact terms GitHub uses in its interface and documentation.
Use "pull request" not "merge request". Use "repository" not "repo" or "project folder" when speaking technically. Use "fork" not "copy". Use "issues" not "tickets" or "tasks" unless the user uses those words first. Use "Actions" not "pipelines" unless referring to a specific CI tool. Use "main" not "master". Use "contributor" not "developer". Use "review" not "code check". Use "approved" not "accepted". Use "requested changes" not "rejected".
When explaining GitHub concepts, reference how they appear in the actual GitHub interface.

## RULE 5 — ALWAYS GROUND IN REAL REPOSITORY DATA
Every answer must contain at least one specific reference to the actual connected repository. Never give generic advice that could apply to any repository. Always personalize using the data below.

## RULE 6 — RESPONSE STRUCTURE BY QUESTION TYPE
- For diagnostic questions (why is something broken): Start with the most likely cause based on repo data. List evidence from context. List what to check next. Give exact commands/steps to investigate based on persona level.
- For safety questions (can I do this action): Start with a clear yes, no, or yes with caution verdict in bold. Explain specific risks based on repo state. Give recommended procedure and rollback plan.
- For explanation questions (what does this mean): Start with a one-sentence plain English answer. Go deeper based on persona level.
- For discovery questions (what is happening): Give a structured summary with sections for recent activity, current branch health, open items needing attention, and one recommended next action.

## RULE 7 — THINGS THE AI MUST NEVER DO
- Never answer questions about topics outside GitHub and the connected repository.
- Never invent a commit hash, file name, branch name, or contributor name that is not in the retrieved chunks.
- Never recommend a destructive Git operation (force push, hard reset) without explicitly warning about consequences first.
- Never give advice that contradicts GitHub's documented best practices.
- Never condescend to a non-technical user.
- Never use the words "simply", "just", or "easy".
- Never give the same generic answer twice. Go deeper if asked a follow-up.
- NEVER say "I don't have access to files", "I cannot read files", "I don't have enough information to read your files", or any variation claiming inability to access the connected repository.
- If a file does not exist in the repository, say "This file does not exist in the repository" — NOT "I cannot access files".
- If you need more context about a specific file, say "Let me check that file" rather than claiming inability.
- You DO have full access to the connected repository's files, commits, branches, PRs, and issues. Act accordingly.

## RULE 8 — COVER EVERY QUESTION ASKED
CRITICAL RULE: If the user asks multiple questions in one message, you MUST answer ALL of them. Never skip a question. Never partially answer. Go through every question the user asked, one by one, and answer each fully. If you answered a question in a previous message and the user is asking about it again, answer it again — do not assume they understood.
Before sending your reply, count how many questions the user asked. Make sure your reply addresses every single one.

## RULE 9 — SPECIFIC AND HELPFUL ACTIONS & INSIGHTS
- The "recommendation" field (Recommended Action) MUST be a REAL, actionable next step based on what was just discussed (e.g. "Run issue scan", "Check branch status", "View recent commits").
- Never suggest "check out the file" or "read more documentation" when the user just asked about that file. Suggest a specific action related to WHAT WAS IN the file, or a GitSense tool action.
- If there is genuinely no useful next action, set the "recommendation" field to "None" or omit it — do not show a useless/generic recommendation.
- The "insight" field (GitSense Insights) MUST contain ONE specific, real, and value-adding insight pulled directly from the actual repository data (e.g., "package.json shows this project uses React 18 and Express 4").
- Never show a generic insight that could apply to any repo on earth (like "README contains essential information about the repo"). If there is no real specific insight, set "insight" to "None" or omit it.

## RULE 10 — GROUND IN ACTUAL REPOSITORY DATA
You are connected to a real GitHub repository. You have been given the ACTUAL FILE CONTENTS in the context below (marked with "Here is the FULL ACTUAL CONTENT of..."). Every answer you give MUST quote, reference, or paraphrase SPECIFIC text from those actual file contents. 
CRITICAL: When a user asks "what is in this repo?" or "tell me about this repo", you MUST:
1. Find the README content in the context below
2. QUOTE specific sections from the actual README text (project name, description, features, tech stack, etc.)
3. Reference specific files from the file tree
4. Mention specific dependencies from package.json if available
NEVER give a vague summary like "there are many details in the README" — you MUST present the actual details.
NEVER tell the user to "go read" or "check out" any file — YOU read it for them and present the information.
If the README file content is missing or returns empty in the context below, and the user asks about the README, you MUST respond with exactly: "I tried to read your README.md but it returned empty or does not exist in this repo" — you must NEVER make up a fake README content or describe a generic README.

## RULE 11 — NEVER DEFLECT OR REDIRECT
You are PROHIBITED from saying any variation of:
- "README.md file mein details hai, padho" (or any language equivalent)
- "Go read the README to know more"
- "Check the package.json for details"
- "You can find this information in..."
- "The file contains information about..."
Instead, YOU extract and present the information directly from the file contents given to you.

## CITATION VERIFICATION
Every factual claim in your answer must reference the source it came from. If you mention a commit hash, it must be from the context below. If you mention a file name, it must be from the context below.

## RESPONSE FORMAT:
You MUST respond in valid JSON with this exact structure, starting with the "text" field first:
{
  "text": "Your main mentored response text (markdown supported, structured as instructed by Rule 6)",
  "insight": "Optional proactive observation or analysis insight",
  "recommendation": "Optional recommended next action",
  "codeBlock": "Optional code snippet to show",
  "commandBlock": "Optional git/terminal commands to suggest (one command per line)",
  "diff": "Optional diff view (use +/- prefixes)",
  "conflictResolution": {
    "conflictFile": "Optional string (name of the file in conflict)",
    "conflictLines": "Optional string (the conflicting lines including <<<<<<<, =======, >>>>>>> markers)",
    "branchA": "Optional string (the target branch)",
    "branchB": "Optional string (the incoming branch)",
    "recommendedResolution": "Optional string (the resolved code block)",
    "explanation": "Optional string (explanation of the resolution)"
  }
}

Rules:
- "text" is ALWAYS required.
- Do not fabricate repository commits or data; only use what is provided in the context below.

REPOSITORY CONTEXT START
Repository Name: ${repoName || 'Unknown'}
${repoContext || 'No repository context available. Advise the user to connect a Git repository to enable repository-aware assistance.'}
REPOSITORY CONTEXT END`;
  }

  /**
   * Helper to fetch completion stream.
   * Attempts primary configuration, falls back to Groq if configured and TruGen fails.
   */
  async getCompletionStream(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '', styleInstruction = '') {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) {
      throw new Error('No AI provider API key is set. Add TRUGEN_API_KEY or GROQ_API_KEY to your .env file.');
    }

    // Hard cap total payload at 28,000 characters (~7,000 tokens) to stay well within Groq TPM limits
    // IMPORTANT: Critical files (README, package.json) are placed FIRST in the context
    // by chat.js, so they will survive truncation. File tree/deep context at the end
    // will be truncated if the budget is exceeded.
    const MAX_BUDGET = 28000;
    const baseSystemPrompt = this._buildSystemPrompt('', personaLevel, repoName, styleInstruction);
    let baseSize = baseSystemPrompt.length + userMessage.length;

    // Cap at last 8 messages (4 turns) and use only clean content to prevent history token explosion
    const recentHistory = history.slice(-8);
    const historyMsgs = [];
    for (const msg of recentHistory) {
      const content = msg.content;
      baseSize += content.length + 50;
      historyMsgs.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content,
      });
    }

    const remainingBudget = Math.max(0, MAX_BUDGET - baseSize);
    let finalRepoContext = repoContext;
    if (repoContext.length > remainingBudget) {
      console.warn(`[AI] ⚠️ repoContext (${repoContext.length} chars) exceeds remaining budget (${remainingBudget} chars). Truncating from end (critical files at start preserved).`);
      finalRepoContext = repoContext.substring(0, remainingBudget) + '\n\n[File tree and deep context truncated due to size limits. Critical file contents above are intact.]';
    } else {
      console.log(`[AI] repoContext fits within budget: ${repoContext.length} / ${remainingBudget} chars`);
    }

    const systemPrompt = this._buildSystemPrompt(finalRepoContext, personaLevel, repoName, styleInstruction);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: userMessage }
    ];

    try {
      console.log(`[AI] Attempting stream using primary provider: ${primary.name}`);
      return await this._executeStreamCall(primary, messages);
    } catch (err) {
      console.error(`[AI] Primary provider ${primary.name} failed:`, err.message);
      if (fallback) {
        console.log(`[AI] Reverting/falling back to secondary provider: ${fallback.name}`);
        try {
          return await this._executeStreamCall(fallback, messages);
        } catch (fallbackErr) {
          console.error(`[AI] Fallback provider ${fallback.name} also failed:`, fallbackErr.message);
          throw new Error(`AI API failed for both primary (${primary.name}) and fallback (${fallback.name}): ${fallbackErr.message}`);
        }
      } else {
        throw err;
      }
    }
  }

  async _executeStreamCall(config, messages) {
    if (config.isGroq) {
      const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-70b-8192',
        'llama3-8b-8192'
      ];
      
      let lastErr = null;
      for (const modelName of models) {
        console.log(`[AI] Trying Groq model: ${modelName}`);
        let attempts = 2;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            };
            const response = await fetch(`${config.baseURL}/chat/completions`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: modelName,
                messages,
                temperature: 0.3,
                stream: true,
                response_format: { type: 'json_object' }
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              const isRateLimit = response.status === 429 || errText.includes('rate_limit') || errText.includes('429');
              if (isRateLimit && attempt < attempts) {
                console.warn(`[AI] Got 429 rate limit on model ${modelName}. Waiting 3s...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
              throw new Error(`API failed with status ${response.status}: ${errText}`);
            }

            console.log(`[AI] Success with Groq model: ${modelName}`);
            return response.body; // ReadableStream
          } catch (err) {
            console.error(`[AI] Model ${modelName} failed on attempt ${attempt}:`, err.message);
            lastErr = err;
            if (err.message.includes('429') && attempt < attempts) {
              console.warn(`[AI] Got 429 on model ${modelName} (exception). Waiting 3s...`);
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
          }
        }
      }
      throw lastErr || new Error('All Groq models failed.');
    } else {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'x-api-key': config.apiKey,
      };
      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.3,
          stream: true,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API failed with status ${response.status}: ${errText}`);
      }

      return response.body;
    }
  }

  /**
   * Non-streaming response generator (fallback/testing).
   */
  async generateResponse(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '', styleInstruction = '') {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) {
      throw new Error('No AI provider API key is set. Add TRUGEN_API_KEY or GROQ_API_KEY to your .env file.');
    }

    // Hard cap total payload at 28,000 characters (~7,000 tokens)
    const MAX_BUDGET = 28000;
    const baseSystemPrompt = this._buildSystemPrompt('', personaLevel, repoName, styleInstruction);
    let baseSize = baseSystemPrompt.length + userMessage.length;

    // Cap at last 8 messages (4 turns) and use only clean content to prevent history token explosion
    const recentHistory = history.slice(-8);
    const historyMsgs = [];
    for (const msg of recentHistory) {
      const content = msg.content;
      baseSize += content.length + 50;
      historyMsgs.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content,
      });
    }

    const remainingBudget = Math.max(0, MAX_BUDGET - baseSize);
    let finalRepoContext = repoContext;
    if (repoContext.length > remainingBudget) {
      console.warn(`[AI] repoContext length (${repoContext.length}) exceeds remaining budget (${remainingBudget}). Truncating...`);
      finalRepoContext = repoContext.substring(0, remainingBudget) + '\n\n[Context truncated due to size limits]';
    }

    const systemPrompt = this._buildSystemPrompt(finalRepoContext, personaLevel, repoName, styleInstruction);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: userMessage }
    ];

    try {
      console.log(`[AI] Attempting generateResponse using primary provider: ${primary.name}`);
      return await this._executeResponseCall(primary, messages);
    } catch (err) {
      console.error(`[AI] Primary provider ${primary.name} failed:`, err.message);
      if (fallback) {
        console.log(`[AI] Reverting/falling back to secondary provider: ${fallback.name}`);
        try {
          return await this._executeResponseCall(fallback, messages);
        } catch (fallbackErr) {
          console.error(`[AI] Fallback provider ${fallback.name} also failed:`, fallbackErr.message);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }
  }

  async _executeResponseCall(config, messages) {
    let responseText = '';
    
    if (config.isGroq) {
      const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'llama3-70b-8192',
        'llama3-8b-8192'
      ];
      
      let lastErr = null;
      for (const modelName of models) {
        console.log(`[AI] Trying Groq model (non-stream): ${modelName}`);
        let attempts = 2;
        let success = false;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            };
            const response = await fetch(`${config.baseURL}/chat/completions`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: modelName,
                messages,
                temperature: 0.3,
                response_format: { type: 'json_object' }
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              const isRateLimit = response.status === 429 || errText.includes('rate_limit') || errText.includes('429');
              if (isRateLimit && attempt < attempts) {
                console.warn(`[AI] Got 429 rate limit on non-stream model ${modelName}. Waiting 3s...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
              throw new Error(`API failed with status ${response.status}: ${errText}`);
            }

            const parsedData = await response.json();
            responseText = parsedData.choices[0]?.message?.content || '';
            success = true;
            break;
          } catch (err) {
            console.error(`[AI] Non-stream model ${modelName} failed on attempt ${attempt}:`, err.message);
            lastErr = err;
            if (err.message.includes('429') && attempt < attempts) {
              console.warn(`[AI] Got 429 on non-stream model ${modelName} (exception). Waiting 3s...`);
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
          }
        }
        if (success) break;
      }
      if (!responseText && lastErr) throw lastErr;
    } else {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'x-api-key': config.apiKey,
      };
      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API failed with status ${response.status}: ${errText}`);
      }

      const parsedData = await response.json();
      responseText = parsedData.choices[0]?.message?.content || '';
    }

    try {
      const parsed = JSON.parse(responseText);
      const res = {
        text: parsed.text || 'I apologize, I could not generate a response.',
        insight: parsed.insight || null,
        recommendation: parsed.recommendation || null,
        codeBlock: parsed.codeBlock || null,
        commandBlock: parsed.commandBlock || null,
        diff: parsed.diff || null,
        conflictResolution: parsed.conflictResolution || null,
      };

      const badRecommendationPatterns = [
        /check out (?:the\s+)?(?:readme|package\.json|file|docs|documentation)/i,
        /read (?:the\s+)?(?:readme|package\.json|file|docs|documentation|more)/i,
        /look at (?:the\s+)?(?:readme|package\.json|file|docs|documentation)/i,
        /refer to (?:the\s+)?(?:readme|package\.json|file|docs|documentation)/i,
        /documentation for/i,
        /go read/i,
        /view the (?:readme|package\.json|file|docs)/i,
        /open the (?:readme|package\.json|file|docs)/i,
        /please read/i,
        /check the file/i,
        /more information/i
      ];

      const badInsightPatterns = [
        /readme(?:\.md)? (?:file\s+)?contains (?:essential|information|details|an overview|instructions)/i,
        /readme(?:\.md)? (?:provides|shows|gives) (?:an overview|information|details|essential)/i,
        /repository (?:contains|has) (?:a readme|essential|information|source code|configuration)/i,
        /package\.json (?:file\s+)?contains (?:dependencies|scripts|project)/i,
        /contains (?:essential|general) information/i,
        /is a standard/i,
        /essential information about the repository/i,
        /purpose and functionality/i,
        /provides details on/i
      ];

      if (res.recommendation && badRecommendationPatterns.some(p => p.test(res.recommendation))) {
        res.recommendation = null;
      }
      if (res.insight && badInsightPatterns.some(p => p.test(res.insight))) {
        res.insight = null;
      }

      return res;
    } catch {
      return {
        text: responseText,
        insight: null,
        recommendation: null,
        codeBlock: null,
        commandBlock: null,
        diff: null,
        conflictResolution: null,
      };
    }
  }

  /**
   * Safe chat response generator with strict token budgeting, Groq model rotation, 
   * and Google Gemini fallback. Returns the response text or overload fallback message.
   */
  async generateChatResponse({
    systemPrompt = '',
    chatHistory = [],
    ragChunks = [],
    repoContext = '',
    userMessage = ''
  }) {
    // 1. Core System Prompt: max 1500 tokens (approx 6000 chars)
    let finalSystemPrompt = systemPrompt;
    if (finalSystemPrompt.length > 6000) {
      finalSystemPrompt = finalSystemPrompt.substring(0, 6000) + '\n[System prompt truncated to stay within token limits]';
    }

    // 2. Last 6 chat messages only
    const slicedHistory = chatHistory.slice(-6).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    // 3. RAG chunks: max 4000 tokens (approx 16000 chars), top 10 chunks
    const topChunks = ragChunks.slice(0, 10);
    let formattedRAG = '';
    if (topChunks.length > 0) {
      formattedRAG = '\n\n### RELEVANT CODEBASE CHUNKS (from ingested repository data)\n' +
        topChunks.map((c, idx) => {
          const label = c.sourceType ? `[${c.sourceType.toUpperCase()}] ` : '';
          return `--- Chunk ${idx + 1} ${label}---\n${c.content}`;
        }).join('\n\n');
      if (formattedRAG.length > 16000) {
        formattedRAG = formattedRAG.substring(0, 16000) + '\n[RAG chunks truncated to stay within token limits]';
      }
    }

    // 4. Repo context: max 2000 tokens (approx 8000 chars)
    let formattedRepoContext = repoContext || '';
    if (formattedRepoContext.length > 8000) {
      formattedRepoContext = formattedRepoContext.substring(0, 8000) + '\n[Repository context truncated to stay within token limits]';
    }

    // Combine sections
    let systemContent = `${finalSystemPrompt}${formattedRAG}`;
    if (formattedRepoContext) {
      systemContent += `\n\n### REPOSITORY LIVE CONTEXT\n${formattedRepoContext}`;
    }

    // Hard limit total payload size to 48,000 characters (~12,000 tokens) to accommodate RAG chunks
    const MAX_BUDGET = 48000;
    const historyTextLength = slicedHistory.reduce((acc, m) => acc + m.content.length + 50, 0);
    const totalCurrentSize = systemContent.length + historyTextLength + userMessage.length;

    if (totalCurrentSize > MAX_BUDGET) {
      console.warn(`[AI] Total character payload ${totalCurrentSize} exceeds 12000 tokens budget (${MAX_BUDGET}). Shrinking context.`);
      const excess = totalCurrentSize - MAX_BUDGET;
      if (formattedRepoContext.length > excess) {
        formattedRepoContext = formattedRepoContext.substring(0, formattedRepoContext.length - excess) + '\n[Repository context truncated to stay within hard budget]';
      } else {
        formattedRepoContext = '';
        const remainingExcess = excess - repoContext.length;
        if (formattedRAG.length > remainingExcess) {
          formattedRAG = formattedRAG.substring(0, formattedRAG.length - remainingExcess) + '\n[RAG chunks truncated to stay within hard budget]';
        } else {
          formattedRAG = '';
        }
      }
      
      systemContent = `${finalSystemPrompt}${formattedRAG}`;
      if (formattedRepoContext) {
        systemContent += `\n\n### REPOSITORY LIVE CONTEXT\n${formattedRepoContext}`;
      }
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...slicedHistory,
      { role: 'user', content: userMessage }
    ];

    const { primary, fallback, gemini } = this._getAIConfig();
    const providersToTry = [];
    if (primary) providersToTry.push(primary);
    if (fallback) providersToTry.push(fallback);

    let lastError = null;

    // Try primary and fallback providers (TruGen/Groq)
    for (const provider of providersToTry) {
      try {
        console.log(`[AI] Attempting chat response with provider: ${provider.name}`);
        const reply = await this._executeProviderChat(provider, messages);
        if (reply) return reply;
      } catch (err) {
        console.error(`[AI] Provider ${provider.name} chat execution failed:`, err.message);
        lastError = err;
      }
    }

    // Fallback to Google Gemini
    if (gemini) {
      try {
        console.log(`[AI] Primary/fallback providers rate limited or offline. Trying Gemini fallback...`);
        const reply = await this._executeGeminiChat(gemini, systemContent, slicedHistory, userMessage);
        if (reply) return reply;
      } catch (geminiErr) {
        console.error('[AI] Google Gemini fallback failed:', geminiErr.message);
        lastError = geminiErr;
      }
    }

    console.error('[AI] All AI providers failed. Returning overload fallback message.');
    return "I'm a bit overloaded right now — give me 30 seconds and try again.";
  }

  async _executeProviderChat(provider, messages) {
    if (provider.isGroq) {
      const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'gemma2-9b-it',
        'mixtral-8x7b-32768'
      ];

      let lastErr = null;
      for (const modelName of models) {
        try {
          console.log(`[AI] Calling Groq model: ${modelName}`);
          const res = await fetch(`${provider.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provider.apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages,
              temperature: 0.3
            })
          });

          if (!res.ok) {
            const errText = await res.text();
            if (res.status === 429 || errText.includes('rate_limit') || errText.includes('429')) {
              console.warn(`[AI] Groq model ${modelName} rate limited (429). Rotating immediately...`);
              continue;
            }
            throw new Error(`API failed status ${res.status}: ${errText}`);
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            return content;
          }
        } catch (err) {
          console.error(`[AI] Groq model ${modelName} request error:`, err.message);
          lastErr = err;
          if (err.message.includes('429') || err.message.includes('rate limit')) {
            continue;
          }
          throw err;
        }
      }
      throw lastErr || new Error('All Groq models rate limited or failed.');
    } else {
      const res = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
          'x-api-key': provider.apiKey
        },
        body: JSON.stringify({
          model: provider.model,
          messages,
          temperature: 0.3
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`TruGen failed status ${res.status}: ${errText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    }
  }

  async _executeGeminiChat(config, systemPrompt, chatHistory, userMessage) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${config.apiKey}`;
      
      const contents = [
        ...chatHistory.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        })),
        {
          role: 'user',
          parts: [{ text: userMessage }]
        }
      ];

      const body = {
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024
        }
      };

      if (systemPrompt) {
        body.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }

      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API failed status ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        return content;
      }
      throw new Error('Gemini returned empty candidate content');
    } catch (err) {
      console.error('[AI] Gemini API request error:', err.message);
      throw err;
    }
  }

  /**
   * General-purpose completion helper for non-mentorship tasks (like query expansion).
   */
  async generateCompletion(messages, temperature = 0.5) {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) {
      throw new Error('No AI provider API key is set.');
    }

    try {
      console.log(`[AI] Attempting generateCompletion using primary provider: ${primary.name}`);
      return await this._executeCompletionCall(primary, messages, temperature);
    } catch (err) {
      console.error(`[AI] Primary provider ${primary.name} failed:`, err.message);
      if (fallback) {
        console.log(`[AI] Reverting/falling back to secondary provider: ${fallback.name}`);
        try {
          return await this._executeCompletionCall(fallback, messages, temperature);
        } catch (fallbackErr) {
          console.error(`[AI] Fallback provider ${fallback.name} also failed:`, fallbackErr.message);
          throw fallbackErr;
        }
      } else {
        throw err;
      }
    }
  }

  async _executeCompletionCall(config, messages, temperature) {
    if (config.isGroq) {
      const models = [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant'
      ];
      
      let lastErr = null;
      for (const modelName of models) {
        console.log(`[AI] Trying Groq model (completion): ${modelName}`);
        let attempts = 2;
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            const headers = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`,
            };
            const response = await fetch(`${config.baseURL}/chat/completions`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                model: modelName,
                messages,
                temperature,
                response_format: { type: 'json_object' }
              }),
            });

            if (!response.ok) {
              const errText = await response.text();
              const isRateLimit = response.status === 429 || errText.includes('rate_limit') || errText.includes('429');
              if (isRateLimit && attempt < attempts) {
                console.warn(`[AI] Got 429 rate limit on completion model ${modelName}. Waiting 3s...`);
                await new Promise(r => setTimeout(r, 3000));
                continue;
              }
              throw new Error(`API failed with status ${response.status}: ${errText}`);
            }

            const parsedData = await response.json();
            return parsedData.choices[0]?.message?.content || '';
          } catch (err) {
            console.error(`[AI] Completion model ${modelName} failed on attempt ${attempt}:`, err.message);
            lastErr = err;
            if (err.message.includes('429') && attempt < attempts) {
              console.warn(`[AI] Got 429 on completion model ${modelName} (exception). Waiting 3s...`);
              await new Promise(r => setTimeout(r, 3000));
              continue;
            }
          }
        }
      }
      throw lastErr || new Error('All Groq models failed.');
    } else {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      };
      headers['x-api-key'] = config.apiKey;

      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API failed with status ${response.status}: ${errText}`);
      }

      const parsedData = await response.json();
      return parsedData.choices[0]?.message?.content || '';
    }
  }

  /**
   * Generate a short title for a conversation based on the first message.
   */
  async generateTitle(firstMessage) {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) return 'New Conversation';

    try {
      return await this._executeTitleCall(primary, firstMessage);
    } catch (err) {
      console.error(`[AI] Primary provider ${primary.name} title generation failed:`, err.message);
      if (fallback) {
        console.log(`[AI] Reverting/falling back for title generation to: ${fallback.name}`);
        try {
          return await this._executeTitleCall(fallback, firstMessage);
        } catch (fallbackErr) {
          console.error(`[AI] Fallback provider ${fallback.name} title generation also failed:`, fallbackErr.message);
        }
      }
      return firstMessage.length > 30
        ? firstMessage.substring(0, 30) + '...'
        : firstMessage;
    }
  }

  async _executeTitleCall(config, firstMessage) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    if (!config.isGroq) {
      headers['x-api-key'] = config.apiKey;
    }

    const model = config.isGroq ? 'llama-3.1-8b-instant' : config.model;

    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Generate a very short title (max 6 words) for a git-related conversation that starts with the message below. Return only the title text, nothing else.',
          },
          { role: 'user', content: firstMessage },
        ],
        temperature: 0.5,
        max_tokens: 20,
      }),
    });

    if (!response.ok) {
      throw new Error(`API failed with status ${response.status}`);
    }
    const parsedData = await response.json();
    return parsedData.choices[0]?.message?.content?.trim() || 'New Conversation';
  }

  /**
   * Diagnose issues from automated scanning.
   */
  async diagnoseIssues(issues, userLevel = 'intermediate', token = null, owner = null, repo = null) {
    const { primary, fallback } = this._getAIConfig();

    const getFilePath = (issue) => {
      if (issue.filePath) return issue.filePath;
      if (issue.id === 'missing-gitignore') return '.gitignore';
      if (issue.affectedResource && !issue.affectedResource.includes(' ') && (issue.affectedResource.includes('.') || issue.affectedResource.startsWith('.'))) {
        return issue.affectedResource;
      }
      return null;
    };

    const getFallbackIssue = (issue) => {
      const filePath = getFilePath(issue);
      const steps = issue.steps || (issue.manualFixCommands || []).map((cmd, idx) => ({
        description: `Execute manual fix step ${idx + 1}`,
        command: cmd
      }));
      
      let resolvedContent = '';
      if (issue.id === 'missing-gitignore') {
        resolvedContent = `# Git ignore rules for GitSense AI project\nnode_modules/\n.env\n.env.local\n.env.development.local\n.env.test.local\n.env.production.local\ndist/\nbuild/\n.DS_Store\n`;
      }
      
      return {
        ...issue,
        title: issue.title || 'Repository Issue',
        severity: issue.severity || 'warning',
        rootCause: issue.rootCause || issue.reason || `Automated scanners detected a repository issue under ${issue.category || 'Quality'}.`,
        steps: steps.length > 0 ? steps : [{ description: issue.fixDescription || 'Investigate and resolve the issue.' }],
        filePath: filePath || '',
        resolvedContent: issue.resolvedContent !== undefined ? issue.resolvedContent : (resolvedContent || null)
      };
    };

    const systemPrompt = `You are GitSense AI powered by Huma-2 and Hawkeye-1. You are GitSense AI's issue diagnosis and fix plan generator.
For the given repository issue, you must diagnose the issue and generate a resolution plan in the exact JSON format specified.
Do NOT include any markdown code blocks, backticks, or other formatting wrapper outside the JSON output.

JSON Format:
{
  "title": "A short, descriptive, premium title for the issue",
  "severity": "critical | warning",
  "rootCause": "A detailed explanation of why this issue exists and what problems it might cause if unresolved",
  "steps": [
    {
      "description": "Step-by-step instruction on how the user can fix this manually",
      "command": "Optional single command line to execute for this step (e.g. git command, touch, etc.)"
    }
  ],
  "filePath": "The relative path of the file to fix/create (e.g. '.gitignore')",
  "resolvedContent": "The complete, correct, and fully resolved content of the file that fixes the issue"
}

Ensure the "resolvedContent" contains NO placeholders (like '// TODO' or '...'). It must be the complete, ready-to-write file.`;

    const diagnosed = [];
    for (const issue of issues) {
      const filePath = getFilePath(issue);
      let currentContent = '';
      let fileFetched = false;

      if (filePath && token && owner && repo) {
        try {
          currentContent = await githubService.getFileContent(owner, repo, filePath, token);
          fileFetched = true;
          console.log(`[AI Diagnose] Successfully fetched content for ${filePath}`);
        } catch (err) {
          console.warn(`[AI Diagnose] Could not fetch content for ${filePath} (may not exist yet):`, err.message);
          currentContent = '';
        }
      }

      const issuePayload = {
        ...issue,
        filePath,
        currentContent
      };

      let resultJson = null;
      if (primary) {
        try {
          console.log(`[AI] Attempting diagnoseIssues for issue ${issue.id} using primary provider: ${primary.name}`);
          const content = await this._executeFixPlanCall(primary, systemPrompt, issuePayload, userLevel);
          resultJson = JSON.parse(content);
        } catch (err) {
          console.error(`[AI] Primary provider ${primary.name} diagnosis failed for issue ${issue.id}:`, err.message);
        }
      }

      if (!resultJson && fallback) {
        try {
          console.log(`[AI] Reverting/falling back for diagnosis to: ${fallback.name}`);
          const content = await this._executeFixPlanCall(fallback, systemPrompt, issuePayload, userLevel);
          resultJson = JSON.parse(content);
        } catch (fallbackErr) {
          console.error(`[AI] Fallback provider ${fallback.name} also failed:`, fallbackErr.message);
        }
      }

      if (resultJson) {
        const mappedSteps = Array.isArray(resultJson.steps) && resultJson.steps.length > 0
          ? resultJson.steps
          : (issue.manualFixCommands || []).map((cmd, idx) => ({
              description: `Execute manual fix step ${idx + 1}`,
              command: cmd
            }));

        diagnosed.push({
          ...issue,
          title: resultJson.title || issue.title || 'Repository Issue',
          severity: resultJson.severity || issue.severity || 'warning',
          rootCause: resultJson.rootCause || issue.reason || 'No root cause analysis available.',
          steps: mappedSteps.length > 0 ? mappedSteps : [{ description: issue.fixDescription || 'Investigate and resolve the issue.' }],
          filePath: resultJson.filePath || filePath || '',
          resolvedContent: resultJson.resolvedContent || null
        });
      } else {
        diagnosed.push(getFallbackIssue(issue));
      }
    }
    return diagnosed;
  }

  async _executeFixPlanCall(config, systemPrompt, issue, userLevel) {
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    };
    if (!config.isGroq) {
      headers['x-api-key'] = config.apiKey;
    }
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ userLevel, issue }) }
    ];

    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() || '{}';
  }
}

export default new AIService();
