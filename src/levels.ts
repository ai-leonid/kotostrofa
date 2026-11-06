import type { RoomId } from './types/game'

export interface RoomAABB {
  x1: number
  x2: number
  z1: number
  z2: number
}

export interface RoomConfig {
  name: string
  target: number
  timeBonus: number
  aabb: RoomAABB
}

export interface DoorConfig {
  rooms: [RoomId, RoomId]
  x: number
  z: number
  width: number
  sign: string
}

export const ROOMS: Record<RoomId, RoomConfig> = {
  living: { name: 'Гостиная', target: 18000, timeBonus: 0, aabb: { x1: -7.0, x2: -1.5, z1: -4.5, z2: 4.5 } },
  kitchen: { name: 'Кухня', target: 24000, timeBonus: 40, aabb: { x1: -1.5, x2: 7.125, z1: -4.5, z2: 0.6 } },
  bath: { name: 'Ванная', target: 6000, timeBonus: 30, aabb: { x1: -1.5, x2: 7.125, z1: 0.6, z2: 4.5 } },
  bedroom: { name: 'Спальня', target: 8000, timeBonus: 30, aabb: { x1: 7.125, x2: 11.0, z1: -4.5, z2: 4.5 } }
}

export const ORDER: RoomId[] = ['living', 'kitchen', 'bath', 'bedroom']

export const SPEED_BONUS_PER_SEC = 50

export const DOORS: Record<string, DoorConfig> = {
  A: { rooms: ['living', 'kitchen'], x: -1.5, z: -1.7, width: 1.2, sign: 'Кухня' },
  B: { rooms: ['living', 'bath'], x: -1.5, z: 2.2, width: 1.2, sign: 'Ванная' },
  V: { rooms: ['kitchen', 'bedroom'], x: 7.125, z: -1.2, width: 1.0, sign: 'Спальня' }
}

function inside(a: RoomAABB, x: number, z: number): boolean {
  return x > a.x1 && x < a.x2 && z > a.z1 && z < a.z2
}

export function roomOf(x: number, z: number): RoomId | null {
  // 1. Сначала проверяем строгие границы комнат
  for (const id of ORDER) {
    if (inside(ROOMS[id].aabb, x, z)) return id
  }

  // 2. BUG-04: Проверяем дверные коридоры (двери A, B, V), чтобы при проходе сквозь дверной проём не возвращался null
  for (const key of Object.keys(DOORS)) {
    const door = DOORS[key]
    const halfW = door.width / 2 + 0.1
    // Двери A, B, V ориентированы вдоль оси Z в перегородках по X
    if (Math.abs(x - door.x) <= 0.25 && Math.abs(z - door.z) <= halfW) {
      if (door.rooms[0] && x <= door.x) return door.rooms[0]
      return door.rooms[1]
    }
  }

  return null
}

export function info(id: RoomId): RoomConfig {
  return ROOMS[id]
}

export const levels = {
  ROOMS,
  ORDER,
  DOORS,
  SPEED_BONUS_PER_SEC,
  roomOf,
  info
}

if (typeof window !== 'undefined') {
  window.KOTO = window.KOTO || {}
  window.KOTO.levels = levels
}

export default levels
