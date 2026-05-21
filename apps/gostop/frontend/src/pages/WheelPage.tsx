import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BetSlider, Spinner } from '../components/shared/GameUI';
import { useWheel, type WheelResult } from '../features/wheel/useWheel';
import { useSpinAnimation } from '../features/wheel/useSpinAnimation';
import { WheelCanvas } from '../features/wheel/components/WheelCanvas';
import { useInvalidateGameHistory } from '../features/game-history';
import {
  WHEEL_MIN_BET,
  WHEEL_MAX_BET,
  WHEEL_SEGMENTS,
  WHEEL_RTP_BPS,
} from '../lib/gostop-config';
import { useActiveAddress } from '../hooks/useActiveAddress';
import { useOptimisticBalance } from '../store/useBalanceStore';
import { getExplorerTxUrl } from '../lib/explorer';
import { formatNusdc } from '../lib/format';
import { playGameSound, playWheelSpinStart } from '../lib/sounds';
import confetti from 'canvas-confetti';
import {
  fireCelebration,
  fireConfettiRain,
  CELEBRATION_COLORS,
  isMobileViewport,
} from '../lib/celebration';
import wheelThumb from '../assets/images/wheel.webp';

const NUSDC_DECIMALS = 6;
const MIN_NUSDC = Number(WHEEL_MIN_BET) / 10 ** NUSDC_DECIMALS; // 1
const MAX_NUSDC = Number(WHEEL_MAX_BET) / 10 ** NUSDC_DECIMALS; // 100

type WinTier = 'jackpot' | 'big' | 'normal';

function tierForWheel(multiplierBps: number): WinTier | null {
  if (multiplierBps >= 50_000) return 'jackpot'; // 5×
  if (multiplierBps >= 30_000) return 'big'; // 3×
  if (multiplierBps > 0) return 'normal'; // 1.5× / 2×
  return null;
}

