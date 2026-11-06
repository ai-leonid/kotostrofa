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
  await new Promise(r => setTimeout(r, 1200));

  const tvData = await page.evaluate(() => {
    const K = window.KOTO;
    const tv = K.propsSys.props.find(p => p.name === "телевизор");
    if (!tv) return null;
    const screenMesh = tv.mesh.children.find(c => c.geometry && c.geometry.type === "PlaneGeometry");
    const mat = screenMesh ? screenMesh.material : null;
    return {
      hasTv: true,
      hasTexture: !!(mat && mat.map),
      textureWidth: mat && mat.map && mat.map.image ? mat.map.image.width : 0,
      textureHeight: mat && mat.map && mat.map.image ? mat.map.image.height : 0,
      emissiveIntensity: mat ? mat.emissiveIntensity : 0
    };
  });

  console.log("TV Data:", JSON.stringify(tvData, null, 2));

  // Поворачиваем камеру на телевизор и делаем скриншот
  await page.evaluate(() => {
    const K = window.KOTO;
    if (K.game && K.game.camera) {
      // Телевизор на (-2.0, 0.76, 0.9), смотрим спереди от (-3.8, 0.9, 0.9)
      K.game.camera.position.set(-3.6, 0.85, 0.9);
      K.game.camera.lookAt(-2.0, 0.76, 0.9);
    }
  });
  await new Promise(r => setTimeout(r, 300));

  const shotPath = path.resolve(__dirname, "../test_tv_view.png");
  await page.screenshot({ path: shotPath });
  console.log("Screenshot of TV saved to", shotPath);

  // Тестируем разбитие телевизора: проверяем, что он НЕ исчезает!
  const breakResult = await page.evaluate(() => {
    const K = window.KOTO;
    const tv = K.propsSys.props.find(p => p.name === "телевизор");
    // Вызываем сильный удар (разбитие)
    K.game.onPropImpact(tv, 4.0, false);
    return {
      broken: tv.broken,
      meshInScene: !!tv.mesh.parent,
      bodyInWorld: !!tv.body.world,
      keepMeshOnBreak: tv.keepMeshOnBreak
    };
  });

  console.log("TV Break Result:", JSON.stringify(breakResult, null, 2));

  await browser.close();

  if (!breakResult.broken) {
    throw new Error("TV did not break!");
  }
  if (!breakResult.meshInScene) {
    throw new Error("TV mesh vanished from scene on break! It must remain in the world.");
  }
  if (!breakResult.bodyInWorld) {
    throw new Error("TV body vanished from world on break! It must remain in physics world.");
  }

  console.log("TV BREAK (KEEP MESH ON BREAK) TEST PASSED!");

  if (!tvData || !tvData.hasTexture || tvData.textureWidth !== 320) {
    throw new Error("TV procedural texture not initialized properly!");
  }
  console.log("TV PROCEDURAL CARTOON TEST PASSED!");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
