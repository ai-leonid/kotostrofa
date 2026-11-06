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

    await page.goto(BASE + "?autostart=1&t=60");
    await sleep(2200);

    const testResult = await page.evaluate(async () => {
      const g = window.KOTO.game;
      const mm = window.KOTO.minimap;
      const apt = window.KOTO.apt;

      if (!mm) return { ok: false, error: "KOTO.minimap is undefined" };

      // 1. Check DOM elements
      const minimapBox = document.getElementById("hud-minimap");
      const canvas = document.getElementById("minimap-canvas");
      const roomTitle = document.getElementById("minimap-room-title");
      const navEl = document.getElementById("minimap-nav");
      const banner = document.getElementById("banner");

      if (!minimapBox || !canvas || !roomTitle || !navEl) {
        return { ok: false, error: "HUD minimap elements missing" };
      }

      // 2. Banner geometry check: must not be giant in the center
      const bannerStyle = window.getComputedStyle(banner);
      const bannerTop = parseFloat(bannerStyle.top);
      const bannerFontSize = parseFloat(bannerStyle.fontSize);
      const isBannerCompact = (bannerFontSize <= 22) && (bannerTop <= 160);

      // 3. Test initial state (living room)
      const initialRoom = g.state.room;
      const initialTitle = roomTitle.textContent.trim();

      // 4. Test setting navigation target towards Kitchen (Door A)
      const doorA = apt.doors.A;
      mm.setNavTarget(doorA, "kitchen", "Кухня");

      const navTarget = mm.getNavTarget();
      const hasNavTarget = navTarget && navTarget.room === "kitchen" && navTarget.doorId === "A";
      const isNavVisible = !navEl.classList.contains("hidden");
      const navDistText = document.getElementById("minimap-nav-dist").textContent;
      const navText = document.getElementById("minimap-nav-text").textContent;

      // 5. Test clearing nav target when entering kitchen
      mm.clearNavTarget("kitchen");
      const isNavCleared = (mm.getNavTarget() === null) && navEl.classList.contains("hidden");

      // 6. Test minimap rendering update without crashing
      mm.update(0.016);

      return {
        ok: isBannerCompact && hasNavTarget && isNavVisible && isNavCleared,
        bannerTop,
        bannerFontSize,
        isBannerCompact,
        initialRoom,
        initialTitle,
        hasNavTarget,
        isNavVisible,
        navDistText,
        navText,
        isNavCleared
      };
    });

    console.log("Minimap Test Result:", JSON.stringify(testResult, null, 2));

    if (errors.length > 0) {
      console.error("Page errors detected:", errors);
    }

    if (!testResult.ok || errors.length > 0) {
      console.error("Minimap test failed!");
      await browser.close();
      process.exit(1);
    }

    console.log("ALL MINIMAP TESTS PASSED!");
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error("Test error:", err);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
