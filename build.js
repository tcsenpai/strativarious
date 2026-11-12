// Builds the static site into dist/ (deployable as-is, e.g. GitHub Pages). Run: bun run build
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = import.meta.dir;
const src = join(root, "src");
const dist = join(root, "dist");
// License notices travel with the bundles (and with every exported HTML file).
const BANNER = "/*! Strativarious · MIT License · https://github.com/tcsenpai/strativarious\n" +
  " *  Includes three.js · MIT License · Copyright © 2010-2025 three.js authors */";

async function build(options) {
  const res = await Bun.build({ minify: true, target: "browser", banner: BANNER, ...options });
  if (!res.success) {
    for (const log of res.logs) console.error(log);
    process.exit(1);
  }
  return res;
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    out.push(...(e.isDirectory() ? await walk(p) : [p]));
  }
  return out;
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// 1. App pages + solver worker (ES modules, shared chunks).
await build({
  entrypoints: ["pages/home.js", "pages/calibrate.js", "pages/viewer.js", "worker.js"].map((f) => join(src, f)),
  outdir: dist, format: "esm", splitting: true,
  naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
});

// 2. Static assets (the viewer template becomes two pages below).
await cp(join(src, "static"), dist, { recursive: true, filter: (f) => !f.endsWith("viewer.template.html") });

// 3. Viewer pages from one template: the app page, and the standalone export template
//    (keeps __TITLE__/__DATA__ for the app's "Download as HTML" and the Python CLI).
const template = await readFile(join(src, "static/viewer.template.html"), "utf8");
const fill = (s, map) => Object.entries(map).reduce((acc, [k, v]) => acc.replace(k, () => v), s);
await writeFile(join(dist, "viewer.html"), fill(template, {
  __HEAD__: '<link rel="manifest" href="./manifest.webmanifest">\n<link rel="icon" href="./icons/icon-192.png" type="image/png">',
  __TITLE__: "Strativarious",
  __SCRIPTS__: '<script type="module" src="./viewer.js"></script>',
}));
const standalone = await build({ entrypoints: [join(src, "viewer/standalone.js")], format: "iife" });
const standaloneJs = (await standalone.outputs[0].text()).replace(/<\/script/gi, "<\\/script");
await writeFile(join(dist, "standalone.html"), fill(template, {
  __HEAD__: "",
  __SCRIPTS__: `<script id="data" type="application/json">__DATA__</script>\n<script>${standaloneJs}</script>`,
}));

// 4. Service worker: precache every file; the version is a hash of the build.
const files = (await walk(dist)).sort();
const hash = createHash("sha256");
for (const f of files) hash.update(relative(dist, f)).update(await readFile(f));
const list = ["./", ...files.map((f) => "./" + relative(dist, f).split("\\").join("/"))];
await writeFile(join(dist, "sw.js"), fill(await readFile(join(src, "sw.js"), "utf8"), {
  __VERSION__: `strativarious-${hash.digest("hex").slice(0, 12)}`,
  __FILES__: JSON.stringify(list),
}));

console.log(`dist/: ${files.length + 1} files`);
