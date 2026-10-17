// Interfaz: HUD, menús (Batalla, Héroes, Reino), invocación y banners.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { heroPortraitMesh } from './models.js';
import {
  save, persist, HEROES, HERO_IDS, RARITY, HERO_MAX, SUMMON_COST, heroLevel, summon, BUILDINGS, buildCost, stats,
} from './save.js';
import { ensureAudio, sfx, fanfare } from './audio.js';

const $ = (id) => document.getElementById(id);

// ---------- Retratos 3D de los héroes (render único a imagen) ----------
export const portraits = {};
function renderPortraits() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 400;
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight('#e8f0ff', '#2a2050', 1.2));
  const key = new THREE.DirectionalLight('#fff2dd', 2.6);
  key.position.set(2, 3, 4);
  const rim = new THREE.DirectionalLight('#7ab0ff', 2.2);
  rim.position.set(-3, 2, -3);
  scene.add(key, rim);
  const cam = new THREE.PerspectiveCamera(30, c.width / c.height, 0.1, 50);
  for (const id of HERO_IDS) {
    const { mesh, dispose } = heroPortraitMesh(id);
    const fly = id === 'griffin';
    mesh.rotation.y = fly ? 0.7 : 0.35;
    scene.add(mesh);
    cam.position.set(fly ? 1.7 : 0.55, fly ? 1.5 : 1.05, fly ? 3.9 : 2.6);
    cam.lookAt(0, fly ? 0.6 : 0.62, 0);
    r.render(scene, cam);
    portraits[id] = c.toDataURL('image/png');
    scene.remove(mesh);
    dispose();
  }
  pm.dispose();
  r.dispose();
  r.forceContextLoss();
}

// ---------- Menú ----------
let onPlay = () => {};

export function initUI(opts) {
  onPlay = opts.onPlay;
  try { renderPortraits(); } catch (e) { /* sin retratos si falla el segundo contexto WebGL */ }

  document.querySelectorAll('.tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      sfx('tab', 700, 0.05, 'triangle', 0.03, 0, 0);
      document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
      document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + b.dataset.tab));
      refreshMenu();
    });
  });
  $('play').addEventListener('click', () => onPlay());
  $('summon').addEventListener('click', doSummon);
  $('reveal').querySelector('button').addEventListener('click', () => {
    $('reveal').classList.remove('show');
    refreshMenu();
  });
  $('mute').addEventListener('click', () => { save.muted = !save.muted; persist(); ensureAudio(); });
  refreshMenu();
  refreshHeroButton();
}

function selectTab(name) {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + name));
}

