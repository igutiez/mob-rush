// Motor gráfico compartido: renderer, escena, cámara, posprocesado, luces, texturas y materiales.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Coordenadas de juego: x lateral, z hacia la base enemiga. En Three.js la x se invierte
// (X()) porque la cámara mira hacia +z.
export const HALF = 5;
export const LEN = 40;
export const CANNON_Z = 1.2;
export const X = (x) => -x;

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const canvas = document.getElementById('game');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#bfe3ff', 55, 150);

const pmrem = new THREE.PMREMGenerator(renderer);
export const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTexture;
scene.environmentIntensity = 0.55;

export const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 400);
export const CAM_BASE = new THREE.Vector3(0, 12.5, -10.5);
export const CAM_LOOK = new THREE.Vector3(0, 0, 15);

export const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
export const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.5, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Recursos con ciclo de vida: se liberan al cambiar de mundo ('env'), de fase ('stage') o de base ('base')
export const scopes = { env: [], stage: [], base: [] };
export const own = (scope, res) => { scopes[scope].push(res); return res; };
export function freeScope(scope) {
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
export const skyUniforms = {
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
export const hemi = new THREE.HemisphereLight('#cfe8ff', '#3d6b2a', 0.7);
scene.add(hemi);
export const sun = new THREE.DirectionalLight('#fff4e0', 2.1);
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
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

export const TEX = {
  hazard: canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ffcc1a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1b';
    for (let x = -h; x < w + h; x += 48) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 24 - h, h); g.lineTo(x - h, h); g.fill();
    }
  }),
  softDot: canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  }),
  windows: canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) {
      for (let x = 4; x < w; x += 10) {
        if (Math.random() < 0.45) {
          g.fillStyle = Math.random() < 0.5 ? '#7af0ff' : '#ff8af0';
          g.fillRect(x, y, 5, 6);
        }
      }
    }
  }),
};

// ---------- Materiales compartidos ----------
export const M = {
  track: new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.1 }),
  trackSide: new THREE.MeshStandardMaterial({ color: '#5f7db3', roughness: 0.6 }),
  rail: new THREE.MeshStandardMaterial({ color: '#dfe6f5', roughness: 0.3, metalness: 0.3 }),
  neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 2.2), toneMapped: false }),
  neonRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.12, 0.08), toneMapped: false }),
  ground: new THREE.MeshStandardMaterial({ roughness: 1, emissive: '#ffffff', emissiveIntensity: 0 }),
  prop: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffc531', roughness: 0.25, metalness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: '#2f7cf6', roughness: 0.22, metalness: 0.65 }),
  metalDark: new THREE.MeshStandardMaterial({ color: '#1a2f5c', roughness: 0.35, metalness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: '#c8d0dc', roughness: 0.18, metalness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.75 }),
  pillar: new THREE.MeshStandardMaterial({ color: '#e8edf7', roughness: 0.25, metalness: 0.4 }),
  hazard: new THREE.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.4, metalness: 0.2 }),
  cloud: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 }),
  lavaGlow: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.8, 0.15), toneMapped: false }),
  building: new THREE.MeshStandardMaterial({ color: '#ffffff', map: TEX.windows, emissiveMap: TEX.windows, emissive: '#ffffff', emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.4 }),
};

export const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

export function paint(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// ---------- Pista (fija; el mundo cambia sus materiales) ----------
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

// ---------- Tamaño y calidad ----------
export const view = { worldPerPx: 0.02, w: 1, h: 1 };
export function resize() {
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
  view.worldPerPx = (2 * dist * Math.tan(vfov / 2)) / h;
  view.w = w; view.h = h;
}

export function lowerQuality() {
  if (pixelRatio <= 1) return;
  pixelRatio = 1;
  renderer.setPixelRatio(1);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.map?.dispose();
  sun.shadow.map = null;
  resize();
}

const projV = new THREE.Vector3();
// Posición en pantalla (px) de un punto en coordenadas de juego.
export function toScreen(x, y, z) {
  projV.set(X(x), y, z).project(camera);
  return { x: (projV.x * 0.5 + 0.5) * view.w, y: (-projV.y * 0.5 + 0.5) * view.h, visible: projV.z < 1 };
}
