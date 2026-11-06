"use strict";
// GP-02: Режим «Ультра-хаос» при КОТОСТРОФА-ранге (комбо 100+)
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
    // 1. Устанавливаем комбо 99
    KOTO.game.state.combo = 99;
    const overlayBefore = !document.getElementById("ultra-chaos-overlay").classList.contains("hidden");

    // 2. Делаем удар, поднимающий комбо до 100
    const book = KOTO.propsSys.props.find(p => p.name === "книгу" && !p.broken);
    KOTO.bus.emit("prop:impact", { prop: book, velocity: 1.8, isStrike: false });

    const activeState = {
      combo: KOTO.game.state.combo,
      ultraChaos: KOTO.game.state.ultraChaos,
      ultraChaosT: KOTO.game.state.ultraChaosT,
      chaosStarMeta: KOTO.game.state.metaQuests.chaosStar,
      overlayVisible: !document.getElementById("ultra-chaos-overlay").classList.contains("hidden"),
      bloomActive: document.body.classList.contains("bloom-active")
    };

    // 3. Проверяем множитель очков в режиме ультра-хаос
    const scoreBeforeBonus = KOTO.game.state.score;
    KOTO.game.addScore(1000);
    const scoreDiff = KOTO.game.state.score - scoreBeforeBonus;

    // 4. Имитируем истечение времени ультра-хаоса
    KOTO.game.state.ultraChaosT = 0.01;
    KOTO.game.update(0.05);

    const endedState = {
      ultraChaos: KOTO.game.state.ultraChaos,
      overlayHidden: document.getElementById("ultra-chaos-overlay").classList.contains("hidden"),
      bloomRemoved: !document.body.classList.contains("bloom-active")
    };

    return {
      overlayBefore: overlayBefore,
      active: activeState,
      scoreDiff: scoreDiff,
      ended: endedState
    };
  });

  console.log("Ultra Chaos test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.overlayBefore === false &&
    result.active.combo >= 100 &&
    result.active.ultraChaos === true &&
    result.active.chaosStarMeta === true &&
    result.active.overlayVisible === true &&
    result.scoreDiff === 1500 && // 1000 * 1.5 = 1500
    result.ended.ultraChaos === false &&
    result.ended.overlayHidden === true &&
    errors.length === 0;

  if (!ok) console.log("Ultra chaos test failed!", result, "errors:", errors);
  console.log(ok ? "ULTRA CHAOS OK" : "ULTRA CHAOS FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
