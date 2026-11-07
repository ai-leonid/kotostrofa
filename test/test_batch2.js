const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1500));

  const report = await page.evaluate(async () => {
    const K = window.KOTO;
    const vacuum = K.propsSys.vacuum;
    const props = K.propsSys.props;
    const scene = K.scene || (K.cat && K.cat.mesh ? K.cat.mesh.parent : null);

    // 1. Vacuum depthTest check
    const vacMesh = vacuum.mesh;
    let hpBgDepthTest = null;
    let hpFillDepthTest = null;
    let hpLabelDepthTest = null;
    let badgeDepthTest = null;

    vacMesh.traverse((child) => {
      if (child.name === 'vacHpBg' && child.material) hpBgDepthTest = child.material.depthTest;
      if (child.name === 'vacHpFill' && child.material) hpFillDepthTest = child.material.depthTest;
      if (child.name === 'vacHpLabel' && child.material) hpLabelDepthTest = child.material.depthTest;
      if (child.name === 'vacBrokenBadge' && child.material) badgeDepthTest = child.material.depthTest;
    });

    // 2. Vacuum TV stand obstacle check
    const canDriveIntoTvStand = K.propsSys.canVacuumMove(-2.0, 0.9);
    const canDriveInLivingRoomCenter = K.propsSys.canVacuumMove(-4.0, 0.0);
    const canDriveUnderCoffeeTable = K.propsSys.canVacuumMove(-4.3, 0.9);

    // 3. Coffee table blocker check
    let tableBlockerFound = false;
    let blockerY = 0;
    let blockerHeight = 0;
    scene.traverse((obj) => {
      if (obj.isMesh && obj.geometry && obj.geometry.type === 'BoxGeometry') {
        const p = obj.position;
        if (Math.abs(p.x - (-4.3)) < 0.1 && Math.abs(p.z - 0.9) < 0.1 && p.y > 0.15 && p.y < 0.40) {
          tableBlockerFound = true;
          blockerY = p.y;
          blockerHeight = obj.geometry.parameters.height;
        }
      }
    });

    // 4. Redesigned clock check
    const clockProp = props.find(p => p.name === 'часы');
    const clockGroup = clockProp ? clockProp.mesh : null;
    let clockChildrenCount = clockGroup ? clockGroup.children.length : 0;
    let clockPos = clockProp ? { x: clockProp.body.position.x, y: clockProp.body.position.y, z: clockProp.body.position.z } : null;

    // 5. Kitchen aquarium check
    const aqua = props.find(p => p.name === 'аквариум');
    const aquaShape = aqua && aqua.body.shapes[0];
    const aquaRadius = aquaShape ? aquaShape.radius : 0;
    const aquaMass = aqua ? aqua.body.mass : 0;
    const aquaPos = aqua ? { x: aqua.body.position.x, y: aqua.body.position.y, z: aqua.body.position.z } : null;

    return {
      issue1_hpBarDepthTest: {
        hpBgDepthTest,
        hpFillDepthTest,
        hpLabelDepthTest,
        badgeDepthTest,
        pass: hpBgDepthTest === true && hpFillDepthTest === true && hpLabelDepthTest === true && badgeDepthTest === true
      },
      issue2_vacuumTvStand: {
        canDriveIntoTvStand,
        canDriveInLivingRoomCenter,
        canDriveUnderCoffeeTable,
        pass: canDriveIntoTvStand === false && canDriveInLivingRoomCenter === true && canDriveUnderCoffeeTable === true
      },
      issue3_coffeeTableBlocker: {
        tableBlockerFound,
        blockerY,
        blockerHeight,
        clearanceUnderTable: blockerY - blockerHeight / 2,
        pass: tableBlockerFound && (blockerY - blockerHeight / 2) >= 0.14
      },
      issue4_redesignedClock: {
        exists: !!clockProp,
        childrenCount: clockChildrenCount,
        clockPos,
        pass: !!clockProp && clockChildrenCount >= 6 && Math.abs(clockPos.x - (-4.5)) < 0.1
      },
      issue5_enlargedAquarium: {
        exists: !!aqua,
        radius: aquaRadius,
        mass: aquaMass,
        pos: aquaPos,
        pass: !!aqua && Math.abs(aquaRadius - 0.28) < 0.01 && aquaMass === 1.4
      }
    };
  });

  console.log('BATCH 2 STATIC CHECKS REPORT:');
  console.log(JSON.stringify(report, null, 2));

  const allPass =
    report.issue1_hpBarDepthTest.pass &&
    report.issue2_vacuumTvStand.pass &&
    report.issue3_coffeeTableBlocker.pass &&
    report.issue4_redesignedClock.pass &&
    report.issue5_enlargedAquarium.pass;

  if (!allPass) {
    console.error('>>> SOME BATCH 2 CHECKS FAILED! <<<');
    process.exit(1);
  }

  // 6. Test cat purr & portrait update when idle
  const purrReport = await page.evaluate(async () => {
    const K = window.KOTO;
    let purrCount = 0;
    let lastPurrVol = 0;
    const origPurr = K.audio.purr;
    K.audio.purr = function(vol) {
      purrCount++;
      lastPurrVol = vol;
      if (origPurr) origPurr.apply(this, arguments);
    };

    // Ensure game is running in play mode
    if (K.game.state.mode !== 'play') {
      K.game.start();
    }

    // Place cat away from vacuum patrol so it rests undisturbed
    K.cat.body.position.set(-5.0, 0.22, 1.0);
    K.cat.body.velocity.set(0, 0, 0);

    // Verify 8.0s threshold: at 5.0s idle it should NOT trigger yet
    K.setIdleStillTimer(5.0);
    await new Promise(r => setTimeout(r, 300));
    const purrAt5s = purrCount;

    // Fast-forward to 7.85s, and wait for 8.0s boundary
    K.setIdleStillTimer(7.85);
    await new Promise(r => setTimeout(r, 400));

    return {
      purrAt5s,
      purrCount,
      lastPurrVol,
      catPortraitValid: !!document.getElementById('hud-cat-portrait')
    };
  });

  console.log('PURR DYNAMIC SIMULATION REPORT:', JSON.stringify(purrReport, null, 2));
  if (purrReport.purrAt5s === 0 && purrReport.purrCount > 0 && purrReport.lastPurrVol <= 0.20) {
    console.log('>>> PURR AUDIO TRIGGER & 8.0s THRESHOLD & SOFT VOLUME VERIFIED SUCCESSFULLY! <<<');
  } else {
    console.error('>>> PURR AUDIO VERIFICATION FAILED! <<<', purrReport);
    process.exit(1);
  }

  console.log('>>> ALL 6 BATCH-2 BUGS FULLY VERIFIED AND PASSING! <<<');
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
