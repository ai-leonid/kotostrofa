"use strict";
// Stage 3.3: Unit test for EventBus (mitt)
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
    const bus = KOTO.bus;
    if (!bus) return { err: "no bus found" };

    const received = [];
    function handler1(ev) {
      received.push({ handler: 1, ev: ev });
    }
    function handler2(ev) {
      received.push({ handler: 2, ev: ev });
    }

    // 1. Подписываемся на prop:break
    bus.on("prop:break", handler1);
    bus.on("prop:break", handler2);

    // 2. Эмитим событие
    bus.emit("prop:break", { prop: { name: "test_vase" } });

    const countAfterEmit1 = received.length;

    // 3. Отписываем handler2
    bus.off("prop:break", handler2);

    // 4. Эмитим снова
    bus.emit("prop:break", { prop: { name: "test_plate" } });

    const countAfterEmit2 = received.length;

    // 5. Отписываем handler1
    bus.off("prop:break", handler1);
    bus.emit("prop:break", { prop: { name: "test_cup" } });

    const countAfterEmit3 = received.length;

    return {
      countAfterEmit1: countAfterEmit1, // должно быть 2 (handler 1 и 2)
      countAfterEmit2: countAfterEmit2, // должно быть 3 (+1 от handler 1)
      countAfterEmit3: countAfterEmit3, // должно остаться 3 (все отписаны)
      received: received
    };
  });

  console.log("EventBus test result:", JSON.stringify(result));
  await browser.close();

  const ok =
    result.countAfterEmit1 === 2 &&
    result.countAfterEmit2 === 3 &&
    result.countAfterEmit3 === 3 &&
    result.received[0].ev.prop.name === "test_vase" &&
    result.received[2].ev.prop.name === "test_plate" &&
    errors.length === 0;

  if (!ok) console.log("EventBus test failed!", result, "errors:", errors);
  console.log(ok ? "EVENT BUS OK" : "EVENT BUS FAIL");
  process.exit(ok ? 0 : 1);
})().catch(function (e) {
  console.error("FAIL", e);
  process.exit(1);
});
