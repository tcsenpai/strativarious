import { decompose, normalizeSource } from "../decompose.js";
import { apply, fmtDate, langPicker, t } from "../i18n.js";
import * as store from "../store.js";
import { $, busy, chips, download, errorText, h, registerServiceWorker, safeFilename } from "../ui.js";

$("langSlot").append(langPicker());
apply();
registerServiceWorker();

let pals = [], paints = [], thumbs = [];

async function load() {
  [pals, paints] = await Promise.all([store.listPalettes(), store.listPaintings()]);
  render();
}

const palLabel = (p) => p.demo ? `${p.name} ${t("new.demo")}` : p.synthetic ? `${p.name} (${t("synthetic.badge")})` : p.name;
const defaultPalette = () => (pals.find((p) => !p.demo && !p.synthetic) ?? pals.find((p) => !p.demo) ?? pals[0])?.id ?? "";

/** Palette <select> + warning + "pigments used" checkboxes, kept in sync. */
function paletteChooser(sel, warnEl, pigBox, checked) {
  const prev = sel.value;
  sel.replaceChildren(...pals.map((p) => h("option", { value: p.id, textContent: palLabel(p) })));
  sel.value = pals.some((p) => p.id === prev) ? prev : defaultPalette();
  const sync = () => {
    const p = pals.find((x) => x.id === sel.value);
    const msg = p?.demo ? t("new.fakeWarn") : p?.synthetic ? t("synthetic.warn") : "";
    warnEl.textContent = msg;
    warnEl.classList.toggle("hidden", !msg);
    pigBox.replaceChildren(...(p?.pigments ?? []).map((pig) => {
      const box = h("input", { type: "checkbox", value: pig.id, checked: checked ? checked.includes(pig.id) : true });
      return h("label", { className: "pick" }, box,
        h("span", { className: "chip", style: `background: rgb(${pig.masstone})` }), h("span", { textContent: pig.name }));
    }));
  };
  sel.onchange = () => { checked = null; sync(); };
  sync();
}
const pickedPigments = (pigBox) => [...pigBox.querySelectorAll("input:checked")].map((b) => b.value);

function render() {
  $("firstTime").classList.toggle("hidden", pals.some((p) => !p.demo));
  paletteChooser($("palette"), $("paletteWarn"), $("pigments"));

  $("palettes").replaceChildren(...pals.map((p) => h("div", { className: "row", style: "margin: 12px 0" },
    h("div", { style: "flex: 1; min-width: 140px" },
      h("b", { textContent: p.name }),
      ...(p.synthetic ? [h("span", { className: "badge", textContent: t("synthetic.badge") })] : []),
      h("div", { className: "small muted",
        textContent: t("palettes.count", { n: p.pigments.length }) + (p.demo ? ` · ${t("palettes.demo")}` : "") })),
    chips(p.pigments),
    h("button", { className: "icon-btn", style: "flex: none; width: 40px", title: t("palettes.export"), textContent: "⤓",
      onclick: () => exportPalette(p) }),
    ...(p.demo ? [] : [h("button", { className: "icon-btn danger", style: "flex: none; width: 40px",
      title: t("card.delete"), textContent: "🗑", onclick: () => removePalette(p) })]))));

  thumbs.forEach(URL.revokeObjectURL);
  thumbs = paints.map((p) => URL.createObjectURL(p.preview));
  $("noPaintings").classList.toggle("hidden", paints.length > 0);
  $("paintings").replaceChildren(...paints.map((p, i) => h("div", { className: "paint" },
    h("a", { href: `./viewer.html?id=${encodeURIComponent(p.id)}` },
      h("img", { src: thumbs[i], loading: "lazy", alt: "" }),
      h("div", {}, h("b", { textContent: p.title }),
        h("div", { className: "meta", textContent: t("card.palette", { name: p.palette }) }),
        chips(p.layers))),
    h("div", { className: "actions" },
      h("button", { className: "icon-btn", title: t("card.redo"), textContent: "↻", onclick: () => openRedo(p) }),
      h("button", { className: "icon-btn danger", title: t("card.delete"), textContent: "🗑", onclick: () => removePainting(p) })))));
}
addEventListener("langchange", render);

// ---------- run a decomposition ----------
async function runDecompose(btn, statusEl, { source, paletteId, pigmentIds, title }) {
  if (!pigmentIds.length) return void (statusEl.textContent = t("new.pickOne"));
  const label = btn.textContent;
  btn.disabled = true;
  busy.now = true;
  const progress = (f) => btn.replaceChildren(h("span", { className: "spinner" }), " " + t("new.progress", { pct: Math.round(f * 100) }));
  progress(0);
  statusEl.textContent = "";
  try {
    const palette = await store.getPalette(paletteId);
    const painting = await decompose(source, palette, pigmentIds, { title, onProgress: progress });
    await store.putPainting(painting);
    store.persist();
    location.href = `./viewer.html?id=${encodeURIComponent(painting.id)}`;
  } catch (err) {
    console.error(err);
    statusEl.className = "small err";
    statusEl.textContent = t("new.failed", { msg: errorText(err) });
    btn.disabled = false;
    btn.textContent = label;
    busy.now = false;
  }
}

