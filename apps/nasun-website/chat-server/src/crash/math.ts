// Quadratic multiplier approximation: same formula as crash.move
// mult_bps(t_ms) = 10000 + 3*t + 9*t*t/20000
// Matches e^(0.00003*t) within ~3% for t in [0, 120000 ms].
// Coefficients halved on 2026-04-28 to stretch the FLYING window 2x.

export function multiplierAtBps(elapsedMs: number): number {
  const t = Math.floor(elapsedMs);
  const linear = 3 * t;
  const quad = Math.floor((9 * t * t) / 20_000);
  return 10_000 + linear + quad;
}

export function inverseMultiplierAt(targetBps: number): number {
  if (targetBps <= 10_000) return 0;
  let lo = 0;
  let hi = 240_000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (multiplierAtBps(mid) < targetBps) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
