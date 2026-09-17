export type ZoneId = 'z1' | 'z2' | 'z3'

export interface Zone {
  id: ZoneId
  floor: number
  name: string
  short: string
}

export const ZONES: Zone[] = [
  { id: 'z1', floor: 1, name: 'Piso 1 — Recepción', short: 'Recepción' },
  { id: 'z2', floor: 2, name: 'Piso 2 — Oficinas', short: 'Oficinas' },
  { id: 'z3', floor: 3, name: 'Piso 3 — Laboratorio', short: 'Laboratorio' },
]

export const zoneById = (id: string): Zone => ZONES.find((z) => z.id === id) ?? ZONES[0]

export type SensorKind = 'virtual' | 'motion' | 'touch'
export type ConnectionState = 'connected' | 'reconnecting' | 'local'
export type OccupantStatus = 'unknown' | 'ok' | 'help' | 'awaiting'
export type IntensityClass = 'stable' | 'movement' | 'strong' | 'spike'

export type HazardType = 'exit' | 'injury' | 'fire' | 'leak' | 'debris' | 'other'

export interface HazardMeta {
  type: HazardType
  label: string
  weight: number
}

export const HAZARDS: HazardMeta[] = [
  { type: 'exit', label: 'Salida bloqueada', weight: 4 },
  { type: 'injury', label: 'Persona herida', weight: 5 },
  { type: 'fire', label: 'Humo o fuego', weight: 5 },
  { type: 'leak', label: 'Posible fuga', weight: 5 },
  { type: 'debris', label: 'Objetos caídos', weight: 3 },
  { type: 'other', label: 'Otro peligro', weight: 3 },
]

export const hazardLabel = (t: HazardType) => HAZARDS.find((h) => h.type === t)?.label ?? 'Peligro'

export interface HazardReport {
  id: string
  type: HazardType
  zoneId: ZoneId
  sensorId: string
  alias: string
  at: number
  note?: string
}

export interface SensorState {
  id: string
  alias: string
  zoneId: ZoneId
  kind: SensorKind
  connection: ConnectionState
  rms: number
  peak: number
  level: number
  intensity: IntensityClass
  status: OccupantStatus
  battery: number | null
  joinedAt: number
  lastSeen: number
  history: number[]
  peakAt: number | null
}

export interface SampleMessage {
  sessionId: string
  sensorId: string
  alias: string
  zoneId: ZoneId
  timestamp: number
  rms: number
  peak: number
  normalizedIntensity: number
  status: OccupantStatus
  battery: number | null
  connectionState: ConnectionState
  kind: SensorKind
}

export type NetMessage =
  | { t: 'hello'; sensorId: string; alias: string; zoneId: ZoneId; kind: SensorKind; battery: number | null }
  | { t: 'sample'; payload: SampleMessage }
  | { t: 'status'; sensorId: string; status: OccupantStatus }
  | { t: 'hazard'; sensorId: string; zoneId: ZoneId; alias: string; hazard: HazardType; at: number }
  | { t: 'bye'; sensorId: string }
  | { t: 'event'; at: number }
  | { t: 'checkin'; at: number }
  | { t: 'reset' }
  | { t: 'ping' }

export type Phase = 'idle' | 'event' | 'checkin' | 'resolution' | 'summary'

export interface PriorityItem {
  id: string
  rank: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  detail: string
  zoneId: ZoneId | null
  icon: 'help' | 'unknown' | 'fire' | 'exit' | 'spike' | 'ok'
}

export interface LogEntry {
  id: string
  at: number
  text: string
  tone: 'info' | 'warn' | 'critical' | 'good'
}
