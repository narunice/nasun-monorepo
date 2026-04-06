// Genesis Pass NFT Drop constants

export const NFT_EDITIONS = [
  { id: 1, name: "Horizon", description: "The dawn of a new network" },
  { id: 2, name: "Signal", description: "First pulse of the chain" },
  { id: 3, name: "Forge", description: "Where consensus is born" },
  { id: 4, name: "Drift", description: "Data flows without friction" },
  { id: 5, name: "Prism", description: "Light refracted through code" },
  { id: 6, name: "Vault", description: "Secured by mathematics" },
  { id: 7, name: "Echo", description: "Reverberations of genesis" },
  { id: 8, name: "Nexus", description: "The convergence point" },
] as const;

export const STAGE_LABELS: Record<number, string> = {
  0: "Paused",
  1: "Free Mint",
  2: "GTD Allowlist Mint",
  3: "FCFS Allowlist Mint",
  4: "Public Mint",
};

// Phase start times (UTC) for countdown display
export const STAGE_START_TIMES: Record<number, Date> = {
  1: new Date("2026-04-07T15:00:00Z"),
  2: new Date("2026-04-08T03:00:00Z"),
  3: new Date("2026-04-08T15:00:00Z"),
  4: new Date("2026-04-09T15:00:00Z"),
};
