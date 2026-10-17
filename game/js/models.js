// Modelos 3D procedurales: tropas y héroes animados por shader, cañón, puertas,
// obstáculos, barriles, proyectiles y muralla.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HALF, CANNON_Z, X, scene, own, M, shadowed, paint, canvasTex } from './engine.js';

// ============================================================
// Animación esquelética en el shader de vértices
// Cada vértice lleva un atributo `limb`: 0 cuerpo, 1-2 piernas, 3 brazo del escudo,
// 4 brazo del arma, 5-6 alas. Cada instancia lleva aAnim = (fase, ataque).
// ============================================================
const animTime = { value: 0 };
export const setAnimTime = (v) => { animTime.value = v; };

const ANIM_GLSL = /* glsl */ `
attribute float limb;
#ifdef USE_INSTANCING
attribute vec2 aAnim;
#else
uniform vec2 uAnim;
#endif
uniform float uTime;
uniform float uWalk;
uniform vec2 uHip;
uniform vec2 uShoulder;
uniform vec2 uWing;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
void limbXform(out vec3 piv, out float ang, out float axis) {
  #ifdef USE_INSTANCING
  vec2 an = aAnim;
  #else
  vec2 an = uAnim;
  #endif
  float ph = uTime * uWalk + an.x;
  float sw = sin(ph);
  float atk = clamp(an.y, 0.0, 1.0);
  piv = vec3(0.0); ang = 0.0; axis = 0.0;
  if (limb > 0.5 && limb < 1.5) { piv = vec3(uHip.x, uHip.y, 0.0); ang = sw * 0.8; }
  else if (limb > 1.5 && limb < 2.5) { piv = vec3(-uHip.x, uHip.y, 0.0); ang = -sw * 0.8; }
  else if (limb > 2.5 && limb < 3.5) { piv = vec3(uShoulder.x, uShoulder.y, 0.0); ang = mix(-sw * 0.5, -0.7, atk); }
  else if (limb > 3.5 && limb < 4.5) { piv = vec3(-uShoulder.x, uShoulder.y, 0.0); ang = mix(sw * 0.55, -2.1 + abs(sin(uTime * 9.0 + an.x)) * 2.3, atk); }
  else if (limb > 4.5 && limb < 5.5) { piv = vec3(uWing.x, uWing.y, 0.0); ang = sin(uTime * 7.0 + an.x) * 0.85; axis = 1.0; }
  else if (limb > 5.5) { piv = vec3(-uWing.x, uWing.y, 0.0); ang = -sin(uTime * 7.0 + an.x) * 0.85; axis = 1.0; }
}
`;

