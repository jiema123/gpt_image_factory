type Env = {
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_IMAGE_MODEL?: string;
  OPENAI_ORG_ID?: string;
  OPENAI_PROJECT_ID?: string;
  ALLOW_CLIENT_API_SETTINGS?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  IMAGES?: R2Bucket;
};

type TaskStatus = "completed" | "failed";
type TaskMode = "generate" | "edit";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_QUALITY = "low";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export async function handlePagesFunction(context: { request: Request; env: Env }): Promise<Response> {
  return handleRequest(context.request, context.env);
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      auth_available: isApiConfigured(env),
      cloudflare: true,
      auth: authStatus(env),
      input_root: "Cloudflare runtime",
      output_root: "Cloudflare runtime",
      gallery_root: "Cloudflare runtime",
      source_data_root: "Cloudflare runtime",
      queue_worker_running: false,
    });
  }

  if (url.pathname === "/api/auth") {
    if (request.method === "GET" || request.method === "PATCH") return json(authStatus(env));
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (url.pathname === "/api/settings") {
    if (request.method === "GET") {
      return json({ settings: runtimeSettings(), restart_required: false });
    }
    if (request.method === "PATCH") {
      const payload = await readJsonObject(request);
      return json({ settings: runtimeSettings(payload.locale), restart_required: false });
    }
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (url.pathname === "/api/api-settings") {
    if (request.method === "GET" || request.method === "PATCH") {
      const configured = isApiConfigured(env);
      return json({ settings: publicApiSettings(env, configured) });
    }
    return methodNotAllowed(["GET", "PATCH"]);
  }

  if (url.pathname === "/api/generate" && request.method === "POST") {
    return handleImageRequest(request, env, "generate");
  }

  if (url.pathname === "/api/edit" && request.method === "POST") {
    return handleImageRequest(request, env, "edit");
  }

  if (url.pathname.startsWith("/api/images/") && request.method === "GET") {
    return serveStoredImage(url.pathname, env);
  }

  const empty = emptyApiResponse(url.pathname, request.method);
  if (empty) return empty;

  if (url.pathname === "/history" && env.ASSETS) {
    return env.ASSETS.fetch(rewritePath(request, "/history.html"));
  }

  if (env.ASSETS) return env.ASSETS.fetch(request);

  return json({ detail: "Not found" }, { status: 404 });
}

async function handleImageRequest(request: Request, env: Env, mode: TaskMode): Promise<Response> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ detail: "Cloudflare deployment requires OPENAI_API_KEY secret." }, { status: 503 });
  }

  const form = await request.formData();
  const prompt = field(form, "prompt").trim();
  if (!prompt) return json({ detail: "prompt is required" }, { status: 400 });

  const requestedApiMode = field(form, "api_mode") || "images";
  if (requestedApiMode !== "images") {
    return json({ detail: "Cloudflare runtime currently supports OpenAI-compatible Images API mode only." }, { status: 400 });
  }

  const model = field(form, "model") || field(form, "main_model") || env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  const n = clampInt(field(form, "n"), 1, 4, 1);
  const outputFormat = field(form, "output_format") || "png";
  const payload = new FormData();
  payload.set("prompt", prompt);
  payload.set("model", model);
  payload.set("n", String(n));
  appendIfUsable(payload, "size", normalizeSize(field(form, "size")));
  appendIfUsable(payload, "quality", normalizeAuto(field(form, "quality")) || DEFAULT_QUALITY);
  appendIfUsable(payload, "background", normalizeAuto(field(form, "background")));
  appendIfUsable(payload, "moderation", normalizeAuto(field(form, "moderation")));
  appendIfUsable(payload, "output_format", normalizeAuto(outputFormat));
  appendIfUsable(payload, "output_compression", field(form, "output_compression"));

  if (mode === "edit") {
    const images = form.getAll("images").filter(isFileWithContent);
    if (!images.length) return json({ detail: "At least one image is required" }, { status: 400 });
    for (const image of images) payload.append("image", image, image.name || "image.png");
    const mask = form.get("mask");
    if (isFileWithContent(mask)) payload.set("mask", mask, mask.name || "mask.png");
    appendIfUsable(payload, "input_fidelity", normalizeAuto(field(form, "input_fidelity")));
  } else {
    const references = form.getAll("reference_images").filter(isFileWithContent);
    for (const image of references) payload.append("image", image, image.name || "reference.png");
  }

  const endpoint = mode === "edit" ? "/images/edits" : "/images/generations";
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(`${baseUrl(env)}${endpoint}`, {
      method: "POST",
      headers: authHeaders(env, apiKey),
      body: payload,
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json({ detail: apiErrorMessage(data, response.statusText) }, { status: response.status });
    }
    const completedAt = new Date().toISOString();
    const taskId = `cf-${crypto.randomUUID()}`;
    const items = Array.isArray(data?.data) ? data.data : [];
    const { outputs, persisted } = await persistOutputs(items, {
      env,
      taskId,
      outputFormat,
      quality: field(form, "quality") || DEFAULT_QUALITY,
    });
    const task = taskFromOutputs(outputs, {
      taskId,
      mode,
      prompt,
      model,
      n,
      size: field(form, "size") || "auto",
      quality: field(form, "quality") || DEFAULT_QUALITY,
      outputFormat,
      startedAt,
      completedAt,
    });
    return json({ task, persisted, request: redactRequestPayload(payload, endpoint) });
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : "Image request failed" }, { status: 502 });
  }
}

