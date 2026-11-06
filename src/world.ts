import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import AudioSys from './audio'
import levels from './levels'
import { bus } from './events'

export interface ApartmentData {
  M: Record<string, CANNON.Material>
  L: any
  std: (color: string | number, rough?: number, metal?: number, extra?: any) => THREE.MeshStandardMaterial
  box: (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, material: THREE.Material, opts?: any) => THREE.Mesh
  cyl: (cx: number, cy: number, cz: number, rTop: number, rBot: number, h: number, material: THREE.Material, opts?: any) => THREE.Mesh
  doors: Record<string, any>
  update: (dt: number) => void
  resetApartment: () => void
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  draw(g, size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = '#a87846'
    g.fillRect(0, 0, s, s)
    const rows = 6
    for (let i = 0; i < rows; i++) {
      const y = (i * s) / rows
      g.fillStyle = i % 2 ? '#a37443' : '#b07e4b'
      g.fillRect(0, y, s, s / rows - 2)
      for (let j = 0; j < 14; j++) {
        g.strokeStyle = 'rgba(90,55,25,' + (0.08 + Math.random() * 0.15) + ')'
        g.lineWidth = 1 + Math.random() * 1.5
        g.beginPath()
        const gy = y + Math.random() * (s / rows - 2)
        g.moveTo(0, gy)
        g.bezierCurveTo(s * 0.3, gy + Math.random() * 6 - 3, s * 0.7, gy + Math.random() * 6 - 3, s, gy)
        g.stroke()
      }
      g.fillStyle = 'rgba(60,35,15,.55)'
      g.fillRect(0, y + s / rows - 2, s, 2)
    }
  })
}

export function fabricTexture(baseColor: string): THREE.CanvasTexture {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = baseColor
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(0,0,0,0.08)'
    g.lineWidth = 1
    for (let x = 0; x < s; x += 4) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, s)
      g.stroke()
    }
    for (let y = 0; y < s; y += 4) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(s, y)
      g.stroke()
    }
    g.strokeStyle = 'rgba(255,255,255,0.06)'
    for (let i = 0; i < s; i += 8) {
      g.beginPath()
      g.moveTo(i + 2, 0)
      g.lineTo(i + 2, s)
      g.stroke()
      g.beginPath()
      g.moveTo(0, i + 2)
      g.lineTo(s, i + 2)
      g.stroke()
    }
  })
}

export function rainTexture(): THREE.CanvasTexture {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = 'rgba(22, 35, 63, 0.95)'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = 'rgba(180, 215, 255, 0.45)'
    g.lineWidth = 1.3
    for (let i = 0; i < 45; i++) {
      const rx = Math.random() * s
      const ry = Math.random() * s
      const len = 14 + Math.random() * 18
      g.beginPath()
      g.moveTo(rx, ry)
      g.lineTo(rx - 2, ry + len)
      g.stroke()
    }
  })
}

export function tileTexture(base: string, grout: string, cells: number): THREE.CanvasTexture {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = base
    g.fillRect(0, 0, s, s)
    const step = s / cells
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const v = (Math.random() - 0.5) * 60
        g.fillStyle = 'rgba(' + (v > 0 ? '255,255,255' : '30,40,50') + ',' + Math.abs(v) / 210 + ')'
        g.fillRect(i * step + 1, j * step + 1, step - 2, step - 2)
      }
    }
    g.strokeStyle = grout
    g.lineWidth = 2
    for (let i = 0; i <= cells; i++) {
      g.beginPath()
      g.moveTo(i * step, 0)
      g.lineTo(i * step, s)
      g.stroke()
      g.beginPath()
      g.moveTo(0, i * step)
      g.lineTo(s, i * step)
      g.stroke()
    }
  })
}

export function artTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(128, function (g, s) {
    const rnd = function () {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const hues = [
      ['#e8b04b', '#7a4a12'],
      ['#5a8ac9', '#1d3a5e'],
      ['#c95a6e', '#5e1d2a']
    ][seed % 3]
    const gr = g.createLinearGradient(0, 0, s, s)
    gr.addColorStop(0, hues[0])
    gr.addColorStop(1, hues[1])
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(255,255,240,' + (0.25 + rnd() * 0.4) + ')'
      g.beginPath()
      g.arc(rnd() * s, rnd() * s, 8 + rnd() * 26, 0, Math.PI * 2)
      g.fill()
    }
  })
}

