// Modelos 3D procedurales del escenario: cañón, puertas, obstáculos, barriles,
// proyectiles y muralla. Los personajes están en characters.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HALF, CANNON_Z, X, scene, own, M, shadowed, paint, canvasTex } from './engine.js';

// ============================================================
// Cañón (con cañones laterales para el disparo triple)
// ============================================================
export const cannonGroup = new THREE.Group();
export const barrelPivot = new THREE.Group();
export const sideBarrels = new THREE.Group();
export const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8), toneMapped: false, transparent: true }));
export const muzzleLight = new THREE.PointLight('#ffd27a', 0, 8, 2);
{
  const baseM = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 0.35, 28), M.metalDark));
  baseM.position.y = 0.18;
  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.8, 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), M.metal));
  body.position.y = 0.35;
  const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 10, 32), M.gold));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.38;
  for (const s of [-1, 1]) {
    const wheel = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 10, 24), M.metalDark));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(s * 1.05, 0.42, -0.1);
    const hub = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 12), M.gold));
    hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position);
    cannonGroup.add(wheel, hub);
  }
  const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.7, 24), M.metal));
  barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.7;
  const lip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.08, 10, 24), M.gold));
  lip.position.z = 1.55;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), M.neon);
  glow.position.z = 1.56;
  barrelPivot.add(barrel, lip, glow);
  for (const s of [-1, 1]) {
    const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 1.2, 16), M.metal));
    b.rotation.x = Math.PI / 2;
    b.position.set(s * 0.55, -0.1, 0.5);
    const l = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 18), M.gold));
    l.position.set(s * 0.55, -0.1, 1.1);
    sideBarrels.add(b, l);
  }
  sideBarrels.visible = false;
  barrelPivot.add(sideBarrels);
  barrelPivot.position.set(0, 0.85, 0);
  barrelPivot.rotation.x = -0.18;
  muzzle.position.set(0, 0, 1.9);
  muzzleLight.position.set(0, 0, 2);
  barrelPivot.add(muzzle, muzzleLight);
  cannonGroup.add(baseM, body, ring, barrelPivot);
  cannonGroup.position.z = CANNON_Z - 0.4;
  scene.add(cannonGroup);
}

// ============================================================
// Muralla de energía (edificio Murallas)
// ============================================================
export const WALL_Z = CANNON_Z + 2.2;
export const wall = new THREE.Group();
export const wallMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.1, 2.4), transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
{
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 1.1), wallMat);
  plane.position.y = 0.55;
  const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.06, 0.06), M.neon);
  top.position.y = 1.1;
  for (const s of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.4, 1.4, 0.4, 2, 0.08), M.pillar));
    post.position.set(s * (HALF - 0.1), 0.7, 0);
    wall.add(post);
  }
  wall.add(plane, top);
  wall.position.z = WALL_Z;
  wall.visible = false;
  scene.add(wall);
}

// ============================================================
// Puertas
// ============================================================
const gateGeo = {
  pillar: new RoundedBoxGeometry(0.32, 2.3, 0.32, 2, 0.08),
  cap: new THREE.SphereGeometry(0.24, 14, 10),
};
const GATE_COLORS = { mul: '#3d8bff', add: '#3ddc84', knight: '#ffb800', div: '#ff3b3b' };
const GATE_GLOW = { mul: '#5fb0ff', add: '#5dffa0', knight: '#ffd34d', div: '#ff6a5a' };

function labelTexture(text, glow) {
  return canvasTex(512, 256, (g, w, h) => {
    g.font = '900 170px system-ui, -apple-system, Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = 28;
    g.lineWidth = 16; g.strokeStyle = 'rgba(8,20,50,.85)';
    g.strokeText(text, w / 2, h / 2 + 8);
    g.shadowBlur = 0;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 8);
  });
}
const labelCache = new Map();

export function gateMeshes(g) {
  const color = new THREE.Color(GATE_COLORS[g.op.kind]);
  const grp = own('stage', new THREE.Group());
  const panelMat = own('stage', new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.32,
    roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  }));
  const panel = new THREE.Mesh(own('stage', new THREE.PlaneGeometry(g.w, 2.05)), panelMat);
  panel.position.y = 1.08;
  const beamMat = own('stage', new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), toneMapped: false }));
  const beam = shadowed(new THREE.Mesh(own('stage', new RoundedBoxGeometry(g.w + 0.3, 0.26, 0.3, 2, 0.08)), beamMat));
  beam.position.y = 2.25;
  grp.add(panel, beam);
  for (const s of [-1, 1]) {
    const p = shadowed(new THREE.Mesh(gateGeo.pillar, g.op.kind === 'div' ? M.metalDark : M.pillar));
    p.position.set(s * g.w / 2, 1.15, 0);
    const c = shadowed(new THREE.Mesh(gateGeo.cap, M.gold));
    c.position.set(s * g.w / 2, 2.42, 0);
    grp.add(p, c);
  }
  if (g.op.kind === 'div') {
    for (let i = 0; i < 5; i++) {
      const spike = shadowed(new THREE.Mesh(own('stage', new THREE.ConeGeometry(0.09, 0.35, 6)), M.steel));
      spike.position.set(-g.w / 2 + (i + 0.5) * (g.w / 5), 2.0, 0);
      spike.rotation.x = Math.PI;
      grp.add(spike);
    }
  }
  const key = g.op.label + g.op.kind;
  if (!labelCache.has(key)) labelCache.set(key, labelTexture(g.op.label, GATE_GLOW[g.op.kind]));
  const labelMat = own('stage', new THREE.MeshBasicMaterial({ map: labelCache.get(key), transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.25, 1.25, 1.25) }));
  const label = new THREE.Mesh(own('stage', new THREE.PlaneGeometry(2.6, 1.3)), labelMat);
  label.position.set(0, 1.2, -0.06);
  label.rotation.y = Math.PI;
  label.renderOrder = 2;
  grp.add(label);
  grp.position.set(X(g.x), 0, g.z);
  scene.add(grp);
  return { grp, panelMat, beamMat, label, base: color };
}

