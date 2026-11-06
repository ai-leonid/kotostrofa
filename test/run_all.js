"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const testDir = __dirname;
const allFiles = fs.readdirSync(testDir).filter(f => f.endsWith(".js") && f !== "helpers.js" && f !== "probe.js" && f !== "shot_minimap.js" && f !== "run_all.js");

console.log(`Starting suite of ${allFiles.length} tests...`);
let passed = 0;
let failed = 0;
const results = [];

for (const file of allFiles) {
  process.stdout.write(`Running ${file.padEnd(25)} ... `);
  const start = Date.now();
  try {
    execSync(`node "${path.join(testDir, file)}"`, { stdio: "pipe", timeout: 90000 });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✅ PASS (${elapsed}s)`);
    passed++;
    results.push({ file, ok: true, elapsed });
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`❌ FAIL (${elapsed}s)`);
    if (err.stdout) console.log(err.stdout.toString().slice(-400));
    if (err.stderr) console.error(err.stderr.toString().slice(-400));
    failed++;
    results.push({ file, ok: false, elapsed });
  }
  // Небольшая пауза, чтобы Windows успел завершить предыдущий процесс Chromium
  execSync("powershell -Command Start-Sleep -Milliseconds 250");
}

console.log("\n=================================");
console.log(`TOTAL: ${allFiles.length} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=================================");

process.exit(failed === 0 ? 0 : 1);
