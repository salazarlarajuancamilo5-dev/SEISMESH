import { useEffect, useRef, useState } from 'react'
import { levelColor } from '../lib/motion'
import type { MeshState } from '../lib/store'
import { ZONES, type ZoneId } from '../lib/types'

const W = 420
const H = 470
const CX = 205
const FW = 196 // slab width
const FD = 96 // slab depth
const FH = 26 // slab thickness
const FLOOR_Y: Record<ZoneId, number> = { z3: 140, z2: 240, z1: 340 }

const top = (cx: number, cy: number, w = FW, d = FD) =>
  `${cx},${cy - d / 2} ${cx + w / 2},${cy} ${cx},${cy + d / 2} ${cx - w / 2},${cy}`
const leftFace = (cx: number, cy: number, w = FW, d = FD, h = FH) =>
  `${cx - w / 2},${cy} ${cx},${cy + d / 2} ${cx},${cy + d / 2 + h} ${cx - w / 2},${cy + h}`
const rightFace = (cx: number, cy: number, w = FW, d = FD, h = FH) =>
  `${cx + w / 2},${cy} ${cx},${cy + d / 2} ${cx},${cy + d / 2 + h} ${cx + w / 2},${cy + h}`

interface Props {
  state: MeshState
  levels: Record<ZoneId, number>
  statuses: Record<ZoneId, { ok: number; help: number; unknown: number; count: number }>
}

