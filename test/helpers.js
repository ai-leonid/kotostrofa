"use strict";
// Общие пути для E2E-тестов: без хардкода.
// BASE вычисляется от расположения этого файла; Chrome ищется по
// CHROME_PATH / PUPPETEER_EXECUTABLE_PATH, затем по стандартным путям ОС, затем в PATH.
const path = require("path");
const fs = require("fs");
const execFileSync = require("child_process").execFileSync;

const indexPath = path.resolve(__dirname, "..", "index.html");
const BASE = "file://" + indexPath.split(path.sep).join("/");

function firstExisting(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i] && fs.existsSync(list[i])) return list[i];
  }
  return null;
}

function fromPath() {
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const names = process.platform === "win32" ? ["chrome.exe"] : ["google-chrome", "chromium", "chromium-browser"];
    for (let i = 0; i < names.length; i++) {
      try {
        const out = execFileSync(cmd, [names[i]], { stdio: ["ignore", "pipe", "ignore"] }).toString();
        const found = out.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0];
        if (found && fs.existsSync(found)) return found;
      } catch (e) { /* ищем дальше */ }
    }
  } catch (e) { /* нет which/where */ }
  return null;
}

function findChrome() {
  const fromEnv = firstExisting([process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH]);
  if (fromEnv) return fromEnv;

  let candidates = [];
  if (process.platform === "win32") {
    candidates = [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/Application/chrome.exe")
    ];
  } else if (process.platform === "darwin") {
    candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
  } else {
    candidates = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  }
  const hit = firstExisting(candidates);
  if (hit) return hit;

  const inPath = fromPath();
  if (inPath) return inPath;

  throw new Error("Chrome не найден. Укажите путь переменной окружения CHROME_PATH.");
}

const CHROME = findChrome();

module.exports = { CHROME: CHROME, BASE: BASE };
