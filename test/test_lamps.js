const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");
const path = require("path");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err));

  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 2000));

  const data = await page.evaluate(() => {
    const K = window.KOTO;
    const lamp = K.propsSys.props.find(p => p.name === "торшер");
    const bedLamp = K.propsSys.props.find(p => p.name === "лампу");

    const lampBaseWorld = new window.THREE.Vector3();
    lamp.mesh.children[0].getWorldPosition(lampBaseWorld);

    const lampShadeWorld = new window.THREE.Vector3();
    lamp.mesh.children[2].getWorldPosition(lampShadeWorld);

    const scene = lamp.mesh.parent;

    // Ищем потолочные светильники в scene
    let fixturesCount = 0;
    scene.traverse(o => {
      if (o.isMesh && o.position.y > 2.0 && o.position.y <= 2.7) {
        fixturesCount++;
      }
    });

    return {
      lamp: {
        bodyY: lamp.body.position.y,
        meshY: lamp.mesh.position.y,
        baseY: lampBaseWorld.y,
        shadeY: lampShadeWorld.y
      },
      bedLamp: {
        bodyY: bedLamp.body.position.y,
        meshY: bedLamp.mesh.position.y
      },
      fixturesCount
    };
  });

  console.log("Inspection Data:", JSON.stringify(data, null, 2));

  // Take screenshot
  const screenshotPath = path.resolve(__dirname, "../test_living_view.png");
  await page.screenshot({ path: screenshotPath });
  console.log("Screenshot saved to", screenshotPath);

  // Проверяем опрокидывание торшера
  const knockResult = await page.evaluate(() => {
    const K = window.KOTO;
    const lamp = K.propsSys.props.find(p => p.name === "торшер");
    // Толкаем торшер
    lamp.body.applyImpulse(new window.CANNON.Vec3(4.5, 1.0, 0), new window.CANNON.Vec3(0, 0.6, 0));
    lamp.body.wakeUp();
  });
  await new Promise(r => setTimeout(r, 800));

  const afterKnock = await page.evaluate(() => {
    const K = window.KOTO;
    const lamp = K.propsSys.props.find(p => p.name === "торшер");
    const light = lamp.mesh.children.find(c => c.isPointLight);
    const q = K.game.state ? K.game.state.quests.artCritic : null;
    return {
      lampQuatY: lamp.body.quaternion.y,
      lightIntensity: light ? light.intensity : -1,
      lampKnockedQuest: q ? q.lampKnocked : null
    };
  });
  console.log("After knock:", JSON.stringify(afterKnock, null, 2));

  await browser.close();

  if (data.lamp.baseY > 0.1) {
    throw new Error("Floor lamp base is still floating! baseY: " + data.lamp.baseY);
  }
  if (data.fixturesCount < 10) {
    throw new Error("Ceiling fixtures not found or too few meshes! count: " + data.fixturesCount);
  }
  console.log("TEST LAMPS & FIXTURES PASSED!");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
