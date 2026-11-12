import * as THREE from 'three';
import { terrainHeight } from './world.js';
import { clamp, damp, rand } from './utils.js';

/* ------------------------------------------------------------------ */
/* shared geometry / materials                                         */
/* ------------------------------------------------------------------ */
const GEO = {
  sphere: new THREE.SphereGeometry(1, 10, 8),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7),
  cone: new THREE.ConeGeometry(1, 1, 7),
  ico: new THREE.IcosahedronGeometry(1, 1),
  ico0: new THREE.IcosahedronGeometry(1, 0),
};

const matCache = new Map();
function mat(hex) {
  if (!matCache.has(hex)) {
    matCache.set(hex, new THREE.MeshStandardMaterial({
      color: hex, roughness: 0.88, metalness: 0.02, flatShading: true,
    }));
  }
  return matCache.get(hex);
}

const eyeMat = new THREE.MeshStandardMaterial({ color: 0x090b0a, roughness: 0.25, metalness: 0.2 });
const clawMat = new THREE.MeshStandardMaterial({ color: 0xe5dcc2, roughness: 0.6, flatShading: true });

function mk(parent, geo, color, pos = [0, 0, 0], scale = [1, 1, 1], rot = [0, 0, 0], material = null) {
  const m = new THREE.Mesh(geo, material || mat(color));
  m.position.set(pos[0], pos[1], pos[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function pivot(parent, pos = [0, 0, 0]) {
  const g = new THREE.Group();
  g.position.set(pos[0], pos[1], pos[2]);
  parent.add(g);
  return g;
}

/* ------------------------------------------------------------------ */
/* species definitions                                                 */
/* ------------------------------------------------------------------ */
export const SPECIES = {
  dodo: {
    name: 'Dodo', hp: 40, speed: 1.35, wander: 0.75, damage: 0, reach: 0,
    aggro: 0, xp: 14, radius: 0.55, height: 1.35, tameable: true, feeds: 3,
    passive: true, harvest: { rawMeat: 2, hide: 1 }, harvestMax: 3, collar: [0, 0.95, 0.22],
    desc: 'Un ave torpe y confiada. Domésticala con bayas.',
  },
  parasaur: {
    name: 'Parasaurio', hp: 190, speed: 3.7, wander: 1.5, damage: 6, reach: 2.4,
    aggro: 0, xp: 35, radius: 1.0, height: 2.5, tameable: true, feeds: 5, rideable: true,
    passive: true, harvest: { rawMeat: 6, hide: 4 }, harvestMax: 4, collar: [0, 1.95, 0.95],
    desc: 'Herbívoro veloz. Con una silla podrás montarlo.',
  },
  trike: {
    name: 'Triceratops', hp: 460, speed: 4.1, wander: 1.3, damage: 22, reach: 3.4,
    aggro: 0, xp: 80, radius: 1.5, height: 3.0, tameable: false,
    neutral: true, harvest: { rawMeat: 10, hide: 8 }, harvestMax: 5,
    desc: 'Pacífico hasta que lo provocas. Sus cuernos no perdonan.',
  },
  raptor: {
    name: 'Raptor', hp: 150, speed: 6.0, wander: 2.0, damage: 12, reach: 2.9,
    aggro: 24, xp: 55, radius: 0.9, height: 2.1, tameable: false,
    aggressive: true, harvest: { rawMeat: 5, hide: 3 }, harvestMax: 3,
    desc: 'Cazador de la selva. No salgas de noche sin una hoguera.',
  },
  bronto: {
    name: 'Brontosaurio', hp: 1200, speed: 2.3, wander: 1.0, damage: 35, reach: 4.6,
    aggro: 0, xp: 150, radius: 2.5, height: 10.5, tameable: false,
    neutral: true, harvest: { rawMeat: 20, hide: 15 }, harvestMax: 6,
    desc: 'Un gigante apacible que domina el horizonte.',
  },
  ptera: {
    name: 'Pteranodón', hp: 60, speed: 8, wander: 4, damage: 0, reach: 2,
    aggro: 0, xp: 20, radius: 1.2, height: 1.5, tameable: false, flying: true,
    harvest: { rawMeat: 2, hide: 1 }, harvestMax: 2, desc: 'Surca el cielo de la isla.',
  },
};

/* ------------------------------------------------------------------ */
/* model builders                                                      */
/* ------------------------------------------------------------------ */
function buildDodo() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x7d5e3f, [0, 0.68, 0], [0.52, 0.5, 0.62]);
  mk(group, GEO.sphere, 0x9c7c52, [0, 0.55, 0.18], [0.4, 0.34, 0.4]);
  // tail feathers
  for (let i = 0; i < 3; i++) {
    mk(group, GEO.cone, 0x6a4c30, [(i - 1) * 0.12, 0.8, -0.62], [0.09, 0.4, 0.06], [-1.35 + i * 0.05, 0, (i - 1) * 0.2]);
  }
  const head = pivot(group, [0, 1.02, 0.32]);
  mk(head, GEO.sphere, 0x88683f, [0, 0, 0], [0.27, 0.28, 0.27]);
  mk(head, GEO.sphere, 0x9c7c52, [0, 0.05, 0.12], [0.18, 0.18, 0.15]);
  mk(head, GEO.cone, 0xdca23f, [0, -0.02, 0.3], [0.1, 0.34, 0.1], [Math.PI / 2, 0, 0], clawMat);
  mk(head, GEO.sphere, 0x101211, [0.16, 0.07, 0.15], [0.045, 0.045, 0.045], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0x101211, [-0.16, 0.07, 0.15], [0.045, 0.045, 0.045], [0, 0, 0], eyeMat);
  // wings
  mk(group, GEO.sphere, 0x6b4f34, [0.48, 0.68, 0.02], [0.09, 0.3, 0.4], [0, 0, -0.2]);
  mk(group, GEO.sphere, 0x6b4f34, [-0.48, 0.68, 0.02], [0.09, 0.3, 0.4], [0, 0, 0.2]);
  const legs = [];
  for (const x of [0.16, -0.16]) {
    const leg = pivot(group, [x, 0.5, 0.02]);
    mk(leg, GEO.cyl, 0xd9a04a, [0, -0.2, 0], [0.05, 0.4, 0.05]);
    mk(leg, GEO.box, 0xc68c38, [0, -0.41, 0.06], [0.15, 0.045, 0.22]);
    legs.push(leg);
  }
  return { group, parts: { legs, head, body, tail: null, wings: [] } };
}

function buildParasaur() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x59794b, [0, 1.32, -0.05], [0.58, 0.62, 1.18]);
  mk(group, GEO.sphere, 0x8e9b6a, [0, 1.12, 0.2], [0.45, 0.42, 0.92]);
  // neck + head
  const neck = pivot(group, [0, 1.62, 0.78]);
  mk(neck, GEO.cyl, 0x5d7d4e, [0, 0.3, 0.12], [0.17, 0.85, 0.17], [-0.42, 0, 0]);
  const head = pivot(group, [0, 2.16, 1.28]);
  mk(head, GEO.sphere, 0x648453, [0, 0, 0], [0.27, 0.29, 0.34]);
  mk(head, GEO.box, 0x7b9762, [0, -0.03, 0.3], [0.22, 0.18, 0.32]);
  mk(head, GEO.box, 0x4e6a43, [0, -0.1, 0.46], [0.16, 0.08, 0.2]);
  mk(head, GEO.cone, 0xcf9a52, [0, 0.03, -0.25], [0.16, 0.55, 0.06], [-2.0, 0, 0]);
  mk(head, GEO.sphere, 0x11130f, [0.18, 0.09, 0.18], [0.045, 0.045, 0.045], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0x11130f, [-0.18, 0.09, 0.18], [0.045, 0.045, 0.045], [0, 0, 0], eyeMat);
  // dorsal ridge
  for (let i = 0; i < 4; i++) {
    mk(group, GEO.cone, 0xb79b5d, [0, 1.86 - i * 0.07, 0.45 - i * 0.35], [0.08, 0.2, 0.08], [0, 0, 0]);
  }
  const legs = [];
  const hips = [[0.34, 0.55], [-0.34, 0.55], [0.38, -0.55], [-0.38, -0.55]];
  for (const [x, z] of hips) {
    const leg = pivot(group, [x, 1.05, z]);
    mk(leg, GEO.cyl, 0x59794b, [0, -0.45, 0], [0.115, 0.82, 0.115]);
    mk(leg, GEO.cyl, 0x4e6a43, [0, -0.82, 0.02], [0.08, 0.25, 0.08]);
    mk(leg, GEO.box, 0x3f5237, [0, -0.96, 0.08], [0.18, 0.07, 0.28]);
    legs.push(leg);
  }
  const tail = pivot(group, [0, 1.35, -1.05]);
  mk(tail, GEO.cyl, 0x59794b, [0, -0.1, -0.45], [0.16, 1.0, 0.16], [-1.35, 0, 0]);
  mk(tail, GEO.cyl, 0x4e6a43, [0, -0.35, -1.1], [0.1, 0.7, 0.1], [-1.4, 0, 0]);
  mk(tail, GEO.cone, 0x4e6a43, [0, -0.45, -1.55], [0.1, 0.35, 0.1], [-1.4, 0, 0]);
  return { group, parts: { legs, head, body, tail, neck, wings: [] } };
}

