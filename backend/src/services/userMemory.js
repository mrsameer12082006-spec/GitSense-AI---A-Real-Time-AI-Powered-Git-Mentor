import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class UserMemoryService {
  /**
   * Builds context of the user's past chats across different sessions
   */
  async buildCrossConversationContext(userId, currentConversationId = null) {
    try {
      const conversations = await prisma.conversation.findMany({
        where: { 
          userId,
          NOT: currentConversationId ? { id: currentConversationId } : undefined
        },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 4 // Get first few messages to extract topics
          }
        }
      });

      if (conversations.length === 0) return '';

      let context = '### User\'s Cross-Conversation Memory (What we discussed in other threads):\n';
      conversations.forEach((c) => {
        context += `- Topic Thread: "${c.title}" (Last updated: ${c.updatedAt.toDateString()})\n`;
        const userQueries = c.messages.filter(m => m.role === 'user').map(m => m.content);
        if (userQueries.length > 0) {
          context += `  * User asked about: ${userQueries.slice(0, 2).map(q => `"${q.substring(0, 70)}..."`).join(', ')}\n`;
        }
      });
      return context + '\n';
    } catch (err) {
      console.error('[UserMemory] Error building cross-conversation context:', err.message);
      return '';
    }
  }

  /**
   * Builds context of the past chats specifically for the connected repository
   */
  async buildRepositoryMemoryContext(userId, repositoryId) {
    if (!repositoryId) return '';

    try {
      const conversations = await prisma.conversation.findMany({
        where: { userId, repositoryId },
        orderBy: { updatedAt: 'desc' },
        take: 3,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 3 // Retrieve the last exchange
          }
        }
      });

      if (conversations.length === 0) return '';

      let context = '### Repository-Specific Memory (Previous discussions for this repo):\n';
      conversations.forEach((c) => {
        context += `- Conversation: "${c.title}"\n`;
        const exchanges = [...c.messages].reverse();
        exchanges.forEach(m => {
          context += `  * ${m.role === 'user' ? 'User asked' : 'AI answered'}: "${m.content.substring(0, 80)}..."\n`;
        });
      });
      return context + '\n';
    } catch (err) {
      console.error('[UserMemory] Error building repo memory:', err.message);
      return '';
    }
  }
}

export default new UserMemoryService();
