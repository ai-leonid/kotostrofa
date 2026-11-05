"use strict";

window.KOTO = window.KOTO || {};

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function woodTexture() {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = "#a87846";
    g.fillRect(0, 0, s, s);
    const rows = 6;
    for (let i = 0; i < rows; i++) {
      const y = (i * s) / rows;
      g.fillStyle = i % 2 ? "#a37443" : "#b07e4b";
      g.fillRect(0, y, s, s / rows - 2);
      for (let j = 0; j < 14; j++) {
        g.strokeStyle = "rgba(90,55,25," + (0.08 + Math.random() * 0.15) + ")";
        g.lineWidth = 1 + Math.random() * 1.5;
        g.beginPath();
        const gy = y + Math.random() * (s / rows - 2);
        g.moveTo(0, gy);
        g.bezierCurveTo(s * 0.3, gy + Math.random() * 6 - 3, s * 0.7, gy + Math.random() * 6 - 3, s, gy);
        g.stroke();
      }
      g.fillStyle = "rgba(60,35,15,.55)";
      g.fillRect(0, y + s / rows - 2, s, 2);
    }
  });
}

function tileTexture(base, grout, cells) {
  return canvasTexture(256, function (g, s) {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    const step = s / cells;
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const v = (Math.random() - 0.5) * 60;
        g.fillStyle = "rgba(" + (v > 0 ? "255,255,255" : "30,40,50") + "," + Math.abs(v) / 210 + ")";
        g.fillRect(i * step + 1, j * step + 1, step - 2, step - 2);
      }
    }
    g.strokeStyle = grout;
    g.lineWidth = 2;
    for (let i = 0; i <= cells; i++) {
      g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * step); g.lineTo(s, i * step); g.stroke();
    }
  });
}

