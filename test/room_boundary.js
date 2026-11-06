"use strict";
// BUG-04: roomOf() возвращает null на границах дверных проёмов
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

  const results = await page.evaluate(function () {
    const l = KOTO.levels;
    const testPoints = [
      // Дверь A (гостиная - кухня): x = -1.5, z = -1.7
      { x: -1.5, z: -1.7, desc: "door A center" },
      { x: -1.505, z: -1.7, desc: "door A left border" },
      { x: -1.495, z: -1.7, desc: "door A right border" },
      // Дверь B (гостиная - ванная): x = -1.5, z = 2.2
      { x: -1.5, z: 2.2, desc: "door B center" },
      { x: -1.505, z: 2.2, desc: "door B left border" },
      // Дверь V (кухня - спальня): x = 7.125, z = -1.2
      { x: 7.125, z: -1.2, desc: "door V center" },
      { x: 7.12, z: -1.2, desc: "door V kitchen side" },
      { x: 7.13, z: -1.2, desc: "door V bedroom side" }
    ];

    const outcomes = [];
    let hasNull = false;
    for (const pt of testPoints) {
      const room = l.roomOf(pt.x, pt.z);
      outcomes.push({ desc: pt.desc, x: pt.x, z: pt.z, room: room });
      if (!room) hasNull = true;
    }
    return { outcomes: outcomes, hasNull: hasNull };
  });

  console.log("Boundary roomOf results:", JSON.stringify(results.outcomes, null, 2));
  await browser.close();

  const ok = !results.hasNull && errors.length === 0;
  if (!ok) console.log("roomOf returned null on boundary points!", "errors:", errors);
  console.log(ok ? "ROOM BOUNDARY OK" : "ROOM BOUNDARY FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