function buildTrike() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x7d6a4e, [0, 1.55, -0.1], [0.92, 0.78, 1.5]);
  mk(group, GEO.sphere, 0xb0986c, [0, 1.35, 0.2], [0.7, 0.55, 1.15]);
  // deep tail
  const tail = pivot(group, [0, 1.5, -1.4]);
  mk(tail, GEO.cyl, 0x6f5d44, [0, -0.15, -0.6], [0.2, 1.1, 0.2], [-1.35, 0, 0]);
  mk(tail, GEO.cone, 0x6f5d44, [0, -0.32, -1.3], [0.13, 0.5, 0.13], [-1.4, 0, 0]);
  // frill
  const frill = mk(group, GEO.sphere, 0x8b5b3b, [0, 2.15, 0.95], [1.02, 0.78, 0.16], [0.22, 0, 0]);
  mk(group, GEO.sphere, 0xa97447, [0, 2.15, 1.02], [0.72, 0.55, 0.14], [0.22, 0, 0]);
  const head = pivot(group, [0, 1.95, 1.15]);
  mk(head, GEO.sphere, 0x8b6748, [0, 0, 0.1], [0.42, 0.38, 0.48]);
  mk(head, GEO.cone, 0x3f3629, [0, -0.05, 0.55], [0.2, 0.4, 0.15], [Math.PI / 2, 0, 0]);
  // horns
  mk(group, GEO.cone, 0xe0d6b8, [0, 2.55, 1.3], [0.09, 0.55, 0.09], [0.55, 0, 0], clawMat);
  mk(group, GEO.cone, 0xe0d6b8, [0.3, 2.35, 1.28], [0.07, 0.4, 0.07], [0.8, 0, -0.15], clawMat);
  mk(group, GEO.cone, 0xe0d6b8, [-0.3, 2.35, 1.28], [0.07, 0.4, 0.07], [0.8, 0, 0.15], clawMat);
  mk(head, GEO.sphere, 0x10120f, [0.26, 0.12, 0.3], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0x10120f, [-0.26, 0.12, 0.3], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  const legs = [];
  const hips = [[0.56, 0.7], [-0.56, 0.7], [0.62, -0.62], [-0.62, -0.62]];
  for (const [x, z] of hips) {
    const leg = pivot(group, [x, 1.2, z]);
    mk(leg, GEO.cyl, 0x735f46, [0, -0.55, 0], [0.2, 0.95, 0.2]);
    mk(leg, GEO.box, 0x4a3f31, [0, -1.06, 0.08], [0.28, 0.1, 0.4]);
    legs.push(leg);
  }
  return { group, parts: { legs, head, body, tail, frill, wings: [] } };
}

