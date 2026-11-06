"use strict";
// BUG-03: Двойное начисление очков при multihit за один Physics Step / Frame
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

  // Тестируем multihit в рамках одного кадра
  const result = await page.evaluate(function () {
    const book = KOTO.propsSys.props.find(function (p) { return p.name === "книгу" && !p.broken; });
    if (!book) return { err: "no book found" };

    const scoreBefore = KOTO.game.state.score;
    const initialHits = book.repeatHits || 0;

    // Имитируем два столкновения за один физический кадр
    KOTO.bus.emit("prop:impact", { prop: book, velocity: 1.8, isStrike: false });
    const scoreAfterFirst = KOTO.game.state.score;

    KOTO.bus.emit("prop:impact", { prop: book, velocity: 1.8, isStrike: false });
    const scoreAfterSecond = KOTO.game.state.score;

    return {
      scoreBefore: scoreBefore,
      scoreAfterFirst: scoreAfterFirst,
      scoreAfterSecond: scoreAfterSecond,
      diffFirst: scoreAfterFirst - scoreBefore,
      diffSecond: scoreAfterSecond - scoreAfterFirst
    };
  });

  console.log("Scoring integrity result:", JSON.stringify(result));
  await browser.close();

  const ok = result.diffFirst > 0 && result.diffSecond === 0 && errors.length === 0;
  if (!ok) console.log("Multihit double scoring detected!", result, "errors:", errors);
  console.log(ok ? "SCORING INTEGRITY OK" : "SCORING INTEGRITY FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
