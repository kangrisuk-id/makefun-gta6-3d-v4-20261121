// Palmera Bay: Vice Run 3D — game state, input, cameras, driving, combat,
// the 5-mission Marisol Vega story chain, HUD + minimap, and the staged
// screenshot scenes (?shot=title|onfoot|chase|mission&seed=1).
import * as THREE from 'three';
import { buildWorld, collide, districtName, AVENUES, STREETS, BEACHFRONT_Z, STORAGE, CLINIC, PIER } from './world.js';
import { makeCar, makePerson, animatePerson, Traffic, Police, Crowd, CAR_COLORS } from './actors.js';
import { makeRng, pick, range } from './rng.js';
import { Sound } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const seed = Number(params.get('seed') || 1);
const rng = makeRng(seed * 7919 + 13);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.className = 'webgl';
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 1600);
const world = buildWorld(scene, rng);
world.sun.position.set(-140, 130, 170); // sensible default; follows the player in play
const colliders = world.colliders;
const sound = new Sound();

const traffic = new Traffic(scene, rng, colliders, 14);
const police = new Police(scene, colliders);
const crowd = new Crowd(scene, rng, colliders, 26);

// --- player ----------------------------------------------------------------
const player = makePerson(rng, { shirt: 0xff5a3c, hat: 0x14181f });
player.position.set(6, 0, 196);
scene.add(player);
let walkPhase = 0;

// parked cars + the coral coupe
const parked = [];
function parkCar(x, z, yaw, color) {
  const mesh = makeCar(color); mesh.position.set(x, 0, z); mesh.rotation.y = yaw;
  scene.add(mesh);
  const entry = { mesh, kind: 'parked', speed: 0 };
  parked.push(entry); return entry;
}
parkCar(-148, 196, Math.PI / 2, 0x2e86e4); parkCar(88, 220, -Math.PI / 2, 0xf2d13c);
parkCar(-36, -132, 0, 0x27ae60); parkCar(150, 12, Math.PI, 0x8e44ad); parkCar(-252, 60, 0.3, 0xe8e4da);
const coupe = (() => {
  const mesh = makeCar(0xff6f61); mesh.position.set(-72, 0, 197); mesh.rotation.y = Math.PI / 2;
  scene.add(mesh); return { mesh, kind: 'coupe', speed: 0 };
})();

// --- state -------------------------------------------------------------------
const S = {
  mode: SHOT === 'title' ? 'title' : 'title', started: false, paused: false,
  cash: 250, health: 100, respect: 0, wanted: 0, heat: 0, seen: 0,
  ammo: 12, reloading: 0, mission: 0, pkg: 0, sideJob: null,
  inCar: null, carSpeed: 0, bustedT: 0, dead: false, storyDone: false,
  time: 0, camYaw: Math.PI, camPitch: 0.32, saveT: 0,
};
if (SHOT) S.mode = 'shot';
const $ = (id) => document.getElementById(id);
const els = { cash: $('cash'), respect: $('respect'), health: $('healthFill'), mode: $('mode'), stars: $('stars'),
  district: $('district'), pursuit: $('pursuit'), objT: $('objTitle'), objX: $('objText'), phone: $('phone'),
  phoneMsg: $('phoneMsg'), ammo: $('ammo'), speed: $('speed'), prompt: $('prompt'), center: $('centerMsg'), title: $('title') };

function phone(msg, sticky = false) {
  els.phoneMsg.textContent = msg; els.phone.style.opacity = 1;
  clearTimeout(phone._t);
  if (!sticky) phone._t = setTimeout(() => els.phone.style.opacity = 0, 6500);
}
function objective(title, text) { els.objT.textContent = title; els.objX.textContent = text; }
function commitCrime(level) {
  if (level > S.wanted) { S.wanted = Math.min(5, level); }
  S.heat = 0; S.seen = 0;
  police.setLevel(S.wanted, playerPos());
}
function playerPos() { return S.inCar ? S.inCar.mesh.position : player.position; }
function save() {
  try { localStorage.setItem('palmera-vice-run', JSON.stringify({ cash: S.cash, mission: S.mission, respect: S.respect, storyDone: S.storyDone })); } catch (e) {}
}
function loadSave() {
  try { const d = JSON.parse(localStorage.getItem('palmera-vice-run')); if (d) { S.cash = d.cash; S.mission = d.mission; S.respect = d.respect; S.storyDone = !!d.storyDone; return true; } } catch (e) {}
  return false;
}

