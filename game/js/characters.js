// Personajes con modelos KayKit (CC0, Kay Lousberg).
// - Multitudes: las animaciones se hornean en texturas (VAT) y se dibujan instanciadas en la GPU.
// - Héroes: malla con esqueleto y AnimationMixer (pocos a la vez).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, shadowed } from './engine.js';

const FILES = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Minion', 'Skeleton_Rogue', 'Skeleton_Warrior'];
const gltfs = {};
const FPS = 24;

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
// VAT: animación horneada en texturas
// ============================================================
const VAT_GLSL = /* glsl */ `
uniform highp sampler2D vatPos;
uniform highp sampler2D vatNrm;
uniform int vatW;
uniform int vatV;
attribute vec3 aVat;
vec3 vatGet(highp sampler2D tex, float frame) {
  int idx = int(frame) * vatV + gl_VertexID;
  return texelFetch(tex, ivec2(idx % vatW, idx / vatW), 0).xyz;
}
`;

function vatPatch(uniforms) {
  return (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VAT_GLSL)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = mix(vatGet(vatNrm, aVat.x), vatGet(vatNrm, aVat.y), aVat.z) * 2.0 - 1.0;
        float nLen = length(objectNormal);
        objectNormal = nLen > 1e-4 ? objectNormal / nLen : vec3(0.0, 1.0, 0.0);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = mix(vatGet(vatPos, aVat.x), vatGet(vatPos, aVat.y), aVat.z);');
    // Red de seguridad: un píxel inválido (NaN) se pintaría en blanco por toda la pantalla con el brillo
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n  if (any(isnan(gl_FragColor)) || any(isinf(gl_FragColor))) gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);');
  };
}

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
    g.setAttribute('normal', m.geometry.attributes.normal.clone());
    g.setAttribute('uv', m.geometry.attributes.uv.clone());
    g.setIndex(m.geometry.index.clone());
    const key = m.material.map ? m.material.map.uuid : m.material.uuid;
    if (!matIndex.has(key)) { matIndex.set(key, mats.length); mats.push(m.material); }
    g.userData.mat = matIndex.get(key);
    return g;
  });
  const geo = mergeGeometries(geos, true);
  geo.groups.forEach((gr, i) => { gr.materialIndex = geos[i].userData.mat; });
  const V = geo.attributes.position.count;

  // Fotogramas de cada animación
  const mixer = new THREE.AnimationMixer(root);
  const frames = [];
  const clips = {};
  for (const [key, name] of [['run', def.run], ['attack', def.attack]]) {
    const clip = THREE.AnimationClip.findByName(src.animations, name);
    const n = Math.max(8, Math.round(clip.duration * FPS));
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

  // Normales por fotograma
  const tmp = new THREE.BufferGeometry();
  tmp.setIndex(geo.index);
  const W = 2048;
  const total = frames.length * V;
  const H = Math.ceil(total / W);
  const pos = new Float32Array(W * H * 4);
  const nrm = new Uint8Array(W * H * 4);
  frames.forEach((fr, f) => {
    const scaled = new Float32Array(fr.length);
    for (let i = 0; i < fr.length; i += 3) {
      scaled[i] = fr[i] * s; scaled[i + 1] = (fr[i + 1] - minY) * s; scaled[i + 2] = fr[i + 2] * s;
    }
    for (let i = 0; i < scaled.length; i++) if (!Number.isFinite(scaled[i])) scaled[i] = 0;
    tmp.setAttribute('position', new THREE.BufferAttribute(scaled, 3));
    tmp.computeVertexNormals();
    const nn = tmp.attributes.normal.array;
    for (let i = 0; i < V; i++) {
      // Vértices degenerados: normal hacia arriba en vez de (0,0,0) o NaN
      const l = Math.hypot(nn[i * 3], nn[i * 3 + 1], nn[i * 3 + 2]);
      if (!(l > 1e-4)) { nn[i * 3] = 0; nn[i * 3 + 1] = 1; nn[i * 3 + 2] = 0; }
      const o = (f * V + i) * 4;
      pos[o] = scaled[i * 3]; pos[o + 1] = scaled[i * 3 + 1]; pos[o + 2] = scaled[i * 3 + 2]; pos[o + 3] = 1;
      nrm[o] = Math.round((nn[i * 3] * 0.5 + 0.5) * 255);
      nrm[o + 1] = Math.round((nn[i * 3 + 1] * 0.5 + 0.5) * 255);
      nrm[o + 2] = Math.round((nn[i * 3 + 2] * 0.5 + 0.5) * 255);
      nrm[o + 3] = 255;
    }
  });
  const posTex = new THREE.DataTexture(pos, W, H, THREE.RGBAFormat, THREE.FloatType);
  const nrmTex = new THREE.DataTexture(nrm, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  for (const t of [posTex, nrmTex]) { t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; }

  const uniforms = { vatPos: { value: posTex }, vatNrm: { value: nrmTex }, vatW: { value: W }, vatV: { value: V } };
  const patch = vatPatch(uniforms);
  const materials = mats.map((m) => {
    const mat = new THREE.MeshStandardMaterial({ map: m.map, color: def.tint || '#ffffff', roughness: 0.62, metalness: 0.05 });
    mat.onBeforeCompile = patch;
    return mat;
  });
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = patch;

  const vat = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 3), 3);
  vat.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aVat', vat);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.height / 2, 0), def.height * 1.5);

  const mesh = shadowed(new THREE.InstancedMesh(geo, materials, def.max), true, false);
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, vat, def, clips, n: 0 };
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

// Escribe el fotograma de animación de la instancia i
export function writeVat(c, i, time, attacking) {
  const clip = attacking ? c.clips.attack : c.clips.run;
  const ph = ((time / clip.duration) % 1 + 1) % 1;
  const f = ph * clip.n;
  const a = Math.floor(f);
  const arr = c.vat.array;
  arr[i * 3] = clip.start + a;
  arr[i * 3 + 1] = clip.start + ((a + 1) % clip.n);
  arr[i * 3 + 2] = f - a;
}

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
