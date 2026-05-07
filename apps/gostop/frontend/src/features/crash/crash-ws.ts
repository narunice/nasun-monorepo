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

export interface CrashResolvePlayerRow {
  player: string
  betAmount: string
  payout: string
  multiplierBps: number
  timestampMs: number
  sessionIdHex: string
  betTx: string | null
}

export type CrashWsEvent =
  | { type: 'state_sync'; state: string; roundId: number | null; roundObjectId: string | null; commitHash: string | null; bettingEndsAt: number | null; flyingStartedAt: number | null; nextRoundAt: number | null; recentRounds: Array<{ roundId: number; crashPointBps: number }>; crashedAlreadyFired: boolean; stateVersion: number; serverTime: number }
  | { type: 'round_started'; roundId: number; roundObjectId: string; commitHash: string; bettingEndsAt: number; serverTime: number; stateVersion: number }
  // `predicted: true` means flyingStartedAt is the server's pre-RPC estimate.
  // A 'flying_corrected' event follows once the on-chain value is known.
  | { type: 'betting_closed'; roundId: number; flyingStartedAt: number; stateVersion: number; predicted?: boolean }
  | { type: 'flying_corrected'; roundId: number; flyingStartedAt: number; stateVersion: number }
  | { type: 'crashed'; roundId: number; crashPointBps: number; stateVersion: number }
  | { type: 'resolved'; roundId: number; crashPointBps: number; crashTimeMs: number; nextRoundAt: number; stateVersion: number }
  | { type: 'resolve_persisted'; roundId: number; resolveTx: string; rows: CrashResolvePlayerRow[]; stateVersion: number }
  | { type: 'disabled'; reason: 'backoff' | 'shutdown' | 'boot_blocked' | 'stale_recovery'; retryAt?: number; stateVersion: number }
  // ~1Hz FLYING liveness signal. Listeners can ignore the payload; receiving
  // any 'tick' frame is enough evidence the WS is healthy.
  | { type: 'tick'; roundId: number; serverTime: number; stateVersion: number }

type Listener = (event: CrashWsEvent) => void

let ws: WebSocket | null = null
let listeners: Listener[] = []
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let livenessTimer: ReturnType<typeof setInterval> | null = null
let lastMessageAt = 0

// Server heartbeat interval is 30s. If we go ~2x that without any frame, the
// WS is half-open or the server stopped emitting (e.g. crash-child stuck).
// onclose may never fire in half-open scenarios; force reconnect.
const LIVENESS_TIMEOUT_MS = 75_000
const LIVENESS_CHECK_MS = 15_000

function clearLiveness() {
  if (livenessTimer) {
    clearInterval(livenessTimer)
    livenessTimer = null
  }
}

function connect() {
  if (ws && ws.readyState < 2) return
  ws = new WebSocket(WS_URL)
  lastMessageAt = Date.now()

  ws.onopen = () => {
    lastMessageAt = Date.now()
    ws!.send(JSON.stringify({ channel: CRASH_CHANNEL, type: 'subscribe' }))
    clearLiveness()
    livenessTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - lastMessageAt > LIVENESS_TIMEOUT_MS) {
        // Force reconnect cycle. terminate-equivalent: close() schedules onclose
        // which restarts via the existing reconnect timer.
        try { ws.close() } catch {}
      }
    }, LIVENESS_CHECK_MS)
  }

  ws.onmessage = (e) => {
    lastMessageAt = Date.now()
    try {
      const data = JSON.parse(e.data as string)
      // Server-wide heartbeat frames (no channel) are liveness signal only.
      if (data?.type === 'heartbeat') return
      if (data.channel !== CRASH_CHANNEL) return
      for (const l of listeners) l(data as CrashWsEvent)
    } catch {}
  }

  ws.onclose = () => {
    clearLiveness()
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 1000)
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
