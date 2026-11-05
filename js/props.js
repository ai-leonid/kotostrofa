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
      hang: !!opts.hang, released: false
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (KOTO.game) KOTO.game.onPropImpact(prop, v);
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

  function spawnWaterDecal(x, z, r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r || 0.3, 20), new THREE.MeshStandardMaterial({ color: "#5a8ac9", transparent: true, opacity: 0.5, roughness: 0.1 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.015 + Math.random() * 0.004, z);
    m.receiveShadow = true;
    scene.add(m);
    transients.push({ mesh: m, body: null, t: 0, life: 60 });
  }

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
  register("торшер", 800, lampG, boxShape(0.13, 0.82, 0.13), -6.5, 0.84, -3.9, { mass: 1.0 });

  const mugG = meshCup("#c94a4a");
  register("кружку", 200, mugG, cylShapeY(0.035, 0.09), -4.45, L.coffeeTopY + 0.045, 0.75, { mass: 0.22, breakable: true, breakVel: 2.3, shardColor: "#c94a4a" });

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
      scoreCd: 0, onBreak: null, onScore: null, hang: true, released: false
    };
    body.addEventListener("collide", function (e) {
      if (!e.contact || prop.broken || !prop.released) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (KOTO.game) KOTO.game.onPropImpact(prop, v);
    });
    props.push(prop);
    hangProps.push(prop);
    return prop;
  }
  hangPicture("картину", 700, 0.55, 0.75, -5.4, 1.6, 4.46, 11);
  hangPicture("картину", 700, 0.65, 0.5, -3.6, 1.5, 4.46, 22);

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
    }
  });

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
    }
  });

  register("мусорное ведро", 350, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.36, 14), std("#9aa0a8", 0.3, 0.7)), cylShapeY(0.16, 0.36), 6.6, 0.18, -2.4, { mass: 0.6 });

  // ---------- ВАННАЯ ----------
  [["шампунь", "#4a8ac9", 0.3], ["шампунь", "#c95a9e", 0.75], ["гель", "#5ea35e", 1.5]].forEach(function (s, i) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10), std(s[1], 0.4)));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), std("#f2f2ee", 0.4));
    cap.position.y = 0.095;
    g.add(cap);
    register(s[0], 250, g, cylShapeY(0.04, 0.17), s[2], L.tubTopY + 0.085, 4.3, { mass: 0.25 });
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

  // цели для точения когтей
  [L.rug, L.bathMat, L.sofa, L.catTree].forEach(function (t) {
    scratchTargets.push({ name: t.name, x: t.x, z: t.z, r: t.r, points: t.points, cd: 0 });
  });

  function update(dt) {
    for (let i = transients.length - 1; i >= 0; i--) {
      const tr = transients[i];
      tr.t += dt;
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

  return { props: props, hangProps: hangProps, transients: transients, scratchTargets: scratchTargets, fish: fish, update: update, removeProp: removeProp, spawnShards: spawnShards };
}
