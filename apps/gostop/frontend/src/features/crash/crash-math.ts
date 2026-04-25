// Quadratic multiplier: same formula as crash.move and chat-server/crash/math.ts
// mult_bps(t_ms) = 10000 + 6*t + 36*t*t/20000

export function multiplierAtBps(elapsedMs: number): number {
  const t = Math.floor(elapsedMs)
  const linear = 6 * t
  const quad = Math.floor((36 * t * t) / 20_000)
  return 10_000 + linear + quad
}

export function formatMultiplier(bps: number): string {
  return (bps / 10_000).toFixed(2) + 'x'
}