function animMaterial(rig, opts = {}) {
  const uniforms = {
    uTime: animTime,
    uWalk: { value: rig.walk },
    uHip: { value: new THREE.Vector2(...(rig.hip || [0.09, 0.34])) },
    uShoulder: { value: new THREE.Vector2(...(rig.shoulder || [0.24, 0.62])) },
    uWing: { value: new THREE.Vector2(...(rig.wing || [0.2, 0.6])) },
    uAnim: { value: new THREE.Vector2() },
  };
  const patch = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + ANIM_GLSL)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { vec3 piv; float ang; float axis; limbXform(piv, ang, axis);
          objectNormal = axis > 0.5 ? rotZ(objectNormal, ang) : rotX(objectNormal, ang); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 piv; float ang; float axis; limbXform(piv, ang, axis);
          vec3 p = transformed - piv;
          p = axis > 0.5 ? rotZ(p, ang) : rotX(p, ang);
          transformed = p + piv; }`);
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, ...opts });
  mat.onBeforeCompile = patch;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = patch;
  return { mat, depth, uniforms };
}

// Pieza de modelo: geometría + color + extremidad
function P(geo, color, limb = 0) {
  paint(geo, color);
  geo.setAttribute('limb', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count).fill(limb), 1));
  return geo;
}
const cap = (r, l, x, y, z = 0) => new THREE.CapsuleGeometry(r, l, 4, 10).translate(x, y, z);
const sph = (r, x, y, z = 0, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h).translate(x, y, z);
const box = (w, h, d, x, y, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x, y, z = 0, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

const SKIN = '#f2c39b';
const STEEL = '#c9d1dc';
const GOLD = '#ffc531';
const LEATHER = '#5a3a22';

function legs(pants, boots) {
  return [
    P(cap(0.075, 0.16, 0.09, 0.19), pants, 1), P(box(0.13, 0.08, 0.19, 0.09, 0.04, 0.02), boots, 1),
    P(cap(0.075, 0.16, -0.09, 0.19), pants, 2), P(box(0.13, 0.08, 0.19, -0.09, 0.04, 0.02), boots, 2),
  ];
}
function eyes(y = 0.82, z = 0.13) {
  return [
    P(sph(0.028, 0.055, y, z, 8, 6), '#ffffff'), P(sph(0.028, -0.055, y, z, 8, 6), '#ffffff'),
    P(sph(0.016, 0.055, y, z + 0.018, 6, 5), '#141414'), P(sph(0.016, -0.055, y, z + 0.018, 6, 5), '#141414'),
    P(box(0.07, 0.018, 0.02, 0.055, y + 0.05, z).rotateZ(-0.35), '#3a1a0a'), P(box(0.07, 0.018, 0.02, -0.055, y + 0.05, z).rotateZ(0.35), '#3a1a0a'),
  ];
}

// ---------- Tropas ----------
function soldierGeo() {
  const tunic = '#2f6ff0', dark = '#1d47b8';
  return mergeGeometries([
    ...legs('#2a3550', LEATHER),
    P(cap(0.17, 0.16, 0, 0.5), tunic),
    P(cyl(0.178, 0.178, 0.05, 0, 0.41, 0, 14), LEATHER),
    P(box(0.27, 0.2, 0.06, 0, 0.54, 0.13), STEEL),
    P(box(0.32, 0.44, 0.03, 0, 0.47, -0.18).rotateX(0.1), dark),
    P(sph(0.14, 0, 0.8), SKIN),
    P(new THREE.SphereGeometry(0.155, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 0.82, 0), STEEL),
    P(box(0.03, 0.08, 0.24, 0, 0.98, 0), tunic),
    P(cap(0.055, 0.2, 0.24, 0.5), tunic, 3),
    P(cyl(0.16, 0.16, 0.04, 0, 0, 0, 16).rotateX(Math.PI / 2).translate(0.3, 0.45, 0.1), tunic, 3),
    P(new THREE.TorusGeometry(0.16, 0.022, 6, 18).translate(0.3, 0.45, 0.125), GOLD, 3),
    P(sph(0.04, 0.3, 0.45, 0.14, 8, 6), GOLD, 3),
    P(cap(0.055, 0.2, -0.24, 0.5), tunic, 4),
    P(box(0.035, 0.42, 0.02, -0.25, 0.55, 0.13), STEEL, 4),
    P(box(0.13, 0.025, 0.04, -0.25, 0.33, 0.13), GOLD, 4),
    P(box(0.03, 0.09, 0.03, -0.25, 0.29, 0.13), LEATHER, 4),
  ]);
}

function knightGeo() {
  const armor = '#aeb8c6', blue = '#2457d6';
  return mergeGeometries([
    ...legs(armor, '#6c7684'),
    P(cap(0.19, 0.18, 0, 0.52), armor),
    P(box(0.3, 0.24, 0.07, 0, 0.56, 0.14), '#d7dee8'),
    P(cyl(0.2, 0.2, 0.06, 0, 0.42, 0, 14), blue),
    P(box(0.38, 0.52, 0.03, 0, 0.47, -0.2).rotateX(0.12), blue),
    P(cyl(0.15, 0.16, 0.22, 0, 0.84, 0, 14), armor),
    P(box(0.2, 0.03, 0.02, 0, 0.85, 0.15), '#222'),
    P(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.95, 0), armor),
    P(cap(0.04, 0.22, 0, 1.12, -0.06).rotateX(-0.5), blue),
    P(sph(0.09, 0.27, 0.66), '#d7dee8', 3), P(sph(0.09, -0.27, 0.66), '#d7dee8', 4),
    P(cap(0.06, 0.2, 0.26, 0.5), armor, 3),
    P(box(0.28, 0.4, 0.05, 0.32, 0.45, 0.12), blue, 3),
    P(box(0.05, 0.3, 0.02, 0.32, 0.45, 0.15), GOLD, 3),
    P(box(0.2, 0.05, 0.02, 0.32, 0.5, 0.15), GOLD, 3),
    P(cap(0.06, 0.2, -0.26, 0.5), armor, 4),
    P(box(0.045, 0.6, 0.025, -0.27, 0.62, 0.14), '#e8eef5', 4),
    P(box(0.16, 0.03, 0.05, -0.27, 0.32, 0.14), GOLD, 4),
  ]);
}

function legionGeo() {
  const red = '#d33030', dark = '#8e1a1a';
  return mergeGeometries([
    ...legs('#5a2020', LEATHER),
    P(cap(0.17, 0.16, 0, 0.5), red),
    P(box(0.28, 0.22, 0.06, 0, 0.54, 0.13), STEEL),
    P(cyl(0.178, 0.178, 0.05, 0, 0.41, 0, 14), LEATHER),
    P(box(0.32, 0.42, 0.03, 0, 0.47, -0.18).rotateX(0.1), dark),
    P(sph(0.14, 0, 0.8), SKIN),
    ...eyes(0.81, 0.125),
    P(new THREE.SphereGeometry(0.16, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 0.83, 0), STEEL),
    P(box(0.05, 0.12, 0.3, 0, 1.0, -0.02), red),
    P(box(0.03, 0.12, 0.03, 0.15, 0.76, 0.03), STEEL), P(box(0.03, 0.12, 0.03, -0.15, 0.76, 0.03), STEEL),
    P(cap(0.055, 0.2, 0.24, 0.5), red, 3),
    P(box(0.24, 0.36, 0.05, 0.31, 0.45, 0.11), red, 3),
    P(sph(0.05, 0.31, 0.47, 0.14, 8, 6), GOLD, 3),
    P(cap(0.055, 0.2, -0.24, 0.5), red, 4),
    P(cyl(0.018, 0.018, 1.05, -0.25, 0.6, 0.13, 6), '#6b4a2a', 4),
    P(new THREE.ConeGeometry(0.045, 0.16, 6).translate(-0.25, 1.2, 0.13), STEEL, 4),
  ]);
}

function scoutGeo() {
  const cloak = '#ff7a1f', dark = '#b84a0a';
  return mergeGeometries([
    ...legs('#3a2a20', LEATHER),
    P(cap(0.15, 0.15, 0, 0.5), cloak),
    P(box(0.3, 0.4, 0.03, 0, 0.47, -0.16).rotateX(0.2), dark),
    P(sph(0.13, 0, 0.79), SKIN),
    ...eyes(0.8, 0.115),
    P(new THREE.ConeGeometry(0.17, 0.32, 10).translate(0, 0.92, -0.03).rotateX(-0.15), cloak),
    P(box(0.24, 0.06, 0.05, 0, 0.74, 0.11), dark),
    P(cap(0.05, 0.2, 0.22, 0.5), cloak, 3), P(box(0.025, 0.2, 0.02, 0.23, 0.33, 0.12), STEEL, 3),
    P(cap(0.05, 0.2, -0.22, 0.5), cloak, 4), P(box(0.025, 0.2, 0.02, -0.23, 0.33, 0.12), STEEL, 4),
  ]);
}

function ogreGeo(boss) {
  const skin = boss ? '#6a5a8a' : '#7c8f5a', dark = boss ? '#4a3a6a' : '#55663a';
  const parts = [
    P(cap(0.1, 0.12, 0.11, 0.17), dark, 1), P(cap(0.1, 0.12, -0.11, 0.17), dark, 2),
    P(sph(0.27, 0, 0.5, 0.03, 16, 12).scale(1, 0.95, 0.9), skin),
    P(cyl(0.25, 0.27, 0.16, 0, 0.33, 0, 14), LEATHER),
    P(sph(0.15, 0, 0.84, 0.04), skin),
    P(box(0.2, 0.05, 0.06, 0, 0.74, 0.16), '#3a2a1a'),
    P(new THREE.ConeGeometry(0.025, 0.08, 6).translate(0.06, 0.8, 0.17), '#fff8e0'),
    P(new THREE.ConeGeometry(0.025, 0.08, 6).translate(-0.06, 0.8, 0.17), '#fff8e0'),
    P(sph(0.026, 0.05, 0.88, 0.16, 8, 6), '#ffec3a'), P(sph(0.026, -0.05, 0.88, 0.16, 8, 6), '#ffec3a'),
    P(cap(0.085, 0.24, 0.3, 0.5), skin, 3), P(sph(0.09, 0.3, 0.32), skin, 3),
    P(cap(0.085, 0.24, -0.3, 0.5), skin, 4), P(sph(0.09, -0.3, 0.32), skin, 4),
    P(cyl(0.06, 0.035, 0.6, -0.3, 0.5, 0.18, 8).rotateX(0.25), '#6b4a2a', 4),
    P(sph(0.1, -0.3, 0.8, 0.26, 10, 8), '#5a3a22', 4),
  ];
  if (boss) {
    parts.push(P(cyl(0.13, 0.12, 0.07, 0, 1.0, 0.03, 12), GOLD));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(P(new THREE.ConeGeometry(0.035, 0.1, 6).translate(Math.cos(a) * 0.11, 1.08, 0.03 + Math.sin(a) * 0.11), GOLD));
    }
  }
  return mergeGeometries(parts);
}

// ---------- Héroes ----------
function kingGeo() {
  const armor = '#e8b02a', red = '#c0202a';
  return mergeGeometries([
    ...legs('#7a6a40', '#4a3a20'),
    P(cap(0.2, 0.18, 0, 0.53), armor),
    P(box(0.32, 0.26, 0.07, 0, 0.56, 0.15), '#ffd24a'),
    P(cyl(0.21, 0.21, 0.06, 0, 0.42, 0, 14), red),
    P(box(0.46, 0.62, 0.03, 0, 0.44, -0.21).rotateX(0.14), red),
    P(sph(0.1, 0.28, 0.68), '#ffd24a', 3), P(sph(0.1, -0.28, 0.68), '#ffd24a', 4),
    P(sph(0.15, 0, 0.84), SKIN),
    P(sph(0.11, 0, 0.77, 0.06, 10, 8).scale(1, 0.8, 1), '#7a4a2a'),
    P(cyl(0.155, 0.15, 0.08, 0, 0.98, 0, 14), GOLD),
    ...[0, 1, 2, 3, 4].map((i) => P(new THREE.ConeGeometry(0.035, 0.11, 6).translate(Math.cos(i * 1.256) * 0.13, 1.07, Math.sin(i * 1.256) * 0.13), GOLD)),
    P(cap(0.065, 0.2, 0.27, 0.5), armor, 3),
    P(cap(0.065, 0.2, -0.27, 0.5), armor, 4),
    P(box(0.06, 0.85, 0.03, -0.28, 0.72, 0.15), '#f4f8ff', 4),
    P(box(0.22, 0.04, 0.06, -0.28, 0.3, 0.15), GOLD, 4),
    P(sph(0.04, -0.28, 0.22, 0.15, 8, 6), GOLD, 4),
  ]);
}

function archerGeo() {
  const green = '#2f9a4a', dark = '#1f6a32';
  return mergeGeometries([
    ...legs('#3a2a1a', LEATHER),
    P(cap(0.15, 0.16, 0, 0.5), green),
    P(box(0.34, 0.5, 0.03, 0, 0.45, -0.17).rotateX(0.12), dark),
    P(cyl(0.06, 0.06, 0.4, 0.08, 0.6, -0.17, 8).rotateZ(0.3), LEATHER),
    P(sph(0.13, 0, 0.8), SKIN),
    P(new THREE.ConeGeometry(0.17, 0.34, 12).translate(0, 0.92, -0.03).rotateX(-0.12), green),
    P(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(-1.2).translate(0.15, 0.84, 0), SKIN),
    P(new THREE.ConeGeometry(0.03, 0.12, 5).rotateZ(1.2).translate(-0.15, 0.84, 0), SKIN),
    P(cap(0.05, 0.2, 0.22, 0.5), green, 3),
    P(new THREE.TorusGeometry(0.32, 0.018, 6, 20, Math.PI).rotateZ(-Math.PI / 2).rotateY(Math.PI / 2).translate(0.24, 0.5, 0.12), '#8a5a2a', 3),
    P(cyl(0.004, 0.004, 0.62, 0.24, 0.5, 0.12, 4), '#ffffff', 3),
    P(cap(0.05, 0.2, -0.22, 0.5), green, 4),
  ]);
}

function mageGeo() {
  const robe = '#6a3ad0', dark = '#3e1f8a';
  return mergeGeometries([
    P(new THREE.ConeGeometry(0.28, 0.62, 16).translate(0, 0.31, 0), robe),
    P(cap(0.15, 0.14, 0, 0.58), robe),
    P(box(0.34, 0.5, 0.03, 0, 0.42, -0.19).rotateX(0.08), dark),
    P(sph(0.13, 0, 0.83), SKIN),
    P(new THREE.ConeGeometry(0.12, 0.3, 10).rotateX(Math.PI).translate(0, 0.66, 0.1), '#f4f4f4'),
    P(cyl(0.22, 0.22, 0.03, 0, 0.92, 0, 18), dark),
    P(new THREE.ConeGeometry(0.15, 0.48, 14).translate(0, 1.16, -0.02).rotateX(-0.12), robe),
    P(sph(0.03, 0, 0.95, 0.14, 8, 6), GOLD),
    P(cap(0.055, 0.2, 0.22, 0.55), robe, 3),
    P(cap(0.055, 0.2, -0.22, 0.55), robe),
    P(cyl(0.022, 0.026, 1.3, -0.28, 0.65, 0.1, 8), '#6b4a2a'),
    P(new THREE.TorusGeometry(0.07, 0.02, 6, 12).translate(-0.28, 1.32, 0.1), GOLD),
  ]);
}

function griffinGeo() {
  const fur = '#d9a54a', feather = '#f4efe2', wing = '#b9782a';
  return mergeGeometries([
    P(cap(0.2, 0.42, 0, 0.55, 0).rotateX(Math.PI / 2), fur),
    P(sph(0.21, 0, 0.62, 0.3), feather),
    P(sph(0.15, 0, 0.82, 0.45), feather),
    P(new THREE.ConeGeometry(0.06, 0.16, 8).rotateX(Math.PI / 2).translate(0, 0.78, 0.62), '#ffc531'),
    P(sph(0.026, 0.07, 0.86, 0.56, 8, 6), '#141414'), P(sph(0.026, -0.07, 0.86, 0.56, 8, 6), '#141414'),
    P(new THREE.ConeGeometry(0.03, 0.14, 6).translate(0.07, 0.98, 0.42), feather),
    P(new THREE.ConeGeometry(0.03, 0.14, 6).translate(-0.07, 0.98, 0.42), feather),
    P(cap(0.05, 0.3, 0, 0.6, -0.5).rotateX(-0.7), fur),
    P(sph(0.07, 0, 0.82, -0.65, 8, 6), '#7a4a1a'),
    P(cap(0.055, 0.18, 0.12, 0.25, 0.22), '#ffc531', 1), P(cap(0.055, 0.18, -0.12, 0.25, 0.22), '#ffc531', 2),
    P(cap(0.06, 0.18, 0.12, 0.25, -0.22), fur, 2), P(cap(0.06, 0.18, -0.12, 0.25, -0.22), fur, 1),
    P(box(0.75, 0.04, 0.36, 0.55, 0.68, 0.0).rotateZ(0.15), wing, 5),
    P(box(0.45, 0.035, 0.26, 0.95, 0.74, -0.04).rotateZ(0.2), feather, 5),
    P(box(0.75, 0.04, 0.36, -0.55, 0.68, 0.0).rotateZ(-0.15), wing, 6),
    P(box(0.45, 0.035, 0.26, -0.95, 0.74, -0.04).rotateZ(-0.2), feather, 6),
  ]);
}

// ---------- Catálogo ----------
export const TROOPS = {
  soldier: { geo: soldierGeo(), rig: { walk: 13 }, scale: 0.95, max: 700 },
  knight: { geo: knightGeo(), rig: { walk: 11 }, scale: 1.12, max: 400 },
  legion: { geo: legionGeo(), rig: { walk: 12 }, scale: 0.95, max: 400 },
  scout: { geo: scoutGeo(), rig: { walk: 19 }, scale: 0.85, max: 300 },
  ogre: { geo: ogreGeo(false), rig: { walk: 6, hip: [0.11, 0.3], shoulder: [0.3, 0.68] }, scale: 2.0, max: 24 },
  boss: { geo: ogreGeo(true), rig: { walk: 5, hip: [0.11, 0.3], shoulder: [0.3, 0.68] }, scale: 3.2, max: 2 },
};
export const HERO_MODELS = {
  king: { geo: kingGeo(), rig: { walk: 8, shoulder: [0.27, 0.64] }, scale: 2.0, aura: new THREE.Color(1.6, 1.3, 0.4) },
  archer: { geo: archerGeo(), rig: { walk: 9 }, scale: 1.8, aura: new THREE.Color(0.4, 1.6, 0.7) },
  mage: { geo: mageGeo(), rig: { walk: 7, shoulder: [0.22, 0.66] }, scale: 1.9, aura: new THREE.Color(1.2, 0.5, 2.2) },
  griffin: { geo: griffinGeo(), rig: { walk: 10, hip: [0.12, 0.34], wing: [0.18, 0.66] }, scale: 2.2, aura: new THREE.Color(2.0, 1.5, 0.4) },
};

// Multitudes instanciadas (una por tipo de tropa)
export const crowds = {};
for (const [key, def] of Object.entries(TROOPS)) {
  const geo = def.geo.clone();
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(def.max * 2), 2);
  anim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAnim', anim);
  const { mat, depth } = animMaterial(def.rig);
  const mesh = shadowed(new THREE.InstancedMesh(geo, mat, def.max), true, false);
  mesh.customDepthMaterial = depth;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  crowds[key] = { mesh, anim, def, n: 0 };
}

// Héroe individual (malla propia con su uniforme de animación)
const auraGeo = new THREE.RingGeometry(0.55, 0.8, 40).rotateX(-Math.PI / 2);
const orbGeo = new THREE.SphereGeometry(0.11, 14, 10);
export function createHero(type) {
  const def = HERO_MODELS[type];
  const { mat, depth, uniforms } = animMaterial(def.rig, type === 'king' ? { metalness: 0.5, roughness: 0.3 } : {});
  const body = shadowed(new THREE.Mesh(def.geo, mat), true, false);
  body.customDepthMaterial = depth;
  const group = new THREE.Group();
  group.add(body);
  const auraMat = new THREE.MeshBasicMaterial({ color: def.aura, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
  const aura = new THREE.Mesh(auraGeo, auraMat);
  aura.position.y = 0.04;
  group.add(aura);
  let orb = null;
  if (type === 'mage') {
    orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 2.8), toneMapped: false }));
    orb.position.set(-0.28, 1.32, 0.1);
    body.add(orb);
  }
  scene.add(group);
  return {
    group, body, aura, orb, uniforms,
    dispose() {
      group.removeFromParent();
      mat.dispose(); depth.dispose(); auraMat.dispose();
      if (orb) orb.material.dispose();
    },
  };
}

// Modelo estático para retratos (menú de héroes)
export function heroPortraitMesh(type) {
  const def = HERO_MODELS[type];
  const { mat, depth } = animMaterial(def.rig, type === 'king' ? { metalness: 0.5, roughness: 0.3 } : {});
  const mesh = new THREE.Mesh(def.geo, mat);
  if (type === 'mage') {
    const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 2.8), toneMapped: false }));
    orb.position.set(-0.28, 1.32, 0.1);
    mesh.add(orb);
  }
  return { mesh, dispose: () => { mat.dispose(); depth.dispose(); } };
}

// ============================================================
// Cañón (con cañones laterales para el disparo triple)
// ============================================================
export const cannonGroup = new THREE.Group();
export const barrelPivot = new THREE.Group();
export const sideBarrels = new THREE.Group();
export const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8), toneMapped: false, transparent: true }));
export const muzzleLight = new THREE.PointLight('#ffd27a', 0, 8, 2);
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
  for (const s of [-1, 1]) {
    const b = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 1.2, 16), M.metal));
    b.rotation.x = Math.PI / 2;
    b.position.set(s * 0.55, -0.1, 0.5);
    const l = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 8, 18), M.gold));
    l.position.set(s * 0.55, -0.1, 1.1);
    sideBarrels.add(b, l);
  }
  sideBarrels.visible = false;
  barrelPivot.add(sideBarrels);
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
// Muralla de energía (edificio Murallas)
// ============================================================
export const WALL_Z = CANNON_Z + 2.2;
export const wall = new THREE.Group();
export const wallMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.1, 2.4), transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
{
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 1.1), wallMat);
  plane.position.y = 0.55;
  const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.06, 0.06), M.neon);
  top.position.y = 1.1;
  for (const s of [-1, 1]) {
    const post = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.4, 1.4, 0.4, 2, 0.08), M.pillar));
    post.position.set(s * (HALF - 0.1), 0.7, 0);
    wall.add(post);
  }
  wall.add(plane, top);
  wall.position.z = WALL_Z;
  wall.visible = false;
  scene.add(wall);
}

// ============================================================
// Puertas
// ============================================================
const gateGeo = {
  pillar: new RoundedBoxGeometry(0.32, 2.3, 0.32, 2, 0.08),
  cap: new THREE.SphereGeometry(0.24, 14, 10),
};
const GATE_COLORS = { mul: '#3d8bff', add: '#3ddc84', knight: '#ffb800', div: '#ff3b3b' };
const GATE_GLOW = { mul: '#5fb0ff', add: '#5dffa0', knight: '#ffd34d', div: '#ff6a5a' };

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
const labelCache = new Map();

export function gateMeshes(g) {
  const color = new THREE.Color(GATE_COLORS[g.op.kind]);
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
    const p = shadowed(new THREE.Mesh(gateGeo.pillar, g.op.kind === 'div' ? M.metalDark : M.pillar));
    p.position.set(s * g.w / 2, 1.15, 0);
    const c = shadowed(new THREE.Mesh(gateGeo.cap, M.gold));
    c.position.set(s * g.w / 2, 2.42, 0);
    grp.add(p, c);
  }
  if (g.op.kind === 'div') {
    for (let i = 0; i < 5; i++) {
      const spike = shadowed(new THREE.Mesh(own('stage', new THREE.ConeGeometry(0.09, 0.35, 6)), M.steel));
      spike.position.set(-g.w / 2 + (i + 0.5) * (g.w / 5), 2.0, 0);
      spike.rotation.x = Math.PI;
      grp.add(spike);
    }
  }
  const key = g.op.label + g.op.kind;
  if (!labelCache.has(key)) labelCache.set(key, labelTexture(g.op.label, GATE_GLOW[g.op.kind]));
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

// ============================================================
// Obstáculos y barriles explosivos
// ============================================================
const OBST_GEO = {
  post: new THREE.CylinderGeometry(0.28, 0.36, 1.1, 16).translate(0, 0.55, 0),
  hub: new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16),
  saw: new THREE.CylinderGeometry(0.95, 0.95, 0.1, 32).rotateX(Math.PI / 2),
  tooth: new THREE.ConeGeometry(0.12, 0.28, 4),
  barrel: new THREE.CylinderGeometry(0.42, 0.42, 0.95, 18).translate(0, 0.48, 0),
  band: new THREE.TorusGeometry(0.43, 0.035, 6, 20).rotateX(Math.PI / 2),
  fuse: new THREE.SphereGeometry(0.08, 8, 6),
};
const barrelMat = new THREE.MeshStandardMaterial({ color: '#c8281e', roughness: 0.45, metalness: 0.2, emissive: '#ff3010', emissiveIntensity: 0 });
const fuseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.4), toneMapped: false });

export function obstacleMeshes(o) {
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
    const w = shadowed(new THREE.Mesh(own('stage', new RoundedBoxGeometry(o.w, 1.5, 0.7, 2, 0.12)), M.hazard));
    w.position.y = 0.75;
    const top = new THREE.Mesh(own('stage', new THREE.BoxGeometry(o.w, 0.08, 0.08)), M.neonRed);
    top.position.set(0, 1.52, -0.3);
    grp.add(w, top);
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
  } else if (o.type === 'barrel') {
    grp.add(shadowed(new THREE.Mesh(OBST_GEO.barrel, barrelMat)));
    for (const y of [0.18, 0.78]) {
      const b = new THREE.Mesh(OBST_GEO.band, M.steel);
      b.position.y = y;
      grp.add(b);
    }
    const lid = shadowed(new THREE.Mesh(own('stage', new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16)), M.hazard));
    lid.position.y = 0.97;
    const fuse = new THREE.Mesh(OBST_GEO.fuse, fuseMat);
    fuse.position.y = 1.08;
    grp.add(lid, fuse);
    o.fuse = fuse;
  }
  grp.position.set(o.type === 'saw' ? 0 : X(o.x), 0, o.z);
  scene.add(grp);
  o.grp = grp;
}
export const barrelGlow = (k) => { barrelMat.emissiveIntensity = k; };

// ============================================================
// Proyectiles: flechas y bolas de fuego (instanciados)
// ============================================================
export const MAX_ARROWS = 160;
const arrowGeo = mergeGeometries([
  paint(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 5).rotateX(Math.PI / 2), '#8a5a2a'),
  paint(new THREE.ConeGeometry(0.045, 0.14, 6).rotateX(Math.PI / 2).translate(0, 0, 0.42), '#dfe6ee'),
  paint(new THREE.BoxGeometry(0.1, 0.012, 0.14).translate(0, 0, -0.32), '#ffffff'),
  paint(new THREE.BoxGeometry(0.012, 0.1, 0.14).translate(0, 0, -0.32), '#ffffff'),
]);
export const arrowMesh = new THREE.InstancedMesh(arrowGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAX_ARROWS);
arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
arrowMesh.setColorAt(0, new THREE.Color());
arrowMesh.count = 0;
arrowMesh.frustumCulled = false;
scene.add(arrowMesh);

export const MAX_FIRE = 24;
export const fireMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.3, 0.35), toneMapped: false }), MAX_FIRE);
fireMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
fireMesh.count = 0;
fireMesh.frustumCulled = false;
scene.add(fireMesh);

// Columna de luz al invocar un héroe
const pillarGeo = new THREE.CylinderGeometry(0.9, 0.9, 14, 24, 1, true).translate(0, 7, 0);
export function lightPillar(x, z, color) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(pillarGeo, mat);
  m.position.set(X(x), 0, z);
  scene.add(m);
  return m;
}
