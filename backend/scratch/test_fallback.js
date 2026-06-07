import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import aiService from '../src/services/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
  console.log('TRUGEN_API_KEY present:', !!process.env.TRUGEN_API_KEY);
  console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY);

  try {
    console.log('Testing generateResponse (non-streaming, should fallback)...');
    const res = await aiService.generateResponse('Hello, tell me a quick git tip.');
    console.log('Result:', JSON.stringify(res, null, 2));

    console.log('\nTesting getCompletionStream (streaming, should fallback)...');
    const stream = await aiService.getCompletionStream('Hello, tell me another quick git tip.');
    
    // Read the stream
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let streamText = '';
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        streamText += decoder.decode(value, { stream: !done });
      }
    }
    console.log('Stream raw output length:', streamText.length);
    console.log('Stream raw output sample:', streamText.slice(0, 500));
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
