// Núcleo del juego: estado, simulación, héroes, proyectiles y bucle principal.
import * as THREE from 'three';
import {
  HALF, LEN, CANNON_Z, X, mulberry32, canvas, renderer, composer, camera, CAM_BASE, CAM_LOOK,
  freeScope, resize, lowerQuality, view,
} from './engine.js';
import { themeFor, isBoss, stagesFor, buildEnvironment, updateWeather, updateClouds, setWorldTime } from './world.js';
import { buildBase, baseView } from './bases.js';
import {
  cannonGroup, barrelPivot, sideBarrels, muzzle, muzzleLight,
  wall, wallMat, WALL_Z, gateMeshes, obstacleMeshes, barrelGlow, arrowMesh, MAX_ARROWS, fireMesh, MAX_FIRE, lightPillar,
} from './models.js';
import { loadCharacters, crowds, writeVat, createHero, HERO_DEFS, rings } from './characters.js';
import { fx, burst, trail, explodeDebris, shockwave, addPillar, clearFx, updateFx, syncFx, popup } from './fx.js';
import { save, persist, HEROES, heroLevel, stats } from './save.js';
import { ensureAudio, sfx, boom, fanfare, vibrate } from './audio.js';
import {
  initUI, showOverlay, openOverlay, hideOverlay, updateHud, renderStages, showBanner, flash, refreshHeroButton,
} from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- Tipos de unidad ----------
const UNIT = {
  soldier: { team: 0, r: 0.28, hp: 1, speed: 7 },
  knight: { team: 0, r: 0.32, hp: 3, speed: 6.4 },
  legion: { team: 1, r: 0.28, hp: 1, speed: 3.2 },
  scout: { team: 1, r: 0.24, hp: 1, speed: 5.4 },
  ogre: { team: 1, r: 0.7, hp: 8, speed: 2.2, big: true },
  boss: { team: 1, r: 1.1, hp: 60, speed: 1.5, big: true },
  king: { team: 0, r: 0.6, speed: 4.2, big: true, hero: true },
  archer: { team: 0, r: 0.5, speed: 3.4, big: true, hero: true },
  mage: { team: 0, r: 0.5, speed: 3.2, big: true, hero: true },
  rogue: { team: 0, r: 0.5, speed: 5.2, big: true, hero: true, ghost: true },
};
const MAX_BLUE = 700;
const MAX_RED = 420;

const heroStats = (id, L) => ({
  king: { hp: 22 + 6 * L, radius: 2.3 + 0.12 * L, cd: 2.0 },
  archer: { hp: 10 + 3 * L, cd: Math.max(0.16, 0.42 - 0.025 * L) },
  mage: { hp: 12 + 3 * L, radius: 1.7 + 0.1 * L, cd: Math.max(0.9, 1.5 - 0.05 * L) },
  rogue: { hp: 45 + 12 * L, radius: 2.0 + 0.08 * L, cd: 1.5 },
}[id]);

// ---------- Estado ----------
const G = { state: 'menu', base: null, charge: 0, wallHp: 0 }; // menu | play | transition | win | lose
let units = [], gates = [], obstacles = [], barrels = [], shots = [];
let cannon = { x: 0, tx: 0, recoil: 0, shotN: 0 };
let spawner, trans = null;
let t = 0, endTimer = 0, firing = false, fireTimer = 0, earned = 0, blueCount = 0, redCount = 0;
let stage = 0, stageCount = 1, intro = 0, timeScale = 1, slowTimer = 0, flashLock = false;
let basePop = 0, popTimer = 0;
let drag = null;
const keys = {};
const cam = { shake: 0, dolly: 0 };

// ============================================================
// Construcción de niveles
// ============================================================
function gatePool(n) {
  const pool = [
    { kind: 'mul', v: 2, label: '×2', w: 4 },
    { kind: 'add', v: 5, label: '+5', w: 2 },
    { kind: 'add', v: 10, label: '+10', w: 2 },
    { kind: 'mul', v: 3, label: '×3', w: 2 },
  ];
  if (n >= 2) pool.push({ kind: 'knight', v: 0, label: '⚔', w: 1.6 });
  if (n >= 4) pool.push({ kind: 'add', v: 20, label: '+20', w: 1 });
  if (n >= 6) pool.push({ kind: 'mul', v: 4, label: '×4', w: 1 });
  if (n >= 9) pool.push({ kind: 'mul', v: 5, label: '×5', w: 0.6 });
  return pool;
}
const badPool = (n) => [{ kind: 'div', v: 2, label: '÷2' }, ...(n >= 6 ? [{ kind: 'div', v: 3, label: '÷3' }] : [])];

function makeGate(id, x, w, z, op, amp, speed) {
  const g = { id, bit: 1 << id, x, w, z, op, amp, speed, phase: id * 1.7, flash: 0, pop: 0, count: 0 };
  g.view = gateMeshes(g);
  return g;
}

