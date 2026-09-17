import { useSyncExternalStore } from 'react'
import { sfx } from './audio'
import { classify, clamp01 } from './motion'
import { makeSessionCode, MeshHost } from './net'
import {
  HAZARDS,
  ZONES,
  hazardLabel,
  zoneById,
  type ConnectionState,
  type HazardReport,
  type HazardType,
  type LogEntry,
  type NetMessage,
  type OccupantStatus,
  type Phase,
  type PriorityItem,
  type SampleMessage,
  type SensorState,
  type ZoneId,
} from './types'

const HISTORY = 600 // ~60 s at 10 Hz
const TICK = 100

export interface PeakMark {
  id: string
  zoneId: ZoneId
  at: number
  level: number
}

export interface MeshState {
  code: string
  phase: Phase
  net: ConnectionState
  startedAt: number
  eventAt: number | null
  checkinAt: number | null
  summaryAt: number | null
  sensors: Record<string, SensorState>
  order: string[]
  hazards: HazardReport[]
  logs: LogEntry[]
  peaks: PeakMark[]
  demoRunning: boolean
  demoT: number
  globalLevel: number
  globalPeak: number
  shake: number
  anomalyZone: ZoneId | null
  routeBlocked: boolean
  compare: boolean
}

const initial = (): MeshState => ({
  code: makeSessionCode(),
  phase: 'idle',
  net: 'local',
  startedAt: Date.now(),
  eventAt: null,
  checkinAt: null,
  summaryAt: null,
  sensors: {},
  order: [],
  hazards: [],
  logs: [],
  peaks: [],
  demoRunning: false,
  demoT: 0,
  globalLevel: 0,
  globalPeak: 0,
  shake: 0,
  anomalyZone: null,
  routeBlocked: false,
  compare: false,
})

const ZONE_GAIN: Record<ZoneId, number> = { z1: 0.62, z2: 0.9, z3: 1.3 }
const uid = () => Math.random().toString(36).slice(2, 9)

class Store {
  state: MeshState = initial()
  version = 0
  private listeners = new Set<() => void>()
  private timer: number | null = null
  private host: MeshHost | null = null
  private excite = 0
  private target = 0
  private spikeUntil = 0
  private spikeZone: ZoneId | null = null
  private phaseSeen = new Set<string>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = () => this.version

  private emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  /* ---------------- lifecycle ---------------- */

  startHost() {
    if (!this.host) {
      this.host = new MeshHost(
        this.state.code,
        (m) => this.onNet(m),
        (s) => {
          this.state.net = s
          this.emit()
        },
      )
    }
    if (!this.timer) this.timer = window.setInterval(() => this.tick(), TICK)
  }

  stopHost() {
    this.host?.destroy()
    this.host = null
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
  }

  private onNet(m: NetMessage) {
    switch (m.t) {
      case 'hello':
        this.addSensor({
          id: m.sensorId,
          alias: m.alias,
          zoneId: m.zoneId,
          kind: m.kind,
          battery: m.battery,
          connection: 'connected',
        })
        break
      case 'sample':
        this.ingest(m.payload)
        break
      case 'status':
        this.setStatus(m.sensorId, m.status, true)
        break
      case 'hazard':
        this.addHazard(m.hazard, m.zoneId, m.sensorId, m.alias)
        break
      case 'bye': {
        const s = this.state.sensors[m.sensorId]
        if (s) {
          s.connection = 'reconnecting'
          this.log(s.alias + ' perdió conexión', 'warn')
          this.emit()
        }
        break
      }
      default:
        break
    }
  }

  /* ---------------- sensors ---------------- */

  addSensor(p: {
    id: string
    alias: string
    zoneId: ZoneId
    kind: SensorState['kind']
    battery?: number | null
    connection?: ConnectionState
  }) {
    const existing = this.state.sensors[p.id]
    if (existing) {
      existing.connection = p.connection ?? 'connected'
      existing.alias = p.alias
      existing.zoneId = p.zoneId
      existing.lastSeen = Date.now()
      this.emit()
      return
    }
    this.state.sensors[p.id] = {
      id: p.id,
      alias: p.alias,
      zoneId: p.zoneId,
      kind: p.kind,
      connection: p.connection ?? 'connected',
      rms: 0,
      peak: 0,
      level: 0.02,
      intensity: 'stable',
      status: 'unknown',
      battery: p.battery ?? null,
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      history: new Array(HISTORY).fill(0.02),
      peakAt: null,
    }
    this.state.order.push(p.id)
    sfx.join()
    this.log(p.alias + ' se unió a la malla · ' + zoneById(p.zoneId).short, 'good')
    this.emit()
  }

