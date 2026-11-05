"use strict";

(function () {
  const params = new URLSearchParams(location.search);
  const AUTO = params.has("autostart");
  const BOT = params.has("bot");
  const DURATION = Math.max(5, parseInt(params.get("t") || "60", 10) || 60);

  const container = document.getElementById("game");
  const FAST = params.has("fast"); // тесты: ускоренный рендер без теней
  const renderer = new THREE.WebGLRenderer({ antialias: !FAST });
  renderer.setPixelRatio(FAST ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !FAST;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b0e18");
  scene.fog = new THREE.Fog("#0b0e18", 20, 42);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 60);

  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;

  const apt = buildApartment(scene, world);
  const propsSys = buildProps(scene, world, apt);
  KOTO.propsSys = propsSys;
  KOTO.apt = apt;

  const cat = createCat(scene, world, apt.M, { x: -3.35, y: 0.26, z: 1.6 });
  cat.yaw = Math.PI / 2;
  KOTO.cat = cat;

  for (let i = 0; i < 90; i++) world.step(1 / 60);
  propsSys.props.forEach(function (p) { p.body.sleep(); });

  KOTO.game.init({ scene: scene, world: world, camera: camera, renderer: renderer, cat: cat, L: apt.L, apt: apt });

  // отладка: открыть все двери (регрессионные прогоны старых сценариев)
  if (params.get("unlock") === "all") {
    Object.keys(apt.doors).forEach(function (id) { apt.doors[id].open(true); });
  }

  const input = { f: false, b: false, l: false, r: false, run: false, jump: false, camYaw: -Math.PI / 2 };
  const IDLE = { f: false, b: false, l: false, r: false, run: false, jump: false, camYaw: input.camYaw };
  const cam = { yaw: -Math.PI / 2, pitch: 0.42, dist: 3.1, smooth: new THREE.Vector3(-3.35, 0.55, 1.6) };
  const TOUCH = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0 && window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  if (TOUCH) document.body.classList.add("touch");

  if (TOUCH) {
    const hintEl = document.getElementById("hud-hint");
    if (hintEl) hintEl.textContent = "джойстик — бегать • до края — рывок • свайп — камера • щепотка — зум";
    const grid = document.querySelector("#screen-start .controls-grid");
    if (grid) {
      grid.innerHTML =
        '<div><b>джойстик слева</b><span>бегать, до края — рывок</span></div>' +
        '<div><b>свайп по экрану</b><span>камера, щепотка — зум</span></div>' +
        '<div><b>ЛАПА</b><span>удар лапой, точить когти</span></div>' +
        '<div><b>МЯУ / ПРЫЖОК</b><span>кнопки справа</span></div>';
    }
  }

  const KEYMAP = {
    KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b",
    KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r"
  };

  document.addEventListener("keydown", function (e) {
    if (e.code === "Space") { input.jump = true; e.preventDefault(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.run = true;
    const k = KEYMAP[e.code];
    if (k) { input[k] = true; e.preventDefault(); }
    if (e.code === "KeyQ") swipe();
    if (e.code === "KeyE" || e.code === "KeyM") meow();
  });
  document.addEventListener("keyup", function (e) {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.run = false;
    const k = KEYMAP[e.code];
    if (k) input[k] = false;
  });

  let swipeCd = 0;
  function swipe() {
    const now = performance.now();
    if (now - swipeCd < 320) return;
    swipeCd = now;
    KOTO.game.trySwipe();
  }
  function meow() { KOTO.game.tryMeow(); }

  renderer.domElement.addEventListener("mousedown", function () {
    const st = KOTO.game.state;
    if (st.mode !== "play") return;
    if (!document.pointerLockElement && !AUTO) {
      try { renderer.domElement.requestPointerLock(); } catch (e) { /* headless */ }
      return;
    }
    swipe();
  });
  document.addEventListener("mousemove", function (e) {
    if (!document.pointerLockElement) return;
    cam.yaw -= e.movementX * 0.003;
    cam.pitch += e.movementY * 0.0025;
    cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch));
  });
  document.addEventListener("wheel", function (e) {
    cam.dist = Math.max(2.2, Math.min(4.5, cam.dist + e.deltaY * 0.0015));
  }, { passive: true });

  // ---------- сенсорное управление: джойстик ----------
  const joy = { id: null, bx: 0, by: 0, x: 0, y: 0, mag: 0 };
  const JOY_R = 52;
  const joyZone = document.getElementById("joy-zone");
  const joyBase = document.getElementById("joy-base");
  const joyKnob = document.getElementById("joy-knob");
  function joyMove(t) {
    let dx = t.clientX - joy.bx, dy = t.clientY - joy.by;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
    joyKnob.style.transform = "translate(-50%, -50%) translate(" + dx + "px," + dy + "px)";
    joy.x = dx / JOY_R;
    joy.y = dy / JOY_R;
    joy.mag = Math.min(1, Math.hypot(joy.x, joy.y));
  }
  joyZone.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (joy.id !== null) return;
    const t = e.changedTouches[0];
    joy.id = t.identifier;
    joy.bx = t.clientX;
    joy.by = t.clientY;
    joy.x = 0; joy.y = 0; joy.mag = 0;
    joyBase.classList.remove("hidden");
    joyBase.style.left = t.clientX + "px";
    joyBase.style.top = t.clientY + "px";
    joyKnob.style.transform = "translate(-50%, -50%)";
  }, { passive: false });
  joyZone.addEventListener("touchmove", function (e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.id) joyMove(e.changedTouches[i]);
    }
  }, { passive: false });
  function joyEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joy.id) {
        joy.id = null; joy.x = 0; joy.y = 0; joy.mag = 0;
        input.f = input.b = input.l = input.r = input.run = false;
        joyBase.classList.add("hidden");
      }
    }
  }
  joyZone.addEventListener("touchend", joyEnd);
  joyZone.addEventListener("touchcancel", joyEnd);

  // ---------- сенсорное управление: кнопки ----------
  function bindBtn(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener("touchstart", function (e) { e.preventDefault(); fn(); }, { passive: false });
    el.addEventListener("mousedown", fn);
  }
  bindBtn("tb-jump", function () { input.jump = true; });
  bindBtn("tb-swipe", swipe);
  bindBtn("tb-meow", meow);

  // ---------- сенсорное управление: камера (орбита + щепотка) ----------
  const camTouches = {};
  let pinchDist = 0;
  renderer.domElement.addEventListener("touchstart", function (e) {
    if (KOTO.game.state.mode !== "play") return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      camTouches[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    const ids = Object.keys(camTouches);
    if (ids.length === 2) {
      const a = camTouches[ids[0]], b = camTouches[ids[1]];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }, { passive: false });
  renderer.domElement.addEventListener("touchmove", function (e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const prev = camTouches[t.identifier];
      if (!prev) continue;
      const ids = Object.keys(camTouches);
      if (ids.length === 1) {
        cam.yaw -= (t.clientX - prev.x) * 0.006;
        cam.pitch += (t.clientY - prev.y) * 0.0045;
        cam.pitch = Math.max(0.05, Math.min(1.2, cam.pitch));
      }
      camTouches[t.identifier] = { x: t.clientX, y: t.clientY };
    }
    const ids = Object.keys(camTouches);
    if (ids.length === 2) {
      const a = camTouches[ids[0]], b = camTouches[ids[1]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) cam.dist = Math.max(2.2, Math.min(4.5, cam.dist * (pinchDist / Math.max(1, d))));
      pinchDist = d;
    }
  }, { passive: false });
  function camTouchEnd(e) {
    for (let i = 0; i < e.changedTouches.length; i++) delete camTouches[e.changedTouches[i].identifier];
    pinchDist = 0;
  }
  renderer.domElement.addEventListener("touchend", camTouchEnd);
  renderer.domElement.addEventListener("touchcancel", camTouchEnd);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && KOTO.game.state.mode === "play") KOTO.game.setPaused(true);
  });

  document.addEventListener("pointerlockchange", function () {
    if (AUTO) return;
    const locked = !!document.pointerLockElement;
    if (!locked && KOTO.game.state.mode === "play") KOTO.game.setPaused(true);
    if (locked && KOTO.game.state.mode === "play") KOTO.game.setPaused(false);
  });

  document.getElementById("btn-play").addEventListener("click", function () {
    AudioSys.init();
    AudioSys.resume();
    AudioSys.click();
    KOTO.game.start(DURATION);
    if (TOUCH) document.getElementById("touch-ui").classList.remove("hidden");
    setTimeout(function () { document.getElementById("hud-hint").style.opacity = "0.25"; }, 14000);
    if (!AUTO && !TOUCH) { try { renderer.domElement.requestPointerLock(); } catch (e) { /* нет pointer lock — играем так */ } }
  });
  document.getElementById("btn-resume").addEventListener("click", function () {
    AudioSys.click();
    try { renderer.domElement.requestPointerLock(); } catch (e) { KOTO.game.setPaused(false); }
  });
  document.getElementById("btn-restart").addEventListener("click", function () { location.reload(); });

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let botT = 0, botSwipeT = 0.5, botMeowT = 4;
  function bot(dt) {
    botT -= dt;
    if (botT <= 0) {
      botT = 0.9 + Math.random() * 1.2;
      input.f = Math.random() < 0.7;
      input.b = !input.f && Math.random() < 0.3;
      input.l = Math.random() < 0.4;
      input.r = Math.random() < 0.4;
      input.run = Math.random() < 0.5;
      cam.yaw += (Math.random() - 0.5) * 1.6;
    }
    if (Math.random() < dt * 0.6) input.jump = true;
    botSwipeT -= dt;
    if (botSwipeT <= 0) { botSwipeT = 0.7 + Math.random() * 0.7; KOTO.game.trySwipe(); }
    botMeowT -= dt;
    if (botMeowT <= 0) { botMeowT = 5; KOTO.game.tryMeow(); }
  }

  const tmpV = new THREE.Vector3();
  function updateCamera(dt) {
    input.camYaw = cam.yaw;
    const cp = cat.body.position;
    tmpV.set(cp.x, cp.y + 0.55, cp.z);
    cam.smooth.lerp(tmpV, Math.min(1, 12 * dt));
    const cpch = Math.cos(cam.pitch), spch = Math.sin(cam.pitch);
    const ox = Math.sin(cam.yaw) * cpch * cam.dist;
    const oy = spch * cam.dist;
    const oz = Math.cos(cam.yaw) * cpch * cam.dist;
    let px = cam.smooth.x + ox, py = cam.smooth.y + oy, pz = cam.smooth.z + oz;
    const ddx = px - cam.smooth.x, ddy = py - cam.smooth.y, ddz = pz - cam.smooth.z;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
    if (dist > 0.001) {
      const ray = new CANNON.Ray(
        new CANNON.Vec3(cam.smooth.x, cam.smooth.y, cam.smooth.z),
        new CANNON.Vec3(px, py, pz)
      );
      const res = new CANNON.RaycastResult();
      ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true, collisionFilterMask: 1 });
      if (res.hasHit && res.distance < dist - 0.05) {
        const k = Math.max(0.35, res.distance - 0.18) / dist;
        px = cam.smooth.x + ddx * k;
        py = cam.smooth.y + ddy * k;
        pz = cam.smooth.z + ddz * k;
      }
    }
    camera.position.set(
      Math.max(-10.85, Math.min(10.85, px)),
      Math.max(0.3, Math.min(2.6, py)),
      Math.max(-4.35, Math.min(4.35, pz))
    );
    const lookX = cam.smooth.x, lookY = cam.smooth.y, lookZ = cam.smooth.z;
    const sh = KOTO.game.state.shake;
    if (sh > 0) {
      camera.lookAt(
        lookX + (Math.random() - 0.5) * sh * 0.12,
        lookY + (Math.random() - 0.5) * sh * 0.12,
        lookZ + (Math.random() - 0.5) * sh * 0.12
      );
    } else {
      camera.lookAt(lookX, lookY, lookZ);
    }
    const st = KOTO.game.state;
    const wantFov = (input.run && (input.f || input.b || input.l || input.r) && st.mode === "play") ? 67 : 62;
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov += (wantFov - camera.fov) * Math.min(1, 6 * dt);
      camera.updateProjectionMatrix();
    }
  }

  function syncMeshes() {
    for (const p of propsSys.props) {
      if (p.broken) continue;
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
    }
    for (const tr of propsSys.transients) {
      if (!tr.body) continue;
      tr.mesh.position.copy(tr.body.position);
      tr.mesh.quaternion.copy(tr.body.quaternion);
    }
    cat.sync();
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) dt = 0.001;
    const st = KOTO.game.state;
    if (!st.paused) {
      if (st.mode === "play" && BOT) bot(dt);
      if (TOUCH && joy.id !== null) {
        input.f = joy.y < -0.35;
        input.b = joy.y > 0.35;
        input.l = joy.x < -0.35;
        input.r = joy.x > 0.35;
        input.run = joy.mag > 0.92;
      }
      const inp = st.mode === "play" ? input : IDLE;
      world.step(1 / 60, dt, 3);
      cat.update(dt, inp);
      propsSys.update(dt);
      apt.update(dt);
      input.jump = false;
    }
    syncMeshes();
    KOTO.game.update(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  }

  if (AUTO) {
    document.getElementById("screen-start").classList.add("hidden");
    if (TOUCH) document.getElementById("touch-ui").classList.remove("hidden");
    KOTO.game.start(DURATION);
  }

  window.__dbg = { cam: cam, camera: camera, world: world, input: input, apt: apt };

  requestAnimationFrame(loop);
})();
