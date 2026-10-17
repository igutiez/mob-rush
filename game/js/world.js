// Mundos: cielo, suelo, decorado, clima. Cada nivel cambia de mundo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LEN, scene, renderer, bloom, hemi, sun, skyUniforms, own, freeScope, canvasTex, TEX, M, shadowed, paint, mulberry32,
} from './engine.js';

export let t = 0;
export const setWorldTime = (v) => { t = v; };

export const THEMES = [
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
export const themeFor = (n) => THEMES[(n - 1) % THEMES.length];
export const isBoss = (n) => n % 5 === 0;
export const stagesFor = (n) => (isBoss(n) ? 1 : n < 3 ? 1 : n < 7 ? 2 : 3);

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

export function scatter(rnd, count, minX = 7.5, maxX = 62) {
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


export function buildEnvironment(theme) {
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
      map: TEX.softDot, color: cfg.color, size: cfg.size, transparent: true, depthWrite: false,
      blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: theme.weather !== 'stars', toneMapped: !cfg.add, opacity: cfg.opacity,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(own('env', pts));
    weather = { kind: theme.weather, pts, pos };
  }
}

export function updateWeather(dt) {
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


export function updateClouds(dt) {
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > 90) c.position.x = -90;
  }
}