  removeSensor(id: string) {
    delete this.state.sensors[id]
    this.state.order = this.state.order.filter((x) => x !== id)
    this.emit()
  }

  seedVirtual() {
    const names = ['Nodo Recepción', 'Nodo Oficinas', 'Nodo Laboratorio']
    ZONES.forEach((z, i) => {
      const id = 'v-' + z.id
      if (!this.state.sensors[id]) {
        this.addSensor({ id, alias: names[i], zoneId: z.id, kind: 'virtual', battery: 78 - i * 9 })
      }
    })
  }

  ingest(p: SampleMessage) {
    if (!this.state.sensors[p.sensorId]) {
      this.addSensor({ id: p.sensorId, alias: p.alias, zoneId: p.zoneId, kind: p.kind, battery: p.battery })
    }
    const t = this.state.sensors[p.sensorId]
    if (!t) return
    t.zoneId = p.zoneId
    t.alias = p.alias
    t.rms = p.rms
    t.peak = Math.max(t.peak * 0.995, p.peak)
    t.level = clamp01(p.normalizedIntensity)
    t.intensity = classify(t.level, p.rms, 0.01)
    t.battery = p.battery
    t.connection = 'connected'
    t.lastSeen = Date.now()
    t.history.push(t.level)
    if (t.history.length > HISTORY) t.history.shift()
    if (t.level > 0.72 && Date.now() - (t.peakAt ?? 0) > 2500) this.markPeak(t)
    this.emit()
  }

  private markPeak(s: SensorState) {
    s.peakAt = Date.now()
    this.state.peaks.push({ id: uid(), zoneId: s.zoneId, at: Date.now(), level: s.level })
    if (this.state.peaks.length > 12) this.state.peaks.shift()
    this.state.anomalyZone = s.zoneId
  }

  setStatus(id: string, status: OccupantStatus, remote = false) {
    const s = this.state.sensors[id]
    if (!s) return
    s.status = status
    if (status === 'ok') {
      this.log(s.alias + ' confirma: Estoy bien', 'good')
      if (remote) sfx.ok()
    }
    if (status === 'help') {
      this.log(s.alias + ' solicita AYUDA · ' + zoneById(s.zoneId).name, 'critical')
      sfx.help()
    }
    this.emit()
  }

  addHazard(type: HazardType, zoneId: ZoneId, sensorId: string, alias: string) {
    const h: HazardReport = { id: uid(), type, zoneId, sensorId, alias, at: Date.now() }
    this.state.hazards.unshift(h)
    if (type === 'exit') this.state.routeBlocked = true
    this.log(hazardLabel(type) + ' · ' + zoneById(zoneId).name + ' (' + alias + ')', type === 'exit' ? 'warn' : 'critical')
    sfx.hazard()
    this.emit()
  }

  /* ---------------- commands ---------------- */

  log(text: string, tone: LogEntry['tone'] = 'info') {
    this.state.logs.unshift({ id: uid(), at: Date.now(), text, tone })
    if (this.state.logs.length > 40) this.state.logs.pop()
  }

  startEvent(silent = false) {
    if (this.state.phase === 'idle' || this.state.phase === 'summary' || this.state.phase === 'resolution') {
      this.state.phase = 'event'
      this.state.eventAt = Date.now()
      this.state.summaryAt = null
      this.state.anomalyZone = null
      if (!silent) sfx.event()
      this.log('EVENTO EN VIVO — movimiento relativo creciente', 'critical')
      this.host?.broadcast({ t: 'event', at: Date.now() })
      this.target = 0.85
      this.spikeZone = 'z3'
      this.spikeUntil = Date.now() + 4500
      this.emit()
    }
  }

  requestCheckin() {
    this.state.phase = 'checkin'
    this.state.checkinAt = Date.now()
    Object.values(this.state.sensors).forEach((s) => {
      if (s.status === 'unknown') s.status = 'awaiting'
    })
    sfx.checkin()
    this.log('Comprobación de ocupantes solicitada a toda la malla', 'info')
    this.host?.broadcast({ t: 'checkin', at: Date.now() })
    this.emit()
  }