export function Building({ state, levels, statuses }: Props) {
  const blocked = state.routeBlocked
  const active = state.phase === 'event' || state.phase === 'checkin'
  const [shake, setShake] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const loop = () => {
      setShake(state.shake)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [state])

  const amp = Math.min(6, shake * 9)
  const t = Date.now() / 1000

  return (
    <div style={{ position: 'relative', height: '100%', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          transform: `translateX(${Math.sin(t * 9) * amp}px) rotate(${Math.sin(t * 6) * amp * 0.12}deg)`,
        }}
        role="img"
        aria-label="Edificio de tres plantas con niveles de movimiento relativo por zona"
      >
        <defs>
          <linearGradient id="bg-floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#173040" />
            <stop offset="100%" stopColor="#0c1c27" />
          </linearGradient>
          <radialGradient id="ground" cx="50%" cy="50%">
            <stop offset="0%" stopColor="rgba(53,242,177,0.14)" />
            <stop offset="100%" stopColor="rgba(53,242,177,0)" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* ground plate */}
        <ellipse cx={CX} cy={418} rx={178} ry={64} fill="url(#ground)" />
        <polygon points={top(CX, 418, 250, 124)} fill="none" stroke="rgba(140,163,175,0.16)" strokeWidth="1" />
        <polygon points={top(CX, 418, 190, 94)} fill="none" stroke="rgba(140,163,175,0.1)" strokeWidth="1" />

        {/* ---- floors, bottom first ---- */}
        {[...ZONES].reverse().map((z) => {
          const cy = FLOOR_Y[z.id]
          const lvl = levels[z.id] ?? 0
          const col = levelColor(lvl)
          const st = statuses[z.id]
          const anomaly = state.anomalyZone === z.id && lvl > 0.5
          return (
            <g key={z.id}>
              {/* concentric motion waves */}
              {[0, 1, 2].map((i) => {
                const p = ((t * 0.55 + i / 3) % 1)
                const rx = 100 + p * 92 * (0.4 + lvl)
                const op = (1 - p) * Math.min(0.75, 0.1 + lvl * 1.1)
                return (
                  <ellipse
                    key={i}
                    cx={CX}
                    cy={cy}
                    rx={rx}
                    ry={rx * (FD / FW)}
                    fill="none"
                    stroke={col}
                    strokeWidth={1.2}
                    opacity={op}
                  />
                )
              })}

              {/* slab body */}
              <polygon points={leftFace(CX, cy)} fill="#0a1922" stroke="rgba(140,163,175,0.2)" strokeWidth="1" />
              <polygon points={rightFace(CX, cy)} fill="#0e2230" stroke="rgba(140,163,175,0.2)" strokeWidth="1" />
              {/* energy fill on the faces */}
              <polygon points={leftFace(CX, cy)} fill={col} opacity={lvl * 0.5} />
              <polygon points={rightFace(CX, cy)} fill={col} opacity={lvl * 0.34} />
              <polygon
                points={top(CX, cy)}
                fill="url(#bg-floor)"
                stroke={col}
                strokeWidth={anomaly ? 2.4 : 1.3}
                opacity={0.96}
              />
              <polygon points={top(CX, cy)} fill={col} opacity={lvl * 0.22} />

              {anomaly && (
                <polygon points={top(CX, cy)} fill="none" stroke="#FF4D67" strokeWidth="2.6" filter="url(#soft)">
                  <animate attributeName="opacity" values="0.15;0.95;0.15" dur="1s" repeatCount="indefinite" />
                </polygon>
              )}

              {/* floor label */}
              <text
                x={CX - FW / 2 - 8}
                y={cy + 4}
                textAnchor="end"
                fill={lvl > 0.45 ? col : '#8CA3AF'}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
                letterSpacing="1"
              >
                P{z.floor}
              </text>
              <text
                x={CX + FW / 2 + 9}
                y={cy + 1}
                fill="#8CA3AF"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="9.5"
                letterSpacing="0.6"
              >
                {z.short.toUpperCase()}
              </text>
              <text
                x={CX + FW / 2 + 9}
                y={cy + 13}
                fill={col}
                fontFamily="IBM Plex Mono, monospace"
                fontSize="11"
                fontWeight="600"
              >
                {Math.round(lvl * 100).toString().padStart(2, '0')}
              </text>

              {/* occupant markers */}
              {st && st.count > 0 && (
                <g>
                  {Array.from({ length: Math.min(st.count, 4) }).map((_, i) => {
                    const okCount = st.ok
                    const helpCount = st.help
                    const kind = i < helpCount ? 'help' : i < helpCount + okCount ? 'ok' : 'unknown'
                    const c = kind === 'help' ? '#FF4D67' : kind === 'ok' ? '#35F2B1' : '#F8D34F'
                    const x = CX - 34 + i * 23
                    const y = cy - 6
                    return (
                      <g key={i} transform={`translate(${x},${y})`}>
                        <circle cx="0" cy="-6" r="3.4" fill={c} />
                        <path d="M0 -2 v7 M-4 2 h8 M0 5 l-3.5 5 M0 5 l3.5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
                        {kind === 'help' && (
                          <circle cx="0" cy="0" r="12" fill="none" stroke="#FF4D67" strokeWidth="1.4">
                            <animate attributeName="r" values="7;16;7" dur="1.3s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.9;0;0.9" dur="1.3s" repeatCount="indefinite" />
                          </circle>
                        )}
                        {kind === 'unknown' && (
                          <text x="7" y="-4" fill="#F8D34F" fontSize="10" fontFamily="IBM Plex Mono, monospace">
                            ?
                          </text>
                        )}
                      </g>
                    )
                  })}
                </g>
              )}
            </g>
          )
        })}

        {/* ---- north stair (right side) ---- */}
        <g>
          <polyline
            points="270,352 270,252 270,152"
            stroke={blocked ? '#FF4D67' : '#4CB9FF'}
            strokeWidth={blocked ? 3 : 2}
            strokeLinecap="round"
            opacity={blocked ? 1 : 0.6}
            strokeDasharray={blocked ? '6 5' : undefined}
          />
          {[352, 302, 252, 202, 152].map((y) => (
            <line
              key={y}
              x1="262"
              y1={y}
              x2="278"
              y2={y}
              stroke={blocked ? '#FF4D67' : '#4CB9FF'}
              strokeWidth="2"
              opacity={blocked ? 0.9 : 0.45}
            />
          ))}
          <text x="270" y="118" textAnchor="middle" fill={blocked ? '#FF4D67' : '#8CA3AF'} fontSize="9" fontFamily="IBM Plex Mono, monospace">
            ESC. NORTE
          </text>
          {blocked && (
            <g>
              <circle cx="270" cy="252" r="13" fill="rgba(255,77,103,0.18)" stroke="#FF4D67" strokeWidth="1.6">
                <animate attributeName="opacity" values="1;0.35;1" dur="1.1s" repeatCount="indefinite" />
              </circle>
              <path d="M264 246 l12 12 M276 246 l-12 12" stroke="#FF4D67" strokeWidth="2.4" strokeLinecap="round" />
              <text x="270" y="280" textAnchor="middle" fill="#FF4D67" fontSize="9" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
                BLOQUEADA
              </text>
            </g>
          )}
        </g>

        {/* ---- south stair (alternative) ---- */}
        <polyline
          points="140,352 140,252 140,152"
          stroke={blocked ? '#35F2B1' : 'rgba(140,163,175,0.35)'}
          strokeWidth={blocked ? 3 : 1.6}
          strokeLinecap="round"
          opacity={blocked ? 1 : 0.5}
        />
        <text x="140" y="118" textAnchor="middle" fill={blocked ? '#35F2B1' : '#8CA3AF'} fontSize="9" fontFamily="IBM Plex Mono, monospace">
          ESC. SUR
        </text>

        {/* ---- evacuation routes ---- */}
        {/* primary via north */}
        <path
          d="M205 140 L258 152 L270 252 L258 344 L205 358 L205 398"
          fill="none"
          stroke="#4CB9FF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="8 7"
          opacity={blocked ? 0.1 : 0.85}
          style={{ transition: 'opacity 0.9s ease' }}
        >
          {!blocked && <animate attributeName="stroke-dashoffset" from="30" to="0" dur="1.1s" repeatCount="indefinite" />}
        </path>
        {/* alternative via south */}
        <path
          d="M205 140 L152 152 L140 252 L152 344 L205 358 L205 398"
          fill="none"
          stroke="#35F2B1"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="620"
          opacity={blocked ? 1 : 0}
          style={{
            transition: 'opacity 0.6s ease',
            strokeDashoffset: blocked ? 0 : 620,
            animation: blocked ? 'none' : undefined,
          }}
        >
          {blocked && <animate attributeName="stroke-dashoffset" from="620" to="0" dur="1.5s" fill="freeze" />}
          {blocked && (
            <animate attributeName="stroke-width" values="3;4.2;3" dur="1.8s" repeatCount="indefinite" begin="1.5s" />
          )}
        </path>

        {/* exit marker */}
        <g transform="translate(205,404)">
          <rect x="-26" y="0" width="52" height="17" rx="5" fill={blocked ? 'rgba(53,242,177,0.16)' : 'rgba(76,185,255,0.14)'} stroke={blocked ? '#35F2B1' : '#4CB9FF'} strokeWidth="1" />
          <text x="0" y="12" textAnchor="middle" fill={blocked ? '#35F2B1' : '#4CB9FF'} fontSize="9" fontFamily="IBM Plex Mono, monospace" letterSpacing="1">
            SALIDA
          </text>
        </g>

        {/* event light travelling upward */}
        {active && (
          <g opacity="0.9">
            <ellipse cx={CX} cy={380} rx={150} ry={46} fill="none" stroke="#FF8A3D" strokeWidth="2">
              <animate attributeName="cy" values="400;120" dur="2.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.85;0" dur="2.2s" repeatCount="indefinite" />
            </ellipse>
          </g>
        )}
      </svg>

      <div
        className="mono"
        style={{ position: 'absolute', bottom: 2, left: 10, fontSize: 9, color: 'rgba(140,163,175,0.7)' }}
      >
        DATOS RELATIVOS / NO CALIBRADOS · 0–100 SOLO VISUAL
      </div>
    </div>
  )
}
