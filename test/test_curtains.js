const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1200));

  // 1. Проверяем наличие двух интерактивных гардин в гостиной
  const initialCheck = await page.evaluate(() => {
    const K = window.KOTO;
    const curtains = K.propsSys.props.filter(p => p.name === "карниз со шторами");
    return {
      count: curtains.length,
      positions: curtains.map(c => ({
        x: c.body.position.x,
        y: c.body.position.y,
        z: c.body.position.z,
        released: c.released,
        type: c.body.type
      }))
    };
  });

  console.log("INITIAL CHECK:", JSON.stringify(initialCheck, null, 2));
  if (initialCheck.count !== 2) {
    throw new Error(`Expected 2 curtains in living room, found ${initialCheck.count}`);
  }

  // 2. Удар по ЛЕВОЙ гардине (-5.4)
  const leftHit = await page.evaluate(async () => {
    const K = window.KOTO;
    const leftCurtain = K.propsSys.props.find(p => p.name === "карниз со шторами" && Math.abs(p.body.position.x - (-5.4)) < 0.5);
    K.cat.body.position.set(-5.4, 0.2, -3.5);
    K.cat.yaw = Math.PI;
    K.game.trySwipe();
    // Отводим кота назад, чтобы падающий карниз не упал ему на голову
    K.cat.body.position.set(-5.4, 0.2, -2.0);
    return {
      released: leftCurtain.released,
      score: K.game.state.score
    };
  });
  console.log("LEFT HIT:", leftHit);
  if (!leftHit.released) {
    throw new Error("Left curtain failed to release on swipe!");
  }

  // Ждём 1.5 сек падения левой гардины
  await new Promise(r => setTimeout(r, 1500));

  const leftFallState = await page.evaluate(() => {
    const K = window.KOTO;
    const leftCurtain = K.propsSys.props.find(p => p.name === "карниз со шторами" && Math.abs(p.initialPosition.x - (-5.4)) < 0.5);
    return {
      y: leftCurtain.body.position.y,
      z: leftCurtain.body.position.z,
      meshY: leftCurtain.mesh.position.y
    };
  });
  console.log("LEFT FALL STATE:", leftFallState);
  if (leftFallState.y > 0.8) {
    throw new Error(`Left curtain did not fall to the floor! y=${leftFallState.y}`);
  }

  // 3. Удар по ПРАВОЙ гардине (-3.4)
  const rightHit = await page.evaluate(async () => {
    const K = window.KOTO;
    const rightCurtain = K.propsSys.props.find(p => p.name === "карниз со шторами" && Math.abs(p.body.position.x - (-3.4)) < 0.5);
    K.cat.body.position.set(-3.4, 0.2, -3.5);
    K.cat.yaw = Math.PI;
    K.game.trySwipe();
    // Отводим кота назад
    K.cat.body.position.set(-3.4, 0.2, -2.0);
    return {
      released: rightCurtain.released,
      score: K.game.state.score
    };
  });
  console.log("RIGHT HIT:", rightHit);
  if (!rightHit.released) {
    throw new Error("Right curtain failed to release on swipe!");
  }

  // Ждём 1.5 сек падения правой гардины
  await new Promise(r => setTimeout(r, 1500));

  const rightFallState = await page.evaluate(() => {
    const K = window.KOTO;
    const rightCurtain = K.propsSys.props.find(p => p.name === "карниз со шторами" && Math.abs(p.initialPosition.x - (-3.4)) < 0.5);
    return {
      y: rightCurtain.body.position.y,
      z: rightCurtain.body.position.z,
      meshY: rightCurtain.mesh.position.y
    };
  });
  console.log("RIGHT FALL STATE:", rightFallState);
  if (rightFallState.y > 0.8) {
    throw new Error(`Right curtain did not fall to the floor! y=${rightFallState.y}`);
  }

  // 4. Проверяем рестарт (сброс обеих гардин обратно на стену)
  await page.evaluate(() => {
    window.KOTO.propsSys.resetProps();
  });
  await new Promise(r => setTimeout(r, 200));

  const resetState = await page.evaluate(() => {
    const K = window.KOTO;
    const curtains = K.propsSys.props.filter(p => p.name === "карниз со шторами");
    return curtains.map(c => ({
      x: c.body.position.x,
      y: c.body.position.y,
      type: c.body.type,
      released: c.released,
      scored: c.scored
    }));
  });
  console.log("RESET STATE:", JSON.stringify(resetState, null, 2));

  for (const c of resetState) {
    if (c.released || c.scored || c.y < 1.4 || c.type !== 4) {
      throw new Error(`Curtain at x=${c.x} failed to reset properly!`);
    }
  }

  console.log("ALL CURTAIN TESTS PASSED!");
  await browser.close();
}

main().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
