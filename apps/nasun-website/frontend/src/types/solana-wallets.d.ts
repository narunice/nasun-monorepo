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

interface SolanaSignedMessage {
  signature: Uint8Array;
  publicKey: SolanaWalletPublicKey;
}

interface SolanaWalletAdapter {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  publicKey?: SolanaWalletPublicKey | null;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: SolanaWalletPublicKey }>;
  disconnect(): Promise<void>;
  // Phantom and Solflare both expose signMessage; both accept UTF-8 bytes
  // and return { signature: Uint8Array, publicKey }. Some older Phantom
  // versions returned only the signature — we treat the publicKey as
  // optional and fall back to adapter.publicKey at call sites.
  signMessage?(message: Uint8Array, encoding?: string): Promise<SolanaSignedMessage>;
}

declare global {
  interface Window {
    phantom?: { solana?: SolanaWalletAdapter };
    solflare?: SolanaWalletAdapter;
  }
}
