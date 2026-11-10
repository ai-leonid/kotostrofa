const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=== STARTING NEW FEATURES TEST ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(BASE + "?autostart=1&t=50");
  await new Promise(r => setTimeout(r, 1200));

  // 1. Audio synthesizers verification
  const audioCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const a = K.audio;
    return {
      hasOwnerFootsteps: typeof a.ownerFootsteps === 'function',
      hasKeyInLock: typeof a.keyInLock === 'function',
      hasDoorOpenSlam: typeof a.doorOpenSlam === 'function',
      hasSquelchPaw: typeof a.squelchPaw === 'function',
      hasCardboardRip: typeof a.cardboardRip === 'function'
    };
  });
  console.log("1. Audio synthesizers check:", audioCheck);
  if (!Object.values(audioCheck).every(Boolean)) {
    throw new Error("Missing audio synthesizers!");
  }

  // 2. Cardboard boxes existence & properties
  const boxesCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const props = K.propsSys.props;
    const boxes = props.filter(p => p.name && p.name.includes("коробк"));
    return {
      count: boxes.length,
      names: boxes.map(b => b.name),
      values: boxes.map(b => b.value),
      positions: boxes.map(b => ({
        x: Math.round(b.body.position.x * 10) / 10,
        z: Math.round(b.body.position.z * 10) / 10
      }))
    };
  });
  console.log("2. Cardboard boxes check:", boxesCheck);
  if (boxesCheck.count < 3) {
    throw new Error(`Expected at least 3 boxes, got ${boxesCheck.count}`);
  }

  // 3. Cat in box stealth & vacuum protection
  const stealthCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const cat = K.cat;
    const vacuum = K.propsSys.vacuum;
    const props = K.propsSys.props;
    const livingBox = props.find(p => p.name === "картонную коробку");

    // Teleport cat inside box
    const bp = livingBox.body.position;
    cat.body.position.set(bp.x, bp.y + 0.05, bp.z);
    cat.body.velocity.set(0, 0, 0);

    // Update props system
    K.propsSys.update(0.016);

    const isInBox = !!K.catInBox;

    // Simulate vacuum right on top of cat
    vacuum.pos.x = bp.x;
    vacuum.pos.z = bp.z;
    vacuum.scareCd = 0;
    const prevScaredT = cat.scaredT;

    // Trigger vacuum update check
    K.propsSys.update(0.016);

    const scareSuppressed = (cat.scaredT === prevScaredT);

    return {
      isInBox,
      scareSuppressed
    };
  });
  console.log("3. Stealth and vacuum suppression check:", stealthCheck);
  if (!stealthCheck.isInBox || !stealthCheck.scareSuppressed) {
    throw new Error("Stealth inside box failed!");
  }

  // 4. Box destruction & scraps
  const boxDestructionCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const props = K.propsSys.props;
    const livingBox = props.find(p => p.name === "картонную коробку");
    const scoreBefore = K.game.state.score;
    const transientsBefore = K.propsSys.transients.length;

    // Impact box
    K.game.onPropImpact(livingBox, 4.0);

    return {
      broken: livingBox.broken,
      scoreGained: K.game.state.score - scoreBefore,
      scrapsSpawned: K.propsSys.transients.length > transientsBefore
    };
  });
  console.log("4. Box destruction check:", boxDestructionCheck);
  if (!boxDestructionCheck.broken || boxDestructionCheck.scoreGained < 400 || !boxDestructionCheck.scrapsSpawned) {
    throw new Error("Box destruction failed!");
  }

  // 5. Wet paws & paw prints after puddles
  const wetPawsCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const cat = K.cat;
    const puddle = K.propsSys.puddles[0];
    const scoreBefore = K.game.state.score;
    const transientsBefore = K.propsSys.transients.length;

    // Put cat in puddle
    cat.body.position.set(puddle.x, 0.05, puddle.z);
    cat.update(0.016, { f: false, b: false, l: false, r: false, run: false, jump: false, swipe: false, meow: false, claw: false, camYaw: 0 });

    const wetTimeAfterPuddle = cat.wetTime;

    // Walk cat while wet to trigger prints
    for (let i = 0; i < 15; i++) {
      cat.update(0.03, { f: true, b: false, l: false, r: false, run: false, jump: false, swipe: false, meow: false, claw: false, camYaw: 0 });
    }

    const pawPrintSpawned = K.propsSys.transients.length > transientsBefore;
    const scoreAfter = K.game.state.score;

    return {
      wetTimeAfterPuddle,
      pawPrintSpawned,
      scoreGained: scoreAfter - scoreBefore
    };
  });
  console.log("5. Wet paw prints check:", wetPawsCheck);
  if (wetPawsCheck.wetTimeAfterPuddle < 10 || !wetPawsCheck.pawPrintSpawned || wetPawsCheck.scoreGained < 50) {
    throw new Error("Wet paw prints check failed!");
  }

  // 6. Countdown suspense (steps and keys audio triggers)
  const countdownCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const state = K.game.state;

    // Simulate countdown stepping through 25s and 8s
    state.timeLeft = 26;
    state.duration = 45;
    state.warnedSteps = false;
    state.warnedKeys = false;

    K.game.update(2.0); // timeLeft becomes 24s -> warnedSteps
    const warnedStepsTriggered = state.warnedSteps;

    state.timeLeft = 9;
    K.game.update(2.0); // timeLeft becomes 7s -> warnedKeys
    const warnedKeysTriggered = state.warnedKeys;

    return {
      warnedStepsTriggered,
      warnedKeysTriggered
    };
  });
  console.log("6. Countdown suspense check:", countdownCheck);
  if (!countdownCheck.warnedStepsTriggered || !countdownCheck.warnedKeysTriggered) {
    throw new Error("Countdown suspense audio triggers failed!");
  }

  // 7. Final screen Newspaper render & Tabs
  const newspaperCheck = await page.evaluate(async () => {
    const K = window.KOTO;
    // Finish game
    K.game.finish(false);

    // Wait for end screen transition
    await new Promise(r => setTimeout(r, 2200));

    const canvas = document.getElementById("newspaper-canvas");
    const tabNewspaper = document.getElementById("tab-newspaper");
    const tabStats = document.getElementById("tab-stats");
    const newspaperView = document.getElementById("newspaper-view");
    const statsView = document.getElementById("stats-view");
    const btnDownload = document.getElementById("btn-download-newspaper");

    const ctx = canvas.getContext("2d");
    const pixel = ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;

    // Test tab toggle
    const initialNewspaperVisible = !newspaperView.classList.contains("hidden");
    const initialStatsHidden = statsView.classList.contains("hidden");

    tabStats.click();
    const statsVisibleAfterClick = !statsView.classList.contains("hidden");
    const newspaperHiddenAfterClick = newspaperView.classList.contains("hidden");

    tabNewspaper.click();
    const newspaperVisibleAgain = !newspaperView.classList.contains("hidden");

    return {
      canvasExists: !!canvas,
      canvasWidth: canvas ? canvas.width : 0,
      canvasHeight: canvas ? canvas.height : 0,
      hasPixelContent: pixel[3] > 0,
      btnDownloadExists: !!btnDownload,
      tabsWork: initialNewspaperVisible && initialStatsHidden && statsVisibleAfterClick && newspaperHiddenAfterClick && newspaperVisibleAgain
    };
  });
  console.log("7. Newspaper & Tabs check:", newspaperCheck);
  if (!newspaperCheck.canvasExists || !newspaperCheck.hasPixelContent || !newspaperCheck.tabsWork) {
    throw new Error("Newspaper or tabs verification failed!");
  }

  // Take screenshot of the newspaper screen
  const shotPath = path.resolve(__dirname, "shot_newspaper.png");
  await page.screenshot({ path: shotPath });
  console.log(`Saved screenshot to ${shotPath}`);

  await browser.close();
  console.log(">>> ALL NEW FEATURES VERIFIED SUCCESSFULLY! <<<");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
