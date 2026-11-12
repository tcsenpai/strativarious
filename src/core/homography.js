import { linToSrgb, srgbToLin } from "./km.js";

/** Projective map from the unit square (u,v) to 4 photo points [TL, TR, BR, BL]. */
export function homography(pts) {
  const src = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const A = [], b = [];
  src.forEach(([u, v], i) => {
    const [x, y] = pts[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  });
  // Gauss-Jordan with partial pivoting
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const m = b.map((v, i) => v / A[i][i]);
  return (u, v) => {
    const w = m[6] * u + m[7] * v + 1;
    return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w];
  };
}

/** Swatch color relative to the same row's bare paper: cancels lighting and white balance. */
export const relativeToPaper = (rgb, paper) =>
  rgb.map((v, i) => Math.round(255 * linToSrgb(srgbToLin(v / 255) / Math.max(srgbToLin(paper[i] / 255), 1e-4))));
