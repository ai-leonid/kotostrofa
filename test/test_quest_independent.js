const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");

async function main() {
  console.log("=== STARTING INDEPENDENT QUEST STEPS TEST ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(BASE + "?autostart=1&t=90");
  await new Promise(r => setTimeout(r, 1200));

  // TEST 1: Scratch the sofa FIRST (Step 3 in the quest list)
  const step3Result = await page.evaluate(() => {
    const K = window.KOTO;
    const cat = K.cat;
    // Position cat right next to sofa
    cat.body.position.set(-6.2, 0.25, 0.9);
    K.game.trySwipe();

    const q = K.game.state.quests.art;
    return {
      sofaScratched: q.sofaScratched,
      completedSteps: q.completedSteps,
      isStep2Done: !!(q.completedSteps && q.completedSteps[2]),
      questDone: q.done
    };
  });
  console.log("1. Step 3 (Scratch Sofa first) check:", step3Result);
  if (!step3Result.sofaScratched || !step3Result.isStep2Done) {
    throw new Error("Sofa scratch failed to count as independent step!");
  }

  // TEST 1.5: Hitting the lamp while standing upright must NOT count as knocked over!
  const standingHitCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const lamp = K.propsSys.props.find(p => p.name === "торшер");
    // Ensure lamp is upright
    lamp.body.position.set(-6.5, 0.82, -3.9);
    lamp.body.quaternion.set(0, 0, 0, 1);
    // Hit the lamp with high velocity impact (breaks bulb, but lamp is still upright)
    K.game.onPropImpact(lamp, 3.5);
    K.game.update(0.016);

    const q = K.game.state.quests.art;
    return {
      lampBroken: lamp.broken,
      isUpright: lamp.body.position.y > 0.8,
      lampKnocked: !!q.lampKnocked
    };
  });
  console.log("1.5. Standing hit check (must NOT count):", standingHitCheck);
  if (standingHitCheck.lampKnocked) {
    throw new Error("Floor lamp counted as knocked over from just a hit while standing upright!");
  }

  // TEST 2: Knock down floor lamp to actually lie on its side (Step 2 in the quest list)
  const step2Result = await page.evaluate(() => {
    const K = window.KOTO;
    const lamp = K.propsSys.props.find(p => p.name === "торшер");
    // Simulate floor lamp actually falling and lying flat on its side on the floor
    lamp.body.position.set(-6.5, 0.20, -3.9);
    lamp.body.quaternion.set(0.707, 0, 0, 0.707); // 90 degrees horizontal tilt
    // Trigger update/questChecks
    K.game.update(0.016);

    const q = K.game.state.quests.art;
    return {
      lampKnocked: q.lampKnocked,
      completedSteps: q.completedSteps,
      isStep1Done: !!(q.completedSteps && q.completedSteps[1]),
      questDone: q.done
    };
  });
  console.log("2. Step 2 (Floor Lamp second) check:", step2Result);
  if (!step2Result.lampKnocked || !step2Result.isStep1Done) {
    throw new Error("Floor lamp failed to count as independent step!");
  }

  // Check HUD rendering for independent step checkmarks
  const hudCheck = await page.evaluate(() => {
    const steps = Array.from(document.querySelectorAll(".hud-quest-steps li"));
    return steps.map(li => ({
      text: li.textContent,
      className: li.className
    }));
  });
  console.log("3. HUD steps classes:", hudCheck);
  // Step 0 should not be done, Step 1 should be done, Step 2 should be done
  if (!hudCheck[1].className.includes("done") || !hudCheck[2].className.includes("done")) {
    throw new Error("HUD does not show independent steps as done!");
  }

  // TEST 3: Drop painting LAST (Step 1 in the quest list)
  const step1Result = await page.evaluate(() => {
    const K = window.KOTO;
    const painting = K.propsSys.hangProps.find(p => p.room === "living" && p.name === "картину");
    K.game.releaseHang(painting);
    K.game.update(0.016);

    const q = K.game.state.quests.art;
    return {
      hangDown: q.hangDown,
      completedCount: Object.keys(q.completedSteps).length,
      questDone: q.done
    };
  });
  console.log("4. Step 1 (Painting last) check:", step1Result);
  if (!step1Result.hangDown || !step1Result.questDone) {
    throw new Error("Quest failed to complete after all independent steps finished!");
  }

  await browser.close();
  console.log(">>> INDEPENDENT QUEST PROGRESSION VERIFIED SUCCESSFULLY! <<<");
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
