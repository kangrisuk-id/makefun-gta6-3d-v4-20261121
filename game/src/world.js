// Palmera Bay: golden-hour coastal city. Roads, sidewalks, parks, beach,
// marina with sailboats, 40+ dressed buildings, props. Built from boxes and
// canvas textures only — no external assets.
import * as THREE from 'three';
import { pick, range } from './rng.js';

export const AVENUES = [-240, -120, 0, 120, 240];       // north-south roads (x)
export const STREETS = [-240, -120, 0, 120];            // east-west roads (z)
export const BEACHFRONT_Z = 208;                        // coast road
export const LAND = { minX: -300, maxX: 300, minZ: -300, maxZ: 252 };
export const PIER = { x: 0, z0: 246, z1: 372 };
export const STORAGE = { x: 196, z: 92 };               // Solano Storage yard
export const CLINIC = { x: -180, z: -60 };              // Clínica del Sol

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0.02, ...o });

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Road surface: asphalt with a dashed centre line, repeats along its length.
function roadTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#33343a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3b42'; for (let i = 0; i < 260; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8e4da'; g.fillRect(4, 0, 4, h); g.fillRect(w - 8, 0, 4, h);
    g.fillStyle = '#f5c542'; g.fillRect(w / 2 - 3, 20, 6, 90);
  }, 1, 14);
}
function crosswalkTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#33343a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8e4da';
    for (let i = 0; i < 5; i++) { // zebra bands on all four approaches
      const p = 26 + i * 42;
      g.fillRect(p, 6, 22, 44); g.fillRect(p, h - 50, 22, 44);
      g.fillRect(6, p, 44, 22); g.fillRect(w - 50, p, 22, 22);
    }
    g.fillStyle = '#f5c542'; g.fillRect(w / 2 - 3, 60, 6, 40); g.fillRect(w / 2 - 3, h - 100, 6, 40);
    g.fillRect(60, h / 2 - 3, 40, 6); g.fillRect(w - 100, h / 2 - 3, 40, 6);
  });
}
function buildingTexture(rng, base, floors, cols, litRatio) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const fw = w / cols, fh = h / floors;
    for (let y = 0; y < floors; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2b3a44' : '#36444e');
      g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.55);
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.2, fw * 0.56, fh * 0.14);
    }
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, h - fh * 0.9, w, fh * 0.9); // storefront band
  });
}
function signTexture(text, bg, fg) {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = 'bold 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
function awningTexture(c1, c2) {
  return canvasTex(128, 64, (g, w, h) => {
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * w / 8, 0, w / 8, h); }
  }, 3, 1);
}

export function districtName(x, z) {
  if (z > 226) return 'Palmera Pier';
  if (z > 170) return 'Marina Mile';
  if (x < -160 && z < -60) return 'Old Town';
  if (x > 160 && z > 40) return 'Storage District';
  if (x > 140 && z < -120) return 'Coral Heights';
  if (z < -160) return 'North Palmera';
  return 'Downtown Palmera';
}

