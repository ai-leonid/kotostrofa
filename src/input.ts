import type { IInputManager, InputState } from './types/game'

export const KEYMAP: Record<string, keyof Pick<InputState, 'f' | 'b' | 'l' | 'r'>> = {
  KeyW: 'f',
  ArrowUp: 'f',
  KeyS: 'b',
  ArrowDown: 'b',
  KeyA: 'l',
  ArrowLeft: 'l',
  KeyD: 'r',
  ArrowRight: 'r'
}

export class KeyboardInputManager implements IInputManager {
  protected state: InputState = {
    f: false,
    b: false,
    l: false,
    r: false,
    run: false,
    jump: false,
    camYaw: -Math.PI / 2
  }

  public onSwipe?: () => void
  public onMeow?: () => void
  public onLassoHold?: () => void
  public onLassoRelease?: () => void

  private qHoldTimer: any = null
  private qIsHoldingLasso = false

  private keydownHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.state.jump = true
      e.preventDefault()
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.state.run = true
    }
    const k = KEYMAP[e.code]
    if (k) {
      this.state[k] = true
      e.preventDefault()
    }
    if (e.code === 'KeyQ') {
      if (!this.qHoldTimer && !this.qIsHoldingLasso) {
        this.qHoldTimer = setTimeout(() => {
          this.qIsHoldingLasso = true
          if (this.onLassoHold) this.onLassoHold()
        }, 220)
      }
    }
    if (e.code === 'KeyE' || e.code === 'KeyM') {
      if (this.onMeow) this.onMeow()
    }
  }

  private keyupHandler = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.state.run = false
    }
    const k = KEYMAP[e.code]
    if (k) {
      this.state[k] = false
    }
    if (e.code === 'KeyQ') {
      if (this.qHoldTimer) {
        clearTimeout(this.qHoldTimer)
        this.qHoldTimer = null
      }
      if (this.qIsHoldingLasso) {
        this.qIsHoldingLasso = false
        if (this.onLassoRelease) this.onLassoRelease()
      } else {
        if (this.onSwipe) this.onSwipe()
      }
    }
  }

  bind(doc: Document = document): void {
    doc.addEventListener('keydown', this.keydownHandler)
    doc.addEventListener('keyup', this.keyupHandler)
  }

  unbind(doc: Document = document): void {
    doc.removeEventListener('keydown', this.keydownHandler)
    doc.removeEventListener('keyup', this.keyupHandler)
  }

  setCamYaw(yaw: number): void {
    this.state.camYaw = yaw
  }

  getInput(): Readonly<InputState> {
    return this.state
  }

  consumeJump(): void {
    this.state.jump = false
  }

  setDirection(f: boolean, b: boolean, l: boolean, r: boolean, run: boolean = false): void {
    this.state.f = f
    this.state.b = b
    this.state.l = l
    this.state.r = r
    this.state.run = run
  }

  triggerJump(): void {
    this.state.jump = true
  }
}

export class RemoteInputManager implements IInputManager {
  private state: InputState = {
    f: false,
    b: false,
    l: false,
    r: false,
    run: false,
    jump: false,
    camYaw: -Math.PI / 2
  }

  applyFromNetwork(s: InputState): void {
    this.state = { ...s }
  }

  getInput(): Readonly<InputState> {
    return this.state
  }

  consumeJump(): void {
    this.state.jump = false
  }
}
