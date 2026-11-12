export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.ready = false;
    this._birdTimer = null;
    this._wind = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.ready = true;
      this.startWind();
      this.scheduleBirds();
    } catch {
      this.ready = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  noiseBuffer(seconds = 2) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  startWind() {
    if (!this.ctx) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer(3);
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      filter.Q.value = 0.6;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.055;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain).connect(gain.gain);
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      lfo.start();
      this._wind = { src, gain };
    } catch { /* ignore */ }
  }

  scheduleBirds() {
    if (this._birdTimer) clearTimeout(this._birdTimer);
    const next = 2600 + Math.random() * 6000;
    this._birdTimer = setTimeout(() => {
      if (this.enabled && this.ctx) this.chirp();
      this.scheduleBirds();
    }, next);
  }

  chirp() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const start = t + i * (0.07 + Math.random() * 0.08);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const base = 1500 + Math.random() * 1800;
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.6), start + 0.04);
      osc.frequency.exponentialRampToValueAtTime(base * 0.8, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.018, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.13);
    }
  }

  tone(freq, dur, { type = 'sine', gain = 0.08, slide = 0, delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur = 0.12, { gain = 0.1, freq = 1000, q = 1, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.4);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  swing() { this.noise(0.12, { gain: 0.035, freq: 700, q: 0.8 }); }

  hitWood() {
    this.noise(0.09, { gain: 0.12, freq: 700, q: 1.4 });
    this.tone(120, 0.1, { type: 'triangle', gain: 0.07, slide: -40 });
  }
  hitStone() {
    this.noise(0.08, { gain: 0.11, freq: 2600, q: 2.2 });
    this.tone(220, 0.07, { type: 'square', gain: 0.035, slide: -60 });
  }
  hitFlesh() {
    this.noise(0.16, { gain: 0.13, freq: 300, q: 0.9, type: 'lowpass' });
    this.tone(90, 0.12, { type: 'sine', gain: 0.09, slide: -30 });
  }
  harvest() { this.tone(680, 0.08, { type: 'triangle', gain: 0.035 }); }
  footstep() { this.noise(0.07, { gain: 0.035, freq: 240, q: 0.7, type: 'lowpass' }); }
  hurt() {
    this.tone(160, 0.25, { type: 'sawtooth', gain: 0.09, slide: -90 });
    this.noise(0.2, { gain: 0.06, freq: 500, q: 0.8 });
  }
  craft() {
    this.tone(523, 0.12, { gain: 0.05 });
    this.tone(784, 0.16, { gain: 0.045, delay: 0.09 });
  }
  level() {
    this.tone(523, 0.16, { gain: 0.06 });
    this.tone(659, 0.16, { gain: 0.06, delay: 0.12 });
    this.tone(784, 0.2, { gain: 0.06, delay: 0.24 });
    this.tone(1046, 0.35, { gain: 0.055, delay: 0.36 });
  }
  tame() {
    this.tone(392, 0.16, { gain: 0.05 });
    this.tone(523, 0.18, { gain: 0.05, delay: 0.12 });
    this.tone(659, 0.26, { gain: 0.05, delay: 0.24 });
  }
  eat() {
    this.noise(0.12, { gain: 0.06, freq: 400, q: 0.8 });
    this.tone(180, 0.1, { type: 'triangle', gain: 0.04 });
  }
  drink() {
    this.tone(340, 0.12, { type: 'sine', gain: 0.05, slide: 80 });
    this.tone(420, 0.12, { type: 'sine', gain: 0.04, slide: 60, delay: 0.09 });
  }
  fire() {
    this.noise(0.2, { gain: 0.06, freq: 900, q: 0.6 });
    this.tone(140, 0.15, { type: 'triangle', gain: 0.03, slide: -20 });
  }
  roar(dino) {
    if (!this.ctx || !this.enabled) return;
    const big = dino.species === 'bronto' ? 0.6 : dino.species === 'raptor' ? 1.35 : 1;
    const base = dino.species === 'bronto' ? 46 : dino.species === 'raptor' ? 88 : 62;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500 * big;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.35);
    osc.frequency.exponentialRampToValueAtTime(base * 0.75, t + 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * big, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    osc.connect(filter).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1.05);
    this.noise(0.7, { gain: 0.04, freq: 240, q: 0.7, type: 'lowpass' });
  }
  death() {
    this.tone(220, 0.7, { type: 'sawtooth', gain: 0.08, slide: -160 });
    this.tone(110, 1.1, { type: 'sine', gain: 0.08, slide: -60, delay: 0.15 });
  }
  click() { this.tone(900, 0.035, { type: 'square', gain: 0.025 }); }
  place() {
    this.noise(0.12, { gain: 0.08, freq: 420, q: 0.8 });
    this.tone(160, 0.12, { type: 'triangle', gain: 0.05 });
  }
}
