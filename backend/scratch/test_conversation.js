const apiKey = 'a07c8d9cb4594f7294faffad6941f1e7';
const baseURL = 'https://api.trugen.ai/v1';
const agentId = '256ae257-8ca7-4231-9df8-011c7ef51214';

const payloads = [
  {
    name: 'With empty transcript array',
    body: {
      agentId,
      transcript: []
    }
  },
  {
    name: 'With context and transcript',
    body: {
      agentId,
      context: { text: "" },
      transcript: []
    }
  },
  {
    name: 'With transcript as stringified empty array',
    body: {
      agentId,
      transcript: "[]"
    }
  },
  {
    name: 'With transcript containing initial message',
    body: {
      agentId,
      transcript: [
        {
          timestamp: new Date().toISOString(),
          role: "assistant",
          content: "Hello",
          message_timestamp: 0
        }
      ]
    }
  },
  {
    name: 'With status and transcript',
    body: {
      agentId,
      status: "STARTED",
      transcript: []
    }
  }
];

async function test() {
  for (const p of payloads) {
    console.log(`--- Testing: ${p.name} ---`);
    try {
      const response = await fetch(`${baseURL}/conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(p.body)
      });

      console.log('Status:', response.status);
      const data = await response.text();
      console.log('Response:', data.slice(0, 500));
      if (response.status === 200 || response.status === 201) {
        console.log('SUCCESS!');
        break;
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }
}

test();
