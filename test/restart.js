"use strict";
// Stage 3.1: Перезапуск игры без location.reload()
const puppeteer = require("puppeteer-core");
const h = require("./helpers");

(async function () {
  const browser = await puppeteer.launch({
    executablePath: h.CHROME,
    headless: "new",
    args: ["--disable-gpu", "--use-angle=swiftshader", "--no-first-run", "--mute-audio", "--window-size=1280,800"],
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", function (e) { errors.push(e.message); });

  await page.goto(h.BASE + "?autostart=1&t=10");
  await new Promise(r => setTimeout(r, 2000));

  // 1. Бьём предметы и набираем очки
  const duringGame = await page.evaluate(function () {
    const book = KOTO.propsSys.props.find(p => p.name === "книгу");
    KOTO.bus.emit("prop:impact", { prop: book, velocity: 3.0, isStrike: false });
    KOTO.cat.body.position.set(5, 1, 5); // уводим кота от спавна
    return {
      score: KOTO.game.state.score,
      catPos: { x: KOTO.cat.body.position.x, z: KOTO.cat.body.position.z },
      brokenCount: KOTO.game.state.broken
    };
  });
  console.log("During game:", JSON.stringify(duringGame));

  // 2. Дожидаемся окончания (или принудительно переводим в over)
  await page.evaluate(function () {
    KOTO.game.state.timeLeft = 0.05;
  });
  await new Promise(r => setTimeout(r, 2300)); // 2000мс таймер показа screen-end

  const atGameOver = await page.evaluate(function () {
    return {
      mode: KOTO.game.state.mode,
      endScreenVisible: !document.getElementById("screen-end").classList.contains("hidden")
    };
  });
  console.log("At game over:", JSON.stringify(atGameOver));

  // 3. Нажимаем кнопку перезапуска (НЕ перезагружая страницу!)
  await page.evaluate(function () {
    document.getElementById("btn-restart").click();
  });
  await new Promise(r => setTimeout(r, 1200));

  const afterRestart = await page.evaluate(function () {
    const book = KOTO.propsSys.props.find(p => p.name === "книгу");
    return {
      mode: KOTO.game.state.mode,
      score: KOTO.game.state.score,
      broken: KOTO.game.state.broken,
      timeLeft: KOTO.game.state.timeLeft,
      catPos: { x: KOTO.cat.body.position.x, y: KOTO.cat.body.position.y, z: KOTO.cat.body.position.z },
      bookBroken: book ? book.broken : null,
      endScreenHidden: document.getElementById("screen-end").classList.contains("hidden"),
      hudVisible: !document.getElementById("hud").classList.contains("hidden")
    };
  });
  console.log("After restart:", JSON.stringify(afterRestart));
  await browser.close();

  const ok =
    duringGame.score > 0 &&
    atGameOver.mode === "over" &&
    afterRestart.mode === "play" &&
    afterRestart.score === 0 &&
    afterRestart.broken === 0 &&
    afterRestart.bookBroken === false &&
    afterRestart.endScreenHidden === true &&
    afterRestart.hudVisible === true &&
    Math.abs(afterRestart.catPos.x - (-3.35)) < 0.35 &&
    Math.abs(afterRestart.catPos.z - 1.6) < 0.35 &&
    errors.length === 0;

  if (!ok) console.log("Restart test failed!", "errors:", errors);
  console.log(ok ? "RELOAD-FREE RESTART OK" : "RELOAD-FREE RESTART FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
