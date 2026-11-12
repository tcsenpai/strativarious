// Color science shared by the app, the worker, the tests and the demo generator.
// Single-constant Kubelka-Munk per linear RGB channel:
//   K/S of a pixel = sum_i c_i * ks_i
//   R = 1 + KS - sqrt(KS^2 + 2 KS)          (reflectance relative to the paper)

export const R_MIN = 1e-3;
/** Below this coverage a layer would read as "0%": it is dropped. */
export const MIN_COVERAGE = 0.005;

export const srgbToLin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function linToSrgb(v) {
  v = Math.min(Math.max(v, 0), 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
/** 8-bit sRGB -> linear, precomputed. */
export const LIN8 = Float64Array.from({ length: 256 }, (_, i) => srgbToLin(i / 255));

export function rToKs(r) {
  r = Math.min(Math.max(r, R_MIN), 1);
  return (1 - r) ** 2 / (2 * r);
}
export function ksToR(ks) {
  ks = Math.max(ks, 0);
  return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
}
export const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const rgb255ToKs = (rgb) => rgb.map((v) => rToKs(LIN8[Math.round(v)]));

/**
 * K/S of a pigment at concentration 1 ("full strength").
 * With a swatch series (full, medium, diluted) the model says they are multiples of one K/S vector:
 * take the common direction (rank-1, power iteration on K^T K) scaled to the full swatch.
 */
export function pigmentKs(p) {
  if (!p.swatches?.length) return rgb255ToKs(p.masstone);
  const K = p.swatches.map(rgb255ToKs);
  const KtK = [0, 1, 2].map((i) => [0, 1, 2].map((j) => K.reduce((s, row) => s + row[i] * row[j], 0)));
  let u = [1, 1, 1];
  for (let it = 0; it < 100; it++) {
    const v = KtK.map((row) => row[0] * u[0] + row[1] * u[1] + row[2] * u[2]);
    const n = Math.hypot(...v) || 1;
    u = v.map((x) => Math.abs(x) / n);
  }
  const scale = K[0][0] * u[0] + K[0][1] * u[1] + K[0][2] * u[2];
  return u.map((x) => x * scale);
}

/** Typical concentration (1 = palette full strength) -> i18n key suffix ("strength.*"). */
export function strengthLabel(conc) {
  if (conc < 0.12) return "veryDiluted";
  if (conc < 0.3) return "diluted";
  if (conc < 0.6) return "medium";
  return "heavy";
}
