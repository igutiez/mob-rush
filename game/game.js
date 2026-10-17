import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = (id) => document.getElementById(id);

// ============================================================
// Reglas del juego (coordenadas de juego: x lateral, z hacia la base enemiga).
// En Three.js la x se invierte (X()) porque la cámara mira hacia +z.
// ============================================================
const HALF = 5;
const LEN = 40;
const CANNON_Z = 1.2;
const BLUE_SPEED = 7;
const RED_SPEED = 3.2;
const UNIT_R = 0.28;
const MAX_BLUE = 650;
const MAX_RED = 400;
const MAX_GIANTS = 24;
const MAX_PARTICLES = 900;
const MAX_DEBRIS = 140;
const X = (x) => -x;

// ---------- Guardado ----------
const SAVE_KEY = 'mobrush-save-v1';
const save = { level: 1, coins: 0, rate: 0, giant: 0, muted: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* sin almacenamiento */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignorar */ } };

const MAX_UP = 8;
const upCost = (lvl) => Math.round(40 * Math.pow(1.55, lvl));
const fireRate = () => 6 + save.rate;
const chargeMax = () => Math.max(18, 40 - save.giant * 3);
const giantHp = () => 15 + save.giant * 3;

// ---------- Audio ----------
let actx = null;
const lastSfx = {};
function ensureAudio() {
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (actx.state === 'suspended') actx.resume();
}
function sfx(name, freq, dur, type = 'square', vol = 0.04, slide = 0, gap = 0.05) {
  if (save.muted || !actx) return;
  const now = actx.currentTime;
  if (lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now;
  const o = actx.createOscillator();
  const g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(actx.destination);
  o.start(now);
  o.stop(now + dur + 0.02);
}
function boom(vol = 0.25, dur = 0.8) {
  if (save.muted || !actx) return;
  const now = actx.currentTime;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  const src = actx.createBufferSource();
  src.buffer = buf;
  const f = actx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900, now);
  f.frequency.exponentialRampToValueAtTime(80, now + dur);
  const g = actx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(actx.destination);
  src.start(now);
}
const vibrate = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };

// ============================================================
// Motor gráfico
// ============================================================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const HORIZON = new THREE.Color('#bfe3ff');
scene.fog = new THREE.Fog(HORIZON, 55, 150);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
const CAM_BASE = new THREE.Vector3(0, 12.5, -10.5);
const CAM_LOOK = new THREE.Vector3(0, 0, 15);
const camShake = { amp: 0 };

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- Cielo ----------
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#2f7fe0') },
        mid: { value: new THREE.Color('#7cc0ff') },
        bottom: { value: HORIZON },
        sunDir: { value: new THREE.Vector3(0.35, 0.35, 0.87).normalize() },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
}

// ---------- Luces ----------
scene.add(new THREE.HemisphereLight('#cfe8ff', '#3d6b2a', 0.7));
const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
sun.position.set(-14, 26, -6);
sun.target.position.set(0, 0, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 34, bottom: -34, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

// ---------- Texturas procedurales ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const trackTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4a6aa8'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const l = 52 + Math.random() * 7;
      g.fillStyle = `hsl(220, 45%, ${l}%)`;
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(x * 64 + 2, y * 64 + 2, 60, 6);
    }
  }
}, [2.5, 13]);

const grassTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#4fae45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `hsla(${100 + Math.random() * 20}, 55%, ${30 + Math.random() * 25}%, .5)`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 3);
  }
}, [60, 60]);

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

// ---------- Materiales ----------
const M = {
  track: new THREE.MeshStandardMaterial({ map: trackTex, roughness: 0.42, metalness: 0.1 }),
  trackSide: new THREE.MeshStandardMaterial({ color: '#5f7db3', roughness: 0.6 }),
  rail: new THREE.MeshStandardMaterial({ color: '#dfe6f5', roughness: 0.3, metalness: 0.3 }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 2.2), toneMapped: false }),
  neonRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.12, 0.08), toneMapped: false }),
  grass: new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
  unit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.05 }),
  castle: new THREE.MeshStandardMaterial({ color: '#d93a3a', roughness: 0.55, emissive: '#ff2020', emissiveIntensity: 0 }),
  castleDark: new THREE.MeshStandardMaterial({ color: '#a82424', roughness: 0.6, emissive: '#ff2020', emissiveIntensity: 0 }),
  stone: new THREE.MeshStandardMaterial({ color: '#c9c3b8', roughness: 0.85 }),
  roof: new THREE.MeshStandardMaterial({ color: '#7a1d2a', roughness: 0.4, metalness: 0.2 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffc531', roughness: 0.25, metalness: 0.9 }),
  door: new THREE.MeshStandardMaterial({ color: '#2a0707', roughness: 0.9 }),
  window: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.5), toneMapped: false }),
  metal: new THREE.MeshStandardMaterial({ color: '#2f7cf6', roughness: 0.22, metalness: 0.65 }),
  metalDark: new THREE.MeshStandardMaterial({ color: '#1a2f5c', roughness: 0.35, metalness: 0.7 }),
  pillar: new THREE.MeshStandardMaterial({ color: '#e8edf7', roughness: 0.25, metalness: 0.4 }),
  tree: new THREE.MeshStandardMaterial({ color: '#2f8a3a', roughness: 0.8, flatShading: true }),
  treeDark: new THREE.MeshStandardMaterial({ color: '#246e2e', roughness: 0.8, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.9, flatShading: true }),
  mountain: new THREE.MeshStandardMaterial({ color: '#6f9a7a', roughness: 1, flatShading: true }),
  cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 }),
  flag: new THREE.MeshStandardMaterial({ color: '#ff3b3b', roughness: 0.6, side: THREE.DoubleSide }),
};

