/**
 * Celebration effects using canvas-confetti.
 * Pure utility (React-independent). Dynamic import for lazy loading.
 *
 * Presets: 'small' | 'medium' | 'large'
 * - small:  50 particles, single center burst (lottery 3rd, etc.)
 * - medium: 100 particles, center + side burst (lottery 2nd, scratchcard big)
 * - large:  200+ particles, center + left/right cannons + stars (jackpots)
 */

export type CelebrationPreset = 'small' | 'medium' | 'large';

// Pado brand palette (default)
const BRAND_COLORS = ['#3bb9d8', '#5ee1e4', '#86f3b7', '#d2f6a2', '#4ECDC4'];
const GOLD_COLORS = ['#FFD700', '#FFA500', '#FFEAA7', '#FFE066', '#F5C842'];
const MINT_COLORS = ['#4ECDC4', '#96CEB4', '#98D8C8', '#45B7D1', '#3bb9d8'];

const Z_INDEX = 80;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isMobile(): boolean {
  return window.innerWidth < 768;
}

function scale(count: number): number {
  return isMobile() ? Math.round(count * 0.5) : count;
}

async function loadConfetti() {
  const mod = await import('canvas-confetti');
  return mod.default;
}

async function fireSmall(colors: string[]) {
  const confetti = await loadConfetti();
  await confetti({
    particleCount: scale(50),
    spread: 60,
    origin: { x: 0.5, y: 0.6 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });
}

async function fireMedium(colors: string[]) {
  const confetti = await loadConfetti();

  // Center burst
  confetti({
    particleCount: scale(60),
    spread: 70,
    origin: { x: 0.5, y: 0.5 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });

  // Delayed side bursts
  await new Promise((r) => setTimeout(r, 300));

  confetti({
    particleCount: scale(40),
    angle: 60,
    spread: 55,
    origin: { x: 0, y: 0.65 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });

  await confetti({
    particleCount: scale(40),
    angle: 120,
    spread: 55,
    origin: { x: 1, y: 0.65 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });
}

async function fireLarge(colors: string[]) {
  const confetti = await loadConfetti();

  // Center cannon burst
  confetti({
    particleCount: scale(100),
    spread: 80,
    origin: { x: 0.5, y: 0.5 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });

  // Left cannon
  await new Promise((r) => setTimeout(r, 300));
  confetti({
    particleCount: scale(60),
    angle: 60,
    spread: 50,
    origin: { x: 0, y: 0.7 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });

  // Right cannon
  await new Promise((r) => setTimeout(r, 300));
  confetti({
    particleCount: scale(60),
    angle: 120,
    spread: 50,
    origin: { x: 1, y: 0.7 },
    colors,
    zIndex: Z_INDEX,
    disableForReducedMotion: true,
  });

  // Star shapes rain
  await new Promise((r) => setTimeout(r, 400));
  await confetti({
    particleCount: scale(40),
    spread: 160,
    origin: { x: 0.5, y: 0 },
    shapes: ['star'],
    colors,
    zIndex: Z_INDEX,
    scalar: 1.2,
    disableForReducedMotion: true,
  });
}

/**
 * Fire a celebration effect.
 * @param preset - 'small' | 'medium' | 'large'
 * @param colors - Optional color override (default: brand palette)
 * @returns Promise that resolves when animation completes
 */
export async function fireCelebration(
  preset: CelebrationPreset,
  colors?: string[],
): Promise<void> {
  if (prefersReducedMotion()) return;

  const resolvedColors = colors ?? BRAND_COLORS;

  switch (preset) {
    case 'small':
      return fireSmall(resolvedColors);
    case 'medium':
      return fireMedium(resolvedColors);
    case 'large':
      return fireLarge(resolvedColors);
  }
}

export type ConfettiRainIntensity = 'medium' | 'large';

/**
 * Fire confetti rain falling from the top of the viewport downward.
 * Multiple origin points across the top edge, staggered waves for sustained effect.
 */
export async function fireConfettiRain(
  intensity: ConfettiRainIntensity = 'medium',
  colors?: string[],
): Promise<void> {
  if (prefersReducedMotion()) return;

  const confetti = await loadConfetti();
  const resolvedColors = colors ?? BRAND_COLORS;

  const isLarge = intensity === 'large';
  const origins = isLarge ? [0.1, 0.3, 0.5, 0.7, 0.9] : [0.2, 0.5, 0.8];
  const waveCount = isLarge ? 4 : 2;
  const particlesPerBurst = scale(isLarge ? 20 : 18);
  const shapes: ('star' | 'circle' | 'square')[] = isLarge
    ? ['star', 'circle', 'square']
    : ['circle', 'square'];

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
      });
    }
    if (wave < waveCount - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

/** Predefined color sets for convenience */
export const CELEBRATION_COLORS = {
  gold: GOLD_COLORS,
  brand: BRAND_COLORS,
  mint: MINT_COLORS,
} as const;
