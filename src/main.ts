import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import AudioSys from './audio'
import levels from './levels'
import save from './save'
import buildApartment from './world'
import buildProps from './props'
import createCat from './cat'
import minimap from './minimap'
import game from './game'
import { KeyboardInputManager } from './input'
import { bus } from './events'

declare const KOTO: any

export let currentFrame = 0

const params = new URLSearchParams(location.search)
const AUTO = params.has('autostart')
const BOT = params.has('bot')
const DURATION = Math.max(5, parseInt(params.get('t') || '45', 10) || 45)

const container = document.getElementById('game')!
const FAST = params.has('fast')

const renderer = new THREE.WebGLRenderer({ antialias: !FAST })
renderer.setPixelRatio(FAST ? 1 : Math.min(window.devicePixelRatio || 1, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = !FAST
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color('#0b0e18')
scene.fog = new THREE.Fog('#0b0e18', 20, 42)

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 60)

const world = new CANNON.World()
world.gravity.set(0, -9.82, 0)
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true

const apt = buildApartment(scene, world)
const propsSys = buildProps(scene, world, apt)

;(window as any).CANNON = CANNON
;(window as any).THREE = THREE

window.KOTO = window.KOTO || {}
window.KOTO.propsSys = propsSys
window.KOTO.apt = apt
window.KOTO.game = game
window.KOTO.levels = levels
window.KOTO.minimap = minimap
window.KOTO.save = save
window.KOTO.audio = AudioSys
window.KOTO.bus = bus
window.KOTO.scene = scene
window.KOTO.camera = camera

const cat = createCat(scene, world, apt.M, { x: -3.35, y: 0.26, z: 1.6 })
cat.yaw = Math.PI / 2
window.KOTO.cat = cat

for (let i = 0; i < 90; i++) world.step(1 / 60)
propsSys.props.forEach(function (p: any) {
  p.body.sleep()
})

game.init({
  scene: scene,
  world: world,
  camera: camera,
  renderer: renderer,
  cat: cat,
  L: apt.L,
  apt: apt,
  propsSys: propsSys
})

if (params.get('unlock') === 'all') {
  Object.keys(apt.doors).forEach(function (id) {
    apt.doors[id].open(true)
  })
}

const inputManager = new KeyboardInputManager()
inputManager.bind(document)
window.KOTO.input = inputManager

const cam = {
  yaw: -Math.PI / 2,
  pitch: 0.42,
  dist: 3.1,
  smooth: new THREE.Vector3(-3.35, 0.55, 1.6)
}
;(window.KOTO as any).cam = cam

const TOUCH =
  'ontouchstart' in window ||
  (navigator.maxTouchPoints > 0 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
if (TOUCH) document.body.classList.add('touch')

if (TOUCH) {
  const hintEl = document.getElementById('hud-hint')
  if (hintEl) hintEl.textContent = 'джойстик — бегать • до края — рывок • свайп — камера • щепотка — зум'
  const grid = document.querySelector('#screen-start .controls-grid')
  if (grid) {
    grid.innerHTML =
      '<div><b>джойстик слева</b><span>бегать, до края — рывок</span></div>' +
      '<div><b>свайп по экрану</b><span>камера, щепотка — зум</span></div>' +
      '<div><b>ЛАПА</b><span>удар лапой, точить когти</span></div>' +
      '<div><b>МЯУ / ПРЫЖОК</b><span>кнопки справа</span></div>'
  }
}

let swipeCd = 0
function swipe() {
  const now = performance.now()
  if (now - swipeCd < 320) return
  swipeCd = now
  game.trySwipe()
}
function meow() {
  game.tryMeow()
}

inputManager.onSwipe = swipe
inputManager.onMeow = meow
inputManager.onLassoHold = () => {
  if (game.onLassoHold) game.onLassoHold()
}
inputManager.onLassoRelease = () => {
  if (game.onLassoRelease) game.onLassoRelease()
}

const HARD = params.has('hard')
if (HARD) {
  document.body.classList.add('hard-mode')
  if (game.setHardMode) game.setHardMode(true)
  if (cat.setGhostMode) cat.setGhostMode(true)
}

let mouseHoldTimer: any = null
let mouseIsHoldingLasso = false

renderer.domElement.addEventListener('mousedown', function (e: MouseEvent) {
  if (e.button !== 0) return
  const st = game.state
  if (st.mode !== 'play') return
  if (!document.pointerLockElement && !AUTO) {
    try {
      renderer.domElement.requestPointerLock()
    } catch {
      /* headless */
    }
  }
  if (!mouseHoldTimer && !mouseIsHoldingLasso) {
    mouseHoldTimer = setTimeout(() => {
      mouseIsHoldingLasso = true
      if (game.onLassoHold) game.onLassoHold()
    }, 220)
  }
})

window.addEventListener('mouseup', function (e: MouseEvent) {
  if (e.button !== 0) return
  if (mouseHoldTimer) {
    clearTimeout(mouseHoldTimer)
    mouseHoldTimer = null
  }
  if (mouseIsHoldingLasso) {
    mouseIsHoldingLasso = false
    if (game.onLassoRelease) game.onLassoRelease()
  } else {
    const st = game.state
    if (st.mode === 'play') {
      swipe()
    }
  }
})

window.addEventListener('blur', function () {
  if (mouseHoldTimer) {
    clearTimeout(mouseHoldTimer)
    mouseHoldTimer = null
  }
  if (mouseIsHoldingLasso) {
    mouseIsHoldingLasso = false
    if (game.onLassoRelease) game.onLassoRelease()
  }
})

document.addEventListener('pointerlockchange', function () {
  if (!document.pointerLockElement && mouseIsHoldingLasso) {
    if (mouseHoldTimer) {
      clearTimeout(mouseHoldTimer)
      mouseHoldTimer = null
    }
    mouseIsHoldingLasso = false
    if (game.onLassoRelease) game.onLassoRelease()
  }
})

document.addEventListener('mousemove', function (e) {
  if (!document.pointerLockElement) return
  cam.yaw -= e.movementX * 0.003
  cam.pitch += e.movementY * 0.0025
  cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch))
})

