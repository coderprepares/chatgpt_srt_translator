const fs = require('fs');
const path = require('path');
const colors = require('colors');
const { parseSync, stringifySync } = require('subtitle');
const {log, setFile, dump, undump, writeUnicodeSrt} = require('./debug.js');
const {isComplete, parseNL, parseTranslation, findInMerged, findConsecutivePartsIdx, findNames, findWords} = require('./utils.js');
const {translate, createNL} = require('./prompt.js');
const {pause} = require('./cli.js');
const config = require('./config.json');

main();

async function getTranslationResults(subs, namelist, format = false) {
  let resp, results;

  resp = await translate(subs, namelist, format);
  try {
    results = parseTranslation(resp.content);
  } catch(e) {
    if(config.APP_DEBUG) console.error(e);

    resp = await translate(subs, namelist, format);
    results = parseTranslation(resp.content);
  }

  let addition = findNames(results);
  if(addition.length > 0) {
    let names = Object.keys(namelist);
    addition.forEach((name)=>{
      for(let key in results) {
        if(results[key].includes(name) && names.includes(name)) {
          let regex = new RegExp(name, 'g');
          results[key] = results[key].replace(regex, namelist[name]);
        }
      }
    });
  }

  return results;
}

async function matchTexts(results, subs, namelist = null) {
  let keys = Object.keys(results);
  let last = '';
  for(let i = 0; i < subs.length; i++) {
    let o = subs[i].data.text;

    if(keys.includes(o)) {
      subs[i].data.t = results[o].trim();
      last = o;
    } else {
      try {
        let k = findInMerged(keys, o, i > 0 ? subs[i - 1].data.text : last);
        subs[i].data.t = results[k].trim();
        last = k;
      } catch(e) {
        if(config.APP_DEBUG) console.error(e);

        if(subs.length > 1) {
          res = await getTranslationResults(subs.slice(i > 0 ? i - 1 : i, i < subs.length - 1 ? i + 2 : i + 1), namelist);
          matchTexts(res, [subs[i]], namelist);
        } else if (namelist) {
          res = await getTranslationResults([subs[i]], namelist);
          matchTexts(res, [subs[i]]);
        }
      }
    }
  }

  return subs;
}

async function getNL(subs, addition = []) {
  let resp, subsNL;

  resp = await createNL(subs, addition);
  subsNL = parseNL(resp.content, subs);
  if(addition.length > 0) {
    return subsNL;
  }

  addition = findNames(subsNL);

  if(addition.length > 0){
    resp = await createNL(subs, addition);
    subsNL = parseNL(resp.content, subs);
    addition = findNames(subsNL);
    if(addition.length > 0) {
      addition.forEach(name=>{
        for(let key of subsNL) {
          if(subsNL[key].includes(name)) {
            delete subsNL[key];
          }
        }
      });
    }
  }

  return subsNL;
}

async function splitSubs(subs, arr, namelist) {
  let results;
  for(let idxs of arr) {
    let list = subs.filter((sub,idx)=>idxs.includes(idx));
    if(list.length == 2) {
      if(list[0].data.text.endsWith(',')) {
        let parts = list[0].data.t.split('，');
        if(parts.length == 2) {
          list[0].data.t = `${parts[0]}，`;
          list[1].data.t = parts[1];
          continue;
        }
      } else if (list[0].data.text.endsWith('--')) {
        let parts = list[0].data.t.split('--');
        if(parts.length == 1) parts = list[0].data.t.split(' - ');
        if(parts.length == 1) parts = list[0].data.t.split('，');
        if(parts.length == 2) {
          list[0].data.t = `${parts[0]}，`;
          list[1].data.t = parts[1];
          continue;
        }
      } else if (list[0].data.text.endsWith('...')) {
        let parts = list[0].data.t.split('...').filter(line=>!!line);
        if(parts.length == 2) {
          list[0].data.t = `${parts[0]}，`;
          list[1].data.t = parts[1];
          continue;
        }
      } else if (list[0].data.text.endsWith('"')) {
        let parts = list[0].data.t.split('”').filter(line=>!!line);
        if(parts.length == 2) {
          list[0].data.t = `${parts[0]}”`;
          list[1].data.t = parts[1];
          continue;
        }
      } 

      if(list[0].data.t.length <= 30) continue;
    }

    let retry = 0;
    results = await getTranslationResults(list, namelist, true);
    while(Object.keys(results).length <= 1 && retry < 2) {
      results = await getTranslationResults(list, namelist, true);
      retry++;
    }
    await matchTexts(results, list, namelist);
  }
}

