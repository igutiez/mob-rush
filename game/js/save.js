// Progreso guardado, héroes, edificios del reino y fórmulas de progresión.

const SAVE_KEY = 'mobrush-save-v1';

export const save = {
  level: 1,
  coins: 0,
  muted: false,
  hero: 'king',
  heroes: { king: 1 },
  buildings: { forge: 0, barracks: 0, mages: 0, treasury: 0, walls: 0 },
};

try {
  const raw = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
  // Migración desde la versión con mejoras "Cadencia" y "Gigante"
  if (raw.rate !== undefined || raw.giant !== undefined) {
    raw.buildings = { ...save.buildings, ...(raw.buildings || {}), forge: raw.rate || 0, mages: raw.giant || 0 };
    delete raw.rate; delete raw.giant;
  }
  Object.assign(save, raw);
  save.buildings = { forge: 0, barracks: 0, mages: 0, treasury: 0, walls: 0, ...save.buildings };
  save.heroes = { king: 1, ...save.heroes };
  if (!save.heroes[save.hero]) save.hero = 'king';
} catch (e) { /* sin almacenamiento */ }

export const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignorar */ } };

// ---------- Héroes ----------
export const RARITY = {
  common: { name: 'Común', color: '#9fb4d0' },
  rare: { name: 'Rara', color: '#4aa8ff' },
  epic: { name: 'Épica', color: '#b46bff' },
  legendary: { name: 'Legendaria', color: '#ffb800' },
};

export const HEROES = {
  king: {
    name: 'Rey Guerrero', rarity: 'common', weight: 42, ability: 'Terremoto',
    desc: 'Avanza en primera línea y aplasta a los enemigos cercanos con un golpe sísmico.',
  },
  archer: {
    name: 'Arquera Élfica', rarity: 'rare', weight: 30, ability: 'Lluvia de flechas',
    desc: 'Dispara flechas sin parar al enemigo más cercano y lanza ráfagas de cinco.',
  },
  mage: {
    name: 'Archimago', rarity: 'epic', weight: 20, ability: 'Bola de fuego',
    desc: 'Lanza bolas de fuego sobre los grupos enemigos más numerosos.',
  },
  griffin: {
    name: 'Grifo Real', rarity: 'legendary', weight: 8, ability: 'Picado',
    desc: 'Vuela por encima de la batalla, cae en picado sobre el enemigo y golpea la base con fuerza.',
  },
};
export const HERO_IDS = Object.keys(HEROES);
export const HERO_MAX = 10;
export const SUMMON_COST = 200;
export const heroLevel = (id) => save.heroes[id] || 0;

export function summon() {
  if (save.coins < SUMMON_COST) return null;
  save.coins -= SUMMON_COST;
  const total = HERO_IDS.reduce((a, id) => a + HEROES[id].weight, 0);
  let r = Math.random() * total;
  let id = HERO_IDS[0];
  for (const h of HERO_IDS) { if ((r -= HEROES[h].weight) <= 0) { id = h; break; } }
  const before = heroLevel(id);
  const isNew = before === 0;
  if (before >= HERO_MAX) save.coins += Math.round(SUMMON_COST * 0.6);
  else save.heroes[id] = before + 1;
  persist();
  return { id, isNew, level: heroLevel(id), maxed: before >= HERO_MAX };
}

// ---------- Reino ----------
export const BUILDINGS = [
  {
    id: 'forge', name: 'Herrería', icon: '⚒️', max: 10, base: 40,
    effect: (l) => `Cadencia ${(6 + l).toFixed(0)} disparos/s${l >= 4 ? ' · cañón triple' : ''}`,
  },
  {
    id: 'barracks', name: 'Cuartel', icon: '🛡️', max: 10, base: 60,
    effect: (l) => `${Math.round(l * 5)}% de disparos salen como caballeros`,
  },
  {
    id: 'mages', name: 'Torre de magos', icon: '🔮', max: 8, base: 50,
    effect: (l) => `El héroe se carga con ${Math.max(18, 40 - l * 3)} disparos`,
  },
  {
    id: 'treasury', name: 'Tesoro', icon: '💰', max: 10, base: 80,
    effect: (l) => `+${l * 15}% de monedas`,
  },
  {
    id: 'walls', name: 'Murallas', icon: '🧱', max: 10, base: 70,
    effect: (l) => (l ? `La muralla frena a ${l * 6} enemigos` : 'Sin muralla'),
  },
];
export const buildCost = (b, lvl) => Math.round(b.base * Math.pow(1.6, lvl));

export const stats = {
  fireRate: () => 6 + save.buildings.forge,
  triple: () => save.buildings.forge >= 4,
  knightChance: () => save.buildings.barracks * 0.05,
  chargeMax: () => Math.max(18, 40 - save.buildings.mages * 3),
  coinMult: () => 1 + save.buildings.treasury * 0.15,
  wallHp: () => save.buildings.walls * 6,
};