document.addEventListener(
  'wheel',
  function (e) {
    cam.dist = Math.max(2.2, Math.min(4.5, cam.dist + e.deltaY * 0.0015))
  },
  { passive: true }
)

// ---------- сенсорное управление: джойстик ----------
const joy = { id: null as number | null, bx: 0, by: 0, x: 0, y: 0, mag: 0 }
const JOY_R = 52
const joyZone = document.getElementById('joy-zone')
const joyBase = document.getElementById('joy-base')
const joyKnob = document.getElementById('joy-knob')

function joyMove(t: Touch) {
  let dx = t.clientX - joy.bx,
    dy = t.clientY - joy.by
  const d = Math.hypot(dx, dy)
  if (d > JOY_R) {
    dx = (dx / d) * JOY_R
    dy = (dy / d) * JOY_R
  }
  if (joyKnob) joyKnob.style.transform = 'translate(-50%, -50%) translate(' + dx + 'px,' + dy + 'px)'
  joy.x = dx / JOY_R
  joy.y = dy / JOY_R
  joy.mag = Math.min(1, Math.hypot(joy.x, joy.y))
}

if (joyZone && joyBase && joyKnob) {
  joyZone.addEventListener(
    'touchstart',
    function (e: TouchEvent) {
      e.preventDefault()
      if (joy.id !== null) return
      const t = e.changedTouches[0]
      joy.id = t.identifier
      joy.bx = t.clientX
      joy.by = t.clientY
      joy.x = 0
      joy.y = 0
      joy.mag = 0
      joyBase.classList.remove('hidden')
      joyBase.style.left = t.clientX + 'px'
      joyBase.style.top = t.clientY + 'px'
      joyKnob.style.transform = 'translate(-50%, -50%)'
    },
    { passive: false }
  )

  joyZone.addEventListener(
    'touchmove',
    function (e: TouchEvent) {
      e.preventDefault()
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joy.id) joyMove(e.changedTouches[i])
      }
    },
    { passive: false }
  )

  function joyEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.id) {
        joy.id = null
        joy.x = 0
        joy.y = 0
        joy.mag = 0
        inputManager.setDirection(false, false, false, false, false)
        joyBase!.classList.add('hidden')
      }
    }
  }
  joyZone.addEventListener('touchend', joyEnd)
  joyZone.addEventListener('touchcancel', joyEnd)
}

