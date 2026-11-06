export interface AudioSystem {
  ctx: AudioContext | null
  master: GainNode | null
  noiseBuf: AudioBuffer | null
  _last: Record<string, number>
  muted: boolean
  init(): void
  resume(): void
  _gate(key: string, gap: number): boolean
  _noise(rate?: number): AudioBufferSourceNode
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
}

export const AudioSys: AudioSystem = {
  ctx: null,
  master: null,
  noiseBuf: null,
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
  }
}

if (typeof window !== 'undefined') {
  ;(window as any).AudioSys = AudioSys
  window.KOTO = window.KOTO || {}
  window.KOTO.audio = AudioSys
}

export default AudioSys
