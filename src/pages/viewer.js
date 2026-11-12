import { t } from "../i18n.js";
import { getPainting } from "../store.js";
import { $, download, registerServiceWorker, safeFilename } from "../ui.js";
import { startViewer } from "../viewer/viewer.js";

registerServiceWorker();

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Self-contained HTML (viewer + images inlined): opens offline, can be sent to anyone. */
async function exportHtml(p) {
  const template = await (await fetch("./standalone.html")).text();
  const data = {
    ...meta(p),
    original: await blobToDataUrl(p.preview),
    layers: await Promise.all(p.layers.map(async ({ png, ...l }) => ({ ...l, src: await blobToDataUrl(png) }))),
  };
  // Function replacers: titles and JSON may contain "$&"-style patterns.
  const html = template
    .replace("__TITLE__", () => escapeHtml(p.title))
    .replace("__DATA__", () => JSON.stringify(data).replace(/</g, "\\u003c"));
  download(new Blob([html], { type: "text/html" }), `${safeFilename(p.title)}.html`);
}

const meta = ({ title, palette, width, height, paper, paperSuspect, error, whitesFraction }) =>
  ({ title, palette, width, height, paper, paperSuspect, error, whitesFraction });

const id = new URLSearchParams(location.search).get("id");
const painting = id && (await getPainting(id));
if (!painting) {
  $("loading").textContent = t("err.not_found");
  setTimeout(() => location.replace("./"), 1500);
} else {
  startViewer({
    ...meta(painting),
    original: URL.createObjectURL(painting.preview),
    layers: painting.layers.map(({ png, ...l }) => ({ ...l, src: URL.createObjectURL(png) })),
  }, { homeHref: "./", onExport: () => exportHtml(painting) });
}