function bindBtn(id: string, fn: () => void) {
  const el = document.getElementById(id)
  if (!el) return
  el.addEventListener(
    'touchstart',
    function (e) {
      e.preventDefault()
      fn()
    },
    { passive: false }
  )
  el.addEventListener('mousedown', fn)
}
bindBtn('tb-jump', function () {
  inputManager.triggerJump()
})

const tbSwipe = document.getElementById('tb-swipe')
if (tbSwipe) {
  let touchHoldTimer: any = null
  let touchIsHoldingLasso = false
  tbSwipe.addEventListener(
    'touchstart',
    function (e) {
      e.preventDefault()
      if (!touchHoldTimer && !touchIsHoldingLasso) {
        touchHoldTimer = setTimeout(() => {
          touchIsHoldingLasso = true
          if (game.onLassoHold) game.onLassoHold()
        }, 220)
      }
    },
    { passive: false }
  )
  tbSwipe.addEventListener(
    'touchend',
    function (e) {
      e.preventDefault()
      if (touchHoldTimer) {
        clearTimeout(touchHoldTimer)
        touchHoldTimer = null
      }
      if (touchIsHoldingLasso) {
        touchIsHoldingLasso = false
        if (game.onLassoRelease) game.onLassoRelease()
      } else {
        swipe()
      }
    },
    { passive: false }
  )
}

bindBtn('tb-meow', meow)

const camTouches: Record<number, { x: number; y: number }> = {}
let pinchDist = 0

renderer.domElement.addEventListener(
  'touchstart',
  function (e: TouchEvent) {
    if (game.state.mode !== 'play') return
    e.preventDefault()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      camTouches[t.identifier] = { x: t.clientX, y: t.clientY }
    }
    const ids = Object.keys(camTouches)
    if (ids.length === 2) {
      const a = camTouches[Number(ids[0])],
        b = camTouches[Number(ids[1])]
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  },
  { passive: false }
)

renderer.domElement.addEventListener(
  'touchmove',
  function (e: TouchEvent) {
    e.preventDefault()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]
      const prev = camTouches[t.identifier]
      if (!prev) continue
      const ids = Object.keys(camTouches)
      if (ids.length === 1) {
        cam.yaw -= (t.clientX - prev.x) * 0.006
        cam.pitch += (t.clientY - prev.y) * 0.0045
        cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch))
      }
      camTouches[t.identifier] = { x: t.clientX, y: t.clientY }
    }
    const ids = Object.keys(camTouches)
    if (ids.length === 2) {
      const a = camTouches[Number(ids[0])],
        b = camTouches[Number(ids[1])]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchDist > 0) cam.dist = Math.max(2.2, Math.min(4.5, cam.dist * (pinchDist / Math.max(1, d))))
      pinchDist = d
    }
  },
  { passive: false }
)

function camTouchEnd(e: TouchEvent) {
  for (let i = 0; i < e.changedTouches.length; i++) delete camTouches[e.changedTouches[i].identifier]
  pinchDist = 0
}
renderer.domElement.addEventListener('touchend', camTouchEnd)
renderer.domElement.addEventListener('touchcancel', camTouchEnd)

document.addEventListener('visibilitychange', function () {
  if (document.hidden && game.state.mode === 'play') game.setPaused(true)
})

document.addEventListener('pointerlockchange', function () {
  if (AUTO) return
  const locked = !!document.pointerLockElement
  if (!locked && game.state.mode === 'play') game.setPaused(true)
  if (locked && game.state.mode === 'play') game.setPaused(false)
})

document.getElementById('btn-play')?.addEventListener('click', function () {
  AudioSys.init()
  AudioSys.resume()
  AudioSys.click()
  game.start(DURATION)
  if (TOUCH) document.getElementById('touch-ui')?.classList.remove('hidden')
  setTimeout(function () {
    const hint = document.getElementById('hud-hint')
    if (hint) hint.style.opacity = '0.25'
  }, 14000)
  if (!AUTO && !TOUCH) {
    try {
      renderer.domElement.requestPointerLock()
    } catch {
      /* headless */
    }
  }
})

