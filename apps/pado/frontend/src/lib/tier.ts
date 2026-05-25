/**
 * NSI tier hook for Pado.
 *
 * Source of truth lives on-chain in nasun_tier::policy. The explorer-api
 * `/standing/by-address/:address` route mirrors the same constants for
 * read-side display. This hook returns whichever values the API responds
 * with — we do NOT redeclare TIER_BENEFITS frontend-side. If the API is
 * unreachable, `placeholderData` keeps the modal showing tier-1 baseline
 * (no discount) so the user never sees an undefined fee. The chain
 * enforces the actual discount; the displayed value is only a hint.
 *
 * Drift protection: a small parity test (`tier.test.ts`) checks the
 * discount math against the policy.move values. If `fee_discount_bps`
 * changes on-chain, both that test and standing.ts's mirror constant
 * must update together.
 */
import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../config/network';

export interface StandingBenefits {
  pado_fee_discount_bps: number;
  gostop_max_bet_usd?: number;
  can_create_vault?: boolean;
}

export interface StandingResponse {
  tier: 1 | 2 | 3;
  nsi_score: number;
  next_threshold: number | null;
  benefits: StandingBenefits;
  has_gp?: boolean;
  computed_at: string | null;
}

const PLACEHOLDER: StandingResponse = {
  tier: 1,
  nsi_score: 0,
  next_threshold: 250,
  benefits: {
    pado_fee_discount_bps: 0,
    gostop_max_bet_usd: 100,
    can_create_vault: false,
  },
  computed_at: null,
};

export function useTier(address: string | null | undefined) {
  return useQuery<StandingResponse>({
    queryKey: ['nasun-standing', address?.toLowerCase()],
    queryFn: async () => {
      if (!address) throw new Error('no_address');
      const url = `${NETWORK_CONFIG.explorerApiUrl}/standing/by-address/${address.toLowerCase()}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`standing_fetch_failed_${r.status}`);
      return r.json();
    },
    enabled: !!address,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
    placeholderData: PLACEHOLDER,
  });
}