export default function WheelPage() {
  const viewer = useActiveAddress();
  const { isWalletConnected, spin, isSpinning, error, clearError } = useWheel();
  const invalidateHistory = useInvalidateGameHistory();
  const { balance: availableBalance, isInitialized: balanceReady } =
    useOptimisticBalance();

  const [betDisplay, setBetDisplay] = useState<string>(String(MIN_NUSDC));
  const [result, setResult] = useState<WheelResult | null>(null);

  const rotatingRef = useRef<SVGGElement | null>(null);
  const { phase, startLoop, landOn, gracefulStop, reset } = useSpinAnimation(
    rotatingRef,
    WHEEL_SEGMENTS.length || 20,
  );

  // Safety watchdog: if the spin animation stays in the 'loop' phase (waiting
  // for tx confirm) longer than the RPC wallclock cap, force a graceful stop
  // so the wheel cannot appear to spin forever. The underlying RPC path is
  // bounded by useSignAndExecute's 30s timeout; this is a belt-and-braces
  // catch for any unrelated stall (coin discovery, sign step, etc.).
  useEffect(() => {
    if (phase !== 'loop') return;
    const id = setTimeout(() => {
      void gracefulStop();
    }, 40_000);
    return () => clearTimeout(id);
  }, [phase, gracefulStop]);

  const betDisplayNum = Math.max(
    MIN_NUSDC,
    Math.min(MAX_NUSDC, parseFloat(betDisplay) || MIN_NUSDC),
  );
  const betRaw = BigInt(Math.round(betDisplayNum * 10 ** NUSDC_DECIMALS));

  const insufficientBalance =
    isWalletConnected && balanceReady && availableBalance < betRaw;

  const animating = phase === 'loop' || phase === 'decisive' || phase === 'decel';
  const canSpin =
    isWalletConnected && !animating && !isSpinning && !insufficientBalance;

  const onSpin = async () => {
    if (!canSpin) return;
    setResult(null);
    playWheelSpinStart();
    startLoop();
    let r: WheelResult | null = null;
    try {
      r = await spin(betRaw);
    } catch {
      r = null;
    }
    if (r) {
      await landOn(r.segmentIndex);
      setResult(r);
      invalidateHistory();
      celebrate(r);
    } else {
      await gracefulStop();
    }
  };

  const showOverlayDimmer = phase === 'loop' || phase === 'decisive';

  const closeResult = () => {
    setResult(null);
    reset();
  };

  return (
    <div className="space-y-8 min-h-screen">
      <header className="panel p-6 md:p-8 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_55%)] flex flex-col md:flex-row md:items-center gap-6">
        <img
          src={wheelThumb}
          alt=""
          aria-hidden
          className="w-full md:w-40 h-32 md:h-40 rounded-xl object-cover border border-gold-subtle shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm uppercase tracking-[0.3em] text-gold-300 mb-3">
            Wheel
          </p>
          <h1 className="font-display text-4xl md:text-5xl text-gold italic">
            Golden Wheel
          </h1>
          <p className="text-base text-neutral-200 mt-3 max-w-2xl leading-relaxed">
            Spin a 20-segment wheel. One pull, one VRF roll, one payout — all
            settled atomically on chain. RTP{' '}
            {(WHEEL_RTP_BPS / 100).toFixed(2)}%.
          </p>
        </div>
      </header>
      {error && (
        <div className="panel p-4 border-red-500/50 bg-red-950/40 flex items-center justify-between gap-3">
          <p className="text-sm text-red-200">{error}</p>
          <button
            onClick={() => {
              clearError();
              reset();
            }}
            className="btn-ghost !py-1 !px-3 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="panel p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-6 md:gap-12">
          <div className="relative w-full md:w-[520px] md:flex-shrink-0 mx-auto md:mx-0">
            <WheelCanvas
              ref={rotatingRef}
              segments={WHEEL_SEGMENTS}
              pulseSegmentIndex={phase === 'revealed' ? (result?.segmentIndex ?? null) : null}
            />
            {showOverlayDimmer && (
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none rounded-xl"
                style={{
                  background:
                    'radial-gradient(circle at center, transparent 55%, rgba(7,7,10,0.45) 100%)',
                }}
              />
            )}
          </div>

          <div className="w-full md:w-[320px] md:flex-shrink-0 flex flex-col gap-6">
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <label className="text-sm uppercase tracking-[0.18em] text-gold-200">
                  Bet
                </label>
                <span className="font-mono text-lg text-gold">
                  {betDisplayNum.toFixed(betDisplayNum < 10 ? 2 : 0)} NUSDC
                </span>
              </div>
              <BetSlider
                value={betDisplay}
                min={MIN_NUSDC}
                max={MAX_NUSDC}
                onChange={setBetDisplay}
              />
            </div>

            <button
              onClick={onSpin}
              disabled={!canSpin}
              className="btn-gold w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {animating || isSpinning ? (
                <>
                  <Spinner />{' '}
                  {phase === 'decel' ? 'Stopping…' : 'Spinning…'}
                </>
              ) : !isWalletConnected ? (
                'Connect wallet to spin'
              ) : insufficientBalance ? (
                `Need ${formatNusdc(betRaw)} NUSDC`
              ) : phase === 'revealed' ? (
                'Spin again'
              ) : (
                'Spin'
              )}
            </button>

            {isWalletConnected && balanceReady && (
              <p className="text-xs text-neutral-400 text-center -mt-2">
                Available:{' '}
                <span className="font-mono text-gold-200">
                  {formatNusdc(availableBalance)} NUSDC
                </span>
              </p>
            )}

            <SegmentLegend />
          </div>
        </div>
      </section>

      {result && phase === 'revealed' && (
        <ResultModal
          result={result}
          viewer={viewer ?? null}
          onClose={closeResult}
        />
      )}
    </div>
  );
}