// --- missions ------------------------------------------------------------------
const PACKAGES = [[-133, 13], [133, -107], [-107, -229], [61, 128]];
let marker = null; // {x, z, kind}
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 70, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
beacon.visible = false; scene.add(beacon);
const beaconLight = new THREE.PointLight(0xffd166, 30, 30); beaconLight.visible = false; scene.add(beaconLight);
function setMarker(x, z, kind = 'mission') {
  marker = { x, z, kind };
  beacon.visible = beaconLight.visible = true;
  beacon.position.set(x, 35, z); beaconLight.position.set(x, 4, z);
}
function clearMarker() { marker = null; beacon.visible = beaconLight.visible = false; }

const pkgMeshes = PACKAGES.map(([x, z]) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x7CFC98, emissive: 0x2fae4e, emissiveIntensity: 1.4 }));
  m.position.set(x, 0.8, z); m.visible = false; scene.add(m); return m;
});

// finale crew
const crew = [];
function spawnCrew() {
  const spots = [[STORAGE.x - 8, STORAGE.z + 8], [STORAGE.x + 6, STORAGE.z + 16], [STORAGE.x + 14, STORAGE.z + 4], [STORAGE.x - 2, STORAGE.z + 26]];
  for (const [x, z] of spots) {
    const mesh = makePerson(rng, { shirt: 0x22242c, hat: 0x8c1f28 });
    mesh.position.set(x, 0, z); mesh.rotation.y = Math.PI;
    scene.add(mesh);
    crew.push({ mesh, hp: 30, shootT: range(rng, 0.5, 1.6), dead: false });
  }
}

const MISSIONS = [
  { // 1 First Light
    start() { setMarker(PIER.x, 316, 'meet'); objective('1 · FIRST LIGHT', 'Meet Marisol Vega at the end of the pier'); phone('Rio. Pier. Now. One last chain of jobs and you are out of this life. — M'); },
    tick() { if (near(PIER.x, 316, 6)) { S.cash += 150; sound.cash(); phone('Good. A coral coupe is parked on Marina Mile. Steal it. Deliver it to Solano Storage. — M'); advance(); } },
  },
  { // 2 Coral Coupe
    start() { setMarker(coupe.mesh.position.x, coupe.mesh.position.z, 'coupe'); objective('2 · CORAL COUPE', 'Steal the coral coupe on Marina Mile'); },
    tick() {
      if (S.inCar === coupe) {
        if (marker?.kind === 'coupe') { setMarker(STORAGE.x, STORAGE.z + 8, 'deliver'); objective('2 · CORAL COUPE', 'Deliver the coupe to Solano Storage'); commitCrime(2); phone('That alarm is LOUD, Rio. Move! — M'); }
        else if (near(STORAGE.x, STORAGE.z + 8, 9)) {
          S.cash += 600; S.wanted = 0; police.setLevel(0, playerPos()); sound.cash();
          phone('Plates are clean. Now — four packs got scattered over the bay. Fetch them. — M'); advance();
        }
      }
    },
  },
  { // 3 Scattered Packs
    start() { S.pkg = 0; showPackage(); objective('3 · SCATTERED PACKS', 'Collect the packages (0/4)'); },
    tick() {
      const [x, z] = PACKAGES[S.pkg];
      if (near(x, z, 4.2)) {
        pkgMeshes[S.pkg].visible = false; S.pkg++; S.cash += 200; sound.cash(); S.respect++;
        if (S.pkg >= 4) { phone('Wait. Rio — the packs were bait. EVERY badge in the bay is coming. LOSE THEM. — M'); advance(); }
        else { showPackage(); objective('3 · SCATTERED PACKS', `Collect the packages (${S.pkg}/4)`); }
      }
    },
  },
  { // 4 Lose the Heat
    start() { commitCrime(4); objective('4 · LOSE THE HEAT', 'Escape the police — break line of sight until the stars are gone'); },
    tick() { if (S.wanted === 0) { S.cash += 800; sound.cash(); phone('You beautiful ghost. Last run: my crew at the storage yard went rogue. Clear them out, then bring yourself to the pier. — M'); advance(); } },
  },
  { // 5 Last Run on the Bay
    start() { setMarker(STORAGE.x, STORAGE.z + 10, 'yard'); objective('5 · LAST RUN ON THE BAY', 'Go to the Solano Storage yard'); this.stage = 0; },
    tick() {
      if (this.stage === 0 && near(STORAGE.x, STORAGE.z + 10, 10)) {
        this.stage = 1; clearMarker(); spawnCrew();
        objective('5 · LAST RUN ON THE BAY', 'Clear out the rogue crew!');
        phone('They are armed, Rio. End it. — M');
      } else if (this.stage === 1 && crew.length && crew.every(c => c.dead)) {
        this.stage = 2; setMarker(PIER.x, 316, 'meet');
        objective('5 · LAST RUN ON THE BAY', 'Get to the pier — your boat is waiting');
      } else if (this.stage === 2 && near(PIER.x, 316, 7)) {
        S.cash += 5000; S.respect += 5; S.storyDone = true; sound.cash();
        phone('It is done. The bay is yours now, Rio. Free as the tide. — M');
        objective('FREE ROAM', 'Palmera Bay is yours. Gold markers pay $300 per delivery.');
        clearMarker(); this.stage = 3; spawnSideJob(); save();
      }
    },
  },
];
function showPackage() { pkgMeshes.forEach((m, i) => m.visible = i === S.pkg); const [x, z] = PACKAGES[S.pkg]; setMarker(x, z, 'package'); }
function advance() { S.mission++; if (S.mission < MISSIONS.length) { MISSIONS[S.mission].start(); } save(); }
function spawnSideJob() {
  const spots = [[-240, -120], [120, 120], [-120, 0], [240, -240], [0, 208], [-240, 120], [180, -60]];
  const [x, z] = pick(rng, spots); S.sideJob = { x, z }; setMarker(x, z, 'side');
}
function near(x, z, d) { const p = playerPos(); return Math.hypot(p.x - x, p.z - z) < d; }

