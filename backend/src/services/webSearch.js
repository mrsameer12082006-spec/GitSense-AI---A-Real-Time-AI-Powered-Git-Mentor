import axios from 'axios';

class WebSearchService {
  /**
   * Perform search query on DuckDuckGo HTML (free, no token needed)
   */
  async search(query) {
    try {
      console.log(`[WebSearch] Querying DuckDuckGo: "${query}"`);
      const response = await axios.get('https://html.duckduckgo.com/html/', {
        params: { q: query },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        }
      });

      const html = response.data;
      const results = [];
      
      // Parse DuckDuckGo HTML results using RegExp
      const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const titleRegex = /<a class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      
      let match;
      let snippets = [];
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
        const text = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        snippets.push(text);
      }

      titleRegex.lastIndex = 0;
      let links = [];
      while ((match = titleRegex.exec(html)) !== null && links.length < 5) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        links.push({ title, url });
      }

      for (let i = 0; i < snippets.length; i++) {
        if (links[i]) {
          results.push({
            title: links[i].title,
            url: links[i].url,
            snippet: snippets[i]
          });
        }
      }

      console.log(`[WebSearch] Found ${results.length} web search results.`);
      return results;
    } catch (err) {
      console.error('[WebSearch] Error performing search:', err.message);
      return [];
    }
  }

  formatResultsForContext(results) {
    if (results.length === 0) return '';
    let text = '### Web Search Fallback Results (Cite sources internally):\n';
    results.forEach((r, idx) => {
      text += `${idx + 1}. Title: ${r.title}\n   URL: ${r.url}\n   Snippet: ${r.snippet}\n\n`;
    });
    return text;
  }
}

export default new WebSearchService();