let source = null;
async function useSource(blob, title) {
  $("status").textContent = "";
  try {
    source = await normalizeSource(blob);
  } catch {
    $("status").className = "small err";
    $("status").textContent = t("new.badImage");
    return;
  }
  $("preview").src = URL.createObjectURL(source);
  $("preview").classList.remove("hidden");
  $("form").classList.remove("hidden");
  $("title").value = title;
  $("form").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

$("photo").onchange = (e) => {
  const file = e.target.files[0];
  if (file) useSource(file, file.name.replace(/\.[^.]+$/, "").replace(/^(IMG|PXL|DSC)[_-]?/i, ""));
};
async function useDemo(url, title) {
  await useSource(await (await fetch(url)).blob(), title);
  $("palette").value = store.DEMO_ID;
  $("palette").onchange();
}
$("demoBtn").onclick = () => useDemo("./demo-ocarina.jpg", t("new.demoArtTitle"));
$("demoLandscape").onclick = () => useDemo("./demo.png", t("new.demoTitle"));
$("go").onclick = () => source && runDecompose($("go"), $("status"), {
  source, paletteId: $("palette").value, pigmentIds: pickedPigments($("pigments")),
  title: $("title").value.trim() || t("new.defaultTitle", { date: fmtDate() }),
});

// ---------- delete ----------
async function removePainting(p) {
  if (!confirm(t("confirm.painting", { name: p.title }))) return;
  await store.deletePainting(p.id);
  load();
}
async function removePalette(p) {
  if (!confirm(t("confirm.palette", { name: p.name }))) return;
  try {
    await store.deletePalette(p.id);
    load();
  } catch (err) { $("listStatus").textContent = errorText(err); }
}

// ---------- break down again with another palette ----------
let redoTarget = null;
function openRedo(p) {
  redoTarget = p;
  paletteChooser($("redoPalette"), $("redoWarn"), $("redoPigments"));
  $("redoStatus").textContent = "";
  $("redoDlg").showModal();
}
$("redoCancel").onclick = () => $("redoDlg").close();
$("redoGo").onclick = () => {
  const pal = pals.find((p) => p.id === $("redoPalette").value);
  const base = redoTarget.title.replace(/ · [^·]+$/, ""); // don't stack "· palette" suffixes
  runDecompose($("redoGo"), $("redoStatus"), {
    source: redoTarget.source, paletteId: pal.id, pigmentIds: pickedPigments($("redoPigments")),
    title: `${base} · ${pal.name}`.slice(0, 80),
  });
};

// ---------- palettes: export / import / combine ----------
function exportPalette(p) {
  const { id, demo, ...data } = p;
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${safeFilename(p.name)}.json`);
}
$("importFile").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const pal = store.validatePalette(JSON.parse(await file.text()));
    await store.putPalette({ ...pal, id: store.newId() });
    $("listStatus").textContent = "";
    load();
  } catch {
    $("listStatus").textContent = t("err.import");
  }
};

$("combineBtn").onclick = () => {
  const sources = pals.filter((p) => !p.demo);
  $("combineStatus").textContent = sources.length ? "" : t("combine.none");
  $("combineList").replaceChildren(...sources.flatMap((p) => [
    h("div", { className: "group", textContent: p.name }),
    ...p.pigments.map((pig) => {
      const box = h("input", { type: "checkbox" });
      box.pigment = pig;
      return h("label", { className: "pick" }, box,
        h("span", { className: "chip", style: `background: rgb(${pig.masstone})` }), h("span", { textContent: pig.name }));
    }),
  ]));
  $("combineName").value = t("combine.default", { date: fmtDate() });
  $("combineSave").disabled = !sources.length;
  $("combineDlg").showModal();
};
$("combineCancel").onclick = () => $("combineDlg").close();
$("combineSave").onclick = async () => {
  const pigments = [...$("combineList").querySelectorAll("input:checked")].map((b) => b.pigment);
  if (pigments.length < 2 || pigments.length > 12) return void ($("combineStatus").textContent = t("combine.need"));
  const pal = store.validatePalette({
    name: $("combineName").value.trim() || t("combine.default", { date: fmtDate() }), synthetic: true, pigments,
  });
  await store.putPalette({ ...pal, id: store.newId() });
  $("combineDlg").close();
  load();
};

// ---------- install ----------
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let installEvt = null;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvt = e;
  $("install").classList.remove("hidden");
  $("installBtn").classList.remove("hidden");
});
$("installBtn").onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  $("install").classList.add("hidden");
};
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
  $("install").classList.remove("hidden");
  $("installIos").classList.remove("hidden");
}

load();
