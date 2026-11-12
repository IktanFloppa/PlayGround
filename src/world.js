import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';
import { clamp, smoothstep, fbm, mulberry32, rand, pick } from './utils.js';

export const WATER_LEVEL = 0;
const WORLD_SIZE = 420;
const SEGMENTS = 176;

/* ------------------------------------------------------------------ */
/* Terrain sampling                                                    */
/* ------------------------------------------------------------------ */
function coastRadius(ang) {
  return 168 + 10 * Math.sin(ang * 3 + 1.1) + 6 * Math.sin(ang * 5.7 + 0.3) + 4 * Math.sin(ang * 9.1 + 2.0);
}

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const R = coastRadius(ang);
  const t = r / R;
  const base = 22 * (1 - Math.pow(clamp(t, 0, 1.5), 1.7)) - 4.5;
  const inland = 1 - smoothstep(0.52, 0.93, t);
  const hill = fbm(x * 0.013 + 3.3, z * 0.013 - 1.7, 4) * 7.0 * inland;
  const ridge = Math.pow(1 - Math.abs(fbm(x * 0.027 - 4.1, z * 0.027 + 8.2, 3)), 2) * 15 * smoothstep(0.8, 0.3, t);
  const detailMask = 1 - smoothstep(0.84, 1.02, t);
  const detail = fbm(x * 0.075, z * 0.075, 2) * 0.55 * detailMask;
  return base + hill * 0.85 + ridge * 0.5 + detail;
}

export function terrainSlope(x, z) {
  const e = 0.9;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return Math.hypot(hx, hz) / (2 * e);
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */
function colored(geo, hex, jitter = 0, rng = null) {
  const c = new THREE.Color(hex);
  const pos = geo.attributes.position;
  const count = pos.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let r = c.r, g = c.g, b = c.b;
    if (jitter && rng) {
      const j = 1 + (rng() - 0.5) * jitter;
      r *= j; g *= j; b *= j;
    }
    arr[i * 3] = r; arr[i * 3 + 1] = g; arr[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function merge(inputParts) {
  let parts = inputParts;
  if (parts.some((p) => p.index === null)) {
    parts = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  }
  const g = mergeGeometries(parts, false);
  inputParts.forEach((p) => p.dispose());
  if (parts !== inputParts) parts.forEach((p) => { if (!inputParts.includes(p)) p.dispose(); });
  g.computeBoundingSphere();
  return g;
}

function makeNoiseTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256, y = (i / 256) | 0;
    const n = 230 + Math.sin(x * 0.55) * 6 + Math.sin(y * 0.37) * 5 + (Math.random() - 0.5) * 52;
    const v = clamp(n, 164, 255);
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 240; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? '#ffffff' : '#8d8d7a';
    ctx.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 8, y - 3 - Math.random() * 7);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(52, 52);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.35, 'rgba(255,225,150,0.7)');
  g.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ */
/* Tree / rock / bush geometry                                         */
/* ------------------------------------------------------------------ */
function buildPine(rng) {
  const trunk = colored(new THREE.CylinderGeometry(0.22, 0.36, 4.4, 7).translate(0, 2.2, 0), 0x5b3f28, 0.12, rng);
  const parts = [];
  const greens = [0x35562f, 0x3f6435, 0x476f3a];
  const levels = [
    [2.05, 3.6, 3.5, 0],
    [1.62, 3.0, 5.1, 1],
    [1.15, 2.4, 6.3, 2],
  ];
  for (const [rad, h, y, gi] of levels) {
    parts.push(colored(new THREE.ConeGeometry(rad, h, 8).translate(0, y, 0), greens[gi], 0.16, rng));
  }
  return { trunk, foliage: merge(parts), height: 8 };
}

function palmFrondGeometry(len, width, droop, color, rng) {
  const pos = new Float32Array([
    0, 0, 0,
    -width, 0.16, len * 0.46,
    0, -droop, len,
    width, 0.16, len * 0.46,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 1, 1, 0]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return colored(g, color, 0.14, rng);
}

function buildPalm(rng) {
  const trunkParts = [];
  let px = 0, py = 0;
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.CylinderGeometry(0.15 - i * 0.009, 0.2 - i * 0.012, 1.35, 6);
    seg.translate(px, py + 0.65, 0);
    trunkParts.push(colored(seg, i % 2 ? 0x82643f : 0x7a5c39, 0.05, rng));
    px += 0.11; py += 1.16;
  }
  const trunk = merge(trunkParts);
  const fronds = [];
  for (let i = 0; i < 9; i++) {
    const len = 2.3 + (i % 3) * 0.3;
    const g = palmFrondGeometry(len, 0.52, 0.22 + (i % 2) * 0.18, i % 2 ? 0x6f9c44 : 0x86b158, rng);
    g.rotateX(-0.08 - (i % 3) * 0.07);
    g.rotateY((i / 9) * Math.PI * 2 + 0.18);
    g.translate(0.4, 5.75, 0);
    fronds.push(g);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.SphereGeometry(0.16, 6, 5);
    const a = (i / 3) * Math.PI * 2;
    c.translate(0.4 + Math.cos(a) * 0.32, 5.45, Math.sin(a) * 0.32);
    fronds.push(colored(c, 0x6d4c1f, 0.1, rng));
  }
  return { trunk, foliage: merge(fronds), height: 6.2 };
}

function buildBroadleaf(rng) {
  const trunk = colored(new THREE.CylinderGeometry(0.26, 0.42, 4.6, 7).translate(0, 2.3, 0), 0x5a4028, 0.1, rng);
  const parts = [];
  const blobs = [
    [0, 4.9, 0, 2.2, 0x496f37],
    [1.35, 4.2, 0.5, 1.5, 0x557c3e],
    [-1.2, 4.5, -0.4, 1.55, 0x5d8745],
    [0.3, 5.9, -1.0, 1.4, 0x51773a],
    [-0.5, 3.9, 1.2, 1.25, 0x628c48],
  ];
  for (const [x, y, z, r, c] of blobs) {
    parts.push(colored(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c, 0.18, rng));
  }
  return { trunk, foliage: merge(parts), height: 7.5 };
}

function buildRock(rng) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.DodecahedronGeometry(0.75 + rng() * 0.55, 0);
    g.scale(1 + rng() * 0.4, 0.65 + rng() * 0.4, 1 + rng() * 0.3);
    g.translate((rng() - 0.5) * 1.3, 0.35 + rng() * 0.35, (rng() - 0.5) * 1.2);
    parts.push(colored(g, pick(rng, [0x777a73, 0x84867d, 0x6d716b]), 0.16, rng));
  }
  return merge(parts);
}

