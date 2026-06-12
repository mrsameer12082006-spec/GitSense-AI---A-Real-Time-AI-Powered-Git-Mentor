import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import aiService from './ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data file path
const DATA_DIR = path.join(__dirname, '../../data');
const LOG_FILE = path.join(DATA_DIR, 'ai_improvement_log.json');

class SelfImprovementService {
  constructor() {
    this.logs = [];
    this.appliedPatches = [];
  }

  /**
   * Initializes the service by loading the log file.
   */
  async init() {
    try {
      // Ensure data directory exists
      await fs.mkdir(DATA_DIR, { recursive: true });

      try {
        const fileContent = await fs.readFile(LOG_FILE, 'utf8');
        const data = JSON.parse(fileContent);
        this.logs = data.logs || [];
        this.appliedPatches = data.appliedPatches || [];
        console.log(`[SelfImprovement] Loaded ${this.logs.length} logs and ${this.appliedPatches.length} prompt patches from previous session.`);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.log('[SelfImprovement] No log file found. Starting fresh.');
          await this._saveToFile();
        } else {
          console.error('[SelfImprovement] Error parsing log file:', err.message);
        }
      }
    } catch (err) {
      console.error('[SelfImprovement] Init error:', err.message);
    }
  }

  /**
   * Returns all applied prompt patches.
   */
  getAppliedPatches() {
    return this.appliedPatches;
  }

  /**
   * Evaluates an AI response silently post-generation.
   */
  async evaluateAndLog(userMessage, aiResponse, repoContext = '', detectedStyle = {}) {
    try {
      const evaluationPrompt = `You are an expert AI response quality auditor. Your job is to grade the Assistant's response to the User's message.
User Message: "${userMessage}"
AI Response: "${aiResponse}"
Available Repo Context: "${repoContext ? repoContext.substring(0, 1000) + '... (truncated)' : 'None'}"
Detected Tone/Style: ${JSON.stringify(detectedStyle)}

Score the response from 0 to 100 on the following 4 dimensions:
1. relevance (0-100): Did it answer exactly what was asked?
2. completeness (0-100): Did it cover all parts of the user's question?
3. accuracy (0-100): Was it factually correct and grounded in the repo context?
4. tone_match (0-100): Did it match the user's communication style (e.g. Hinglish, casual, technical)?

You MUST return ONLY a valid JSON object matching this structure:
{
  "relevance": 95,
  "completeness": 90,
  "accuracy": 100,
  "tone_match": 85
}
Output ONLY the JSON object. Do not include markdown code block wrappers (like \`\`\`json) or any conversational text.`;

      const responseText = await aiService.generateCompletion([
        { role: 'system', content: evaluationPrompt }
      ], 0.1);

      let scores = { relevance: 80, completeness: 80, accuracy: 80, tone_match: 80 };
      try {
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
        cleaned = cleaned.trim();
        scores = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error('[SelfImprovement] Failed to parse evaluation scores JSON:', parseErr.message);
      }

      // Determine if flagged
      const isFlagged = scores.relevance < 70 || scores.completeness < 70 || scores.accuracy < 70 || scores.tone_match < 70;

      const logEntry = {
        id: Math.random().toString(36).substring(2, 11),
        timestamp: Date.now(),
        userMessage,
        aiResponse,
        scores,
        flagged: isFlagged
      };

      this.logs.push(logEntry);
      await this._saveToFile();

      if (isFlagged) {
        console.warn(`[SelfImprovement] Flagged low-quality response (Scores: R:${scores.relevance} C:${scores.completeness} A:${scores.accuracy} T:${scores.tone_match})`);
      }
    } catch (err) {
      console.error('[SelfImprovement] Error during response evaluation:', err.message);
    }
  }

  /**
   * Logs a explicit failure or success signal.
   */
  async logSignal(conversationId, type, details = {}) {
    try {
      // Find the last logged exchange in logs and update it
      // Since logs are appended, search from end
      for (let i = this.logs.length - 1; i >= 0; i--) {
        // If details match the conversation or user message
        if (details.userMessage && this.logs[i].userMessage === details.userMessage) {
          if (type === 'failure') {
            this.logs[i].flagged = true;
            this.logs[i].scores.relevance = Math.min(this.logs[i].scores.relevance, 50);
            this.logs[i].scores.completeness = Math.min(this.logs[i].scores.completeness, 50);
            this.logs[i].signal = 'explicit_user_failure';
          } else if (type === 'success') {
            this.logs[i].signal = 'explicit_user_success';
            // reinforce scores
            this.logs[i].scores.relevance = Math.max(this.logs[i].scores.relevance, 95);
            this.logs[i].scores.completeness = Math.max(this.logs[i].scores.completeness, 95);
          }
          await this._saveToFile();
          break;
        }
      }
    } catch (err) {
      console.error('[SelfImprovement] Error logging signal:', err.message);
    }
  }

  /**
   * Extracts a session-specific correction rule from user correction feedback.
   */
  async extractCorrectionRule(prevUserMsg, prevAiResponse, currentCorrectionMsg) {
    try {
      const correctionPrompt = `The user is correcting the assistant's previous message.
Previous User Message: "${prevUserMsg}"
Assistant's Reply: "${prevAiResponse}"
User's Correction Signal: "${currentCorrectionMsg}"

Analyze what the assistant did wrong and write a clear, highly specific instruction rule (max 2 sentences) to prevent this mistake from happening again.
For example: "When explaining commits, always list the hashes next to the messages." or "If the user uses Hinglish, reply with Hinglish instead of pure English."

Output ONLY the correction instruction text. Do not write any wrappers or introduction.`;

      const rule = await aiService.generateCompletion([
        { role: 'system', content: correctionPrompt }
      ], 0.2);

      console.log('[SelfImprovement] Extracted session correction rule:', rule.trim());
      return rule.trim();
    } catch (err) {
      console.error('[SelfImprovement] Error extracting correction rule:', err.message);
      return `When answering, ensure you address the user's specific complaint: "${currentCorrectionMsg}".`;
    }
  }

  /**
   * Runs background analysis job to read flagged logs and generate prompt patches.
   */
  async runBackgroundAnalysis() {
    try {
      const flagged = this.logs.filter(l => l.flagged).slice(-50);
      if (flagged.length === 0) {
        console.log('[SelfImprovement Background Job] No flagged low-quality logs to analyze.');
        return;
      }

      console.log(`[SelfImprovement Background Job] Analyzing last ${flagged.length} flagged failures...`);

      const analysisPrompt = `You are a system prompt engineering expert. You are auditing a set of low-quality conversation logs from an AI coding mentor.
Analyze these failure cases and identify the common patterns (e.g. failing multi-part questions, generic readmes, dropping Hinglish language context, or outputting command blocks incorrectly).

Here are the flagged logs (User message, Assistant response, and failing scores):
${JSON.stringify(flagged.map(l => ({ msg: l.userMessage, reply: l.aiResponse, scores: l.scores })), null, 2)}

Generate a markdown list of rules/guidelines that should be appended to the active system prompt to patch and correct these common failure patterns.

You MUST return ONLY a valid JSON object matching this structure:
{
  "explanation": "Summary of identified failure patterns and why this patch fixes them.",
  "patch": "- Guidance rule 1\\n- Guidance rule 2"
}
Output ONLY the JSON object. Do not include markdown code block wrappers (like \`\`\`json) or any conversational text.`;

      const responseText = await aiService.generateCompletion([
        { role: 'system', content: analysisPrompt }
      ], 0.2);

      let result;
      try {
        let cleaned = responseText.trim();
        if (cleaned.startsWith('```json')) cleaned = cleaned.substring(7);
        if (cleaned.startsWith('```')) cleaned = cleaned.substring(3);
        if (cleaned.endsWith('```')) cleaned = cleaned.substring(0, cleaned.length - 3);
        cleaned = cleaned.trim();
        result = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error('[SelfImprovement Background Job] Failed to parse analysis results JSON:', parseErr.message);
        return;
      }

      if (result.patch) {
        const patchEntry = {
          timestamp: Date.now(),
          pattern: result.explanation,
          patch: result.patch
        };

        this.appliedPatches.push(patchEntry);
        await this._saveToFile();
        console.log(`[SelfImprovement Background Job] Successfully generated and applied prompt patch for pattern: "${result.explanation}"`);
      }
    } catch (err) {
      console.error('[SelfImprovement Background Job] Error during background analysis run:', err.message);
    }
  }

  /**
   * Starts the 30-minute background analysis interval.
   */
  startInterval() {
    console.log('[SelfImprovement] Background analysis interval job started (every 30 minutes).');
    setInterval(async () => {
      try {
        console.log('[SelfImprovement] Running scheduled 30-minute self-improvement check...');
        await this.runBackgroundAnalysis();
      } catch (err) {
        console.error('[SelfImprovement] Scheduled background run failed:', err.message);
      }
    }, 30 * 60 * 1000);
  }

  /**
   * Saves logs and patches to the JSON file.
   */
  async _saveToFile() {
    try {
      const data = {
        logs: this.logs,
        appliedPatches: this.appliedPatches
      };
      await fs.writeFile(LOG_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[SelfImprovement] Error saving to log file:', err.message);
    }
  }
}

export default new SelfImprovementService();
