// Ludo3D.jsx — Shyam's 3D LUDO as a React component (requires: npm i three)
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const COL = [0x84c52b, 0xfcc61f, 0x1b93ff, 0xe0282a];
const NM = ["Green", "Yellow", "Blue", "Red"];
const START = [0, 13, 26, 39];
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);
const MODES = ["Human", "CPU", "Off"];
const hex = (c) => "#" + c.toString(16).padStart(6, "0");
const V3 = THREE.Vector3;

// ---- 52-cell clockwise ring path (row, col) on a 15x15 grid ----
const R = [];
const a = (r, c) => R.push([r, c]);
for (let c = 1; c <= 5; c++) a(6, c);
for (let r = 5; r >= 0; r--) a(r, 6);
a(0, 7); a(0, 8);
for (let r = 1; r <= 5; r++) a(r, 8);
for (let c = 9; c <= 14; c++) a(6, c);
a(7, 14); a(8, 14);
for (let c = 13; c >= 9; c--) a(8, c);
for (let r = 9; r <= 14; r++) a(r, 8);
a(14, 7); a(14, 6);
for (let r = 13; r >= 9; r--) a(r, 6);
for (let c = 5; c >= 0; c--) a(8, c);
a(7, 0); a(6, 0);
const HC = (p, k) => [[7, 1 + k], [1 + k, 7], [7, 13 - k], [13 - k, 7]][p];
const P = (r, c) => new V3(c - 7, 0.16, r - 7);
const ORG = [[0, 0], [0, 9], [9, 9], [9, 0]];
const CS = [[-0.85, 0], [0, -0.85], [0.85, 0], [0, 0.85]];
const FV = [3, 4, 1, 6, 2, 5];
const PIPS = {
  1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};
