/** SEISMESH mark, rebuilt as pure in-code SVG from the brand asset:
 *  a hexagonal building (light left half / blue right half) with stacked floor
 *  slabs, a vertical mesh axis with two nodes, and a seismogram crossing it.
 *  Reads as an S, a building, a network and a wave — works at 24 px and large. */

const LIGHT = '#F4F8FA'
const BLUE = '#4CB9FF'
const MESH = '#35F2B1'

export function Mark({ size = 28, active = true, event = false }: { size?: number; active?: boolean; event?: boolean }) {
  const node = event ? '#FF4D67' : MESH
  const wave = event ? '#FF4D67' : MESH
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 48 44" fill="none" role="img" aria-label="SEISMESH">
      <defs>
        <filter id="sm-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="sm-left">
          <rect x="0" y="0" width="24" height="44" />
        </clipPath>
        <clipPath id="sm-right">
          <rect x="24" y="0" width="24" height="44" />
        </clipPath>
      </defs>

      {/* hexagonal shell — light left half, blue right half */}
      {(
        [
          ['sm-left', LIGHT, 0.5],
          ['sm-right', BLUE, 1],
        ] as const
      ).map(([clip, color, op]) => (
        <g key={clip} clipPath={`url(#${clip})`} opacity={op}>
          <polygon
            points="24,2 41,11.5 41,32.5 24,42 7,32.5 7,11.5"
            fill="none"
            stroke={color}
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          {/* stacked floor slabs */}
          <polyline points="8,16.5 24,9 40,16.5" fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
          <polyline points="8,27.5 24,35 40,27.5" fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
        </g>
      ))}

      {/* vertical mesh axis */}
      <line x1="24" y1="9" x2="24" y2="35" stroke={node} strokeWidth="1.8" opacity={active ? 0.95 : 0.5} />

      {/* seismogram crossing the structure */}
      <polyline
        points="1,22 11,22 14,22 16,17 18,28 20,11 22,33 24,16 26,26 28,20 31,22 47,22"
        fill="none"
        stroke={wave}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#sm-glow)"
      >
        {active && (
          <animate
            attributeName="opacity"
            values={event ? '1;0.45;1' : '0.85;1;0.85'}
            dur={event ? '0.8s' : '2.6s'}
            repeatCount="indefinite"
          />
        )}
      </polyline>

      {/* the two nodes */}
      {[9, 35].map((cy, i) => (
        <g key={cy}>
          <circle cx="24" cy={cy} r="4" fill={node} filter="url(#sm-glow)" />
          {active && (
            <circle cx="24" cy={cy} r="4" fill="none" stroke={node} strokeWidth="1.3">
              <animate attributeName="r" values="4;10;4" dur="2.6s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0;0.7" dur="2.6s" begin={`${i * 0.8}s`} repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}
    </svg>
  )
}

export function Logo({
  size = 28,
  fontSize = 19,
  active = true,
  event = false,
  tagline,
}: {
  size?: number
  fontSize?: number
  active?: boolean
  event?: boolean
  tagline?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Mark size={size} active={active} event={event} />
      <div style={{ lineHeight: 1 }}>
        <div className="wordmark" style={{ fontSize }}>
          SEIS<span className="mesh">MESH</span>
        </div>
        {tagline && (
          <div
            className="mono"
            style={{ fontSize: Math.max(8, Math.min(11, fontSize * 0.42)), color: 'var(--muted)', letterSpacing: '0.14em', marginTop: 5, whiteSpace: 'nowrap' }}
          >
            {tagline}
          </div>
        )}
      </div>
    </div>
  )
}
