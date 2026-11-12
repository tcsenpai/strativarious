import { homography, relativeToPaper } from "../core/homography.js";
import { LIN8, luminance } from "../core/km.js";
import { apply, fmtDate, langPicker, t } from "../i18n.js";
import * as store from "../store.js";
import { $, errorText, h, registerServiceWorker } from "../ui.js";

const COLS = 4; // paper, full, medium, diluted

$("langSlot").append(langPicker());
apply();
registerServiceWorker({ autoReload: false });

// SVG schema with 4 example rows
$("schemaRows").innerHTML = [0, 1, 2, 3].map((r) => {
  const hue = ["#d9a441", "#c23b6b", "#3a4fa3", "#7a4a2c"][r];
  return [0.0, 1, 0.55, 0.22].map((a, c) =>
    `<rect x="${c * 60 + 6}" y="${r * 30 + 5}" width="48" height="20" rx="3" fill="${hue}" fill-opacity="${a}"/>`).join("") +
    `<line x1="0" x2="240" y1="${r * 30}" y2="${r * 30}" stroke="#3a3f4b"/>`;
}).join("") + [1, 2, 3].map((c) => `<line y1="0" y2="120" x1="${c * 60}" x2="${c * 60}" stroke="#3a3f4b"/>`).join("");

const lum = (rgb) => luminance(LIN8[rgb[0]], LIN8[rgb[1]], LIN8[rgb[2]]);

// ---------- state ----------
const cv = $("cv"), ctx = cv.getContext("2d");
let img = null, pixels = null, corners = [], drag = -1, samples = [], hover = null;
const rows = () => Math.min(Math.max(parseInt($("rows").value) || 8, 2), 12);
const savedNames = JSON.parse(localStorage.getItem("strati.names") || "[]");

$("photo").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  img = h("canvas", { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const ictx = img.getContext("2d", { willReadFrequently: true });
  ictx.drawImage(bmp, 0, 0, img.width, img.height);
  pixels = ictx.getImageData(0, 0, img.width, img.height);
  cv.width = img.width; cv.height = img.height;
  corners = [];
  $("step3").classList.remove("hidden");
  $("step4").classList.add("hidden");
  update();
  $("step3").scrollIntoView({ behavior: "smooth" });
};
$("rows").oninput = () => { if (img) update(); };
$("reset").onclick = () => { corners = []; $("step4").classList.add("hidden"); update(); };
addEventListener("langchange", () => { if (img) update(); });

function median(arr) { arr.sort((a, b) => a - b); return arr[arr.length >> 1]; }
function sampleCell(H, r, c, n) {
  // central 40% of the cell, 7x7 points, per-channel median (robust to granulation and edges)
  const R = [], G = [], B = [], pts = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    const u = (c + 0.3 + 0.4 * i / 6) / COLS, v = (r + 0.3 + 0.4 * j / 6) / n;
    const [x, y] = H(u, v).map(Math.round);
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) continue;
    const o = (y * pixels.width + x) * 4;
    R.push(pixels.data[o]); G.push(pixels.data[o + 1]); B.push(pixels.data[o + 2]);
    pts.push([x, y]);
  }
  return { rgb: R.length ? [median(R), median(G), median(B)] : [0, 0, 0], pts };
}

function update() {
  const n = rows();
  samples = [];
  if (corners.length === 4) {
    const H = homography(corners);
    for (let r = 0; r < n; r++) samples.push([0, 1, 2, 3].map((c) => sampleCell(H, r, c, n)));
  }
  draw();
  $("prompt").textContent = corners.length < 4
    ? t("cal.corner", { corner: t(`cal.c${corners.length}`), n: corners.length + 1 })
    : t("cal.done");
  if (corners.length === 4) showPigments();
}

function draw() {
  const s = img.width / 600; // stroke widths proportional to the photo
  ctx.drawImage(img, 0, 0);
  if (corners.length === 4) {
    const H = homography(corners), n = rows();
    ctx.strokeStyle = "#e7b469"; ctx.lineWidth = 1.5 * s;
    const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...H(...a)); ctx.lineTo(...H(...b)); ctx.stroke(); };
    for (let c = 0; c <= COLS; c++) line([c / COLS, 0], [c / COLS, 1]);
    for (let r = 0; r <= n; r++) line([0, r / n], [1, r / n]);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1 * s;
    samples.flat().forEach(({ pts }) => {
      if (!pts.length) return;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      ctx.strokeRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    });
  } else if (corners.length > 1) {
    ctx.strokeStyle = "#e7b469"; ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); corners.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
  }
  corners.forEach(([x, y], i) => {
    ctx.fillStyle = "#e7b469"; ctx.strokeStyle = "#1d1f24"; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(x, y, 14 * s, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1d1f24"; ctx.font = `bold ${15 * s}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(i + 1, x, y);
  });
  if (hover) drawLoupe(hover, s);
}

