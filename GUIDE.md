# Strativarious: a guide for painters

Strativarious takes a photo of a watercolor and breaks it down into its glazes of color, shown in 3D:
you can pull them apart, replay them in order and look at one pigment at a time.

Everything runs in your phone's browser: **nothing is uploaded anywhere**.

*Italiano: [GUIDA.md](GUIDA.md)*

## 1. Open and install

1. Open **https://tcsenpai.github.io/strativarious/**.
2. The language can be changed at the top right; the choice is remembered.
3. Install it: on Android tap **Install app**; on iPhone tap **Share → Add to Home Screen**.
   Once installed it also works without internet.
4. Want to see how it works first? Tap **✨ Try it with the demo painting**.

## 2. Calibration (once, about 15 minutes plus drying time)

This teaches the tool **your** colors. Until then you can use the **example palettes** (triad, split primary,
landscape, portrait, student set): typical colors of common pigments, good for trying things out.
If they don't match your paints exactly, **+ Combine colors** lets you build one with just the pigments you own.

**Prepare the sheet**
- Take a piece of the **same paper** you paint on.
- With a pencil, draw a grid with **4 columns** and **one row for each pigment** you actually use
  (6 to 10 is great, 12 at most). Squares of about 2–3 cm.

**Paint**

| column 1 | column 2 | column 3 | column 4 |
|---|---|---|---|
| **empty** (bare paper) | **full strength**: little water, intense color | **medium** | **very diluted**: barely tinted |

- One **pure** pigment per row, never mixed. Pencil the pigment's name next to its row.
- **Let it dry completely**: wet paint looks darker.

**Take the photo**
- Near a window, **indirect** daylight: no direct sun, no flash, no yellow lamps.
- Phone **parallel** to the sheet, the whole grid in frame, no shadows.
- Always use **the same spot and the same light**, for your painting photos too.

**In the app**
1. Tap **Calibrate** (or **+ New calibration**), enter how many rows you painted and pick the photo.
2. Tap the **4 outer corners** of the grid in the order shown. A magnifier appears under your finger;
   the points can be dragged.
3. The small **white squares** must sit inside the cells. If a ⚠ appears, move a corner.
4. Type the pigment names and tap **Save palette**.

## 3. Breaking down a painting

1. Photograph the painting when it is **dry**, in the same light as the calibration, and leave
   **a bit of unpainted paper** in the frame (the border): that's how the tool learns the paper color.
2. Tap **📷 Take or choose a photo of the painting**, give it a title, choose the palette.
3. **Uncheck the pigments you didn't use.** This is the single most useful tip: with fewer pigments
   the layers are far more reliable.
4. Tap **Break into layers**. The 3D view opens after a few seconds.

## 4. In the 3D view

| to | do this |
|---|---|
| Replay the glazes in order | **▶ Play** |
| Step back and forth | the **Glazes applied** slider |
| Separate or join the layers | **Front** / **3D**, or the **Separate the layers** slider |
| Compare with the real photo | the **Compare with the original** slider |
| See one pigment alone | tap its name (tap again to go back) |
| Hide a pigment | 👁 |
| Rotate / zoom | drag with one finger / pinch |
| Keep a picture | **Save image** |
| Send it to someone | **Download as HTML**: a single file that opens anywhere, even offline |

## 5. Paintings and palettes

- Under each painting: **↻** breaks it down again with another palette (a new painting, to compare),
  **🗑** deletes it.
- Next to a palette: **⤓** exports it to a file, **🗑** deletes it (paintings made with it stay).
- **Import palette**: use a palette exported from another device.
- **+ Combine colors**: build a palette from pigments of your calibrated ones, without painting a new grid.
  It is marked *synthetic*: its colors come from different calibrations, so results are less reliable.
- Everything stays in this browser. Clearing the site's data deletes it: export the palettes you care about.

## What to expect, honestly

- The tool proposes **one** sequence of glazes that recreates the painting with your pigments, not
  necessarily the one you followed: the same green can come from yellow over blue or blue over yellow.
- The order follows the classic rule: light, broad washes first, dark details last.
- It works best with **clean glazes**. Wet-in-wet, blooms and granulation are not real layers:
  they get interpreted as glazes anyway.
- In very diluted areas layers can look grainy: several mixtures explain the same color.

## Troubleshooting

| problem | fix |
|---|---|
| All colors shifted (too yellow or too blue), or a ⚠ about bare paper in the viewer | the photo has no unpainted paper, or the light differs from the calibration |
| ⚠ during calibration | move the corners; if it stays, the "paper" cell isn't empty or full strength is lighter than medium |
| One pigment shows up everywhere | uncheck the pigments you didn't use |
| After an update you still see the old version | close and reopen the app |
