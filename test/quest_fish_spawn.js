"use strict";
// Регрессия квеста «Операция „Рыбный день“»:
// 1) разбивание аквариума НА столешнице спавнит рыбку на открытом полу (не внутри тумбы);
// 2) шаг квеста засчитывается только при разбивании, а не при любом ударе.
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

  // шаг 0: запрыгнуть на кухонный стол (ждём опросом: headless может не успеть кадр)
  await page.evaluate(function () {
    KOTO.cat.body.position.set(2.6, 1.0, -1.9);
    KOTO.cat.body.velocity.set(0, 0, 0);
  });
  let s0 = { step: 0 };
  for (let i = 0; i < 15; i++) {
    await sleep(400);
    s0 = await page.evaluate(function () { return { step: KOTO.game.state.quest.step }; });
    if (s0.step >= 1) break;
  }

  // несильный подброс аквариума (остаётся цел): шаг НЕ должен засчитаться
  await page.evaluate(function () {
    const bowl = KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0];
    bowl.body.wakeUp();
    bowl.body.velocity.set(0, 0.5, 0.8);
  });
  await sleep(1200);
  const sTap = await page.evaluate(function () {
    const bowl = KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0];
    return { step: KOTO.game.state.quest.step, broken: bowl.broken, fishAlive: KOTO.propsSys.fish.alive };
  });

  // разбить аквариум на столешнице (бросок в стену на уровне столешницы); ждём опросом —
  // headless под нагрузкой идёт в несколько раз медленнее игрового времени
  for (let i = 0; i < 12; i++) {
    await page.evaluate(function () {
      const bowl = KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0];
      if (bowl.broken) return;
      bowl.body.wakeUp();
      bowl.body.velocity.set(0, 0, -3.5);
    });
    await sleep(700);
    const brokenNow = await page.evaluate(function () {
      return KOTO.propsSys.props.filter(function (p) { return p.name === "аквариум"; })[0].broken;
    });
    if (brokenNow) break;
  }
  await sleep(400);
  const s1 = await page.evaluate(function () {
    const f = KOTO.propsSys.fish;
    // проверка «открытости»: вертикальный луч сверху должен достичь пола;
    // если луч попал в саму рыбку (лежит на осколках) — кастуем повторно от неё вниз
    let open = false;
    if (f.body) {
      const cast = function (from) {
        const ray = new CANNON.Ray(new CANNON.Vec3(f.body.position.x, from, f.body.position.z), new CANNON.Vec3(f.body.position.x, 0, f.body.position.z));
        const res = new CANNON.RaycastResult();
        ray.intersectWorld(window.__dbg.world, { mode: CANNON.Ray.CLOSEST, result: res, skipBackfaces: true, collisionFilterMask: 1 });
        return res;
      };
      let res = cast(2.0);
      if (res.hasHit && res.body === f.body) res = cast(f.body.position.y - 0.03);
      open = res.hasHit && res.hitPointWorld.y < 0.2;
    }
    return {
      step: KOTO.game.state.quest.step,
      fishAlive: f.alive,
      fishPos: f.body ? { x: +f.body.position.x.toFixed(2), y: +f.body.position.y.toFixed(2), z: +f.body.position.z.toFixed(2) } : null,
      fishInOpen: open
    };
  });

  // съесть рыбку с открытого пола рядом с ней
  let s2 = null;
  for (let i = 0; i < 15; i++) {
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
      return { step: KOTO.game.state.quest.step, done: KOTO.game.state.quest.done };
    });
    if (s2.done) break;
  }

  console.log("после стола:", JSON.stringify(s0));
  console.log("после лёгкого толчка:", JSON.stringify(sTap));
  console.log("после разбивания:", JSON.stringify(s1));
  console.log("после поедания:", JSON.stringify(s2));
  await browser.close();

  const ok = s0.step === 1 &&
    sTap.step === 1 && !sTap.broken && !sTap.fishAlive &&
    s1.step === 2 && s1.fishAlive && s1.fishInOpen && s1.fishPos && s1.fishPos.y < 0.3 &&
    s2 && s2.done === true &&
    errors.length === 0;
  if (!ok) console.log("errors:", errors);
  console.log(ok ? "FISH SPAWN REGRESSION OK" : "FISH SPAWN REGRESSION FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
