// Wallet Standard subset — only what we actually use.
// Phantom (window.phantom.solana) and Solflare (window.solflare) both inject
// these shapes; we ignore the rest to keep the type surface minimal.
//
// IMPORTANT: Do NOT add `import` or `export` to this file. It is a global
// script declaration file, so `interface Window` below merges with the DOM lib
// directly. Adding either turns it into a module, at which point the merge
// stops and the augmentation needs a `declare global {}` wrapper to come back.
// Note the converse, which cost us these types once already: that wrapper in a
// script file is not an error and not a merge either — it just does nothing.

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

interface Window {
  phantom?: { solana?: SolanaWalletAdapter };
  solflare?: SolanaWalletAdapter;
}
