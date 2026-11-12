import * as THREE from 'three';
import { World, Particles, terrainHeight, terrainSlope, WATER_LEVEL } from './world.js';
import { Dino, SPECIES } from './dinos.js';
import { Player } from './player.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { ITEMS, RECIPES, HOTBAR } from './items.js';
import { clamp, smoothstep, damp, mulberry32, rand, formatTime } from './utils.js';

const SAVE_KEY = 'ark-primal-isle-save-v1';
const DAY_LENGTH = 480; // seconds
const YIELDS = {
  tree: {
    hand: { wood: 1, thatch: 2 },
    pick: { thatch: 5, wood: 1 },
    hatchet: { wood: 5, thatch: 1 },
    spear: { wood: 2, thatch: 2 },
  },
  rock: {
    hand: { stone: 1 },
    pick: { stone: 4, flint: 2 },
    hatchet: { stone: 3, flint: 1 },
    spear: { stone: 2, flint: 1 },
  },
  bush: {
    hand: { fiber: 2, berry: 1 },
    pick: { fiber: 4, berry: 1 },
    hatchet: { fiber: 3, berry: 1 },
    spear: { fiber: 3, berry: 1 },
  },
};
const RESOURCE_XP = { tree: 3, rock: 3, bush: 2 };

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.clock = new THREE.Clock();
    this.audio = new AudioEngine();

    this.state = 'menu';
    this.uiOverlay = false;
    this.started = false;

    this.world = new World(this.scene);
    this.particles = new Particles(this.scene);
    this.spawnPoint = this.world.spawnPoint.clone();
    this.player = new Player(this.scene);
    this.player.group.position.copy(this.spawnPoint);
    this.player.group.visible = false;

    this.dinos = [];
    this.structures = [];
    this.rng = mulberry32(55192);

    this.initState();
    this.spawnInitialDinos();

    this.camera.position.set(0, 70, 175);
    this.camera.lookAt(0, 6, 0);

    this.ui = new UI(this);

    this.menuAngle = 0.5;
    this.menuTime = 0;
    this.yaw = this.initialYaw();
    this.pitch = 0.21;
    this.camDist = 5.9;
    this.camTarget = new THREE.Vector3(this.spawnPoint.x, this.spawnPoint.y + 1.5, this.spawnPoint.z);
    this.introTime = 0;
    this.joy = { active: false, pointerId: null, x: 0, y: 0, baseX: 0, baseY: 0, radius: 50 };
    this.look = { active: false, pointerId: null, lastX: 0, lastY: 0, startTime: 0, moved: 0 };
    this.keys = {};
    this.attackHeld = false;
    this.attackCooldown = 0;
    this.pendingHit = -1;
    this.targetDino = null;
    this.targetTimer = 0;
    this.currentInteractable = null;
    this.promptTimer = 0;
    this.hudTimer = 0;
    this.questTimer = 0;
    this.saveTimer = 0;
    this.clockTimer = 0;
    this.airY = 0;
    this.velY = 0;
    this.invuln = 0;
    this.shake = 0;
    this.footstepTimer = 0;
    this.nightSpawnTimer = 20;
    this.respawnTimer = 45;
    this.nightSeen = false;
    this.isNight = false;
    this.mountedDino = null;
    this.elapsed = 0;
    this.attackBtnHeld = false;

    this.bindEvents();

    this.player.setTool('hand');
    this.world.updateEnvironment(this.dayTime, this.spawnPoint);
    this.world.update(0);

    setTimeout(() => {
      const load = document.getElementById('loading');
      load.classList.add('gone');
      setTimeout(() => load.classList.add('hidden'), 320);
    }, 60);

    this.loop();
  }

  /* ============================================================ */
  /* state                                                        */
  /* ============================================================ */
  initState() {
    this.inventory = {};
    this.equipped = 'hand';
    this.stats = {
      hp: 100, hpMax: 100, stamina: 100, staminaMax: 100,
      food: 100, foodMax: 100, water: 100, waterMax: 100,
      weightMax: 100, level: 1, xp: 0, xpNext: 100,
    };
    this.collected = { wood: 0, stone: 0, thatch: 0, fiber: 0, flint: 0, berry: 0, rawMeat: 0, hide: 0 };
    this.crafted = {};
    this.deaths = 0;
    this.tamedCount = 0;
    this.cookedCount = 0;
    this.survivedNight = false;
    this.dayTime = 0.345;
    this.day = 1;
    this.loadedSave = false;
    this.quests = [
      {
        id: 'wood', title: 'Recolecta 10 de madera', hint: 'Golpea árboles con ⚔ o con tu pico.',
        xp: 30, done: false, check: (g) => (g.collected.wood || 0) >= 10,
      },
      {
        id: 'pick', title: 'Fabrica un pico de piedra', hint: '1 madera · 1 piedra · 8 paja. Abre INV.',
        xp: 40, done: false, check: (g) => !!g.crafted.pick,
      },
      {
        id: 'stone', title: 'Recolecta 15 de piedra', hint: 'El pico arranca más piedra y pedernal.',
        xp: 40, done: false, check: (g) => (g.collected.stone || 0) >= 15,
      },
      {
        id: 'spear', title: 'Fabrica una lanza', hint: '2 madera · 1 pedernal · 6 fibra.',
        xp: 50, done: false, check: (g) => !!g.crafted.spear,
      },
      {
        id: 'campfire', title: 'Construye una hoguera', hint: '10 piedra · 2 madera · 1 pedernal.',
        xp: 60, done: false, check: (g) => g.structures.length > 0,
      },
      {
        id: 'cook', title: 'Cocina carne en la hoguera', hint: 'Consigue carne de un dodo y usa ✋ junto al fuego.',
        xp: 45, done: false, check: (g) => g.cookedCount > 0,
      },
      {
        id: 'tame', title: 'Domestica un dodo', hint: 'Aliméntalo con bayas usando ✋ sin asustarlo.',
        xp: 80, done: false, check: (g) => g.dinos.some((d) => d.tamed && d.species === 'dodo'),
      },
      {
        id: 'night', title: 'Sobrevive a la noche', hint: 'Enciende una hoguera y espera al amanecer.',
        xp: 120, done: false, check: (g) => g.survivedNight,
      },
    ];
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
  }

  actionAllowed() {
    return this.state === 'playing' || (this.state === 'paused' && this.uiOverlay);
  }

  roar(dino) {
    this.audio.roar(dino);
  }

  initialYaw() {
    const a = Math.atan2(this.spawnPoint.x, this.spawnPoint.z);
    return a + Math.PI + 0.38;
  }

  /* ============================================================ */
  /* dinos                                                        */
  /* ============================================================ */
  spawnInitialDinos() {
    const rng = mulberry32(88213);
    const spawn = this.spawnPoint;

    const nearPoint = (minD, maxD) => {
      for (let i = 0; i < 80; i++) {
        const a = rng() * Math.PI * 2;
        const d = minD + rng() * (maxD - minD);
        const x = spawn.x + Math.cos(a) * d;
        const z = spawn.z + Math.sin(a) * d;
        const h = terrainHeight(x, z);
        if (h > 1.35 && h < 20 && terrainSlope(x, z) < 0.75) {
          return new THREE.Vector3(x, h, z);
        }
      }
      return this.world.randomLandPoint(rng, 1.5, 15);
    };

    const place = (species, minD, maxD, count) => {
      for (let i = 0; i < count; i++) {
        const p = nearPoint(minD, maxD);
        this.addDino(species, p, rng);
      }
    };

    place('dodo', 9, 22, 2);
    place('dodo', 35, 85, 2);

    // a pair of dodos framed by the opening shot so the first seconds read as a living island
    const vy = this.initialYaw();
    const fwd = new THREE.Vector3(-Math.sin(vy), 0, -Math.cos(vy));
    const side = new THREE.Vector3(Math.cos(vy), 0, -Math.sin(vy));
    for (const [df, ds] of [[7.5, 2.4], [10.5, -3.4]]) {
      const x = spawn.x + fwd.x * df + side.x * ds;
      const z = spawn.z + fwd.z * df + side.z * ds;
      const h = terrainHeight(x, z);
      if (h > 0.9 && h < 12) this.addDino('dodo', new THREE.Vector3(x, h, z), rng);
    }
    place('parasaur', 22, 55, 3);
    place('trike', 65, 115, 2);
    place('raptor', 95, 150, 4);
    place('bronto', 60, 120, 1);
    for (let i = 0; i < 3; i++) {
      const p = nearPoint(40, 120);
      p.y = terrainHeight(p.x, p.z);
      this.addDino('ptera', p, rng);
    }
  }

  addDino(species, pos, rng = Math.random, opts = {}) {
    const dino = new Dino(species, pos, this.world, rng, opts);
    this.scene.add(dino.group);
    this.dinos.push(dino);
    return dino;
  }

  findWild(species) { return this.dinos.filter((d) => d.species === species && !d.dead); }

  spawnAtNight() {
    if (!this.isNight) return;
    const raptors = this.findWild('raptor');
    if (raptors.length >= 6) return;
    for (let i = 0; i < 2; i++) {
      for (let t = 0; t < 30; t++) {
        const a = Math.random() * Math.PI * 2;
        const d = 42 + Math.random() * 30;
        const x = this.player.pos.x + Math.cos(a) * d;
        const z = this.player.pos.z + Math.sin(a) * d;
        const h = terrainHeight(x, z);
        if (h > 1.4 && terrainSlope(x, z) < 0.7 && !this.isSafeFromFire(new THREE.Vector3(x, h, z))) {
          this.addDino('raptor', new THREE.Vector3(x, h, z), Math.random);
          break;
        }
      }
    }
    if (!this._nightWarned) {
      this._nightWarned = true;
      this.ui.toast('<b>La noche cae.</b> Los raptores te acechan. Enciende una hoguera.', 'bad');
      this.audio.roar({ species: 'raptor' });
    }
  }

  maintainWildlife() {
    const spawn = this.spawnPoint;
    const targets = { dodo: 5, parasaur: 3, trike: 2, bronto: 1 };
    for (const species in targets) {
      if (this.findWild(species).length >= targets[species]) continue;
      for (let t = 0; t < 30; t++) {
        const a = Math.random() * Math.PI * 2;
        const d = 45 + Math.random() * 90;
        const x = spawn.x + Math.cos(a) * d;
        const z = spawn.z + Math.sin(a) * d;
        const h = terrainHeight(x, z);
        if (h > 1.5 && h < 18 && terrainSlope(x, z) < 0.7 && Math.hypot(x - this.player.pos.x, z - this.player.pos.z) > 35) {
          this.addDino(species, new THREE.Vector3(x, h, z), Math.random);
          break;
        }
      }
    }
  }

  /* ============================================================ */
  /* lifecycle                                                    */
  /* ============================================================ */
  start() {
    if (this.started) return;
    this.started = true;
    this.audio.init();
    this.audio.resume();
    this.ui.startGameUI();
    this.ui.closePanels();
    this.state = 'playing';

    if (this.hasSave()) {
      this.loadGame();
    } else {
      this.resetNewPlayer();
    }

    this.player.group.visible = true;
    this.player.setRiding(false);
    this.player.group.position.copy(this.player.pos);
    this.player.group.rotation.y = this.yaw + Math.PI;
    if (this.loadedSave) this.yaw = Math.atan2(this.player.pos.x, this.player.pos.z) + Math.PI + 0.38;
    this.equipVisual();
    this.ui.renderHotbar();
    this.ui.updateStats(this.statsView());
    this.ui.setQuest(this.quests.find((q) => !q.done));
    this.ui.setPrompt(null);
    this.introTime = 1.1;
    this.attackHeld = false;
    this.invuln = 2;
    this.ui.toast('<b>Has despertado en la playa.</b> Golpea árboles y rocas para sobrevivir.', 'good');
    setTimeout(() => {
      if (this.state === 'playing') this.ui.toast('Objetivo: recolecta <b>10 de madera</b> y fabrica un pico.', '');
    }, 3400);
  }

  resetNewPlayer() {
    this.player.pos.copy(this.spawnPoint);
    this.player.pos.y = Math.max(terrainHeight(this.spawnPoint.x, this.spawnPoint.z), 0.4);
    this.stats.hp = this.stats.hpMax;
    this.stats.stamina = this.stats.staminaMax;
    this.stats.food = 100;
    this.stats.water = 100;
    this.airY = 0;
    this.velY = 0;
    this.yaw = this.initialYaw();
    this.pitch = 0.21;
    this.camTarget.set(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z);
  }

  respawn() {
    this.state = 'playing';
    this.ui.hideDeath();
    this.dismount(false);
    this.player.pos.copy(this.spawnPoint);
    this.player.pos.y = Math.max(terrainHeight(this.spawnPoint.x, this.spawnPoint.z), 0.4);
    this.player.group.visible = true;
    this.player.setRiding(false);
    this.stats.hp = this.stats.hpMax;
    this.stats.stamina = this.stats.staminaMax;
    this.stats.food = Math.max(55, this.stats.food);
    this.stats.water = Math.max(55, this.stats.water);
    this.airY = 0;
    this.velY = 0;
    this.invuln = 3;
    this.yaw = this.initialYaw();
    this.pitch = 0.21;
    this.camTarget.set(this.player.pos.x, this.player.pos.y + 1.4, this.player.pos.z);
    this.introTime = 1.1;
    this.ui.toast('Has despertado en la playa. Tu mochila sigue intacta.', 'good');
    this.save();
  }

  die(cause) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deaths++;
    this.attackHeld = false;
    this.joy.active = false;
    this.joy.x = 0;
    this.joy.y = 0;
    this.audio.death();
    const msg = cause ? `Te mató ${cause}.` : 'La isla ha reclamado tu vida.';
    this.ui.showDeath(msg);
    this.dismount(false);
  }

  newGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    window.location.reload();
  }

  /* ============================================================ */
  /* stats / inventory                                            */
  /* ============================================================ */
  weight() {
    let w = 0;
    for (const id in this.inventory) {
      const def = ITEMS[id];
      if (def) w += def.weight * this.inventory[id];
    }
    return Math.round(w * 10) / 10;
  }

  statsView() {
    return { ...this.stats, weight: this.weight() };
  }

  addItem(id, qty) {
    if (!ITEMS[id]) return;
    const n = Math.max(0, Math.round(qty));
    if (!n) return;
    this.inventory[id] = (this.inventory[id] || 0) + n;
    if (id in this.collected) this.collected[id] += n;
    this.invChanged();
  }

  removeItem(id, qty = 1) {
    if (!this.inventory[id]) return false;
    this.inventory[id] -= qty;
    if (this.inventory[id] <= 0) delete this.inventory[id];
    this.invChanged();
    return true;
  }

  count(id) { return this.inventory[id] || 0; }

  invChanged() {
    this.ui.refreshInventory();
    if (this.ui && !this.ui.invPanel.classList.contains('hidden')) this.ui.renderInventory();
  }

  addXP(amount) {
    this.stats.xp += amount;
    while (this.stats.xp >= this.stats.xpNext) {
      this.stats.xp -= this.stats.xpNext;
      this.stats.level++;
      this.stats.xpNext = Math.floor(this.stats.xpNext * 1.45 + 45);
      this.stats.hpMax += 10;
      this.stats.staminaMax += 5;
      this.stats.weightMax += 5;
      this.stats.hp = Math.min(this.stats.hpMax, this.stats.hp + 35);
      this.audio.level();
      this.ui.levelUp(this.stats.level);
      this.ui.toast(`<b>¡Nivel ${this.stats.level}!</b> +10 vida · +5 aguante · +5 peso`, 'good');
      this.checkQuests();
    }
  }

  canCraft(recipe) {
    if (this.stats.level < recipe.level) return false;
    for (const id in recipe.needs) if (this.count(id) < recipe.needs[id]) return false;
    return true;
  }

  craft(id) {
    if (!this.actionAllowed()) return;
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    if (!this.canCraft(recipe)) {
      this.ui.toast(this.stats.level < recipe.level ? `Necesitas nivel ${recipe.level}.` : 'Faltan materiales.', 'bad');
      return;
    }
    if (recipe.structure) {
      const fwd = this.forward();
      const x = this.player.pos.x + fwd.x * 3.4;
      const z = this.player.pos.z + fwd.z * 3.4;
      const h = terrainHeight(x, z);
      if (h < 0.35 || terrainSlope(x, z) > 0.8) {
        this.ui.toast('No puedes construir aquí. Busca terreno firme.', 'bad');
        return;
      }
      if (this.structures.some((f) => Math.hypot(f.x - x, f.z - z) < 2)) {
        this.ui.toast('Ya hay una hoguera demasiado cerca.', 'bad');
        return;
      }
      for (const nid in recipe.needs) this.removeItem(nid, recipe.needs[nid]);
      this.createCampfire(x, z, 120);
      this.audio.place();
      this.ui.toast('<b>Hoguera construida.</b> Acércate y pulsa ✋ para cocinar.', 'good');
    } else {
      for (const nid in recipe.needs) this.removeItem(nid, recipe.needs[nid]);
      this.inventory[recipe.out] = (this.inventory[recipe.out] || 0) + 1;
      this.crafted[recipe.out] = true;
      this.audio.craft();
      this.ui.toast(`Has fabricado <b>${ITEMS[recipe.out].name}</b>.`, 'good');
      this.ui.float(`+ ${ITEMS[recipe.out].name}`, this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'heal');
    }
    this.addXP(recipe.xp);
    this.invChanged();
    this.checkQuests();
    this.save();
  }

  useItem(id) {
    if (!this.actionAllowed()) return;
    const def = ITEMS[id];
    if (!def || !this.count(id)) return;
    if (def.tool) { this.equip(id); return; }
    if (id === 'cookedMeat') {
      this.stats.food = Math.min(this.stats.foodMax, this.stats.food + def.food);
      this.stats.water = Math.max(0, this.stats.water + (def.water || 0));
      this.stats.hp = Math.min(this.stats.hpMax, this.stats.hp + 5);
      this.eatEffect('🍗 Comida restaurada');
    } else if (id === 'berry') {
      this.stats.food = Math.min(this.stats.foodMax, this.stats.food + def.food);
      this.stats.water = Math.min(this.stats.waterMax, this.stats.water + def.water);
      this.eatEffect('🫐 +Comida +Agua');
    } else if (id === 'rawMeat') {
      this.stats.food = Math.min(this.stats.foodMax, this.stats.food + def.food);
      this.stats.hp = Math.max(1, this.stats.hp - 2);
      this.eatEffect('🥩 Comida (cruda)');
    } else if (id === 'brew') {
      this.stats.hp = Math.min(this.stats.hpMax, this.stats.hp + def.heal);
      this.audio.tone(660, 0.3, { gain: 0.05, slide: 120 });
      this.ui.float('+55 Vida', this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'heal');
    } else {
      this.ui.toast('Ese objeto no se puede consumir.', 'bad');
      return;
    }
    this.removeItem(id, 1);
    this.audio.eat();
    this.ui.refreshInventory();
    this.save();
  }

  eatEffect(text) {
    this.audio.eat();
    this.ui.float(text, this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'heal');
  }

  equip(id) {
    if (id === 'hand') {
      this.equipped = 'hand';
    } else if (ITEMS[id] && ITEMS[id].tool && this.count(id) > 0) {
      this.equipped = id;
    } else if (ITEMS[id] && ITEMS[id].food && this.count(id) > 0) {
      this.hotbarAction(id);
      return;
    } else {
      this.ui.toast('No tienes ese objeto equipable.', 'bad');
      return;
    }
    this.equipVisual();
    this.ui.renderHotbar();
    this.audio.click();
  }

  equipVisual() {
    const map = { pick: 'pick', hatchet: 'hatchet', spear: 'spear' };
    this.player.setTool(map[this.equipped] || 'hand');
  }

  hotbarAction(id) {
    if (!this.actionAllowed()) return;
    const def = ITEMS[id];
    if (!def) return;
    if (id === 'hand') { this.equip('hand'); return; }
    if (def.tool) {
      if (this.count(id) > 0) this.equip(id);
      else this.ui.toast(`No tienes ${def.name}. Fabrícalo en INV.`, 'bad');
      return;
    }
    if (def.food || def.heal) this.useItem(id);
  }

  /* ============================================================ */
  /* interactions                                                 */
  /* ============================================================ */
  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  nearWater() {
    if (this.mountedDino) return false;
    if (this.player.pos.y < 0.5) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (terrainHeight(this.player.pos.x + Math.cos(a) * 3.4, this.player.pos.z + Math.sin(a) * 3.4) < 0.05) return true;
    }
    return false;
  }

  getInteractable() {
    if (this.state !== 'playing') return null;
    const p = this.mountedDino ? this.mountedDino.position : this.player.pos;
    const list = [];
    if (this.mountedDino) {
      list.push({ type: 'dismount', d: 0, label: 'Desmontar', icon: '🐎', key: this.keyHint() });
    }
    for (const f of this.structures) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < 3.8) {
        const canCook = this.count('rawMeat') > 0 && this.count('wood') > 0;
        const canFuel = this.count('wood') > 0;
        const burning = f.fuel > 0;
        list.push({
          type: 'fire', target: f, d,
          label: canCook
            ? 'Cocinar carne · añadir leña'
            : canFuel
              ? (burning ? 'Hoguera encendida · añadir leña' : 'Hoguera apagada · añadir leña')
              : (burning ? 'Hoguera encendida · necesitas leña' : 'Hoguera apagada · necesitas leña'),
          icon: '🔥',
          key: this.keyHint(),
        });
      }
    }
    for (const dino of this.dinos) {
      if (dino === this.mountedDino) continue;
      const d = dino.position.distanceTo(p);
      if (dino.dead) {
        if (d < 4 && dino.harvestLeft > 0) {
          list.push({ type: 'harvestCarcass', target: dino, d, label: `Recolectar ${dino.def.name}`, icon: '🥩', key: this.keyHint() });
        }
        continue;
      }
      if (dino.tamed) {
        if (d < 4.8) {
          if (dino.def.rideable) {
            if (this.count('saddle') > 0) list.push({ type: 'mount', target: dino, d, label: `Montar ${dino.def.name}`, icon: '🐎', key: this.keyHint() });
            else list.push({ type: 'needsSaddle', target: dino, d, label: 'Necesita una silla de montar', icon: '🐎', key: this.keyHint() });
          } else {
            list.push({ type: 'pet', target: dino, d, label: `Acariciar a ${dino.def.name}`, icon: '💚', key: this.keyHint() });
          }
        }
      } else if (dino.def.tameable && d < 4) {
        const has = this.count('berry') > 0;
        list.push({
          type: 'feed', target: dino, d,
          label: has ? `Alimentar con bayas · ${dino.tameProgress}/${dino.def.feeds}` : `Necesitas bayas · ${dino.tameProgress}/${dino.def.feeds}`,
          icon: '🫐', key: this.keyHint(),
        });
      }
    }
    if (!this.mountedDino && this.nearWater()) {
      list.push({ type: 'water', d: 6, label: 'Beber agua', icon: '💧', key: this.keyHint() });
    }
    list.sort((a, b) => a.d - b.d);
    return list[0] || null;
  }

  keyHint() {
    return window.matchMedia && window.matchMedia('(pointer: fine)').matches ? 'E' : '✋';
  }

  interact() {
    if (this.state !== 'playing' || this.uiOverlay) return;
    const ent = this.getInteractable();
    if (!ent) return;
    switch (ent.type) {
      case 'dismount': this.dismount(); break;
      case 'fire': this.useCampfire(ent.target); break;
      case 'mount': this.mountDino(ent.target); break;
      case 'needsSaddle': this.ui.toast('Necesitas una <b>silla de montar</b>: nivel 3 · 10 piel · 15 fibra.', 'bad'); break;
      case 'pet': {
        this.audio.tame();
        this.particles.burst(ent.target.position.clone().add(new THREE.Vector3(0, 1.5, 0)), 0x8bf0c6, 8, 2);
        this.ui.float('💚', ent.target.position.clone().add(new THREE.Vector3(0, 2, 0)), 'heal');
        break;
      }
      case 'feed': this.feedDino(ent.target); break;
      case 'harvestCarcass': this.harvestCarcass(ent.target); break;
      case 'water': this.drink(); break;
      default: break;
    }
  }

  feedDino(dino) {
    if (!this.count('berry')) {
      this.ui.toast('Necesitas bayas. Recógelas de los arbustos.', 'bad');
      return;
    }
    if (dino.tameProgress >= dino.def.feeds) return;
    this.removeItem('berry', 1);
    dino.tameProgress++;
    this.addXP(5);
    this.audio.tame();
    this.particles.burst(dino.position.clone().add(new THREE.Vector3(0, dino.def.height * 0.7, 0)), 0xff7f97, 9, 2.4);
    this.ui.float(`💗 ${dino.tameProgress}/${dino.def.feeds}`, dino.position.clone().add(new THREE.Vector3(0, dino.def.height + 0.4, 0)), 'heal');
    if (dino.tameProgress >= dino.def.feeds) {
      dino.tame();
      this.tamedCount = this.dinos.filter((d) => d.tamed && !d.dead).length;
      this.ui.toast(`<b>¡${dino.def.name} domesticado!</b> Te seguirá por la isla.`, 'good');
      this.audio.tame();
      this.addXP(30);
      this.particles.burst(dino.position.clone().add(new THREE.Vector3(0, dino.def.height * 0.8, 0)), 0x63e2c8, 22, 4);
      this.checkQuests();
      this.save();
    }
  }

  useCampfire(fire) {
    if (this.count('wood') < 1) {
      this.ui.toast('La hoguera necesita <b>madera</b> para arder.', 'bad');
      return;
    }
    this.removeItem('wood', 1);
    fire.fuel = Math.min(180, fire.fuel + 110);
    this.audio.fire();
    if (this.count('rawMeat') > 0) {
      this.removeItem('rawMeat', 1);
      this.cookedCount++;
      this.addItem('cookedMeat', 1);
      this.addXP(5);
      this.ui.float('🍗 +Carne cocinada', fire.position.clone().add(new THREE.Vector3(0, 1.6, 0)), 'heal');
      this.ui.toast('<b>Carne cocinada.</b> Cómela desde la barra rápida.', 'good');
      this.checkQuests();
    } else {
      this.ui.toast('Leña añadida. La hoguera iluminará la noche.', '');
    }
  }

  harvestCarcass(dino) {
    if (dino.harvestLeft <= 0) return;
    dino.harvestLeft--;
    const meat = Math.max(1, Math.round((dino.def.harvest.rawMeat || 2) * 0.55));
    const hide = Math.max(0, Math.round((dino.def.harvest.hide || 1) * 0.55));
    this.addItem('rawMeat', meat);
    if (hide) this.addItem('hide', hide);
    this.addXP(4);
    this.audio.hitFlesh();
    this.particles.burst(dino.position.clone().add(new THREE.Vector3(0, 1, 0)), 0x9c2f26, 9, 3);
    this.ui.float(`+${meat} 🥩${hide ? ` +${hide} 🟫` : ''}`, dino.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
    if (dino.harvestLeft <= 0) {
      this.scene.remove(dino.group);
      this.dinos = this.dinos.filter((d) => d !== dino);
      this.ui.setTarget(null);
    }
  }

  drink() {
    const gain = 45;
    this.stats.water = Math.min(this.stats.waterMax, this.stats.water + gain);
    this.audio.drink();
    this.ui.float(`+${gain} 💧`, this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'heal');
    this.particles.burst(this.player.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x55c4dd, 8, 2);
  }

  mountDino(dino) {
    if (!dino || dino.dead) return;
    if (!this.count('saddle')) {
      this.ui.toast('Necesitas una <b>silla de montar</b>.', 'bad');
      return;
    }
    this.mountedDino = dino;
    dino.mounted = true;
    dino.moving = false;
    this.player.setRiding(true);
    this.player.pos.copy(dino.position);
    this.ui.toast(`Montado en <b>${dino.def.name}</b>. Pulsa ✋ para desmontar.`, 'good');
    this.audio.tame();
  }

  dismount(showToast = true) {
    if (!this.mountedDino) return;
    const dino = this.mountedDino;
    dino.mounted = false;
    this.mountedDino = null;
    this.player.setRiding(false);
    const ox = Math.cos(this.yaw) * 1.8;
    const oz = Math.sin(this.yaw) * 1.8;
    this.player.pos.set(dino.position.x + ox, terrainHeight(dino.position.x + ox, dino.position.z + oz), dino.position.z + oz);
    this.player.group.position.copy(this.player.pos);
    this.player.group.visible = true;
    this.airY = 0;
    this.velY = 0;
    if (showToast) this.ui.toast('Has desmontado.', '');
  }

  /* ============================================================ */
  /* combat / harvesting                                          */
  /* ============================================================ */
  setAttackHeld(on) {
    if (this.state !== 'playing' || this.uiOverlay) return;
    this.attackHeld = on;
    if (on) this.tryAttack();
  }

  tryAttack() {
    if (this.state !== 'playing' || this.uiOverlay) return;
    if (this.attackCooldown > 0) return;
    if (this.stats.stamina < 5) {
      this.ui.toast('Sin aguante. Descansa un momento.', 'bad');
      return;
    }
    this.stats.stamina -= 5;
    this.attackCooldown = 0.52;
    this.pendingHit = 0.12;
    if (!this.mountedDino) this.player.attack();
    this.audio.swing();
  }

  resolveHit() {
    const origin = this.mountedDino ? this.mountedDino.position.clone() : this.player.pos.clone();
    const fwd = this.forward();
    const reach = this.mountedDino ? 4.4 : 3.3;
    const tool = ITEMS[this.equipped] || ITEMS.hand;

    let bestDino = null, bestDinoScore = Infinity;
    for (const dino of this.dinos) {
      if (dino.dead) continue;
      const dx = dino.position.x - origin.x;
      const dz = dino.position.z - origin.z;
      const dist = Math.hypot(dx, dz);
      const range = reach + dino.def.radius * 0.8;
      if (dist > range) continue;
      const dot = (dx / (dist || 1)) * fwd.x + (dz / (dist || 1)) * fwd.z;
      if (dot < -0.15) continue;
      const score = dist - dot * 1.2;
      if (score < bestDinoScore) { bestDinoScore = score; bestDino = dino; }
    }

    let bestNode = null, bestNodeScore = Infinity;
    for (const node of this.world.nodes) {
      if (!node.alive) continue;
      const dx = node.x - origin.x;
      const dz = node.z - origin.z;
      const dist = Math.hypot(dx, dz);
      const range = reach + node.radius * 0.5;
      if (dist > range) continue;
      const dot = (dx / (dist || 1)) * fwd.x + (dz / (dist || 1)) * fwd.z;
      if (dot < -0.25) continue;
      const score = dist - dot * 1.5;
      if (score < bestNodeScore) { bestNodeScore = score; bestNode = node; }
    }

    if (bestDino && (!bestNode || bestDinoScore <= bestNodeScore + 0.4)) {
      this.hitDino(bestDino, tool);
      return;
    }
    if (bestNode) {
      this.hitNode(bestNode, tool);
      if (!this.mountedDino) {
        const dx = bestNode.x - this.player.pos.x;
        const dz = bestNode.z - this.player.pos.z;
        this.player.group.rotation.y = Math.atan2(dx, dz);
      }
      return;
    }
    // swinging at nothing
    this.audio.swing();
  }

  hitDino(dino, tool) {
    const dmg = tool.dmg || 7;
    dino.hp -= dmg;
    dino.provoke();
    this.targetDino = dino;
    this.targetTimer = 5;
    this.audio.hitFlesh();
    const pos = dino.position.clone().add(new THREE.Vector3(0, dino.def.height * 0.6, 0));
    this.particles.burst(pos, 0x9c2f26, 8, 3);
    this.ui.float(`-${dmg}`, pos, 'damage');
    this.ui.setTarget(dino);
    this.addXP(2);
    if (dino.hp <= 0) this.killDino(dino);
  }

  killDino(dino) {
    dino.die();
    this.tamedCount = this.dinos.filter((d) => d.tamed && !d.dead).length;
    this.addXP(dino.def.xp || 20);
    this.audio.hitFlesh();
    this.audio.roar(dino);
    const pos = dino.position.clone().add(new THREE.Vector3(0, 1, 0));
    this.particles.burst(pos, 0x8f2a20, 22, 5);
    this.ui.toast(`Has abatido a un <b>${dino.def.name}</b>. Recolecta el cadáver con ✋.`, 'good');
    this.ui.setTarget(null);
    if (this.mountedDino === dino) this.dismount(false);
    this.checkQuests();
  }

  hitNode(node, tool) {
    const kind = node.kind;
    const table = YIELDS[kind] || YIELDS.tree;
    const yields = table[tool.tool] || table.hand;
    const y = node.y + (kind === 'tree' ? 1.4 : kind === 'rock' ? 0.8 : 0.5);
    const pos = new THREE.Vector3(node.x, y, node.z);
    const destroyed = this.world.damageNode(node, tool.dmg || 7);
    const parts = [];
    for (const id in yields) {
      const qty = Math.max(1, Math.round(yields[id] * (0.8 + Math.random() * 0.5)));
      this.addItem(id, qty);
      parts.push(`+${qty} ${ITEMS[id].icon}`);
    }
    this.addXP(RESOURCE_XP[kind] || 2);
    const color = kind === 'tree' ? 0x8a5a2b : kind === 'rock' ? 0x9a9a90 : 0x4d7a3d;
    this.particles.burst(pos, color, destroyed ? 18 : 7, destroyed ? 5 : 3);
    this.ui.float(parts.join(' '), pos);
    if (kind === 'rock') this.audio.hitStone();
    else if (kind === 'bush') this.audio.harvest();
    else this.audio.hitWood();
    if (destroyed) {
      this.audio.hitWood();
      this.addXP(4);
    }
  }

  dinoAttack(dino) {
    if (this.state !== 'playing') return;
    if (this.player.pos.distanceTo(dino.position) > dino.def.reach + dino.def.radius + 1.2) return;
    this.audio.roar(dino);
    this.hurtPlayer(dino.def.damage, dino.def.name);
  }

  hurtPlayer(amount, source) {
    if (this.state !== 'playing' || this.invuln > 0) return;
    this.invuln = 0.75;
    this.stats.hp -= amount;
    this.ui.flashDamage();
    this.audio.hurt();
    this.shake = 0.45;
    this.ui.float(`-${amount}`, this.player.pos.clone().add(new THREE.Vector3(0, 2, 0)), 'damage');
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.die(source || 'la isla');
    }
  }

  jump() {
    if (this.state !== 'playing' || this.uiOverlay) return;
    if (this.mountedDino) return;
    if (this.airY <= 0.02) {
      this.velY = 6.4;
      this.stats.stamina = Math.max(0, this.stats.stamina - 7);
      this.audio.footstep();
    }
  }

  /* ============================================================ */
  /* campfire                                                     */
  /* ============================================================ */
  createCampfire(x, z, fuel = 120, silent = false) {
    const y = terrainHeight(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d6f68, roughness: 1, flatShading: true });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.12, 0), stoneMat);
      const a = (i / 9) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75);
      s.rotation.set(Math.random(), Math.random(), Math.random());
      s.castShadow = true;
      group.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 5), woodMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.14;
      log.castShadow = true;
      group.add(log);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8b2f, transparent: true, opacity: 0.94, toneMapped: false });
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, toneMapped: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.95, 6), flameMat);
    flame.position.y = 0.72;
    const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.55, 5), flameMat2);
    flame2.position.y = 0.58;
    group.add(flame, flame2);
    const light = new THREE.PointLight(0xff9a44, 4, 24, 2);
    light.position.y = 1.1;
    group.add(light);
    this.scene.add(group);
    const fire = {
      x, z, y, fuel, group, flame, flame2, light, position: new THREE.Vector3(x, y, z),
      flicker: Math.random() * 10,
    };
    this.structures.push(fire);
    if (!silent) this.save();
    return fire;
  }

  isSafeFromFire(pos) {
    return this.structures.some((f) => f.fuel > 0 && Math.hypot(f.x - pos.x, f.z - pos.z) < 14);
  }

  updateStructures(dt) {
    for (const f of this.structures) {
      f.fuel = Math.max(0, f.fuel - dt * 0.65);
      f.flicker += dt * 9;
      const on = f.fuel > 0;
      f.flame.visible = on;
      f.flame2.visible = on;
      f.light.visible = on;
      if (on) {
        const flick = 0.85 + Math.sin(f.flicker) * 0.1 + Math.sin(f.flicker * 2.7) * 0.06;
        f.flame.scale.set(0.9 + Math.sin(f.flicker * 1.7) * 0.09, 0.85 + Math.sin(f.flicker) * 0.16, 0.9);
        f.flame2.scale.setScalar(0.85 + Math.sin(f.flicker * 2.3) * 0.12);
        f.light.intensity = 3.6 * flick;
        if (Math.random() < dt * 0.6) {
          this.particles.burst(f.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4)), 0xffa94a, 1, 1.2);
        }
      } else {
        f.light.intensity = 0;
      }
    }
  }

  /* ============================================================ */
  /* input                                                        */
  /* ============================================================ */
  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.attackHeld = false; });

    document.getElementById('scene').addEventListener('pointerdown', (e) => this.onCanvasPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state !== 'playing') return;
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.6, 4.5, 12);
    }, { passive: true });

    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
  }

  onResize() {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  onKeyDown(e) {
    if (e.code === 'Escape') {
      if (this.ui.isOverlayOpen()) this.ui.closePanels();
      else if (this.state === 'playing') this.ui.openPanel('menu-panel');
      return;
    }
    if (this.state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { this.start(); return; }
    if (this.state !== 'playing' || this.uiOverlay) return;
    this.keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); this.jump(); }
    if (e.code === 'KeyE' || e.code === 'KeyF') { e.preventDefault(); this.interact(); }
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); this.ui.openPanel('inventory-panel'); }
    if (e.code === 'KeyJ') { e.preventDefault(); this.ui.openPanel('journal-panel'); }
  }

  onCanvasPointerDown(e) {
    if (this.state !== 'playing' || this.uiOverlay) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.look.active = true;
    this.look.pointerId = e.pointerId;
    this.look.lastX = e.clientX;
    this.look.lastY = e.clientY;
    this.look.startTime = performance.now();
    this.look.moved = 0;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  beginJoystick(e) {
    if (this.state !== 'playing' || this.uiOverlay) return;
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById('joystick');
    const rect = el.getBoundingClientRect();
    this.joy.active = true;
    this.joy.pointerId = e.pointerId;
    this.joy.baseX = rect.left + rect.width / 2;
    this.joy.baseY = rect.top + rect.height / 2;
    this.joy.radius = rect.width * 0.36;
    this.updateJoystick(e.clientX, e.clientY);
  }

  updateJoystick(cx, cy) {
    const dx = cx - this.joy.baseX;
    const dy = cy - this.joy.baseY;
    const len = Math.hypot(dx, dy);
    const r = this.joy.radius;
    const k = len > r ? r / len : 1;
    const ox = dx * k, oy = dy * k;
    this.joy.x = clamp(dx / r, -1, 1);
    this.joy.y = clamp(-dy / r, -1, 1);
    const stick = document.getElementById('stick');
    stick.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
    const joyEl = document.getElementById('joystick');
    joyEl.classList.remove('hidden');
  }

  releaseJoystick() {
    this.joy.active = false;
    this.joy.pointerId = null;
    this.joy.x = 0;
    this.joy.y = 0;
    const stick = document.getElementById('stick');
    if (stick) stick.style.transform = 'translate(-50%, -50%)';
  }

  onPointerMove(e) {
    if (this.joy.active && e.pointerId === this.joy.pointerId) {
      this.updateJoystick(e.clientX, e.clientY);
      return;
    }
    if (this.look.active && e.pointerId === this.look.pointerId) {
      const dx = e.clientX - this.look.lastX;
      const dy = e.clientY - this.look.lastY;
      this.look.lastX = e.clientX;
      this.look.lastY = e.clientY;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      const sens = 0.0042;
      this.yaw -= dx * sens;
      this.pitch = clamp(this.pitch + dy * sens, -0.16, 1.12);
    }
  }

  onPointerUp(e) {
    if (this.joy.active && e.pointerId === this.joy.pointerId) {
      this.releaseJoystick();
      return;
    }
    if (this.look.active && e.pointerId === this.look.pointerId) {
      const quick = performance.now() - this.look.startTime < 320;
      const still = this.look.moved < 9;
      this.look.active = false;
      this.look.pointerId = null;
      if (quick && still) this.tryAttack();
    }
  }

  moveInput() {
    let x = this.joy.active ? this.joy.x : 0;
    let y = this.joy.active ? this.joy.y : 0;
    if (this.keys.KeyW || this.keys.ArrowUp) y += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) y -= 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, mag: Math.min(1, len) };
  }

  /* ============================================================ */
  /* overlay                                                      */
  /* ============================================================ */
  openOverlay() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.uiOverlay = true;
      this.attackHeld = false;
      this.releaseJoystick();
      this.save();
    }
  }

  closeOverlay() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.uiOverlay = false;
      this.audio.resume();
    }
  }

  toggleSound() {
    this.audio.setEnabled(!this.audio.enabled);
    return this.audio.enabled;
  }

  /* ============================================================ */
  /* persistence                                                  */
  /* ============================================================ */
  save(manual = false) {
    if (!this.started || this.state === 'menu') return;
    try {
      const data = {
        v: 1,
        inventory: this.inventory,
        equipped: this.equipped,
        stats: this.stats,
        collected: this.collected,
        crafted: this.crafted,
        deaths: this.deaths,
        cookedCount: this.cookedCount,
        survivedNight: this.survivedNight,
        dayTime: this.dayTime,
        day: this.day,
        quests: this.quests.filter((q) => q.done).map((q) => q.id),
        pos: this.mountedDino
          ? [this.mountedDino.position.x + 2, Math.max(terrainHeight(this.mountedDino.position.x + 2, this.mountedDino.position.z), 0.3), this.mountedDino.position.z]
          : [this.player.pos.x, this.player.pos.y, this.player.pos.z],
        tames: this.dinos.filter((d) => d.tamed && !d.dead).map((d) => ({
          species: d.species, pos: [d.position.x, d.position.y, d.position.z],
        })),
        fires: this.structures.map((f) => ({ x: f.x, z: f.z, fuel: f.fuel })),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (manual) this.ui.toast('Partida guardada.', 'good');
    } catch { /* ignore */ }
  }

  loadGame() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
    if (!data || data.v !== 1) { this.resetNewPlayer(); return; }
    this.inventory = data.inventory || {};
    this.equipped = data.equipped && ITEMS[data.equipped] ? data.equipped : 'hand';
    if (data.stats) Object.assign(this.stats, data.stats);
    this.stats.hp = clamp(this.stats.hp, 1, this.stats.hpMax);
    this.collected = Object.assign(this.collected, data.collected || {});
    this.crafted = data.crafted || {};
    this.deaths = data.deaths || 0;
    this.cookedCount = data.cookedCount || 0;
    this.survivedNight = !!data.survivedNight;
    this.dayTime = typeof data.dayTime === 'number' ? data.dayTime : 0.345;
    this.day = data.day || 1;
    const done = new Set(data.quests || []);
    for (const q of this.quests) q.done = done.has(q.id);

    if (data.pos) {
      this.player.pos.set(data.pos[0], data.pos[1], data.pos[2]);
      if (terrainHeight(data.pos[0], data.pos[2]) < 0.2) this.player.pos.copy(this.spawnPoint);
    }
    for (const f of data.fires || []) this.createCampfire(f.x, f.z, f.fuel, true);
    for (const t of data.tames || []) {
      const d = this.addDino(t.species, new THREE.Vector3(t.pos[0], terrainHeight(t.pos[0], t.pos[2]), t.pos[2]), Math.random, { tamed: true });
      d.tameProgress = d.def.feeds;
    }
    this.tamedCount = this.dinos.filter((d) => d.tamed && !d.dead).length;
    this.equipVisual();
    this.ui.updateStats(this.statsView());
    this.ui.renderHotbar();
    this.loadedSave = true;
    this.checkQuests(true);
  }

  /* ============================================================ */
  /* quests                                                       */
  /* ============================================================ */
  checkQuests(silent = false) {
    let changed = false;
    for (const q of this.quests) {
      if (q.done || !q.check(this)) continue;
      q.done = true;
      changed = true;
      if (!silent) {
        this.ui.toast(`<b>Objetivo completado:</b> ${q.title} · +${q.xp} XP`, 'good');
        this.addXP(q.xp);
        this.audio.tame();
      }
    }
    if (changed) this.ui.setQuest(this.quests.find((q) => !q.done));
    return changed;
  }

  /* ============================================================ */
  /* update loop                                                  */
  /* ============================================================ */
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    if (this.state === 'menu') {
      this.updateMenu(dt);
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else {
      this.updateIdle(dt);
    }

    const focus = this.mountedDino ? this.mountedDino.position : this.player.pos;
    this.world.updateEnvironment(this.dayTime, focus);
    if (this.state !== 'paused') this.world.update(dt);
    this.particles.update(dt);
    this.updateCamera(dt);

    this.renderer.render(this.scene, this.camera);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.09;
      this.ui.updateStats(this.statsView());
      this.ui.drawMap(this);
    }
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) {
      this.clockTimer = 0.4;
      const phase = this.isNight ? 'night' : (this.dayTime < 0.31 ? 'dawn' : this.dayTime > 0.7 ? 'dusk' : 'day');
      this.ui.updateClock(this.dayTime, this.day, this.isNight, phase);
    }
  }

  updateMenu(dt) {
    this.menuTime += dt;
    const angle = this.menuAngle + this.menuTime * 0.035;
    const radius = 198;
    const height = 30 + Math.sin(this.menuTime * 0.11) * 3.5;
    this.camera.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
    this.camera.lookAt(0, 7, 0);
    for (const d of this.dinos) if (d.def.flying) d.update(dt, this);
    for (const d of this.dinos) if (!d.def.flying) d.animate(dt);
    this.isNight = false;
  }

  updateIdle(dt) {
    // keep cinematic camera settled while paused
    if (this.state === 'dead') {
      this.player.group.visible = false;
    }
  }

  updatePlaying(dt) {
    this.dayTime += dt / DAY_LENGTH;
    if (this.dayTime >= 1) {
      this.dayTime -= 1;
      this.day++;
      this._nightWarned = false;
    }
    const wasNight = this.isNight;
    const elev = Math.sin((this.dayTime - 0.25) * Math.PI * 2);
    this.isNight = elev < -0.04;
    if (this.isNight && !wasNight) {
      this.nightSeen = true;
      if (this.day > 1 || this.stats.level >= 2) {
        this.ui.toast('La noche ha llegado. Las hogueras mantienen a raya a los depredadores.', 'bad');
      }
    }
    if (!this.isNight && wasNight) {
      if (this.nightSeen) {
        this.survivedNight = true;
        this.nightSeen = false;
        this.ui.toast('<b>Has sobrevivido a la noche.</b> La isla respira de nuevo.', 'good');
        this.audio.tame();
      }
      this._nightWarned = false;
    }

    for (const d of this.dinos) d.update(dt, this);
    // clean up long dead carcasses
    for (let i = this.dinos.length - 1; i >= 0; i--) {
      const d = this.dinos[i];
      if (d.dead && d.deadTimer > 180) {
        this.scene.remove(d.group);
        this.dinos.splice(i, 1);
      }
    }

    this.updateStructures(dt);
    this.updatePlayer(dt);
    this.updateSurvival(dt);

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.promptTimer -= dt;
    if (this.promptTimer <= 0) {
      this.promptTimer = 0.13;
      this.currentInteractable = this.getInteractable();
      this.ui.setPrompt(this.currentInteractable);
    }

    if (this.attackHeld || this.attackBtnHeld) {
      if (this.attackCooldown <= 0) this.tryAttack();
    }
    if (this.pendingHit > 0) {
      this.pendingHit -= dt;
      if (this.pendingHit <= 0) {
        this.pendingHit = -1;
        this.resolveHit();
      }
    }

    if (this.targetDino) {
      this.targetTimer -= dt;
      if (this.targetTimer <= 0 || this.targetDino.dead || !this.dinos.includes(this.targetDino)) {
        this.targetDino = null;
        this.ui.setTarget(null);
      } else {
        this.ui.setTarget(this.targetDino);
      }
    }

    this.nightSpawnTimer -= dt;
    if (this.isNight && this.nightSpawnTimer <= 0) {
      this.nightSpawnTimer = 26;
      this.spawnAtNight();
    }
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = 55;
      this.maintainWildlife();
    }

    this.questTimer -= dt;
    if (this.questTimer <= 0) {
      this.questTimer = 0.8;
      this.checkQuests();
    }

    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.save();
    }
  }

  updatePlayer(dt) {
    const input = this.moveInput();
    const sprintKeys = this.keys.ShiftLeft || this.keys.ShiftRight;
    const sprint = (input.mag > 0.92 || sprintKeys) && this.stats.stamina > 2 && input.mag > 0.08;

    if (this.mountedDino) {
      const dino = this.mountedDino;
      const fwd = this.forward();
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const dx = fwd.x * input.y + right.x * input.x;
      const dz = fwd.z * input.y + right.z * input.x;
      const speed = sprint ? 9.2 : 6.6;
      if (input.mag > 0.05) dino.rideMove(dt, dx, dz, speed);
      else { dino.moving = false; dino.currentSpeed = 0; }
      if (sprint && input.mag > 0.05) this.stats.stamina -= 10 * dt;
      this.player.pos.copy(dino.position);
      this.player.pos.y = dino.position.y;
      this.player.group.position.copy(this.player.pos);
      this.airY = 0;
      this.velY = 0;
      this.player.animate(dt, dino.currentSpeed / 4, dino.moving);
      return;
    }

    let speed = 3.7;
    if (sprint) {
      speed = 6.3;
      this.stats.stamina -= 16 * dt;
    } else if (input.mag > 0.05) {
      this.stats.stamina = Math.min(this.stats.staminaMax, this.stats.stamina + 2 * dt);
    } else {
      this.stats.stamina = Math.min(this.stats.staminaMax, this.stats.stamina + 12 * dt);
    }
    if (this.stats.stamina <= 0) speed *= 0.6;
    const w = this.weight();
    if (w > this.stats.weightMax) speed *= 0.62;

    const ground = terrainHeight(this.player.pos.x, this.player.pos.z);
    const swimming = ground < -0.25;
    if (swimming) speed *= 0.55;

    if (input.mag > 0.03) {
      const fwd = this.forward();
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      let dx = fwd.x * input.y + right.x * input.x;
      let dz = fwd.z * input.y + right.z * input.x;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const p = this.player.pos;
      const nx = p.x + dx * speed * dt;
      const nz = p.z + dz * speed * dt;
      p.x = nx; p.z = nz;
      const dist = Math.hypot(p.x, p.z);
      if (dist > 205) { p.x = (p.x / dist) * 205; p.z = (p.z / dist) * 205; }
      const targetRot = Math.atan2(dx, dz);
      let diff = targetRot - this.player.group.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.player.group.rotation.y += diff * (1 - Math.exp(-12 * dt));
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0 && !swimming) {
        this.footstepTimer = sprint ? 0.28 : 0.42;
        this.audio.footstep();
      }
    }

    // vertical / jump
    if (this.velY !== 0 || this.airY > 0) {
      this.velY -= 20 * dt;
      this.airY += this.velY * dt;
      if (this.airY <= 0) { this.airY = 0; this.velY = 0; }
    }
    const g2 = terrainHeight(this.player.pos.x, this.player.pos.z);
    const floatY = g2 < -0.25 ? 0.28 + Math.sin(this.elapsed * 1.8) * 0.05 : Math.max(g2, 0.05) + this.airY;
    this.player.pos.y = damp(this.player.pos.y, floatY, 16, dt);
    this.player.group.position.copy(this.player.pos);

    const moving = input.mag > 0.05;
    this.player.animate(dt, moving ? speed : 0, moving);
  }

  updateSurvival(dt) {
    const s = this.stats;
    const sprinting = this.player && this.attackHeld;
    s.food = Math.max(0, s.food - dt * (0.13 + (sprinting ? 0.06 : 0)));
    s.water = Math.max(0, s.water - dt * (0.19 + (sprinting ? 0.05 : 0)));
    if (s.food <= 0) s.hp -= dt * 0.8;
    if (s.water <= 0) s.hp -= dt * 1.1;
    if (s.food > 25 && s.water > 25 && this.invuln <= 0) s.hp = Math.min(s.hpMax, s.hp + dt * 0.7);
    s.hp = Math.min(s.hpMax, s.hp);
    s.stamina = clamp(s.stamina, 0, s.staminaMax);
    if (s.hp <= 0) {
      s.hp = 0;
      this.die(s.water <= 0 ? 'la deshidratación' : s.food <= 0 ? 'el hambre' : 'la isla');
    }
  }

  /* ============================================================ */
  /* camera                                                       */
  /* ============================================================ */
  updateCamera(dt) {
    if (this.state === 'menu') return;
    const subject = this.mountedDino ? this.mountedDino.position : this.player.pos;
    const targetY = subject.y + (this.mountedDino ? 2.7 : 1.55);
    const baseTarget = new THREE.Vector3(subject.x, targetY, subject.z);
    this.camTarget.lerp(baseTarget, 1 - Math.exp(-16 * dt));

    let dist = this.mountedDino ? 11.5 : this.camDist;
    if (this.camera.aspect < 0.85) dist *= 1.18;
    if (this.introTime > 0) {
      this.introTime -= dt;
      dist *= 1 + Math.max(0, this.introTime) * 0.85;
    }
    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      this.camTarget.x + Math.sin(this.yaw) * cp * dist,
      this.camTarget.y + Math.sin(this.pitch) * dist,
      this.camTarget.z + Math.cos(this.yaw) * cp * dist,
    );

    // keep the full orbit distance, lifting the camera over ridges instead of zooming into the player
    let groundMax = 0;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const px = this.camTarget.x + (desired.x - this.camTarget.x) * t;
      const pz = this.camTarget.z + (desired.z - this.camTarget.z) * t;
      groundMax = Math.max(groundMax, terrainHeight(px, pz));
    }
    const allowed = desired.clone();
    allowed.y = Math.max(allowed.y, groundMax + 0.85, 0.6);
    this.camera.position.lerp(allowed, 1 - Math.exp(-14 * dt));

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.camTarget);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__game = new Game();
});
