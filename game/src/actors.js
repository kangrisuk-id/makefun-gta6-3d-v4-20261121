// Mesh factories for cars and people, plus the traffic / police / crowd
// simulation that drives them around Palmera Bay's road grid.
import * as THREE from 'three';
import { AVENUES, STREETS, BEACHFRONT_Z, collide } from './world.js';
import { pick, range } from './rng.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.15, ...o });
export const CAR_COLORS = [0xe4572e, 0x2e86e4, 0xf2d13c, 0x27ae60, 0xe8e4da, 0x8e44ad, 0x16a3a3, 0xd35400];

export function makeCar(color, opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.62, 4.3), M(color, { roughness: 0.35, metalness: 0.35 }));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.1),
    new THREE.MeshStandardMaterial({ color: 0x1d2733, roughness: 0.15, metalness: 0.4 }));
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheels = [];
  const wgeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
  const wmat = M(0x17181c, { roughness: 0.9 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wgeo, wmat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.36, wz); g.add(w); wheels.push(w);
  }
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  for (const s of [-1, 1]) {
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), brakeMat);
    bl.position.set(s * 0.62, 0.68, -2.16); g.add(bl);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 }));
    hl.position.set(s * 0.62, 0.68, 2.16); g.add(hl);
  }
  let lightbar = null;
  if (opts.police) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.32), M(0xf4f4f4, { roughness: 0.4 }));
    stripe.position.y = 0.56; g.add(stripe);
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2 }));
    red.position.x = -0.32;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x2266ff, emissiveIntensity: 0.2 }));
    blue.position.x = 0.32;
    bar.add(red, blue); bar.position.set(0, 1.5, -0.2); g.add(bar);
    lightbar = { red, blue };
  }
  g.userData = { wheels, brakeMat, lightbar };
  return g;
}

export function makePerson(rng, opts = {}) {
  const g = new THREE.Group();
  const skin = pick(rng, [0xf2c79b, 0xc98a5a, 0x8a5a34, 0x6e4423]);
  const shirt = opts.shirt ?? pick(rng, [0xe4572e, 0x2e86e4, 0xf2d13c, 0x27ae60, 0xe8e4da, 0xff7bac, 0x16a3a3]);
  const pants = pick(rng, [0x2b3a55, 0x3a3a3a, 0x7a5b3a, 0xded5c3]);
  const mk = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c, { roughness: 0.85, metalness: 0 }));
    m.position.set(x, y, z); m.castShadow = true; return m;
  };
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.16, 0.85, 0); legR.position.set(0.16, 0.85, 0);
  const ll = mk(0.24, 0.85, 0.28, pants, 0, -0.42, 0); legL.add(ll); g.add(legL);
  const lr = mk(0.24, 0.85, 0.28, pants, 0, -0.42, 0); legR.add(lr); g.add(legR);
  g.add(mk(0.62, 0.72, 0.34, shirt, 0, 1.2, 0));                       // torso
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.4, 1.48, 0); armR.position.set(0.4, 1.48, 0);
  armL.add(mk(0.18, 0.68, 0.2, shirt, 0, -0.3, 0)); armR.add(mk(0.18, 0.68, 0.2, shirt, 0, -0.3, 0));
  g.add(armL, armR);
  g.add(mk(0.4, 0.42, 0.4, skin, 0, 1.78, 0));                          // head
  g.add(mk(0.44, 0.12, 0.44, opts.hat ?? 0x24303c, 0, 2.02, 0));       // cap
  g.userData = { legL, legR, armL, armR };
  return g;
}
export function animatePerson(g, phase, amp = 1) {
  const u = g.userData, s = Math.sin(phase) * 0.55 * amp;
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
}

// A rounded-rectangle driving loop around one city block (right-hand lane).
function blockLoop(cx, cz, hw, hd, lane = 6.4) {
  const pts = [];
  const x0 = cx - hw - lane, x1 = cx + hw + lane, z0 = cz - hd - lane, z1 = cz + hd + lane;
  const seg = (ax, az, bx, bz, n) => { for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, az + (bz - az) * i / n]); };
  seg(x0, z1, x1, z1, 10); seg(x1, z1, x1, z0, 10); seg(x1, z0, x0, z0, 10); seg(x0, z0, x0, z1, 10);
  return pts;
}

