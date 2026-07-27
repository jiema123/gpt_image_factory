import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import esbuild from "esbuild";

const root = process.cwd();
const port = Number.parseInt(process.env.PORT || "9000", 10);
const assetsDir = path.resolve(root, process.env.CLOUDFLARE_ASSETS_DIR || ".dist/cloudflare");
const imageDir = path.resolve(root, process.env.LOCAL_IMAGE_DIR || ".dist/local-images");
const workerBundle = path.resolve(root, ".dist/cloudflare-worker-local.mjs");

await mkdir(path.dirname(workerBundle), { recursive: true });
await mkdir(imageDir, { recursive: true });
await esbuild.build({
  entryPoints: [path.resolve(root, "cloudflare/worker.ts")],
  outfile: workerBundle,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "silent",
});

const worker = await import(`${pathToFileURL(workerBundle).href}?t=${Date.now()}`);
const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
  OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
  OPENAI_PROJECT_ID: process.env.OPENAI_PROJECT_ID,
  ASSETS: localAssetsBinding(assetsDir),
  IMAGES: localR2Binding(imageDir),
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = toRequest(incoming);
    const response = await worker.default.fetch(request, env);
    outgoing.statusCode = response.status;
    response.headers.forEach((value, key) => outgoing.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body).pipe(outgoing);
    } else {
      outgoing.end();
    }
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "application/json; charset=utf-8");
    outgoing.end(JSON.stringify({ detail: error instanceof Error ? error.message : "Local Cloudflare dev server failed" }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local Cloudflare-compatible server: http://127.0.0.1:${port}/`);
  console.log(`Generated images directory: ${imageDir}`);
});

function toRequest(incoming) {
  const protocol = "http";
  const host = incoming.headers.host || `127.0.0.1:${port}`;
  const url = `${protocol}://${host}${incoming.url || "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  const init = { method: incoming.method || "GET", headers };
  if (incoming.method && !["GET", "HEAD"].includes(incoming.method)) {
    init.body = Readable.toWeb(incoming);
    init.duplex = "half";
  }
  return new Request(url, init);
}

function localR2Binding(baseDir) {
  return {
    async put(key, value, options = {}) {
      const filePath = safeJoin(baseDir, key);
      await mkdir(path.dirname(filePath), { recursive: true });
      const buffer = Buffer.from(await toArrayBuffer(value));
      await writeFile(filePath, buffer);
      if (options.httpMetadata?.contentType) {
        await writeFile(`${filePath}.metadata.json`, JSON.stringify({ contentType: options.httpMetadata.contentType }, null, 2));
      }
    },
    async get(key) {
      const filePath = safeJoin(baseDir, key);
      try {
        const metadata = await readMetadata(filePath);
        await stat(filePath);
        return {
          body: Readable.toWeb(createReadStream(filePath)),
          httpMetadata: metadata,
        };
      } catch {
        return null;
      }
    },
  };
}

function localAssetsBinding(baseDir) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = safeJoin(baseDir, pathname.replace(/^\/+/, ""));
      try {
        const stats = await stat(filePath);
        if (!stats.isFile()) return new Response("Not found", { status: 404 });
        return new Response(Readable.toWeb(createReadStream(filePath)), {
          headers: { "content-type": contentTypeForPath(filePath) },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  };
}

async function toArrayBuffer(value) {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  if (value instanceof Blob) return value.arrayBuffer();
  if (typeof value === "string") return new TextEncoder().encode(value).buffer;
  return new Response(value).arrayBuffer();
}

async function readMetadata(filePath) {
  try {
    return JSON.parse(await readFile(`${filePath}.metadata.json`, "utf8"));
  } catch {
    return { contentType: contentTypeForPath(filePath) };
  }
}

function safeJoin(baseDir, unsafePath) {
  const resolved = path.resolve(baseDir, unsafePath);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}${path.sep}`)) {
    throw new Error("Path escapes local storage directory");
  }
  return resolved;
}

function contentTypeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json" || ext === ".webmanifest") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}
