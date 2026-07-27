import { getLegacyBridge } from "./state";
import { getEls } from "./dom";

const bridge = getLegacyBridge();
const els = getEls();

function close(): void {
  els.advancedSettingsDrawer?.classList.remove("open");
  els.advancedSettingsDrawer?.setAttribute("aria-hidden", "true");
  els.advancedSettingsDrawerBackdrop?.classList.add("hidden");
  els.advancedSettingsButton?.setAttribute("aria-expanded", "false");
}

function open(): void {
  (bridge.methods as any).closeGallery?.({ restoreFocus: false });
  els.advancedSettingsDrawer?.classList.add("open");
  els.advancedSettingsDrawer?.setAttribute("aria-hidden", "false");
  els.advancedSettingsDrawerBackdrop?.classList.remove("hidden");
  els.advancedSettingsButton?.setAttribute("aria-expanded", "true");
  els.advancedSettingsDrawerClose?.focus({ preventScroll: true });
}

export function initAdvancedSettingsFeature(): void {
  const outputPanel = document.querySelector(".output-panel");
  if (outputPanel && els.advancedSettingsBody) {
    els.advancedSettingsBody.append(outputPanel);
  }
  const promptEntry = document.querySelector(".prompt-template-entry");
  const galleryButton = els.galleryManageButton;
  const galleryHost = galleryButton?.closest("#galleryManagePanel");
  if (promptEntry && galleryButton) {
    galleryButton.classList.add("prompt-template-button");
    promptEntry.insertBefore(galleryButton, els.advancedSettingsButton || null);
    galleryHost?.remove();
  }
  els.advancedSettingsButton?.addEventListener("click", open);
  els.advancedSettingsDrawerClose?.addEventListener("click", close);
  els.advancedSettingsDrawerBackdrop?.addEventListener("click", close);
}
