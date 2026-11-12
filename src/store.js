// IndexedDB persistence: everything stays on the device. Blobs (images) are stored as-is.
import demoPalette from "../palettes/demo.json" with { type: "json" };
import examplePalettes from "../palettes/examples.json" with { type: "json" };

const DB_NAME = "strativarious";
export const DEMO_ID = "demo";
let dbp = null;

function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("palettes", { keyPath: "id" });
      req.result.createObjectStore("paintings", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const tx = (await db()).transaction(store, mode);
  const req = fn(tx.objectStore(store));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Own palettes newest first, then the examples in their curated order, then the demo.
const rank = (p) => (p.demo ? 2 : p.example ? 1 : 0);
const paletteOrder = (a, b) => rank(a) - rank(b) || (a.order ?? 0) - (b.order ?? 0) || byNewest(a, b);
const byNewest = (a, b) => (b.created ?? "").localeCompare(a.created ?? "");
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const getPalette = (id) => run("palettes", "readonly", (s) => s.get(id));
export const putPalette = (p) => run("palettes", "readwrite", (s) => s.put(p));
export async function deletePalette(id) {
  if (id === DEMO_ID) throw new Error("palette_protected"); // the fallback when nothing is calibrated
  return run("palettes", "readwrite", (s) => s.delete(id));
}
const SEEDED_KEY = "strativarious.examplesSeeded";

export async function listPalettes() {
  const all = await run("palettes", "readonly", (s) => s.getAll());
  const add = async (p) => { await putPalette(p); all.push(p); };
  if (!all.some((p) => p.id === DEMO_ID)) await add({ ...demoPalette, id: DEMO_ID, demo: true, created: "" });
  // Examples are added once: if the user deletes one, it stays deleted.
  if (!localStorage.getItem(SEEDED_KEY)) {
    for (const [order, ex] of examplePalettes.entries()) {
      if (!all.some((p) => p.id === ex.id)) await add({ ...ex, example: true, order, created: "" });
    }
    localStorage.setItem(SEEDED_KEY, "1");
  }
  return all.sort(paletteOrder);
}

export const getPainting = (id) => run("paintings", "readonly", (s) => s.get(id));
export const putPainting = (p) => run("paintings", "readwrite", (s) => s.put(p));
export const deletePainting = (id) => run("paintings", "readwrite", (s) => s.delete(id));
export async function listPaintings() {
  return (await run("paintings", "readonly", (s) => s.getAll())).sort(byNewest);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export const persist = () => navigator.storage?.persist?.().catch(() => false);

/** Normalizes a palette coming from a file or the calibration page; throws "palette_invalid". */
export function validatePalette(p) {
  const fail = () => { throw new Error("palette_invalid"); };
  const name = String(p?.name ?? "").trim();
  if (!name || !Array.isArray(p.pigments) || p.pigments.length < 2 || p.pigments.length > 12) fail();
  const rgb = (c) => (Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) ? c : fail());
  const seen = new Map();
  const uniqueId = (raw) => {
    const n = seen.get(raw) ?? 0;
    seen.set(raw, n + 1);
    return n ? `${raw}-${n + 1}` : raw; // same pigment picked from two palettes
  };
  return {
    name: name.slice(0, 60),
    created: new Date().toISOString(),
    ...(p.description ? { description: String(p.description).slice(0, 200) } : {}),
    ...(p.synthetic ? { synthetic: true } : {}),
    pigments: p.pigments.map((x, i) => ({
      id: uniqueId(String(x.id ?? x.name ?? `pigment-${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || `pigment-${i + 1}`),
      name: String(x.name ?? `Pigment ${i + 1}`).trim().slice(0, 40),
      masstone: rgb(x.masstone),
      ...(x.swatches ? { swatches: x.swatches.map(rgb) } : {}),
    })),
  };
}
