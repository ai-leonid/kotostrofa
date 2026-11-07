export interface AudioSystem {
  ctx: AudioContext | null
  master: GainNode | null
  noiseBuf: AudioBuffer | null
  purrBuf?: AudioBuffer | null
  _purrSource?: AudioBufferSourceNode | null
  _purrGain?: GainNode | null
  _last: Record<string, number>
  muted: boolean
  init(): void
  resume(): void
  _gate(key: string, gap: number): boolean
  _noise(rate?: number): AudioBufferSourceNode
  _initPurrBuffer?(): void
  _ambient(): void
  meow(): void
  crash(intensity?: number): void
  zap(): void
  tinkle(): void
  thud(): void
  impact?(intensity?: number): void
  jump(): void
  scratch(): void
  splash(): void
  nom(): void
  knock(): void
  click(): void
  doorCreak(): void
  fanfare(): void
  recordSting(): void
  hiss(): void
  vacuumBroke(): void
  drift(): void
  phoneRing(): void
  rankSting(rankKey?: string): void
  waterDrip(vol?: number): void
  tvAudio(broken?: boolean, vol?: number): void
  aquariumBubble(vol?: number): void
  vacuumSputter(vol?: number): void
  clockTick(tick?: boolean, vol?: number): void
  purr(vol?: number): void
  stopPurr(): void
  squeak(vol?: number): void
  softPuff(vol?: number): void
  metallicClang(vol?: number): void
  plasticClack(vol?: number): void
  phoneBeep(vol?: number): void
}

