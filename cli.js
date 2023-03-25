async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pause() {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = function(chunk) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      resolve();
    };

    process.stdin.on('data', onData);
  });
}

async function prompt(message) {
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');

    console.log(message);
    process.stdin.resume();

    const onData = function(chunk) {
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      resolve(chunk.trim());
    };

    process.stdin.on('data', onData);
  });
}

module.exports = {
  sleep,
  pause,
  prompt
};
