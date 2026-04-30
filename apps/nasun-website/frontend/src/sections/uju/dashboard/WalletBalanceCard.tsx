import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet, useZkLogin, useBalance as useNasunBalance, getMoveClient, isValidAddress } from "@nasun/wallet";
import { useBalance as useEthBalance } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useAuth } from "@/features/auth";
import { SOL_ADDRESS_RE } from "@/lib/solana";
import { SOL_MAINNET_READ_RPC } from "@/lib/solana-readonly";
import { UjuCard, UjuBadge, UjuButton, UjuSectionHeader } from "../shared";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { useSolanaWalletAdapter, type SolWalletName } from "./useSolanaWalletAdapter";
import {
  useSolAddressForIdentity,
  useSolAddressStore,
} from "../stores/solAddressStore";
import {
  useSuiAddressStore,
  useSuiExternalAddress,
} from "../stores/suiAddressStore";

// Plan v5+: read-only mainnet for all external chains. SUI mainnet RPC for
// balance display (matches StakingCard's useSuiTestnetStakes which is now also
// mainnet — file/hook names are historical, see staking/sui/suiTestnet.ts).
const SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Map Phantom/Solflare adapter error messages to user-friendly UX. Wallet
// extensions sometimes return raw rejection text ("User rejected", "disconnect",
// error code 4001) that confuses users mid-flow.
function friendlyWalletError(msg: string | null): string | null {
  if (!msg) return null;
  const m = msg.toLowerCase();
  if (m.includes("reject") || m.includes("denied") || m.includes("4001")) {
    return "Connection cancelled.";
  }
  if (m.includes("disconnect") || m.includes("locked")) {
    return "Wallet is locked or disconnected. Unlock the extension and try again.";
  }
  if (m.includes("not installed")) {
    return msg; // adapter already produces a clear message
  }
  if (m.includes("invalid")) {
    return msg;
  }
  return `Connection failed: ${msg}`;
}

function NetworkBadge({ label }: { label: string }) {
  return <UjuBadge tone="violet">{label}</UjuBadge>;
}

