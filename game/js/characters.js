// Personajes con modelos KayKit (CC0, Kay Lousberg).
// - Multitudes: poses precalculadas e instanciadas (compatibles con cualquier GPU).
// - Héroes: malla con esqueleto y AnimationMixer (pocos a la vez).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, shadowed } from './engine.js';

const FILES = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'];
const gltfs = {};

// Tropas (multitud instanciada)
export const TROOP_DEFS = {
  soldier: { file: 'Knight', parts: ['Knight_Helmet', 'Knight_Cape', '1H_Sword', 'Round_Shield'], run: 'Running_A', attack: '1H_Melee_Attack_Chop', height: 1.12, rate: 1.35, max: 720 },
  knight: { file: 'Barbarian', parts: ['Barbarian_Hat', 'Barbarian_Cape', '1H_Axe', 'Barbarian_Round_Shield'], run: 'Running_A', attack: '1H_Melee_Attack_Chop', height: 1.28, rate: 1.2, max: 420 },
  legion: { file: 'Skeleton_Minion', parts: [], borrow: [['Knight', '1H_Sword']], run: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', height: 1.1, rate: 1.3, max: 420 },
  scout: { file: 'Skeleton_Rogue', parts: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], borrow: [['Rogue', 'Knife']], run: 'Running_C', attack: '1H_Melee_Attack_Chop', height: 1.05, rate: 1.25, max: 300 },
  ogre: { file: 'Skeleton_Warrior', parts: ['Skeleton_Warrior_Helmet'], borrow: [['Barbarian', '2H_Axe']], run: 'Walking_C', attack: '2H_Melee_Attack_Chop', height: 2.1, rate: 1.0, max: 24 },
  boss: { file: 'Skeleton_Warrior', parts: ['Skeleton_Warrior_Helmet'], borrow: [['Knight', '2H_Sword']], run: 'Walking_C', attack: '2H_Melee_Attack_Chop', height: 3.3, rate: 0.8, max: 2, tint: '#ff9a8a' },
};

// Héroes (esqueleto completo)
export const HERO_DEFS = {
  king: { file: 'Knight', parts: ['Knight_Helmet', 'Knight_Cape', '2H_Sword'], attack: '2H_Melee_Attack_Spin', height: 2.0, aura: new THREE.Color(1.6, 1.3, 0.4), tint: '#fff0c0' },
  archer: { file: 'Rogue', parts: ['Rogue_Cape', '2H_Crossbow'], attack: '2H_Ranged_Shoot', height: 1.85, aura: new THREE.Color(0.4, 1.6, 0.7) },
  mage: { file: 'Mage', parts: ['Mage_Hat', 'Mage_Cape', '2H_Staff'], attack: 'Spellcast_Shoot', height: 1.9, aura: new THREE.Color(1.2, 0.5, 2.2) },
  rogue: { file: 'Rogue_Hooded', parts: ['Rogue_Cape', 'Knife', 'Knife_Offhand'], attack: 'Dualwield_Melee_Attack_Slice', height: 1.85, aura: new THREE.Color(1.8, 0.4, 1.6) },
};

export async function loadCharacters(onProgress = () => {}) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(FILES.map(async (f) => {
    gltfs[f] = await loader.loadAsync(`assets/${f}.glb`);
    onProgress(++done / (FILES.length + 1));
  }));
  for (const g of Object.values(gltfs)) {
    g.scene.traverse((o) => {
      if (o.isMesh) {
        o.material.roughness = 0.62;
        o.material.metalness = 0.05;
      }
    });
  }
  for (const [key, def] of Object.entries(TROOP_DEFS)) crowds[key] = bakeCrowd(def);
  onProgress(1);
}