function buildBush(rng) {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(0.42 + rng() * 0.3, 1);
    g.scale(1.2, 0.9, 1.2);
    g.translate((rng() - 0.5) * 0.9, 0.32 + rng() * 0.28, (rng() - 0.5) * 0.9);
    parts.push(colored(g, pick(rng, [0x3f6332, 0x4b7038, 0x557a3d]), 0.2, rng));
  }
  for (let i = 0; i < 9; i++) {
    const g = new THREE.SphereGeometry(0.065, 5, 4);
    const a = rng() * Math.PI * 2, rr = 0.45 + rng() * 0.35;
    g.translate(Math.cos(a) * rr, 0.5 + rng() * 0.35, Math.sin(a) * rr);
    parts.push(colored(g, i % 3 === 0 ? 0xd9c14c : 0xa8322f, 0.1, rng));
  }
  return merge(parts);
}

function buildTuft(rng) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.ConeGeometry(0.055, 0.55 + rng() * 0.35, 3, 1, true);
    g.translate(0, 0.3, 0);
    g.rotateZ((rng() - 0.5) * 0.7);
    g.rotateY(rng() * Math.PI * 2);
    g.translate((rng() - 0.5) * 0.22, 0, (rng() - 0.5) * 0.22);
    parts.push(colored(g, pick(rng, [0x5d7f37, 0x6a8b3e, 0x72923f]), 0.18, rng));
  }
  return merge(parts);
}

function buildFlower(rng) {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.016, 0.024, 0.38, 3, 1, true).translate(0, 0.19, 0);
  parts.push(colored(stem, 0x4f6f31, 0.12, rng));
  for (let i = 0; i < 4; i++) {
    const petal = new THREE.IcosahedronGeometry(0.075, 0);
    const a = (i / 4) * Math.PI * 2;
    petal.translate(Math.cos(a) * 0.085, 0.41 + (i % 2) * 0.015, Math.sin(a) * 0.085);
    parts.push(colored(petal, 0xffffff, 0.06, rng));
  }
  const core = new THREE.SphereGeometry(0.045, 4, 3).translate(0, 0.43, 0);
  parts.push(colored(core, 0xf2c74d, 0.05, rng));
  return merge(parts);
}

