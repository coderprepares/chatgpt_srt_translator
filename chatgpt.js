const { randomUUID } = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const readline = require('readline');

const {log, cache} = require('./debug.js');
const {sleep} = require('./cli.js');
const config = require('./config.json');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MODEL = 'text-davinci-002-render-sha';
// const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36';

const clearLoading = () => {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
}

let agent = null;
if(config.SOCKS_PROXY_HOST && config.SOCKS_PROXY_PORT) {
  agent = new SocksProxyAgent(`socks://${config.SOCKS_PROXY_HOST}:${config.SOCKS_PROXY_PORT}`);
}

async function ask(prompt, parentMessageId = null, conversationId = null, preserveHistory = false) {
  let hash;

  if(config.APP_DEBUG) {
    hash = crypto.createHash('md5').update(prompt).digest('hex');
    let result = cache(hash);
    if(result) {
      return result;
    }

    log(hash);
  }

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

  let result = {
    content: response.message.content.parts[0], 
    parentMessageId: response.message.id, 
    conversationId: response.conversation_id
  };

  if(config.APP_DEBUG) {
    cache(hash, result);
  }

  return result;
}

async function sendChat(params) {
  const url = `${config.CHATGPT_HOST}/api/conversation/talk`;
  // const url = 'https://chat.openai.com/backend-api/conversation';

  const headers = {
    'accept': 'text/event-stream',
    // 'Authorization': config.CHATGPT_AUTH_TOKEN,
    'Content-Type': 'application/json',
    // 'Cookie': config.CHATGPT_COOKIES,
    // 'origin': 'https://chat.openai.com',
    // 'referer': 'https://chat.openai.com/chat',
    // 'user-agent': USER_AGENT
  };
  // const body = JSON.stringify({
  //   action: 'next',
  //   messages: [
  //     {
  //       id: randomUUID(),
  //       author: { role: 'user' },
  //       role: 'user',
  //       content: { content_type: 'text', parts: [params.prompt] },
  //     },
  //   ],
  //   conversation_id: params.conversationId,
  //   parent_message_id: params.parentMessageId || randomUUID(),
  //   model: MODEL,
  // });

  let msg = {
    prompt: params.prompt,
    model: MODEL,
    message_id: randomUUID(),
    parent_message_id: params.parentMessageId || randomUUID()
  };

  if(params.conversationId) {
    msg.conversation_id = params.conversationId;
  }

  const body = JSON.stringify(msg);

  const options = { method: 'POST', timeout: 10000, headers, body, agent};

  let resp;
  try {
    resp = await fetchSSE(url, options);
  } catch(e) {
    if(e && e == 'rate limit exceeded') {
      console.log('wait 60s...');
      await sleep(60000);
    } else {
      await sleep(5000);
    }
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
      clearLoading();
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
    let resp;

    body.on('readable', () => {
      let chunk;
      if(isDone) {
        return;
      }

      while (null !== (chunk = body.read())) {
        resp = chunk.toString();

        if(resp.includes('reached our limit')) {
          reject('rate limit exceeded');
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

        // console.log(chunk.toString());

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
          clearLoading();

          if(!chunks[0]) {
            reject(resp || 'empty response');
          }

          resolve(chunks[0]);
        }
      }
    });

    body.on('end', () => {
      if(!chunks[0]) {
        reject(resp || 'empty response');
      }

      resolve(chunks[0]);
    })

    body.on('error', (err) => {
      reject(err);
    });
  });
}

async function removeChat(conversationId) {
  // const url = `https://chat.openai.com/backend-api/conversation/${conversationId}`;

  const url = `${config.CHATGPT_HOST}/api/conversation/${conversationId}`;

  let msg = {
    method: 'DELETE',
    // method: 'PATCH',
    // headers: {
    //   'Authorization': config.CHATGPT_AUTH_TOKEN,
    //   'Content-Type': 'application/json',
    //   'Cookie': config.CHATGPT_COOKIES,
    //   'origin': 'https://chat.openai.com',
    //   'referer': 'https://chat.openai.com/chat',
    //   'user-agent': USER_AGENT
    // },
    // body: JSON.stringify({ is_visible: false }),
    timeout: 100000,
    agent: agent
  };

  return fetch(url, msg)
    .then(res => res.json());
}

module.exports = {ask};
