import { useState } from 'react';
import { useMyScratchCards } from '../hooks';
import { formatNusdc, getTierColorClass } from '../types';
import { NETWORK_CONFIG } from '../../../config/network';

const PAGE_SIZE = 6;

interface MyWinningCardsProps {
  /** Card IDs currently being scratched (hide from list to avoid spoiling) */
  pendingCardIds?: Set<number>;
}

const WINNING_PAGE_SIZE = 8; // 2 rows on md (4 cols), fits sm (3 cols) and mobile (2 cols) well

export function MyWinningCards({ pendingCardIds }: MyWinningCardsProps) {
  const { winningNfts, isLoading } = useMyScratchCards();
  const explorerUrl = NETWORK_CONFIG.explorerUrl;
  const [visibleCount, setVisibleCount] = useState(WINNING_PAGE_SIZE);

  if (isLoading) {
    return <div className="text-sm text-theme-text-muted">Loading...</div>;
  }

  // Filter out cards that are currently being scratched
  const allNfts = pendingCardIds && pendingCardIds.size > 0
    ? winningNfts.filter((nft) => !pendingCardIds.has(nft.cardId))
    : winningNfts;

  if (allNfts.length === 0) {
    return (
      <div className="text-sm text-theme-text-muted">
        No wins yet. Keep trying!
      </div>
    );
  }

  const visibleNfts = allNfts.slice(0, visibleCount);
  const hasMore = allNfts.length > visibleCount;

  return (
    <div className="space-y-3">
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
      {visibleNfts.map((nft) => (
        <div
          key={nft.id}
          className="bg-theme-bg-tertiary rounded-lg p-3 border border-theme-accent/30"
        >
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-theme-text-muted">#{nft.cardId}</span>
            <div className="flex items-center gap-1">
              <span className={`text-sm font-bold ${getTierColorClass(nft.multiplier)}`}>
                {nft.multiplier}x
              </span>
              {explorerUrl && (
                <a
                  href={`${explorerUrl}/object/${nft.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-theme-text-muted hover:text-pd3 transition-colors"
                  title="View NFT on Explorer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
          <div className="text-sm font-semibold text-theme-accent">
            +{formatNusdc(nft.prizeAmount)} NUSDC
          </div>
          {nft.purchaseTime > 0 && (
            <div className="text-[10px] text-theme-text-muted mt-1">
              {new Date(nft.purchaseTime).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </div>
          )}
        </div>
      ))}
    </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + WINNING_PAGE_SIZE)}
          className="w-full py-1.5 text-xs font-medium text-pd3 hover:text-pd4 transition-colors"
        >
          Show More ({allNfts.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

export function MyPurchaseHistory() {
  const { purchases, isLoading } = useMyScratchCards();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (isLoading) {
    return <div className="text-sm text-theme-text-muted">Loading...</div>;
  }

  if (purchases.length === 0) {
    return (
      <div className="text-sm text-theme-text-muted">
        No purchases yet. Buy a scratch card to get started!
      </div>
    );
  }

  const visible = purchases.slice(0, visibleCount);
  const hasMore = purchases.length > visibleCount;
  const wins = purchases.filter((p) => p.isWinner).length;

  return (
    <div className="space-y-3">
      <span className="text-xs text-theme-text-muted">
        {wins} wins / {purchases.length} total
      </span>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1.5">
        {visible.map((p) => (
          <div
            key={p.cardId}
            className={`rounded-md px-2 py-1.5 text-center ${
              p.isWinner
                ? 'bg-theme-bg-tertiary border border-theme-accent/20'
                : 'bg-theme-bg-secondary border border-theme-border/50 opacity-50'
            }`}
          >
            <div className="text-[10px] text-theme-text-muted">#{p.cardId}</div>
            {p.isWinner ? (
              <div className={`text-xs font-bold ${getTierColorClass(p.multiplier)}`}>
                {p.multiplier}x
              </div>
            ) : (
              <div className="text-[10px] text-theme-text-muted">miss</div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="w-full py-1.5 text-xs font-medium text-pd3 hover:text-pd4 transition-colors"
        >
          Show More ({purchases.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}

/** @deprecated Use MyWinningCards and MyPurchaseHistory separately */
export function MyScratchCardList() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-theme-text-primary mb-3">
          My Winning Cards
        </h3>
        <MyWinningCards />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-theme-text-primary mb-3">
          Purchase History
        </h3>
        <MyPurchaseHistory />
      </div>
    </div>
  );
}
