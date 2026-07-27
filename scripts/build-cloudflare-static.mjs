import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "codex_image", "webui", "static");
const target = path.join(root, ".dist", "cloudflare");
const targetStatic = path.join(target, "static");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
await rm(targetStatic, { recursive: true, force: true });
await mkdir(targetStatic, { recursive: true });

const staticEntries = [
  "app.js",
  "app.js.map",
  "history.js",
  "history.js.map",
  "pwa.js",
  "styles.css",
  "styles",
  "brand",
];

for (const entry of staticEntries) {
  await cp(path.join(source, entry), path.join(targetStatic, entry), { recursive: true });
}
