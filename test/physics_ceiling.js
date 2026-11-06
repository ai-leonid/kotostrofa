"use strict";
// BUG-01: Кот прыгает сквозь потолок
// Проверяет, что физический потолок и clamp удерживают кота ниже 2.7
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

  // Даём коту мощный импульс вверх (супер-прыжок)
  const maxY = await page.evaluate(async function () {
    const cat = KOTO.cat;
    cat.body.position.set(-4.5, 1.5, 0);
    cat.body.velocity.set(0, 15, 0); // огромная вертикальная скорость

    let peakY = -Infinity;
    for (let i = 0; i < 40; i++) {
      await new Promise(res => requestAnimationFrame(res));
      if (cat.body.position.y > peakY) {
        peakY = cat.body.position.y;
      }
    }
    return peakY;
  });

  console.log("Max Y reached:", maxY);
  await browser.close();

  const ok = maxY <= 2.65 && maxY > 0 && errors.length === 0;
  if (!ok) console.log("Ceiling clamp failed! Max Y:", maxY, "errors:", errors);
  console.log(ok ? "PHYSICS CEILING OK" : "PHYSICS CEILING FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