export function buildApartment(scene: THREE.Scene, world: CANNON.World): ApartmentData {
  const COARSE =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(pointer: coarse)').matches

  const M: Record<string, CANNON.Material> = {
    floor: new CANNON.Material('floor'),
    wall: new CANNON.Material('wall'),
    prop: new CANNON.Material('prop'),
    cat: new CANNON.Material('cat')
  }
  world.addContactMaterial(new CANNON.ContactMaterial(M.floor, M.prop, { friction: 0.45, restitution: 0.28 }))
  world.addContactMaterial(new CANNON.ContactMaterial(M.wall, M.prop, { friction: 0.35, restitution: 0.25 }))
  world.addContactMaterial(new CANNON.ContactMaterial(M.prop, M.prop, { friction: 0.32, restitution: 0.2 }))
  world.addContactMaterial(new CANNON.ContactMaterial(M.floor, M.cat, { friction: 0.0, restitution: 0.0 }))
  world.addContactMaterial(new CANNON.ContactMaterial(M.wall, M.cat, { friction: 0.0, restitution: 0.0 }))
  world.addContactMaterial(new CANNON.ContactMaterial(M.prop, M.cat, { friction: 0.05, restitution: 0.05 }))
  world.defaultContactMaterial.friction = 0.3
  world.defaultContactMaterial.restitution = 0.2

  const matCache: Record<string, THREE.MeshStandardMaterial> = {}
  function std(color: string | number, rough?: number, metal?: number, extra?: any): THREE.MeshStandardMaterial {
    const key = color + '|' + rough + '|' + metal
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial(
        Object.assign(
          {
            color: color,
            roughness: rough === undefined ? 0.85 : rough,
            metalness: metal || 0
          },
          extra || {}
        )
      )
    }
    return matCache[key]
  }

  function box(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    material: THREE.Material,
    opts: any = {}
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
    mesh.position.set(cx, cy, cz)
    mesh.castShadow = opts.cast !== false
    mesh.receiveShadow = true
    scene.add(mesh)
    let body: CANNON.Body | null = null
    if (opts.body !== false) {
      body = new CANNON.Body({ mass: 0, material: M.wall })
      body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)))
      body.position.set(cx, cy, cz)
      world.addBody(body)
    }
    return mesh
  }

  function cyl(
    cx: number,
    cy: number,
    cz: number,
    rTop: number,
    rBot: number,
    h: number,
    material: THREE.Material,
    opts: any = {}
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 14), material)
    mesh.position.set(cx, cy, cz)
    if (opts.rx) mesh.rotation.x = opts.rx
    if (opts.rz) mesh.rotation.z = opts.rz
    mesh.castShadow = opts.cast !== false
    mesh.receiveShadow = true
    scene.add(mesh)
    return mesh
  }

  // ---------- физика пола ----------
  const floorBody = new CANNON.Body({ mass: 0, material: M.floor })
  floorBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.5, 15)))
  floorBody.position.set(0, -0.5, 0)
  world.addBody(floorBody)

  // BUG-01: Физический потолок
  const ceilingBody = new CANNON.Body({ mass: 0, material: M.wall })
  ceilingBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.3, 15)))
  ceilingBody.position.set(0, 2.85, 0)
  world.addBody(ceilingBody)

  // ---------- полы ----------
  const wood = woodTexture()
  wood.repeat.set(3, 5)
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 })
  const livingFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 9), woodMat)
  livingFloor.rotation.x = -Math.PI / 2
  livingFloor.position.set(-4.25, 0.001, 0)
  livingFloor.receiveShadow = true
  scene.add(livingFloor)

  const kitTile = tileTexture('#d6d2c4', '#a4a89a', 6)
  kitTile.repeat.set(7, 4.5)
  const kitFloor = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 5.1), new THREE.MeshStandardMaterial({ map: kitTile, roughness: 0.6 }))
  kitFloor.rotation.x = -Math.PI / 2
  kitFloor.position.set(2.75, 0.002, -1.95)
  kitFloor.receiveShadow = true
  scene.add(kitFloor)

  const bathTile = tileTexture('#a9c2d4', '#7d9eb2', 8)
  bathTile.repeat.set(9, 4)
  const bathFloor = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 3.9), new THREE.MeshStandardMaterial({ map: bathTile, roughness: 0.5 }))
  bathFloor.rotation.x = -Math.PI / 2
  bathFloor.position.set(2.75, 0.003, 2.55)
  bathFloor.receiveShadow = true
  scene.add(bathFloor)

  const bedWoodTex = woodTexture()
  bedWoodTex.repeat.set(2, 5)
  const bedFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 9.0), new THREE.MeshStandardMaterial({ map: bedWoodTex, roughness: 0.8 }))
  bedFloor.rotation.x = -Math.PI / 2
  bedFloor.position.set(9.25, 0.0015, 0)
  bedFloor.receiveShadow = true
  scene.add(bedFloor)

  // ---------- потолок ----------
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 9.5), std('#efe7da', 0.95))
  ceiling.rotation.x = Math.PI / 2
  ceiling.position.set(2, 2.7, 0)
  scene.add(ceiling)

  // ---------- стены ----------
  function stripeTexture(c1: string, c2: string): THREE.CanvasTexture {
    return canvasTexture(256, function (g, s) {
      g.fillStyle = c1
      g.fillRect(0, 0, s, s)
      g.fillStyle = c2
      for (let i = 0; i < 8; i += 2) g.fillRect((i * s) / 8, 0, s / 8, s)
      g.fillStyle = 'rgba(60,40,20,0.05)'
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 2)
    })
  }
  const wallMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#d3c2ab', '#cbb69c'), roughness: 0.9 })
  const wallKitMat = std('#c3d4c4', 0.9)
  const wallBathMat = std('#b3c9da', 0.9)
  const wallBedMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#d9c2ac', '#cfb299'), roughness: 0.9 })

  function wall(cx: number, cz: number, sx: number, sz: number, material?: THREE.Material): void {
    box(cx, 1.35, cz, sx, 2.7, sz, material || wallMat, {})
  }

  wall(2, -4.625, 18.5, 0.25) // северная
  wall(2, 4.625, 18.5, 0.25) // южная
  wall(-7.125, 0, 0.25, 9.5) // западная
  wall(7.125, -3.225, 0.25, 3.05, wallKitMat) // кухня/спальня: сегмент выше двери
  wall(7.125, 2.025, 0.25, 5.45, wallKitMat) // кухня/спальня: сегмент ниже двери
  wall(11.125, 0, 0.25, 9.5, wallBedMat) // восточная (спальня)
  wall(-1.5, -3.4, 0.25, 2.2) // перегородка: сегмент кухня-верх
  wall(-1.5, 0.25, 0.25, 2.7) // перегородка: между дверьми
  wall(-1.5, 3.65, 0.25, 1.7) // перегородка: сегмент ванная-низ
  wall(2.75, 0.6, 8.75, 0.25, wallBathMat) // кухня/ванная

  const trimMat = std('#6b4a33', 0.7)
  function doorTrim(x: number, z1: number, z2: number): void {
    box(x, 1.17, z1, 0.34, 2.34, 0.1, trimMat, { body: false, cast: false })
    box(x, 1.17, z2, 0.34, 2.34, 0.1, trimMat, { body: false, cast: false })
    box(x, 2.32, (z1 + z2) / 2, 0.34, 0.14, Math.abs(z2 - z1) + 0.1, trimMat, { body: false, cast: false })
  }
  doorTrim(-1.5, -2.36, -1.04)
  doorTrim(-1.5, 1.54, 2.86)
  doorTrim(7.125, -1.7, -0.7)

  const rainTex = rainTexture()
  rainTex.wrapS = THREE.RepeatWrapping
  rainTex.wrapT = THREE.RepeatWrapping

  // ---------- окна (визуально) ----------
  function window_(cx: number): void {
    const fz = -4.5
    const w = 1.6
    const h = 1.3
    const y0 = 1.0
    const frameMat = std('#f0ead8', 0.6)
    box(cx, y0 - 0.04, fz + 0.09, w + 0.16, 0.08, 0.18, frameMat, { body: false })
    box(cx, y0 + h + 0.04, fz + 0.09, w + 0.16, 0.08, 0.18, frameMat, { body: false })
    box(cx - w / 2 - 0.04, y0 + h / 2, fz + 0.09, 0.08, h, 0.18, frameMat, { body: false })
    box(cx + w / 2 + 0.04, y0 + h / 2, fz + 0.09, 0.08, h, 0.18, frameMat, { body: false })
    box(cx, y0 + h / 2, fz + 0.09, w + 0.08, 0.05, 0.14, frameMat, { body: false, cast: false })
    box(cx, y0 + h / 2, fz + 0.09, 0.05, h, 0.14, frameMat, { body: false, cast: false })
    const night = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: '#16233f' }))
    night.position.set(cx, y0 + h / 2, fz + 0.02)
    scene.add(night)
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: '#f4f1d8' }))
    moon.position.set(cx - 0.35, y0 + h - 0.3, fz + 0.04)
    scene.add(moon)
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(
        new THREE.CircleGeometry(0.012 + Math.random() * 0.012, 6),
        new THREE.MeshBasicMaterial({ color: '#cdd8ff' })
      )
      st.position.set(cx - w / 2 + Math.random() * w, y0 + 0.15 + Math.random() * (h - 0.3), fz + 0.03)
      scene.add(st)
    }
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: rainTex, transparent: true, opacity: 0.35 })
    )
    glass.position.set(cx, y0 + h / 2, fz + 0.12)
    scene.add(glass)
    if (cx !== -5.4) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, w + 0.5, 8), std('#6b4a33', 0.6))
      rod.rotation.z = Math.PI / 2
      rod.position.set(cx, y0 + h + 0.24, fz + 0.17)
      scene.add(rod)
      ;[-1, 1].forEach(function (s) {
        const cur = new THREE.Mesh(new THREE.BoxGeometry(0.17, h + 0.4, 0.06), std('#7a3a4a', 0.95))
        cur.position.set(cx + s * (w / 2 + 0.15), y0 + h / 2 - 0.03, fz + 0.16)
        cur.castShadow = true
        scene.add(cur)
      })
    }
  }
  window_(-5.4)
  window_(-3.4)
  window_(8.0)

  // входная дверь
  box(10.99, 1.05, -1.2, 0.1, 2.1, 1.0, std('#7a5230', 0.7), { body: false })
  box(10.99, 2.18, -1.2, 0.12, 0.12, 1.16, trimMat, { body: false, cast: false })
  cyl(10.9, 1.0, -0.85, 0.035, 0.035, 0.06, std('#d8b23a', 0.3, 0.8), { rz: Math.PI / 2, body: false })

  // ---------- ДВЕРИ УРОВНЕЙ ----------
  const doors: Record<string, any> = {}
  const doorAnims: Array<{ door: any; t: number }> = []

  function signSprite(text: string): THREE.Sprite {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 64
    const g = c.getContext('2d')!
    g.font = "900 40px 'Segoe UI', system-ui, sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = 'rgba(0,0,0,.9)'
    g.shadowBlur = 8
    g.fillStyle = '#ffcf6b'
    g.fillText(text, 128, 34)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
    sp.scale.set(1.6, 0.4, 1)
    return sp
  }

  function buildDoor(id: string, cfg: any): void {
    const g = new THREE.Group()
    const w = cfg.width - 0.08
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.7, w), std('#7a5230', 0.7))
    panel.castShadow = true
    panel.receiveShadow = true
    g.add(panel)
    ;[-0.85, 0.85].forEach(function (dy) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.1, w - 0.02), std('#6b4530', 0.7))
      plank.position.y = dy
      g.add(plank)
    })
    ;[-1, 1].forEach(function (s) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std('#d8b23a', 0.3, 0.8))
      knob.position.set(s * 0.09, -0.05, w / 2 - 0.18)
      g.add(knob)
    })
    g.position.set(cfg.x, 1.35, cfg.z)
    scene.add(g)

    const body = new CANNON.Body({ mass: 0, material: M.wall })
    body.addShape(new CANNON.Box(new CANNON.Vec3(0.07, 1.35, cfg.width / 2)))
    body.position.set(cfg.x, 1.35, cfg.z)
    world.addBody(body)

    const sign = signSprite('→ ' + cfg.sign)
    sign.position.set(cfg.x, 2.32, cfg.z)
    sign.visible = false
    scene.add(sign)

    const light = new THREE.PointLight('#ffd9a0', 0, 4.5, 1.8)
    light.position.set(cfg.x, 2.25, cfg.z)
    scene.add(light)

    const door: any = {
      id: id,
      isOpen: false,
      mesh: g,
      body: body,
      light: light,
      sign: sign,
      initialY: 1.35,
      open: function (immediate?: boolean) {
        if (door.isOpen) return
        door.isOpen = true
        if (AudioSys.doorCreak) AudioSys.doorCreak()
        if (immediate) finishOpen()
        else doorAnims.push({ door: door, t: 0 })
      },
      close: function () {
        door.isOpen = false
        if (!body.world) world.addBody(body)
        g.visible = true
        g.position.y = 1.35
        sign.visible = false
        light.intensity = 0
      }
    }
    function finishOpen(): void {
      world.removeBody(body)
      g.visible = false
      sign.visible = true
      light.intensity = 0.7
    }
    door._anim = function (t: number) {
      g.position.y = 1.35 + t * 2.8
    }
    door._finish = finishOpen
    doors[id] = door
  }

  Object.keys(levels.DOORS).forEach(function (id) {
    buildDoor(id, levels.DOORS[id])
  })

  // ванна и вода
  let tubWaterGeo: THREE.PlaneGeometry | null = null

  function update(dt: number): void {
    rainTex.offset.y = (rainTex.offset.y + dt * 2.0) % 1
    rainTex.offset.x = (rainTex.offset.x - dt * 0.25) % 1
    for (let i = doorAnims.length - 1; i >= 0; i--) {
      const a = doorAnims[i]
      a.t += dt / 0.8
      if (a.t >= 1) {
        a.door._anim(1)
        a.door._finish()
        doorAnims.splice(i, 1)
      } else {
        a.door._anim(a.t)
      }
    }
    if (tubWaterGeo && tubWaterGeo.attributes && tubWaterGeo.attributes.position) {
      const posAttr = tubWaterGeo.attributes.position
      const t = performance.now() / 1000
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vy = posAttr.getY(i)
        const wave = Math.sin(vx * 7.5 + t * 3.2) * Math.cos(vy * 8.0 + t * 2.4) * 0.014
        posAttr.setZ(i, wave)
      }
      posAttr.needsUpdate = true
    }
  }

  // фартук кухни и панели ванной
  box(2.7, 1.21, -4.46, 8.0, 0.58, 0.04, std('#b7cdc0', 0.5), { body: false, cast: false })
  box(2.75, 0.5, 4.46, 8.7, 1.0, 0.04, std('#9fc0d4', 0.5), { body: false, cast: false })

  // ---------- ГОСТИНАЯ ----------
  const sofaMat = std('#b0524a', 0.95)
  box(-6.47, 0.225, 0.9, 0.95, 0.45, 2.6, sofaMat)
  box(-6.85, 0.7, 0.9, 0.22, 0.5, 2.6, sofaMat)
  box(-6.47, 0.575, -0.22, 0.95, 0.25, 0.18, sofaMat)
  box(-6.47, 0.575, 2.02, 0.95, 0.25, 0.18, sofaMat)

  box(-2.0, 0.2, 0.9, 0.55, 0.4, 1.4, std('#6b4a33', 0.7))

  const tableMat = std('#a3794e', 0.7)
  box(-4.3, 0.445, 0.9, 1.1, 0.05, 0.7, tableMat)
  ;[
    [-0.48, -0.28],
    [0.48, -0.28],
    [-0.48, 0.28],
    [0.48, 0.28]
  ].forEach(function (o) {
    box(-4.3 + o[0], 0.21, 0.9 + o[1], 0.06, 0.42, 0.06, tableMat)
  })

  const rugTex = canvasTexture(128, function (g, s) {
    g.fillStyle = '#8a4a5e'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#d8c6a8'
    g.lineWidth = 6
    g.strokeRect(10, 10, s - 20, s - 20)
    g.strokeStyle = '#c9803c'
    g.lineWidth = 3
    g.strokeRect(22, 22, s - 44, s - 44)
  })
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }))
  rug.rotation.x = -Math.PI / 2
  rug.position.set(-4.4, 0.012, 0.9)
  rug.receiveShadow = true
  scene.add(rug)

  const shelfMat = std('#8a6a48', 0.75)
  box(-5.66, 0.75, -4.2, 0.08, 1.5, 0.4, shelfMat)
  box(-3.34, 0.75, -4.2, 0.08, 1.5, 0.4, shelfMat)
  box(-4.5, 0.75, -4.36, 2.4, 1.5, 0.06, shelfMat)
  box(-4.5, 1.49, -4.2, 2.4, 0.05, 0.4, shelfMat)
  box(-4.5, 0.56, -4.2, 2.32, 0.05, 0.36, shelfMat)
  box(-4.5, 1.06, -4.2, 2.32, 0.05, 0.36, shelfMat)

  const treeMat = std('#c9a06a', 0.9)
  box(-6.5, 0.03, 3.4, 0.5, 0.06, 0.5, treeMat)
  cyl(-6.5, 0.51, 3.4, 0.06, 0.06, 0.9, std('#b08a55', 0.95))
  box(-6.5, 0.98, 3.4, 0.45, 0.05, 0.45, treeMat)
  cyl(-6.5, 0.87, 3.15, 0.008, 0.008, 0.2, std('#888888', 0.9), { body: false, cast: false })
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std('#c94a4a', 0.6))
  ball.position.set(-6.5, 0.75, 3.15)
  ball.castShadow = true
  scene.add(ball)

  // ---------- КУХНЯ ----------
  box(2.7, 0.425, -4.2, 8.0, 0.85, 0.6, std('#a9bfb2', 0.8))
  box(2.7, 0.885, -4.2, 8.1, 0.07, 0.66, std('#f0f2f0', 0.4))
  box(0.6, 1.53, -4.32, 3.8, 0.05, 0.36, shelfMat)

  box(-0.95, 0.925, -3.5, 0.75, 1.85, 0.7, std('#e8e8ea', 0.35, 0.25))

  box(6.35, 0.425, -4.15, 0.7, 0.85, 0.7, std('#d0d2d6', 0.5))
  box(6.35, 0.865, -4.15, 0.72, 0.03, 0.72, std('#22262b', 0.4))

  const kTableMat = std('#c9a06a', 0.7)
  box(2.6, 0.77, -1.9, 1.5, 0.06, 0.95, kTableMat)
  ;[
    [-0.66, -0.38],
    [0.66, -0.38],
    [-0.66, 0.38],
    [0.66, 0.38]
  ].forEach(function (o) {
    box(2.6 + o[0], 0.37, -1.9 + o[1], 0.07, 0.74, 0.07, kTableMat)
  })

  // ---------- ВАННАЯ ----------
  const bathWhite = std('#eef1f4', 0.35)
  const chrome = std('#c9ccd2', 0.25, 0.85)
  box(0.9, 0.29, 3.57, 2.0, 0.58, 0.09, bathWhite)
  box(0.9, 0.29, 4.43, 2.0, 0.58, 0.09, bathWhite)
  box(-0.055, 0.29, 4.0, 0.09, 0.58, 0.77, bathWhite)
  box(1.855, 0.29, 4.0, 0.09, 0.58, 0.77, bathWhite)
  box(0.9, 0.08, 4.0, 1.82, 0.16, 0.77, std('#e6ecf2', 0.3))

  box(0.9, 0.6, 3.56, 2.06, 0.05, 0.17, bathWhite, { body: false })
  box(0.9, 0.6, 4.44, 2.06, 0.05, 0.17, bathWhite, { body: false })
  box(-0.06, 0.6, 4.0, 0.17, 0.05, 0.95, bathWhite, { body: false })
  box(1.86, 0.6, 4.0, 0.17, 0.05, 0.95, bathWhite, { body: false })

  tubWaterGeo = new THREE.PlaneGeometry(1.7, 0.7, 24, 12)
  const tubWaterMat = new THREE.MeshStandardMaterial({
    color: '#4a9bd8',
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.72
  })
  const tubWater = new THREE.Mesh(tubWaterGeo, tubWaterMat)
  tubWater.rotation.x = -Math.PI / 2
  tubWater.position.set(0.9, 0.38, 4.0)
  scene.add(tubWater)

  cyl(0.9, 0.66, 4.44, 0.035, 0.045, 0.14, chrome, { body: false })
  cyl(0.9, 0.9, 4.44, 0.022, 0.022, 0.36, chrome, { body: false })
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.24, 16), chrome)
  spout.rotation.x = Math.PI / 2
  spout.position.set(0.9, 1.06, 4.33)
  scene.add(spout)
  cyl(0.68, 0.62, 4.45, 0.032, 0.032, 0.07, chrome, { rx: Math.PI / 2, body: false })
  cyl(1.12, 0.62, 4.45, 0.032, 0.032, 0.07, chrome, { rx: Math.PI / 2, body: false })

  cyl(1.55, 1.45, 4.44, 0.02, 0.02, 1.7, chrome, { body: false })
  const showerNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 14), chrome)
  showerNeck.rotation.x = Math.PI / 2
  showerNeck.position.set(1.55, 2.26, 4.35)
  scene.add(showerNeck)
  cyl(1.55, 2.2, 4.26, 0.09, 0.075, 0.05, chrome, { body: false })

  box(5.9, 0.175, 3.9, 0.42, 0.35, 0.5, bathWhite)
  box(5.9, 0.55, 4.28, 0.42, 0.5, 0.24, bathWhite)
  cyl(5.9, 0.41, 3.88, 0.21, 0.21, 0.07, bathWhite, { body: false })

  box(6.35, 0.4, 1.2, 0.55, 0.8, 0.5, std('#7fa8c9', 0.6))
  cyl(6.35, 0.87, 1.2, 0.24, 0.19, 0.1, bathWhite, { body: false })
  cyl(6.55, 1.0, 1.2, 0.02, 0.02, 0.2, std('#c9ccd2', 0.3, 0.7), { body: false, cast: false })

  const washerMat = std('#f5f6f8', 0.35, 0.1)
  const washerDark = std('#262930', 0.3, 0.5)
  box(4.8, 0.43, 4.05, 0.65, 0.86, 0.65, washerMat)
  cyl(4.8, 0.42, 3.71, 0.22, 0.22, 0.03, chrome, { rx: Math.PI / 2, body: false })
  cyl(4.8, 0.42, 3.7, 0.17, 0.17, 0.03, washerDark, { rx: Math.PI / 2, body: false })
  box(4.62, 0.77, 3.71, 0.18, 0.08, 0.03, std('#e0e4e8', 0.4), { body: false })
  cyl(4.98, 0.77, 3.71, 0.03, 0.03, 0.02, chrome, { rx: Math.PI / 2, body: false })

  box(6.35, 1.25, 1.2, 0.18, 0.02, 0.5, std('#bfe3ff', 0.1, 0.2), { body: false })

  const bathMatPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.45),
    new THREE.MeshStandardMaterial({ color: '#6f9ec4', roughness: 1 })
  )
  bathMatPlane.rotation.x = -Math.PI / 2
  bathMatPlane.position.set(0.9, 0.012, 2.9)
  bathMatPlane.receiveShadow = true
  scene.add(bathMatPlane)

  box(6.9, 0.72, 3.3, 0.16, 0.05, 0.05, std('#c9ccd2', 0.4), { body: false, cast: false })

  // ---------- СПАЛЬНЯ ----------
  const bedWoodM = std('#8a6a48', 0.75)
  const bedDarkM = std('#6b4a33', 0.7)
  box(10.2, 0.8, -4.4, 1.5, 1.1, 0.09, bedDarkM)
  box(10.2, 0.21, -3.35, 1.5, 0.42, 2.05, bedWoodM)
  box(10.2, 0.52, -3.35, 1.42, 0.2, 1.95, std('#efe4d0', 0.95))
  box(10.2, 0.645, -2.95, 1.44, 0.07, 1.1, std('#a34a5e', 0.95))
  box(8.9, 0.275, -4.15, 0.55, 0.55, 0.5, bedWoodM)
  box(8.9, 0.42, -3.885, 0.12, 0.02, 0.02, std('#d8b23a', 0.3, 0.8), { body: false, cast: false })

  box(10.65, 1.03, 4.15, 0.7, 2.06, 0.7, std('#7a5a3a', 0.75))
  box(10.48, 1.0, 3.785, 0.3, 1.9, 0.04, std('#6b4f34', 0.7), { body: false })
  box(10.82, 1.0, 3.785, 0.3, 1.9, 0.04, std('#6b4f34', 0.7), { body: false })
  cyl(10.58, 1.0, 3.755, 0.014, 0.014, 0.09, chrome, { body: false, cast: false })
  cyl(10.72, 1.0, 3.755, 0.014, 0.014, 0.09, chrome, { body: false, cast: false })

  box(8.7, 0.43, 4.19, 1.5, 0.86, 0.6, bedWoodM)
  const mirror = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 24),
    new THREE.MeshStandardMaterial({ color: '#bcd4e8', roughness: 0.05, metalness: 0.6 })
  )
  mirror.position.set(8.7, 1.8, 4.46)
  scene.add(mirror)
  const mirrorFrame = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 8, 24), bedDarkM)
  mirrorFrame.position.set(8.7, 1.8, 4.455)
  scene.add(mirrorFrame)

  const bedRugTex = canvasTexture(128, function (g, s) {
    g.fillStyle = '#7a4a5e'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#d8c6a8'
    g.lineWidth = 5
    g.strokeRect(8, 8, s - 16, s - 16)
    g.strokeStyle = '#c9803c'
    g.lineWidth = 2
    g.strokeRect(18, 18, s - 36, s - 36)
  })
  const bedRug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshStandardMaterial({ map: bedRugTex, roughness: 1 }))
  bedRug.rotation.x = -Math.PI / 2
  bedRug.position.set(9.2, 0.014, -0.9)
  bedRug.receiveShadow = true
  scene.add(bedRug)

  // BUG-06: Невидимые коллайдеры мебели (если требуются без коллизий для кота)
  // Примечание: диван и кровать уже имеют точные физические коллайдеры в box().
  // Дополнительные сплошные коллайдеры поверх сидений дивана/кровати вызывают левитацию кота и подушек.

  // ---------- свет ----------
  const hemi = new THREE.HemisphereLight('#b8a892', '#4a3f32', 0.85)
  scene.add(hemi)

  const moon = new THREE.DirectionalLight('#cdd8ff', 0.75)
  moon.position.set(-4.5, 5.5, -9)
  moon.target.position.set(-3.5, 0, 1.5)
  moon.castShadow = true
  moon.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048)
  moon.shadow.camera.left = -11
  moon.shadow.camera.right = 13
  moon.shadow.camera.top = 10
  moon.shadow.camera.bottom = -10
  moon.shadow.camera.near = 1
  moon.shadow.camera.far = 26
  moon.shadow.bias = -0.0005
  moon.shadow.normalBias = 0.03
  scene.add(moon)
  scene.add(moon.target)

  // ---------- реальные 3D потолочные люстры и светильники ----------
  // 1. Гостиная: современная 4-рожковая люстра
  const livChandelier = new THREE.Group()
  const livCanopy = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.035, 24), std('#2b261f', 0.4, 0.7))
  livCanopy.position.set(-4.2, 2.682, 0.6)
  livChandelier.add(livCanopy)
  const livRod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 12), std('#a88434', 0.3, 0.8))
  livRod.position.set(-4.2, 2.44, 0.6)
  livChandelier.add(livRod)
  const livHub = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), std('#a88434', 0.3, 0.8))
  livHub.position.set(-4.2, 2.22, 0.6)
  livChandelier.add(livHub)
  const livFinial = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 12), std('#a88434', 0.3, 0.8))
  livFinial.rotation.x = Math.PI
  livFinial.position.set(-4.2, 2.15, 0.6)
  livChandelier.add(livFinial)
  for (let a = 0; a < 4; a++) {
    const angle = (a * Math.PI) / 2
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const armLen = 0.38
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, armLen, 8), std('#a88434', 0.3, 0.8))
    arm.rotation.z = Math.PI / 2
    arm.rotation.y = -angle
    arm.position.set(-4.2 + (cosA * armLen) / 2, 2.22, 0.6 + (sinA * armLen) / 2)
    livChandelier.add(arm)
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.04, 12), std('#a88434', 0.3, 0.8))
    cup.position.set(-4.2 + cosA * armLen, 2.24, 0.6 + sinA * armLen)
    livChandelier.add(cup)
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 12),
      new THREE.MeshStandardMaterial({
        color: '#fffbf0',
        emissive: '#ffd98a',
        emissiveIntensity: 0.95,
        roughness: 0.2
      })
    )
    globe.position.set(-4.2 + cosA * armLen, 2.29, 0.6 + sinA * armLen)
    livChandelier.add(globe)
  }
  scene.add(livChandelier)

  // 2. Кухня: подвесной купольный светильник
  const kitPendant = new THREE.Group()
  const kitCanopy = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.03, 20), std('#1f2329', 0.5, 0.5))
  kitCanopy.position.set(2.5, 2.685, -2.2)
  kitPendant.add(kitCanopy)
  const kitCord = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.48, 8), std('#15171c', 0.8, 0.2))
  kitCord.position.set(2.5, 2.435, -2.2)
  kitPendant.add(kitCord)
  const kitCap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.035, 16), std('#c4983b', 0.3, 0.8))
  kitCap.position.set(2.5, 2.19, -2.2)
  kitPendant.add(kitCap)
  const kitShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.32, 0.22, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#2b303a',
      roughness: 0.5,
      side: THREE.DoubleSide
    })
  )
  kitShade.position.set(2.5, 2.08, -2.2)
  kitPendant.add(kitShade)
  const kitBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 14, 12),
    new THREE.MeshStandardMaterial({
      color: '#fff7e0',
      emissive: '#ffca5c',
      emissiveIntensity: 1.1,
      roughness: 0.2
    })
  )
  kitBulb.position.set(2.5, 2.05, -2.2)
  kitPendant.add(kitBulb)
  scene.add(kitPendant)

  // 3. Ванная: потолочный влагозащищенный плафон
  const bathPlafond = new THREE.Group()
  const bathBase = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.045, 28), std('#d0d8e0', 0.15, 0.85))
  bathBase.position.set(2.5, 2.678, 2.6)
  bathPlafond.add(bathBase)
  const bathGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: '#eef6fc',
      emissive: '#cde4ff',
      emissiveIntensity: 0.95,
      roughness: 0.15,
      transparent: true,
      opacity: 0.92
    })
  )
  bathGlass.rotation.x = Math.PI
  bathGlass.position.set(2.5, 2.66, 2.6)
  bathPlafond.add(bathGlass)
  const bathFinial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), std('#d0d8e0', 0.15, 0.85))
  bathFinial.position.set(2.5, 2.37, 2.6)
  bathPlafond.add(bathFinial)
  scene.add(bathPlafond)

  // 4. Спальня: люстра с барабанным тканевым абажуром
  const bedPendant = new THREE.Group()
  const bedCanopy = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.03, 20), std('#c4983b', 0.3, 0.8))
  bedCanopy.position.set(9.2, 2.685, -0.6)
  bedPendant.add(bedCanopy)
  const bedCord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8), std('#3a3222', 0.6, 0.4))
  bedCord.position.set(9.2, 2.485, -0.6)
  bedPendant.add(bedCord)
  const bedCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 16), std('#c4983b', 0.3, 0.8))
  bedCap.position.set(9.2, 2.29, -0.6)
  bedPendant.add(bedCap)
  const bedDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.22, 28, 1, true),
    new THREE.MeshStandardMaterial({
      color: '#f4ede2',
      emissive: '#ffd8a8',
      emissiveIntensity: 0.4,
      roughness: 0.85,
      side: THREE.DoubleSide
    })
  )
  bedDrum.position.set(9.2, 2.18, -0.6)
  bedPendant.add(bedDrum)
  const bedDiffuser = new THREE.Mesh(
    new THREE.RingGeometry(0.04, 0.355, 28),
    new THREE.MeshStandardMaterial({
      color: '#fff8f0',
      emissive: '#ffe3bd',
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    })
  )
  bedDiffuser.rotation.x = -Math.PI / 2
  bedDiffuser.position.set(9.2, 2.07, -0.6)
  bedPendant.add(bedDiffuser)
  const bedBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 14, 12),
    new THREE.MeshStandardMaterial({
      color: '#fff2db',
      emissive: '#ffcb6b',
      emissiveIntensity: 1.0,
      roughness: 0.2
    })
  )
  bedBulb.position.set(9.2, 2.18, -0.6)
  bedPendant.add(bedBulb)
  scene.add(bedPendant)

  // ---------- освещение комнат (привязано к реальным источникам) ----------
  const pKit = new THREE.PointLight('#ffd9a0', 1.4, 12, 1.2)
  pKit.position.set(2.5, 2.05, -2.2)
  scene.add(pKit)
  const kitSpot = new THREE.SpotLight('#ffd9a0', 1.0, 10, Math.PI * 0.38, 0.6, 1.2)
  kitSpot.position.set(2.5, 2.05, -2.2)
  kitSpot.target.position.set(2.5, 0, -2.2)
  scene.add(kitSpot)
  scene.add(kitSpot.target)

  const pBath = new THREE.PointLight('#cfe2ff', 1.3, 10, 1.2)
  pBath.position.set(2.5, 2.45, 2.6)
  scene.add(pBath)

  const pLiv = new THREE.PointLight('#ffe6c0', 1.3, 12, 1.2)
  pLiv.position.set(-4.2, 2.22, 0.6)
  scene.add(pLiv)

  const pBed = new THREE.PointLight('#ffd9b0', 1.4, 12, 1.2)
  pBed.position.set(9.2, 2.15, -0.6)
  scene.add(pBed)
  const bedSpot = new THREE.SpotLight('#ffd9b0', 0.9, 10, Math.PI * 0.38, 0.65, 1.2)
  bedSpot.position.set(9.2, 2.15, -0.6)
  bedSpot.target.position.set(9.2, 0, -0.6)
  scene.add(bedSpot)
  scene.add(bedSpot.target)

  // GR-05: Дополнительный SpotLight для мягкого направленного света люстры в гостиной
  const livingSpot = new THREE.SpotLight('#ffe8ba', 1.2, 14, Math.PI * 0.42, 0.7, 1.2)
  livingSpot.position.set(-4.2, 2.22, 0.6)
  livingSpot.target.position.set(-4.2, 0, 0.6)
  scene.add(livingSpot)
  scene.add(livingSpot.target)

  // GP-05 / GR-02: Событие грозы (вспышка молнии)
  bus.on('catastrophe:thunder', () => {
    const origMoon = moon.intensity
    const origHemi = hemi.intensity
    moon.intensity = 3.6
    hemi.intensity = 2.6
    setTimeout(() => {
      moon.intensity = 0.4
      hemi.intensity = 0.4
      setTimeout(() => {
        moon.intensity = 3.2
        hemi.intensity = 2.2
        setTimeout(() => {
          moon.intensity = origMoon
          hemi.intensity = origHemi
        }, 120)
      }, 80)
    }, 100)
  })

  function resetApartment(): void {
    Object.keys(doors).forEach(function (did) {
      if (doors[did] && doors[did].close) {
        doors[did].close()
      }
    })
    pKit.intensity = 1.4
    pBath.intensity = 1.3
    pLiv.intensity = 1.3
    pBed.intensity = 1.4
    livingSpot.intensity = 1.2
    kitSpot.intensity = 1.0
    bedSpot.intensity = 0.9
  }

  const L = {
    counterTopY: 0.92,
    shelfY: 1.555,
    coffeeTopY: 0.47,
    tableTopY: 0.8,
    tableAABB: { x1: 1.7, x2: 3.5, z1: -2.5, z2: -1.3, y1: 0.75, y2: 1.55 },
    bedAABB: { x1: 9.4, x2: 11.0, z1: -4.35, z2: -2.3, y1: 0.45, y2: 1.4 },
    nightstandTopY: 0.55,
    dresserTopY: 0.86,
    mattressTopY: 0.62,
    tvStandTopY: 0.4,
    bookshelf: { x: -4.5, z: -4.2, boardsY: [0.585, 1.085, 1.515] },
    stoveTopY: 0.88,
    sinkTopY: 0.84,
    tubTopY: 0.58,
    washerTopY: 0.86,
    rug: { x: -4.4, z: 0.9, r: 1.2, name: 'ковёр', points: 100 },
    bathMat: { x: 0.9, z: 2.9, r: 0.45, name: 'коврик', points: 80 },
    sofa: { x: -5.95, z: 0.9, r: 1.1, name: 'диван', points: 120, questId: 'sofa' },
    catTree: { x: -6.5, z: 3.15, r: 0.55, name: 'когтеточку', points: 50 },
    bedRug: { x: 9.2, z: -0.9, r: 1.15, name: 'ковёр в спальне', points: 100, questId: 'bedrug' },
    fishbowlPos: { x: 5.4, y: 1.1, z: -4.2 },
    rooms: levels.ROOMS
  }

  return { M, L, std, box, cyl, doors, update, resetApartment }
}

if (typeof window !== 'undefined') {
  ;(window as any).buildApartment = buildApartment
}

export default buildApartment
