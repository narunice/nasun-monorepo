/**
 * Shared helper for backfill scripts: fetch the on-chain Genesis Pass
 * holder set from the ecosystem-activations admin endpoint (Alchemy snapshot).
 *
 * Replaces the legacy `genesisPass` field on /internal/wallet-mappings, which
 * was sourced from the drop allowlist (now decommissioned). See
 * docs/ecosystem-points-system.md.
 */

import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

const ECOSYSTEM_ACTIVATIONS_URL = process.env.ECOSYSTEM_ACTIVATIONS_URL;
const ECOSYSTEM_ACTIVATIONS_API_KEY = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY;

interface ActivationsPayload {
  activations: Record<string, Array<{ nftType: string; nftCount: number }>>;
}

export async function fetchGenesisPassHolders(): Promise<Set<string>> {
  // Backfills must fail loudly rather than silently writing multiplier=1.0
  // for every real Genesis Pass holder. Forward-only design means under-awarded
  // rows are never corrected, so a misconfigured run could silently wipe out
  // expected 2x rewards across the entire backfill window.
  if (!ECOSYSTEM_ACTIVATIONS_URL) {
    throw new Error(
      'ECOSYSTEM_ACTIVATIONS_URL is required for Genesis Pass multiplier; refusing to backfill without it',
    );
  }
  const set = new Set<string>();

  const data = await fetchWithOffload<ActivationsPayload>({
    url: ECOSYSTEM_ACTIVATIONS_URL,
    apiKey: ECOSYSTEM_ACTIVATIONS_API_KEY,
    label: 'Backfill',
    timeoutMs: 30_000,
  });

  if (!data?.activations) {
    throw new Error('Failed to fetch ecosystem-activations');
  }

  for (const [identityId, acts] of Object.entries(data.activations)) {
    if (!Array.isArray(acts)) continue;
    if (acts.some((a) => a.nftType === 'genesis-pass')) {
      set.add(identityId);
    }
  }

  return set;
}