// --- combat ----------------------------------------------------------------------
const tracers = [];
function tracer(from, to, color = 0xffe9a0, life = 0.09) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  scene.add(line); tracers.push({ line, life });
}
const drops = [];
function cashDrop(x, z, amt) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x2fae4e, emissive: 0x1d7a34, emissiveIntensity: 0.8 }));
  m.position.set(x, 0.5, z); scene.add(m); drops.push({ mesh: m, amt });
}
const muzzle = new THREE.PointLight(0xffc46b, 0, 12); scene.add(muzzle);
function shoot() {
  if (S.inCar || S.reloading > 0) return;
  if (S.ammo <= 0) { sound.blip(220, 0.05, 0.06); return; }
  S.ammo--; sound.shot(false);
  const dir = new THREE.Vector3(-Math.sin(S.camYaw), 0, -Math.cos(S.camYaw));
  const from = player.position.clone(); from.y = 1.45;
  muzzle.position.copy(from).addScaledVector(dir, 0.6); muzzle.intensity = 26;
  let best = null, bestD = 70;
  for (const c of crew) {
    if (c.dead) continue;
    const to = c.mesh.position.clone(); to.y = 1.2;
    const d = to.clone().sub(from);
    const dist = d.length();
    if (dist < bestD && d.normalize().dot(dir) > 0.86) { best = c; bestD = dist; }
  }
  const end = best ? best.mesh.position.clone().setY(1.2) : from.clone().addScaledVector(dir, 70).setY(1.2);
  tracer(from, end, 0xffe9a0);
  crowd.scare(player.position.x, player.position.z, 18);
  commitCrime(Math.max(S.wanted, 2));
  if (best) {
    best.hp -= 34;
    if (best.hp <= 0 && !best.dead) {
      best.dead = true; best.mesh.rotation.x = -Math.PI / 2; best.mesh.position.y = 0.25;
      cashDrop(best.mesh.position.x, best.mesh.position.z, 120); sound.blip(520, 0.12, 0.1);
    }
  }
  updateAmmo();
}
function updateAmmo() { els.ammo.textContent = `${S.ammo} / ∞`; }