function useSuiMainnetBalance(address: string | undefined) {
  return useQuery({
    queryKey: ["balance", "sui-mainnet", address],
    queryFn: async () => {
      if (!address || !isValidAddress(address)) throw new Error("Invalid SUI address");
      const client = getMoveClient(SUI_MAINNET_RPC, "sui-mainnet");
      const { totalBalance } = await client.getBalance({ owner: address });
      const mist = BigInt(totalBalance);
      const sui = mist / 1_000_000_000n;
      const rem = mist % 1_000_000_000n;
      const dec = rem.toString().padStart(9, "0").slice(0, 4);
      return `${sui}.${dec}`;
    },
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// Plan v5: read-only mainnet OK. Aligned with StakingCard's useSolLst (also mainnet).
function useSolMainnetBalance(address: string | null) {
  return useQuery({
    queryKey: ["balance", "sol-mainnet", address],
    queryFn: async () => {
      if (!address || !SOL_ADDRESS_RE.test(address)) throw new Error("Invalid Solana address");
      const res = await fetch(SOL_MAINNET_READ_RPC, {
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
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function WalletBalanceCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const { data: nasunBalance } = useNasunBalance();

  const registeredEthAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const ethAddress = (registeredEthAddress ?? undefined) as `0x${string}` | undefined;
  // ETH balance is still queried from mainnet, but the surfaced badge says
  // "Testnet" (per product direction). When the wagmi/RainbowKit chains
  // config is migrated to sepolia (or another testnet), update the chainId
  // here to keep label/data in sync. SUI/SOL row balances follow the same
  // pattern via useSuiMainnetBalance / useSolMainnetBalance above.
  const { data: ethBalance } = useEthBalance({ address: ethAddress, chainId: mainnet.id });

  const identityId = user?.identityId ?? undefined;

  // SUI address resolution:
  //   1. External typed address (suiAddressStore) — explicit user override
  //   2. Nasun-derived (zkLogin/mnemonic keypair → Sui scheme)
  // Display in this card is read-only across both branches; staking actions
  // happen on suiscan/Sui Wallet externally.
  const suiExternal = useSuiExternalAddress(identityId);
  const suiNasunDerived = account?.address ?? zkState?.address;
  const suiDisplayAddress = suiExternal ?? suiNasunDerived;
  const isExternalSui = !!suiExternal;
  const setSuiExternal = useSuiAddressStore((s) => s.setExternal);
  const hydrateSuiStorage = useSuiAddressStore((s) => s.hydrateFromStorage);
  const { data: suiBalance, isPending: suiPending, isError: suiError } = useSuiMainnetBalance(suiDisplayAddress);

  // Plan v5 3A.2 state owners (paste UI removed):
  //   store  : solAddress, connectedWallet (shared with StakingCard)
  const sol = useSolAddressForIdentity(identityId);
  const setForIdentity = useSolAddressStore((s) => s.setForIdentity);
  const hydrateFromStorage = useSolAddressStore((s) => s.hydrateFromStorage);

  const solAddress = sol?.solAddress ?? null;
  const connectedWallet: SolWalletName | null = sol?.connectedWallet ?? null;

  const { data: solBalance, isPending: solPending, isError: solFetchError } = useSolMainnetBalance(solAddress);

  const {
    installed,
    isConnecting,
    error: walletError,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    clearError,
  } = useSolanaWalletAdapter();

  // Hydrate stores from localStorage when identityId changes.
  useEffect(() => {
    if (identityId) {
      hydrateFromStorage(identityId);
      hydrateSuiStorage(identityId);
    }
    clearError();
  }, [identityId, hydrateFromStorage, hydrateSuiStorage, clearError]);

  function handleSuiDisconnect() {
    if (!identityId) return;
    setSuiExternal(identityId, null);
  }

  // Inline EVM (MetaMask) link via RainbowKit + challenge/sign/verify.
  // Reuses the same wallet auth flow as my-account so backend state stays
  // consistent (linkedAccounts.metamask.walletAddress).
  const {
    connect: connectMetaMask,
    isAuthenticating: isEthAuthenticating,
    error: ethAuthError,
  } = useWalletAuth({ mode: "link" });

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  async function handleWalletConnect(name: SolWalletName) {
    if (!identityId) return;
    const addr = await adapterConnect(name);
    if (!addr) return;
    setForIdentity(identityId, addr, name);
  }

  async function handleWalletDisconnect() {
    if (connectedWallet) await adapterDisconnect(connectedWallet);
    if (identityId) setForIdentity(identityId, null, null);
    clearError();
  }

  return (
    <UjuCard>
      <UjuSectionHeader accent title="Wallet Integration" subtitle="Connected addresses across networks" />

      <ul className="space-y-3">
        {/* NSN */}
        <li className="flex items-center justify-between">
          <span className="text-base text-uju-secondary">NSN</span>
          {isNasunConnected ? (
            <span className="text-base font-light text-uju-primary tabular-nums">
              {nasunBalance?.formattedBalance ?? "0"} NSN
            </span>
          ) : (
            <span className="text-base text-uju-secondary">Not connected</span>
          )}
        </li>

        {/* SUI */}
        <li>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base text-uju-secondary">SUI</span>
              <NetworkBadge label="Testnet" />
              {isExternalSui && (
                <span
                  className="text-xs text-uju-secondary border border-uju-border rounded-full px-2 py-0.5"
                  title="Address ownership not verified"
                >
                  unverified
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {suiDisplayAddress ? (
                <span className="text-base font-light text-uju-primary tabular-nums">
                  {suiPending
                    ? "-"
                    : suiError
                      ? <span className="text-uju-secondary">RPC error</span>
                      : `${suiBalance} SUI`}
                </span>
              ) : (
                <span className="text-base text-uju-secondary">Not connected</span>
              )}
              {isExternalSui ? (
                <UjuButton variant="ghost" size="sm" onClick={handleSuiDisconnect}>
                  Disconnect
                </UjuButton>
              ) : (
                <span className="text-sm text-uju-secondary border border-uju-border rounded-full px-2 py-0.5 uppercase tracking-widest">
                  Coming Soon
                </span>
              )}
            </div>
          </div>
        </li>

        {/* ETH */}
        <li>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base text-uju-secondary">ETH</span>
              <NetworkBadge label="Testnet" />
            </div>
            <div className="flex items-center gap-2">
              {ethAddress ? (
                <span className="text-base font-light text-uju-primary tabular-nums">
                  {ethBalance
                    ? (() => {
                        const dec = BigInt(ethBalance.decimals);
                        const divisor = 10n ** dec;
                        const whole = ethBalance.value / divisor;
                        const rem = ethBalance.value % divisor;
                        const remStr = rem
                          .toString()
                          .padStart(ethBalance.decimals, "0")
                          .slice(0, 4);
                        return `${whole}.${remStr} ETH`;
                      })()
                    : shortenAddress(ethAddress)}
                </span>
              ) : (
                <UjuButton
                  variant="secondary"
                  size="sm"
                  onClick={connectMetaMask}
                  disabled={isEthAuthenticating || !identityId}
                  title={!identityId ? "Sign in to connect a wallet" : undefined}
                >
                  {isEthAuthenticating ? "Connecting…" : "Connect MetaMask"}
                </UjuButton>
              )}
            </div>
          </div>
          {ethAuthError && (
            <p className="text-base text-nasun-scarlet mt-1">{ethAuthError}</p>
          )}
        </li>

        {/* SOL */}
        <li>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base text-uju-secondary">SOL</span>
              <NetworkBadge label="Testnet" />
            </div>
            <div className="flex items-center gap-2">
              {solAddress ? (
                <>
                  <span className="text-base font-light text-uju-primary tabular-nums">
                    {solPending
                      ? "-"
                      : solFetchError
                        ? <span className="text-uju-secondary">RPC error</span>
                        : `${solBalance} SOL`}
                  </span>
                  {connectedWallet ? (
                    <UjuButton variant="ghost" size="sm" onClick={handleWalletDisconnect}>
                      Disconnect
                    </UjuButton>
                  ) : null}
                </>
              ) : (
                <>
                  {installed.includes("phantom") && (
                    <UjuButton
                      variant="secondary"
                      size="sm"
                      disabled={isConnecting || !identityId}
                      title={!identityId ? "Sign in to connect a wallet" : undefined}
                      onClick={() => handleWalletConnect("phantom")}
                    >
                      Phantom
                    </UjuButton>
                  )}
                  {installed.includes("solflare") && (
                    <UjuButton
                      variant="secondary"
                      size="sm"
                      disabled={isConnecting || !identityId}
                      title={!identityId ? "Sign in to connect a wallet" : undefined}
                      onClick={() => handleWalletConnect("solflare")}
                    >
                      Solflare
                    </UjuButton>
                  )}
                  {installed.length === 0 && (
                    <span className="text-sm text-uju-secondary">
                      Install Phantom or Solflare to connect
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          {walletError && (
            <p className="text-base text-nasun-scarlet mt-1">
              {friendlyWalletError(walletError)}
            </p>
          )}
        </li>
      </ul>
    </UjuCard>
  );
}
