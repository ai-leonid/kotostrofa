import type { GameAPI, RoomId } from './game'

declare global {
  interface Window {
    __errors: string[]
    KOTO: {
      game?: GameAPI
      cat?: any
      apt?: any
      propsSys?: any
      levels?: any
      minimap?: any
      fx?: any
      save?: any
      audio?: any
      input?: any
      bus?: any
      scene?: any
      camera?: any
      currentFrame?: number
      hitStop?: (ms?: number) => void
    }
  }
}

export {}
