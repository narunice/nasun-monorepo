/**
 * RecoverPage
 *
 * Asset recovery page: discovers all on-chain assets a user owns through
 * Pado (BalanceManager, MarginAccount, Prediction Positions) and exposes
 * "Withdraw all" / "Claim winnings" / "Claim refund" actions.
 *
 * No backend involvement. Works as long as the Sui RPC is reachable.
 */

import { useMemo } from 'react';
import { AssetRecoveryPanel, type RecoveryAdapter } from '@nasun/wallet-ui';
import { useSignAndExecute } from '../hooks/useSignAndExecute';
import {
  createPadoBmAdapter,
  createPadoMarginAccountAdapter,
  createPadoPredictionPositionAdapter,
} from '../features/recovery';

export function RecoverPage() {
  const { walletAddress, signAndExecute } = useSignAndExecute();

  const adapters = useMemo<RecoveryAdapter[]>(
    () => [
      createPadoBmAdapter(signAndExecute),
      createPadoMarginAccountAdapter(signAndExecute),
      createPadoPredictionPositionAdapter(signAndExecute),
    ],
    [signAndExecute],
  );

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-theme-text-primary">Recover Funds</h1>
        <p className="text-sm text-theme-text-muted mt-1">
          All your Pado assets discovered directly on-chain. No backend involved.
          You can recover funds from this page even if other parts of Pado are unavailable.
        </p>
        <p className="text-xs text-theme-text-muted mt-2">
          Tip: this page is also reachable from any Nasun app's wallet menu (Recover funds).
        </p>
      </div>

      <AssetRecoveryPanel adapters={adapters} address={walletAddress ?? null} />

      <div className="text-xs text-theme-text-muted pt-4 border-t border-theme-border">
        Need a deeper recovery path? See <code>apps/pado/EMERGENCY-RECOVER.md</code>{' '}
        in the source repo for Sui CLI based recovery.
      </div>
    </div>
  );
}
