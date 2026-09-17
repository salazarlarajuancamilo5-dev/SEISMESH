import { useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Activity,
  AlertTriangle,
  BatteryMedium,
  CheckCircle2,
  Flame,
  HelpCircle,
  Maximize2,
  PlayCircle,
  QrCode,
  RotateCcw,
  Siren,
  SlidersHorizontal,
  Smartphone,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react'
import { Logo, Mark } from '../components/Logo'
import { Building } from '../components/Building'
import { Timeline, WaveChart } from '../components/WaveChart'
import { computePriorities, store, useMesh } from '../lib/store'
import { INTENSITY_LABEL, levelColor } from '../lib/motion'
import { isMuted, sfx, toggleMuted, unlockAudio } from '../lib/audio'
import { ZONES, hazardLabel, type ZoneId } from '../lib/types'

function useClock() {
  const [t, setT] = useState(() => new Date())
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000)
    return () => clearInterval(i)
  }, [])
  return t
}

function AnimatedNumber({ value, digits = 0 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(value)
  const ref = useRef(value)
  useEffect(() => {
    let raf = 0
    const step = () => {
      ref.current += (value - ref.current) * 0.18
      setShown(ref.current)
      if (Math.abs(value - ref.current) > 0.05) raf = requestAnimationFrame(step)
      else setShown(value)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown.toFixed(digits)}</>
}

const SEV_COLOR: Record<string, string> = {
  critical: '#FF4D67',
  high: '#FF8A3D',
  medium: '#F8D34F',
  low: '#35F2B1',
}

const PRIORITY_ICON = {
  help: Siren,
  unknown: HelpCircle,
  fire: Flame,
  exit: AlertTriangle,
  spike: Zap,
  ok: CheckCircle2,
}

export default function Control() {
  const st = useMesh()
  const clock = useClock()
  const [showQR, setShowQR] = useState(false)
  const [muted, setMutedUI] = useState(isMuted())

  useEffect(() => {
    document.body.classList.remove('scrollable')
    store.startHost()
    if (!Object.keys(store.state.sensors).length) store.seedVirtual()
    return () => store.stopHost()
  }, [])

  const sensors = st.order.map((id) => st.sensors[id]).filter(Boolean)
  const connected = sensors.filter((s) => s.connection === 'connected').length
  const realCount = sensors.filter((s) => s.kind !== 'virtual').length

  const levels = useMemo(() => {
    const out = { z1: 0, z2: 0, z3: 0 } as Record<ZoneId, number>
    ZONES.forEach((z) => {
      const inZone = sensors.filter((s) => s.zoneId === z.id)
      out[z.id] = inZone.length ? Math.max(...inZone.map((s) => s.level)) : 0
    })
    return out
  }, [sensors])

  const statuses = useMemo(() => {
    const out = {} as Record<ZoneId, { ok: number; help: number; unknown: number; count: number }>
    ZONES.forEach((z) => {
      const inZone = sensors.filter((s) => s.zoneId === z.id)
      out[z.id] = {
        ok: inZone.filter((s) => s.status === 'ok').length,
        help: inZone.filter((s) => s.status === 'help').length,
        unknown: inZone.filter((s) => s.status !== 'ok' && s.status !== 'help').length,
        count: inZone.length,
      }
    })
    return out
  }, [sensors])

  const priorities = useMemo(() => computePriorities(st), [st, store.version])
  const unconfirmed = sensors.filter((s) => st.checkinAt && s.status !== 'ok' && s.status !== 'help').length
  const helping = sensors.filter((s) => s.status === 'help').length

  const sensorUrl = useMemo(() => {
    const base = window.location.origin
    return `${base}/sensor?room=${st.code}`
  }, [st.code])

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      unlockAudio()
      if (k === 'd') store.startDemo()
      else if (k === 'r') store.reset(true)
      else if (k === 'e') store.startEvent()
      else if (k === 'c') store.requestCheckin()
      else if (k === 'q') setShowQR((v) => !v)
      else if (k === 'p') store.prepareShow()
      else if (k === 'v') store.toggleCompare()
      else if (k === 'm') setMutedUI(toggleMuted())
      else if (k === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen()
        else void document.documentElement.requestFullscreen().catch(() => undefined)
      } else if (k === 'escape') setShowQR(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const eventActive = st.phase === 'event' || st.phase === 'checkin'
  const globalPct = Math.round(st.globalLevel * 100)

  const act = (fn: () => void) => () => {
    unlockAudio()
    sfx.click()
    fn()
  }

  return (
    <div className="control">
      <div className="backdrop" />

      {/* ====== TOP BAR ====== */}
      <header className="topbar">
        <Logo size={30} fontSize={20} active event={eventActive} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tag info">SESIÓN {st.code}</span>
          <span className={`tag ${st.net === 'connected' ? 'ok' : 'warn'}`}>
            {st.net === 'connected' ? 'RED ACTIVA' : st.net === 'reconnecting' ? 'RECONECTANDO' : 'MODO LOCAL'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 4 }}>
          <span className="dot" aria-hidden />
          <span className="mono" style={{ fontSize: 12 }}>
            {connected} TELÉFONOS → 1 RED
          </span>
          {realCount > 0 && <span className="tag ok">{realCount} REAL{realCount > 1 ? 'ES' : ''}</span>}
        </div>

        {eventActive && (
          <span className="tag crit flash" style={{ fontSize: 11 }}>
            <AlertTriangle size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
            EVENTO EN CURSO
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={{ fontSize: 15, letterSpacing: '0.06em' }}>
            {clock.toLocaleTimeString('es-ES', { hour12: false })}
          </span>
          <button
            className="btn ghost"
            style={{ padding: 8 }}
            onClick={act(() => setMutedUI(toggleMuted()))}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            title="Silenciar (M)"
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button
            className="btn ghost"
            style={{ padding: 8 }}
            onClick={act(() => {
              if (document.fullscreenElement) void document.exitFullscreen()
              else void document.documentElement.requestFullscreen().catch(() => undefined)
            })}
            aria-label="Pantalla completa"
            title="Pantalla completa (F)"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </header>

      {/* ====== STAGE ====== */}
      <main className="stage">
        {/* LEFT — building */}
        <section className="panel col" style={{ padding: '10px 12px', gridTemplateRows: 'auto 1fr' }}>
          <div className="panel-t">
            <Waves size={12} /> ESTRUCTURA · MOVIMIENTO POR ZONA
            {st.routeBlocked && <span className="tag crit" style={{ marginLeft: 'auto' }}>RUTA ALTERNATIVA</span>}
          </div>
          <Building state={st} levels={levels} statuses={statuses} />
        </section>

        {/* CENTER — signals */}
        <section className="col" style={{ gridTemplateRows: 'auto 1fr auto', minHeight: 0 }}>
          <div className="panel" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 18 }}>
            <div>
              <div className="panel-t">INTENSIDAD RELATIVA GLOBAL</div>
              <div className="bignum" style={{ color: levelColor(st.globalLevel), marginTop: 6 }}>
                <AnimatedNumber value={globalPct} />
                <span style={{ fontSize: 18, color: 'var(--muted)', marginLeft: 6 }}>/100</span>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                PICO {Math.round(st.globalPeak * 100)} · ESCALA NO CALIBRADA
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'grid', gap: 6, justifyItems: 'end' }}>
              {ZONES.map((z) => (
                <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>
                    P{z.floor}
                  </span>
                  <div className="bar" style={{ width: 110 }}>
                    <i style={{ width: `${levels[z.id] * 100}%`, background: levelColor(levels[z.id]) }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11, width: 24, color: levelColor(levels[z.id]) }}>
                    {Math.round(levels[z.id] * 100)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ padding: '10px 12px', display: 'grid', gridTemplateRows: 'auto 1fr auto', minHeight: 160 }}>
            <div className="panel-t">
              <Activity size={12} /> SEÑALES EN VIVO · ÚLTIMOS 22 s
            </div>
            <WaveChart state={st} sensors={sensors} />
            <Timeline state={st} />
          </div>

          <div className="panel scroll" style={{ padding: '10px 12px', maxHeight: 150, minHeight: 110 }}>
            <div className="panel-t" style={{ marginBottom: 7 }}>
              <SlidersHorizontal size={12} /> REGISTRO DE LA MALLA
            </div>
            <div style={{ display: 'grid', gap: 5 }}>
              {st.logs.slice(0, 8).map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 8, fontSize: 11.5, alignItems: 'baseline' }}>
                  <span className="mono" style={{ color: 'var(--muted)', fontSize: 10 }}>
                    {new Date(l.at).toLocaleTimeString('es-ES', { hour12: false }).slice(3)}
                  </span>
                  <span
                    style={{
                      color:
                        l.tone === 'critical'
                          ? 'var(--emer)'
                          : l.tone === 'warn'
                            ? 'var(--mid)'
                            : l.tone === 'good'
                              ? 'var(--mesh)'
                              : 'var(--text)',
                    }}
                  >
                    {l.text}
                  </span>
                </div>
              ))}
              {!st.logs.length && <span className="muted" style={{ fontSize: 12 }}>Malla en escucha…</span>}
            </div>
          </div>
        </section>

        {/* RIGHT — zones + priorities */}
        <section className="col" style={{ gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
          <div className="panel scroll" style={{ padding: '10px 12px', maxHeight: 330 }}>
            <div className="panel-t" style={{ marginBottom: 8 }}>
              <Smartphone size={12} /> ZONAS Y SENSORES · {sensors.length}
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {ZONES.map((z) => {
                const inZone = sensors.filter((s) => s.zoneId === z.id)
                const lvl = levels[z.id]
                const hz = st.hazards.filter((h) => h.zoneId === z.id)
                const stz = statuses[z.id]
                const critical = stz.help > 0 || (st.checkinAt && stz.unknown > 0 && stz.count > 0)
                return (
                  <div
                    key={z.id}
                    className="zone-row"
                    style={{ borderColor: critical ? 'rgba(255,77,103,0.55)' : undefined }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: 13, fontFamily: 'var(--font-display)' }}>{z.name}</strong>
                      <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: levelColor(lvl) }}>
                        {INTENSITY_LABEL[inZone[0]?.intensity ?? 'stable'].toUpperCase()}
                      </span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${lvl * 100}%`, background: levelColor(lvl) }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {inZone.length === 0 && <span className="tag">SIN SENSOR</span>}
                      {inZone.map((s) => (
                        <span
                          key={s.id}
                          className={`tag ${s.connection === 'connected' ? (s.kind === 'virtual' ? '' : 'info') : 'warn'}`}
                          title={s.kind === 'virtual' ? 'Sensor virtual' : 'Teléfono real'}
                        >
                          {s.kind === 'virtual' ? '◇' : '◆'} {s.alias.replace('Nodo ', '')}
                          {s.battery != null && (
                            <>
                              {' '}
                              <BatteryMedium size={9} style={{ verticalAlign: -1 }} />
                              {Math.round(s.battery)}%
                            </>
                          )}
                        </span>
                      ))}
                      {stz.help > 0 && <span className="tag crit">AYUDA ×{stz.help}</span>}
                      {stz.ok > 0 && <span className="tag ok">OK ×{stz.ok}</span>}
                      {!!st.checkinAt && stz.unknown > 0 && <span className="tag warn">SIN CONFIRMAR ×{stz.unknown}</span>}
                      {hz.map((h) => (
                        <span key={h.id} className="tag crit">
                          {hazardLabel(h.type).toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="panel scroll" style={{ padding: '10px 12px', minHeight: 0 }}>
            <div className="panel-t" style={{ marginBottom: 8 }}>
              <Siren size={12} /> PRIORIDADES DE VERIFICACIÓN
              <span className="tag" style={{ marginLeft: 'auto' }}>REGLAS DETERMINISTAS</span>
            </div>
            <div style={{ display: 'grid', gap: 7 }}>
              {priorities.map((p, i) => {
                const Icon = PRIORITY_ICON[p.icon]
                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '22px 16px 1fr',
                      gap: 9,
                      alignItems: 'start',
                      padding: '9px 10px',
                      borderRadius: 11,
                      border: `1px solid ${i === 0 ? SEV_COLOR[p.severity] + '80' : 'var(--line)'}`,
                      background: i === 0 ? SEV_COLOR[p.severity] + '12' : 'rgba(7,17,26,0.4)',
                      transition: 'all .35s ease',
                    }}
                  >
                    <span
                      className="mono"
                      style={{ fontSize: 15, fontWeight: 600, color: SEV_COLOR[p.severity], lineHeight: 1.1 }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <Icon size={15} color={SEV_COLOR[p.severity]} style={{ marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>{p.title}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2, lineHeight: 1.3 }}>
                        {p.detail}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {st.compare && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7 }}>
                {[
                  { k: 'SEÑALES', v: `${sensors.length} activas`, c: 'var(--info)' },
                  { k: 'PERSONAS', v: `${sensors.filter((s) => s.status === 'ok').length} confirmadas`, c: 'var(--mesh)' },
                  { k: 'OBSTÁCULOS', v: `${st.hazards.length} reportados`, c: 'var(--high)' },
                  { k: 'PRIORIDADES', v: `${priorities.length} activas`, c: 'var(--emer)' },
                ].map((x) => (
                  <div key={x.k} className="kpi" style={{ padding: '8px 10px' }}>
                    <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em' }}>
                      {x.k}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: x.c }}>{x.v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {st.phase === 'summary' && (
          <SummaryOverlay
            sensors={sensors.length}
            unconfirmed={unconfirmed}
            helping={helping}
            hazards={st.hazards.length}
            priority={priorities[0]?.title ?? '—'}
            onReplay={() => store.startDemo()}
            onClose={() => store.reset(true)}
          />
        )}
      </main>

      {/* ====== BOTTOM BAR ====== */}
      <footer className="bottombar">
        <button className="btn danger" onClick={act(() => store.startEvent())}>
          <Zap size={14} /> Iniciar evento <span className="k">E</span>
        </button>
        <button className="btn" onClick={act(() => store.requestCheckin())}>
          <HelpCircle size={14} /> Solicitar estado <span className="k">C</span>
        </button>
        <button className="btn primary" onClick={act(() => store.startDemo())}>
          <PlayCircle size={14} /> Iniciar demo <span className="k">D</span>
        </button>
        <button className="btn" onClick={act(() => store.prepareShow())}>
          <SlidersHorizontal size={14} /> Preparar <span className="k">P</span>
        </button>
        <button className="btn" onClick={act(() => store.reset(true))}>
          <RotateCcw size={14} /> Reiniciar <span className="k">R</span>
        </button>
        <button className="btn" onClick={act(() => setShowQR(true))}>
          <QrCode size={14} /> Conectar móviles <span className="k">Q</span>
        </button>
        <button className="btn ghost" onClick={act(() => store.toggleCompare())}>
          <Activity size={14} /> Comparar <span className="k">V</span>
        </button>
        <p className="disclaimer">
          Datos relativos no calibrados + reportes humanos.
          No estima magnitud sísmica ni certifica rutas o daño.
        </p>
      </footer>

      {showQR && <QRModal url={sensorUrl} code={st.code} net={st.net} onClose={() => setShowQR(false)} />}
    </div>
  )
}

function QRModal({
  url,
  code,
  net,
  onClose,
}: {
  url: string
  code: string
  net: string
  onClose: () => void
}) {
  return (
    <div
      className="sheet"
      style={{ alignItems: 'center' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Conectar teléfonos"
    >
      <div
        className="sheet-inner"
        style={{ maxWidth: 420, textAlign: 'center', justifyItems: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', width: '100%', alignItems: 'center' }}>
          <Logo size={24} fontSize={16} />
          <button className="btn ghost" style={{ marginLeft: 'auto', padding: 6 }} onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div style={{ background: '#F4F8FA', padding: 14, borderRadius: 16, marginTop: 4 }}>
          <QRCodeSVG value={url} size={210} bgColor="#F4F8FA" fgColor="#07111A" level="M" />
        </div>
        <div className="mono" style={{ fontSize: 22, letterSpacing: '0.28em', color: 'var(--mesh)' }}>
          {code}
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.45 }}>
          Escanea para añadir este teléfono como sensor de una zona. Requiere HTTPS para el acelerómetro; si no está
          disponible se activa el sensor táctil.
        </p>
        <code className="mono" style={{ fontSize: 10.5, color: 'var(--info)', wordBreak: 'break-all' }}>
          {url}
        </code>
        <span className={`tag ${net === 'connected' ? 'ok' : 'warn'}`}>
          {net === 'connected' ? 'MALLA LISTA PARA RECIBIR' : 'MODO LOCAL · SENSORES VIRTUALES ACTIVOS'}
        </span>
      </div>
    </div>
  )
}

function SummaryOverlay({
  sensors,
  unconfirmed,
  helping,
  hazards,
  priority,
  onReplay,
  onClose,
}: {
  sensors: number
  unconfirmed: number
  helping: number
  hazards: number
  priority: string
  onReplay: () => void
  onClose: () => void
}) {
  return (
    <div className="overlay" style={{ position: 'fixed', inset: 12, borderRadius: 16 }}>
      <div
        className="panel"
        style={{ padding: 26, width: 'min(880px, 92vw)', display: 'grid', gap: 16, boxShadow: 'var(--shadow)' }}
      >
        <div className="sweep" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mark size={34} active />
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.2em', color: 'var(--muted)' }}>
              RESUMEN POSTERIOR
            </div>
            <h2 className="dsp" style={{ margin: '4px 0 0', fontSize: 30, letterSpacing: '-0.03em' }}>
              Primeros 30 segundos
            </h2>
          </div>
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <X size={14} /> Cerrar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { n: sensors, l: 'sensores activos', c: 'var(--mesh)' },
            { n: unconfirmed, l: 'ocupantes sin confirmar', c: unconfirmed ? 'var(--emer)' : 'var(--mesh)' },
            { n: hazards, l: 'rutas / peligros reportados', c: hazards ? 'var(--high)' : 'var(--mesh)' },
            { n: helping ? helping : 1, l: helping ? 'solicitudes de ayuda' : 'zona prioritaria', c: 'var(--mid)' },
          ].map((k) => (
            <div key={k.l} className="kpi">
              <b style={{ color: k.c }}>{k.n}</b>
              <span className="muted" style={{ fontSize: 12 }}>
                {k.l}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            border: '1px solid rgba(255,77,103,0.35)',
            background: 'rgba(255,77,103,0.08)',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', color: 'var(--muted)' }}>
            ACCIÓN PRIORITARIA
          </div>
          <div className="dsp" style={{ fontSize: 19, marginTop: 4 }}>
            {priority}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="tag warn">INFORMACIÓN PRELIMINAR · REQUIERE VALIDACIÓN PROFESIONAL</span>
          <button className="btn primary" onClick={onReplay}>
            <PlayCircle size={14} /> Reproducir evento
          </button>
          <p className="muted" style={{ margin: 0, fontSize: 12.5, flex: 1, minWidth: 260 }}>
            SEISMESH no sustituye una inspección. Hace visibles los primeros minutos de incertidumbre.
          </p>
        </div>
      </div>
    </div>
  )
}
