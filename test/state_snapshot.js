"use strict";
// Stage 3.2: GameState как сериализуемый снапшот (toJSON / fromJSON)
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

  await page.goto(h.BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 2000));

  const result = await page.evaluate(function () {
    // 1. Изменяем состояние игры
    KOTO.game.state.score = 42500;
    KOTO.game.state.combo = 15;
    KOTO.game.state.maxCombo = 25;
    KOTO.game.state.timeLeft = 33.5;
    KOTO.game.state.room = "kitchen";
    KOTO.game.state.progress.living = 18000;
    KOTO.game.state.progress.kitchen = 24500;
    KOTO.game.state.level.idx = 1;
    KOTO.game.state.level.done = ["living"];
    KOTO.game.state.quests.art.done = true;
    KOTO.game.state.quests.art.step = 3;

    // 2. Делаем снапшот через toJSON()
    const jsonStr = KOTO.game.toJSON();
    const parsed = JSON.parse(jsonStr);

    // 3. Проверяем, что снапшот чистый (сериализуемый, без функций и DOM)
    const hasDomOrFn = typeof parsed.mode !== "string" ||
      typeof parsed.score !== "number" ||
      parsed.refs !== undefined ||
      parsed.els !== undefined ||
      typeof parsed.quests.art.step !== "number";

    // 4. Сбрасываем текущее состояние на дефолт
    KOTO.game.state.score = 0;
    KOTO.game.state.combo = 0;
    KOTO.game.state.room = "living";
    KOTO.game.state.quests.art.done = false;

    // 5. Восстанавливаем из JSON
    KOTO.game.fromJSON(jsonStr);

    const restoredState = {
      score: KOTO.game.state.score,
      combo: KOTO.game.state.combo,
      maxCombo: KOTO.game.state.maxCombo,
      timeLeft: KOTO.game.state.timeLeft,
      room: KOTO.game.state.room,
      livingDone: KOTO.game.state.level.done.indexOf("living") >= 0,
      artDone: KOTO.game.state.quests.art.done,
      artStep: KOTO.game.state.quests.art.step
    };

    return {
      hasDomOrFn: hasDomOrFn,
      parsedScore: parsed.score,
      parsedRoom: parsed.room,
      restored: restoredState
    };
  });

  console.log("Snapshot test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.hasDomOrFn === false &&
    result.parsedScore === 42500 &&
    result.parsedRoom === "kitchen" &&
    result.restored.score === 42500 &&
    result.restored.combo === 15 &&
    result.restored.maxCombo === 25 &&
    result.restored.room === "kitchen" &&
    result.restored.livingDone === true &&
    result.restored.artDone === true &&
    result.restored.artStep === 3 &&
    errors.length === 0;

  if (!ok) console.log("State snapshot serialization test failed!", result, "errors:", errors);
  console.log(ok ? "STATE SNAPSHOT OK" : "STATE SNAPSHOT FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
