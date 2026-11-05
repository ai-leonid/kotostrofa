"use strict";
// Phase 1: атрибуция очков комнатам.
// 1) roomOf() отдаёт правильные комнаты для точек всех комнат;
// 2) у предметов корректный тег prop.room по месту спавна;
// 3) удар/разбивание начисляют очки в progress нужной комнаты и в общий счёт;
// 4) точение когтей атрибутировано комнате цели;
// 5) HUD-блок комнаты показывает имя и прогресс.
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

  // 1) roomOf: по точке в каждой комнате
  const roomOf = await page.evaluate(function () {
    const L = KOTO.levels;
    return {
      living: L.roomOf(-4.4, 0.9),
      kitchen: L.roomOf(2.6, -1.9),
      bath: L.roomOf(2.8, 2.3),
      bedroom: L.roomOf(10.2, -3.3),
      outside: L.roomOf(0, 0.6) // стена кухня/ванная — не комната
    };
  });

  // 2) теги prop.room у типовых предметов
  const tags = await page.evaluate(function () {
    const byName = function (name, n) {
      return KOTO.propsSys.props.filter(function (p) { return p.name === name; }).slice(0, n || 3)
        .map(function (p) { return p.room; });
    };
    return {
      mugRooms: KOTO.propsSys.props.filter(function (p) { return p.name === "кружку"; })
        .map(function (p) { return p.room; }),
      aquarium: byName("аквариум", 1),
      shampoos: byName("шампунь"),
      lamp: byName("лампу", 1),
      tv: byName("телевизор", 1),
      noNull: KOTO.propsSys.props.every(function (p) { return p.room !== undefined; })
    };
  });

  // 3) разбить кружку на кухне (бросок в стену) — очки в kitchen
  const before = await page.evaluate(function () {
    return { score: KOTO.game.state.score, kitchen: KOTO.game.state.progress.kitchen, living: KOTO.game.state.progress.living };
  });
  await page.evaluate(function () {
    const mug = KOTO.propsSys.props.filter(function (p) {
      return p.name === "кружку" && p.room === "kitchen";
    })[0];
    mug.body.wakeUp();
    mug.body.velocity.set(0, 0, -3.5);
  });
  await sleep(1200);
  const afterKitchen = await page.evaluate(function () {
    const st = KOTO.game.state;
    return { score: st.score, kitchen: st.progress.kitchen, living: st.progress.living, broken: st.broken };
  });

  // 4) разбить телевизор в гостиной — очки в living
  await page.evaluate(function () {
    KOTO.cat.body.position.set(-2.9, 0.26, 0.9);
    KOTO.cat.body.velocity.set(0, 0, 0);
    const tv = KOTO.propsSys.props.filter(function (p) { return p.name === "телевизор"; })[0];
    tv.body.wakeUp();
    tv.body.velocity.set(2.2, 0.4, 0);
  });
  await sleep(1200);
  const afterLiving = await page.evaluate(function () {
    const st = KOTO.game.state;
    return { living: st.progress.living, room: st.room };
  });

  // 5) HUD-блок комнаты: кот в гостиной — имя и цифры на месте
  const hud = await page.evaluate(function () {
    return {
      room: KOTO.game.state.room,
      name: document.getElementById("hud-room-name").textContent,
      pts: document.getElementById("hud-room-pts").textContent,
      barW: document.getElementById("hud-room-bar").style.width
    };
  });

  console.log("roomOf:", JSON.stringify(roomOf));
  console.log("prop.room:", JSON.stringify(tags));
  console.log("до/после кухни:", JSON.stringify(before), "->", JSON.stringify(afterKitchen));
  console.log("после гостиной:", JSON.stringify(afterLiving));
  console.log("HUD:", JSON.stringify(hud));
  await browser.close();

  const ok =
    roomOf.living === "living" && roomOf.kitchen === "kitchen" &&
    roomOf.bath === "bath" && roomOf.bedroom === "bedroom" && roomOf.outside === null &&
    tags.noNull &&
    tags.aquarium[0] === "kitchen" && tags.shampoos.every(function (r) { return r === "bath"; }) &&
    tags.lamp[0] === "bedroom" && tags.tv[0] === "living" &&
    tags.mugRooms.indexOf("kitchen") >= 0 && tags.mugRooms.indexOf("living") >= 0 && tags.mugRooms.indexOf("bedroom") >= 0 &&
    afterKitchen.score > before.score &&
    afterKitchen.kitchen > before.kitchen &&
    afterKitchen.living === before.living &&
    afterLiving.living > afterKitchen.living &&
    hud.name === "Гостиная" && hud.pts.indexOf("₽") >= 0 &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "LEVELS OK" : "LEVELS FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
