/**
 * Vault eligibility hook — mirrors pado `lib/tier.ts`.
 *
 * On-chain `nasun_tier::policy::can_create_vault` is the source of truth and
 * `vault::create_vault` enforces it (aborts ENotTier3). This hook only reads
 * the explorer-api `/standing/by-address` mirror to decide whether to SHOW the
 * "Create Vault" affordance — it never gates the chain. If the API is
 * unreachable, placeholder keeps tier-1 (no create) so the UI fails closed.
 */
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;

export interface StandingBenefits {
  can_create_vault?: boolean;
  pado_fee_discount_bps?: number;
}

export interface StandingResponse {
  tier: 1 | 2 | 3;
  nsi_score: number;
  next_threshold: number | null;
  benefits: StandingBenefits;
  computed_at: string | null;
}

const PLACEHOLDER: StandingResponse = {
  tier: 1,
  nsi_score: 0,
  next_threshold: 500,
  benefits: { can_create_vault: false },
  computed_at: null,
};

export function useVaultTier(address: string | null | undefined) {
  const query = useQuery<StandingResponse>({
    queryKey: ["nasun-standing", address?.toLowerCase()],
    queryFn: async () => {
      const url = `${API_BASE}/standing/by-address/${address!.toLowerCase()}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`standing_fetch_failed_${r.status}`);
      return r.json();
    },
    enabled: !!API_BASE && !!address,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 1,
    placeholderData: PLACEHOLDER,
  });
  const standing = query.data ?? PLACEHOLDER;
  return {
    standing,
    canCreateVault: standing.benefits.can_create_vault === true,
    tier: standing.tier,
    isLoading: query.isLoading,
  };
}
