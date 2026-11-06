"use strict";
// GP-03: «Лапа-лассо»: бросок предметов с прицелом
const puppeteer = require("puppeteer-core");
const h = require("./helpers");

(async function () {
  const browser = await puppeteer.launch({
    executablePath: h.CHROME,
    headless: "new",
    args: ["--disable-gpu", "--use-angle=swiftshader", "--no-first-run", "--mute-audio", "--window-size=1280,800"],
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });

  await page.goto(h.BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(async function () {
    // 1. Ставим кота перед предметом
    const cat = KOTO.cat;
    cat.body.position.set(-4.5, 0.26, 0.5);
    cat.body.velocity.set(0, 0, 0);
    cat.yaw = 0; // смотрит вперёд вдоль +z

    // Ставим банку перед котом на z = 1.0
    const bottle = KOTO.propsSys.props.find(p => p.name === "банку" && !p.broken) || KOTO.propsSys.props[0];
    bottle.body.position.set(-4.5, 0.26, 1.0);
    bottle.body.velocity.set(0, 0, 0);

    // 2. Активируем захват лассо (onLassoHold)
    KOTO.game.onLassoHold();
    const grabbed = KOTO.game.getLassoProp();

    const lassoIndicatorVisible = !document.getElementById("hud-lasso").classList.contains("hidden");

    // Обновляем кадр, проверяем что предмет прикреплён перед котом
    KOTO.game.update(0.016);
    const heldPos = grabbed ? { x: grabbed.body.position.x, z: grabbed.body.position.z } : null;

    // 3. Отпускаем лассо (onLassoRelease)
    KOTO.game.onLassoRelease();
    const lassoIndicatorHidden = document.getElementById("hud-lasso").classList.contains("hidden");

    // Проверяем начальную скорость броска
    const throwVel = grabbed ? { x: grabbed.body.velocity.x, y: grabbed.body.velocity.y, z: grabbed.body.velocity.z } : null;
    const isLassoThrown = grabbed ? !!grabbed.body._isLassoThrown : false;

    // 4. Проверяем бросок в робота-пылесоса
    const vacuum = KOTO.propsSys.vacuum;
    const vacHpBefore = vacuum.hp;
    vacuum.pos.set(-4.5, 0.08, 2.5); // ставим пылесос на траектории броска
    vacuum.mesh.position.copy(vacuum.pos);

    // Захватываем и бросаем предмет в сторону пылесоса
    KOTO.game.onLassoHold();
    KOTO.game.onLassoRelease();

    await new Promise(res => setTimeout(res, 350));
    const vacHpAfter = vacuum.hp;

    return {
      grabbedName: grabbed ? grabbed.name : null,
      lassoIndicatorVisible: lassoIndicatorVisible,
      lassoIndicatorHidden: lassoIndicatorHidden,
      throwVel: throwVel,
      isLassoThrown: isLassoThrown,
      vacHpBefore: vacHpBefore,
      vacHpAfter: vacHpAfter,
      vacDmg: vacHpBefore - vacHpAfter
    };
  });

  console.log("Lasso throw test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.lassoIndicatorVisible === true &&
    result.lassoIndicatorHidden === true &&
    result.throwVel.z > 8.0 && // скорость броска вперёд
    result.throwVel.y > 2.0 && // дуга вверх
    result.isLassoThrown === true &&
    result.vacDmg >= 50 && // гарантированный урон 50+ пылесосу
    errors.length === 0;

  if (!ok) console.log("Lasso throw test failed!", result, "errors:", errors);
  console.log(ok ? "LASSO THROW OK" : "LASSO THROW FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