async function main() {
  let list = fs.readdirSync(path.join(__dirname, 'src'));
  let supportExtensions = ['srt', 'vtt'];

  const SLICE_LEN = 10;
  const SLICE_LEN_MAX = 20;

  for (let subtitleFile of list) {
    if (!supportExtensions.includes(subtitleFile.split('.').pop())) continue;

    if(fs.existsSync(path.join(__dirname, `res/${subtitleFile}`))) {
      console.log(`skip ${subtitleFile}`);
      continue;
    }

    if(config.APP_DEBUG) {
      setFile(subtitleFile);
    }
  
    let subtitles, namelist;

    try {
      subtitles = undump('subtitles');
      namelist = undump('namelist');
    } catch(e) {
      subtitles = parseSync(fs.readFileSync(path.join(__dirname, `src/${subtitleFile}`), 'utf8'))
        .filter(line => line.type === 'cue')
        .map(line => {
          line.data.o = line.data.text;
          line.data.text = line.data.text.replace(/[\r\n]+/g, ' ').replace(/^\s+|\s+$/g, '').replace(/\{.+?\}/g,''); 
          return line;
        });
      namelist = {};
    }
  
    let cursor = 0;
    let total = subtitles.length;
    let subs, resp, results, subsNL, addition;

    while(cursor < total - 1) {
      if(subtitles[cursor].data.t) {
        cursor++;
        continue;
      }

      let end = cursor + SLICE_LEN;
  
      if(end >= total - 1) {
        subs = subtitles.slice(cursor);
      } else {
        while(!isComplete(subtitles[end - 1], subtitles[end]) && end < cursor + SLICE_LEN_MAX && end < total - 1) {
          end++;
        }
        subs = subtitles.slice(cursor, end);
      }
  
      subsNL = await getNL(subs);
      namelist = {...subsNL, ...namelist};
      results = await getTranslationResults(subs, namelist);
      addition = findNames(results);
      let words = findWords(results);

      if(addition.length > 0 || words.length > 0) {
        if(addition.length > 0) {
          subsNL = getNL(subs, addition);
          namelist = {...subsNL, ...namelist};
        }
        
        results = await getTranslationResults(subs, namelist);
      }

      await matchTexts(results, subs, namelist);
      
      let arr = findConsecutivePartsIdx(subs, (a, b)=> (!!a && !!b && a.data.t == b.data.t)).filter(list=> list.length >= 2);
      await splitSubs(subs, arr, namelist);
      
      arr = findConsecutivePartsIdx(subs, (a, b)=> (!!a && !!b && a.data.t == b.data.t)).filter(list=> list.length >= 2);
      await splitSubs(subs, arr, namelist);

      for(let i = 0; i < subs.length; i++) {
        console.log(`${cursor + i + 1} / ${subtitles.length}`.gray)
        console.log(`${subtitles[cursor + i].data.t}`.green)
        console.log(`${subtitles[cursor + i].data.text}`.white)
        console.log(`-----------------`.gray)
      }
  
      cursor = end;
  
      if(config.APP_DEBUG) {
        dump(namelist, 'namelist');
        dump(subtitles, 'subtitles');
      }

      // console.log('press any key to continue...');
      // await pause();
    }

    subtitles.forEach(sub=>{
      let translation = (sub.data.t ? sub.data.t.split("\n").filter(line=>!!line.trim()).join("\n").replace(/[，。？！：；（）〔〕【】《》‘’“”—、]/g,'  ').replace(/  +/g,'  ').trim() : '***');
      sub.data.text = translation + "\n" + sub.data.text;
      if(sub.data.o.includes('\\an8')) {
        sub.data.text = '{\\an8}' + sub.data.text;
      }
    });

    if(config.APP_DEBUG) {
      writeUnicodeSrt(path.join(__dirname, `res/${subtitleFile}`), subtitles, 'utf16le');
    } else {
      fs.writeFileSync(path.join(__dirname, `res/${subtitleFile}`), stringifySync(subtitles, { format: 'srt' }));
    }
  }
}