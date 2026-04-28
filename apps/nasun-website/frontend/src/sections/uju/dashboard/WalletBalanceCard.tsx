import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet, useZkLogin, useBalance as useNasunBalance, getMoveClient, isValidAddress, CHAINS } from "@nasun/wallet";
import { useBalance as useEthBalance } from "wagmi";
import { useAuth } from "@/features/auth";
import { SOL_ADDRESS_RE, SOL_DEVNET_RPC } from "@/lib/solana";
import { UjuCard, UjuBadge, UjuSectionHeader } from "../shared";
import { useSolanaWalletAdapter, type SolWalletName } from "./useSolanaWalletAdapter";
import {
  useSolAddressForIdentity,
  useSolAddressStore,
} from "../stores/solAddressStore";

const SUI_TESTNET_RPC = CHAINS["sui-testnet"].rpcUrl;

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function NetworkBadge({ label }: { label: string }) {
  return <UjuBadge tone="violet">{label}</UjuBadge>;
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

  const identityId = user?.identityId ?? undefined;

  // Plan v5 3A.2 state owners:
  //   store  : solAddress, connectedWallet (shared with StakingCard)
  //   local  : solInput (edit buffer), solError (form UI), solEditing (mode flag)
  const sol = useSolAddressForIdentity(identityId);
  const setForIdentity = useSolAddressStore((s) => s.setForIdentity);
  const hydrateFromStorage = useSolAddressStore((s) => s.hydrateFromStorage);

  const solAddress = sol?.solAddress ?? null;
  const connectedWallet: SolWalletName | null = sol?.connectedWallet ?? null;

  const [solInput, setSolInput] = useState("");
  const [solError, setSolError] = useState("");
  const [solEditing, setSolEditing] = useState(false);

  const { data: solBalance, isPending: solPending, isError: solFetchError } = useSolDevnetBalance(solAddress);

  const {
    installed,
    isConnecting,
    error: walletError,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    clearError,
  } = useSolanaWalletAdapter();

  // Hydrate store from localStorage when identityId changes.
  useEffect(() => {
    if (identityId) {
      hydrateFromStorage(identityId);
    }
    clearError();
  }, [identityId, hydrateFromStorage, clearError]);

  // Sync store solAddress → input buffer (one-way, only when not editing).
  // Mirrors prior identityId useEffect behavior, now driven by store.
  useEffect(() => {
    if (!solEditing) {
      setSolInput(solAddress ?? "");
    }
  }, [solAddress, solEditing]);

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  async function handleWalletConnect(name: SolWalletName) {
    if (!identityId) return;
    const addr = await adapterConnect(name);
    if (!addr) return;
    setForIdentity(identityId, addr, name);
    setSolEditing(false);
    setSolError("");
  }

  async function handleWalletDisconnect() {
    if (connectedWallet) await adapterDisconnect(connectedWallet);
    if (identityId) setForIdentity(identityId, null, null);
    clearError();
  }

  function handleSolSave() {
    if (!identityId) return;
    const trimmed = solInput.trim();
    if (!trimmed) {
      setForIdentity(identityId, null, null);
      setSolError("");
      return;
    }
    if (!SOL_ADDRESS_RE.test(trimmed)) {
      setSolError("Invalid Solana address");
      return;
    }
    setSolError("");
    setForIdentity(identityId, trimmed, null); // manual-entry: no adapter
    setSolEditing(false);
  }

  return (
    <UjuCard>
      <UjuSectionHeader accent title="Wallet Integration" subtitle="Connected addresses across networks" />

      <ul className="space-y-3">
        {/* NSN */}
        <li className="flex items-center justify-between">
          <span className="text-base text-uju-secondary">NSN</span>
          {isNasunConnected ? (
            <span className="text-base font-medium text-uju-primary tabular-nums">
              {nasunBalance?.formattedBalance ?? "0"} NSN
            </span>
          ) : (
            <span className="text-base text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* SUI */}
        <li className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base text-uju-secondary">SUI</span>
            <NetworkBadge label="Testnet" />
          </div>
          {suiAddress ? (
            <span className="text-base font-medium text-uju-primary tabular-nums">
              {suiPending ? "-" : suiError ? <span className="text-uju-secondary">Error</span> : `${suiBalance} SUI`}
            </span>
          ) : (
            <span className="text-base text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* ETH */}
        <li className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base text-uju-secondary">ETH</span>
            <NetworkBadge label="Sepolia" />
          </div>
          {ethAddress ? (
            <span className="text-base font-medium text-uju-primary tabular-nums">
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
            <span className="text-base text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* SOL */}
        <li>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base text-uju-secondary">SOL</span>
              <NetworkBadge label="Devnet" />
            </div>
            <div className="flex items-center gap-2">
              {solAddress ? (
                <>
                  <span className="text-base font-medium text-uju-primary tabular-nums">
                    {solPending
                      ? "-"
                      : solFetchError
                        ? <span className="text-uju-secondary">Error</span>
                        : `${solBalance} SOL`}
                  </span>
                  <button
                    onClick={connectedWallet ? handleWalletDisconnect : () => setSolEditing((v) => !v)}
                    className="text-base text-uju-secondary hover:text-pado-3 transition-colors"
                  >
                    {connectedWallet ? "Disconnect" : (solEditing ? "Cancel" : "Edit")}
                  </button>
                </>
              ) : installed.length > 0 ? (
                <>
                  {installed.includes("phantom") && (
                    <button
                      onClick={() => handleWalletConnect("phantom")}
                      disabled={isConnecting || !identityId}
                      className="text-base text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                    >
                      Phantom
                    </button>
                  )}
                  {installed.includes("solflare") && (
                    <button
                      onClick={() => handleWalletConnect("solflare")}
                      disabled={isConnecting || !identityId}
                      className="text-base text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                    >
                      Solflare
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setSolEditing((v) => !v)}
                  disabled={!identityId}
                  className="text-base text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                >
                  {solEditing ? "Cancel" : "Add"}
                </button>
              )}
            </div>
          </div>
          {walletError && !solEditing && (
            <p className="text-base text-nasun-scarlet mt-1">{walletError}</p>
          )}
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
                  className="flex-1 text-base bg-uju-bg border border-uju-border rounded-lg px-3 py-1.5 text-uju-primary placeholder:text-uju-secondary focus:outline-none focus:border-pado-3"
                />
                <button
                  onClick={handleSolSave}
                  className="text-base px-3 py-1.5 rounded-lg border border-uju-border text-uju-secondary hover:text-uju-primary hover:border-pado-3 transition-colors"
                >
                  Save
                </button>
              </div>
              {solError && (
                <p className="text-base text-nasun-scarlet mt-1">{solError}</p>
              )}
            </div>
          )}
        </li>
      </ul>
    </UjuCard>
  );
}
