"use strict";
// GP-01: Бонус-объект дня (Daily Special)
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

  const result = await page.evaluate(function () {
    const dailyName = KOTO.game.state.dailySpecial;
    const hudEl = document.getElementById("hud-daily-special");
    const textEl = document.getElementById("daily-special-text");
    const hudVisible = hudEl && !hudEl.classList.contains("hidden");
    const hudText = textEl ? textEl.textContent : "";

    // Находим выбранный предмет
    const prop = KOTO.propsSys.props.find(p => p.name === dailyName && !p.broken);
    if (!prop) return { err: "no special prop found", dailyName: dailyName };

    const scoreBefore = KOTO.game.state.score;
    const baseValue = prop.value;

    // Разбиваем его
    KOTO.bus.emit("prop:impact", { prop: prop, velocity: 5.0, isStrike: false });

    const scoreAfter = KOTO.game.state.score;
    const ptsAwarded = scoreAfter - scoreBefore;
    const isDone = KOTO.game.state.dailySpecialDone;
    const hudDone = hudEl.classList.contains("done");

    return {
      dailyName: dailyName,
      hudVisible: hudVisible,
      hudText: hudText,
      baseValue: baseValue,
      ptsAwarded: ptsAwarded,
      isDone: isDone,
      hudDone: hudDone
    };
  });

  console.log("Daily Special test result:", JSON.stringify(result));
  await browser.close();

  // Очки должны быть минимум baseValue * 2.5 (плюс возможный комбо-множитель)
  const expectedMin = Math.round(result.baseValue * 2.5);
  const ok =
    !!result.dailyName &&
    result.hudVisible === true &&
    result.isDone === true &&
    result.hudDone === true &&
    result.ptsAwarded >= expectedMin &&
    errors.length === 0;

  if (!ok) console.log("Daily special test failed!", result, "errors:", errors);
  console.log(ok ? "DAILY SPECIAL OK" : "DAILY SPECIAL FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
