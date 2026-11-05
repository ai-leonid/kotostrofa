"use strict";
// Мобильная адаптация: тач-элементы видны, джойстик двигает кота,
// свайп крутит камеру, кнопки работают. Эмуляция телефона.
const puppeteer = require("puppeteer-core");
const h = require("./helpers");
const CHROME = h.CHROME;
const BASE = h.BASE;
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async function () {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--disable-gpu", "--use-angle=swiftshader", "--no-first-run", "--mute-audio"],
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
  });
  const errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });
  await page.goto(BASE + "?autostart=1&t=45");
  await sleep(2000);

  // 1) тач-элементы показаны
  const ui = await page.evaluate(function () {
    const vis = function (id) {
      const el = document.getElementById(id);
      return !!el && !el.closest(".hidden") && getComputedStyle(el).display !== "none";
    };
    return {
      touchUi: vis("touch-ui"),
      joyZone: vis("joy-zone"),
      btnJump: vis("tb-jump"),
      btnSwipe: vis("tb-swipe"),
      btnMeow: vis("tb-meow"),
      coarse: matchMedia("(pointer: coarse)").matches,
      quests: document.querySelectorAll(".hud-quest").length
    };
  });

  // 2) джойстик: нажали и повели вверх — кот бежит
  await page.evaluate(function () {
    const zone = document.getElementById("joy-zone");
    const mk = function (id, x, y) { return new Touch({ identifier: id, target: zone, clientX: x, clientY: y }); };
    const t0 = mk(7, 100, 700);
    zone.dispatchEvent(new TouchEvent("touchstart", { touches: [t0], targetTouches: [t0], changedTouches: [t0], bubbles: true, cancelable: true }));
    const t1 = mk(7, 100, 640);
    zone.dispatchEvent(new TouchEvent("touchmove", { touches: [t1], targetTouches: [t1], changedTouches: [t1], bubbles: true, cancelable: true }));
  });
  await sleep(900);
  const move = await page.evaluate(function () {
    const v = KOTO.cat.body.velocity;
    return { speed: +Math.hypot(v.x, v.z).toFixed(2) };
  });
  await page.evaluate(function () {
    const zone = document.getElementById("joy-zone");
    const t = new Touch({ identifier: 7, target: zone, clientX: 100, clientY: 640 });
    zone.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [t], bubbles: true, cancelable: true }));
  });

  // 3) кнопка ЛАПА
  await page.evaluate(function () {
    const b = document.getElementById("tb-swipe");
    const t = new Touch({ identifier: 8, target: b, clientX: 300, clientY: 700 });
    b.dispatchEvent(new TouchEvent("touchstart", { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  });
  await sleep(150);
  const swipe = await page.evaluate(function () { return { swipeT: +KOTO.cat.swipeT.toFixed(2) }; });

  // 4) свайп по канвасу крутит камеру
  const yawBefore = await page.evaluate(function () { return +window.__dbg.cam.yaw.toFixed(3); });
  await page.evaluate(function () {
    const c = document.querySelector("#game canvas");
    const mk = function (id, x, y) { return new Touch({ identifier: id, target: c, clientX: x, clientY: y }); };
    const t0 = mk(9, 250, 300);
    c.dispatchEvent(new TouchEvent("touchstart", { touches: [t0], targetTouches: [t0], changedTouches: [t0], bubbles: true, cancelable: true }));
    const t1 = mk(9, 150, 320);
    c.dispatchEvent(new TouchEvent("touchmove", { touches: [t1], targetTouches: [t1], changedTouches: [t1], bubbles: true, cancelable: true }));
    c.dispatchEvent(new TouchEvent("touchend", { touches: [], targetTouches: [], changedTouches: [t1], bubbles: true, cancelable: true }));
  });
  await sleep(200);
  const yawAfter = await page.evaluate(function () { return +window.__dbg.cam.yaw.toFixed(3); });

  await sleep(400);
  await page.screenshot({ path: "test/shot_mobile.png" });

  console.log("touch-ui:", JSON.stringify(ui));
  console.log("скорость кота от джойстика:", JSON.stringify(move));
  console.log("кнопка ЛАПА:", JSON.stringify(swipe));
  console.log("камера yaw:", yawBefore, "->", yawAfter);
  await browser.close();

  const ok = ui.touchUi && ui.joyZone && ui.btnJump && ui.btnSwipe && ui.btnMeow &&
    move.speed > 0.8 &&
    swipe.swipeT > 0 &&
    Math.abs(yawAfter - yawBefore) > 0.05 &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "MOBILE OK" : "MOBILE FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