document.getElementById('btn-resume')?.addEventListener('click', function () {
  AudioSys.click()
  try {
    renderer.domElement.requestPointerLock()
  } catch {
    game.setPaused(false)
  }
})

// Stage 3.1: Перезапуск без location.reload()
document.getElementById('btn-restart')?.addEventListener('click', function () {
  AudioSys.click()
  game.start(DURATION)
})

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

let botT = 0,
  botSwipeT = 0.5,
  botMeowT = 4
function bot(dt: number) {
  botT -= dt
  if (botT <= 0) {
    botT = 0.9 + Math.random() * 1.2
    const f = Math.random() < 0.7
    const b = !f && Math.random() < 0.3
    const l = Math.random() < 0.4
    const r = Math.random() < 0.4
    const run = Math.random() < 0.5
    inputManager.setDirection(f, b, l, r, run)
    cam.yaw += (Math.random() - 0.5) * 1.6
  }
  if (Math.random() < dt * 0.6) inputManager.triggerJump()
  botSwipeT -= dt
  if (botSwipeT <= 0) {
    botSwipeT = 0.7 + Math.random() * 0.7
    game.trySwipe()
  }
  botMeowT -= dt
  if (botMeowT <= 0) {
    botMeowT = 5
    game.tryMeow()
  }
}

const tmpV = new THREE.Vector3()
function updateCamera(dt: number) {
  inputManager.setCamYaw(cam.yaw)
  const cp = cat.body.position
  tmpV.set(cp.x, cp.y + 0.55, cp.z)
  cam.smooth.lerp(tmpV, Math.min(1, 12 * dt))
  const cpch = Math.cos(cam.pitch),
    spch = Math.sin(cam.pitch)
  const ox = Math.sin(cam.yaw) * cpch * cam.dist
  const oy = spch * cam.dist
  const oz = Math.cos(cam.yaw) * cpch * cam.dist
  let px = cam.smooth.x + ox,
    py = cam.smooth.y + oy,
    pz = cam.smooth.z + oz
  const ddx = px - cam.smooth.x,
    ddy = py - cam.smooth.y,
    ddz = pz - cam.smooth.z
  const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz)
  if (dist > 0.001) {
    const ray = new CANNON.Ray(new CANNON.Vec3(cam.smooth.x, cam.smooth.y, cam.smooth.z), new CANNON.Vec3(px, py, pz))
    const res = new CANNON.RaycastResult()
    ray.intersectWorld(world, {
      mode: CANNON.Ray.CLOSEST,
      result: res,
      skipBackfaces: true,
      collisionFilterMask: 1
    })
    if (res.hasHit && res.distance < dist - 0.05) {
      const k = Math.max(0.35, res.distance - 0.18) / dist
      px = cam.smooth.x + ddx * k
      py = cam.smooth.y + ddy * k
      pz = cam.smooth.z + ddz * k
    }
  }
  camera.position.set(
    Math.max(-10.85, Math.min(10.85, px)),
    Math.max(0.3, Math.min(2.6, py)),
    Math.max(-4.35, Math.min(4.35, pz))
  )
  const lookX = cam.smooth.x,
    lookY = cam.smooth.y,
    lookZ = cam.smooth.z
  const sh = game.state.shake
  if (sh > 0) {
    camera.lookAt(
      lookX + (Math.random() - 0.5) * sh * 0.12,
      lookY + (Math.random() - 0.5) * sh * 0.12,
      lookZ + (Math.random() - 0.5) * sh * 0.12
    )
  } else {
    camera.lookAt(lookX, lookY, lookZ)
  }
  const st = game.state
  const inp = inputManager.getInput()
  const wantFov = inp.run && (inp.f || inp.b || inp.l || inp.r) && st.mode === 'play' ? 67 : 62
  if (Math.abs(camera.fov - wantFov) > 0.05) {
    camera.fov += (wantFov - camera.fov) * Math.min(1, 6 * dt)
    camera.updateProjectionMatrix()
  }
}

