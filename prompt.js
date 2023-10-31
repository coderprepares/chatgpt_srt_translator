const {ask: askGPT} = require('./chatgpt.js');
const {ask: askAPI} = require('./openai.js');
const {log} = require('./debug.js');
const {filterNL, formatTexts} = require('./utils.js');
const config = require('./config.json');

async function ask(prompt, parentMessageId = null, conversationId = null, preserveHistory = false) {
  if(!config.APP_DEBUG && config.OPENAI_API_KEY) {
    return askAPI(prompt, parentMessageId, conversationId, preserveHistory);
  } else if(config.CHATGPT_HOST) {
    return askGPT(prompt, parentMessageId, conversationId, preserveHistory);
  } else {
    throw new Error('Please configure OPENAI_API_KEY or CHATGPT_HOST');
  }
}

async function translate(subtitles, namelist = {}, format = false) {
  namelist = filterNL(namelist, subtitles);
  let nl_prompt = namelist && Object.keys(namelist).length > 0 ? `
Namelist:
Translate names according to the namelist below.
${JSON.stringify(namelist)}
` : '';

  let msg = `Translate the following subtitle text, and the names of people should be transliterated. Output a JSON object, each original text corresponds to a translated text on each line, directly output the JSON object, do not output any explanation. Translation language: ${config.TARGET_LANGUAGE}.

Translation requirements: 
Translations should be concise. If a sentence is too long, line breaks should be added.
${nl_prompt}
JSON Object Format:
{"Original Text 1":"Translated Text 1","Original Text 2":"Translated Text 2",...}

Note: Please replace "Original Text 1" and "Translated Text 1" with the actual original and translated texts respectively. Do the same for all other lines of text.

Subtitles: 
"""
${format ? formatTexts(subtitles) : subtitles.map(s=>s.data.text).join("\n\n")}
"""`;

  return ask(msg);
}

async function split(subtitles) {
  let msg = `${subtitles[0].data.t + "\n" + subtitles.map(s=>s.data.text).join(' ')}

Split the bilingual subtitles above into ${subtitles.length} lines.

Original text split:
${subtitles.map(s=>s.data.text).join("\n")}

Translation split:`;

  return ask(msg);
}

async function createNL(subtitles, addition = []) {
  let addition_text = addition.length > 0 ? `Add ${addition.join(', ')} in the output if ${addition.length == 1 ? 'it is a name' : 'they are names'}.\n` : '';

  let msg = `Task:
Create a name list.

Requirements:
Find people's names in the subtitles below, and output the name and its translation in ${config.TARGET_LANGUAGE}.
${addition_text}
Format:
{"Original Name 1":"Translated Name 1","Original Name 2":"Translated Name 2",...}

Note:
Only output peope's name or location name, no regular word. If not found, output empty object. Output JSON directly, without explaination.

Subtitles:
"""
${subtitles.map(s=>s.data.text).join("\n\n")}
"""

Output:`;

  return ask(msg);
}

module.exports = {ask, translate, split, createNL};
