import {
  WebGLRenderer, Scene, PerspectiveCamera, PlaneGeometry, Mesh, ShaderMaterial, LoadingManager,
  TextureLoader, Vector3, Color, NoColorSpace, DoubleSide, LinearFilter, EdgesGeometry,
  LineSegments, LineBasicMaterial,
} from "three";
import { MIN_COVERAGE } from "../core/km.js";
import { t, apply, langPicker } from "../i18n.js";

/**
 * Mounts the 3D viewer on the page markup (src/static/viewer.template.html).
 * @param {object} data   manifest: layers[].src and original are image URLs (blob: or data:)
 * @param {{ homeHref?: string, onExport?: () => Promise<void> }} opts
 */
export function startViewer(data, { homeHref, onExport } = {}) {
  // Layers the solver barely used read as "0%": hide them (older exports may still contain them).
  const used = data.layers.filter((l) => l.coverage >= MIN_COVERAGE);
  const layers = used.length ? used : data.layers;
  const N = layers.length;
  const H = 2;
  const W = H * (data.width / data.height);
  const GAP = 0.35 * H;
  const $ = (id) => document.getElementById(id);

  // ---------- KM shader ----------
  // Per layer: c = texel^2 * cmax (PNG is sqrt-encoded), KS += w*c*ks; R = 1 + KS - sqrt(KS^2 + 2KS)
  const SRGB = /* glsl */ `
    vec3 toSrgb(vec3 c) {
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    vec3 kmR(vec3 ks) { return 1.0 + ks - sqrt(ks * ks + 2.0 * ks); }`;

  function kmShader(n, { sheet }) {
    const decl = [], sum = [];
    for (let i = 0; i < n; i++) {
      decl.push(`uniform sampler2D uTex${i}; uniform vec3 uKs${i}; uniform float uCmax${i}; uniform float uW${i};`);
      sum.push(`ks += uW${i} * pow(texture2D(uTex${i}, vUv).r, 2.0) * uCmax${i} * uKs${i};`);
    }
    const tail = sheet
      ? /* glsl */ `
        float a = pow(clamp((1.0 - dot(R, vec3(0.2126, 0.7152, 0.0722))) * 3.0, 0.0, 1.0), 0.8);
        // Glass sheen (fresnel + a soft band that slides with the view) ONLY where there is no
        // pigment: (1-a)^2 keeps painted areas at their exact color.
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(V.z), 2.0);
        float band = 1.0 - smoothstep(0.0, 0.22, abs((vUv.x - 0.55 * vUv.y) - (0.2 + 0.6 * clamp(0.5 + V.x, 0.0, 1.0))));
        float glass = (0.03 + 0.09 * fres + 0.07 * band) * (1.0 - a) * (1.0 - a);
        float outA = a + glass;
        gl_FragColor = vec4((toSrgb(R) * a + glass) / max(outA, 1e-4), outA * uOpacity);`
      : /* glsl */ `
        vec3 col = toSrgb(R * uPaper);
        if (vUv.x < uSplit) col = texture2D(uOriginal, vUv).rgb;
        float line = 1.0 - smoothstep(0.0, 0.004, abs(vUv.x - uSplit));
        col = mix(col, vec3(0.906, 0.706, 0.412), line * step(0.001, uSplit) * step(uSplit, 0.999));
        gl_FragColor = vec4(col, 1.0);`;
    return /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform vec3 uPaper;
      uniform float uOpacity;
      uniform float uSplit;
      uniform sampler2D uOriginal;
      ${decl.join("\n")}
      ${SRGB}
      void main() {
        vec3 ks = vec3(0.0);
        ${sum.join("\n      ")}
        vec3 R = kmR(ks);
        ${tail}
      }`;
  }
  const vert = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;

  // ---------- texture ----------
  const manager = new LoadingManager();
  const loader = new TextureLoader(manager);
  function tex(url) {
    const t = loader.load(url);
    t.colorSpace = NoColorSpace; // data, not color: no conversions
    t.minFilter = LinearFilter;
    t.generateMipmaps = false;
    return t;
  }
  const layerTex = layers.map((l) => tex(l.src));
  const originalTex = tex(data.original); // sampled raw in our shader: already sRGB, shown as is
  const paper = new Vector3(...data.paper);

  function kmMaterial(idx, sheet) {
    const u = {
      uPaper: { value: paper }, uOpacity: { value: 1 }, uSplit: { value: 0 }, uOriginal: { value: originalTex },
    };
    idx.forEach((li, i) => {
      u[`uTex${i}`] = { value: layerTex[li] };
      u[`uKs${i}`] = { value: new Vector3(...layers[li].ks) };
      u[`uCmax${i}`] = { value: layers[li].cmax };
      u[`uW${i}`] = { value: 1 };
    });
    return new ShaderMaterial({
      uniforms: u, vertexShader: vert, fragmentShader: kmShader(idx.length, { sheet }),
      transparent: sheet, depthWrite: !sheet, side: DoubleSide,
    });
  }

  // ---------- scene ----------
  // Transparent canvas: the page provides a neutral backdrop (and the panel blurs it).
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  $("stage").prepend(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.01, 100);

  const geo = new PlaneGeometry(W, H);
  const edges = new EdgesGeometry(geo);
  const baseMat = kmMaterial(layers.map((_, i) => i), false);
  scene.add(new Mesh(geo, baseMat));

  const rgb = (l) => new Color(`rgb(${l.masstone.join(",")})`);
  const sheets = layers.map((l, i) => {
    const m = new Mesh(geo, kmMaterial([i], true));
    m.renderOrder = i + 1;
    m.add(new LineSegments(edges, new LineBasicMaterial({ color: rgb(l), transparent: true })));
    scene.add(m);
    return m;
  });

  // ---------- state ----------
  // "goal" is where the user wants to go, "cur" eases towards it: smooth transitions for free.
  const state = { timeline: N, enabled: layers.map(() => true), solo: -1, split: 0, playing: false };
  const goal = { explode: 0, theta: 0, phi: Math.PI / 2, radius: 4.2 };
  const cur = { ...goal };
  const ease = (a, b, k) => a + (b - a) * k;
  let dirty = true; // set whenever the scene must be redrawn

  function weightOf(i) {
    if (state.solo >= 0) return i === state.solo ? 1 : 0;
    if (!state.enabled[i]) return 0;
    return Math.min(Math.max(state.timeline - i, 0), 1);
  }

  function applyScene() {
    const e = cur.explode;
    baseMat.uniforms.uSplit.value = state.split;
    for (let i = 0; i < N; i++) {
      const w = weightOf(i);
      baseMat.uniforms[`uW${i}`].value = w * (1 - e);
      const s = sheets[i];
      s.position.z = (i + 1) * GAP * e;
      s.material.uniforms.uOpacity.value = w * e;
      s.visible = e > 0.002 && w > 0.002;
      s.children[0].material.opacity = e * (state.solo < 0 || state.solo === i ? 1 : 0.25);
    }
  }

  // ---------- panel ----------
  const rows = layers.map((l, i) => {
    const row = document.createElement("div");
    row.className = "layer";
    row.setAttribute("role", "button");
    row.tabIndex = 0;
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = i + 1;
    const sw = document.createElement("span");
    sw.className = "sw";
    sw.style.background = `rgb(${l.masstone.join(",")})`;
    const txt = document.createElement("span");
    txt.className = "txt";
    const nm = document.createElement("b");
    nm.textContent = l.name;
    const sub = document.createElement("small");
    sub.dataset.layer = i;
    txt.append(nm, sub);
    const eye = document.createElement("button");
    eye.className = "eye";
    eye.addEventListener("click", (ev) => {
      ev.stopPropagation();
      state.enabled[i] = !state.enabled[i];
      if (!state.enabled[i] && state.solo === i) state.solo = -1;
      refreshUI();
    });
    row.append(num, sw, txt, eye);
    const toggleSolo = () => { state.solo = state.solo === i ? -1 : i; refreshUI(); };
    row.addEventListener("click", toggleSolo);
    row.addEventListener("keydown", (ev) => { if (ev.key === "Enter") toggleSolo(); });
    $("layers").appendChild(row);
    return { row, eye };
  });

  // Strength is stored as an i18n key.
  const strength = (l) => t(`strength.${l.strength}`);

  function caption() {
    if (state.solo >= 0) {
      const l = layers[state.solo];
      return t("v.solo", { name: l.name, strength: strength(l) });
    }
    if (state.timeline >= N) return "";
    if (state.timeline <= 0) return t("v.paper");
    const i = Math.min(Math.ceil(state.timeline) - 1, N - 1);
    return t("v.step", { i: i + 1, n: N, name: layers[i].name, strength: strength(layers[i]) });
  }

  function refreshUI() {
    dirty = true;
    rows.forEach(({ row, eye }, i) => {
      row.classList.toggle("solo", state.solo === i);
      row.classList.toggle("off", weightOf(i) === 0);
      eye.textContent = state.enabled[i] ? "👁" : "—";
      eye.title = t("v.eye");
      row.querySelector("small").textContent = t("v.coverage", { strength: strength(layers[i]), pct: Math.round(layers[i].coverage * 100) });
      eye.setAttribute("aria-pressed", String(!state.enabled[i]));
    });
    const c = caption();
    $("caption").textContent = c;
    $("caption").classList.toggle("hidden", !c);
    $("timelineLabel").textContent = state.timeline >= N ? t("v.all") : t("v.of", { i: Math.ceil(state.timeline), n: N });
    $("timeline").value = state.timeline;
    $("explode").value = goal.explode;
    $("split").value = state.split;
    $("play").textContent = state.playing ? t("v.pause") : t("v.play");
    $("tech").textContent = t("v.tech", { palette: data.palette, mean: data.error.meanAbs255.toFixed(1),
      p95: data.error.p95Abs255.toFixed(1), whites: (data.whitesFraction * 100).toFixed(1) });
  }

  $("title").textContent = data.title ?? data.source;
  document.title = `${data.title ?? data.source} · Strativarious`;
  $("langSlot").append(langPicker());
  apply();
  addEventListener("langchange", refreshUI);
  if (data.paperSuspect) $("paperWarn").classList.remove("hidden");
  if (homeHref) {
    $("home").href = homeHref;
    $("home").classList.remove("hidden");
  }
  if (onExport) {
    $("export").classList.remove("hidden");
    $("export").addEventListener("click", async () => {
      $("export").disabled = true;
      try { await onExport(); } finally { $("export").disabled = false; }
    });
  }

  $("explode").addEventListener("input", (ev) => { goal.explode = +ev.target.value; });
  $("timeline").max = N;
  $("timeline").addEventListener("input", (ev) => { stopPlay(); state.timeline = +ev.target.value; refreshUI(); });
  $("split").addEventListener("input", (ev) => { state.split = +ev.target.value; refreshUI(); });

  // ---------- play ----------
  const SECONDS_PER_LAYER = 1.4;
  let lastT = 0;
  function stopPlay() { state.playing = false; }
  function togglePlay() {
    state.playing = !state.playing;
    if (state.playing) {
      if (state.timeline >= N) state.timeline = 0;
      state.solo = -1;
      lastT = performance.now();
    }
    refreshUI();
  }
  $("play").addEventListener("click", togglePlay);

  // ---------- views ----------
  function view(kind) {
    if (kind === "front") Object.assign(goal, { explode: 0, theta: 0, phi: Math.PI / 2, radius: 4.2 });
    else Object.assign(goal, { explode: Math.max(goal.explode, 0.6), theta: -0.8, phi: 1.15, radius: 5.6 });
    refreshUI();
  }
  $("viewFront").addEventListener("click", () => view("front"));
  $("view3d").addEventListener("click", () => view("3d"));

  $("save").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `${(data.title ?? "strati").replace(/[^\w\- ]+/g, "")}.png`;
    // The canvas is transparent: flatten it onto the backdrop color for the saved file.
    const src = renderer.domElement;
    const out = Object.assign(document.createElement("canvas"), { width: src.width, height: src.height });
    const ctx = out.getContext("2d");
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#15171c";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    a.href = out.toDataURL("image/png");
    a.click();
  });

  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, button, summary, [role=button]")) return; // let native controls handle it
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); togglePlay(); }
    else if (k === "arrowright") { stopPlay(); state.timeline = Math.min(Math.floor(state.timeline) + 1, N); refreshUI(); }
    else if (k === "arrowleft") { stopPlay(); state.timeline = Math.max(Math.ceil(state.timeline) - 1, 0); refreshUI(); }
    else if (k === "f") view("front");
    else if (k === "3") view("3d");
    else if (k === "escape") { state.solo = -1; refreshUI(); }
  });

  // ---------- orbit camera (mouse + touch) ----------
  // Painting in the XY plane, normal +Z, Y up. phi = polar angle from +Y.
  const pointers = new Map();
  let pinch0 = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", (e) => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); });
  const lift = (e) => { pointers.delete(e.pointerId); pinch0 = 0; };
  el.addEventListener("pointerup", lift);
  el.addEventListener("pointercancel", lift);
  el.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) {
      goal.theta -= (e.clientX - prev.clientX) * 0.006;
      goal.phi = Math.min(Math.max(goal.phi - (e.clientY - prev.clientY) * 0.006, 0.1), Math.PI - 0.1);
      cur.theta = goal.theta;
      cur.phi = goal.phi;
    } else if (pointers.size === 2) {
      const other = [...pointers.values()].find((p) => p.pointerId !== e.pointerId);
      const d = Math.hypot(e.clientX - other.clientX, e.clientY - other.clientY);
      if (pinch0) goal.radius = Math.min(Math.max(goal.radius * (pinch0 / d), 1.2), 14);
      pinch0 = d;
    }
    pointers.set(e.pointerId, e);
    dirty = true;
  });
  el.addEventListener("wheel", (e) => {
    e.preventDefault();
    goal.radius = Math.min(Math.max(goal.radius * Math.exp(e.deltaY * 0.001), 1.2), 14);
  }, { passive: false });
  el.addEventListener("dblclick", () => view(goal.explode > 0.01 ? "3d" : "front"));

  // ---------- loop ----------
  function resize() {
    const { clientWidth: w, clientHeight: h } = $("stage");
    renderer.setSize(w, h, false);
    // Desktop: the glass panel floats over the right side. Frame the scene for the free area
    // (w - covered) and let the rendered view extend under the panel.
    const panel = document.querySelector("aside");
    const covered = panel && getComputedStyle(panel).position === "fixed" ? panel.offsetWidth : 0;
    const free = Math.max(w - covered, w * 0.4);
    camera.aspect = free / h;
    // On narrow areas (portrait phones) zoom out so the painting fits.
    camera.zoom = Math.min(1, camera.aspect / (W / H) * 1.15);
    if (free < w) camera.setViewOffset(free, h, 0, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe($("stage"));

  const target = new Vector3();
  renderer.setAnimationLoop((t) => {
    // Only draw when something changes: an idle viewer shouldn't drain a phone's battery.
    const moving = ["explode", "theta", "phi", "radius"].some((k) => Math.abs(cur[k] - goal[k]) > 1e-4);
    if (!dirty && !moving && !state.playing) { lastT = t; return; }
    dirty = false;
    if (state.playing) {
      state.timeline = Math.min(state.timeline + (t - lastT) / 1000 / SECONDS_PER_LAYER, N);
      if (state.timeline >= N) state.playing = false;
      refreshUI();
    }
    lastT = t;
    for (const k of ["explode", "theta", "phi", "radius"]) cur[k] = ease(cur[k], goal[k], 0.12);
    target.set(0, 0, (N * GAP * cur.explode) / 2);
    camera.position.set(
      target.x + cur.radius * Math.sin(cur.phi) * Math.sin(cur.theta),
      target.y + cur.radius * Math.cos(cur.phi),
      target.z + cur.radius * Math.sin(cur.phi) * Math.cos(cur.theta),
    );
    camera.lookAt(target);
    applyScene();
    renderer.render(scene, camera);
  });

  refreshUI();
  manager.onLoad = () => {
    dirty = true;
    $("loading").classList.add("hidden");
    // Intro: the painting opens into its layers, so it's obvious what the tool does.
    setTimeout(() => view("3d"), 700);
  };
}