// Monta un personaje: quita los accesorios que no usa y añade armas de otros modelos.
function buildRig(def) {
  const root = SkeletonUtils.clone(gltfs[def.file].scene);
  const remove = [];
  root.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && !def.parts.includes(o.name)) remove.push(o); });
  for (const o of remove) o.removeFromParent();
  for (const [file, name] of def.borrow || []) {
    const donor = gltfs[file].scene.getObjectByName(name);
    const slot = root.getObjectByName(donor.parent.name);
    if (slot) slot.add(donor.clone());
  }
  return root;
}

// ============================================================
// Multitudes: poses precalculadas
// Cada pose de la animación se convierte en una malla normal; los personajes se agrupan
// según la pose en la que están (una InstancedMesh por pose). Sin sombreadores especiales:
// funciona en cualquier GPU de móvil.
// ============================================================
const RUN_POSES = 14;
const ATTACK_POSES = 10;

const tmpV = new THREE.Vector3();
function samplePositions(meshes, V) {
  const out = new Float32Array(V * 3);
  let o = 0;
  for (const m of meshes) {
    const attr = m.geometry.attributes.position;
    for (let i = 0; i < attr.count; i++) {
      if (m.isSkinnedMesh) m.getVertexPosition(i, tmpV);
      else tmpV.fromBufferAttribute(attr, i);
      tmpV.applyMatrix4(m.matrixWorld);
      out[o++] = tmpV.x; out[o++] = tmpV.y; out[o++] = tmpV.z;
    }
  }
  return out;
}

export const crowds = {};

function bakeCrowd(def) {
  const src = gltfs[def.file];
  const root = buildRig(def);
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });

  // Geometría combinada (un grupo por malla, material por textura)
  const mats = [];
  const matIndex = new Map();
  const geos = meshes.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', m.geometry.attributes.position.clone());
    g.setAttribute('uv', m.geometry.attributes.uv.clone());
    g.setIndex(m.geometry.index.clone());
    const key = m.material.map ? m.material.map.uuid : m.material.uuid;
    if (!matIndex.has(key)) { matIndex.set(key, mats.length); mats.push(m.material); }
    g.userData.mat = matIndex.get(key);
    return g;
  });
  const base = mergeGeometries(geos, true);
  base.groups.forEach((gr, i) => { gr.materialIndex = geos[i].userData.mat; });
  const V = base.attributes.position.count;

  // Poses de cada animación
  const mixer = new THREE.AnimationMixer(root);
  const frames = [];
  const clips = {};
  for (const [key, name, n] of [['run', def.run, RUN_POSES], ['attack', def.attack, ATTACK_POSES]]) {
    const clip = THREE.AnimationClip.findByName(src.animations, name);
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    clips[key] = { start: frames.length, n, duration: clip.duration };
    for (let k = 0; k < n; k++) {
      mixer.setTime((k / n) * clip.duration);
      root.updateMatrixWorld(true);
      frames.push(samplePositions(meshes, V));
    }
    action.stop();
  }

  // Escala para la altura deseada, apoyado en el suelo
  let minY = Infinity, maxY = -Infinity;
  const f0 = frames[0];
  for (let i = 1; i < f0.length; i += 3) { minY = Math.min(minY, f0[i]); maxY = Math.max(maxY, f0[i]); }
  const s = def.height / (maxY - minY);

  const materials = mats.map((m) => new THREE.MeshStandardMaterial({ map: m.map, color: def.tint || '#ffffff', roughness: 0.62, metalness: 0.05 }));
  const sphere = new THREE.Sphere(new THREE.Vector3(0, def.height / 2, 0), def.height * 1.5);
  const poses = frames.map((fr) => {
    const pos = new Float32Array(fr.length);
    for (let i = 0; i < fr.length; i += 3) {
      pos[i] = fr[i] * s; pos[i + 1] = (fr[i + 1] - minY) * s; pos[i + 2] = fr[i + 2] * s;
    }
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) pos[i] = 0;
    const g = new THREE.BufferGeometry();
    g.setIndex(base.index);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', base.attributes.uv);
    for (const gr of base.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
    g.computeVertexNormals();
    g.boundingSphere = sphere;
    const mesh = shadowed(new THREE.InstancedMesh(g, materials, def.max), true, false);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  return { poses, counts: new Int32Array(poses.length), def, clips, n: 0 };
}

export function beginCrowd(c) {
  c.counts.fill(0);
  c.n = 0;
}

// Añade una instancia en la pose que toca según su tiempo de animación
export function addToCrowd(c, matrix, time, attacking) {
  const clip = attacking ? c.clips.attack : c.clips.run;
  const ph = ((time / clip.duration) % 1 + 1) % 1;
  const p = clip.start + Math.min(clip.n - 1, Math.floor(ph * clip.n));
  const mesh = c.poses[p];
  mesh.setMatrixAt(c.counts[p]++, matrix);
  c.n++;
}

export function endCrowd(c) {
  for (let i = 0; i < c.poses.length; i++) {
    const m = c.poses[i];
    m.count = c.counts[i];
    m.visible = m.count > 0;
    if (m.visible) m.instanceMatrix.needsUpdate = true;
  }
}

// Anillos de equipo bajo cada unidad (legibilidad azul contra rojo)
const ringTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.62, 'rgba(255,255,255,0.15)');
  r.addColorStop(0.8, 'rgba(255,255,255,1)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function makeRings(color, max) {
  const m = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: ringTex, color, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 }),
    max,
  );
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 1;
  scene.add(m);
  return m;
}
export const rings = [
  { mesh: makeRings(new THREE.Color(0.5, 1.2, 3.2), 1200), n: 0 },
  { mesh: makeRings(new THREE.Color(3.2, 0.45, 0.35), 800), n: 0 },
];

