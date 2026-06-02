import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSigner } from "@nasun/wallet";
import { NUSDC_DECIMALS } from "@nasun/devnet-config";
import { useVault, useDepositorFlows } from "./lib/vaultApi";
import { useVaultActions } from "./lib/useVaultActions";
import { parseUnits, parseShares, NAV_SCALE } from "./lib/amount";
import { VaultNavChart } from "./components/VaultNavChart";

const NUSDC_UNIT = 10 ** NUSDC_DECIMALS;

function short(id: string): string {
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { address } = useSigner();
  const qc = useQueryClient();
  const { data, isLoading } = useVault(id);
  const { data: posData } = useDepositorFlows(id, address);
  const actions = useVaultActions();

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <p className="p-10 text-sm text-gray-400">Loading…</p>;
  if (!data) return <p className="p-10 text-sm text-red-400">Vault not found.</p>;

  const { vault, trades, navSeries } = data;
  const isManager =
    !!address && address.toLowerCase() === vault.manager.toLowerCase();
  const busy = actions.status === "signing" || actions.status === "executing";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["vaults"] });
  };

  const onDeposit = async () => {
    setFormError(null);
    const raw = parseUnits(depositAmt, NUSDC_DECIMALS);
    if (raw === null) {
      setFormError("Enter a valid NUSDC amount.");
      return;
    }
    const d = await actions.deposit(vault.vault_id, raw);
    if (d) {
      setDepositAmt("");
      refresh();
    }
  };

  const onRequestWithdrawal = async () => {
    setFormError(null);
    const shares = parseShares(withdrawShares);
    if (shares === null) {
      setFormError("Enter a whole number of shares.");
      return;
    }
    const d = await actions.requestWithdrawal(vault.vault_id, shares);
    if (d) {
      setWithdrawShares("");
      refresh();
    }
  };

  const cooldownHours =
    vault.cooldown_ms != null && vault.cooldown_ms !== ""
      ? Number(vault.cooldown_ms) / 3_600_000
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-mono text-xl">{short(vault.vault_id)}</h1>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-gray-400 md:grid-cols-4">
        <div>
          <div className="text-gray-500">Manager</div>
          <div className="font-mono">{short(vault.manager)}</div>
        </div>
        <div>
          <div className="text-gray-500">NAV / share</div>
          <div>
            {vault.last_nav_per_share
              ? (Number(vault.last_nav_per_share) / NAV_SCALE).toFixed(4)
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Performance fee</div>
          <div>{Number(vault.performance_fee_bps) / 100}%</div>
        </div>
        <div>
          <div className="text-gray-500">Status</div>
          <div>{vault.is_killed ? "killed" : "active"}</div>
        </div>
      </div>

      {(actions.error || formError) && (
        <p className="mt-4 text-sm text-red-400">{formError ?? actions.error}</p>
      )}

      {!vault.is_killed && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* Deposit */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="mb-2 text-sm font-medium">Deposit NUSDC</h2>
            <div className="flex gap-2">
              <input
                value={depositAmt}
                onChange={(e) => setDepositAmt(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm"
              />
              <button
                disabled={busy || !address}
                onClick={onDeposit}
                className="rounded bg-blue-600 px-3 py-1 text-sm disabled:opacity-50"
              >
                Deposit
              </button>
            </div>
          </div>

          {/* Withdraw */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="mb-2 text-sm font-medium">Withdraw (request → claim)</h2>
            <div className="flex gap-2">
              <input
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value)}
                placeholder="shares"
                inputMode="numeric"
                className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm"
              />
              <button
                disabled={busy || !address}
                onClick={onRequestWithdrawal}
                className="rounded bg-white/10 px-3 py-1 text-sm disabled:opacity-50"
              >
                Request
              </button>
              <button
                disabled={busy || !address}
                onClick={async () => {
                  const d = await actions.claimWithdrawal(vault.vault_id);
                  if (d) refresh();
                }}
                className="rounded bg-emerald-600 px-3 py-1 text-sm disabled:opacity-50"
              >
                Claim
              </button>
            </div>
            {cooldownHours != null && (
              <p className="mt-1 text-xs text-gray-500">
                Claim available after the {cooldownHours}h cooldown.
              </p>
            )}
          </div>
        </div>
      )}

      {isManager && !vault.is_killed && (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-medium text-amber-300">Manager</h2>
          <button
            disabled={busy}
            onClick={async () => {
              const d = await actions.crystallizeFee(vault.vault_id);
              if (d) refresh();
            }}
            className="rounded bg-amber-600 px-3 py-1 text-sm disabled:opacity-50"
          >
            Crystallize performance fee
          </button>
        </div>
      )}

      {/* My position */}
      {address && posData && posData.flows.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium">My flows</h2>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="text-gray-500">
                <tr>
                  <th className="px-2 py-1 text-left">Type</th>
                  <th className="px-2 py-1 text-right">Shares</th>
                  <th className="px-2 py-1 text-right">NUSDC</th>
                  <th className="px-2 py-1 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {posData.flows.map((f) => (
                  <tr key={`${f.tx_digest}-${f.event_seq}`} className="border-t border-white/5">
                    <td className="px-2 py-1">{f.flow_type}</td>
                    <td className="px-2 py-1 text-right">{f.shares}</td>
                    <td className="px-2 py-1 text-right">
                      {(Number(f.nusdc_amount) / NUSDC_UNIT).toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {new Date(Number(f.timestamp_ms)).toLocaleString("en-US")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* NAV history */}
      <div className="mt-6">
        <VaultNavChart navSeries={navSeries} />
      </div>

      {/* Recent trades */}
      <div className="mt-6">
        <h2 className="mb-2 text-sm font-medium">Recent trades ({trades.length})</h2>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="px-2 py-1 text-left">Side</th>
                <th className="px-2 py-1 text-right">Price</th>
                <th className="px-2 py-1 text-right">Qty</th>
                <th className="px-2 py-1 text-right">NAV after</th>
                <th className="px-2 py-1 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={`${t.tx_digest}-${t.event_seq}`} className="border-t border-white/5">
                  <td className="px-2 py-1">{t.is_bid ? "buy" : "sell"}</td>
                  <td className="px-2 py-1 text-right">{t.price}</td>
                  <td className="px-2 py-1 text-right">{t.qty}</td>
                  <td className="px-2 py-1 text-right">
                    {(Number(t.nav_after) / NAV_SCALE).toFixed(4)}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {new Date(Number(t.timestamp_ms)).toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
