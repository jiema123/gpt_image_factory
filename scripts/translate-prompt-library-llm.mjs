import fs from "node:fs/promises";

const file = "codex_image/webui/static/prompt-library/cases.json";
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

const payload = JSON.parse(await fs.readFile(file, "utf8"));
const isEnglish = (value) => {
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  const cjk = (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) || []).length;
  return latin > 80 && latin > cjk * 1.8;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function translate(item) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 8000,
      messages: [
        {
          role: "system",
          content: "你是专业的 AI 生图提示词本地化编辑。将英文提示词翻译成精确、自然、适合图像生成模型的简体中文。保留原文的段落结构、列表、比例、尺寸、颜色值、变量占位符、引号、标点和所有专有名词；不要删减、总结、解释或添加内容。只输出翻译后的提示词。",
        },
        { role: "user", content: item.promptEn },
      ],
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const result = body?.choices?.[0]?.message?.content?.trim();
  if (!result) throw new Error("empty translation");
  return result;
}

const queue = payload.cases.filter((item) => {
  const current = item.promptZh || "";
  const invalid = /QUERY LENGTH LIMIT EXCEEDED|translation failed|^HTTP \d+/iu.test(current);
  return isEnglish(item.promptEn || item.prompt) && (item.promptZh === item.promptEn || invalid);
});
let cursor = 0;
let completed = 0;
let saveChain = Promise.resolve();
const save = () => {
  saveChain = saveChain.then(() => fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`));
  return saveChain;
};

async function worker() {
  while (cursor < queue.length) {
    const item = queue[cursor++];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        item.promptZh = await translate(item);
        completed += 1;
        console.log(`Translated ${item.id} (${completed}/${queue.length})`);
        await save();
        break;
      } catch (error) {
        if (attempt === 2) {
          console.error(`Failed ${item.id}: ${error.message}`);
          break;
        }
        await sleep(2000 * (attempt + 1));
      }
    }
  }
}

await Promise.all(Array.from({ length: 4 }, () => worker()));
await save();
console.log(`Finished ${completed}/${queue.length} English cases; promptEn was preserved.`);