export function buildWorld(scene, rng) {
  const colliders = [];
  const animated = [];
  const addCollider = (x, z, w, d) => colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });

  // --- sky, fog, lights -------------------------------------------------
  const skyTex = canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#35669c'); gr.addColorStop(0.34, '#7fa8c9');
    gr.addColorStop(0.5, '#f7b267'); gr.addColorStop(0.58, '#f4845f'); gr.addColorStop(0.72, '#6b4a68'); gr.addColorStop(1, '#463a5c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(760, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }));
  sunDisc.position.set(-470, 105, 520); sunDisc.lookAt(0, 30, 0); scene.add(sunDisc);
  scene.fog = new THREE.Fog(0xe9a06b, 190, 720);
  scene.add(new THREE.HemisphereLight(0xbcd7ff, 0x8a6a4f, 0.85));
  const sun = new THREE.DirectionalLight(0xffb36b, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -130; sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 700; sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  // --- ground: city slab, parks, beach, ocean ---------------------------
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(640, 580), M(0x9c8d7a));
  slab.rotation.x = -Math.PI / 2; slab.position.set(0, -0.05, -24); slab.receiveShadow = true; scene.add(slab);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(640, 44), M(0xe6c98f));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.0, 240); sand.receiveShadow = true; scene.add(sand);
  const waterMat = M(0x1d6f77, { roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1500, 700), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.35, 610); scene.add(water);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(640, 3), M(0xfdf6e3, { transparent: true, opacity: 0.75 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.42, 261); scene.add(foam);
  animated.push((t) => { foam.position.z = 261 + Math.sin(t * 0.7) * 1.6; water.position.y = 0.35 + Math.sin(t * 0.5) * 0.08; });

  // --- roads, sidewalks, crosswalks --------------------------------------
  const roadTex = roadTexture(), crossTex = crosswalkTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
  const crossMat = new THREE.MeshStandardMaterial({ map: crossTex, roughness: 0.95 });
  const walkMat = M(0xbfae97);
  function road(x, z, w, l, vertical) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
    m.rotation.x = -Math.PI / 2; if (!vertical) m.rotation.z = Math.PI / 2;
    m.position.set(x, 0.02, z); m.receiveShadow = true; scene.add(m);
    for (const s of [-1, 1]) { // sidewalks
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(3.4, l), walkMat);
      sw.rotation.x = -Math.PI / 2; if (!vertical) sw.rotation.z = Math.PI / 2;
      sw.position.set(vertical ? x + s * (w / 2 + 1.7) : x, 0.035, vertical ? z : z + s * (w / 2 + 1.7));
      sw.receiveShadow = true; scene.add(sw);
    }
  }
  for (const x of AVENUES) road(x, -37, 20, 526, true);
  for (const z of STREETS) road(0, z, 18, 620, false);
  road(0, BEACHFRONT_Z, 18, 620, false);
  for (const x of AVENUES) for (const z of [...STREETS, BEACHFRONT_Z]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(21, 21), crossMat);
    c.rotation.x = -Math.PI / 2; c.position.set(x, 0.045, z); c.receiveShadow = true; scene.add(c);
  }

  // --- parks ---------------------------------------------------------------
  function park(cx, cz, w, d) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(0x5e9e52));
    g.rotation.x = -Math.PI / 2; g.position.set(cx, 0.03, cz); g.receiveShadow = true; scene.add(g);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(w, 3), M(0xd8c9a3));
    path.rotation.x = -Math.PI / 2; path.position.set(cx, 0.05, cz); scene.add(path);
    const path2 = new THREE.Mesh(new THREE.PlaneGeometry(3, d), M(0xd8c9a3));
    path2.rotation.x = -Math.PI / 2; path2.position.set(cx, 0.05, cz); scene.add(path2);
  }
  park(-180, 156, 84, 84); park(180, -180, 84, 84);

  // --- shared prop builders -------------------------------------------------
  const trunkMat = M(0x7a5b3a), leafMat = M(0x3f9142), poleMat = M(0x3c4148);
  function palm(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s; trunk.rotation.z = range(rng, -0.08, 0.08); trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(4.6 * s, 0.08, 0.7 * s), leafMat);
      const a = (i / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 1.9 * s, 7.1 * s, Math.sin(a) * 1.9 * s);
      f.rotation.y = -a; f.rotation.z = Math.cos(a) * -0.5; f.rotation.x = Math.sin(a) * 0.5;
      f.castShadow = true; g.add(f);
    }
    g.position.set(x, 0, z); scene.add(g);
  }
  function streetlight(x, z, rotY) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
    pole.position.y = 3; g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), poleMat);
    arm.position.set(0.8, 5.9, 0); g.add(arm);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe6a3, emissive: 0xffc46b, emissiveIntensity: 1.6 }));
    lamp.position.set(1.6, 5.8, 0); g.add(lamp);
    g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  }
  function bench(x, z, rotY) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), M(0x8a6844));
    seat.position.y = 0.55; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.1), M(0x8a6844));
    back.position.set(0, 0.95, -0.26); g.add(back);
    for (const s of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.55), poleMat);
      leg.position.set(s, 0.27, 0); g.add(leg);
    }
    g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  }
  function planter(x, z) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6), M(0xa34d3a));
    box.position.set(x, 0.35, z); box.castShadow = true; scene.add(box);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 6), M(0x4c9448));
    bush.position.set(x, 1.05, z); bush.castShadow = true; scene.add(bush);
    addCollider(x, z, 1.6, 1.6);
  }
  function dumpster(x, z, rotY) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 1.3), M(0x39543e));
    body.position.y = 0.65; body.castShadow = true; g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.3), M(0x2c4231));
    lid.position.y = 1.35; g.add(lid);
    g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g); addCollider(x, z, 2.4, 1.4);
  }
  function umbrella(x, z, color) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), poleMat);
    pole.position.set(x, 1.2, z); scene.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.9, 0.7, 8), M(color));
    top.position.set(x, 2.5, z); top.castShadow = true; scene.add(top);
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.7), M(pick(rng, [0xe4572e, 0x2e86e4, 0xf2d13c, 0xffffff])));
    towel.position.set(x + range(rng, -2, 2), 0.06, z + range(rng, 1, 2.4)); towel.rotation.y = range(rng, 0, 3); scene.add(towel);
  }

  // --- buildings -------------------------------------------------------------
  const palette = ['#e8dcc8', '#d96f4e', '#7fb3c8', '#e4b04a', '#c85b6e', '#8fc1a0', '#ddd3bd', '#b07cc6', '#5f8fca', '#e07b39'];
  const signs = [
    ['HOTEL SOL', '#123a5c', '#ffd166'], ['BANCO AZUL', '#0d2b45', '#9fd8ff'],
    ['MERCADO', '#7a2d12', '#ffe8a3'], ['CLÍNICA DEL SOL', '#f4f4f4', '#d33a2c'],
    ['CAFÉ PALMERA', '#3a2410', '#f7d08a'], ['CINE MAR', '#241433', '#ff9ff3'],
    ['GYM SOLANO', '#1c1c22', '#7CFC98'], ['LIBROS MAR', '#402020', '#ffe9b0'],
  ];
  let signIdx = 0;
  function building(x, z, w, d, floors, base, opts = {}) {
    const h = floors * 3.1;
    const tex = buildingTexture(rng, base, floors, Math.max(3, Math.round(w / 4)), opts.lit ?? 0.34);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 0.6, d + 0.7), M(0x6e6257));
    par.position.set(x, h + 0.3, z); par.castShadow = true; scene.add(par);
    if (rng() < 0.55) { // rooftop water tank
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.4, 10), M(0x8a6a48));
      tank.position.set(x + range(rng, -w / 4, w / 4), h + 2.3, z + range(rng, -d / 4, d / 4));
      tank.castShadow = true; scene.add(tank);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 10), M(0x5f4630));
      cone.position.copy(tank.position); cone.position.y = h + 4.55; scene.add(cone);
    } else if (rng() < 0.7) { // AC units
      for (let i = 0; i < 3; i++) {
        const ac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.6), M(0xb9bec4));
        ac.position.set(x + range(rng, -w / 3, w / 3), h + 1.05, z + range(rng, -d / 3, d / 3));
        ac.castShadow = true; scene.add(ac);
      }
    }
    if (opts.sign) { // storefront: striped awning + named sign board
      const [txt, bg, fg] = opts.sign;
      const sTex = signTexture(txt, bg, fg);
      const board = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.8, 13), 1.7, 0.4),
        new THREE.MeshStandardMaterial({ map: sTex, roughness: 0.6 }));
      board.position.set(x, 4.6, z + (opts.face ?? 1) * (d / 2 + 0.25));
      if ((opts.face ?? 1) < 0) board.rotation.y = Math.PI;
      scene.add(board);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.85, 14), 0.12, 2.4),
        new THREE.MeshStandardMaterial({ map: awningTexture('#c0392b', '#f4f1e6'), roughness: 0.8 }));
      awn.position.set(x, 3.4, z + (opts.face ?? 1) * (d / 2 + 1.1));
      awn.rotation.x = (opts.face ?? 1) * 0.35; awn.castShadow = true; scene.add(awn);
    }
    addCollider(x, z, w, d);
    return b;
  }

  // Fill each city block with buildings (avenue/street gaps define blocks).
  const xGaps = [[-296, -252], [-228, -132], [-108, -12], [12, 108], [132, 228], [252, 296]];
  const zGaps = [[-296, -252], [-228, -132], [-108, -12], [12, 108], [132, 194]];
  let built = 0;
  for (const [x0, x1] of xGaps) for (const [z0, z1] of zGaps) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if ((cx < -130 && cz > -110 && cz < -10) || (cx > 130 && cz < -130)) continue; // parks
    if (cx < -130 && cz > 130) continue;                                          // south park
    if (cx > 130 && cz > 40 && cz < 110) continue;                                // storage lot
    const bw = x1 - x0, bd = z1 - z0;
    const split = rng() < 0.5 ? 2 : 1;
    for (let i = 0; i < split; i++) {
      const w = split === 2 ? bw / 2 - 7 : bw - 10;
      const bx = split === 2 ? x0 + bw / 4 + i * (bw / 2) + (i ? 2 : -2) : cx;
      const floors = Math.floor(range(rng, 3, cx > 100 || cx < -100 ? 9 : 13));
      const sign = built % 5 === 0 ? signs[signIdx++ % signs.length] : null;
      building(bx, cz + range(rng, -3, 3), w, bd - 12, floors, pick(rng, palette),
        { sign, face: cz < 190 ? 1 : -1, lit: range(rng, 0.2, 0.5) });
      built++;
    }
  }
  // Clínica del Sol — white, red-cross sign, west side.
  building(CLINIC.x, CLINIC.z, 34, 26, 4, '#f2f0ea', { sign: ['CLÍNICA DEL SOL', '#f4f4f4', '#d33a2c'], face: 1, lit: 0.55 });
  // Solano Storage — long low warehouse with a big sign and a yard.
  {
    const tex = buildingTexture(rng, '#7d6a55', 2, 12, 0.12);
    const wh = new THREE.Mesh(new THREE.BoxGeometry(56, 9, 30), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    wh.position.set(STORAGE.x, 4.5, STORAGE.z - 26); wh.castShadow = true; wh.receiveShadow = true; scene.add(wh);
    const board = new THREE.Mesh(new THREE.BoxGeometry(24, 3, 0.5),
      new THREE.MeshStandardMaterial({ map: signTexture('SOLANO STORAGE', '#2b2b30', '#ffd166'), roughness: 0.6 }));
    board.position.set(STORAGE.x, 10.6, STORAGE.z - 26); scene.add(board);
    addCollider(STORAGE.x, STORAGE.z - 26, 56, 30);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(64, 44), M(0x8d8272));
    yard.rotation.x = -Math.PI / 2; yard.position.set(STORAGE.x, 0.03, STORAGE.z + 8); yard.receiveShadow = true; scene.add(yard);
  }

  // --- pier, docks, boats, buoys ----------------------------------------------
  const woodMat = M(0x9a7648);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(16, 1, PIER.z1 - PIER.z0), woodMat);
  pier.position.set(PIER.x, 0.6, (PIER.z0 + PIER.z1) / 2); pier.receiveShadow = true; scene.add(pier);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const dock = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 4), woodMat);
    dock.position.set(s * 20, 0.55, 282 + i * 26); scene.add(dock);
  }
  const boats = [];
  function sailboat(x, z, rotY, hullColor) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 7), M(hullColor));
    hull.position.y = 0.6; hull.castShadow = true; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 4), M(hullColor));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.6, 4.4); g.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 6), poleMat);
    mast.position.y = 4.6; g.add(mast);
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 6.4), new THREE.Vector2(2.8, 0.6)]);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.7 }));
    sail.position.set(0.1, 1.6, 0.4); g.add(sail);
    const jib = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(
      [new THREE.Vector2(0, 0), new THREE.Vector2(0, 5.4), new THREE.Vector2(-2.1, 0.5)])),
      new THREE.MeshStandardMaterial({ color: 0xffe3ec, side: THREE.DoubleSide, roughness: 0.7 }));
    jib.position.set(-0.1, 1.6, 0.4); g.add(jib);
    g.position.set(x, 0.3, z); g.rotation.y = rotY; scene.add(g);
    boats.push({ g, phase: rng() * 6 });
    return g;
  }
  sailboat(-24, 284, 0.2, 0xe4572e); sailboat(24, 292, -0.15, 0x2e86e4);
  sailboat(-25, 316, 0.1, 0xf2f0ea); sailboat(25, 330, -0.3, 0x27ae60);
  sailboat(-8, 348, 0.5, 0xf2d13c); sailboat(30, 268, 0, 0xc85b6e); sailboat(-30, 262, 0.9, 0x7fb3c8);
  function buoy(x, z) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.1, 8), M(0xd33a2c));
    b.position.y = 0.4; g.add(b);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5a4d, emissive: 0xff2a1d, emissiveIntensity: 1.2 }));
    tip.position.y = 1.2; g.add(tip);
    g.position.set(x, 0.3, z); scene.add(g); boats.push({ g, phase: rng() * 6 });
  }
  buoy(14, 300); buoy(-42, 330); buoy(48, 356);
  animated.push((t) => { for (const b of boats) { b.g.position.y = 0.3 + Math.sin(t * 0.9 + b.phase) * 0.16; b.g.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03; } });

  // --- scatter props -------------------------------------------------------------
  for (const x of AVENUES) for (const z of [...STREETS, BEACHFRONT_Z]) {
    streetlight(x + 13, z + 13, Math.PI / 4); streetlight(x - 13, z - 13, -Math.PI * 0.75);
  }
  for (let x = -290; x <= 290; x += 24) { palm(x + range(rng, -3, 3), 224 + range(rng, 0, 4)); }
  for (let i = 0; i < 26; i++) { // palms around parks & avenues
    const x = pick(rng, AVENUES) + pick(rng, [-16, 16]);
    palm(x, range(rng, -280, 190), range(rng, 0.85, 1.15));
  }
  for (let i = 0; i < 9; i++) umbrella(range(rng, -280, 280), range(rng, 232, 252), pick(rng, [0xe4572e, 0x2e86e4, 0xf2d13c, 0x27ae60]));
  bench(-176, -56, 0); bench(-184, -64, Math.PI); bench(176, -176, 0.4); bench(30, 216, Math.PI); bench(-40, 216, Math.PI);
  for (let i = 0; i < 14; i++) planter(pick(rng, AVENUES) + pick(rng, [-14, 14]), range(rng, -260, 195));
  dumpster(196, 128, 0.3); dumpster(-96, -16, 1.2); dumpster(252, -60, -0.4);
  // crates & barrels in the storage yard
  const crateMat = M(0xa9825a);
  for (let i = 0; i < 10; i++) {
    const cx = STORAGE.x + range(rng, -26, 26), cz = STORAGE.z + range(rng, -4, 22);
    const c = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), crateMat);
    c.position.set(cx, 1, cz); c.rotation.y = rng(); c.castShadow = true; scene.add(c); addCollider(cx, cz, 2, 2);
    if (rng() < 0.5) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.7, 10), M(0x38618c));
      bar.position.set(cx + 1.8, 0.85, cz + 0.6); bar.castShadow = true; scene.add(bar); addCollider(cx + 1.8, cz + 0.6, 1.3, 1.3);
    }
  }
  return { colliders, sun, sky, update(t) { for (const f of animated) f(t); } };
}

// Push a point (with radius r) out of every collider AABB; returns corrected [x,z].
export function collide(colliders, x, z, r) {
  for (const c of colliders) {
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
      const dxl = x - (c.minX - r), dxr = (c.maxX + r) - x, dzl = z - (c.minZ - r), dzr = (c.maxZ + r) - z;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) x = c.minX - r; else if (m === dxr) x = c.maxX + r;
      else if (m === dzl) z = c.minZ - r; else z = c.maxZ + r;
    }
  }
  return [x, z];
}
