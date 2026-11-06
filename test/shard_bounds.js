"use strict";
// BUG-02: Осколки вылетают в соседние комнаты (проверка зажима осколков в пределах AABB комнаты)
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
    const l = KOTO.levels;
    const livingAABB = l.info("living").aabb;

    // Спавним 40 осколков прямо у самой кромки гостиной (x = -1.55, z = 0)
    const edgePos = { x: -1.55, y: 1.0, z: 0 };
    KOTO.propsSys.spawnShards(edgePos, "#ff0000", 40, new CANNON.Vec3(5, 0, 0)); // импульс в сторону кухни

    // Ждём несколько тиков физики
    for (let i = 0; i < 30; i++) {
      await new Promise(res => requestAnimationFrame(res));
    }

    // Собираем все осколки в transients и проверяем их координаты X
    // В living: x1 = -7.0, x2 = -1.5
    // Осколки не должны вылететь за x2 (> -1.45 с запасом)
    const transients = KOTO.propsSys.transients || [];
    let outOfBounds = 0;
    const shardPositions = [];

    for (const tr of transients) {
      if (tr.body) {
        const x = tr.body.position.x;
        const z = tr.body.position.z;
        shardPositions.push({ x: x, z: z });
        // Проверяем превышение границы гостиной (с учётом толщины стены)
        if (x > livingAABB.x2 + 0.15 || x < livingAABB.x1 - 0.2) {
          outOfBounds++;
        }
      }
    }

    return {
      totalShards: shardPositions.length,
      outOfBounds: outOfBounds,
      samplePositions: shardPositions.slice(0, 5)
    };
  });

  console.log("Shard bounds test result:", JSON.stringify(result));
  await browser.close();

  const ok = result.totalShards > 0 && result.outOfBounds === 0 && errors.length === 0;
  if (!ok) console.log("Shards leaked out of room bounds!", result, "errors:", errors);
  console.log(ok ? "SHARD BOUNDS OK" : "SHARD BOUNDS FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