function buildRaptor() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x8a4d33, [0, 1.28, -0.05], [0.38, 0.46, 1.02]);
  mk(group, GEO.sphere, 0xc9a06a, [0, 1.14, 0.22], [0.28, 0.26, 0.7]);
  // feather ridge
  for (let i = 0; i < 4; i++) {
    mk(group, GEO.cone, 0x5e3726, [0, 1.68 - i * 0.05, 0.45 - i * 0.36], [0.07, 0.26, 0.05], [-0.3, 0, 0]);
  }
  const neck = pivot(group, [0, 1.45, 0.72]);
  mk(neck, GEO.cyl, 0x8a4d33, [0, 0.16, 0.18], [0.16, 0.6, 0.16], [-0.55, 0, 0]);
  const head = pivot(group, [0, 1.8, 1.05]);
  mk(head, GEO.sphere, 0x8f5237, [0, 0, 0.05], [0.26, 0.24, 0.36]);
  mk(head, GEO.box, 0x9c5c3d, [0, -0.08, 0.32], [0.2, 0.12, 0.32]);
  mk(head, GEO.box, 0x6b3a26, [0, -0.17, 0.28], [0.18, 0.06, 0.28]);
  mk(head, GEO.sphere, 0xe6c14e, [0.17, 0.06, 0.15], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0xe6c14e, [-0.17, 0.06, 0.15], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  // crest feathers
  for (let i = 0; i < 3; i++) {
    mk(head, GEO.cone, 0xd06a3c, [0, 0.2, -0.1 - i * 0.12], [0.05, 0.32, 0.04], [-1.0 - i * 0.1, 0, 0]);
  }
  // tiny arms
  const arms = [];
  for (const x of [0.27, -0.27]) {
    const arm = pivot(group, [x, 1.32, 0.5]);
    mk(arm, GEO.cyl, 0x8a4d33, [0, -0.12, 0.08], [0.06, 0.34, 0.06], [0.9, 0, 0]);
    mk(arm, GEO.cone, 0xe0d6b8, [0, -0.26, 0.2], [0.04, 0.16, 0.04], [1.3, 0, 0], clawMat);
    arms.push(arm);
  }
  // legs
  const legs = [];
  for (const x of [0.27, -0.27]) {
    const leg = pivot(group, [x, 1.12, -0.05]);
    mk(leg, GEO.cyl, 0x7c442c, [0, -0.28, 0.03], [0.13, 0.6, 0.13], [0.25, 0, 0]);
    mk(leg, GEO.cyl, 0x8a4d33, [0, -0.72, -0.04], [0.08, 0.55, 0.08], [-0.35, 0, 0]);
    mk(leg, GEO.box, 0x5c3323, [0, -1.0, 0.16], [0.14, 0.06, 0.36]);
    mk(leg, GEO.cone, 0xd9c9a4, [0, -1.0, 0.36], [0.035, 0.15, 0.035], [1.4, 0, 0], clawMat);
    legs.push(leg);
  }
  // tail
  const tail = pivot(group, [0, 1.3, -0.9]);
  mk(tail, GEO.cyl, 0x8a4d33, [0, 0.02, -0.5], [0.13, 1.0, 0.13], [-1.45, 0, 0]);
  mk(tail, GEO.cyl, 0x7c442c, [0, -0.06, -1.15], [0.08, 0.8, 0.08], [-1.5, 0, 0]);
  mk(tail, GEO.cone, 0x5e3726, [0, -0.1, -1.55], [0.08, 0.3, 0.08], [-1.55, 0, 0]);
  return { group, parts: { legs, head, body, tail, arms, wings: [] } };
}