export class Traffic {
  constructor(scene, rng, colliders, count = 14) {
    this.cars = []; this.colliders = colliders;
    const blocks = [];
    for (let i = 0; i < AVENUES.length - 1; i++) for (let j = 0; j < STREETS.length - 1; j++)
      blocks.push([(AVENUES[i] + AVENUES[i + 1]) / 2, (STREETS[j] + STREETS[j + 1]) / 2]);
    blocks.push([60, 164], [-60, 164], [180, 164], [-180, 164]); // beachfront loops
    for (let i = 0; i < count; i++) {
      const mesh = makeCar(pick(rng, CAR_COLORS));
      scene.add(mesh);
      const [cx, cz] = blocks[i % blocks.length];
      const loop = blockLoop(cx, cz, 50, cz > 140 ? 34 : 50);
      this.cars.push({
        mesh, loop, idx: Math.floor(rng() * loop.length),
        speed: range(rng, 8, 13), cur: 0, braking: false,
      });
    }
  }
  update(dt) {
    for (const c of this.cars) {
      const [tx, tz] = c.loop[(c.idx + 3) % c.loop.length];
      const px = c.mesh.position.x, pz = c.mesh.position.z;
      let target = c.speed;
      for (const o of this.cars) { // slow for the car ahead
        if (o === c) continue;
        const dx = o.mesh.position.x - px, dz = o.mesh.position.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < 64) {
          const fwd = Math.sin(c.mesh.rotation.y) * dx + Math.cos(c.mesh.rotation.y) * dz;
          if (fwd > 0) target = Math.min(target, o.cur * 0.9);
        }
      }
      c.cur += (target - c.cur) * Math.min(1, dt * 2);
      c.braking = target < c.cur - 0.5;
      const dx = tx - px, dz = tz - pz, dist = Math.hypot(dx, dz);
      if (dist < 2.2) c.idx = (c.idx + 1) % c.loop.length;
      const yaw = Math.atan2(dx, dz);
      let dy = yaw - c.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      c.mesh.rotation.y += dy * Math.min(1, dt * 4);
      c.mesh.position.x += Math.sin(c.mesh.rotation.y) * c.cur * dt;
      c.mesh.position.z += Math.cos(c.mesh.rotation.y) * c.cur * dt;
      for (const w of c.mesh.userData.wheels) w.rotation.x += c.cur * dt / 0.36;
      c.mesh.userData.brakeMat.emissiveIntensity = c.braking ? 2.4 : 0.4;
    }
  }
}

export class Police {
  constructor(scene, colliders) {
    this.units = []; this.scene = scene; this.colliders = colliders; this.flash = 0;
  }
  setLevel(n, playerPos) {
    while (this.units.length < Math.min(n + 1, 5)) {
      const mesh = makeCar(0x1c1e24, { police: true });
      const a = Math.random() * Math.PI * 2, d = 55 + Math.random() * 30;
      mesh.position.set(playerPos.x + Math.sin(a) * d, 0, playerPos.z + Math.cos(a) * d);
      this.scene.add(mesh);
      this.units.push({ mesh, speed: 0 });
    }
    while (this.units.length > Math.min(n + 1, 5)) {
      const u = this.units.pop(); this.scene.remove(u.mesh);
    }
    if (n === 0) { for (const u of this.units) this.scene.remove(u.mesh); this.units = []; }
  }
  update(dt, target, wanted, time) {
    this.flash += dt * 9;
    const on = Math.sin(this.flash) > 0;
    for (const u of this.units) {
      const lb = u.mesh.userData.lightbar;
      lb.red.material.emissiveIntensity = on ? 3 : 0.15;
      lb.blue.material.emissiveIntensity = on ? 0.15 : 3;
      if (!target) continue;
      const dx = target.x - u.mesh.position.x, dz = target.z - u.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const max = 15 + wanted * 1.6;
      u.speed = Math.min(max, u.speed + dt * 14);
      if (dist < 4) u.speed = Math.min(u.speed, 4);
      const yaw = Math.atan2(dx, dz);
      let dy = yaw - u.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      u.mesh.rotation.y += dy * Math.min(1, dt * 3.2);
      let nx = u.mesh.position.x + Math.sin(u.mesh.rotation.y) * u.speed * dt;
      let nz = u.mesh.position.z + Math.cos(u.mesh.rotation.y) * u.speed * dt;
      [nx, nz] = collide(this.colliders, nx, nz, 1.6);
      u.mesh.position.x = nx; u.mesh.position.z = nz;
      for (const w of u.mesh.userData.wheels) w.rotation.x += u.speed * dt / 0.36;
    }
  }
}

export class Crowd {
  constructor(scene, rng, colliders, count = 26) {
    this.peds = []; this.colliders = colliders;
    const lanes = [];
    for (const x of AVENUES) lanes.push({ v: true, at: x });
    for (const z of [...STREETS, BEACHFRONT_Z]) lanes.push({ v: false, at: z });
    for (let i = 0; i < count; i++) {
      const mesh = makePerson(rng);
      scene.add(mesh);
      const lane = lanes[i % lanes.length];
      const side = rng() < 0.5 ? -12.4 : 12.4;
      const along = range(rng, -280, 200);
      const p = {
        mesh, lane, side, along, dir: rng() < 0.5 ? 1 : -1,
        speed: range(rng, 1.1, 1.9), phase: rng() * 6, flee: 0,
      };
      this.place(p); this.peds.push(p);
    }
  }
  place(p) {
    if (p.lane.v) p.mesh.position.set(p.lane.at + p.side, 0, p.along);
    else p.mesh.position.set(p.along, 0, p.lane.at + p.side);
  }
  scare(x, z, radius = 16) {
    for (const p of this.peds) {
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < radius) p.flee = 2.6;
    }
  }
  update(dt) {
    for (const p of this.peds) {
      let sp = p.speed;
      if (p.flee > 0) { p.flee -= dt; sp = 4.6; }
      p.along += p.dir * sp * dt;
      if (p.along > 290) { p.along = 290; p.dir = -1; }
      if (p.along < -290) { p.along = -290; p.dir = 1; }
      this.place(p);
      p.mesh.rotation.y = p.lane.v ? (p.dir > 0 ? 0 : Math.PI) : (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.phase += dt * sp * 3.4;
      animatePerson(p.mesh, p.phase, p.flee > 0 ? 1.5 : 1);
    }
  }
}
