import Groq from 'groq-sdk';

/**
 * AI Service — handles interactions with the Groq API (LLaMA models).
 * 
 * Returns structured responses matching the frontend's expected format:
 * { text, insight?, recommendation?, codeBlock?, commandBlock?, diff? }
 */
class AIService {
  constructor() {
    this.client = null;
    this.model = 'llama-3.3-70b-versatile';
  }

  _getClient() {
    if (!this.client) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('GROQ_API_KEY is not set. Add it to your .env file.');
      }
      this.client = new Groq({ apiKey });
    }
    return this.client;
  }

  /**
   * Generate an AI response given a user message, repo context, and conversation history.
   * 
   * @param {string} userMessage — the user's current message
   * @param {string} repoContext — structured repository context string
   * @param {Array<{role: string, content: string}>} history — previous messages in conversation
   * @returns {Promise<object>} — structured response object
   */
  async generateResponse(userMessage, repoContext = '', history = []) {
    const client = this._getClient();

    const systemPrompt = `You are GitSense AI — an intelligent Git repository assistant, Senior Git Mentor, and Autonomous Repository Doctor. You help developers keep their repositories healthy, resolve merge conflicts safely, and explain Git errors.

## Personality & Mentorship Approach:
- Act as a Senior Software Engineer, Git Expert, and Patient Mentor.
- **Never say**: "Run this command." Instead say: "Here's why this command is needed and what it will do."
- **Always explain reasoning** in simple language, prioritizing repository safety. Never execute dangerous git commands (force pushes, rebases, deletes) without prompting for explicit confirmation.
- **User Intent & Skill Level Classification**:
  - Classify the user based on their message (Beginner, Intermediate, Advanced) and adjust depth accordingly.
  - Identify frustration, confusion, or urgency. Reassure the user that conflicts or errors are normal.

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
You MUST respond in valid JSON with this exact structure:
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

    // Build message history
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 exchanges max)
    const recentHistory = history.slice(-20);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.role === 'assistant' && msg.metadata
          ? JSON.stringify(msg.metadata)
          : msg.content,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    try {
      const completion = await client.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '';

      // Parse JSON response
      try {
        const parsed = JSON.parse(responseText);
        return {
          text: parsed.text || 'I apologize, I could not generate a response.',
          insight: parsed.insight || null,
          recommendation: parsed.recommendation || null,
          codeBlock: parsed.codeBlock || null,
          commandBlock: parsed.commandBlock || null,
          diff: parsed.diff || null,
        };
      } catch {
        // If AI didn't return valid JSON, wrap the raw text
        return {
          text: responseText,
          insight: null,
          recommendation: null,
          codeBlock: null,
          commandBlock: null,
          diff: null,
        };
      }
    } catch (err) {
      console.error('[AI] Groq API error:', err);
      if (err.message?.includes('API key') || err.message?.includes('ApiKey') || err.message?.includes('unauthorized')) {
        throw new Error('Groq API key is invalid or missing.');
      }
      if (err.status === 429) {
        throw new Error('Groq API rate limit exceeded.');
      }
      throw new Error(`Groq API Error: ${err.message || String(err)}`);
    }
  }

  /**
   * Generate a short title for a conversation based on the first message.
   */
  async generateTitle(firstMessage) {
    try {
      const client = this._getClient();
      const completion = await client.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'Generate a very short title (max 6 words) for a git-related conversation that starts with the message below. Return only the title text, nothing else.',
          },
          { role: 'user', content: firstMessage },
        ],
        temperature: 0.5,
        max_tokens: 20,
      });
      return completion.choices[0]?.message?.content?.trim() || 'New Conversation';
    } catch {
      // Fallback: use first 30 chars of message
      return firstMessage.length > 30
        ? firstMessage.substring(0, 30) + '...'
        : firstMessage;
    }
  }
}

export default new AIService();
