"use strict";

window.KOTO = window.KOTO || {};

KOTO.game = (function () {
  const DISHES = ["тарелку", "кружку", "вазу", "банку", "банку кофе", "соль", "вино", "стакан с щётками", "миску с водой", "миску с кормом", "аквариум", "духи"];
  // Квесты привязаны к комнатам. Факты фиксируются в любом порядке (события + проверки),
  // цепочка шагов догоняет факты. fact: строка-поле состояния или функция (q, state).
  const QUESTS = [
    {
      id: "art", room: "living", title: "Арт-критик", reward: 1500, mandatory: true,
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
      id: "tea", room: "living", title: "Чаепитие", reward: 600, optional: true,
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
      id: "speed", room: "living", title: "Разгон", reward: 600, optional: true,
      doneText: "«Разгон» — выполнен: кот разогрят.",
      steps: [{ text: "Собери комбо ×5", fact: function (q, st) { return st.maxCombo >= 5; } }]
    },
    {
      id: "fish", room: "kitchen", title: "Операция «Рыбный день»", reward: 2000, mandatory: true,
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
      id: "dishes5", room: "kitchen", title: "Посудомойка", reward: 800, optional: true,
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
      id: "fry", room: "kitchen", title: "Жарка", reward: 800, optional: true,
      doneText: "«Жарка» — выполнена: кот на пределе.",
      steps: [{ text: "Собери комбо ×8", fact: function (q, st) { return st.maxCombo >= 8; } }]
    },
    {
      id: "bathfun", room: "bath", title: "Водные процедуры", reward: 1500, mandatory: true,
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
      id: "foam", room: "bath", title: "Пена", reward: 500, optional: true,
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
      id: "hygiene", room: "bath", title: "Гигиена", reward: 500, optional: true,
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
      id: "bedroom", room: "bedroom", title: "Рейд «Тихий час»", reward: 1500, mandatory: true,
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
      id: "wakeup", room: "bedroom", title: "Побудка", reward: 500, optional: true,
      doneText: "«Побудка» — выполнена: будильник замолчал навсегда.",
      steps: [{ text: "Разбей будильник", fact: "clockBroken" }],
      onEvent: function (q, ev) {
        if (ev.room === "bedroom" && ev.type === "break" && ev.name === "будильник") q.clockBroken = true;
      }
    },
    {
      id: "perfume", room: "bedroom", title: "Духи", reward: 500, optional: true,
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

  const state = {
    mode: "menu", paused: false,
    score: 0, combo: 0, comboT: 0, maxCombo: 0,
    timeLeft: 60, duration: 60,
    broken: 0, dishes: 0,
    events: [], shake: 0,
    room: "living",
    progress: { living: 0, kitchen: 0, bath: 0, bedroom: 0 },
    level: { order: KOTO.levels.ORDER, idx: 0, entered: { living: true }, done: [] },
    quests: {}
  };
  QUESTS.forEach(function (qd) { state.quests[qd.id] = { step: 0, done: false }; });
  state.quest = state.quests.fish; // совместимость со старыми тестами

  let refs = null;
  let els = {};
  const floaters = [];

  function fmt(n) { return n.toLocaleString("ru-RU"); }

  function cacheEls() {
    ["hud", "hud-score", "hud-combo", "hud-combo-x", "hud-combo-bar", "hud-timer",
      "hud-feed", "hud-hint", "banner", "hud-quests",
      "hud-room", "hud-room-name", "hud-room-pts", "hud-room-bar",
      "screen-start", "screen-pause", "screen-end", "end-title", "end-subtitle", "end-report",
      "end-counters", "end-total", "end-rank", "end-quest", "end-record", "end-rooms", "start-record", "errlog"
    ].forEach(function (id) { els[id] = document.getElementById(id); });
  }

  function comboMult() { return 1 + Math.min(Math.max(state.combo - 1, 0), 8) * 0.25; }

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
    const ids = Object.keys(KOTO.levels.DOORS);
    for (let i = 0; i < ids.length; i++) {
      if (KOTO.levels.DOORS[ids[i]].rooms.indexOf(nextId) >= 0) {
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
    const info = KOTO.levels.info(room);
    const nextId = lv.order[lv.idx];
    AudioSys.fanfare();
    state.shake = Math.min(1, state.shake + 0.3);
    showBanner(info.name.toUpperCase() + " ПРОЙДЕНА!", "good", 2.2);
    const cp = refs.cat.body.position;
    if (nextId) {
      const next = KOTO.levels.info(nextId);
      if (next.timeBonus > 0) {
        state.timeLeft += next.timeBonus;
        floater({ x: cp.x, y: cp.y + 0.6, z: cp.z }, "+" + next.timeBonus + " СЕК", "quest");
      }
      const door = doorTo(nextId);
      if (door) door.open();
      addFeed("Дверь в «" + next.name + "» открыта — иди туда");
    } else {
      addFeed("Вся квартира разгромлена!");
      state.finishing = true; // таймер замирает: секунды фиксируются под премию
      state.speedLeft = Math.max(0, Math.floor(state.timeLeft));
      setTimeout(function () { finish(true); }, 1800);
    }
  }

  function checkLevel() {
    const lv = state.level;
    const target = lv.order[lv.idx];
    if (!target || lv.done.indexOf(target) >= 0) return;
    if (state.progress[target] < KOTO.levels.info(target).target) return;
    if (!mandatoryQuestsDone(target)) return;
    completeLevel(target);
  }

  function onEnterRoom(room) {
    const lv = state.level;
    if (lv.order[lv.idx] !== room || lv.entered[room]) return;
    lv.entered[room] = true;
    AudioSys.tinkle();
    const info = KOTO.levels.info(room);
    showBanner("УРОВЕНЬ " + (lv.idx + 1) + " — " + info.name.toUpperCase(), "", 2.0);
    addFeed("Цель: ущерб " + fmt(info.target) + " ₽ в «" + info.name + "»");
    renderQuests();
  }

  function comboUp() {
    state.combo += 1;
    state.comboT = 2.5;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  }

  function addScore(pts, room) {
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

  function onPropImpact(prop, v) {
    if (state.mode !== "play" || state.paused) return;
    if (prop.broken || prop.scoreCd > 0) return;
    if (prop.hang && !prop.released) return;
    if (v < 1.1) return;
    prop.scoreCd = 1.0;
    comboUp();
    const mult = comboMult();
    if (prop.breakable && v >= prop.breakVel) {
      breakProp(prop, v, mult);
    } else {
      const pts = Math.round(prop.value * mult);
      addScore(pts, prop.room);
      record("Сбил: " + prop.name, pts);
      floater(prop.body.position, "+" + fmt(pts) + "₽", "");
      addFeed("Сбил: " + prop.name + " +" + fmt(pts) + "₽");
      if (v > 2.2) AudioSys.crash(0.3); else AudioSys.thud();
      onEvent({ type: "knock", name: prop.name, room: prop.room, prop: prop });
    }
    if (prop.onScore) prop.onScore(api, prop);
  }

  function breakProp(prop, v, mult) {
    const pts = Math.round(prop.value * mult);
    addScore(pts, prop.room);
    state.broken += 1;
    if (DISHES.indexOf(prop.name) >= 0) state.dishes += 1;
    onEvent({ type: "break", name: prop.name, room: prop.room, prop: prop });
    record("Разбил: " + prop.name, pts);
    KOTO.propsSys.spawnShards(prop.body.position, prop.shardColor, 6, prop.body.velocity);
    KOTO.propsSys.removeProp(prop);
    floater(prop.body.position, "+" + fmt(pts) + "₽", "break");
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
    b.velocity.set((Math.random() - 0.5) * 0.5, 0.3, -(0.5 + Math.random() * 0.8));
    b.angularVelocity.set((Math.random() - 0.5) * 5, 0, (Math.random() - 0.5) * 5);
    b.wakeUp();
    AudioSys.thud();
    onEvent({ type: "hang", room: prop.room, prop: prop });
  }

  function trySwipe() {
    if (state.mode !== "play" || state.paused) return;
    const cat = refs.cat;
    cat.swipeT = 0.25;
    const cp = cat.body.position;
    const f = cat.forward();
    for (const prop of KOTO.propsSys.props) {
      if (prop.broken) continue;
      const p = prop.body.position;
      const dx = p.x - cp.x, dy = p.y - cp.y, dz = p.z - cp.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (prop.hang && !prop.released) {
        if (d < 1.6) releaseHang(prop);
        continue;
      }
      if (d > 1.0 || d < 0.001) continue;
      const dot = (dx * f.x + dz * f.z) / d;
      if (dot < 0.2) continue;
      const b = prop.body;
      b.wakeUp();
      const J = Math.min(8, Math.max(1.2, 2.8 * prop.mass));
      const nx = dx / d, nz = dz / d, ny = Math.max(0.2, dy / d);
      b.applyImpulse(new CANNON.Vec3(nx * J, ny * J * 0.8 + 0.6, nz * J), new CANNON.Vec3(0, 0, 0));
      b.angularVelocity.x += (Math.random() - 0.5) * 6;
      b.angularVelocity.z += (Math.random() - 0.5) * 6;
    }
    for (const t of KOTO.propsSys.scratchTargets) {
      if (t.cd > 0) continue;
      const dx = t.x - cp.x, dz = t.z - cp.z;
      if (Math.sqrt(dx * dx + dz * dz) < t.r + 0.5) {
        t.cd = 2.2;
        const sf = SCRATCH_FACTS[t.questId];
        if (sf) state.quests[sf[0]][sf[1]] = true;
        const pts = Math.round(t.points * (state.combo > 0 ? comboMult() : 1));
        addScore(pts, KOTO.levels.roomOf(t.x, t.z));
        record("Подрал: " + t.name, pts);
        floater({ x: t.x, y: cp.y + 0.4, z: t.z }, "подрал " + t.name + " +" + pts + "₽", "scratch");
        AudioSys.scratch();
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
    for (const prop of KOTO.propsSys.props) {
      if (prop.broken || (prop.hang && !prop.released)) continue;
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
    KOTO.levels.ORDER.forEach(function (roomId) {
      const info = KOTO.levels.info(roomId);
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
      addScore(qd.reward, qd.room);
      record(qd.doneText, qd.reward);
      floater({ x: cp.x, y: cp.y + 0.5, z: cp.z }, "КВЕСТ ВЫПОЛНЕН! +" + fmt(qd.reward) + "₽", "quest");
      addFeed("«" + qd.title + "» выполнен! +" + fmt(qd.reward) + "₽");
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
    const info = KOTO.levels.info(state.room);
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
      els["hud-combo-x"].textContent = "КОМБО ×" + comboMult().toFixed(2).replace(/\.?0+$/, "");
      els["hud-combo-bar"].style.width = (state.comboT / 2.5 * 100) + "%";
    } else {
      els["hud-combo"].classList.add("hidden");
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
    if (total < 4000) return ["Ласковый пушистик", "Хозяева ничего не заметили. Почти."];
    if (total < 12000) return ["Мелкий хулиган", "Мимо вазы теперь лучше не проходить."];
    if (total < 25000) return ["Сертифицированный вандал", "Ковёр, считай, обновлён. Дизайнерский."];
    if (total < 45000) return ["Агент хаоса", "Страховая компания отключила телефон."];
    return ["ЛЕГЕНДА КВАРТИРЫ", "Соседи снизу тоже в шоке. И в штукатурке."];
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
        ? "<br>премия Синдиката за скорость: +" + fmt(state.speedBonus) + " ₽ (" + state.speedLeft + " с × " + KOTO.levels.SPEED_BONUS_PER_SEC + ")"
        : "");
    els["end-total"].textContent = fmt(state.score) + " ₽";
    els["end-title"].textContent = win ? "КВАРТИРА РАЗГРОМЛЕНА!" : "ХОЗЯЕВА ВЕРНУЛИСЬ!";
    const r = rank(state.score);
    els["end-rank"].innerHTML = '<div class="rank">' + r[0] + '</div><div class="rank-sub">' + r[1] + "</div>";
    const questLines = QUESTS.filter(function (qd) { return qd.mandatory; }).map(function (qd) {
      const q = state.quests[qd.id];
      return q.done ? qd.doneText : qd.failText;
    });
    els["end-quest"].innerHTML = questLines.join("<br>");
    els["end-rooms"].innerHTML = KOTO.levels.ORDER.map(function (rid) {
      const info = KOTO.levels.info(rid);
      const roomDone = state.level.done.indexOf(rid) >= 0;
      return "<li><span>" + (roomDone ? "✔ " : "○ ") + info.name + "</span><span>" +
        fmt(Math.round(state.progress[rid] || 0)) + " ₽</span></li>";
    }).join("");
    const b = KOTO.save.best();
    if (state.newRecord) {
      els["end-record"].innerHTML =
        '<div class="rec-new">НОВЫЙ РЕКОРД!</div><div class="rec-sub">' + fmt(state.score) + " ₽</div>";
    } else if (b) {
      els["end-record"].innerHTML = '<div class="rec-sub">рекорд: ' + fmt(b.score) + " ₽</div>";
    } else {
      els["end-record"].innerHTML = "";
    }
    const stats = {
      score: state.score, broken: state.broken, dishes: state.dishes, maxCombo: state.maxCombo,
      quest: state.quests.fish.done, questBedroom: state.quests.bedroom.done, events: rows.length,
      roomsDone: state.level.done.length, roomsTotal: state.level.order.length, win: !!win,
      speedBonus: state.speedBonus, speedLeft: state.speedLeft
    };
    window.__stats = stats;
    els.errlog.dataset.stats = JSON.stringify(stats);
  }

  function finish(win) {
    if (state.mode !== "play") return;
    state.mode = "over";
    if (document.exitPointerLock) document.exitPointerLock();
    // премия Синдиката за скорость: неизрасходованные секунды → рубли
    if (win && state.speedLeft > 0) {
      const rate = KOTO.levels.SPEED_BONUS_PER_SEC;
      state.speedBonus = state.speedLeft * rate;
      addScore(state.speedBonus);
      const cp = refs.cat.body.position;
      floater({ x: cp.x, y: cp.y + 0.7, z: cp.z }, "ПРЕМИЯ ЗА СКОРОСТЬ +" + fmt(state.speedBonus) + "₽", "quest");
      addFeed("Синдикат платит за оперативность: +" + fmt(state.speedBonus) + " ₽ (" + state.speedLeft + " с × " + rate + ")");
    }
    state.newRecord = KOTO.save.isRecord(state.score);
    KOTO.save.recordRun({
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
    setTimeout(function () { refs.cat.meowT = 0.55; AudioSys.meow(); }, 700);
    setTimeout(function () {
      fillEnd(win);
      els.banner.classList.add("hidden");
      els.hud.classList.add("hidden");
      els["screen-end"].classList.remove("hidden");
    }, 2000);
  }

  const api = {
    state: state,

    init: function (r) {
      refs = r;
      cacheEls();
      els.floaters = document.getElementById("floaters");
      renderQuests();
      updateHUD();
      // рекорд на стартовом экране
      const b = KOTO.save.best();
      if (b) {
        els["start-record"].classList.remove("hidden");
        els["start-record"].textContent =
          "Рекорд: " + fmt(b.score) + " ₽ · комнат " + b.roomsDone + "/" + (b.roomsTotal || 4) +
          " · комбо ×" + b.maxCombo;
      }
    },

    start: function (duration) {
      state.duration = duration;
      state.timeLeft = duration;
      state.startedAt = Date.now();
      state.newRecord = false;
      state.finishing = false;
      state.speedLeft = 0;
      state.speedBonus = 0;
      state.mode = "play";
      state.paused = false;
      state.room = "living";
      state.progress = { living: 0, kitchen: 0, bath: 0, bedroom: 0 };
      state.level = { order: KOTO.levels.ORDER, idx: 0, entered: { living: true }, done: [] };
      els["screen-start"].classList.add("hidden");
      els["screen-pause"].classList.add("hidden");
      els["screen-end"].classList.add("hidden");
      els.hud.classList.remove("hidden");
      lastTimerText = "";
      lastRoomPts = -1;
      renderQuests();
      updateHUD();
      showBanner("УРОВЕНЬ 1 — ГОСТИНАЯ", "", 2.2);
      addFeed("Цель: ущерб " + fmt(KOTO.levels.info("living").target) + " ₽ в «Гостиной»");
    },

    update: function (dt) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
      if (state.mode !== "play" || state.paused) {
        updateFloaters(dt);
        return;
      }
      if (!state.finishing) state.timeLeft -= dt;
      if (state.comboT > 0) {
        state.comboT -= dt;
        if (state.comboT <= 0) state.combo = 0;
      }
      const p = refs.cat.body.position;
      const room = KOTO.levels.roomOf(p.x, p.z);
      if (room && room !== state.room) {
        state.room = room;
        onEnterRoom(room);
      }
      questChecks();
      progressAllQuests();
      checkLevel();
      updateHUD();
      updateFloaters(dt);
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
      onEvent({ type: "world", kind: type, room: KOTO.levels.roomOf(x, z), prop: prop || null });
    },
    floater: floater,
    addFeed: addFeed
  };
  return api;
})();
