// Copia a game/vendor solo los módulos de Three.js que usa el juego (funciona offline).
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const src = 'node_modules/three';
const out = 'game/vendor/three';
const entry = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'environments/RoomEnvironment.js',
  'utils/BufferGeometryUtils.js',
  'geometries/RoundedBoxGeometry.js',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, 'build/three.module.min.js'), join(out, 'three.module.js'));

const seen = new Set();
const queue = [...entry];
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const from = join(src, 'examples/jsm', rel);
  const to = join(out, 'addons', rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  for (const m of readFileSync(from, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
    queue.push(resolve('/', dirname(rel), m[1]).slice(1));
  }
}
console.log([...seen].sort().join('\n'));
