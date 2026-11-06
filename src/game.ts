import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import AudioSys from './audio'
import levels from './levels'
import save from './save'
import { bus } from './events'
import type { GameAPI, GameStateSnapshot, Prop, RoomId } from './types/game'

declare const KOTO: any

export const game: GameAPI = (function () {
  const DISHES = ["тарелку", "кружку", "вазу", "банку", "банку кофе", "соль", "вино", "стакан с щётками", "миску с водой", "миску с кормом", "аквариум", "духи"];
  // Квесты привязаны к комнатам. Факты фиксируются в любом порядке (события + проверки),
  // цепочка шагов догоняет факты. fact: строка-поле состояния или функция (q, state).
  const QUESTS = [
    {
      id: "art", room: "living", title: "Арт-критик", reward: 2500, mandatory: true,
      doneText: "«Арт-критик» — выполнен: экспозиция демонтирована лапой.",
      failText: "«Арт-критик» — провален: торшер уцелел и осуждает.",
      steps: [
        { text: "Сбрось картину или часы со стены", fact: "hangDown" },
        { text: "Опрокинь торшер", fact: "lampKnocked" },
        { text: "Подради диван когтями", fact: "sofaScratched" }
      ],
      onEvent: function (q, ev) {
        if (ev.room !== "living") return;
        if (ev.type === "hang") q.hangDown = true;
        if (ev.type === "knock" && ev.name === "торшер") q.lampKnocked = true;
      }
    },
    {
      id: "tea", room: "living", title: "Чаепитие", reward: 1200, optional: true,
      doneText: "«Чаепитие» — выполнено: сервиз обновлён.",
      steps: [{
        text: function (q) { return "Разбей 3 чашки или тарелки (" + Math.min(3, (q.counted || []).length) + "/3)"; },
        fact: function (q) { return (q.counted || []).length >= 3; }
      }],
      onEvent: function (q, ev) {
        if (ev.room === "living" && ev.type === "break" && (ev.name === "кружку" || ev.name === "тарелку")) countOnce(q, ev);
      }
    },
    {
      id: "speed", room: "living", title: "Разгон", reward: 1000, optional: true,
      doneText: "«Разгон» — выполнен: кот разогрят.",
      steps: [{ text: "Собери комбо ×5", fact: function (q, st) { return st.maxCombo >= 5; } }]
    },
    {
      id: "fish", room: "kitchen", title: "Операция «Рыбный день»", reward: 3500, mandatory: true,
      doneText: "«Рыбный день» — выполнен: рыбка съедена. Свидетелей нет.",
      failText: "«Рыбный день» — провален: рыбка выжила и запомнила всё.",
      steps: [
        { text: "Запрыгни на кухонный стол", fact: "tableTop" },
        { text: "Сбрось аквариум со столешницы", fact: "fishbowlDown" },
        { text: "Сожри рыбку", fact: "fishEaten" }
      ],
      onEvent: function (q, ev) {
        if (ev.type === "break" && ev.name === "аквариум") q.fishbowlDown = true;
      }
    },
    {
      id: "dishes5", room: "kitchen", title: "Посудомойка", reward: 1500, optional: true,
      doneText: "«Посудомойка» — выполнена: посуды больше нет.",
      steps: [{
        text: function (q) { return "Разбей 5 предметов посуды (" + Math.min(5, (q.counted || []).length) + "/5)"; },
        fact: function (q) { return (q.counted || []).length >= 5; }
      }],
      onEvent: function (q, ev) {
        if (ev.room === "kitchen" && ev.type === "break" && DISHES.indexOf(ev.name) >= 0) countOnce(q, ev);
      }
    },
    {
      id: "fry", room: "kitchen", title: "Жарка", reward: 1200, optional: true,
      doneText: "«Жарка» — выполнена: кот на пределе.",
      steps: [{ text: "Собери комбо ×8", fact: function (q, st) { return st.maxCombo >= 8; } }]
    },
    {
      id: "bathfun", room: "bath", title: "Водные процедуры", reward: 2000, mandatory: true,
      doneText: "«Водные процедуры» — выполнены: ванная утопает.",
      failText: "«Водные процедуры» — провалены: слишком сухо и чисто.",
      steps: [
        {
          text: function (q) { return "Сбрось 2 флакона с ванны (" + Math.min(2, (q.counted || []).length) + "/2)"; },
          fact: function (q) { return (q.counted || []).length >= 2; }
        },
        { text: "Разорви туалетную бумагу", fact: "paperTorn" },
        { text: "Сбей весы", fact: "scalesDown" }
      ],
      onEvent: function (q, ev) {
        if (ev.room !== "bath") return;
        if ((ev.type === "knock" || ev.type === "break") && (ev.name === "шампунь" || ev.name === "гель")) countOnce(q, ev);
        if (ev.type === "world" && ev.kind === "paper") q.paperTorn = true;
        if (ev.type === "knock" && ev.name === "весы") q.scalesDown = true;
      }
    },
    {
      id: "foam", room: "bath", title: "Пена", reward: 1000, optional: true,
      doneText: "«Пена» — выполнена: снежный кот.",
      steps: [{
        text: function (q) { return "Разорви 3 рулона бумаги (" + Math.min(3, (q.counted || []).length) + "/3)"; },
        fact: function (q) { return (q.counted || []).length >= 3; }
      }],
      onEvent: function (q, ev) {
        if (ev.room === "bath" && ev.type === "world" && ev.kind === "paper") countOnce(q, ev);
      }
    },
    {
      id: "hygiene", room: "bath", title: "Гигиена", reward: 1000, optional: true,
      doneText: "«Гигиена» — выполнена: раковина пуста.",
      steps: [{
        text: function (q) { return "Сбей всё с раковины (" + Math.min(3, (q.counted || []).length) + "/3)"; },
        fact: function (q) { return (q.counted || []).length >= 3; }
      }],
      onEvent: function (q, ev) {
        if (ev.room === "bath" && ev.type === "knock" &&
          (ev.name === "стакан с щётками" || ev.name === "мыло" || ev.name === "крем")) countOnce(q, ev);
      }
    },
    {
      id: "bedroom", room: "bedroom", title: "Рейд «Тихий час»", reward: 2000, mandatory: true,
      doneText: "«Тихий час» — выполнен: спальня разгромлена идеально.",
      failText: "«Тихий час» — провален: спальня осталась недостаточно разгромленной.",
      steps: [
        { text: "Запрыгни на кровать", fact: "bedTop" },
        { text: "Разбей прикроватную лампу", fact: "lampDown" },
        { text: "Поточи когти о ковёр в спальне", fact: "rugScratched" }
      ],
      onEvent: function (q, ev) {
        if (ev.room === "bedroom" && ev.type === "break" && ev.name === "лампу") q.lampDown = true;
      }
    },
    {
      id: "wakeup", room: "bedroom", title: "Побудка", reward: 1000, optional: true,
      doneText: "«Побудка» — выполнена: будильник замолчал навсегда.",
      steps: [{ text: "Разбей будильник", fact: "clockBroken" }],
      onEvent: function (q, ev) {
        if (ev.room === "bedroom" && ev.type === "break" && ev.name === "будильник") q.clockBroken = true;
      }
    },
    {
      id: "perfume", room: "bedroom", title: "Духи", reward: 1000, optional: true,
      doneText: "«Духи» — выполнены: теперь пахнет хаосом.",
      steps: [{ text: "Разбей флакон духов", fact: "perfumeBroken" }],
      onEvent: function (q, ev) {
        if (ev.room === "bedroom" && ev.type === "break" && ev.name === "духи") q.perfumeBroken = true;
      }
    }
  ];

  function countOnce(q, ev) {
    if (!ev.prop) return;
    q.counted = q.counted || [];
    if (q.counted.indexOf(ev.prop) >= 0) return;
    q.counted.push(ev.prop);
  }

  // точение когтей о цель с questId засчитывает факт квесту
  const SCRATCH_FACTS = { bedrug: ["bedroom", "rugScratched"], sofa: ["art", "sofaScratched"] };

  const state: any = {
    mode: "menu", paused: false,
    score: 0, combo: 0, comboT: 0, comboMaxT: 1.6, maxCombo: 0,
    timeLeft: 45, duration: 45,
    broken: 0, dishes: 0,
    events: [], shake: 0,
    room: "living",
    progress: { living: 0, kitchen: 0, bath: 0, bedroom: 0 },
    level: { order: levels.ORDER, idx: 0, entered: { living: true }, done: [] },
    quests: {},
    dailySpecial: null,
    dailySpecialDone: false,
    ultraChaos: false,
    ultraChaosT: 0,
    metaQuests: { vacuumSlayer: false, totalRampage: false, chaosStar: false },
    roomsVisitedInCombo: [],
    hardMode: false
  };
  QUESTS.forEach(function (qd: any) { state.quests[qd.id] = { step: 0, done: false }; });
  state.quest = state.quests.fish; // совместимость со старыми тестами

  let refs: any = null;
  let els: any = {};
  const floaters: any[] = [];
  let finishTimeoutId: any = null;
  let finishMeowTimeoutId: any = null;
  let disasterTimer: number = 24;
  let lassoProp: any = null;

  function fmt(n) { return n.toLocaleString("ru-RU"); }

  function cacheEls() {
    ["hud", "hud-score", "hud-combo", "hud-combo-x", "hud-combo-bar", "hud-timer",
      "hud-feed", "hud-hint", "banner", "hud-quests",
      "hud-room", "hud-room-name", "hud-room-pts", "hud-room-bar",
      "screen-start", "screen-pause", "screen-end", "end-title", "end-subtitle", "end-report",
      "end-counters", "end-total", "end-rank", "end-quest", "end-record", "end-rooms", "start-record", "errlog", "speed-lines",
      "hud-daily-special", "daily-special-text", "hud-lasso", "ultra-chaos-overlay", "end-meta-badges"
    ].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  function getComboRank(combo: number) {
    if (combo >= 100) return { key: "catastrophe", rank: "КОТОСТРОФА", name: "КОТОСТРОФА", title: "КОТОСТРОФА!", mult: 3.5, cls: "rank-catastrophe" };
    if (combo >= 75)  return { key: "sss", rank: "SSS", name: "SSS", title: "Апокалипсис", mult: 3.0, cls: "rank-sss" };
    if (combo >= 50)  return { key: "ss", rank: "SS", name: "SS", title: "Аннигилятор", mult: 2.5, cls: "rank-ss" };
    if (combo >= 35)  return { key: "s", rank: "S", name: "S", title: "Стихия", mult: 2.1, cls: "rank-s" };
    if (combo >= 20)  return { key: "a", rank: "A", name: "A", title: "Погромщик", mult: 1.8, cls: "rank-a" };
    if (combo >= 10)  return { key: "b", rank: "B", name: "B", title: "Дебошир", mult: 1.5, cls: "rank-b" };
    if (combo >= 5)   return { key: "c", rank: "C", name: "C", title: "Хулиган", mult: 1.2, cls: "rank-c" };
    return { key: "d", rank: "D", name: "D", title: "Обычный кот", mult: 1.0, cls: "rank-d" };
  }

  function comboMult() { return getComboRank(state.combo).mult; }

  function getComboWindow(combo) {
    if (state.hardMode) return 0.6;
    if (combo >= 60) return 0.85;
    if (combo >= 30) return 1.05;
    if (combo >= 15) return 1.25;
    return 1.45;
  }

  let bannerTimer = null;
  function showBanner(text, cls, dur) {
    els.banner.textContent = text;
    els.banner.className = cls || "";
    els.banner.classList.remove("hidden");
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      els.banner.classList.add("hidden");
      els.banner.className = "";
    }, (dur || 2) * 1000);
  }

  // дверь, ведущая в комнату nextId (у каждой следующей комнаты ровно одна дверь)
  function doorTo(nextId) {
    const ids = Object.keys(levels.DOORS);
    for (let i = 0; i < ids.length; i++) {
      if (levels.DOORS[ids[i]].rooms.indexOf(nextId) >= 0) {
        return refs.apt.doors[ids[i]];
      }
    }
    return null;
  }

  // комната пройдена, когда выполнены все её обязательные квесты
  function mandatoryQuestsDone(room) {
    for (let i = 0; i < QUESTS.length; i++) {
      const qd = QUESTS[i];
      if (qd.room === room && qd.mandatory && !state.quests[qd.id].done) return false;
    }
    return true;
  }

  function completeLevel(room) {
    const lv = state.level;
    lv.done.push(room);
    lv.idx += 1;
    const info = levels.info(room);
    const nextId = lv.order[lv.idx];
    AudioSys.fanfare();
    state.shake = Math.min(1, state.shake + 0.3);
    showBanner("✔ " + info.name.toUpperCase() + " ПРОЙДЕНА!", "good", 2.2);
    const cp = refs.cat.body.position;
    // премия Синдиката: весь остаток таймера на момент завершения уровня → рубли
    const secs = Math.max(0, Math.floor(state.timeLeft));
    if (secs > 0) {
      const rate = levels.SPEED_BONUS_PER_SEC;
      const bonus = secs * rate;
      state.speedBonus += bonus;
      state.speedLeft = secs;
      addScore(bonus);
      floater({ x: cp.x, y: cp.y + 0.7, z: cp.z }, "+" + fmt(bonus) + "₽ ЗА СКОРОСТЬ", "quest");
      addFeed("Премия Синдиката: +" + fmt(bonus) + " ₽ (" + secs + " с × " + rate + ")");
    }
    if (nextId) {
      const next = levels.info(nextId);
      if (next.timeBonus > 0) {
        state.timeLeft += next.timeBonus;
        floater({ x: cp.x, y: cp.y + 0.6, z: cp.z }, "+" + next.timeBonus + " СЕК", "quest");
      }
      const door = doorTo(nextId);
      if (door) door.open();
      if (KOTO.minimap && door) {
        KOTO.minimap.setNavTarget(door, nextId, next.name);
      }
      addFeed("Дверь в «" + next.name + "» открыта — иди туда");
    } else {
      if (KOTO.minimap) KOTO.minimap.clearNavTarget();
      addFeed("Вся квартира разгромлена!");
      state.finishing = true; // таймер замирает до победной заставки
      setTimeout(function () { finish(true); }, 1800);
    }
  }

  function checkLevel() {
    const lv = state.level;
    const target = lv.order[lv.idx];
    if (!target || lv.done.indexOf(target) >= 0) return;
    if (state.progress[target] < levels.info(target).target) return;
    if (!mandatoryQuestsDone(target)) return;
    completeLevel(target);
  }

  function onEnterRoom(room) {
    const lv = state.level;
    if (lv.order[lv.idx] !== room || lv.entered[room]) return;
    lv.entered[room] = true;
    if (KOTO.minimap) KOTO.minimap.clearNavTarget(room);
    AudioSys.tinkle();
    const info = levels.info(room);
    showBanner("📍 " + info.name.toUpperCase() + " • УРОВЕНЬ " + (lv.idx + 1), "", 2.0);
    addFeed("Цель: ущерб " + fmt(info.target) + " ₽ в «" + info.name + "»");
    renderQuests();
  }

  function comboUp() {
    const prevRank = getComboRank(state.combo);
    state.combo += 1;
    state.comboMaxT = getComboWindow(state.combo);
    state.comboT = state.comboMaxT;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    const newRank = getComboRank(state.combo);
    if (newRank.key !== prevRank.key && ["s", "ss", "sss", "catastrophe"].indexOf(newRank.key) >= 0) {
      if (AudioSys.rankSting) AudioSys.rankSting(newRank.key);
      addFeed("РАНГ КОМБО: " + newRank.name + " (" + newRank.mult + "x)!");
    }
    // GP-02: Режим «Ультра-хаос» при КОТОСТРОФА-ранге (комбо 100+)
    if (state.combo >= 100 && !state.ultraChaos) {
      state.ultraChaos = true;
      state.ultraChaosT = 10;
      state.metaQuests.chaosStar = true;
      showBanner("🔥 УЛЬТРА-ХАОС! ВСЁ ×1.5!", "gold", 2.5);
      if (els["ultra-chaos-overlay"]) els["ultra-chaos-overlay"].classList.remove("hidden");
      document.body.classList.add("bloom-active");
      if (AudioSys.fanfare) AudioSys.fanfare();
      addFeed("🔥 РЕЖИМ УЛЬТРА-ХАОС АКТИВИРОВАН! 10 СЕКУНД МАКСИМАЛЬНОГО УРОНА!");
    }
    // GP-04: Мета-квест «Тотальное разрушение»
    if (state.combo > 0 && state.room) {
      if (state.roomsVisitedInCombo.indexOf(state.room) < 0) {
        state.roomsVisitedInCombo.push(state.room);
        if (state.roomsVisitedInCombo.length >= 4) {
          state.metaQuests.totalRampage = true;
          addFeed("🏆 МЕТА-КВЕСТ: «Тотальное разрушение» выполнено!");
        }
      }
    }
  }

  function addScore(pts: number, room?: string) {
    if (state.ultraChaos) pts = Math.round(pts * 1.5);
    state.score += pts;
    if (room && state.progress[room] !== undefined) state.progress[room] += pts;
  }

  function record(label, pts) {
    state.events.push({ label: label, pts: pts });
  }

  function floater(pos, text, cls) {
    const el = document.createElement("div");
    el.className = "floater " + (cls || "");
    el.textContent = text;
    els.floaters.appendChild(el);
    floaters.push({ el: el, x: pos.x, y: pos.y + 0.25, z: pos.z, t: 0 });
  }

  function addFeed(text) {
    const d = document.createElement("div");
    d.textContent = text;
    els["hud-feed"].prepend(d);
    while (els["hud-feed"].children.length > 4) els["hud-feed"].lastChild.remove();
    setTimeout(function () { d.remove(); }, 3800);
  }

  function onPropImpact(prop: any, v: number, isStrike?: boolean) {
    if (state.mode !== "play" || state.paused) return;
    if (prop.broken || prop.scoreCd > 0) return;
    if (prop.hang && (!prop.released || prop.scored)) return;
    if (v < 1.1) return;
    const currentFrame = (typeof window !== 'undefined' && window.KOTO && window.KOTO.currentFrame) ? window.KOTO.currentFrame : 0;
    if (currentFrame > 0 && prop._lastImpactFrame === currentFrame) return;
    prop._lastImpactFrame = currentFrame;
    prop.scoreCd = 1.0;

    let decay = 1.0;
    let isFarmingBlocked = false;
    const now = Date.now();

    if (!prop.breakable || v < prop.breakVel) {
      if ((now - (prop.lastHitAt || 0)) < 10000) {
        prop.repeatHits = (prop.repeatHits || 1) + 1;
      } else {
        prop.repeatHits = 1;
      }
      prop.lastHitAt = now;

      if (prop.repeatHits === 2) decay = 0.4;
      else if (prop.repeatHits === 3) decay = 0.15;
      else if (prop.repeatHits >= 4) {
        decay = 0;
        isFarmingBlocked = true;
      }
    }

    if (!isFarmingBlocked) {
      comboUp();
      if (isStrike) comboUp(); // удвоенный бонус к комбо за цепную реакцию (СТРАЙК)
    }
    const mult = comboMult();
    if (prop.breakable && v >= prop.breakVel) {
      breakProp(prop, v, mult);
    } else {
      const pts = Math.round(prop.value * mult * decay);
      if (pts > 0) {
        addScore(pts, prop.room);
        record("Сбил: " + prop.name, pts);
        const strikeTxt = isStrike ? "СТРАЙК! " : "";
        floater(prop.body.position, strikeTxt + "+" + fmt(pts) + "₽" + (decay < 1 ? " (" + Math.round(decay * 100) + "%)" : ""), isStrike ? "strike" : "");
        addFeed((isStrike ? "СТРАЙК! " : "Сбил: ") + prop.name + " +" + fmt(pts) + "₽" + (decay < 1 ? " (анти-фарм)" : ""));
      } else {
        floater(prop.body.position, "0₽ (анти-фарм)", "");
        addFeed("Сбил: " + prop.name + " — 0 ₽ (анти-фарм: переключись на другой предмет!)");
      }
      if (v > 2.2) AudioSys.crash(0.3); else AudioSys.thud();
      if (prop.name === "подушку" && KOTO.fx) {
        KOTO.fx.feathers(prop.body.position.x, prop.body.position.y + 0.1, prop.body.position.z, 6);
      }
      if ((prop.name === "телевизор" || prop.name === "тостер") && v > 1.8 && KOTO.fx) {
        KOTO.fx.sparks(prop.body.position.x, prop.body.position.y + 0.1, prop.body.position.z, 6);
      }
      onEvent({ type: "knock", name: prop.name, room: prop.room, prop: prop });
    }
    if (prop.onScore) prop.onScore(api, prop);
  }

  function breakProp(prop, v, mult) {
    let finalMult = mult;
    let dailyPrefix = "";
    if ((prop._isDailySpecial || prop.name === state.dailySpecial) && !state.dailySpecialDone) {
      finalMult *= 2.5;
      state.dailySpecialDone = true;
      dailyPrefix = "⭐ ЦЕЛЬ ДНЯ! ";
      if (els["hud-daily-special"]) {
        els["hud-daily-special"].classList.add("done");
        if (els["daily-special-text"]) {
          els["daily-special-text"].textContent = "⭐ ВЫПОЛНЕНО: " + prop.name.toUpperCase() + "!";
        }
      }
      addFeed("⭐ БОНУС ДНЯ! Разбит " + prop.name + " с множителем ×2.5!");
      if (AudioSys.fanfare) AudioSys.fanfare();
    }
    const pts = Math.round(prop.value * finalMult);
    addScore(pts, prop.room);
    state.broken += 1;
    if (DISHES.indexOf(prop.name) >= 0) state.dishes += 1;
    onEvent({ type: "break", name: prop.name, room: prop.room, prop: prop });
    record("Разбил: " + prop.name, pts);
    KOTO.propsSys.spawnShards(prop.body.position, prop.shardColor, 6, prop.body.velocity);

    // Hit-stop при сильных разрушениях
    if (prop.value >= 800 || prop.name === "телевизор" || prop.name === "аквариум") {
      if (KOTO.hitStop) KOTO.hitStop(35);
    }
    // Процедурные частицы
    if (KOTO.fx) {
      const bp = prop.body.position;
      if (prop.name === "телевизор" || prop.name === "тостер" || prop.name === "лампу" || prop.name === "фен") {
        KOTO.fx.sparks(bp.x, bp.y + 0.1, bp.z, 16);
      }
      if (prop.name === "аквариум" || prop.name === "миску с водой") {
        KOTO.fx.splashes(bp.x, bp.y + 0.2, bp.z, 20);
      }
      if (prop.name === "подушку") {
        KOTO.fx.feathers(bp.x, bp.y + 0.1, bp.z, 12);
      }
    }

    KOTO.propsSys.removeProp(prop);
    floater(prop.body.position, dailyPrefix + "+" + fmt(pts) + "₽", "break");
    addFeed("Разбил: " + prop.name + " +" + fmt(pts) + "₽");
    AudioSys.crash(Math.min(1, v / 5));
    state.shake = Math.min(1, 0.3 + v / 14);
    if (prop.onBreak) prop.onBreak(api, prop);
  }

  function releaseHang(prop) {
    prop.released = true;
    const b = prop.body;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = prop.mass;
    b.updateMassProperties();
    if (prop.name === "карниз со шторами") {
      prop.scored = true;
      b.velocity.set(0, -0.6, 1.4);
      b.angularVelocity.set(2.8, 0, (Math.random() - 0.5) * 3);
      state.shake = 1.0;
      AudioSys.crash(0.8);
      comboUp();
      const mult = comboMult();
      const pts = Math.round(prop.value * mult);
      addScore(pts, prop.room);
      record("Сорвал: " + prop.name, pts);
      floater(b.position, "+3 800 ₽ СРЫВ КАРНИЗА!", "strike");
      addFeed("СРЫВ КАРНИЗА! Шторы с грохотом рухнули на пол! +" + fmt(pts) + " ₽");
      if (KOTO.fx) KOTO.fx.dust(b.position.x, 0.1, b.position.z, 14);
    } else {
      b.velocity.set((Math.random() - 0.5) * 0.5, 0.3, -(0.5 + Math.random() * 0.8));
      b.angularVelocity.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
      AudioSys.thud();
    }
    b.wakeUp();
    onEvent({ type: "hang", room: prop.room, prop: prop });
  }

  function trySwipe() {
    if (state.mode !== "play" || state.paused) return;
    const cat = refs.cat;
    cat.swipeT = 0.25;
    const cp = cat.body.position;
    const f = cat.forward();
    if (KOTO.propsSys && KOTO.propsSys.fridge && !KOTO.propsSys.fridge.opened) {
      const fp = KOTO.propsSys.fridge.pos;
      const dx = cp.x - fp.x, dz = cp.z - fp.z;
      if (Math.hypot(dx, dz) < 1.4) {
        KOTO.propsSys.fridge.open();
      }
    }
    for (const prop of KOTO.propsSys.props) {
      if (prop.broken) continue;
      const p = prop.body.position;
      const dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (prop.hang && !prop.released) {
        const reach = prop.name === "карниз со шторами" ? 2.3 : 1.6;
        if (d < reach) releaseHang(prop);
        continue;
      }
      if (d > 1.0 || d < 0.001) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot < 0.2) continue;
      const b = prop.body;
      b.wakeUp();
      const J = Math.min(8, Math.max(1.8, 3.6 * prop.mass));
      const nx = dx / d, nz = dz / d, ny = Math.max(0.3, dy / d);
      b.applyImpulse(new CANNON.Vec3(nx * J, ny * J * 0.8 + 1.8, nz * J), new CANNON.Vec3(0, 0, 0));
      b.angularVelocity.x += (Math.random() - 0.5) * 6;
      b.angularVelocity.z += (Math.random() - 0.5) * 6;
      if (prop.name === "весы") {
        onEvent({ type: "knock", name: prop.name, room: prop.room, prop: prop });
      }
    }
    for (const t of KOTO.propsSys.scratchTargets) {
      if (t.cd > 0) continue;
      const dx = t.x - cp.x, dz = t.z - cp.z;
      if (Math.sqrt(dx * dx + dz * dz) < t.r + 0.5) {
        t.cd = 2.2;
        const sf = SCRATCH_FACTS[t.questId];
        if (sf) state.quests[sf[0]][sf[1]] = true;
        const pts = Math.round(t.points * (state.combo > 0 ? comboMult() : 1));
        addScore(pts, levels.roomOf(t.x, t.z));
        record("Подрал: " + t.name, pts);
        floater({ x: t.x, y: cp.y + 0.4, z: t.z }, "подрал " + t.name + " +" + pts + "₽", "scratch");
        AudioSys.scratch();
        if (KOTO.fx && (t.name === "диван" || t.name === "кровать" || t.name === "коврик" || t.name === "ковёр")) {
          KOTO.fx.feathers(t.x, cp.y + 0.3, t.z, 6);
        }
      }
    }
  }

  function tryMeow() {
    if (state.mode !== "play" || state.paused) return;
    const cat = refs.cat;
    cat.meowT = 0.55;
    AudioSys.meow();
    floater(cat.body.position, "МЯУ!", "");
    const cp = cat.body.position;
    const propsList = (refs && refs.propsSys && refs.propsSys.props) || (typeof window !== 'undefined' && window.KOTO && window.KOTO.propsSys ? window.KOTO.propsSys.props : []);
    for (const prop of propsList) {
      if (prop.broken || prop._removing || !prop.body || (prop.hang && !prop.released)) continue;
      const p = prop.body.position;
      const dx = p.x - cp.x, dz = p.z - cp.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 2.3 || d < 0.01) continue;
      const k = (1 - d / 2.3) * 1.1 * prop.mass;
      const b = prop.body;
      b.wakeUp();
      b.applyImpulse(new CANNON.Vec3((dx / d) * k, 0.5 * k, (dz / d) * k), new CANNON.Vec3(0, 0, 0));
    }
  }

  // Карточки строятся динамически: чипы пройденных комнат + квесты текущей
  function renderQuests() {
    const wrap = els["hud-quests"];
    wrap.innerHTML = "";
    levels.ORDER.forEach(function (roomId) {
      const info = levels.info(roomId);
      if (state.level.done.indexOf(roomId) >= 0) {
        const chip = document.createElement("div");
        chip.className = "hud-room-chip";
        chip.textContent = "✔ " + info.name;
        wrap.appendChild(chip);
        return;
      }
      if (roomId !== state.room) return;
      QUESTS.filter(function (qd) { return qd.room === roomId; }).forEach(function (qd) {
        const q = state.quests[qd.id];
        const card = document.createElement("div");
        card.className = "hud-quest" + (q.done ? " all-done" : "") + (qd.optional ? " optional" : "");
        let html = "";
        for (let s = 0; s < qd.steps.length; s++) {
          const step = qd.steps[s];
          const cls = s < q.step ? "done" : (s === q.step ? "current" : "");
          const txt = typeof step.text === "function" ? step.text(q) : step.text;
          html += '<li class="' + cls + '">' + txt + "</li>";
        }
        card.innerHTML =
          '<div class="hud-quest-title">&#9873; ' + qd.title +
          '<span class="qtag">' + (qd.optional ? "бонус" : "обяз.") + "</span></div>" +
          '<ul class="hud-quest-steps">' + html + "</ul>" +
          '<div class="hud-quest-reward">награда: +' + fmt(qd.reward) + " &#8381;</div>";
        wrap.appendChild(card);
      });
    });
  }

  function completeStep(qd, q) {
    q.step += 1;
    AudioSys.tinkle();
    const cp = refs.cat.body.position;
    if (q.step >= qd.steps.length) {
      q.done = true;
      const tBonus = qd.mandatory ? 5 : 3;
      state.timeLeft += tBonus;
      addScore(qd.reward, qd.room);
      record(qd.doneText, qd.reward);
      floater({ x: cp.x, y: cp.y + 0.5, z: cp.z }, "КВЕСТ ВЫПОЛНЕН! +" + fmt(qd.reward) + "₽ (+" + tBonus + "с)", "quest");
      addFeed("«" + qd.title + "» выполнен! +" + fmt(qd.reward) + "₽ (+" + tBonus + " с)");
    } else {
      floater({ x: cp.x, y: cp.y + 0.5, z: cp.z }, "Шаг " + q.step + " из " + qd.steps.length + " — готово!", "quest");
      addFeed("«" + qd.title + "»: шаг " + q.step + "/" + qd.steps.length);
    }
    renderQuests();
  }

  function eatFish() {
    const q = state.quests.fish;
    const fish = KOTO.propsSys.fish;
    refs.world.removeBody(fish.body);
    refs.scene.remove(fish.mesh);
    fish.alive = false;
    q.fishEaten = true;
    AudioSys.nom();
    const cp = refs.cat.body.position;
    addFeed("Рыбка съедена. Свидетелей нет.");
    floater({ x: cp.x, y: cp.y + 0.4, z: cp.z }, "СЪЕЛ РЫБКУ!", "quest");
  }

  function insideAABB(b, p) {
    return p.x > b.x1 && p.x < b.x2 && p.z > b.z1 && p.z < b.z2 && p.y > b.y1 && p.y < b.y2;
  }

  // события разрушений/мира → факты квестов (каждый квест фильтрует своё)
  function onEvent(ev) {
    for (let i = 0; i < QUESTS.length; i++) {
      const qd = QUESTS[i];
      const q = state.quests[qd.id];
      if (!q || q.done || !qd.onEvent) continue;
      qd.onEvent(q, ev);
    }
  }

  function progressQuest(qd, q) {
    let guard = 0;
    while (!q.done && guard++ < 5) {
      const step = qd.steps[q.step];
      if (!step) break;
      const ready = typeof step.fact === "function" ? step.fact(q, state) : !!q[step.fact];
      if (!ready) break;
      completeStep(qd, q);
    }
  }

  function progressAllQuests() {
    for (let i = 0; i < QUESTS.length; i++) progressQuest(QUESTS[i], state.quests[QUESTS[i].id]);
  }

  function questChecks() {
    const Q = state.quests;
    const p = refs.cat.body.position;
    // факты позиции фиксируются независимо от порядка шагов
    if (!Q.fish.tableTop && insideAABB(refs.L.tableAABB, p)) Q.fish.tableTop = true;
    if (!Q.bedroom.bedTop && insideAABB(refs.L.bedAABB, p)) Q.bedroom.bedTop = true;
    if (!Q.fish.fishEaten) {
      const fish = KOTO.propsSys.fish;
      if (fish.alive && fish.body) {
        const dx = fish.body.position.x - p.x, dz = fish.body.position.z - p.z;
        const dy = fish.body.position.y - p.y;
        if (dx * dx + dz * dz < 0.72 && Math.abs(dy) < 0.55) eatFish();
      }
    }
    if (KOTO.propsSys && KOTO.propsSys.fridge && !KOTO.propsSys.fridge.opened) {
      const fp = KOTO.propsSys.fridge.pos;
      const dx = p.x - fp.x, dz = p.z - fp.z;
      if (Math.hypot(dx, dz) < 0.95) {
        KOTO.propsSys.fridge.open();
      }
    }
  }

  let lastTimerText = "";
  let lastRoomPts = -1;
  function updateHUD() {
    els["hud-score"].textContent = fmt(state.score) + " ₽";
    const sec = Math.max(0, Math.ceil(state.timeLeft));
    const txt = Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
    if (txt !== lastTimerText) {
      lastTimerText = txt;
      els["hud-timer"].textContent = txt;
      els["hud-timer"].classList.toggle("low", sec <= 10 && state.mode === "play");
    }
    // прогресс комнаты, в которой сейчас кот
    const info = levels.info(state.room);
    if (info && els["hud-room"]) {
      els["hud-room-name"].textContent = info.name;
      const pts = Math.min(state.progress[state.room], info.target);
      if (pts !== lastRoomPts) {
        lastRoomPts = pts;
        els["hud-room-pts"].textContent = fmt(pts) + " / " + fmt(info.target) + " ₽";
        els["hud-room-bar"].style.width = Math.min(100, state.progress[state.room] / info.target * 100) + "%";
        els["hud-room"].classList.toggle("done", state.progress[state.room] >= info.target);
      }
    }
    if (state.combo > 1 && state.comboT > 0) {
      els["hud-combo"].classList.remove("hidden");
      const r = getComboRank(state.combo);
      els["hud-combo-x"].textContent = "КОМБО ×" + r.mult.toFixed(1).replace(/\.0$/, "") + " · " + r.rank;
      els["hud-combo"].className = r.cls;
      els["hud-combo-bar"].style.width = (state.comboT / (state.comboMaxT || 1.6) * 100) + "%";
    } else {
      els["hud-combo"].classList.add("hidden");
      els["hud-combo"].className = "";
    }
    const speedLinesEl = els["speed-lines"];
    if (speedLinesEl) {
      const catSp = refs && refs.cat && refs.cat.speedSmooth ? refs.cat.speedSmooth : 0;
      const isSprinting = catSp > 4.6;
      if (state.mode === "play" && (state.combo >= 50 || (isSprinting && state.combo >= 20))) {
        speedLinesEl.className = "super-active";
      } else if (state.mode === "play" && (isSprinting || state.combo >= 20)) {
        speedLinesEl.className = "active";
      } else {
        speedLinesEl.className = "hidden";
      }
    }
  }

  function updateFloaters(dt) {
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      const v = new THREE.Vector3(f.x, f.y, f.z).project(refs.camera);
      if (v.z > 1) {
        f.el.style.display = "none";
      } else {
        f.el.style.display = "";
        f.el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + "px";
        f.el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + "px";
      }
      if (f.t > 1.15) {
        f.el.remove();
        floaters.splice(i, 1);
      }
    }
  }

  function rank(total) {
    if (total < 25000) return ["Спящий котик", "Хозяева даже не поняли, что ты просыпался. Слишком лениво.", ""];
    if (total < 50000) return ["Бытовой пакостник", "Пара разбитых чашек и сброшенный тапок. Ущерб на уровне лёгкого недоразумения.", ""];
    if (total < 80000) return ["Сертифицированный вандал", "Посуда в осколках, обои в полоску. Хозяева вызывают клининг.", ""];
    if (total < 115000) return ["Оперативник Синдиката", "Серьёзная работа лапами. Торшеры повержены, занавески пали смертью храбрых.", ""];
    if (total < 150000) return ["Гроза интерьеров", "Робот-пылесос в панике, кухня в руинах, соседи снизу насторожились.", ""];
    if (total < 185000) return ["Стихийное бедствие", "Ударная волна кошачьей ярости. Квартире потребуется капитальный евроремонт.", ""];
    if (total < 225000) return ["Аннигилятор уюта", "Уничтожено буквально всё, до чего дотянулись когти. Страховая компания объявила дефолт.", " rank-annihilator"];
    return ["КОТОСТРОФА: СУДНЫЙ ДЕНЬ", "Абсолютный математический предел разрушения. Мир уже никогда не станет прежним!", " rank-catastrophe-final"];
  }

  function fillEnd(win) {
    const agg = {};
    state.events.forEach(function (e) {
      agg[e.label] = (agg[e.label] || 0) + e.pts;
    });
    const rows = Object.keys(agg).map(function (k) { return { label: k, pts: agg[k] }; });
    rows.sort(function (a, b) { return b.pts - a.pts; });
    els["end-report"].innerHTML = rows.slice(0, 6).map(function (r) {
      return "<li><span>" + r.label + "</span><span>+" + fmt(r.pts) + " ₽</span></li>";
    }).join("") || "<li><span>Только следы когтей. Кот в шоке от своей сдержанности.</span><span>0 ₽</span></li>";
    els["end-counters"].innerHTML =
      "разбито предметов: " + state.broken + " &nbsp;&bull;&nbsp; из них посуды: " + state.dishes +
      "<br>максимальное комбо: " + state.maxCombo + " подряд" +
      "<br>комнат пройдено: " + state.level.done.length + " / " + state.level.order.length +
      (state.speedBonus > 0
        ? "<br>премия Синдиката (все комнаты): +" + fmt(state.speedBonus) + " ₽"
        : "");
    els["end-total"].textContent = fmt(state.score) + " ₽";
    els["end-title"].textContent = win ? "КВАРТИРА РАЗГРОМЛЕНА!" : "ХОЗЯЕВА ВЕРНУЛИСЬ!";
    const r = rank(state.score);
    els["end-rank"].innerHTML = '<div class="rank' + r[2] + '">' + r[0] + '</div><div class="rank-sub">' + r[1] + "</div>";
    const questLines = QUESTS.filter(function (qd) { return qd.mandatory; }).map(function (qd) {
      const q = state.quests[qd.id];
      return q.done ? qd.doneText : qd.failText;
    });
    els["end-quest"].innerHTML = questLines.join("<br>");
    els["end-rooms"].innerHTML = levels.ORDER.map(function (rid) {
      const info = levels.info(rid);
      const roomDone = state.level.done.indexOf(rid) >= 0;
      return "<li><span>" + (roomDone ? "✔ " : "○ ") + info.name + "</span><span>" +
        fmt(Math.round(state.progress[rid] || 0)) + " ₽</span></li>";
    }).join("");
    const b = save.best();
    if (state.newRecord) {
      els["end-record"].innerHTML =
        '<div class="rec-new">НОВЫЙ РЕКОРД!</div><div class="rec-sub">' + fmt(state.score) + " ₽</div>";
    } else if (b) {
      els["end-record"].innerHTML = '<div class="rec-sub">рекорд: ' + fmt(b.score) + " ₽</div>";
    } else {
      els["end-record"].innerHTML = "";
    }

    // GP-04: Мета-значки на финальном экране
    if (els["end-meta-badges"]) {
      els["end-meta-badges"].innerHTML = "";
      if (state.metaQuests && state.metaQuests.vacuumSlayer) {
        const bd = document.createElement("div");
        bd.className = "meta-badge";
        bd.textContent = "🏆 ГРОЗА РОБОТОВ — Пылесос Жорка-3000 уничтожен!";
        els["end-meta-badges"].appendChild(bd);
      }
      if (state.metaQuests && state.metaQuests.totalRampage) {
        const bd = document.createElement("div");
        bd.className = "meta-badge";
        bd.textContent = "🏆 НЕОСТАНОВИМЫЙ — Разрушения во всех 4 комнатах без потери комбо!";
        els["end-meta-badges"].appendChild(bd);
      }
      if (state.metaQuests && state.metaQuests.chaosStar) {
        const bd = document.createElement("div");
        bd.className = "meta-badge";
        bd.textContent = "🏆 ЗВЕЗДА ХАОСА — Достигнут режим УЛЬТРА-ХАОС!";
        els["end-meta-badges"].appendChild(bd);
      }
      if (state.hardMode) {
        const bd = document.createElement("div");
        bd.className = "meta-badge";
        bd.textContent = "💀 ХАРДКОРНЫЙ РЕЖИМ — Пройдено с окном комбо 0.6 сек!";
        els["end-meta-badges"].appendChild(bd);
      }
    }

    const stats = {
      score: state.score, broken: state.broken, dishes: state.dishes, maxCombo: state.maxCombo,
      quest: state.quests.fish.done, questBedroom: state.quests.bedroom.done, events: rows.length,
      roomsDone: state.level.done.length, roomsTotal: state.level.order.length, win: !!win,
      speedBonus: state.speedBonus, speedLeft: state.speedLeft
    };
    (window as any).__stats = stats;
    els.errlog.dataset.stats = JSON.stringify(stats);
  }

  function finish(win?: boolean) {
    if (state.mode !== "play") return;
    state.mode = "over";
    if (KOTO.minimap) KOTO.minimap.clearNavTarget();
    if (document.exitPointerLock) document.exitPointerLock();
    // премия за скорость уже выплачена поэтапно в completeLevel
    state.newRecord = save.isRecord(state.score);
    save.recordRun({
      score: state.score,
      roomsDone: state.level.done.length,
      roomsTotal: state.level.order.length,
      maxCombo: state.maxCombo,
      questsDone: QUESTS.filter(function (qd) { return state.quests[qd.id].done; }).length,
      win: win,
      durationSec: state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0,
      roomScores: state.progress
    });
    if (state.newRecord && AudioSys.recordSting) AudioSys.recordSting();
    if (win) {
      showBanner("КВАРТИРА РАЗГРОМЛЕНА!", "good", 2.5);
      AudioSys.fanfare();
    } else {
      showBanner("ХОЗЯЕВА ВЕРНУЛИСЬ!", "", 2.5);
      AudioSys.knock();
    }
    finishMeowTimeoutId = setTimeout(function () { refs.cat.meowT = 0.55; AudioSys.meow(); }, 700);
    finishTimeoutId = setTimeout(function () {
      fillEnd(win);
      els.banner.classList.add("hidden");
      els.hud.classList.add("hidden");
      els["screen-end"].classList.remove("hidden");
    }, 2000);
  }

  // GP-05: Случайные события «Катастрофа»
  function triggerCatastrophe() {
    if (state.mode !== "play" || state.paused) return;
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) {
      showBanner("⚡ ЗЕМЛЕТРЯСЕНИЕ! ВСЁ ДРОЖИТ!", "warn", 2.5);
      state.shake = 1.0;
      AudioSys.crash(0.6);
      addFeed("⚡ ЗЕМЛЕТРЯСЕНИЕ! Предметы теряют равновесие!");
      const propsList = (refs && refs.propsSys && refs.propsSys.props) || [];
      propsList.forEach((p: any) => {
        if (!p.broken && p.body && !p.hang) {
          p.body.wakeUp();
          p.body.applyImpulse(
            new CANNON.Vec3((Math.random() - 0.5) * 1.6, 0.4, (Math.random() - 0.5) * 1.6),
            new CANNON.Vec3(0, 0, 0)
          );
        }
      });
    } else if (kind === 1) {
      showBanner("🌩️ ГРОЗА ЗА ОКНОМ!", "", 2.0);
      bus.emit('catastrophe:thunder', {});
      AudioSys.crash(0.8);
      addFeed("🌩️ ГРОЗА! Вспышка молнии озарила квартиру!");
    } else {
      showBanner("☎️ ТЕЛЕФОННЫЙ ЗВОНОК!", "", 2.0);
      if (refs.cat && refs.cat.scare) refs.cat.scare(2.0);
      AudioSys.thud();
      addFeed("☎️ РЕЗКИЙ ЗВОНОК НАПУГАЛ КОТА!");
      const propsList = (refs && refs.propsSys && refs.propsSys.props) || [];
      propsList.forEach((p: any) => {
        if (!p.broken && p.body && (p.mass || 0.4) <= 0.4 && !p.hang) {
          p.body.wakeUp();
          p.body.velocity.y += 1.4;
        }
      });
    }
  }

  // GP-03: Лапа-лассо (захват и бросок)
  function onLassoHold() {
    if (state.mode !== "play" || state.paused || lassoProp) return;
    const cat = refs && refs.cat;
    if (!cat) return;
    const cp = cat.body.position;
    const f = cat.forward();
    let bestProp: any = null;
    let bestDist = 2.4;

    const propsList = (refs && refs.propsSys && refs.propsSys.props) || [];
    for (const p of propsList) {
      if (p.broken || p.hang || (p.mass && p.mass > 2.0)) continue;
      const pp = p.body.position;
      const dx = pp.x - cp.x, dz = pp.z - cp.z;
      const d = Math.hypot(dx, dz);
      if (d < bestDist) {
        const dot = (dx * f.x + dz * f.z) / d;
        if (dot > 0.3) {
          bestDist = d;
          bestProp = p;
        }
      }
    }

    if (bestProp) {
      lassoProp = bestProp;
      lassoProp.body.wakeUp();
      if (els["hud-lasso"]) els["hud-lasso"].classList.remove("hidden");
      floater(lassoProp.body.position, "🎯 ЗАХВАТ!", "");
    }
  }

  function onLassoRelease() {
    if (!lassoProp) return;
    if (els["hud-lasso"]) els["hud-lasso"].classList.add("hidden");
    const cat = refs && refs.cat;
    const f = cat ? cat.forward() : { x: 0, y: 0, z: 1 };
    const thrownBody = lassoProp.body;
    thrownBody.wakeUp();
    thrownBody.velocity.set(f.x * 12, 3.2, f.z * 12);
    thrownBody.angularVelocity.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    thrownBody._isLassoThrown = true;
    lassoProp._isLassoThrown = true;
    AudioSys.thud();
    floater(thrownBody.position, "🚀 БРОСОК!", "strike");

    const vacuum = refs && refs.propsSys && refs.propsSys.vacuum;
    if (vacuum && !vacuum.broken) {
      const vp = vacuum.pos;
      const lp = thrownBody.position;
      const distToVac = Math.hypot(vp.x - lp.x, vp.z - lp.z);
      if (distToVac < 3.5) {
        setTimeout(() => {
          vacuum.damage(50, thrownBody, 12);
          floater(vp, "КРИТИЧЕСКИЙ УДАР ПЫЛЕСОСУ! -50 HP", "break");
        }, 180);
      }
    }
    lassoProp = null;
  }

  const api = {
    state: state,

    init: function (r) {
      refs = r;
      cacheEls();
      els.floaters = document.getElementById("floaters");
      if (KOTO.minimap) {
        KOTO.minimap.init({ scene: refs.scene, apt: refs.apt, cat: refs.cat, game: api });
      }
      renderQuests();
      updateHUD();
      // рекорд на стартовом экране
      const b = save.best();
      if (b) {
        els["start-record"].classList.remove("hidden");
        els["start-record"].textContent =
          "Рекорд: " + fmt(b.score) + " ₽ · комнат " + b.roomsDone + "/" + (b.roomsTotal || 4) +
          " · комбо ×" + b.maxCombo;
      }
    },

    start: function (duration: number = 45) {
      if (finishTimeoutId) { clearTimeout(finishTimeoutId); finishTimeoutId = null; }
      if (finishMeowTimeoutId) { clearTimeout(finishMeowTimeoutId); finishMeowTimeoutId = null; }
      if (typeof window !== 'undefined' && window.KOTO && window.KOTO.minimap) window.KOTO.minimap.clearNavTarget();
      if (refs) {
        if (refs.apt && refs.apt.resetApartment) refs.apt.resetApartment();
        if (refs.propsSys && refs.propsSys.resetProps) refs.propsSys.resetProps();
        else if (typeof window !== 'undefined' && window.KOTO && window.KOTO.propsSys && window.KOTO.propsSys.resetProps) window.KOTO.propsSys.resetProps();
        if (refs.cat && refs.cat.reset) refs.cat.reset({ x: -3.35, y: 0.26, z: 1.6 });
      }
      state.duration = duration;
      state.timeLeft = duration;
      state.startedAt = Date.now();
      state.newRecord = false;
      state.finishing = false;
      state.speedLeft = 0;
      state.speedBonus = 0;
      state.score = 0;
      state.combo = 0;
      state.comboT = 0;
      state.maxCombo = 0;
      state.broken = 0;
      state.dishes = 0;
      state.shake = 0;
      state.events.length = 0;
      QUESTS.forEach(function (qd: any) { state.quests[qd.id] = { step: 0, done: false }; });
      state.quest = state.quests.fish;
      state.mode = "play";
      state.paused = false;
      state.room = "living";
      state.progress = { living: 0, kitchen: 0, bath: 0, bedroom: 0 };
      state.level = { order: levels.ORDER, idx: 0, entered: { living: true }, done: [] };
      state.dailySpecial = null;
      state.dailySpecialDone = false;
      state.ultraChaos = false;
      state.ultraChaosT = 0;
      state.metaQuests = { vacuumSlayer: false, totalRampage: false, chaosStar: false };
      state.roomsVisitedInCombo = [];
      disasterTimer = 22 + Math.random() * 8;
      if (lassoProp) {
        lassoProp = null;
        if (els["hud-lasso"]) els["hud-lasso"].classList.add("hidden");
      }
      if (els["ultra-chaos-overlay"]) els["ultra-chaos-overlay"].classList.add("hidden");
      document.body.classList.remove("bloom-active");

      // GP-01: Выбор ежедневной цели (Daily Special)
      const allProps = (refs && refs.propsSys && refs.propsSys.props) || [];
      const eligible = allProps.filter((p: any) => p.breakable && (p.value >= 200 || p.name === "вазу"));
      if (eligible.length > 0) {
        const chosen = eligible[Math.floor(Math.random() * eligible.length)];
        chosen._isDailySpecial = true;
        state.dailySpecial = chosen.name;
        if (els["hud-daily-special"]) {
          els["hud-daily-special"].classList.remove("hidden");
          els["hud-daily-special"].classList.remove("done");
          if (els["daily-special-text"]) {
            els["daily-special-text"].textContent = "ЦЕЛЬ ДНЯ: " + chosen.name.toUpperCase() + " (×2.5)";
          }
        }
      } else if (els["hud-daily-special"]) {
        els["hud-daily-special"].classList.add("hidden");
      }

      els["screen-start"].classList.add("hidden");
      els["screen-pause"].classList.add("hidden");
      els["screen-end"].classList.add("hidden");
      els.hud.classList.remove("hidden");
      lastTimerText = "";
      lastRoomPts = -1;
      renderQuests();
      updateHUD();
      showBanner("📍 ГОСТИНАЯ • УРОВЕНЬ 1", "", 2.2);
      addFeed("Цель: ущерб " + fmt(levels.info("living").target) + " ₽ в «Гостиной»");
      bus.emit('game:start', { duration: duration });
    },

    update: function (dt) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
      if (state.mode !== "play" || state.paused) {
        updateFloaters(dt);
        if (KOTO.minimap) KOTO.minimap.update(dt);
        return;
      }
      if (!state.finishing) state.timeLeft -= dt;
      if (state.comboT > 0) {
        state.comboT -= dt;
        if (state.comboT <= 0) {
          state.combo = 0;
          state.roomsVisitedInCombo = [];
        }
      }
      if (state.ultraChaosT > 0) {
        state.ultraChaosT -= dt;
        if (state.ultraChaosT <= 0) {
          state.ultraChaos = false;
          if (els["ultra-chaos-overlay"]) els["ultra-chaos-overlay"].classList.add("hidden");
          document.body.classList.remove("bloom-active");
          addFeed("Режим Ультра-хаос завершён.");
        }
      }
      disasterTimer -= dt;
      if (disasterTimer <= 0) {
        disasterTimer = 22 + Math.random() * 8;
        triggerCatastrophe();
      }
      if (lassoProp && !lassoProp.broken && refs && refs.cat) {
        const cp = refs.cat.body.position;
        const f = refs.cat.forward();
        lassoProp.body.position.set(cp.x + f.x * 0.75, cp.y + 0.32, cp.z + f.z * 0.75);
        lassoProp.body.velocity.set(0, 0, 0);
      }
      const p = refs.cat.body.position;
      const room = levels.roomOf(p.x, p.z);
      if (room && room !== state.room) {
        state.room = room;
        onEnterRoom(room);
      }
      questChecks();
      progressAllQuests();
      checkLevel();
      updateHUD();
      updateFloaters(dt);
      if (KOTO.minimap) KOTO.minimap.update(dt);
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        updateHUD();
        finish();
      }
    },

    setPaused: function (p) {
      if (state.mode !== "play") return;
      state.paused = p;
      els["screen-pause"].classList.toggle("hidden", !p);
    },

    onPropImpact: onPropImpact,
    trySwipe: trySwipe,
    tryMeow: tryMeow,
    onWorldEvent: function (type, x, z, prop) {
      if (state.mode !== "play" || state.paused) return;
      onEvent({ type: "world", kind: type, room: levels.roomOf(x, z), prop: prop || null });
    },
    floater: floater,
    addFeed: addFeed,
    getComboRank: getComboRank,
    comboMult: comboMult,
    addScore: addScore,
    record: record,
    setHardMode: function (enable: boolean) {
      state.hardMode = enable;
    },
    onLassoHold: onLassoHold,
    onLassoRelease: onLassoRelease,
    getLassoProp: function () { return lassoProp; },
    triggerCatastrophe: triggerCatastrophe,
    getSnapshot: function () {
      return {
        mode: state.mode,
        paused: state.paused,
        score: state.score,
        combo: state.combo,
        comboT: state.comboT,
        comboMaxT: state.comboMaxT,
        maxCombo: state.maxCombo,
        timeLeft: state.timeLeft,
        duration: state.duration,
        broken: state.broken,
        dishes: state.dishes,
        shake: state.shake,
        room: state.room,
        progress: Object.assign({}, state.progress),
        level: {
          order: state.level.order.slice(),
          idx: state.level.idx,
          entered: Object.assign({}, state.level.entered),
          done: state.level.done.slice()
        },
        quests: JSON.parse(JSON.stringify(state.quests)),
        finishing: state.finishing,
        speedBonus: state.speedBonus,
        speedLeft: state.speedLeft
      };
    },
    applySnapshot: function (snap: any) {
      state.mode = snap.mode;
      state.paused = snap.paused;
      state.score = snap.score;
      state.combo = snap.combo;
      state.comboT = snap.comboT;
      state.comboMaxT = snap.comboMaxT;
      state.maxCombo = snap.maxCombo;
      state.timeLeft = snap.timeLeft;
      state.duration = snap.duration;
      state.broken = snap.broken;
      state.dishes = snap.dishes;
      state.shake = snap.shake;
      state.room = snap.room;
      state.progress = Object.assign({}, snap.progress);
      state.level = {
        order: snap.level.order.slice(),
        idx: snap.level.idx,
        entered: Object.assign({}, snap.level.entered),
        done: snap.level.done.slice()
      };
      state.quests = JSON.parse(JSON.stringify(snap.quests));
      state.finishing = snap.finishing;
      state.speedBonus = snap.speedBonus;
      state.speedLeft = snap.speedLeft;
      updateHUD();
      renderQuests();
    },
    toJSON: function () {
      return JSON.stringify(this.getSnapshot());
    },
    fromJSON: function (jsonStr: string) {
      this.applySnapshot(JSON.parse(jsonStr));
    }
  };

  bus.on('prop:impact', function (data) {
    onPropImpact(data.prop, data.velocity, data.isStrike);
  });
  bus.on('room:entered', function (data) {
    onEnterRoom(data.room);
  });

  if (typeof window !== 'undefined') {
    window.KOTO = window.KOTO || {};
    window.KOTO.game = api;
  }

  return api;
})();

export default game;