function emptyApiResponse(pathname: string, method: string): Response | null {
  if (method === "GET" && pathname === "/api/queue") {
    return json({ waiting: [], running: [], summary: { waiting_count: 0, running_count: 0, channel_count: 1, usable_channel_count: 1 } });
  }
  if (method === "GET" && pathname === "/api/events") {
    const payload = `data: ${JSON.stringify({
      type: "snapshot",
      tasks: [],
      queue: { waiting: [], running: [], summary: { waiting_count: 0, running_count: 0, channel_count: 1, usable_channel_count: 1 } },
      gallery: [],
      auth: { source: "api", available: true },
    })}\n\n`;
    return new Response(payload, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (method === "GET" && pathname === "/api/tasks/recent") return json({ tasks: [] });
  if (method === "GET" && pathname === "/api/tasks") return json({ tasks: [] });
  if (method === "GET" && pathname === "/api/task-history/summary") return json({ total: 0, months: [], filters: {} });
  if (method === "GET" && pathname === "/api/task-history/tasks") return json({ tasks: [], next_cursor: null, prev_cursor: null, total: 0 });
  if (method === "GET" && pathname === "/api/gallery") return json({ items: [] });
  if (method === "GET" && pathname === "/api/gallery/categories") return json({ categories: defaultGalleryCategories(), restart_required: false });
  if (method === "GET" && pathname === "/api/reference-assets/recent") return json({ assets: [] });
  if (method === "GET" && pathname === "/api/prompt-snippets") return json({ snippets: [], restart_required: false });
  if (method === "GET" && pathname === "/api/prompt-templates") return json({ templates: [], categories: [], restart_required: false });
  if (method === "GET" && pathname === "/api/color-palette") return json({ palette: defaultColorPalette(), restart_required: false });
  if (method === "GET" && pathname === "/api/app-version") {
    return json({ version: "cloudflare", current_version: "cloudflare", latest_version: null, update_available: false, platform: "cloudflare" });
  }
  if (method === "PATCH" && pathname === "/api/color-palette") return json({ palette: defaultColorPalette(), restart_required: false });
  if (method === "POST" && (pathname === "/api/app-version/open-updater" || pathname === "/api/app-version/dismiss-onboarding")) {
    return json({ ok: true, cloudflare: true });
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method) && isCloudReadonlyPath(pathname)) {
    return json({ detail: "This Cloudflare deployment is stateless and does not persist local WebUI data." }, { status: 409 });
  }
  return null;
}

type StoredOutput = {
  index: number;
  status: "completed";
  url: string;
  thumbnail_url: string;
  format: string;
  quality: string;
  revised_prompt?: string;
  usage?: unknown;
  persisted: boolean;
};

// Persist each generated image into R2 so history links stay valid after the
// upstream provider's temporary URL expires. When R2 is not bound, fall back to
// passing the upstream url / inline data URL through unchanged.
async function persistOutputs(items: any[], context: {
  env: Env;
  taskId: string;
  outputFormat: string;
  quality: string;
}): Promise<{ outputs: StoredOutput[]; persisted: boolean }> {
  const ext = imageExtension(context.outputFormat);
  const contentType = imageContentType(context.outputFormat);
  let persistedAny = false;

  const outputs = await Promise.all(items.map(async (item: any, index: number): Promise<StoredOutput> => {
    const fallbackUrl = item?.url || (item?.b64_json ? `data:${contentType};base64,${item.b64_json}` : "");
    const base: StoredOutput = {
      index: index + 1,
      status: "completed",
      url: fallbackUrl,
      thumbnail_url: fallbackUrl,
      format: context.outputFormat,
      quality: context.quality,
      revised_prompt: item?.revised_prompt,
      usage: item?.usage,
      persisted: false,
    };

    if (!context.env.IMAGES) return base;

    const bytes = await imageBytes(item, context.env, contentType);
    if (!bytes) return base;

    const key = `${context.taskId}/${index + 1}.${ext}`;
    try {
      await context.env.IMAGES.put(key, bytes, { httpMetadata: { contentType } });
      const storedUrl = `/api/images/${key}`;
      persistedAny = true;
      return { ...base, url: storedUrl, thumbnail_url: storedUrl, persisted: true };
    } catch {
      return base;
    }
  }));

  return { outputs, persisted: persistedAny };
}

async function imageBytes(item: any, env: Env, contentType: string): Promise<ArrayBuffer | null> {
  if (item?.b64_json) return base64ToArrayBuffer(item.b64_json);
  if (item?.url) {
    try {
      const response = await fetch(item.url, { headers: authHeaders(env, env.OPENAI_API_KEY || "") });
      if (!response.ok) return null;
      return await response.arrayBuffer();
    } catch {
      return null;
    }
  }
  return null;
}

async function serveStoredImage(pathname: string, env: Env): Promise<Response> {
  if (!env.IMAGES) {
    return json({ detail: "Image storage (R2) is not configured on this deployment." }, { status: 404 });
  }
  const key = decodeURIComponent(pathname.slice("/api/images/".length));
  if (!key || key.includes("..")) return json({ detail: "Invalid image key" }, { status: 400 });
  const object = await env.IMAGES.get(key);
  if (!object) return json({ detail: "Image not found" }, { status: 404 });
  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}

function taskFromOutputs(outputs: StoredOutput[], context: {
  taskId: string;
  mode: TaskMode;
  prompt: string;
  model: string;
  n: number;
  size: string;
  quality: string;
  outputFormat: string;
  startedAt: string;
  completedAt: string;
}) {
  const status: TaskStatus = outputs.length ? "completed" : "failed";
  return {
    task_id: context.taskId,
    created_at: context.startedAt,
    updated_at: context.completedAt,
    queued_at: context.startedAt,
    started_at: context.startedAt,
    completed_at: context.completedAt,
    mode: context.mode,
    status,
    prompt: context.prompt,
    prompt_for_model: context.prompt,
    params: {
      main_model: context.model,
      model: context.model,
      size: context.size,
      quality: context.quality,
      output_format: context.outputFormat,
      n: context.n,
      api_mode: "images",
      api_provider_id: "cloudflare",
      api_provider_name: "Cloudflare Secret",
    },
    outputs,
    output_url: outputs[0]?.url,
    output_urls: outputs.map((item) => item.url).filter(Boolean),
    generated_count: outputs.length,
    failed_count: outputs.length ? 0 : context.n,
    total_count: context.n,
    backend: "api_images",
    requested_backend: "api_images",
    channel_id: "cloudflare-api",
    attempts: 1,
    max_attempts: 1,
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function imageExtension(outputFormat: string): string {
  const value = (outputFormat || "png").toLowerCase();
  if (value === "jpeg" || value === "jpg") return "jpg";
  if (value === "webp") return "webp";
  return "png";
}

function imageContentType(outputFormat: string): string {
  const ext = imageExtension(outputFormat);
  if (ext === "jpg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function isCloudReadonlyPath(pathname: string) {
  return pathname.startsWith("/api/gallery")
    || pathname.startsWith("/api/reference-assets")
    || pathname.startsWith("/api/prompt-snippets")
    || pathname.startsWith("/api/prompt-templates")
    || pathname.startsWith("/api/prompt-template-categories")
    || pathname.startsWith("/api/color-palette")
    || pathname.startsWith("/api/queue")
    || pathname.startsWith("/api/tasks");
}

function authStatus(env: Env) {
  return {
    source: "api",
    available: isApiConfigured(env),
    auth_available: isApiConfigured(env),
    cloudflare: true,
    message: isApiConfigured(env) ? "Cloudflare API mode is configured." : "Set OPENAI_API_KEY as a Cloudflare secret.",
  };
}

function runtimeSettings(locale?: unknown) {
  return {
    input_root: "Cloudflare runtime",
    output_root: "Cloudflare runtime",
    gallery_root: "Cloudflare runtime",
    source_data_root: "Cloudflare runtime",
    locale: typeof locale === "string" && locale ? locale : "zh-CN",
  };
}

function publicApiSettings(env: Env, configured: boolean) {
  return {
    codex_mode: "images",
    active_provider_id: "cloudflare",
    providers: [{
      id: "cloudflare",
      name: "Cloudflare Secret",
      base_url: env.OPENAI_BASE_URL || DEFAULT_BASE_URL,
      api_key: configured && env.ALLOW_CLIENT_API_SETTINGS === "true" ? "configured-in-cloudflare" : "",
      image_model: env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
      api_mode: "images",
      images_concurrency: 1,
    }],
  };
}

function defaultGalleryCategories() {
  return [
    { id: "portrait", name: "人像", prompt_role: "人像参考", order: 10 },
    { id: "character", name: "角色", prompt_role: "角色参考", order: 20 },
    { id: "product", name: "产品", prompt_role: "产品参考", order: 30 },
  ];
}

function defaultColorPalette() {
  return {
    version: 1,
    favorites: [
      { name: "白色", hex: "#FFFFFF", order: 10 },
      { name: "黑色", hex: "#111111", order: 20 },
      { name: "暖米色", hex: "#F6E8D8", order: 30 },
      { name: "浅绿", hex: "#E6F0EC", order: 40 },
      { name: "品牌绿", hex: "#457B66", order: 50 },
      { name: "桃橙", hex: "#F4B183", order: 60 },
      { name: "浅蓝", hex: "#B7D7F0", order: 70 },
      { name: "浅粉", hex: "#F8D7DA", order: 80 },
    ],
    recent_colors: [],
    recent_limit: 6,
  };
}

function isApiConfigured(env: Env) {
  return Boolean(env.OPENAI_API_KEY);
}

function baseUrl(env: Env) {
  return (env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function authHeaders(env: Env, apiKey: string) {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
  if (env.OPENAI_ORG_ID) headers["OpenAI-Organization"] = env.OPENAI_ORG_ID;
  if (env.OPENAI_PROJECT_ID) headers["OpenAI-Project"] = env.OPENAI_PROJECT_ID;
  return headers;
}

function field(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function isFileWithContent(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function normalizeAuto(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "auto" || trimmed === "default") return "";
  return trimmed;
}

function normalizeSize(value: string) {
  const trimmed = normalizeAuto(value);
  if (!trimmed) return "";
  return trimmed.replace("×", "x");
}

function appendIfUsable(form: FormData, key: string, value: string) {
  if (value) form.set(key, value);
}

function clampInt(value: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function readJsonObject(request: Request) {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function redactRequestPayload(form: FormData, endpoint: string) {
  const payload: Record<string, unknown> = { endpoint };
  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      payload[key] = `[file:${value.name || "upload"};${value.type || "application/octet-stream"};${value.size}]`;
    } else if (key.toLowerCase().includes("key")) {
      payload[key] = "[redacted]";
    } else {
      payload[key] = value;
    }
  }
  return payload;
}

function apiErrorMessage(data: any, fallback: string) {
  return data?.error?.message || data?.detail || data?.message || fallback || "Image request failed";
}

function rewritePath(request: Request, pathname: string) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

function methodNotAllowed(allow: string[]) {
  return json({ detail: "Method not allowed" }, { status: 405, headers: { Allow: allow.join(", ") } });
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}
