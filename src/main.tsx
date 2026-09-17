import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Control from './pages/Control'
import Sensor from './pages/Sensor'
import './styles.css'

class Boundary extends React.Component<{ children: React.ReactNode }, { err: boolean }> {
  state = { err: false }
  static getDerivedStateFromError() {
    return { err: true }
  }
  render() {
    if (this.state.err) {
      return (
        <div className="landing">
          <div style={{ display: 'grid', gap: 14, justifyItems: 'center' }}>
            <h1 className="dsp" style={{ fontSize: 26 }}>
              SEISMESH siguió funcionando en modo seguro
            </h1>
            <a className="btn primary" href="/control">
              Volver al centro de control
            </a>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/control" element={<Control />} />
          <Route path="/sensor" element={<Sensor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Boundary>
  </React.StrictMode>,
)
