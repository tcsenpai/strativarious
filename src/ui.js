// Small DOM helpers shared by the pages.
import { t } from "./i18n.js";

export const $ = (id) => document.getElementById(id);

export function h(tag, props = {}, ...kids) {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
}

export const chips = (pigs) => h("div", { className: "swatches" },
  ...pigs.map((p) => h("span", { className: "chip", title: p.name, style: `background: rgb(${p.masstone})` })));

export function download(blob, filename) {
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const safeFilename = (s) => (s || "strativarious").replace(/[^\p{L}\p{N}\- ]+/gu, "").trim() || "strativarious";

/** Error code (thrown by store/validation) -> translated message. */
export const errorText = (err) => t(`err.${err.message}`) === `err.${err.message}` ? err.message : t(`err.${err.message}`);

/** Set while work would be lost by a reload (e.g. a running decomposition). */
export const busy = { now: false };

/**
 * The service worker serves the app cache-first, so a new release is installed in the background.
 * When it takes over, reload once to show it, unless `autoReload` is off (calibration in progress
 * would lose its corners) or the page is busy.
 */
export function registerServiceWorker({ autoReload = true } = {}) {
  if (!("serviceWorker" in navigator) || !isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && autoReload && !busy.now) location.reload();
  });
  navigator.serviceWorker.register("./sw.js");
}