const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

// ---------- Escenario ----------
{
  const ground = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.grass), false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.42, 40);
  scene.add(ground);

  const trackLen = 56, trackZ = LEN / 2 + 1;
  const track = shadowed(new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.8, trackLen), [M.trackSide, M.trackSide, M.track, M.trackSide, M.trackSide, M.trackSide]), false, true);
  track.position.set(0, -0.4, trackZ);
  scene.add(track);

  for (const side of [-1, 1]) {
    const rail = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.55, trackLen, 3, 0.12), M.rail));
    rail.position.set(side * (HALF + 0.25), 0.1, trackZ);
    scene.add(rail);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, trackLen), M.neon);
    neon.position.set(side * (HALF + 0.25), 0.4, trackZ);
    scene.add(neon);
  }
  const line = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.04, 0.18), M.neon);
  line.position.set(0, 0.02, CANNON_Z + 0.35);
  scene.add(line);

  // Árboles y rocas (instanciados)
  const rnd = mulberry32(42);
  const trees = [];
  for (let i = 0; i < 220; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (7.5 + Math.pow(rnd(), 1.6) * 55);
    const z = -15 + rnd() * 120;
    if (Math.abs(x) < 9 && z > LEN - 4) continue;
    trees.push([x, z, 0.7 + rnd() * 0.9, rnd()]);
  }
  const coneA = new THREE.ConeGeometry(1.2, 2.6, 7).translate(0, 2.6, 0);
  const coneB = new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.8, 0);
  const crown = mergeGeometries([coneA, coneB]);
  const trunk = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6).translate(0, 0.7, 0);
  const crowns = shadowed(new THREE.InstancedMesh(crown, M.tree, trees.length), true, false);
  const trunks = shadowed(new THREE.InstancedMesh(trunk, M.trunk, trees.length), true, false);
  const dummy = new THREE.Object3D();
  trees.forEach(([x, z, s, r], i) => {
    dummy.position.set(x, -0.42, z);
    dummy.rotation.set(0, r * 6.28, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    trunks.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, new THREE.Color().setHSL(0.3 + r * 0.06, 0.55, 0.3 + r * 0.12));
  });
  scene.add(crowns, trunks);

  const rocks = shadowed(new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), M.rock, 50), true, true);
  for (let i = 0; i < 50; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    dummy.position.set(side * (6.6 + rnd() * 20), -0.4, -8 + rnd() * 90);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(0.5 + rnd(), 0.3 + rnd() * 0.5, 0.5 + rnd());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  scene.add(rocks);

  // Montañas lejanas
  for (let i = 0; i < 14; i++) {
    const h = 25 + rnd() * 35;
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.9, h, 6), M.mountain);
    m.position.set(-130 + i * 20 + rnd() * 8, h / 2 - 2, 150 + rnd() * 40);
    m.rotation.y = rnd() * 3;
    scene.add(m);
  }
}

// Nubes
const clouds = [];
{
  const rnd = mulberry32(7);
  for (let i = 0; i < 9; i++) {
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const s = new THREE.SphereGeometry(2 + rnd() * 2, 10, 8);
      s.translate((k - 2) * 2.6, rnd() * 1.2, rnd() * 2);
      parts.push(s);
    }
    const c = new THREE.Mesh(mergeGeometries(parts), M.cloud);
    c.position.set(-70 + rnd() * 140, 26 + rnd() * 14, 30 + rnd() * 90);
    c.scale.set(1, 0.6, 0.8);
    c.userData.speed = 0.6 + rnd() * 0.8;
    clouds.push(c);
    scene.add(c);
  }
}

// ---------- Personajes ----------
function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
function personGeometry(body, dark, eyes, crown) {
  const parts = [
    paint(new THREE.CapsuleGeometry(0.21, 0.3, 4, 12).translate(0, 0.38, 0), body),
    paint(new THREE.SphereGeometry(0.19, 16, 12).translate(0, 0.86, 0), body),
    paint(new THREE.CapsuleGeometry(0.075, 0.22, 3, 8).rotateZ(0.35).translate(0.25, 0.42, 0), dark),
    paint(new THREE.CapsuleGeometry(0.075, 0.22, 3, 8).rotateZ(-0.35).translate(-0.25, 0.42, 0), dark),
    paint(new THREE.CapsuleGeometry(0.08, 0.1, 3, 8).translate(0.1, 0.1, 0), dark),
    paint(new THREE.CapsuleGeometry(0.08, 0.1, 3, 8).translate(-0.1, 0.1, 0), dark),
  ];
  if (eyes) {
    parts.push(paint(new THREE.SphereGeometry(0.055, 10, 8).translate(0.075, 0.9, 0.15), '#ffffff'));
    parts.push(paint(new THREE.SphereGeometry(0.055, 10, 8).translate(-0.075, 0.9, 0.15), '#ffffff'));
    parts.push(paint(new THREE.SphereGeometry(0.03, 8, 6).translate(0.075, 0.9, 0.195), '#111111'));
    parts.push(paint(new THREE.SphereGeometry(0.03, 8, 6).translate(-0.075, 0.9, 0.195), '#111111'));
    parts.push(paint(new THREE.BoxGeometry(0.2, 0.035, 0.03).rotateZ(0.0).translate(0, 1.0, 0.15), '#3a0a0a'));
  }
  if (crown) {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.15, 0.09, 14).translate(0, 1.04, 0), crown));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(paint(new THREE.ConeGeometry(0.045, 0.12, 6).translate(Math.cos(a) * 0.13, 1.14, Math.sin(a) * 0.13), crown));
    }
  }
  return mergeGeometries(parts);
}

