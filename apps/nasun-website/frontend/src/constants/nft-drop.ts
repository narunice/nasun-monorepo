// Genesis Pass NFT Drop constants

export const NFT_EDITIONS = [
  { id: 1, name: "Horizon", description: "The dawn of a new network" },
  { id: 2, name: "Signal", description: "First pulse of the chain" },
  { id: 3, name: "Forge", description: "Where consensus is born" },
  { id: 4, name: "Drift", description: "Data flows without friction" },
  { id: 5, name: "Prism", description: "Light refracted through code" },
  { id: 6, name: "Vault", description: "Secured by mathematics" },
  { id: 7, name: "Echo", description: "Reverberations of genesis" },
] as const;

export const STAGE_LABELS: Record<number, string> = {
  0: "Paused",
  1: "Free Mint",
  2: "Guaranteed",
  3: "FCFS",
  4: "Public",
};

export const STAGE_DESCRIPTIONS: Record<number, string> = {
  0: "Minting is currently paused.",
  1: "Exclusive free mint for selected community members.",
  2: "Guaranteed mint for allowlisted wallets.",
  3: "First come, first served for registered wallets.",
  4: "Open to everyone. Connect your wallet and mint.",
};
