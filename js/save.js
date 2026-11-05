"use strict";

// Локальные рекорды и история партий (localStorage, офлайн).
// Схема с version и по-комнатными максимумами — задел под мультиплеер.
window.KOTO = window.KOTO || {};

KOTO.save = (function () {
  const KEY = "koto_save_v1";
  const MAX_RUNS = 50;

  function empty() {
    return { version: 1, runs: [], best: null };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.runs)) return empty();
      return data;
    } catch (e) {
      return empty(); // сломанный JSON / недоступное хранилище
    }
  }

  function persist(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* приватный режим / квота — игра работает без сохранений */ }
  }

  // stats: {score, roomsDone, roomsTotal, maxCombo, questsDone, win, durationSec, roomScores}
  // возвращает true, если партия — новый рекорд
  function recordRun(stats) {
    const data = load();
    const run = {
      date: new Date().toISOString(),
      score: stats.score || 0,
      roomsDone: stats.roomsDone || 0,
      roomsTotal: stats.roomsTotal || 4,
      maxCombo: stats.maxCombo || 0,
      questsDone: stats.questsDone || 0,
      win: !!stats.win
    };
    data.runs.push(run);
    if (data.runs.length > MAX_RUNS) data.runs = data.runs.slice(-MAX_RUNS);

    const isBest = !data.best || run.score > data.best.score;
    if (isBest) {
      data.best = {
        score: run.score, roomsDone: run.roomsDone, roomsTotal: run.roomsTotal,
        maxCombo: run.maxCombo, date: run.date, rooms: (data.best && data.best.rooms) || {}
      };
    }
    // по-комнатные максимумы (для будущего сравнения игроков)
    if (stats.roomScores && data.best) {
      data.best.rooms = data.best.rooms || {};
      Object.keys(stats.roomScores).forEach(function (r) {
        if (!data.best.rooms[r] || stats.roomScores[r] > data.best.rooms[r]) {
          data.best.rooms[r] = stats.roomScores[r];
        }
      });
    }
    persist(data);
    return isBest;
  }

  function isRecord(score) {
    if (!score) return false;
    const data = load();
    return !data.best || score > data.best.score;
  }

  function best() { return load().best; }

  return { load: load, recordRun: recordRun, isRecord: isRecord, best: best, KEY: KEY };
})();
