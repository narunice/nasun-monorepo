import { LOTTERY_MAX_NUMBER, LOTTERY_NUMBERS_COUNT, ROUND_STATUS } from '../../lib/gostop-config'

// NOT fairness-critical: player-chosen numbers. Modulo bias (2^32 % 25) negligible.
export function autoPickNumbers(): number[] {
  const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, i) => i + 1)
  const picked: number[] = []
  while (picked.length < LOTTERY_NUMBERS_COUNT) {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const idx = arr[0] % pool.length
    picked.push(pool.splice(idx, 1)[0])
  }
  return picked.sort((a, b) => a - b)
}

export function nextMondayUtc(): Date {
  const now = new Date()
  const day = now.getUTCDay() // 0=Sun..6=Sat
  const daysUntilMon = ((8 - day) % 7) || 7
  const d = new Date(now)
  d.setUTCDate(d.getUTCDate() + daysUntilMon)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function statusLabel(status: number): string {
  switch (status) {
    case ROUND_STATUS.OPEN: return 'Open'
    case ROUND_STATUS.CLOSED: return 'Closed'
    case ROUND_STATUS.DRAWN: return 'Drawn'
    case ROUND_STATUS.SETTLED: return 'Settled'
    default: return 'Unknown'
  }
}

export function fmtDiff(ms: number) {
  if (ms <= 0) return '00d 00h 00m 00s'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(ss)}s`
}
