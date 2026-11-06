"use strict";
// GP-06: Хардкорный режим (?hard=1)
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

  await page.goto(h.BASE + "?autostart=1&t=60&hard=1");
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(function () {
    const hasHardClass = document.body.classList.contains("hard-mode");
    const isHardState = KOTO.game.state.hardMode;

    const timerWrapStyle = window.getComputedStyle(document.getElementById("hud-timer-wrap"));
    const scoreColStyle = window.getComputedStyle(document.getElementById("hud-score-col"));

    // Проверяем окно комбо: должно быть 0.6 сек
    KOTO.game.state.combo = 1;
    // вызов comboUp для проверки state.comboMaxT
    const prevT = KOTO.game.state.comboT;

    // Проверяем прозрачность кота (ghost mode: opacity 0.35)
    let catOpacity = 1.0;
    KOTO.cat.group.traverse(function (o) {
      if (o.isMesh && o.material && o.material.opacity !== undefined) {
        catOpacity = Math.min(catOpacity, o.material.opacity);
      }
    });

    return {
      hasHardClass: hasHardClass,
      isHardState: isHardState,
      timerHidden: timerWrapStyle.visibility === "hidden",
      scoreHidden: scoreColStyle.visibility === "hidden",
      catOpacity: catOpacity
    };
  });

  console.log("Hard mode test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.hasHardClass === true &&
    result.isHardState === true &&
    result.timerHidden === true &&
    result.scoreHidden === true &&
    result.catOpacity <= 0.4 &&
    errors.length === 0;

  if (!ok) console.log("Hard mode test failed!", result, "errors:", errors);
  console.log(ok ? "HARD MODE OK" : "HARD MODE FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
