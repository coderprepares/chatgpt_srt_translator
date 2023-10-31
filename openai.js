const { SocksProxyAgent } = require('socks-proxy-agent');
const readline = require('readline');

const {log, cache} = require('./debug.js');
const {sleep} = require('./cli.js');
const config = require('./config.json');
const crypto = require('crypto');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MODEL = 'gpt-3.5-turbo';

const clearLoading = () => {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
};

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
      model: MODEL,
      stream: true,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
  };

  let response = await sendChat(params);

  let msg = response.choices[0].message || response.choices[0].delta;

  log(`prompt:\n${prompt}\n\ncontent:\n${msg.content}\n`)

  let result = {
    content: msg.content
  };

  if(config.APP_DEBUG) {
    cache(hash, result);
  }

  return result;
}

async function sendChat(params) {
  const url = `${config.OPENAI_API_HOST || 'https://api.openai.com/v1'}/chat/completions`;

  // console.log(url, params);

  const options = {
    method: 'POST',
    headers: {
      'accept': 'text/event-stream',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(params),
    timeout: 100000,
    agent: agent
  };
  
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
      return result;
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
      timeout = false;

      let chunk;
      if(isDone) {
        return;
      }

      while (null !== (chunk = body.read())) {
        resp = chunk.toString();

        if(resp.includes('rate_limit_exceeded')) {
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

        let arr = resp.split("\n\n").filter(text => text);

        arr.forEach(part=>{
          if(part.startsWith('data: ')) {
            chunks.push(part);
          } else {
            chunks[chunks.length - 1] += part;
          }

          if(typeof chunks[0] == 'string' && chunks[0].startsWith('data: ') && chunks[0].endsWith('}')) {
            chunks[0] = JSON.parse(chunks[0].replace('data: ', ''));
          }

          if(chunks.length > 1 && chunks[1].startsWith('data: ') && chunks[1].endsWith('}')) {
            chunks[1] = JSON.parse(chunks[1].replace('data: ', ''));

            chunks[0].choices[0].delta.content += chunks[1].choices[0].delta.content || '';
            chunks.splice(1, 1);
          }
        });
        
        if(chunks.includes('data: [DONE]')) {
          isDone = true;
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

module.exports = {
  ask
};
