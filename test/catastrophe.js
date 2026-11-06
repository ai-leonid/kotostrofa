"use strict";
// GP-05: Случайные события «Катастрофа»
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
    let thunderFired = false;
    KOTO.bus.on("catastrophe:thunder", () => { thunderFired = true; });

    // Запускаем катастрофу несколько раз и смотрим эффекты
    KOTO.game.triggerCatastrophe();
    const banner1 = document.getElementById("banner").textContent;
    const shake1 = KOTO.game.state.shake;

    KOTO.game.triggerCatastrophe();
    KOTO.game.triggerCatastrophe();

    const catScared = KOTO.cat.scaredT;

    return {
      banner1: banner1,
      shake1: shake1,
      catScared: catScared,
      thunderFired: thunderFired
    };
  });

  console.log("Catastrophe test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.banner1.length > 0 &&
    (result.shake1 > 0 || result.catScared > 0 || result.thunderFired === true) &&
    errors.length === 0;

  if (!ok) console.log("Catastrophe test failed!", result, "errors:", errors);
  console.log(ok ? "CATASTROPHE OK" : "CATASTROPHE FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
