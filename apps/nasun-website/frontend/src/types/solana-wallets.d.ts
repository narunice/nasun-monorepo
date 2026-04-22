// Wallet Standard subset — only what we actually use.
// Phantom (window.phantom.solana) and Solflare (window.solflare) both inject
// these shapes; we ignore the rest to keep the type surface minimal.
//
// IMPORTANT: Do NOT add `import` or `export` to this file — it becomes a module
// and `interface Window` augmentation stops merging. `declare global {}` makes
// the intent explicit even if someone later refactors the file.

interface SolanaWalletPublicKey {
  toString(): string;
  toBase58?(): string;
}

interface SolanaWalletAdapter {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaWalletPublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: SolanaWalletPublicKey }>;
  disconnect(): Promise<void>;
}

declare global {
  interface Window {
    phantom?: { solana?: SolanaWalletAdapter };
    solflare?: SolanaWalletAdapter;
  }
}
