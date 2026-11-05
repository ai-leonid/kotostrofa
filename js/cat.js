"use strict";

function createCat(scene, world, M, spawn) {
  const orange = new THREE.MeshStandardMaterial({ color: "#d98a3d", roughness: 0.9 });
  const cream = new THREE.MeshStandardMaterial({ color: "#f5ead9", roughness: 0.95 });
  const pink = new THREE.MeshStandardMaterial({ color: "#e8a0a8", roughness: 0.8 });

  const group = new THREE.Group();

  const bodyG = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), orange);
  body.scale.set(1, 0.85, 1.35);
  body.position.y = 0.26;
  bodyG.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10), cream);
  belly.scale.set(0.85, 0.7, 1.15);
  belly.position.set(0, 0.2, 0.045);
  bodyG.add(belly);
  group.add(bodyG);

  const headG = new THREE.Group();
  headG.position.set(0, 0.46, 0.2);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), orange);
  headG.add(skull);
  [-1, 1].forEach(function (s) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.11, 4), orange);
    ear.position.set(s * 0.085, 0.13, -0.01);
    ear.rotation.z = -s * 0.28;
    headG.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 4), pink);
    inner.position.set(s * 0.078, 0.115, 0.015);
    inner.rotation.z = -s * 0.28;
    headG.add(inner);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshStandardMaterial({ color: "#1d1d22", roughness: 0.2 }));
    eye.position.set(s * 0.065, 0.03, 0.125);
    headG.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    glint.position.set(s * 0.058, 0.04, 0.144);
    headG.add(glint);
  });
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 8), cream);
  muzzle.position.set(0, -0.045, 0.115);
  headG.add(muzzle);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.018, 0.014), pink);
  nose.position.set(0, -0.008, 0.183);
  headG.add(nose);
  const whiskerPos = [];
  [-1, 1].forEach(function (s) {
    for (let i = 0; i < 3; i++) {
      whiskerPos.push(s * 0.05, -0.03 + i * 0.018, 0.15, s * 0.21, -0.02 + i * 0.03, 0.19);
    }
  });
  const whiskGeo = new THREE.BufferGeometry();
  whiskGeo.setAttribute("position", new THREE.Float32BufferAttribute(whiskerPos, 3));
  headG.add(new THREE.LineSegments(whiskGeo, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 })));
  group.add(headG);

  function makeLeg(x, z) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.26, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.22, 8), orange);
    leg.position.y = -0.11;
    hip.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), cream);
    paw.position.y = -0.22;
    hip.add(paw);
    group.add(hip);
    return hip;
  }
  const legFL = makeLeg(-0.11, 0.15);
  const legFR = makeLeg(0.11, 0.15);
  const legBL = makeLeg(-0.11, -0.14);
  const legBR = makeLeg(0.11, -0.14);

  const tailSegs = [];
  let tailParent = group;
  let ty = 0.36, tz = -0.27, tr = 0.032;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? ty : 0.12, i === 0 ? tz : 0);
    if (i === 0) seg.rotation.x = -0.9;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(tr, tr * 1.15, 0.13, 8), i === 3 ? cream : orange);
    m.position.y = 0.065;
    seg.add(m);
    tailParent.add(seg);
    tailParent = seg;
    tailSegs.push(seg);
    tr *= 0.82;
  }

  group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  scene.add(group);

  const bodyC = new CANNON.Body({ mass: 3, material: M.cat });
  bodyC.addShape(new CANNON.Box(new CANNON.Vec3(0.17, 0.22, 0.2)));
  bodyC.position.set(spawn.x, spawn.y, spawn.z);
  bodyC.fixedRotation = true;
  bodyC.updateMassProperties();
  bodyC.allowSleep = false;
  bodyC.linearDamping = 0.0;
  world.addBody(bodyC);

  const cat = {
    group: group, body: bodyC,
    yaw: 0, grounded: false,
    walkPhase: 0, speedSmooth: 0,
    swipeT: 0, meowT: 0, headYaw: 0, headYawTarget: 0, headTimer: 2,
    airTime: 0,

    forward: function () {
      return { x: Math.sin(this.yaw), y: 0, z: Math.cos(this.yaw) };
    },

    sync: function () {
      group.position.set(bodyC.position.x, bodyC.position.y - 0.24, bodyC.position.z);
      group.rotation.y = this.yaw;
    },

    update: function (dt, input) {
      const v = bodyC.velocity;
      let dx = 0, dz = 0;
      if (input.f) dz += 1;
      if (input.b) dz -= 1;
      if (input.l) dx -= 1;
      if (input.r) dx += 1;
      const moving = dx !== 0 || dz !== 0;
      let wx = 0, wz = 0;
      if (moving) {
        const len = Math.hypot(dx, dz);
        dx /= len; dz /= len;
        const s = Math.sin(input.camYaw), c = Math.cos(input.camYaw);
        wx = c * dx - s * dz;
        wz = -s * dx - c * dz;
      }
      const speed = input.run ? 5.2 : 2.9;
      const accel = this.grounded ? 11 : 3.5;
      const k = Math.min(1, accel * dt);
      v.x += (wx * speed - v.x) * k;
      v.z += (wz * speed - v.z) * k;
      if (moving) {
        const target = Math.atan2(wx, wz);
        let d = target - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, 14 * dt);
      }

      this.grounded = false;
      for (const c of world.contacts) {
        if (c.bi === bodyC || c.bj === bodyC) {
          if (Math.abs(c.ni.y) > 0.45) { this.grounded = true; break; }
        }
      }
      if (this.grounded) this.airTime = 0;
      else this.airTime += dt;

      if (input.jump && this.grounded) {
        v.y = 5.0;
        this.grounded = false;
        AudioSys.jump();
      }

      const sp = Math.hypot(v.x, v.z);
      this.speedSmooth += (sp - this.speedSmooth) * Math.min(1, 9 * dt);
      this.walkPhase += this.speedSmooth * 4.6 * dt;
      const amp = Math.min(1, this.speedSmooth / 3);
      if (this.grounded) {
        legFL.rotation.x = Math.sin(this.walkPhase) * 0.8 * amp;
        legFR.rotation.x = Math.sin(this.walkPhase + Math.PI) * 0.8 * amp;
        legBL.rotation.x = Math.sin(this.walkPhase + Math.PI * 0.9) * 0.65 * amp;
        legBR.rotation.x = Math.sin(this.walkPhase + 0.1 * Math.PI) * 0.65 * amp;
        bodyG.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.028 * amp;
        bodyG.rotation.x = 0;
      } else {
        const tuck = Math.min(1, this.airTime * 6);
        legFL.rotation.x = -0.9 * tuck;
        legFR.rotation.x = -0.9 * tuck;
        legBL.rotation.x = 0.9 * tuck;
        legBR.rotation.x = 0.9 * tuck;
        bodyG.position.y = 0;
        bodyG.rotation.x = -0.12 * tuck;
      }
      if (this.swipeT > 0) {
        this.swipeT -= dt;
        legFR.rotation.x = -1.6 * Math.max(0, this.swipeT / 0.25);
      }
      if (this.meowT > 0) this.meowT -= dt;
      headG.rotation.x = this.meowT > 0 ? -0.3 : Math.sin(this.walkPhase * 0.5) * 0.05 * amp;
      this.headTimer -= dt;
      if (this.headTimer <= 0) {
        this.headTimer = 1.5 + Math.random() * 2.5;
        this.headYawTarget = (Math.random() - 0.5) * 0.9;
      }
      this.headYaw += (this.headYawTarget - this.headYaw) * Math.min(1, 4 * dt);
      headG.rotation.y = this.headYaw;
      const t = performance.now() / 1000;
      for (let i = 0; i < tailSegs.length; i++) {
        tailSegs[i].rotation.z = Math.sin(t * 2.2 + i * 0.9) * 0.16;
      }
      tailSegs[0].rotation.x = -0.9 + Math.sin(t * 1.7) * 0.12 + amp * 0.25;
      muzzle.scale.setScalar(this.meowT > 0 ? 1.25 : 1);
    }
  };
  cat.sync();
  return cat;
}
