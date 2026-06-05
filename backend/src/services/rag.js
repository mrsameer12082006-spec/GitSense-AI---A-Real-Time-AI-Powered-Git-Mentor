import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const prisma = new PrismaClient();

class RAGService {
  /**
   * Parse PDF buffer and extract text content
   */
  async extractTextFromPdf(buffer) {
    try {
      const data = await pdfParse(buffer);
      return data.text || '';
    } catch (err) {
      console.error('[RAGService] PDF parsing failed:', err.message);
      throw new Error(`Failed to parse PDF document: ${err.message}`);
    }
  }

  /**
   * Split text into overlapping chunks
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
   * Process uploaded document and save chunks to Prisma
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
   * Retrieve matching chunks for a search query using TF-IDF term scoring
   */
  async retrieveRelevantChunks(query, limit = 5) {
    try {
      const chunks = await prisma.knowledgeChunk.findMany();
      if (chunks.length === 0) return [];

      // Split query into terms (exclude short filler words)
      const queryTerms = query
        .toLowerCase()
        .split(/\W+/)
        .filter(t => t.length > 2);
      
      if (queryTerms.length === 0) {
        return chunks.slice(0, limit); // fallback to first few chunks
      }

      const scoredChunks = chunks.map(chunk => {
        const contentLower = chunk.content.toLowerCase();
        let score = 0;

        queryTerms.forEach(term => {
          // Term occurrences in chunk
          const occurrences = contentLower.split(term).length - 1;
          if (occurrences > 0) {
            // Log term importance scaling by length
            score += occurrences * (1 + Math.log(term.length));
          }
        });
        return { chunk, score };
      });

      // Sort by similarity score, filter out non-matching chunks
      const relevant = scoredChunks
        .filter(sc => sc.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(sc => sc.chunk)
        .slice(0, limit);

      console.log(`[RAGService] Retrieved ${relevant.length} relevant chunks for query: "${query}"`);
      return relevant;
    } catch (err) {
      console.error('[RAGService] Error retrieving chunks:', err.message);
      return [];
    }
  }

  formatChunksForContext(chunks) {
    if (chunks.length === 0) return '';
    let text = '### PDF Knowledge Base Context (Git/GitHub Documentation Reference):\n';
    chunks.forEach(c => {
      text += `- File: ${c.filename}\n  Content:\n  """\n  ${c.content}\n  """\n\n`;
    });
    return text;
  }
}

export default new RAGService();