function syncMeshes() {
  for (const p of propsSys.props) {
    if (p.broken && !p.keepMeshOnBreak && p.name !== "телевизор") continue
    p.mesh.position.copy(p.body.position as any)
    p.mesh.quaternion.copy(p.body.quaternion as any)
  }
  for (const tr of propsSys.transients) {
    if (!tr.body) continue
    tr.mesh.position.copy(tr.body.position as any)
    tr.mesh.quaternion.copy(tr.body.quaternion as any)
  }
  cat.sync()
}

let last = performance.now()
let hitStopUntil = 0
;(window as any).CANNON = CANNON
;(window as any).THREE = THREE

window.KOTO = window.KOTO || {}
window.KOTO.hitStop = function (ms: number) {
  hitStopUntil = performance.now() + (ms || 35)
}
;(window.KOTO as any).setIdleStillTimer = function (v: number) {
  idleStillTimer = v
}

const portraitCanvas = document.getElementById('hud-cat-portrait') as HTMLCanvasElement | null
const portraitCtx = portraitCanvas?.getContext('2d')
let portraitTimer = 0

function updateCatPortrait(dt: number) {
  if (!portraitCtx || !portraitCanvas) return
  portraitTimer += dt
  if (portraitTimer < 0.08) return
  portraitTimer = 0

  const ctx = portraitCtx
  ctx.clearRect(0, 0, 64, 64)

  const isInBox = !!(window as any)?.KOTO?.catInBox
  const isScared = cat.scaredT > 0 && !isInBox
  const isMeow = cat.meowT > 0
  const isRunning = inputManager.getInput().run && !isInBox
  const isPurring = idleStillTimer >= 8.0 || isInBox

  ctx.save()
  // Фон
  ctx.beginPath()
  ctx.arc(32, 32, 30, 0, Math.PI * 2)
  ctx.fillStyle = isScared ? '#5e1b1b' : (isMeow ? '#2b4d24' : (isPurring ? '#2e253e' : '#1b2234'))
  ctx.fill()

  // Ушки
  ctx.fillStyle = '#d36c2a'
  ctx.beginPath(); ctx.moveTo(14, 24); ctx.lineTo(10, 6); ctx.lineTo(24, 16); ctx.fill()
  ctx.beginPath(); ctx.moveTo(50, 24); ctx.lineTo(54, 6); ctx.lineTo(40, 16); ctx.fill()
  ctx.fillStyle = '#ffb3a7'
  ctx.beginPath(); ctx.moveTo(15, 22); ctx.lineTo(12, 10); ctx.lineTo(22, 16); ctx.fill()
  ctx.beginPath(); ctx.moveTo(49, 22); ctx.lineTo(52, 10); ctx.lineTo(42, 16); ctx.fill()

  // Голова
  ctx.fillStyle = '#e87d3e'
  ctx.beginPath(); ctx.ellipse(32, 35, 20, 17, 0, 0, Math.PI * 2); ctx.fill()

  // Глаза
  if (isScared) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(24, 32, 6, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 32, 6, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#000000'
    ctx.beginPath(); ctx.arc(24, 32, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 32, 2.5, 0, Math.PI * 2); ctx.fill()
  } else if (cat.isBlinking) {
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(19, 33); ctx.lineTo(29, 33); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(35, 33); ctx.lineTo(45, 33); ctx.stroke()
  } else if (isPurring) {
    // Блаженные прищуренные глазки мурчащего кота ^_^
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 2.2
    ctx.beginPath(); ctx.arc(24, 33, 4.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
    ctx.beginPath(); ctx.arc(40, 33, 4.5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke()
    // Румянец
    ctx.fillStyle = 'rgba(255, 120, 150, 0.45)'
    ctx.beginPath(); ctx.arc(17, 37, 3.2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(47, 37, 3.2, 0, Math.PI * 2); ctx.fill()
    // Маленькая нотка или коробка над головой
    ctx.font = isInBox ? '13px sans-serif' : '11px sans-serif'
    ctx.fillStyle = isInBox ? '#ffffff' : '#ffdf7e'
    ctx.fillText(isInBox ? '📦' : '♪', 43, 20)
  } else if (isRunning) {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.ellipse(24, 32, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.ellipse(40, 32, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#2e8b57'
    ctx.beginPath(); ctx.arc(25, 32, 2, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(39, 32, 2, 0, Math.PI * 2); ctx.fill()
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.beginPath(); ctx.arc(24, 32, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 32, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#3eb56b'
    ctx.beginPath(); ctx.arc(24, 32, 3, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 32, 3, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#000'
    ctx.beginPath(); ctx.arc(24, 32, 1.8, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(40, 32, 1.8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(23, 31, 1, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(39, 31, 1, 0, Math.PI * 2); ctx.fill()
  }

  // Носик
  ctx.fillStyle = '#ff8fab'
  ctx.beginPath(); ctx.moveTo(30, 38); ctx.lineTo(34, 38); ctx.lineTo(32, 41); ctx.fill()

  // Ротик
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 1.5
  if (isMeow) {
    ctx.fillStyle = '#d63447'
    ctx.beginPath(); ctx.arc(32, 43, 4, 0, Math.PI); ctx.fill(); ctx.stroke()
  } else if (isPurring) {
    // Довольная кошачья мордочка :3
    ctx.beginPath()
    ctx.moveTo(26, 42); ctx.quadraticCurveTo(29, 44, 32, 42)
    ctx.quadraticCurveTo(35, 44, 38, 42)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(27, 42); ctx.quadraticCurveTo(32, 45, 32, 41)
    ctx.quadraticCurveTo(32, 45, 37, 42)
    ctx.stroke()
  }

  // Усики
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(12, 38); ctx.lineTo(24, 39); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(11, 43); ctx.lineTo(24, 41); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(52, 38); ctx.lineTo(40, 39); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(53, 43); ctx.lineTo(40, 41); ctx.stroke()

  ctx.restore()
}

const FIXED_DT = 1 / 60
let accumulator = 0
const IDLE_INPUT = { f: false, b: false, l: false, r: false, run: false, jump: false, camYaw: -Math.PI / 2 }

let dripTimer = 1.8
let tvSoundTimer = 1.0
let aquaTimer = 2.0
let vacSputterTimer = 0.5
let clockTimer = 0.8
let purrTimer = 0
let idleStillTimer = 0
let lastCatX = 0, lastCatZ = 0
let clockTickTock = false

function updateProximityAudio(dt: number) {
  if (game.state.mode !== 'play' || game.state.paused || !cat || !cat.body) return
  const cp = cat.body.position

  // Мурчание котика при отдыхе без движения > 8.0 сек или внутри коробки
  const isInBox = !!(window as any)?.KOTO?.catInBox
  const moved = Math.hypot(cp.x - lastCatX, cp.z - lastCatZ)
  lastCatX = cp.x
  lastCatZ = cp.z
  const PURR_IDLE_SECS = 8.0
  if (moved < 0.02 || isInBox) {
    const wasIdle = idleStillTimer >= PURR_IDLE_SECS
    idleStillTimer += dt * (isInBox ? 2.5 : 1.0)
    if (idleStillTimer >= PURR_IDLE_SECS) {
      if (!wasIdle) {
        // Первый вдох-выдох мурлыканья сразу по достижении 8 сек
        purrTimer = 0
        AudioSys.purr(0.15)
      } else {
        purrTimer += dt
        if (purrTimer >= 2.2) {
          purrTimer = 0
          AudioSys.purr(0.15)
        }
      }
    }
  } else {
    if (idleStillTimer >= PURR_IDLE_SECS) {
      AudioSys.stopPurr()
    }
    idleStillTimer = 0
    purrTimer = 0
  }
  if (window.KOTO) (window.KOTO as any).idleStillTimer = idleStillTimer

  // 1. Ванная: капающая вода около ванны/раковины
  const dWater = Math.min(Math.hypot(cp.x - 0.9, cp.z - 4.0), Math.hypot(cp.x - 6.2, cp.z - 1.3))
  if (dWater < 2.5) {
    dripTimer += dt
    if (dripTimer > 3.0) {
      dripTimer = 0
      const vol = (1 - dWater / 2.5) * 0.12
      AudioSys.waterDrip(vol)
    }
  } else {
    dripTimer = Math.min(dripTimer, 2.0)
  }

  // 2. Телевизор в гостиной
  const dTv = Math.hypot(cp.x - (-2.0), cp.z - 0.9)
  if (dTv < 2.8) {
    tvSoundTimer += dt
    const tv = propsSys.props.find((p: any) => p.name === 'телевизор')
    const isBroken = tv ? tv.broken : false
    const interval = isBroken ? 0.9 : 1.6
    if (tvSoundTimer > interval) {
      tvSoundTimer = 0
      const vol = (1 - dTv / 2.8) * (isBroken ? 0.08 : 0.11)
      AudioSys.tvAudio(isBroken, vol)
    }
  } else {
    tvSoundTimer = Math.min(tvSoundTimer, 1.0)
  }

  // 3. Сломанный робот-пылесос
  if (propsSys.vacuum && propsSys.vacuum.broken) {
    const vp = propsSys.vacuum.pos
    const dVac = Math.hypot(cp.x - vp.x, cp.z - vp.z)
    if (dVac < 3.2) {
      vacSputterTimer += dt
      if (vacSputterTimer > 0.8) {
        vacSputterTimer = 0
        const vol = (1 - dVac / 3.2) * 0.14
        AudioSys.vacuumSputter(vol)
      }
    }
  }

  // 4. Аквариум на кухне
  const aqua = propsSys.props.find((p: any) => p.name === 'аквариум')
  if (aqua && !aqua.broken) {
    const dAqua = Math.hypot(cp.x - 5.4, cp.z - (-4.2))
    if (dAqua < 2.2) {
      aquaTimer += dt
      if (aquaTimer > 2.8) {
        aquaTimer = 0
        const vol = (1 - dAqua / 2.2) * 0.12
        AudioSys.aquariumBubble(vol)
      }
    }
  }

  // 5. Настенные часы в гостиной
  const dClock = Math.hypot(cp.x - (-4.5), cp.z - 4.46)
  if (dClock < 2.0) {
    clockTimer += dt
    if (clockTimer > 1.0) {
      clockTimer = 0
      clockTickTock = !clockTickTock
      const vol = (1 - dClock / 2.0) * 0.08
      AudioSys.clockTick(clockTickTock, vol)
    }
  }
}

function loop(now: number): void {
  requestAnimationFrame(loop)

  // FIX BUG-08: сбрасываем last при возобновлении после hitStop
  if (now < hitStopUntil) {
    renderer.render(scene, camera)
    last = now
    return
  }

  const dt = Math.min((now - last) / 1000, 0.05)
  last = now
  currentFrame++
  if (window.KOTO) window.KOTO.currentFrame = currentFrame

  const st = game.state
  if (!st.paused) {
    if (st.mode === 'play' && BOT) bot(dt)
    if (TOUCH && joy.id !== null) {
      inputManager.setDirection(
        joy.y < -0.35,
        joy.y > 0.35,
        joy.x < -0.35,
        joy.x > 0.35,
        joy.mag > 0.92
      )
    }

    const currentInput = st.mode === 'play' ? inputManager.getInput() : IDLE_INPUT

    accumulator += dt
    while (accumulator >= FIXED_DT) {
      world.step(FIXED_DT)
      accumulator -= FIXED_DT
    }

    cat.update(dt, currentInput as any)
    propsSys.update(dt)
    apt.update(dt)
    updateProximityAudio(dt)
    inputManager.consumeJump()
  }

  syncMeshes()
  game.update(dt)
  updateCamera(dt)
  updateCatPortrait(dt)

  // GR-04: Постобработка (хроматическая аберрация при панике, bloom при хаосе)
  document.body.classList.toggle('panic-active', cat.scaredT > 0)
  document.body.classList.toggle('bloom-active', game.state.combo >= 50 || game.state.ultraChaos)

  renderer.render(scene, camera)
}

if (AUTO) {
  document.getElementById('screen-start')?.classList.add('hidden')
  if (TOUCH) document.getElementById('touch-ui')?.classList.remove('hidden')
  game.start(DURATION)
}

;(window as any).__dbg = {
  cam: cam,
  camera: camera,
  world: world,
  input: inputManager.getInput(),
  apt: apt
}

requestAnimationFrame(loop)
