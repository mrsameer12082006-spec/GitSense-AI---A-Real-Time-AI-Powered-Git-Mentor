// ─────────────────────────────────────────────────────────────
// GitSense AI — Embedding Service (Local Vector Embeddings)
// Uses @xenova/transformers to run all-MiniLM-L6-v2 in Node.js
// ─────────────────────────────────────────────────────────────

let pipeline = null;
let embedder = null;

/**
 * Lazy-load the embedding pipeline on first use.
 * Downloads the model (~30MB) on first run, cached thereafter.
 */
async function getEmbedder() {
  if (embedder) return embedder;

  try {
    // Dynamic import for ESM compatibility
    const { pipeline: pipelineFn } = await import('@xenova/transformers');
    pipeline = pipelineFn;

    console.log('[Embedding] Loading all-MiniLM-L6-v2 model (first time may download ~30MB)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true, // Use quantized version for speed
    });
    console.log('[Embedding] Model loaded successfully.');
    return embedder;
  } catch (err) {
    console.error('[Embedding] Failed to load model:', err.message);
    throw new Error(`Embedding model failed to load: ${err.message}`);
  }
}

class EmbeddingService {
  /**
   * Generate embedding for a single text string.
   * @param {string} text
   * @returns {Promise<number[]>} 384-dimensional float array
   */
  async embed(text) {
    const model = await getEmbedder();
    const cleanText = text.replace(/\s+/g, ' ').trim().substring(0, 2000); // Limit input length
    const output = await model(cleanText, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  /**
   * Generate embeddings for a batch of texts.
   * Processes in sequential chunks to avoid memory issues.
   * @param {string[]} texts
   * @param {number} batchSize
   * @returns {Promise<number[][]>}
   */
  async embedBatch(texts, batchSize = 16) {
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...batchResults);

      if (i + batchSize < texts.length) {
        // Small delay between batches to prevent memory pressure
        await new Promise(r => setTimeout(r, 50));
      }
    }
    return results;
  }

  /**
   * Compute cosine similarity between two vectors.
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Similarity score between -1 and 1
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  /**
   * Search for the most similar chunks given a query embedding.
   * @param {number[]} queryEmbedding
   * @param {{ embedding: number[], [key: string]: any }[]} chunks
   * @param {number} topK
   * @param {number} threshold - Minimum similarity score
   * @returns {{ chunk: any, score: number }[]}
   */
  search(queryEmbedding, chunks, topK = 10, threshold = 0.30) {
    const scored = chunks.map(chunk => {
      const chunkEmbedding = typeof chunk.embedding === 'string'
        ? JSON.parse(chunk.embedding)
        : chunk.embedding;

      return {
        chunk,
        score: this.cosineSimilarity(queryEmbedding, chunkEmbedding),
      };
    });

    return scored
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Pre-warm the model (call on server startup for faster first query).
   */
  async warmup() {
    try {
      await this.embed('warmup');
      console.log('[Embedding] Model pre-warmed and ready.');
    } catch (err) {
      console.warn('[Embedding] Warmup failed (model will load on first query):', err.message);
    }
  }
}

export default new EmbeddingService();
