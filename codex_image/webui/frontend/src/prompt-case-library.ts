import { getLegacyBridge } from "./state";
import { getEls } from "./dom";

type CaseItem = {
  id: number;
  title: string;
  image: string;
  prompt: string;
  promptZh?: string;
  promptEn?: string;
  category?: string;
  styles?: string[];
  scenes?: string[];
};

const DATA_URL = "/static/prompt-library/cases.json";
const IMAGE_ROOT = "/static/prompt-library";
const bridge = getLegacyBridge();
const els = getEls();
let cases: CaseItem[] = [];
let query = "";
let language: "zh" | "en" = "zh";

function escapeHtml(value: unknown): string {
  return bridge.methods.escapeHtml(value);
}

function imageUrl(item: CaseItem): string {
  return `${IMAGE_ROOT}${item.image}`;
}

function promptFor(item: CaseItem): string {
  if (language === "en") return item.promptEn || item.prompt;
  return item.promptZh || item.prompt;
}

function updateLanguageButton(): void {
  const button = els.promptCaseLibraryLanguage as HTMLButtonElement | null;
  if (!button) return;
  button.textContent = language === "zh" ? "English" : "中文";
  button.setAttribute("aria-label", language === "zh" ? "切换到英文 prompt" : "切换到中文 prompt");
}

function fillPromptEditor(prompt: string): void {
  const editor = els.promptEditor as HTMLElement | null;
  if (editor) {
    editor.innerHTML = escapeHtml(prompt).replace(/\n/g, "<br>");
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: null }));
  }
  bridge.methods.setPromptText(prompt);
  bridge.methods.updatePromptCount();
  bridge.methods.updateRequestPreview();
}

function filteredCases(): CaseItem[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return cases;
  return cases.filter((item) => [item.title, item.category, item.prompt, item.promptZh, item.promptEn, ...(item.styles || []), ...(item.scenes || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
}

function render(): void {
  if (!els.promptCaseLibraryList) return;
  updateLanguageButton();
  const items = filteredCases();
  els.promptCaseLibraryList.innerHTML = items.length ? items.map((item) => `
    <button class="prompt-template-card prompt-case-library-card" type="button" data-case-id="${item.id}">
      <div class="prompt-template-card-thumb"><img src="${escapeHtml(imageUrl(item))}" alt="${escapeHtml(item.title)}" loading="lazy"></div>
      <div class="prompt-template-card-body">
        <div class="prompt-template-card-title">${escapeHtml(item.title)}</div>
        <div class="prompt-template-card-subtitle">${escapeHtml(item.category || "GPT-Image 案例")}</div>
        <div class="prompt-template-card-preview">${escapeHtml(promptFor(item).replace(/\s+/g, " ").slice(0, 150))}</div>
      </div>
    </button>`).join("") : `<div class="prompt-template-empty">没有匹配的案例</div>`;
  els.promptCaseLibraryList.querySelectorAll("[data-case-id]").forEach((button: Element) => {
    button.addEventListener("click", () => void selectCase(Number((button as HTMLElement).dataset.caseId)));
  });
  if (els.promptCaseLibrarySummary) {
    els.promptCaseLibrarySummary.textContent = query ? `找到 ${filteredCases().length} 个案例` : `来自 awesome-gpt-image-2 的 ${cases.length} 个 prompt 案例`;
  }
}

async function selectCase(id: number): Promise<void> {
  const item = cases.find((candidate) => candidate.id === id);
  if (!item) return;
  fillPromptEditor(promptFor(item));
  close();
  try {
    const file = await bridge.methods.imageFileFromUrl(imageUrl(item), `case-${item.id}.jpg`);
    bridge.methods.addImageFiles([file], { source: "prompt-case-library" });
    bridge.methods.setStatus(`已载入「${item.title}」的 prompt 和参考图`, "success");
  } catch (error) {
    console.warn("Unable to load prompt case reference image", error);
    bridge.methods.setStatus("prompt 已载入，但参考图加载失败", "error");
  }
}

function open(): void {
  (bridge.methods as any).closeGallery?.({ restoreFocus: false });
  els.promptCaseLibraryDrawer?.classList.add("open");
  els.promptCaseLibraryDrawer?.setAttribute("aria-hidden", "false");
  els.promptCaseLibraryDrawerBackdrop?.classList.remove("hidden");
  els.promptCaseLibraryButton?.setAttribute("aria-expanded", "true");
  render();
  els.promptCaseLibrarySearch?.focus({ preventScroll: true });
}

function close(): void {
  els.promptCaseLibraryDrawer?.classList.remove("open");
  els.promptCaseLibraryDrawer?.setAttribute("aria-hidden", "true");
  els.promptCaseLibraryDrawerBackdrop?.classList.add("hidden");
  els.promptCaseLibraryButton?.setAttribute("aria-expanded", "false");
}

export function initPromptCaseLibraryFeature(): void {
  els.promptCaseLibraryButton?.addEventListener("click", open);
  els.promptCaseLibraryDrawerClose?.addEventListener("click", close);
  els.promptCaseLibraryDrawerBackdrop?.addEventListener("click", close);
  els.promptCaseLibrarySearch?.addEventListener("input", (event: Event) => {
    query = (event.target as HTMLInputElement).value;
    render();
  });
  els.promptCaseLibraryLanguage?.addEventListener("click", () => {
    language = language === "zh" ? "en" : "zh";
    render();
  });
  void fetch(DATA_URL).then((response) => response.json()).then((payload) => {
    cases = Array.isArray(payload?.cases) ? payload.cases : [];
    render();
  }).catch((error) => {
    console.warn("Unable to load prompt case library", error);
    if (els.promptCaseLibraryList) els.promptCaseLibraryList.innerHTML = `<div class="prompt-template-empty">案例库加载失败</div>`;
  });
}
