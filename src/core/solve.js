// Non-negative sparse unmixing, one pixel at a time:
//   min ||A c - ks_obs||^2 + lam * sum(c)   s.t. c >= 0
// solved with projected FISTA. Pixels are independent, so chunks run in parallel workers.

/** Largest eigenvalue of a small symmetric matrix (power iteration). */
function maxEig(M) {
  const n = M.length;
  let v = new Float64Array(n).fill(1);
  let lam = 0;
  for (let it = 0; it < 200; it++) {
    const w = M.map((row) => row.reduce((s, x, k) => s + x * v[k], 0));
    lam = Math.hypot(...w);
    if (!lam) return 1;
    v = Float64Array.from(w, (x) => x / lam);
  }
  return lam;
}

/**
 * @param {Float32Array} ksObs  P*3 observed K/S
 * @param {number[][]} A        N pigment K/S vectors (length 3 each)
 * @returns {Float32Array}      P*N concentrations
 */
export function solveChunk(ksObs, A, { lam = 0.02, iters = 400, tol = 1e-6 } = {}) {
  const n = A.length;
  const P = ksObs.length / 3;
  const AtA = A.map((ai) => A.map((aj) => ai[0] * aj[0] + ai[1] * aj[1] + ai[2] * aj[2]));
  const step = 1 / maxEig(AtA);
  const G = Float64Array.from(AtA.flat());
  const out = new Float32Array(P * n);
  const atb = new Float64Array(n), c = new Float64Array(n), y = new Float64Array(n), cn = new Float64Array(n);

  for (let p = 0; p < P; p++) {
    const b0 = ksObs[p * 3], b1 = ksObs[p * 3 + 1], b2 = ksObs[p * 3 + 2];
    for (let j = 0; j < n; j++) {
      atb[j] = A[j][0] * b0 + A[j][1] * b1 + A[j][2] * b2;
      c[j] = 0;
      y[j] = 0;
    }
    let t = 1;
    for (let it = 0; it < iters; it++) {
      let delta = 0;
      for (let j = 0; j < n; j++) {
        let g = lam - atb[j];
        for (let k = 0; k < n; k++) g += G[j * n + k] * y[k];
        const v = y[j] - step * g;
        cn[j] = v > 0 ? v : 0;
      }
      const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
      const mom = (t - 1) / tn;
      for (let j = 0; j < n; j++) {
        const d = cn[j] - c[j];
        if (Math.abs(d) > delta) delta = Math.abs(d);
        y[j] = cn[j] + mom * d;
        c[j] = cn[j];
      }
      t = tn;
      if (delta < tol) break; // converged: most pixels stop far before `iters`
    }
    out.set(c, p * n);
  }
  return out;
}
