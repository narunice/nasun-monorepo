// HTTP client for Crash: fetch current round state (used on reconnect / initial load)

function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_CHAT_SERVER_URL as string | undefined
  if (explicit) return explicit.replace(/\/$/, '')
  return 'http://localhost:3101'
}

const API_BASE = resolveApiBase()

export interface CrashRoundState {
  stateVersion: number
  serverTime: number
  roundId: number | null
  roundObjectId: string | null
  state: 'IDLE' | 'BETTING' | 'FLYING' | 'CRASHED' | 'RESOLVED'
  commitHash: string | null
  bettingEndsAt: number | null
  flyingStartedAt: number | null
  recentRounds: Array<{ roundId: number; crashPointBps: number }>
  crashedAlreadyFired: boolean
}

export async function fetchCurrentRound(): Promise<CrashRoundState> {
  const res = await fetch(`${API_BASE}/api/crash/current-round`)
  if (!res.ok) throw new Error(`fetchCurrentRound: ${res.status}`)
  return res.json()
}
