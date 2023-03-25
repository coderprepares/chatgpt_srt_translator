function isComplete(current_subtitle, next_subtitle) {
  return !/[,]$/.test(current_subtitle.data.text) && !/^[a-z]/.test(next_subtitle.data.text.replace(/[-\.\s"']+/,''));
}

function parseNL(str, subtitles) {
  let namelist = parseJSON(str) || {};
  return filterNL(namelist, subtitles);
}

function filterNL(namelist, subtitles) {
  const blacklist = ['', 'I', '-', 'Ah', 'B-minus', 'Right', 'Well', 'October', 'RBG', 'Oh', 'Really', 'Then', 'It\'s OK', 'No', 'I\'m', 'Dad', 'Shoulder', 'English', 'X-ray', 'ER'];

  let subtext = subtitles.map(sub=>sub.data.text).join(' ');
  let parsed = {};
  let keys = Object.keys(namelist).filter(name=>!blacklist.includes(name) && name.split(' ').filter(part=>/^[a-z]/.test(part)).length == 0 && subtext.includes(name));
  for(let i = 0; i < keys.length; i++) {
    let key = keys[i];
    if(key == namelist[key]) {
      continue;
    }
    parsed[key] = namelist[key];
  }
  return parsed;
}

function parseTranslation(str) {
  if(str.includes('Original Text 1')) {
    throw new Error('wrong format');
  }

  let obj = parseJSON(str);
  if(!obj || Object.keys(obj).length == 0) {
    console.log(str);
    throw new Error('parse error');
  }

  let ext = {};
  let splitted = [];

  for(let key in obj) {
    let keys = key.split("\n").filter(line=>!!line.trim());
    let values = obj[key].split("\n").filter(line=>!!line.trim());

    if(keys.length > 0 && values.length > 0 && keys.length == values.length) {
      for(let i = 0; i < keys.length; i++) {
        ext[keys[i]] = values[i];
      }
      splitted.push(key);
    } else if (keys.length > 0) {
      ext[keys.join("\n")] = values.join("\n");
      splitted.push(key);
    }
  }

  for(let key in obj) {
    if(splitted.includes(key)) continue;
    ext[key] = obj[key];
  }

  return ext;
}

function parseJSON(str) {
  let json = null;
  str = str.split("\n").map(line=>line.trim().replace(/^\s+|\s+$/g,'')).join('')
    .replace(',""}','}').replace(',}','}')
    .replace(',\'',',"').replace('\':','":')
    .replace('",\\"','","').replace('\\":','":');

  if(!str.startsWith('{') || !str.endsWith('}')) {
    let match = str.match(/\{.*\}/);
    if(match) str = match[0];
  }

  try {
    json = JSON.parse(str);
  } catch(e) {
    let matches = str.match(/."./g, );
    if(!matches) {
      throw e;
    }
    matches.forEach(match=>{
      if(!match.startsWith('\\') && !match.endsWith(':')) {
        str.replace(match, match.replace('"','\\"'));
      }
    });
    json = JSON.parse(str);
  }
  
  return json;
}

function findInMerged(texts, str, last_str = null, converted = false) {
  let merged_text = '';
  let results = texts.filter(text=>text.includes(str));
  if(results.length == 1 || (results.length > 1 && !last_str)) {
    merged_text = results[0];
  } else if (results.length > 1) {
    let last_idx = texts.indexOf(last_str);
    let rates = results.map(text=>Math.abs(texts.indexOf(text) - last_idx));
    let rate = Math.max(...rates);
    for(let i = 0; i < rates.length; i++) {
      if(rates[i] == rate) {
        merged_text = results[i];
        break;
      }
    }
  } else if (!converted) {
    let converted_text = findInMerged(texts.map(text=>removePunctuation(text)), removePunctuation(str), removePunctuation(last_str), true);
    let idx = texts.map(text=>removePunctuation(text)).indexOf(converted_text);
    merged_text = texts[idx];
  } else {
    throw new Error('find merged failed');
  }

  return merged_text;
}

function removePunctuation(text) {
  if(!text) {
    return text;
  }
  return text.replace(/[^a-zA-Z0-9 ]/g,' ').replace(/ +/g,' ').trim();
}

function findConsecutivePartsIdx(arr, fn) {
  let result = [];
  let consecutivePart = [];
  let previousElement = null;

  for (let i = 0; i < arr.length; i++) {
    let currentElement = arr[i];

    if (fn(currentElement, previousElement)) {
      consecutivePart.push(i);
    } else {
      if (consecutivePart.length > 0) {
        result.push(consecutivePart);
      }
      consecutivePart = [i];
    }

    previousElement = currentElement;
  }

  if (consecutivePart.length > 0) {
    result.push(consecutivePart);
  }

  return result;
}

function startsWith(text, starts) {
    if (typeof starts == 'string') {
        starts = [starts];
    }
    for (let prefix of starts) {
        if (text.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}

function endsWith(text, ends, without = []) {
    if (typeof ends == 'string') {
        ends = [ends];
    }
    for (let suffix of without) {
        if (text.endsWith(suffix)) {
            return false;
        }
    }
    for (let suffix of ends) {
        if (text.endsWith(suffix)) {
            return true;
        }
    }
    return false;
}

function formatTexts(subtitles) {
  let lines = [];
  subtitles.map(sub=>sub.data.text).forEach((line,idx)=>{
    if (lines.length == 0 
            || startsWith(line, ['because', 'and', 'but', 'with', 'if', 'to']) 
            || endsWith(lines[lines.length - 1], ['.', '?', '!', '--', ','], ['...', 'who\'s--', 'really--'])) {
      lines.push(line);
    } else {
      lines[lines.length - 1] += ` ${line}`;
    }
  });

  if(lines.length == 1) {
    return subtitles.map(sub=>sub.data.text).join("\n\n");
  }

  return lines.join("\n\n");
}

function findNames(results) {
  let finds = [];
  for (const key in results) {
    let matches = results[key].match(/[A-Z][a-z][\w']+/g);
    if(matches) {
      finds = finds.concat(...matches);
    }
  }
  return Array.from(new Set(finds)).filter(name=>!!name);
}

function findWords(results) {
  let finds = [];
  for (const key in results) {
    let matches = results[key].match(/[a-z][a-z]+/g);
    if(matches) {
      finds = finds.concat(...matches);
    }
  }
  return Array.from(new Set(finds)).filter(name=>!!name);
}

module.exports = {
  isComplete,
  parseNL,
  filterNL,
  parseTranslation,
  findInMerged,
  findConsecutivePartsIdx,
  formatTexts,
  findNames,
  findWords,
}