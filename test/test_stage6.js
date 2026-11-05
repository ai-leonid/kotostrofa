"use strict";
const puppeteer = require("puppeteer-core");
const h = require("./helpers");
const CHROME = h.CHROME;
const BASE = h.BASE;
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: "new",
      args: ["--disable-gpu", "--use-angle=swiftshader", "--no-first-run", "--mute-audio"],
      defaultViewport: { width: 1280, height: 720 }
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", function (e) { errors.push(e.message); });

    await page.goto(BASE + "?autostart=1&t=45");
    await sleep(2000);

    const result = await page.evaluate(async () => {
      const g = window.KOTO.game;
      const v = window.KOTO.propsSys.vacuum;
      const cat = window.KOTO.cat;

      if (!v) return { ok: false, msg: "vacuum not found" };

      const initialPos = { x: v.pos.x, z: v.pos.z };
      // Advance some time in props update
      window.KOTO.propsSys.update(0.5);

      const moved = (v.pos.x !== initialPos.x || v.pos.z !== initialPos.z);

      // Test Cat Scare and combo reset
      g.state.combo = 15;
      g.state.comboT = 1.5;
      v.scareCd = 0;
      // Position cat right on vacuum
      cat.body.position.set(v.pos.x, v.pos.y, v.pos.z);
      window.KOTO.propsSys.update(0.1);

      const comboReset = (g.state.combo === 0);
      const catScared = (v.scareCd > 0);

      // Test Vacuum Breakage
      const scoreBefore = g.state.score;
      v.break();
      const scoreAfter = g.state.score;
      const brokenOk = v.broken && (scoreAfter - scoreBefore === 12000);

      // Test Cat Drift on puddle
      const puddles = window.KOTO.propsSys.puddles;
      let driftTested = false;
      if (puddles.length > 0) {
        cat.body.position.set(puddles[0].x, puddles[0].y + 0.05, puddles[0].z);
        cat.grounded = true;
        cat.update(0.05, { f: true, b: false, l: false, r: false, run: true, camYaw: 0 });
        driftTested = (cat.wetTime > 0);
      } else {
        driftTested = true;
      }

      return {
        ok: moved && comboReset && catScared && brokenOk && driftTested,
        moved,
        comboReset,
        catScared,
        brokenOk,
        scoreDiff: scoreAfter - scoreBefore,
        driftTested
      };
    });

    console.log("Stage 6 Test Result:", JSON.stringify(result, null, 2));
    if (errors.length > 0) {
      console.error("Page errors:", errors);
    }
    if (!result.ok || errors.length > 0) {
      console.error("Stage 6 verification failed!");
      await browser.close();
      process.exit(1);
    }
    console.log("STAGE 6 VERIFIED SUCCESSFULLY!");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