function clearStage() {
  for (const u of units) if (u.view) u.view.dispose();
  freeScope('stage');
  clearFx();
  gates = []; obstacles = []; barrels = []; units = []; shots = [];
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
  const bad = badPool(n);
  const slots = 3 + (n >= 3 ? 1 : 0) + (n >= 7 ? 1 : 0);
  const obstacleChance = n < 2 ? 0 : Math.min(0.55, 0.3 + n * 0.03);
  let id = 0, placedObstacle = false;
  const slotZ = [];
  for (let i = 0; i < slots; i++) {
    const z = 7 + i * (24 / (slots - 1));
    slotZ.push(z);
    const middle = i > 0 && i < slots - 1;
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
    } else if (rnd() < 0.5) {
      const trap = n >= 3 && rnd() < 0.45 ? (rnd() < 0.5 ? -1 : 1) : 0;
      for (const side of [-1, 1]) {
        const op = side === trap ? bad[Math.floor(rnd() * bad.length)] : pick();
        gates.push(makeGate(id++, side * 2.5, 4.4, z, op, 0, 0));
      }
    } else {
      const moving = n >= 3 && rnd() < 0.6;
      const x = moving ? 0 : (rnd() * 2 - 1) * 2.2;
      const op = n >= 5 && rnd() < 0.15 ? bad[0] : pick();
      gates.push(makeGate(id++, x, 4.2, z, op, moving ? 2.6 : 0, 0.7 + rnd() * 0.9));
    }
  }
  // Barriles explosivos en la mitad enemiga
  if (n >= 2) {
    const count = n >= 5 && rnd() < 0.5 ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const i = slots - 2 + (k % 2);
      const z = (slotZ[Math.max(0, i - 1)] + slotZ[Math.min(slots - 1, i)]) / 2 + 0.2;
      const b = { type: 'barrel', x: (rnd() * 2 - 1) * 3.4, z, alive: true };
      obstacleMeshes(b);
      barrels.push(b);
    }
  }

  const boss = isBoss(n);
  const hp = Math.round((60 + n * 30) * (1 + s * 0.3) * (boss ? 2.6 : 1));
  G.base = { hp, max: hp, flash: 0, wobble: 0 };
  spawner = {
    timer: 2.4, queue: 0, gap: 0, wave: 0,
    interval: Math.max(1.2, 3.4 - n * 0.12 - s * 0.2),
    size: 3 + Math.floor(n * 1.1) + s * 2,
    scoutChance: n >= 3 ? Math.min(0.4, 0.15 + n * 0.02) : 0,
    ogreEvery: boss ? 2 : n >= 4 ? 3 : 0,
    ogreHp: (boss ? 14 : 8) + n,
    bossPending: boss,
    towerTimer: 3,
    towerInterval: n < 2 ? 0 : Math.max(0.45, 1.9 - n * 0.08),
  };
  buildBase(themeFor(n).base);
  fireTimer = 0;
  renderStages(stage, stageCount);
}

function buildLevel(n) {
  buildEnvironment(themeFor(n));
  stage = 0;
  stageCount = stagesFor(n);
  cannon = { x: 0, tx: 0, recoil: 0, shotN: 0 };
  G.charge = 0; t = 0; earned = 0; firing = false; drag = null;
  G.wallHp = stats.wallHp();
  wall.visible = G.wallHp > 0;
  sideBarrels.visible = stats.triple();
  buildStage(n, 0);
  cannonGroup.visible = true;
}

// ============================================================
// Unidades
// ============================================================
function addUnit(type, x, z, opts = {}) {
  const d = UNIT[type];
  if (d.team === 1 && !d.big && redCount >= MAX_RED) return null;
  const hp = opts.hp || d.hp || 1;
  const u = {
    type, team: d.team, x, z, pz: z, y: 0, vx: 0,
    r: d.r, hp, maxHp: hp, big: !!d.big, hero: !!d.hero, ghost: !!d.ghost, speed: d.speed, at: Math.random() * 3,
    passed: opts.passed || 0, dead: false, seed: Math.random() * 6.28, spawn: 0, atk: 0, cd: 1, shots: 0,
  };
  units.push(u);
  if (u.team === 0) blueCount++; else redCount++;
  return u;
}

function kill(u, color) {
  if (u.dead) return;
  u.dead = true;
  if (u.team === 0) blueCount--; else redCount--;
  if (color) burst(u.x, 0.7, u.z, color, u.big ? 30 : 5, u.big ? 7 : 4);
  if (u.view) {
    u.view.dispose();
    u.view = null;
    if (u.hero) { popup(u.x, 2.5, u.z, `¡${HEROES[u.type].name} ha caído!`, 'bad'); boom(0.15, 0.5); }
  }
  if (u.type === 'boss') { cam.shake = 0.8; boom(0.3, 1); popup(u.x, 3, u.z, '¡Jefe abatido!', 'big'); }
}

function damage(u, amount, color) {
  u.hp -= amount;
  if (u.hp <= 0) kill(u, color);
}

const teamColor = (u) => (u.team === 0 ? '#4a9bff' : u.type === 'scout' ? '#ff9a3a' : '#ff4a3a');

