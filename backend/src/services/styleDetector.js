// ─────────────────────────────────────────────────────────────
// GitSense AI — Style Detector (Conversational Style Mirror)
//
// Analyzes user messages to detect communication style signals
// (Hinglish, casual, technical, emoji, verbosity) and generates
// a dynamic system prompt instruction so the AI mirrors the
// user's natural tone.
// ─────────────────────────────────────────────────────────────

// ── Hinglish vocabulary (weighted) ──
const HINGLISH_STRONG = [
  'bhai', 'yaar', 'kya', 'nahi', 'accha', 'theek', 'matlab',
  'samjha', 'dekho', 'bata', 'kaise', 'kyu', 'kyun', 'arey',
  'haan', 'suno', 'batao', 'chal', 'chalo', 'karo', 'bolo',
  'pata', 'rehne', 'apna', 'uska', 'iska', 'woh', 'yeh',
  'abhi', 'fir', 'phir', 'lekin', 'magar', 'toh', 'na',
  'kuch', 'sab', 'bahut', 'zyada', 'thoda', 'acha',
];

const HINGLISH_LIGHT = [
  'hai', 'kar', 'ek', 'bas', 'bol', 'hoga', 'sahi', 'aur',
  'wala', 'mein', 'ko', 'se', 'pe', 'ka', 'ki', 'ke',
  'ho', 'hota', 'karna', 'raha', 'rahi', 'gaya', 'gayi',
  'dena', 'lena', 'jao', 'aa', 'lo', 'do',
];

// ── Casual slang vocabulary ──
const CASUAL_SLANG = [
  'yk', 'ngl', 'tbh', 'rn', 'ur', 'lol', 'lmao', 'bruh',
  'fr', 'idk', 'smh', 'omg', 'wth', 'wtf', 'imo', 'imho',
  'btw', 'fyi', 'ikr', 'nvm', 'dm', 'asap', 'rofl', 'ty',
  'thx', 'pls', 'plz', 'gonna', 'wanna', 'gotta', 'kinda',
  'sorta', 'tho', 'cuz', 'coz', 'prolly', 'lowkey', 'highkey',
  'vibe', 'vibes', 'sus', 'slay', 'bet', 'cap', 'nocap',
  'yep', 'nope', 'yeah', 'yea', 'nah', 'haha', 'hehe',
  'okk', 'okie', 'hmm', 'ahh', 'ohh',
];

