import { useCallback, useRef, useState } from 'react';
import { isValidSolAddress } from '@/lib/solana';

export type SolWalletName = 'phantom' | 'solflare';

// NOTE: isPhantom / isSolflare are UA-style hints, not security boundaries.
// A hostile extension can set either flag. We rely on the base58 address
// validation below as the only hard check. Phase 9 will move to Wallet Standard
// registry + signMessage-based authentication when signing is required.
function getAdapter(name: SolWalletName): SolanaWalletAdapter | undefined {
  if (name === 'phantom') {
    const adapter = window.phantom?.solana;
    return adapter?.isPhantom ? adapter : undefined;
  }
  const adapter = window.solflare;
  return adapter?.isSolflare ? adapter : undefined;
}

function detectInstalled(): SolWalletName[] {
  const out: SolWalletName[] = [];
  if (window.phantom?.solana?.isPhantom) out.push('phantom');
  if (window.solflare?.isSolflare) out.push('solflare');
  return out;
}

export interface UseSolanaWalletAdapterResult {
  installed: SolWalletName[];
  isConnecting: boolean;
  error: string | null;
  connect: (name: SolWalletName) => Promise<string | null>;
  disconnect: (name: SolWalletName) => Promise<void>;
  clearError: () => void;
}

export function useSolanaWalletAdapter(): UseSolanaWalletAdapterResult {
  // detectInstalled runs once at mount. Late-injection (rare) requires page refresh.
  const [installed] = useState<SolWalletName[]>(detectInstalled);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const connect = useCallback(async (name: SolWalletName): Promise<string | null> => {
    if (inFlightRef.current) return null; // guard double-clicks
    inFlightRef.current = true;
    setError(null);
    setIsConnecting(true);
    try {
      const adapter = getAdapter(name);
      if (!adapter) {
        setError(`${name === 'phantom' ? 'Phantom' : 'Solflare'} not installed`);
        return null;
      }
      const { publicKey } = await adapter.connect();
      const addr = publicKey?.toString?.();
      if (!addr || typeof addr !== 'string' || !isValidSolAddress(addr)) {
        setError('Wallet returned invalid address');
        return null;
      }
      return addr;
    } catch (err) {
      // User rejected, extension locked, or other failure
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      return null;
    } finally {
      setIsConnecting(false);
      inFlightRef.current = false;
    }
  }, []);

  const disconnect = useCallback(async (name: SolWalletName) => {
    const adapter = getAdapter(name);
    if (!adapter) return;
    try {
      await adapter.disconnect();
    } catch {
      // Ignore — user may have already disconnected in the extension
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { installed, isConnecting, error, connect, disconnect, clearError };
}