function nearestEnemy(team, x, z, maxD, aheadOnly) {
  let best = null, bd = maxD * maxD;
  for (const u of units) {
    if (u.dead || u.team === team || u.ghost) continue;
    if (aheadOnly && u.z < z - 1) continue;
    const dx = u.x - x, dz = u.z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

function enemiesNear(team, x, z, r, cb) {
  const r2 = r * r;
  for (const u of units) {
    if (u.dead || u.team === team || u.ghost) continue;
    const dx = u.x - x, dz = u.z - z;
    if (dx * dx + dz * dz < r2) cb(u);
  }
}

function aoe(team, x, z, r, bigDmg, color) {
  let n = 0;
  enemiesNear(team, x, z, r, (u) => { damage(u, u.big ? bigDmg : u.hp, teamColor(u)); n++; });
  burst(x, 0.5, z, color, 40, 8, 1.3);
  shockwave(x, z, new THREE.Color(color).multiplyScalar(2.2), r * 1.6, 2.2);
  return n;
}

// ---------- Proyectiles ----------
function fireShot(kind, team, sx, sy, sz, tx, tz, speed, arc, opts = {}) {
  if (shots.length > MAX_ARROWS + MAX_FIRE) return;
  const dist = Math.hypot(tx - sx, tz - sz, sy);
  shots.push({ kind, team, sx, sy, sz, tx, tz, t: 0, T: Math.max(0.25, dist / speed), arc, aoe: opts.aoe || 0, dmg: opts.dmg || 1, x: sx, y: sy, z: sz, dx: 0, dy: 0, dz: 1 });
}

function updateShots(dt) {
  let j = 0;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    s.t += dt;
    const k = Math.min(1, s.t / s.T);
    const nx = s.sx + (s.tx - s.sx) * k;
    const nz = s.sz + (s.tz - s.sz) * k;
    const ny = s.sy + (0.4 - s.sy) * k + s.arc * 4 * k * (1 - k);
    s.dx = nx - s.x; s.dy = ny - s.y; s.dz = nz - s.z;
    s.x = nx; s.y = ny; s.z = nz;
    if (s.kind === 'fire') { trail(s.x, s.y, s.z, '#ff8a2a', 1.2); trail(s.x, s.y, s.z, '#ffd24a', 0.8); }
    if (k < 1) { shots[j++] = s; continue; }
    // Impacto
    if (s.aoe) {
      aoe(s.team, s.tx, s.tz, s.aoe, s.dmg, '#ff7a2a');
      cam.shake = Math.max(cam.shake, 0.3);
      boom(0.12, 0.45, 1400);
    } else {
      const target = nearestEnemy(s.team, s.tx, s.tz, 0.9, false);
      if (target) {
        damage(target, target.hero ? 2 : 1, teamColor(target));
        sfx('thud', 160, 0.05, 'triangle', 0.02, -60, 0.04);
      } else {
        burst(s.tx, 0.2, s.tz, '#d8c8a8', 2, 2, 0.6);
      }
    }
  }
  shots.length = j;
}

// ---------- Héroes ----------
function spawnHero() {
  const id = save.hero;
  const L = Math.max(1, heroLevel(id));
  const st = heroStats(id, L);
  const u = addUnit(id, cannon.x, CANNON_Z + 1.2, { hp: st.hp });
  u.view = createHero(id);
  u.cd = 0.6;
  u.L = L;
  const pillar = lightPillar(cannon.x, CANNON_Z + 1.2, HERO_DEFS[id].aura.clone().multiplyScalar(1.4));
  addPillar(pillar);
  burst(cannon.x, 1.2, CANNON_Z + 1.4, '#ffd34d', 50, 8, 1.4);
  showBanner(HEROES[id].name, `⚡ ${HEROES[id].ability}`, 'herob');
  fanfare([392, 523, 659, 784], 0.07, 'sawtooth', 0.04);
  boom(0.12, 0.5);
  cam.shake = Math.max(cam.shake, 0.4);
  vibrate(50);
}

function heroAbility(u, dt) {
  u.cd -= dt;
  u.atk = Math.max(0, u.atk - dt);
  const st = heroStats(u.type, u.L);
  if (u.cd > 0) return;
  if (u.type === 'king') {
    const target = nearestEnemy(0, u.x, u.z, 2.8, false);
    if (!target) { u.cd = 0.15; return; }
    u.atk = 0.5;
    u.cd = st.cd;
    const n = aoe(0, u.x, u.z + 0.6, st.radius, 6, '#ffc531');
    explodeDebris(u.x, 0, u.z + 0.5, ['#8a7a5a', '#6a5a3a', '#c9b98a'], 10, 6, 0.25);
    cam.shake = Math.max(cam.shake, 0.45);
    boom(0.22, 0.6);
    popup(u.x, 3, u.z, n > 2 ? `¡TERREMOTO! ×${n}` : '¡TERREMOTO!', 'gold');
  } else if (u.type === 'archer') {
    const target = nearestEnemy(0, u.x, u.z, 12, true);
    if (!target) { u.cd = 0.15; return; }
    u.atk = 0.4;
    u.cd = st.cd;
    u.shots++;
    const volley = u.shots % 6 === 0;
    const targets = volley ? units.filter((e) => !e.dead && e.team === 1 && e.z > u.z - 1 && Math.abs(e.z - u.z) < 14).slice(0, 5) : [target];
    for (const e of targets) fireShot('arrow', 0, u.x, 1.6, u.z + 0.4, e.x, e.z - e.speed * 0.25, 26, 1.2);
    sfx('bow', 900, 0.06, 'triangle', 0.03, -500, 0.05);
    if (volley) popup(u.x, 3, u.z, '¡RÁFAGA!', 'good');
  } else if (u.type === 'mage') {
    // Elige el grupo enemigo más denso a su alcance
    let best = null, bestN = 0;
    const cand = units.filter((e) => !e.dead && e.team === 1 && e.z > u.z - 1 && e.z - u.z < 14);
    for (let i = 0; i < Math.min(10, cand.length); i++) {
      const c = cand[Math.floor(Math.random() * cand.length)];
      let n = 0;
      enemiesNear(0, c.x, c.z, st.radius, () => n++);
      if (n > bestN) { bestN = n; best = c; }
    }
    if (!best) { u.cd = 0.2; return; }
    u.atk = 0.6;
    u.cd = st.cd;
    fireShot('fire', 0, u.x - 0.3, 2.6, u.z + 0.3, best.x, best.z - best.speed * 0.4, 16, 2.5, { aoe: st.radius, dmg: 5 });
    sfx('cast', 300, 0.3, 'sawtooth', 0.04, 500, 0.1);
    popup(u.x, 3.2, u.z, '¡BOLA DE FUEGO!', 'gold');
  } else if (u.type === 'rogue') {
    const target = nearestEnemy(0, u.x, u.z + 1, 7, true);
    if (!target) { u.cd = 0.15; return; }
    u.cd = st.cd;
    u.atk = 0.7;
    burst(u.x, 1, u.z, '#b04aff', 25, 5, 1.1);
    u.x = target.x; u.z = Math.max(u.z, target.z - 0.7);
    burst(u.x, 1, u.z, '#ff4ad0', 25, 5, 1.1);
    const n = aoe(0, u.x, u.z + 0.5, st.radius, 6, '#ff4ad0');
    sfx('slash', 1400, 0.12, 'sawtooth', 0.04, -900, 0.05);
    popup(u.x, 3, u.z, n > 1 ? `¡DANZA DE CUCHILLAS! ×${n}` : '¡DANZA DE CUCHILLAS!', 'gold');
  }
}

// ============================================================
// Acciones del jugador
// ============================================================
function shoot() {
  if (blueCount >= MAX_BLUE) return;
  const type = Math.random() < stats.knightChance() ? 'knight' : 'soldier';
  addUnit(type, cannon.x + (Math.random() - 0.5) * 0.3, CANNON_Z + 0.9);
  cannon.shotN++;
  if (stats.triple() && cannon.shotN % 2 === 0) {
    for (const s of [-1, 1]) {
      const u = addUnit('soldier', cannon.x + s * 0.55, CANNON_Z + 0.8);
      if (u) u.vx = s * 1.5;
    }
  }
  G.charge = Math.min(stats.chargeMax(), G.charge + 1);
  cannon.recoil = 1;
  sfx('shoot', 520, 0.05, 'triangle', 0.025, -200, 0.07);
}

function launchHero() {
  if (G.state !== 'play' || G.charge < stats.chargeMax()) return;
  G.charge = 0;
  cannon.recoil = 1.8;
  spawnHero();
}

function destroyBase(big) {
  baseView.group.visible = false;
  explodeDebris(0, 0.5, LEN, baseView.colors, big ? 160 : 100, big ? 14 : 12, 1.1);
  burst(0, 3, LEN + 1, '#ffc531', big ? 240 : 150, 12, 1.6);
  burst(0, 3, LEN + 1, '#ff5a3a', big ? 180 : 110, 10, 1.4);
  shockwave(0, LEN + 1, new THREE.Color(2.5, 1.6, 0.6), 24);
  cam.shake = big ? 1.2 : 0.8;
  flash(0.6);
  for (const u of units) if (u.team === 1 && !u.dead) kill(u, '#ff5a3a');
  boom(0.35, 1.4);
  vibrate([60, 40, 120]);
}

function stageClear() {
  destroyBase(false);
  fanfare([523, 784], 0.1);
  G.state = 'transition';
  trans = { t: 0, rebuilt: false };
}

function win() {
  G.state = 'win';
  endTimer = 2.2;
  timeScale = 0.25;
  slowTimer = 0.9;
  const n = save.level;
  const reward = Math.round((25 + n * 8 + (stageCount - 1) * 15 + (isBoss(n) ? 60 : 0)) * stats.coinMult());
  save.coins += reward;
  save.level += 1;
  persist();
  destroyBase(true);
  fanfare([523, 659, 784, 1047], 0.09);
  const next = save.level;
  showOverlay(isBoss(n) ? '¡Jefe derrotado!' : '¡Victoria!', `+${reward} monedas\nSiguiente: ${themeFor(next).name}${isBoss(next) ? ' (jefe)' : ''}`, `Nivel ${next}`);
}

function lose() {
  G.state = 'lose';
  endTimer = 1.4;
  const reward = Math.floor((earned / 4) * stats.coinMult());
  save.coins += reward;
  persist();
  cannonGroup.visible = false;
  explodeDebris(cannon.x, 0.2, CANNON_Z - 0.6, ['#2f7cf6', '#1a2f5c', '#ffc531'], 40, 9, 0.5);
  burst(cannon.x, 1, CANNON_Z, '#5fb0ff', 120, 8, 1.4);
  shockwave(cannon.x, CANNON_Z, new THREE.Color(0.6, 1.4, 3), 10);
  cam.shake = 0.9;
  flash(0.5);
  boom(0.3, 1.0);
  sfx('lose', 300, 0.6, 'sawtooth', 0.05, -220, 0);
  vibrate(220);
  showOverlay('Te han invadido', reward ? `+${reward} monedas por daño\nMejora tu reino o invoca héroes` : 'Mejora tu reino o invoca héroes', 'Reintentar');
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

function explodeBarrel(b) {
  b.alive = false;
  b.grp.visible = false;
  let n = 0;
  enemiesNear(0, b.x, b.z, 3.2, (u) => { damage(u, u.big ? 8 : u.hp, teamColor(u)); n++; });
  for (const u of units) {
    if (!u.dead && u.team === 0 && !u.big && Math.hypot(u.x - b.x, u.z - b.z) < 0.9) kill(u, '#4a9bff');
  }
  burst(b.x, 0.8, b.z, '#ff8a2a', 90, 11, 1.5);
  burst(b.x, 0.8, b.z, '#ffe08a', 50, 8, 1.1);
  explodeDebris(b.x, 0.3, b.z, ['#c8281e', '#7a1a12', '#c9d1dc'], 14, 7, 0.35);
  shockwave(b.x, b.z, new THREE.Color(2.6, 1.2, 0.3), 8);
  cam.shake = Math.max(cam.shake, 0.55);
  boom(0.3, 0.9);
  vibrate(60);
  popup(b.x, 2, b.z, n ? `¡BOOM! ×${n}` : '¡BOOM!', 'gold');
}

function update(dt) {
  t += dt;
  moveCannon(dt);
  updateGates(dt);
  updateObstacles(dt);
  const base = G.base;
  base.flash = Math.max(0, base.flash - dt * 5);
  intro = Math.max(0, intro - dt);

  fireTimer -= dt;
  if ((firing || keys.Space) && intro < 0.4) {
    while (fireTimer <= 0) { shoot(); fireTimer += 1 / stats.fireRate(); }
  } else if (fireTimer < 0) {
    fireTimer = 0;
  }

  // Oleadas enemigas
  const sp = spawner;
  sp.timer -= dt;
  if (sp.timer <= 0) {
    sp.wave++;
    sp.queue += sp.size + Math.floor(sp.wave / 3);
    sp.timer = sp.interval;
    if (sp.ogreEvery && sp.wave % sp.ogreEvery === 0) addUnit('ogre', (Math.random() - 0.5) * 2, LEN - 1, { hp: sp.ogreHp });
    if (sp.bossPending && sp.wave === 2) {
      sp.bossPending = false;
      addUnit('boss', 0, LEN - 1.2, { hp: 60 + save.level * 8 });
      showBanner('¡Señor de la guerra!', 'Ha salido de la fortaleza', 'boss');
      boom(0.3, 1.2, 400);
      cam.shake = 0.6;
    }
  }
  if (sp.queue > 0) {
    sp.gap -= dt;
    if (sp.gap <= 0) {
      sp.gap = 0.11;
      sp.queue--;
      addUnit(Math.random() < sp.scoutChance ? 'scout' : 'legion', (Math.random() - 0.5) * 2, LEN - 0.6);
    }
  }
  // Arqueros en las torres de la base
  if (sp.towerInterval && baseView?.towers) {
    sp.towerTimer -= dt;
    if (sp.towerTimer <= 0) {
      sp.towerTimer = sp.towerInterval * (0.7 + Math.random() * 0.6);
      const targets = units.filter((u) => !u.dead && u.team === 0 && !u.ghost && u.z > LEN - 24);
      if (targets.length) {
        const tg = targets[Math.floor(Math.random() * targets.length)];
        const tw = baseView.towers[Math.floor(Math.random() * baseView.towers.length)];
        fireShot('arrow', 1, -tw[0], tw[1], LEN + tw[2], tg.x, tg.z + tg.speed * 0.5, 24, 2.2);
        sfx('tbow', 700, 0.05, 'triangle', 0.015, -300, 0.08);
      }
    }
  }

  const decay = Math.pow(0.02, dt);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.dead) continue;
    u.pz = u.z;
    u.spawn = Math.min(1, u.spawn + dt * 6);
    u.atk = Math.max(0, u.atk - dt);
    if (u.team === 0) u.z += u.speed * dt;
    else {
      u.z -= u.speed * dt;
      if (u.z > LEN - 4 && !u.big) u.vx += (u.x >= 0 ? 1 : -1) * 6 * dt * Math.random();
    }
    u.x += u.vx * dt;
    u.vx *= decay;
    const lim = HALF - u.r;
    if (u.x < -lim) u.x = -lim; else if (u.x > lim) u.x = lim;

    if (u.hero) {
      heroAbility(u, dt);
    }

    if (!u.big) {
      for (const o of obstacles) {
        if (hitsObstacle(u, o)) {
          kill(u, teamColor(u));
          sfx('zap', 200, 0.05, 'sawtooth', 0.02, -120, 0.05);
          break;
        }
      }
      if (u.dead) continue;
    }

    if (u.team === 0) {
      for (const b of barrels) {
        if (b.alive && Math.abs(u.x - b.x) < 0.65 + u.r && Math.abs(u.z - b.z) < 0.6 + u.r) explodeBarrel(b);
      }
      if (u.dead) continue;
    }

    if (u.team === 0 && !u.big) {
      for (const g of gates) {
        if ((u.passed & g.bit) || u.pz >= g.z || u.z < g.z || Math.abs(u.x - g.x) > g.w / 2) continue;
        u.passed |= g.bit;
        g.flash = 1;
        const op = g.op;
        if (op.kind === 'div') {
          g.count++;
          if (g.count % op.v !== 0) { kill(u, '#ff4a3a'); g.pop--; sfx('cut', 160, 0.05, 'sawtooth', 0.02, -80, 0.05); break; }
          continue;
        }
        if (op.kind === 'knight') {
          if (u.type === 'soldier') {
            u.type = 'knight'; u.hp = u.maxHp = UNIT.knight.hp; u.r = UNIT.knight.r; u.speed = UNIT.knight.speed;
            burst(u.x, 1.0, g.z, '#ffd34d', 3, 3, 0.8);
            g.pop++;
            sfx('knight', 1200, 0.06, 'square', 0.02, 400, 0.06);
          }
          continue;
        }
        const n = op.kind === 'mul' ? op.v - 1 : op.v;
        for (let k = 0; k < n && blueCount < MAX_BLUE; k++) {
          const c = addUnit(u.type, u.x + (Math.random() - 0.5) * 0.8, u.z - Math.random() * 0.6, { passed: u.passed });
          c.pz = c.z;
          c.vx = (Math.random() - 0.5) * 5;
          g.pop++;
        }
        burst(u.x, 1.2, g.z, op.kind === 'mul' ? '#5fb0ff' : '#5dffa0', 2, 3, 0.7);
        sfx('gate', 880, 0.06, 'square', 0.02, 300, 0.06);
      }
      if (u.dead) continue;
    }

    if (u.team === 0 && u.z >= LEN - 0.3) {
      base.hp -= u.hp;
      earned += u.hp;
      basePop += u.hp;
      base.flash = 1;
      base.wobble = Math.min(1, base.wobble + (u.big ? 1 : 0.15));
      burst(u.x, 1.2, LEN - 0.3, '#ffd34d', u.big ? 40 : 4, u.big ? 9 : 4);
      if (u.big) { cam.shake = Math.max(cam.shake, 0.5); shockwave(u.x, LEN - 0.5, new THREE.Color(2.5, 1.6, 0.6), 9); boom(0.22, 0.6); vibrate(30); }
      sfx('hit', 180, 0.08, 'square', 0.03, -60, 0.05);
      kill(u);
    } else if (u.team === 1 && G.wallHp > 0 && u.z <= WALL_Z + 0.3) {
      const hit = u.big ? Math.min(G.wallHp, 5) : 1;
      G.wallHp -= hit;
      burst(u.x, 0.7, WALL_Z, '#6ac8ff', u.big ? 25 : 4, 4);
      sfx('wall', 520, 0.05, 'triangle', 0.025, -200, 0.05);
      if (u.big) { u.hp -= 5; u.z += 1.2; if (u.hp <= 0) kill(u, '#ff4a3a'); } else kill(u);
      if (G.wallHp <= 0) {
        wall.visible = false;
        explodeDebris(0, 0.4, WALL_Z, ['#e8edf7', '#6ac8ff'], 30, 7, 0.4);
        shockwave(0, WALL_Z, new THREE.Color(0.6, 1.6, 3), 10);
        popup(0, 2, WALL_Z, '¡Muralla destruida!', 'bad');
        boom(0.25, 0.8);
        cam.shake = Math.max(cam.shake, 0.5);
      }
    } else if (u.team === 1 && u.z <= CANNON_Z + 0.2) {
      kill(u);
      lose();
      return;
    }
  }

  // Combate cuerpo a cuerpo (celdas de 1 unidad en z)
  redGrid.clear();
  for (const u of units) {
    if (u.dead || u.team !== 1) continue;
    const k = Math.floor(u.z);
    let list = redGrid.get(k);
    if (!list) redGrid.set(k, (list = []));
    list.push(u);
  }
  for (const b of units) {
    if (b.dead || b.team !== 0 || b.ghost) continue;
    const k = Math.floor(b.z);
    outer: for (let kk = k - 2; kk <= k + 2; kk++) {
      const list = redGrid.get(kk);
      if (!list) continue;
      for (const r of list) {
        if (r.dead) continue;
        const dx = b.x - r.x, dz = b.z - r.z, d2 = dx * dx + dz * dz, rr = b.r + r.r;
        if (d2 < (rr + 0.9) * (rr + 0.9)) { b.atk = 0.35; r.atk = 0.35; }
        if (d2 < rr * rr) {
          const d = Math.min(b.hp, r.hp);
          b.hp -= d; r.hp -= d;
          if (r.hp <= 0) { kill(r, teamColor(r)); if (r.big) { cam.shake = Math.max(cam.shake, 0.3); boom(0.15, 0.5); } }
          if (b.hp <= 0) kill(b, teamColor(b));
          sfx('clash', 300 + Math.random() * 300, 0.04, 'triangle', 0.02, -100, 0.04);
          if (b.dead) break outer;
        }
      }
    }
  }

  let j = 0;
  for (let i = 0; i < units.length; i++) if (!units[i].dead) units[j++] = units[i];
  units.length = j;

  updateShots(dt);
  updateFx(dt);
  flushPopups(dt);

  if (base.hp <= 0) {
    base.hp = 0;
    if (stage < stageCount - 1) stageClear(); else win();
  }
}

