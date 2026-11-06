export interface RunStats {
  score?: number
  roomsDone?: number
  roomsTotal?: number
  maxCombo?: number
  questsDone?: number
  win?: boolean
  durationSec?: number
  roomScores?: Record<string, number>
}

export interface RunRecord {
  date: string
  score: number
  roomsDone: number
  roomsTotal: number
  maxCombo: number
  questsDone: number
  win: boolean
}

export interface BestRecord {
  score: number
  roomsDone: number
  roomsTotal: number
  maxCombo: number
  date: string
  rooms: Record<string, number>
}

export interface SaveData {
  version: number
  runs: RunRecord[]
  best: BestRecord | null
}

const KEY = 'koto_save_v1'
const MAX_RUNS = 50

function empty(): SaveData {
  return { version: 1, runs: [], best: null }
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const data = JSON.parse(raw)
    if (!data || data.version !== 1 || !Array.isArray(data.runs)) return empty()
    return data
  } catch {
    return empty()
  }
}

export function persist(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // quota exceeded or private mode
  }
}

export function recordRun(stats: RunStats): boolean {
  const data = load()
  const run: RunRecord = {
    date: new Date().toISOString(),
    score: stats.score || 0,
    roomsDone: stats.roomsDone || 0,
    roomsTotal: stats.roomsTotal || 4,
    maxCombo: stats.maxCombo || 0,
    questsDone: stats.questsDone || 0,
    win: !!stats.win
  }
  data.runs.push(run)
  if (data.runs.length > MAX_RUNS) data.runs = data.runs.slice(-MAX_RUNS)

  const isBest = !data.best || run.score > data.best.score
  if (isBest) {
    data.best = {
      score: run.score,
      roomsDone: run.roomsDone,
      roomsTotal: run.roomsTotal,
      maxCombo: run.maxCombo,
      date: run.date,
      rooms: (data.best && data.best.rooms) || {}
    }
  }
  if (stats.roomScores && data.best) {
    data.best.rooms = data.best.rooms || {}
    for (const r of Object.keys(stats.roomScores)) {
      if (!data.best.rooms[r] || (stats.roomScores[r] > data.best.rooms[r])) {
        data.best.rooms[r] = stats.roomScores[r]
      }
    }
  }
  persist(data)
  return isBest
}

export function isRecord(score: number): boolean {
  if (!score) return false
  const data = load()
  return !data.best || score > data.best.score
}

export function best(): BestRecord | null {
  return load().best
}

export const save = {
  load,
  recordRun,
  isRecord,
  best,
  KEY
}

if (typeof window !== 'undefined') {
  window.KOTO = window.KOTO || {}
  window.KOTO.save = save
}

export default save
