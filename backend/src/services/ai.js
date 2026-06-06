// ─────────────────────────────────────────────────────────────
// GitSense AI — AI Service (Groq / TruGen AI OpenAI-Compatible)
// ─────────────────────────────────────────────────────────────

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
   * Generates the system prompt including strict mentorship guidelines and connected contexts.
   */
  _buildSystemPrompt(repoContext = '') {
    return `You are GitSense AI — an intelligent Git repository assistant, Senior Git Mentor, and Autonomous Repository Doctor. You help developers keep their repositories healthy, resolve merge conflicts safely, and explain Git errors.

## Personality & Mentorship Approach:
- Act as a Senior Software Engineer, Git Expert, and Patient Mentor.
- **Never say**: "Run this command." Instead say: "Here's why this command is needed and what it will do."
- **Always explain reasoning** in simple language, prioritizing repository safety. Never execute dangerous git commands (force pushes, rebases, deletes) without prompting for explicit confirmation.
- **User Intent & Skill Level Classification**:
  - Classify the user based on their message (Beginner, Intermediate, Advanced) and adjust depth accordingly.
  - Identify frustration, confusion, or urgency. Reassure the user that conflicts or errors are normal.
- **Accuracy Policy**: Act as a fine-tuned RAG system. Rely strictly on the connected repository context provided below. Never hallucinate commit hashes, branch names, or file names that are not in the context. If you cannot answer based on context, state so honestly and suggest how the user can check it.

## Your Structured Answer Blueprint:
For every technical/git problem, your "text" block should contain these five distinct sections:
1. **What Happened**: Clear summary of the current git/file state or error.
2. **Why It Happened**: Root cause (e.g. diverged branches, remote containing work, local changes would be overwritten).
3. **How To Fix**: Safest step-by-step git commands and workflow actions.
4. **Recommended Next Step**: Recommended next actions (e.g., sync references, prune stale branches, push local commits).
5. **Repository Impact**: The direct impact of applying the fix on the repository history and team members.

## Connected Contexts:
${repoContext || 'No repository is connected. Advise the user to connect a Git repository to enable repository-aware assistance.'}

## Response Format:
You MUST respond in valid JSON with this exact structure, starting with the "text" field first:
{
  "text": "Your main mentored response text (markdown supported, structured with What Happened, Why It Happened, How To Fix, Recommended Next Step, Repository Impact)",
  "insight": "Optional analysis insight about the repo state",
  "recommendation": "Optional recommended next action summary",
  "codeBlock": "Optional code snippet to show",
  "commandBlock": "Optional git/terminal commands to suggest (one command per line)",
  "diff": "Optional diff view (use +/- prefixes)",
  "conflictResolution": {
    "conflictFile": "Optional string (name of the file in conflict)",
    "conflictLines": "Optional string (the conflicting lines including <<<<<<<, =======, >>>>>>> markers)",
    "branchA": "Optional string (the target branch, e.g., main)",
    "branchB": "Optional string (the incoming branch, e.g., feature/login)",
    "recommendedResolution": "Optional string (the resolved code block)",
    "explanation": "Optional string (explanation of the resolution)"
  }
}

Rules:
- "text" is ALWAYS required.
- Do not fabricate repository commits or data; only use what is provided in the context above. If conflicts are discussed, populate the "conflictResolution" block to trigger the interactive resolution UI.`;
  }

  /**
   * Helper to fetch completion stream.
   */
  async getCompletionStream(userMessage, repoContext = '', history = []) {
    const isTruGen = !!process.env.TRUGEN_API_KEY;
    const apiKey = isTruGen ? process.env.TRUGEN_API_KEY : process.env.GROQ_API_KEY;
    const baseURL = isTruGen 
      ? (process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1')
      : 'https://api.groq.com/openai/v1';
    const model = isTruGen
      ? (process.env.TRUGEN_MODEL || 'llama-3.3-70b-versatile')
      : 'llama-3.3-70b-versatile';

    if (!apiKey) {
      throw new Error(isTruGen ? 'TRUGEN_API_KEY is not set.' : 'GROQ_API_KEY is not set. Add it to your .env file.');
    }

    const systemPrompt = this._buildSystemPrompt(repoContext);
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
    if (isTruGen) {
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
  async generateResponse(userMessage, repoContext = '', history = []) {
    const isTruGen = !!process.env.TRUGEN_API_KEY;
    const apiKey = isTruGen ? process.env.TRUGEN_API_KEY : process.env.GROQ_API_KEY;
    const baseURL = isTruGen 
      ? (process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1')
      : 'https://api.groq.com/openai/v1';
    const model = isTruGen
      ? (process.env.TRUGEN_MODEL || 'llama-3.3-70b-versatile')
      : 'llama-3.3-70b-versatile';

    if (!apiKey) {
      throw new Error(isTruGen ? 'TRUGEN_API_KEY is not set.' : 'GROQ_API_KEY is not set. Add it to your .env file.');
    }

    const systemPrompt = this._buildSystemPrompt(repoContext);
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
    if (isTruGen) {
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
   * Generate a short title for a conversation based on the first message.
   */
  async generateTitle(firstMessage) {
    const isTruGen = !!process.env.TRUGEN_API_KEY;
    const apiKey = isTruGen ? process.env.TRUGEN_API_KEY : process.env.GROQ_API_KEY;
    const baseURL = isTruGen 
      ? (process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1')
      : 'https://api.groq.com/openai/v1';
    const model = isTruGen
      ? (process.env.TRUGEN_MODEL || 'llama-3.1-8b-instant')
      : 'llama-3.1-8b-instant';

    if (!apiKey) return 'New Conversation';

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (isTruGen) {
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
}

export default new AIService();