function crowd(geo, max) {
  const m = shadowed(new THREE.InstancedMesh(geo, M.unit, max), true, false);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const meshes = {
  blue: crowd(personGeometry('#2f7cf6', '#1d4fd6', false, null), MAX_BLUE + 50),
  red: crowd(personGeometry('#ef3b3b', '#a51e1e', true, null), MAX_RED),
  blueGiant: crowd(personGeometry('#2f7cf6', '#1d4fd6', false, '#ffc531'), MAX_GIANTS),
  redGiant: crowd(personGeometry('#ef3b3b', '#7a1212', true, '#2b2b2b'), MAX_GIANTS),
};

// ---------- Partículas (brillantes) y escombros ----------
const sparkMesh = new THREE.InstancedMesh(
  new THREE.OctahedronGeometry(0.09, 0),
  new THREE.MeshBasicMaterial({ toneMapped: false }),
  MAX_PARTICLES,
);
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

const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.6, 0.6), transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const shockwaves = [];
function shockwave(x, z, color, size = 12) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat.clone());
  m.material.color.copy(color);
  m.rotation.x = -Math.PI / 2;
  m.position.set(X(x), 0.15, z);
  m.userData = { life: 1, size };
  scene.add(m);
  shockwaves.push(m);
}

// ---------- Cañón ----------
const cannonGroup = new THREE.Group();
const barrelPivot = new THREE.Group();
const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8), toneMapped: false, transparent: true }));
const muzzleLight = new THREE.PointLight('#ffd27a', 0, 8, 2);
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
  barrelPivot.position.set(0, 0.85, 0);
  barrelPivot.rotation.x = -0.18;
  muzzle.position.set(0, 0, 1.9);
  muzzleLight.position.set(0, 0, 2);
  barrelPivot.add(muzzle, muzzleLight);
  cannonGroup.add(baseM, body, ring, barrelPivot);
  cannonGroup.position.z = CANNON_Z - 0.4;
  scene.add(cannonGroup);
}

// ---------- Castillo enemigo ----------
const castle = new THREE.Group();
let flagGeo;
{
  const add = (geo, mat, x, y, z) => { const m = shadowed(new THREE.Mesh(geo, mat)); m.position.set(x, y, z); castle.add(m); return m; };
  add(new THREE.BoxGeometry(10.6, 0.6, 4.6), M.stone, 0, 0.3, 1.5);
  add(new RoundedBoxGeometry(9.2, 4.2, 3.2, 2, 0.12), M.castle, 0, 2.6, 1.6);
  for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.75, 0.75, 0.75), M.castleDark, -3.9 + i * 1.3, 5.05, 0.35);
  add(new THREE.BoxGeometry(2.4, 2.8, 0.3), M.door, 0, 1.9, 0);
  add(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 24, 1, false, 0, Math.PI), M.door, 0, 3.3, 0).rotation.set(Math.PI / 2, 0, Math.PI / 2);
  const portal = add(new THREE.PlaneGeometry(2.1, 2.6), M.neonRed, 0, 1.9, -0.17);
  portal.rotation.y = Math.PI;
  portal.castShadow = false;
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(1.25, 1.4, 7, 20), M.castleDark, s * 4.6, 3.5, 1.2);
    add(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 20), M.stone, s * 4.6, 7.1, 1.2);
    add(new THREE.ConeGeometry(1.6, 2.6, 20), M.roof, s * 4.6, 8.6, 1.2);
    add(new THREE.SphereGeometry(0.22, 12, 10), M.gold, s * 4.6, 10, 1.2);
    for (const y of [3.2, 5.4]) {
      const w = add(new THREE.BoxGeometry(0.4, 0.7, 0.1), M.window, s * 4.6, y, -0.18);
      w.castShadow = false;
    }
    for (const x of [-2.2, 2.2]) {
      const w = add(new THREE.BoxGeometry(0.6, 0.8, 0.1), M.window, x, 3.4, -0.02);
      w.castShadow = false;
    }
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), M.metalDark, 0, 6.8, 2);
  flagGeo = new THREE.PlaneGeometry(2.2, 1.3, 16, 6).translate(1.1, 0, 0);
  flagGeo.userData.base = flagGeo.attributes.position.array.slice();
  const flag = add(flagGeo, M.flag, 0, 8.1, 2);
  flag.rotation.y = Math.PI;
  castle.position.z = LEN;
  scene.add(castle);
}

