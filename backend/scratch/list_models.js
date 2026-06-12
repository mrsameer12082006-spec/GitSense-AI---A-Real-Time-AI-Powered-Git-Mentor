import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function listModels() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('No GROQ_API_KEY found.');
    return;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    if (!res.ok) {
      console.error('Failed to fetch models:', await res.text());
      return;
    }
    const data = await res.json();
    console.log('Available Groq Models:');
    data.data.forEach(m => {
      console.log(`- ${m.id} (Created by: ${m.owned_by})`);
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

listModels();
