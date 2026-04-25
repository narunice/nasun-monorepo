/**
 * Celebration effects (canvas-confetti). Ported from pado lib/celebration.ts.
 *
 * Color palette is gostop-specific (gold / emerald / crimson / royal).
 * Dynamic import is wrapped in try/catch so a CDN/chunk failure cannot crash
 * the win flow.
 *
 * CSP note: canvas-confetti creates a <canvas> on document.body. If a
 * Content-Security-Policy is added later, ensure 'self' for module load and
 * 'unsafe-inline' (or a nonce) for the canvas style attribute.
 */

export type CelebrationPreset = 'small' | 'medium' | 'large'
export type ConfettiRainIntensity = 'medium' | 'large'

const Z_INDEX = 80

const GOLD = ['#FFD700', '#FFA500', '#FFEAA7', '#d4af37', '#f2d67b']
const EMERALD = ['#10b981', '#34d399', '#86efac', '#22c55e', '#4ade80']
const CRIMSON = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca']
const ROYAL = ['#FFD700', '#d4af37', '#10b981', '#fdf6e3']

export const CELEBRATION_COLORS = {
  gold: GOLD,
  emerald: EMERALD,
  crimson: CRIMSON,
  royal: ROYAL,
} as const

export type CelebrationPaletteKey = keyof typeof CELEBRATION_COLORS

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

function scale(count: number): number {
  return isMobileViewport() ? Math.round(count * 0.5) : count
}

type ConfettiFn = (opts: Record<string, unknown>) => Promise<void> | void

async function loadConfetti(): Promise<ConfettiFn | null> {
  try {
    const mod = await import('canvas-confetti')
    return mod.default as unknown as ConfettiFn
  } catch (err) {
    // CDN / chunk-load failure shouldn't break the win flow.
    console.warn('[celebration] canvas-confetti load failed', err)
    return null
  }
}

async function fireSmall(colors: string[]) {
  const confetti = await loadConfetti()
  if (!confetti) return
  await confetti({
    particleCount: scale(50),
    spread: 60,
    origin: { x: 0.5, y: 0.6 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })
}

async function fireMedium(colors: string[]) {
  const confetti = await loadConfetti()
  if (!confetti) return

  confetti({
    particleCount: scale(60),
    spread: 70,
    origin: { x: 0.5, y: 0.5 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })

  await new Promise((r) => setTimeout(r, 300))

  confetti({
    particleCount: scale(40),
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.65 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })

  await confetti({
    particleCount: scale(40),
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.65 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })
}

async function fireLarge(colors: string[]) {
  const confetti = await loadConfetti()
  if (!confetti) return

  confetti({
    particleCount: scale(100),
    spread: 80,
    origin: { x: 0.5, y: 0.5 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })

  await new Promise((r) => setTimeout(r, 300))
  confetti({
    particleCount: scale(60),
    angle: 60,
    spread: 50,
    origin: { x: 0, y: 0.7 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })

  await new Promise((r) => setTimeout(r, 300))
  confetti({
    particleCount: scale(60),
    angle: 120,
    spread: 50,
    origin: { x: 1, y: 0.7 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  })

  await new Promise((r) => setTimeout(r, 400))
  await confetti({
    particleCount: scale(40),
    spread: 160,
    origin: { x: 0.5, y: 0 },
    shapes: ['star'],
    colors,
    zIndex: Z_INDEX,
    scalar: 1.2,
    disableForReducedMotion: true,
  })
}

export async function fireCelebration(
  preset: CelebrationPreset,
  colors?: string[],
): Promise<void> {
  if (prefersReducedMotion()) return
  const resolvedColors = colors ?? GOLD
  switch (preset) {
    case 'small':
      return fireSmall(resolvedColors)
    case 'medium':
      return fireMedium(resolvedColors)
    case 'large':
      return fireLarge(resolvedColors)
  }
}

export async function fireConfettiRain(
  intensity: ConfettiRainIntensity = 'medium',
  colors?: string[],
): Promise<void> {
  if (prefersReducedMotion()) return
  const confetti = await loadConfetti()
  if (!confetti) return
  const resolvedColors = colors ?? GOLD

  const isLarge = intensity === 'large'
  const origins = isLarge ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.2, 0.5, 0.8]
  const waveCount = isLarge ? 4 : 2
  const particlesPerBurst = scale(isLarge ? 20 : 18)
  const shapes: ('star' | 'circle' | 'square')[] = isLarge
    ? ['star', 'circle', 'square']
    : ['circle', 'square']

  for (let wave = 0; wave < waveCount; wave++) {
    for (const x of origins) {
      confetti({
        particleCount: particlesPerBurst,
        angle: 270,
        spread: 120,
        origin: { x, y: 0 },
        colors: resolvedColors,
        shapes,
        startVelocity: 8,
        gravity: 0.8,
        decay: 0.96,
        ticks: 400,
        zIndex: Z_INDEX,
        scalar: isLarge ? 1.2 : 1.0,
        disableForReducedMotion: true,
      })
    }
    if (wave < waveCount - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}
