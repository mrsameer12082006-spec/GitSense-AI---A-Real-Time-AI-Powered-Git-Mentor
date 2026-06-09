const apiKey = 'a07c8d9cb4594f7294faffad6941f1e7';
const baseURL = 'https://api.trugen.ai/v1';

const paths = [
  '/chat',
  '/completions',
  '/completion',
  '/llm',
  '/llm/completions',
  '/llm/chat/completions',
  '/generate',
  '/agent/chat',
  '/agent/completion',
  '/ext/chat/completions',
  '/ext/completions'
];

async function test() {
  const payload = {
    model: 'google/gemini-3.1-flash-lite',
    messages: [{ role: 'user', content: 'hello' }],
    prompt: 'hello'
  };

  for (const path of paths) {
    try {
      const response = await fetch(`${baseURL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });
      console.log(`POST ${path} -> Status: ${response.status}`);
      if (response.status !== 404) {
        const text = await response.text();
        console.log(`Response for ${path}:`, text.slice(0, 500));
      }
    } catch (err) {
      console.log(`POST ${path} -> Error: ${err.message}`);
    }
  }
}

test();
