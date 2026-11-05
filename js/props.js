"use strict";

function buildProps(scene, world, apt) {
  const M = apt.M, L = apt.L, std = apt.std;
  const props = [];
  const hangProps = [];
  const transients = [];
  const scratchTargets = [];
  const fish = { body: null, mesh: null, t: 0, alive: false };

  function cylShapeY(r, h) {
    const s = new CANNON.Cylinder(r, r, h, 10);
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    s.transformAllPoints(new CANNON.Vec3(0, 0, 0), q);
    return s;
  }

  // события мира для counter-квестов (game.js обрабатывает в onWorldEvent)
  function notify(type, x, z, prop) {
    if (KOTO.game && KOTO.game.onWorldEvent) KOTO.game.onWorldEvent(type, x, z, prop);
  }

  function register(name, value, group, shape, x, y, z, opts) {
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
    group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(group);
    const prop = {
      name: name, value: value, mesh: group, body: body,
      breakable: !!opts.breakable, breakVel: opts.breakVel || 2.4,
      shardColor: opts.shardColor || "#cccccc",
      broken: false, scoreCd: 0, mass: opts.mass || 0.4,
      onBreak: opts.onBreak || null, onScore: opts.onScore || null,
      hang: !!opts.hang, released: false,
      room: KOTO.levels.roomOf(x, z)
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const other = e.body;
      const isStrike = !!(other && other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop);
      if (KOTO.game) KOTO.game.onPropImpact(prop, v, isStrike);
    });
    props.push(prop);
    if (prop.hang) hangProps.push(prop);
    return prop;
  }

  function boxShape(x, y, z) { return new CANNON.Box(new CANNON.Vec3(x, y, z)); }

  // ---------- мелкие сборщики мешей ----------
  function meshCup(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.09, 12), std(color, 0.4)));
    return g;
  }
  function meshPlate() {
    return new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.028, 16), std("#f2f2ee", 0.35));
  }
  function meshBottle(color) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.048, 0.22, 12), std(color, 0.25)));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.03, 0.08, 10), std(color, 0.25));
    neck.position.y = 0.15;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8), std("#b08a55", 0.8));
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
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 14), new THREE.MeshStandardMaterial({ color: color, roughness: 0.15, transparent: true, opacity: 0.6 }));
    g.add(v);
    return g;
  }

  // ---------- спавнер осколков и мусора ----------
  function spawnShards(pos, color, n, baseVel) {
    for (let i = 0; i < n; i++) {
      const s = 0.035 + Math.random() * 0.055;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s), std(color, 0.3));
      mesh.castShadow = true;
      const body = new CANNON.Body({ mass: 0.05, material: M.prop });
      body.addShape(boxShape(s / 2, s * 0.3, s / 2));
      body.position.set(pos.x + (Math.random() - 0.5) * 0.14, pos.y + Math.random() * 0.1, pos.z + (Math.random() - 0.5) * 0.14);
      if (baseVel) body.velocity.copy(baseVel);
      body.velocity.x += (Math.random() - 0.5) * 2.4;
      body.velocity.y += Math.random() * 2.2;
      body.velocity.z += (Math.random() - 0.5) * 2.4;
      body.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      body.allowSleep = true;
      world.addBody(body);
      scene.add(mesh);
      transients.push({ mesh: mesh, body: body, t: 0, life: 4 });
    }
  }

  // ищет ближайшую открытую точку пола: по вертикальному лучу сверху не должно быть ничего выше y 0.2
  function findOpenFloorSpot(x, z) {
    const offs = [[0, 0], [0, 0.35], [0.35, 0], [-0.35, 0], [0, 0.7], [0.5, 0.5], [-0.5, 0.5], [0, 1.05], [0.85, 0.85], [-0.85, 0.85], [1.3, 0], [-1.3, 0]];
    for (let i = 0; i < offs.length; i++) {
      const cx = Math.max(-6.5, Math.min(6.5, x + offs[i][0]));
      const cz = Math.max(-4.3, Math.min(4.3, z + offs[i][1]));
      const ray = new CANNON.Ray(new CANNON.Vec3(cx, 2.0, cz), new CANNON.Vec3(cx, 0, cz));
      const res = new CANNON.RaycastResult();
      ray.intersectWorld(world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true, collisionFilterMask: 1 });
      if (res.hasHit && res.hitPointWorld.y < 0.2) return { x: cx, z: cz };
    }
    return { x: x, z: Math.min(4.3, z + 0.4) };
  }

  const puddles = [
    { x: 0.9, z: 4.0, r: 0.85 } // ванна с водой
  ];

  function spawnWaterDecal(x, z, r) {
    const rad = r || 0.3;
    const m = new THREE.Mesh(new THREE.CircleGeometry(rad, 20), new THREE.MeshStandardMaterial({ color: "#5a8ac9", transparent: true, opacity: 0.5, roughness: 0.1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015 + Math.random() * 0.004, z);
    m.receiveShadow = true;
    scene.add(m);
    transients.push({ mesh: m, body: null, t: 0, life: 60 });
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

  const fx = {
    dust: spawnDust,
    sparks: spawnSparks,
    splashes: spawnSplashes,
    feathers: spawnFeathers,
    pawPrint: spawnPawPrint
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
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
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

  // ---------- ГОСТИНАЯ ----------
  const tvG = new THREE.Group();
  const tvFrame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 1.24), std("#1a1a1e", 0.4));
  tvG.add(tvFrame);
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshStandardMaterial({ color: "#0c1420", emissive: "#9fd8ff", emissiveIntensity: 0.55, roughness: 0.2 }));
  tvScreen.rotation.y = -Math.PI / 2;
  tvScreen.position.x = -0.047;
  tvG.add(tvScreen);
  register("телевизор", 5000, tvG, boxShape(0.045, 0.36, 0.62), -2.0, L.tvStandTopY + 0.36, 0.9, {
    mass: 9, breakable: true, breakVel: 1.9, shardColor: "#2a2d33",
    onBreak: function () { if (AudioSys.ctx) AudioSys.zap(); }
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
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 14), std("#4a4a52", 0.5, 0.4));
  lampBase.position.y = 0.02;
  lampG.add(lampBase);
  const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.45, 8), std("#4a4a52", 0.5, 0.4));
  lampPole.position.y = 0.75;
  lampG.add(lampPole);
  const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.23, 0.3, 14, 1, true), new THREE.MeshStandardMaterial({ color: "#f5e2b8", emissive: "#ffdf94", emissiveIntensity: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
  lampShade.position.y = 1.58;
  lampG.add(lampShade);
  const lampLight = new THREE.PointLight("#ffdf94", 0.55, 7, 1.8);
  lampLight.position.set(-6.5, 1.72, -3.75);
  scene.add(lampLight);
  register("торшер", 800, lampG, boxShape(0.13, 0.82, 0.13), -6.5, 0.84, -3.9, {
    mass: 1.0,
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
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    const prop = {
      name: name, value: value, mesh: g, body: body, mass: 0.4,
      breakable: false, breakVel: 99, shardColor: "#6b4a33", broken: false,
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false,
      room: KOTO.levels.roomOf(x, z)
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

  function hangCurtain(name, value, cx, y, fz) {
    const w = 1.6, h = 1.3;
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, w + 0.6, 8), std("#6b4a33", 0.6));
    rod.rotation.z = Math.PI / 2;
    rod.castShadow = true;
    g.add(rod);
    [-1, 1].forEach(function (s) {
      const cur = new THREE.Mesh(new THREE.BoxGeometry(0.24, h + 0.5, 0.08), std("#7a3a4a", 0.95));
      cur.position.set(s * (w / 2 + 0.16), -h / 2 - 0.15, 0);
      cur.castShadow = true;
      g.add(cur);
    });
    scene.add(g);

    const body = new CANNON.Body({ mass: 3.5, material: M.prop, type: CANNON.Body.KINEMATIC });
    body.addShape(boxShape((w + 0.6) / 2, (h + 0.5) / 2, 0.08));
    body.position.set(cx, y, fz);
    world.addBody(body);

    const prop = {
      name: name, value: value, mesh: g, body: body, mass: 3.5,
      breakable: false, breakVel: 99, shardColor: "#6b4a33", broken: false,
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false,
      room: KOTO.levels.roomOf(cx, fz)
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
  hangCurtain("карниз со шторами", 3800, -5.4, 2.44, -4.33);

  const clockG = new THREE.Group();
  clockG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.045, 20), std("#f2f2ee", 0.4)));
  const hand1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.1, 0.008), std("#2a2d33", 0.4));
  hand1.position.set(0, 0.02, -0.026);
  clockG.add(hand1);
  const hand2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.008), std("#c94a4a", 0.4));
  hand2.rotation.z = 1.2;
  hand2.position.set(0.01, 0.01, -0.026);
  clockG.add(hand2);
  hangPicture("часы", 450, 0.34, 0.34, -4.5, 2.05, 4.46, 33).mesh.children[0].rotation.x = Math.PI / 2;

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

  // АКВАРИУМ (квест)
  const bowlG = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: "#bfe3ff", roughness: 0.05, transparent: true, opacity: 0.3 }));
  bowlG.add(glass);
  const waterIn = new THREE.Mesh(new THREE.SphereGeometry(0.148, 14, 10), new THREE.MeshStandardMaterial({ color: "#4a90d8", roughness: 0.1, transparent: true, opacity: 0.65 }));
  waterIn.position.y = -0.02;
  bowlG.add(waterIn);
  const fishInMat = new THREE.MeshStandardMaterial({ color: "#f08c2e", emissive: "#b04a12", emissiveIntensity: 0.55, roughness: 0.5 });
  const fishIn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.055), fishInMat);
  fishIn.position.y = -0.03;
  bowlG.add(fishIn);
  const fp = L.fishbowlPos;
  register("аквариум", 2500, bowlG, new CANNON.Sphere(0.16), fp.x, fp.y, fp.z, {
    mass: 0.6, breakable: true, breakVel: 1.3, shardColor: "#bfe3ff",
    onBreak: function (game, prop) {
      const p = prop.body.position;
      AudioSys.splash();
      spawnWaterDecal(p.x, p.z, 0.42);
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

  [[0.065, 1.4, 0.45, "#c94a4a"], [0.065, 1.25, 0.25, "#e8c53c"], [0.065, 0.95, 0.5, "#4a7ac9"]].forEach(function (m) {
    const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 12), std(m[3], 0.5));
    mag.rotation.z = Math.PI / 2;
    mag.position.set(m[0], m[1], m[2]);
    fridgeG.add(mag);
  });
  scene.add(fridgeG);

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
    }
    const sausG = new THREE.Group();
    const sausM = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.32, 12), std("#8a3838", 0.7));
    sausM.rotation.z = Math.PI / 2;
    sausG.add(sausM);
    const saus = register("палку колбасы", 380, sausG, cylShapeY(0.042, 0.32),
      -0.45, 0.9, -3.4, { mass: 0.5, breakable: false });
    saus.body.velocity.set(2.2, 0.8, -0.4);

    const cheeseG = new THREE.Group();
    cheeseG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.09, 14), std("#f2c94c", 0.6)));
    const cheese = register("головку сыра", 420, cheeseG, cylShapeY(0.12, 0.09),
      -0.45, 0.7, -3.6, { mass: 0.6, breakable: false });
    cheese.body.velocity.set(2.0, 0.7, 0.4);

    const jarG = new THREE.Group();
    jarG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 12), new THREE.MeshStandardMaterial({ color: "#2d5a27", transparent: true, opacity: 0.7, roughness: 0.2 })));
    const jar = register("банку солений", 280, jarG, cylShapeY(0.07, 0.18),
      -0.45, 1.1, -3.5, { mass: 0.7, breakable: true, breakVel: 1.8, shardColor: "#3a6a30" });
    jar.body.velocity.set(2.1, 0.9, -0.2);

    const borschG = new THREE.Group();
    borschG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.19, 16), std("#882222", 0.4, 0.5)));
    const bLid = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), std("#c9ccd2", 0.2, 0.8));
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

  [[2.9, -1.75, "#c93c3c"], [3.02, -1.95, "#9ec93c"], [2.82, -1.95, "#c9a03c"]].forEach(function (a) {
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
  [["шампунь", "#4a8ac9", 0.3], ["шампунь", "#c95a9e", 0.7], ["гель", "#5ea35e", 1.1]].forEach(function (s, i) {
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
    const opts = { mass: 0.08 };
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
  register("весы", 600, scaleG, boxShape(0.16, 0.022, 0.16), 2.8, 0.023, 2.3, { mass: 0.9 });

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

  // ---------- СПАЛЬНЯ ----------
  // подушки на кровати
  [[9.85, -4.08, "#e8ddc9"], [10.55, -4.08, "#d8c9b0"]].forEach(function (a) {
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
  bedLampG.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 12), std("#4a4a52", 0.5, 0.4)));
  const bedLampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), std("#4a4a52", 0.5, 0.4));
  bedLampPole.position.y = 0.11;
  bedLampG.add(bedLampPole);
  const bedLampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.12, 12, 1, true), new THREE.MeshStandardMaterial({ color: "#f5e2b8", emissive: "#ffdf94", emissiveIntensity: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
  bedLampShade.position.y = 0.27;
  bedLampG.add(bedLampShade);
  const bedLampLight = new THREE.PointLight("#ffdf94", 0.4, 5, 1.8);
  bedLampLight.position.set(9.02, 0.95, -4.08);
  scene.add(bedLampLight);
  register("лампу", 900, bedLampG, boxShape(0.07, 0.16, 0.07), 9.02, L.nightstandTopY + 0.16, -4.08, {
    mass: 0.4, breakable: true, breakVel: 1.6, shardColor: "#f5e2b8",
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
  const vacBase = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 18), std("#252830", 0.4, 0.4));
  vacBase.castShadow = true;
  vacG.add(vacBase);

  const vacBumper = new THREE.Mesh(new THREE.CylinderGeometry(0.286, 0.286, 0.05, 18), std("#15171c", 0.7));
  vacBumper.position.y = -0.012;
  vacG.add(vacBumper);

  const vacTop = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 14), std("#333742", 0.3));
  vacTop.position.y = 0.045;
  vacG.add(vacTop);

  const vacLed = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: "#00ff66" }));
  vacLed.position.set(0, 0.058, 0.1);
  vacG.add(vacLed);

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
    led: vacLed,
    broken: false,
    scareCd: 0,
    yaw: 0,
    targetYaw: 0,
    turnTimer: 2.5,
    spinAngle: 0,
    pos: vacBody.position,
    room: "living",
    break: function () {
      if (this.broken) return;
      this.broken = true;
      this.led.material.color.set("#ff1100");
      if (AudioSys.vacuumBroke) AudioSys.vacuumBroke();
      if (KOTO.fx) {
        KOTO.fx.sparks(this.pos.x, this.pos.y + 0.1, this.pos.z, 16);
        KOTO.fx.dust(this.pos.x, 0.05, this.pos.z, 10);
      }
      if (KOTO.game) {
        const pts = 12000;
        const mult = KOTO.game.comboMult();
        const total = Math.round(pts * mult);
        const r = KOTO.levels.roomOf(this.pos.x, this.pos.z) || "living";
        KOTO.game.addScore(total, r);
        KOTO.game.record("Сломал: Робот-пылесос", total);
        KOTO.game.floater(this.pos, "+12 000 ₽ ЖОРКА-3000 СЛОМАН!", "strike");
        KOTO.game.addFeed("ЖОРКА-3000 ПОВЕРЖЕН! +" + total.toLocaleString("ru-RU") + " ₽");
        KOTO.game.state.shake = Math.min(1, KOTO.game.state.shake + 0.6);
      }
    }
  };

  vacBody.addEventListener("collide", function (e) {
    if (!e.contact || vacuum.broken) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const other = e.body;
    if (other && other !== (KOTO.cat && KOTO.cat.body) && other.material === M.prop && v > 1.3) {
      vacuum.break();
    }
  });

  function update(dt) {
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
    // Обновление Жорки-3000
    if (!vacuum.broken) {
      vacuum.turnTimer -= dt;
      if (vacuum.turnTimer <= 0) {
        vacuum.turnTimer = 3.5 + Math.random() * 4.0;
        vacuum.targetYaw = vacuum.yaw + (Math.random() - 0.5) * Math.PI * 1.2;
      }
      let boundHit = false;
      if (vacuum.pos.x < -6.5) { vacuum.targetYaw = Math.PI / 2; boundHit = true; }
      else if (vacuum.pos.x > 6.5) { vacuum.targetYaw = -Math.PI / 2; boundHit = true; }
      if (vacuum.pos.z < -4.0) { vacuum.targetYaw = 0; boundHit = true; }
      else if (vacuum.pos.z > 4.0) { vacuum.targetYaw = Math.PI; boundHit = true; }

      let yd = vacuum.targetYaw - vacuum.yaw;
      while (yd > Math.PI) yd -= Math.PI * 2;
      while (yd < -Math.PI) yd += Math.PI * 2;
      vacuum.yaw += yd * Math.min(1, (boundHit ? 8 : 3) * dt);

      const sp = 1.15;
      vacuum.pos.x += Math.sin(vacuum.yaw) * sp * dt;
      vacuum.pos.z += Math.cos(vacuum.yaw) * sp * dt;
      vacuum.mesh.position.copy(vacuum.pos);
      vacuum.mesh.rotation.y = vacuum.yaw;

      // Опасность для кота: наезд сбивает комбо в 0!
      if (KOTO.cat && vacuum.scareCd <= 0) {
        const cp = KOTO.cat.body.position;
        const dx = cp.x - vacuum.pos.x, dz = cp.z - vacuum.pos.z;
        if (Math.hypot(dx, dz) < 0.52 && Math.abs(cp.y - vacuum.pos.y) < 0.45) {
          vacuum.scareCd = 3.0;
          KOTO.cat.body.velocity.y = 4.0;
          KOTO.cat.body.velocity.x += (dx >= 0 ? 2.8 : -2.8);
          KOTO.cat.body.velocity.z += (dz >= 0 ? 2.8 : -2.8);
          if (AudioSys.hiss) AudioSys.hiss();
          if (KOTO.game) {
            KOTO.game.state.combo = 0;
            KOTO.game.state.comboT = 0;
            KOTO.game.floater(cp, "ПЫЛЕСОС! КОМБО СБРОШЕНО!", "break");
            KOTO.game.addFeed("Жорка-3000 наехал на кота! Серия комбо сброшена!");
            KOTO.game.state.shake = 0.55;
          }
        }
      }
      if (vacuum.scareCd > 0) vacuum.scareCd -= dt;
    } else {
      vacuum.spinAngle += dt * 7.0;
      vacuum.mesh.rotation.y = vacuum.spinAngle;
      if (Math.random() < dt * 3 && KOTO.fx) {
        KOTO.fx.sparks(vacuum.pos.x, vacuum.pos.y + 0.08, vacuum.pos.z, 2);
      }
    }

    for (const t of scratchTargets) {
      if (t.cd > 0) t.cd -= dt;
    }
    for (const p of props) {
      if (p.scoreCd > 0) p.scoreCd -= dt;
    }
  }

  function removeProp(prop) {
    prop.broken = true;
    world.removeBody(prop.body);
    scene.remove(prop.mesh);
  }

  return {
    props: props, hangProps: hangProps, transients: transients, scratchTargets: scratchTargets,
    fish: fish, puddles: puddles, fx: fx, fridge: fridge, vacuum: vacuum,
    update: update, removeProp: removeProp, spawnShards: spawnShards,
    spawnDust: spawnDust, spawnSparks: spawnSparks, spawnSplashes: spawnSplashes,
    spawnFeathers: spawnFeathers, spawnPawPrint: spawnPawPrint
  };
}
