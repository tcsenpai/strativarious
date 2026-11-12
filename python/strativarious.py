"""Strativarious reference implementation and command-line tool.

Breaks a watercolor photo down into per-pigment concentration layers (Kubelka-Munk)
and writes a self-contained 3D viewer HTML. The browser app (src/) implements the
same algorithm; this module is the readable/numpy reference and a batch CLI.

Model (single-constant KM, per linear RGB channel):
    K/S of a pixel = sum_i c_i * ks_i
    R = 1 + KS - sqrt(KS^2 + 2 KS)      (reflectance relative to the paper)
Inverse: observed K/S = (1-R)^2 / (2R), then for every pixel
    min ||A c - ks_obs||^2 + lam * sum(c)   s.t. c >= 0
solved for all pixels at once with projected FISTA.
The painting order is a heuristic (light and broad washes first, dark details last).
"""

from __future__ import annotations

import os

# 6x6 matrices over ~800k pixels: BLAS threads cost more than they give.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import argparse  # noqa: E402
import base64  # noqa: E402
import json  # noqa: E402
from html import escape  # noqa: E402
from pathlib import Path  # noqa: E402

import numpy as np  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

R_MIN = 1e-3
MIN_COVERAGE = 0.005  # below this a layer would read as "0%": dropped
REPO = Path(__file__).resolve().parent.parent


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055)


def r_to_ks(r: np.ndarray) -> np.ndarray:
    r = np.clip(r, R_MIN, 1.0)
    return (1.0 - r) ** 2 / (2.0 * r)


def ks_to_r(ks: np.ndarray) -> np.ndarray:
    ks = np.maximum(ks, 0.0)
    return 1.0 + ks - np.sqrt(ks * ks + 2.0 * ks)


def luminance(rgb_lin: np.ndarray) -> np.ndarray:
    return rgb_lin @ np.array([0.2126, 0.7152, 0.0722])


def srgb255_to_ks(rgb) -> np.ndarray:
    return r_to_ks(srgb_to_linear(np.asarray(rgb, dtype=np.float64) / 255.0))


def pigment_ks(p: dict) -> np.ndarray:
    """K/S at concentration 1 ("full strength").

    With a swatch series (full, medium, diluted) the model says they are multiples of
    one K/S vector: take their common direction (rank 1) scaled to the full swatch.
    """
    swatches = p.get("swatches")
    if not swatches:
        return srgb255_to_ks(p["masstone"])
    K = np.stack([srgb255_to_ks(s) for s in swatches])
    u = np.abs(np.linalg.svd(K, full_matrices=False)[2][0])
    return u * float(K[0] @ u)


def denoise(srgb: np.ndarray) -> np.ndarray:
    """3x3 box blur: keeps neighbors from jumping between equally good mixtures."""
    p = np.pad(srgb, ((1, 1), (1, 1), (0, 0)), mode="edge")
    h, w = srgb.shape[:2]
    return sum(p[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)) / 9.0


def estimate_paper(lin: np.ndarray, pct: float) -> np.ndarray:
    """Paper color = mean of the brightest pixels (reserved whites or unpainted border)."""
    lum = luminance(lin)
    return lin[lum >= np.percentile(lum, pct)].mean(axis=0)


def solve(A: np.ndarray, b: np.ndarray, lam: float, iters: int) -> np.ndarray:
    """Projected FISTA on c >= 0 for all pixels at once. b: (P,3) -> c: (P,N)."""
    AtA = (A.T @ A).astype(np.float32)
    Atb = (b @ A).astype(np.float32)
    step = np.float32(1.0 / np.linalg.eigvalsh(A.T @ A).max())
    lam = np.float32(lam)
    c = np.zeros((b.shape[0], A.shape[1]), dtype=np.float32)
    y = c.copy()
    t = 1.0
    for _ in range(iters):
        c_next = np.maximum(y - step * (y @ AtA - Atb + lam), 0.0)
        t_next = (1 + np.sqrt(1 + 4 * t * t)) / 2
        y = c_next + np.float32((t - 1) / t_next) * (c_next - c)
        c, t = c_next, t_next
    return c.astype(np.float64)


def strength_label(conc: float) -> str:
    """Typical concentration (1 = full strength) -> i18n key suffix ("strength.*")."""
    if conc < 0.12:
        return "veryDiluted"
    if conc < 0.3:
        return "diluted"
    if conc < 0.6:
        return "medium"
    return "heavy"


