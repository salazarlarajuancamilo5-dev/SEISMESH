import type { IntensityClass } from './types'

/** Relative motion processor. No calibrated units — visualisation only. */
export class MotionProcessor {
  private ema = { x: 0, y: 0, z: 0 }
  private started = false
  private window: number[] = []
  private readonly windowSize = 24
  baseline = 0
  noise = 0.004
  peak = 0
  peakAt = 0

  /** Feed a raw acceleration sample (with or without gravity). */
  push(x: number, y: number, z: number, hasGravity: boolean): number {
    let dx = x
    let dy = y
    let dz = z
    if (hasGravity) {
      if (!this.started) {
        this.ema = { x, y, z }
        this.started = true
      }
      const a = 0.06 // slow component (gravity/orientation)
      this.ema.x += a * (x - this.ema.x)
      this.ema.y += a * (y - this.ema.y)
      this.ema.z += a * (z - this.ema.z)
      dx = x - this.ema.x
      dy = y - this.ema.y
      dz = z - this.ema.z
    }
    const m = Math.sqrt(dx * dx + dy * dy + dz * dz)
    this.window.push(m)
    if (this.window.length > this.windowSize) this.window.shift()
    return m
  }

  rms(): number {
    if (!this.window.length) return 0
    const s = this.window.reduce((acc, v) => acc + v * v, 0) / this.window.length
    return Math.sqrt(s)
  }

  /** Learn the resting noise floor during calibration. */
  calibrate() {
    const r = this.rms()
    this.baseline = r
    this.noise = Math.max(0.004, r * 1.6)
  }

  /** 0..1 level for display only. */
  read(now: number): { rms: number; level: number; peak: number; intensity: IntensityClass } {
    const rms = Math.max(0, this.rms() - this.baseline)
    const level = clamp01(Math.pow(rms / 2.2, 0.62))
    if (level > this.peak || now - this.peakAt > 8000) {
      if (level >= this.peak) this.peakAt = now
      this.peak = level > this.peak ? level : Math.max(level, this.peak * 0.985)
    } else {
      this.peak = Math.max(level, this.peak * 0.995)
    }
    return { rms, level, peak: this.peak, intensity: classify(level, rms, this.noise) }
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function classify(level: number, rms: number, noise: number): IntensityClass {
  if (level > 0.78) return 'spike'
  if (level > 0.45) return 'strong'
  if (level > 0.14 || rms > noise * 4) return 'movement'
  return 'stable'
}

export const INTENSITY_LABEL: Record<IntensityClass, string> = {
  stable: 'Estable',
  movement: 'Movimiento',
  strong: 'Fuerte',
  spike: 'Pico anómalo',
}

export const INTENSITY_COLOR: Record<IntensityClass, string> = {
  stable: '#35F2B1',
  movement: '#F8D34F',
  strong: '#FF8A3D',
  spike: '#FF4D67',
}

export function levelColor(level: number): string {
  if (level > 0.78) return '#FF4D67'
  if (level > 0.45) return '#FF8A3D'
  if (level > 0.14) return '#F8D34F'
  return '#35F2B1'
}
