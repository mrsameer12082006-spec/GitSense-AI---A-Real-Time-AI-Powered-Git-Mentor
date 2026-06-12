import { PrismaClient } from '@prisma/client';
import aiService from './ai.js';

const prisma = new PrismaClient();

class UserMemoryService {
  /**
   * Fetches the user's memory profile from the database.
   * If it doesn't exist, initializes it.
   */
  async getUserMemory(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { memoryProfile: true }
      });

      if (user?.memoryProfile) {
        try {
          return JSON.parse(user.memoryProfile);
        } catch (parseErr) {
          console.error('[UserMemory] Error parsing memory profile JSON:', parseErr.message);
        }
      }

      // Return default empty profile if none exists or parsing failed
      return {
        userId,
        technicalProfile: {},
        repoKnowledge: {},
        communicationStyle: {},
        corrections: [],
        preferences: [],
        skillLevel: 'intermediate',
        lastUpdated: Date.now()
      };
    } catch (err) {
      console.error('[UserMemory] Error fetching memory profile:', err.message);
      return {
        userId,
        technicalProfile: {},
        repoKnowledge: {},
        communicationStyle: {},
        corrections: [],
        preferences: [],
        skillLevel: 'intermediate',
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Saves the memory profile to the database.
   */
  async saveUserMemory(userId, profile) {
    try {
      profile.lastUpdated = Date.now();
      await prisma.user.update({
        where: { id: userId },
        data: { memoryProfile: JSON.stringify(profile) }
      });
      return true;
    } catch (err) {
      console.error('[UserMemory] Error saving memory profile:', err.message);
      return false;
    }
  }

  /**
   * Extracts learnings from the specified conversation and merges them into the user's memory profile.
   */
  async extractAndSaveMemory(userId, conversationId) {
    if (!conversationId) return;

    try {
      // Fetch conversation messages
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation || !conversation.messages || conversation.messages.length < 2) {
        // Not enough messages to extract memory
        return;
      }

      // Get existing profile
      const currentProfile = await this.getUserMemory(userId);

      // Build message log text for the LLM (limit to last 15 messages to stay within token context budgets)
      const recentMessages = conversation.messages.slice(-15);
      const chatLog = recentMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const systemPrompt = `You are an expert AI memory extractor. Your job is to analyze a conversation log between a developer (User) and an AI Coding Assistant.
Identify new user details and merge them with the existing memory profile without overwriting old details unless the user explicitly changed their preference or corrected a previous detail.

Here is the existing user memory profile:
${JSON.stringify(currentProfile, null, 2)}

Here is the recent conversation history:
${chatLog}

Perform the extraction of the following details:
1. Technical preferences (languages they use, frameworks they prefer, coding style they follow).
2. Common problems they face in their repos (e.g. merge conflicts, CI failures, rate limits, secret exposure).
3. Their communication style and language preference (e.g. English, Hinglish, casual, technical).
4. Repos they work with most and what those repos do.
5. Things they have explicitly taught the AI or corrected it on (rules or corrections).
6. Their skill level based on the questions they ask (e.g. beginner, intermediate, advanced).

Output the updated, complete memory profile. Do NOT overwrite existing preferences/details unless explicitly contradicted or updated in the conversation log.
You MUST output ONLY a valid JSON object matching this structure:
{
  "userId": "${userId}",
  "technicalProfile": {
    "languages": ["JavaScript", "Python"],
    "frameworks": ["React", "Express"],
    "codingStyle": ["camelCase", "functional programming"]
  },
  "repoKnowledge": {
    "owner/repo": "Description of what it does and user's role"
  },
  "communicationStyle": {
    "preferredLanguage": "English",
    "tone": "casual"
  },
  "corrections": ["AI was told not to suggest force push", "AI was corrected on branch naming"],
  "preferences": ["Prefer detailed code comments"],
  "skillLevel": "beginner | intermediate | advanced"
}

Output ONLY the JSON object. Do not include markdown code block wrappers (like \`\`\`json) or any extra conversational text.`;

      console.log(`[UserMemory] Extracting memory from conversation ${conversationId} for user ${userId}...`);
      const responseText = await aiService.generateCompletion([
        { role: 'system', content: systemPrompt }
      ], 0.2);

      let updatedProfile;
      try {
        // Clean up markdown block formatting if present
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith('```json')) {
          cleanedResponse = cleanedResponse.substring(7);
        }
        if (cleanedResponse.startsWith('```')) {
          cleanedResponse = cleanedResponse.substring(3);
        }
        if (cleanedResponse.endsWith('```')) {
          cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3);
        }
        cleanedResponse = cleanedResponse.trim();
        updatedProfile = JSON.parse(cleanedResponse);
      } catch (parseErr) {
        console.error('[UserMemory] LLM did not return valid JSON for memory extraction:', parseErr.message);
        console.debug('[UserMemory] LLM output was:', responseText);
        return;
      }

      // Ensure userId remains correct
      updatedProfile.userId = userId;

      // Merge arrays to guarantee we don't lose old corrections or preferences
      const mergeArrays = (oldArr, newArr) => {
        const set = new Set([...(oldArr || []), ...(newArr || [])]);
        return Array.from(set);
      };

      updatedProfile.corrections = mergeArrays(currentProfile.corrections, updatedProfile.corrections);
      updatedProfile.preferences = mergeArrays(currentProfile.preferences, updatedProfile.preferences);

      // Merge technical profiles
      updatedProfile.technicalProfile = updatedProfile.technicalProfile || {};
      updatedProfile.technicalProfile.languages = mergeArrays(
        currentProfile.technicalProfile?.languages,
        updatedProfile.technicalProfile?.languages
      );
      updatedProfile.technicalProfile.frameworks = mergeArrays(
        currentProfile.technicalProfile?.frameworks,
        updatedProfile.technicalProfile?.frameworks
      );
      updatedProfile.technicalProfile.codingStyle = mergeArrays(
        currentProfile.technicalProfile?.codingStyle,
        updatedProfile.technicalProfile?.codingStyle
      );

      // Merge repoKnowledge
      updatedProfile.repoKnowledge = {
        ...(currentProfile.repoKnowledge || {}),
        ...(updatedProfile.repoKnowledge || {})
      };

      // Save the merged memory profile
      await this.saveUserMemory(userId, updatedProfile);
      console.log('[UserMemory] Memory profile successfully extracted and saved.');

    } catch (err) {
      console.error('[UserMemory] Error in extractAndSaveMemory:', err.message);
    }
  }

  // Backup of old methods for compatibility
  async buildCrossConversationContext(userId, currentConversationId = null) {
    try {
      const profile = await this.getUserMemory(userId);
      if (!profile) return '';
      
      let context = '### User\'s Cross-Conversation Memory (Technical Profile & Preferences):\n';
      context += `- Skill Level: ${profile.skillLevel || 'intermediate'}\n`;
      if (profile.technicalProfile?.languages?.length) {
        context += `- Languages preferred: ${profile.technicalProfile.languages.join(', ')}\n`;
      }
      if (profile.technicalProfile?.frameworks?.length) {
        context += `- Frameworks preferred: ${profile.technicalProfile.frameworks.join(', ')}\n`;
      }
      if (profile.technicalProfile?.codingStyle?.length) {
        context += `- Coding style preferences: ${profile.technicalProfile.codingStyle.join(', ')}\n`;
      }
      if (profile.preferences?.length) {
        context += `- General preferences: ${profile.preferences.join(', ')}\n`;
      }
      if (profile.corrections?.length) {
        context += `- Things you have been corrected on: ${profile.corrections.join(', ')}\n`;
      }
      return context + '\n';
    } catch (err) {
      return '';
    }
  }

  async buildRepositoryMemoryContext(userId, repositoryId) {
    return '';
  }
}

export default new UserMemoryService();
