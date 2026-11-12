// Image -> concentrations -> ordered layers. Pure functions on RGBA buffers:
// shared by the browser app (with workers), the tests and the demo generator.
import { LIN8, MIN_COVERAGE, ksToR, linToSrgb, luminance, pigmentKs, rToKs, srgbToLin, strengthLabel } from "./km.js";

const percentileSorted = (sorted, pct) => sorted[Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length))];

/**
 * 3x3 box blur (separable). With more pigments than RGB channels many mixtures fit a pixel equally
 * well, so photo noise and JPEG blocks make neighbors jump between solutions; a light blur removes
 * that (on the demo: 3.5x smoother layers and slightly *better* accuracy).
 */
export function denoise(rgba, width, height) {
  const tmp = new Float32Array(rgba.length);
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = Math.max(x - 1, 0), r = Math.min(x + 1, width - 1);
      for (let ch = 0; ch < 4; ch++) {
        tmp[(y * width + x) * 4 + ch] = (rgba[(y * width + l) * 4 + ch] + rgba[(y * width + x) * 4 + ch] + rgba[(y * width + r) * 4 + ch]) / 3;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    const u = Math.max(y - 1, 0), d = Math.min(y + 1, height - 1);
    for (let x = 0; x < width; x++) {
      for (let ch = 0; ch < 4; ch++) {
        out[(y * width + x) * 4 + ch] = (tmp[(u * width + x) * 4 + ch] + tmp[(y * width + x) * 4 + ch] + tmp[(d * width + x) * 4 + ch]) / 3 + 0.5;
      }
    }
  }
  return out;
}

/**
 * Paper color, observed K/S and pigment K/S.
 * Paper = mean of the brightest pixels (reserved whites or the unpainted border).
 */
export function prepare(rgba, width, height, pigments, { paperPct = 99.7, smooth = true } = {}) {
  if (smooth) rgba = denoise(rgba, width, height);
  const P = width * height;
  const lin = new Float32Array(P * 3);
  const BINS = 4096;
  const hist = new Uint32Array(BINS);
  const lum = new Float32Array(P);
  for (let p = 0; p < P; p++) {
    const r = LIN8[rgba[p * 4]], g = LIN8[rgba[p * 4 + 1]], b = LIN8[rgba[p * 4 + 2]];
    lin[p * 3] = r; lin[p * 3 + 1] = g; lin[p * 3 + 2] = b;
    lum[p] = luminance(r, g, b);
    hist[Math.min(BINS - 1, (lum[p] * BINS) | 0)]++;
  }
  let bin = BINS - 1;
  for (let acc = 0, target = P * (1 - paperPct / 100); bin > 0 && acc + hist[bin] < target; bin--) acc += hist[bin];
  const thr = bin / BINS;
  const paper = [0, 0, 0];
  let count = 0;
  for (let p = 0; p < P; p++) {
    if (lum[p] < thr) continue;
    paper[0] += lin[p * 3]; paper[1] += lin[p * 3 + 1]; paper[2] += lin[p * 3 + 2];
    count++;
  }
  for (let ch = 0; ch < 3; ch++) paper[ch] = paper[ch] / count || 1;

  const ksObs = new Float32Array(P * 3);
  let whites = 0;
  for (let p = 0; p < P; p++) {
    let min = 1;
    for (let ch = 0; ch < 3; ch++) {
      const r = Math.min(lin[p * 3 + ch] / paper[ch], 1);
      if (r < min) min = r;
      ksObs[p * 3 + ch] = rToKs(r);
    }
    if (min > 0.92) whites++;
  }
  return { paper, paperSuspect: paperSuspect(paper), ksObs, whitesFraction: whites / P, A: pigments.map(pigmentKs) };
}

/**
 * The paper estimate is the brightest pixels. If they are dark or strongly tinted, the photo most
 * likely has no bare paper in it, and every color gets shifted: worth telling the user.
 * (Cream paper under warm light is about 0.98/0.96/0.76 linear: still fine.)
 */
export function paperSuspect([r, g, b]) {
  const lum = luminance(r, g, b);
  return lum < 0.45 || Math.max(r, g, b) / Math.max(Math.min(r, g, b), 1e-3) > 1.6;
}

/** Splits K/S into `parts` contiguous chunks (for workers). */
export function chunks(ksObs, parts) {
  const P = ksObs.length / 3;
  const size = Math.ceil(P / parts);
  const out = [];
  for (let s = 0; s < P; s += size) out.push(ksObs.slice(s * 3, Math.min(P, s + size) * 3));
  return out;
}

/** Reconstruction error, per-layer statistics, drop "0%" layers, heuristic painting order. */
export function summarize({ rgba, c, A, paper, pigments }) {
  const n = A.length;
  const P = c.length / n;
  const err = new Float32Array(P * 3);
  let errSum = 0;
  for (let p = 0; p < P; p++) {
    for (let ch = 0; ch < 3; ch++) {
      let ks = 0;
      for (let j = 0; j < n; j++) ks += c[p * n + j] * A[j][ch];
      const e = Math.abs(linToSrgb(ksToR(ks) * paper[ch]) * 255 - rgba[p * 4 + ch]);
      err[p * 3 + ch] = e;
      errSum += e;
    }
  }
  err.sort();

  let layers = pigments.map((pig, j) => {
    const cj = new Float32Array(P);
    for (let p = 0; p < P; p++) cj[p] = c[p * n + j];
    const sorted = cj.slice().sort();
    const cmax = percentileSorted(sorted, 99.9) || 1e-6;
    const thr = 0.05 * cmax;
    const firstCovered = sorted.findIndex((v) => v > thr);
    const covered = firstCovered < 0 ? 0 : P - firstCovered;
    const typical = covered ? sorted[firstCovered + (covered >> 1)] : 0;
    const [r, g, b] = pig.masstone.map((v) => srgbToLin(v / 255));
    return {
      index: j, id: pig.id, name: pig.name, masstone: pig.masstone, ks: A[j], cmax,
      coverage: covered / P, typicalConc: typical, strength: strengthLabel(typical),
      masstoneLum: luminance(r, g, b),
    };
  });
  const used = layers.filter((l) => l.coverage >= MIN_COVERAGE);
  if (used.length) layers = used;
  // Craft rule as a prior: broad and light washes first, dark details last.
  const lumMax = Math.max(...layers.map((l) => l.masstoneLum));
  for (const l of layers) l.orderScore = 0.6 * l.coverage + 0.4 * (l.masstoneLum / lumMax);
  layers.sort((a, b) => b.orderScore - a.orderScore);

  return {
    error: { meanAbs255: errSum / (P * 3), p95Abs255: percentileSorted(err, 95) },
    layers,
  };
}

/** Grayscale RGBA of one layer, sqrt-encoded (more 8-bit levels for diluted glazes). */
export function layerImage(c, n, index, cmax) {
  const P = c.length / n;
  const out = new Uint8ClampedArray(P * 4);
  for (let p = 0; p < P; p++) {
    const v = Math.sqrt(Math.min(Math.max(c[p * n + index] / cmax, 0), 1)) * 255 + 0.5;
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return out;
}
