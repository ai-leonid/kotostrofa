"use strict";
// Stage 3.3: Unit test for InputManager (KeyboardInputManager and RemoteInputManager)
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

  await page.goto(h.BASE);
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(function () {
    const input = KOTO.input;
    if (!input) return { err: "no input manager" };

    const initial = Object.assign({}, input.getInput());

    // 1. Имитируем нажатие клавиши W
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    const afterW = Object.assign({}, input.getInput());

    // 2. Имитируем нажатие Space (jump)
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    const afterSpace = Object.assign({}, input.getInput());

    // 3. Сбрасываем прыжок через consumeJump()
    input.consumeJump();
    const afterConsume = Object.assign({}, input.getInput());

    // 4. Отпускаем W
    document.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
    const afterWUp = Object.assign({}, input.getInput());

    return {
      initial: initial,
      afterW: afterW,
      afterSpace: afterSpace,
      afterConsume: afterConsume,
      afterWUp: afterWUp
    };
  });

  console.log("Input manager test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.initial.f === false &&
    result.afterW.f === true &&
    result.afterSpace.jump === true &&
    result.afterConsume.jump === false &&
    result.afterWUp.f === false &&
    errors.length === 0;

  if (!ok) console.log("Input manager test failed!", result, "errors:", errors);
  console.log(ok ? "INPUT MANAGER OK" : "INPUT MANAGER FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
