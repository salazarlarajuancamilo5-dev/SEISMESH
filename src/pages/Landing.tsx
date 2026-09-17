import { Link } from 'react-router-dom'
import { MonitorPlay, Smartphone } from 'lucide-react'
import { Logo } from '../components/Logo'
import { unlockAudio } from '../lib/audio'

export default function Landing() {
  return (
    <div className="landing" onPointerDown={unlockAudio}>
      <div className="backdrop" />
      <div style={{ display: 'grid', justifyItems: 'center', gap: 22, maxWidth: 720 }}>
        <Logo size={64} fontSize={44} tagline="DISTRIBUTED AWARENESS WHEN EVERY SECOND MATTERS" />
        <h1 className="dsp" style={{ fontSize: 'clamp(24px, 4.4vw, 40px)', margin: 0, letterSpacing: '-0.035em', lineHeight: 1.18 }}>
          Cada teléfono cuenta.
          <br />
          <span style={{ color: 'var(--mesh)' }}>Juntos revelan el impacto.</span>
        </h1>
        <p className="muted" style={{ fontSize: 16, margin: 0, lineHeight: 1.6, maxWidth: 580 }}>
          Un teléfono siente el movimiento. Una red de teléfonos ayuda a entender qué está ocurriendo dentro del
          edificio: movimiento relativo por planta, estado de los ocupantes y obstáculos reportados, en los primeros
          minutos de incertidumbre.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link to="/control" className="btn primary" style={{ padding: '14px 22px', fontSize: 15 }}>
            <MonitorPlay size={18} /> Abrir centro de control
          </Link>
          <Link to="/sensor" className="btn" style={{ padding: '14px 22px', fontSize: 15 }}>
            <Smartphone size={18} /> Conectar este teléfono como sensor
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
          <span className="tag ok">MOVIMIENTO</span>
          <span className="tag info">UBICACIÓN INTERNA</span>
          <span className="tag warn">ESTADO HUMANO</span>
          <span className="tag crit">OBSTÁCULOS</span>
        </div>

        <p className="mono" style={{ fontSize: 10.5, color: 'rgba(140,163,175,0.8)', maxWidth: 560, lineHeight: 1.6, margin: 0 }}>
          SEISMESH NO CALCULA MAGNITUD SÍSMICA, NO SUSTITUYE ACELERÓGRAFOS CALIBRADOS, NO CERTIFICA LA SEGURIDAD
          ESTRUCTURAL Y NO DIAGNOSTICA DAÑOS. ES UNA HERRAMIENTA DE CONCIENCIA SITUACIONAL INICIAL.
        </p>
      </div>
    </div>
  )
}
