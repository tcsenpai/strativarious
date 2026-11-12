import { describe, expect, test } from "bun:test";
import { paintDemo } from "../scripts/demo-painting.js";
import { homography, relativeToPaper } from "../src/core/homography.js";
import { ksToR, linToSrgb, pigmentKs, rToKs, srgbToLin } from "../src/core/km.js";
import { layerImage, prepare, summarize } from "../src/core/pipeline.js";
import { solveChunk } from "../src/core/solve.js";

const toRgb255 = (ks) => ks.map((k) => Math.round(255 * linToSrgb(ksToR(k))));

describe("Kubelka-Munk", () => {
  test("reflectance <-> K/S round-trips", () => {
    for (let r = 0.01; r <= 1; r += 0.01) expect(ksToR(rToKs(r))).toBeCloseTo(r, 9);
  });

  test("rank-1 fit recovers the pigment from a dilution series", () => {
    const ks = [0.4, 1.2, 3.5];
    const swatches = [1, 0.4, 0.12].map((c) => toRgb255(ks.map((k) => k * c)));
    const fit = pigmentKs({ masstone: swatches[0], swatches });
    fit.forEach((v, i) => expect(Math.abs(v / ks[i] - 1)).toBeLessThan(0.03));
  });
});

describe("solver", () => {
  test("recovers a sparse non-negative mixture", () => {
    const A = [[0.05, 0.2, 1.4], [1.6, 0.9, 0.2], [0.3, 1.8, 0.6], [2.5, 2.4, 2.2]];
    const truth = [0.3, 0, 0.12, 0];
    const ks = [0, 1, 2].map((ch) => truth.reduce((s, c, j) => s + c * A[j][ch], 0));
    const c = solveChunk(Float32Array.from(ks), A, { lam: 1e-4, iters: 5000, tol: 1e-9 });
    truth.forEach((v, j) => expect(c[j]).toBeCloseTo(v, 2));
  });

  test("never returns negative concentrations", () => {
    const A = [[1, 0.5, 0.2], [0.2, 0.5, 1]];
    const c = solveChunk(Float32Array.from([0, 0, 0, 3, 0.1, 3]), A);
    for (const v of c) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("calibration geometry", () => {
  const corners = [[200, 240], [780, 300], [820, 1050], [150, 1000]];
  const H = homography(corners);

  test("maps the unit square onto the tapped corners", () => {
    [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
      const [x, y] = H(u, v);
      expect(x).toBeCloseTo(corners[i][0], 6);
      expect(y).toBeCloseTo(corners[i][1], 6);
    });
  });

  test("the square's center lands on the diagonals' intersection (projective, not affine)", () => {
    const [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] = corners;
    const d = (x1 - x3) * (y2 - y4) - (y1 - y3) * (x2 - x4);
    const a = x1 * y3 - y1 * x3, b = x2 * y4 - y2 * x4;
    const ix = (a * (x2 - x4) - (x1 - x3) * b) / d, iy = (a * (y2 - y4) - (y1 - y3) * b) / d;
    const [cx, cy] = H(0.5, 0.5);
    expect(cx).toBeCloseTo(ix, 6);
    expect(cy).toBeCloseTo(iy, 6);
  });

  test("relative-to-paper color cancels a warm light cast", () => {
    const pigment = [160, 75, 40];
    const light = [1, 0.93, 0.78];
    const lit = (rgb) => rgb.map((v, i) => Math.round(255 * linToSrgb(srgbToLin(v / 255) * light[i])));
    const rel = relativeToPaper(lit(pigment), lit([255, 255, 255]));
    rel.forEach((v, i) => expect(Math.abs(v - pigment[i])).toBeLessThanOrEqual(2));
  });
});

describe("pipeline on the demo painting", () => {
  const W = 300, H = 214;
  const { rgba, truth, palette } = paintDemo(W, H);
  // A pigment that can't explain anything (paper-colored): it must not become a layer.
  // (A *plausible* unused pigment can't be ruled out from 3 RGB channels: the app lets the painter
  // pick the pigments she actually used instead.)
  const pigments = [...palette.pigments, { id: "chinese-white", name: "Chinese white", masstone: [252, 252, 250] }];
  const prep = prepare(rgba, W, H, pigments);
  const c = solveChunk(prep.ksObs, prep.A);
  const { error, layers } = summarize({ rgba, c, A: prep.A, paper: prep.paper, pigments });
  const n = pigments.length;
  const at = (x, y, id) => c[(Math.round(y * H) * W + Math.round(x * W)) * n + pigments.findIndex((p) => p.id === id)];

  test("reconstructs the image closely", () => {
    // Measured against the un-blurred input: the 3x3 denoise costs a little on 1-2 px grass strokes.
    expect(error.meanAbs255).toBeLessThan(3);
    expect(error.p95Abs255).toBeLessThan(16);
  });

  test("an unused pigment produces no layer", () => {
    expect(layers.map((l) => l.id)).not.toContain("chinese-white");
  });

  test("with the right pigments, concentrations match the ground truth", () => {
    let mae = 0;
    palette.pigments.forEach((p, j) => { for (let i = 0; i < W * H; i++) mae += Math.abs(c[i * n + j] - truth[p.id][i]); });
    expect(mae / (W * H * palette.pigments.length)).toBeLessThan(0.04);
  });

  test("the sky is ultramarine and the reserved sun stays blank", () => {
    expect(at(0.3, 0.1, "ultramarine")).toBeGreaterThan(0.5 * truth.ultramarine[Math.round(0.1 * H) * W + Math.round(0.3 * W)]);
    for (const p of pigments) expect(at(0.72, 0.27, p.id)).toBeLessThan(0.01);
  });

  test("the near hills are mostly sienna", () => {
    const sienna = at(0.6, 0.78, "sienna");
    for (const p of pigments) if (p.id !== "sienna") expect(at(0.6, 0.78, p.id)).toBeLessThan(sienna);
  });

  test("layer images are sqrt-encoded within 0..255", () => {
    const l = layers[0];
    const img = layerImage(c, n, l.index, l.cmax);
    expect(img.length).toBe(W * H * 4);
    expect(Math.max(...img.filter((_, i) => i % 4 === 0))).toBe(255);
  });
});

describe("paper check", () => {
  test("bare white or cream paper under warm light is fine", async () => {
    const { paperSuspect } = await import("../src/core/pipeline.js");
    expect(paperSuspect([0.97, 0.95, 0.88])).toBe(false);
    expect(paperSuspect([0.994, 0.983, 0.764])).toBe(false); // the real portrait photo
  });
  test("a photo with no paper (brightest pixels are a blue sky) is flagged", async () => {
    const { paperSuspect } = await import("../src/core/pipeline.js");
    expect(paperSuspect([0.25, 0.3, 0.6])).toBe(true);
    expect(paperSuspect([0.3, 0.3, 0.3])).toBe(true);
  });
});
