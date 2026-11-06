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
    await page.goto(BASE + "?autostart=1&t=90");
    await sleep(2500);

    // Trigger navigation target to kitchen to see full minimap + 3D beacon + nav guidance in action
    await page.evaluate(() => {
      const apt = window.KOTO.apt;
      window.KOTO.minimap.setNavTarget(apt.doors.A, "kitchen", "Кухня");
    });
    await sleep(600);

    await page.screenshot({ path: "test/shot_minimap.png" });
    console.log("Screenshot saved to test/shot_minimap.png");

    await browser.close();
  } catch (err) {
    console.error(err);
    if (browser) await browser.close();
  }
})();
