"use strict";
const puppeteer = require("puppeteer-core");
const h = require("./helpers");
const CHROME = h.CHROME;
const BASE = h.BASE;
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

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
  await sleep(2000);

  // шаг 0: запрыгнуть на кухонный стол
  await page.evaluate(function () {
    KOTO.cat.body.position.set(2.6, 1.0, -1.9);
    KOTO.cat.body.velocity.set(0, 0, 0);
  });
  await sleep(500);
  const s0 = await page.evaluate(function () { return { step: KOTO.game.state.quest.step, errors: window.__errors }; });
  console.log("после стола:", JSON.stringify(s0));

  // шаг 1: встать за аквариумом (между ним и стеной), столкнуть его на край тумбы
  await page.evaluate(function () {
    KOTO.cat.body.position.set(5.4, 1.2, -4.42);
    KOTO.cat.body.velocity.set(0, 0, 0);
    KOTO.cat.yaw = 0;
  });
  await sleep(600);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(function () { KOTO.game.trySwipe(); });
    await sleep(400);
  }
  await sleep(1500);
  const s1 = await page.evaluate(function () {
    return {
      step: KOTO.game.state.quest.step,
      fishAlive: KOTO.propsSys.fish.alive,
      fishPos: KOTO.propsSys.fish.body ? {
        x: +KOTO.propsSys.fish.body.position.x.toFixed(2),
        y: +KOTO.propsSys.fish.body.position.y.toFixed(2),
        z: +KOTO.propsSys.fish.body.position.z.toFixed(2)
      } : null,
      errors: window.__errors
    };
  });
  console.log("после аквариума:", JSON.stringify(s1));
  await page.screenshot({ path: "test/shot_quest.png" });

  // шаг 2: подойти и съесть рыбку (несколько попыток — рыбка скачет)
  let s2 = null;
  for (let i = 0; i < 8; i++) {
    const fp = await page.evaluate(function () {
      return (KOTO.propsSys.fish.alive && KOTO.propsSys.fish.body) ? {
        x: KOTO.propsSys.fish.body.position.x, z: KOTO.propsSys.fish.body.position.z
      } : null;
    });
    if (!fp) break;
    await page.evaluate(function (p) {
      KOTO.cat.body.position.set(p.x + 0.1, 0.26, p.z + 0.1);
      KOTO.cat.body.velocity.set(0, 0, 0);
    }, fp);
    await sleep(400);
    s2 = await page.evaluate(function () {
      return { step: KOTO.game.state.quest.step, done: KOTO.game.state.quest.done, score: KOTO.game.state.score, errors: window.__errors };
    });
    if (s2.done) break;
  }
  console.log("после рыбки:", JSON.stringify(s2));
  if (!s2) {
    s2 = await page.evaluate(function () {
      return { step: KOTO.game.state.quest.step, done: KOTO.game.state.quest.done, score: KOTO.game.state.score, errors: window.__errors };
    });
    console.log("финальное состояние:", JSON.stringify(s2));
  }

  await browser.close();
  const ok = s0.step === 1 && s1.step === 2 && s2.done === true && s0.errors.length === 0 && s1.errors.length === 0 && s2.errors.length === 0;
  console.log(ok ? "QUEST E2E OK" : "QUEST E2E FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
