// Recorta los modelos KayKit (CC0, Kay Lousberg) a las animaciones y accesorios que usa el juego.
// Entrada: assets-src/kaykit/*.glb (descargados de github.com/KayKit-Game-Assets)
// Salida:  game/assets/*.glb
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import { mkdirSync, statSync } from 'node:fs';

const MODELS = {
  Knight: {
    parts: ['Knight_Helmet', 'Knight_Cape', '1H_Sword', '2H_Sword', 'Round_Shield'],
    anims: ['Running_A', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Chop', 'Idle', 'Cheer'],
  },
  Barbarian: {
    parts: ['Barbarian_Hat', 'Barbarian_Cape', '1H_Axe', '2H_Axe', 'Barbarian_Round_Shield'],
    anims: ['Running_A', '1H_Melee_Attack_Chop', 'Idle', 'Cheer'],
  },
  Mage: {
    parts: ['Mage_Hat', 'Mage_Cape', '2H_Staff'],
    anims: ['Running_A', 'Spellcast_Shoot', 'Idle', 'Cheer'],
  },
  Rogue: {
    parts: ['Rogue_Cape', '2H_Crossbow', 'Knife'],
    anims: ['Running_A', '2H_Ranged_Shoot', 'Idle', 'Cheer'],
  },
  Rogue_Hooded: {
    parts: ['Rogue_Cape', 'Knife', 'Knife_Offhand'],
    anims: ['Running_A', 'Dualwield_Melee_Attack_Slice', 'Idle', 'Cheer'],
  },
  Skeleton_Minion: { parts: [], anims: ['Walking_D_Skeletons', '1H_Melee_Attack_Chop', 'Idle'] },
  Skeleton_Rogue: { parts: ['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape'], anims: ['Running_C', '1H_Melee_Attack_Chop', 'Idle'] },
  Skeleton_Warrior: { parts: ['Skeleton_Warrior_Helmet'], anims: ['Walking_C', '2H_Melee_Attack_Chop', 'Idle'] },
};

const io = new NodeIO();
mkdirSync('game/assets', { recursive: true });
let total = 0;
for (const [name, cfg] of Object.entries(MODELS)) {
  const src = `assets-src/kaykit/${name}.glb`;
  const doc = await io.read(src);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) {
    if (cfg.anims.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) s.dispose();
    a.dispose();
  }
  for (const n of root.listNodes()) {
    if (n.getMesh() && !n.getSkin() && !cfg.parts.includes(n.getName())) n.dispose();
  }
  await doc.transform(resample(), dedup(), prune({ keepLeaves: true, keepAttributes: true }));
  for (const a of root.listAccessors()) if (!a.listParents().some((p) => p.propertyType !== 'Root')) a.dispose();
  const out = `game/assets/${name}.glb`;
  await io.write(out, doc);
  const kb = statSync(out).size / 1024;
  total += kb;
  console.log(`${name.padEnd(18)} ${(statSync(src).size / 1024).toFixed(0).padStart(6)} KB -> ${kb.toFixed(0).padStart(5)} KB  (${root.listAnimations().map((a) => a.getName()).join(', ')})`);
}
console.log(`Total: ${(total / 1024).toFixed(2)} MB`);
