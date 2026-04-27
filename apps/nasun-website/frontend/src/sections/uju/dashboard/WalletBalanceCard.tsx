import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet, useZkLogin, useBalance as useNasunBalance, getMoveClient, isValidAddress, CHAINS } from "@nasun/wallet";
import { useBalance as useEthBalance } from "wagmi";
import { useAuth } from "@/features/auth";
import { SOL_ADDRESS_RE, SOL_DEVNET_RPC } from "@/lib/solana";
import { UjuCard, UjuBadge, UjuSectionHeader } from "../shared";
import { useSolanaWalletAdapter, type SolWalletName } from "./useSolanaWalletAdapter";

const SUI_TESTNET_RPC = CHAINS["sui-testnet"].rpcUrl;

function solKey(identityId: string) {
  return `uju:sol-address:${identityId}`;
}

function solWalletKey(identityId: string) {
  return `uju:sol-wallet:${identityId}`;
}

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

  const [solInput, setSolInput] = useState("");
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [solError, setSolError] = useState("");
  const [solEditing, setSolEditing] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<SolWalletName | null>(null);
  const { data: solBalance, isPending: solPending, isError: solFetchError } = useSolDevnetBalance(solAddress);

  const {
    installed,
    isConnecting,
    error: walletError,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    clearError,
  } = useSolanaWalletAdapter();

  const identityId = user?.identityId ?? undefined;

  // Reload SOL state when identityId changes (also covers sign-out → identityId undefined).
  useEffect(() => {
    if (!identityId) {
      setSolAddress(null);
      setSolInput("");
      setConnectedWallet(null);
      clearError();
      return;
    }
    const savedAddr = localStorage.getItem(solKey(identityId));
    const savedWallet = localStorage.getItem(solWalletKey(identityId));
    if (savedAddr && SOL_ADDRESS_RE.test(savedAddr)) {
      setSolAddress(savedAddr);
      setSolInput(savedAddr);
      setConnectedWallet(
        savedWallet === "phantom" || savedWallet === "solflare" ? savedWallet : null,
      );
    } else {
      setSolAddress(null);
      setSolInput("");
      setConnectedWallet(null);
    }
    clearError();
  }, [identityId, clearError]);

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  async function handleWalletConnect(name: SolWalletName) {
    if (!identityId) return;
    const addr = await adapterConnect(name);
    if (!addr) return;
    setSolAddress(addr);
    setSolInput(addr);
    setConnectedWallet(name);
    setSolEditing(false);
    setSolError("");
    localStorage.setItem(solKey(identityId), addr);
    localStorage.setItem(solWalletKey(identityId), name);
  }

  async function handleWalletDisconnect() {
    if (connectedWallet) await adapterDisconnect(connectedWallet);
    if (identityId) {
      localStorage.removeItem(solKey(identityId));
      localStorage.removeItem(solWalletKey(identityId));
    }
    setSolAddress(null);
    setSolInput("");
    setConnectedWallet(null);
    clearError();
  }

  function handleSolSave() {
    if (!identityId) return;
    const trimmed = solInput.trim();
    if (!trimmed) {
      localStorage.removeItem(solKey(identityId));
      localStorage.removeItem(solWalletKey(identityId));
      setSolAddress(null);
      setConnectedWallet(null);
      setSolError("");
      return;
    }
    if (!SOL_ADDRESS_RE.test(trimmed)) {
      setSolError("Invalid Solana address");
      return;
    }
    setSolError("");
    setSolAddress(trimmed);
    setConnectedWallet(null); // manual-entry marker
    setSolEditing(false);
    localStorage.setItem(solKey(identityId), trimmed);
    localStorage.removeItem(solWalletKey(identityId));
  }

  return (
    <UjuCard>
      <UjuSectionHeader accent title="Wallet Balances" subtitle="Connected addresses across networks" />

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
                <>
                  <span className="text-sm font-medium text-uju-primary tabular-nums">
                    {solPending
                      ? "-"
                      : solFetchError
                        ? <span className="text-uju-secondary">Error</span>
                        : `${solBalance} SOL`}
                  </span>
                  <button
                    onClick={connectedWallet ? handleWalletDisconnect : () => setSolEditing((v) => !v)}
                    className="text-sm text-uju-secondary hover:text-pado-3 transition-colors"
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
                      className="text-sm text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                    >
                      Phantom
                    </button>
                  )}
                  {installed.includes("solflare") && (
                    <button
                      onClick={() => handleWalletConnect("solflare")}
                      disabled={isConnecting || !identityId}
                      className="text-sm text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                    >
                      Solflare
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={() => setSolEditing((v) => !v)}
                  disabled={!identityId}
                  className="text-sm text-uju-secondary hover:text-pado-3 transition-colors disabled:text-uju-border disabled:cursor-not-allowed"
                >
                  {solEditing ? "Cancel" : "Add"}
                </button>
              )}
            </div>
          </div>
          {walletError && !solEditing && (
            <p className="text-sm text-nasun-scarlet mt-1">{walletError}</p>
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
                  className="flex-1 text-sm bg-uju-bg border border-uju-border rounded-lg px-3 py-1.5 text-uju-primary placeholder:text-uju-secondary focus:outline-none focus:border-pado-3"
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