// ---------- Puertas ----------
const gateGeo = {
  pillar: new RoundedBoxGeometry(0.32, 2.3, 0.32, 2, 0.08),
  cap: new THREE.SphereGeometry(0.24, 14, 10),
};
const labelCache = new Map();
function gateMeshes(g) {
  const good = g.op.kind === 'mul';
  const color = new THREE.Color(good ? '#3d8bff' : '#3ddc84');
  const grp = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.32,
    roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(g.w, 2.05), panelMat);
  panel.position.y = 1.08;
  const beamMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6), toneMapped: false });
  const beam = shadowed(new THREE.Mesh(new RoundedBoxGeometry(g.w + 0.3, 0.26, 0.3, 2, 0.08), beamMat));
  beam.position.y = 2.25;
  grp.add(panel, beam);
  for (const s of [-1, 1]) {
    const p = shadowed(new THREE.Mesh(gateGeo.pillar, M.pillar));
    p.position.set(s * g.w / 2, 1.15, 0);
    const c = shadowed(new THREE.Mesh(gateGeo.cap, M.gold));
    c.position.set(s * g.w / 2, 2.42, 0);
    grp.add(p, c);
  }
  const key = g.op.label + good;
  if (!labelCache.has(key)) labelCache.set(key, labelTexture(g.op.label, good ? '#5fb0ff' : '#5dffa0'));
  const labelMat = new THREE.MeshBasicMaterial({ map: labelCache.get(key), transparent: true, toneMapped: false, depthWrite: false, color: new THREE.Color(1.25, 1.25, 1.25) });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), labelMat);
  label.position.set(0, 1.2, -0.06);
  label.rotation.y = Math.PI;
  label.renderOrder = 2;
  grp.add(label);
  grp.position.set(X(g.x), 0, g.z);
  scene.add(grp);
  return { grp, panelMat, beamMat, labelMat, label, base: color };
}

// ============================================================
// Estado de partida
// ============================================================
let state = 'menu'; // menu | play | win | lose
let units = [], particles = [], debris = [], gates = [];
let base, cannon, spawner;
let charge = 0, t = 0, endTimer = 0, firing = false, fireTimer = 0, earned = 0, blueCount = 0, redCount = 0;
let drag = null;
const keys = {};

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const OPS = [
  { kind: 'mul', v: 2, label: '×2' },
  { kind: 'mul', v: 3, label: '×3' },
  { kind: 'add', v: 5, label: '+5' },
  { kind: 'add', v: 10, label: '+10' },
];

function makeGate(id, x, w, z, op, amp, speed) {
  const g = { id, bit: 1 << id, x, w, z, op, amp, speed, phase: id * 1.7, flash: 0 };
  g.view = gateMeshes(g);
  return g;
}

function clearLevel() {
  for (const g of gates) {
    scene.remove(g.view.grp);
    g.view.grp.traverse((o) => { if (o.geometry && o.geometry !== gateGeo.pillar && o.geometry !== gateGeo.cap) o.geometry.dispose(); });
    g.view.panelMat.dispose(); g.view.beamMat.dispose(); g.view.labelMat.dispose();
  }
  for (const s of shockwaves) { scene.remove(s); s.geometry.dispose(); s.material.dispose(); }
  shockwaves.length = 0;
  gates = []; units = []; particles = []; debris = [];
  blueCount = 0; redCount = 0;
}

function buildLevel(n) {
  clearLevel();
  const rnd = mulberry32(n * 7919 + 17);
  const rows = Math.min(1 + Math.ceil(n / 2), 4);
  const pick = () => {
    const r = rnd();
    return r < 0.4 ? OPS[0] : r < 0.6 ? OPS[1] : r < 0.85 ? OPS[2] : OPS[3];
  };
  let id = 0;
  for (let i = 0; i < rows; i++) {
    const z = rows === 1 ? 16 : 8 + i * (22 / (rows - 1));
    if (rnd() < 0.45) {
      gates.push(makeGate(id++, -2.5, 4.4, z, pick(), 0, 0));
      gates.push(makeGate(id++, 2.5, 4.4, z, pick(), 0, 0));
    } else {
      const moving = n >= 3 && rnd() < 0.65;
      const x = moving ? 0 : (rnd() * 2 - 1) * 2.2;
      gates.push(makeGate(id++, x, 4.2, z, pick(), moving ? 2.6 : 0, 0.7 + rnd() * 0.9));
    }
  }
  const hp = 70 + n * 35;
  base = { hp, max: hp, flash: 0, wobble: 0 };
  cannon = { x: 0, tx: 0, recoil: 0 };
  spawner = {
    timer: 2.5, queue: 0, gap: 0, wave: 0,
    interval: Math.max(1.5, 3.4 - n * 0.15),
    size: 3 + Math.floor(n * 1.2),
    giantEvery: n >= 4 ? 3 : 0,
    giantHp: 8 + n,
  };
  charge = 0; t = 0; earned = 0; fireTimer = 0; firing = false; drag = null;
  castle.visible = true;
  castle.scale.setScalar(1);
  cannonGroup.visible = true;
}

function addUnit(team, x, z, giant, passed, hp) {
  if (team === 1 && !giant && redCount >= MAX_RED) return null;
  const u = {
    team, x, z, pz: z, vx: 0, giant,
    r: giant ? 0.7 : UNIT_R,
    hp: hp || 1, maxHp: hp || 1,
    passed: passed || 0,
    dead: false,
    phase: Math.random() * 6.28,
    spawn: 0,
  };
  units.push(u);
  if (team === 0) blueCount++; else redCount++;
  return u;
}

const tmpColor = new THREE.Color();
function burst(x, y, z, color, n, power, size = 1) {
  tmpColor.set(color);
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.4 + Math.random() * 0.8);
    const k = 1.2 + Math.random() * 1.6;
    particles.push({
      x, y, z,
      vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: power * (0.5 + Math.random()),
      life: 0.5 + Math.random() * 0.6, max: 1.1,
      r: tmpColor.r * k, g: tmpColor.g * k, b: tmpColor.b * k,
      s: size * (0.6 + Math.random() * 0.8), rot: Math.random() * 6,
    });
  }
}