export function refreshMenu() {
  $('ov-coins').textContent = save.coins;
  const h = HEROES[save.hero];
  const eq = $('equipped');
  eq.querySelector('img').src = portraits[save.hero] || '';
  eq.querySelector('b').textContent = `${h.name} · Nv ${heroLevel(save.hero)}`;
  eq.querySelector('span').textContent = `⚡ ${h.ability}`;

  // Héroes
  const grid = $('hero-grid');
  grid.innerHTML = '';
  for (const id of HERO_IDS) {
    const def = HEROES[id];
    const lvl = heroLevel(id);
    const card = document.createElement('div');
    card.className = 'hero' + (lvl ? '' : ' locked') + (save.hero === id ? ' on' : '');
    card.style.setProperty('--r', RARITY[def.rarity].color);
    card.innerHTML = `
      <div class="pic"><img alt="" src="${portraits[id] || ''}"></div>
      ${lvl ? `<span class="lv">Nv ${lvl}${lvl >= HERO_MAX ? ' ★' : ''}</span>` : ''}
      <span class="rar">${RARITY[def.rarity].name}</span>
      <b>${lvl ? def.name : '???'}</b>
      <small>⚡ ${def.ability}</small>
      <small>${lvl ? def.desc : 'Invócalo para desbloquearlo.'}</small>
      <button ${!lvl || save.hero === id ? 'disabled' : ''}>${!lvl ? 'Bloqueado' : save.hero === id ? 'Equipado' : 'Equipar'}</button>`;
    card.querySelector('button').addEventListener('click', () => {
      save.hero = id;
      persist();
      sfx('equip', 880, 0.1, 'square', 0.04, 220, 0);
      refreshMenu();
      refreshHeroButton();
    });
    grid.appendChild(card);
  }
  const sb = $('summon');
  sb.querySelector('em').textContent = `● ${SUMMON_COST}`;
  sb.disabled = save.coins < SUMMON_COST;

  // Reino
  const list = $('build-list');
  list.innerHTML = '';
  for (const b of BUILDINGS) {
    const lvl = save.buildings[b.id];
    const max = lvl >= b.max;
    const cost = buildCost(b, lvl);
    const row = document.createElement('div');
    row.className = 'build';
    row.innerHTML = `
      <span class="ic">${b.icon}</span>
      <div><b>${b.name}<small>Nv ${lvl}</small></b><span>${b.effect(lvl)}</span>${max ? '' : `<span style="opacity:.7">Siguiente: ${b.effect(lvl + 1)}</span>`}</div>
      <button ${max || save.coins < cost ? 'disabled' : ''}>${max ? 'MÁX' : `● ${cost}`}</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (max || save.coins < cost) return;
      save.coins -= cost;
      save.buildings[b.id] = lvl + 1;
      persist();
      ensureAudio();
      fanfare([523, 659, 784], 0.06);
      refreshMenu();
    });
    list.appendChild(row);
  }
}

function doSummon() {
  ensureAudio();
  const res = summon();
  if (!res) return;
  const def = HEROES[res.id];
  const card = $('reveal').querySelector('.reveal-card');
  card.style.setProperty('--r', RARITY[def.rarity].color);
  card.querySelector('img').src = portraits[res.id] || '';
  card.querySelector('em').textContent = RARITY[def.rarity].name;
  card.querySelector('b').textContent = def.name;
  card.querySelector('span').textContent = res.maxed ? 'Nivel máximo · +120 monedas' : res.isNew ? '¡Nuevo héroe!' : `Sube a nivel ${res.level}`;
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';
  $('reveal').classList.add('show');
  const notes = { common: [523, 659], rare: [523, 659, 784], epic: [523, 659, 784, 1047], legendary: [523, 659, 784, 1047, 1319] }[def.rarity];
  fanfare(notes, 0.08);
  if (res.isNew) { save.hero = res.id; persist(); refreshHeroButton(); }
}

export function showOverlay(title, sub, playLabel) {
  $('ov-title').textContent = title;
  $('ov-sub').textContent = sub;
  $('play').textContent = playLabel;
  selectTab('battle');
  refreshMenu();
  $('giant').classList.add('hidden');
}
export const openOverlay = () => $('overlay').classList.add('show');
export function hideOverlay() {
  $('overlay').classList.remove('show');
  $('giant').classList.remove('hidden');
  refreshHeroButton();
}

export function refreshHeroButton() {
  $('giant').querySelector('img').src = portraits[save.hero] || '';
  $('giant').querySelector('span').textContent = HEROES[save.hero].name.split(' ')[0].toUpperCase();
}

// ---------- HUD ----------
const hud = { lvl: -1, coins: -1, hp: -1, p: -1, ready: null, muted: null, wall: -1 };
export function updateHud(g) {
  if (hud.lvl !== save.level) $('lvl').textContent = `Nivel ${(hud.lvl = save.level)}`;
  if (hud.coins !== save.coins) $('coins').textContent = (hud.coins = save.coins);
  const hp = g.base ? Math.max(0, Math.ceil(g.base.hp)) : 0;
  if (g.base && hud.hp !== hp) {
    hud.hp = hp;
    $('basefill').style.transform = `scaleX(${hp / g.base.max})`;
    $('basehp').textContent = hp;
  }
  const p = Math.round((g.charge / stats.chargeMax()) * 100) / 100;
  if (hud.p !== p) { hud.p = p; $('giant').style.setProperty('--p', p); }
  const ready = g.state === 'play' && g.charge >= stats.chargeMax();
  if (hud.ready !== ready) { hud.ready = ready; $('giant').classList.toggle('ready', ready); }
  if (hud.muted !== save.muted) { hud.muted = save.muted; $('mute').textContent = save.muted ? '🔇' : '🔊'; }
  if (hud.wall !== g.wallHp) {
    hud.wall = g.wallHp;
    $('wallhud').classList.toggle('hidden', !(g.wallHp > 0) || g.state === 'menu');
    $('wallhud').querySelector('span').textContent = g.wallHp;
  }
}

export function renderStages(stage, count) {
  const el = $('stages');
  el.innerHTML = '';
  if (count < 2) return;
  for (let i = 0; i < count; i++) {
    const d = document.createElement('i');
    if (i < stage) d.className = 'done';
    else if (i === stage) d.className = 'now';
    el.appendChild(d);
  }
}

export function showBanner(title, sub, kind = '') {
  const b = $('banner');
  b.querySelector('b').textContent = title;
  b.querySelector('span').textContent = sub;
  b.className = 'banner ' + kind;
  void b.offsetWidth;
  b.classList.add('show');
}

export function flash(strength, locked) {
  const f = $('flash');
  if (locked !== undefined) { f.style.transition = 'none'; f.style.opacity = locked; return; }
  f.style.transition = 'none';
  f.style.opacity = strength;
  requestAnimationFrame(() => { f.style.transition = 'opacity .6s ease-out'; f.style.opacity = 0; });
}
