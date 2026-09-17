/** Web Audio cues — no external files, never plays before a user gesture. */
let ctx: AudioContext | null = null
let muted = false
let unlocked = false

export const isMuted = () => muted
export const setMuted = (v: boolean) => {
  muted = v
}
export const toggleMuted = () => {
  muted = !muted
  return muted
}

export function unlockAudio() {
  if (unlocked) return
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
    void ctx.resume()
    unlocked = true
  } catch {
    /* audio unavailable — silent degrade */
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (muted || !ctx) return
  try {
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  } catch {
    /* ignore */
  }
}

export const sfx = {
  join: () => {
    tone(523.25, 0.16, 'sine', 0.06)
    setTimeout(() => tone(784, 0.22, 'sine', 0.05), 90)
  },
  event: () => {
    tone(70, 1.5, 'sine', 0.22, 42)
    tone(140, 1.1, 'triangle', 0.08, 90)
  },
  checkin: () => {
    tone(660, 0.12, 'triangle', 0.07)
    setTimeout(() => tone(880, 0.18, 'triangle', 0.06), 130)
  },
  help: () => {
    tone(880, 0.14, 'square', 0.05)
    setTimeout(() => tone(680, 0.2, 'square', 0.05), 160)
  },
  hazard: () => {
    tone(320, 0.3, 'sawtooth', 0.04, 200)
  },
  ok: () => tone(720, 0.12, 'sine', 0.05),
  click: () => tone(440, 0.05, 'sine', 0.03),
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}
