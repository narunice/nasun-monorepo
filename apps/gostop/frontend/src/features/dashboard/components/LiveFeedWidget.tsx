import { useState } from 'react';
import type { FeedTopic } from '../../../lib/api/wsHub';
import { useFeed, useFeedLastEventTs } from '../../../lib/api/wsHub';
import { fmtTimeAgo, fmtUsdc, gameLabel, multiplierBpsToX, shortWallet } from '../format';

// Mirrors backend env.feed.liveWindowMs default. Used only for the empty-state
// copy when the server hasn't yet sent a hello (initial paint).
const LIVE_WINDOW_LABEL = '30 minutes';

const GAME_ID_TO_KEY: Record<number, string> = {
  1: 'lottery',
  2: 'scratchcard',
  3: 'numbermatch',
  4: 'crash',
  5: 'mines',
  6: 'wheel',
};

const TABS: { value: FeedTopic; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'whales', label: 'Whales' },
];

export function LiveFeedWidget() {
  const [topic, setTopic] = useState<FeedTopic>('live');
  const events = useFeed(topic, 30);
  const lastEventTs = useFeedLastEventTs(topic);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="font-display text-xl text-gold">Live Feed</h2>
        <div className="inline-flex rounded-full bg-ink-800/80 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTopic(t.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors min-h-[28px] ${
                topic === t.value
                  ? 'bg-gold-400/20 text-gold-200'
                  : 'text-neutral-300 hover:text-neutral-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-neutral-300">
          {lastEventTs > 0
            ? `Quiet right now · last ${topic === 'whales' ? 'whale round' : 'round'} ${fmtTimeAgo(lastEventTs)}`
            : `Waiting for ${topic === 'whales' ? 'whale-sized rounds' : 'rounds'} in the last ${LIVE_WINDOW_LABEL}…`}
        </p>
      ) : (
        <ul className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
          {events.map((ev) => (
            <li
              key={`${ev.tx_digest}:${ev.event_seq}`}
              className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-gold-400/5 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-neutral-300 truncate">
                  {ev.anonymous ? `~${ev.player.slice(0, 8)}` : shortWallet(ev.player)}
                </span>
                <span className="text-xs text-neutral-300">
                  {gameLabel(GAME_ID_TO_KEY[ev.game_id] ?? '?')}
                </span>
              </div>
              {ev.kind === 'ticket_bought' ? (
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-neutral-300">bought ticket</span>
                  <span className="font-mono text-neutral-200">
                    {fmtUsdc(BigInt(ev.bet_amount))}
                  </span>
                  <span className="text-xs text-neutral-300 w-14 text-right">
                    {fmtTimeAgo(ev.ts)}
                  </span>
                </div>
              ) : (
                (() => {
                  const wonRaw = (() => {
                    if (ev.payout === null) return 0n;
                    try { return BigInt(ev.payout) - BigInt(ev.bet_amount); }
                    catch { return 0n; }
                  })();
                  const won = wonRaw > 0n;
                  return (
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs text-neutral-300">
                        {ev.multiplier_bps === null ? '—' : multiplierBpsToX(ev.multiplier_bps)}
                      </span>
                      <span className={`font-mono ${won ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {won ? '+' : ''}
                        {fmtUsdc(wonRaw)}
                      </span>
                      <span className="text-xs text-neutral-300 w-14 text-right">
                        {fmtTimeAgo(ev.ts)}
                      </span>
                    </div>
                  );
                })()
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
