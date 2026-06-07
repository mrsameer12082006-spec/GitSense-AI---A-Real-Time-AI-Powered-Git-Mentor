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
   * Helper to dynamically get config for TrueGen AI.
   * Groq fallback has been permanently removed.
   */
  _getAIConfig() {
    const apiKey = process.env.TRUGEN_API_KEY || process.env.GROQ_API_KEY;
    
    const baseURL = process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1';
    const model = process.env.TRUGEN_MODEL || 'llama-3.3-70b-versatile';
      
    return { apiKey, baseURL, model, isGroq: false };
  }

  /**
   * Generates the system prompt including strict mentorship guidelines, connected contexts, and persona rules.
   */
  _buildSystemPrompt(repoContext = '', personaLevel = 2, repoName = '') {
    const personaRules = personaClassifier.getPersonaRules(personaLevel);

    return `You are GitSense AI, an expert Git repository analyst with deep knowledge of the connected codebase. You answer questions using only the verified repository data provided below. You never invent commit hashes, file names, branch names, function names, or any technical details that are not explicitly present in the context. If the answer is not in the context, say I do not have enough repository data to answer this accurately and suggest what action the user should take to get more information.

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
   */
  async getCompletionStream(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '') {
    const { apiKey, baseURL, model, isGroq } = this._getAIConfig();

    if (!apiKey) {
      throw new Error('TRUGEN_API_KEY is not set. Add it to your .env file.');
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

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (!isGroq) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        stream: true,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI API failed with status ${response.status}: ${errText}`);
    }

    return response.body; // ReadableStream
  }

  /**
   * Non-streaming response generator (fallback/testing).
   */
  async generateResponse(userMessage, repoContext = '', history = [], personaLevel = 2, repoName = '') {
    const { apiKey, baseURL, model, isGroq } = this._getAIConfig();

    if (!apiKey) {
      throw new Error('TRUGEN_API_KEY is not set. Add it to your .env file.');
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

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (!isGroq) {
      headers['x-api-key'] = apiKey;
    }

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API failed with status ${response.status}: ${errText}`);
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
    } catch (err) {
      console.error('[AI] generateResponse error:', err);
      throw err;
    }
  }

  /**
   * General-purpose completion helper for non-mentorship tasks (like query expansion).
   */
  async generateCompletion(messages, temperature = 0.5) {
    const { apiKey, baseURL, model, isGroq } = this._getAIConfig();

    if (!apiKey) {
      throw new Error('TRUGEN_API_KEY is not set.');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (!isGroq) {
      headers['x-api-key'] = apiKey;
    }

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AI API failed with status ${response.status}: ${errText}`);
      }

      const parsedData = await response.json();
      return parsedData.choices[0]?.message?.content || '';
    } catch (err) {
      console.error('[AI] generateCompletion error:', err);
      throw err;
    }
  }

  /**
   * Generate a short title for a conversation based on the first message.
   */
  async generateTitle(firstMessage) {
    const { apiKey, baseURL, isGroq } = this._getAIConfig();
    const model = isGroq ? 'llama-3.1-8b-instant' : (process.env.TRUGEN_MODEL || 'llama-3.1-8b-instant');

    if (!apiKey) return 'New Conversation';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (!isGroq) {
      headers['x-api-key'] = apiKey;
    }

    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
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

      if (!response.ok) return 'New Conversation';
      const parsedData = await response.json();
      return parsedData.choices[0]?.message?.content?.trim() || 'New Conversation';
    } catch {
      return firstMessage.length > 30
        ? firstMessage.substring(0, 30) + '...'
        : firstMessage;
    }
  }
  async diagnoseIssues(issues, userLevel = 'intermediate') {
    const { apiKey, baseURL, model } = this._getProviderConfig();
    
    if (!apiKey) {
      console.warn('[AIService] No API key, skipping diagnosis');
      return issues.map(i => ({
        ...i,
        whatIsTheIssue: `Issue detected: ${i.title}`,
        howThisHappened: `Automated scan found this issue.`
      }));
    }

    const systemPrompt = `You are GitSense AI's issue diagnosis writer. You receive structured data about real repository issues detected by automated scans. For each issue, write two sections. Section one called What is the issue should explain the problem in plain English using the exact real values provided in the data object. Section two called How this happened should explain the root cause using the real context provided. Never add technical details not present in the data. Never invent commit hashes, file names, or contributor names. Write for a developer audience by default but if the userLevel field in the data is set to beginner write using plain non-technical analogies.

Output your response as a valid JSON object matching this schema:
{
  "diagnoses": [
    {
      "id": "issue-id",
      "whatIsTheIssue": "...",
      "howThisHappened": "..."
    }
  ]
}`;

    const headers = { 'Content-Type': 'application/json' };
    if (this.provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    try {
      const messages = [
        {
          role: 'user',
          content: JSON.stringify({ userLevel, issues })
        }
      ];

      let reqBody;
      if (this.provider === 'anthropic') {
        reqBody = {
          model,
          system: systemPrompt,
          messages,
          max_tokens: 1500,
          temperature: 0.3
        };
      } else {
        reqBody = {
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          response_format: { type: 'json_object' },
          temperature: 0.3
        };
      }

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = this.provider === 'anthropic' 
        ? data.content[0].text 
        : data.choices[0].message.content;

      const parsed = JSON.parse(content);
      const diagnosisMap = new Map(parsed.diagnoses.map(d => [d.id, d]));

      return issues.map(issue => {
        const diag = diagnosisMap.get(issue.id);
        return {
          ...issue,
          whatIsTheIssue: diag ? diag.whatIsTheIssue : `Issue detected: ${issue.title}`,
          howThisHappened: diag ? diag.howThisHappened : `Automated scan found this issue.`
        };
      });

    } catch (err) {
      console.error('[AIService] Failed to diagnose issues:', err);
      return issues.map(i => ({
        ...i,
        whatIsTheIssue: `Issue detected: ${i.title}`,
        howThisHappened: `Automated scan found this issue.`
      }));
    }
  }
}

export default new AIService();
