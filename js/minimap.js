"use strict";

window.KOTO = window.KOTO || {};

KOTO.minimap = (function () {
  let canvas, ctx;
  let sceneRef, aptRef, catRef, gameRef;
  let waypointGroup = null;
  let waypointDiamond = null;
  let waypointRing = null;
  let waypointLight = null;

  let navTarget = null; // { doorId, x, z, room, name }
  let pulseTimer = 0;

  const MAP_ROOMS = [
    { id: "living",  name: "ГОСТИНАЯ", short: "ГОСТИНАЯ", x1: -7.0, x2: -1.5, z1: -4.5, z2: 4.5, color: "#d98a3d" },
    { id: "kitchen", name: "КУХНЯ",    short: "КУХНЯ",    x1: -1.5, x2: 7.125, z1: -4.5, z2: 0.6, color: "#4a90e2" },
    { id: "bath",    name: "ВАННАЯ",   short: "ВАННАЯ",   x1: -1.5, x2: 7.125, z1: 0.6, z2: 4.5, color: "#26c6da" },
    { id: "bedroom", name: "СПАЛЬНЯ",  short: "СПАЛЬНЯ",  x1: 7.125, x2: 11.0, z1: -4.5, z2: 4.5, color: "#ab47bc" }
  ];

  // Маппинг 3D координат квартиры в 2D пиксели миникарты (190 x 95)
  // X: [-7.2, 11.2] (ширина 18.4) -> [8, 182]
  // Z: [-4.7, 4.7] (высота 9.4) -> [7, 88]
  function toMap(x, z) {
    const mx = 8 + (x - (-7.2)) * 9.45;
    const my = 7 + (z - (-4.7)) * 8.61;
    return { x: mx, y: my };
  }

  function init(refs) {
    sceneRef = refs.scene;
    aptRef = refs.apt;
    catRef = refs.cat;
    gameRef = refs.game;

    canvas = document.getElementById("minimap-canvas");
    if (canvas) {
      ctx = canvas.getContext("2d");
    }

    // Создаём 3D маяк-указатель у открытой двери в сцене Three.js
    if (sceneRef && !waypointGroup) {
      waypointGroup = new THREE.Group();
      waypointGroup.visible = false;

      // Парящий светящийся кристалл (октаэдр)
      const diamondGeo = new THREE.OctahedronGeometry(0.24, 0);
      const diamondMat = new THREE.MeshStandardMaterial({
        color: "#ffd66b",
        emissive: "#ff9d4d",
        emissiveIntensity: 0.85,
        roughness: 0.2,
        metalness: 0.4
      });
      waypointDiamond = new THREE.Mesh(diamondGeo, diamondMat);
      waypointDiamond.position.y = 1.45;
      waypointGroup.add(waypointDiamond);

      // Пульсирующее кольцо на полу
      const ringGeo = new THREE.RingGeometry(0.36, 0.46, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: "#9fe08a",
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide
      });
      waypointRing = new THREE.Mesh(ringGeo, ringMat);
      waypointRing.rotation.x = -Math.PI / 2;
      waypointRing.position.y = 0.02;
      waypointGroup.add(waypointRing);

      // Точечный источник света маяка
      waypointLight = new THREE.PointLight("#ffd66b", 1.2, 4.5);
      waypointLight.position.y = 1.35;
      waypointGroup.add(waypointLight);

      sceneRef.add(waypointGroup);
    }
  }

  function setNavTarget(door, nextRoomId, nextRoomName) {
    if (!door) return;
    const doorCfg = KOTO.levels.DOORS[door.id];
    navTarget = {
      doorId: door.id,
      x: doorCfg.x,
      z: doorCfg.z,
      room: nextRoomId,
      name: nextRoomName || (KOTO.levels.info(nextRoomId) ? KOTO.levels.info(nextRoomId).name : nextRoomId)
    };

    // Активируем 3D маркер у дверного проёма
    if (waypointGroup) {
      waypointGroup.position.set(navTarget.x, 0, navTarget.z);
      waypointGroup.visible = true;
    }

    const navEl = document.getElementById("minimap-nav");
    if (navEl) navEl.classList.remove("hidden");
  }

  function clearNavTarget(roomEntered) {
    if (navTarget && (!roomEntered || navTarget.room === roomEntered)) {
      navTarget = null;
      if (waypointGroup) {
        waypointGroup.visible = false;
      }
      const navEl = document.getElementById("minimap-nav");
      if (navEl) navEl.classList.add("hidden");
    }
  }

  function update(dt) {
    if (!ctx || !canvas) return;
    pulseTimer += dt;

    const cat = catRef || (KOTO.cat && KOTO.cat.body ? KOTO.cat : null);
    const catPos = cat ? cat.body.position : { x: -3.5, y: 0.26, z: 1.5 };
    const catYaw = cat ? cat.yaw : 0;
    const currentRoom = (KOTO.game && KOTO.game.state) ? KOTO.game.state.room : "living";
    const doneRooms = (KOTO.game && KOTO.game.state && KOTO.game.state.level) ? KOTO.game.state.level.done : [];

    // Обновляем заголовок текущей комнаты в шапке миникарты
    const roomTitleEl = document.getElementById("minimap-room-title");
    if (roomTitleEl && KOTO.levels.info(currentRoom)) {
      roomTitleEl.textContent = KOTO.levels.info(currentRoom).name.toUpperCase();
    }

    // Обновляем 3D маяк
    if (waypointGroup && waypointGroup.visible && navTarget) {
      const t = pulseTimer;
      waypointDiamond.position.y = 1.4 + Math.sin(t * 4.2) * 0.12;
      waypointDiamond.rotation.y += dt * 2.2;
      waypointDiamond.rotation.z = Math.sin(t * 2.5) * 0.15;
      const ringScale = 1 + Math.sin(t * 5.0) * 0.15;
      waypointRing.scale.set(ringScale, ringScale, ringScale);

      // Обновляем текст дистанции до цели
      const dist = Math.hypot(catPos.x - navTarget.x, catPos.z - navTarget.z);
      const distEl = document.getElementById("minimap-nav-dist");
      if (distEl) distEl.textContent = dist.toFixed(1) + " м";

      const navTextEl = document.getElementById("minimap-nav-text");
      if (navTextEl) navTextEl.textContent = "ИДИ: " + navTarget.name.toUpperCase();
    }

    // ---------- ОТРИСОВКА 2D МИНИКАРТЫ ----------
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Фон миникарты (план квартиры)
    ctx.fillStyle = "#0c101c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Сетка тонких линий для архитектурного вида
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let gx = 18; gx < canvas.width; gx += 18) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, canvas.height); ctx.stroke();
    }
    for (let gy = 18; gy < canvas.height; gy += 18) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(canvas.width, gy); ctx.stroke();
    }

    // 2. Отрисовка комнат
    for (let i = 0; i < MAP_ROOMS.length; i++) {
      const r = MAP_ROOMS[i];
      const p1 = toMap(r.x1, r.z1);
      const p2 = toMap(r.x2, r.z2);
      const rw = p2.x - p1.x;
      const rh = p2.y - p1.y;

      const isCurrent = (currentRoom === r.id);
      const isDone = (doneRooms.indexOf(r.id) >= 0);

      // Заливка комнаты
      if (isCurrent) {
        ctx.fillStyle = "rgba(255, 214, 107, 0.22)";
      } else if (isDone) {
        ctx.fillStyle = "rgba(159, 224, 138, 0.14)";
      } else {
        ctx.fillStyle = "rgba(25, 32, 48, 0.5)";
      }
      ctx.fillRect(p1.x, p1.y, rw, rh);

      // Контур комнаты
      if (isCurrent) {
        ctx.strokeStyle = "#ffd66b";
        ctx.lineWidth = 1.8;
      } else if (isDone) {
        ctx.strokeStyle = "rgba(159, 224, 138, 0.6)";
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(p1.x, p1.y, rw, rh);

      // Название комнаты
      ctx.fillStyle = isCurrent ? "#ffd66b" : (isDone ? "#9fe08a" : "rgba(255, 255, 255, 0.45)");
      ctx.font = isCurrent ? "bold 8px 'Segoe UI', system-ui, sans-serif" : "7px 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(r.short, p1.x + rw / 2, p1.y + rh / 2);
    }

    // 3. Отрисовка дверей (A, B, V)
    const doors = aptRef ? aptRef.doors : {};
    const DOORS_CFG = KOTO.levels.DOORS;

    Object.keys(DOORS_CFG).forEach(function (did) {
      const dcfg = DOORS_CFG[did];
      const dp = toMap(dcfg.x, dcfg.z);
      const doorObj = doors[did];
      const isOpen = doorObj ? doorObj.isOpen : false;
      const isTarget = navTarget && (navTarget.doorId === did);

      if (isTarget) {
        // Пульсирующий маячок цели на двери
        const pulse = (pulseTimer * 1.8) % 1.0;
        const pr = 4 + pulse * 10;
        ctx.strokeStyle = "rgba(159, 224, 138, " + (1 - pulse) + ")";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, pr, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = "#9fe08a";
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (isOpen) {
        // Открытая дверь (зелёная отметка)
        ctx.fillStyle = "#9fe08a";
        ctx.beginPath();
        ctx.arc(dp.x, dp.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Закрытая дверь (красная черта)
        ctx.strokeStyle = "#ff4d4d";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (did === "A" || did === "B") {
          ctx.moveTo(dp.x, dp.y - 4); ctx.lineTo(dp.x, dp.y + 4);
        } else {
          ctx.moveTo(dp.x, dp.y - 4); ctx.lineTo(dp.x, dp.y + 4);
        }
        ctx.stroke();
      }
    });

    // 4. Пунктирная траектория-указатель от кота к целевой двери
    const catMap = toMap(catPos.x, catPos.z);
    if (navTarget) {
      const targetMap = toMap(navTarget.x, navTarget.z);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -pulseTimer * 18;
      ctx.strokeStyle = "rgba(159, 224, 138, 0.75)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(catMap.x, catMap.y);
      ctx.lineTo(targetMap.x, targetMap.y);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Робот-пылесос («Жорка-3000») на миникарте
    const vac = KOTO.propsSys ? KOTO.propsSys.vacuum : null;
    if (vac && vac.pos) {
      const vp = toMap(vac.pos.x, vac.pos.z);
      if (vac.broken) {
        // Сломанный: серый крестик
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(vp.x - 2.5, vp.y - 2.5); ctx.lineTo(vp.x + 2.5, vp.y + 2.5);
        ctx.moveTo(vp.x + 2.5, vp.y - 2.5); ctx.lineTo(vp.x - 2.5, vp.y + 2.5);
        ctx.stroke();
      } else {
        // Живой робот: сине-зелёная точка с радиусом сканирования
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(vp.x, vp.y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // 6. Позиция и направление игрока (Кот)
    ctx.save();
    ctx.translate(catMap.x, catMap.y);

    // Свечение под котом
    ctx.fillStyle = "rgba(255, 157, 77, 0.4)";
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Стрелка-треугольник направления взгляда кота
    // В игровом мире: yaw = 0 смотрит по +Z (вниз по карте), yaw = PI/2 по +X (вправо)
    // Преобразуем в угол на 2D холсте:
    const mapAngle = -catYaw + Math.PI / 2;
    ctx.rotate(mapAngle);

    ctx.fillStyle = "#ffd66b";
    ctx.strokeStyle = "#1a0f00";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -5.5); // нос кота
    ctx.lineTo(3.8, 4.2);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-3.8, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  return {
    init: init,
    update: update,
    setNavTarget: setNavTarget,
    clearNavTarget: clearNavTarget,
    getNavTarget: function () { return navTarget; }
  };
})();