// Magnifier: the finger covers exactly the point being placed.
function drawLoupe([x, y], s) {
  const R = 70 * s, zoom = 3, src = R / zoom;
  const cx = x < img.width / 2 ? img.width - R - 10 * s : R + 10 * s, cy = R + 10 * s;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  ctx.drawImage(img, x - src, y - src, src * 2, src * 2, cx - R, cy - R, R * 2, R * 2);
  ctx.strokeStyle = "#e7b469"; ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.moveTo(cx - 12 * s, cy); ctx.lineTo(cx + 12 * s, cy); ctx.moveTo(cx, cy - 12 * s); ctx.lineTo(cx, cy + 12 * s); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#e7b469"; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
}

function toImage(e) {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)];
}
cv.addEventListener("pointerdown", (e) => {
  if (!img) return;
  cv.setPointerCapture(e.pointerId);
  const p = toImage(e), hit = 40 * (cv.width / cv.getBoundingClientRect().width);
  drag = corners.findIndex(([x, y]) => Math.hypot(x - p[0], y - p[1]) < hit);
  if (drag < 0 && corners.length < 4) { corners.push(p); drag = corners.length - 1; }
  hover = drag >= 0 ? corners[drag] : null;
  update();
});
cv.addEventListener("pointermove", (e) => {
  if (drag < 0) return;
  corners[drag] = toImage(e);
  hover = corners[drag];
  update();
});
const release = () => { drag = -1; hover = null; if (img) update(); };
cv.addEventListener("pointerup", release);
cv.addEventListener("pointercancel", release);

function showPigments() {
  const box = $("pigs");
  const old = [...box.querySelectorAll("input")].map((i) => i.value);
  box.replaceChildren(...samples.map((cells, r) => {
    const [paper, full, mid, light] = cells.map((c) => c.rgb);
    const warns = [];
    if (lum(paper) < 0.45) warns.push(t("cal.w.paper"));
    if (!(lum(full) < lum(mid) && lum(mid) < lum(light))) warns.push(t("cal.w.order"));
    if (lum(light) > lum(paper) * 0.98) warns.push(t("cal.w.light"));
    return h("div", { className: "pig" },
      h("div", { className: "chips" }, ...[paper, full, mid, light].map((c) =>
        h("span", { className: "chip", style: `background: rgb(${c})` }))),
      h("input", { type: "text", value: old[r] ?? savedNames[r] ?? "", placeholder: t("cal.namePh", { n: r + 1 }) }),
      ...warns.map((w) => h("div", { className: "warn", textContent: "⚠ " + w })));
  }));
  if (!$("palName").value) $("palName").value = t("cal.palDefault", { date: fmtDate() });
  $("step4").classList.remove("hidden");
}

$("save").onclick = async () => {
  const names = [...$("pigs").querySelectorAll("input")].map((i, r) => i.value.trim() || t("cal.defaultName", { n: r + 1 }));
  localStorage.setItem("strati.names", JSON.stringify(names));
  const pigments = samples.map((cells, r) => {
    const [paper, ...rest] = cells.map((c) => c.rgb);
    const sw = rest.map((c) => relativeToPaper(c, paper));
    return { name: names[r], masstone: sw[0], swatches: sw };
  });
  const btn = $("save");
  btn.disabled = true;
  try {
    const pal = store.validatePalette({ name: $("palName").value.trim() || t("cal.palDefault", { date: fmtDate() }), pigments });
    await store.putPalette({ ...pal, id: store.newId() });
    store.persist();
    $("status").className = "ok";
    $("status").replaceChildren(t("cal.saved"), h("a", { href: "./", textContent: t("cal.next") }));
  } catch (err) {
    $("status").className = "small err";
    $("status").textContent = t("cal.saveFailed", { msg: errorText(err) });
    btn.disabled = false;
  }
};
