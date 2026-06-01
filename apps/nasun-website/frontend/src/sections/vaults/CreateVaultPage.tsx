import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSigner } from "@nasun/wallet";
import { NUSDC_DECIMALS } from "@nasun/devnet-config";
import { useAgentProfiles } from "../uju/ai/hooks/useAgentProfiles";
import { useVaultTier } from "./lib/useVaultTier";
import { useVaultActions } from "./lib/useVaultActions";
import { parseUnits, parseFeeBps } from "./lib/amount";

// DeepBook DEEP uses 6 decimals by convention. The Nasun-devnet DEEP coin
// (0x71afcf8e) registers no CoinMetadata, so this is unverified on-chain;
// confirm against the token before relying on it for large seeds.
const DEEP_DECIMALS = 6;
const PROTOCOL_FEE_CAP_BPS = 3000; // vault.move DEFAULT_PROTOCOL_FEE_CAP_BPS

export default function CreateVaultPage() {
  const { address } = useSigner();
  const navigate = useNavigate();
  const { canCreateVault, tier, isLoading: tierLoading } = useVaultTier(address);
  const { data: profiles } = useAgentProfiles(address);
  const actions = useVaultActions();

  const eligibleProfiles = useMemo(
    () => (profiles ?? []).filter((p) => p.isActive && p.capabilityId),
    [profiles],
  );

  const [profileId, setProfileId] = useState("");
  const [nusdcSeed, setNusdcSeed] = useState("");
  const [deepSeed, setDeepSeed] = useState("");
  const [feePct, setFeePct] = useState("10");
  const [formError, setFormError] = useState<string | null>(null);

  const busy = actions.status === "signing" || actions.status === "executing";
  const selected = eligibleProfiles.find((p) => p.id === profileId);

  if (!address)
    return <p className="p-10 text-sm text-gray-400">Connect a wallet first.</p>;
  if (tierLoading)
    return <p className="p-10 text-sm text-gray-400">Checking eligibility…</p>;
  if (!canCreateVault)
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <h1 className="text-xl font-semibold">Vault creation requires Tier 3</h1>
        <p className="mt-2 text-sm text-gray-400">
          Your current Nasun Standing is Tier {tier}. Vault management unlocks at
          Tier 3.
        </p>
      </div>
    );

  const onCreate = async () => {
    setFormError(null);
    if (!selected?.capabilityId) {
      setFormError("Select an agent with a linked capability.");
      return;
    }
    const nusdcSeedRaw = parseUnits(nusdcSeed, NUSDC_DECIMALS);
    const deepSeedRaw = parseUnits(deepSeed, DEEP_DECIMALS);
    const performanceFeeBps = parseFeeBps(feePct, PROTOCOL_FEE_CAP_BPS);
    if (nusdcSeedRaw === null) return setFormError("Enter a valid NUSDC seed.");
    if (deepSeedRaw === null) return setFormError("Enter a valid DEEP seed.");
    if (performanceFeeBps === null)
      return setFormError(`Fee must be between 0 and ${PROTOCOL_FEE_CAP_BPS / 100}%.`);

    const digest = await actions.createVault({
      agentProfileId: selected.id,
      capabilityId: selected.capabilityId,
      nusdcSeedRaw,
      deepSeedRaw,
      performanceFeeBps,
    });
    if (digest) navigate("/vaults");
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold">Create Vault</h1>
      <p className="mt-1 text-sm text-gray-400">
        Tier-3 managed vault trading the NBTC/NUSDC DeepBook pool via your
        delegated agent.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-gray-300">Agent profile</span>
          <select
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm"
          >
            <option value="">Select an agent…</option>
            {eligibleProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id.slice(0, 6)}…)
              </option>
            ))}
          </select>
          {eligibleProfiles.length === 0 && (
            <span className="mt-1 block text-xs text-amber-400">
              No active agent with a linked capability. Create one in the AI tab
              first.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-sm text-gray-300">Initial NUSDC seed</span>
          <input
            value={nusdcSeed}
            onChange={(e) => setNusdcSeed(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-300">Initial DEEP seed</span>
          <input
            value={deepSeed}
            onChange={(e) => setDeepSeed(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-sm text-gray-300">Performance fee (%, max 30)</span>
          <input
            value={feePct}
            onChange={(e) => setFeePct(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-sm"
          />
        </label>

        {(formError || actions.error) && (
          <p className="text-sm text-red-400">{formError ?? actions.error}</p>
        )}

        <button
          disabled={busy || !selected || !nusdcSeed || !deepSeed}
          onClick={onCreate}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Create Vault"}
        </button>
      </div>
    </div>
  );
}
