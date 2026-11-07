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

  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err));

  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1200));

  // 1. Изменяем/разрушаем различные состояния в игре
  const messReport = await page.evaluate(() => {
    const K = window.KOTO;
    const hangProps = K.propsSys.hangProps;
    
    // Срываем все картины и карниз
    hangProps.forEach(p => {
      p.released = true;
      p.body.type = 1; // CANNON.Body.DYNAMIC
      p.body.position.y = 0.1;
      p.body.wakeUp();
    });

    // Открываем холодильник
    if (K.propsSys.fridge) {
      K.propsSys.fridge.open();
    }

    // Ломаем робот-пылесос
    if (K.propsSys.vacuum) {
      K.propsSys.vacuum.break();
    }

    // Ломаем телевизор
    const tv = K.propsSys.props.find(p => p.name === "телевизор");
    if (tv) {
      K.game.onPropImpact(tv, 5.0, false);
    }

    // Разливаем миску с водой и рассыпаем корм
    const waterBowl = K.propsSys.props.find(p => p.name === "миску с водой");
    if (waterBowl) {
      K.game.onPropImpact(waterBowl, 2.0, false);
    }
    const foodBowl = K.propsSys.props.find(p => p.name === "миску с кормом");
    if (foodBowl) {
      K.game.onPropImpact(foodBowl, 2.0, false);
    }

    return {
      hangCount: hangProps.length,
      allHangReleased: hangProps.every(p => p.released),
      fridgeOpened: K.propsSys.fridge.opened,
      vacBroken: K.propsSys.vacuum.broken,
      tvBroken: tv ? tv.broken : false,
      waterSpilled: waterBowl ? waterBowl._spilled : false,
      propsCountBeforeRestart: K.propsSys.props.length
    };
  });

  console.log("Mess Report before restart:", JSON.stringify(messReport, null, 2));

  // 2. Имитируем клик по кнопке "НАТВОРИТЬ ЕЩЁ" (или вызов game.start)
  await page.evaluate(() => {
    const btn = document.getElementById("btn-restart");
    if (btn) {
      btn.click();
    } else {
      window.KOTO.game.start(60);
    }
  });

  await new Promise(r => setTimeout(r, 600));

  // 3. Проверяем полное восстановление всех состояний
  const resetReport = await page.evaluate(() => {
    const K = window.KOTO;
    const hangProps = K.propsSys.hangProps;

    const allHangRestored = hangProps.every(p => {
      const isKinematic = p.body.type === 4; // CANNON.Body.KINEMATIC
      const notReleased = p.released === false;
      const notScored = p.scored === false;
      const posY = p.body.position.y;
      const meshY = p.mesh.position.y;
      // Все картины висят выше 1.4м
      return isKinematic && notReleased && notScored && posY > 1.4 && meshY > 1.4;
    });

    const tv = K.propsSys.props.find(p => p.name === "телевизор");
    const waterBowl = K.propsSys.props.find(p => p.name === "миску с водой");
    const foodBowl = K.propsSys.props.find(p => p.name === "миску с кормом");

    return {
      allHangRestored: allHangRestored,
      hangDetails: hangProps.map(p => ({
        name: p.name,
        released: p.released,
        type: p.body.type,
        y: p.body.position.y,
        meshY: p.mesh.position.y
      })),
      fridgeClosed: !K.propsSys.fridge.opened && K.propsSys.fridge.openAngle === 0,
      vacReset: !K.propsSys.vacuum.broken && K.propsSys.vacuum.hp === 100,
      tvReset: tv && !tv.broken && tv.body.position.y > 0.6,
      waterBowlReset: waterBowl && !waterBowl._spilled,
      foodBowlReset: foodBowl && !foodBowl._scattered,
      puddlesReset: K.propsSys.puddles.length === 1,
      fishReset: !K.propsSys.fish.alive
    };
  });

  console.log("Reset Report after restart:", JSON.stringify(resetReport, null, 2));

  await browser.close();

  if (!resetReport.allHangRestored) {
    throw new Error("Hanging props (pictures/curtains) failed to reset to wall!");
  }
  if (!resetReport.fridgeClosed) {
    throw new Error("Fridge failed to close on restart!");
  }
  if (!resetReport.vacReset) {
    throw new Error("Vacuum failed to reset on restart!");
  }
  if (!resetReport.tvReset) {
    throw new Error("TV failed to reset on restart!");
  }
  if (!resetReport.waterBowlReset || !resetReport.foodBowlReset) {
    throw new Error("Bowls spilled/scattered flags failed to reset!");
  }
  if (!resetReport.puddlesReset) {
    throw new Error("Puddles failed to reset!");
  }

  console.log("ALL RESTART TESTS PASSED SUCCESSFULLY!");
}

main().catch(err => {
  console.error("FAILED:", err);
  process.exit(1);
});
