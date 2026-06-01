/**
 * Read-side hooks for the Nasun Vault (Phase 5) explorer-api.
 *
 * Mirrors the existing explorer-api fetch convention (useUserPercentile.ts):
 * VITE_EXPLORER_API_URL already includes the `/api/v1` prefix, so vault routes
 * resolve to `${API_BASE}/vaults*` (api-server mounts them at /api/v1/vaults).
 *
 * The postgres driver returns NUMERIC/bigint columns as strings (u128-safe);
 * we keep them as strings here and format at the display layer.
 */
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_EXPLORER_API_URL;

export interface VaultSummary {
  vault_id: string;
  manager: string;
  agent_profile_id: string;
  agent_capability_id: string;
  performance_fee_bps: string;
  cooldown_ms: string;
  last_nav_per_share: string | null;
  high_water_mark_nav: string | null;
  is_killed: boolean;
  created_at_ms: string;
  depositor_count: string;
}

export interface VaultState extends VaultSummary {
  balance_manager_id: string;
  initial_seed_nusdc: string;
  initial_seed_deep: string;
  last_nav_at_ms: string | null;
  killed_at_ms: string | null;
  created_tx_digest: string;
}

export interface VaultTrade {
  tx_digest: string;
  event_seq: string;
  agent_profile_id: string;
  capability_id: string;
  agent_address: string;
  pool_id: string;
  is_bid: boolean;
  price: string;
  qty: string;
  fill_notional: string;
  nav_after: string;
  action_type: string;
  timestamp_ms: string;
}

export interface VaultFeeEvent {
  tx_digest: string;
  event_seq: string;
  manager: string;
  nav_per_share_at_crystallize: string;
  previous_hwm: string;
  new_hwm: string;
  fee_shares_minted: string;
  timestamp_ms: string;
}

export interface VaultNavPoint {
  timestamp_ms: string;
  nav: string;
  source: string;
}

export interface VaultDetail {
  vault: VaultState;
  trades: VaultTrade[];
  fees: VaultFeeEvent[];
  navSeries: VaultNavPoint[];
}

export interface VaultFlow {
  tx_digest: string;
  event_seq: string;
  flow_type: string;
  shares: string;
  nusdc_amount: string;
  nbtc_amount: string;
  nav_per_share: string | null;
  was_emergency: boolean;
  cooldown_until_ms: string | null;
  timestamp_ms: string;
}

async function getJson<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error("explorer_api_url_unset");
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`vault_api_${res.status}`);
  return res.json();
}

export function useVaultList() {
  return useQuery<{ vaults: VaultSummary[] }>({
    queryKey: ["vaults", "list"],
    queryFn: () => getJson("/vaults"),
    enabled: !!API_BASE,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useVault(vaultId: string | undefined) {
  return useQuery<VaultDetail>({
    queryKey: ["vaults", "detail", vaultId?.toLowerCase()],
    queryFn: () => getJson(`/vaults/${vaultId!.toLowerCase()}`),
    enabled: !!API_BASE && !!vaultId,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDepositorFlows(
  vaultId: string | undefined,
  address: string | null | undefined,
) {
  return useQuery<{ vault_id: string; depositor: string; flows: VaultFlow[] }>({
    queryKey: [
      "vaults",
      "depositor",
      vaultId?.toLowerCase(),
      address?.toLowerCase(),
    ],
    queryFn: () =>
      getJson(
        `/vaults/${vaultId!.toLowerCase()}/depositor/${address!.toLowerCase()}`,
      ),
    enabled: !!API_BASE && !!vaultId && !!address,
    staleTime: 30_000,
    retry: 1,
  });
}
