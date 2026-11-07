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
  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1200));

  const check = await page.evaluate(async () => {
    const K = window.KOTO;
    const cat = K.cat;

    // Normal open-eye state
    const openState = {
      eyesCount: cat.eyes ? cat.eyes.length : 0,
      glintsCount: cat.glints ? cat.glints.length : 0,
      eyeScales: cat.eyes ? cat.eyes.map(e => e.scale.y) : [],
      glintsVisible: cat.glints ? cat.glints.map(g => g.visible) : []
    };

    // Force blink
    cat.blinkTimer = 0.001;
    // Step update once
    cat.update(0.016, { fwd: 0, strafe: 0, run: false, jump: false, swipe: false, meow: false, claw: false, camYaw: 0 });

    const blinkState = {
      isBlinking: cat.isBlinking,
      eyeScales: cat.eyes ? cat.eyes.map(e => e.scale.y) : [],
      glintsVisible: cat.glints ? cat.glints.map(g => g.visible) : []
    };

    // Finish blink (advance 2x 0.1s steps since dt is capped at 0.1)
    cat.update(0.10, { fwd: 0, strafe: 0, run: false, jump: false, swipe: false, meow: false, claw: false, camYaw: 0 });
    cat.update(0.10, { fwd: 0, strafe: 0, run: false, jump: false, swipe: false, meow: false, claw: false, camYaw: 0 });

    const afterBlinkState = {
      isBlinking: cat.isBlinking,
      eyeScales: cat.eyes ? cat.eyes.map(e => e.scale.y) : [],
      glintsVisible: cat.glints ? cat.glints.map(g => g.visible) : []
    };

    return {
      openState,
      blinkState,
      afterBlinkState
    };
  });

  console.log("CAT EYES BLINK REPORT:", JSON.stringify(check, null, 2));

  // Take screenshot of blinking cat facing camera
  await page.evaluate(() => {
    const K = window.KOTO;
    const cat = K.cat;
    const cp = cat.body.position;

    // Force blinking
    cat.isBlinking = true;
    cat.blinkDuration = 100.0;
    for (let i = 0; i < cat.eyes.length; i++) {
      cat.eyes[i].scale.y = 0.08;
      cat.glints[i].visible = false;
    }

    // Move camera right in front of cat face
    // Cat forward is (sin(cat.yaw), 0, cos(cat.yaw))
    const fx = Math.sin(cat.yaw);
    const fz = Math.cos(cat.yaw);
    cat.yaw = -Math.PI / 2; // turn cat 180 deg to face the default camera
    if (K.cam) {
      K.cam.yaw = -Math.PI / 2;
      K.cam.pitch = 0.12;
      K.cam.dist = 0.95;
      K.cam.smooth.set(cp.x, cp.y + 0.35, cp.z);
    }
  });

  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: "cat_blinking_fixed.png" });

  if (check.openState.glintsVisible.every(v => v === true) &&
      check.blinkState.glintsVisible.every(v => v === false) &&
      check.afterBlinkState.glintsVisible.every(v => v === true)) {
    console.log(">>> CAT EYES BLINK AND GLINT FIX VERIFIED SUCCESSFULLY! <<<");
  } else {
    console.error(">>> CAT EYES VERIFICATION FAILED! <<<");
    process.exit(1);
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
