import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLpPoolState } from '../../../lib/api/queries';
import type { LpPosition, LpPositions } from '../../../lib/api/types';
import { useSignAndExecute, type SignAndExecuteResult } from '../../../hooks/useSignAndExecute';
import { useToast } from '../../../store/useToastStore';
import { useBalanceStore } from '../../../store/useBalanceStore';
import { getSuiClient } from '../../../lib/sui-client';
import { findNusdcCoins } from '../../shared/coin-utils';
import { fmtUsdc } from '../../dashboard/format';
import { buildProvideLiquidity, MIN_LP_DEPOSIT_NUSDC } from '../transactions';
import { previewValueForShares } from '../share-math';
import { ProvideLiquidityModal } from './ProvideLiquidityModal';

export function DepositSection() {
  const { walletAddress, isWalletConnected, signAndExecute } = useSignAndExecute();
  const { data: pool } = useLpPoolState();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const balance = useBalanceStore((s) => s.totalNusdc);

  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Optimistic insert of a freshly-minted LPToken so the "My positions" list
  // updates without a reload. Source of truth is the tx response itself:
  //   - events: bankroll_pool::LiquidityProvided gives shares + timestamp
  //   - objectChanges (type='created'): the new LPToken object id
  // We deliberately leave deposit_amount_nusdc null and let the backend fill
  // it in once the indexer catches up — flashing "10 NUSDC" then "awaiting
  // indexer match" would be a worse UX than waiting for chain truth once.
  const applyOptimisticDeposit = (result: SignAndExecuteResult) => {
    const events = Array.isArray(result.events) ? result.events : [];
    const liquidityEvent = events.find((e): e is { type: string; parsedJson: Record<string, unknown> } => {
      if (!e || typeof e !== 'object') return false;
      const t = (e as { type?: unknown }).type;
      const j = (e as { parsedJson?: unknown }).parsedJson;
      return typeof t === 'string'
        && t.endsWith('::bankroll_pool::LiquidityProvided')
        && !!j && typeof j === 'object';
    });

    const changes = Array.isArray(result.objectChanges) ? result.objectChanges : [];
    const createdLpToken = changes.find((c): c is { type: 'created'; objectId: string; objectType: string } => {
      if (!c || typeof c !== 'object') return false;
      const type = (c as { type?: unknown }).type;
      const objectType = (c as { objectType?: unknown }).objectType;
      const objectId = (c as { objectId?: unknown }).objectId;
      return type === 'created'
        && typeof objectType === 'string'
        && objectType.endsWith('::bankroll_pool::LPToken')
        && typeof objectId === 'string';
    });

    if (!liquidityEvent || !createdLpToken) return;

    const shares = String(liquidityEvent.parsedJson.shares ?? '');
    const depositTime = String(liquidityEvent.parsedJson.timestamp_ms ?? Date.now());
    if (!shares) return;

    // Estimated value preview tracks PoolOverview's quote so the new row's
    // "Est. value" lines up with the user's intuition pre-tx.
    // previewValueForShares handles the pps<=0 case.
    let estimatedValue = '0';
    try {
      const pps = pool?.share_price_scaled ? BigInt(pool.share_price_scaled) : 0n;
      if (pps > 0n) {
        estimatedValue = previewValueForShares(BigInt(shares), pps).toString();
      }
    } catch { /* fall through with '0' */ }

    const newPosition: LpPosition = {
      lp_token_id: createdLpToken.objectId,
      shares,
      estimated_value_nusdc: estimatedValue,
      deposit_amount_nusdc: null,
      deposit_time_ms: depositTime,
      withdraw_requested_at_ms: null,
      claimable_at_ms: null,
    };

    queryClient.setQueriesData<LpPositions>(
      { queryKey: ['gostop', 'lp', 'positions'] },
      (old) => {
        if (!old) return old;
        if (old.positions.some((pos) => pos.lp_token_id === newPosition.lp_token_id)) {
          return old;
        }
        return { ...old, positions: [newPosition, ...old.positions] };
      },
    );
  };

  // Parse user input as decimal NUSDC and convert to base units. Returns null
  // when malformed. We accept up to 6 decimal places (chain precision).
  const amountBaseUnits = useMemo(() => {
    const t = amountText.trim();
    if (!t) return null;
    if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
    const [whole, frac = ''] = t.split('.');
    const padded = (frac + '000000').slice(0, 6);
    try {
      return BigInt(whole) * 1_000_000n + BigInt(padded || '0');
    } catch {
      return null;
    }
  }, [amountText]);

  const isSeeded = pool?.is_seeded === true;
  const poolPaused = pool?.paused === true;
  const dqOk = pool?.data_quality === 'fresh';
  const tooSmall = amountBaseUnits !== null && amountBaseUnits < MIN_LP_DEPOSIT_NUSDC;
  const insufficient = amountBaseUnits !== null && amountBaseUnits > balance;

  const canSubmit =
    isWalletConnected &&
    isSeeded &&
    !poolPaused &&
    dqOk &&
    amountBaseUnits !== null &&
    !tooSmall &&
    !insufficient &&
    !busy;

  const submit = async () => {
    if (!canSubmit || amountBaseUnits === null || !walletAddress) return;
    setBusy(true);
    try {
      const client = getSuiClient();
      const coins = await findNusdcCoins(client, walletAddress, amountBaseUnits);
      if (!coins) {
        showToast('Not enough NUSDC in wallet.', 'error');
        return;
      }
      const tx = buildProvideLiquidity(amountBaseUnits, coins.primary, coins.extra);

      // LockConflict / ObjectVersionMismatch retry once after 1500ms with
      // fresh object refs (plan v3 §5.5). Build a fresh Transaction on retry
      // — the previous one carries pre-fetched object versions.
      let attempt = 0;
      let result: SignAndExecuteResult | null = null;
      while (true) {
        try {
          result = await signAndExecute(
            attempt === 0 ? tx : buildProvideLiquidity(amountBaseUnits, coins.primary, coins.extra),
            { showObjectChanges: true },
          );
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const retriable = /LockConflict|ObjectVersionMismatch|ObjectNotFound/.test(msg);
          if (!retriable || attempt >= 1) {
            throw err;
          }
          await new Promise((r) => setTimeout(r, 1500));
          attempt++;
        }
      }

      showToast('Liquidity deposited. LP token issued to your wallet.', 'success');
      setAmountText('');
      setConfirmOpen(false);
      // Patch the positions cache so the new LPToken appears immediately,
      // then invalidate so the next refetch overwrites with chain truth.
      // Background refetch must follow optimistic insert (not race it) —
      // otherwise the empty refetch result can land before our patch.
      if (result) applyOptimisticDeposit(result);
      queryClient.invalidateQueries({ queryKey: ['gostop', 'lp'] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Deposit failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-5">
      <h2 className="font-display text-xl text-gold mb-3">Provide Liquidity</h2>

      {!isWalletConnected && (
        <p className="text-sm text-neutral-200">Connect your wallet to deposit.</p>
      )}

      {isWalletConnected && (
        <div className="space-y-3 max-w-md">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-neutral-300 mb-1">
              Amount (NUSDC)
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="10.000000"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="w-full bg-ink-900/60 border border-gold-subtle rounded-md px-3 py-2 text-base text-neutral-100 font-mono focus:outline-none focus:border-gold-300/50"
            />
            <span className="block text-xs text-neutral-300 mt-1">
              Wallet balance: <span className="font-mono">{fmtUsdc(balance)} NUSDC</span>
              {' · '}
              Minimum: <span className="font-mono">10 NUSDC</span>
            </span>
          </label>

          {tooSmall && (
            <p className="text-sm text-rose-300">Minimum deposit is 10 NUSDC.</p>
          )}
          {insufficient && (
            <p className="text-sm text-rose-300">Amount exceeds your NUSDC balance.</p>
          )}
          {!isSeeded && (
            <p className="text-sm text-amber-200">
              Pool is not yet seeded by admin. Deposits will reopen after seed_pool_shares.
            </p>
          )}
          {poolPaused && (
            <p className="text-sm text-amber-200">
              Bets are paused. New LP deposits are disabled while paused; existing LPs can still
              redeem after cooldown.
            </p>
          )}
          {!dqOk && (
            <p className="text-sm text-amber-200">
              Pool data is currently {pool?.data_quality ?? 'unavailable'}. Deposit is disabled
              until data quality recovers.
            </p>
          )}

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSubmit}
            className="w-full px-4 py-2 rounded-md bg-gold-400/90 hover:bg-gold-400 text-ink-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Deposit NUSDC
          </button>
        </div>
      )}
      {amountBaseUnits !== null && (
        <ProvideLiquidityModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={submit}
          amountBaseUnits={amountBaseUnits}
          sharePriceScaled={pool?.share_price_scaled}
          submitting={busy}
        />
      )}
    </section>
  );
}
