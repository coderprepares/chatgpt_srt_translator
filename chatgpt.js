const { randomUUID } = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const readline = require('readline');

const {log} = require('./debug.js');
const {sleep} = require('./cli.js');
const config = require('./config.json');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MODEL = 'text-davinci-002-render-sha';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';

let agent = null;
if(config.SOCKS_PROXY_HOST && config.SOCKS_PROXY_PORT) {
  agent = new SocksProxyAgent(`socks://${config.SOCKS_PROXY_HOST}:${config.SOCKS_PROXY_PORT}`);
}

async function ask(prompt, parentMessageId = null, conversationId = null, preserveHistory = false) {
  let params = {
    prompt
  };
  if(parentMessageId && conversationId) {
    params.parentMessageId = parentMessageId;
    params.conversationId = conversationId;
  }

  let response = await sendChat(params);
  
  log(`prompt:\n${prompt}\n\ncontent:\n${response.message.content.parts[0]}\n`)

  if(!preserveHistory) {
    await removeChat(response.conversation_id)
    return {
      content: response.message.content.parts[0]
    };
  }

  return {
    content: response.message.content.parts[0], 
    parentMessageId: response.message.id, 
    conversationId: response.conversation_id
  };
}

async function sendChat(params) {
  const url = 'https://chat.openai.com/backend-api/conversation';

  const headers = {
    'accept': 'text/event-stream',
    'Authorization': config.CHATGPT_AUTH_TOKEN,
    'Content-Type': 'application/json',
    'Cookie': config.CHATGPT_COOKIES,
    'origin': 'https://chat.openai.com',
    'referer': 'https://chat.openai.com/chat',
    'user-agent': USER_AGENT
  };
  const body = JSON.stringify({
    action: 'next',
    messages: [
      {
        id: randomUUID(),
        author: { role: 'user' },
        role: 'user',
        content: { content_type: 'text', parts: [params.prompt] },
      },
    ],
    conversation_id: params.conversationId,
    parent_message_id: params.parentMessageId || randomUUID(),
    model: MODEL,
  });

  const options = { method: 'POST', timeout: 10000, headers, body, agent};

  let resp;
  try {
    resp = await fetchSSE(url, options);
  } catch(e) {
    await sleep(5000);
    resp = await sendChat(params);
  }
  return resp;
}

async function fetchSSE(url, options) {
  return fetch(url, options)
    .then(async res => {
      const result = await readResultFromStream(res.body);
      return JSON.parse(result.replace(/^data:/, '').trim());
    })
    .catch(error => {
      console.error("Error sending POST request to ChatGPT API:", error);
      throw error;
    });
}

function readResultFromStream(body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let isDone = false;
    let i = 0;
    let loading = false;
    let dot_count = 0;

    body.on('readable', () => {
      timeout = false;

      let chunk;
      if(isDone) {
        return;
      }

      if(!loading) {
        process.stdout.write('loading');
        loading = true;
      }
      process.stdout.write('.');
      dot_count++;

      if (dot_count % 10 == 0) {
        process.stdout.write("\b".repeat(dot_count));
        readline.clearScreenDown(process.stdout);
        dot_count = 0;
      }

      while (null !== (chunk = body.read())) {
        let arr = chunk.toString().split("\n\n").filter(text => text);
        
        if(arr.includes('data: [DONE]')) {
          isDone = true;
        }

        chunks.splice(chunks.length, 0, ...arr);

        for(let i = 0; i < chunks.length; i++) {
          if(!chunks[i].startsWith('data: ')) {
            chunks[i - 1] += chunks[i];
            chunks.splice(i, 1);
          }
        }

        if(chunks.length > 2) {
          chunks.splice(0, chunks.length - 2);
        }

        if(isDone) {
          process.stdout.clearLine();
          process.stdout.cursorTo(0);

          resolve(chunks[0]);
        }
      }
    });

    body.on('end', () => {
      resolve(chunks[0]);
    })

    body.on('error', (err) => {
      reject(err);
    });
  });
}

async function removeChat(conversationId) {
  const url = `https://chat.openai.com/backend-api/conversation/${conversationId}`;

  return fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': config.CHATGPT_AUTH_TOKEN,
        'Content-Type': 'application/json',
        'Cookie': config.CHATGPT_COOKIES,
        'origin': 'https://chat.openai.com',
        'referer': 'https://chat.openai.com/chat',
        'user-agent': USER_AGENT
      },
      body: JSON.stringify({ is_visible: false }),
      timeout: 100000,
      agent: agent
    })
    .then(res => res.json());
}

module.exports = {ask};
