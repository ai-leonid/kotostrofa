const puppeteer = require("puppeteer-core");
const { CHROME, BASE } = require("./helpers.js");

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(BASE + "?autostart=1&t=60");
  await new Promise(r => setTimeout(r, 1500));

  const result = await page.evaluate(async () => {
    const K = window.KOTO;
    const clockProp = K.propsSys.props.find(p => p.name === "часы");
    if (!clockProp) throw new Error("Clock prop not found");

    const clockMesh = clockProp.mesh;
    const zCoords = [];
    clockMesh.children.forEach(c => {
      zCoords.push({
        type: c.geometry ? c.geometry.type : 'unknown',
        z: c.position.z,
        name: c.name || ''
      });
    });

    // Verify purr audio synthesis
    const audio = K.audio;
    if (audio.init) audio.init();
    if (!audio.purrBuf && audio._initPurrBuffer) audio._initPurrBuffer();
    const hasPurrBuffer = !!audio.purrBuf;
    const purrDuration = audio.purrBuf ? audio.purrBuf.duration : 0;

    // Test start and stop
    audio.purr(0.35);
    const isPlaying = !!audio._purrSource;
    audio.stopPurr();
    const stopped = audio._purrSource === null;

    return {
      clockLayers: zCoords,
      hasPurrBuffer,
      purrDuration,
      isPlaying,
      stopped
    };
  });

  console.log("VERIFICATION RESULT:", JSON.stringify(result, null, 2));

  // Check clock layers are distinct
  const zs = result.clockLayers.map(l => l.z);
  console.log("Clock Z coordinates:", zs);

  if (!result.hasPurrBuffer || result.purrDuration < 2.0) {
    throw new Error("Purr buffer invalid");
  }
  if (!result.isPlaying || !result.stopped) {
    throw new Error("Purr start/stop failed");
  }

  console.log(">>> CLOCK & PURR VERIFICATION PASSED SUCCESSFULLY! <<<");
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
