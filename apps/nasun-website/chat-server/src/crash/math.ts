// Quadratic multiplier approximation: same formula as crash.move
// mult_bps(t_ms) = 10000 + 6*t + 36*t*t/20000
// Matches e^(0.00006*t) within ~3% for t in [0, 60000 ms].

export function multiplierAtBps(elapsedMs: number): number {
  const t = Math.floor(elapsedMs);
  const linear = 6 * t;
  const quad = Math.floor((36 * t * t) / 20_000);
  return 10_000 + linear + quad;
}

export function inverseMultiplierAt(targetBps: number): number {
  if (targetBps <= 10_000) return 0;
  let lo = 0;
  let hi = 120_000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (multiplierAtBps(mid) < targetBps) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
