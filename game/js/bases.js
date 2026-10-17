// Bases enemigas: una por mundo. Cada una expone sus torres de arqueros.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LEN, scene, own, freeScope, M, shadowed } from './engine.js';

export let baseView = null; // { group, flash: [materiales], colors, towers: [[x,y,z]], anim(t) }

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

export function buildBase(style) {
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
  let colors, towers;

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
    towers = [[4.6, 7.4, 1.2], [-4.6, 7.4, 1.2]];
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
    towers = [[6.4, 6.6, 0.5], [-6.4, 6.6, 0.5], [0, 8.6, 3]];
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
    towers = [[4.8, 7.6, 1.3], [-4.8, 7.6, 1.3]];
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
    towers = [[5.0, 9.0, 1.3], [-5.0, 9.0, 1.3]];
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
    towers = [[4.9, 7.3, 1.2], [-4.9, 7.3, 1.2], [0, 11.2, 3.6]];
  }

  group.position.z = LEN;
  scene.add(group);
  baseView = { group, flash, colors, towers, anim: (tt) => { for (const a of anims) a(tt); } };
}

