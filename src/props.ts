import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import AudioSys from './audio'
import levels from './levels'
import { bus } from './events'
import { artTexture } from './world'
import type { Prop } from './types/game'

declare const KOTO: any

export function buildProps(scene: any, world: any, apt: any) {
  const M = apt.M, L = apt.L, std = apt.std;
  const props: Prop[] = [];
  const hangProps: Prop[] = [];
  const transients: any[] = [];
  const scratchTargets: any[] = [];
  const fish: any = { body: null, mesh: null, t: 0, alive: false };

  function cylShapeY(r: number, h: number) {
    return new CANNON.Cylinder(r, r, h, 10);
  }

  // события мира для counter-квестов (game.js обрабатывает в onWorldEvent)
  function notify(type: string, x: number, z: number, prop?: Prop) {
    if (typeof window !== 'undefined' && window.KOTO && window.KOTO.game && window.KOTO.game.onWorldEvent) {
      window.KOTO.game.onWorldEvent(type, x, z, prop);
    }
  }

  function register(name: string, value: number, group: any, shape: any, x: number, y: number, z: number, opts: any = {}) {
    opts = opts || {};
    const body = new CANNON.Body({ mass: opts.mass || 0.4, material: M.prop });
    body.addShape(shape);
    body.position.set(x, y, z);
    if (opts.quat) body.quaternion.copy(opts.quat);
    if (opts.yaw) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), opts.yaw);
    body.allowSleep = true;
    body.sleepSpeedLimit = 0.25;
    body.sleepTimeLimit = 0.4;
    body.linearDamping = 0.01;
    body.angularDamping = 0.05;
    world.addBody(body);
    group.traverse(function (o: any) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);
    const prop: Prop = {
      name: name, value: value, mesh: group, body: body,
      breakable: !!opts.breakable, breakVel: opts.breakVel || 2.4,
      shardColor: opts.shardColor || "#cccccc",
      broken: false, scoreCd: 0, mass: opts.mass || 0.4,
      onBreak: opts.onBreak || null, onScore: opts.onScore || null,
      hang: !!opts.hang, released: false,
      room: levels.roomOf(x, z),
      initialPosition: new CANNON.Vec3(x, y, z),
      initialQuaternion: new CANNON.Quaternion().copy(body.quaternion),
      keepMeshOnBreak: !!opts.keepMeshOnBreak
    };
    body.addEventListener("collide", function (e: any) {
      if (!e.contact || prop.broken) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (prop.name === "телевизор" && v > 0.5 && typeof tvCartoon !== "undefined") {
        tvCartoon.glitch(0.35);
      }
      const other = e.body;
      const catBody = typeof window !== 'undefined' && window.KOTO && window.KOTO.cat ? window.KOTO.cat.body : null;
      const isStrike = !!(other && other !== catBody && other.material === M.prop);
      bus.emit('prop:impact', { prop, velocity: v, isStrike });
    });
    props.push(prop);
    if (prop.hang) hangProps.push(prop);
    return prop;
  }

  function boxShape(x, y, z) { return new CANNON.Box(new CANNON.Vec3(x, y, z)); }

  // ---------- мелкие сборщики мешей ----------
  function meshCup(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.095, 24), std(color, 0.15, 0.05)));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 16, Math.PI), std(color, 0.15, 0.05));
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0.042, 0, 0);
    g.add(handle);
    return g;
  }
  function meshPlate() {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.024, 32), std("#f8f8f5", 0.12, 0.05));
    g.add(p);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 8, 32), std("#f8f8f5", 0.12, 0.05));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.012;
    g.add(rim);
    return g;
  }
  function meshBottle(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.22, 24), std(color, 0.12, 0.1)));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 0.08, 20), std(color, 0.12, 0.1));
    neck.position.y = 0.15;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 12), std("#b08a55", 0.8));
    cork.position.y = 0.2;
    g.add(cork);
    return g;
  }
  function meshBook(color) {
    const g = new THREE.Group();
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.18), std(color, 0.8));
    g.add(cover);
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.165), std("#efe8d5", 0.9));
    pages.position.x = 0.004;
    g.add(pages);
    return g;
  }
  function meshVase(h, r, color) {
    const g = new THREE.Group();
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 24), new THREE.MeshStandardMaterial({ color: color, roughness: 0.12, metalness: 0.08, transparent: true, opacity: 0.65 }));
    g.add(v);
    return g;
  }

  // ---------- спавнер осколков и мусора ----------
  function spawnShards(pos: CANNON.Vec3 | { x: number; y: number; z: number }, color: string, n: number, baseVel?: CANNON.Vec3) {
    const roomId = levels.roomOf(pos.x, pos.z) || 'living';
    const aabb = levels.info(roomId).aabb;
    for (let i = 0; i < n; i++) {
      const s = 0.035 + Math.random() * 0.055;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), std(color, 0.3));
      mesh.castShadow = true;
      const body = new CANNON.Body({ mass: 0.05, material: M.prop });
      body.addShape(boxShape(s / 2, s * 0.3, s / 2));
      const spawnX = Math.max(aabb.x1 + 0.1, Math.min(aabb.x2 - 0.1, pos.x + (Math.random() - 0.5) * 0.14));
      const spawnZ = Math.max(aabb.z1 + 0.1, Math.min(aabb.z2 - 0.1, pos.z + (Math.random() - 0.5) * 0.14));
      body.position.set(spawnX, pos.y + Math.random() * 0.1, spawnZ);
      if (baseVel) body.velocity.copy(baseVel);
      body.velocity.x += (Math.random() - 0.5) * 1.6;
      body.velocity.y += Math.random() * 2.2;
      body.velocity.z += (Math.random() - 0.5) * 1.6;
      body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      body.allowSleep = true;
      world.addBody(body);
      scene.add(mesh);
      transients.push({ mesh: mesh, body: body, t: 0, life: 4 });
    }
  }

  // ищет ближайшую открытую точку пола: по вертикальному лучу сверху не должно быть ничего выше y 0.2
  function findOpenFloorSpot(x: number, z: number) {
    const roomId = levels.roomOf(x, z) || 'kitchen';
    const aabb = levels.info(roomId).aabb;
    const offs = [[0, 0], [0, 0.35], [0.35, 0], [-0.35, 0], [0, 0.7], [0.5, 0.5], [-0.5, 0.5], [0, 1.05], [0.85, 0.85], [-0.85, 0.85], [1.3, 0], [-1.3, 0]];
    for (let i = 0; i < offs.length; i++) {
      const cx = Math.max(aabb.x1 + 0.3, Math.min(aabb.x2 - 0.3, x + offs[i][0]));
      const cz = Math.max(aabb.z1 + 0.3, Math.min(aabb.z2 - 0.3, z + offs[i][1]));
      const ray = new CANNON.Ray(new CANNON.Vec3(cx, 2.0, cz), new CANNON.Vec3(cx, 0, cz));
      const res = new CANNON.RaycastResult();
      ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true, collisionFilterMask: 1 });
      if (res.hasHit && res.hitPointWorld.y < 0.2) return { x: cx, z: cz };
    }
    return { x: x, z: Math.min(aabb.z2 - 0.3, z + 0.4) };
  }

  const puddles = [
    { x: 0.9, z: 4.0, r: 0.85 } // ванна с водой
  ];

  function spawnWaterDecal(x, z, r) {
    const rad = r || 0.3;
    const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 28), new THREE.MeshStandardMaterial({
      color: "#4a92d8", transparent: true, opacity: 0.68, roughness: 0.04, metalness: 0.12
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015 + Math.random() * 0.004, z);
    m.receiveShadow = true;
    scene.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(rad * 0.88, rad, 28), new THREE.MeshBasicMaterial({
      color: "#99d0ff", transparent: true, opacity: 0.45, depthWrite: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.016, z);
    scene.add(ring);
    transients.push({ mesh: m, body: null, t: 0, life: 60 });
    transients.push({
      mesh: ring, body: null, t: 0, life: 60,
      onUpdate: function (tr, dt) {
        tr.mesh.scale.setScalar(1 + Math.sin(tr.t * 3) * 0.02);
      }
    });
    puddles.push({ x: x, z: z, r: rad });
  }

  function spawnDust(x, y, z, count) {
    const n = count || 4;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.CircleGeometry(0.04 + Math.random() * 0.03, 8);
      const mat = new THREE.MeshBasicMaterial({ color: "#d2c8b8", transparent: true, opacity: 0.45, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      m.position.set(x + (Math.random() - 0.5) * 0.16, (y || 0.04) + Math.random() * 0.02, z + (Math.random() - 0.5) * 0.16);
      scene.add(m);
      transients.push({
        mesh: m, body: null, t: 0, life: 0.55 + Math.random() * 0.2,
        onUpdate: function (tr, dt) {
          tr.mesh.scale.multiplyScalar(1 + dt * 2.5);
          tr.mesh.position.y += 0.22 * dt;
          tr.mesh.material.opacity = Math.max(0, (1 - tr.t / tr.life) * 0.45);
        }
      });
    }
  }

  function spawnSparks(x, y, z, count) {
    const n = count || 12;
    for (let i = 0; i < n; i++) {
      const s = 0.022 + Math.random() * 0.022;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color: Math.random() > 0.35 ? "#ffe600" : "#ff8800" }));
      m.position.set(x, y, z);
      scene.add(m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4.8, 1.2 + Math.random() * 3.6, (Math.random() - 0.5) * 4.8);
      transients.push({
        mesh: m, body: null, t: 0, life: 0.35 + Math.random() * 0.2, vel: vel,
        onUpdate: function (tr, dt) {
          tr.mesh.position.addScaledVector(tr.vel, dt);
          tr.vel.y -= 14 * dt;
          tr.mesh.scale.setScalar(Math.max(0.1, 1 - tr.t / tr.life));
        }
      });
    }
  }

  function spawnSplashes(x, y, z, count) {
    const n = count || 12;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
      const mat = new THREE.MeshBasicMaterial({ color: "#60a5fa", transparent: true, opacity: 0.8, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.12, (y || 0.05) + Math.random() * 0.05, z + (Math.random() - 0.5) * 0.12);
      scene.add(m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2.8, 1.2 + Math.random() * 2.8, (Math.random() - 0.5) * 2.8);
      transients.push({
        mesh: m, body: null, t: 0, life: 0.45 + Math.random() * 0.2, vel: vel,
        onUpdate: function (tr, dt) {
          tr.mesh.position.addScaledVector(tr.vel, dt);
          tr.vel.y -= 12 * dt;
          if (tr.mesh.position.y < 0.015) { tr.mesh.position.y = 0.015; tr.vel.set(0, 0, 0); }
          tr.mesh.material.opacity = Math.max(0, (1 - tr.t / tr.life) * 0.8);
        }
      });
    }
  }

  function spawnFeathers(x, y, z, count) {
    const n = count || 8;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.BoxGeometry(0.045, 0.004, 0.075);
      const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.95, transparent: true, opacity: 0.9, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.25, (y || 0.1) + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.25);
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      scene.add(m);
      const seed = Math.random() * 10;
      transients.push({
        mesh: m, body: null, t: 0, life: 1.8 + Math.random() * 0.6, seed: seed,
        onUpdate: function (tr, dt) {
          tr.mesh.position.y -= 0.35 * dt;
          tr.mesh.position.x += Math.sin(tr.t * 6 + tr.seed) * 0.28 * dt;
          tr.mesh.position.z += Math.cos(tr.t * 5 + tr.seed) * 0.28 * dt;
          tr.mesh.rotation.x += dt * 1.5;
          tr.mesh.rotation.y += dt * 2.0;
          if (tr.mesh.position.y < 0.015) {
            tr.mesh.position.y = 0.015;
            tr.life = Math.min(tr.life, tr.t + 0.4);
          }
          tr.mesh.material.opacity = Math.max(0, (1 - tr.t / tr.life) * 0.9);
        }
      });
    }
  }

  function spawnPawPrint(x, z, yaw) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: "#324456", transparent: true, opacity: 0.45, depthWrite: false });
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.024, 8), mat);
    pad.rotation.x = -Math.PI / 2;
    g.add(pad);
    [[-0.015, -0.02], [0, -0.025], [0.015, -0.02]].forEach(function (off) {
      const toe = new THREE.Mesh(new THREE.CircleGeometry(0.009, 6), mat);
      toe.rotation.x = -Math.PI / 2;
      toe.position.set(off[0], 0, off[1]);
      g.add(toe);
    });
    g.position.set(x, 0.012, z);
    g.rotation.y = yaw || 0;
    scene.add(g);
    transients.push({
      mesh: g, body: null, t: 0, life: 5.0,
      onUpdate: function (tr, dt) {
        const op = Math.max(0, (1 - tr.t / tr.life) * 0.45);
        tr.mesh.children.forEach(function (c) { c.material.opacity = op; });
      }
    });
  }

  function spawnSmoke(x, y, z, count) {
    const n = count || 3;
    for (let i = 0; i < n; i++) {
      const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.035, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ color: "#1f2228", transparent: true, opacity: 0.65, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.12, y + Math.random() * 0.04, z + (Math.random() - 0.5) * 0.12);
      scene.add(m);
      transients.push({
        mesh: m, body: null, t: 0, life: 1.2 + Math.random() * 0.5,
        onUpdate: function (tr, dt) {
          tr.mesh.position.y += 0.55 * dt;
          tr.mesh.scale.multiplyScalar(1 + dt * 2.5);
          tr.mesh.material.opacity = Math.max(0, (1 - tr.t / tr.life) * 0.65);
        }
      });
    }
  }

  const fx = {
    dust: spawnDust,
    sparks: spawnSparks,
    splashes: spawnSplashes,
    feathers: spawnFeathers,
    pawPrint: spawnPawPrint,
    smoke: spawnSmoke
  };
  KOTO.fx = fx;

  function spawnKibble(x, y, z) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.025), std("#7a5230", 0.9));
      const body = new CANNON.Body({ mass: 0.02, material: M.prop });
      body.addShape(boxShape(0.015, 0.01, 0.0125));
      body.position.set(x, y + 0.05, z);
      body.velocity.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2);
      body.allowSleep = true;
      world.addBody(body);
      scene.add(mesh);
      transients.push({ mesh: mesh, body: body, t: 0, life: 5 });
    }
  }

  function spawnPaperBits(x, y, z) {
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.085), std("#f5f5f0", 0.95));
      const body = new CANNON.Body({ mass: 0.012, material: M.prop });
      body.addShape(boxShape(0.055, 0.003, 0.0425));
      body.position.set(x, y + 0.06 + i * 0.01, z);
      body.velocity.set((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
      body.angularVelocity.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      world.addBody(body);
      scene.add(mesh);
      transients.push({ mesh: mesh, body: body, t: 0, life: 3.5 });
    }
  }

  function spawnFish(x, y, z) {
    const g = new THREE.Group();
    const fishMat = new THREE.MeshStandardMaterial({ color: "#f08c2e", emissive: "#b04a12", emissiveIntensity: 0.55, roughness: 0.5 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.06), fishMat);
    g.add(bodyM);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.055, 6), fishMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.085;
    g.add(tail);
    g.traverse(function (o: any) { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    const body = new CANNON.Body({ mass: 0.06, material: M.prop });
    body.addShape(boxShape(0.06, 0.025, 0.03));
    body.position.set(x, Math.max(y, 0.06), z);
    body.allowSleep = false;
    world.addBody(body);
    fish.body = body;
    fish.mesh = g;
    fish.t = 0;
    fish.alive = true;
  }

  // ---------- ПРОЦЕДУРНЫЙ МУЛЬТФИЛЬМ НА ТЕЛЕВИЗОРЕ ----------
  function createTvCartoon() {
    if (typeof document === 'undefined') {
      return {
        texture: new THREE.Texture(),
        update: () => {},
        glitch: () => {},
        break: () => {},
        reset: () => {}
      };
    }
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    let time = 0;
    let channel = 0;
    let channelTimer = 0;
    let glitchTimer = 0;
    let broken = false;
    let frameAccum = 0;

    function drawCatAndMouse(t: number) {
      const w = 320, h = 180;
      // 1. Небо
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.7);
      skyGrad.addColorStop(0, '#38a3ff');
      skyGrad.addColorStop(1, '#a6e3e9');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Солнце
      const sunX = w - 40, sunY = 32, sunR = 15;
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(t * 0.6);
      ctx.fillStyle = '#ffcc00';
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2, -sunR - 7, 4, 7);
      }
      ctx.beginPath();
      ctx.arc(0, 0, sunR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cc8800';
      ctx.beginPath();
      ctx.arc(-5, -2, 1.8, 0, Math.PI * 2);
      ctx.arc(5, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 3, 5, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      // 3. Облака
      function drawCloud(cx: number, cy: number, sc: number) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(cx, cy, 12 * sc, 0, Math.PI * 2);
        ctx.arc(cx + 12 * sc, cy - 4 * sc, 10 * sc, 0, Math.PI * 2);
        ctx.arc(cx - 12 * sc, cy - 2 * sc, 9 * sc, 0, Math.PI * 2);
        ctx.arc(cx + 22 * sc, cy + 2 * sc, 10 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      drawCloud(((t * 14) % (w + 80)) - 40, 32, 1.0);
      drawCloud(((t * 8 + 170) % (w + 80)) - 40, 48, 0.7);

      // 4. Зеленые холмы
      ctx.fillStyle = '#5fb85b';
      ctx.beginPath();
      ctx.arc(w * 0.75, h + 30, 130, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#43a047';
      ctx.beginPath();
      ctx.arc(w * 0.35, h + 80, 180, 0, Math.PI * 2);
      ctx.fill();

      // Цветочки
      for (let f = 0; f < 6; f++) {
        const fx = (f * 55 + 20) % w;
        const fy = h - 16 + Math.sin(f * 2.1) * 6;
        ctx.fillStyle = f % 2 === 0 ? '#ffeb3b' : '#ff4081';
        ctx.beginPath();
        ctx.arc(fx, fy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fx, fy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. Мышонок с сыром
      const loopW = w + 140;
      const mouseX = ((t * 88) % loopW) - 30;
      const hopM = Math.abs(Math.sin(t * 14)) * 8;
      const mouseY = h - 28 - hopM;

      ctx.save();
      ctx.translate(mouseX, mouseY);
      ctx.strokeStyle = '#f48fb1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(-18, -10 + Math.sin(t * 14) * 6, -24, -2);
      ctx.stroke();

      ctx.fillStyle = '#9e9e9e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#757575';
      ctx.beginPath();
      ctx.arc(-4, -8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f48fb1';
      ctx.beginPath();
      ctx.arc(-4, -8, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(6, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff80ab';
      ctx.beginPath();
      ctx.arc(11, 0, 2, 0, Math.PI * 2);
      ctx.fill();

      // Сыр
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.moveTo(7, -10);
      ctx.lineTo(19, -2);
      ctx.lineTo(7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(11, -4, 2, 0, Math.PI * 2);
      ctx.arc(13, 2, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f48fb1';
      ctx.fillRect(-4 + Math.sin(t * 14) * 4, 7, 3, 4);
      ctx.fillRect(4 - Math.sin(t * 14) * 4, 7, 3, 4);
      ctx.restore();

      // 6. Рыжий кот (погоня)
      const catX = mouseX - 68;
      const hopC = Math.abs(Math.sin(t * 14 - 0.5)) * 10;
      const catY = h - 30 - hopC;

      ctx.save();
      ctx.translate(catX, catY);
      ctx.strokeStyle = '#e65100';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, 4);
      ctx.quadraticCurveTo(-26, -14 + Math.sin(t * 10) * 8, -20, -22);
      ctx.stroke();

      ctx.fillStyle = '#f57c00';
      ctx.beginPath();
      ctx.ellipse(0, 4, 18, 12, 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(14, -6, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e65100';
      ctx.beginPath();
      ctx.moveTo(8, -15); ctx.lineTo(13, -24); ctx.lineTo(17, -15); ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(17, -15); ctx.lineTo(22, -23); ctx.lineTo(25, -13); ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(18, -8, 4.5, 0, Math.PI * 2);
      ctx.arc(12, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2e7d32';
      ctx.beginPath();
      ctx.arc(19, -8, 2.5, 0, Math.PI * 2);
      ctx.arc(13, -8, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(20, -8, 1.2, 0, Math.PI * 2);
      ctx.arc(14, -8, 1.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e91e63';
      ctx.beginPath();
      ctx.arc(21, -3, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(22, -4); ctx.lineTo(31, -7);
      ctx.moveTo(22, -2); ctx.lineTo(32, -1);
      ctx.moveTo(22, 0);  ctx.lineTo(30, 5);
      ctx.stroke();

      ctx.fillStyle = '#f57c00';
      ctx.beginPath();
      ctx.ellipse(22 + Math.sin(t * 14) * 4, 6, 8, 3.5, 0.2, 0, Math.PI * 2);
      ctx.ellipse(-8 + Math.cos(t * 14) * 5, 12, 7, 4, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Плашка канала
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 92, 20, 4);
      ctx.fill();
      ctx.font = 'bold 10px monospace, sans-serif';
      ctx.fillStyle = '#ffd54f';
      ctx.fillText('🐱 МУЛЬТ-ТВ', 14, 22);

      if (Math.floor(t * 2) % 2 === 0) {
        ctx.fillStyle = '#ff1744';
        ctx.beginPath();
        ctx.arc(w - 18, 16, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawAquarium(t: number) {
      const w = 320, h = 180;
      const seaGrad = ctx.createLinearGradient(0, 0, 0, h);
      seaGrad.addColorStop(0, '#0277bd');
      seaGrad.addColorStop(0.6, '#01579b');
      seaGrad.addColorStop(1, '#002f6c');
      ctx.fillStyle = seaGrad;
      ctx.fillRect(0, 0, w, h);

      // Лучи света
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let i = 0; i < 4; i++) {
        const rx = 40 + i * 70 + Math.sin(t * 1.5 + i) * 12;
        ctx.beginPath();
        ctx.moveTo(rx - 10, 0); ctx.lineTo(rx + 25, 0);
        ctx.lineTo(rx + 45, h); ctx.lineTo(rx - 25, h);
        ctx.fill();
      }
      ctx.restore();

      // Водоросли
      ctx.strokeStyle = '#2e7d32';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let k = 0; k < 7; k++) {
        const bx = 20 + k * 45;
        ctx.beginPath();
        ctx.moveTo(bx, h);
        const sway = Math.sin(t * 2.5 + k * 1.2) * 16;
        ctx.bezierCurveTo(bx + sway * 0.5, h - 30, bx - sway * 0.5, h - 60, bx + sway, h - 90);
        ctx.stroke();
      }

      ctx.fillStyle = '#c5a059';
      ctx.beginPath();
      ctx.ellipse(w / 2, h + 20, w * 0.6, 40, 0, 0, Math.PI * 2);
      ctx.fill();

      // Пузырьки
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      for (let b = 0; b < 10; b++) {
        const by = (h + 20 - ((t * 35 + b * 28) % (h + 30)));
        const bx = 30 + b * 29 + Math.sin(t * 3 + b) * 8;
        const br = 2 + (b % 3) * 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      function drawFish(fx: number, fy: number, sc: number, dir: number, bodyCol: string, stripe: boolean) {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(dir * sc, sc);
        ctx.fillStyle = bodyCol;
        const tailAngle = Math.sin(t * 12) * 0.3;
        ctx.save();
        ctx.translate(-14, 0);
        ctx.rotate(tailAngle);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-12, -9); ctx.lineTo(-8, 0); ctx.lineTo(-12, 9); ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        if (stripe) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(-2, 0, 3.5, 9.5, 0, 0, Math.PI * 2);
          ctx.ellipse(6, 0, 2.5, 7.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(9, -3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(10, -3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const f1x = ((t * 40) % (w + 60)) - 30;
      const f1y = 65 + Math.sin(t * 2) * 12;
      drawFish(f1x, f1y, 1.1, 1, '#ff6d00', true);

      const f2x = w + 30 - ((t * 50 + 100) % (w + 60));
      const f2y = 110 + Math.cos(t * 2.3) * 14;
      drawFish(f2x, f2y, 1.0, -1, '#2979ff', false);

      const f3x = ((t * 60 + 180) % (w + 60)) - 30;
      const f3y = 40 + Math.sin(t * 3.5) * 8;
      drawFish(f3x, f3y, 0.75, 1, '#ffd600', true);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 92, 20, 4);
      ctx.fill();
      ctx.font = 'bold 10px monospace, sans-serif';
      ctx.fillStyle = '#80d8ff';
      ctx.fillText('🐟 РЫБ-ТВ', 16, 22);
    }

    function drawBirdWatch(t: number) {
      const w = 320, h = 180;
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#ff9e80');
      bgGrad.addColorStop(0.5, '#ffd180');
      bgGrad.addColorStop(1, '#a7ffeb');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#5d4037';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      ctx.quadraticCurveTo(w * 0.35, h * 0.65, w * 0.65, h * 0.58);
      ctx.stroke();

      ctx.fillStyle = '#66bb6a';
      for (let l = 0; l < 5; l++) {
        const lx = 30 + l * 35;
        const ly = h * 0.68 - l * 5;
        ctx.beginPath();
        ctx.ellipse(lx, ly - 8, 10, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      const birdX = w * 0.45;
      const hopB = Math.floor(t * 3) % 4 === 0 ? 6 : 0;
      const birdY = h * 0.58 - 14 - hopB;

      ctx.save();
      ctx.translate(birdX, birdY);
      ctx.fillStyle = '#1e88e5';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fdd835';
      ctx.beginPath();
      ctx.arc(4, 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0d47a1';
      ctx.beginPath();
      ctx.ellipse(-3, 1, 7, 5, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e88e5';
      ctx.beginPath();
      ctx.arc(8, -8, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(10, -9, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(11, -9, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff8f00';
      ctx.beginPath();
      ctx.moveTo(15, -10); ctx.lineTo(22, -8); ctx.lineTo(15, -6); ctx.closePath();
      ctx.fill();
      if (Math.sin(t * 4) > 0) {
        ctx.fillStyle = '#d81b60';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('♪', 18 + Math.sin(t * 6) * 4, -16 - ((t * 12) % 15));
      }
      ctx.restore();

      const mX = w * 0.75 + Math.sin(t * 5) * 25;
      const mY = h * 0.35 + Math.cos(t * 4) * 20;
      ctx.fillStyle = '#e040fb';
      ctx.beginPath();
      const flap = Math.abs(Math.sin(t * 20)) * 6;
      ctx.ellipse(mX - 4, mY, 5, flap, 0.3, 0, Math.PI * 2);
      ctx.ellipse(mX + 4, mY, 5, flap, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#212121';
      ctx.fillRect(mX - 1, mY - 3, 2, 6);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(8, 8, 96, 20, 4);
      ctx.fill();
      ctx.font = 'bold 10px monospace, sans-serif';
      ctx.fillStyle = '#ffd180';
      ctx.fillText('🐦 ПТИЦЕ-ТВ', 14, 22);
    }

    function drawGlitch() {
      const w = 320, h = 180;
      for (let i = 0; i < 10; i++) {
        const gy = Math.random() * h;
        const gh = 2 + Math.random() * 8;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, gy, w, gh);
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 255, 255, 0.4)' : 'rgba(255, 0, 128, 0.4)';
        ctx.fillRect((Math.random() - 0.5) * 30, gy, w, gh * 0.5);
      }
    }

    function drawBroken() {
      const w = 320, h = 180;
      ctx.fillStyle = '#0a0a0e';
      ctx.fillRect(0, 0, w, h);
      for (let s = 0; s < 4; s++) {
        const sy = Math.random() * h;
        ctx.fillStyle = 'rgba(180, 200, 255, 0.25)';
        ctx.fillRect(0, sy, w, 2);
      }
      const hitX = w * 0.55;
      const hitY = h * 0.45;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.8;
      const rays = [0, 0.6, 1.2, 1.9, 2.7, 3.4, 4.1, 4.8, 5.5];
      for (const r of rays) {
        ctx.beginPath();
        ctx.moveTo(hitX, hitY);
        let rx = hitX, ry = hitY;
        const len = 35 + Math.random() * 55;
        for (let step = 0; step < 4; step++) {
          rx += Math.cos(r + (Math.random() - 0.5) * 0.5) * (len / 4);
          ry += Math.sin(r + (Math.random() - 0.5) * 0.5) * (len / 4);
          ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(hitX, hitY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff3d00';
      ctx.font = 'bold 12px monospace, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('НЕТ СИГНАЛА', w / 2, h - 20);
      ctx.textAlign = 'start';
    }

    function render() {
      if (broken) {
        drawBroken();
        return;
      }
      if (channel === 0) drawCatAndMouse(time);
      else if (channel === 1) drawAquarium(time);
      else drawBirdWatch(time);

      if (glitchTimer > 0) {
        drawGlitch();
      }
    }

    function update(dt: number) {
      time += dt;
      if (glitchTimer > 0) glitchTimer -= dt;
      if (!broken) {
        channelTimer += dt;
        if (channelTimer > 12) {
          channelTimer = 0;
          channel = (channel + 1) % 3;
          glitchTimer = 0.2;
        }
      }
      frameAccum += dt;
      if (frameAccum >= 0.04) {
        frameAccum = 0;
        render();
        texture.needsUpdate = true;
      }
    }

    // Первоначальный кадр
    render();
    texture.needsUpdate = true;

    return {
      canvas,
      texture,
      update,
      glitch: (dur: number) => { glitchTimer = dur; },
      break: () => { broken = true; render(); texture.needsUpdate = true; },
      reset: () => { broken = false; channel = 0; channelTimer = 0; glitchTimer = 0; render(); texture.needsUpdate = true; }
    };
  }

  // ---------- ГОСТИНАЯ ----------
  const tvCartoon = createTvCartoon();
  const tvG = new THREE.Group();
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 1.24), std("#1a1a1e", 0.4));
  tvG.add(tvFrame);
  const tvScreenMat = new THREE.MeshStandardMaterial({
    map: tvCartoon.texture,
    emissive: 0xffffff,
    emissiveMap: tvCartoon.texture,
    emissiveIntensity: 0.7,
    roughness: 0.2
  });
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), tvScreenMat);
  tvScreen.rotation.y = -Math.PI / 2;
  tvScreen.position.x = -0.047;
  tvG.add(tvScreen);
  const tvProp = register("телевизор", 5000, tvG, boxShape(0.045, 0.36, 0.62), -2.0, L.tvStandTopY + 0.36, 0.9, {
    mass: 9, breakable: true, breakVel: 1.9, shardColor: "#2a2d33",
    keepMeshOnBreak: true,
    onBreak: function () {
      tvCartoon.break();
      tvScreenMat.emissiveIntensity = 0.15;
      if (AudioSys.ctx) AudioSys.zap();
    }
  });

  const cushColors = ["#c9803c", "#8a9a5e", "#b0524a"];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.11, 0.7), std(cushColors[i], 1)));
    register("подушку", 300, g, boxShape(0.25, 0.055, 0.35), -6.45, 0.505, -0.0 + i * 0.9, { mass: 0.35, yaw: (Math.random() - 0.5) * 0.15 });
  }

  const bookColors = ["#a33c3c", "#3c6ea3", "#3ca35e", "#c9a03c", "#7a4a9e", "#c96a3c"];
  let bi = 0;
  function shelfBook(x, boardY) {
    const g = meshBook(bookColors[bi++ % bookColors.length]);
    register("книгу", 250, g, boxShape(0.025, 0.12, 0.09), x, boardY + 0.12, -4.2, { mass: 0.3, yaw: (Math.random() - 0.5) * 0.1 });
  }
  shelfBook(-5.2, L.bookshelf.boardsY[0]);
  shelfBook(-4.9, L.bookshelf.boardsY[0]);
  shelfBook(-4.6, L.bookshelf.boardsY[0]);
  shelfBook(-4.0, L.bookshelf.boardsY[1]);
  shelfBook(-3.85, L.bookshelf.boardsY[1]);
  shelfBook(-3.7, L.bookshelf.boardsY[1]);

  register("вазу", 1200, meshVase(0.3, 0.09, "#4e8fd8"), boxShape(0.07, 0.15, 0.07), -5.2, L.bookshelf.boardsY[2] + 0.15, -4.2, { mass: 0.5, breakable: true, breakVel: 2.0, shardColor: "#4e8fd8" });

  const plantG = new THREE.Group();
  plantG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.15, 12), std("#b0684a", 0.8)));
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), std("#4a8a4e", 0.8));
    leaf.position.set((Math.random() - 0.5) * 0.08, 0.16, (Math.random() - 0.5) * 0.08);
    leaf.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    plantG.add(leaf);
  }
  register("цветок", 550, plantG, cylShapeY(0.09, 0.16), -3.8, L.bookshelf.boardsY[2] + 0.08, -4.2, { mass: 0.5, breakable: true, breakVel: 2.2, shardColor: "#b0684a" });

  const lampG = new THREE.Group();
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 16), std("#3d3d44", 0.5, 0.4));
  lampBase.position.y = -0.80;
  lampG.add(lampBase);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.40, 10), std("#3d3d44", 0.5, 0.4));
  lampPole.position.y = -0.08;
  lampG.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.32, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#f5e2b8", emissive: "#ffdf94", emissiveIntensity: 0.45, side: THREE.DoubleSide, roughness: 0.85 }));
  lampShade.position.y = 0.72;
  lampG.add(lampShade);
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: "#fff7db", emissive: "#ffd875", emissiveIntensity: 1.0 }));
  lampBulb.position.y = 0.70;
  lampG.add(lampBulb);
  const lampLight = new THREE.PointLight("#ffdf94", 0.65, 7, 1.6);
  lampLight.position.set(0, 0.70, 0);
  lampG.add(lampLight);
  const floorLampProp = register("торшер", 800, lampG, boxShape(0.16, 0.82, 0.16), -6.5, 0.82, -3.9, {
    mass: 1.2,
    breakable: true,
    breakVel: 2.0,
    shardColor: "#f5e2b8",
    keepMeshOnBreak: true,
    onBreak: function () { lampLight.intensity = 0; }
  });

  const mugG = meshCup("#c94a4a");
  register("кружку", 200, mugG, cylShapeY(0.035, 0.09), -4.45, L.coffeeTopY + 0.045, 0.75, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#c94a4a" });

  // дополнительная посуда для квеста «Чаепитие» (гостиная)
  register("тарелку", 250, meshPlate(), cylShapeY(0.13, 0.03), -4.0, L.coffeeTopY + 0.017, 1.12, { mass: 0.25, breakable: true, breakVel: 1.5, shardColor: "#f2f2ee" });
  register("тарелку", 250, meshPlate(), cylShapeY(0.13, 0.03), -4.58, L.coffeeTopY + 0.017, 1.12, { mass: 0.25, breakable: true, breakVel: 1.5, shardColor: "#f2f2ee" });
  register("кружку", 200, meshCup("#4a8a4e"), cylShapeY(0.035, 0.09), -3.95, L.coffeeTopY + 0.045, 0.66, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#4a8a4e" });
  register("кружку", 200, meshCup("#3c6ea3"), cylShapeY(0.035, 0.09), -4.68, L.coffeeTopY + 0.045, 0.64, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#3c6ea3" });

  const remG = new THREE.Group();
  remG.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.16), std("#2a2d33", 0.5)));
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.008, 0.02), std("#c94a4a", 0.5));
  btn.position.set(0, 0.013, -0.05);
  remG.add(btn);
  register("пульт", 500, remG, boxShape(0.025, 0.01, 0.08), -4.1, L.coffeeTopY + 0.01, 0.95, { mass: 0.15, yaw: 0.5 });

  const magG = new THREE.Group();
  magG.add(new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.008, 0.28), std("#d8c65a", 0.9)));
  register("журналы", 150, magG, boxShape(0.105, 0.004, 0.14), -4.5, L.coffeeTopY + 0.004, 1.05, { mass: 0.1, yaw: -0.3 });

  // картины и часы на стенах
  function hangPicture(name, value, w, h, x, y, z, seed) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), std("#6b4a33", 0.6)));
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.08), new THREE.MeshStandardMaterial({ map: artTexture(seed), roughness: 0.9 }));
    art.position.z = -0.019;
    art.rotation.y = Math.PI;
    g.add(art);
    const body = new CANNON.Body({ mass: 0.4, material: M.prop, type: CANNON.Body.KINEMATIC });
    body.addShape(boxShape(w / 2, h / 2, 0.018));
    body.position.set(x, y, z);
    world.addBody(body);
    g.traverse(function (o: any) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    const prop = {
      name: name, value: value, mesh: g, body: body, mass: 0.4,
      breakable: false, breakVel: 99, shardColor: "#6b4a33", broken: false,
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false,
      room: KOTO.levels.roomOf(x, z),
      initialPosition: new CANNON.Vec3(x, y, z),
      initialQuaternion: new CANNON.Quaternion().copy(body.quaternion)
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken || !prop.released) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const other = e.body;
      const isStrike = !!(other && other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop);
      if (KOTO.game) KOTO.game.onPropImpact(prop, v, isStrike);
    });
    props.push(prop);
    hangProps.push(prop);
    return prop;
  }
  hangPicture("картину", 700, 0.55, 0.75, -5.4, 1.6, 4.46, 11);
  hangPicture("картину", 700, 0.65, 0.5, -3.6, 1.5, 4.46, 22);

  function hangCurtain(name: string, value: number, cx: number, rodY: number, fz: number) {
    const w = 1.6;
    const g = new THREE.Group();
    const clothMat = std("#7a2b38", 0.95);
    const rodMat = std("#6b4a33", 0.6);

    // 1. Деревянная перекладина карниза (толщина 4.4 см, длина 2.05 м)
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, w + 0.45, 12), rodMat);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0, 0);
    rod.castShadow = true;
    g.add(rod);

    // Декоративные точеные набалдашники на концах карниза
    [-1, 1].forEach(function (s) {
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), std("#4a2e1b", 0.5));
      finial.position.set(s * ((w + 0.45) / 2 + 0.03), 0, 0);
      g.add(finial);
    });

    // 2. Висящие на окне вертикальные шторы с красивыми складками драпировки
    const hangingG = new THREE.Group();
    [-1, 1].forEach(function (s) {
      const panelG = new THREE.Group();
      panelG.position.set(s * (w / 2 + 0.14), 0, 0);
      // 3 волнообразные вертикальные складки для объема
      [-0.08, 0, 0.08].forEach(function (fx, fIdx) {
        const fold = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.65, 0.06), clothMat);
        fold.position.set(fx, -0.825, fIdx % 2 === 0 ? 0.012 : -0.012);
        fold.castShadow = true;
        panelG.add(fold);

        // Латунное кольцо подвеса к карнизу
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 8, 16), std("#d4af37", 0.3, 0.8));
        ring.position.set(fx, 0, 0);
        panelG.add(ring);
      });
      hangingG.add(panelG);
    });
    g.add(hangingG);
    scene.add(g);

    // 3. Мягкая смятая ткань на полу при падении (НЕ жесткая П-образная конструкция!)
    const crumpledG = new THREE.Group();
    [-1, 1].forEach(function (s) {
      const pileG = new THREE.Group();
      pileG.position.set(s * (w / 2 + 0.14), 0, 0);

      // Нижний расстелившийся слой упавшей бархатной ткани
      const baseCloth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.024, 16), clothMat);
      baseCloth.position.set(0, 0.012, 0);
      baseCloth.scale.set(1.1, 1, 0.85);
      baseCloth.receiveShadow = true;
      pileG.add(baseCloth);

      // Многослойные мягкие складки, изгибы и волны смятой материи
      const fold1 = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.52, 12), clothMat);
      fold1.rotation.z = Math.PI / 2;
      fold1.rotation.y = 0.28;
      fold1.position.set(0, 0.035, 0.02);
      fold1.castShadow = true;
      pileG.add(fold1);

      const fold2 = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.44, 12), clothMat);
      fold2.rotation.z = Math.PI / 2;
      fold2.rotation.y = -0.42;
      fold2.position.set(0.04, 0.042, -0.05);
      fold2.castShadow = true;
      pileG.add(fold2);

      const fold3 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.026, 0.34), clothMat);
      fold3.rotation.y = 0.15;
      fold3.position.set(-0.02, 0.026, 0.03);
      fold3.castShadow = true;
      pileG.add(fold3);

      const fold4 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.36, 10), clothMat);
      fold4.rotation.z = Math.PI / 2;
      fold4.rotation.y = 0.65;
      fold4.position.set(-0.05, 0.052, -0.02);
      pileG.add(fold4);

      crumpledG.add(pileG);
    });

    // Соединительная полоса ткани между шторами
    const centerCloth = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.018, 0.22), clothMat);
    centerCloth.position.set(0, 0.01, 0);
    crumpledG.add(centerCloth);

    crumpledG.visible = false;
    scene.add(crumpledG);

    // 4. Физическое тело ТОЛЬКО для деревянной перекладины (карниза)
    // Толщина 7 см, длина 2.05 м, центр на rodY (2.44 м). У ткани НЕТ жесткого каркаса ходулей!
    const body = new CANNON.Body({ mass: 2.4, material: M.prop, type: CANNON.Body.KINEMATIC });
    body.addShape(boxShape((w + 0.45) / 2, 0.035, 0.035));
    body.position.set(cx, rodY, fz);
    world.addBody(body);

    const prop = {
      name: name, value: value, mesh: g, body: body, mass: 2.4,
      breakable: false, breakVel: 99, shardColor: "#6b4a33", broken: false,
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false,
      room: KOTO.levels.roomOf(cx, fz),
      initialPosition: new CANNON.Vec3(cx, rodY, fz),
      initialQuaternion: new CANNON.Quaternion().copy(body.quaternion),
      hangingG: hangingG,
      crumpledG: crumpledG
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken) return;
      if (!prop.released) {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        const other = e.body;
        // Если по висящему карнизу попал предмет (лассо) или прыгнул кот
        if (v > 1.2 || (other && other === (KOTO.cat && KOTO.cat.body))) {
          if (KOTO.game && (KOTO.game as any).releaseHang) {
            (KOTO.game as any).releaseHang(prop);
          }
        }
        return;
      }
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const other = e.body;
      const isStrike = !!(other && other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop);
      if (KOTO.game) KOTO.game.onPropImpact(prop, v, isStrike);
    });
    props.push(prop);
    hangProps.push(prop);
    return prop;
  }
  // Интерактивные гардины на обоих окнах в гостиной (левое и правое)
  hangCurtain("карниз со шторами", 3800, -5.4, 2.44, -4.33);
  hangCurtain("карниз со шторами", 3800, -3.4, 2.44, -4.33);

  // ---------- КРАСИВЫЕ НАСТЕННЫЕ ЧАСЫ В ГОСТИНЫХ ----------
  function hangClock(name: string, value: number, cx: number, cy: number, cz: number) {
    const r = 0.22;
    const g = new THREE.Group();

    // 1. Корпус из темного благородного ореха
    const frameMat = std("#3e2617", 0.65, 0.25);
    // Внешняя цилиндрическая обечайка (hollow / openEnded: true — без торцевых крышек!)
    const outerRim = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.032, r + 0.032, 0.05, 48, 1, true), frameMat);
    outerRim.rotation.x = Math.PI / 2;
    outerRim.castShadow = true;
    g.add(outerRim);

    // Задняя стенка корпуса (прилегает к стене z = +0.024)
    const backPlate = new THREE.Mesh(new THREE.CircleGeometry(r + 0.032, 48), frameMat);
    backPlate.position.z = 0.024;
    g.add(backPlate);

    // Передняя деревянная фаска корпуса (кольцо)
    const frontWoodBevel = new THREE.Mesh(new THREE.RingGeometry(r + 0.012, r + 0.033, 48), frameMat);
    frontWoodBevel.rotation.y = Math.PI;
    frontWoodBevel.position.z = -0.0245;
    g.add(frontWoodBevel);

    // 2. Внутренний полированный латунный обод
    const brassMat = std("#d4af37", 0.25, 0.9);
    // Внутренняя латунная гильза (hollow / openEnded: true)
    const innerBrassSleeve = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.052, 48, 1, true), brassMat);
    innerBrassSleeve.rotation.x = Math.PI / 2;
    g.add(innerBrassSleeve);

    // Декоративный передний латунный безель (полый RingGeometry — в центре ПУСТО, нет z-fighting с циферблатом!)
    const frontBrassRing = new THREE.Mesh(new THREE.RingGeometry(r - 0.002, r + 0.013, 48), brassMat);
    frontBrassRing.rotation.y = Math.PI;
    frontBrassRing.position.z = -0.0255;
    g.add(frontBrassRing);

    // 3. Процедурный детализированный циферблат часов (Canvas 512x512)
    const dialCanvas = document.createElement('canvas');
    dialCanvas.width = 512;
    dialCanvas.height = 512;
    const dialCtx = dialCanvas.getContext('2d')!;
    (function (ctx, s) {
      // Сплошной чистый фон слоновой кости (без прозрачных углов)
      ctx.fillStyle = "#faf6ed";
      ctx.fillRect(0, 0, s, s);

      // Внутренний тонкий золотой ободок циферблата
      ctx.strokeStyle = "#c8a452";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s / 2 - 20, 0, Math.PI * 2);
      ctx.stroke();

      // 60 минутных меток и 12 часовых делений
      for (let i = 0; i < 60; i++) {
        const angle = (i * Math.PI) / 30;
        const isHour = i % 5 === 0;
        const r1 = isHour ? s / 2 - 58 : s / 2 - 40;
        const r2 = s / 2 - 26;
        ctx.strokeStyle = isHour ? "#1c1f24" : "#8a8e96";
        ctx.lineWidth = isHour ? 6 : 2.5;
        ctx.beginPath();
        ctx.moveTo(s / 2 + Math.sin(angle) * r1, s / 2 - Math.cos(angle) * r1);
        ctx.lineTo(s / 2 + Math.sin(angle) * r2, s / 2 - Math.cos(angle) * r2);
        ctx.stroke();
      }

      // Главные арабские цифры 12, 3, 6, 9
      ctx.fillStyle = "#1c1f24";
      ctx.font = "bold 52px 'Georgia', serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("12", s / 2, 88);
      ctx.fillText("6", s / 2, s - 88);
      ctx.fillText("3", s - 88, s / 2);
      ctx.fillText("9", 88, s / 2);

      // Второстепенные цифры
      ctx.font = "bold 34px 'Georgia', serif";
      const hours = [
        [1, 1], [2, 2], [4, 4], [5, 5],
        [7, 7], [8, 8], [10, 10], [11, 11]
      ];
      hours.forEach(([h]) => {
        const a = (h * Math.PI) / 6;
        ctx.fillText(h.toString(), s / 2 + Math.sin(a) * (s / 2 - 96), s / 2 - Math.cos(a) * (s / 2 - 96));
      });

      // Логотип часового бренда
      ctx.font = "bold 19px 'Georgia', serif";
      ctx.fillStyle = "#4a3c2c";
      ctx.fillText("КОТОСТРОФА", s / 2, s / 2 - 50);
      ctx.font = "12px 'Segoe UI', system-ui, sans-serif";
      ctx.fillStyle = "#8a7e70";
      ctx.fillText("КВАРЦ • 1984", s / 2, s / 2 + 55);
    })(dialCtx, 512);

    const dialTex = new THREE.CanvasTexture(dialCanvas);
    dialTex.colorSpace = THREE.SRGBColorSpace;

    // Циферблат утоплен на z = -0.019 (на 6.5 мм глубже переднего латунного обода -0.0255)
    const dialMesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 48),
      new THREE.MeshStandardMaterial({ map: dialTex, roughness: 0.65 })
    );
    dialMesh.rotation.y = Math.PI;
    dialMesh.position.z = -0.019;
    g.add(dialMesh);

    // 4. Объемные 3D-стрелки с четким разнесением по Z
    const handMat = std("#1c1e22", 0.4);
    const secMat = std("#d62828", 0.35);

    // Часовая стрелка (на ~10 часов) на z = -0.022
    const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.10, 0.004), handMat);
    hourHand.position.set(-0.035, 0.025, -0.022);
    hourHand.rotation.z = 0.9;
    g.add(hourHand);

    // Минутная стрелка (на ~2 часа) на z = -0.025
    const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.15, 0.004), handMat);
    minHand.position.set(0.05, 0.04, -0.025);
    minHand.rotation.z = -0.85;
    g.add(minHand);

    // Секундная тонкая красная стрелка (на ~4 часа) на z = -0.0275
    const secHand = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.17, 0.003), secMat);
    secHand.position.set(0.045, -0.035, -0.0275);
    secHand.rotation.z = -2.2;
    g.add(secHand);

    // Центральная латунная головка на z = -0.0295
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), brassMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = -0.0295;
    g.add(cap);

    // 5. Защитное стекло на z = -0.032 (впереди всех стрелок, depthWrite: false исключает артефакты)
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(r + 0.005, 48),
      new THREE.MeshStandardMaterial({ color: "#ffffff", transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false })
    );
    glass.rotation.y = Math.PI;
    glass.position.z = -0.032;
    g.add(glass);

    const body = new CANNON.Body({ mass: 0.4, material: M.prop, type: CANNON.Body.KINEMATIC });
    body.addShape(boxShape(r, r, 0.025));
    body.position.set(cx, cy, cz);
    world.addBody(body);

    const prop = {
      name: name, value: value, mesh: g, body: body, mass: 0.4,
      breakable: false, breakVel: 99, shardColor: "#3e2617", broken: false,
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false,
      room: KOTO.levels.roomOf(cx, cz),
      initialPosition: new CANNON.Vec3(cx, cy, cz),
      initialQuaternion: new CANNON.Quaternion().copy(body.quaternion)
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken || !prop.released) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const other = e.body;
      const isStrike = !!(other && other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop);
      if (KOTO.game) KOTO.game.onPropImpact(prop, v, isStrike);
    });

    scene.add(g);
    props.push(prop);
    hangProps.push(prop);
    return prop;
  }
  hangClock("часы", 450, -4.5, 2.05, 4.46);

  // ---------- КУХНЯ ----------
  const cy = L.counterTopY;
  for (let i = 0; i < 5; i++) {
    register("тарелку", 250, meshPlate(), cylShapeY(0.13, 0.03), -0.5, cy + 0.017 + i * 0.03, -4.2, { mass: 0.25, breakable: true, breakVel: 1.5, shardColor: "#f2f2ee" });
  }
  // стоящие тарелки у фартука
  for (let i = 0; i < 2; i++) {
    const g = meshPlate();
    g.rotation.x = Math.PI / 2 - 0.3;
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -0.3 + Math.PI / 2);
    register("тарелку", 250, g, new CANNON.Cylinder(0.13, 0.1, 0.028, 12), -1.05 + i * 0.24, cy + 0.125, -4.4, { mass: 0.25, breakable: true, breakVel: 1.5, shardColor: "#f2f2ee", quat: q });
  }

  const kettleG = new THREE.Group();
  const kettleBody = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), std("#d8d2c9", 0.3, 0.6));
  kettleBody.scale.y = 0.85;
  kettleBody.position.y = 0.08;
  kettleG.add(kettleBody);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.12, 8), std("#d8d2c9", 0.3, 0.6));
  spout.rotation.z = 0.7;
  spout.position.set(0.1, 0.12, 0);
  kettleG.add(spout);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.03, 10), std("#2a2d33", 0.4));
  lid.position.y = 0.165;
  kettleG.add(lid);
  register("чайник", 600, kettleG, boxShape(0.09, 0.09, 0.09), 0.5, cy + 0.09, -4.2, { mass: 0.9 });

  const toasterG = new THREE.Group();
  toasterG.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.16), std("#c9ccd2", 0.3, 0.5)));
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.05), std("#22262b", 0.4));
  slot.position.y = 0.073;
  toasterG.add(slot);
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.02), std("#2a2d33", 0.4));
  lever.position.set(0.14, 0, 0);
  toasterG.add(lever);
  register("тостер", 1500, toasterG, boxShape(0.13, 0.07, 0.08), 1.3, cy + 0.07, -4.2, { mass: 1.3 });

  register("банку кофе", 300, meshBottle("#8a6a48"), cylShapeY(0.05, 0.27), 2.1, cy + 0.135, -4.25, { mass: 0.4, breakable: true, breakVel: 2.5, shardColor: "#8a6a48" });
  register("банку", 300, meshBottle("#c9a03c"), cylShapeY(0.05, 0.27), 2.35, cy + 0.135, -4.15, { mass: 0.4, breakable: true, breakVel: 2.5, shardColor: "#c9a03c" });

  register("кружку", 200, meshCup("#5a8ac9"), cylShapeY(0.035, 0.09), 2.9, cy + 0.045, -4.15, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#5a8ac9" });
  register("кружку", 200, meshCup("#5ea35e"), cylShapeY(0.035, 0.09), 3.15, cy + 0.045, -4.25, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#5ea35e" });

  register("вино", 900, meshBottle("#2a4a2e"), cylShapeY(0.05, 0.3), 3.8, cy + 0.15, -4.2, { mass: 0.8, breakable: true, breakVel: 2.0, shardColor: "#2a4a2e" });

  // ---------- БОЛЬШОЙ АКВАРИУМ С РЫБКОЙ (КВЕСТ) ----------
  const bowlG = new THREE.Group();
  const aquaR = 0.28;
  
  // 1. Прозрачная стеклянная сферическая колба аквариума (увеличена почти в 2 раза)
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#d2efff",
    roughness: 0.04,
    transparent: true,
    opacity: 0.32,
    metalness: 0.1
  });
  const glass = new THREE.Mesh(new THREE.SphereGeometry(aquaR, 24, 18), glassMat);
  bowlG.add(glass);

  // Стеклянный воротник/ободок верхнего отверстия
  const rimMat = new THREE.MeshStandardMaterial({ color: "#e8f7ff", roughness: 0.08, transparent: true, opacity: 0.45 });
  const topRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 12, 28), rimMat);
  topRim.rotation.x = Math.PI / 2;
  topRim.position.y = 0.21;
  bowlG.add(topRim);

  // 2. Дно: песчано-галечный грунт
  const sandMat = std("#c89a58", 0.95);
  const sandBed = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.15, 0.06, 20), sandMat);
  sandBed.position.y = -0.21;
  bowlG.add(sandBed);

  // Разноцветные круглые камушки на дне
  const pebbleColors = ["#824832", "#4a6878", "#547852", "#98683a", "#3b4856"];
  pebbleColors.forEach((col, idx) => {
    const a = (idx * Math.PI * 2) / pebbleColors.length;
    const rDist = 0.08 + (idx % 2) * 0.06;
    const pebble = new THREE.Mesh(
      new THREE.SphereGeometry(0.024 + (idx % 3) * 0.008, 12, 8),
      std(col, 0.6)
    );
    pebble.position.set(Math.cos(a) * rDist, -0.19, Math.sin(a) * rDist);
    pebble.scale.y = 0.6;
    bowlG.add(pebble);
  });

  // 3. Зеленые подводные водоросли
  const plantMat = std("#2e9e44", 0.85);
  [-0.10, 0.11, -0.04].forEach((px, i) => {
    const pz = (i === 1 ? -0.06 : 0.07);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.24 + i * 0.05, 8), plantMat);
    stalk.position.set(px, -0.08 + i * 0.02, pz);
    stalk.rotation.z = (i - 1) * 0.15;
    bowlG.add(stalk);
  });

  // 4. Толща бирюзовой воды
  const waterInMat = new THREE.MeshStandardMaterial({
    color: "#2898ec",
    roughness: 0.08,
    transparent: true,
    opacity: 0.58
  });
  const waterIn = new THREE.Mesh(new THREE.SphereGeometry(aquaR - 0.025, 20, 16), waterInMat);
  waterIn.position.y = -0.025;
  bowlG.add(waterIn);

  // 5. Золотая рыбка внутри (с хвостом и плавниками)
  const fishG = new THREE.Group();
  const fishInMat = new THREE.MeshStandardMaterial({
    color: "#ff6f12",
    emissive: "#b03e00",
    emissiveIntensity: 0.6,
    roughness: 0.4
  });
  const fishBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.065, 0.048), fishInMat);
  fishG.add(fishBody);
  const fishTail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.014), fishInMat);
  fishTail.position.set(-0.08, 0.01, 0);
  fishTail.rotation.z = 0.3;
  fishG.add(fishTail);
  const fishEye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshBasicMaterial({ color: "#111111" }));
  fishEye.position.set(0.045, 0.015, 0.025);
  fishG.add(fishEye);
  fishG.position.set(0.02, -0.02, 0);
  bowlG.add(fishG);

  // 6. Подводные пузырьки воздуха
  const bubbleMat = new THREE.MeshBasicMaterial({ color: "#b8f4ff", transparent: true, opacity: 0.75 });
  [[0.06, -0.10, 0.04], [0.08, 0.02, 0.05], [0.05, 0.12, 0.03], [-0.07, 0.05, -0.05]].forEach(([bx, by, bz]) => {
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), bubbleMat);
    bubble.position.set(bx, by, bz);
    bowlG.add(bubble);
  });

  // 7. Мягкая подсветка аквариума
  const aquaGlow = new THREE.PointLight('#5ce1e6', 0.85, 3.2, 1.8);
  aquaGlow.position.set(0, 0.02, 0);
  bowlG.add(aquaGlow);

  const fp = L.fishbowlPos;
  register("аквариум", 2500, bowlG, new CANNON.Sphere(aquaR), fp.x, fp.y, fp.z, {
    mass: 1.4, breakable: true, breakVel: 1.3, shardColor: "#bfe3ff",
    onBreak: function (game, prop) {
      const p = prop.body.position;
      AudioSys.splash();
      // GR-02: Вспышка синего освещения от разбитого аквариума
      const aquaLight = new THREE.PointLight('#2de2e6', 2.2, 8, 2);
      aquaLight.position.set(p.x, p.y + 0.2, p.z);
      scene.add(aquaLight);
      transients.push({
        mesh: aquaLight as any, body: null, t: 0, life: 0.7,
        onUpdate: function (tr: any) {
          aquaLight.intensity = Math.max(0, 2.2 * (1 - tr.t / 0.7));
        }
      });
      spawnWaterDecal(p.x, p.z, 0.75);
      const spot = findOpenFloorSpot(p.x, p.z);
      spawnFish(spot.x, 0.1, spot.z);
      notify("water", p.x, p.z, prop);
      notify("fish", spot.x, spot.z, prop);
    }
  });

  // ---------- ХОЛОДИЛЬНИК-СЮРПРИЗ (ИНТЕРАКТИВНЫЙ ДЖЕКПОТ) ----------
  const fridgeG = new THREE.Group();
  fridgeG.position.set(-0.575, 0.0, -3.85);

  const doorMat = std("#f2f3f5", 0.35, 0.2);
  const doorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.82, 0.68), doorMat);
  doorMesh.position.set(0.025, 0.925, 0.34);
  doorMesh.castShadow = true;
  fridgeG.add(doorMesh);

  const fridgeHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), std("#9aa0a6", 0.2, 0.8));
  fridgeHandle.position.set(0.065, 1.05, 0.62);
  fridgeG.add(fridgeHandle);

  [[0.065, 1.4, 0.45, "#c94a4a"], [0.065, 1.25, 0.25, "#e8c53c"], [0.065, 0.95, 0.5, "#4a7ac9"]].forEach(function (m: any) {
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12), std(m[3], 0.5));
    mag.rotation.z = Math.PI / 2;
    mag.position.set(m[0], m[1], m[2]);
    fridgeG.add(mag);
  });
  scene.add(fridgeG);

  const spawnedGroceries: Prop[] = [];

  function spawnFridgeGroceries() {
    for (let i = 0; i < 2; i++) {
      const milkG = new THREE.Group();
      milkG.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), std("#f5f5f5", 0.4)));
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.08, 4), std("#4a85c9", 0.5));
      top.position.y = 0.14; top.rotation.y = Math.PI / 4;
      milkG.add(top);
      const milk = register("пачку молока", 120, milkG, boxShape(0.06, 0.11, 0.06),
        -0.45, 0.8 + i * 0.25, -3.6 + (Math.random() - 0.5) * 0.3,
        { mass: 0.45, breakable: true, breakVel: 1.6, shardColor: "#f0f0ee",
          onBreak: function () { spawnWaterDecal(-0.5 + (Math.random() - 0.5) * 0.4, -3.5 + (Math.random() - 0.5) * 0.4, 0.32); }
        }
      );
      milk.body.velocity.set(1.8 + Math.random() * 1.2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.6);
      milk.body.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
      spawnedGroceries.push(milk);
    }
    const sausG = new THREE.Group();
    const sausM = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.32, 24), std("#8a3838", 0.7));
    sausM.rotation.z = Math.PI / 2;
    sausG.add(sausM);
    const saus = register("палку колбасы", 380, sausG, cylShapeY(0.042, 0.32),
      -0.45, 0.9, -3.4, { mass: 0.5, breakable: false });
    saus.body.velocity.set(2.2, 0.8, -0.4);
    spawnedGroceries.push(saus);

    const cheeseG = new THREE.Group();
    cheeseG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 24), std("#f2c94c", 0.6)));
    const cheese = register("головку сыра", 420, cheeseG, cylShapeY(0.12, 0.09),
      -0.45, 0.7, -3.6, { mass: 0.6, breakable: false });
    cheese.body.velocity.set(2.0, 0.7, 0.4);
    spawnedGroceries.push(cheese);

    const jarG = new THREE.Group();
    jarG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 20), new THREE.MeshStandardMaterial({ color: "#2d5a27", transparent: true, opacity: 0.7, roughness: 0.15 })));
    const jar = register("банку солений", 280, jarG, cylShapeY(0.07, 0.18),
      -0.45, 1.1, -3.5, { mass: 0.7, breakable: true, breakVel: 1.8, shardColor: "#3a6a30" });
    jar.body.velocity.set(2.1, 0.9, -0.2);
    spawnedGroceries.push(jar);

    const borschG = new THREE.Group();
    borschG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.19, 24), std("#882222", 0.4, 0.5)));
    const bLid = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), std("#c9ccd2", 0.2, 0.8));
    bLid.position.y = 0.11;
    borschG.add(bLid);
    const pot = register("кастрюлю с борщом", 950, borschG, cylShapeY(0.15, 0.19),
      -0.4, 0.65, -3.5, { mass: 1.4, breakable: false,
        onScore: function () {
          spawnWaterDecal(pot.body.position.x, pot.body.position.z, 0.45);
          if (KOTO.fx) KOTO.fx.splashes(pot.body.position.x, 0.1, pot.body.position.z, 16);
        }
      });
    pot.body.velocity.set(2.4, 0.5, 0.1);
    spawnedGroceries.push(pot);
  }

  const fridge = {
    pos: { x: -0.57, y: 0.925, z: -3.5 },
    doorGroup: fridgeG,
    opened: false,
    openAngle: 0,
    targetAngle: 0,
    open: function () {
      if (this.opened) return;
      this.opened = true;
      this.targetAngle = 1.95;
      AudioSys.crash(0.6);
      if (AudioSys.tinkle) AudioSys.tinkle();
      if (KOTO.game) {
        KOTO.game.floater({ x: -0.5, y: 1.2, z: -3.5 }, "ХОЛОДИЛЬНИК РАСПАХНУТ! ДЖЕКПОТ!", "strike");
        KOTO.game.addFeed("ДЖЕКПОТ! Из холодильника вывалилась гора продуктов!");
        KOTO.game.state.shake = Math.min(1, KOTO.game.state.shake + 0.5);
      }
      if (KOTO.fx) {
        KOTO.fx.dust(-0.5, 0.1, -3.5, 8);
      }
      spawnWaterDecal(-0.35, -3.5, 0.48);
      spawnFridgeGroceries();
    }
  };

  // верхняя полка
  const sy = L.shelfY;
  register("кружку", 200, meshCup("#c9a03c"), cylShapeY(0.035, 0.09), -0.8, sy + 0.045, -4.32, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#c9a03c" });
  register("кружку", 200, meshCup("#a35e9e"), cylShapeY(0.035, 0.09), -0.45, sy + 0.045, -4.3, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#a35e9e" });
  register("кружку", 200, meshCup("#c96a3c"), cylShapeY(0.035, 0.09), -0.1, sy + 0.045, -4.34, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#c96a3c" });
  for (let i = 0; i < 2; i++) {
    register("тарелку", 250, meshPlate(), cylShapeY(0.13, 0.03), 0.7, sy + 0.017 + i * 0.03, -4.32, { mass: 0.25, breakable: true, breakVel: 1.5, shardColor: "#f2f2ee" });
  }

  // плита
  const potG = new THREE.Group();
  potG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.12, 14), std("#3a3d44", 0.4, 0.5)));
  const potLid = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.02, 14), std("#c9ccd2", 0.3, 0.6));
  potLid.position.y = 0.07;
  potG.add(potLid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), std("#22262b", 0.4));
  knob.position.y = 0.085;
  potG.add(knob);
  register("кастрюлю", 800, potG, cylShapeY(0.11, 0.14), 6.35, L.stoveTopY + 0.07, -4.15, { mass: 1.0 });

  // кухонный стол
  const tableVaseG = meshVase(0.22, 0.07, "#5ea35e");
  const stems = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.25, 5), std("#4a8a4e", 0.8));
    stem.position.set((i - 1) * 0.02, 0.17, (i % 2) * 0.02 - 0.01);
    stem.rotation.z = (i - 1) * 0.2;
    stems.add(stem);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), std(i % 2 ? "#e8b04b" : "#c95a6e", 0.7));
    head.position.set((i - 1) * 0.055, 0.29, (i % 2) * 0.02 - 0.01);
    stems.add(head);
  }
  tableVaseG.add(stems);
  register("вазу с цветами", 400, tableVaseG, boxShape(0.06, 0.11, 0.06), 2.35, L.tableTopY + 0.11, -2.15, { mass: 0.4, breakable: true, breakVel: 2.1, shardColor: "#5ea35e" });

  [[2.9, -1.75, "#c93c3c"], [3.02, -1.95, "#9ec93c"], [2.82, -1.95, "#c9a03c"]].forEach(function (a: any) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), std(a[2], 0.5)));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 5), std("#5e4a2a", 0.9));
    stem.position.y = 0.055;
    g.add(stem);
    register("яблоко", 80, g, new CANNON.Sphere(0.05), a[0], L.tableTopY + 0.05, a[1], { mass: 0.12 });
  });

  const saltG = new THREE.Group();
  saltG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.07, 10), std("#f2f2ee", 0.3)));
  const saltCap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 10), std("#2a2d33", 0.4));
  saltCap.position.y = 0.042;
  saltG.add(saltCap);
  register("соль", 150, saltG, cylShapeY(0.022, 0.07), 2.6, L.tableTopY + 0.035, -1.65, { mass: 0.08, breakable: true, breakVel: 2.4, shardColor: "#f2f2ee" });

  // стулья
  function chair(x, z, yaw) {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.38), std("#a3794e", 0.7));
    seat.position.y = 0.45;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.04), std("#a3794e", 0.7));
    back.position.set(0, 0.68, 0.17);
    g.add(back);
    [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]].forEach(function (o) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), std("#8a6a48", 0.7));
      leg.position.set(o[0], 0.225, o[1]);
      g.add(leg);
    });
    register("стул", 700, g, boxShape(0.19, 0.34, 0.19), x, 0.34, z, { mass: 2.2, yaw: yaw });
  }
  chair(2.6, -3.05, 0.1);
  chair(2.6, -0.75, Math.PI - 0.12);
  chair(1.4, -1.9, Math.PI / 2 + 0.08);
  chair(3.8, -1.9, -Math.PI / 2 - 0.06);

  // миски кота
  const waterBowlG = new THREE.Group();
  waterBowlG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 14), std("#c94a4a", 0.5)));
  const waterTop = new THREE.Mesh(new THREE.CircleGeometry(0.075, 14), new THREE.MeshStandardMaterial({ color: "#5a8ac9", roughness: 0.1 }));
  waterTop.rotation.x = -Math.PI / 2;
  waterTop.position.y = 0.026;
  waterBowlG.add(waterTop);
  register("миску с водой", 150, waterBowlG, cylShapeY(0.08, 0.05), -0.5, 0.03, -2.7, {
    mass: 0.3,
    onScore: function (game, prop) {
      if (prop._spilled) return;
      prop._spilled = true;
      AudioSys.splash();
      spawnWaterDecal(prop.body.position.x + 0.15, prop.body.position.z, 0.28);
      notify("water", prop.body.position.x, prop.body.position.z, prop);
    }
  });

  const foodBowlG = new THREE.Group();
  foodBowlG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.05, 14), std("#5a8ac9", 0.5)));
  const foodTop = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), std("#7a5230", 0.95));
  foodTop.position.y = 0.02;
  foodBowlG.add(foodTop);
  register("миску с кормом", 250, foodBowlG, cylShapeY(0.08, 0.05), -0.25, 0.03, -2.75, {
    mass: 0.3,
    onScore: function (game, prop) {
      if (prop._scattered) return;
      prop._scattered = true;
      spawnKibble(prop.body.position.x, 0.05, prop.body.position.z);
      notify("kibble", prop.body.position.x, prop.body.position.z, prop);
    }
  });

  register("мусорное ведро", 350, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.36, 14), std("#9aa0a8", 0.3, 0.7)), cylShapeY(0.16, 0.36), 6.6, 0.18, -2.4, { mass: 0.6 });

  // ---------- ВАННАЯ ----------
  [["шампунь", "#4a8ac9", 0.3], ["шампунь", "#c95a9e", 0.7], ["гель", "#5ea35e", 1.1]].forEach(function (s: any, i: number) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10), std(s[1], 0.4)));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), std("#f2f2ee", 0.4));
    cap.position.y = 0.095;
    g.add(cap);
    register(s[0], 250, g, cylShapeY(0.04, 0.17), s[2], L.tubTopY + 0.085, 4.42, { mass: 0.25 });
  });

  const cupBristlesG = new THREE.Group();
  cupBristlesG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 12), std("#8ac9c9", 0.4)));
  for (let i = 0; i < 2; i++) {
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 5), std(i ? "#c94a4a" : "#5a8ac9", 0.6));
    br.position.set((i - 0.5) * 0.025, 0.1, 0);
    br.rotation.z = (i - 0.5) * 0.25;
    cupBristlesG.add(br);
  }
  register("стакан с щётками", 200, cupBristlesG, cylShapeY(0.035, 0.09), 6.15, L.sinkTopY + 0.045 + 0.03, 1.0, { mass: 0.2, breakable: true, breakVel: 2.4, shardColor: "#8ac9c9" });

  const soapG = new THREE.Group();
  soapG.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.05), std("#f2e2c9", 0.6)));
  register("мыло", 80, soapG, boxShape(0.037, 0.014, 0.025), 6.52, L.sinkTopY + 0.014 + 0.03, 1.38, { mass: 0.08, yaw: 0.4 });

  register("крем", 350, (function () {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), std("#f2f2ee", 0.4)));
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 10), std("#4a8ac9", 0.4));
    c.position.y = 0.06;
    g.add(c);
    return g;
  })(), cylShapeY(0.03, 0.11), 6.52, L.sinkTopY + 0.055 + 0.03, 1.0, { mass: 0.2 });

  // туалетная бумага
  function tpRoll(x, y, z, lying) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.09, 14), std("#f5f5f0", 0.95)));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.092, 8), std("#b08a55", 0.9));
    g.add(tube);
    const opts: any = { mass: 0.08 };
    if (lying) {
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
      opts.quat = q;
    }
    opts.onScore = function (game, prop) {
      const p = prop.body.position;
      spawnPaperBits(p.x, p.y, p.z);
      notify("paper", p.x, p.z, prop);
    };
    register("бумагу", 60, g, cylShapeY(0.055, 0.09), x, y, z, opts);
  }
  tpRoll(6.8, 0.79, 3.3, false);
  tpRoll(6.45, 0.057, 3.0, true);
  tpRoll(6.55, 0.057, 2.65, true);

  const basketG = new THREE.Group();
  basketG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.42, 16, 1, true), std("#c9b8a0", 0.95)));
  const basketBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), std("#b0a088", 0.95));
  basketBottom.position.y = -0.2;
  basketG.add(basketBottom);
  register("корзину с бельём", 450, basketG, cylShapeY(0.21, 0.42), 4.4, 0.21, 1.5, { mass: 0.5 });

  const scaleG = new THREE.Group();
  scaleG.add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.32), std("#e8e8ea", 0.3)));
  const disp = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.08), std("#22262b", 0.3));
  disp.position.set(0, 0.026, -0.08);
  scaleG.add(disp);
  register("весы", 600, scaleG, boxShape(0.16, 0.022, 0.16), 2.8, 0.023, 2.3, { mass: 0.6 });

  // дополнительные мелочи для баланса ванной (потолок очков комнаты был ниже порога)
  function meshTowel(color) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 12), std(color, 0.95));
    t.rotation.z = Math.PI / 2;
    g.add(t);
    return g;
  }
  register("полотенце", 250, meshTowel("#e8e4da"), boxShape(0.15, 0.055, 0.055), 0.52, L.tubTopY + 0.055, 4.42, { mass: 0.2 });
  register("полотенце", 250, meshTowel("#9ec9e8"), boxShape(0.15, 0.055, 0.055), 1.35, L.tubTopY + 0.055, 4.42, { mass: 0.2 });
  const dryerG = new THREE.Group();
  dryerG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 10), std("#c94a4a", 0.4)));
  const dryerNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.08, 8), std("#2a2d33", 0.4));
  dryerNozzle.position.y = 0.11;
  dryerG.add(dryerNozzle);
  register("фен", 900, dryerG, cylShapeY(0.05, 0.2), 6.18, L.sinkTopY + 0.13, 1.52, { mass: 0.5, breakable: true, breakVel: 2.0, shardColor: "#c94a4a" });
  register("одеколон", 400, meshBottle("#4a8ac9"), cylShapeY(0.05, 0.27), 6.15, L.sinkTopY + 0.135, 1.28, { mass: 0.4, breakable: true, breakVel: 2.5, shardColor: "#4a8ac9" });

  // Новые предметы обихода ванной:
  // 1. Порошок на стиральной машине
  const soapBoxG = new THREE.Group();
  soapBoxG.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.09), std("#3b82f6", 0.6)));
  const soapLid = new THREE.Mesh(new THREE.BoxGeometry(0.164, 0.03, 0.094), std("#f97316", 0.5));
  soapLid.position.y = 0.11;
  soapBoxG.add(soapLid);
  register("порошок", 380, soapBoxG, boxShape(0.08, 0.11, 0.045), 4.65, L.washerTopY + 0.11, 4.15, {
    mass: 0.6, breakable: true, breakVel: 1.8, shardColor: "#3b82f6"
  });

  // 2. Кондиционер для белья
  const condG = new THREE.Group();
  condG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.22, 16), std("#a855f7", 0.4)));
  const condCap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.04, 12), std("#f1f5f9", 0.3));
  condCap.position.y = 0.12;
  condG.add(condCap);
  register("кондиционер", 320, condG, cylShapeY(0.045, 0.24), 5.02, L.washerTopY + 0.12, 4.15, { mass: 0.5 });

  // 3. Тазик пластиковый
  const basinG = new THREE.Group();
  basinG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.12, 20, 1, true), std("#06b6d4", 0.4)));
  const basinBot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 20), std("#06b6d4", 0.4));
  basinBot.position.y = -0.06;
  basinG.add(basinBot);
  register("тазик", 280, basinG, cylShapeY(0.18, 0.12), 4.75, L.washerTopY + 0.06, 3.82, { mass: 0.4 });

  // 4. Стопка полотенец на стиралке
  const towelStackG = new THREE.Group();
  ["#e2e8f0", "#93c5fd", "#fbcfe8"].forEach(function (c, i) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.18), std(c, 0.95));
    t.position.y = i * 0.045;
    towelStackG.add(t);
  });
  register("стопку полотенец", 420, towelStackG, boxShape(0.1, 0.07, 0.09), 5.0, L.washerTopY + 0.07, 3.82, { mass: 0.35 });

  // 5. Ёршик для унитаза
  const brushG = new THREE.Group();
  const brushCup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 14), std("#e2e8f0", 0.4));
  brushG.add(brushCup);
  const brushHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 10), std("#94a3b8", 0.2, 0.8));
  brushHandle.position.y = 0.13;
  brushG.add(brushHandle);
  register("ёршик", 220, brushG, cylShapeY(0.045, 0.27), 5.45, 0.135, 4.25, { mass: 0.3, breakable: true, breakVel: 1.8, shardColor: "#e2e8f0" });

  // 6. Освежитель воздуха
  const sprayG = new THREE.Group();
  sprayG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.19, 14), std("#10b981", 0.35)));
  const sprayCap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.04, 12), std("#f8fafc", 0.3));
  sprayCap.position.y = 0.105;
  sprayG.add(sprayCap);
  register("освежитель", 240, sprayG, cylShapeY(0.032, 0.21), 5.48, 0.105, 3.92, { mass: 0.25 });

  // 7. Пена для бритья (на раковине)
  const shaveG = new THREE.Group();
  shaveG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 14), std("#2563eb", 0.3, 0.5)));
  const shaveCap = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.035, 12), std("#f8fafc", 0.4));
  shaveCap.position.y = 0.09;
  shaveG.add(shaveCap);
  register("пену для бритья", 280, shaveG, cylShapeY(0.03, 0.18), 6.55, L.sinkTopY + 0.09 + 0.03, 1.12, { mass: 0.3 });

  // 8. Тюбик зубной пасты
  const pasteG = new THREE.Group();
  pasteG.add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.13), std("#ef4444", 0.5)));
  const pasteCap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), std("#ffffff", 0.4));
  pasteCap.rotation.x = Math.PI / 2;
  pasteCap.position.z = 0.07;
  pasteG.add(pasteCap);
  register("зубную пасту", 140, pasteG, boxShape(0.02, 0.01, 0.065), 6.18, L.sinkTopY + 0.01 + 0.03, 1.45, { mass: 0.1 });

  // 9. Ополаскиватель для рта
  const mouthwashG = new THREE.Group();
  mouthwashG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.18, 16), new THREE.MeshStandardMaterial({ color: "#14b8a6", roughness: 0.1, transparent: true, opacity: 0.8 })));
  const mwCap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), std("#ffffff", 0.3));
  mwCap.position.y = 0.105;
  mouthwashG.add(mwCap);
  register("ополаскиватель", 260, mouthwashG, cylShapeY(0.04, 0.2), 6.42, 1.25 + 0.1, 1.05, { mass: 0.35, breakable: true, breakVel: 2.0, shardColor: "#14b8a6" });

  // 10. Морская соль для ванн (на полочке)
  const bathSaltG = new THREE.Group();
  bathSaltG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 16), new THREE.MeshStandardMaterial({ color: "#e879f9", roughness: 0.15, transparent: true, opacity: 0.85 })));
  const saltCork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 14), std("#b45309", 0.8));
  saltCork.position.y = 0.06;
  bathSaltG.add(saltCork);
  register("морскую соль", 310, bathSaltG, cylShapeY(0.045, 0.12), 6.42, 1.25 + 0.06, 1.35, { mass: 0.35, breakable: true, breakVel: 2.0, shardColor: "#e879f9" });

  // 11-12. Резиновые утята (в ванне)
  function meshDuckling() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 14, 10), std("#facc15", 0.5));
    b.scale.set(1, 0.8, 1.2);
    g.add(b);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), std("#facc15", 0.5));
    h.position.set(0, 0.032, 0.032);
    g.add(h);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.022, 8), std("#ea580c", 0.6));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.028, 0.055);
    g.add(beak);
    return g;
  }
  register("утёнка", 150, meshDuckling(), cylShapeY(0.04, 0.08), 1.2, L.tubTopY + 0.04, 4.15, { mass: 0.1 });
  register("утёнка", 150, meshDuckling(), cylShapeY(0.04, 0.08), 1.45, L.tubTopY + 0.04, 3.9, { mass: 0.1 });

  // 13. Мочалка/губка на бортике
  const spongeG = new THREE.Group();
  spongeG.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.08), std("#84cc16", 0.95)));
  register("мочалку", 120, spongeG, boxShape(0.06, 0.025, 0.04), 0.9, L.tubTopY + 0.025, 3.56, { mass: 0.08 });

  // ---------- СПАЛЬНЯ ----------
  // подушки на кровати
  [[9.85, -4.08, "#e8ddc9"], [10.55, -4.08, "#d8c9b0"]].forEach(function (a: any) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.34), std(a[2], 1)));
    register("подушку", 300, g, boxShape(0.25, 0.06, 0.17), a[0], L.mattressTopY + 0.06, a[1], { mass: 0.3, yaw: (Math.random() - 0.5) * 0.2 });
  });
  // телефон на кровати
  const phoneG = new THREE.Group();
  phoneG.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.01, 0.15), std("#22262b", 0.4)));
  const phoneScr = new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.13), new THREE.MeshStandardMaterial({ color: "#0c1420", emissive: "#9fd8ff", emissiveIntensity: 0.5 }));
  phoneScr.rotation.x = -Math.PI / 2;
  phoneScr.position.y = 0.006;
  phoneG.add(phoneScr);
  register("телефон", 1500, phoneG, boxShape(0.037, 0.005, 0.075), 10.2, L.mattressTopY + 0.006, -3.2, { mass: 0.2, yaw: 0.4 });
  // будильник на тумбочке
  const clockG2 = new THREE.Group();
  clockG2.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), std("#c94a4a", 0.5)));
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), std("#f2f2ee", 0.4));
  clockFace.position.set(0, 0.005, 0.045);
  clockG2.add(clockFace);
  [-1, 1].forEach(function (s) {
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), std("#d8b23a", 0.3, 0.8));
    bell.position.set(s * 0.03, 0.03, 0);
    clockG2.add(bell);
  });
  register("будильник", 400, clockG2, cylShapeY(0.055, 0.05), 8.78, L.nightstandTopY + 0.03, -4.2, { mass: 0.3, breakable: true, breakVel: 1.8, shardColor: "#c94a4a" });
  // прикроватная лампа (квест)
  const bedLampG = new THREE.Group();
  const bedLampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 12), std("#4a4a52", 0.5, 0.4));
  bedLampBase.position.y = -0.1475;
  bedLampG.add(bedLampBase);
  const bedLampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), std("#4a4a52", 0.5, 0.4));
  bedLampPole.position.y = -0.035;
  bedLampG.add(bedLampPole);
  const bedLampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#f5e2b8", emissive: "#ffdf94", emissiveIntensity: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
  bedLampShade.position.y = 0.10;
  bedLampG.add(bedLampShade);
  const bedLampLight = new THREE.PointLight("#ffdf94", 0.45, 5, 1.8);
  bedLampLight.position.set(0, 0.10, 0);
  bedLampG.add(bedLampLight);
  const bedLampProp = register("лампу", 900, bedLampG, boxShape(0.07, 0.16, 0.07), 9.02, L.nightstandTopY + 0.16, -4.08, {
    mass: 0.4, breakable: true, breakVel: 1.4, shardColor: "#f5e2b8",
    keepMeshOnBreak: true,
    onBreak: function () { bedLampLight.intensity = 0; }
  });
  // комод: книги, духи, кружка
  const bedBookColors = ["#a33c3c", "#3c6ea3", "#c9a03c"];
  bedBookColors.forEach(function (c, i) {
    register("книгу", 250, meshBook(c), boxShape(0.025, 0.12, 0.09), 8.35 + i * 0.09, L.dresserTopY + 0.12, 4.28, { mass: 0.3, yaw: (Math.random() - 0.5) * 0.1 });
  });
  register("духи", 1100, meshVase(0.14, 0.045, "#d88ac9"), boxShape(0.04, 0.08, 0.04), 8.85, L.dresserTopY + 0.08, 4.28, { mass: 0.2, breakable: true, breakVel: 2.2, shardColor: "#d88ac9" });
  register("кружку", 200, meshCup("#7a4a9e"), cylShapeY(0.035, 0.09), 9.3, L.dresserTopY + 0.045, 4.15, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#7a4a9e" });
  // цветок в углу
  const bedPlantG = new THREE.Group();
  bedPlantG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 12), std("#b0684a", 0.8)));
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), std("#4a8a4e", 0.8));
    leaf.position.set((Math.random() - 0.5) * 0.1, 0.22, (Math.random() - 0.5) * 0.1);
    leaf.rotation.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
    bedPlantG.add(leaf);
  }
  register("цветок", 550, bedPlantG, cylShapeY(0.11, 0.22), 7.6, 0.11, 3.95, { mass: 0.6, breakable: true, breakVel: 2.2, shardColor: "#b0684a" });
  // картины на стене спальни
  hangPicture("картину", 700, 0.55, 0.7, 7.8, 1.6, 4.46, 44);
  hangPicture("картину", 700, 0.6, 0.45, 9.9, 1.62, 4.46, 55);

  // цели для точения когтей
  [L.rug, L.bathMat, L.sofa, L.catTree, L.bedRug].forEach(function (t) {
    scratchTargets.push({ name: t.name, x: t.x, z: t.z, r: t.r, points: t.points, cd: 0, questId: t.questId || null });
  });

  // ---------- РОБОТ-ПЫЛЕСОС «ЖОРКА-3000» ----------
  const vacG = new THREE.Group();
  const vacBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 32), std("#252830", 0.35, 0.4));
  vacBase.castShadow = true;
  vacG.add(vacBase);

  const vacBumper = new THREE.Mesh(new THREE.CylinderGeometry(0.286, 0.286, 0.05, 32), std("#15171c", 0.7));
  vacBumper.position.y = -0.012;
  vacG.add(vacBumper);

  // Лидар-башенка
  const vacLidar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.035, 20), std("#1c1e24", 0.4, 0.6));
  vacLidar.position.set(0, 0.055, -0.06);
  vacG.add(vacLidar);

  // Крышка отсека (откидывается при поломке)
  const vacLid = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.012, 24), std("#2d313b", 0.35));
  vacLid.position.set(0, 0.046, 0.03);
  vacG.add(vacLid);

  // Внутренние провода под крышкой
  const vacWires = new THREE.Group();
  [[-0.05, "#ff3333"], [0, "#3388ff"], [0.05, "#ffcc00"]].forEach(function (w: any) {
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.09), new THREE.MeshBasicMaterial({ color: w[1] }));
    wire.position.set(w[0], 0.042, 0.03);
    vacWires.add(wire);
  });
  vacWires.visible = false;
  vacG.add(vacWires);

  // Крупный проблесковый маячок / сирена на корпусе
  const vacSirenG = new THREE.Group();
  vacSirenG.position.set(0, 0.058, 0.12);
  const vacSirenBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 16), std("#15171c", 0.8));
  vacSirenG.add(vacSirenBase);
  const vacSirenDome = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshBasicMaterial({ color: "#00ff66" }));
  vacSirenDome.position.y = 0.025;
  vacSirenG.add(vacSirenDome);
  const vacLight = new THREE.PointLight("#00ff66", 0.9, 3.0);
  vacLight.position.y = 0.04;
  vacSirenG.add(vacLight);
  vacG.add(vacSirenG);

  // ---------- 3D Floating HP Bar (полоска здоровья) ----------
  const hpG = new THREE.Group();
  hpG.position.set(0, 0.36, 0);

  const hpBg = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.048, 0.01), new THREE.MeshBasicMaterial({ color: "#0a0c10", transparent: true, opacity: 0.85, depthTest: true }));
  hpBg.name = "vacHpBg";
  hpG.add(hpBg);

  const hpFill = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.034, 0.014), new THREE.MeshBasicMaterial({ color: "#00ff66", depthTest: true }));
  hpFill.name = "vacHpFill";
  hpG.add(hpFill);

  // Текстовая плашка со здоровьем
  const hpCanvas = document.createElement("canvas");
  hpCanvas.width = 256; hpCanvas.height = 64;
  const hpCtx = hpCanvas.getContext("2d");
  const hpTex = new THREE.CanvasTexture(hpCanvas);
  const hpLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthTest: true }));
  hpLabel.name = "vacHpLabel";
  hpLabel.position.y = 0.07;
  hpLabel.scale.set(0.55, 0.14, 1);
  hpG.add(hpLabel);

  function renderHpText(cur, max) {
    hpCtx.clearRect(0, 0, 256, 64);
    hpCtx.font = "bold 26px 'Segoe UI', system-ui, sans-serif";
    hpCtx.textAlign = "center"; hpCtx.textBaseline = "middle";
    hpCtx.fillStyle = "#ffffff";
    hpCtx.shadowColor = "rgba(0,0,0,0.9)"; hpCtx.shadowBlur = 6;
    hpCtx.fillText("ЖОРКА-3000: " + Math.max(0, Math.round(cur)) + "/" + max + " HP", 128, 32);
    hpTex.needsUpdate = true;
  }
  renderHpText(100, 100);

  // Статус-бейдж сломанного робота
  const brokenCanvas = document.createElement("canvas");
  brokenCanvas.width = 256; brokenCanvas.height = 64;
  const bCtx = brokenCanvas.getContext("2d");
  bCtx.font = "900 32px 'Segoe UI', system-ui, sans-serif";
  bCtx.textAlign = "center"; bCtx.textBaseline = "middle";
  bCtx.fillStyle = "#ff2200";
  bCtx.shadowColor = "rgba(255, 30, 0, 0.85)"; bCtx.shadowBlur = 10;
  bCtx.fillText("⚠️ СЛОМАН", 128, 32);
  const brokenTex = new THREE.CanvasTexture(brokenCanvas);
  const brokenBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: brokenTex, transparent: true, depthTest: true }));
  brokenBadge.name = "vacBrokenBadge";
  brokenBadge.position.y = 0.36;
  brokenBadge.scale.set(0.65, 0.16, 1);
  brokenBadge.visible = false;
  vacG.add(brokenBadge);

  vacG.add(hpG);

  const vacSpawn = { x: -3.0, y: 0.042, z: 1.0 };
  vacG.position.set(vacSpawn.x, vacSpawn.y, vacSpawn.z);
  scene.add(vacG);

  const vacBody = new CANNON.Body({ mass: 4.5, material: M.prop, type: CANNON.Body.KINEMATIC });
  vacBody.addShape(cylShapeY(0.28, 0.08));
  vacBody.position.set(vacSpawn.x, vacSpawn.y, vacSpawn.z);
  world.addBody(vacBody);

  const vacuum = {
    mesh: vacG,
    body: vacBody,
    led: vacSirenDome,
    light: vacLight,
    lid: vacLid,
    hpG: hpG,
    brokenBadge: brokenBadge,
    maxHp: 100,
    hp: 100,
    broken: false,
    scareCd: 0,
    yaw: 0,
    targetYaw: 0,
    turnTimer: 2.5,
    spinAngle: 0,
    smokeTimer: 0,
    sparkTimer: 0,
    stunTimer: 0,
    pos: vacBody.position,
    room: "living",

    updateHp: function () {
      const pct = Math.max(0.001, Math.min(1, this.hp / this.maxHp));
      hpFill.scale.x = pct;
      hpFill.position.x = -0.205 * (1 - pct);
      if (pct > 0.55) {
        hpFill.material.color.set("#00ff66");
      } else if (pct > 0.25) {
        hpFill.material.color.set("#ffaa00");
      } else {
        hpFill.material.color.set("#ff2200");
      }
      renderHpText(this.hp, this.maxHp);
    },

    damage: function (amt, otherBody, v) {
      if (this.broken) return;
      this.hp = Math.max(0, this.hp - amt);
      this.updateHp();
      if (AudioSys.impact) AudioSys.impact();
      if (KOTO.fx) KOTO.fx.sparks(this.pos.x, this.pos.y + 0.1, this.pos.z, 10);
      if (KOTO.game) {
        KOTO.game.floater(this.pos, "-" + amt + " HP!", "break");
        KOTO.game.addFeed("Жорка-3000 получил урон: -" + amt + " HP! (" + Math.round(this.hp) + "/" + this.maxHp + ")");
        KOTO.game.state.shake = Math.min(1, KOTO.game.state.shake + 0.3);
      }
      if (this.hp <= 0) {
        this.break();
      }
    },

    break: function () {
      if (this.broken) return;
      this.broken = true;
      this.hp = 0;
      this.hpG.visible = false;
      this.brokenBadge.visible = true;
      this.led.material.color.set("#ff1100");
      this.light.color.set("#ff1100");
      this.light.intensity = 2.2;
      this.lid.rotation.x = 0.72;
      this.lid.position.y += 0.035;
      vacWires.visible = true;
      if (AudioSys.vacuumBroke) AudioSys.vacuumBroke();
      if (KOTO.fx) {
        KOTO.fx.sparks(this.pos.x, this.pos.y + 0.1, this.pos.z, 22);
        KOTO.fx.dust(this.pos.x, 0.05, this.pos.z, 12);
        if (KOTO.fx.smoke) KOTO.fx.smoke(this.pos.x, this.pos.y + 0.1, this.pos.z, 6);
      }
      if (KOTO.game) {
        const pts = 12000;
        const mult = KOTO.game.comboMult();
        const total = Math.round(pts * mult);
        const r = KOTO.levels.roomOf(this.pos.x, this.pos.z) || "living";
        KOTO.game.addScore(total, r);
        KOTO.game.record("Сломал: Робот-пылесос", total);
        KOTO.game.floater(this.pos, "+12 000 ₽ ЖОРКА-3000 УНИЧТОЖЕН!", "strike");
        KOTO.game.addFeed("ЖОРКА-3000 ПОВЕРЖЕН! +" + total.toLocaleString("ru-RU") + " ₽");
        KOTO.game.state.shake = Math.min(1, KOTO.game.state.shake + 0.6);
        if (KOTO.game.state.metaQuests) {
          KOTO.game.state.metaQuests.vacuumSlayer = true;
        }
      }
    },

    reset: function () {
      this.broken = false;
      this.hp = this.maxHp;
      this.updateHp();
      this.hpG.visible = true;
      this.brokenBadge.visible = false;
      this.led.material.color.set("#00ff66");
      this.light.color.set("#00ff66");
      this.light.intensity = 0.9;
      this.lid.rotation.set(0, 0, 0);
      this.lid.position.set(0, 0.046, 0.03);
      vacWires.visible = false;
      this.pos.set(vacSpawn.x, vacSpawn.y, vacSpawn.z);
      this.mesh.position.set(vacSpawn.x, vacSpawn.y, vacSpawn.z);
      this.mesh.rotation.set(0, 0, 0);
      this.yaw = 0;
      this.targetYaw = 0;
      this.turnTimer = 2.5;
      this.spinAngle = 0;
      this.smokeTimer = 0;
      this.sparkTimer = 0;
      this.stunTimer = 0;
      this.scareCd = 0;
      this.body.velocity.set(0, 0, 0);
      this.body.angularVelocity.set(0, 0, 0);
    }
  };

  vacBody.addEventListener("collide", function (e) {
    if (!e.contact || vacuum.broken) return;
    if (typeof window !== 'undefined' && window.KOTO && window.KOTO.game && window.KOTO.game.state && window.KOTO.game.state.mode !== 'play') return;
    const other = e.body;
    if (!other || other === vacBody) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop && v > 1.1) {
      const mass = other.mass || 0.5;
      const isLasso = (other as any)._isLassoThrown;
      const dmg = isLasso ? Math.max(50, Math.round(v * 22 * Math.min(2.5, mass))) : Math.min(100, Math.max(25, Math.round(v * 22 * Math.min(2.5, mass))));
      vacuum.damage(dmg, other, v);
    }
  });

  // Навигация робота с учётом стен и дверей (не проходить сквозь стены!)
  function canVacuumMove(newX, newZ, curX, curZ) {
    const R = 0.32;
    // 1. Внешний периметр квартиры
    if (newX - R < -6.85 || newX + R > 10.85) return false;
    if (newZ - R < -4.25 || newZ + R > 4.25) return false;

    // 2. Стена x = -1.5 (разделяет Гостиную и Кухню/Ванную)
    const crossingW1 = (curX < -1.5 && newX + R >= -1.5) || (curX > -1.5 && newX - R <= -1.5) || Math.abs(newX - (-1.5)) < R;
    if (crossingW1) {
      const inDoorA = (newZ >= -2.25 && newZ <= -1.15);
      const doorAOpen = apt.doors.A && apt.doors.A.isOpen;
      const inDoorB = (newZ >= 1.65 && newZ <= 2.75);
      const doorBOpen = apt.doors.B && apt.doors.B.isOpen;
      if (!(inDoorA && doorAOpen) && !(inDoorB && doorBOpen)) return false;
    }

    // 3. Стена z = 0.6 (разделяет Кухню и Ванную от x = -1.5 до x = 7.125 — глухая стена)
    if (newX >= -1.5 && newX <= 7.125) {
      const crossingW2 = (curZ < 0.6 && newZ + R >= 0.6) || (curZ > 0.6 && newZ - R <= 0.6) || Math.abs(newZ - 0.6) < R;
      if (crossingW2) return false;
    }

    // 4. Стена x = 7.125 (разделяет Кухню/Ванную и Спальню)
    const crossingW3 = (curX < 7.125 && newX + R >= 7.125) || (curX > 7.125 && newX - R <= 7.125) || Math.abs(newX - 7.125) < R;
    if (crossingW3) {
      const inDoorV = (newZ >= -1.65 && newZ <= -0.75);
      const doorVOpen = apt.doors.V && apt.doors.V.isOpen;
      if (!(inDoorV && doorVOpen)) return false;
    }

    // 5. Крупные препятствия мебели
    // Тумба под телевизор в гостиной: стоит на полу, пылесос не должен заезжать в текстуры!
    if (newX >= -2.60 && newX <= -1.40 && newZ >= -0.12 && newZ <= 1.92) return false;
    // Диван в гостиной: x [-6.95, -5.7], z [-0.7, 2.5]
    if (newX <= -5.68 && newZ >= -0.7 && newZ <= 2.5) return false;
    // Книжный шкаф у окна: x [-6.0, -3.0], z <= -3.7
    if (newX >= -6.0 && newX <= -3.0 && newZ <= -3.7) return false;
    // Ванна в ванной: x [-0.2, 2.1], z [3.4, 4.5]
    if (newX >= -0.2 && newX <= 2.1 && newZ >= 3.4 && newZ <= 4.5) return false;
    // Кровать в спальне: x [9.2, 11.0], z [-4.4, -2.1]
    if (newX >= 9.2 && newX <= 11.0 && newZ >= -4.4 && newZ <= -2.1) return false;
    // Кухонный гарнитур: x [-1.5, 4.5], z [-4.5, -3.5]
    if (newX >= -1.5 && newX <= 4.5 && newZ >= -4.5 && newZ <= -3.5) return false;

    return true;
  }

  function update(dt) {
    if (typeof tvCartoon !== "undefined") tvCartoon.update(dt);
    for (let i = transients.length - 1; i >= 0; i--) {
      const tr = transients[i];
      tr.t += dt;
      if (tr.onUpdate) tr.onUpdate(tr, dt);
      if (tr.t > tr.life) {
        if (tr.body) world.removeBody(tr.body);
        scene.remove(tr.mesh);
        transients.splice(i, 1);
      }
    }
    if (fish.alive) {
      fish.t += dt;
      if (fish.mesh) {
        fish.mesh.position.copy(fish.body.position);
        fish.mesh.quaternion.copy(fish.body.quaternion);
      }
      if (fish.t < 6) {
        if (Math.random() < dt * 3) {
          fish.body.wakeUp();
          fish.body.velocity.x += (Math.random() - 0.5) * 1.6;
          fish.body.velocity.z += (Math.random() - 0.5) * 1.6;
          fish.body.velocity.y = 1.1 + Math.random() * 0.5;
        }
      }
    }
    if (fridge.openAngle < fridge.targetAngle) {
      fridge.openAngle += (fridge.targetAngle - fridge.openAngle) * Math.min(1, 8 * dt);
      fridge.doorGroup.rotation.y = -fridge.openAngle;
    }
    // Анимация сминания ткани штор при падении (штора не стоит жесткой буквой П!)
    hangProps.forEach(function (p: any) {
      if (p.hangingG && p.crumpledG) {
        if (p.released) {
          const curY = p.body.position.y;
          if (curY > 0.45) {
            // В воздухе: ткань опадает и сминается по вертикали
            const progress = Math.max(0, Math.min(1, (2.44 - curY) / 1.8));
            p.hangingG.scale.y = Math.max(0.18, 1.0 - progress * 0.82);
            p.hangingG.position.y = -(1.0 - p.hangingG.scale.y) * 0.5;
            p.hangingG.visible = true;
            p.crumpledG.visible = false;
          } else {
            // Упала на пол: шторы мягко смяты на полу, деревянный карниз лежит рядом
            p.hangingG.visible = false;
            p.crumpledG.visible = true;
            p.crumpledG.position.set(p.body.position.x, 0.012, p.body.position.z);
            const rot = new THREE.Euler().setFromQuaternion(p.mesh.quaternion);
            p.crumpledG.rotation.y = rot.y;
          }
        } else {
          p.hangingG.visible = true;
          p.hangingG.scale.set(1, 1, 1);
          p.hangingG.position.set(0, 0, 0);
          p.crumpledG.visible = false;
        }
      }
    });
    // Обновление Жорки-3000
    if (!vacuum.broken) {
      if (vacuum.stunTimer > 0) {
        vacuum.stunTimer -= dt;
        vacuum.mesh.position.copy(vacuum.pos);
        vacuum.mesh.rotation.y = vacuum.yaw + Math.sin(performance.now() * 0.015) * 0.1;
        return;
      }
      vacuum.turnTimer -= dt;
      if (vacuum.turnTimer <= 0) {
        vacuum.turnTimer = 3.5 + Math.random() * 4.0;
        vacuum.targetYaw = vacuum.yaw + (Math.random() - 0.5) * Math.PI * 1.2;
      }

      let yd = vacuum.targetYaw - vacuum.yaw;
      while (yd > Math.PI) yd -= Math.PI * 2;
      while (yd < -Math.PI) yd += Math.PI * 2;
      vacuum.yaw += yd * Math.min(1, 4 * dt);

      const sp = 1.15;
      const nextX = vacuum.pos.x + Math.sin(vacuum.yaw) * sp * dt;
      const nextZ = vacuum.pos.z + Math.cos(vacuum.yaw) * sp * dt;

      if (canVacuumMove(nextX, nextZ, vacuum.pos.x, vacuum.pos.z)) {
        vacuum.pos.x = nextX;
        vacuum.pos.z = nextZ;
      } else {
        // Упёрся в стену или закрытую дверь — отскок бампером и разворот!
        vacuum.targetYaw = vacuum.yaw + Math.PI * (0.6 + Math.random() * 0.8);
        vacuum.turnTimer = 2.0 + Math.random() * 2.5;
      }

      vacuum.mesh.position.copy(vacuum.pos);
      vacuum.mesh.rotation.y = vacuum.yaw;

      // Опасность для кота: наезд сбивает комбо в 0 и вызывает панику!
      if (KOTO.cat && vacuum.scareCd <= 0) {
        const cp = KOTO.cat.body.position;
        const dx = cp.x - vacuum.pos.x, dz = cp.z - vacuum.pos.z;
        if (Math.hypot(dx, dz) < 0.52 && Math.abs(cp.y - vacuum.pos.y) < 0.45) {
          vacuum.scareCd = 3.0;
          KOTO.cat.body.velocity.y = 4.2;
          KOTO.cat.body.velocity.x += (dx >= 0 ? 3.0 : -3.0);
          KOTO.cat.body.velocity.z += (dz >= 0 ? 3.0 : -3.0);
          if (KOTO.cat.scare) KOTO.cat.scare(2.0);
          if (AudioSys.hiss) AudioSys.hiss();
          if (KOTO.game) {
            KOTO.game.state.combo = 0;
            KOTO.game.state.comboT = 0;
            KOTO.game.floater(cp, "⚡ ПЫЛЕСОС! ИСПУГ! КОМБО СБРОШЕНО!", "break");
            KOTO.game.addFeed("Жорка-3000 наехал на кота! Серия комбо сброшена!");
            KOTO.game.state.shake = 0.6;
            // Экранная вспышка испуга
            const sc = document.createElement("div");
            sc.className = "screen-scared";
            document.body.appendChild(sc);
            setTimeout(function () { sc.remove(); }, 800);
            const comboEl = document.getElementById("hud-combo");
            if (comboEl) {
              comboEl.classList.remove("combo-shattered");
              void comboEl.offsetWidth;
              comboEl.classList.add("combo-shattered");
            }
          }
        }
      }
      if (vacuum.scareCd > 0) vacuum.scareCd -= dt;
    } else {
      // Сломанный робот: хромает на разбитом колесе, дымит, мигает сиреной и искрит
      vacuum.spinAngle += dt * 7.5;
      vacG.rotation.y = vacuum.spinAngle;
      vacG.rotation.z = Math.sin(vacuum.spinAngle * 2) * 0.16;
      vacG.rotation.x = Math.cos(vacuum.spinAngle * 2) * 0.12;

      // Мигание аварийной сирены и красный свет
      const flash = Math.sin(performance.now() / 90) > 0;
      vacSirenDome.material.color.set(flash ? "#ff0000" : "#440000");
      vacLight.color.set("#ff0000");
      vacLight.intensity = flash ? 2.8 : 0.2;

      // Густой чёрный дым
      vacuum.smokeTimer = (vacuum.smokeTimer || 0) + dt;
      if (vacuum.smokeTimer > 0.08) {
        vacuum.smokeTimer = 0;
        if (KOTO.fx && KOTO.fx.smoke) {
          KOTO.fx.smoke(vacuum.pos.x, vacuum.pos.y + 0.08, vacuum.pos.z, 1);
        }
      }

      // Электрические искры
      vacuum.sparkTimer = (vacuum.sparkTimer || 0) + dt;
      if (vacuum.sparkTimer > 0.45) {
        vacuum.sparkTimer = 0;
        if (KOTO.fx) {
          KOTO.fx.sparks(vacuum.pos.x, vacuum.pos.y + 0.08, vacuum.pos.z, 5);
        }
      }
    }

    for (const t of scratchTargets) {
      if (t.cd > 0) t.cd -= dt;
    }
    for (const p of props) {
      if (p.scoreCd > 0) p.scoreCd -= dt;
    }

    if (floorLampProp) {
      if (floorLampProp.broken) {
        lampLight.intensity = 0;
      } else {
        const up = new CANNON.Vec3(0, 1, 0);
        floorLampProp.body.quaternion.vmult(up, up);
        if (up.y < 0.65) lampLight.intensity = 0;
        else if (lampLight.intensity === 0) lampLight.intensity = 0.65;
      }
    }
    if (bedLampProp) {
      if (bedLampProp.broken) {
        bedLampLight.intensity = 0;
      } else {
        const up = new CANNON.Vec3(0, 1, 0);
        bedLampProp.body.quaternion.vmult(up, up);
        if (up.y < 0.65) bedLampLight.intensity = 0;
        else if (bedLampLight.intensity === 0) bedLampLight.intensity = 0.45;
      }
    }

    if (tvProp && tvProp.broken) {
      if ((tvProp as any)._smokeTimer === undefined) (tvProp as any)._smokeTimer = 0;
      if ((tvProp as any)._smokeTimer < 5.0) {
        (tvProp as any)._smokeTimer += dt;
        if (Math.random() < dt * 3 && KOTO.fx && KOTO.fx.smoke) {
          const bp = tvProp.body.position;
          KOTO.fx.smoke(bp.x, bp.y + 0.25, bp.z, 1);
        }
      }
    }
  }

  function removeProp(prop: Prop) {
    prop._removing = true;
    prop.broken = true;
    world.removeBody(prop.body);
    scene.remove(prop.mesh);
  }

  function resetProps() {
    if (vacuum && vacuum.reset) {
      vacuum.reset();
    }

    // 1. Удаление выпавших из холодильника продуктов
    spawnedGroceries.forEach(g => {
      if (g.body) world.removeBody(g.body);
      if (g.mesh) scene.remove(g.mesh);
      const idx = props.indexOf(g);
      if (idx >= 0) props.splice(idx, 1);
    });
    spawnedGroceries.length = 0;

    // 2. Сброс состояния холодильника
    if (fridge) {
      fridge.opened = false;
      fridge.openAngle = 0;
      fridge.targetAngle = 0;
      if (fridge.doorGroup) fridge.doorGroup.rotation.y = 0;
    }

    // 3. Сброс трепыхающейся рыбки из аквариума
    if (fish && fish.alive) {
      if (fish.body) world.removeBody(fish.body);
      if (fish.mesh) scene.remove(fish.mesh);
      fish.body = null;
      fish.mesh = null;
      fish.alive = false;
      fish.t = 0;
    }

    // 4. Сброс луж к исходной (в ванной)
    puddles.length = 1;

    // 5. Сброс кулдаунов когтеточек
    scratchTargets.forEach(t => {
      t.cd = 0;
    });

    // 6. Сброс всех настенных предметов (картины, карниз, часы)
    hangProps.forEach(p => {
      p.released = false;
      p.scored = false;
      p.broken = false;
      p.body.type = CANNON.Body.KINEMATIC;
      p.body.mass = (p.name.indexOf('карниз') >= 0 ? 2.4 : 0.4);
      p.body.updateMassProperties();
      if (p.initialPosition) p.body.position.copy(p.initialPosition);
      if (p.initialQuaternion) p.body.quaternion.copy(p.initialQuaternion);
      else p.body.quaternion.set(0, 0, 0, 1);
      p.body.velocity.set(0, 0, 0);
      p.body.angularVelocity.set(0, 0, 0);
      p.body.sleep();
      p.mesh.position.copy(p.body.position as any);
      p.mesh.quaternion.copy(p.body.quaternion as any);
      if ((p as any).hangingG) {
        (p as any).hangingG.visible = true;
        (p as any).hangingG.scale.set(1, 1, 1);
        (p as any).hangingG.position.set(0, 0, 0);
      }
      if ((p as any).crumpledG) {
        (p as any).crumpledG.visible = false;
      }
    });

    // 7. Сброс всех интерактивных предметов
    props.forEach(p => {
      if (p.broken && !p.keepMeshOnBreak) {
        scene.add(p.mesh);
        world.addBody(p.body);
      }
      p.broken = false;
      p.scoreCd = 0;
      p.repeatHits = 0;
      p._removing = false;
      p._isDailySpecial = false;
      p._isLassoThrown = false;
      (p as any)._spilled = false;
      (p as any)._scattered = false;
      const halo = p.mesh.getObjectByName('__daily_halo');
      if (halo) p.mesh.remove(halo);

      if (p.hang) {
        p.released = false;
        p.scored = false;
        p.body.type = CANNON.Body.KINEMATIC;
        p.body.mass = (p.name.indexOf('карниз') >= 0 ? 3.5 : 0.4);
        p.body.updateMassProperties();
      }

      if (p.initialPosition) {
        p.body.position.copy(p.initialPosition);
      }
      if (p.initialQuaternion) {
        p.body.quaternion.copy(p.initialQuaternion);
      } else {
        p.body.quaternion.set(0, 0, 0, 1);
      }
      p.body.velocity.set(0, 0, 0);
      p.body.angularVelocity.set(0, 0, 0);
      p.body.sleep();
      p.mesh.position.copy(p.body.position as any);
      p.mesh.quaternion.copy(p.body.quaternion as any);
    });

    if (tvProp) (tvProp as any)._smokeTimer = 0;
    if (lampLight) lampLight.intensity = 0.65;
    if (bedLampLight) bedLampLight.intensity = 0.45;
    if (typeof tvCartoon !== "undefined") tvCartoon.reset();
    if (typeof tvScreenMat !== "undefined") tvScreenMat.emissiveIntensity = 0.7;
    transients.forEach(t => {
      scene.remove(t.mesh);
      if (t.body) world.removeBody(t.body);
    });
    transients.length = 0;
  }

  return {
    props: props, hangProps: hangProps, transients: transients, scratchTargets: scratchTargets,
    fish: fish, puddles: puddles, fx: fx, fridge: fridge, vacuum: vacuum, canVacuumMove: canVacuumMove,
    update: update, removeProp: removeProp, resetProps: resetProps, spawnShards: spawnShards,
    spawnDust: spawnDust, spawnSparks: spawnSparks, spawnSplashes: spawnSplashes,
    spawnFeathers: spawnFeathers, spawnPawPrint: spawnPawPrint
  };
}

if (typeof window !== 'undefined') {
  (window as any).buildProps = buildProps;
}

export default buildProps;
