// Genesis Pass NFT Drop constants

export const NFT_EDITIONS = [
  { id: 1, name: "Colony" },
  { id: 2, name: "Dawn" },
  { id: 3, name: "Revolt" },
  { id: 4, name: "Echo" },
  { id: 5, name: "Awakening" },
  { id: 6, name: "Emergence" },
  { id: 7, name: "Rebirth" },
  { id: 8, name: "War" },
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

export const MINT_CLOSE_TIME = new Date("2026-04-14T15:00:00Z");

// Shared countdown helpers

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function calcTimeLeft(
  target: Date,
  now: number,
): TimeLeft & { isExpired: boolean } {
  const diff = target.getTime() - now;
  if (diff <= 0)
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
  const seconds = Math.floor((diff / 1000) % 60);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const hours = Math.floor((diff / 1000 / 60 / 60) % 24);
  const days = Math.floor(diff / 1000 / 60 / 60 / 24);
  return { days, hours, minutes, seconds, isExpired: false };
}