function flushPopups(dt) {
  popTimer -= dt;
  if (popTimer > 0) return;
  popTimer = 0.35;
  for (const g of gates) {
    if (!g.pop) continue;
    const k = g.op.kind;
    const txt = k === 'knight' ? `⚔ ${g.pop}` : g.pop > 0 ? `+${g.pop}` : `${g.pop}`;
    popup(g.x, 2.9, g.z, txt, k === 'knight' ? 'gold' : k === 'div' ? 'bad' : k === 'add' ? 'add' : 'good');
    g.pop = 0;
  }
  if (basePop) { popup((Math.random() - 0.5) * 4, 5.5, LEN, `-${basePop}`, 'dmg'); basePop = 0; }
}

const ease = (x) => x * x * (3 - 2 * x);
function updateTransition(dt) {
  t += dt;
  trans.t += dt;
  moveCannon(dt);
  updateGates(dt);
  updateObstacles(dt);
  updateShots(dt);
  updateFx(dt);
  for (const u of units) u.z += u.speed * 0.6 * dt;
  const tt = trans.t;
  if (tt < 0.6) return;
  if (tt < 1.1) {
    const k = ease((tt - 0.6) / 0.5);
    cam.dolly = k * 26;
    flashLock = true;
    flash(0, k * 0.9);
    return;
  }
  if (!trans.rebuilt) {
    trans.rebuilt = true;
    stage++;
    buildStage(save.level, stage);
  }
  const k = ease(Math.min(1, (tt - 1.1) / 0.7));
  cam.dolly = -16 * (1 - k);
  flash(0, (1 - k) * 0.9);
  if (k >= 1) {
    flashLock = false;
    flash(0, 0);
    cam.dolly = 0;
    G.state = 'play';
    trans = null;
    showBanner(`Fase ${stage + 1}`, `de ${stageCount}`);
  }
}

