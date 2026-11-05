"use strict";
// Квест спальни «Тихий час»: кровать → лампа → ковёр (в любом порядке — движок общий).
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
  const errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });
  await page.goto(BASE + "?autostart=1&t=60");
  await sleep(2000);

  // шаг 1: запрыгнуть на кровать
  await page.evaluate(function () {
    KOTO.cat.body.position.set(10.2, 0.8, -3.3);
    KOTO.cat.body.velocity.set(0, 0, 0);
  });
  await sleep(500);
  const s1 = await page.evaluate(function () {
    const q = KOTO.game.state.quests.bedroom;
    return { step: q.step, bedTop: q.bedTop };
  });

  // шаг 2: разбить прикроватную лампу (бросок в стену)
  await page.evaluate(function () {
    const lamp = KOTO.propsSys.props.filter(function (p) { return p.name === "лампу"; })[0];
    lamp.body.wakeUp();
    lamp.body.velocity.set(0, 0, -3.2);
  });
  await sleep(1200);
  const s2 = await page.evaluate(function () {
    const q = KOTO.game.state.quests.bedroom;
    return { step: q.step, lampDown: q.lampDown };
  });

  // шаг 3: поточить когти о ковёр в спальне (встать на ковёр, удар лапой)
  await page.evaluate(function () {
    KOTO.cat.body.position.set(9.2, 0.26, -0.9);
    KOTO.cat.body.velocity.set(0, 0, 0);
    KOTO.game.trySwipe();
  });
  await sleep(500);
  const s3 = await page.evaluate(function () {
    const q = KOTO.game.state.quests.bedroom;
    return { step: q.step, done: q.done, rugScratched: q.rugScratched, score: KOTO.game.state.score };
  });

  console.log("после кровати:", JSON.stringify(s1));
  console.log("после лампы:", JSON.stringify(s2));
  console.log("после ковра:", JSON.stringify(s3));
  await browser.close();

  const ok = s1.step === 1 && s1.bedTop === true &&
    s2.step === 2 && s2.lampDown === true &&
    s3.step === 3 && s3.done === true && s3.rugScratched === true &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "BEDROOM QUEST OK" : "BEDROOM QUEST FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