  showSummary() {
    this.state.phase = 'summary'
    this.state.summaryAt = Date.now()
    this.emit()
  }

  toggleCompare() {
    this.state.compare = !this.state.compare
    this.emit()
  }

  reset(keepSensors = true) {
    const sensors = this.state.sensors
    const order = this.state.order
    const code = this.state.code
    const net = this.state.net
    this.state = { ...initial(), code, net }
    this.phaseSeen.clear()
    if (keepSensors) {
      this.state.sensors = sensors
      this.state.order = order
      Object.values(sensors).forEach((s) => {
        s.status = 'unknown'
        s.level = 0.02
        s.peak = 0
        s.peakAt = null
        s.history = new Array(HISTORY).fill(0.02)
      })
    }
    this.excite = 0
    this.target = 0
    this.spikeUntil = 0
    this.spikeZone = null
    this.host?.broadcast({ t: 'reset' })
    this.log('Sistema reiniciado · estado normal', 'info')
    this.emit()
  }

  prepareShow() {
    this.reset(false)
    this.seedVirtual()
    this.log('Presentación lista · 3 sensores virtuales en estado normal', 'good')
    this.emit()
  }

  /* ---------------- demo director ---------------- */

  startDemo() {
    this.reset(false)
    this.seedVirtual()
    this.state.demoRunning = true
    this.state.demoT = 0
    this.phaseSeen.clear()
    this.emit()
  }

  stopDemo() {
    this.state.demoRunning = false
    this.emit()
  }

  private demoStep(t: number) {
    const once = (key: string, fn: () => void) => {
      if (this.phaseSeen.has(key)) return
      this.phaseSeen.add(key)
      fn()
    }
    if (t >= 3000) once('event', () => this.startEvent())
    if (t >= 7000) {
      once('spike', () => {
        this.spikeZone = 'z3'
        this.spikeUntil = Date.now() + 3200
        this.state.anomalyZone = 'z3'
        this.log('Anomalía relativa detectada · Piso 3 — Laboratorio', 'warn')
      })
    }
    if (t >= 11000) once('checkin', () => this.requestCheckin())
    if (t >= 12600) once('ok1', () => this.setStatus('v-z1', 'ok'))
    if (t >= 14200) once('ok2', () => this.setStatus('v-z2', 'ok'))
    if (t >= 16200) once('hazard', () => this.addHazard('exit', 'z2', 'v-z2', 'Nodo Oficinas'))
    if (t >= 21000) {
      once('resolution', () => {
        this.state.phase = 'resolution'
        this.log('Prioridades recalculadas con reglas deterministas', 'info')
      })
    }
    if (t >= 26000) once('summary', () => this.showSummary())
    if (t >= 33000) {
      once('end', () => {
        this.state.demoRunning = false
      })
    }
  }

  /* ---------------- simulation tick ---------------- */

