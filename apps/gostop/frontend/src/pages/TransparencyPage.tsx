import { useTransparency, useLotteryDraws } from '../lib/api/queries';
import type { GameTransparency, LotteryDraw } from '../lib/api/types';
import { bpsToPct, fmtAbsoluteTime, fmtUsdc, fmtUsdcSigned, gameLabel } from '../features/dashboard/format';
import { getExplorerTxUrl } from '../lib/explorer';

function TxLink({ digest, label = 'View on explorer' }: { digest: string; label?: string }) {
  return (
    <a
      href={getExplorerTxUrl(digest)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${label}: ${digest.slice(0, 10)}…`}
      aria-label={label}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gold-subtle text-neutral-300 hover:text-gold-200 hover:border-gold-300/50 transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

export default function TransparencyPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl text-gold">Transparency</h1>
        <p className="text-base text-neutral-200 max-w-2xl">
          Every round on GoStop is settled on chain. Below is the live, unfiltered
          view of game performance, house results, and lottery draws — refreshed
          every few seconds.
        </p>
      </header>

      <GamesSection />
      <LotterySection />
    </div>
  );
}

function GamesSection() {
  const { data, isLoading, isError, error, refetch } = useTransparency();

  return (
    <section className="panel p-5">
      <h2 className="font-display text-xl text-gold mb-3">Per-Game Performance</h2>

      {isLoading && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-ink-800 rounded" />
          ))}
        </div>
      )}
      {isError && (
        <div>
          <p className="text-sm text-rose-300">Failed to load transparency: {error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-gold-200 hover:text-gold-100">
            Retry
          </button>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-widest text-neutral-300 border-b border-gold-subtle">
                <th className="text-left py-2 pr-3 font-medium">Game</th>
                <th className="text-right py-2 px-3 font-medium">Actual RTP</th>
                <th className="text-right py-2 px-3 font-medium">House PnL</th>
                <th className="text-right py-2 pl-3 font-medium">Commit Proofs</th>
              </tr>
            </thead>
            <tbody>
              {data.games.map((g) => (
                <GameRow key={g.game_id} g={g} />
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-300 mt-3">
            Last updated {fmtAbsoluteTime(data.generated_at)}.
          </p>
        </div>
      )}
    </section>
  );
}

function GameRow({ g }: { g: GameTransparency }) {
  const housePositive = (() => {
    try { return BigInt(g.house_pnl_raw) >= 0n; }
    catch { return true; }
  })();
  return (
    <tr className="border-b border-ink-800/60 last:border-0">
      <td className="py-2 pr-3 text-neutral-100">{gameLabel(g.key)}</td>
      <td className="py-2 px-3 text-right font-mono text-gold-200">{bpsToPct(g.rtp_bps)}</td>
      <td
        className={`py-2 px-3 text-right font-mono ${
          housePositive ? 'text-emerald-300' : 'text-rose-300'
        }`}
      >
        {fmtUsdcSigned(g.house_pnl_raw)} <span className="text-xs text-neutral-300">NUSDC</span>
      </td>
      <td className="py-2 pl-3 text-right font-mono text-neutral-200">
        {g.commit_proof_count.toLocaleString('en-US')}
      </td>
    </tr>
  );
}

function LotterySection() {
  const { data, isLoading, isError, error, refetch } = useLotteryDraws(20);

  return (
    <section className="panel p-5">
      <h2 className="font-display text-xl text-gold mb-3">Recent Lottery Draws</h2>

      {isLoading && (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-ink-800 rounded" />
          ))}
        </div>
      )}
      {isError && (
        <div>
          <p className="text-sm text-rose-300">Failed to load lottery: {error.message}</p>
          <button onClick={() => refetch()} className="mt-2 text-sm text-gold-200 hover:text-gold-100">
            Retry
          </button>
        </div>
      )}

      {data && data.draws.length === 0 && (
        <p className="text-sm text-neutral-200">No draws yet.</p>
      )}

      {data && data.draws.length > 0 && (
        <ul className="space-y-3">
          {data.draws.map((d) => (
            <DrawCard key={d.round_number} d={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DrawCard({ d }: { d: LotteryDraw }) {
  const drawn = d.drawn_numbers.length > 0;
  return (
    <li className="rounded-lg border border-gold-subtle bg-ink-900/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-lg text-gold-200">Round #{d.round_number}</span>
          <span className="text-sm text-neutral-300">
            Drawn: {fmtAbsoluteTime(d.drawn_at_ms)}
          </span>
          {d.draw_tx_digest && <TxLink digest={d.draw_tx_digest} label="View draw transaction" />}
        </div>
        <span className="text-xs text-neutral-300">
          Claim by: {fmtAbsoluteTime(d.claim_deadline_ms)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {drawn ? (
          d.drawn_numbers.map((n) => (
            <span
              key={n}
              className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-gold-400/20 text-gold-100 border border-gold-300/50 font-mono text-sm"
            >
              {n}
            </span>
          ))
        ) : (
          <span className="text-sm text-neutral-300">Awaiting draw.</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm pt-2 border-t border-ink-800">
        <Tier label="Tier 1 (5/5)" winners={d.tier1_winners} payout={d.tier1_payout} />
        <Tier label="Tier 2 (4/5)" winners={d.tier2_winners} payout={d.tier2_payout} />
        <Tier label="Tier 3 (3/5)" winners={d.tier3_winners} payout={d.tier3_payout} />
      </div>
      <div className="text-xs text-neutral-300">
        Treasury rollover: <span className="font-mono">{fmtUsdc(d.treasury_amount)} NUSDC</span>
        {d.fully_claimed_at_ms && (
          <span className="ml-3">· Fully claimed at {fmtAbsoluteTime(d.fully_claimed_at_ms)}</span>
        )}
      </div>
    </li>
  );
}

function Tier({ label, winners, payout }: { label: string; winners: number; payout: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-widest text-neutral-300 block">{label}</span>
      <span className="font-mono text-sm text-neutral-100">{winners}</span>
      <span className="text-xs text-neutral-300 ml-1">winners</span>
      <div className="font-mono text-xs text-gold-200 mt-0.5">
        {fmtUsdc(payout)} NUSDC each
      </div>
    </div>
  );
}
