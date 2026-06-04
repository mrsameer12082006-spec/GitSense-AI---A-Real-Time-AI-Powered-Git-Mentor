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

    const systemPrompt = `You are GitSense AI — an intelligent Git repository assistant. You help developers understand their repository state, branch relationships, merge readiness, and suggest the safest next actions.

## Your Personality
- You are a senior developer mentor who explains things clearly
- You give beginner-friendly explanations with reasoning
- You always recommend the safest next action
- You are concise but thorough
- You use markdown formatting in your responses

## Connected Repository Context
${repoContext || 'No repository is currently connected. Ask the user to connect one.'}

## Response Format
You MUST respond in valid JSON with this exact structure:
{
  "text": "Your main response text (markdown supported)",
  "insight": "Optional analysis insight about the repo state",
  "recommendation": "Optional recommended next action",
  "codeBlock": "Optional code snippet to show",
  "commandBlock": "Optional git/terminal commands to suggest",
  "diff": "Optional diff view (use +/- prefixes for added/removed lines)"
}

Rules:
- "text" is ALWAYS required
- Other fields are optional — only include them when relevant
- For "commandBlock", write actual executable commands (one per line)
- For "codeBlock", include the file path as a comment on the first line
- For "diff", use standard unified diff format
- Keep responses focused and actionable
- If you don't know something, say so honestly
- Never fabricate repository data — only reference what's in the context above`;

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
