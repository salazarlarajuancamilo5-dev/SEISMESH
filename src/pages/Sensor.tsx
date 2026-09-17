import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  DoorClosed,
  Flame,
  HeartPulse,
  PackageX,
  RadioTower,
  ShieldQuestion,
  Siren,
  Smartphone,
  Vibrate,
  X,
} from 'lucide-react'
import { Logo, Mark } from '../components/Logo'
import { MeshClient } from '../lib/net'
import { MotionProcessor, INTENSITY_LABEL, levelColor } from '../lib/motion'
import { sfx, unlockAudio, vibrate } from '../lib/audio'
import { ZONES, type ConnectionState, type HazardType, type NetMessage, type OccupantStatus, type SensorKind, type ZoneId } from '../lib/types'

type Stage = 'join' | 'permission' | 'calibrating' | 'live'

const HAZARD_UI: { type: HazardType; label: string; Icon: typeof Flame }[] = [
  { type: 'exit', label: 'Salida bloqueada', Icon: DoorClosed },
  { type: 'injury', label: 'Persona herida', Icon: HeartPulse },
  { type: 'fire', label: 'Humo o fuego', Icon: Flame },
  { type: 'leak', label: 'Posible fuga', Icon: Droplets },
  { type: 'debris', label: 'Objetos caídos', Icon: PackageX },
  { type: 'other', label: 'Otro peligro', Icon: ShieldQuestion },
]

const sensorId = 'p-' + Math.random().toString(36).slice(2, 8)