  private tick() {
    const now = Date.now()
    const st = this.state
    if (st.demoRunning) {
      st.demoT += TICK
      this.demoStep(st.demoT)
    }

    if (st.eventAt) {
      const dt = (now - st.eventAt) / 1000
      if (dt < 1.2) this.target = 0.35 + dt * 0.5
      else if (dt < 6) this.target = 0.9 - (dt - 1.2) * 0.06
      else if (dt < 14) this.target = Math.max(0.12, 0.62 - (dt - 6) * 0.07)
      else this.target = 0.05
    } else {
      this.target = 0.03
    }
    this.excite += (this.target - this.excite) * 0.12

    const phaseT = now / 1000
    ZONES.forEach((z, zi) => {
      const gain = ZONE_GAIN[z.id]
      const spiking = this.spikeZone === z.id && now < this.spikeUntil
      Object.values(st.sensors).forEach((s) => {
        if (s.kind !== 'virtual' || s.zoneId !== z.id) return
        const osc =
          Math.sin(phaseT * (5.1 + zi * 0.7)) * 0.6 +
          Math.sin(phaseT * (11.3 + zi * 1.4) + zi) * 0.3 +
          (Math.random() - 0.5) * 0.35
        const base = 0.012 + Math.random() * 0.016
        let lvl = base + Math.abs(osc) * this.excite * gain
        if (spiking) lvl += 0.35 + Math.random() * 0.3
        lvl = clamp01(lvl)
        s.level += (lvl - s.level) * 0.55
        s.rms = s.level * 2.2
        s.peak = Math.max(s.level, s.peak * 0.994)
        s.intensity = classify(s.level, s.rms, 0.01)
        s.history.push(s.level)
        if (s.history.length > HISTORY) s.history.shift()
        s.lastSeen = now
        if (s.level > 0.72 && now - (s.peakAt ?? 0) > 2500) this.markPeak(s)
      })
    })

    Object.values(st.sensors).forEach((s) => {
      if (s.kind === 'virtual') return
      if (now - s.lastSeen > 4000 && s.connection === 'connected') s.connection = 'reconnecting'
      if (now - s.lastSeen > 1500) {
        s.level *= 0.9
        s.history.push(s.level)
        if (s.history.length > HISTORY) s.history.shift()
      }
    })

    const list = Object.values(st.sensors)
    const g = list.length ? list.reduce((a, s) => a + s.level, 0) / list.length : 0
    st.globalLevel += (g - st.globalLevel) * 0.35
    st.globalPeak = Math.max(st.globalLevel, st.globalPeak * 0.997)
    st.shake = st.phase === 'event' || st.phase === 'checkin' ? st.globalLevel : st.globalLevel * 0.3
    this.emit()
  }
}

export const store = new Store()

export function useMesh(): MeshState {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return store.state
}

/* ---------------- deterministic priority engine ---------------- */

export function computePriorities(st: MeshState): PriorityItem[] {
  const items: PriorityItem[] = []
  const sensors = st.order.map((id) => st.sensors[id]).filter(Boolean)

  sensors
    .filter((s) => s.status === 'help')
    .forEach((s) =>
      items.push({
        id: 'help-' + s.id,
        rank: 1,
        severity: 'critical',
        title: 'Atender solicitud de ayuda · ' + zoneById(s.zoneId).short,
        detail: s.alias + ' pulsó "Necesito ayuda".',
        zoneId: s.zoneId,
        icon: 'help',
      }),
    )

  if (st.checkinAt) {
    sensors
      .filter((s) => s.status !== 'ok' && s.status !== 'help')
      .forEach((s) =>
        items.push({
          id: 'unk-' + s.id,
          rank: 2,
          severity: 'critical',
          title: 'Verificar ocupante · ' + zoneById(s.zoneId).name,
          detail: 'Sin confirmar tras la comprobación de estado.',
          zoneId: s.zoneId,
          icon: 'unknown',
        }),
      )
  }

  st.hazards.forEach((h) => {
    const meta = HAZARDS.find((x) => x.type === h.type)
    const urgent = h.type === 'fire' || h.type === 'leak' || h.type === 'injury'
    items.push({
      id: 'hz-' + h.id,
      rank: urgent ? 3 : h.type === 'exit' ? 4 : 5,
      severity: urgent ? 'critical' : 'high',
      title: (meta?.label ?? 'Peligro') + ' · ' + zoneById(h.zoneId).short,
      detail:
        h.type === 'exit'
          ? 'Revisar escalera norte y validar la ruta alternativa.'
          : 'Reportado por un ocupante de la zona.',
      zoneId: h.zoneId,
      icon: urgent ? 'fire' : 'exit',
    })
  })

  sensors
    .filter((s) => s.peak > 0.7)
    .forEach((s) =>
      items.push({
        id: 'pk-' + s.id,
        rank: 5,
        severity: 'medium',
        title: 'Inspeccionar ' + zoneById(s.zoneId).name,
        detail: 'Movimiento relativo elevado (pico ' + Math.round(s.peak * 100) + '/100, no calibrado).',
        zoneId: s.zoneId,
        icon: 'spike',
      }),
    )

  if (!items.length) {
    items.push({
      id: 'normal',
      rank: 6,
      severity: 'low',
      title: 'Funcionamiento normal',
      detail: 'Sin incidencias reportadas. Malla en escucha.',
      zoneId: null,
      icon: 'ok',
    })
  }

  const dedup = new Map<string, PriorityItem>()
  items.forEach((i) => {
    if (!dedup.has(i.id)) dedup.set(i.id, i)
  })
  return [...dedup.values()].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title)).slice(0, 7)
}

export type { Phase }