function buildBronto() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x687460, [0, 4.7, -0.2], [1.45, 1.35, 2.8]);
  mk(group, GEO.sphere, 0x91996e, [0, 4.35, 0.4], [1.1, 0.9, 2.0]);
  // neck
  const neck = pivot(group, [0, 5.5, 2.1]);
  mk(neck, GEO.cyl, 0x687460, [0, 0.9, 0.5], [0.42, 2.2, 0.42], [-0.36, 0, 0]);
  mk(neck, GEO.cyl, 0x687460, [0, 2.7, 1.0], [0.32, 2.0, 0.32], [-0.3, 0, 0]);
  mk(neck, GEO.cyl, 0x728060, [0, 4.1, 1.45], [0.25, 1.6, 0.25], [-0.25, 0, 0]);
  const head = pivot(group, [0, 9.85, 3.6]);
  mk(head, GEO.sphere, 0x728060, [0, 0, 0], [0.42, 0.4, 0.6]);
  mk(head, GEO.box, 0x8b966e, [0, -0.1, 0.45], [0.34, 0.25, 0.4]);
  mk(head, GEO.sphere, 0x11130f, [0.24, 0.1, 0.2], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0x11130f, [-0.24, 0.1, 0.2], [0.05, 0.05, 0.05], [0, 0, 0], eyeMat);
  // legs
  const legs = [];
  const hips = [[0.85, 1.3], [-0.85, 1.3], [0.95, -1.4], [-0.95, -1.4]];
  for (const [x, z] of hips) {
    const leg = pivot(group, [x, 3.6, z]);
    mk(leg, GEO.cyl, 0x616d58, [0, -1.4, 0], [0.34, 2.6, 0.34]);
    mk(leg, GEO.cyl, 0x55604d, [0, -2.75, 0], [0.4, 0.4, 0.4]);
    mk(leg, GEO.box, 0x3f483a, [0, -3.0, 0.15], [0.65, 0.16, 0.8]);
    legs.push(leg);
  }
  // tail
  const tail = pivot(group, [0, 4.6, -2.7]);
  mk(tail, GEO.cyl, 0x687460, [0, -0.15, -0.9], [0.35, 2.0, 0.35], [-1.5, 0, 0]);
  mk(tail, GEO.cyl, 0x5e6a56, [0, -0.35, -2.4], [0.2, 1.8, 0.2], [-1.55, 0, 0]);
  mk(tail, GEO.cone, 0x5e6a56, [0, -0.45, -3.4], [0.18, 0.8, 0.18], [-1.55, 0, 0]);
  return { group, parts: { legs, head, body, neck, tail, wings: [] } };
}