// ============================================================
// Héroes con esqueleto completo
// ============================================================
const auraGeo = new THREE.RingGeometry(0.55, 0.8, 40).rotateX(-Math.PI / 2);

function heroRig(type, height) {
  const def = HERO_DEFS[type];
  const root = buildRig(def);
  const box = new THREE.Box3().setFromObject(root);
  root.scale.setScalar(height / (box.max.y - box.min.y));
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (def.tint) { o.material = o.material.clone(); o.material.color.set(def.tint); }
  });
  return root;
}

export function createHero(type) {
  const def = HERO_DEFS[type];
  const src = gltfs[def.file];
  const group = new THREE.Group();
  const body = heroRig(type, def.height);
  group.add(body);
  const auraMat = new THREE.MeshBasicMaterial({ color: def.aura, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.position.y = 0.05;
  aura.scale.setScalar(def.height);
  group.add(aura);
  scene.add(group);

  const mixer = new THREE.AnimationMixer(body);
  const actions = {};
  for (const [key, name] of [['run', 'Running_A'], ['attack', def.attack], ['cheer', 'Cheer']]) {
    const clip = THREE.AnimationClip.findByName(src.animations, name);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  let current = actions.run;
  current.play();
  return {
    group, body, aura,
    play(key, speed = 1) {
      const next = actions[key] || actions.run;
      next.timeScale = speed;
      if (next === current) return;
      next.reset().play();
      current.crossFadeTo(next, 0.15, false);
      current = next;
    },
    update(dt) { mixer.update(dt); },
    dispose() {
      mixer.stopAllAction();
      group.removeFromParent();
      auraMat.dispose();
      if (def.tint) body.traverse((o) => { if (o.isMesh) o.material.dispose(); });
    },
  };
}

// Personaje posado para los retratos del menú (altura 1)
export function heroPortraitMesh(type) {
  const def = HERO_DEFS[type];
  const body = heroRig(type, 1.0);
  const mixer = new THREE.AnimationMixer(body);
  const clip = THREE.AnimationClip.findByName(gltfs[def.file].animations, 'Idle');
  if (clip) { mixer.clipAction(clip).play(); mixer.setTime(0.4); }
  body.updateMatrixWorld(true);
  return { mesh: body, dispose: () => mixer.stopAllAction() };
}