// --- input -------------------------------------------------------------------------
const keys = {};
let mouseDown = false, shootCd = 0;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') { sound.init(); els.mode.textContent = sound.toggleMute() ? 'MUTED' : (S.inCar ? 'DRIVING' : 'ON FOOT'); }
  if ((e.code === 'Escape' || e.code === 'KeyP') && S.started && !SHOT) S.paused = !S.paused;
  if (e.code === 'KeyR' && S.ammo < 12 && S.reloading <= 0) { S.reloading = 0.9; }
  if (e.code === 'KeyE' || e.code === 'KeyF') S.eQueued = true; // consumed by the sim, so taps survive low fps
  if (e.code === 'KeyN' && !S.started) startGame(false);
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys[e.code] = false);
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === renderer.domElement) {
    S.camYaw -= e.movementX * 0.0032;
    S.camPitch = THREE.MathUtils.clamp(S.camPitch + e.movementY * 0.0026, 0.04, 1.1);
  }
});
addEventListener('mousedown', (e) => {
  sound.init();
  if (S.started && !S.paused && !SHOT) {
    if (document.pointerLockElement !== renderer.domElement && e.target === renderer.domElement)
      renderer.domElement.requestPointerLock();
    mouseDown = true;
  }
});
addEventListener('mouseup', () => mouseDown = false);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
$('btnNew').addEventListener('click', () => startGame(false));
$('btnContinue').addEventListener('click', () => startGame(true));

function startGame(cont) {
  sound.init();
  if (cont) loadSave();
  S.started = true; S.mode = 'play'; els.title.classList.add('hidden');
  if (S.mission < MISSIONS.length) MISSIONS[S.mission].start();
  else { objective('FREE ROAM', 'Palmera Bay is yours. Gold markers pay $300 per delivery.'); spawnSideJob(); }
  if (!loadSave()) $('btnContinue').style.display = 'none';
}

