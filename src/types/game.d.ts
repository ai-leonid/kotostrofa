import type * as THREE from 'three'
import type { Body, Vec3, Quaternion } from 'cannon-es'

export type RoomId = 'living' | 'kitchen' | 'bath' | 'bedroom'
export type GameMode = 'menu' | 'play' | 'over'

export interface Prop {
  name: string
  value: number
  mesh: THREE.Group | THREE.Mesh
  body: Body
  breakable: boolean
  breakVel: number
  shardColor: string
  broken: boolean
  scoreCd: number
  mass: number
  hang: boolean
  released: boolean
  room: RoomId | null
  onBreak: ((api: GameAPI, prop: Prop) => void) | null
  onScore: ((api: GameAPI, prop: Prop) => void) | null
  _lastImpactFrame?: number
  _removing?: boolean
  repeatHits?: number
  lastHitAt?: number
  initialPosition?: Vec3
  initialQuaternion?: Quaternion
  scored?: boolean
  _isDailySpecial?: boolean
  _isLassoThrown?: boolean
  keepMeshOnBreak?: boolean
}

export interface GameStateSnapshot {
  mode: GameMode
  paused: boolean
  score: number
  combo: number
  comboT: number
  comboMaxT: number
  maxCombo: number
  timeLeft: number
  duration: number
  broken: number
  dishes: number
  shake: number
  room: RoomId
  progress: Record<RoomId, number>
  level: {
    order: RoomId[]
    idx: number
    entered: Partial<Record<RoomId, boolean>>
    done: RoomId[]
  }
  quests: Record<string, QuestState>
  finishing: boolean
  speedBonus: number
  speedLeft: number
}

export interface QuestState {
  step: number
  done: boolean
  counted?: Prop[]
  [fact: string]: unknown
}

export interface InputState {
  f: boolean
  b: boolean
  l: boolean
  r: boolean
  run: boolean
  jump: boolean
  camYaw: number
}

export interface IInputManager {
  getInput(): Readonly<InputState>
  consumeJump(): void
}

export interface GameAPI {
  state: any
  start(duration?: number): void
  update(dt: number): void
  setPaused(p: boolean): void
  onPropImpact(prop: any, v: number, isStrike?: boolean): void
  trySwipe(): void
  tryMeow(): void
  onWorldEvent(type: string, x: number, z: number, prop?: any): void
  floater(pos: any, text: string, kind?: string): void
  addFeed(text: string): void
  getComboRank(c: number): any
  comboMult(): number
  addScore(pts: number, propName?: string): void
  record(label?: string, pts?: number): any
  init(refs: any): void
  setHardMode?(enable: boolean): void
  onLassoHold?(): void
  onLassoRelease?(): void
  getLassoProp?(): any
  triggerCatastrophe?(): void
}
