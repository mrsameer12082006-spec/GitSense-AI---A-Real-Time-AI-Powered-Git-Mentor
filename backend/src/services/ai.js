// ─────────────────────────────────────────────────────────────
// GitSense AI — AI Service (Groq / TruGen AI OpenAI-Compatible)
// ─────────────────────────────────────────────────────────────

import personaClassifier from './personaClassifier.js';

/**
 * AI Service — handles interactions with either TruGen AI or Groq API endpoints.
 * 
 * Returns structured responses or streams them using Server-Sent Events.
 */
class AIService {
  constructor() {
    this.model = 'llama-3.3-70b-versatile';
  }

  /**
   * Helper to dynamically get config for TruGen AI and Groq.
   * Auto-detects if TruGen API key starts with gsk_ (indicating a Groq key).
   */
  _getAIConfig() {
    const trugenKey = process.env.TRUGEN_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    let primary = null;
    let fallback = null;

    const trugenBaseURL = process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1';
    const trugenModel = process.env.TRUGEN_MODEL || 'llama-3.3-70b-versatile';

    const groqBaseURL = 'https://api.groq.com/openai/v1';
    const groqModel = 'llama-3.3-70b-versatile';

    // If TRUGEN_API_KEY starts with gsk_, treat it as a Groq key
    if (trugenKey && trugenKey.startsWith('gsk_')) {
      primary = {
        apiKey: trugenKey,
        baseURL: groqBaseURL,
        model: groqModel,
        isGroq: true,
        name: 'Groq (via TruGen Key)'
      };
    } else if (trugenKey) {
      primary = {
        apiKey: trugenKey,
        baseURL: trugenBaseURL,
        model: trugenModel,
        isGroq: false,
        name: 'TruGen'
      };
      if (groqKey) {
        fallback = {
          apiKey: groqKey,
          baseURL: groqBaseURL,
          model: groqModel,
          isGroq: true,
          name: 'Groq'
        };
      }
    } else if (groqKey) {
      primary = {
        apiKey: groqKey,
        baseURL: groqBaseURL,
        model: groqModel,
        isGroq: true,
        name: 'Groq'
      };
    }

    return { primary, fallback };
  }

