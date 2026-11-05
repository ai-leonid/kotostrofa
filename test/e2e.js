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

  await page.goto(BASE + "?autostart=1&bot=1&t=60");
  await new Promise(function (r) { setTimeout(r, 3000); });
  await page.screenshot({ path: "test/shot_spawn.png" });

  // телепорт на кухню: вид на стол, стулья, тумбу с аквариумом
  await page.evaluate(function () {
    KOTO.cat.body.position.set(4.6, 0.26, -1.6);
    KOTO.cat.body.velocity.set(0, 0, 0);
    KOTO.cat.yaw = Math.PI / 2 + 0.6;
  });
  await new Promise(function (r) { setTimeout(r, 1500); });
  await page.screenshot({ path: "test/shot_kitchen.png" });

  // телепорт к аквариуму: проверка квестового предмета крупно
  await page.evaluate(function () {
    KOTO.cat.body.position.set(4.7, 0.26, -3.4);
    KOTO.cat.body.velocity.set(0, 0, 0);
    KOTO.cat.yaw = -Math.PI / 2 - 0.5;
  });
  await new Promise(function (r) { setTimeout(r, 1200); });
  await page.screenshot({ path: "test/shot_counter.png" });

  const r1 = await page.evaluate(function () {
    return { errors: window.__errors, score: KOTO.game.state.score };
  });
  console.log("VISUAL RUN errors:", JSON.stringify(r1.errors), "score:", r1.score);

  // быстрый полный цикл до финала
  await page.goto(BASE + "?autostart=1&bot=1&t=12");
  await new Promise(function (r) { setTimeout(r, 22000); });
  const end = await page.evaluate(function () {
    return {
      mode: KOTO.game.state.mode,
      stats: window.__stats || null,
      errors: window.__errors
    };
  });
  console.log("FINAL:", JSON.stringify(end));
  await page.screenshot({ path: "test/shot_end.png" });

  await browser.close();
  const errs = (r1.errors || []).concat((end.errors || []));
  if (errs.length) { console.log("ERRORS:", errs); process.exit(1); }
  console.log("E2E OK — ошибок нет");
})().catch(function (e) { console.error("E2E FAIL", e); process.exit(1); });
