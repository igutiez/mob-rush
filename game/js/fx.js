// Efectos: chispas brillantes, escombros con física, ondas expansivas y textos flotantes.
import * as THREE from 'three';
import { X, scene, shadowed, toScreen } from './engine.js';

export const MAX_PARTICLES = 1100;
export const MAX_DEBRIS = 160;

export const fx = { particles: [], debris: [], shockwaves: [], pillars: [] };

const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_PARTICLES);
sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sparkMesh.setColorAt(0, new THREE.Color());
sparkMesh.count = 0;
sparkMesh.frustumCulled = false;
scene.add(sparkMesh);

const debrisMesh = shadowed(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), MAX_DEBRIS), true, false);
debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debrisMesh.setColorAt(0, new THREE.Color());
debrisMesh.count = 0;
debrisMesh.frustumCulled = false;
scene.add(debrisMesh);

const ringGeo = new THREE.RingGeometry(0.85, 1, 48);

const tmpColor = new THREE.Color();
export function burst(x, y, z, color, n, power, size = 1, up = 1) {
  tmpColor.set(color);
  const P = fx.particles;
  for (let i = 0; i < n && P.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.4 + Math.random() * 0.8);
    const k = 1.2 + Math.random() * 1.6;
    P.push({
      x, y, z,
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: power * (0.5 + Math.random()) * up,
      life: 0.5 + Math.random() * 0.6,
      r: tmpColor.r * k, g: tmpColor.g * k, b: tmpColor.b * k,
      s: size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6, grav: 16,
    });
  }
}

// Estela: partículas casi sin velocidad que flotan (fuego, magia)
export function trail(x, y, z, color, size = 1) {
  if (fx.particles.length >= MAX_PARTICLES) return;
  tmpColor.set(color);
  fx.particles.push({
    x: x + (Math.random() - 0.5) * 0.2, y, z: z + (Math.random() - 0.5) * 0.2,
    vx: 0, vz: 0, vy: 0.8, life: 0.35 + Math.random() * 0.2,
    r: tmpColor.r * 2.2, g: tmpColor.g * 2.2, b: tmpColor.b * 2.2,
    s: size * (0.8 + Math.random() * 0.6), rot: Math.random() * 6, grav: -1,
  });
}

export function explodeDebris(x, y, z, colors, n, power, scale) {
  for (let i = 0; i < n && fx.debris.length < MAX_DEBRIS; i++) {
    const c = new THREE.Color(colors[i % colors.length]);
    fx.debris.push({
      x: x + (Math.random() - 0.5) * 8, y: y + Math.random() * 5, z: z + Math.random() * 3,
      vx: (Math.random() - 0.5) * power, vy: power * (0.6 + Math.random() * 0.8), vz: -Math.random() * power * 0.9,
      rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 12,
      s: scale * (0.4 + Math.random() * 0.9), life: 3 + Math.random() * 1.5, c,
    });
  }
}

export function shockwave(x, z, color, size = 12, speed = 1.6) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(X(x), 0.15, z);
  m.userData = { life: 1, size, speed };
  scene.add(m);
  fx.shockwaves.push(m);
}

export function addPillar(mesh) {
  mesh.userData.life = 1;
  fx.pillars.push(mesh);
}

export function clearFx() {
  fx.particles.length = 0;
  fx.debris.length = 0;
  for (const s of fx.shockwaves) { scene.remove(s); s.material.dispose(); }
  fx.shockwaves.length = 0;
}

export function updateFx(dt) {
  const P = fx.particles;
  let j = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rot += dt * 8;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
    P[j++] = p;
  }
  P.length = j;

  const D = fx.debris;
  j = 0;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    d.life -= dt;
    if (d.life <= 0) continue;
    d.vy -= 22 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.rx += d.wx * dt; d.ry += d.wy * dt;
    const floor = d.s * 0.5;
    if (d.y < floor) { d.y = floor; d.vy *= -0.3; d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.6; d.wy *= 0.6; }
    D[j++] = d;
  }
  D.length = j;

  const S = fx.shockwaves;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i];
    s.userData.life -= dt * s.userData.speed;
    if (s.userData.life <= 0) {
      scene.remove(s); s.material.dispose();
      S.splice(i, 1);
      continue;
    }
    const k = 1 - s.userData.life;
    s.scale.setScalar(0.5 + k * s.userData.size);
    s.material.opacity = s.userData.life;
  }

  for (let i = fx.pillars.length - 1; i >= 0; i--) {
    const m = fx.pillars[i];
    m.userData.life -= dt * 1.2;
    if (m.userData.life <= 0) {
      m.removeFromParent(); m.material.dispose();
      fx.pillars.splice(i, 1);
      continue;
    }
    m.material.opacity = m.userData.life * 0.8;
    m.scale.set(1 + (1 - m.userData.life) * 0.6, 1, 1 + (1 - m.userData.life) * 0.6);
  }
}

const dummy = new THREE.Object3D();
const sparkColor = new THREE.Color();
export function syncFx() {
  const P = fx.particles;
  const pn = Math.min(P.length, MAX_PARTICLES);
  for (let i = 0; i < pn; i++) {
    const p = P[i];
    const life = Math.min(1, p.life * 2);
    dummy.position.set(X(p.x), p.y, p.z);
    dummy.rotation.set(p.rot, p.rot * 0.7, 0);
    dummy.scale.setScalar(p.s * (0.3 + life * 0.7));
    dummy.updateMatrix();
    sparkMesh.setMatrixAt(i, dummy.matrix);
    sparkColor.setRGB(p.r * life, p.g * life, p.b * life);
    sparkMesh.setColorAt(i, sparkColor);
  }
  sparkMesh.count = pn;
  sparkMesh.instanceMatrix.needsUpdate = true;
  if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;

  const D = fx.debris;
  const dn = Math.min(D.length, MAX_DEBRIS);
  for (let i = 0; i < dn; i++) {
    const d = D[i];
    dummy.position.set(X(d.x), d.y, d.z);
    dummy.rotation.set(d.rx, d.ry, 0);
    dummy.scale.setScalar(d.s * Math.min(1, d.life));
    dummy.updateMatrix();
    debrisMesh.setMatrixAt(i, dummy.matrix);
    debrisMesh.setColorAt(i, d.c);
  }
  debrisMesh.count = dn;
  debrisMesh.instanceMatrix.needsUpdate = true;
  if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
}

// ---------- Textos flotantes (DOM) ----------
const layer = document.getElementById('popups');
let live = 0;
export function popup(x, y, z, text, cls = '') {
  if (live > 40) return;
  const p = toScreen(x, y, z);
  if (!p.visible) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  layer.appendChild(el);
  live++;
  setTimeout(() => { el.remove(); live--; }, 1100);
}