function explodeDebris(x, y, z, colors, n, power, scale) {
  for (let i = 0; i < n && debris.length < MAX_DEBRIS; i++) {
    const c = new THREE.Color(colors[i % colors.length]);
    debris.push({
      x: x + (Math.random() - 0.5) * 8, y: y + Math.random() * 5, z: z + Math.random() * 3,
      vx: (Math.random() - 0.5) * power, vy: power * (0.6 + Math.random() * 0.8), vz: -Math.random() * power * 0.9,
      rx: Math.random() * 6, ry: Math.random() * 6, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 12,
      s: scale * (0.4 + Math.random() * 0.9), life: 3 + Math.random() * 1.5, c,
    });
  }
}

function kill(u) {
  if (u.dead) return;
  u.dead = true;
  if (u.team === 0) blueCount--; else redCount--;
}

// ---------- Acciones ----------
function shoot() {
  if (blueCount >= MAX_BLUE) return;
  addUnit(0, cannon.x + (Math.random() - 0.5) * 0.3, CANNON_Z + 0.9, false);
  charge = Math.min(chargeMax(), charge + 1);
  cannon.recoil = 1;
  sfx('shoot', 520, 0.05, 'triangle', 0.025, -200, 0.07);
}

function launchGiant() {
  if (state !== 'play' || charge < chargeMax()) return;
  addUnit(0, cannon.x, CANNON_Z + 1.1, true, 0, giantHp());
  charge = 0;
  cannon.recoil = 1.8;
  camShake.amp = Math.max(camShake.amp, 0.35);
  burst(cannon.x, 1.2, CANNON_Z + 1.6, '#ffc531', 30, 6);
  sfx('giant', 140, 0.35, 'sawtooth', 0.06, 200, 0);
  boom(0.12, 0.4);
  vibrate(40);
}

function screenFlash(strength) {
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = strength;
  requestAnimationFrame(() => { f.style.transition = 'opacity .6s ease-out'; f.style.opacity = 0; });
}

function win() {
  state = 'win';
  endTimer = 2.0;
  const reward = 25 + save.level * 8;
  save.coins += reward;
  save.level += 1;
  persist();
  castle.visible = false;
  explodeDebris(0, 0.5, LEN, ['#d93a3a', '#a82424', '#c9c3b8', '#7a1d2a', '#ffc531'], MAX_DEBRIS, 14, 1.1);
  burst(0, 3, LEN + 1, '#ffc531', 220, 12, 1.6);
  burst(0, 3, LEN + 1, '#ff5a3a', 160, 10, 1.4);
  shockwave(0, LEN + 1, new THREE.Color(2.5, 1.6, 0.6), 22);
  camShake.amp = 1.1;
  screenFlash(0.7);
  for (const u of units) if (u.team === 1) { burst(u.x, 0.6, u.z, '#ff5a3a', 3, 4); kill(u); }
  boom(0.35, 1.4);
  sfx('win', 440, 0.6, 'square', 0.05, 440, 0);
  vibrate([60, 40, 120]);
  showOverlay('¡Victoria!', `+${reward} monedas`, `Nivel ${save.level}`);
}

function lose() {
  state = 'lose';
  endTimer = 1.4;
  const reward = Math.floor(earned / 4);
  save.coins += reward;
  persist();
  cannonGroup.visible = false;
  explodeDebris(cannon.x, 0.2, CANNON_Z - 0.6, ['#2f7cf6', '#1a2f5c', '#ffc531'], 40, 9, 0.5);
  burst(cannon.x, 1, CANNON_Z, '#5fb0ff', 120, 8, 1.4);
  shockwave(cannon.x, CANNON_Z, new THREE.Color(0.6, 1.4, 3), 10);
  camShake.amp = 0.9;
  screenFlash(0.5);
  boom(0.3, 1.0);
  sfx('lose', 300, 0.6, 'sawtooth', 0.05, -220, 0);
  vibrate(220);
  showOverlay('Te han invadido', reward ? `+${reward} monedas por daño` : 'Inténtalo otra vez', 'Reintentar');
}

// ============================================================
// Simulación
// ============================================================
const redGrid = new Map();

