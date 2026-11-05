"use strict";

// Конфиг уровней-комнат: границы, пороги очков, двери, бонусы времени.
// Единый источник правды для game.js / world.js / props.js / main.js.
window.KOTO = window.KOTO || {};

KOTO.levels = (function () {
  // Порог ущерба для прохождения комнаты; бонус времени выдаётся
  // при переходе на уровень этой комнаты (startTime — уровень 1, гостиная).
  const ROOMS = {
    living:  { name: "Гостиная", target: 18000, timeBonus: 0,  aabb: { x1: -7.0, x2: -1.5, z1: -4.5, z2: 4.5 } },
    kitchen: { name: "Кухня",    target: 24000, timeBonus: 40, aabb: { x1: -1.5, x2: 7.125, z1: -4.5, z2: 0.6 } },
    bath:    { name: "Ванная",   target: 6000,  timeBonus: 30, aabb: { x1: -1.5, x2: 7.125, z1: 0.6, z2: 4.5 } },
    bedroom: { name: "Спальня",  target: 8000,  timeBonus: 30, aabb: { x1: 7.125, x2: 11.0, z1: -4.5, z2: 4.5 } }
  };

  const ORDER = ["living", "kitchen", "bath", "bedroom"];

  // Премия Синдиката за скорость: выплачивается ПОСЛЕ КАЖДОЙ пройденной комнаты —
  // весь остаток времени на таймере в этот момент конвертируется в рубли.
  // Кот успел исчезнуть — заказчик платит за нулевой риск срыва контракта.
  const SPEED_BONUS_PER_SEC = 50;

  // Дверные проёмы (из js/world.js: разрывы в перегородках, ширина по стенам).
  // Панель двери строится по этим данным в world.js.
  const DOORS = {
    A: { rooms: ["living", "kitchen"], x: -1.5, z: -1.7, width: 1.2, sign: "Кухня" },
    B: { rooms: ["living", "bath"], x: -1.5, z: 2.2, width: 1.2, sign: "Ванная" },
    V: { rooms: ["kitchen", "bedroom"], x: 7.125, z: -1.2, width: 1.0, sign: "Спальня" }
  };

  function inside(a, x, z) {
    return x > a.x1 && x < a.x2 && z > a.z1 && z < a.z2;
  }

  function roomOf(x, z) {
    for (let i = 0; i < ORDER.length; i++) {
      if (inside(ROOMS[ORDER[i]].aabb, x, z)) return ORDER[i];
    }
    return null;
  }

  function info(id) { return ROOMS[id]; }

  return { ROOMS: ROOMS, ORDER: ORDER, DOORS: DOORS, SPEED_BONUS_PER_SEC: SPEED_BONUS_PER_SEC, roomOf: roomOf, info: info };
})();