function updateGates(dt) {
  for (const g of gates) {
    if (g.amp) g.x = Math.sin(t * g.speed + g.phase) * g.amp;
    g.flash = Math.max(0, g.flash - dt * 4);
  }
}

function updateIdle(dt) {
  t += dt;
  updateGates(dt);
  updateObstacles(dt);
  updateShots(dt);
  updateFx(dt);
  if (G.base) G.base.flash = Math.max(0, G.base.flash - dt * 5);
  if (G.state === 'win') for (const u of units) if (u.team === 0) u.z += u.speed * 0.5 * dt;
  if (endTimer > 0) {
    endTimer -= dt;
    if (endTimer <= 0) openOverlay();
  }
}

// ============================================================
// Sincronización de la escena
// ============================================================
const dummy = new THREE.Object3D();
const lookTarget = new THREE.Vector3();

function syncScene(dt) {
  setWorldTime(t);

  for (const k in crowds) crowds[k].n = 0;
  rings[0].n = rings[1].n = 0;
  for (const u of units) {
    const sc = 0.4 + 0.6 * u.spawn;
    const attacking = u.atk > 0;
    const rg = rings[u.team];
    if (rg.n < rg.mesh.instanceMatrix.count) {
      dummy.position.set(X(u.x), 0.03, u.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar((u.r * 2.6 + 0.15) * sc);
      dummy.updateMatrix();
      rg.mesh.setMatrixAt(rg.n++, dummy.matrix);
    }
    if (u.view) {
      const v = u.view;
      v.group.position.set(X(u.x), 0, u.z);
      v.group.scale.setScalar(sc);
      v.play(attacking ? 'attack' : 'run', attacking ? 1.3 : 1.1);
      v.update(dt);
      v.aura.scale.setScalar(HERO_DEFS[u.type].height * (1 + Math.sin(t * 6) * 0.08));
      v.aura.material.opacity = 0.35 + 0.45 * (u.hp / u.maxHp);
      continue;
    }
    const c = crowds[u.type];
    if (!c || c.n >= c.def.max) continue;
    const i = c.n++;
    u.at += dt * (attacking ? 1.4 : c.def.rate);
    const s = sc * (u.big ? 0.75 + 0.25 * (u.hp / u.maxHp) : 1);
    dummy.position.set(X(u.x), 0, u.z);
    dummy.rotation.set(0, u.team === 0 ? 0 : Math.PI, u.vx * 0.03);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    c.mesh.setMatrixAt(i, dummy.matrix);
    writeVat(c, i, u.at, attacking);
  }
  for (const rg of rings) { rg.mesh.count = rg.n; rg.mesh.instanceMatrix.needsUpdate = true; }
  for (const k in crowds) {
    const c = crowds[k];
    c.mesh.count = c.n;
    c.mesh.instanceMatrix.needsUpdate = true;
    c.vat.needsUpdate = true;
  }

  // Proyectiles
  let na = 0, nf = 0;
  for (const s of shots) {
    if (s.kind === 'arrow' && na < MAX_ARROWS) {
      dummy.position.set(X(s.x), s.y, s.z);
      lookTarget.set(X(s.x + s.dx), s.y + s.dy, s.z + s.dz);
      dummy.scale.setScalar(1);
      dummy.lookAt(lookTarget);
      dummy.updateMatrix();
      arrowMesh.setMatrixAt(na++, dummy.matrix);
    } else if (s.kind === 'fire' && nf < MAX_FIRE) {
      dummy.position.set(X(s.x), s.y, s.z);
      dummy.rotation.set(t * 5, t * 7, 0);
      dummy.scale.setScalar(1 + Math.sin(t * 30) * 0.12);
      dummy.updateMatrix();
      fireMesh.setMatrixAt(nf++, dummy.matrix);
    }
  }
  arrowMesh.count = na; arrowMesh.instanceMatrix.needsUpdate = true;
  fireMesh.count = nf; fireMesh.instanceMatrix.needsUpdate = true;

  syncFx();

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
    else { o.blade.position.x = X(o.x); o.blade.rotation.z += dt * 14; }
  }
  barrelGlow(0.25 + Math.abs(Math.sin(t * 4)) * 0.5);
  for (const b of barrels) if (b.alive) b.fuse.scale.setScalar(0.8 + Math.random() * 0.6);

  cannonGroup.position.x = X(cannon.x);
  cannon.recoil = Math.max(0, cannon.recoil - dt * 7);
  barrelPivot.position.z = -cannon.recoil * 0.25;
  barrelPivot.rotation.z = (cannon.tx - cannon.x) * 0.08;
  const m = Math.max(0, cannon.recoil - 0.4);
  muzzle.scale.setScalar(0.2 + m * 1.2);
  muzzle.material.opacity = Math.min(1, m * 1.6);
  muzzleLight.intensity = m * 25;

  if (wall.visible) wallMat.opacity = 0.18 + 0.25 * Math.min(1, G.wallHp / Math.max(1, stats.wallHp())) + Math.sin(t * 5) * 0.05;

  const base = G.base;
  if (base && baseView) {
    base.wobble = Math.max(0, base.wobble - dt * 3);
    const e = base.flash * 0.45;
    for (const mt of baseView.flash) mt.emissiveIntensity = e;
    const bs = isBoss(save.level) && G.state !== 'win' ? 1.15 : 1;
    baseView.group.scale.set(bs * (1 + base.wobble * 0.03), bs * (1 - base.wobble * 0.04), bs * (1 + base.wobble * 0.03));
    baseView.group.rotation.z = Math.sin(t * 40) * base.wobble * 0.01 + (1 - base.hp / base.max) * 0.02;
    baseView.anim(t);
  }

  updateClouds(dt);
  updateWeather(dt);

  // Cámara: entrada cinematográfica, temblor y avance entre fases
  cam.shake = Math.max(0, cam.shake - dt * 1.8);
  const s = cam.shake * cam.shake;
  const introK = ease(Math.min(1, intro / 1.4));
  const dolly = cam.dolly + introK * 22;
  const camX = X(cannon.x) * 0.18;
  camera.position.set(
    CAM_BASE.x + camX + (Math.random() - 0.5) * s,
    CAM_BASE.y + (Math.random() - 0.5) * s + dolly * 0.1 + introK * 4,
    CAM_BASE.z + (Math.random() - 0.5) * s * 0.5 + dolly,
  );
  camera.lookAt(CAM_LOOK.x + camX * 0.5, CAM_LOOK.y, CAM_LOOK.z + dolly);
  if (cam.debug) { camera.position.set(...cam.debug[0]); camera.lookAt(...cam.debug[1]); }
}

