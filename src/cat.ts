import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import AudioSys from './audio'
import type { InputState } from './types/game'

export interface CatSpawn {
  x: number
  y: number
  z: number
}

export interface CatInstance {
  group: THREE.Group
  body: CANNON.Body
  yaw: number
  grounded: boolean
  walkPhase: number
  speedSmooth: number
  swipeT: number
  meowT: number
  headYaw: number
  headYawTarget: number
  headTimer: number
  airTime: number
  scaredT: number
  wetTime?: number
  stepAccum?: number
  footSide?: boolean
  roll?: number
  earBack?: number
  tailLag?: number[]
  blinkTimer?: number
  blinkDuration?: number
  isBlinking?: boolean
  eyes?: THREE.Mesh[]
  glints?: THREE.Mesh[]
  landingBounce?: number
  wasGrounded?: boolean
  spawnX: number
  spawnY: number
  spawnZ: number
  scare(dur?: number): void
  forward(): { x: number; y: number; z: number }
  sync(): void
  update(dt: number, input: InputState): void
  reset(spawn?: CatSpawn): void
  setGhostMode?(enable: boolean): void
}

export function createCat(
  scene: THREE.Scene,
  world: CANNON.World,
  M: Record<string, CANNON.Material>,
  spawn: CatSpawn
): CatInstance {
  const orange = new THREE.MeshStandardMaterial({ color: '#d98a3d', roughness: 0.85 })
  const cream = new THREE.MeshStandardMaterial({ color: '#f5ead9', roughness: 0.9 })
  const pink = new THREE.MeshStandardMaterial({ color: '#e8a0a8', roughness: 0.75 })

  const group = new THREE.Group()

  const bodyG = new THREE.Group()
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), orange)
  body.scale.set(1, 0.85, 1.35)
  body.position.y = 0.26
  bodyG.add(body)
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 14), cream)
  belly.scale.set(0.85, 0.7, 1.15)
  belly.position.set(0, 0.2, 0.045)
  bodyG.add(belly)
  group.add(bodyG)

  const headG = new THREE.Group()
  headG.position.set(0, 0.46, 0.2)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), orange)
  headG.add(skull)
  const ears: THREE.Group[] = []
  const eyes: THREE.Mesh[] = []
  const glints: THREE.Mesh[] = []
  ;[-1, 1].forEach(function (s) {
    const earG = new THREE.Group()
    earG.position.set(s * 0.085, 0.13, -0.01)
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 8), orange)
    ear.rotation.z = -s * 0.28
    earG.add(ear)
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 8), pink)
    inner.position.set(-s * 0.007, -0.015, 0.025)
    inner.rotation.z = -s * 0.28
    earG.add(inner)
    headG.add(earG)
    ears.push(earG)
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.026, 16, 12),
      new THREE.MeshStandardMaterial({ color: '#1d1d22', roughness: 0.1, metalness: 0.2 })
    )
    eye.position.set(s * 0.065, 0.03, 0.125)
    headG.add(eye)
    eyes.push(eye)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }))
    glint.position.set(-s * 0.007, 0.01, 0.019)
    eye.add(glint)
    glints.push(glint)
  })
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.068, 18, 14), cream)
  muzzle.position.set(0, -0.045, 0.115)
  headG.add(muzzle)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.014), pink)
  nose.position.set(0, -0.008, 0.183)
  headG.add(nose)
  const whiskerPos: number[] = []
  ;[-1, 1].forEach(function (s) {
    for (let i = 0; i < 3; i++) {
      whiskerPos.push(s * 0.05, -0.03 + i * 0.018, 0.15, s * 0.21, -0.02 + i * 0.03, 0.19)
    }
  })
  const whiskGeo = new THREE.BufferGeometry()
  whiskGeo.setAttribute('position', new THREE.Float32BufferAttribute(whiskerPos, 3))
  headG.add(
    new THREE.LineSegments(
      whiskGeo,
      new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })
    )
  )
  group.add(headG)

  const panicG = new THREE.Group()
  const panicBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.014, 0.15, 12),
    new THREE.MeshBasicMaterial({ color: '#ff2222' })
  )
  panicBar.position.y = 0.085
  panicG.add(panicBar)
  const panicDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 12, 10),
    new THREE.MeshBasicMaterial({ color: '#ff2222' })
  )
  panicDot.position.y = -0.02
  panicG.add(panicDot)
  panicG.position.set(0, 0.78, 0.2)
  panicG.visible = false
  group.add(panicG)

  function makeLeg(x: number, z: number): THREE.Group {
    const hip = new THREE.Group()
    hip.position.set(x, 0.26, z)
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.22, 14), orange)
    leg.position.y = -0.11
    hip.add(leg)
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), cream)
    paw.position.y = -0.22
    hip.add(paw)
    group.add(hip)
    return hip
  }
  const legFL = makeLeg(-0.11, 0.15)
  const legFR = makeLeg(0.11, 0.15)
  const legBL = makeLeg(-0.11, -0.14)
  const legBR = makeLeg(0.11, -0.14)

  const tailSegs: THREE.Group[] = []
  let tailParent: THREE.Group = group
  let ty = 0.36
  const tz = -0.27
  let tr = 0.032
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group()
    seg.position.set(0, i === 0 ? ty : 0.12, i === 0 ? tz : 0)
    if (i === 0) seg.rotation.x = -0.9
    const m = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr * 1.15, 0.13, 14), i === 3 ? cream : orange)
    m.position.y = 0.065
    seg.add(m)
    tailParent.add(seg)
    tailParent = seg
    tailSegs.push(seg)
    tr *= 0.82
  }

  group.traverse(function (o: any) {
    if (o.isMesh) {
      o.castShadow = true
      o.receiveShadow = false
    }
  })
  scene.add(group)

  const bodyC = new CANNON.Body({ mass: 3, material: M.cat })
  bodyC.addShape(new CANNON.Box(new CANNON.Vec3(0.17, 0.22, 0.2)))
  bodyC.position.set(spawn.x, spawn.y, spawn.z)
  bodyC.fixedRotation = true
  bodyC.updateMassProperties()
  bodyC.allowSleep = false
  bodyC.linearDamping = 0.0
  world.addBody(bodyC)

  const cat: CatInstance = {
    group,
    body: bodyC,
    yaw: 0,
    grounded: false,
    walkPhase: 0,
    speedSmooth: 0,
    swipeT: 0,
    meowT: 0,
    headYaw: 0,
    headYawTarget: 0,
    headTimer: 2,
    airTime: 0,
    scaredT: 0,
    blinkTimer: 3.5 + Math.random() * 3.5,
    blinkDuration: 0,
    isBlinking: false,
    eyes: eyes,
    glints: glints,
    spawnX: spawn.x,
    spawnY: spawn.y,
    spawnZ: spawn.z,

    scare: function (dur?: number) {
      this.scaredT = dur || 1.8
      panicG.visible = true
      if (AudioSys.hiss) AudioSys.hiss()
    },

    forward: function () {
      return { x: Math.sin(this.yaw), y: 0, z: Math.cos(this.yaw) }
    },

    setGhostMode: function (enable: boolean) {
      group.traverse(function (o: any) {
        if (o.isMesh && o.material) {
          o.material.transparent = true
          o.material.opacity = enable ? 0.35 : 1.0
        }
      })
    },

    sync: function () {
      group.position.set(bodyC.position.x, bodyC.position.y - 0.24, bodyC.position.z)
      group.rotation.y = this.yaw
      group.rotation.z = this.roll || 0
    },

    reset: function (sp?: CatSpawn) {
      const pos = sp || { x: this.spawnX, y: this.spawnY, z: this.spawnZ }
      bodyC.position.set(pos.x, pos.y, pos.z)
      bodyC.velocity.set(0, 0, 0)
      bodyC.angularVelocity.set(0, 0, 0)
      this.yaw = 0
      this.grounded = false
      this.airTime = 0
      this.scaredT = 0
      this.swipeT = 0
      this.meowT = 0
      this.isBlinking = false
      this.blinkTimer = 3.5 + Math.random() * 3.5
      this.blinkDuration = 0
      for (let i = 0; i < eyes.length; i++) {
        eyes[i].scale.setScalar(1)
        glints[i].visible = true
      }
      panicG.visible = false
      this.sync()
    },

    update: function (dt: number, input: InputState) {
      if (dt > 0.1) dt = 0.1
      const v = bodyC.velocity
      const cp = bodyC.position

      this.wetTime = this.wetTime || 0
      let inPuddle = false
      const puddles =
        typeof window !== 'undefined' && window.KOTO && window.KOTO.propsSys && window.KOTO.propsSys.puddles
          ? window.KOTO.propsSys.puddles
          : []
      for (let i = 0; i < puddles.length; i++) {
        const p = puddles[i]
        const dx = cp.x - p.x
        const dz = cp.z - p.z
        if (dx * dx + dz * dz < (p.r + 0.18) * (p.r + 0.18)) {
          inPuddle = true
          if (this.wetTime < 11.0 && AudioSys.splash) AudioSys.splash()
          this.wetTime = 12.0
          break
        }
      }
      const isDrifting = this.grounded && (inPuddle || this.wetTime > 4.2)

      let dx = 0
      let dz = 0
      if (input.f) dz += 1
      if (input.b) dz -= 1
      if (input.l) dx -= 1
      if (input.r) dx += 1
      const moving = dx !== 0 || dz !== 0
      let wx = 0
      let wz = 0
      if (moving) {
        const len = Math.hypot(dx, dz)
        dx /= len
        dz /= len
        const s = Math.sin(input.camYaw)
        const c = Math.cos(input.camYaw)
        wx = c * dx - s * dz
        wz = -s * dx - c * dz
      }
      let speedMult = 1.0
      if (typeof window !== 'undefined' && (window as any).KOTO && (window as any).KOTO.game && (window as any).KOTO.game.state) {
        if ((window as any).KOTO.game.state.zoomiesT > 0) speedMult = 1.4
      }
      const speed = (isDrifting ? (input.run ? 5.8 : 3.4) : input.run ? 5.2 : 2.9) * speedMult
      const accel = isDrifting ? 3.2 : this.grounded ? 11 : 3.5
      const k = Math.min(1, accel * dt)
      v.x += (wx * speed - v.x) * k
      v.z += (wz * speed - v.z) * k
      let turnDelta = 0
      if (moving) {
        const target = Math.atan2(wx, wz)
        let d = target - this.yaw
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        this.yaw += d * Math.min(1, (isDrifting ? 9 : 14) * dt)
        turnDelta = d
      }

      const wasGrounded = this.grounded
      this.grounded = false
      for (const c of world.contacts) {
        if (c.bi === bodyC || c.bj === bodyC) {
          if (Math.abs(c.ni.y) > 0.45) {
            this.grounded = true
            break
          }
        }
      }
      if (this.grounded) {
        if (
          !wasGrounded &&
          this.airTime > 0.15 &&
          typeof window !== 'undefined' &&
          window.KOTO &&
          window.KOTO.fx
        ) {
          window.KOTO.fx.dust(bodyC.position.x, 0.04, bodyC.position.z, 5)
        }
        this.airTime = 0
      } else {
        this.airTime += dt
      }

      if (input.jump && this.grounded) {
        v.y = 5.0
        this.grounded = false
        AudioSys.jump()
        if (typeof window !== 'undefined' && window.KOTO && window.KOTO.fx) {
          window.KOTO.fx.dust(bodyC.position.x, 0.04, bodyC.position.z, 4)
        }
      }

      const sp = Math.hypot(v.x, v.z)
      if (
        input.run &&
        moving &&
        this.grounded &&
        Math.random() < dt * 7 &&
        typeof window !== 'undefined' &&
        window.KOTO &&
        window.KOTO.fx
      ) {
        window.KOTO.fx.dust(bodyC.position.x, 0.04, bodyC.position.z, 2)
      }
      if (isDrifting && sp > 1.8 && moving) {
        if (AudioSys.drift) AudioSys.drift()
        if (Math.random() < dt * 10 && typeof window !== 'undefined' && window.KOTO && window.KOTO.fx) {
          window.KOTO.fx.splashes(bodyC.position.x, 0.04, bodyC.position.z, 2)
        }
      }

      const targetRoll = -Math.min(0.26, Math.max(-0.26, turnDelta * (sp / 5.2) * 1.5))
      this.roll = (this.roll || 0) + (targetRoll - (this.roll || 0)) * Math.min(1, 12 * dt)

      const targetEarBack = (input.run ? 0.48 : 0) + (this.swipeT > 0 ? 0.38 : 0)
      this.earBack = (this.earBack || 0) + (targetEarBack - (this.earBack || 0)) * Math.min(1, 14 * dt)
      for (let i = 0; i < ears.length; i++) {
        ears[i].rotation.x = -this.earBack
      }

      if (this.wetTime > 0) {
        this.wetTime -= dt
        this.stepAccum = (this.stepAccum || 0) + sp * dt
        if (
          this.stepAccum > 0.25 &&
          this.grounded &&
          sp > 0.35 &&
          typeof window !== 'undefined' &&
          window.KOTO &&
          window.KOTO.fx &&
          (window.KOTO.fx as any).pawPrint
        ) {
          this.stepAccum = 0
          this.footSide = !this.footSide
          const side = this.footSide ? 1 : -1
          // Чередующиеся отпечатки лапок (левая / правая)
          const perpX = Math.cos(this.yaw) * 0.045 * side
          const perpZ = -Math.sin(this.yaw) * 0.045 * side
          const wetRatio = Math.max(0.12, this.wetTime / 12.0)
          ;(window.KOTO.fx as any).pawPrint(cp.x + perpX, cp.z + perpZ, this.yaw, wetRatio)
        }
      }
      this.speedSmooth += (sp - this.speedSmooth) * Math.min(1, 9 * dt)
      this.walkPhase += this.speedSmooth * 4.6 * dt
      const amp = Math.min(1, this.speedSmooth / 3)
      if (this.grounded) {
        legFL.rotation.x = Math.sin(this.walkPhase) * 0.8 * amp
        legFR.rotation.x = Math.sin(this.walkPhase + Math.PI) * 0.8 * amp
        legBL.rotation.x = Math.sin(this.walkPhase + Math.PI * 0.9) * 0.65 * amp
        legBR.rotation.x = Math.sin(this.walkPhase + 0.1 * Math.PI) * 0.65 * amp
        bodyG.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.028 * amp
        bodyG.rotation.x = 0
      } else {
        const tuck = Math.min(1, this.airTime * 6)
        legFL.rotation.x = -0.9 * tuck
        legFR.rotation.x = -0.9 * tuck
        legBL.rotation.x = 0.9 * tuck
        legBR.rotation.x = 0.9 * tuck
        bodyG.position.y = 0
        bodyG.rotation.x = -0.12 * tuck
      }
      if (this.swipeT > 0) {
        this.swipeT -= dt
        legFR.rotation.x = -1.6 * Math.max(0, this.swipeT / 0.25)
      }
      if (this.meowT > 0) this.meowT -= dt
      headG.rotation.x = this.meowT > 0 ? -0.3 : Math.sin(this.walkPhase * 0.5) * 0.05 * amp
      this.headTimer -= dt
      if (this.headTimer <= 0) {
        this.headTimer = 1.5 + Math.random() * 2.5
        this.headYawTarget = (Math.random() - 0.5) * 0.9
      }
      this.headYaw += (this.headYawTarget - this.headYaw) * Math.min(1, 4 * dt)
      headG.rotation.y = this.headYaw
      const t = performance.now() / 1000

      this.tailLag = this.tailLag || [0, 0, 0, 0]
      const turnLag = -turnDelta * 1.5 * Math.min(1, sp / 2.5)
      for (let i = 0; i < tailSegs.length; i++) {
        const segTarget = turnLag * (0.35 + i * 0.25)
        this.tailLag[i] += (segTarget - this.tailLag[i]) * Math.min(1, (14 - i * 2) * dt)
        tailSegs[i].rotation.z = Math.sin(t * 2.2 + i * 0.9) * 0.16 + this.tailLag[i]
      }
      const runStretch = input.run ? 0.35 : 0
      tailSegs[0].rotation.x = -0.9 + Math.sin(t * 1.7) * 0.12 + amp * 0.28 + runStretch
      muzzle.scale.setScalar(this.meowT > 0 ? 1.25 : 1)

      if (this.scaredT > 0) {
        this.scaredT -= dt
        const sNorm = Math.min(1, this.scaredT * 1.5)
        body.scale.set(0.85, 0.85 + 0.45 * sNorm, 1.15)
        bodyG.position.y = 0.07 * sNorm
        bodyG.position.x = (Math.random() - 0.5) * 0.025 * sNorm
        tailSegs[0].rotation.x = 0.65 * sNorm
        for (let i = 0; i < tailSegs.length; i++) {
          tailSegs[i].rotation.z = Math.sin(t * 35 + i) * 0.25 * sNorm
        }
        for (let i = 0; i < ears.length; i++) {
          ears[i].rotation.x = -0.75 * sNorm
        }
        for (let i = 0; i < eyes.length; i++) {
          eyes[i].scale.setScalar(1 + 0.7 * sNorm)
        }
        panicG.visible = true
        panicG.position.y = 0.78 + Math.sin(this.scaredT * 12) * 0.07
        panicG.rotation.y = -this.yaw + (input.camYaw || 0) + Math.PI
      } else {
        body.scale.set(1, 0.85, 1.35)
        panicG.visible = false
        for (let i = 0; i < eyes.length; i++) {
          eyes[i].scale.setScalar(1)
        }
      }

      // BUG-01: Clamp position y to avoid jumping through ceiling & fallback
      if (bodyC.position.y > 2.6) {
        bodyC.position.y = 2.6
        bodyC.velocity.y = Math.min(0, bodyC.velocity.y)
      }
      if (bodyC.position.y < -1.0) {
        bodyC.position.set(this.spawnX, this.spawnY, this.spawnZ)
        bodyC.velocity.set(0, 0, 0)
      }

      // GR-01: Blinking eyes (каждые 3.5-7 сек на 160 мс)
      if (this.scaredT > 0) {
        this.isBlinking = false
        this.blinkDuration = 0
        for (let i = 0; i < eyes.length; i++) {
          glints[i].visible = true
        }
      } else {
        this.blinkTimer = (this.blinkTimer ?? (3.5 + Math.random() * 3.5)) - dt
        if (this.blinkTimer <= 0) {
          this.blinkTimer = 3.5 + Math.random() * 3.5
          this.isBlinking = true
          this.blinkDuration = 0.16
        }
        if (this.isBlinking) {
          this.blinkDuration = (this.blinkDuration ?? 0.16) - dt
          for (let i = 0; i < eyes.length; i++) {
            eyes[i].scale.y = 0.08
            glints[i].visible = false
          }
          if (this.blinkDuration <= 0) {
            this.isBlinking = false
            for (let i = 0; i < eyes.length; i++) {
              eyes[i].scale.y = 1.0
              glints[i].visible = true
            }
          }
        } else {
          for (let i = 0; i < eyes.length; i++) {
            glints[i].visible = eyes[i].scale.y >= 0.4
          }
        }
      }

      // GR-01: Apex hang-time (замедление в пике прыжка)
      if (!this.grounded && Math.abs(bodyC.velocity.y) < 0.5 && bodyC.position.y > 0.45) {
        bodyC.velocity.y *= 0.92
      }

      // GR-01: Landing squash & bounce (приземление)
      if (!this.wasGrounded && this.grounded) {
        this.landingBounce = 0.22
      }
      this.wasGrounded = this.grounded
      if (this.landingBounce && this.landingBounce > 0) {
        this.landingBounce -= dt
        const squash = Math.sin(this.landingBounce * Math.PI * 4.5) * 0.14
        group.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5)
      } else {
        group.scale.set(1, 1, 1)
      }
    }
  }

  cat.sync()
  return cat
}

export function resetCat(cat: CatInstance, spawn?: CatSpawn): void {
  cat.reset(spawn)
}

if (typeof window !== 'undefined') {
  ;(window as any).createCat = createCat
}

export default createCat
