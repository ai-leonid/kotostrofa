"use strict";

const AudioSys = {
  ctx: null,
  master: null,
  noiseBuf: null,
  _last: {},
  muted: false,

  init: function () {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.65;
      this.master.connect(comp);
      const len = this.ctx.sampleRate * 1.2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._ambient();
    } catch (e) {
      this.ctx = null;
    }
  },

  resume: function () {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  _gate: function (key, gap) {
    const t = performance.now();
    if (this._last[key] && t - this._last[key] < gap * 1000) return false;
    this._last[key] = t;
    return true;
  },

  _noise: function (rate) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = rate || 1;
    return src;
  },

  _ambient: function () {
    const src = this._noise(0.4);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 220;
    const g = this.ctx.createGain();
    g.gain.value = 0.035;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
  },

  meow: function () {
    if (!this.ctx || !this._gate("meow", 0.35)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const dur = 0.5 + Math.random() * 0.2;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    const base = 380 + Math.random() * 120;
    osc.frequency.setValueAtTime(base, t0);
    osc.frequency.linearRampToValueAtTime(base * 1.75, t0 + dur * 0.35);
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5 + Math.random() * 2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = base * 0.07;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1600; lp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.06);
    g.gain.setValueAtTime(0.42, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(lp); lp.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  },

  crash: function (intensity) {
    if (!this.ctx || !this._gate("crash", 0.07)) return;
    intensity = Math.min(1, intensity || 0.5);
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = this._noise(0.9 + Math.random() * 0.3);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 + Math.random() * 1500;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * intensity + 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25 + 0.15 * intensity);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + 0.5);
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(130, t0);
    thump.frequency.exponentialRampToValueAtTime(50, t0 + 0.12);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.5 * intensity, t0);
    tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    thump.connect(tg); tg.connect(this.master);
    thump.start(t0); thump.stop(t0 + 0.2);
    const dings = 3 + Math.floor(intensity * 4);
    for (let i = 0; i < dings; i++) {
      const dt = Math.random() * 0.06;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 1700 + Math.random() * 2800;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.16, t0 + dt);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.06 + Math.random() * 0.1);
      o.connect(og); og.connect(this.master);
      o.start(t0 + dt); o.stop(t0 + dt + 0.25);
    }
  },

  zap: function () {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(35, t0 + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.4);
  },

  tinkle: function () {
    if (!this.ctx || !this._gate("tinkle", 0.1)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 2400 + Math.random() * 2200;
      const g = ctx.createGain();
      const dt = i * (0.04 + Math.random() * 0.04);
      g.gain.setValueAtTime(0.12, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.09);
      o.connect(g); g.connect(this.master);
      o.start(t0 + dt); o.stop(t0 + dt + 0.15);
    }
  },

  thud: function () {
    if (!this.ctx || !this._gate("thud", 0.08)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t0);
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.16);
  },

  jump: function () {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(240, t0);
    o.frequency.exponentialRampToValueAtTime(520, t0 + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.12);
  },

  scratch: function () {
    if (!this.ctx || !this._gate("scratch", 0.2)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const src = this._noise(1.4 + Math.random() * 0.4);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1900;
      const g = ctx.createGain();
      const dt = i * 0.055;
      g.gain.setValueAtTime(0.22, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.035);
      src.connect(hp); hp.connect(g); g.connect(this.master);
      src.start(t0 + dt); src.stop(t0 + dt + 0.06);
    }
  },

  splash: function () {
    if (!this.ctx || !this._gate("splash", 0.15)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = this._noise(0.7);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1500, t0);
    lp.frequency.exponentialRampToValueAtTime(350, t0 + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.45, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + 0.45);
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 700 + Math.random() * 600;
      const dt = 0.05 + Math.random() * 0.18;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.08, t0 + dt);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.08);
      o.connect(og); og.connect(this.master);
      o.start(t0 + dt); o.stop(t0 + dt + 0.12);
    }
  },

  nom: function () {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const src = this._noise(0.5 + Math.random() * 0.2);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 650;
      const g = ctx.createGain();
      const dt = i * 0.11;
      g.gain.setValueAtTime(0.3, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.08);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t0 + dt); src.stop(t0 + dt + 0.1);
    }
  },

  knock: function () {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(150, t0 + i * 0.3);
      o.frequency.exponentialRampToValueAtTime(70, t0 + i * 0.3 + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.55, t0 + i * 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.3 + 0.14);
      o.connect(g); g.connect(this.master);
      o.start(t0 + i * 0.3); o.stop(t0 + i * 0.3 + 0.18);
    }
  },

  click: function () {
    if (!this.ctx || !this._gate("click", 0.05)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = 780;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.06);
  },

  doorCreak: function () {
    if (!this.ctx || !this._gate("doorCreak", 0.3)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(160, t0);
    o.frequency.linearRampToValueAtTime(240, t0 + 0.25);
    o.frequency.linearRampToValueAtTime(120, t0 + 0.55);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
    o.connect(lp); lp.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + 0.65);
  },

  fanfare: function () {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    for (let i = 0; i < notes.length; i++) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = notes[i];
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 2600;
      const g = ctx.createGain();
      const dt = i * 0.09;
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + (i === notes.length - 1 ? 0.5 : 0.16));
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t0 + dt); o.stop(t0 + dt + 0.55);
    }
  },

  recordSting: function () {
    if (!this.ctx || !this._gate("recordSting", 0.5)) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 1100 + i * 420 + Math.random() * 120;
      const g = ctx.createGain();
      const dt = i * 0.05;
      g.gain.setValueAtTime(0.14, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.18);
      o.connect(g); g.connect(this.master);
      o.start(t0 + dt); o.stop(t0 + dt + 0.22);
    }
  }
};
