import { useState, useEffect } from "react";
import { useWallet, useZkLogin, useBalance as useNasunBalance } from "@nasun/wallet";
import { useBalance as useEthBalance } from "wagmi";
import { useAuth } from "@/features/auth";
import { UjuCard } from "../shared/UjuCard";

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function solKey(identityId: string) {
  return `uju:sol-address:${identityId}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletBalanceCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { data: nasunBalance } = useNasunBalance();

  const registeredEthAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const ethAddress = (registeredEthAddress ?? undefined) as `0x${string}` | undefined;
  const { data: ethBalance } = useEthBalance({ address: ethAddress });

  const [solInput, setSolInput] = useState("");
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [solError, setSolError] = useState("");

  const identityId = user?.identityId ?? "";

  useEffect(() => {
    if (!identityId) return;
    const saved = localStorage.getItem(solKey(identityId));
    if (saved) {
      setSolAddress(saved);
      setSolInput(saved);
    }
  }, [identityId]);

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  function handleSolSave() {
    const trimmed = solInput.trim();
    if (!trimmed) {
      localStorage.removeItem(solKey(identityId));
      setSolAddress(null);
      setSolError("");
      return;
    }
    if (!SOL_ADDRESS_RE.test(trimmed)) {
      setSolError("Invalid Solana address");
      return;
    }
    setSolError("");
    setSolAddress(trimmed);
    localStorage.setItem(solKey(identityId), trimmed);
  }

  return (
    <UjuCard>
      <p className="text-sm font-medium text-uju-secondary mb-3">Wallet Balances</p>

      <ul className="space-y-3">
        {/* NSN */}
        <li className="flex items-center justify-between">
          <span className="text-sm text-uju-secondary">NSN</span>
          {isNasunConnected ? (
            <span className="text-sm font-medium text-uju-primary tabular-nums">
              {nasunBalance?.formattedBalance ?? "0"} NSN
            </span>
          ) : (
            <span className="text-sm text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* ETH */}
        <li className="flex items-center justify-between">
          <span className="text-sm text-uju-secondary">ETH</span>
          {ethAddress ? (
            <span className="text-sm font-medium text-uju-primary tabular-nums">
              {ethBalance
                ? `${(Number(ethBalance.value) / 10 ** ethBalance.decimals).toFixed(4)} ETH`
                : shortenAddress(ethAddress)}
            </span>
          ) : (
            <span className="text-sm text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* SOL */}
        <li>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-uju-secondary">SOL</span>
            {solAddress ? (
              <span className="text-sm font-medium text-uju-primary">
                {shortenAddress(solAddress)}
              </span>
            ) : (
              <span className="text-sm text-uju-secondary">Not set</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={solInput}
              onChange={(e) => {
                setSolInput(e.target.value);
                setSolError("");
              }}
              placeholder="Enter Solana address"
              className="flex-1 text-sm bg-uju-bg border border-uju-border rounded-lg px-3 py-1.5 text-uju-primary placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-3"
            />
            <button
              onClick={handleSolSave}
              className="text-sm px-3 py-1.5 rounded-lg border border-uju-border text-uju-secondary hover:text-uju-primary hover:border-pado-3 transition-colors"
            >
              Save
            </button>
          </div>
          {solError && (
            <p className="text-sm text-nasun-scarlet mt-1">{solError}</p>
          )}
        </li>
      </ul>
    </UjuCard>
  );
}