function update(dt) {
  t += dt;

  if (keys.ArrowLeft) cannon.tx -= 9 * dt;
  if (keys.ArrowRight) cannon.tx += 9 * dt;
  cannon.tx = Math.max(-HALF + 1.1, Math.min(HALF - 1.1, cannon.tx));
  cannon.x += (cannon.tx - cannon.x) * Math.min(1, dt * 18);

  updateGates(dt);
  base.flash = Math.max(0, base.flash - dt * 5);

  fireTimer -= dt;
  if (firing || keys.Space) {
    while (fireTimer <= 0) { shoot(); fireTimer += 1 / fireRate(); }
  } else if (fireTimer < 0) {
    fireTimer = 0;
  }

  const sp = spawner;
  sp.timer -= dt;
  if (sp.timer <= 0) {
    sp.wave++;
    sp.queue += sp.size + Math.floor(sp.wave / 3);
    sp.timer = sp.interval;
    if (sp.giantEvery && sp.wave % sp.giantEvery === 0) {
      addUnit(1, (Math.random() - 0.5) * 2, LEN - 1, true, 0, sp.giantHp);
    }
  }
  if (sp.queue > 0) {
    sp.gap -= dt;
    if (sp.gap <= 0) {
      sp.gap = 0.11;
      sp.queue--;
      addUnit(1, (Math.random() - 0.5) * 2, LEN - 0.6, false);
    }
  }

  const decay = Math.pow(0.02, dt);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.dead) continue;
    u.pz = u.z;
    u.spawn = Math.min(1, u.spawn + dt * 6);
    if (u.team === 0) u.z += BLUE_SPEED * (u.giant ? 0.6 : 1) * dt;
    else {
      u.z -= RED_SPEED * (u.giant ? 0.7 : 1) * dt;
      // Al salir de la puerta se abren en abanico
      if (u.z > LEN - 4 && !u.giant) u.vx += (u.x >= 0 ? 1 : -1) * 6 * dt * Math.random();
    }
    u.x += u.vx * dt;
    u.vx *= decay;
    u.phase += dt * (u.giant ? 7 : 13);
    const lim = HALF - u.r;
    if (u.x < -lim) u.x = -lim; else if (u.x > lim) u.x = lim;

    if (u.team === 0 && !u.giant) {
      for (const g of gates) {
        if (!(u.passed & g.bit) && u.pz < g.z && u.z >= g.z && Math.abs(u.x - g.x) <= g.w / 2) {
          u.passed |= g.bit;
          g.flash = 1;
          const n = g.op.kind === 'mul' ? g.op.v - 1 : g.op.v;
          for (let k = 0; k < n && blueCount < MAX_BLUE; k++) {
            const c = addUnit(0, u.x + (Math.random() - 0.5) * 0.8, u.z - Math.random() * 0.6, false, u.passed);
            c.pz = c.z;
            c.vx = (Math.random() - 0.5) * 5;
          }
          burst(u.x, 1.2, g.z, g.op.kind === 'mul' ? '#5fb0ff' : '#5dffa0', 2, 3, 0.7);
          sfx('gate', 880, 0.06, 'square', 0.02, 300, 0.06);
        }
      }
    }

    if (u.team === 0 && u.z >= LEN - 0.3) {
      base.hp -= u.hp;
      earned += u.hp;
      base.flash = 1;
      base.wobble = Math.min(1, base.wobble + (u.giant ? 1 : 0.15));
      burst(u.x, 1.2, LEN - 0.3, '#ffd34d', u.giant ? 40 : 4, u.giant ? 9 : 4);
      if (u.giant) { camShake.amp = Math.max(camShake.amp, 0.45); shockwave(u.x, LEN - 0.5, new THREE.Color(2.5, 1.6, 0.6), 8); boom(0.2, 0.6); vibrate(30); }
      sfx('hit', 180, 0.08, 'square', 0.03, -60, 0.05);
      kill(u);
    } else if (u.team === 1 && u.z <= CANNON_Z + 0.2) {
      kill(u);
      lose();
      return;
    }
  }

  redGrid.clear();
  for (const u of units) {
    if (u.dead || u.team !== 1) continue;
    const k = Math.floor(u.z);
    let list = redGrid.get(k);
    if (!list) redGrid.set(k, (list = []));
    list.push(u);
  }
  for (const b of units) {
    if (b.dead || b.team !== 0) continue;
    const k = Math.floor(b.z);
    outer: for (let kk = k - 2; kk <= k + 2; kk++) {
      const list = redGrid.get(kk);
      if (!list) continue;
      for (const r of list) {
        if (r.dead) continue;
        const dx = b.x - r.x, dz = b.z - r.z, rr = b.r + r.r;
        if (dx * dx + dz * dz < rr * rr) {
          const d = Math.min(b.hp, r.hp);
          b.hp -= d; r.hp -= d;
          const mx = (b.x + r.x) / 2, mz = (b.z + r.z) / 2;
          if (r.hp <= 0) { kill(r); burst(mx, 0.7, mz, '#ff4a3a', r.giant ? 30 : 5, r.giant ? 7 : 4); if (r.giant) { camShake.amp = Math.max(camShake.amp, 0.3); boom(0.15, 0.5); } }
          if (b.hp <= 0) { kill(b); burst(mx, 0.7, mz, '#4a9bff', b.giant ? 30 : 4, b.giant ? 7 : 4); }
          sfx('pop', 300 + Math.random() * 200, 0.04, 'triangle', 0.02, -100, 0.04);
          if (b.dead) break outer;
        }
      }
    }
  }

  let j = 0;
  for (let i = 0; i < units.length; i++) if (!units[i].dead) units[j++] = units[i];
  units.length = j;

  updateFx(dt);

  if (base.hp <= 0) { base.hp = 0; win(); }
}

function updateGates(dt) {
  for (const g of gates) {
    if (g.amp) g.x = Math.sin(t * g.speed + g.phase) * g.amp;
    g.flash = Math.max(0, g.flash - dt * 4);
  }
}

function updateFx(dt) {
  let j = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy -= 16 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rot += dt * 8;
    if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; }
    particles[j++] = p;
  }
  particles.length = j;

  j = 0;
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i];
    d.life -= dt;
    if (d.life <= 0) continue;
    d.vy -= 22 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.rx += d.wx * dt; d.ry += d.wy * dt;
    const floor = d.s * 0.5;
    if (d.y < floor) { d.y = floor; d.vy *= -0.3; d.vx *= 0.7; d.vz *= 0.7; d.wx *= 0.6; d.wy *= 0.6; }
    debris[j++] = d;
  }
  debris.length = j;

  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.userData.life -= dt * 1.6;
    if (s.userData.life <= 0) {
      scene.remove(s); s.geometry.dispose(); s.material.dispose();
      shockwaves.splice(i, 1);
      continue;
    }
    const k = 1 - s.userData.life;
    s.scale.setScalar(0.5 + k * s.userData.size);
    s.material.opacity = s.userData.life;
  }
}

