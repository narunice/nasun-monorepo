import { useRef } from "react";
import { createPortal } from "react-dom";
import { formatNusdcFixed } from "../../../lib/format";

type Headline = { emoji: string; title: string; subtitle: string };

const ZERO_WIN_HEADLINES: Headline[] = [
  { emoji: "🌑", title: "Cold deck", subtitle: "Not a single hit. The luck has to swing back eventually." },
  { emoji: "🧊", title: "Frozen out", subtitle: "Even the dust came up empty. Reshuffle and run it back." },
  { emoji: "🎭", title: "House plays a part", subtitle: "The cards put on a show, no payout. Curtain call." },
  { emoji: "🪨", title: "Stone cold", subtitle: "Zero matches. The bankroll thanks you for the donation." },
  { emoji: "🦴", title: "Dry bones", subtitle: "Not even a 1x. Brutal, but the variance owes you now." },
  { emoji: "🌚", title: "New moon energy", subtitle: "No light, no luck. Next batch the cycle resets." },
  { emoji: "🃏", title: "Bluffed", subtitle: "Every card looked promising. None paid. Classic." },
  { emoji: "🛢️", title: "Dry well", subtitle: "Drilled deep, found nothing. Move to the next field." },
];

const PARTIAL_LOSS_HEADLINES: Headline[] = [
  { emoji: "🩹", title: "Patched up", subtitle: "A couple of hits softened the fall, but the round is still down." },
  { emoji: "🪙", title: "Half a coin", subtitle: "Saved some face. Not enough to call it a win." },
  { emoji: "🛟", title: "Lifeline", subtitle: "You came out the other side with something. Just not profit." },
  { emoji: "🌫️", title: "Brushed clouds", subtitle: "A small hit, but the variance is still owed." },
  { emoji: "⚖️", title: "Light on the scale", subtitle: "Cards paid, math didn't. Net loss, but a story." },
  { emoji: "🍋", title: "Lemons turned", subtitle: "Got something back. The next batch wants the rest." },
  { emoji: "🪞", title: "Reflected loss", subtitle: "Wins exist, just not enough to outrun the spend." },
];

function pickHeadline(pool: Headline[]): Headline {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function NoWinSummaryModal({
  count,
  wins,
  spent,
  won,
  onClose,
  onPlayAgain,
}: {
  count: number;
  wins: number;
  spent: bigint;
  won: bigint;
  onClose: () => void;
  onPlayAgain: () => void;
}) {
  const isPartial = won > 0n;
  const pool = isPartial ? PARTIAL_LOSS_HEADLINES : ZERO_WIN_HEADLINES;
  const picked = useRef(pickHeadline(pool)).current;
  const net = won - spent;
  const accent = isPartial ? "rgba(245,158,11,0.14)" : "rgba(220,38,38,0.14)";
  const border = isPartial ? "border-amber-500/30" : "border-red-500/30";
  const eyebrowColor = isPartial ? "text-amber-300/80" : "text-red-300/80";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/65 backdrop-blur-sm p-4 animate-slide-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-md panel p-6 sm:p-8 text-center ${border}`}
        style={{ background: `radial-gradient(circle at top, ${accent}, transparent 60%)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-100 text-2xl leading-none"
        >
          ×
        </button>
        <div className="text-6xl sm:text-7xl mb-4 animate-scratch-card-shake">{picked.emoji}</div>
        <p className={`text-xs uppercase tracking-[0.3em] ${eyebrowColor} mb-2`}>
          {count} card{count === 1 ? "" : "s"} revealed
        </p>
        <h2 className="font-display text-3xl sm:text-4xl text-neutral-100 mb-3">{picked.title}</h2>
        <p className="text-base text-neutral-200 leading-relaxed mb-5">{picked.subtitle}</p>
        <div className="grid grid-cols-3 gap-3 mb-6 text-sm">
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Spent</p>
            <p className="font-mono text-base text-neutral-100">{formatNusdcFixed(spent)}</p>
          </div>
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Won</p>
            <p className={`font-mono text-base ${isPartial ? "text-gold-200" : "text-neutral-400"}`}>
              {formatNusdcFixed(won)}
            </p>
          </div>
          <div className="panel p-3 bg-ink-900/60 border-neutral-700">
            <p className="text-xs uppercase tracking-wider text-neutral-400 mb-1">Hits</p>
            <p className={`font-mono text-base ${isPartial ? "text-gold-200" : "text-neutral-400"}`}>
              {wins}/{count}
            </p>
          </div>
        </div>
        <p className="text-sm text-neutral-300 mb-5">
          Net: <span className="font-mono text-red-300">−{formatNusdcFixed(-net)} NUSDC</span>
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-ghost flex-1">
            Close
          </button>
          <button onClick={onPlayAgain} className="btn-gold flex-1">
            Run it back
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
