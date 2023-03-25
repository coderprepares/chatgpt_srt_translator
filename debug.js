const fs = require('fs');
const path = require('path');

let name = '';

function setFile(name) {
  filename = name;
  let logFile = path.resolve(`logs/${filename}.log`);
  fs.writeFileSync(logFile, '');
}

function dump(obj, name) {
  let dumpFile = path.resolve(`logs/${filename}.${name}.json`);
  fs.writeFileSync(dumpFile, JSON.stringify(obj), { encoding: 'utf8' });
}

function undump(name) {
  let dumpFile = path.resolve(`logs/${filename}.${name}.json`);
  if(!fs.existsSync(dumpFile)) {
    throw new Error('dump not exist');
  }
  return JSON.parse(fs.readFileSync(dumpFile, { encoding: 'utf8' }));
}

function log(message, level = 'debug') {
  if(!filename) {
    return level != 'debug' ? console.debug(message) : false;
  }

  let logFile = path.resolve(`logs/${filename}.log`);

  const datetime = getCurrentTime();
  const logMessage = `[${datetime}][${level.toUpperCase()}]\n${message}\n\n`;
  fs.appendFileSync(logFile, logMessage);
}

function getCurrentTime() {
  const date = new Date();
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  const hours = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  const seconds = ('0' + date.getSeconds()).slice(-2);

  const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  return formattedDate;
}

function sub2srt(subtitles) {
  let arr = [];
  for(let i = 0; i < subtitles.length; i++) {
    let idx = i + 1;
    arr.push(toSrt(subtitles[i], idx));
  }
  return arr.join('').replace(/\n/g,"\r\n");
}

function toSrt(obj, idx) {
  let mark = false;
  if(obj.data.t) {
    let lines = obj.data.t.split("\n").filter(line=>!!line.trim());
    let length = obj.data.t.length;

    if(lines.length > 1 || length > 25) {
      mark = true;
    }
  } else {
    mark = true;
  }

  if(mark) {
    idx += 10000;
  }
  const { start, end, text } = obj.data;
  const srtText = `${text}\n\n`;
  const srtStartTime = formatTime(start);
  const srtEndTime = formatTime(end);
  return `${idx}\n${srtStartTime} --> ${srtEndTime}\n${srtText}`;
}

function formatTime(milliseconds) {
  const date = new Date(milliseconds);
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  return `${padZero(hours)}:${padZero(minutes)}:${padZero(seconds)},${padMs(ms)}`;
}

function padZero(num) {
  return num.toString().padStart(2, '0');
}

function padMs(num) {
  return num.toString().padStart(3, '0');
}

function writeUnicodeSrt(filePath, subtitles, encoding = 'utf8') {
  let content = sub2srt(subtitles);
  let bom = '';
  if (encoding === 'utf16le') {
    bom = '\uFEFF';
  } else if (encoding === 'utf8') {
    bom = '\uEFBBBF';
  }

  fs.writeFileSync(filePath, bom + content, { encoding });
}

module.exports = {
  setFile,
  log,
  dump,
  undump,
  writeUnicodeSrt,
};