// ============================================================
// Partida y entrada
// ============================================================
function startGame() {
  ensureAudio();
  buildLevel(save.level);
  G.state = 'play';
  endTimer = 0;
  intro = 1.4;
  timeScale = 1;
  hideOverlay();
  const n = save.level;
  if (isBoss(n)) showBanner('¡JEFE!', themeFor(n).name, 'boss');
  else showBanner(`Nivel ${n}`, stageCount > 1 ? `${themeFor(n).name} · ${stageCount} fases` : themeFor(n).name);
  sfx('horn', 220, 0.6, 'sawtooth', 0.04, 110, 0);
}

canvas.addEventListener('pointerdown', (e) => {
  if (G.state !== 'play') return;
  ensureAudio();
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignorar */ }
  drag = { id: e.pointerId, sx: e.clientX, cx: cannon.tx };
  firing = true;
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  cannon.tx = drag.cx + (e.clientX - drag.sx) * view.worldPerPx * 1.25;
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) { drag = null; firing = false; } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyG' || e.code === 'KeyH') launchHero();
  if (e.code === 'Space') { e.preventDefault(); ensureAudio(); }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { firing = false; drag = null; for (const k in keys) keys[k] = false; }
});
$('giant').addEventListener('click', launchHero);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// Bucle principal
// ============================================================
window.addEventListener('resize', resize);
resize();
$('loader').querySelector('span').textContent = 'Reclutando el ejército…';
try {
  await loadCharacters((p) => { $('loader').querySelector('span').textContent = `Reclutando el ejército… ${Math.round(p * 100)}%`; });
} catch (err) {
  window.__bootFail?.(err);
  throw err;
}
initUI({ onPlay: startGame });
buildLevel(save.level);
{
  const n = save.level;
  showOverlay('Mob Rush', `Arrastra para apuntar · mantén pulsado para disparar\nNivel ${n}: ${themeFor(n).name}${isBoss(n) ? ' (jefe)' : ''}`, n > 1 ? `Jugar nivel ${n}` : 'Jugar');
}