// --- car interaction ------------------------------------------------------------------
function allDriveables() {
  const list = [...parked, coupe];
  for (const t of traffic.cars) if (!t.taken) list.push({ mesh: t.mesh, kind: 'traffic', ref: t });
  for (const u of police.units) list.push({ mesh: u.mesh, kind: 'police', ref: u });
  return list;
}
function tryEnterExit() {
  if (S.inCar) {
    const car = S.inCar;
    player.position.set(car.mesh.position.x + Math.cos(car.mesh.rotation.y) * 2.2, 0, car.mesh.position.z - Math.sin(car.mesh.rotation.y) * 2.2);
    player.visible = true; S.inCar = null; S.carSpeed = 0;
    sound.setEngine(false, 0);
    return;
  }
  let best = null, bd = 4;
  for (const c of allDriveables()) {
    const d = Math.hypot(c.mesh.position.x - player.position.x, c.mesh.position.z - player.position.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  S.inCar = best; player.visible = false;
  if (best.kind === 'traffic') { best.ref.taken = true; best.speed = 0; }
  if (best.kind === 'police') {
    police.units = police.units.filter(u => u !== best.ref);
    scene.attach(best.mesh);
    commitCrime(Math.max(S.wanted, 3)); S.respect++;
    phone('You just stole a POLICE car, Rio. Bold. — M');
  } else if (best.kind !== 'coupe' || S.mission !== 1) {
    if (best.kind === 'traffic' || best.kind === 'parked') { commitCrime(Math.max(S.wanted, 1)); S.respect++; }
  }
  if (best.kind === 'coupe' && S.mission === 1) { /* mission handles it */ }
  sound.blip(660, 0.07, 0.08);
}

// --- damage / respawn --------------------------------------------------------------------
function hurt(dmg) {
  if (S.dead) return;
  S.health -= dmg;
  if (S.health <= 0) { S.health = 0; die('WASTED'); }
}
function die(kind) {
  S.dead = true;
  els.center.textContent = kind; els.center.style.display = 'flex';
  els.center.style.color = kind === 'BUSTED' ? '#5aa2ff' : '#ff4747';
  setTimeout(() => {
    els.center.style.display = 'none'; S.dead = false;
    S.cash = Math.max(0, S.cash - 100); S.health = 100; S.wanted = 0;
    police.setLevel(0, playerPos());
    if (S.inCar) { player.visible = true; S.inCar = null; }
    player.position.set(CLINIC.x + 6, 0, CLINIC.z + 16);
    phone(kind === 'BUSTED' ? 'The clinic patched you up. And emptied your pockets. — M' : 'Lucky to be alive, Rio. The clinic bill was $100. — M');
  }, 2200);
}

// --- minimap ------------------------------------------------------------------------------
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 172, sc = W / 660;
  const px = (x) => (x + 330) * sc, pz = (z) => (z + 330) * sc;
  mm.fillStyle = '#17323e'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#1d6f77'; mm.fillRect(0, pz(258), W, W - pz(258));
  mm.fillStyle = '#e6c98f'; mm.fillRect(0, pz(226), W, pz(258) - pz(226));
  mm.strokeStyle = '#4a4d55'; mm.lineWidth = 3;
  for (const x of AVENUES) { mm.beginPath(); mm.moveTo(px(x), 0); mm.lineTo(px(x), pz(226)); mm.stroke(); }
  for (const z of [...STREETS, BEACHFRONT_Z]) { mm.beginPath(); mm.moveTo(0, pz(z)); mm.lineTo(W, pz(z)); mm.stroke(); }
  const dot = (x, z, c, r = 3) => { mm.fillStyle = c; mm.beginPath(); mm.arc(px(x), pz(z), r, 0, 7); mm.fill(); };
  for (const u of police.units) dot(u.mesh.position.x, u.mesh.position.z, '#ff4747');
  if (S.mission === 1) dot(coupe.mesh.position.x, coupe.mesh.position.z, '#ff6f61', 3.5);
  if (marker) { const p = 3 + Math.sin(S.time * 5) * 1.2; dot(marker.x, marker.z, '#ffd166', p + 1.5); }
  const p = playerPos();
  mm.save(); mm.translate(px(p.x), pz(p.z));
  mm.rotate(S.inCar ? S.inCar.mesh.rotation.y : player.rotation.y);
  mm.fillStyle = '#ffffff'; mm.beginPath(); mm.moveTo(0, -5); mm.lineTo(3.4, 4); mm.lineTo(-3.4, 4); mm.closePath(); mm.fill();
  mm.restore();
  mm.fillStyle = 'rgba(255,255,255,.65)'; mm.font = '8px Arial'; mm.fillText('PALMERA BAY', 6, W - 5);
}

// --- HUD -------------------------------------------------------------------------------------
let lastHud = '';
function updateHud() {
  els.cash.textContent = '$' + S.cash.toLocaleString();
  els.respect.textContent = 'RESPECT ★ ' + S.respect;
  els.health.style.width = Math.max(0, S.health) + '%';
  els.mode.textContent = S.inCar ? 'IN CAR · ' + (S.inCar.kind === 'coupe' ? 'CORAL COUPE' : S.inCar.kind.toUpperCase()) : 'ON FOOT';
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= S.wanted ? '★' : '<span class="off">★</span>';
  els.stars.innerHTML = stars;
  const p = playerPos();
  els.district.textContent = districtName(p.x, p.z);
  els.pursuit.textContent = S.wanted > 0 ? 'POLICE IN PURSUIT' : '';
  els.speed.textContent = S.inCar ? Math.round(Math.abs(S.carSpeed) * 3.6) : 0;
  let prompt = '';
  if (SHOT) prompt = '';
  else if (!S.inCar && S.started) {
    for (const c of allDriveables()) {
      if (Math.hypot(c.mesh.position.x - player.position.x, c.mesh.position.z - player.position.z) < 4) {
        prompt = 'Press <b>E</b> to enter ' + (c.kind === 'coupe' ? 'the <b>CORAL COUPE</b>' : 'vehicle'); break;
      }
    }
  } else if (S.inCar) prompt = 'Press <b>E</b> to exit';
  if (prompt !== lastHud) { els.prompt.innerHTML = prompt; els.prompt.style.display = prompt ? 'block' : 'none'; lastHud = prompt; }
}

// --- staged screenshot scenes ------------------------------------------------------------------
let marisol = null;
function stageShot() {
  els.title.classList.toggle('hidden', SHOT !== 'title');
  document.querySelectorAll('.panel, #minimap').forEach(el => { if (SHOT === 'title') el.style.visibility = 'hidden'; });
  if (SHOT === 'title') {
    camera.position.set(30, 21, 358); camera.lookAt(-10, 8, 130);
    return;
  }
  S.started = true;
  if (SHOT === 'onfoot') {
    player.position.set(3, 1.1, 302); player.rotation.y = -0.4; // standing on the pier deck
    marisol = makePerson(rng, { shirt: 0xff7bac, hat: 0xf2d13c });
    marisol.position.set(-4, 1.1, 313); marisol.rotation.y = 2.75; scene.add(marisol);
    stageShot._peds = [];
    const spots = [[-5, 297, 1.1], [6, 307, 1.1], [-7, 319, 1.1], [5, 323, 1.1], [-12, 262, 0], [12, 258, 0], [-6.5, 288, 1.1]];
    for (const [a, b, y] of spots) { // people on the pier and at its entrance
      const m = makePerson(rng);
      m.position.set(a, y, b); m.rotation.y = range(rng, 0, 6.3); scene.add(m);
      stageShot._peds.push({ mesh: m, phase: rng() * 6 });
    }
    MISSIONS[0].start();
    phone('Rio. Pier. Now. One last chain of jobs and you are out of this life. — M', true);
    camera.position.set(10, 4.6, 330); camera.lookAt(-2, 2.2, 296);
  }
  if (SHOT === 'chase') {
    S.mission = 3; S.wanted = 4; S.cash = 3900;
    objective('4 · LOSE THE HEAT', 'Escape the police — break line of sight until the stars are gone');
    phone('It was a set-up, Rio! The packs were bait. Every badge in the bay is coming — LOSE THEM.', true);
    const cy = Math.PI / 2;
    coupe.mesh.position.set(6, 0, 212); coupe.mesh.rotation.y = cy; S.inCar = coupe; player.visible = false;
    const p1 = makeCar(0x1c1e24, { police: true }); p1.position.set(-6, 0, 205); p1.rotation.y = cy; scene.add(p1);
    const p2 = makeCar(0x1c1e24, { police: true }); p2.position.set(-6, 0, 219); p2.rotation.y = cy; scene.add(p2);
    police.units = [{ mesh: p1, speed: 0 }, { mesh: p2, speed: 0 }];
    const ahead = makeCar(0x2e86e4); ahead.position.set(34, 0, 219); ahead.rotation.y = cy; scene.add(ahead);
    stageShot._cops = [p1, p2]; stageShot._ahead = ahead;
    stageShot._peds = [];
    for (const [a, b] of [[2, 222.5], [14, 222.5], [24, 197]]) { // bystanders on the sidewalks
      const m = makePerson(rng); m.position.set(a, 0, b); m.rotation.y = -Math.PI / 2; scene.add(m);
      stageShot._peds.push({ mesh: m, phase: rng() * 6 });
    }
    S.carSpeed = 19.4; // HUD speedometer reads 70 km/h
    camera.position.set(-20, 4.5, 212); camera.lookAt(16, 1, 212);
  }
  if (SHOT === 'mission') {
    S.mission = 4; S.cash = 4650;
    player.position.set(184, 0, 120); player.rotation.y = -2.2;
    objective('5 · LAST RUN ON THE BAY', 'Clear out the rogue crew!');
    phone('They are armed, Rio. End it. — M', true);
    spawnCrew();
    for (const c of crew) c.shootT = 9999;
    const from = crew[0].mesh.position.clone().setY(1.35);
    const to = player.position.clone().setY(1.3); to.x += 1.2;
    tracer(from, to, 0xff7a5c, 999);
    camera.position.set(170, 5.2, 136); camera.lookAt(200, 3, 96);
  }
}

// --- main loop -------------------------------------------------------------------------------------
const clock = new THREE.Clock();
window.__frames = 0; window.__game = S;
window.__player = player; window.__coupe = coupe; // dev-console handles for smoke tests
function animate() {
  requestAnimationFrame(animate);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = (S.paused || S.dead) ? 0 : rawDt;
  S.time += dt;
  window.__frames++;
  world.update(S.time);
  beacon.rotation.y += dt * 1.4;
  beacon.material.opacity = 0.17 + Math.sin(S.time * 3) * 0.05;
  for (const m of pkgMeshes) if (m.visible) { m.rotation.y += dt * 2; m.position.y = 0.8 + Math.sin(S.time * 3) * 0.15; }
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= rawDt;
    if (tracers[i].life <= 0) { scene.remove(tracers[i].line); tracers.splice(i, 1); }
  }
  muzzle.intensity = Math.max(0, muzzle.intensity - rawDt * 300);

  if (SHOT) { // staged scenes: living world, scripted camera
    traffic.update(dt); crowd.update(dt);
    if (SHOT === 'chase') {
      police.flash = (police.flash || 0) + dt * 9;
      const on = Math.sin(police.flash) > 0;
      for (const m of stageShot._cops) {
        m.userData.lightbar.red.material.emissiveIntensity = on ? 3 : 0.15;
        m.userData.lightbar.blue.material.emissiveIntensity = on ? 0.15 : 3;
        for (const w of m.userData.wheels) w.rotation.x += dt * 8;
      }
      for (const w of coupe.mesh.userData.wheels) w.rotation.x += dt * 8;
    }
    if (SHOT === 'onfoot' || SHOT === 'chase') {
      if (marisol) animatePerson(marisol, S.time * 1.2, 0.12);
      if (stageShot._peds) for (const p of stageShot._peds) animatePerson(p.mesh, S.time * 1.4 + p.phase, 0.15);
    }
    updateHud(); drawMinimap();
    renderer.render(scene, camera);
    window.__ready = true;
    return;
  }

  if (S.mode === 'title') { // slow marina orbit behind the title
    const t = S.time * 0.05;
    camera.position.set(Math.sin(t) * 30 + 10, 15 + Math.sin(S.time * 0.2) * 1.5, 348 - Math.cos(t) * 8);
    camera.lookAt(-6, 9, 140);
    traffic.update(dt); crowd.update(dt);
    renderer.render(scene, camera);
    window.__ready = true;
    return;
  }

  if (dt > 0 && S.started) {
    // ---- on foot
    if (!S.inCar) {
      let mx = 0, mz = 0;
      if (keys.KeyW || keys.ArrowUp) mz += 1; if (keys.KeyS || keys.ArrowDown) mz -= 1;
      if (keys.KeyA) mx -= 1; if (keys.KeyD) mx += 1;
      const sprint = keys.ShiftLeft || keys.ShiftRight;
      const sp = sprint ? 8.6 : 5;
      if (mx || mz) {
        const len = Math.hypot(mx, mz); mx /= len; mz /= len;
        const sin = Math.sin(S.camYaw), cos = Math.cos(S.camYaw);
        const wx = (mx * cos - mz * sin), wz = (-mz * cos - mx * sin);
        let nx = player.position.x + wx * sp * dt;
        let nz = player.position.z + wz * sp * dt;
        [nx, nz] = collide(colliders, nx, nz, 0.6);
        player.position.x = THREE.MathUtils.clamp(nx, -308, 308);
        player.position.z = THREE.MathUtils.clamp(nz, -308, 366);
        player.rotation.y = Math.atan2(wx, wz);
        walkPhase += dt * sp * 2.1;
        animatePerson(player, walkPhase, sprint ? 1.25 : 1);
      }
      if (S.eQueued) { S.eQueued = false; tryEnterExit(); }
      if (mouseDown && shootCd <= 0) { shoot(); shootCd = 0.28; }
      // busted check
      if (S.wanted > 0) {
        let copNear = false;
        for (const u of police.units) if (Math.hypot(u.mesh.position.x - player.position.x, u.mesh.position.z - player.position.z) < 3.4) copNear = true;
        S.bustedT = copNear ? S.bustedT + dt : 0;
        if (S.bustedT > 2.2) { S.bustedT = 0; die('BUSTED'); }
      }
    } else {
      // ---- driving
      const car = S.inCar;
      const accel = (keys.KeyW || keys.ArrowUp) ? 15 : 0;
      const brake = (keys.KeyS || keys.ArrowDown) ? (S.carSpeed > 0.5 ? -22 : -8) : 0;
      S.carSpeed += (accel + brake) * dt;
      S.carSpeed -= S.carSpeed * 0.55 * dt;
      S.carSpeed = THREE.MathUtils.clamp(S.carSpeed, -11, 34);
      const steer = ((keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0)) * 0.62;
      car.mesh.rotation.y += steer * dt * (S.carSpeed / 9) * (S.carSpeed < 0 ? -1 : 1) * 1.6;
      let nx = car.mesh.position.x + Math.sin(car.mesh.rotation.y) * S.carSpeed * dt;
      let nz = car.mesh.position.z + Math.cos(car.mesh.rotation.y) * S.carSpeed * dt;
      const before = [car.mesh.position.x, car.mesh.position.z];
      [nx, nz] = collide(colliders, nx, nz, 1.7);
      if (Math.hypot(nx - before[0], nz - before[1]) < Math.abs(S.carSpeed) * dt * 0.35 && Math.abs(S.carSpeed) > 6) S.carSpeed *= 0.4;
      car.mesh.position.x = THREE.MathUtils.clamp(nx, -306, 306);
      car.mesh.position.z = THREE.MathUtils.clamp(nz, -306, 250);
      for (const w of car.mesh.userData.wheels) w.rotation.x += S.carSpeed * dt / 0.36;
      car.mesh.userData.brakeMat.emissiveIntensity = brake ? 2.6 : 0.4;
      player.position.copy(car.mesh.position);
      if (Math.abs(S.carSpeed) > 12) crowd.scare(car.mesh.position.x, car.mesh.position.z, 13);
      sound.setEngine(true, Math.abs(S.carSpeed) / 34);
      if (S.eQueued) {
        S.eQueued = false;
        if (Math.abs(S.carSpeed) < 2) tryEnterExit();
      }
    }
    shootCd -= dt;
    if (S.reloading > 0) { S.reloading -= dt; if (S.reloading <= 0) { S.ammo = 12; updateAmmo(); } }

    // ---- world sim
    traffic.update(dt); crowd.update(dt);
    const pp = playerPos();
    police.update(dt, S.wanted > 0 ? pp : null, S.wanted, S.time);
    sound.setSiren(S.wanted > 0 && police.units.length > 0, S.time);
    // wanted decay: unseen for a while → stars fade
    if (S.wanted > 0) {
      let seen = false;
      for (const u of police.units) if (Math.hypot(u.mesh.position.x - pp.x, u.mesh.position.z - pp.z) < 48) seen = true;
      if (seen) { S.heat = 0; } else {
        S.heat += dt;
        if (S.heat > 6) { S.heat = 0; S.wanted--; police.setLevel(S.wanted, pp); if (S.wanted === 0) phone('Heat is gone. Nice driving. — M'); }
      }
    }
    // crew combat
    for (const c of crew) {
      if (c.dead) continue;
      const d = Math.hypot(c.mesh.position.x - pp.x, c.mesh.position.z - pp.z);
      c.mesh.rotation.y = Math.atan2(pp.x - c.mesh.position.x, pp.z - c.mesh.position.z);
      c.shootT -= dt;
      if (d < 40 && c.shootT <= 0 && !S.inCar) {
        c.shootT = range(rng, 1.1, 1.9);
        sound.shot(true);
        const from = c.mesh.position.clone().setY(1.35);
        const to = player.position.clone().setY(range(rng, 0.7, 1.6));
        tracer(from, to, 0xff7a5c);
        if (rng() < 0.5) hurt(range(rng, 5, 11));
      }
    }
    // cash drops
    for (let i = drops.length - 1; i >= 0; i--) {
      const dr = drops[i];
      dr.mesh.rotation.y += dt * 3;
      if (Math.hypot(dr.mesh.position.x - pp.x, dr.mesh.position.z - pp.z) < 2.4) {
        S.cash += dr.amt; sound.cash(); scene.remove(dr.mesh); drops.splice(i, 1);
      }
    }
    // missions
    if (S.mission < MISSIONS.length) MISSIONS[S.mission].tick();
    else if (S.sideJob && near(S.sideJob.x, S.sideJob.z, 7)) {
      S.cash += 300; S.respect++; sound.cash(); phone('Delivery done. $300 wired. — M'); spawnSideJob();
    }
    // health regen + autosave
    if (S.health > 0 && S.health < 100) S.health = Math.min(100, S.health + dt * 1.6);
    S.saveT += dt; if (S.saveT > 5) { S.saveT = 0; save(); }

    // ---- camera (orbit follow)
    const target = S.inCar ? S.inCar.mesh.position : player.position;
    const dist = S.inCar ? 10.5 : 7.5, height = S.inCar ? 3.6 : 2.6;
    const cx = target.x - Math.sin(S.camYaw) * Math.cos(S.camPitch) * -dist * -1;
    const desired = new THREE.Vector3(
      target.x + Math.sin(S.camYaw) * dist * Math.cos(S.camPitch),
      target.y + height + Math.sin(S.camPitch) * dist * 0.55,
      target.z + Math.cos(S.camYaw) * dist * Math.cos(S.camPitch));
    camera.position.lerp(desired, 1 - Math.pow(0.0001, dt));
    camera.lookAt(target.x, target.y + 1.6, target.z);
    // sun shadow follows the player
    world.sun.position.set(target.x - 140, 130, target.z + 170);
    world.sun.target.position.set(target.x, 0, target.z);
  }
  updateHud(); drawMinimap();
  renderer.render(scene, camera);
  window.__ready = true;
}

if (SHOT) stageShot();
else if (!loadSave()) $('btnContinue').style.display = 'none';
updateAmmo();
animate();