// ============================================================
// Obstáculos y barriles explosivos
// ============================================================
const OBST_GEO = {
  post: new THREE.CylinderGeometry(0.28, 0.36, 1.1, 16).translate(0, 0.55, 0),
  hub: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16),
  saw: new THREE.CylinderGeometry(0.95, 0.95, 0.1, 32).rotateX(Math.PI / 2),
  tooth: new THREE.ConeGeometry(0.12, 0.28, 4),
  barrel: new THREE.CylinderGeometry(0.42, 0.42, 0.95, 18).translate(0, 0.48, 0),
  band: new THREE.TorusGeometry(0.43, 0.035, 6, 20).rotateX(Math.PI / 2),
  fuse: new THREE.SphereGeometry(0.08, 8, 6),
};
const barrelMat = new THREE.MeshStandardMaterial({ color: '#c8281e', roughness: 0.45, metalness: 0.2, emissive: '#ff3010', emissiveIntensity: 0 });
const fuseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.4), toneMapped: false });

export function obstacleMeshes(o) {
  const grp = own('stage', new THREE.Group());
  if (o.type === 'spinner') {
    grp.add(shadowed(new THREE.Mesh(OBST_GEO.post, M.metalDark)));
    const arm = new THREE.Group();
    arm.add(shadowed(new THREE.Mesh(own('stage', new RoundedBoxGeometry(o.len, 0.4, 0.4, 2, 0.1)), M.hazard)));
    arm.add(shadowed(new THREE.Mesh(OBST_GEO.hub, M.steel)));
    arm.position.y = 0.75;
    grp.add(arm);
    o.arm = arm;
  } else if (o.type === 'slider') {
    const w = shadowed(new THREE.Mesh(own('stage', new RoundedBoxGeometry(o.w, 1.5, 0.7, 2, 0.12)), M.hazard));
    w.position.y = 0.75;
    const top = new THREE.Mesh(own('stage', new THREE.BoxGeometry(o.w, 0.08, 0.08)), M.neonRed);
    top.position.set(0, 1.52, -0.3);
    grp.add(w, top);
  } else if (o.type === 'saw') {
    const slot = new THREE.Mesh(own('stage', new THREE.BoxGeometry((o.amp + 1) * 2, 0.04, 0.22)), M.neonRed);
    slot.position.y = 0.03;
    grp.add(slot);
    const blade = new THREE.Group();
    blade.add(shadowed(new THREE.Mesh(OBST_GEO.saw, M.steel)));
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const tth = new THREE.Mesh(OBST_GEO.tooth, M.steel);
      tth.position.set(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0);
      tth.rotation.z = a - Math.PI / 2;
      blade.add(tth);
    }
    blade.position.y = 0.9;
    grp.add(blade);
    o.blade = blade;
  } else if (o.type === 'barrel') {
    grp.add(shadowed(new THREE.Mesh(OBST_GEO.barrel, barrelMat)));
    for (const y of [0.18, 0.78]) {
      const b = new THREE.Mesh(OBST_GEO.band, M.steel);
      b.position.y = y;
      grp.add(b);
    }
    const lid = shadowed(new THREE.Mesh(own('stage', new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16)), M.hazard));
    lid.position.y = 0.97;
    const fuse = new THREE.Mesh(OBST_GEO.fuse, fuseMat);
    fuse.position.y = 1.08;
    grp.add(lid, fuse);
    o.fuse = fuse;
  }
  grp.position.set(o.type === 'saw' ? 0 : X(o.x), 0, o.z);
  scene.add(grp);
  o.grp = grp;
}
export const barrelGlow = (k) => { barrelMat.emissiveIntensity = k; };

// ============================================================
// Proyectiles: flechas y bolas de fuego (instanciados)
// ============================================================
export const MAX_ARROWS = 160;
const arrowGeo = mergeGeometries([
  paint(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 5).rotateX(Math.PI / 2), '#8a5a2a'),
  paint(new THREE.ConeGeometry(0.045, 0.14, 6).rotateX(Math.PI / 2).translate(0, 0, 0.42), '#dfe6ee'),
  paint(new THREE.BoxGeometry(0.1, 0.012, 0.14).translate(0, 0, -0.32), '#ffffff'),
  paint(new THREE.BoxGeometry(0.012, 0.1, 0.14).translate(0, 0, -0.32), '#ffffff'),
]);
export const arrowMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAX_ARROWS);
arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
arrowMesh.setColorAt(0, new THREE.Color());
arrowMesh.count = 0;
arrowMesh.frustumCulled = false;
scene.add(arrowMesh);

export const MAX_FIRE = 24;
export const fireMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.35), toneMapped: false }), MAX_FIRE);
fireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
fireMesh.count = 0;
fireMesh.frustumCulled = false;
scene.add(fireMesh);

// Columna de luz al invocar un héroe
const pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, 14, 24, 1, true).translate(0, 7, 0);
export function lightPillar(x, z, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(pillarGeo, mat);
  m.position.set(X(x), 0, z);
  scene.add(m);
  return m;
}