let perfFrames = 0, perfTime = 0, perfDone = false;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const real = Math.min(0.033, clock.getDelta());
  if (slowTimer > 0) {
    slowTimer -= real;
    timeScale = slowTimer > 0 ? 0.25 + 0.75 * (1 - slowTimer / 0.9) ** 3 : 1;
  }
  const dt = real * timeScale;
  if (G.state === 'play') update(dt);
  else if (G.state === 'transition') updateTransition(dt);
  else updateIdle(dt);
  syncScene(dt);
  composer.render();
  updateHud(G);
  if (!perfDone && G.state === 'play') {
    perfFrames++; perfTime += real;
    if (perfFrames >= 150) {
      perfDone = true;
      if (perfTime / perfFrames > 0.024) lowerQuality();
    }
  }
});

window.__booted = true;
requestAnimationFrame(() => $('loader').classList.add('done'));

// Ayudas de depuración desde la consola: __mobrush.goto(n), __mobrush.hero()
window.__mobrush = {
  get state() { return G.state; },
  get units() { return units.length; },
  get base() { return G.base; },
  get stage() { return stage; },
  save,
  goto(n) { save.level = n; persist(); startGame(); },
  hero() { G.charge = stats.chargeMax(); launchHero(); },
  refresh: refreshHeroButton,
  closeup(pos, look) { cam.debug = pos ? [pos, look] : null; },
};
void flashLock;
