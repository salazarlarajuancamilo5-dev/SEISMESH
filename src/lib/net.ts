import type { NetMessage } from './types'

/** Transport: PeerJS (WebRTC DataChannel) with a BroadcastChannel fallback for
 *  same-browser tabs. Everything degrades silently; the UI never blocks on it. */

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY3479'

export function makeSessionCode(): string {
  let s = ''
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  return s
}

export const peerIdFor = (code: string) => `seismesh-mesh-${code.toLowerCase()}`
export const channelFor = (code: string) => `seismesh-${code.toLowerCase()}`

type Handler = (m: NetMessage, from: string) => void
type StatusHandler = (s: 'connected' | 'reconnecting' | 'local') => void

interface PeerLike {
  on(ev: string, cb: (...a: unknown[]) => void): void
  destroy(): void
  connect(id: string, opts?: unknown): ConnLike
  disconnected?: boolean
  reconnect?(): void
}
interface ConnLike {
  on(ev: string, cb: (...a: unknown[]) => void): void
  send(data: unknown): void
  close(): void
  open?: boolean
  peer?: string
}

async function loadPeer(): Promise<null | (new (id?: string, opts?: unknown) => PeerLike)> {
  try {
    const mod = await import('peerjs')
    return mod.Peer as unknown as new (id?: string, opts?: unknown) => PeerLike
  } catch {
    return null
  }
}

/** Dashboard side: accepts sensor connections. */
export class MeshHost {
  private peer: PeerLike | null = null
  private conns = new Map<string, ConnLike>()
  private bc: BroadcastChannel | null = null
  private onMsg: Handler
  private onStatus: StatusHandler
  private dead = false

  constructor(public code: string, onMsg: Handler, onStatus: StatusHandler) {
    this.onMsg = onMsg
    this.onStatus = onStatus
    this.startBroadcast()
    void this.startPeer()
  }

  private startBroadcast() {
    try {
      this.bc = new BroadcastChannel(channelFor(this.code))
      this.bc.onmessage = (e) => {
        const d = e.data as { dir?: string; msg?: NetMessage; from?: string }
        if (d?.dir === 'up' && d.msg) this.onMsg(d.msg, d.from ?? 'bc')
      }
    } catch {
      this.bc = null
    }
  }

  private async startPeer() {
    const Peer = await loadPeer()
    if (!Peer || this.dead) return
    try {
      this.peer = new Peer(peerIdFor(this.code), { debug: 0 })
      this.peer.on('open', () => this.onStatus('connected'))
      this.peer.on('connection', (c: unknown) => {
        const conn = c as ConnLike
        conn.on('open', () => {
          this.conns.set(conn.peer ?? String(this.conns.size), conn)
          this.onStatus('connected')
        })
        conn.on('data', (d: unknown) => this.onMsg(d as NetMessage, conn.peer ?? 'peer'))
        conn.on('close', () => this.conns.delete(conn.peer ?? ''))
        conn.on('error', () => void 0)
      })
      this.peer.on('disconnected', () => {
        this.onStatus('reconnecting')
        try {
          this.peer?.reconnect?.()
        } catch {
          /* ignore */
        }
      })
      this.peer.on('error', () => this.onStatus('local'))
    } catch {
      this.onStatus('local')
    }
  }

  broadcast(msg: NetMessage) {
    this.conns.forEach((c) => {
      try {
        c.send(msg)
      } catch {
        /* ignore */
      }
    })
    try {
      this.bc?.postMessage({ dir: 'down', msg })
    } catch {
      /* ignore */
    }
  }

  destroy() {
    this.dead = true
    try {
      this.bc?.close()
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy()
    } catch {
      /* ignore */
    }
  }
}

/** Phone side: connects to the dashboard. */
export class MeshClient {
  private peer: PeerLike | null = null
  private conn: ConnLike | null = null
  private bc: BroadcastChannel | null = null
  private dead = false
  private retries = 0
  state: 'connected' | 'reconnecting' | 'local' = 'reconnecting'

  constructor(
    public code: string,
    private onMsg: Handler,
    private onStatus: StatusHandler,
  ) {
    try {
      this.bc = new BroadcastChannel(channelFor(this.code))
      this.bc.onmessage = (e) => {
        const d = e.data as { dir?: string; msg?: NetMessage }
        if (d?.dir === 'down' && d.msg) this.onMsg(d.msg, 'host')
      }
    } catch {
      this.bc = null
    }
    void this.connect()
    // If WebRTC never opens, we still work locally (BroadcastChannel / virtual).
    setTimeout(() => {
      if (this.state !== 'connected') this.setState('local')
    }, 4500)
  }

  private setState(s: 'connected' | 'reconnecting' | 'local') {
    this.state = s
    this.onStatus(s)
  }

  private async connect() {
    const Peer = await loadPeer()
    if (!Peer || this.dead) return this.setState('local')
    try {
      this.peer = new Peer(undefined, { debug: 0 })
      this.peer.on('open', () => this.open())
      this.peer.on('error', () => this.retry())
      this.peer.on('disconnected', () => this.setState('reconnecting'))
    } catch {
      this.setState('local')
    }
  }

  private open() {
    if (this.dead || !this.peer) return
    try {
      const c = this.peer.connect(peerIdFor(this.code), { reliable: false, serialization: 'json' })
      this.conn = c
      c.on('open', () => {
        this.retries = 0
        this.setState('connected')
      })
      c.on('data', (d: unknown) => this.onMsg(d as NetMessage, 'host'))
      c.on('close', () => this.retry())
      c.on('error', () => this.retry())
    } catch {
      this.retry()
    }
  }

  private retry() {
    if (this.dead) return
    this.retries += 1
    if (this.retries > 4) return this.setState('local')
    this.setState('reconnecting')
    setTimeout(() => this.open(), 1200 * this.retries)
  }

  send(msg: NetMessage) {
    try {
      if (this.conn?.open) this.conn.send(msg)
    } catch {
      /* ignore */
    }
    try {
      this.bc?.postMessage({ dir: 'up', msg, from: 'bc' })
    } catch {
      /* ignore */
    }
  }

  destroy() {
    this.dead = true
    try {
      this.bc?.close()
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy()
    } catch {
      /* ignore */
    }
  }
}