function SegmentLegend() {
  const bands = new Map<number, number>();
  for (const bps of WHEEL_SEGMENTS) {
    bands.set(bps, (bands.get(bps) ?? 0) + 1);
  }
  const sorted = Array.from(bands.entries()).sort((a, b) => a[0] - b[0]);
  return (
    <div>
      <p className="text-sm uppercase tracking-[0.18em] text-gold-200 mb-3">
        Segments
      </p>
      <div className="flex flex-wrap gap-2">
        {sorted.map(([bps, count]) => (
          <span
            key={bps}
            className={`px-3 py-1.5 rounded-full text-sm font-mono border ${
              bps === 0
                ? 'border-neutral-600 bg-neutral-900/50 text-neutral-400'
                : bps >= 30000
                  ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-200'
                  : 'border-gold-subtle bg-gold-400/10 text-gold-200'
            }`}
          >
            {(bps / 10000).toFixed(bps < 10000 && bps > 0 ? 2 : bps === 0 ? 0 : 1)}× ·{' '}
            <span className="opacity-70">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ===== Result modal — celebratory for wins, witty for losses =====

const WIN_COPY: Record<WinTier, { headline: string; subline: string[] }> = {
  jackpot: {
    headline: 'MEGA WIN',
    subline: [
      'The wheel chose you.',
      'Fortune, in full bloom.',
      'Five times. Five reasons to smile.',
    ],
  },
  big: {
    headline: 'BIG WIN',
    subline: [
      'Now we are talking.',
      'The gold side of the wheel.',
      'Three times the fun.',
    ],
  },
  normal: {
    headline: 'NICE WIN',
    subline: [
      'A clean little payday.',
      'Quiet wins are still wins.',
      'Wheel says: yes please.',
    ],
  },
};

const LOSS_COPY: { emoji: string; line: string }[] = [
  { emoji: '🌀', line: 'The wheel spins on. So do you.' },
  { emoji: '🎯', line: 'One segment off. Cosmic comedy.' },
  { emoji: '🥶', line: 'Cold spin. Warm it back up.' },
  { emoji: '🃏', line: 'House had the joker today.' },
  { emoji: '🌬️', line: 'Whiff. The gold flew past.' },
  { emoji: '🧊', line: 'Iced. Spin again to thaw.' },
  { emoji: '🎢', line: 'Down beat. The next one climbs.' },
  { emoji: '🪙', line: 'The coin stayed in the wheel.' },
  { emoji: '🌒', line: 'Eclipsed. The light returns.' },
  { emoji: '🎭', line: 'Drama. No payout. Iconic.' },
];

function pickCopy<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

// rAF count-up for the payout number (ported from TieredWinCelebration).
function useCountUp(target: bigint, durationMs: number, active: boolean): bigint {
  const [current, setCurrent] = useState<bigint>(0n);
  const startRef = useRef<number | null>(null);
  const targetNum = Number(target);

  useEffect(() => {
    if (!active || targetNum === 0) {
      setCurrent(target);
      return;
    }
    startRef.current = null;
    let rafId = 0;
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setCurrent(BigInt(Math.floor(eased * targetNum)));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setCurrent(target);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, targetNum, durationMs, active]);

  return current;
}

function ResultModal({
  result,
  viewer,
  onClose,
}: {
  result: WheelResult;
  viewer: string | null;
  onClose: () => void;
}) {
  const tier = tierForWheel(result.multiplierBps);
  const isWin = tier !== null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Wheel result"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-950/85 backdrop-blur-md animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`panel relative max-w-md w-full p-6 md:p-8 overflow-hidden ${
          tier === 'jackpot'
            ? 'border-gold-200 shadow-gold-glow-lg bg-[radial-gradient(circle_at_top,rgba(242,214,123,0.22),transparent_70%)]'
            : tier === 'big'
              ? 'border-gold-300/80 shadow-gold-glow bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.18),transparent_70%)]'
              : tier === 'normal'
                ? 'border-gold-400/60 shadow-gold-glow bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.12),transparent_70%)]'
                : 'border-neutral-700/60'
        }`}
      >
        <button
          onClick={onClose}
          aria-label="Close result"
          className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:text-gold-200 hover:bg-gold-400/10 transition-colors z-10"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M3 3L13 13M13 3L3 13"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {isWin ? (
          <WinBody result={result} tier={tier} />
        ) : (
          <LossBody result={result} />
        )}

        <div className="flex flex-col items-center gap-3 mt-6">
          <button
            onClick={onClose}
            className={`${
              isWin ? 'btn-gold' : 'btn-ghost'
            } !py-2.5 !px-8 text-base`}
          >
            Spin again
          </button>
          <a
            href={getExplorerTxUrl(result.txDigest, viewer ?? undefined)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-neutral-400 underline underline-offset-4 decoration-neutral-600 hover:text-gold-200 hover:decoration-gold-200/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 rounded px-1"
            title="View on Network Explorer"
          >
            Network Explorer
            <ExternalLinkIcon />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WinBody({ result, tier }: { result: WheelResult; tier: WinTier }) {
  const copy = WIN_COPY[tier];
  // Subline + headline copy pick is stable per-mount so the user can't
  // accidentally re-roll it by tapping; useState init function fires once.
  const [picked] = useState(() => ({
    sub: pickCopy(copy.subline),
  }));
  const counted = useCountUp(result.payout, tier === 'jackpot' ? 1100 : 800, true);
  const multStr = (result.multiplierBps / 10_000).toFixed(2);

  return (
    <div className="relative text-center">
      {/* Jackpot sweep accent — subtle horizontal light streak. */}
      {tier === 'jackpot' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(90deg,transparent_0%,rgba(247,228,140,0.18)_50%,transparent_100%)] blur-md"
        />
      )}

      <p
        className={`relative text-xs uppercase tracking-[0.3em] font-semibold mb-2 ${
          tier === 'jackpot'
            ? 'text-emerald-300'
            : tier === 'big'
              ? 'text-gold-200'
              : 'text-emerald-400'
        }`}
      >
        {copy.headline}
      </p>

      <h2
        className={`relative font-display italic font-medium leading-none mb-4 ${
          tier === 'jackpot'
            ? 'text-6xl md:text-7xl text-transparent bg-clip-text bg-gold-gradient drop-shadow-[0_2px_12px_rgba(247,228,140,0.45)]'
            : tier === 'big'
              ? 'text-5xl md:text-6xl text-gold'
              : 'text-4xl md:text-5xl text-emerald-300'
        }`}
      >
        +{formatNusdc(counted)}
        <span className="text-2xl md:text-3xl text-gold-200/70 ml-2 italic">
          NUSDC
        </span>
      </h2>

      <div className="relative flex items-center justify-center gap-3 mb-3">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-mono font-semibold ${
            tier === 'jackpot'
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/60'
              : tier === 'big'
                ? 'bg-gold-400/20 text-gold-100 border border-gold-300/60'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
          }`}
        >
          {multStr}×
        </span>
        <span className="text-sm text-neutral-400">
          on {formatNusdc(result.bet)} NUSDC
        </span>
      </div>

      <p className="relative text-base text-neutral-200 italic mt-4 max-w-xs mx-auto">
        {picked.sub}
      </p>
    </div>
  );
}

function LossBody({ result }: { result: WheelResult }) {
  const [picked] = useState(pickCopy(LOSS_COPY));
  return (
    <div className="text-center py-2">
      <div
        className="text-6xl md:text-7xl mb-4 inline-block animate-scratch-card-shake drop-shadow-[0_0_18px_rgba(120,120,140,0.35)]"
        aria-hidden
      >
        {picked.emoji}
      </div>
      <p className="text-xs uppercase tracking-[0.3em] font-semibold text-neutral-400 mb-2">
        Miss
      </p>
      <h2 className="font-display italic text-3xl md:text-4xl text-neutral-200 leading-tight mb-3">
        {picked.line}
      </h2>
      <p className="text-sm text-neutral-400">
        Wheel kept your{' '}
        <span className="font-mono text-neutral-300">
          {formatNusdc(result.bet)} NUSDC
        </span>{' '}
        bet. The pool grows for the next pull.
      </p>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path
        d="M9 3h4v4M13 3l-6 6M11 9v3.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H7"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ===== Celebration trigger — three sequential bursts per tier =====

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// The result modal sits at z-[100] (see ResultModal). Confetti must fire
// ABOVE it or the particles render behind the backdrop and disappear.
// Shared lib defaults to 80 for the other games; wheel passes its own.
const CONFETTI_Z = 200;

async function celebrate(r: WheelResult) {
  const tier = tierForWheel(r.multiplierBps);
  if (tier === null) return;

  if (tier === 'jackpot') {
    playGameSound('winJackpot');
    // Each `fireCelebration('large')` is itself a 5-stage cascade
    // (~2.6s). To make the three outer bursts read as a SEQUENCE (not a
    // wall of simultaneous fire), we wait ~2s between them so each
    // cascade can play out before the next begins. Rain wave layered
    // through gives constant ambient sparkle.
    void fireConfettiRain('large', [...CELEBRATION_COLORS.gold], CONFETTI_Z);
    void fireCelebration('large', [...CELEBRATION_COLORS.royal], CONFETTI_Z);
    await delay(2200);
    void fireCelebration('medium', [...CELEBRATION_COLORS.gold], CONFETTI_Z);
    await delay(1600);
    void fireCelebration('large', [...CELEBRATION_COLORS.royal], CONFETTI_Z);
  } else if (tier === 'big') {
    playGameSound('winMedium');
    // medium cascade ~900ms; space bursts ~1.4s apart for clear rhythm.
    void fireCelebration('medium', [...CELEBRATION_COLORS.gold], CONFETTI_Z);
    await delay(1400);
    void fireCelebration('medium', [...CELEBRATION_COLORS.goldEmerald], CONFETTI_Z);
    await delay(1400);
    void fireCelebration('small', [...CELEBRATION_COLORS.gold], CONFETTI_Z);
  } else {
    // Normal tier covers 1.5× and 2×. The user asked for distinct
    // treatments: 1.5× fires twice with a left→right (or bottom→top
    // on mobile) split; 2× keeps the three-burst rhythm.
    playGameSound('winSmall');
    const mobile = isMobileViewport();
    if (r.multiplierBps < 20_000) {
      // 1.5× — two bursts, split left/right (desktop) or bottom/top (mobile).
      const o1 = mobile ? { x: 0.5, y: 0.7 } : { x: 0.35, y: 0.55 };
      const o2 = mobile ? { x: 0.5, y: 0.35 } : { x: 0.65, y: 0.55 };
      void fireBurst(o1, [...CELEBRATION_COLORS.goldEmerald]);
      await delay(900);
      void fireBurst(o2, [...CELEBRATION_COLORS.gold]);
    } else {
      // 2× — three bursts. Desktop: left → right → center.
      //                    Mobile:  top  → bottom → center.
      const center = { x: 0.5, y: 0.55 };
      const o1 = mobile ? { x: 0.5, y: 0.32 } : { x: 0.3, y: 0.55 };
      const o2 = mobile ? { x: 0.5, y: 0.75 } : { x: 0.7, y: 0.55 };
      void fireBurst(o1, [...CELEBRATION_COLORS.goldEmerald]);
      await delay(900);
      void fireBurst(o2, [...CELEBRATION_COLORS.gold]);
      await delay(900);
      void fireBurst(center, [...CELEBRATION_COLORS.goldEmerald]);
    }
  }
}

// Single positional confetti burst — used by the 1.5× left/right (or
// bottom/top on mobile) split that fireCelebration's fixed center origin
// can't express.
function fireBurst(origin: { x: number; y: number }, colors: string[]): Promise<void> {
  const result = confetti({
    particleCount: 110,
    spread: 75,
    startVelocity: 45,
    origin,
    colors,
    zIndex: CONFETTI_Z,
    scalar: 1.1,
    disableForReducedMotion: true,
  });
  // canvas-confetti returns null when the user prefers reduced motion;
  // wrap to a uniform Promise so callers can `void fireBurst(...)`.
  return Promise.resolve(result as unknown as Promise<void>);
}
