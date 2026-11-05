"use strict";
const puppeteer = require("puppeteer-core");
const h = require("./helpers");
const CHROME = h.CHROME;
const BASE = h.BASE;

(async function () {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--disable-gpu", "--use-angle=swiftshader", "--no-first-run", "--mute-audio", "--window-size=1280,800"],
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = await browser.newPage();
  page.on("pageerror", function (e) { console.log("pageerror:", e.message); });
  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(function (r) { setTimeout(r, 2500); });

  const probe = await page.evaluate(function () {
    const d = window.__dbg;
    const cat = KOTO.cat.body.position;
    // повторяем логику луча камеры вручную
    const cpch = Math.cos(d.cam.pitch), spch = Math.sin(d.cam.pitch);
    const ox = Math.sin(d.cam.yaw) * cpch * d.cam.dist;
    const oy = spch * d.cam.dist;
    const oz = Math.cos(d.cam.yaw) * cpch * d.cam.dist;
    const s = d.cam.smooth;
    const from = new CANNON.Vec3(s.x, s.y, s.z);
    const to = new CANNON.Vec3(s.x + ox, s.y + oy, s.z + oz);
    const ray = new CANNON.Ray(from, to);
    const res = new CANNON.RaycastResult();
    ray.intersectWorld(d.world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true, collisionFilterMask: 1 });
    return {
      cat: { x: +cat.x.toFixed(2), y: +cat.y.toFixed(2), z: +cat.z.toFixed(2) },
      smooth: { x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2) },
      camPos: { x: +d.camera.position.x.toFixed(2), y: +d.camera.position.y.toFixed(2), z: +d.camera.position.z.toFixed(2) },
      yaw: +d.cam.yaw.toFixed(2), pitch: +d.cam.pitch.toFixed(2), dist: d.cam.dist,
      rayHit: res.hasHit, rayDist: res.hasHit ? +res.distance.toFixed(3) : null,
      hitBody: res.hasHit && res.body ? (res.body.material && res.body.material.name) || "?" : null,
      hitPoint: res.hasHit ? { x: +res.hitPointWorld.x.toFixed(2), y: +res.hitPointWorld.y.toFixed(2), z: +res.hitPointWorld.z.toFixed(2) } : null
    };
  });
  console.log(JSON.stringify(probe, null, 1));

  // телепорт и повторный замер
  await page.evaluate(function () {
    KOTO.cat.body.position.set(4.7, 0.26, -3.4);
    KOTO.cat.body.velocity.set(0, 0, 0);
  });
  await new Promise(function (r) { setTimeout(r, 1500); });
  const probe2 = await page.evaluate(function () {
    const d = window.__dbg;
    return {
      camPos: { x: +d.camera.position.x.toFixed(2), y: +d.camera.position.y.toFixed(2), z: +d.camera.position.z.toFixed(2) },
      yaw: +d.cam.yaw.toFixed(2)
    };
  });
  console.log("after teleport:", JSON.stringify(probe2));
  await page.screenshot({ path: "test/shot_probe.png" });
  await browser.close();
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
