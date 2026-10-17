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

// ============================================================
// Mundos: cada nivel cambia de mundo (cielo, suelo, decorado, clima y base enemiga)
// ============================================================
const THEMES = [
  {
    name: 'Pradera', skyTop: '#2f7fe0', skyMid: '#7cc0ff', horizon: '#bfe3ff', sunStrength: 1,
    fog: [55, 150], sun: '#fff4e0', sunI: 2.1, hemiSky: '#cfe8ff', hemiGround: '#3d6b2a', hemiI: 0.7, exposure: 0.95, env: 0.55,
    ground: { base: '#4fae45', hue: [100, 120], sat: 55, light: [30, 55] },
    track: { hue: 220, sat: 45, light: 52, side: '#5f7db3', rail: '#dfe6f5' }, neon: [0.35, 0.9, 2.2],
    props: 'pines', base: 'castle', weather: null, far: 'mountains', farColor: '#6f9a7a', clouds: true,
  },
  {
    name: 'Desierto', skyTop: '#2f86d8', skyMid: '#8fc9f2', horizon: '#f6dcae', sunStrength: 1.4,
    fog: [50, 140], sun: '#ffe6b8', sunI: 2.5, hemiSky: '#ffe9c4', hemiGround: '#a8743a', hemiI: 0.75, exposure: 0.95, env: 0.5,
    ground: { base: '#e2b76c', hue: [32, 42], sat: 60, light: [58, 76] },
    track: { hue: 26, sat: 38, light: 56, side: '#a8773f', rail: '#f3e2c2' }, neon: [2.4, 1.3, 0.25],
    props: 'cactus', base: 'pyramid', weather: 'dust', far: 'dunes', farColor: '#d9a35e', clouds: true,
  },
  {
    name: 'Glaciar', skyTop: '#3f74b8', skyMid: '#a3c8ec', horizon: '#e8f3ff', sunStrength: 0.8,
    fog: [60, 160], sun: '#e8f2ff', sunI: 1.5, hemiSky: '#d8e8fa', hemiGround: '#7f98b5', hemiI: 0.55, exposure: 0.82, env: 0.45, bloom: 1.6,
    ground: { base: '#cfdcea', hue: [205, 215], sat: 30, light: [74, 88] },
    track: { hue: 200, sat: 40, light: 58, side: '#7d9fc0', rail: '#ffffff' }, neon: [0.5, 1.7, 2.6],
    props: 'snowpines', base: 'ice', weather: 'snow', far: 'mountains', farColor: '#dbe8f5', clouds: true,
  },
  {
    name: 'Volcán', skyTop: '#1c0a10', skyMid: '#6a2216', horizon: '#c8582a', sunStrength: 0.6,
    fog: [32, 115], sun: '#ffb080', sunI: 1.7, hemiSky: '#ff9a6a', hemiGround: '#2a1010', hemiI: 0.6, exposure: 1.05, env: 0.35,
    ground: { base: '#2b2524', hue: [10, 20], sat: 12, light: [9, 20], lava: true },
    track: { hue: 14, sat: 10, light: 30, side: '#3a2a26', rail: '#4a3a36' }, neon: [2.8, 0.75, 0.12],
    props: 'lava', base: 'volcano', weather: 'embers', far: 'volcanoes', farColor: '#3a2422', clouds: false,
  },
  {
    name: 'Ciudad neón', skyTop: '#04041a', skyMid: '#1a1450', horizon: '#5a2a8a', sunStrength: 0,
    fog: [38, 130], sun: '#9fb4ff', sunI: 1.1, hemiSky: '#7a6aff', hemiGround: '#100820', hemiI: 0.75, exposure: 1.15, env: 0.5,
    ground: { base: '#14142a', hue: [240, 260], sat: 25, light: [8, 16] },
    track: { hue: 250, sat: 30, light: 24, side: '#2a2450', rail: '#3a3466' }, neon: [2.4, 0.3, 2.2],
    props: 'city', base: 'cyber', weather: 'stars', far: 'towers', farColor: '#1a1838', clouds: false,
  },
];
const themeFor = (n) => THEMES[(n - 1) % THEMES.length];
const isBoss = (n) => n % 5 === 0;
const stagesFor = (n) => (isBoss(n) ? 1 : n < 3 ? 1 : n < 7 ? 2 : 3);

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
scene.fog = new THREE.Fog('#bfe3ff', 55, 150);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
const CAM_BASE = new THREE.Vector3(0, 12.5, -10.5);
const CAM_LOOK = new THREE.Vector3(0, 0, 15);
const camShake = { amp: 0, dolly: 0 };

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Recursos con ciclo de vida: se liberan al cambiar de mundo ('env'), de fase ('stage') o de base ('base')
const scopes = { env: [], stage: [], base: [] };
const own = (scope, res) => { scopes[scope].push(res); return res; };
function freeScope(scope) {
  for (const r of scopes[scope]) {
    if (r.isObject3D) {
      r.removeFromParent();
      if (r.isInstancedMesh) r.dispose();
    } else {
      r.dispose();
    }
  }
  scopes[scope].length = 0;
}

// ---------- Cielo ----------
const skyUniforms = {
  top: { value: new THREE.Color() },
  mid: { value: new THREE.Color() },
  bottom: { value: new THREE.Color() },
  sunDir: { value: new THREE.Vector3(0.35, 0.35, 0.87).normalize() },
  sunStrength: { value: 1 },
};
{
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyUniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform float sunStrength; varying vec3 vDir;
        void main(){
          float h = vDir.y;
          vec3 c = mix(bottom, mid, smoothstep(-0.02, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.75, h));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          c += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25) * sunStrength;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);
}

// ---------- Luces ----------
const hemi = new THREE.HemisphereLight('#cfe8ff', '#3d6b2a', 0.7);
scene.add(hemi);
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

function trackTexture(tr) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = `hsl(${tr.hue}, ${tr.sat}%, ${tr.light - 14}%)`; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const l = tr.light + Math.random() * 7;
        g.fillStyle = `hsl(${tr.hue}, ${tr.sat}%, ${l}%)`;
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        g.fillStyle = 'rgba(255,255,255,.10)';
        g.fillRect(x * 64 + 2, y * 64 + 2, 60, 6);
      }
    }
  }, [2.5, 13]);
}

