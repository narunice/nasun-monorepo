import { useRef, useState } from 'react';
import confetti from 'canvas-confetti';
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
import { getExplorerTxUrl } from '../lib/explorer';
import { formatNusdc } from '../lib/format';
import { playGameSound, playWheelSpinStart } from '../lib/sounds';
import wheelThumb from '../assets/images/wheel.webp';

const NUSDC_DECIMALS = 6;
const MIN_NUSDC = Number(WHEEL_MIN_BET) / 10 ** NUSDC_DECIMALS; // 1
const MAX_NUSDC = Number(WHEEL_MAX_BET) / 10 ** NUSDC_DECIMALS; // 100

export default function WheelPage() {
  const viewer = useActiveAddress();
  const { isWalletConnected, spin, isSpinning, error, clearError } = useWheel();
  const invalidateHistory = useInvalidateGameHistory();

  const [betDisplay, setBetDisplay] = useState<string>(String(MIN_NUSDC));
  const [result, setResult] = useState<WheelResult | null>(null);

  const rotatingRef = useRef<SVGGElement | null>(null);
  const { phase, startLoop, landOn, gracefulStop, reset } = useSpinAnimation(
    rotatingRef,
    WHEEL_SEGMENTS.length || 20,
  );

  const betDisplayNum = Math.max(
    MIN_NUSDC,
    Math.min(MAX_NUSDC, parseFloat(betDisplay) || MIN_NUSDC),
  );
  const betRaw = BigInt(Math.round(betDisplayNum * 10 ** NUSDC_DECIMALS));

  const onSpin = async () => {
    if (phase !== 'idle' && phase !== 'revealed') return;
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
            Wheel of Fortune
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

      <section className="panel p-6 md:p-8 space-y-6">
        <div className="relative">
          <WheelCanvas
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

        <SegmentLegend />

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
          disabled={
            !isWalletConnected ||
            isSpinning ||
            phase === 'loop' ||
            phase === 'decisive' ||
            phase === 'decel'
          }
          className="btn-gold w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {phase === 'loop' || phase === 'decisive' || isSpinning ? (
            <>
              <Spinner /> Spinning…
            </>
          ) : phase === 'decel' ? (
            'Stopping…'
          ) : !isWalletConnected ? (
            'Connect wallet to spin'
          ) : phase === 'revealed' ? (
            'Spin again'
          ) : (
            'Spin'
          )}
        </button>
      </section>

      {result && phase === 'revealed' && (
        <ResultCard result={result} viewer={viewer ?? null} />
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

function ResultCard({
  result,
  viewer,
}: {
  result: WheelResult;
  viewer: string | null;
}) {
  const isWin = result.payout > 0n;
  return (
    <section
      className={`panel p-6 md:p-8 space-y-4 ${
        isWin
          ? 'border-emerald-500/40 bg-emerald-950/20'
          : 'border-neutral-700/60'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl md:text-3xl text-gold italic">
          {isWin ? 'You won' : 'No win'}
        </h2>
        <span className="text-sm uppercase tracking-widest text-gold-200">
          Segment #{result.segmentIndex}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Bet" value={`${formatNusdc(result.bet)} NUSDC`} />
        <Stat
          label="Multiplier"
          value={`${(result.multiplierBps / 10000).toFixed(2)}×`}
        />
        <Stat
          label="Payout"
          value={`${formatNusdc(result.payout)} NUSDC`}
          highlight={isWin}
        />
      </div>
      <a
        href={getExplorerTxUrl(result.txDigest, viewer ?? undefined)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs font-mono text-gold-200/85 hover:text-gold-200 transition-colors"
      >
        Verified ✓ {result.txDigest.slice(0, 8)}… ↗
      </a>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.15em] text-neutral-400 mb-1">
        {label}
      </p>
      <p
        className={`font-mono text-lg ${
          highlight ? 'text-emerald-300' : 'text-neutral-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const GOLD_PALETTE = ['#f8e8b6', '#f2d67b', '#d4af37', '#b68d22'];
const JACKPOT_PALETTE = ['#a7f3d0', '#34d399', '#10b981', '#f2d67b', '#d4af37'];

function celebrate(r: WheelResult) {
  if (r.payout === 0n) {
    // No celebration on miss — keep the silence luxurious.
    return;
  }
  const bps = r.multiplierBps;
  if (bps >= 50_000) {
    playGameSound('winJackpot');
    confetti({
      particleCount: 220,
      spread: 90,
      startVelocity: 55,
      origin: { y: 0.55 },
      colors: JACKPOT_PALETTE,
      scalar: 1.2,
    });
    setTimeout(
      () =>
        confetti({
          particleCount: 120,
          spread: 120,
          startVelocity: 45,
          origin: { y: 0.5 },
          colors: JACKPOT_PALETTE,
        }),
      250,
    );
  } else if (bps >= 30_000) {
    playGameSound('winMedium');
    confetti({
      particleCount: 120,
      spread: 75,
      startVelocity: 45,
      origin: { y: 0.55 },
      colors: [...GOLD_PALETTE, '#34d399'],
    });
  } else {
    playGameSound('winSmall');
    confetti({
      particleCount: 70,
      spread: 60,
      startVelocity: 40,
      origin: { y: 0.55 },
      colors: GOLD_PALETTE,
    });
  }
}
