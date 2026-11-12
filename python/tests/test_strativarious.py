import json
from pathlib import Path

import numpy as np

import strativarious as s

DEMO = json.loads((Path(__file__).resolve().parents[2] / "palettes" / "demo.json").read_text())["pigments"]


def test_reflectance_ks_round_trip():
    r = np.linspace(0.01, 1, 100)
    np.testing.assert_allclose(s.ks_to_r(s.r_to_ks(r)), r, atol=1e-9)


def test_rank1_fit_recovers_pigment_from_dilution_series():
    ks = np.array([0.4, 1.2, 3.5])
    swatches = [np.round(255 * s.linear_to_srgb(s.ks_to_r(ks * c))).astype(int).tolist() for c in (1, 0.4, 0.12)]
    fit = s.pigment_ks({"masstone": swatches[0], "swatches": swatches})
    np.testing.assert_allclose(fit / ks, 1, atol=0.03)


def glazed_image(h=64, w=96):
    """Two overlapping glazes with known concentrations on white paper."""
    A = np.stack([s.pigment_ks(p) for p in DEMO], axis=1)
    c = np.zeros((h, w, len(DEMO)))
    c[:, : w // 2, 3] = 0.25  # ultramarine on the left half
    c[h // 2 :, :, 1] = 0.3  # sienna on the bottom half
    srgb = s.linear_to_srgb(s.ks_to_r(c.reshape(-1, len(DEMO)) @ A.T)).reshape(h, w, 3)
    return np.round(srgb * 255) / 255, c


def test_recovers_known_glazes():
    srgb, truth = glazed_image()
    c, layers, stats = s.decompose_array(srgb, DEMO)
    h, w = srgb.shape[:2]
    c = c.reshape(h, w, -1)
    assert stats["error"]["meanAbs255"] < 3  # vs the un-blurred input: the 3x3 denoise softens the hard edges
    # away from the glaze borders (the 3x3 denoise touches 1 px)
    assert abs(c[5:25, 5:40, 3].mean() - 0.25) < 0.03
    assert abs(c[40:60, 55:90, 1].mean() - 0.3) < 0.03
    assert c[5:25, 55:90].sum(axis=-1).mean() < 0.01  # untouched paper stays blank


def test_unused_pigments_produce_no_layers():
    srgb, _ = glazed_image()
    _, layers, _ = s.decompose_array(srgb, DEMO)
    assert {l["id"] for l in layers} <= {"ultramarine", "sienna", "paynes", "umber", "rose", "ochre"}
    assert "ultramarine" in {l["id"] for l in layers} and "sienna" in {l["id"] for l in layers}
    assert all(l["coverage"] >= s.MIN_COVERAGE for l in layers)
