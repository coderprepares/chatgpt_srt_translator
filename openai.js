const { SocksProxyAgent } = require('socks-proxy-agent');
const readline = require('readline');

const {log} = require('./debug.js');
const {sleep} = require('./cli.js');
const config = require('./config.json');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MODEL = 'gpt-3.5-turbo';

let agent = null;
if(config.SOCKS_PROXY_HOST && config.SOCKS_PROXY_PORT) {
  agent = new SocksProxyAgent(`socks://${config.SOCKS_PROXY_HOST}:${config.SOCKS_PROXY_PORT}`);
}

async function ask(prompt, parentMessageId = null, conversationId = null, preserveHistory = false) {
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

  return {
    content: msg.content
  };
}

async function sendChat(params) {
  const url = 'https://api.openai.com/v1/chat/completions';
  // const url = 'https://closeai.deno.dev/v1/chat/completions';

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

        let deltas = arr.filter(str=>str.includes('chat.completion.chunk')).map(str=>JSON.parse(str.replace(/^data:/, '').trim()));
        if(deltas.length > 0) {
          content += deltas.map(json=>json.choices[0].delta.content).join('');
          deltas[deltas.length - 1].choices[0].delta.content = content;
          chunks.splice(0, chunks.length, deltas[deltas.length - 1]);
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

module.exports = {
  ask
};
