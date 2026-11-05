"use strict";
// Регрессия: квест работает в ЛЮБОМ порядке.
// Сценарий игрока: разбил аквариум до прыжка на стол, рыбка лежит рядом с котом —
// поедание должно сработать сразу, а цепочка шагов догоняет факты.
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

  // 1) сразу разбить аквариум (шаг «стол» ещё не сделан)
  await page.evaluate(function () {
    const bowl = KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0];
    bowl.body.wakeUp();
    bowl.body.velocity.set(0, 0, -3.5);
  });
  await sleep(1200);
  const s1 = await page.evaluate(function () {
    return {
      step: KOTO.game.state.quest.step,
      fishbowlDown: KOTO.game.state.quest.fishbowlDown,
      fishAlive: KOTO.propsSys.fish.alive
    };
  });

  // 2) подвести кота к рыбке — съедание должно сработать НЕМЕДЛЕННО (даже на шаге 0)
  let s2 = null;
  for (let i = 0; i < 8; i++) {
    const fp = await page.evaluate(function () {
      return (KOTO.propsSys.fish.alive && KOTO.propsSys.fish.body) ? {
        x: KOTO.propsSys.fish.body.position.x, z: KOTO.propsSys.fish.body.position.z
      } : null;
    });
    if (!fp) break;
    await page.evaluate(function (p) {
      KOTO.cat.body.position.set(p.x + 0.15, 0.26, p.z + 0.15);
      KOTO.cat.body.velocity.set(0, 0, 0);
    }, fp);
    await sleep(400);
    s2 = await page.evaluate(function () {
      return { fishEaten: KOTO.game.state.quest.fishEaten, fishAlive: KOTO.propsSys.fish.alive, step: KOTO.game.state.quest.step };
    });
    if (s2.fishEaten) break;
  }

  // 3) теперь запрыгнуть на стол — цепочка должна догнать факты и завершить квест
  await page.evaluate(function () {
    KOTO.cat.body.position.set(2.6, 1.0, -1.9);
    KOTO.cat.body.velocity.set(0, 0, 0);
  });
  await sleep(700);
  const s3 = await page.evaluate(function () {
    const q = KOTO.game.state.quest;
    return { step: q.step, done: q.done, tableTop: q.tableTop, score: KOTO.game.state.score };
  });

  console.log("после разбивания (стол не сделан):", JSON.stringify(s1));
  console.log("после подхода к рыбке:", JSON.stringify(s2));
  console.log("после прыжка на стол:", JSON.stringify(s3));
  await browser.close();

  const ok = s1.step === 0 && s1.fishbowlDown === true && s1.fishAlive === true &&
    s2 && s2.fishEaten === true && s2.fishAlive === false &&
    s3.step === 3 && s3.done === true && s3.tableTop === true &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "QUEST ANY-ORDER OK" : "QUEST ANY-ORDER FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
