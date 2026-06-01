/**
 * Bot signal: physically impossible screen resolution.
 *
 * A residual bot cluster on gostop reports fabricated screen resolutions
 * (e.g. 16696x9392, 22934x9600) that no real consumer display produces — 8K
 * tops out at 7680 wide, observed real devices at ~5333 wide, observed bots at
 * 9600+. The ~4000px gap makes `width >= 8192 || height >= 4321` a
 * zero-false-positive flag: a real device is never caught.
 *
 * Usage is "withhold, not block": this only gates ad rendering / metrics, never
 * gameplay. See apps/gostop/backend migration 007 for the server side.
 */

export function getScreenString(): string {
  const s = typeof window !== 'undefined' ? window.screen : undefined;
  const w = s?.width ?? 0;
  const h = s?.height ?? 0;
  return `${w}x${h}`;
}

export function isImpossibleResolution(width: number, height: number): boolean {
  return width >= 8192 || height >= 4321;
}

/**
 * True when the current browser reports an impossible screen resolution.
 * Intended for client-side ad-withholding (never for blocking access).
 */
export function isLikelyBot(): boolean {
  const s = typeof window !== 'undefined' ? window.screen : undefined;
  return isImpossibleResolution(s?.width ?? 0, s?.height ?? 0);
}