function buildPtera() {
  const group = new THREE.Group();
  const body = mk(group, GEO.sphere, 0x6b4e3c, [0, 0, 0], [0.38, 0.36, 0.9]);
  const head = pivot(group, [0, 0.1, 0.8]);
  mk(head, GEO.sphere, 0x76563f, [0, 0, 0], [0.24, 0.24, 0.4]);
  mk(head, GEO.cone, 0xd8b45c, [0, -0.04, 0.5], [0.11, 0.7, 0.08], [Math.PI / 2, 0, 0], clawMat);
  mk(head, GEO.cone, 0x8e3f2f, [0, 0.18, -0.1], [0.15, 0.55, 0.05], [-1.9, 0, 0]);
  mk(head, GEO.sphere, 0xf0d36a, [0.16, 0.07, 0.12], [0.04, 0.04, 0.04], [0, 0, 0], eyeMat);
  mk(head, GEO.sphere, 0xf0d36a, [-0.16, 0.07, 0.12], [0.04, 0.04, 0.04], [0, 0, 0], eyeMat);
  const wings = [];
  for (const side of [1, -1]) {
    const wing = pivot(group, [side * 0.3, 0.1, 0.1]);
    const membrane = mk(wing, GEO.box, 0x7a5740, [side * 0.95, 0, 0], [1.9, 0.06, 0.62], [0, 0, side * -0.1]);
    mk(wing, GEO.cone, 0x5e4030, [side * 0.25, 0, -0.2], [0.08, 0.9, 0.08], [0, 0, side * 1.25]);
    wings.push(wing);
  }
  return { group, parts: { legs: [], head, body, tail: null, wings } };
}

export function buildDino(species) {
  switch (species) {
    case 'dodo': return buildDodo();
    case 'parasaur': return buildParasaur();
    case 'trike': return buildTrike();
    case 'raptor': return buildRaptor();
    case 'bronto': return buildBronto();
    case 'ptera': return buildPtera();
    default: return buildDodo();
  }
}

/* ------------------------------------------------------------------ */
/* Dino entity                                                         */
/* ------------------------------------------------------------------ */
let dinoId = 0;

export class Dino {
  constructor(species, position, world, rng = Math.random, opts = {}) {
    this.id = ++dinoId;
    this.species = species;
    this.def = SPECIES[species];
    this.world = world;
    this.rng = rng;
    this.hp = this.def.hp;
    this.maxHp = this.def.hp;
    const built = buildDino(species);
    this.group = built.group;
    this.parts = built.parts;
    this.group.position.copy(position);
    if (this.def.flying) this.group.position.y = position.y + 22 + rng() * 10;
    this.rotation = rng() * Math.PI * 2;
    this.group.rotation.y = this.rotation;
    this.home = position.clone();
    this.wanderTarget = position.clone();
    this.target = position.clone();
    this.state = 'idle';
    this.stateTimer = 1 + rng() * 3;
    this.walkPhase = rng() * 10;
    this.moving = false;
    this.tamed = opts.tamed || false;
    this.tameProgress = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.harvestLeft = 0;
    this.attackCd = 0;
    this.attackAnim = 0;
    this.provoked = 0;
    this.fleeTimer = 0;
    this.mounted = false;
    this.currentSpeed = 0;
    this.roarTimer = 4 + rng() * 18;
    this.flyingAngle = rng() * Math.PI * 2;
    this.carcass = false;
    this.name = this.def.name;
    if (this.tamed) this.addCollar();
  }

  get position() { return this.group.position; }