/* ------------------------------------------------------------------ */
/* World                                                               */
/* ------------------------------------------------------------------ */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.nodes = [];
    this.rng = mulberry32(91173);
    this.dummy = new THREE.Object3D();
    this.tmpColor = new THREE.Color();
    this.baseFog = 0.0019;
    this.night = 0;
    this.worldSize = WORLD_SIZE;

    this.scene.fog = new THREE.FogExp2(0xb7cfcf, this.baseFog);

    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildFoam();
    this.spawnPoint = this.findSpawnPoint();
    this.buildVegetation();
    this.buildClouds();
    this.buildFireflies();
    this.buildDistantIsles();
  }

  /* ------------------------ sky ------------------------ */
  buildSky() {
    const uniforms = {
      uTop: { value: new THREE.Color(0x4f8bbd) },
      uHorizon: { value: new THREE.Color(0xd7e6df) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
      uSunColor: { value: new THREE.Color(0xffe2b0) },
      uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, smoothstep(-0.02, 0.34, h));
          float sunAmt = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sunAmt, 1400.0) * 7.0 + pow(sunAmt, 18.0) * 0.14);
          vec3 moonDir = normalize(vec3(-uSunDir.x, max(0.06, -uSunDir.y), -uSunDir.z));
          float moonAmt = max(dot(d, moonDir), 0.0);
          col += vec3(0.62, 0.74, 0.95) * (pow(moonAmt, 2000.0) * 3.2 + pow(moonAmt, 60.0) * 0.10) * uNight;
          col = max(col, vec3(0.0));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(720, 32, 20), mat);
    this.sky.frustumCulled = false;
    this.skyUniforms = uniforms;
    this.scene.add(this.sky);

    // stars
    const starPos = [];
    const starRng = mulberry32(4142);
    for (let i = 0; i < 1100; i++) {
      const a = starRng() * Math.PI * 2;
      const y = 0.05 + starRng() * 0.95;
      const rr = Math.sqrt(1 - y * y);
      starPos.push(Math.cos(a) * rr * 660, y * 660, Math.sin(a) * rr * 660);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xdfe9ff, size: 2.1, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  /* ------------------------ lights ------------------------ */
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xa9c9d4, 0x3c3a24, 0.7);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe8c0, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 320;
    this.sun.shadow.camera.left = -58;
    this.sun.shadow.camera.right = 58;
    this.sun.shadow.camera.top = 58;
    this.sun.shadow.camera.bottom = -58;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.moon = new THREE.DirectionalLight(0x88a8da, 0.0);
    this.scene.add(this.moon);
    this.moonTarget = new THREE.Object3D();
    this.scene.add(this.moonTarget);
    this.moon.target = this.moonTarget;

    // soft sky-bounce fill so characters and props keep their colour when backlit
    this.fill = new THREE.DirectionalLight(0xc3dcea, 0.0);
    this.fill.castShadow = false;
    this.scene.add(this.fill);
    this.fillTarget = new THREE.Object3D();
    this.scene.add(this.fillTarget);
    this.fill.target = this.fillTarget;

    this.sunDir = new THREE.Vector3(0.4, 0.7, 0.4).normalize();
    this.sunColorWarm = new THREE.Color(0xffb877);
    this.sunColorDay = new THREE.Color(0xfff5df);
  }

  /* ------------------------ terrain ------------------------ */
  buildTerrain() {
    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const sandWet = new THREE.Color(0xb39c72);
    const sand = new THREE.Color(0xe4d3a2);
    const grassA = new THREE.Color(0x527a2f);
    const grassB = new THREE.Color(0x8cab4d);
    const grassDeep = new THREE.Color(0x365a20);
    const grassDry = new THREE.Color(0xa5a459);
    const rock = new THREE.Color(0x93948a);
    const rockDark = new THREE.Color(0x6b6960);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const slope = terrainSlope(x, z);
      const n = fbm(x * 0.05 + 9, z * 0.05 - 3, 3);
      const n2 = fbm(x * 0.21 - 2, z * 0.21 + 4, 2);

      if (h < 0.45) c.copy(sandWet).lerp(rockDark, smoothstep(-4, 0.4, h) * 0.3);
      else if (h < 1.5) c.copy(sandWet).lerp(sand, smoothstep(0.45, 1.1, h));
      else if (h < 2.7) c.copy(sand).lerp(grassA, smoothstep(1.5, 2.7, h));
      else {
        c.copy(grassA);
        c.lerp(grassB, clamp(0.5 + n * 0.7, 0, 1) * 0.6);
        c.lerp(grassDeep, clamp(n2 * 0.6 + 0.2, 0, 1) * 0.4);
        const dry = clamp((n2 + 0.2) * 0.5 + (1 - smoothstep(3, 9, h)) * 0.35, 0, 1);
        c.lerp(grassDry, dry * 0.42);
        if (h > 14) c.lerp(rock, smoothstep(14, 24, h) * 0.7);
      }
      const rockFactor = smoothstep(0.52, 0.95, slope) * smoothstep(0.4, 2.4, h);
      if (rockFactor > 0) {
        tmp.copy(rock).lerp(rockDark, clamp(0.45 + n2 * 0.5, 0, 1));
        c.lerp(tmp, rockFactor * 0.92);
      }
      // gentle color variation across the island
      const v = 0.86 + n2 * 0.2;
      colors[i * 3] = c.r * v;
      colors[i * 3 + 1] = c.g * v;
      colors[i * 3 + 2] = c.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: makeNoiseTexture(),
      roughness: 1.0,
      metalness: 0.0,
    });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = false;
    this.scene.add(this.terrain);
  }

  /* ------------------------ water ------------------------ */
  buildWater() {
    const geo = new THREE.PlaneGeometry(1000, 1000, 70, 70);
    geo.rotateX(-Math.PI / 2);
    const uniforms = {
      uTime: { value: 0 },
      uSkyTop: { value: new THREE.Color(0x5c98c8) },
      uSkyHorizon: { value: new THREE.Color(0xd9e8e2) },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
      uSunColor: { value: new THREE.Color(0xfff0cc) },
      uDeep: { value: new THREE.Color(0x06323e) },
      uShallow: { value: new THREE.Color(0x2fb3a4) },
      uNight: { value: 0 },
      uFogColor: { value: new THREE.Color(0xcfe3e2) },
      uFogDensity: { value: 0.0029 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vFogDepth;
        float wave(vec2 p) {
          return sin(p.x * 0.31 + uTime * 0.9) * 0.22
               + sin(p.y * 0.26 - uTime * 0.7) * 0.18
               + sin((p.x + p.y) * 0.56 + uTime * 1.4) * 0.07
               + sin(p.x * 1.45 - uTime * 1.7) * 0.035
               + sin(p.y * 1.7 + uTime * 2.0) * 0.03;
        }
        void main() {
          vec3 p = position;
          float h = wave(p.xz);
          p.y += h;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          float e = 0.5;
          float hx = wave(p.xz + vec2(e, 0.0)) - h;
          float hz = wave(p.xz + vec2(0.0, e)) - h;
          vNormalW = normalize(vec3(-hx / e, 1.0, -hz / e));
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform float uNight; uniform float uTime;
        uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vFogDepth;
        void main() {
          vec2 rp = vWorld.xz;
          vec3 ripple = vec3(
            sin(rp.x * 1.9 + uTime * 1.6) * 0.035 + sin(rp.y * 2.4 - uTime * 1.15) * 0.022,
            0.0,
            cos(rp.y * 2.1 + uTime * 1.4) * 0.035 + cos(rp.x * 1.7 - uTime * 1.05) * 0.022
          );
          vec3 n = normalize(vNormalW + ripple);
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
          vec3 refl = reflect(-v, n);
          float up = clamp(refl.y * 1.15 + 0.08, 0.0, 1.0);
          vec3 sky = mix(uSkyHorizon, uSkyTop, up);
          vec3 col = mix(uDeep, uShallow, 0.3 + fres * 0.42);
          col = mix(col, sky, 0.09 + fres * 0.38);
          float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 260.0);
          col += uSunColor * spec * 2.8;
          col += uShallow * pow(max(dot(n, v), 0.0), 8.0) * 0.09;
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 0.92));
          gl_FragColor = vec4(col, 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    // fog chunks rely on vFogDepth; ensure the attribute exists through three's fog uniforms
    this.waterUniforms = uniforms;
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.y = 0;
    this.water.renderOrder = 2;
    this.water.frustumCulled = false;
    this.scene.add(this.water);
  }

  /* ------------------------ shoreline foam ------------------------ */
  buildFoam() {
    const N = 220;
    const pos = [], alpha = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let lo = 70, hi = coastRadius(a);
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) * 0.5;
        if (terrainHeight(Math.cos(a) * mid, Math.sin(a) * mid) > 0.06) lo = mid;
        else hi = mid;
      }
      const r0 = lo;
      const crest = 0.7 + 0.22 * Math.sin(a * 15 + 0.8) + 0.14 * Math.sin(a * 29);
      const rows = [
        [r0 - 0.9, 0.015, 0],
        [r0 + crest * 0.4, 0.1, 1],
        [r0 + crest * 2.0, 0.025, 0],
      ];
      for (const [rr, yy, aa] of rows) {
        pos.push(Math.cos(a) * rr, yy, Math.sin(a) * rr);
        alpha.push(aa);
      }
    }
    for (let i = 0; i < N; i++) {
      const a0 = i * 3, a1 = (i + 1) * 3;
      for (let r = 0; r < 2; r++) {
        idx.push(a0 + r, a1 + r, a1 + r + 1, a0 + r, a1 + r + 1, a0 + r + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alpha, 1));
    geo.setIndex(idx);
    const uniforms = { uTime: { value: 0 }, uLight: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aAlpha;
        varying float vAlpha;
        varying vec2 vXZ;
        void main() {
          vAlpha = aAlpha;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vXZ = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uLight;
        varying float vAlpha;
        varying vec2 vXZ;
        void main() {
          float streak = 0.55 + 0.45 * sin(vXZ.x * 0.65 + vXZ.y * 0.8 + uTime * 1.9);
          float a = vAlpha * (0.3 + 0.45 * streak);
          gl_FragColor = vec4(vec3(0.93, 0.98, 0.97) * uLight, a);
        }
      `,
    });
    this.foamUniforms = uniforms;
    this.foam = new THREE.Mesh(geo, mat);
    this.foam.renderOrder = 3;
    this.foam.frustumCulled = false;
    this.scene.add(this.foam);
  }

  /* ------------------------ spawn point ------------------------ */
  findSpawnPoint() {
    const angles = [0.55, 1.1, 0.1, 1.7, -0.45, 2.4, -1.0, 3.0, -1.6];
    for (const a of angles) {
      for (let rr = 136; rr <= 152; rr += 1.5) {
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        const h = terrainHeight(x, z);
        if (h > 1.0 && h < 3.4 && terrainSlope(x, z) < 0.4) {
          return new THREE.Vector3(x, h, z);
        }
      }
    }
    return new THREE.Vector3(0, Math.max(1, terrainHeight(0, 130)), 130);
  }

  /* ------------------------ vegetation ------------------------ */
  buildVegetation() {
    const rng = this.rng;
    const spawn = this.spawnPoint;

    const pines = [], palms = [], broads = [], rocks = [], bushes = [];
    const tooCloseToSpawn = (x, z, d = 10) => Math.hypot(x - spawn.x, z - spawn.z) < d;

    // Trees
    for (let i = 0; i < 1600 && pines.length + palms.length + broads.length < 150; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 166;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.25 || terrainSlope(x, z) > 0.75) continue;
      if (tooCloseToSpawn(x, z, 12)) continue;
      if (h < 3.4) {
        if (rng() < 0.62) palms.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.75, 1.2) });
        else broads.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.7, 1.05) });
      } else if (h > 7.2) {
        pines.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.8, 1.45) });
      } else if (rng() < 0.5) {
        pines.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.7, 1.1) });
      } else {
        broads.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.75, 1.25) });
      }
    }

    // Rocks
    for (let i = 0; i < 500 && rocks.length < 78; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 164;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 0.5 || terrainSlope(x, z) > 1.1) continue;
      if (tooCloseToSpawn(x, z, 7)) continue;
      rocks.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.55, 1.5) });
    }
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = rand(rng, 138, 165);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h > 0.6 && h < 4 && terrainSlope(x, z) < 0.7) {
        rocks.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 1.6, 3.4) });
      }
    }

    // Bushes
    for (let i = 0; i < 500 && bushes.length < 110; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 160;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.4 || h > 17 || terrainSlope(x, z) > 0.8) continue;
      if (tooCloseToSpawn(x, z, 8)) continue;
      bushes.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.75, 1.25) });
    }

    // Guaranteed starter resources close to the spawn beach.
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      const d = 14 + rng() * 15;
      const x = spawn.x + Math.cos(a) * d;
      const z = spawn.z + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (h < 1.3 || terrainSlope(x, z) > 0.6) continue;
      if (i < 3) {
        if (h < 3.2) palms.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.85, 1.15) });
        else broads.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.85, 1.15) });
      } else if (i < 7) {
        bushes.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.9, 1.2) });
      } else {
        rocks.push({ x, z, y: h, rot: rng() * 6.28, scale: rand(rng, 0.7, 1.1) });
      }
    }

    // Coastal grove framing the opening camera: palms, ferns and boulders at the edges of the view.
    const viewYaw = Math.atan2(spawn.x, spawn.z) + Math.PI + 0.38;
    const vx = -Math.sin(viewYaw), vz = -Math.cos(viewYaw);
    const hx = Math.cos(viewYaw), hz = -Math.sin(viewYaw);
    const plot = (df, ds) => {
      const x = spawn.x + vx * df + hx * ds;
      const z = spawn.z + vz * df + hz * ds;
      return { x, z, h: terrainHeight(x, z), slope: terrainSlope(x, z) };
    };
    const framePalm = (df, ds, sc) => {
      const p = plot(df, ds);
      if (p.h < 1.2 || p.h > 8 || p.slope > 0.9) return;
      palms.push({ x: p.x, z: p.z, y: p.h, rot: rng() * 6.28, scale: sc });
    };
    const frameBroad = (df, ds, sc) => {
      const p = plot(df, ds);
      if (p.h < 1.4 || p.h > 16 || p.slope > 0.9) return;
      broads.push({ x: p.x, z: p.z, y: p.h, rot: rng() * 6.28, scale: sc });
    };
    const frameBush = (df, ds, sc) => {
      const p = plot(df, ds);
      if (p.h < 1.2 || p.h > 17 || p.slope > 0.9) return;
      bushes.push({ x: p.x, z: p.z, y: p.h, rot: rng() * 6.28, scale: sc });
    };
    framePalm(14, -13, 0.92);
    framePalm(13, 9, 1.2);
    framePalm(21, -15, 1.1);
    framePalm(28, 16, 0.95);
    framePalm(34, -22, 1.15);
    frameBroad(18, 12, 1.0);
    frameBroad(30, -17, 1.1);
    frameBush(6.5, -4.5, 1.15);
    frameBush(7.5, 5.5, 1.0);
    frameBush(12, -11, 1.2);
    frameBush(15, 13, 1.1);
    frameBush(23, -22, 1.25);
    frameBush(26, 8, 0.95);

    // shared materials
    this.leafMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, flatShading: true, side: THREE.DoubleSide,
      emissive: 0x1a2a11, emissiveIntensity: 0.42,
    });
    this.woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true });
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, flatShading: true });

    const pineGeo = buildPine(rng);
    const palmGeo = buildPalm(rng);
    const broadGeo = buildBroadleaf(rng);

    const makeInstanced = (geo, mat, count, cast = true) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
      im.count = count;
      im.castShadow = cast;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.scene.add(im);
      return im;
    };

    const register = (list, kind, type, radius, hp, scaleY = 1, scaleRange = null) => {
      const trunk = makeInstanced(type === 'pine' ? pineGeo.trunk : type === 'palm' ? palmGeo.trunk : broadGeo.trunk, this.woodMat, list.length);
      const fol = makeInstanced(type === 'pine' ? pineGeo.foliage : type === 'palm' ? palmGeo.foliage : broadGeo.foliage, this.leafMat, list.length);
      list.forEach((p, i) => {
        const node = {
          kind, type, x: p.x, z: p.z, y: p.y, hp, maxHp: hp,
          radius: radius * p.scale, scale: p.scale, baseRot: p.rot,
          alive: true, respawnAt: 0,
          meshes: [{ im: trunk, index: i }, { im: fol, index: i }],
          baseColor: new THREE.Color(1, 1, 1),
        };
        this.applyNodeMatrix(node, 1);
        const tint = 0.9 + rng() * 0.18;
        node.baseColor.setRGB(tint * (0.96 + rng() * 0.08), tint, tint * (0.94 + rng() * 0.08));
        trunk.setColorAt(i, node.baseColor);
        fol.setColorAt(i, node.baseColor);
        if (trunk.instanceColor) trunk.instanceColor.needsUpdate = true;
        if (fol.instanceColor) fol.instanceColor.needsUpdate = true;
        this.nodes.push(node);
      });
      return { trunk, fol, list };
    };

    register(pines, 'tree', 'pine', 2.0, 48);
    register(palms, 'tree', 'palm', 2.0, 40);
    register(broads, 'tree', 'broad', 2.2, 52);

    // rocks instanced
    const rockGeo = buildRock(rng);
    const rockIM = makeInstanced(rockGeo, this.rockMat, rocks.length);
    rocks.forEach((p, i) => {
      const node = {
        kind: 'rock', type: 'rock', x: p.x, z: p.z, y: p.y, hp: 80, maxHp: 80,
        radius: 1.15 * p.scale, scale: p.scale, baseRot: p.rot,
        alive: true, respawnAt: 0,
        meshes: [{ im: rockIM, index: i }],
        baseColor: new THREE.Color(1, 1, 1),
      };
      this.applyNodeMatrix(node, 1);
      const tint = 0.88 + rng() * 0.22;
      node.baseColor.setRGB(tint, tint * 1.01, tint * 0.98);
      rockIM.setColorAt(i, node.baseColor);
      if (rockIM.instanceColor) rockIM.instanceColor.needsUpdate = true;
      this.nodes.push(node);
    });

    // bushes instanced
    const bushGeo = buildBush(rng);
    const bushIM = makeInstanced(bushGeo, this.leafMat, bushes.length);
    bushes.forEach((p, i) => {
      const node = {
        kind: 'bush', type: 'bush', x: p.x, z: p.z, y: p.y, hp: 16, maxHp: 16,
        radius: 0.95 * p.scale, scale: p.scale, baseRot: p.rot,
        alive: true, respawnAt: 0,
        meshes: [{ im: bushIM, index: i }],
        baseColor: new THREE.Color(1, 1, 1),
      };
      this.applyNodeMatrix(node, 1);
      const tint = 0.9 + rng() * 0.2;
      node.baseColor.setRGB(tint * 0.97, tint, tint * 0.96);
      bushIM.setColorAt(i, node.baseColor);
      if (bushIM.instanceColor) bushIM.instanceColor.needsUpdate = true;
      this.nodes.push(node);
    });

    // grass + ferns
    const tuftGeo = buildTuft(rng);
    const grassCount = 2750;
    const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    const grassIM = new THREE.InstancedMesh(tuftGeo, grassMat, grassCount);
    grassIM.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    grassIM.receiveShadow = false;
    grassIM.castShadow = false;
    grassIM.frustumCulled = false;
    let gi = 0;
    for (let i = 0; i < 9000 && gi < 2100; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 162;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.6 || h > 19 || terrainSlope(x, z) > 0.9) continue;
      this.dummy.position.set(x, h - 0.03, z);
      this.dummy.rotation.set(0, rng() * 6.28, 0);
      const s = 0.6 + rng() * 0.65;
      this.dummy.scale.set(s, s * (0.8 + rng() * 0.6), s);
      this.dummy.updateMatrix();
      grassIM.setMatrixAt(gi, this.dummy.matrix);
      const tint = 0.82 + rng() * 0.35;
      this.tmpColor.setRGB(tint * 0.95, tint, tint * 0.9);
      grassIM.setColorAt(gi, this.tmpColor);
      gi++;
    }
    // dense meadow right around the landing beach
    for (let i = 0; i < 2200 && gi < grassCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = 2.6 + Math.sqrt(rng()) * 24;
      const x = spawn.x + Math.cos(a) * d;
      const z = spawn.z + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (h < 1.55 || h > 18 || terrainSlope(x, z) > 0.85) continue;
      this.dummy.position.set(x, h - 0.03, z);
      this.dummy.rotation.set(0, rng() * 6.28, 0);
      const s = 0.62 + rng() * 0.7;
      this.dummy.scale.set(s, s * (0.85 + rng() * 0.65), s);
      this.dummy.updateMatrix();
      grassIM.setMatrixAt(gi, this.dummy.matrix);
      const tint = 0.84 + rng() * 0.3;
      this.tmpColor.setRGB(tint * 0.96, tint, tint * 0.88);
      grassIM.setColorAt(gi, this.tmpColor);
      gi++;
    }
    grassIM.count = gi;
    if (grassIM.instanceColor) grassIM.instanceColor.needsUpdate = true;
    this.scene.add(grassIM);
    this.grassIM = grassIM;

    // wildflowers around the landing meadow
    const flowerGeo = buildFlower(rng);
    const flowerMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, side: THREE.DoubleSide,
    });
    const flowerCount = 170;
    const flowerIM = new THREE.InstancedMesh(flowerGeo, flowerMat, flowerCount);
    flowerIM.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    flowerIM.castShadow = false;
    flowerIM.receiveShadow = false;
    flowerIM.frustumCulled = false;
    const petals = [0xffd75e, 0xfff1c4, 0xe08bd8, 0xff8f63, 0xb7e36a];
    let fi = 0;
    for (let i = 0; i < 1200 && fi < flowerCount; i++) {
      const a = rng() * Math.PI * 2;
      const d = 3 + Math.sqrt(rng()) * 28;
      const x = spawn.x + Math.cos(a) * d;
      const z = spawn.z + Math.sin(a) * d;
      const h = terrainHeight(x, z);
      if (h < 1.65 || h > 18 || terrainSlope(x, z) > 0.8) continue;
      this.dummy.position.set(x, h - 0.01, z);
      this.dummy.rotation.set(0, rng() * 6.28, 0);
      const s = 0.8 + rng() * 0.6;
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      flowerIM.setMatrixAt(fi, this.dummy.matrix);
      this.tmpColor.set(pick(rng, petals));
      flowerIM.setColorAt(fi, this.tmpColor);
      fi++;
    }
    flowerIM.count = fi;
    if (flowerIM.instanceColor) flowerIM.instanceColor.needsUpdate = true;
    this.scene.add(flowerIM);
  }

  applyNodeMatrix(node, factor = 1) {
    this.dummy.position.set(node.x, node.y, node.z);
    this.dummy.rotation.set(0, node.baseRot, 0);
    this.dummy.scale.setScalar(Math.max(0.0001, node.scale * factor));
    this.dummy.updateMatrix();
    for (const m of node.meshes) {
      m.im.setMatrixAt(m.index, this.dummy.matrix);
      m.im.instanceMatrix.needsUpdate = true;
    }
  }

  damageNode(node, amount) {
    if (!node.alive) return false;
    node.hp -= amount;
    this.flashNode(node);
    if (node.hp <= 0) {
      node.alive = false;
      node.respawnAt = this.time + (node.kind === 'bush' ? 75 : 120);
      this.applyNodeMatrix(node, 0.0001);
      for (const m of node.meshes) {
        m.im.setColorAt(m.index, node.baseColor);
        if (m.im.instanceColor) m.im.instanceColor.needsUpdate = true;
      }
      return true;
    }
    return false;
  }

  flashNode(node) {
    for (const m of node.meshes) {
      const c = this.tmpColor.copy(node.baseColor).multiplyScalar(1.7);
      m.im.setColorAt(m.index, c);
      if (m.im.instanceColor) m.im.instanceColor.needsUpdate = true;
    }
    clearTimeout(node._flashTimer);
    node._flashTimer = setTimeout(() => {
      for (const m of node.meshes) {
        m.im.setColorAt(m.index, node.baseColor);
        if (m.im.instanceColor) m.im.instanceColor.needsUpdate = true;
      }
    }, 110);
  }

  /* ------------------------ clouds / ambience ------------------------ */
  buildClouds() {
    this.clouds = [];
    const rng = mulberry32(707);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.9,
      emissive: 0xaebfca, emissiveIntensity: 0.5, depthWrite: false, fog: true,
    });
    this.cloudMat = mat;
    for (let i = 0; i < 13; i++) {
      const g = new THREE.Group();
      const puffs = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < puffs; j++) {
        const geo = new THREE.IcosahedronGeometry(1, 1);
        const m = new THREE.Mesh(geo, mat);
        m.position.set((rng() - 0.5) * 16, (rng() - 0.5) * 2.4, (rng() - 0.5) * 9);
        m.scale.set(4 + rng() * 6, 1.6 + rng() * 1.6, 3 + rng() * 3.5);
        g.add(m);
      }
      const a = rng() * Math.PI * 2;
      const r = 40 + rng() * 220;
      g.position.set(Math.cos(a) * r, 52 + rng() * 34, Math.sin(a) * r);
      g.rotation.y = rng() * 6;
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  buildFireflies() {
    const rng = mulberry32(99);
    const pos = [];
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = 20 + rng() * 130;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h < 1.5) continue;
      pos.push(x, h + 0.7 + rng() * 2.2, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.fireflyMat = new THREE.PointsMaterial({
      map: glowTexture(), color: 0xffe2a0, size: 1.2, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, this.fireflyMat);
    this.scene.add(this.fireflies);
  }

  buildDistantIsles() {
    const rng = mulberry32(222);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5f864b, roughness: 1, flatShading: true,
      emissive: 0x1d2c17, emissiveIntensity: 0.5,
    });
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xc2ad7f, roughness: 1, flatShading: true });
    const positions = [[285, -140, 26], [320, 90, 34], [-300, 170, 22]];
    for (const [x, z, s] of positions) {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      rock.scale.set(s, s * 0.27, s * 0.7);
      rock.position.y = 1;
      const beach = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), sandMat);
      beach.scale.set(s * 1.18, s * 0.07, s * 0.86);
      beach.position.y = -0.5;
      g.add(beach, rock);
      // jungle silhouette
      for (let i = 0; i < 6; i++) {
        const rr = 2 + rng() * 2.6;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), mat);
        crown.position.set(
          (rng() - 0.5) * s * 0.8,
          s * 0.26 + rr * 0.6 + rng() * 2,
          (rng() - 0.5) * s * 0.45,
        );
        g.add(crown);
      }
      const peak = new THREE.Mesh(new THREE.ConeGeometry(3.8, 9, 6), mat);
      peak.position.set((rng() - 0.5) * s * 0.3, s * 0.26 + 4.5, 0);
      g.add(peak);
      g.position.set(x, -1, z);
      this.scene.add(g);
    }
  }

  /* ------------------------ environment ------------------------ */
  updateEnvironment(dayTime, playerPos) {
    const a = (dayTime - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.9, Math.sin(a), 0.38).normalize();
    const elev = this.sunDir.y;
    const dayFactor = smoothstep(-0.12, 0.24, elev);
    const night = 1 - smoothstep(-0.16, 0.06, elev);
    this.night = night;

    const topDay = new THREE.Color(0x3c7cb7);
    const topNight = new THREE.Color(0x050b18);
    const horDay = new THREE.Color(0xd8ecea);
    const horNight = new THREE.Color(0x0e1c2b);
    const dusk = new THREE.Color(0xee9250);

    const top = topNight.clone().lerp(topDay, dayFactor);
    const hor = horNight.clone().lerp(horDay, dayFactor);
    const duskAmt = clamp(1 - Math.abs(elev) / 0.28, 0, 1) * (elev > -0.28 ? 1 : 0);
    hor.lerp(dusk, duskAmt * 0.7);
    top.lerp(dusk, duskAmt * 0.14);

    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(hor);
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.skyUniforms.uSunColor.value.copy(this.sunColorWarm).lerp(this.sunColorDay, smoothstep(0, 0.5, elev));
    this.skyUniforms.uNight.value = night;

    this.waterUniforms.uSkyTop.value.copy(top);
    this.waterUniforms.uSkyHorizon.value.copy(hor);
    this.waterUniforms.uSunDir.value.copy(this.sunDir);
    this.waterUniforms.uSunColor.value.copy(this.sunColorWarm).lerp(this.sunColorDay, smoothstep(0, 0.5, elev));
    this.waterUniforms.uNight.value = night;

    this.scene.fog.color.copy(hor).multiplyScalar(0.92);
    this.scene.fog.density = this.baseFog + night * 0.0007;
    this.waterUniforms.uFogColor.value.copy(this.scene.fog.color);
    this.waterUniforms.uFogDensity.value = this.scene.fog.density;

    this.hemi.color.copy(top);
    this.hemi.groundColor.set(0x5c5433);
    this.hemi.intensity = 0.28 + dayFactor * 0.78;

    const sunColor = this.sunColorWarm.clone().lerp(this.sunColorDay, smoothstep(0.05, 0.55, elev));
    this.sun.color.copy(sunColor);
    this.sun.intensity = smoothstep(-0.03, 0.2, elev) * 3.2;
    const sunPos = (playerPos || new THREE.Vector3()).clone().addScaledVector(this.sunDir, 160);
    this.sun.position.copy(sunPos);
    this.sunTarget.position.copy(playerPos || new THREE.Vector3());
    this.sunTarget.updateMatrixWorld();

    this.moon.position.copy((playerPos || new THREE.Vector3()).clone().addScaledVector(this.sunDir, -160));
    this.moonTarget.position.copy(playerPos || new THREE.Vector3());
    this.moonTarget.updateMatrixWorld();
    this.moon.intensity = night * 0.55;

    const fp = playerPos || new THREE.Vector3();
    this.fill.position.set(fp.x - this.sunDir.x * 80, fp.y + 55, fp.z - this.sunDir.z * 80);
    this.fillTarget.position.copy(fp);
    this.fillTarget.updateMatrixWorld();
    this.fill.intensity = 0.14 + dayFactor * 0.56;

    this.starMat.opacity = night;
    this.stars.rotation.y = dayTime * Math.PI * 2 * 0.05;
    this.fireflyMat.opacity = night * 0.85;

    this.cloudMat.color.copy(new THREE.Color(0xffffff)).lerp(new THREE.Color(0x33445c), night * 0.8);
    this.cloudMat.opacity = 0.82 - night * 0.35;
    this.foamUniforms.uLight.value = 0.28 + dayFactor * 0.72;
  }

  update(dt) {
    this.time += dt;
    this.waterUniforms.uTime.value = this.time;
    this.foamUniforms.uTime.value = this.time;
    this.fireflies.rotation.y += dt * 0.01;
    for (const c of this.clouds) {
      c.position.x += dt * 0.55;
      if (c.position.x > 260) c.position.x = -260;
    }
    for (const node of this.nodes) {
      if (!node.alive && node.respawnAt > 0 && this.time >= node.respawnAt) {
        node.alive = true;
        node.hp = node.maxHp;
        node.respawnAt = 0;
        this.applyNodeMatrix(node, 1);
      }
    }
  }

  randomLandPoint(rng, minH = 1.4, maxH = 18, maxR = 156) {
    for (let i = 0; i < 120; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * maxR;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = terrainHeight(x, z);
      if (h >= minH && h <= maxH && terrainSlope(x, z) < 0.8) return new THREE.Vector3(x, h, z);
    }
    return this.spawnPoint.clone();
  }

  nearestNode(pos, maxDist = 3.6) {
    let best = null, bestD = maxDist * maxDist;
    for (const n of this.nodes) {
      if (!n.alive) continue;
      const dx = n.x - pos.x, dz = n.z - pos.z;
      const d = dx * dx + dz * dz;
      const reach = maxDist + n.radius * 0.45;
      if (d < reach * reach && d < bestD) { bestD = d; best = n; }
    }
    return best;
  }
}

/* ------------------------------------------------------------------ */
/* Reusable particle burst pool                                        */
/* ------------------------------------------------------------------ */
export class Particles {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.IcosahedronGeometry(0.09, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false, transparent: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, 120);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 120;
    this.scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < 120; i++) {
      this.items.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, color: new THREE.Color() });
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.dummy = new THREE.Object3D();
    this.cursor = 0;
  }

  burst(pos, colorHex, count = 7, power = 3) {
    const c = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.items.length;
      p.life = 0.55 + Math.random() * 0.45;
      p.maxLife = p.life;
      p.pos.copy(pos);
      p.pos.x += (Math.random() - 0.5) * 0.6;
      p.pos.y += (Math.random() - 0.3) * 0.5;
      p.pos.z += (Math.random() - 0.5) * 0.6;
      p.vel.set((Math.random() - 0.5) * power, Math.random() * power + 1, (Math.random() - 0.5) * power);
      p.size = 0.5 + Math.random() * 1.1;
      p.color.copy(c).multiplyScalar(0.8 + Math.random() * 0.5);
      this.mesh.setColorAt(this.items.indexOf(p), p.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let visible = 0;
    for (let i = 0; i < this.items.length; i++) {
      const p = this.items[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 9.8 * dt;
        p.pos.addScaledVector(p.vel, dt);
        const s = Math.max(0.0001, p.size * Math.min(1, p.life / 0.25));
        this.dummy.position.copy(p.pos);
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        visible++;
      } else {
        this.dummy.position.set(0, -1000, 0);
        this.dummy.scale.setScalar(0.0001);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
