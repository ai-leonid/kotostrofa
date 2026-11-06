import mitt, { type Emitter } from 'mitt'
import type { Prop, RoomId } from './types/game'

export type Events = {
  'prop:impact': { prop: Prop; velocity: number; isStrike?: boolean }
  'prop:break': { prop: Prop }
  'prop:knock': { prop: Prop }
  'room:entered': { room: RoomId }
  'combo:updated': { combo: number; mult: number }
  'cat:scared': { duration: number }
  'door:opened': { doorId: string; nextRoom: RoomId }
  'level:complete': { room: RoomId }
  'game:start': { duration: number }
  'game:over': { win: boolean }
  'catastrophe:thunder': Record<string, unknown>
}

export const bus: Emitter<Events> = mitt<Events>()
