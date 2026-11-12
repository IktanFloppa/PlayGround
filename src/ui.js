import { ITEMS, RECIPES, HOTBAR } from './items.js';
import { terrainHeight } from './world.js';
import { formatTime } from './utils.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.startScreen = $('start-screen');
    this.hud = $('hud');
    this.invPanel = $('inventory-panel');
    this.journalPanel = $('journal-panel');
    this.menuPanel = $('menu-panel');
    this.deathScreen = $('death-screen');
    this.selectedItem = null;
    this.lastMap = 0;
    this.targetDino = null;
    this._toastId = 0;

    this.bind();
    this.buildMapBase();
    this.renderHotbar();
    this.showSaveNote();
  }

  /* ------------------------------------------------------------ */
  bind() {
    $('btn-start').addEventListener('click', () => this.game.start());
    $('btn-inventory').addEventListener('click', () => this.openPanel('inventory-panel'));
    $('btn-journal').addEventListener('click', () => this.openPanel('journal-panel'));
    $('btn-menu').addEventListener('click', () => this.openPanel('menu-panel'));
    $('btn-resume').addEventListener('click', () => this.closePanels());
    $('btn-save').addEventListener('click', () => { this.game.save(true); });
    $('btn-sound').addEventListener('click', () => {
      const on = this.game.toggleSound();
      $('btn-sound').textContent = `Sonido: ${on ? 'activado' : 'desactivado'}`;
    });
    $('btn-help').addEventListener('click', () => $('help-block').classList.toggle('hidden'));
    $('btn-new').addEventListener('click', () => {
      if (window.confirm('¿Empezar una nueva partida? Se borrará el progreso guardado.')) this.game.newGame();
    });
    $('btn-respawn').addEventListener('click', () => this.game.respawn());

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => this.closePanels());
    });
    [this.invPanel, this.journalPanel, this.menuPanel].forEach((panel) => {
      panel.addEventListener('pointerdown', (e) => {
        if (e.target === panel) this.closePanels();
      });
    });

    const attackBtn = $('btn-attack');
    const startAttack = (e) => { e.preventDefault(); this.game.setAttackHeld(true); };
    const endAttack = (e) => { e.preventDefault(); this.game.setAttackHeld(false); };
    attackBtn.addEventListener('pointerdown', startAttack);
    attackBtn.addEventListener('pointerup', endAttack);
    attackBtn.addEventListener('pointercancel', endAttack);
    attackBtn.addEventListener('pointerleave', endAttack);

    $('btn-interact').addEventListener('click', (e) => { e.preventDefault(); this.game.interact(); });
    $('btn-jump').addEventListener('click', (e) => { e.preventDefault(); this.game.jump(); });

    const joy = $('joystick');
    joy.addEventListener('pointerdown', (e) => { e.preventDefault(); this.game.beginJoystick(e); });

    $('hotbar').addEventListener('click', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      this.game.hotbarAction(slot.dataset.id);
    });

    $('inv-grid').addEventListener('click', (e) => {
      const item = e.target.closest('.item');
      if (!item) return;
      this.selectedItem = item.dataset.item;
      this.renderInventory();
    });
    $('item-detail').addEventListener('click', (e) => {
      const use = e.target.closest('[data-use]');
      if (use) this.game.useItem(use.dataset.use);
      const equip = e.target.closest('[data-equip]');
      if (equip) this.game.equip(equip.dataset.equip);
    });
    $('craft-list').addEventListener('click', (e) => {
      const btn = e.target.closest('.craft-btn');
      if (btn && btn.dataset.craft) this.game.craft(btn.dataset.craft);
    });
  }

  showSaveNote() {
    const note = $('save-note');
    if (this.game.hasSave()) note.classList.remove('hidden');
  }

  /* ------------------------------------------------------------ */
  startGameUI() {
    this.startScreen.classList.add('gone');
    setTimeout(() => this.startScreen.classList.add('hidden'), 900);
    this.hud.classList.remove('hidden');
    const hint = $('hint-strip');
    hint.classList.remove('fade');
    setTimeout(() => hint.classList.add('fade'), 11000);
  }

  /* ------------------------------------------------------------ */
  openPanel(id) {
    if (this.game.state === 'dead' || this.game.state === 'menu') return;
    for (const p of [this.invPanel, this.journalPanel, this.menuPanel]) p.classList.add('hidden');
    const panel = $(id);
    if (id === 'inventory-panel') this.renderInventory();
    if (id === 'journal-panel') this.renderJournal();
    if (id === 'menu-panel') $('help-block').classList.add('hidden');
    panel.classList.remove('hidden');
    this.game.openOverlay();
    this.game.audio.click();
  }

  closePanels() {
    for (const p of [this.invPanel, this.journalPanel, this.menuPanel]) p.classList.add('hidden');
    this.game.closeOverlay();
    this.game.audio.click();
  }

  isOverlayOpen() {
    return [this.invPanel, this.journalPanel, this.menuPanel].some((p) => !p.classList.contains('hidden'));
  }

  /* ------------------------------------------------------------ */
  updateStats(s) {
    $('hp-fill').style.width = `${Math.max(0, (s.hp / s.hpMax) * 100)}%`;
    $('hp-num').textContent = Math.max(0, Math.ceil(s.hp));
    $('stamina-fill').style.width = `${Math.max(0, (s.stamina / s.staminaMax) * 100)}%`;
    $('stamina-num').textContent = Math.max(0, Math.ceil(s.stamina));
    $('food-fill').style.width = `${Math.max(0, (s.food / s.foodMax) * 100)}%`;
    $('food-num').textContent = Math.max(0, Math.ceil(s.food));
    $('water-fill').style.width = `${Math.max(0, (s.water / s.waterMax) * 100)}%`;
    $('water-num').textContent = Math.max(0, Math.ceil(s.water));
    $('weight-fill').style.width = `${Math.min(100, (s.weight / s.weightMax) * 100)}%`;
    $('weight-num').textContent = `${s.weight.toFixed(1)}/${s.weightMax.toFixed(0)}`;
    $('level').textContent = s.level;
    $('xp-text').textContent = `${Math.floor(s.xp)} / ${s.xpNext} XP`;
    $('xp-fill').style.width = `${Math.min(100, (s.xp / s.xpNext) * 100)}%`;
  }

  updateWeight(weight, max) {
    $('weight-fill').style.width = `${Math.min(100, (weight / max) * 100)}%`;
    $('weight-num').textContent = `${weight.toFixed(1)}/${max.toFixed(0)}`;
  }

  setQuest(quest) {
    $('quest-title').textContent = quest ? quest.title : 'Isla conquistada';
    $('quest-hint').textContent = quest ? quest.hint : 'Has completado todos los objetivos. Sigue explorando.';
  }

  /* ------------------------------------------------------------ */
  renderHotbar() {
    const game = this.game;
    const el = $('hotbar');
    el.innerHTML = HOTBAR.map((id, i) => {
      const item = ITEMS[id];
      const qty = game.inventory[id] || 0;
      const has = id === 'hand' || qty > 0;
      const active = game.equipped === id;
      return `<div class="slot ${active ? 'active' : ''} ${has ? '' : 'empty'}" data-id="${id}">
        <span class="key">${i + 1}</span>
        <span class="ico">${item.icon}</span>
        ${qty > 1 ? `<span class="qty">${qty}</span>` : ''}
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------ */
  setPrompt(info) {
    const el = $('prompt');
    const btn = $('btn-interact');
    if (!info) {
      el.classList.add('hidden');
      btn.classList.remove('active');
      $('interact-ico').textContent = '✋';
      return;
    }
    el.classList.remove('hidden');
    $('prompt-text').textContent = info.label;
    $('prompt-key').textContent = info.key || '✋';
    btn.classList.add('active');
    $('interact-ico').textContent = info.icon || '✋';
  }

  setTarget(dino) {
    this.targetDino = dino;
    const el = $('target-bar');
    if (!dino) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('target-name').textContent = `${dino.def.name} · ${Math.ceil(Math.max(0, dino.hp))}/${dino.maxHp}`;
    $('target-fill').style.width = `${Math.max(0, (dino.hp / dino.maxHp) * 100)}%`;
  }

  updateClock(dayTime, day, night, phase) {
    $('clock').textContent = `Día ${day} · ${formatTime(dayTime)}`;
    $('weather').textContent = night ? '🌙 Noche' : phase === 'dawn' ? '🌅 Amanecer' : phase === 'dusk' ? '🌇 Atardecer' : '☀ Despejado';
  }

  /* ------------------------------------------------------------ */
  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = text;
    const box = $('toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 3600);
  }

  float(text, worldPos, cls = '') {
    const game = this.game;
    if (!worldPos) return;
    const v = worldPos.clone();
    v.project(game.camera);
    if (v.z > 1) return;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('floating-layer').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  flashDamage() {
    const el = $('damage-flash');
    el.classList.add('on');
    clearTimeout(this._dmgTimer);
    this._dmgTimer = setTimeout(() => el.classList.remove('on'), 110);
  }

  levelUp(level) {
    const el = $('levelup-banner');
    $('levelup-num').textContent = level;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(this._levelTimer);
    this._levelTimer = setTimeout(() => el.classList.add('hidden'), 2700);
  }

  /* ------------------------------------------------------------ */
  renderInventory() {
    const game = this.game;
    const entries = Object.entries(game.inventory).filter(([, c]) => c > 0);
    $('inv-weight').textContent = `${game.weight().toFixed(1)} / ${game.stats.weightMax.toFixed(0)}`;
    $('inv-level').textContent = game.stats.level;
    $('inv-count').textContent = `${entries.length} tipos`;
    const grid = $('inv-grid');
    if (!entries.length) {
      grid.innerHTML = `<div class="empty-inv">Tu mochila está vacía.<br>Golpea árboles, rocas y arbustos para conseguir recursos.</div>`;
    } else {
      grid.innerHTML = entries.map(([id, qty]) => {
        const item = ITEMS[id];
        if (!item) return '';
        const sel = this.selectedItem === id ? 'sel' : '';
        const eq = game.equipped === id ? 'equipped' : '';
        return `<div class="item ${sel} ${eq}" data-item="${id}">
          <span class="qty">${qty > 1 ? qty : ''}</span>
          <span class="ico">${item.icon}</span>
          <span class="nm">${item.name}</span>
        </div>`;
      }).join('');
    }
    if (!this.selectedItem || !game.inventory[this.selectedItem]) this.selectedItem = entries[0]?.[0] || null;
    const detail = $('item-detail');
    const id = this.selectedItem;
    if (id && ITEMS[id]) {
      const item = ITEMS[id];
      const usable = item.food || item.heal;
      const isTool = item.tool;
      let extra = '';
      if (isTool) extra = `<button class="craft-btn" data-equip="${id}">EQUIPAR</button>`;
      else if (usable) extra = `<button class="craft-btn" data-use="${id}">CONSUMIR</button>`;
      detail.innerHTML = `<b>${item.icon} ${item.name}</b> · ${item.weight} kg<br>${item.desc} ${extra}`;
    } else {
      detail.textContent = 'Toca un objeto para usarlo o equiparlo.';
    }

    const list = $('craft-list');
    $('craft-hint').textContent = `Nivel ${game.stats.level}`;
    list.innerHTML = RECIPES.map((r) => {
      const locked = game.stats.level < r.level;
      const needs = Object.entries(r.needs).map(([nid, n]) => {
        const have = game.inventory[nid] || 0;
        return `<span class="need ${have >= n ? 'ok' : 'no'}">${ITEMS[nid].icon} ${have}/${n}</span>`;
      }).join('');
      const can = !locked && game.canCraft(r);
      return `<div class="recipe ${locked ? 'locked' : ''}">
        <div class="rico">${r.icon}</div>
        <div class="recipe-body">
          <div class="recipe-name">${r.name}</div>
          <div class="recipe-desc">${locked ? `<span class="lock-note">REQUIERE NIVEL ${r.level}</span> · ` : ''}${r.desc}</div>
          <div class="needs">${needs}</div>
        </div>
        <button class="craft-btn" data-craft="${r.id}" ${can ? '' : 'disabled'}>FABRICAR</button>
      </div>`;
    }).join('');
  }

  refreshInventory() {
    if (!this.invPanel.classList.contains('hidden')) this.renderInventory();
    this.renderHotbar();
  }

  /* ------------------------------------------------------------ */
  renderJournal() {
    const game = this.game;
    $('journal-list').innerHTML = game.quests.map((q, i) => `
      <div class="quest-row ${q.done ? 'done' : ''}">
        <div class="qmark">${q.done ? '✓' : i + 1}</div>
        <div>
          <div class="qtitle">${q.title}</div>
          <div class="qhint">${q.hint}</div>
        </div>
        <div class="qxp">+${q.xp} XP</div>
      </div>
    `).join('');
    const s = game.stats;
    $('journal-sub').textContent = `Día ${game.day} · ${formatTime(game.dayTime)} · Nivel ${s.level}`;
    $('journal-stats').innerHTML = `
      <span>🪵 <b>${game.collected.wood || 0}</b> madera</span>
      <span>🪨 <b>${game.collected.stone || 0}</b> piedra</span>
      <span>🌿 <b>${game.collected.fiber || 0}</b> fibra</span>
      <span>🐾 <b>${game.tamedCount}</b> domesticados</span>
      <span>💀 <b>${game.deaths}</b> muertes</span>
      <span>🔥 <b>${game.structures.length}</b> hogueras</span>`;
  }

  /* ------------------------------------------------------------ */
  buildMapBase() {
    const size = 240;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const worldExtent = 210;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = ((px / size) - 0.5) * worldExtent * 2;
        const z = ((py / size) - 0.5) * worldExtent * 2;
        const h = terrainHeight(x, z);
        let r, g, b;
        if (h < 0) {
          const d = Math.min(1, -h / 16);
          r = 18 - d * 8; g = 56 - d * 22; b = 70 - d * 24;
        } else if (h < 1.7) {
          r = 199; g = 178; b = 132;
        } else if (h < 3.2) {
          r = 122; g = 143; b = 88;
        } else if (h < 16) {
          const n = Math.sin(x * 0.12) * Math.cos(z * 0.11) * 8;
          r = 74 + n; g = 104 + n; b = 55 + n;
        } else {
          r = 124; g = 122; b = 113;
        }
        const edge = Math.hypot(px - size / 2, py - size / 2) / (size / 2);
        const shade = edge > 0.96 ? 0.85 : 1;
        const i = (py * size + px) * 4;
        const fog = Math.max(0, Math.min(1, (h < 0 ? 0 : 1) * 0.12));
        img.data[i] = (r * (1 - fog) + 30 * fog) * shade;
        img.data[i + 1] = (g * (1 - fog) + 45 * fog) * shade;
        img.data[i + 2] = (b * (1 - fog) + 48 * fog) * shade;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // subtle contour lines
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 28 + i * 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.mapBase = c;
  }

  drawMap(game) {
    const now = performance.now();
    if (now - this.lastMap < 120) return;
    this.lastMap = now;
    const canvas = $('minimap');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.mapBase, 0, 0, size, size);

    const worldExtent = 210;
    const toMap = (x, z) => ({
      x: (x / (worldExtent * 2) + 0.5) * size,
      y: (z / (worldExtent * 2) + 0.5) * size,
    });

    // campfires
    for (const f of game.structures) {
      const p = toMap(f.x, f.z);
      ctx.fillStyle = 'rgba(255,170,70,0.95)';
      ctx.shadowColor = '#ff9d3c';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // dinos
    for (const d of game.dinos) {
      if (d.dead || d.def.flying) continue;
      const p = toMap(d.position.x, d.position.z);
      if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
      ctx.fillStyle = d.tamed ? '#63e2c8' : d.def.aggressive ? '#ff6b52' : d.def.neutral ? '#ffc15e' : '#e8dfc2';
      ctx.beginPath();
      ctx.arc(p.x, p.y, d.species === 'bronto' ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const subject = game.mountedDino || game.player;
    const spos = subject.position || subject.pos;
    const p = toMap(spos.x, spos.z);
    const ang = game.mountedDino ? game.mountedDino.rotation : game.player.group.rotation.y;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-ang + Math.PI);
    ctx.fillStyle = '#fff6df';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // rim
    ctx.strokeStyle = 'rgba(233,166,62,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ------------------------------------------------------------ */
  showDeath(cause) {
    $('death-cause').textContent = cause || 'La isla ha reclamado tu vida.';
    this.deathScreen.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.setPrompt(null);
    this.setTarget(null);
  }

  hideDeath() {
    this.deathScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }
}