  /**
   * Generates the system prompt including strict mentorship guidelines, connected contexts, and persona rules.
   */
  _buildSystemPrompt(repoContext = '', personaLevel = 2, repoName = '') {
    const personaRules = personaClassifier.getPersonaRules(personaLevel);

    return `You are TruGen AI (powered by Huma-2 for conversational logic and Hawkeye-1 for visual code analysis), an expert Git repository analyst with deep knowledge of the connected codebase. You answer questions using only the verified repository data provided below. You never invent commit hashes, file names, branch names, function names, or any technical details that are not explicitly present in the context. If the answer is not in the context, say I do not have enough repository data to answer this accurately and suggest what action the user should take to get more information.

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

## RULE 4 — GITHUB-NATIVE LANGUAGE AND CONCEPTS
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
  async getCompletionStream(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '') {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) {
      throw new Error('No AI provider API key is set. Add TRUGEN_API_KEY or GROQ_API_KEY to your .env file.');
    }

    const systemPrompt = this._buildSystemPrompt(repoContext, personaLevel, repoName);
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.role === 'assistant' && msg.metadata
          ? JSON.stringify(msg.metadata)
          : msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

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
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    if (!config.isGroq) {
      headers['x-api-key'] = config.apiKey;
    }

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

    return response.body; // ReadableStream
  }

  /**
   * Non-streaming response generator (fallback/testing).
   */
  async generateResponse(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '') {
    const { primary, fallback } = this._getAIConfig();

    if (!primary) {
      throw new Error('No AI provider API key is set. Add TRUGEN_API_KEY or GROQ_API_KEY to your .env file.');
    }

    const systemPrompt = this._buildSystemPrompt(repoContext, personaLevel, repoName);
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.role === 'assistant' && msg.metadata
          ? JSON.stringify(msg.metadata)
          : msg.content,
      });
    }

    messages.push({ role: 'user', content: userMessage });

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
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    if (!config.isGroq) {
      headers['x-api-key'] = config.apiKey;
    }

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
    const responseText = parsedData.choices[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(responseText);
      return {
        text: parsed.text || 'I apologize, I could not generate a response.',
        insight: parsed.insight || null,
        recommendation: parsed.recommendation || null,
        codeBlock: parsed.codeBlock || null,
        commandBlock: parsed.commandBlock || null,
        diff: parsed.diff || null,
        conflictResolution: parsed.conflictResolution || null,
      };
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
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    };
    if (!config.isGroq) {
      headers['x-api-key'] = config.apiKey;
    }

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
  async diagnoseIssues(issues, userLevel = 'intermediate') {
    const { primary, fallback } = this._getAIConfig();
    
    if (!primary) {
      console.warn('[AIService] No API key, skipping diagnosis');
      return issues.map(i => ({
        ...i,
        whatIsTheIssue: i.title,
        howThisHappened: `Automated scan found this issue.`,
        fixPlan: {
          issue: i.id,
          severity: i.severity === 'error' ? 'high' : 'medium',
          actions: []
        }
      }));
    }

    const systemPrompt = `You are TruGen AI powered by Huma-2 and Hawkeye-1. You are GitSense AI's issue diagnosis and fix plan generator.
For the given repository issue, you MUST generate a fix plan in this exact JSON format:
{
  "issue": "<issue_type>",
  "severity": "low | medium | high",
  "actions": [
    {
      "type": "create_file | update_file | delete_branch | update_settings",
      "path": "<file path if applicable>",
      "branch": "<branch name if applicable>",
      "content": "<file content if applicable>",
      "message": "<commit message>"
    }
  ]
}

Rules:
1. Always return a valid JSON object matching this schema. Never return plain text. Never wrap the JSON in markdown code blocks.
2. Under 'actions', specify the exact actions required to fix this issue:
   - For missing .gitignore, create a file at path '.gitignore' with a modern boilerplate content matching the project type (Node, Python, Go, etc.) and a clear commit message.
   - For stale branch, delete the branch by specifying type 'delete_branch' and the branch name.
   - For other issues, choose the appropriate action types (create_file, update_file, delete_branch, update_settings).
3. The 'severity' field should be 'low', 'medium', or 'high'.
4. Do not invent details not present or not logically derived.`;

    const diagnosed = [];
    for (const issue of issues) {
      try {
        console.log(`[AI] Attempting diagnoseIssues for issue ${issue.id} using primary provider: ${primary.name}`);
        const content = await this._executeFixPlanCall(primary, systemPrompt, issue, userLevel);
        const fixPlan = JSON.parse(content);
        diagnosed.push({
          ...issue,
          whatIsTheIssue: issue.title || `Issue detected in category: ${issue.category}`,
          howThisHappened: `GitSense automated scanners identified a repository quality issue: ${issue.title || issue.id}.`,
          fixPlan
        });
      } catch (err) {
        console.error(`[AI] Primary provider ${primary.name} diagnosis failed for issue ${issue.id}:`, err.message);
        let fallbackPlan = null;
        if (fallback) {
          try {
            console.log(`[AI] Reverting/falling back for diagnosis to: ${fallback.name}`);
            const content = await this._executeFixPlanCall(fallback, systemPrompt, issue, userLevel);
            fallbackPlan = JSON.parse(content);
          } catch (fallbackErr) {
            console.error(`[AI] Fallback provider ${fallback.name} also failed:`, fallbackErr.message);
          }
        }
        diagnosed.push({
          ...issue,
          whatIsTheIssue: issue.title || `Issue detected in category: ${issue.category}`,
          howThisHappened: `GitSense automated scanners identified a repository quality issue: ${issue.title || issue.id}.`,
          fixPlan: fallbackPlan || {
            issue: issue.id,
            severity: issue.severity === 'error' ? 'high' : 'medium',
            actions: []
          }
        });
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
