import { SuiClient } from '@mysten/sui/client';
import { installZkLoginRecovery } from '@nasun/wallet';
import { GOSTOP_RPC_URL } from './gostop-config';

let cached: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!cached) {
    cached = new SuiClient({ url: GOSTOP_RPC_URL });
    // zkLogin stale-proof recovery: gostop caches its own SuiClient, so the
    // wrapper must be installed here too. The wrapper never re-executes a
    // transaction (it only clears the dead session on Groth16 rejection), so it
    // does not violate the "write RPC, NEVER auto-retry" invariant.
    installZkLoginRecovery(cached);
  }
  return cached;
}