function updateIdle(dt) {
  t += dt;
  updateGates(dt);
  updateFx(dt);
  if (base) { base.flash = Math.max(0, base.flash - dt * 5); }
  // Las unidades restantes siguen avanzando tras la victoria
  if (state === 'win') {
    for (const u of units) { u.z += BLUE_SPEED * 0.5 * dt; u.phase += dt * 13; }
  }
  if (endTimer > 0) {
    endTimer -= dt;
    if (endTimer <= 0) $('overlay').classList.add('show');
  }
}

// ============================================================
// Sincronización de la escena con el estado
// ============================================================
const dummy = new THREE.Object3D();
const counts = { blue: 0, red: 0, blueGiant: 0, redGiant: 0 };
const sparkColor = new THREE.Color();

function syncScene(dt) {
  // Personajes
  counts.blue = counts.red = counts.blueGiant = counts.redGiant = 0;
  for (const u of units) {
    const key = u.team === 0 ? (u.giant ? 'blueGiant' : 'blue') : (u.giant ? 'redGiant' : 'red');
    const mesh = meshes[key];
    const i = counts[key];
    if (i >= mesh.instanceMatrix.count) continue;
    counts[key] = i + 1;
    const step = Math.sin(u.phase);
    const sc = (u.giant ? 1.5 + 0.8 * (u.hp / u.maxHp) : 0.95) * (0.4 + 0.6 * u.spawn);
    dummy.position.set(X(u.x), Math.abs(step) * 0.09 * sc, u.z);
    dummy.rotation.set(0.12 * (u.team === 0 ? 1 : -1), (u.team === 0 ? 0 : Math.PI) + u.vx * -0.06, step * 0.1);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  for (const k in meshes) {
    meshes[k].count = counts[k];
    meshes[k].instanceMatrix.needsUpdate = true;
  }

  // Partículas
  const pn = Math.min(particles.length, MAX_PARTICLES);
  for (let i = 0; i < pn; i++) {
    const p = particles[i];
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

  // Escombros
  const dn = Math.min(debris.length, MAX_DEBRIS);
  for (let i = 0; i < dn; i++) {
    const d = debris[i];
    const fade = Math.min(1, d.life);
    dummy.position.set(X(d.x), d.y, d.z);
    dummy.rotation.set(d.rx, d.ry, 0);
    dummy.scale.setScalar(d.s * fade);
    dummy.updateMatrix();
    debrisMesh.setMatrixAt(i, dummy.matrix);
    debrisMesh.setColorAt(i, d.c);
  }
  debrisMesh.count = dn;
  debrisMesh.instanceMatrix.needsUpdate = true;
  if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;

  // Puertas
  for (const g of gates) {
    const v = g.view;
    v.grp.position.x = X(g.x);
    v.panelMat.emissiveIntensity = 0.35 + g.flash * 2.5;
    v.panelMat.opacity = 0.32 + g.flash * 0.25;
    v.beamMat.color.copy(v.base).multiplyScalar(1.6 + g.flash * 2.5);
    const ls = 1 + g.flash * 0.18 + Math.sin(t * 3 + g.phase) * 0.03;
    v.label.scale.setScalar(ls);
  }

  // Cañón
  if (cannon) {
    cannonGroup.position.x = X(cannon.x);
    cannon.recoil = Math.max(0, cannon.recoil - dt * 7);
    barrelPivot.position.z = -cannon.recoil * 0.25;
    barrelPivot.rotation.z = (cannon.tx - cannon.x) * 0.08;
    const m = Math.max(0, cannon.recoil - 0.4);
    muzzle.scale.setScalar(0.2 + m * 1.2);
    muzzle.material.opacity = Math.min(1, m * 1.6);
    muzzleLight.intensity = m * 25;
  }

  // Castillo
  if (base) {
    base.wobble = Math.max(0, base.wobble - dt * 3);
    const e = base.flash * 0.45;
    M.castle.emissiveIntensity = e;
    M.castleDark.emissiveIntensity = e;
    castle.scale.set(1 + base.wobble * 0.03, 1 - base.wobble * 0.04, 1 + base.wobble * 0.03);
    const dmg = 1 - base.hp / base.max;
    castle.rotation.z = Math.sin(t * 40) * base.wobble * 0.01 + dmg * 0.02;
  }
  // Bandera ondeando
  const pos = flagGeo.attributes.position;
  const b = flagGeo.userData.base;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3];
    pos.array[i * 3 + 2] = Math.sin(x * 2.4 - t * 7) * 0.18 * (x / 2.2);
  }
  pos.needsUpdate = true;
  flagGeo.computeVertexNormals();

  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 90) c.position.x = -90;
  }

  // Cámara
  camShake.amp = Math.max(0, camShake.amp - dt * 1.8);
  const s = camShake.amp * camShake.amp;
  const camX = cannon ? X(cannon.x) * 0.18 : 0;
  camera.position.set(
    CAM_BASE.x + camX + (Math.random() - 0.5) * s,
    CAM_BASE.y + (Math.random() - 0.5) * s,
    CAM_BASE.z + (Math.random() - 0.5) * s * 0.5,
  );
  camera.lookAt(CAM_LOOK.x + camX * 0.5, CAM_LOOK.y, CAM_LOOK.z);
}