const FQ = {
  1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =====================================================================
// Game engine (imperative three.js + Ludo rules). UI talks to it via `ui`.
// =====================================================================
function createGame(cv, ui) {
  const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  rd.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rd.shadowMap.enabled = true;
  const sc = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  let az = 0, el = 1.0, zoom = 1, raf = 0, disposed = false;

  const setCam = () => {
    const d = Math.max(21, 9.8 / (0.364 * cam.aspect)) * zoom;
    cam.position.set(d * Math.cos(el) * Math.sin(az), d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    cam.lookAt(0, 0, 0);
  };
  const resize = () => {
    rd.setSize(window.innerWidth, window.innerHeight, false);
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    setCam();
  };
  window.addEventListener("resize", resize);

  sc.add(new THREE.HemisphereLight(0xffffff, 0x886644, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(6, 14, 8);
  dl.castShadow = true;
  dl.shadow.mapSize.set(2048, 2048);
  Object.assign(dl.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 });
  sc.add(dl);

  const M = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const add = (g, m, x, y, z) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.receiveShadow = true;
    sc.add(o);
    return o;
  };

  // ---------- board ----------
  add(new THREE.BoxGeometry(16.2, 0.5, 16.2), M(0x8a5a2b), 0, -0.25, 0);
  const cellG = new THREE.BoxGeometry(0.94, 0.16, 0.94);
  const star = (col, x, z) => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.font = "52px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = col; g.fillText("★", 32, 36);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.165, z);
    sc.add(m);
  };
  R.forEach(([r, c], i) => {
    const p = START.indexOf(i), s = SAFE.has(i);
    add(cellG, M(p >= 0 ? COL[p] : s ? 0xcfcfcf : 0xfff3e8, 0.8), c - 7, 0.08, r - 7);
    if (s) star(p >= 0 ? "#ffffff" : "#8a8a8a", c - 7, r - 7);
  });
  for (let p = 0; p < 4; p++)
    for (let k = 0; k < 5; k++) {
      const [r, c] = HC(p, k);
      add(cellG, M(COL[p], 0.7), c - 7, 0.08, r - 7);
    }
  ORG.forEach(([r, c], p) => {
    const ctr = P(r + 2.5, c + 2.5);
    add(new THREE.BoxGeometry(6, 0.16, 6), M(COL[p], 0.7), ctr.x, 0.08, ctr.z);
    add(new THREE.BoxGeometry(4.5, 0.06, 4.5), M(new THREE.Color(COL[p]).multiplyScalar(0.65)), ctr.x, 0.19, ctr.z);
    for (let i = 0; i < 4; i++) {
      const q = P(r + 1.5 + (i >> 1) * 2, c + 1.5 + (i & 1) * 2);
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 28), M(new THREE.Color(COL[p]).multiplyScalar(0.4)), q.x, 0.24, q.z);
    }
  });
  [[[-1.5, -1.5], [-1.5, 1.5]], [[-1.5, -1.5], [1.5, -1.5]], [[1.5, -1.5], [1.5, 1.5]], [[-1.5, 1.5], [1.5, 1.5]]].forEach((t, p) => {
    const sh = new THREE.Shape();
    sh.moveTo(t[0][0], -t[0][1]); sh.lineTo(t[1][0], -t[1][1]); sh.lineTo(0, 0);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: COL[p], side: THREE.DoubleSide }));
    m.position.y = 0.17;
    sc.add(m);
  });

  // ---------- dice ----------
  const faces = FV.map(() => { const c = document.createElement("canvas"); c.width = c.height = 128; return c; });
  const dmat = faces.map((c) => new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.35 }));
  const paintDice = (col) => {
    faces.forEach((c, i) => {
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "#ddd"; g.lineWidth = 8; g.strokeRect(0, 0, 128, 128);
      g.fillStyle = col;
      PIPS[FV[i]].forEach(([x, y]) => { g.beginPath(); g.arc(28 + x * 36, 28 + y * 36, 12, 0, 7); g.fill(); });
      dmat[i].map.needsUpdate = true;
    });
  };
  const dice = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), dmat);
  dice.castShadow = true;
  dice.position.set(0, 1.3, 0);
  sc.add(dice);

  // ---------- animation engine ----------
  const anims = [];
  const mv = (o, to, ms, hop = 0) =>
    new Promise((res) => {
      const f = o.position.clone();
      anims.push({ t0: performance.now(), ms, res, fn: (u) => { o.position.lerpVectors(f, to, u); o.position.y += Math.sin(u * Math.PI) * hop; } });
    });
  const rollAnim = (v) =>
    new Promise((res) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...FQ[v]));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.random() * 6.28));
      let q0 = null;
      const sp = [Math.random() * 0.5 + 0.3, Math.random() * 0.5 + 0.3, Math.random() * 0.5 + 0.3];
      anims.push({
        t0: performance.now(), ms: 900, res,
        fn: (u) => {
          dice.position.y = 1.3 + Math.sin(u * Math.PI) * 1.6;
          if (u < 0.7) { dice.rotation.x += sp[0]; dice.rotation.y += sp[1]; dice.rotation.z += sp[2]; }
          else { if (!q0) q0 = dice.quaternion.clone(); dice.quaternion.slerpQuaternions(q0, q, (u - 0.7) / 0.3); }
        },
      });
    });

  // ---------- tokens ----------
  let T = [], act = [], cur = 0, val = 0, phase = "setup", mode = [0, 1, 1, 1];
  const tokMeshes = [];
  const mkTok = (p, i) => {
    const g = new THREE.Group(), b = new THREE.Group();
    g.add(b);
    const m = M(COL[p], 0.3);
    const t = { p, i, s: 0, g, b, mk: null };
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.2, 24), m); base.position.y = 0.1;
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), m); top.position.y = 0.38;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 24), M(0xffffff, 0.3));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2;
    [base, top, ring].forEach((o) => { o.castShadow = true; o.userData.tok = t; b.add(o); tokMeshes.push(o); });
    const mk = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 8, 28), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mk.rotation.x = Math.PI / 2; mk.position.y = 0.05; mk.visible = false;
    g.add(mk); t.mk = mk;
    sc.add(g);
    return t;
  };
  const tokPos = (p, i, s) => {
    if (s === 0) { const [r, c] = ORG[p]; return P(r + 1.5 + (i >> 1) * 2, c + 1.5 + (i & 1) * 2); }
    if (s <= 51) { const [r, c] = R[(START[p] + s - 1) % 52]; return P(r, c); }
    if (s <= 56) { const [r, c] = HC(p, s - 52); return P(r, c); }
    return new V3(CS[p][0], 0.17, CS[p][1]);
  };
  const key = (t) => (t.s === 57 ? "c" + t.p : t.s <= 51 ? "r" + ((START[t.p] + t.s - 1) % 52) : "h" + t.p + t.s);
  const layout = () => {
    const m = {};
    for (const p of act)
      for (const t of T[p]) {
        if (t.s === 0) { t.g.position.copy(tokPos(p, t.i, 0)); t.g.scale.setScalar(1); continue; }
        (m[key(t)] = m[key(t)] || []).push(t);
      }
    for (const k in m) {
      const A = m[k];
      A.forEach((t, j) => {
        const o = tokPos(t.p, t.i, t.s);
        if (A.length > 1) { const an = (j / A.length) * 6.283; o.x += Math.cos(an) * 0.2; o.z += Math.sin(an) * 0.2; }
        t.g.position.copy(o);
        t.g.scale.setScalar(A.length > 1 ? 0.8 : 1);
      });
    }
  };

  // ---------- rules ----------
  const ringIdx = (t) => (START[t.p] + t.s - 1) % 52;
  const legal = (p, v) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const t = T[p][i];
      let ns;
      if (t.s === 0) { if (v !== 6) continue; ns = 1; }
      else { ns = t.s + v; if (ns > 57) continue; }
      if (ns <= 51) {
        const idx = (START[p] + ns - 1) % 52;
        if (T[p].some((u) => u !== t && u.s >= 1 && u.s <= 51 && ringIdx(u) === idx)) continue;
      }
      out.push(i);
    }
    return out;
  };
  const victims = (p, ns) => {
    if (ns < 1 || ns > 51) return [];
    const idx = (START[p] + ns - 1) % 52;
    if (SAFE.has(idx)) return [];
    const v = [];
    for (const q of act) if (q !== p) for (const u of T[q]) if (u.s >= 1 && u.s <= 51 && ringIdx(u) === idx) v.push(u);
    return v;
  };
  const aiPick = (L) => {
    let best = L[0], bs = -1e9;
    for (const i of L) {
      const t = T[cur][i], ns = t.s === 0 ? 1 : t.s + val;
      let s = ns * 0.3;
      if (ns === 57) s += 100;
      if (victims(cur, ns).length) s += 80;
      if (t.s === 0) s += 50;
      if (ns <= 51 && SAFE.has((START[cur] + ns - 1) % 52)) s += 15;
      if (ns > 51) s += 20;
      s += Math.random() * 3;
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  };
  const mark = (L) => { T.flat().forEach((t) => (t.mk.visible = false)); L.forEach((i) => (T[cur][i].mk.visible = true)); };

  // ---------- turn flow ----------
  const turn = async () => {
    if (disposed) return;
    paintDice(hex(COL[cur]));
    phase = "roll";
    const cpu = mode[cur] === 1;
    ui.msg(cur, cpu ? `${NM[cur]} (CPU) rolling…` : `${NM[cur]} — roll the dice`);
    ui.canRoll(!cpu);
    if (cpu) { await sleep(700); roll(); }
  };
  const next = (extra) => {
    if (!extra) { do { cur = (cur + 1) % 4; } while (!act.includes(cur)); }
    else ui.msg(cur, `${NM[cur]} gets another turn`);
    turn();
  };
  const play = async (i) => {
    phase = "busy"; mark([]);
    const t = T[cur][i], p = cur;
    ui.msg(p, `${NM[p]} rolled ${val}`);
    const ns = t.s === 0 ? 1 : t.s + val;
    if (t.s === 0) await mv(t.g, tokPos(p, i, 1), 350, 0.9);
    else for (let k = t.s + 1; k <= ns; k++) await mv(t.g, tokPos(p, i, k), 190, 0.5);
    t.s = ns;
    let got = false;
    for (const u of victims(p, ns)) {
      u.s = 0; got = true;
      ui.msg(p, `${NM[p]} captured ${NM[u.p]}!`);
      await mv(u.g, tokPos(u.p, u.i, 0), 500, 2);
    }
    layout();
    if (T[p].every((x) => x.s === 57)) { phase = "over"; ui.canRoll(false); return ui.win(p); }
    next(val === 6 || got || ns === 57);
  };
  const roll = async () => {
    if (phase !== "roll" || disposed) return;
    phase = "busy"; ui.canRoll(false);
    val = 1 + Math.floor(Math.random() * 6);
    await rollAnim(val);
    const L = legal(cur, val);
    if (!L.length) { ui.msg(cur, `${NM[cur]} rolled ${val} — no move`); await sleep(1000); return next(false); }
    if (mode[cur] === 1) { ui.msg(cur, `${NM[cur]} rolled ${val}`); await sleep(600); return play(aiPick(L)); }
    if (L.length === 1 || L.every((i) => T[cur][i].s === T[cur][L[0]].s)) return play(L[0]);
    phase = "pick"; mark(L);
    ui.msg(cur, `${NM[cur]} rolled ${val} — pick a token`);
  };
  const start = (modes) => {
    mode = modes.slice();
    act = [0, 1, 2, 3].filter((p) => mode[p] !== 2);
    if (act.length < 2) return false;
    T.flat().forEach((t) => sc.remove(t.g));
    tokMeshes.length = 0;
    T = [[], [], [], []];
    for (const p of act) for (let i = 0; i < 4; i++) T[p].push(mkTok(p, i));
    layout();
    cur = act[0];
    turn();
    return true;
  };

  // ---------- input ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let drag = null;
  const pts = new Map();
  let pd = 0;
  const pdist = () => { const v = [...pts.values()]; return Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]) || 1; };
  const onDown = (e) => {
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    drag = { x: e.clientX, y: e.clientY, m: 0 };
    if (pts.size > 1) { drag.m = 99; pd = pdist(); }
    cv.setPointerCapture(e.pointerId);
  };
  const onCancel = (e) => { pts.delete(e.pointerId); pd = 0; drag = null; };
  const onMove = (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size > 1) { // pinch to zoom
      const d = pdist();
      if (pd) { zoom = Math.max(0.55, Math.min(1.6, (zoom * pd) / d)); setCam(); }
      pd = d;
      if (drag) drag.m = 99;
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.m += Math.abs(dx) + Math.abs(dy);
    az -= dx * 0.006;
    el = Math.max(0.35, Math.min(1.45, el + dy * 0.006));
    drag.x = e.clientX; drag.y = e.clientY;
    setCam();
  };
  const onUp = (e) => {
    pts.delete(e.pointerId); pd = 0;
    const d = drag; drag = null;
    if (!d || d.m > 6) return;
    ptr.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ptr, cam);
    if (phase === "pick") {
      // pick the nearest highlighted token to the tap (finger-friendly)
      let bt = null, bd = 48;
      for (const t of T[cur]) {
        if (!t.mk.visible) continue;
        const v = t.g.position.clone().project(cam);
        const d = Math.hypot(((v.x + 1) / 2) * window.innerWidth - e.clientX, ((1 - v.y) / 2) * window.innerHeight - e.clientY);
        if (d < bd) { bd = d; bt = t; }
      }
      if (bt) play(bt.i);
    } else if (phase === "roll" && mode[cur] === 0 && ray.intersectObject(dice).length) roll();
  };
  const onWheel = (e) => { zoom = Math.max(0.55, Math.min(1.6, zoom * (1 + e.deltaY * 0.001))); setCam(); e.preventDefault(); };
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("pointercancel", onCancel);
  cv.addEventListener("wheel", onWheel, { passive: false });

  // ---------- render loop ----------
  const loop = () => {
    if (disposed) return;
    const now = performance.now();
    for (let i = anims.length - 1; i >= 0; i--) {
      const A = anims[i], u = Math.min(1, (now - A.t0) / A.ms);
      A.fn(u);
      if (u >= 1) { anims.splice(i, 1); A.res(); }
    }
    const t = now / 1000;
    for (const p of act)
      for (const k of T[p]) {
        if (k.mk.visible) { k.mk.scale.setScalar(1 + 0.15 * Math.sin(t * 6)); k.b.position.y = Math.abs(Math.sin(t * 5)) * 0.25; }
        else k.b.position.y = 0;
      }
    if (phase === "roll" || phase === "setup" || phase === "pick") dice.rotation.y += 0.004;
    rd.render(sc, cam);
    raf = requestAnimationFrame(loop);
  };
  paintDice("#2b2620");
  resize();
  loop();

  return {
    start, roll,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onCancel);
      cv.removeEventListener("wheel", onWheel);
      rd.dispose();
    },
  };
}

