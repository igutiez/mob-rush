// Lista animaciones y mallas (con la ruta de huesos) de modelos glTF.
import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  console.log('==', f, '| anims:', root.listAnimations().length);
  const walk = (n, path) => {
    const m = n.getMesh();
    if (m) console.log(`  ${n.getName()}${n.getSkin() ? ' (skinned)' : ''}  <-  ${path.slice(-2).join('/')}`);
    for (const c of n.listChildren()) walk(c, [...path, n.getName()]);
  };
  for (const s of root.listScenes()) for (const n of s.listChildren()) walk(n, []);
}
