import { useCallback, useEffect, useRef, useState } from 'react';
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
  // Detection runs at mount and is re-checked on focus + a short post-mount
  // retry. Some extensions (notably Phantom on slow startups) inject window
  // hooks AFTER React first renders; without a re-check the picker would
  // permanently report "no wallet" even when the extension is installed.
  const [installed, setInstalled] = useState<SolWalletName[]>(detectInstalled);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const next = detectInstalled();
      setInstalled((prev) =>
        prev.length === next.length && prev.every((p) => next.includes(p))
          ? prev
          : next,
      );
    };
    // Retry a few times in the first 3s after mount.
    const timers = [200, 800, 1500, 3000].map((ms) => setTimeout(refresh, ms));
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", refresh);
    };
  }, []);

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