// =====================================================================
// React UI
// =====================================================================
const S = {
  hud: { position: "fixed", left: "50%", transform: "translateX(-50%)", top: 10, background: "rgba(255,253,248,.93)", color: "#2b2620", border: "1px solid #d6cbb4", borderRadius: 16, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, maxWidth: "94vw", boxShadow: "0 4px 18px rgba(0,0,0,.25)", fontFamily: "system-ui,sans-serif" },
  btn: { font: "inherit", fontWeight: 600, background: "#2b2620", color: "#fff", border: 0, borderRadius: 10, padding: "9px 16px", cursor: "pointer" },
  ov: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.55)", padding: 16, fontFamily: "system-ui,sans-serif" },
  card: { background: "#fffdf8", color: "#2b2620", borderRadius: 20, padding: 22, maxWidth: 420, width: "100%", maxHeight: "92vh", overflow: "auto" },
};

export default function Ludo3D() {
  const cvRef = useRef(null);
  const game = useRef(null);
  const [screen, setScreen] = useState("setup"); // setup | play | won
  const [modes, setModes] = useState([0, 1, 1, 1]);
  const [hud, setHud] = useState({ p: 0, text: "", can: false });
  const [winner, setWinner] = useState(0);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-aspect-ratio: 1/1), (max-width: 640px)");
    const f = () => setNarrow(mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);

  useEffect(() => {
    game.current = createGame(cvRef.current, {
      msg: (p, text) => setHud((h) => ({ ...h, p, text })),
      canRoll: (can) => setHud((h) => ({ ...h, can })),
      win: (p) => { setWinner(p); setScreen("won"); },
    });
    return () => game.current.dispose();
  }, []);

  const startGame = () => {
    if (!game.current.start(modes)) return alert("Pick at least 2 players.");
    setScreen("play");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#efe7d6" }}>
      <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", userSelect: "none", WebkitTapHighlightColor: "transparent" }} />

      {screen !== "setup" && (
        <div style={narrow ? { ...S.hud, top: "auto", bottom: 12, width: "calc(100vw - 24px)", boxSizing: "border-box", justifyContent: "space-between", padding: 12 } : S.hud}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: hex(COL[hud.p]), border: "2px solid #2b2620" }} />
          <div style={{ fontSize: 14, minWidth: 150 }}>{hud.text}</div>
          <button style={{ ...S.btn, opacity: hud.can ? 1 : 0.35, ...(narrow ? { padding: "12px 18px", fontSize: 16 } : {}) }} disabled={!hud.can} onClick={() => game.current.roll()}>Roll 🎲</button>
        </div>
      )}

      {screen === "setup" && (
        <div style={S.ov}>
          <div style={S.card}>
            <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>🎲 Shyam's 3D LUDO</h1>
            <p style={{ opacity: 0.75, fontSize: 13, margin: "0 0 14px" }}>Choose who plays each colour (2–4 players).</p>
            {modes.map((m, p) => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0" }}>
                <i style={{ width: 22, height: 22, borderRadius: "50%", background: hex(COL[p]) }} />
                <span style={{ flex: 1, fontWeight: 600 }}>{NM[p]}</span>
                <button
                  style={{ ...S.btn, background: "transparent", color: "#2b2620", border: "2px solid #d6cbb4", minWidth: 90 }}
                  onClick={() => setModes((ms) => ms.map((x, i) => (i === p ? (x + 1) % 3 : x)))}
                >{MODES[m]}</button>
              </div>
            ))}
            <ul style={{ fontSize: 12.5, paddingLeft: 18, lineHeight: 1.45, opacity: 0.85 }}>
              <li>Roll a 6 to bring a token out. A 6, a capture, or reaching home gives another turn.</li>
              <li>Tokens move clockwise. You can't land on your own token.</li>
              <li>Star squares are safe. Landing on an opponent elsewhere sends it home.</li>
              <li>Exact roll needed to enter the centre. First to bring all 4 home wins.</li>
            </ul>
            <button style={{ ...S.btn, width: "100%", fontSize: 16, padding: 12 }} onClick={startGame}>Start game</button>
          </div>
        </div>
      )}

      {screen === "won" && (
        <div style={S.ov}>
          <div style={S.card}>
            <h1 style={{ color: hex(COL[winner]) }}>🏆 {NM[winner]} wins!</h1>
            <p style={{ opacity: 0.75, fontSize: 13 }}>All four tokens reached home.</p>
            <button style={{ ...S.btn, width: "100%", fontSize: 16, padding: 12 }} onClick={() => window.location.reload()}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}
