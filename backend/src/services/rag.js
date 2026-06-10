// ─────────────────────────────────────────────────────────────
// GitSense AI — RAG Service (Vector-based codebase retrieval)
// ─────────────────────────────────────────────────────────────

import prisma from '../lib/prisma.js';
import { createRequire } from 'module';
import embeddingService from './embedding.js';
import aiService from './ai.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

class RAGService {
  /**
   * Parse PDF buffer and extract text content (for general document RAG)
   */
  async extractTextFromPdf(buffer) {
    let parser;
    try {
      parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      return result.text || '';
    } catch (err) {
      console.error('[RAGService] PDF parsing failed:', err.message);
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {});
      }
    }
  }

  /**
   * Split text into overlapping chunks (for general document RAG)
   */
  chunkText(text, filename, chunkSize = 800, overlap = 200) {
    const chunks = [];
    let i = 0;
    
    // Clean up excessive whitespace/newlines
    const cleanText = text.replace(/\s+/g, ' ');

    while (i < cleanText.length) {
      const chunk = cleanText.substring(i, i + chunkSize);
      chunks.push({
        filename,
        content: chunk.trim()
      });
      i += (chunkSize - overlap);
    }
    return chunks;
  }

  /**
   * Process uploaded PDF document and save chunks to Prisma (for general document RAG)
   */
  async addDocument(filename, buffer) {
    const text = await this.extractTextFromPdf(buffer);
    if (!text.trim()) {
      throw new Error('Document appears to be empty or has no readable text.');
    }

    console.log(`[RAGService] Parsing and chunking: "${filename}" (${text.length} characters)`);
    const chunks = this.chunkText(text, filename);
    console.log(`[RAGService] Generated ${chunks.length} chunks. Saving to database...`);
    
    await prisma.knowledgeChunk.createMany({
      data: chunks
    });
    console.log('[RAGService] Document saved successfully.');
    return chunks.length;
  }

  /**
   * Retrieve matching chunks for a search query using TF-IDF term scoring (Legacy general doc RAG)
   */
  async retrieveRelevantDocChunks(query, limit = 5) {
    try {
      const chunks = await prisma.knowledgeChunk.findMany();
      if (chunks.length === 0) return [];

      const queryTerms = query
        .toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 2);
      
      if (queryTerms.length === 0) {
        return chunks.slice(0, limit);
      }

      const scoredChunks = chunks.map(chunk => {
        const contentLower = chunk.content.toLowerCase();
        let score = 0;

        queryTerms.forEach(term => {
          const occurrences = contentLower.split(term).length - 1;
          if (occurrences > 0) {
            score += occurrences * (1 + Math.log(term.length));
          }
        });
        return { chunk, score };
      });

      return scoredChunks
        .filter(sc => sc.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(sc => sc.chunk)
        .slice(0, limit);
    } catch (err) {
      console.error('[RAGService] Error retrieving legacy doc chunks:', err.message);
      return [];
    }
  }

  /**
   * Vector-based retrieval for Repository chunks (Tatva-style)
   */
  async retrieveRelevantChunks(query, repositoryId, options = {}) {
    const limit = options.limit || 12;
    const threshold = options.threshold || 0.30;

    try {
      // 1. Embed user query
      const queryEmbedding = await embeddingService.embed(query);

      // 2. Load all chunks for repository
      const dbChunks = await prisma.repoChunk.findMany({
        where: { repositoryId },
      });

      if (dbChunks.length === 0) {
        console.log(`[RAGService] No chunks found in DB for repo ${repositoryId}`);
        return [];
      }

      // Calculate similarity scores for all chunks before filtering for debugging
      const allScored = dbChunks.map(chunk => {
        const chunkEmbedding = typeof chunk.embedding === 'string'
          ? JSON.parse(chunk.embedding)
          : chunk.embedding;
        return {
          sourceType: chunk.sourceType,
          path: chunk.sourceId,
          score: embeddingService.cosineSimilarity(queryEmbedding, chunkEmbedding)
        };
      });
      allScored.sort((a, b) => b.score - a.score);
      const topFiveBeforeFilter = allScored.slice(0, 5).map(s => `${s.sourceType} (${s.path}): ${s.score.toFixed(4)}`).join(', ');

      console.log(`[RAG DEBUG] Querying Repo ID: ${repositoryId}`);
      console.log(`[RAG DEBUG] Querying Prisma collection: repoChunk`);
      console.log(`[RAG DEBUG] Total chunks for repo in DB: ${dbChunks.length}`);
      console.log(`[RAG DEBUG] Top similarity scores before filter: ${topFiveBeforeFilter || 'None'}`);

      // 3. Compute similarities and sort
      const scored = embeddingService.search(queryEmbedding, dbChunks, limit, threshold);
      return scored.map(item => ({
        ...item.chunk,
        score: item.score,
      }));
    } catch (err) {
      console.error('[RAGService] Error in retrieveRelevantChunks:', err.message);
      return [];
    }
  }

  /**
   * Query expansion using LLM
   */
  async expandQuery(query) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a query expansion assistant. Generate 3 short alternative search queries or synonyms in plain English for a developer looking up information in a codebase repository. The alternatives should capture different ways a developer might ask about the same concept (e.g., "auth bugs", "login issues", "signin error"). Return ONLY a JSON array of strings (e.g. ["query1", "query2", "query3"]), and absolutely no other conversational text.',
        },
        {
          role: 'user',
          content: `Query to expand: "${query}"`,
        },
      ];

      const responseText = await aiService.generateCompletion(messages, 0.4);
      const startIdx = responseText.indexOf('[');
      const endIdx = responseText.lastIndexOf(']');
      
      if (startIdx !== -1 && endIdx !== -1) {
        const cleanJson = responseText.substring(startIdx, endIdx + 1);
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          return parsed.slice(0, 4);
        }
      }
    } catch (err) {
      console.warn('[RAGService] Query expansion failed, using original query only:', err.message);
    }
    return [query];
  }

  /**
   * Retrieve chunks with query expansion and intent boosting
   */
  async retrieveWithExpansion(query, repositoryId) {
    try {
      // 1. Get alternative query phrases
      const alternativeQueries = await this.expandQuery(query);
      if (!alternativeQueries.includes(query)) {
        alternativeQueries.unshift(query);
      }

      console.log('[RAGService] Query expansion results:', alternativeQueries);

      // 2. Fetch similarity search results in parallel
      const resultsPromises = alternativeQueries.map(q =>
        this.retrieveRelevantChunks(q, repositoryId, { limit: 10, threshold: 0.30 })
      );
      
      const resultsArrays = await Promise.all(resultsPromises);

      // 3. Deduplicate and take best score
      const uniqueChunks = new Map();
      for (const chunkList of resultsArrays) {
        for (const chunk of chunkList) {
          const existing = uniqueChunks.get(chunk.id);
          if (!existing || existing.score < chunk.score) {
            uniqueChunks.set(chunk.id, chunk);
          }
        }
      }

      let merged = Array.from(uniqueChunks.values());

      // 4. Apply intent boosting
      const lowerQuery = query.toLowerCase();
      const isFileSearch = lowerQuery.includes('file') || lowerQuery.includes('code') || lowerQuery.includes('implementation') || lowerQuery.includes('function') || lowerQuery.includes('class') || lowerQuery.includes('write') || lowerQuery.includes('read') || lowerQuery.includes('contents');
      const isCommitSearch = lowerQuery.includes('commit') || lowerQuery.includes('history') || lowerQuery.includes('changed') || lowerQuery.includes('who did') || lowerQuery.includes('author') || lowerQuery.includes('date') || lowerQuery.includes('recent changes');
      const isPRSearch = lowerQuery.includes('pr') || lowerQuery.includes('pull request') || lowerQuery.includes('merge') || lowerQuery.includes('review');
      const isIssueSearch = lowerQuery.includes('issue') || lowerQuery.includes('bug') || lowerQuery.includes('ticket') || lowerQuery.includes('error') || lowerQuery.includes('fail');

      merged = merged.map(chunk => {
        let boost = 0;
        if (isFileSearch && (chunk.sourceType === 'file' || chunk.sourceType === 'readme')) boost += 0.15;
        if (isCommitSearch && chunk.sourceType === 'commit') boost += 0.15;
        if (isPRSearch && chunk.sourceType === 'pr') boost += 0.15;
        if (isIssueSearch && chunk.sourceType === 'issue') boost += 0.15;

        // Base priority boosting
        if (chunk.priority === 3) boost += 0.10; // README
        if (chunk.priority === 2) boost += 0.05; // configs

        return {
          ...chunk,
          finalScore: chunk.score + boost,
        };
      });

      // Sort by final score
      merged.sort((a, b) => b.finalScore - a.finalScore);

      // Return top 12 chunks
      const finalSelection = merged.slice(0, 12);
      console.log(`[RAGService] Final retrieved ${finalSelection.length} chunks for repo ${repositoryId}.`);
      return finalSelection;
    } catch (err) {
      console.error('[RAGService] Error in retrieveWithExpansion:', err.message);
      return [];
    }
  }

  /**
   * Format repository chunks for RAG prompt context
   */
  formatChunksForContext(chunks) {
    if (!chunks || chunks.length === 0) {
      return 'No repository context available. Advise the user to verify if they connected and synced their repository.';
    }

    let text = '### CONNECTED REPOSITORY CONTEXT (AUTHENTIC CODE, COMMITS, PRs & ISSUES):\n';
    text += 'Use ONLY the following context to answer the user\'s question. Do not assume or hallucinate any details outside this data.\n\n';

    chunks.forEach((c, idx) => {
      let metaStr = '';
      try {
        const metadata = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : (c.metadata || {});
        metaStr = Object.entries(metadata)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
      } catch { /* ignore */ }

      text += `--- CHUNK ${idx + 1} | SOURCE: ${c.sourceType.toUpperCase()} | ID: ${c.sourceId}`;
      if (metaStr) text += ` | METADATA: [${metaStr}]`;
      text += ` ---\n${c.content}\n\n`;
    });

    return text;
  }
}

export default new RAGService();
