import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
  const trugenKey = process.env.TRUGEN_API_KEY;
  const trugenBaseURL = process.env.TRUGEN_BASE_URL || 'https://api.trugen.ai/v1';
  const trugenModel = process.env.TRUGEN_MODEL || 'huma-2';

  console.log('TruGen Key:', trugenKey);
  console.log('TruGen Base URL:', trugenBaseURL);
  console.log('TruGen Model:', trugenModel);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${trugenKey}`,
    'x-api-key': trugenKey,
  };

  try {
    const response = await fetch(`${trugenBaseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: trugenModel,
        messages: [
          { role: 'system', content: 'You are GitSense AI. Respond in JSON: {"text": "hello"}' },
          { role: 'user', content: 'Say hello' }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    });

    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response body:', text);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
