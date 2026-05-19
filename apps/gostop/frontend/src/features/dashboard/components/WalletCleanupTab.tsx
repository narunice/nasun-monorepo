import { useMemo, useState } from 'react';
import { useActiveAddress } from '../../../hooks/useActiveAddress';
import { useBurnableTickets } from '../../lottery/useBurnableTickets';
import { useLotteryActions } from '../../lottery/useLotteryActions';
import { BurnResultModal, type BurnResultDetails } from './BurnResultModal';

/**
 * Wallet cleanup hub. v1 lists losing lottery tickets grouped by round and
 * lets users bulk-burn to reclaim Sui storage rebate. Future cleanup actions
 * (e.g. abandoned mines sessions) will plug into this same tab.
 */
export function WalletCleanupTab() {
  const owner = useActiveAddress();
  const { groups, totalTickets, loading, refresh } = useBurnableTickets(owner);
  const { burnTicketsBulk, isBulkBurning, bulkBurnProgress } = useLotteryActions();
  const [selectedRounds, setSelectedRounds] = useState<Set<string>>(new Set());
  // Tracks which action is in flight: a single round id (per-round button)
  // or the sentinel 'all' (bulk Burn-all button). Used to scope the spinner
  // and disabled state to the actual clicked button instead of every button.
  const [activeBurn, setActiveBurn] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<BurnResultDetails | null>(null);

  const allItems = useMemo(
    () =>
      groups.flatMap((g) =>
        g.tickets.map((t) => ({ roundId: g.round.id, ticketId: t.id })),
      ),
    [groups],
  );

  const selectedItems = useMemo(() => {
    if (selectedRounds.size === 0) return allItems;
    return groups
      .filter((g) => selectedRounds.has(g.round.id))
      .flatMap((g) =>
        g.tickets.map((t) => ({ roundId: g.round.id, ticketId: t.id })),
      );
  }, [groups, selectedRounds, allItems]);

  const handleBurnAll = async () => {
    if (isBulkBurning || selectedItems.length === 0) return;
    const total = selectedItems.length;
    setActiveBurn('all');
    try {
      const { burned, storageRebateSoe, digests } = await burnTicketsBulk(selectedItems);
      setResultModal({ total, burned, storageRebateSoe, digests });
      setSelectedRounds(new Set());
      refresh();
    } finally {
      setActiveBurn(null);
    }
  };

  const handleBurnRound = async (roundId: string) => {
    if (isBulkBurning) return;
    const group = groups.find((g) => g.round.id === roundId);
    if (!group) return;
    const items = group.tickets.map((t) => ({ roundId, ticketId: t.id }));
    const total = items.length;
    setActiveBurn(roundId);
    try {
      const { burned, storageRebateSoe, digests } = await burnTicketsBulk(items);
      setResultModal({
        total,
        burned,
        storageRebateSoe,
        digests,
        roundNumber: group.round.roundNumber,
      });
      refresh();
    } finally {
      setActiveBurn(null);
    }
  };

  const toggleRound = (roundId: string) => {
    setSelectedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  };

  // Modal must render alongside every branch so a bulk burn that empties the
  // groups list still shows its rebate summary before the user dismisses it.
  const modal = (
    <BurnResultModal result={resultModal} onClose={() => setResultModal(null)} />
  );

  if (!owner) {
    return (
      <section className="panel p-6">
        <p className="text-sm text-neutral-300">Connect your wallet to manage stored objects.</p>
        {modal}
      </section>
    );
  }

  if (loading && groups.length === 0) {
    return (
      <section className="panel p-6">
        <p className="text-sm text-neutral-300">Scanning your wallet…</p>
        {modal}
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section className="panel p-6">
        <h2 className="text-lg font-display text-gold-200">Wallet cleanup</h2>
        <p className="mt-2 text-sm text-neutral-300">
          Nothing to clean up — every settled lottery ticket in your wallet either won a prize or has already been burned.
        </p>
        {modal}
      </section>
    );
  }

  const selectionLabel =
    selectedRounds.size === 0
      ? `Burn all (${totalTickets})`
      : `Burn selected (${selectedItems.length})`;

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-display text-gold-200">Wallet cleanup</h2>
            <p className="mt-1 text-sm text-neutral-300">
              {totalTickets} non-winning lottery ticket{totalTickets === 1 ? '' : 's'} across {groups.length} settled round{groups.length === 1 ? '' : 's'}.
              Burning clears them from your wallet and refunds the on-chain storage rebate.
            </p>
            {bulkBurnProgress && (
              <p className="mt-2 text-xs text-neutral-400">
                Burning {bulkBurnProgress.done} / {bulkBurnProgress.total}…
              </p>
            )}
          </div>
          <button
            onClick={handleBurnAll}
            disabled={isBulkBurning || selectedItems.length === 0}
            className="btn-gold !py-2 !px-4 text-sm shrink-0 disabled:opacity-60"
          >
            {activeBurn === 'all' ? 'Burning…' : selectionLabel}
          </button>
        </div>
      </section>

      <ul className="space-y-3">
        {groups.map((g) => {
          const isSelected = selectedRounds.has(g.round.id);
          const showSelection = groups.length > 1;
          return (
            <li
              key={g.round.id}
              className={`panel p-4 transition-colors ${
                isSelected ? 'border-gold-subtle bg-ink-900/80' : ''
              }`}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {showSelection && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRound(g.round.id)}
                      className="h-4 w-4 accent-gold-300 shrink-0"
                      aria-label={`Select round #${g.round.roundNumber}`}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-gold-200">Round #{g.round.roundNumber}</div>
                    <div className="text-xs text-neutral-400">
                      {g.tickets.length} ticket{g.tickets.length === 1 ? '' : 's'}
                      {g.round.drawnNumbers && (
                        <span className="ml-2">· drawn {g.round.drawnNumbers.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleBurnRound(g.round.id)}
                  disabled={isBulkBurning}
                  className="btn-ghost !py-2 !px-4 text-sm shrink-0 disabled:opacity-60"
                >
                  {activeBurn === g.round.id ? 'Burning…' : 'Burn round'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {modal}
    </div>
  );
}
