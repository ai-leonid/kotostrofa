"use strict";
// GR-01..GR-07: Графические улучшения
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
    // GR-01: Анимации кота (мигание, bounce)
    const hasCatAnimProps = KOTO.cat && KOTO.cat.blinkTimer !== undefined;

    // GR-05: SpotLight в сцене
    let hasSpotLight = false;
    window.__dbg.world; // мир
    const scene = window.KOTO.cat.group.parent;
    scene.traverse(function (o) {
      if (o.isSpotLight) hasSpotLight = true;
    });

    // GR-07: Живой мини-портрет кота в HUD (canvas 64x64 с пикселями)
    for (let i = 0; i < 10; i++) {
      await new Promise(res => requestAnimationFrame(res));
    }
    const portrait = document.getElementById("hud-cat-portrait");
    const pWidth = portrait ? portrait.width : 0;
    const pHeight = portrait ? portrait.height : 0;
    const pCtx = portrait ? portrait.getContext("2d") : null;
    let hasDrawnPixels = false;
    if (pCtx) {
      const d = pCtx.getImageData(0, 0, 64, 64).data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) {
          hasDrawnPixels = true;
          break;
        }
      }
    }

    // GR-04: Постобработка при панике кота
    KOTO.cat.scare(2.0);
    // Ждём 1 кадр
    await new Promise(res => requestAnimationFrame(res));
    const panicClassAdded = document.body.classList.contains("panic-active");

    return {
      hasCatAnimProps: hasCatAnimProps,
      hasSpotLight: hasSpotLight,
      portraitWidth: pWidth,
      portraitHeight: pHeight,
      hasDrawnPixels: hasDrawnPixels,
      panicClassAdded: panicClassAdded
    };
  });

  console.log("Graphics features test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.hasCatAnimProps === true &&
    result.hasSpotLight === true &&
    result.portraitWidth === 64 &&
    result.portraitHeight === 64 &&
    result.hasDrawnPixels === true &&
    result.panicClassAdded === true &&
    errors.length === 0;

  if (!ok) console.log("Graphics features test failed!", result, "errors:", errors);
  console.log(ok ? "GRAPHICS FEATURES OK" : "GRAPHICS FEATURES FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