function artTexture(seed) {
  return canvasTexture(128, function (g, s) {
    const rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const hues = [["#e8b04b", "#7a4a12"], ["#5a8ac9", "#1d3a5e"], ["#c95a6e", "#5e1d2a"]][seed % 3];
    const gr = g.createLinearGradient(0, 0, s, s);
    gr.addColorStop(0, hues[0]);
    gr.addColorStop(1, hues[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = "rgba(255,255,240," + (0.25 + rnd() * 0.4) + ")";
      g.beginPath();
      g.arc(rnd() * s, rnd() * s, 8 + rnd() * 26, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function buildApartment(scene, world) {
  const M = {
    floor: new CANNON.Material("floor"),
    wall: new CANNON.Material("wall"),
    prop: new CANNON.Material("prop"),
    cat: new CANNON.Material("cat")
  };
  world.addContactMaterial(new CANNON.ContactMaterial(M.floor, M.prop, { friction: 0.45, restitution: 0.28 }));
  world.addContactMaterial(new CANNON.ContactMaterial(M.wall, M.prop, { friction: 0.35, restitution: 0.25 }));
  world.addContactMaterial(new CANNON.ContactMaterial(M.prop, M.prop, { friction: 0.32, restitution: 0.2 }));
  world.addContactMaterial(new CANNON.ContactMaterial(M.floor, M.cat, { friction: 0.0, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(M.wall, M.cat, { friction: 0.0, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(M.prop, M.cat, { friction: 0.05, restitution: 0.05 }));
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.2;

  const matCache = {};
  function std(color, rough, metal, extra) {
    const key = color + "|" + rough + "|" + metal;
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough === undefined ? 0.85 : rough, metalness: metal || 0 }, extra || {}));
    }
    return matCache[key];
  }

  function box(cx, cy, cz, sx, sy, sz, material, opts) {
    opts = opts || {};
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    let body = null;
    if (opts.body !== false) {
      body = new CANNON.Body({ mass: 0, material: M.wall });
      body.addShape(new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)));
      body.position.set(cx, cy, cz);
      world.addBody(body);
    }
    return mesh;
  }

  function cyl(cx, cy, cz, rTop, rBot, h, material, opts) {
    opts = opts || {};
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 14), material);
    mesh.position.set(cx, cy, cz);
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.rz) mesh.rotation.z = opts.rz;
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ---------- физика пола ----------
  const floorBody = new CANNON.Body({ mass: 0, material: M.floor });
  floorBody.addShape(new CANNON.Box(new CANNON.Vec3(15, 0.5, 15)));
  floorBody.position.set(0, -0.5, 0);
  world.addBody(floorBody);

  // ---------- полы ----------
  const wood = woodTexture();
  wood.repeat.set(3, 5);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.8 });
  const livingFloor = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 9), woodMat);
  livingFloor.rotation.x = -Math.PI / 2;
  livingFloor.position.set(-4.25, 0.001, 0);
  livingFloor.receiveShadow = true;
  scene.add(livingFloor);

  const kitTile = tileTexture("#d6d2c4", "#a4a89a", 6);
  kitTile.repeat.set(7, 4.5);
  const kitFloor = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 5.1), new THREE.MeshStandardMaterial({ map: kitTile, roughness: 0.6 }));
  kitFloor.rotation.x = -Math.PI / 2;
  kitFloor.position.set(2.75, 0.002, -1.95);
  kitFloor.receiveShadow = true;
  scene.add(kitFloor);

  const bathTile = tileTexture("#a9c2d4", "#7d9eb2", 8);
  bathTile.repeat.set(9, 4);
  const bathFloor = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 3.9), new THREE.MeshStandardMaterial({ map: bathTile, roughness: 0.5 }));
  bathFloor.rotation.x = -Math.PI / 2;
  bathFloor.position.set(2.75, 0.003, 2.55);
  bathFloor.receiveShadow = true;
  scene.add(bathFloor);

  // ---------- потолок ----------
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 9.5), std("#efe7da", 0.95));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 2.7, 0);
  scene.add(ceiling);

  // ---------- стены ----------
  const wallMat = std("#d3c2ab", 0.9);
  const wallKitMat = std("#c3d4c4", 0.9);
  const wallBathMat = std("#b3c9da", 0.9);

  function wall(cx, cz, sx, sz, material) {
    box(cx, 1.35, cz, sx, 2.7, sz, material || wallMat, {});
  }

  wall(0, -4.625, 14.5, 0.25);                       // северная
  wall(0, 4.625, 14.5, 0.25);                        // южная
  wall(-7.125, 0, 0.25, 9.5);                        // западная
  wall(7.125, 0, 0.25, 9.5, wallKitMat);             // восточная
  wall(-1.5, -3.4, 0.25, 2.2);                       // перегородка: сегмент кухня-верх
  wall(-1.5, 0.25, 0.25, 2.7);                       // перегородка: между дверьми
  wall(-1.5, 3.65, 0.25, 1.7);                       // перегородка: сегмент ванная-низ
  wall(2.75, 0.6, 8.75, 0.25, wallBathMat);          // кухня/ванная

  const trimMat = std("#6b4a33", 0.7);
  function doorTrim(x, z1, z2) {
    box(x, 1.17, z1, 0.34, 2.34, 0.1, trimMat, { body: false, cast: false });
    box(x, 1.17, z2, 0.34, 2.34, 0.1, trimMat, { body: false, cast: false });
    box(x, 2.32, (z1 + z2) / 2, 0.34, 0.14, Math.abs(z2 - z1) + 0.1, trimMat, { body: false, cast: false });
  }
  doorTrim(-1.5, -2.36, -1.04);
  doorTrim(-1.5, 1.54, 2.86);

  // ---------- окна (визуально) ----------
  function window_(cx) {
    const fz = -4.5;
    const w = 1.6, h = 1.3, y0 = 1.0;
    const frameMat = std("#f0ead8", 0.6);
    box(cx, y0 - 0.04, fz + 0.09, w + 0.16, 0.08, 0.18, frameMat, { body: false });
    box(cx, y0 + h + 0.04, fz + 0.09, w + 0.16, 0.08, 0.18, frameMat, { body: false });
    box(cx - w / 2 - 0.04, y0 + h / 2, fz + 0.09, 0.08, h, 0.18, frameMat, { body: false });
    box(cx + w / 2 + 0.04, y0 + h / 2, fz + 0.09, 0.08, h, 0.18, frameMat, { body: false });
    box(cx, y0 + h / 2, fz + 0.09, w + 0.08, 0.05, 0.14, frameMat, { body: false, cast: false });
    box(cx, y0 + h / 2, fz + 0.09, 0.05, h, 0.14, frameMat, { body: false, cast: false });
    const night = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: "#16233f" }));
    night.position.set(cx, y0 + h / 2, fz + 0.02);
    scene.add(night);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.14, 20), new THREE.MeshBasicMaterial({ color: "#f4f1d8" }));
    moon.position.set(cx - 0.35, y0 + h - 0.3, fz + 0.04);
    scene.add(moon);
    for (let i = 0; i < 7; i++) {
      const st = new THREE.Mesh(new THREE.CircleGeometry(0.012 + Math.random() * 0.012, 6), new THREE.MeshBasicMaterial({ color: "#cdd8ff" }));
      st.position.set(cx - w / 2 + Math.random() * w, y0 + 0.15 + Math.random() * (h - 0.3), fz + 0.03);
      scene.add(st);
    }
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: "#9db8ff", transparent: true, opacity: 0.07 }));
    glass.position.set(cx, y0 + h / 2, fz + 0.12);
    scene.add(glass);
  }
  window_(-5.4);
  window_(-3.4);

  // ---------- входная дверь (визуально, кухня/восток) ----------
  box(6.99, 1.05, -1.2, 0.1, 2.1, 1.0, std("#7a5230", 0.7), { body: false });
  box(6.99, 2.18, -1.2, 0.12, 0.12, 1.16, trimMat, { body: false, cast: false });
  cyl(6.9, 1.0, -0.85, 0.035, 0.035, 0.06, std("#d8b23a", 0.3, 0.8), { rz: Math.PI / 2, body: false });

  // ---------- фартук кухни и панели ванной (визуально) ----------
  box(2.7, 1.21, -4.46, 8.0, 0.58, 0.04, std("#b7cdc0", 0.5), { body: false, cast: false });
  box(2.75, 0.5, 4.46, 8.7, 1.0, 0.04, std("#9fc0d4", 0.5), { body: false, cast: false });

  // ---------- ГОСТИНАЯ ----------
  const sofaMat = std("#b0524a", 0.95);
  box(-6.47, 0.225, 0.9, 0.95, 0.45, 2.6, sofaMat);
  box(-6.85, 0.7, 0.9, 0.22, 0.5, 2.6, sofaMat);
  box(-6.47, 0.575, -0.22, 0.95, 0.25, 0.18, sofaMat);
  box(-6.47, 0.575, 2.02, 0.95, 0.25, 0.18, sofaMat);

  box(-2.0, 0.2, 0.9, 0.55, 0.4, 1.4, std("#6b4a33", 0.7));

  const tableMat = std("#a3794e", 0.7);
  box(-4.3, 0.445, 0.9, 1.1, 0.05, 0.7, tableMat);
  [[-0.48, -0.28], [0.48, -0.28], [-0.48, 0.28], [0.48, 0.28]].forEach(function (o) {
    box(-4.3 + o[0], 0.21, 0.9 + o[1], 0.06, 0.42, 0.06, tableMat);
  });

  const rugTex = canvasTexture(128, function (g, s) {
    g.fillStyle = "#8a4a5e"; g.fillRect(0, 0, s, s);
    g.strokeStyle = "#d8c6a8"; g.lineWidth = 6;
    g.strokeRect(10, 10, s - 20, s - 20);
    g.strokeStyle = "#c9803c"; g.lineWidth = 3;
    g.strokeRect(22, 22, s - 44, s - 44);
  });
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-4.4, 0.012, 0.9);
  rug.receiveShadow = true;
  scene.add(rug);

  const shelfMat = std("#8a6a48", 0.75);
  box(-5.66, 0.75, -4.2, 0.08, 1.5, 0.4, shelfMat);
  box(-3.34, 0.75, -4.2, 0.08, 1.5, 0.4, shelfMat);
  box(-4.5, 0.75, -4.36, 2.4, 1.5, 0.06, shelfMat);
  box(-4.5, 1.49, -4.2, 2.4, 0.05, 0.4, shelfMat);
  box(-4.5, 0.56, -4.2, 2.32, 0.05, 0.36, shelfMat);
  box(-4.5, 1.06, -4.2, 2.32, 0.05, 0.36, shelfMat);

  // когтеточка
  const treeMat = std("#c9a06a", 0.9);
  box(-6.5, 0.03, 3.4, 0.5, 0.06, 0.5, treeMat);
  cyl(-6.5, 0.51, 3.4, 0.06, 0.06, 0.9, std("#b08a55", 0.95));
  box(-6.5, 0.98, 3.4, 0.45, 0.05, 0.45, treeMat);
  cyl(-6.5, 0.87, 3.15, 0.008, 0.008, 0.2, std("#888888", 0.9), { body: false, cast: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std("#c94a4a", 0.6));
  ball.position.set(-6.5, 0.75, 3.15);
  ball.castShadow = true;
  scene.add(ball);

  // ---------- КУХНЯ ----------
  box(2.7, 0.425, -4.2, 8.0, 0.85, 0.6, std("#a9bfb2", 0.8));
  box(2.7, 0.885, -4.2, 8.1, 0.07, 0.66, std("#f0f2f0", 0.4));
  box(0.6, 1.53, -4.32, 3.8, 0.05, 0.36, shelfMat);

  box(-0.95, 0.925, -3.5, 0.75, 1.85, 0.7, std("#e8e8ea", 0.35, 0.25));
  [[0.3, "#c94a4a", 0.5, 1.4], [1.1, "#e8c53c", -0.15, 1.25], [0.6, "#4a7ac9", 0.25, 0.95]].forEach(function (m) {
    cyl(-0.565, m[3], -3.5 + m[2], 0.032, 0.032, 0.015, std(m[1], 0.5), { rz: Math.PI / 2, body: false, cast: false });
  });

  box(6.35, 0.425, -4.15, 0.7, 0.85, 0.7, std("#d0d2d6", 0.5));
  box(6.35, 0.865, -4.15, 0.72, 0.03, 0.72, std("#22262b", 0.4));

  const kTableMat = std("#c9a06a", 0.7);
  box(2.6, 0.77, -1.9, 1.5, 0.06, 0.95, kTableMat);
  [[-0.66, -0.38], [0.66, -0.38], [-0.66, 0.38], [0.66, 0.38]].forEach(function (o) {
    box(2.6 + o[0], 0.37, -1.9 + o[1], 0.07, 0.74, 0.07, kTableMat);
  });

  // ---------- ВАННАЯ ----------
  const bathWhite = std("#eef1f4", 0.35);
  box(0.9, 0.29, 4.0, 2.0, 0.58, 0.95, bathWhite);
  box(0.9, 0.5, 4.0, 1.7, 0.34, 0.68, std("#dfe7ec", 0.3), { body: false, cast: false });

  box(5.9, 0.175, 3.9, 0.42, 0.35, 0.5, bathWhite);
  box(5.9, 0.55, 4.28, 0.42, 0.5, 0.24, bathWhite);
  cyl(5.9, 0.41, 3.88, 0.21, 0.21, 0.07, bathWhite, { body: false });

  box(6.35, 0.4, 1.2, 0.55, 0.8, 0.5, std("#7fa8c9", 0.6));
  cyl(6.35, 0.87, 1.2, 0.24, 0.19, 0.1, bathWhite, { body: false });
  cyl(6.55, 1.0, 1.2, 0.02, 0.02, 0.2, std("#c9ccd2", 0.3, 0.7), { body: false, cast: false });

  const bathMatPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: "#6f9ec4", roughness: 1 }));
  bathMatPlane.rotation.x = -Math.PI / 2;
  bathMatPlane.position.set(0.9, 0.012, 2.9);
  bathMatPlane.receiveShadow = true;
  scene.add(bathMatPlane);

  // держатель туалетной бумаги
  box(6.9, 0.72, 3.3, 0.16, 0.05, 0.05, std("#c9ccd2", 0.4), { body: false, cast: false });

  // ---------- свет ----------
  const hemi = new THREE.HemisphereLight("#a3947d", "#3a3128", 0.38);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight("#cdd8ff", 0.55);
  moon.position.set(-4.5, 5.5, -9);
  moon.target.position.set(-3.5, 0, 1.5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -10;
  moon.shadow.camera.right = 10;
  moon.shadow.camera.top = 10;
  moon.shadow.camera.bottom = -10;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 26;
  moon.shadow.bias = -0.0005;
  moon.shadow.normalBias = 0.03;
  scene.add(moon);
  scene.add(moon.target);

  const pKit = new THREE.PointLight("#ffd9a0", 0.45, 10, 1.6);
  pKit.position.set(2.5, 2.4, -2.2);
  scene.add(pKit);
  const pBath = new THREE.PointLight("#cfe2ff", 0.4, 8, 1.6);
  pBath.position.set(2.5, 2.4, 2.6);
  scene.add(pBath);
  const pLiv = new THREE.PointLight("#ffe6c0", 0.4, 10, 1.6);
  pLiv.position.set(-4.2, 2.4, 0.6);
  scene.add(pLiv);

  const L = {
    counterTopY: 0.92,
    shelfY: 1.555,
    coffeeTopY: 0.47,
    tableTopY: 0.8,
    tableAABB: { x1: 1.85, x2: 3.35, z1: -2.375, z2: -1.425, y1: 0.8, y2: 1.5 },
    tvStandTopY: 0.4,
    bookshelf: { x: -4.5, z: -4.2, boardsY: [0.585, 1.085, 1.515] },
    stoveTopY: 0.88,
    sinkTopY: 0.84,
    tubTopY: 0.58,
    rug: { x: -4.4, z: 0.9, r: 1.2, name: "ковёр", points: 100 },
    bathMat: { x: 0.9, z: 2.9, r: 0.45, name: "коврик", points: 80 },
    sofa: { x: -5.95, z: 0.9, r: 1.1, name: "диван", points: 120 },
    catTree: { x: -6.5, z: 3.15, r: 0.55, name: "когтеточку", points: 50 },
    fishbowlPos: { x: 5.4, y: 1.1, z: -4.2 }
  };

  return { M: M, L: L, std: std, box: box, cyl: cyl };
}