// ---------- Tamaño y calidad ----------
let worldPerPx = 0.02;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
  // Encaja el ancho de la pista en vertical; en horizontal, un FOV fijo
  const dist = CAM_BASE.distanceTo(new THREE.Vector3(0, 0, CANNON_Z));
  const hHalf = Math.atan(6.6 / dist);
  const vfov = THREE.MathUtils.clamp(2 * Math.atan(Math.tan(hHalf) / aspect), 0.8, 1.35);
  camera.fov = THREE.MathUtils.radToDeg(vfov);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  worldPerPx = (2 * dist * Math.tan(vfov / 2)) / h;
}

let perfFrames = 0, perfTime = 0, perfDone = false;
function adaptQuality(dt) {
  if (perfDone || state !== 'play') return;
  perfFrames++; perfTime += dt;
  if (perfFrames >= 120) {
    perfDone = true;
    const avg = perfTime / perfFrames;
    if (avg > 0.024 && pixelRatio > 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      resize();
    }
  }
}

// ============================================================
// HUD y menús
// ============================================================
const hud = { lvl: -1, coins: -1, hp: -1, p: -1, ready: null, muted: null };
function updateHud() {
  if (hud.lvl !== save.level) $('lvl').textContent = `Nivel ${(hud.lvl = save.level)}`;
  if (hud.coins !== save.coins) $('coins').textContent = (hud.coins = save.coins);
  const hp = base ? Math.max(0, Math.ceil(base.hp)) : 0;
  if (base && hud.hp !== hp) {
    hud.hp = hp;
    $('basefill').style.transform = `scaleX(${hp / base.max})`;
    $('basehp').textContent = hp;
  }
  const p = Math.round((charge / chargeMax()) * 100) / 100;
  if (hud.p !== p) { hud.p = p; $('giant').style.setProperty('--p', p); }
  const ready = state === 'play' && charge >= chargeMax();
  if (hud.ready !== ready) { hud.ready = ready; $('giant').classList.toggle('ready', ready); }
  if (hud.muted !== save.muted) { hud.muted = save.muted; $('mute').textContent = save.muted ? '🔇' : '🔊'; }
}

function refreshUpgrades() {
  for (const [key, id, label] of [['rate', 'up-rate', 'Cadencia'], ['giant', 'up-giant', 'Gigante']]) {
    const lvl = save[key];
    const btn = $(id);
    btn.querySelector('b').textContent = label;
    btn.querySelector('small').textContent = `Nivel ${lvl + 1}`;
    if (lvl >= MAX_UP) {
      btn.querySelector('em').textContent = 'MÁX';
      btn.disabled = true;
    } else {
      const cost = upCost(lvl);
      btn.querySelector('em').textContent = `● ${cost}`;
      btn.disabled = save.coins < cost;
    }
  }
}

function buyUpgrade(key) {
  const lvl = save[key];
  if (lvl >= MAX_UP) return;
  const cost = upCost(lvl);
  if (save.coins < cost) return;
  save.coins -= cost;
  save[key] = lvl + 1;
  persist();
  ensureAudio();
  sfx('buy', 660, 0.12, 'square', 0.04, 330, 0);
  refreshUpgrades();
}

function showOverlay(title, sub, playLabel) {
  $('ov-title').textContent = title;
  $('ov-sub').textContent = sub;
  $('play').textContent = playLabel;
  refreshUpgrades();
  $('giant').classList.add('hidden');
}

function startGame() {
  ensureAudio();
  buildLevel(save.level);
  state = 'play';
  endTimer = 0;
  $('overlay').classList.remove('show');
  $('giant').classList.remove('hidden');
}

// ---------- Entrada ----------
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  ensureAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
  drag = { id: e.pointerId, sx: e.clientX, cx: cannon.tx };
  firing = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || state !== 'play') return;
  cannon.tx = drag.cx + (e.clientX - drag.sx) * worldPerPx * 1.25;
});
const endDrag = (e) => {
  if (drag && e.pointerId === drag.id) { drag = null; firing = false; }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyG') launchGiant();
  if (e.code === 'Space') { e.preventDefault(); ensureAudio(); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { firing = false; drag = null; for (const k in keys) keys[k] = false; }
});

$('giant').addEventListener('click', launchGiant);
$('play').addEventListener('click', startGame);
$('up-rate').addEventListener('click', () => buyUpgrade('rate'));
$('up-giant').addEventListener('click', () => buyUpgrade('giant'));
$('mute').addEventListener('click', () => { save.muted = !save.muted; persist(); ensureAudio(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// Bucle principal
// ============================================================
window.addEventListener('resize', resize);
resize();
buildLevel(save.level);
showOverlay('Mob Rush', 'Arrastra para apuntar · mantén pulsado para disparar', save.level > 1 ? `Jugar nivel ${save.level}` : 'Jugar');

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.033, clock.getDelta());
  if (state === 'play') update(dt); else updateIdle(dt);
  syncScene(dt);
  composer.render();
  updateHud();
  adaptQuality(dt);
});

requestAnimationFrame(() => $('loader').classList.add('done'));
window.__mobrush = { get state() { return state; }, get units() { return units.length; }, get base() { return base; }, save };
