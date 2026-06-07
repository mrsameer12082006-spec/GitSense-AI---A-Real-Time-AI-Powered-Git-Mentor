const apiKey = 'a07c8d9cb4594f7294faffad6941f1e7';
const baseURL = 'https://api.trugen.ai/v1';

async function test() {
  try {
    const agentPayload = {
      agent_name: "Test Mini Agent",
      agent_system_prompt: "You are a helpful assistant",
      config: {
        timeout: 240,
        memory: {
          isEnabled: false
        }
      },
      record: false,
      avatars: [
        {
          avatar_key_id: "665a1170",
          config: {
            llm: {
              model: "google/gemini-3.1-flash-lite",
              provider: "google"
            }
          }
        }
      ]
    };

    console.log('Creating agent...');
    const responseAgent = await fetch(`${baseURL}/ext/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(agentPayload)
    });

    console.log('Agent Create Status:', responseAgent.status);
    const agentData = await responseAgent.json();
    console.log('Agent Response:', JSON.stringify(agentData, null, 2));

    const agentId = agentData.id;
    if (!agentId) {
      console.log('Failed to create agent');
      return;
    }

    console.log('Creating conversation with agent:', agentId);
    const conversationPayload = {
      agentId: agentId
    };

    const responseConversation = await fetch(`${baseURL}/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(conversationPayload)
    });

    console.log('Conversation Create Status:', responseConversation.status);
    const conversationData = await responseConversation.text();
    console.log('Conversation Response:', conversationData);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
