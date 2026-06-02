import { Link } from "react-router-dom";
import { useSigner } from "@nasun/wallet";
import { useVaultList, type VaultSummary } from "./lib/vaultApi";
import { useVaultTier } from "./lib/useVaultTier";
import { NAV_SCALE } from "./lib/amount";

function short(id: string): string {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function navPerShare(v: VaultSummary): string {
  if (!v.last_nav_per_share) return "—";
  return (Number(v.last_nav_per_share) / NAV_SCALE).toFixed(4);
}

export default function VaultListPage() {
  const { address } = useSigner();
  const { data, isLoading, error } = useVaultList();
  const { canCreateVault } = useVaultTier(address);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vaults</h1>
          <p className="text-sm text-gray-400">
            Tier-3 managed, agent-operated DeepBook vaults (NBTC/NUSDC).
          </p>
        </div>
        {canCreateVault && (
          <Link
            to="/vaults/create"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Create Vault
          </Link>
        )}
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && (
        <p className="text-sm text-red-400">Failed to load vaults.</p>
      )}
      {data && data.vaults.length === 0 && (
        <p className="text-sm text-gray-400">No vaults yet.</p>
      )}

      <div className="grid gap-3">
        {data?.vaults.map((v) => (
          <Link
            key={v.vault_id}
            to={`/vaults/${v.vault_id}`}
            className="rounded-lg border border-white/10 bg-white/5 p-4 hover:bg-white/10"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm">{short(v.vault_id)}</span>
              {v.is_killed && (
                <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                  killed
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-400">
              <div>
                <div className="text-gray-500">Manager</div>
                <div className="font-mono">{short(v.manager)}</div>
              </div>
              <div>
                <div className="text-gray-500">NAV / share</div>
                <div>{navPerShare(v)}</div>
              </div>
              <div>
                <div className="text-gray-500">Depositors</div>
                <div>{v.depositor_count}</div>
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Performance fee: {Number(v.performance_fee_bps) / 100}%
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
