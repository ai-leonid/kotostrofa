"use strict";
// Phase 4: локальные рекорды и сохранения.
// 1) партия сохраняется в localStorage, первая — рекорд, стартовый экран её показывает;
// 2) вторая партия со счётом ниже — НЕ рекорд, рекорд остаётся первым;
// 3) сломанное хранилище не роняет игру.
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
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });

  async function playRun(score) {
    await page.goto(BASE + "?autostart=1&t=4&fast=1");
    await sleep(1500);
    await page.evaluate(function (s) {
      KOTO.game.state.score = s; // детерминированный счёт вместо бота
    }, score);
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const mode = await page.evaluate(function () { return KOTO.game.state.mode; });
      if (mode === "over") break;
    }
    await sleep(2500); // баннер → fillEnd показывает экран
    return page.evaluate(function () {
      return {
        endRecord: document.getElementById("end-record").textContent.trim(),
        newRecord: KOTO.game.state.newRecord,
        stats: window.__stats,
        save: KOTO.save.load()
      };
    });
  }

  // чистим хранилище для детерминированности
  await page.goto(BASE);
  await page.evaluate(function () { localStorage.removeItem(KOTO.save.KEY); });

  // --- партия 1: счёт 6000 → рекорд ---
  const run1 = await playRun(6000);
  const best1 = run1.save.best;

  // --- стартовый экран показывает рекорд ---
  await page.goto(BASE);
  await sleep(800);
  const startLine = await page.evaluate(function () {
    const el = document.getElementById("start-record");
    return { hidden: el.classList.contains("hidden"), text: el.textContent };
  });

  // --- партия 2: счёт 3000 → не рекорд ---
  const run2 = await playRun(3000);

  // --- ломаем хранилище: игра не падает, рекорд скрыт ---
  await page.goto(BASE);
  await page.evaluate(function () { localStorage.setItem(KOTO.save.KEY, "{broken json"); });
  await page.goto(BASE + "?autostart=1&t=3&fast=1");
  await sleep(1500);
  const corrupt = await page.evaluate(function () {
    return {
      mode: KOTO.game.state.mode,
      errors: window.__errors.length,
      startRecordHidden: document.getElementById("start-record").classList.contains("hidden")
    };
  });

  console.log("партия 1:", JSON.stringify({ newRecord: run1.newRecord, endRecord: run1.endRecord, stats: run1.stats, best: best1, runs: run1.save.runs.length }));
  console.log("стартовый экран:", JSON.stringify(startLine));
  console.log("партия 2:", JSON.stringify({ newRecord: run2.newRecord, endRecord: run2.endRecord, best: run2.save.best }));
  console.log("сломанное хранилище:", JSON.stringify(corrupt));
  await browser.close();

  const ok =
    run1.newRecord === true &&
    run1.stats && run1.stats.score === 6000 &&
    best1 && best1.score === 6000 && best1.roomsDone === 0 &&
    run1.save.runs.length === 1 &&
    startLine.hidden === false && startLine.text.replace(/\u00a0/g, " ").indexOf("6 000") >= 0 &&
    run2.newRecord === false &&
    run2.save.best.score === 6000 &&
    run2.save.runs.length === 2 &&
    corrupt.mode === "play" && corrupt.errors === 0 && corrupt.startRecordHidden === true &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "RECORDS OK" : "RECORDS FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