// ── Technical signal patterns ──
const TECHNICAL_PATTERNS = [
  /`[^`]+`/,                           // inline code
  /```[\s\S]*?```/,                    // code blocks
  /\b(function|const|let|var|class|import|export|return|async|await)\b/,
  /\b(npm|yarn|pip|cargo|docker|kubectl|git)\s/i,
  /\b(api|http|https|get|post|put|patch|delete|endpoint)\b/i,
  /\b(error|exception|stack\s?trace|bug|crash|fail|undefined|null|NaN)\b/i,
  /\b\w+\.\w+\.\w+/,                  // dotted paths like obj.prop.method
  /\b\w+\([^)]*\)/,                    // function calls
  /[A-Z][a-z]+[A-Z]\w*/,              // camelCase
  /\b\w+_\w+\b/,                      // snake_case
  /\.(js|ts|jsx|tsx|py|go|java|rs|rb|css|html|json|yml|yaml|md|sh)\b/i,
  /\b(localhost|127\.0\.0\.1|port\s?\d+)\b/i,
  /\b(src|dist|build|node_modules|package\.json|tsconfig)\b/i,
];

// ── Emoji regex (simplified Unicode range detection) ──
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;


class StyleDetector {
  /**
   * Analyze the last N user messages and return a style profile.
   * @param {string[]} messages — array of raw user message strings (last 3 recommended)
   * @returns {{ hinglish: number, casual: number, technical: number, emojiHeavy: boolean, lengthPreference: string, confidence: string }}
   */
  detectStyle(messages) {
    if (!messages || messages.length === 0) {
      return this._defaultProfile();
    }

    const combined = messages.join(' ');
    const words = combined.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length || 1;

    // ── Signal 1: Hinglish ──
    const hinglishScore = this._scoreHinglish(words, totalWords);

    // ── Signal 2: Casual ──
    const casualScore = this._scoreCasual(messages, words, totalWords);

    // ── Signal 3: Technical ──
    const technicalScore = this._scoreTechnical(combined);

    // ── Signal 4: Emoji ──
    const emojiHeavy = this._detectEmoji(combined, totalWords);

    // ── Signal 5: Length preference ──
    const lengthPreference = this._detectLengthPreference(messages);

    // Confidence
    const maxScore = Math.max(hinglishScore, casualScore, technicalScore);
    const confidence = maxScore > 0.5 ? 'high' : maxScore > 0.25 ? 'medium' : 'low';

    return {
      hinglish: Math.round(hinglishScore * 100) / 100,
      casual: Math.round(casualScore * 100) / 100,
      technical: Math.round(technicalScore * 100) / 100,
      emojiHeavy,
      lengthPreference,
      confidence,
    };
  }

  /**
   * Build a system prompt instruction string from a style profile.
   * @param {{ hinglish: number, casual: number, technical: number, emojiHeavy: boolean, lengthPreference: string }} profile
   * @returns {string}
   */
  buildStyleInstruction(profile) {
    if (!profile || profile.confidence === 'low') {
      return ''; // No style adaptation for low-confidence profiles
    }

    const instructions = [];

    // ── Hinglish adaptation ──
    if (profile.hinglish >= 0.4) {
      instructions.push(
        `The user is speaking in Hinglish (Hindi-English mix). Mirror this style naturally by using occasional Hinglish phrases like "dekh", "sahi hai", "theek hai", "bhai", "yaar", "matlab", "bas". Do NOT overdo it — keep it light and natural, like a bilingual developer colleague chatting casually. Mix Hindi words into English sentences organically. Example: "Yeh file mein ek issue hai — let me explain kya ho raha hai."`
      );
    } else if (profile.hinglish >= 0.2) {
      instructions.push(
        `The user occasionally uses Hindi words. Lightly mirror this by using very occasional Hindi words like "theek hai" or "sahi" when it feels natural, but keep responses primarily in English.`
      );
    }

    // ── Casual adaptation ──
    if (profile.casual >= 0.5) {
      instructions.push(
        `The user writes very casually — lowercase, no punctuation, short sentences, slang. Match this energy: skip formal structure, use contractions, write like a friend texting. Don't use headers or bullet points unless truly needed. Keep it conversational and chill. Example: "yeah so basically the issue is in your auth middleware — it's not checking the token expiry properly".`
      );
    } else if (profile.casual >= 0.3) {
      instructions.push(
        `The user writes in a relaxed, semi-casual style. Be friendly and approachable but still structured. Use contractions freely. Skip overly formal language.`
      );
    }

    // ── Technical adaptation ──
    if (profile.technical >= 0.5) {
      instructions.push(
        `The user is speaking technically — they mention code, APIs, errors, or specific files. Be precise and direct. Use code blocks, show exact commands, reference specific files and line numbers. Skip small talk and get to the point. Lead with the answer, then explain.`
      );
    } else if (profile.technical >= 0.25) {
      instructions.push(
        `The user mixes technical and non-technical language. Include code examples when relevant but explain them briefly.`
      );
    }

    // ── Emoji adaptation ──
    if (profile.emojiHeavy) {
      instructions.push(
        `The user uses emojis frequently. Include relevant emojis in your responses naturally (✅, 🔥, 💡, ⚠️, 🚀, 👀, 🎯, etc.) to match their communication style. Don't overdo it — 2-4 emojis per response is ideal.`
      );
    }

    // ── Length adaptation ──
    if (profile.lengthPreference === 'concise') {
      instructions.push(
        `The user writes short messages. Keep your responses concise and to-the-point. Avoid long explanations unless necessary. Aim for brevity.`
      );
    } else if (profile.lengthPreference === 'verbose') {
      instructions.push(
        `The user writes detailed messages. Feel free to provide thorough, detailed explanations with examples and context.`
      );
    }

    if (instructions.length === 0) return '';

    return `## RULE 3 — COMMUNICATION STYLE ADAPTATION\nYou must adapt your communication style to match the user's tone and writing style detected from their recent messages.\n${instructions.join('\n')}`;
  }

  // ─── Private scoring methods ───────────────────────────────

  _scoreHinglish(words, totalWords) {
    let strongHits = 0;
    let lightHits = 0;

    for (const word of words) {
      // Strip common punctuation
      const clean = word.replace(/[.,!?;:'"()]/g, '');
      if (HINGLISH_STRONG.includes(clean)) strongHits++;
      if (HINGLISH_LIGHT.includes(clean)) lightHits++;
    }

    // Strong hits are weighted 2x, light hits 1x
    const rawScore = (strongHits * 2 + lightHits) / totalWords;
    return Math.min(1, rawScore * 3); // Scale up, cap at 1
  }

  _scoreCasual(messages, words, totalWords) {
    let score = 0;

    // Check 1: All-lowercase ratio
    const allText = messages.join(' ');
    const uppercaseCount = (allText.match(/[A-Z]/g) || []).length;
    const lowercaseRatio = 1 - (uppercaseCount / Math.max(allText.length, 1));
    if (lowercaseRatio > 0.95) score += 0.3;

    // Check 2: Missing punctuation at end of messages
    const noPunctuationCount = messages.filter(m => !/[.!?]$/.test(m.trim())).length;
    if (noPunctuationCount >= messages.length * 0.7) score += 0.2;

    // Check 3: Slang word ratio
    let slangHits = 0;
    for (const word of words) {
      const clean = word.replace(/[.,!?;:'"()]/g, '');
      if (CASUAL_SLANG.includes(clean)) slangHits++;
    }
    score += Math.min(0.4, (slangHits / totalWords) * 5);

    // Check 4: Short average sentence length
    const avgSentenceLen = messages.reduce((acc, m) => acc + m.split(/\s+/).length, 0) / messages.length;
    if (avgSentenceLen < 12) score += 0.15;

    // Check 5: Informal "u" instead of "you", "r" instead of "are"
    const informalPronouns = words.filter(w => ['u', 'ur', 'r', 'y', 'dis', 'dat'].includes(w)).length;
    if (informalPronouns > 0) score += 0.15;

    return Math.min(1, score);
  }

  _scoreTechnical(text) {
    let hits = 0;
    for (const pattern of TECHNICAL_PATTERNS) {
      if (pattern.test(text)) hits++;
    }
    // Normalize: if 5+ patterns match, it's very technical
    return Math.min(1, hits / 5);
  }

  _detectEmoji(text, totalWords) {
    const emojiMatches = text.match(EMOJI_REGEX) || [];
    // If more than 1 emoji per 15 words, consider it emoji-heavy
    return emojiMatches.length > 0 && (emojiMatches.length / totalWords) > (1 / 15);
  }

  _detectLengthPreference(messages) {
    const avgWords = messages.reduce((acc, m) => acc + m.split(/\s+/).length, 0) / messages.length;
    if (avgWords < 30) return 'concise';
    if (avgWords > 80) return 'verbose';
    return 'moderate';
  }

  _defaultProfile() {
    return {
      hinglish: 0,
      casual: 0,
      technical: 0,
      emojiHeavy: false,
      lengthPreference: 'moderate',
      confidence: 'low',
    };
  }
}

export default new StyleDetector();
