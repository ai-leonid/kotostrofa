const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err));

  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1000));

  const audioCheck = await page.evaluate(() => {
    const A = window.AudioSys || (window.KOTO && window.KOTO.audio);
    if (!A) return { ok: false, reason: "No AudioSys" };

    if (A.init) A.init();

    const methods = [
      "waterDrip", "tvAudio", "aquariumBubble", "vacuumSputter",
      "clockTick", "purr", "squeak", "softPuff", "metallicClang",
      "plasticClack", "phoneBeep"
    ];

    const results = {};
    for (const m of methods) {
      if (typeof A[m] === "function") {
        try {
          A[m]();
          results[m] = "ok";
        } catch (e) {
          results[m] = "error: " + e.message;
        }
      } else {
        results[m] = "missing";
      }
    }
    return { ok: true, results };
  });

  console.log("Audio check results:", JSON.stringify(audioCheck, null, 2));
  await browser.close();

  for (const [m, res] of Object.entries(audioCheck.results)) {
    if (res !== "ok") {
      throw new Error(`Audio method ${m} failed: ${res}`);
    }
  }

  console.log("ALL AUDIO METHODS VERIFIED AND RUNNING CLEANLY!");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
