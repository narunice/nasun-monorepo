import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet, useZkLogin, useBalance as useNasunBalance, getMoveClient, isValidAddress, CHAINS } from "@nasun/wallet";
import { useBalance as useEthBalance } from "wagmi";
import { useAuth } from "@/features/auth";
import { UjuCard } from "../shared/UjuCard";

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SOL_DEVNET_RPC = "https://api.devnet.solana.com";
const SUI_TESTNET_RPC = CHAINS["sui-testnet"].rpcUrl;

function solKey(identityId: string) {
  return `uju:sol-address:${identityId}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function NetworkBadge({ label }: { label: string }) {
  return (
    <span className="text-xs text-uju-secondary border border-uju-border rounded px-1 py-0.5">
      {label}
    </span>
  );
}

function useSuiTestnetBalance(address: string | undefined) {
  return useQuery({
    queryKey: ["balance", "sui-testnet", address],
    queryFn: async () => {
      if (!address || !isValidAddress(address)) throw new Error("Invalid SUI address");
      const client = getMoveClient(SUI_TESTNET_RPC, "sui-testnet");
      const { totalBalance } = await client.getBalance({ owner: address });
      const mist = BigInt(totalBalance);
      const sui = mist / 1_000_000_000n;
      const rem = mist % 1_000_000_000n;
      const dec = rem.toString().padStart(9, "0").slice(0, 4);
      return `${sui}.${dec}`;
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}

function useSolDevnetBalance(address: string | null) {
  return useQuery({
    queryKey: ["balance", "sol-devnet", address],
    queryFn: async () => {
      if (!address || !SOL_ADDRESS_RE.test(address)) throw new Error("Invalid Solana address");
      const res = await fetch(SOL_DEVNET_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address, { commitment: "confirmed" }],
        }),
      });
      if (!res.ok) throw new Error("SOL RPC error");
      const json = await res.json() as { result?: { value: number }; error?: unknown };
      if (json.error) throw new Error("SOL RPC error");
      if (!json.result || typeof json.result.value !== "number") {
        throw new Error("SOL RPC: unexpected response");
      }
      return (json.result.value / 1e9).toFixed(4);
    },
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 0,
  });
}

export function WalletBalanceCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const { data: nasunBalance } = useNasunBalance();

  const registeredEthAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const ethAddress = (registeredEthAddress ?? undefined) as `0x${string}` | undefined;
  const { data: ethBalance } = useEthBalance({ address: ethAddress });

  const suiAddress = account?.address ?? zkState?.address;
  const { data: suiBalance, isPending: suiPending, isError: suiError } = useSuiTestnetBalance(suiAddress);

  const [solInput, setSolInput] = useState("");
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [solError, setSolError] = useState("");
  const [solEditing, setSolEditing] = useState(false);
  const { data: solBalance, isPending: solPending, isError: solFetchError } = useSolDevnetBalance(solAddress);

  const identityId = user?.identityId ?? "";

  useEffect(() => {
    if (!identityId) return;
    const saved = localStorage.getItem(solKey(identityId));
    if (saved && SOL_ADDRESS_RE.test(saved)) {
      setSolAddress(saved);
      setSolInput(saved);
    }
  }, [identityId]);

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  function handleSolSave() {
    if (!identityId) return;
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
    setSolEditing(false);
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

        {/* SUI */}
        <li className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-uju-secondary">SUI</span>
            <NetworkBadge label="Testnet" />
          </div>
          {suiAddress ? (
            <span className="text-sm font-medium text-uju-primary tabular-nums">
              {suiPending ? "-" : suiError ? <span className="text-uju-secondary">Error</span> : `${suiBalance} SUI`}
            </span>
          ) : (
            <span className="text-sm text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* ETH */}
        <li className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-uju-secondary">ETH</span>
            <NetworkBadge label="Sepolia" />
          </div>
          {ethAddress ? (
            <span className="text-sm font-medium text-uju-primary tabular-nums">
              {ethBalance
                ? (() => {
                    const dec = BigInt(ethBalance.decimals);
                    const divisor = 10n ** dec;
                    const whole = ethBalance.value / divisor;
                    const rem = ethBalance.value % divisor;
                    const remStr = rem.toString().padStart(ethBalance.decimals, "0").slice(0, 4);
                    return `${whole}.${remStr} ETH`;
                  })()
                : shortenAddress(ethAddress)}
            </span>
          ) : (
            <span className="text-sm text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* SOL */}
        <li>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary">SOL</span>
              <NetworkBadge label="Devnet" />
            </div>
            <div className="flex items-center gap-2">
              {solAddress ? (
                <span className="text-sm font-medium text-uju-primary tabular-nums">
                  {solPending ? "-" : solFetchError ? <span className="text-uju-secondary">Error</span> : `${solBalance} SOL`}
                </span>
              ) : (
                <span className="text-sm text-uju-secondary">Not set</span>
              )}
              <button
                onClick={() => setSolEditing((v) => !v)}
                className="text-sm text-uju-secondary hover:text-pado-3 transition-colors"
              >
                {solEditing ? "Cancel" : solAddress ? "Edit" : "Add"}
              </button>
            </div>
          </div>
          {solEditing && (
            <div className="mt-2">
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
            </div>
          )}
        </li>
      </ul>
    </UjuCard>
  );
}
