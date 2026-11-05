"use strict";

window.KOTO = window.KOTO || {};

KOTO.game = (function () {
  const DISHES = ["тарелку", "кружку", "вазу", "банку", "банку кофе", "соль", "вино", "стакан с щётками", "миску с водой", "миску с кормом", "аквариум", "духи"];
  // факты квестов фиксируются независимо от порядка, цепочка шагов догоняет факты
  const QUESTS = [
    {
      id: "fish", title: "Операция «Рыбный день»", reward: 2000, doneText: "Квест: съел рыбку",
      steps: ["Запрыгни на кухонный стол", "Сбрось аквариум со столешницы", "Сожри рыбку"],
      stepFacts: ["tableTop", "fishbowlDown", "fishEaten"]
    },
    {
      id: "bedroom", title: "Рейд «Тихий час»", reward: 1500, doneText: "Квест: спальня разгромлена",
      steps: ["Запрыгни на кровать", "Разбей прикроватную лампу", "Поточи когти о ковёр в спальне"],
      stepFacts: ["bedTop", "lampDown", "rugScratched"]
    }
  ];

  const state = {
    mode: "menu", paused: false,
    score: 0, combo: 0, comboT: 0, maxCombo: 0,
    timeLeft: 60, duration: 60,
    broken: 0, dishes: 0,
    events: [], shake: 0,
    quests: {
      fish: { step: 0, done: false, fishbowlDown: false, tableTop: false, fishEaten: false },
      bedroom: { step: 0, done: false, bedTop: false, lampDown: false, rugScratched: false }
    }
  };
  state.quest = state.quests.fish; // совместимость со старыми тестами

  let refs = null;
  let els = {};
  const floaters = [];

  function fmt(n) { return n.toLocaleString("ru-RU"); }

  function cacheEls() {
    ["hud", "hud-score", "hud-combo", "hud-combo-x", "hud-combo-bar", "hud-timer",
      "hud-feed", "hud-hint", "banner",
      "screen-start", "screen-pause", "screen-end", "end-subtitle", "end-report",
      "end-counters", "end-total", "end-rank", "end-quest", "errlog"
    ].forEach(function (id) { els[id] = document.getElementById(id); });
    els.questCards = [];
    for (let i = 0; i < QUESTS.length; i++) {
      const card = document.getElementById("hud-quest-" + i);
      els.questCards.push({
        root: card,
        title: card.querySelector(".hud-quest-title"),
        steps: card.querySelector(".hud-quest-steps"),
        reward: card.querySelector(".hud-quest-reward")
      });
    }
  }

  function comboMult() { return 1 + Math.min(Math.max(state.combo - 1, 0), 8) * 0.25; }

  function comboUp() {
    state.combo += 1;
    state.comboT = 2.5;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  }

  function addScore(pts) { state.score += pts; }

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
      addScore(pts);
      record("Сбил: " + prop.name, pts);
      floater(prop.body.position, "+" + fmt(pts) + "₽", "");
      addFeed("Сбил: " + prop.name + " +" + fmt(pts) + "₽");
      if (v > 2.2) AudioSys.crash(0.3); else AudioSys.thud();
    }
    if (prop.onScore) prop.onScore(api, prop);
  }

  function breakProp(prop, v, mult) {
    const pts = Math.round(prop.value * mult);
    addScore(pts);
    state.broken += 1;
    if (prop.name === "аквариум") state.quests.fish.fishbowlDown = true;
    if (prop.name === "лампу") state.quests.bedroom.lampDown = true;
    if (DISHES.indexOf(prop.name) >= 0) state.dishes += 1;
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
        if (d < 1.1) releaseHang(prop);
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
        if (t.questId === "bedrug") state.quests.bedroom.rugScratched = true;
        const pts = Math.round(t.points * (state.combo > 0 ? comboMult() : 1));
        addScore(pts);
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

  function renderQuests() {
    for (let i = 0; i < QUESTS.length; i++) {
      const qd = QUESTS[i];
      const q = state.quests[qd.id];
      const card = els.questCards[i];
      let html = "";
      for (let s = 0; s < qd.steps.length; s++) {
        const cls = s < q.step ? "done" : (s === q.step ? "current" : "");
        html += '<li class="' + cls + '">' + qd.steps[s] + "</li>";
      }
      card.steps.innerHTML = html;
      card.root.classList.toggle("all-done", q.done);
    }
  }

  function completeStep(q) {
    const qd = QUESTS.filter(function (d) { return state.quests[d.id] === q; })[0];
    q.step += 1;
    AudioSys.tinkle();
    const cp = refs.cat.body.position;
    if (q.step >= qd.steps.length) {
      q.done = true;
      addScore(qd.reward);
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

  function progressQuest(q) {
    const qd = QUESTS.filter(function (d) { return state.quests[d.id] === q; })[0];
    let guard = 0;
    while (!q.done && guard++ < 3) {
      const fact = qd.stepFacts[q.step];
      if (q[fact]) completeStep(q); else break;
    }
  }

  function questChecks() {
    const Q = state.quests;
    const p = refs.cat.body.position;
    // факты фиксируются независимо от порядка шагов
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
    // цепочки догоняют уже свершившиеся факты (любой порядок выполнения)
    progressQuest(Q.fish);
    progressQuest(Q.bedroom);
  }

  let lastTimerText = "";
  function updateHUD() {
    els["hud-score"].textContent = fmt(state.score) + " ₽";
    const sec = Math.max(0, Math.ceil(state.timeLeft));
    const txt = Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2);
    if (txt !== lastTimerText) {
      lastTimerText = txt;
      els["hud-timer"].textContent = txt;
      els["hud-timer"].classList.toggle("low", sec <= 10 && state.mode === "play");
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

  function fillEnd() {
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
      "<br>максимальное комбо: " + state.maxCombo + " подряд";
    els["end-total"].textContent = fmt(state.score) + " ₽";
    const r = rank(state.score);
    els["end-rank"].innerHTML = '<div class="rank">' + r[0] + '</div><div class="rank-sub">' + r[1] + "</div>";
    const questLines = {
      fish: state.quests.fish.done
        ? "«Рыбный день» — выполнен: рыбка съедена. Свидетелей нет."
        : "«Рыбный день» — провален: рыбка выжила и запомнила всё.",
      bedroom: state.quests.bedroom.done
        ? "«Тихий час» — выполнен: спальня разгромлена идеально."
        : "«Тихий час» — провален: спальня осталась недостаточно разгромленной."
    };
    els["end-quest"].innerHTML = questLines.fish + "<br>" + questLines.bedroom;
    const stats = {
      score: state.score, broken: state.broken, dishes: state.dishes, maxCombo: state.maxCombo,
      quest: state.quests.fish.done, questBedroom: state.quests.bedroom.done, events: rows.length
    };
    window.__stats = stats;
    els.errlog.dataset.stats = JSON.stringify(stats);
  }

  function finish() {
    if (state.mode !== "play") return;
    state.mode = "over";
    if (document.exitPointerLock) document.exitPointerLock();
    els.banner.textContent = "ХОЗЯЕВА ВЕРНУЛИСЬ!";
    els.banner.classList.remove("hidden");
    AudioSys.knock();
    setTimeout(function () { refs.cat.meowT = 0.55; AudioSys.meow(); }, 700);
    setTimeout(function () {
      fillEnd();
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
    },

    start: function (duration) {
      state.duration = duration;
      state.timeLeft = duration;
      state.mode = "play";
      state.paused = false;
      els["screen-start"].classList.add("hidden");
      els["screen-pause"].classList.add("hidden");
      els["screen-end"].classList.add("hidden");
      els.hud.classList.remove("hidden");
      lastTimerText = "";
      renderQuests();
      updateHUD();
    },

    update: function (dt) {
      if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
      if (state.mode !== "play" || state.paused) {
        updateFloaters(dt);
        return;
      }
      state.timeLeft -= dt;
      if (state.comboT > 0) {
        state.comboT -= dt;
        if (state.comboT <= 0) state.combo = 0;
      }
      questChecks();
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
    floater: floater,
    addFeed: addFeed
  };
  return api;
})();