export const AudioSys: AudioSystem = {
  ctx: null,
  master: null,
  noiseBuf: null,
  purrBuf: null,
  _purrSource: null,
  _purrGain: null,
  _last: {},
  muted: false,

  init(): void {
    if (this.ctx) return
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new AC()
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.connect(this.ctx.destination)
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.65
      this.master.connect(comp)
      const len = this.ctx.sampleRate * 1.2
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
      const d = this.noiseBuf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
      this._initPurrBuffer()
      this._ambient()
    } catch {
      this.ctx = null
    }
  },

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume()
  },

  _gate(key: string, gap: number): boolean {
    const t = performance.now()
    if (this._last[key] && t - this._last[key] < gap * 1000) return false
    this._last[key] = t
    return true
  },

  _noise(rate: number = 1): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noiseBuf
    src.loop = true
    src.playbackRate.value = rate
    return src
  },

  _ambient(): void {
    if (!this.ctx || !this.master) return
    const src = this._noise(0.4)
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 220
    const g = this.ctx.createGain()
    g.gain.value = 0.035
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start()
  },

  meow(): void {
    if (!this.ctx || !this.master || !this._gate('meow', 0.35)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const dur = 0.5 + Math.random() * 0.2
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    const base = 380 + Math.random() * 120
    osc.frequency.setValueAtTime(base, t0)
    osc.frequency.linearRampToValueAtTime(base * 1.75, t0 + dur * 0.35)
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + dur)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5.5 + Math.random() * 2
    const lfoG = ctx.createGain()
    lfoG.gain.value = base * 0.07
    lfo.connect(lfoG)
    lfoG.connect(osc.frequency)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1600
    lp.Q.value = 1.5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.06)
    g.gain.setValueAtTime(0.42, t0 + dur * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
    lfo.start(t0)
    lfo.stop(t0 + dur + 0.05)
  },

  crash(intensity?: number): void {
    if (!this.ctx || !this.master || !this._gate('crash', 0.07)) return
    const intVal = Math.min(1, intensity || 0.5)
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = this._noise(0.9 + Math.random() * 0.3)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900 + Math.random() * 1500
    bp.Q.value = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.55 * intVal + 0.15, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25 + 0.15 * intVal)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + 0.5)

    const thump = ctx.createOscillator()
    thump.type = 'sine'
    thump.frequency.setValueAtTime(130, t0)
    thump.frequency.exponentialRampToValueAtTime(50, t0 + 0.12)
    const tg = ctx.createGain()
    tg.gain.setValueAtTime(0.5 * intVal, t0)
    tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16)
    thump.connect(tg)
    tg.connect(this.master)
    thump.start(t0)
    thump.stop(t0 + 0.2)

    const dings = 3 + Math.floor(intVal * 4)
    for (let i = 0; i < dings; i++) {
      const dt = Math.random() * 0.06
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 1700 + Math.random() * 2800
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.16, t0 + dt)
      og.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.06 + Math.random() * 0.1)
      o.connect(og)
      og.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.25)
    }
  },

  zap(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(90, t0)
    o.frequency.exponentialRampToValueAtTime(35, t0 + 0.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.3, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
    o.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.4)
  },

  tinkle(): void {
    if (!this.ctx || !this.master || !this._gate('tinkle', 0.1)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 2400 + Math.random() * 2200
      const g = ctx.createGain()
      const dt = i * (0.04 + Math.random() * 0.04)
      g.gain.setValueAtTime(0.12, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.09)
      o.connect(g)
      g.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.15)
    }
  },

  thud(): void {
    if (!this.ctx || !this.master || !this._gate('thud', 0.08)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(95, t0)
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.1)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.4, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13)
    o.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.16)
  },

  impact(intensity?: number): void {
    this.thud()
  },

  jump(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(240, t0)
    o.frequency.exponentialRampToValueAtTime(520, t0 + 0.09)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.09, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1)
    o.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.12)
  },

  scratch(): void {
    if (!this.ctx || !this.master || !this._gate('scratch', 0.2)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    for (let i = 0; i < 5; i++) {
      const src = this._noise(1.4 + Math.random() * 0.4)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1900
      const g = ctx.createGain()
      const dt = i * 0.055
      g.gain.setValueAtTime(0.22, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.035)
      src.connect(hp)
      hp.connect(g)
      g.connect(this.master)
      src.start(t0 + dt)
      src.stop(t0 + dt + 0.06)
    }
  },

  splash(): void {
    if (!this.ctx || !this.master || !this._gate('splash', 0.15)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = this._noise(0.7)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(1500, t0)
    lp.frequency.exponentialRampToValueAtTime(350, t0 + 0.35)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.45, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4)
    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + 0.45)
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 700 + Math.random() * 600
      const dt = 0.05 + Math.random() * 0.18
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.08, t0 + dt)
      og.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.08)
      o.connect(og)
      og.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.12)
    }
  },

  nom(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const src = this._noise(0.5 + Math.random() * 0.2)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 650
      const g = ctx.createGain()
      const dt = i * 0.11
      g.gain.setValueAtTime(0.3, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.08)
      src.connect(lp)
      lp.connect(g)
      g.connect(this.master)
      src.start(t0 + dt)
      src.stop(t0 + dt + 0.1)
    }
  },

  knock(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(150, t0 + i * 0.3)
      o.frequency.exponentialRampToValueAtTime(70, t0 + i * 0.3 + 0.1)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.55, t0 + i * 0.3)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + i * 0.3 + 0.14)
      o.connect(g)
      g.connect(this.master)
      o.start(t0 + i * 0.3)
      o.stop(t0 + i * 0.3 + 0.18)
    }
  },

  click(): void {
    if (!this.ctx || !this.master || !this._gate('click', 0.05)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'square'
    o.frequency.value = 780
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2000
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.12, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.06)
  },

  doorCreak(): void {
    if (!this.ctx || !this.master || !this._gate('doorCreak', 0.3)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(160, t0)
    o.frequency.linearRampToValueAtTime(240, t0 + 0.25)
    o.frequency.linearRampToValueAtTime(120, t0 + 0.55)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    lp.Q.value = 4
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.08)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.65)
  },

  fanfare(): void {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5]
    for (let i = 0; i < notes.length; i++) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.value = notes[i]
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2600
      const g = ctx.createGain()
      const dt = i * 0.09
      g.gain.setValueAtTime(0.0001, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + (i === notes.length - 1 ? 0.5 : 0.16))
      o.connect(lp)
      lp.connect(g)
      g.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.55)
    }
  },

  recordSting(): void {
    if (!this.ctx || !this.master || !this._gate('recordSting', 0.5)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    for (let i = 0; i < 5; i++) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = 1100 + i * 420 + Math.random() * 120
      const g = ctx.createGain()
      const dt = i * 0.05
      g.gain.setValueAtTime(0.14, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.18)
      o.connect(g)
      g.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.22)
    }
  },

  hiss(): void {
    if (!this.ctx || !this.master || !this._gate('hiss', 0.4)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = this._noise(1.8)
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(2800, t0)
    hp.frequency.linearRampToValueAtTime(1400, t0 + 0.35)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + 0.4)
  },

  vacuumBroke(): void {
    if (!this.ctx || !this.master || !this._gate('vacuumBroke', 0.5)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(260, t0)
    o.frequency.exponentialRampToValueAtTime(45, t0 + 0.6)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1200
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.25, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.65)
    o.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    o.start(t0)
    o.stop(t0 + 0.7)
  },

  drift(): void {
    if (!this.ctx || !this.master || !this._gate('drift', 0.2)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = this._noise(1.4)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1800
    bp.Q.value = 2.0
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.18, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16)
    src.connect(bp)
    bp.connect(g)
    g.connect(this.master)
    src.start(t0)
    src.stop(t0 + 0.18)
  },

  phoneRing(): void {
    if (!this.ctx || !this.master || !this._gate('phoneRing', 1.0)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    ;[440, 480].forEach(f => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(f, t0)
      g.gain.setValueAtTime(0, t0)
      for (let i = 0; i < 4; i++) {
        const rt = t0 + i * 0.12
        g.gain.setValueAtTime(0.08, rt)
        g.gain.setValueAtTime(0, rt + 0.08)
      }
      osc.connect(g)
      g.connect(this.master!)
      osc.start(t0)
      osc.stop(t0 + 0.6)
    })
  },

  rankSting(rankKey?: string): void {
    if (!this.ctx || !this.master || !this._gate('rankSting', 0.35)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const freqs =
      rankKey === 'catastrophe'
        ? [523, 659, 783, 1046, 1318]
        : rankKey === 'sss'
          ? [440, 554, 659, 880]
          : rankKey === 'ss'
            ? [392, 493, 587, 783]
            : [329, 392, 493, 659]
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator()
      o.type = 'triangle'
      o.frequency.value = freqs[i]
      const g = ctx.createGain()
      const dt = i * 0.055
      g.gain.setValueAtTime(0.001, t0 + dt)
      g.gain.exponentialRampToValueAtTime(0.16, t0 + dt + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.26)
      o.connect(g)
      g.connect(this.master)
      o.start(t0 + dt)
      o.stop(t0 + dt + 0.3)
    }
  },

  waterDrip(vol: number = 0.12): void {
    if (!this.ctx || !this.master || !this._gate('waterDrip', 0.8)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const startF = 1350 + Math.random() * 250
    osc.frequency.setValueAtTime(startF, t0)
    osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.07)
    const g = ctx.createGain()
    const v = Math.min(0.25, Math.max(0.01, vol))
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.09)
  },

  tvAudio(broken: boolean = false, vol: number = 0.1): void {
    if (!this.ctx || !this.master || !this._gate('tvAudio', broken ? 0.35 : 0.6)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const v = Math.min(0.2, Math.max(0.01, vol))
    if (broken) {
      try {
        const noise = this._noise(0.8)
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 800
        filter.Q.value = 1.2
        const g = ctx.createGain()
        g.gain.setValueAtTime(v * 0.4, t0)
        g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18)
        noise.connect(filter)
        filter.connect(g)
        g.connect(this.master)
        noise.start(t0)
        noise.stop(t0 + 0.2)
      } catch (e) {}
    } else {
      const notes = [
        [523.25, 659.25],
        [587.33, 783.99],
        [659.25, 880.00],
        [783.99, 1046.50]
      ]
      const pair = notes[Math.floor(Math.random() * notes.length)]
      pair.forEach((f, idx) => {
        const osc = ctx.createOscillator()
        osc.type = 'triangle'
        osc.frequency.value = f
        const g = ctx.createGain()
        const dt = idx * 0.06
        g.gain.setValueAtTime(0.001, t0 + dt)
        g.gain.exponentialRampToValueAtTime(v * 0.6, t0 + dt + 0.01)
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.09)
        osc.connect(g)
        g.connect(this.master!)
        osc.start(t0 + dt)
        osc.stop(t0 + dt + 0.1)
      })
    }
  },

  aquariumBubble(vol: number = 0.12): void {
    if (!this.ctx || !this.master || !this._gate('aquariumBubble', 0.9)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const startF = 320 + Math.random() * 80
    osc.frequency.setValueAtTime(startF, t0)
    osc.frequency.exponentialRampToValueAtTime(startF * 1.8, t0 + 0.08)
    const g = ctx.createGain()
    const v = Math.min(0.2, Math.max(0.01, vol))
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.1)
  },

  vacuumSputter(vol: number = 0.14): void {
    if (!this.ctx || !this.master || !this._gate('vacuumSputter', 0.45)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const v = Math.min(0.25, Math.max(0.01, vol))
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(65 + Math.random() * 20, t0)
    osc.frequency.linearRampToValueAtTime(35, t0 + 0.12)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 280
    const g = ctx.createGain()
    g.gain.setValueAtTime(v * 0.7, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13)
    osc.connect(filter)
    filter.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.14)
  },

  clockTick(tick: boolean = true, vol: number = 0.08): void {
    if (!this.ctx || !this.master || !this._gate('clockTick', 0.45)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(tick ? 1750 : 1350, t0)
    const g = ctx.createGain()
    const v = Math.min(0.15, Math.max(0.01, vol))
    g.gain.setValueAtTime(v * 0.6, t0)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.025)
  },

  _initPurrBuffer(): void {
    if (!this.ctx) return
    const sampleRate = this.ctx.sampleRate
    const duration = 2.2 // 2.2 с — полный естественный дыхательный цикл кошки
    const totalSamples = Math.floor(sampleRate * duration)
    const buf = this.ctx.createBuffer(1, totalSamples, sampleRate)
    const data = buf.getChannelData(0)

    let b0 = 0, b1 = 0, b2 = 0

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate

      // Двухфазный цикл кошачьего дыхания (вдох 0..0.95с, микро-пауза 0.95..1.05с, выдох 1.05..2.2с)
      let breathEnv = 0
      let pulseRate = 24.5
      let formantFreq = 82

      if (t < 0.95) {
        // Фаза 1: Вдох (легкий трепет гортани ~25.8 Гц, форманта 94 Гц)
        const u = t / 0.95
        breathEnv = Math.sin(u * Math.PI) * 0.75
        pulseRate = 25.8
        formantFreq = 94
      } else if (t < 1.05) {
        // Мягкий переход дыхания
        breathEnv = 0.08
        pulseRate = 24.0
        formantFreq = 86
      } else {
        // Фаза 2: Выдох (глубокий, теплый рокот грудной клетки ~23.4 Гц, форманта 76 Гц)
        const u = (t - 1.05) / 1.15
        breathEnv = Math.sin(u * Math.PI) * 1.0
        pulseRate = 23.4
        formantFreq = 76
      }

      // Период и фаза одиночного импульса голосовых складок
      const pulsePeriod = 1 / pulseRate
      const pulsePhase = (t % pulsePeriod) / pulsePeriod

      // Огибающая импульса: быстрое нарастание (~3мс), спад (~14мс), затем пауза до следующего импульса
      let glottalEnv = 0
      if (pulsePhase < 0.42) {
        const pNorm = pulsePhase / 0.42
        glottalEnv = Math.sin(pNorm * Math.PI) * Math.exp(-pNorm * 2.2)
      }

      // Акустический резонанс грудной клетки: затухающие колебания мягких тканей
      const pulseT = pulsePhase * pulsePeriod
      const chestResonance = Math.sin(2 * Math.PI * formantFreq * pulseT) * Math.exp(-pulseT * 88)
      const throatOvertone = Math.sin(2 * Math.PI * (formantFreq * 2.05) * pulseT) * 0.28 * Math.exp(-pulseT * 125)

      // Мягкий шум трения воздуха в гортани (низкочастотный броуновский шум)
      const white = Math.random() * 2 - 1
      b0 = 0.93 * b0 + white * 0.07
      b1 = 0.91 * b1 + b0 * 0.09
      const filteredNoise = b1 * 1.6

      // Суммирование импульса складок с дыхательным шумом
      const pulseAudio = (chestResonance + throatOvertone + filteredNoise * 0.48) * glottalEnv

      // Непрерывное фоновое тепло дыхания
      b2 = 0.97 * b2 + white * 0.03
      const ambientRumble = b2 * 0.08

      data[i] = (pulseAudio * 1.5 + ambientRumble) * breathEnv
    }

    // Мягкое сглаживание краев от щелчков
    const fade = Math.floor(sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      data[i] *= (i / fade)
      data[totalSamples - 1 - i] *= (i / fade)
    }

    // Нормализация (мягкий пик 0.50)
    let peak = 0
    for (let i = 0; i < totalSamples; i++) {
      if (Math.abs(data[i]) > peak) peak = Math.abs(data[i])
    }
    if (peak > 0) {
      const scale = 0.50 / peak
      for (let i = 0; i < totalSamples; i++) data[i] *= scale
    }

    this.purrBuf = buf
  },

  purr(vol: number = 0.15): void {
    if (!this.ctx || !this.master) return
    this.resume()
    if (!this.purrBuf) this._initPurrBuffer()
    if (!this.purrBuf) return

    // Не запускаем повторно поверх еще звучащего цикла
    if (this._purrSource && !this._gate('purrBreath', 2.05)) return

    const ctx = this.ctx
    const t0 = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.purrBuf

    const g = ctx.createGain()
    const v = Math.min(0.35, Math.max(0.02, vol))
    g.gain.setValueAtTime(v, t0)

    src.connect(g)
    g.connect(this.master)

    src.start(t0)
    this._purrSource = src
    this._purrGain = g
  },

  stopPurr(): void {
    if (!this.ctx || !this._purrGain) return
    const t0 = this.ctx.currentTime
    try {
      this._purrGain.gain.setValueAtTime(this._purrGain.gain.value, t0)
      this._purrGain.gain.linearRampToValueAtTime(0.001, t0 + 0.22)
      if (this._purrSource) {
        this._purrSource.stop(t0 + 0.23)
      }
    } catch {}
    this._purrSource = null
    this._purrGain = null
  },

  squeak(vol: number = 0.18): void {
    if (!this.ctx || !this.master || !this._gate('squeak', 0.2)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(950, t0)
    osc.frequency.exponentialRampToValueAtTime(2400, t0 + 0.06)
    osc.frequency.exponentialRampToValueAtTime(1200, t0 + 0.13)
    const g = ctx.createGain()
    const v = Math.min(0.25, Math.max(0.02, vol))
    g.gain.setValueAtTime(0.001, t0)
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14)
    osc.connect(g)
    g.connect(this.master)
    osc.start(t0)
    osc.stop(t0 + 0.15)
  },

  softPuff(vol: number = 0.15): void {
    if (!this.ctx || !this.master || !this._gate('softPuff', 0.2)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    try {
      const noise = this._noise(0.6)
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 160
      const g = ctx.createGain()
      const v = Math.min(0.25, Math.max(0.02, vol))
      g.gain.setValueAtTime(v, t0)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16)
      noise.connect(filter)
      filter.connect(g)
      g.connect(this.master)
      noise.start(t0)
      noise.stop(t0 + 0.18)
    } catch (e) {}
  },

  metallicClang(vol: number = 0.16): void {
    if (!this.ctx || !this.master || !this._gate('metallicClang', 0.2)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const v = Math.min(0.25, Math.max(0.02, vol))
    ;[480, 735, 1220].forEach((f, idx) => {
      const o = ctx.createOscillator()
      o.type = idx === 0 ? 'sine' : 'triangle'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(v * (idx === 0 ? 0.7 : 0.35), t0)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (idx === 0 ? 0.35 : 0.2))
      o.connect(g)
      g.connect(this.master!)
      o.start(t0)
      o.stop(t0 + 0.38)
    })
  },

  plasticClack(vol: number = 0.14): void {
    if (!this.ctx || !this.master || !this._gate('plasticClack', 0.15)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    try {
      const noise = this._noise(1.4)
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 1250
      filter.Q.value = 2.5
      const g = ctx.createGain()
      const v = Math.min(0.25, Math.max(0.02, vol))
      g.gain.setValueAtTime(v, t0)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04)
      noise.connect(filter)
      filter.connect(g)
      g.connect(this.master)
      noise.start(t0)
      noise.stop(t0 + 0.05)
    } catch (e) {}
  },

  phoneBeep(vol: number = 0.15): void {
    if (!this.ctx || !this.master || !this._gate('phoneBeep', 0.25)) return
    const ctx = this.ctx
    const t0 = ctx.currentTime
    const v = Math.min(0.22, Math.max(0.02, vol))
    ;[697, 1209].forEach(f => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.001, t0)
      g.gain.exponentialRampToValueAtTime(v * 0.5, t0 + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08)
      o.connect(g)
      g.connect(this.master!)
      o.start(t0)
      o.stop(t0 + 0.09)
    })
  }
}

if (typeof window !== 'undefined') {
  ;(window as any).AudioSys = AudioSys
  window.KOTO = window.KOTO || {}
  window.KOTO.audio = AudioSys
}

export default AudioSys
