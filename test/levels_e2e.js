"use strict";
// Phase 2+3: двери, прохождение уровней, обязательные квесты комнат.
// Цепочка: гостиная (Арт-критик + порог) → кухня (Рыбный день + порог) →
// ванная (Водные процедуры + порог) → спальня (Тихий час + порог) → победа.
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
  await page.goto(BASE + "?autostart=1&t=90&fast=1"); // fast: игровое время ≈ реальному, scoreCd успевает
  await sleep(2500);

  async function go(x, y, z, fx, fz) {
    await page.evaluate(function (a) {
      KOTO.cat.body.position.set(a[0], a[1], a[2]);
      KOTO.cat.body.velocity.set(0, 0, 0);
      if (a[3] !== null) KOTO.cat.yaw = Math.atan2(a[3] - a[0], a[4] - a[2]);
    }, [x, y, z, fx === undefined ? null : fx, fz === undefined ? null : fz]);
    await sleep(350);
  }
  async function swipe() {
    await page.evaluate(function () { KOTO.game.trySwipe(); });
    await sleep(550);
  }
  async function questState(id) {
    return page.evaluate(function (id) {
      const q = KOTO.game.state.quests[id];
      return { step: q.step, done: q.done };
    }, id);
  }
  // ждём, пока квест не завершится (событие удара может обработаться с задержкой физики)
  async function waitQuest(id, timeoutMs) {
    const until = Date.now() + (timeoutMs || 10000);
    while (Date.now() < until) {
      const q = await questState(id);
      if (q.done) return q;
      await sleep(400);
    }
    return questState(id);
  }
  // помошник: крушим предметы комнаты раундами, пока не набран порог (квесты уже выполнены)
  async function smash(room) {
    for (let i = 0; i < 22; i++) {
      const done = await page.evaluate(function (room) {
        const st = KOTO.game.state;
        if (st.level.done.indexOf(room) >= 0 || st.progress[room] >= KOTO.levels.info(room).target) return true;
        KOTO.propsSys.props.forEach(function (p) {
          if (p.room !== room || p.broken) return;
          p.body.wakeUp();
          p.body.velocity.set((Math.random() - 0.5) * 2, -2.5, (Math.random() - 0.5) * 2);
          p.body.angularVelocity.set(Math.random() * 6, 0, Math.random() * 6);
        });
        return false;
      }, room);
      if (done) return;
      await sleep(1000);
    }
  }

  // --- старт: двери заперты и держат кота ---
  const locked = await page.evaluate(function () {
    const d = KOTO.apt.doors;
    return { A: d.A.isOpen, B: d.B.isOpen, V: d.V.isOpen };
  });
  await page.evaluate(function () {
    KOTO.cat.body.position.set(-2.4, 0.26, -1.7);
    KOTO.cat.body.velocity.set(3.5, 0, 0);
  });
  await sleep(800);
  const blockedX = await page.evaluate(function () { return +KOTO.cat.body.position.x.toFixed(2); });

  // --- УРОВЕНЬ 1: гостиная, «Арт-критик» ---
  await go(-5.4, 0.26, 3.9, -5.4, 4.46); await swipe();   // сбросить картину
  await go(-6.5, 0.26, -3.3, -6.5, -3.9); await swipe();  // опрокинуть торшер
  await go(-5.95, 0.26, 0.9); await swipe();              // подрать диван
  const art = await questState("art");
  const tBefore = await page.evaluate(function () { return KOTO.game.state.timeLeft; });
  await page.evaluate(function () {
    const tv = KOTO.propsSys.props.filter(function (p) { return p.name === "телевизор"; })[0];
    tv.body.wakeUp();
    tv.body.velocity.set(0, 0, -3.2);
  });
  await smash("living");
  const afterLiving = await page.evaluate(function () {
    const st = KOTO.game.state;
    return {
      done: st.level.done.slice(), idx: st.level.idx, progress: st.progress.living,
      timeLeft: st.timeLeft, speedBonus: st.speedBonus, speedLeft: st.speedLeft,
      doorA: KOTO.apt.doors.A.isOpen, doorB: KOTO.apt.doors.B.isOpen, doorV: KOTO.apt.doors.V.isOpen
    };
  });

  // --- УРОВЕНЬ 2: кухня, «Рыбный день» ---
  await go(2.6, 1.0, -1.9); await sleep(600);          // стол
  await page.evaluate(function () {
    const bowl = KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0];
    bowl.body.wakeUp();
    bowl.body.velocity.set(0, 0, -3.5);
  });
  await sleep(1200);
  await go(5.4, 0.26, -3.6); await sleep(800);         // рыбка рядом — съесть
  const fish = await questState("fish");
  await smash("kitchen");
  const kitchenDone = await page.evaluate(function () {
    const st = KOTO.game.state;
    return { done: st.level.done.slice(), doorB: KOTO.apt.doors.B.isOpen, timeLeft: Math.round(st.timeLeft) };
  });

  // --- УРОВЕНЬ 3: ванная, «Водные процедуры» ---
  await go(0.7, 0.85, 4.42, 0.7, 4.42); await swipe(); await swipe(); // 2 флакона с борта ванны
  await go(6.55, 0.26, 2.9, 6.5, 3.0); await swipe();     // разорвать бумагу
  await go(2.8, 0.26, 2.0, 2.8, 2.3); await swipe();      // сбить весы
  const bathfun = await waitQuest("bathfun");
  await smash("bath");
  const bathDone = await page.evaluate(function () {
    const st = KOTO.game.state;
    return { done: st.level.done.slice(), doorV: KOTO.apt.doors.V.isOpen, timeLeft: Math.round(st.timeLeft) };
  });

  // --- УРОВЕНЬ 4: спальня, «Тихий час» ---
  await go(10.2, 0.8, -3.3); await sleep(600);         // кровать
  await page.evaluate(function () {
    const lamp = KOTO.propsSys.props.filter(function (p) { return p.name === "лампу"; })[0];
    lamp.body.wakeUp();
    lamp.body.velocity.set(0, 0, -3.2);
  });
  await sleep(1000);
  await go(9.2, 0.26, -0.9); await swipe();               // ковёр в спальне
  const bedroom = await questState("bedroom");
  await smash("bedroom");
  await sleep(4800); // баннер победы (1.8 с) → финальный экран (ещё 2 с)
  const fin = await page.evaluate(function () {
    return {
      mode: KOTO.game.state.mode,
      timeLeft: +KOTO.game.state.timeLeft.toFixed(2),
      rate: KOTO.levels.SPEED_BONUS_PER_SEC,
      title: document.getElementById("end-title").textContent,
      endVisible: !document.getElementById("screen-end").classList.contains("hidden"),
      endQuest: document.getElementById("end-quest").textContent,
      endCounters: document.getElementById("end-counters").textContent,
      stats: window.__stats
    };
  });
  await page.screenshot({ path: "test/shot_end.png" });

  console.log("заперты:", JSON.stringify(locked), "кот упёрся в дверь x:", blockedX);
  console.log("арт-критик:", JSON.stringify(art), "после гостиной:", JSON.stringify(afterLiving), "time до:", Math.round(tBefore));
  console.log("рыбный день:", JSON.stringify(fish), "кухня:", JSON.stringify(kitchenDone));
  console.log("водные процедуры:", JSON.stringify(bathfun), "ванная:", JSON.stringify(bathDone));
  console.log("тихий час:", JSON.stringify(bedroom));
  console.log("финал:", JSON.stringify(fin));
  await browser.close();

  const ok =
    locked.A === false && locked.B === false && locked.V === false &&
    blockedX < -1.6 &&
    art.done === true &&
    afterLiving.done.indexOf("living") >= 0 && afterLiving.idx === 1 &&
    afterLiving.doorA === true && afterLiving.doorB === false && afterLiving.doorV === false &&
    afterLiving.timeLeft > tBefore + 30 &&
    afterLiving.speedBonus > 0 && afterLiving.speedLeft > 0 && // премия после 1-го уровня
    fish.done === true &&
    kitchenDone.done.indexOf("kitchen") >= 0 && kitchenDone.doorB === true &&
    bathfun.done === true &&
    bathDone.done.indexOf("bath") >= 0 && bathDone.doorV === true &&
    bedroom.done === true &&
    fin.mode === "over" && fin.endVisible && fin.title === "КВАРТИРА РАЗГРОМЛЕНА!" &&
    fin.stats && fin.stats.win === true && fin.stats.roomsDone === 4 &&
    fin.stats.speedLeft > 0 &&
    fin.stats.speedBonus >= fin.stats.speedLeft * fin.rate && // накоплено за этапы не меньше последнего
    fin.timeLeft >= fin.stats.speedLeft && fin.timeLeft < fin.stats.speedLeft + 1.5 &&
    fin.endCounters.replace(/\u00a0/g, " ").indexOf("премия Синдиката") >= 0 &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "LEVELS E2E OK" : "LEVELS E2E FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
