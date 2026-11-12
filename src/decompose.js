// Browser orchestration: image blob -> worker pool -> painting record ready for IndexedDB.
import { chunks, layerImage, prepare, summarize } from "./core/pipeline.js";
import { newId } from "./store.js";

const MAX_SIDE = 1024; // decomposition resolution
const SOURCE_SIDE = 2000; // kept for "break down again"

async function toCanvas(blob, maxSide) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas;
}
const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

/**
 * Downscaled copy of any image the browser can decode (Safari turns HEIC into JPEG here).
 * PNG stays lossless: re-encoding to JPEG adds 8x8 blocks that the solver turns into patchy layers.
 */
export async function normalizeSource(blob) {
  const canvas = await toCanvas(blob, SOURCE_SIDE);
  return blob.type === "image/png" ? toBlob(canvas, "image/png") : toBlob(canvas, "image/jpeg", 0.95);
}

async function solveParallel(ksObs, A, onProgress) {
  const nWorkers = Math.min(navigator.hardwareConcurrency || 4, 8);
  const parts = chunks(ksObs, nWorkers * 6); // more parts than workers: smoother progress
  const results = new Array(parts.length);
  const workers = Array.from({ length: nWorkers }, () => new Worker(new URL("./worker.js", location.href), { type: "module" }));
  let next = 0, done = 0;
  try {
    await Promise.all(workers.map((w) => new Promise((resolve, reject) => {
      const feed = () => {
        if (next >= parts.length) return resolve();
        const id = next++;
        w.postMessage({ id, ksObs: parts[id], A }, [parts[id].buffer]);
      };
      w.onmessage = ({ data }) => {
        results[data.id] = data.c;
        onProgress?.(++done / parts.length);
        feed();
      };
      w.onerror = (e) => reject(e.error ?? new Error(e.message));
      feed();
    })));
  } finally {
    workers.forEach((w) => w.terminate());
  }
  const out = new Float32Array(results.reduce((s, r) => s + r.length, 0));
  let off = 0;
  for (const r of results) { out.set(r, off); off += r.length; }
  return out;
}

/**
 * @param {Blob} source            normalized JPEG (see normalizeSource)
 * @param {object} palette          stored palette
 * @param {string[]} pigmentIds     pigments the painter actually used
 */
export async function decompose(source, palette, pigmentIds, { title, onProgress } = {}) {
  const canvas = await toCanvas(source, MAX_SIDE);
  const { width, height } = canvas;
  const rgba = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const pigments = palette.pigments.filter((p) => pigmentIds.includes(p.id));

  const prep = prepare(rgba, width, height, pigments);
  const c = await solveParallel(prep.ksObs, prep.A, onProgress);
  const { error, layers } = summarize({ rgba, c, A: prep.A, paper: prep.paper, pigments });

  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = width;
  layerCanvas.height = height;
  const lctx = layerCanvas.getContext("2d");
  for (const l of layers) {
    lctx.putImageData(new ImageData(layerImage(c, pigments.length, l.index, l.cmax), width, height), 0, 0);
    l.png = await toBlob(layerCanvas, "image/png");
    delete l.index;
  }
  return {
    id: newId(), title, created: new Date().toISOString(),
    paletteId: palette.id, palette: palette.name, pigmentIds,
    width, height, paper: prep.paper, error, whitesFraction: prep.whitesFraction, layers,
    preview: await toBlob(canvas, "image/jpeg", 0.9), // same size as the layers: the viewer's "original"
    source,
  };
}
