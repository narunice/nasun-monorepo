// WebSocket singleton for Crash game events.
// Server sends { channel: 'crash', type: ..., ...payload }.

const CRASH_CHANNEL = 'crash'

function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_CHAT_SERVER_WS_URL as string | undefined
  if (explicit) return explicit
  // Derive from VITE_CHAT_SERVER_URL if available.
  const httpBase = import.meta.env.VITE_CHAT_SERVER_URL as string | undefined
  if (httpBase) {
    try {
      const u = new URL(httpBase)
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
      u.pathname = u.pathname.replace(/\/$/, '') + '/ws'
      return u.toString()
    } catch {}
  }
  return 'ws://localhost:3101/ws'
}

const WS_URL = resolveWsUrl()

export type CrashWsEvent =
  | { type: 'state_sync'; state: string; roundId: number | null; roundObjectId: string | null; commitHash: string | null; bettingEndsAt: number | null; flyingStartedAt: number | null; recentRounds: Array<{ roundId: number; crashPointBps: number }>; crashedAlreadyFired: boolean; stateVersion: number; serverTime: number }
  | { type: 'round_started'; roundId: number; roundObjectId: string; commitHash: string; bettingEndsAt: number; serverTime: number; stateVersion: number }
  | { type: 'betting_closed'; roundId: number; flyingStartedAt: number; stateVersion: number }
  | { type: 'crashed'; roundId: number; stateVersion: number }
  | { type: 'resolved'; roundId: number; crashPointBps: number; crashTimeMs: number; stateVersion: number }

type Listener = (event: CrashWsEvent) => void

let ws: WebSocket | null = null
let listeners: Listener[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function connect() {
  if (ws && ws.readyState < 2) return
  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    ws!.send(JSON.stringify({ channel: CRASH_CHANNEL, type: 'subscribe' }))
  }

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string)
      if (data.channel !== CRASH_CHANNEL) return
      for (const l of listeners) l(data as CrashWsEvent)
    } catch {}
  }

  ws.onclose = () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }

  ws.onerror = () => { ws?.close() }
}

export function subscribeCrash(listener: Listener): () => void {
  listeners.push(listener)
  if (listeners.length === 1) connect()
  return () => {
    listeners = listeners.filter((l) => l !== listener)
    if (listeners.length === 0) {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
      ws = null
    }
  }
}