  addCollar() {
    if (this._collar) return;
    const geo = new THREE.TorusGeometry(0.3, 0.045, 4, 12);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x58d6bd, emissive: 0x1b7a68, emissiveIntensity: 0.7, roughness: 0.5 }));
    const c = this.def.collar || [0, 1.2, 0.2];
    m.position.set(c[0], c[1], c[2]);
    m.rotation.x = Math.PI / 2;
    this.group.add(m);
    this._collar = m;
  }

  tame(progress = this.def.feeds) {
    this.tamed = true;
    this.tameProgress = progress;
    this.provoked = 0;
    this.fleeTimer = 0;
    this.addCollar();
  }

  provoke() {
    if (this.dead) return;
    if (this.def.passive) {
      this.fleeTimer = 5;
    } else {
      this.provoked = 14;
    }
  }

  distanceTo(pos) {
    return this.position.distanceTo(pos);
  }

  faceTowards(x, z, dt, rate = 6) {
    if (Math.abs(x) < 0.001 && Math.abs(z) < 0.001) return;
    const targetAngle = Math.atan2(x, z);
    let diff = targetAngle - this.rotation;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rotation += diff * (1 - Math.exp(-rate * dt));
    this.group.rotation.y = this.rotation;
  }

  moveTowards(target, speed, dt, avoidWater = true) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.25) { this.moving = false; this.currentSpeed = 0; return; }
    const step = Math.min(dist, speed * dt);
    const nx = this.position.x + (dx / dist) * step;
    const nz = this.position.z + (dz / dist) * step;
    const h = terrainHeight(nx, nz);
    if (avoidWater && h < 0.15) { this.moving = false; this.currentSpeed = 0; return; }
    this.position.x = nx;
    this.position.z = nz;
    if (!this.def.flying) this.position.y = Math.max(h, 0.05);
    this.faceTowards(dx, dz, dt, 5);
    this.walkPhase += speed * dt * 1.6;
    this.moving = true;
    this.currentSpeed = speed;
  }

  rideMove(dt, dirX, dirZ, speed) {
    const len = Math.hypot(dirX, dirZ);
    if (len < 0.01) { this.moving = false; this.currentSpeed = 0; return; }
    const nx = dirX / len, nz = dirZ / len;
    const h = terrainHeight(this.position.x + nx * 0.8, this.position.z + nz * 0.8);
    if (h > 0.1 || this.def.flying) {
      this.position.x += nx * speed * dt;
      this.position.z += nz * speed * dt;
      this.position.y = Math.max(h, 0.05);
    }
    this.faceTowards(nx, nz, dt, 8);
    this.walkPhase += speed * dt * 1.35;
    this.moving = true;
    this.currentSpeed = speed;
  }

  update(dt, game) {
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    this.provoked = Math.max(0, this.provoked - dt);
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);

    if (this.dead) {
      this.deadTimer += dt;
      this.moving = false;
      return;
    }

    if (this.def.flying) {
      this.flyingAngle += dt * 0.14;
      const r = 46 + Math.sin(this.flyingAngle * 0.7) * 12;
      const cx = this.home.x, cz = this.home.z;
      this.position.x = cx + Math.cos(this.flyingAngle) * r;
      this.position.z = cz + Math.sin(this.flyingAngle) * r;
      this.position.y = this.home.y + 26 + Math.sin(this.flyingAngle * 2.2) * 3;
      this.faceTowards(
        -Math.sin(this.flyingAngle) * r,
        Math.cos(this.flyingAngle) * r,
        dt, 3,
      );
      this.moving = true;
      this.currentSpeed = 8;
      this.animate(dt);
      return;
    }

    const player = game.player;
    const ppos = player.pos;
    const dist = this.position.distanceTo(ppos);

    if (this.tamed) {
      if (this.mounted) {
        // movement comes from rideMove() called by the game
        this.animate(dt);
        return;
      }
      const followDist = 5.5;
      if (dist > followDist + 2) {
        const ox = ppos.x + Math.sin(this.id * 1.7) * 2.2;
        const oz = ppos.z + Math.cos(this.id * 1.7) * 2.2;
        this.target.set(ox, ppos.y, oz);
        this.moveTowards(this.target, this.def.speed * 0.85, dt);
      } else {
        this.moving = false;
        this.currentSpeed = 0;
        this.faceTowards(ppos.x - this.position.x, ppos.z - this.position.z, dt, 2.5);
      }
      this.animate(dt);
      return;
    }

    // Wild behaviour
    if (this.fleeTimer > 0) {
      const away = new THREE.Vector3(
        this.position.x + (this.position.x - ppos.x) * 3,
        this.position.y,
        this.position.z + (this.position.z - ppos.z) * 3,
      );
      this.moveTowards(away, this.def.speed * 1.15, dt);
      this.animate(dt);
      return;
    }

    const safe = game.isSafeFromFire(this.position);
    let hunting = false;
    if (this.def.aggressive && !player.dead && !safe) {
      const aggro = this.def.aggro * (game.isNight ? 1.35 : 1);
      hunting = dist < aggro;
    }
    if (this.provoked > 0) hunting = true;

    if (hunting && !player.dead) {
      if (dist > this.def.reach * 0.8) {
        this.moveTowards(ppos, this.def.speed, dt);
      } else {
        this.moving = false;
        this.currentSpeed = 0;
        this.faceTowards(ppos.x - this.position.x, ppos.z - this.position.z, dt, 8);
        if (this.attackCd <= 0) {
          this.attackCd = 1.6;
          this.attackAnim = 0.35;
          game.dinoAttack(this);
        }
      }
      this.animate(dt);
      return;
    }

    // wander
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      this.stateTimer = 2.5 + this.rng() * 5;
      if (this.rng() < 0.42) {
        this.state = 'idle';
      } else {
        this.state = 'walk';
        const a = this.rng() * Math.PI * 2;
        const d = this.rng() * 9;
        this.wanderTarget.set(this.home.x + Math.cos(a) * d, this.position.y, this.home.z + Math.sin(a) * d);
      }
    }
    if (this.state === 'walk') {
      this.moveTowards(this.wanderTarget, this.def.wander, dt);
      if (this.position.distanceTo(this.wanderTarget) < 1) this.state = 'idle';
    } else {
      this.moving = false;
      this.currentSpeed = 0;
      // slow look around
      if (this.rng() < dt * 0.2) this.rotation += 0.5;
      this.group.rotation.y = this.rotation;
    }

    this.roarTimer -= dt;
    if (this.roarTimer <= 0 && dist < 55) {
      this.roarTimer = 18 + this.rng() * 28;
      if (this.species === 'raptor' || this.species === 'trike' || this.species === 'bronto') game.roar(this);
    }

    this.animate(dt);
  }

  animate(dt) {
    const p = this.parts;
    const t = this.walkPhase;
    const amp = this.moving ? Math.min(0.7, 0.18 + this.currentSpeed * 0.09) : 0.015;
    const len = p.legs ? p.legs.length : 0;
    for (let i = 0; i < len; i++) {
      const phase = len === 2 ? (i === 0 ? 0 : Math.PI) : (i % 2 === 0 ? 0 : Math.PI);
      p.legs[i].rotation.x = Math.sin(t + phase) * amp;
    }
    if (p.body) {
      const bob = this.moving ? Math.abs(Math.sin(t)) * 0.045 : Math.sin(t * 0.5) * 0.008;
      p.body.position.y = (p.body.userData.baseY ?? (p.body.userData.baseY = p.body.position.y)) + bob;
    }
    if (p.tail) p.tail.rotation.y = Math.sin(t * 0.6 + 1) * 0.18;
    if (p.neck) p.neck.rotation.x = Math.sin(t * 0.4) * 0.03;
    if (p.head) {
      p.head.rotation.x = Math.sin(t * 0.5 + 2) * 0.04 - this.attackAnim * 1.1;
      if (this.attackAnim > 0) p.head.rotation.x -= Math.sin(this.attackAnim * 9) * 0.3;
    }
    if (p.wings && p.wings.length) {
      for (const w of p.wings) {
        const side = w.position.x >= 0 ? 1 : -1;
        w.rotation.z = side * (Math.sin(this.walkPhase * 2 + (this.def.flying ? 0 : 0)) * 0.5 - 0.05);
      }
    }
    if (p.arms) {
      for (let i = 0; i < p.arms.length; i++) p.arms[i].rotation.x = Math.sin(t + i * Math.PI) * (this.moving ? 0.3 : 0.05);
    }
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.mounted = false;
    this.moving = false;
    this.carcass = true;
    this.harvestLeft = this.def.harvestMax || 3;
    const ground = terrainHeight(this.position.x, this.position.z);
    this.group.position.y = Math.max(ground, 0.05);
    this.group.rotation.z = Math.PI / 2 * 0.85;
    this.group.rotation.x = 0.12;
    this._collar?.removeFromParent();
    this._collar = null;
  }
}
