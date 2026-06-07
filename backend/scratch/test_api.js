const apiKey = 'a07c8d9cb4594f7294faffad6941f1e7';
const baseURL = 'https://api.trugen.ai/v1';
const agentId = '256ae257-8ca7-4231-9df8-011c7ef51214';

async function test() {
  try {
    const res = await fetch(`${baseURL}/agent`, {
      headers: { 'x-api-key': apiKey }
    });
    const agents = await res.json();
    const agent = agents.find(a => a.id === agentId);
    console.log('=== NEW AGENT ===');
    console.log(JSON.stringify(agent, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
