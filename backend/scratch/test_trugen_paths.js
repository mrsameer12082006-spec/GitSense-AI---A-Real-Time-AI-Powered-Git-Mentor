import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
  const trugenKey = process.env.TRUGEN_API_KEY;
  const urls = [
    'https://api.trugen.ai/v1/chat/completions',
    'https://api.trugen.ai/chat/completions',
    'https://api.trugen.ai/v1/models',
    'https://api.trugen.ai/models'
  ];

  for (const url of urls) {
    try {
      console.log(`\nProbing GET on ${url}...`);
      const resGet = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${trugenKey}`,
          'x-api-key': trugenKey
        }
      });
      console.log(`GET Status: ${resGet.status}`);
      const textGet = await resGet.text();
      console.log(`GET Body (first 200 chars): ${textGet.slice(0, 200)}`);
    } catch (err) {
      console.error(`GET Error: ${err.message}`);
    }

    try {
      console.log(`Probing POST on ${url}...`);
      const resPost = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${trugenKey}`,
          'x-api-key': trugenKey
        },
        body: JSON.stringify({
          model: 'huma-2',
          messages: [{ role: 'user', content: 'ping' }]
        })
      });
      console.log(`POST Status: ${resPost.status}`);
      const textPost = await resPost.text();
      console.log(`POST Body (first 200 chars): ${textPost.slice(0, 200)}`);
    } catch (err) {
      console.error(`POST Error: ${err.message}`);
    }
  }
}

test();