export default function Sensor() {
  const params = new URLSearchParams(window.location.search)
  const code = (params.get('room') || 'DEMO').toUpperCase()
  const zoneParam = (params.get('zone') as ZoneId) || null

  const [stage, setStage] = useState<Stage>('join')
  const [zone, setZone] = useState<ZoneId>(zoneParam ?? 'z1')
  const [alias, setAlias] = useState('')
  const [kind, setKind] = useState<SensorKind>('motion')
  const [conn, setConn] = useState<ConnectionState>('reconnecting')
  const [level, setLevel] = useState(0)
  const [status, setStatus] = useState<OccupantStatus>('unknown')
  const [countdown, setCountdown] = useState(3)
  const [sheet, setSheet] = useState(false)
  const [alarm, setAlarm] = useState(false)
  const [alarmT, setAlarmT] = useState(0)
  const [sent, setSent] = useState<string[]>([])
  const [since, setSince] = useState(0)
  const [note, setNote] = useState<string | null>(null)

  const proc = useRef(new MotionProcessor())
  const client = useRef<MeshClient | null>(null)
  const touchLevel = useRef(0)
  const startedAt = useRef(0)
  const aliasFinal = useMemo(
    () => (alias.trim() ? alias.trim().slice(0, 16) : 'Teléfono ' + sensorId.slice(2, 5).toUpperCase()),
    [alias],
  )

  useEffect(() => {
    document.body.classList.add('scrollable')
    return () => document.body.classList.remove('scrollable')
  }, [])

  /* ---- incoming commands from the control room ---- */
  const onHostMessage = useCallback((m: NetMessage) => {
    if (m.t === 'event' || m.t === 'checkin') {
      setAlarm(true)
      setAlarmT(0)
      setStatus('awaiting')
      vibrate(m.t === 'event' ? [160, 80, 160, 80, 240] : [90, 60, 90])
      if (m.t === 'event') sfx.event()
      else sfx.checkin()
    }
    if (m.t === 'reset') {
      setAlarm(false)
      setStatus('unknown')
      setSent([])
    }
  }, [])

  /* ---- alarm timer ---- */
  useEffect(() => {
    if (!alarm) return
    const i = setInterval(() => setAlarmT((t) => t + 1), 1000)
    return () => clearInterval(i)
  }, [alarm])

  useEffect(() => {
    if (stage !== 'live') return
    const i = setInterval(() => setSince(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(i)
  }, [stage])

  /* ---- transport ---- */
  const connect = useCallback(
    (k: SensorKind) => {
      if (client.current) return
      client.current = new MeshClient(code, onHostMessage, (s) => setConn(s))
      client.current.send({ t: 'hello', sensorId, alias: aliasFinal, zoneId: zone, kind: k, battery: null })
    },
    [code, zone, aliasFinal, onHostMessage],
  )

  useEffect(() => () => client.current?.destroy(), [])

  /* ---- motion pipeline ---- */
  const motionHandler = useRef<((e: DeviceMotionEvent) => void) | null>(null)

  const attachMotion = useCallback(() => {
    const h = (e: DeviceMotionEvent) => {
      const a = e.acceleration
      const g = e.accelerationIncludingGravity
      if (a && (a.x !== null || a.y !== null)) proc.current.push(a.x ?? 0, a.y ?? 0, a.z ?? 0, false)
      else if (g) proc.current.push(g.x ?? 0, g.y ?? 0, g.z ?? 0, true)
    }
    motionHandler.current = h
    window.addEventListener('devicemotion', h)
  }, [])

  const startCalibration = useCallback(
    (k: SensorKind) => {
      setKind(k)
      setStage('calibrating')
      setCountdown(3)
      let n = 3
      const i = setInterval(() => {
        n -= 1
        setCountdown(n)
        if (n <= 0) {
          clearInterval(i)
          proc.current.calibrate()
          startedAt.current = Date.now()
          connect(k)
          setStage('live')
          sfx.ok()
          vibrate(40)
        }
      }, 1000)
    },
    [connect],
  )

  const requestSensor = useCallback(async () => {
    unlockAudio()
    sfx.click()
    const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined
    try {
      if (DM && typeof DM.requestPermission === 'function') {
        const res = await DM.requestPermission()
        if (res !== 'granted') {
          setNote('Permiso denegado — activado el sensor táctil de demostración.')
          return startCalibration('touch')
        }
        attachMotion()
        return startCalibration('motion')
      }
      if (typeof window.DeviceMotionEvent !== 'undefined') {
        attachMotion()
        // if no samples arrive in 1.2 s, fall back to touch
        setTimeout(() => {
          if (proc.current.rms() === 0) {
            setKind('touch')
            setNote('Sin datos del acelerómetro — sensor táctil activo.')
          }
        }, 1400)
        return startCalibration('motion')
      }
      setNote('Este dispositivo no expone acelerómetro — sensor táctil activo.')
      startCalibration('touch')
    } catch {
      setNote('No se pudo activar el acelerómetro — sensor táctil activo.')
      startCalibration('touch')
    }
  }, [attachMotion, startCalibration])

  /* ---- 10 Hz sampling + transmission ---- */
  useEffect(() => {
    if (stage !== 'live') return
    let battery: number | null = null
    const navAny = navigator as unknown as { getBattery?: () => Promise<{ level: number }> }
    navAny.getBattery?.().then((b) => {
      battery = Math.round(b.level * 100)
    }).catch(() => undefined)

    const i = setInterval(() => {
      const now = Date.now()
      const read = proc.current.read(now)
      const lvl = kind === 'touch' ? touchLevel.current : read.level
      const shown = Math.max(lvl, touchLevel.current)
      setLevel(shown)
      touchLevel.current *= 0.86
      client.current?.send({
        t: 'sample',
        payload: {
          sessionId: code,
          sensorId,
          alias: aliasFinal,
          zoneId: zone,
          timestamp: now,
          rms: read.rms,
          peak: read.peak,
          normalizedIntensity: shown,
          status,
          battery,
          connectionState: client.current?.state ?? 'local',
          kind,
        },
      })
    }, 100)
    return () => clearInterval(i)
  }, [stage, kind, zone, aliasFinal, code, status])

  useEffect(
    () => () => {
      if (motionHandler.current) window.removeEventListener('devicemotion', motionHandler.current)
    },
    [],
  )

  const pushTouch = (v: number) => {
    touchLevel.current = Math.min(1, touchLevel.current + v)
  }

  const answer = (s: OccupantStatus) => {
    unlockAudio()
    setStatus(s)
    setAlarm(false)
    client.current?.send({ t: 'status', sensorId, status: s })
    vibrate(s === 'help' ? [200, 90, 200] : 60)
    if (s === 'help') sfx.help()
    else sfx.ok()
  }

  const report = (h: HazardType, label: string) => {
    unlockAudio()
    client.current?.send({ t: 'hazard', sensorId, zoneId: zone, alias: aliasFinal, hazard: h, at: Date.now() })
    setSent((v) => [label, ...v].slice(0, 4))
    setSheet(false)
    vibrate([120, 60, 120])
    sfx.hazard()
  }

  const zoneName = ZONES.find((z) => z.id === zone)?.name ?? ''
  const connLabel = conn === 'connected' ? 'Conectado' : conn === 'reconnecting' ? 'Conectando…' : 'Sensor activo'

  /* ================= screens ================= */

  if (stage === 'join') {
    return (
      <div className="phone">
        <div className="backdrop" />
        <Logo size={30} fontSize={21} tagline="DISTRIBUTED AWARENESS" />
        <div className="panel" style={{ padding: 14, display: 'grid', gap: 4 }}>
          <span className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.16em' }}>
            SESIÓN
          </span>
          <span className="mono" style={{ fontSize: 26, color: 'var(--mesh)', letterSpacing: '0.24em' }}>
            {code}
          </span>
        </div>

        <div>
          <div className="panel-t" style={{ marginBottom: 8 }}>
            ¿En qué zona estás?
          </div>
          <div className="zone-pick">
            {ZONES.map((z) => (
              <button key={z.id} aria-pressed={zone === z.id} onClick={() => setZone(z.id)}>
                <span className="mono" style={{ fontSize: 13, opacity: 0.7 }}>
                  P{z.floor}
                </span>
                {z.short}
              </button>
            ))}
          </div>
        </div>

        <input
          className="field"
          placeholder="Alias (opcional)"
          value={alias}
          maxLength={16}
          onChange={(e) => setAlias(e.target.value)}
          aria-label="Alias opcional"
        />

        <button
          className="bigbtn ok"
          onClick={() => {
            unlockAudio()
            sfx.click()
            setStage('permission')
          }}
        >
          <RadioTower size={19} /> Conectar sensor
        </button>
        <p className="muted" style={{ fontSize: 12, textAlign: 'center', margin: 0, lineHeight: 1.45 }}>
          No se guarda información personal ni ubicación GPS. Solo movimiento relativo de la zona que elijas.
        </p>
      </div>
    )
  }

  if (stage === 'permission') {
    return (
      <div className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="backdrop" />
        <div style={{ display: 'grid', justifyItems: 'center', gap: 18 }}>
          <svg width="150" height="140" viewBox="0 0 150 140" aria-hidden>
            <rect x="57" y="34" width="36" height="66" rx="8" fill="#132633" stroke="#35F2B1" strokeWidth="1.6" />
            <rect x="63" y="42" width="24" height="44" rx="3" fill="rgba(53,242,177,0.18)" />
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <circle cx="75" cy="67" r={24 + i * 18} fill="none" stroke="#35F2B1" strokeWidth="1.4" opacity="0.5">
                  <animate attributeName="opacity" values="0.55;0;0.55" dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                  <animate attributeName="r" values={`${20 + i * 16};${34 + i * 18};${20 + i * 16}`} dur="2.4s" begin={`${i * 0.5}s`} repeatCount="indefinite" />
                </circle>
              </g>
            ))}
          </svg>
          <h1 className="dsp" style={{ fontSize: 24, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            Tu teléfono puede aportar el movimiento relativo de esta zona
          </h1>
          <p className="muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Usamos el acelerómetro solo para medir vibración relativa mientras esta pestaña esté abierta.
          </p>
          <button className="bigbtn ok" onClick={requestSensor}>
            <Vibrate size={19} /> Activar sensor
          </button>
          <button className="btn ghost" onClick={() => startCalibration('touch')}>
            Usar sensor táctil de demostración
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'calibrating') {
    return (
      <div className="phone" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div className="backdrop" />
        <div style={{ display: 'grid', justifyItems: 'center', gap: 20 }}>
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle cx="90" cy="90" r="74" fill="none" stroke="rgba(140,163,175,0.2)" strokeWidth="6" />
            <circle
              cx="90"
              cy="90"
              r="74"
              fill="none"
              stroke="#35F2B1"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="465"
              strokeDashoffset={465 * (countdown / 3)}
              transform="rotate(-90 90 90)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
            <text x="90" y="104" textAnchor="middle" fill="#F4F8FA" fontSize="48" fontFamily="Space Grotesk, sans-serif" fontWeight="700">
              {countdown > 0 ? countdown : '✓'}
            </text>
          </svg>
          <h2 className="dsp" style={{ margin: 0, fontSize: 21 }}>
            {countdown > 0 ? 'Mantén el teléfono quieto' : 'Sensor calibrado'}
          </h2>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Calculando línea base y ruido de referencia…
          </p>
        </div>
      </div>
    )
  }

  /* ---------------- LIVE ---------------- */
  return (
    <div
      className="phone"
      onPointerDown={(e) => {
        if (kind === 'touch') pushTouch(0.35)
        else if (e.pointerType === 'touch') pushTouch(0.05)
      }}
      onPointerMove={(e) => {
        if (kind === 'touch' && e.buttons) pushTouch(0.06)
      }}
    >
      <div className="backdrop" />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Logo size={26} fontSize={17} active event={alarm} />
        <span className={`tag ${conn === 'connected' ? 'ok' : 'warn'}`} style={{ marginLeft: 'auto' }}>
          {connLabel}
        </span>
      </div>

      <div className="panel" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" />
          <span className="dsp" style={{ fontSize: 26, letterSpacing: '-0.02em' }}>
            {connLabel}
          </span>
          <span className="tag" style={{ marginLeft: 'auto' }}>
            {kind === 'touch' ? 'SENSOR TÁCTIL' : 'ACELERÓMETRO'}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
          {zoneName.toUpperCase()} · {aliasFinal} · {Math.floor(since / 60)}:{String(since % 60).padStart(2, '0')}
        </div>

        {/* live wave */}
        <svg viewBox="0 0 300 70" style={{ width: '100%', height: 70 }} aria-hidden>
          {Array.from({ length: 30 }).map((_, i) => {
            const idle = 3 + Math.abs(Math.sin(i * 0.55 + Date.now() / 420)) * 4
            const h = Math.max(idle, level * 62 * (0.45 + Math.abs(Math.sin(i * 0.7 + Date.now() / 160))))
            return (
              <rect
                key={i}
                x={i * 10 + 2}
                y={35 - h / 2}
                width="6"
                height={h}
                rx="3"
                fill={levelColor(level)}
                opacity={0.35 + level * 0.65}
              />
            )
          })}
        </svg>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="dsp" style={{ fontSize: 44, color: levelColor(level), letterSpacing: '-0.03em' }}>
            {Math.round(level * 100)}
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
            NIVEL RELATIVO · {INTENSITY_LABEL[level > 0.78 ? 'spike' : level > 0.45 ? 'strong' : level > 0.14 ? 'movement' : 'stable'].toUpperCase()}
          </span>
        </div>
        {kind === 'touch' && (
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Mantén pulsado o desliza para simular intensidad.
          </p>
        )}
        {note && (
          <p className="mono" style={{ fontSize: 11, margin: 0, color: 'var(--mid)' }}>
            {note}
          </p>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <button className="bigbtn ok" onClick={() => answer('ok')} aria-pressed={status === 'ok'}>
          <CheckCircle2 size={20} /> Estoy bien
        </button>
        <button className="bigbtn help" onClick={() => answer('help')} aria-pressed={status === 'help'}>
          <Siren size={20} /> Necesito ayuda
        </button>
        <button className="bigbtn" onClick={() => setSheet(true)}>
          <AlertTriangle size={19} color="#FF8A3D" /> Reportar peligro
        </button>
      </div>

      {status !== 'unknown' && (
        <div className={`tag ${status === 'help' ? 'crit' : 'ok'}`} style={{ alignSelf: 'start' }}>
          ESTADO ENVIADO: {status === 'help' ? 'NECESITO AYUDA' : status === 'ok' ? 'ESTOY BIEN' : 'PENDIENTE'}
        </div>
      )}
      {sent.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          {sent.map((s, i) => (
            <span key={i} className="tag warn">
              REPORTADO: {s.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <p className="mono" style={{ fontSize: 10, color: 'rgba(140,163,175,0.75)', lineHeight: 1.5, marginTop: 'auto' }}>
        DATOS RELATIVOS / NO CALIBRADOS. SEISMESH NO CERTIFICA RUTAS NI EVALÚA DAÑO ESTRUCTURAL. SIGUE SIEMPRE LAS
        INDICACIONES DEL PERSONAL DE EMERGENCIA.
      </p>

      {/* hazard sheet */}
      {sheet && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Reportar peligro" onClick={() => setSheet(false)}>
          <div className="sheet-inner" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
              <strong className="dsp" style={{ fontSize: 18 }}>
                Reportar peligro
              </strong>
              <button className="btn ghost" style={{ marginLeft: 'auto', padding: 8 }} onClick={() => setSheet(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>
            {HAZARD_UI.map(({ type, label, Icon }) => (
              <button key={type} className="bigbtn" style={{ justifyContent: 'flex-start', paddingLeft: 16 }} onClick={() => report(type, label)}>
                <Icon size={20} color="#FF8A3D" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* high-priority event screen */}
      {alarm && (
        <div className="alert-screen">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mark size={28} active event />
            <span className="tag crit flash">COMPROBACIÓN DE ESTADO</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 15 }}>
              {String(Math.floor(alarmT / 60)).padStart(2, '0')}:{String(alarmT % 60).padStart(2, '0')}
            </span>
          </div>
          <h1 className="dsp" style={{ fontSize: 42, margin: '10px 0 0', letterSpacing: '-0.035em' }}>
            ¿Estás bien?
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>
            El centro de control ha detectado movimiento en el edificio. Responde para que sepan dónde verificar primero.
          </p>
          <div style={{ display: 'grid', gap: 12, marginTop: 'auto' }}>
            <button className="bigbtn ok" style={{ minHeight: 78, fontSize: 22 }} onClick={() => answer('ok')}>
              <CheckCircle2 size={24} /> ESTOY BIEN
            </button>
            <button className="bigbtn help" style={{ minHeight: 78, fontSize: 22 }} onClick={() => answer('help')}>
              <Siren size={24} /> NECESITO AYUDA
            </button>
            <button className="bigbtn" onClick={() => setSheet(true)}>
              <AlertTriangle size={19} color="#FF8A3D" /> Reportar peligro
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <Smartphone size={12} color="#8CA3AF" />
              <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                {zoneName.toUpperCase()} · {connLabel.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