def decompose_array(srgb: np.ndarray, pigments: list[dict], lam: float = 0.02, iters: int = 400,
                    paper_pct: float = 99.7) -> tuple[np.ndarray, list[dict], dict]:
    """srgb: (H,W,3) in [0,1]. Returns concentrations (P,N), ordered layers, stats."""
    h, w = srgb.shape[:2]
    lin = srgb_to_linear(denoise(srgb)).reshape(-1, 3)
    paper = estimate_paper(lin, paper_pct)
    refl = np.clip(lin / paper, R_MIN, 1.0)
    A = np.stack([pigment_ks(p) for p in pigments], axis=1)
    c = solve(A, r_to_ks(refl), lam, iters)

    recon = linear_to_srgb(ks_to_r(c @ A.T) * paper)
    err = np.abs(recon - srgb.reshape(-1, 3)) * 255.0

    layers = []
    for i, p in enumerate(pigments):
        ci = c[:, i]
        cmax = float(np.percentile(ci, 99.9)) or 1e-6
        covered = ci > 0.05 * cmax
        typical = float(np.median(ci[covered])) if covered.any() else 0.0
        layers.append({
            "index": i, "id": p["id"], "name": p["name"], "masstone": p["masstone"],
            "ks": A[:, i].tolist(), "cmax": cmax, "coverage": float(covered.mean()),
            "typicalConc": typical, "strength": strength_label(typical),
            "masstoneLum": float(luminance(srgb_to_linear(np.array(p["masstone"]) / 255.0))),
        })
    layers = [l for l in layers if l["coverage"] >= MIN_COVERAGE] or layers
    lum_max = max(l["masstoneLum"] for l in layers)
    for l in layers:
        l["orderScore"] = 0.6 * l["coverage"] + 0.4 * l["masstoneLum"] / lum_max
    layers.sort(key=lambda l: l["orderScore"], reverse=True)

    stats = {
        "width": w, "height": h, "paper": paper.tolist(),
        "error": {"meanAbs255": float(err.mean()), "p95Abs255": float(np.percentile(err, 95))},
        "whitesFraction": float((refl.min(axis=1) > 0.92).mean()),
    }
    return c, layers, stats


def png_data_url(arr: np.ndarray) -> str:
    from io import BytesIO
    buf = BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def standalone_html(title: str, data: dict) -> str:
    """Fills the viewer template built by `bun run build` (dist/standalone.html)."""
    template = REPO / "dist" / "standalone.html"
    if not template.exists():
        raise SystemExit(f"missing {template}: run `bun install && bun run build` in the repository root")
    html = template.read_text()
    html = html.replace("__TITLE__", escape(title), 1)
    return html.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("<", "\\u003c"), 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", type=Path)
    ap.add_argument("--palette", type=Path, default=REPO / "palettes" / "demo.json",
                    help="palette JSON (exported from the app, or palettes/demo.json)")
    ap.add_argument("-o", "--output", type=Path, help="output HTML (default: <image>.html)")
    ap.add_argument("--title")
    ap.add_argument("--max-side", type=int, default=1024)
    ap.add_argument("--lam", type=float, default=0.02, help="sparsity penalty")
    ap.add_argument("--iters", type=int, default=400)
    args = ap.parse_args()

    palette = json.loads(args.palette.read_text())
    pigments = [{"id": p.get("id") or p["name"].lower().replace(" ", "-"), **p} for p in palette["pigments"]]
    img = ImageOps.exif_transpose(Image.open(args.image)).convert("RGB")
    img.thumbnail((args.max_side, args.max_side), Image.LANCZOS)
    srgb = np.asarray(img, dtype=np.float64) / 255.0

    c, layers, stats = decompose_array(srgb, pigments, args.lam, args.iters)
    h, w = srgb.shape[:2]
    title = args.title or args.image.stem
    for l in layers:
        gray = np.sqrt(np.clip(c[:, l.pop("index")] / l["cmax"], 0, 1)).reshape(h, w)
        l["src"] = png_data_url((gray * 255 + 0.5).astype(np.uint8))
    data = {"title": title, "palette": palette["name"], **stats,
            "original": png_data_url(np.asarray(img)), "layers": layers}

    out = args.output or args.image.with_suffix(".html")
    out.write_text(standalone_html(title, data))
    print(f"{w}x{h}  mean error {stats['error']['meanAbs255']:.1f}/255")
    for i, l in enumerate(layers, 1):
        print(f"  {i}. {l['name']:<22} coverage {l['coverage']:.0%}  {l['strength']}")
    print(f"-> {out}")


if __name__ == "__main__":
    main()
