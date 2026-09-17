import { useMemo } from 'react'
import type { MeshState } from '../lib/store'
import type { SensorState, ZoneId } from '../lib/types'

const VW = 600
const VH = 190
const WINDOW = 220 // samples (~22 s at 10 Hz)

const ZONE_COLOR: Record<ZoneId, string> = { z1: '#35F2B1', z2: '#4CB9FF', z3: '#F8D34F' }

function path(hist: number[]) {
  const slice = hist.slice(-WINDOW)
  if (slice.length < 2) return ''
  const step = VW / (WINDOW - 1)
  const off = WINDOW - slice.length
  let d = ''
  slice.forEach((v, i) => {
    const x = (i + off) * step
    const y = VH - 8 - v * (VH - 24)
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1)
  })
  return d
}

export function WaveChart({ state, sensors }: { state: MeshState; sensors: SensorState[] }) {
  const now = Date.now()
  const peaks = useMemo(() => state.peaks.filter((p) => now - p.at < WINDOW * 100), [state.peaks, now])

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 0 }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }} aria-hidden>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={VW}
            y1={VH - 8 - g * (VH - 24)}
            y2={VH - 8 - g * (VH - 24)}
            stroke="rgba(140,163,175,0.12)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="3 6"
          />
        ))}

        {/* peak markers */}
        {peaks.map((p) => {
          const age = (now - p.at) / 100
          const x = VW - (age / (WINDOW - 1)) * VW
          if (x < 0) return null
          return (
            <g key={p.id}>
              <line
                x1={x}
                x2={x}
                y1="4"
                y2={VH - 8}
                stroke="#FF4D67"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                opacity="0.65"
                strokeDasharray="2 4"
              />
              <circle cx={x} cy={VH - 8 - p.level * (VH - 24)} r="3" fill="#FF4D67" />
            </g>
          )
        })}

        {sensors.map((s) => (
          <g key={s.id}>
            <path
              d={path(s.history)}
              fill="none"
              stroke={ZONE_COLOR[s.zoneId]}
              strokeWidth={s.kind === 'virtual' ? 1.8 : 2.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity={s.connection === 'connected' ? 0.95 : 0.4}
              strokeDasharray={s.connection === 'reconnecting' ? '4 4' : undefined}
            />
          </g>
        ))}
      </svg>

      <div style={{ position: 'absolute', top: 0, right: 2, display: 'flex', gap: 10 }}>
        {sensors.slice(0, 4).map((s) => (
          <span key={s.id} className="mono" style={{ fontSize: 9, color: ZONE_COLOR[s.zoneId], letterSpacing: '0.06em' }}>
            ● {s.alias.replace('Nodo ', '').toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Horizontal event timeline with the phase markers. */
export function Timeline({ state }: { state: MeshState }) {
  const marks: { t: string; label: string; on: boolean }[] = [
    { t: '00', label: 'Normal', on: true },
    { t: '03', label: 'Evento', on: !!state.eventAt },
    { t: '11', label: 'Estado', on: !!state.checkinAt },
    { t: '16', label: 'Obstáculo', on: state.hazards.length > 0 },
    { t: '21', label: 'Prioridades', on: state.phase === 'resolution' || state.phase === 'summary' },
    { t: '26', label: 'Resumen', on: state.phase === 'summary' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 6 }}>
      {marks.map((m, i) => (
        <div key={m.label} style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 3, justifyItems: 'center', minWidth: 0 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: m.on ? 'var(--mesh)' : 'transparent',
                border: `1.5px solid ${m.on ? 'var(--mesh)' : 'var(--line-strong)'}`,
                boxShadow: m.on ? '0 0 10px rgba(53,242,177,0.6)' : 'none',
                transition: 'all .4s ease',
              }}
            />
            <span
              className="mono"
              style={{
                fontSize: 8.5,
                color: m.on ? 'var(--text)' : 'var(--muted)',
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
              }}
            >
              {m.label}
            </span>
          </div>
          {i < marks.length - 1 && (
            <div
              style={{
                flex: 1,
                height: 1,
                background: marks[i + 1].on ? 'var(--mesh)' : 'var(--line)',
                margin: '0 4px',
                marginBottom: 14,
                transition: 'background .4s ease',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
