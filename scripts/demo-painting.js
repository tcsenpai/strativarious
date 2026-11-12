// Procedural "watercolor" landscape painted with Kubelka-Munk glazes from the demo palette.
// Copyright-free demo image for the app, and ground truth for the tests.
import palette from "../palettes/demo.json" with { type: "json" };
import { ksToR, linToSrgb, pigmentKs } from "../src/core/km.js";

const PAPER = [0.97, 0.95, 0.88]; // linear, warm white

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** Fractal noise in [-1, 1]. */
function fbm(x, y, octaves = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) { s += amp * (valueNoise(x * f, y * f) * 2 - 1); amp *= 0.5; f *= 2; }
  return s;
}
const smooth = (e0, e1, x) => { const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1); return t * t * (3 - 2 * t); };
/** Soft region mask with a darker rim, like pigment drying at the edge of a wash. */
function wash(signedDist, width = 0.006) {
  const m = smooth(-width, width, signedDist);
  return m * (1 + 1.6 * m * (1 - m));
}

/**
 * @returns {{ rgba: Uint8ClampedArray, truth: Record<string, Float32Array>, palette: object }}
 */
export function paintDemo(width = 900, height = 640) {
  const ids = palette.pigments.map((p) => p.id);
  const A = palette.pigments.map(pigmentKs);
  const truth = Object.fromEntries(ids.map((id) => [id, new Float32Array(width * height)]));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const aspect = width / height;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px / width, y = py / height, p = py * width + px;
      const n = fbm(x * 6, y * 6), grain = fbm(x * 90, y * 90, 2);
      const sun = Math.hypot((x - 0.72) * aspect, y - 0.27) - 0.075;
      const horizon = 0.56 + 0.012 * fbm(x * 8, 3);
      const ridgeFar = 0.5 + 0.05 * Math.sin(x * 7 + 1) + 0.025 * fbm(x * 10, 7);
      const ridgeNear = 0.64 + 0.07 * Math.sin(x * 4.2 + 2.5) + 0.03 * fbm(x * 12, 11);
      const grassLine = 0.86 + 0.04 * fbm(x * 9, 5);
      const tree = Math.hypot((x - 0.2) * aspect, (y - 0.6) * 1.2) - 0.09 - 0.03 * fbm(x * 20, y * 20);
      const trunk = Math.max(Math.abs(x - 0.2) * aspect - 0.008, Math.abs(y - 0.74) - 0.08);

      const c = {
        // 1. warm underwash everywhere except the reserved sun
        ochre: (0.05 + 0.1 * Math.exp(-(((y - horizon) / 0.07) ** 2))) * (1 + 0.3 * n) * wash(sun, 0.01),
        // 2. graded sky, darker at the top, soft halo around the sun
        ultramarine: (0.03 + 0.26 * Math.max(0, 1 - y / horizon) ** 1.4) * (1 + 0.25 * n) * wash(sun - 0.04, 0.03) * wash(horizon + 0.03 - y, 0.01),
        // 3. sunset blush
        rose: 0.11 * Math.exp(-(((y - 0.47) / 0.06) ** 2)) * (0.7 + 0.3 * Math.sin(x * 5)) * wash(sun, 0.01),
        // 4. distant ridge
        paynes: 0.16 * (1 + 0.2 * n) * wash(y - ridgeFar),
        // 5. near hills, granulating
        sienna: 0.3 * (1 + 0.25 * n + 0.35 * grain) * wash(y - ridgeNear),
        // 6. details: grass strokes, tree, trunk
        umber: 0.55 * (1 + 0.3 * grain) * Math.max(
          wash(y - grassLine + 0.07 * hash(Math.floor(x * 140), 1)) * smooth(0.55, 0.95, Math.sin(x * 880 + 9 * fbm(x * 40, y * 3))),
          wash(-tree), wash(-trunk, 0.003)),
      };
      for (const id of ids) truth[id][p] = c[id];

      const tex = 1 + 0.012 * grain; // paper texture
      for (let ch = 0; ch < 3; ch++) {
        let ks = 0;
        ids.forEach((id, j) => { ks += c[id] * A[j][ch]; });
        // + camera-like noise (±2 levels): it's meant to look like a photo, and real photos have it
        rgba[p * 4 + ch] = Math.round(255 * linToSrgb(ksToR(ks) * PAPER[ch] * tex) + 4 * (hash(px * 3 + ch, py * 7) - 0.5));
      }
      rgba[p * 4 + 3] = 255;
    }
  }
  return { rgba, truth, palette };
}
