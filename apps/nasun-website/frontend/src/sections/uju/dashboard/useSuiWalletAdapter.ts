import { useCallback, useState } from "react";
import {
  useWallets,
  useConnectWallet,
  useDisconnectWallet,
  useCurrentWallet,
} from "@mysten/dapp-kit";
import { isValidAddress } from "@nasun/wallet";

/**
 * Mirrors the shape of `useSolanaWalletAdapter` for Sui so the Dashboard's
 * "Open Wallet" button can drive both chains through the same picker UI.
 *
 *   installed:  list of detected wallet names (Slush, Suiet, Sui Wallet…)
 *   connect:    pops the chosen wallet's connect modal; resolves to the
 *               connected address (or null on rejection / invalid response)
 *   disconnect: severs the dapp-kit session (the wallet extension itself
 *               retains its own connection state)
 *
 * This wraps `@mysten/dapp-kit` hooks and depends on the dapp-kit
 * WalletProvider being mounted — see `providers/NasunProvider.tsx`.
 */
export interface UseSuiWalletAdapterResult {
  installed: string[];
  isConnecting: boolean;
  error: string | null;
  connect: (name: string) => Promise<string | null>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export function useSuiWalletAdapter(): UseSuiWalletAdapterResult {
  const wallets = useWallets();
  const { mutateAsync: connectWalletMutation } = useConnectWallet();
  const { mutateAsync: disconnectMutation } = useDisconnectWallet();
  const { currentWallet } = useCurrentWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installed = wallets.map((w) => w.name);

  const connect = useCallback(
    async (name: string): Promise<string | null> => {
      setError(null);
      setIsConnecting(true);
      try {
        const wallet = wallets.find((w) => w.name === name);
        if (!wallet) {
          setError(`${name} not installed`);
          return null;
        }
        const result = await connectWalletMutation({ wallet });
        const account = result.accounts?.[0];
        const addr = account?.address;
        if (!addr || !isValidAddress(addr)) {
          setError("Wallet returned invalid address");
          return null;
        }
        return addr;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Connection failed";
        setError(msg);
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    [wallets, connectWalletMutation],
  );

  const disconnect = useCallback(async () => {
    if (!currentWallet) return;
    try {
      await disconnectMutation();
    } catch {
      // Ignore — user may have already disconnected from the wallet side.
    }
  }, [currentWallet, disconnectMutation]);

  const clearError = useCallback(() => setError(null), []);

  return { installed, isConnecting, error, connect, disconnect, clearError };
}