function groundTextures(gr) {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = gr.base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const hue = gr.hue[0] + Math.random() * (gr.hue[1] - gr.hue[0]);
      const l = gr.light[0] + Math.random() * (gr.light[1] - gr.light[0]);
      g.fillStyle = `hsla(${hue}, ${gr.sat}%, ${l}%, .5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2 + Math.random() * 3);
    }
  }, [60, 60]);
  if (!gr.lava) return { map, emissive: null };
  const emissive = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff7a1a'; g.lineWidth = 2.5; g.shadowColor = '#ff5a00'; g.shadowBlur = 6;
    for (let k = 0; k < 7; k++) {
      let x = Math.random() * w, y = Math.random() * h;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); }
      g.stroke();
    }
  }, [60, 60]);
  return { map, emissive };
}

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

const hazardTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1b1b';
  for (let x = -h; x < w + h; x += 48) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 - h, h); g.lineTo(x - h, h); g.fill();
  }
});

const softDot = canvasTex(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

const windowTex = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let y = 4; y < h; y += 10) {
    for (let x = 4; x < w; x += 10) {
      if (Math.random() < 0.45) {
        g.fillStyle = Math.random() < 0.5 ? '#7af0ff' : '#ff8af0';
        g.fillRect(x, y, 5, 6);
      }
    }
  }
});

// ---------- Materiales compartidos ----------
const M = {
  track: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.1 }),
  trackSide: new THREE.MeshStandardMaterial({ color: '#5f7db3', roughness: 0.6 }),
  rail: new THREE.MeshStandardMaterial({ color: '#dfe6f5', roughness: 0.3, metalness: 0.3 }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 2.2), toneMapped: false }),
  neonRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.12, 0.08), toneMapped: false }),
  ground: new THREE.MeshStandardMaterial({ roughness: 1, emissive: '#ffffff', emissiveIntensity: 0 }),
  unit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.05 }),
  prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffc531', roughness: 0.25, metalness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: '#2f7cf6', roughness: 0.22, metalness: 0.65 }),
  metalDark: new THREE.MeshStandardMaterial({ color: '#1a2f5c', roughness: 0.35, metalness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: '#c8d0dc', roughness: 0.18, metalness: 0.95 }),
  pillar: new THREE.MeshStandardMaterial({ color: '#e8edf7', roughness: 0.25, metalness: 0.4 }),
  hazard: new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.4, metalness: 0.2 }),
  cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 }),
  lavaGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.8, 0.15), toneMapped: false }),
  building: new THREE.MeshStandardMaterial({ color: '#ffffff', map: windowTex, emissiveMap: windowTex, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.4 }),
};

const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

// ---------- Pista (fija; cambia de material según el mundo) ----------
{
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
  const ground = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(600, 600), M.ground), false, true);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.42, 40);
  scene.add(ground);
}

// ---------- Utilidades de geometría ----------
function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const PROP_GEO = {
  pine: mergeGeometries([
    paint(new THREE.ConeGeometry(1.2, 2.6, 7).translate(0, 2.6, 0), '#2f8a3a'),
    paint(new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.8, 0), '#3a9a45'),
    paint(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6).translate(0, 0.7, 0), '#7a5233'),
  ]),
  snowpine: mergeGeometries([
    paint(new THREE.ConeGeometry(1.2, 2.6, 7).translate(0, 2.6, 0), '#2a6448'),
    paint(new THREE.ConeGeometry(0.85, 1.0, 7).translate(0, 3.3, 0), '#f4f8ff'),
    paint(new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.8, 0), '#2f6f50'),
    paint(new THREE.ConeGeometry(0.5, 0.8, 7).translate(0, 4.55, 0), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6).translate(0, 0.7, 0), '#6a4a33'),
  ]),
  cactus: mergeGeometries([
    paint(new THREE.CapsuleGeometry(0.35, 2.2, 4, 8).translate(0, 1.45, 0), '#3f9a4a'),
    paint(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8).rotateZ(Math.PI / 2).translate(0.45, 1.35, 0), '#3f9a4a'),
    paint(new THREE.CapsuleGeometry(0.22, 0.8, 3, 8).translate(0.75, 1.85, 0), '#46a852'),
    paint(new THREE.CapsuleGeometry(0.18, 0.4, 3, 8).rotateZ(Math.PI / 2).translate(-0.4, 1.0, 0), '#3f9a4a'),
    paint(new THREE.CapsuleGeometry(0.19, 0.6, 3, 8).translate(-0.65, 1.35, 0), '#46a852'),
    paint(new THREE.SphereGeometry(0.12, 6, 5).translate(0, 2.95, 0), '#ff5d8f'),
  ]),
  deadtree: mergeGeometries([
    paint(new THREE.CylinderGeometry(0.12, 0.25, 3, 6).translate(0, 1.5, 0), '#241c1a'),
    paint(new THREE.CylinderGeometry(0.06, 0.1, 1.4, 5).rotateZ(0.9).translate(0.5, 2.3, 0), '#241c1a'),
    paint(new THREE.CylinderGeometry(0.05, 0.09, 1.1, 5).rotateZ(-0.8).translate(-0.4, 2.0, 0), '#241c1a'),
  ]),
};
const rockGeo = (hex) => paint(new THREE.DodecahedronGeometry(0.7, 0), hex);

function scatter(rnd, count, minX = 7.5, maxX = 62) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (minX + Math.pow(rnd(), 1.6) * (maxX - minX));
    const z = -15 + rnd() * 125;
    if (Math.abs(x) < 10 && z > LEN - 5 && z < LEN + 8) continue;
    out.push([x, z, 0.7 + rnd() * 0.9, rnd()]);
  }
  return out;
}

function instanced(scope, geo, mat, list, setup, cast = true) {
  const mesh = shadowed(new THREE.InstancedMesh(geo, mat, list.length), cast, false);
  const d = new THREE.Object3D();
  const c = new THREE.Color();
  list.forEach((p, i) => {
    setup(d, p, c);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, c);
  });
  scene.add(own(scope, mesh));
  return mesh;
}

// ---------- Construcción del mundo ----------
let weather = null;
const clouds = [];
let currentTheme = null;
let t = 0;

function buildEnvironment(theme) {
  if (currentTheme === theme) return;
  currentTheme = theme;
  freeScope('env');
  clouds.length = 0;
  weather = null;
  const rnd = mulberry32(theme.name.length * 977 + 3);

  // Cielo, niebla y luces
  skyUniforms.top.value.set(theme.skyTop);
  skyUniforms.mid.value.set(theme.skyMid);
  skyUniforms.bottom.value.set(theme.horizon);
  skyUniforms.sunStrength.value = theme.sunStrength;
  scene.fog.color.set(theme.horizon);
  scene.fog.near = theme.fog[0];
  scene.fog.far = theme.fog[1];
  hemi.color.set(theme.hemiSky);
  hemi.groundColor.set(theme.hemiGround);
  hemi.intensity = theme.hemiI;
  sun.color.set(theme.sun);
  sun.intensity = theme.sunI;
  renderer.toneMappingExposure = theme.exposure;
  bloom.threshold = theme.bloom || 1.0;
  scene.environmentIntensity = theme.env;

  // Pista y suelo
  M.track.map = own('env', trackTexture(theme.track));
  M.track.needsUpdate = true;
  M.trackSide.color.set(theme.track.side);
  M.rail.color.set(theme.track.rail);
  M.neon.color.setRGB(...theme.neon);
  const gt = groundTextures(theme.ground);
  M.ground.map = own('env', gt.map);
  M.ground.emissiveMap = gt.emissive ? own('env', gt.emissive) : null;
  M.ground.emissiveIntensity = gt.emissive ? 1.6 : 0;
  M.ground.needsUpdate = true;

  // Decorado
  const tree = (d, [x, z, s, r], c) => {
    d.position.set(x, -0.42, z); d.rotation.set(0, r * 6.28, 0); d.scale.setScalar(s);
    const k = 0.82 + r * 0.36; c.setRGB(k, k, k);
  };
  const rock = (d, [x, z, s, r], c) => {
    d.position.set(x, -0.4, z); d.rotation.set(r * 3, r * 5, r * 2); d.scale.set(s, s * 0.6, s * 1.1);
    const k = 0.85 + r * 0.3; c.setRGB(k, k, k);
  };
  switch (theme.props) {
    case 'pines':
      instanced('env', PROP_GEO.pine, M.prop, scatter(rnd, 220), tree);
      instanced('env', own('env', rockGeo('#9aa0a8')), M.prop, scatter(rnd, 60, 6.6, 30), rock);
      break;
    case 'snowpines':
      instanced('env', PROP_GEO.snowpine, M.prop, scatter(rnd, 200), tree);
      instanced('env', own('env', rockGeo('#c9d6e4')), M.prop, scatter(rnd, 60, 6.6, 30), rock);
      break;
    case 'cactus':
      instanced('env', PROP_GEO.cactus, M.prop, scatter(rnd, 110), tree);
      instanced('env', own('env', rockGeo('#c48a4a')), M.prop, scatter(rnd, 90, 6.6, 40), rock);
      break;
    case 'lava':
      instanced('env', PROP_GEO.deadtree, M.prop, scatter(rnd, 90), tree);
      instanced('env', own('env', rockGeo('#3a3030')), M.prop, scatter(rnd, 110, 6.6, 45), rock);
      instanced('env', own('env', new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), M.lavaGlow, scatter(rnd, 26, 9, 45), (d, [x, z, s], c) => {
        d.position.set(x, -0.39, z); d.rotation.set(0, 0, 0); d.scale.set(s * 2, 1, s * 1.4); c.setRGB(1, 1, 1);
      }, false);
      break;
    case 'city': {
      const blds = scatter(rnd, 120, 9, 70);
      const height = (r) => 3 + r * r * 16;
      instanced('env', own('env', new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), M.building, blds, (d, [x, z, s, r], c) => {
        d.position.set(x, -0.42, z); d.rotation.set(0, Math.round(r * 4) * 0.2, 0);
        d.scale.set(2 + s * 2, height(r), 2 + s * 2);
        c.setHSL(0.68 + r * 0.1, 0.4, 0.18 + r * 0.1);
      });
      const stripMat = own('env', new THREE.MeshBasicMaterial({ toneMapped: false }));
      instanced('env', own('env', new THREE.BoxGeometry(1.02, 0.12, 1.02)), stripMat, blds, (d, [x, z, s, r], c) => {
        d.position.set(x, -0.42 + height(r), z); d.rotation.set(0, Math.round(r * 4) * 0.2, 0);
        d.scale.set(2 + s * 2, 1, 2 + s * 2);
        if (r < 0.5) c.setRGB(0.4, 2.0, 2.4); else c.setRGB(2.4, 0.4, 2.2);
      }, false);
      break;
    }
  }

  // Fondo lejano
  for (let i = 0; i < 14; i++) {
    const h = 25 + rnd() * 35;
    let geo;
    const x = -130 + i * 20 + rnd() * 8, z = 150 + rnd() * 40;
    if (theme.far === 'dunes') {
      geo = paint(new THREE.SphereGeometry(h * 0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.6, 0.35, 1), theme.farColor);
    } else if (theme.far === 'towers') {
      geo = paint(new THREE.BoxGeometry(8 + rnd() * 6, h * 1.6, 8).translate(0, h * 0.8, 0), theme.farColor);
    } else {
      geo = paint(new THREE.ConeGeometry(h * 0.9, h, 6).translate(0, h / 2, 0), theme.farColor);
    }
    const m = new THREE.Mesh(own('env', geo), M.prop);
    m.position.set(x, -2, z);
    if (theme.far !== 'towers') m.rotation.y = rnd() * 3;
    scene.add(own('env', m));
    if (theme.far === 'volcanoes' && i % 3 === 0) {
      const glow = new THREE.Mesh(own('env', new THREE.SphereGeometry(h * 0.12, 12, 8)), M.lavaGlow);
      glow.position.set(x, h - 2, z);
      scene.add(own('env', glow));
    }
    if (theme.far === 'towers') {
      const n = new THREE.Mesh(own('env', new THREE.BoxGeometry(0.6, h * 1.6, 0.6)), rnd() < 0.5 ? M.neonRed : M.neon);
      n.position.set(x, h * 0.8 - 2, z - 4.2);
      scene.add(own('env', n));
    }
  }

  // Nubes
  if (theme.clouds) {
    for (let i = 0; i < 9; i++) {
      const parts = [];
      for (let k = 0; k < 5; k++) {
        const s = new THREE.SphereGeometry(2 + rnd() * 2, 10, 8);
        s.translate((k - 2) * 2.6, rnd() * 1.2, rnd() * 2);
        parts.push(s);
      }
      const c = new THREE.Mesh(own('env', mergeGeometries(parts)), M.cloud);
      c.position.set(-70 + rnd() * 140, 26 + rnd() * 14, 30 + rnd() * 90);
      c.scale.set(1, 0.6, 0.8);
      c.userData.speed = 0.6 + rnd() * 0.8;
      clouds.push(c);
      scene.add(own('env', c));
    }
  }

  // Clima
  if (theme.weather) {
    const n = theme.weather === 'stars' ? 700 : 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (theme.weather === 'stars') {
        const a = rnd() * Math.PI - Math.PI / 2, e = 0.12 + rnd() * 1.2;
        pos[i * 3] = Math.sin(a) * 250 * Math.cos(e);
        pos[i * 3 + 1] = Math.sin(e) * 250;
        pos[i * 3 + 2] = Math.cos(a) * 250 * Math.cos(e) + 40;
      } else {
        pos[i * 3] = (rnd() - 0.5) * 70;
        pos[i * 3 + 1] = rnd() * 30;
        pos[i * 3 + 2] = -10 + rnd() * 80;
      }
    }
    const geo = own('env', new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cfg = {
      snow: { color: new THREE.Color(1, 1, 1), size: 0.35, add: false, opacity: 0.9 },
      embers: { color: new THREE.Color(3, 1.2, 0.3), size: 0.3, add: true, opacity: 0.9 },
      dust: { color: new THREE.Color(1, 0.85, 0.6), size: 0.25, add: false, opacity: 0.5 },
      stars: { color: new THREE.Color(1.6, 1.6, 2), size: 1.4, add: true, opacity: 0.9 },
    }[theme.weather];
    const mat = own('env', new THREE.PointsMaterial({
      map: softDot, color: cfg.color, size: cfg.size, transparent: true, depthWrite: false,
      blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: theme.weather !== 'stars', toneMapped: !cfg.add, opacity: cfg.opacity,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(own('env', pts));
    weather = { kind: theme.weather, pts, pos };
  }
}

function updateWeather(dt) {
  if (!weather || weather.kind === 'stars') return;
  const p = weather.pos;
  for (let i = 0; i < p.length; i += 3) {
    if (weather.kind === 'snow') { p[i + 1] -= dt * 2.2; p[i] += Math.sin(t + i) * dt * 0.6; }
    else if (weather.kind === 'embers') { p[i + 1] += dt * 2.5; p[i] += Math.sin(t * 2 + i) * dt; }
    else { p[i] += dt * 4; p[i + 1] -= dt * 0.3; }
    if (p[i + 1] < 0) p[i + 1] += 30;
    if (p[i + 1] > 30) p[i + 1] -= 30;
    if (p[i] > 35) p[i] -= 70;
  }
  weather.pts.geometry.attributes.position.needsUpdate = true;
}

// ---------- Personajes ----------
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
    parts.push(paint(new THREE.BoxGeometry(0.2, 0.035, 0.03).translate(0, 1.0, 0.15), '#3a0a0a'));
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
  runner: crowd(personGeometry('#ff7a1f', '#b84a0a', true, null), MAX_RED),
  blueGiant: crowd(personGeometry('#2f7cf6', '#1d4fd6', false, '#ffc531'), MAX_GIANTS),
  redGiant: crowd(personGeometry('#ef3b3b', '#7a1212', true, '#2b2b2b'), MAX_GIANTS),
};

// ---------- Partículas y escombros ----------
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
const shockwaves = [];
function shockwave(x, z, color, size = 12) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
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

// ============================================================
// Bases enemigas (una por mundo)
// ============================================================
let baseView = null; // { group, flash: [materiales], colors, anim(t) }

function makeFlag(scope, color) {
  const geo = own(scope, new THREE.PlaneGeometry(2.2, 1.3, 16, 6).translate(1.1, 0, 0));
  const baseArr = geo.attributes.position.array.slice();
  const mat = own(scope, new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }));
  const mesh = shadowed(new THREE.Mesh(geo, mat));
  mesh.rotation.y = Math.PI;
  return {
    mesh,
    anim(tt) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = baseArr[i * 3];
        pos.array[i * 3 + 2] = Math.sin(x * 2.4 - tt * 7) * 0.18 * (x / 2.2);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

function buildBase(style) {
  freeScope('base');
  const S = 'base';
  const group = own(S, new THREE.Group());
  const flash = [];
  const anims = [];
  const mat = (opts, flashes = true) => {
    const m = own(S, new THREE.MeshStandardMaterial({ emissive: '#ff2020', emissiveIntensity: 0, ...opts }));
    if (flashes) flash.push(m);
    return m;
  };
  const glow = (r, g, b) => own(S, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false }));
  const add = (geo, m, x, y, z, cast = true) => {
    const mesh = shadowed(new THREE.Mesh(own(S, geo), m), cast, true);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const portal = () => {
    const p = add(new THREE.PlaneGeometry(2.1, 2.6), M.neonRed, 0, 1.9, -0.17, false);
    p.rotation.y = Math.PI;
  };
  let colors;

  if (style === 'castle') {
    const red = mat({ color: '#d93a3a', roughness: 0.55 });
    const dark = mat({ color: '#a82424', roughness: 0.6 });
    const stone = mat({ color: '#c9c3b8', roughness: 0.85 }, false);
    const roof = mat({ color: '#7a1d2a', roughness: 0.4, metalness: 0.2 }, false);
    const door = mat({ color: '#2a0707', roughness: 0.9 }, false);
    const win = glow(2.2, 1.5, 0.5);
    add(new THREE.BoxGeometry(10.6, 0.6, 4.6), stone, 0, 0.3, 1.5);
    add(new RoundedBoxGeometry(9.2, 4.2, 3.2, 2, 0.12), red, 0, 2.6, 1.6);
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.75, 0.75, 0.75), dark, -3.9 + i * 1.3, 5.05, 0.35);
    add(new THREE.BoxGeometry(2.4, 2.8, 0.3), door, 0, 1.9, 0);
    portal();
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.25, 1.4, 7, 20), dark, s * 4.6, 3.5, 1.2);
      add(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 20), stone, s * 4.6, 7.1, 1.2);
      add(new THREE.ConeGeometry(1.6, 2.6, 20), roof, s * 4.6, 8.6, 1.2);
      add(new THREE.SphereGeometry(0.22, 12, 10), M.gold, s * 4.6, 10, 1.2);
      for (const y of [3.2, 5.4]) add(new THREE.BoxGeometry(0.4, 0.7, 0.1), win, s * 4.6, y, -0.18, false);
      add(new THREE.BoxGeometry(0.6, 0.8, 0.1), win, s * 2.2, 3.4, -0.02, false);
    }
    add(new THREE.CylinderGeometry(0.06, 0.06, 4, 8), M.metalDark, 0, 6.8, 2);
    const flag = makeFlag(S, '#ff3b3b');
    flag.mesh.position.set(0, 8.1, 2);
    group.add(flag.mesh);
    anims.push(flag.anim);
    colors = ['#d93a3a', '#a82424', '#c9c3b8', '#7a1d2a', '#ffc531'];
  } else if (style === 'pyramid') {
    const sand = mat({ color: '#e0b874', roughness: 0.8 });
    const sandDark = mat({ color: '#c0914f', roughness: 0.85 });
    const red = mat({ color: '#c8352f', roughness: 0.6, side: THREE.DoubleSide }, false);
    const torch = glow(2.8, 1.2, 0.2);
    for (let i = 0; i < 5; i++) {
      const w = 11 - i * 2, d = 6 - i * 1.0, h = 1.5;
      add(new THREE.BoxGeometry(w, h, d), i % 2 ? sandDark : sand, 0, h / 2 + i * h, 3);
    }
    add(new THREE.ConeGeometry(1.1, 1.6, 4), M.gold, 0, 8.3, 3).rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(3, 3.2, 0.4), sandDark, 0, 1.6, -0.1);
    portal();
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.9, 6.5, 0.9), sand, s * 6.4, 3.25, 0.5);
      add(new THREE.ConeGeometry(0.65, 1.1, 4), M.gold, s * 6.4, 7.05, 0.5).rotation.y = Math.PI / 4;
      add(new THREE.PlaneGeometry(1.2, 2.2), red, s * 2.6, 2.2, -0.02).rotation.y = Math.PI;
      add(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 8), M.metalDark, s * 1.9, 0.6, -0.4);
      add(new THREE.SphereGeometry(0.2, 10, 8), torch, s * 1.9, 1.35, -0.4, false);
    }
    colors = ['#e0b874', '#c0914f', '#c8352f', '#ffc531'];
  } else if (style === 'ice') {
    const ice = mat({ color: '#cfeaff', roughness: 0.12, metalness: 0.15 });
    const iceDark = mat({ color: '#8fc4ec', roughness: 0.15, metalness: 0.2 });
    const roof = mat({ color: '#2f5fa8', roughness: 0.3, metalness: 0.3 }, false);
    const win = glow(2.4, 0.5, 0.35);
    add(new RoundedBoxGeometry(9.4, 4.6, 3.4, 2, 0.25), ice, 0, 2.3, 1.7);
    for (let i = 0; i < 6; i++) add(new RoundedBoxGeometry(1.0, 0.9, 1.0, 2, 0.15), iceDark, -3.6 + i * 1.44, 5.0, 0.6);
    for (let i = 0; i < 12; i++) {
      add(new THREE.ConeGeometry(0.14, 0.5 + (i % 3) * 0.25, 6), iceDark, -4.2 + i * 0.76, 4.3 - (i % 3) * 0.12, -0.02, false).rotation.x = Math.PI;
    }
    add(new THREE.BoxGeometry(2.6, 3.0, 0.3), iceDark, 0, 1.5, -0.05);
    portal();
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(1.2, 1.35, 7.4, 8), iceDark, s * 4.8, 3.7, 1.3);
      add(new THREE.ConeGeometry(1.55, 3.2, 8), roof, s * 4.8, 9.0, 1.3);
      add(new THREE.BoxGeometry(0.45, 0.8, 0.1), win, s * 4.8, 4.6, -0.02, false);
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), M.metalDark, s * 4.8, 10.9, 1.3);
      const flag = makeFlag(S, '#ff3b3b');
      flag.mesh.scale.setScalar(0.6);
      flag.mesh.position.set(s * 4.8, 11.4, 1.3);
      group.add(flag.mesh);
      anims.push(flag.anim);
    }
    colors = ['#cfeaff', '#8fc4ec', '#2f5fa8', '#ffffff'];
  } else if (style === 'volcano') {
    const obs = mat({ color: '#2a2226', roughness: 0.3, metalness: 0.4 });
    const obs2 = mat({ color: '#3a2a2a', roughness: 0.5, metalness: 0.3 });
    const lava = glow(2.8, 0.8, 0.12);
    add(new THREE.BoxGeometry(9.6, 5.2, 3.4), obs, 0, 2.6, 1.7);
    for (const y of [1.0, 3.6]) add(new THREE.BoxGeometry(9.7, 0.14, 0.1), lava, 0, y, -0.02, false);
    for (let i = 0; i < 8; i++) {
      add(new THREE.ConeGeometry(0.4, 1.4 + (i % 2) * 0.8, 5), obs2, -4.2 + i * 1.2, 5.9 + (i % 2) * 0.4, 0.8).rotation.z = (i - 3.5) * 0.06;
    }
    add(new THREE.SphereGeometry(0.9, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), lava, 0, 4.4, -0.1, false).rotation.x = -Math.PI / 2;
    add(new THREE.BoxGeometry(2.6, 3.0, 0.3), obs2, 0, 1.5, -0.05);
    portal();
    for (const s of [-1, 1]) {
      add(new THREE.ConeGeometry(1.5, 10, 6), obs2, s * 5.0, 5, 1.3);
      add(new THREE.TorusGeometry(1.05, 0.1, 8, 20), lava, s * 5.0, 3.5, 1.3, false).rotation.x = Math.PI / 2;
      add(new THREE.TorusGeometry(0.62, 0.08, 8, 20), lava, s * 5.0, 6.8, 1.3, false).rotation.x = Math.PI / 2;
    }
    anims.push((tt) => { const k = Math.sin(tt * 3); lava.color.setRGB(2.4 + k * 0.5, 0.7 + k * 0.15, 0.12); });
    colors = ['#2a2226', '#3a2a2a', '#ff7a1a', '#1a1416'];
  } else {
    const dark = mat({ color: '#1c1c2e', roughness: 0.3, metalness: 0.8 });
    const dark2 = mat({ color: '#2a2a44', roughness: 0.35, metalness: 0.7 });
    const pink = glow(2.4, 0.3, 2.0);
    const cyan = glow(0.3, 2.0, 2.4);
    add(new RoundedBoxGeometry(9.0, 4.6, 3.2, 2, 0.1), dark, 0, 2.3, 1.6);
    add(new THREE.BoxGeometry(3.4, 11, 3.4), dark2, 0, 5.5, 3.6);
    for (const x of [-1.72, 1.72]) add(new THREE.BoxGeometry(0.1, 11, 0.1), pink, x, 5.5, 1.88, false);
    for (const y of [1.2, 2.6, 4.0]) add(new THREE.BoxGeometry(9.1, 0.08, 0.08), y === 2.6 ? cyan : pink, 0, y, -0.02, false);
    add(new THREE.CylinderGeometry(0.06, 0.08, 3, 8), M.steel, 0, 12.5, 3.6);
    const beacon = add(new THREE.SphereGeometry(0.22, 12, 10), glow(3, 0.3, 0.3), 0, 14.1, 3.6, false);
    const ringM = own(S, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 2.0), toneMapped: false, transparent: true, opacity: 0.7 }));
    const ring = add(new THREE.TorusGeometry(2.8, 0.06, 8, 48), ringM, 0, 8, 3.6, false);
    add(new THREE.BoxGeometry(2.6, 3.0, 0.3), dark2, 0, 1.5, -0.05);
    portal();
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(1.6, 7, 1.6), dark2, s * 4.9, 3.5, 1.2);
      add(new THREE.BoxGeometry(1.7, 0.1, 1.7), cyan, s * 4.9, 7.0, 1.2, false);
    }
    anims.push((tt) => {
      ring.rotation.set(Math.PI / 2 + Math.sin(tt) * 0.3, tt * 0.8, 0);
      ring.position.y = 8 + Math.sin(tt * 1.5) * 0.6;
      beacon.visible = Math.sin(tt * 5) > 0;
    });
    colors = ['#1c1c2e', '#2a2a44', '#ff4ad0', '#4ae8ff'];
  }

  group.position.z = LEN;
  scene.add(group);
  baseView = { group, flash, colors, anim: (tt) => { for (const a of anims) a(tt); } };
}

// ---------- Puertas y obstáculos ----------
const gateGeo = {
  pillar: new RoundedBoxGeometry(0.32, 2.3, 0.32, 2, 0.08),
  cap: new THREE.SphereGeometry(0.24, 14, 10),
};
const labelCache = new Map();
function gateMeshes(g) {
  const good = g.op.kind === 'mul';
  const color = new THREE.Color(good ? '#3d8bff' : '#3ddc84');
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
    const p = shadowed(new THREE.Mesh(gateGeo.pillar, M.pillar));
    p.position.set(s * g.w / 2, 1.15, 0);
    const c = shadowed(new THREE.Mesh(gateGeo.cap, M.gold));
    c.position.set(s * g.w / 2, 2.42, 0);
    grp.add(p, c);
  }
  const key = g.op.label + good;
  if (!labelCache.has(key)) labelCache.set(key, labelTexture(g.op.label, good ? '#5fb0ff' : '#5dffa0'));
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

const OBST_GEO = {
  post: new THREE.CylinderGeometry(0.28, 0.36, 1.1, 16).translate(0, 0.55, 0),
  hub: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16),
  saw: new THREE.CylinderGeometry(0.95, 0.95, 0.1, 32).rotateX(Math.PI / 2),
  tooth: new THREE.ConeGeometry(0.12, 0.28, 4),
};

function obstacleMeshes(o) {
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
    const wall = shadowed(new THREE.Mesh(own('stage', new RoundedBoxGeometry(o.w, 1.5, 0.7, 2, 0.12)), M.hazard));
    wall.position.y = 0.75;
    const top = new THREE.Mesh(own('stage', new THREE.BoxGeometry(o.w, 0.08, 0.08)), M.neonRed);
    top.position.set(0, 1.52, -0.3);
    grp.add(wall, top);
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
  }
  grp.position.set(o.type === 'saw' ? 0 : X(o.x), 0, o.z);
  scene.add(grp);
  o.grp = grp;
}

// ============================================================
// Estado de partida
// ============================================================
let state = 'menu'; // menu | play | transition | win | lose
let units = [], particles = [], debris = [], gates = [], obstacles = [];
let base, cannon, spawner, trans = null;
let charge = 0, endTimer = 0, firing = false, fireTimer = 0, earned = 0, blueCount = 0, redCount = 0;
let stage = 0, stageCount = 1;
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

function gatePool(n) {
  const pool = [
    { kind: 'mul', v: 2, label: '×2', w: 4 },
    { kind: 'add', v: 5, label: '+5', w: 2 },
    { kind: 'add', v: 10, label: '+10', w: 2 },
    { kind: 'mul', v: 3, label: '×3', w: 2 },
  ];
  if (n >= 4) pool.push({ kind: 'add', v: 20, label: '+20', w: 1 });
  if (n >= 6) pool.push({ kind: 'mul', v: 4, label: '×4', w: 1 });
  if (n >= 9) pool.push({ kind: 'mul', v: 5, label: '×5', w: 0.6 });
  return pool;
}

function makeGate(id, x, w, z, op, amp, speed) {
  const g = { id, bit: 1 << id, x, w, z, op, amp, speed, phase: id * 1.7, flash: 0 };
  g.view = gateMeshes(g);
  return g;
}

function clearStage() {
  freeScope('stage');
  for (const s of shockwaves) { scene.remove(s); s.material.dispose(); }
  shockwaves.length = 0;
  gates = []; obstacles = []; units = [];
  blueCount = 0; redCount = 0;
}

function buildStage(n, s) {
  clearStage();
  const rnd = mulberry32(n * 7919 + s * 131 + 17);
  const pool = gatePool(n);
  const totalW = pool.reduce((a, p) => a + p.w, 0);
  const pick = () => {
    let r = rnd() * totalW;
    for (const p of pool) { if ((r -= p.w) <= 0) return p; }
    return pool[0];
  };
  const slots = 3 + (n >= 3 ? 1 : 0) + (n >= 7 ? 1 : 0);
  const obstacleChance = n < 2 ? 0 : Math.min(0.55, 0.3 + n * 0.03);
  let id = 0, placedObstacle = false;
  for (let i = 0; i < slots; i++) {
    const z = 7 + i * (24 / (slots - 1));
    const middle = i > 0 && i < slots - 1;
    // A partir del nivel 2, al menos un obstáculo por fase
    const obst = middle && (rnd() < obstacleChance || (n >= 2 && !placedObstacle && i === slots - 2));
    if (obst) {
      placedObstacle = true;
      const kinds = n >= 4 ? ['spinner', 'slider', 'saw'] : ['spinner', 'slider'];
      const type = kinds[Math.floor(rnd() * kinds.length)];
      const o = { type, z, x: 0, phase: rnd() * 6 };
      if (type === 'spinner') Object.assign(o, { x: (rnd() * 2 - 1) * 1.8, len: 5.5, speed: (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 0.8), angle: 0 });
      if (type === 'slider') Object.assign(o, { w: 2.6, amp: HALF - 1.4, speed: 0.9 + rnd() * 0.7 });
      if (type === 'saw') Object.assign(o, { amp: HALF - 1.1, speed: 1.1 + rnd() * 0.8 });
      obstacleMeshes(o);
      obstacles.push(o);
    } else if (rnd() < 0.45) {
      gates.push(makeGate(id++, -2.5, 4.4, z, pick(), 0, 0));
      gates.push(makeGate(id++, 2.5, 4.4, z, pick(), 0, 0));
    } else {
      const moving = n >= 3 && rnd() < 0.6;
      const x = moving ? 0 : (rnd() * 2 - 1) * 2.2;
      gates.push(makeGate(id++, x, 4.2, z, pick(), moving ? 2.6 : 0, 0.7 + rnd() * 0.9));
    }
  }

  const boss = isBoss(n);
  const hp = Math.round((60 + n * 30) * (1 + s * 0.3) * (boss ? 2.6 : 1));
  base = { hp, max: hp, flash: 0, wobble: 0 };
  spawner = {
    timer: 2.2, queue: 0, gap: 0, wave: 0,
    interval: Math.max(1.2, 3.4 - n * 0.12 - s * 0.2),
    size: 3 + Math.floor(n * 1.1) + s * 2,
    runnerChance: n >= 3 ? Math.min(0.4, 0.15 + n * 0.02) : 0,
    giantEvery: boss ? 2 : n >= 4 ? 3 : 0,
    giantHp: (boss ? 14 : 8) + n,
  };
  buildBase(themeFor(n).base);
  fireTimer = 0;
  renderStages();
}

function buildLevel(n) {
  buildEnvironment(themeFor(n));
  stage = 0;
  stageCount = stagesFor(n);
  cannon = { x: 0, tx: 0, recoil: 0 };
  charge = 0; t = 0; earned = 0; firing = false; drag = null;
  particles = []; debris = [];
  buildStage(n, 0);
  cannonGroup.visible = true;
}

function addUnit(team, x, z, giant, passed, hp, runner) {
  if (team === 1 && !giant && redCount >= MAX_RED) return null;
  const u = {
    team, x, z, pz: z, vx: 0, giant, runner: !!runner,
    r: giant ? 0.7 : runner ? 0.24 : UNIT_R,
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
      life: 0.5 + Math.random() * 0.6,
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

let flashLock = false;
function screenFlash(strength) {
  if (flashLock) return;
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = strength;
  requestAnimationFrame(() => { f.style.transition = 'opacity .6s ease-out'; f.style.opacity = 0; });
}

function destroyBase(big) {
  baseView.group.visible = false;
  explodeDebris(0, 0.5, LEN, baseView.colors, big ? MAX_DEBRIS : 90, big ? 14 : 12, 1.1);
  burst(0, 3, LEN + 1, '#ffc531', big ? 220 : 140, 12, 1.6);
  burst(0, 3, LEN + 1, '#ff5a3a', big ? 160 : 100, 10, 1.4);
  shockwave(0, LEN + 1, new THREE.Color(2.5, 1.6, 0.6), 22);
  camShake.amp = big ? 1.1 : 0.8;
  screenFlash(0.6);
  for (const u of units) if (u.team === 1 && !u.dead) { burst(u.x, 0.6, u.z, '#ff5a3a', 3, 4); kill(u); }
  boom(0.35, 1.4);
  vibrate([60, 40, 120]);
}

function stageClear() {
  destroyBase(false);
  sfx('stage', 520, 0.4, 'square', 0.05, 520, 0);
  state = 'transition';
  trans = { t: 0, rebuilt: false };
}

function win() {
  state = 'win';
  endTimer = 2.0;
  const n = save.level;
  const reward = 25 + n * 8 + (stageCount - 1) * 15 + (isBoss(n) ? 60 : 0);
  save.coins += reward;
  save.level += 1;
  persist();
  destroyBase(true);
  sfx('win', 440, 0.6, 'square', 0.05, 440, 0);
  const next = save.level;
  showOverlay(isBoss(n) ? '¡Jefe derrotado!' : '¡Victoria!', `+${reward} monedas\nSiguiente: ${themeFor(next).name}${isBoss(next) ? ' (jefe)' : ''}`, `Nivel ${next}`);
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

function moveCannon(dt) {
  if (keys.ArrowLeft) cannon.tx -= 9 * dt;
  if (keys.ArrowRight) cannon.tx += 9 * dt;
  cannon.tx = Math.max(-HALF + 1.1, Math.min(HALF - 1.1, cannon.tx));
  cannon.x += (cannon.tx - cannon.x) * Math.min(1, dt * 18);
}

function updateObstacles(dt) {
  for (const o of obstacles) {
    if (o.type === 'spinner') o.angle += o.speed * dt;
    else o.x = Math.sin(t * o.speed + o.phase) * o.amp;
  }
}

function hitsObstacle(u, o) {
  const dx = u.x - o.x, dz = u.z - o.z;
  if (o.type === 'spinner') {
    if (dz * dz + dx * dx > (o.len / 2 + 0.6) ** 2) return false;
    const c = Math.cos(o.angle), s = Math.sin(o.angle);
    const p = Math.max(-o.len / 2, Math.min(o.len / 2, dx * c + dz * s));
    const px = dx - p * c, pz = dz - p * s;
    return px * px + pz * pz < (0.22 + u.r) ** 2;
  }
  if (o.type === 'slider') return Math.abs(dx) < o.w / 2 + u.r && Math.abs(dz) < 0.35 + u.r;
  return Math.abs(dx) < 0.95 + u.r * 0.5 && Math.abs(dz) < 0.12 + u.r;
}

function update(dt) {
  t += dt;
  moveCannon(dt);
  updateGates(dt);
  updateObstacles(dt);
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
      addUnit(1, (Math.random() - 0.5) * 2, LEN - 0.6, false, 0, 1, Math.random() < sp.runnerChance);
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
      u.z -= RED_SPEED * (u.giant ? 0.7 : u.runner ? 1.7 : 1) * dt;
      if (u.z > LEN - 4 && !u.giant) u.vx += (u.x >= 0 ? 1 : -1) * 6 * dt * Math.random();
    }
    u.x += u.vx * dt;
    u.vx *= decay;
    u.phase += dt * (u.giant ? 7 : u.runner ? 20 : 13);
    const lim = HALF - u.r;
    if (u.x < -lim) u.x = -lim; else if (u.x > lim) u.x = lim;

    if (!u.giant) {
      for (const o of obstacles) {
        if (hitsObstacle(u, o)) {
          burst(u.x, 0.7, u.z, u.team === 0 ? '#4a9bff' : '#ff4a3a', 4, 4);
          sfx('zap', 200, 0.05, 'sawtooth', 0.02, -120, 0.05);
          kill(u);
          break;
        }
      }
      if (u.dead) continue;
    }

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

  if (base.hp <= 0) {
    base.hp = 0;
    if (stage < stageCount - 1) stageClear(); else win();
  }
}

const ease = (x) => x * x * (3 - 2 * x);
function updateTransition(dt) {
  t += dt;
  trans.t += dt;
  moveCannon(dt);
  updateGates(dt);
  updateObstacles(dt);
  updateFx(dt);
  for (const u of units) { u.z += BLUE_SPEED * 0.6 * dt; u.phase += dt * 13; }
  const tt = trans.t;
  const f = $('flash');
  if (tt < 0.6) return;
  if (tt < 1.1) {
    const k = ease((tt - 0.6) / 0.5);
    camShake.dolly = k * 26;
    flashLock = true;
    f.style.transition = 'none';
    f.style.opacity = k * 0.9;
    return;
  }
  if (!trans.rebuilt) {
    trans.rebuilt = true;
    stage++;
    particles = []; debris = [];
    buildStage(save.level, stage);
  }
  const k = ease(Math.min(1, (tt - 1.1) / 0.7));
  camShake.dolly = -16 * (1 - k);
  f.style.opacity = (1 - k) * 0.9;
  if (k >= 1) {
    flashLock = false;
    f.style.opacity = 0;
    camShake.dolly = 0;
    state = 'play';
    trans = null;
    showBanner(`Fase ${stage + 1}`, `de ${stageCount}`, false);
  }
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
      scene.remove(s); s.material.dispose();
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
  updateObstacles(dt);
  updateFx(dt);
  if (base) base.flash = Math.max(0, base.flash - dt * 5);
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
const counts = { blue: 0, red: 0, runner: 0, blueGiant: 0, redGiant: 0 };
const sparkColor = new THREE.Color();

function syncScene(dt) {
  for (const k in counts) counts[k] = 0;
  for (const u of units) {
    const key = u.team === 0 ? (u.giant ? 'blueGiant' : 'blue') : (u.giant ? 'redGiant' : u.runner ? 'runner' : 'red');
    const mesh = meshes[key];
    const i = counts[key];
    if (i >= mesh.instanceMatrix.count) continue;
    counts[key] = i + 1;
    const step = Math.sin(u.phase);
    const sc = (u.giant ? 1.5 + 0.8 * (u.hp / u.maxHp) : u.runner ? 0.8 : 0.95) * (0.4 + 0.6 * u.spawn);
    dummy.position.set(X(u.x), Math.abs(step) * 0.09 * sc, u.z);
    dummy.rotation.set(u.team === 0 ? 0.12 : u.runner ? -0.3 : -0.12, (u.team === 0 ? 0 : Math.PI) + u.vx * -0.06, step * 0.1);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  for (const k in meshes) {
    meshes[k].count = counts[k];
    meshes[k].instanceMatrix.needsUpdate = true;
  }

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

  for (const g of gates) {
    const v = g.view;
    v.grp.position.x = X(g.x);
    v.panelMat.emissiveIntensity = 0.35 + g.flash * 2.5;
    v.panelMat.opacity = 0.32 + g.flash * 0.25;
    v.beamMat.color.copy(v.base).multiplyScalar(1.6 + g.flash * 2.5);
    v.label.scale.setScalar(1 + g.flash * 0.18 + Math.sin(t * 3 + g.phase) * 0.03);
  }

  for (const o of obstacles) {
    if (o.type === 'spinner') o.arm.rotation.y = o.angle;
    else if (o.type === 'slider') o.grp.position.x = X(o.x);
    else {
      o.blade.position.x = X(o.x);
      o.blade.rotation.z += dt * 14;
    }
  }

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

  if (base && baseView) {
    base.wobble = Math.max(0, base.wobble - dt * 3);
    const e = base.flash * 0.45;
    for (const m of baseView.flash) m.emissiveIntensity = e;
    const bs = isBoss(save.level) && state !== 'win' ? 1.15 : 1;
    baseView.group.scale.set(bs * (1 + base.wobble * 0.03), bs * (1 - base.wobble * 0.04), bs * (1 + base.wobble * 0.03));
    baseView.group.rotation.z = Math.sin(t * 40) * base.wobble * 0.01 + (1 - base.hp / base.max) * 0.02;
    baseView.anim(t);
  }

  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 90) c.position.x = -90;
  }
  updateWeather(dt);

  camShake.amp = Math.max(0, camShake.amp - dt * 1.8);
  const s = camShake.amp * camShake.amp;
  const camX = cannon ? X(cannon.x) * 0.18 : 0;
  camera.position.set(
    CAM_BASE.x + camX + (Math.random() - 0.5) * s,
    CAM_BASE.y + (Math.random() - 0.5) * s + camShake.dolly * 0.1,
    CAM_BASE.z + (Math.random() - 0.5) * s * 0.5 + camShake.dolly,
  );
  camera.lookAt(CAM_LOOK.x + camX * 0.5, CAM_LOOK.y, CAM_LOOK.z + camShake.dolly);
}

// ---------- Tamaño y calidad ----------
let worldPerPx = 0.02;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const aspect = w / h;
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
    if (perfTime / perfFrames > 0.024 && pixelRatio > 1) {
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

function renderStages() {
  const el = $('stages');
  el.innerHTML = '';
  if (stageCount < 2) return;
  for (let i = 0; i < stageCount; i++) {
    const d = document.createElement('i');
    if (i < stage) d.className = 'done';
    else if (i === stage) d.className = 'now';
    el.appendChild(d);
  }
}

function showBanner(title, sub, boss) {
  const b = $('banner');
  b.querySelector('b').textContent = title;
  b.querySelector('span').textContent = sub;
  b.classList.toggle('boss', !!boss);
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
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
  const n = save.level;
  if (isBoss(n)) showBanner('¡JEFE!', themeFor(n).name, true);
  else showBanner(`Nivel ${n}`, stageCount > 1 ? `${themeFor(n).name} · ${stageCount} fases` : themeFor(n).name, false);
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
{
  const n = save.level;
  showOverlay('Mob Rush', `Arrastra para apuntar · mantén pulsado para disparar\nNivel ${n}: ${themeFor(n).name}${isBoss(n) ? ' (jefe)' : ''}`, n > 1 ? `Jugar nivel ${n}` : 'Jugar');
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.033, clock.getDelta());
  if (state === 'play') update(dt);
  else if (state === 'transition') updateTransition(dt);
  else updateIdle(dt);
  syncScene(dt);
  composer.render();
  updateHud();
  adaptQuality(dt);
});

requestAnimationFrame(() => $('loader').classList.add('done'));

// Ayudas de depuración desde la consola: __mobrush.goto(n) salta al nivel n.
window.__mobrush = {
  get state() { return state; },
  get units() { return units.length; },
  get base() { return base; },
  get stage() { return stage; },
  save,
  goto(n) { save.level = n; persist(); startGame(); },
};
