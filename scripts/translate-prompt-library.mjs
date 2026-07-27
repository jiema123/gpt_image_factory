import fs from "node:fs/promises";

const file = "codex_image/webui/static/prompt-library/cases.json";
const payload = JSON.parse(await fs.readFile(file, "utf8"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hasCjk = (value) => /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
const looksEnglish = (value) => {
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) || []).length;
  return latin > 80 && latin > cjk * 1.8;
};

function chunks(text, limit = 3000) {
  const result = [];
  let current = "";
  for (const paragraph of text.split(/(\n\s*\n)/u)) {
    if (current.length + paragraph.length <= limit) {
      current += paragraph;
      continue;
    }
    if (current) result.push(current);
    if (paragraph.length <= limit) {
      current = paragraph;
      continue;
    }
    let rest = paragraph;
    while (rest.length > limit) {
      const boundary = Math.max(rest.lastIndexOf(". ", limit), rest.lastIndexOf(", ", limit), rest.lastIndexOf("; ", limit));
      const cut = boundary > 120 ? boundary + 1 : limit;
      result.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) result.push(current);
  return result;
}

async function translate(text) {
  const output = [];
  for (const chunk of chunks(text)) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const url = new URL("https://api.mymemory.translated.net/get");
        url.searchParams.set("q", chunk);
        url.searchParams.set("langpair", "en|zh-CN");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        const translated = body?.responseData?.translatedText;
        if (typeof translated === "string" && translated.trim()) {
          output.push(translated);
          break;
        }
        throw new Error(body?.responseDetails || "empty translation");
      } catch (error) {
        if (attempt === 2) throw error;
        await sleep(error.message === "HTTP 429" ? 10000 * (attempt + 1) : 1000 * (attempt + 1));
      }
    }
    await sleep(180);
  }
  return output.join("");
}

let translatedCount = 0;
for (const item of payload.cases) {
  const original = item.prompt || "";
  item.promptEn = original;
  if (item.promptZh && item.promptZh !== original) continue;
  if (!looksEnglish(original) || hasCjk(original)) {
    item.promptZh = original;
    await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
    continue;
  }
  process.stdout.write(`Translating case ${item.id}...\n`);
  item.promptZh = await translate(original);
  translatedCount += 1;
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
}

await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Translated ${translatedCount} English cases; original prompts preserved in promptEn.`);
