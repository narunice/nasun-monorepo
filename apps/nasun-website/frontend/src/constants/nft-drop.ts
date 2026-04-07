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

export function getEditionVideoUrl(name: string): string {
  return `/videos/genesispass-encoded-web/${name.toLowerCase()}-web.mp4`;
}

export function getEditionPosterUrl(name: string): string {
  return `/videos/genesispass-encoded-web/posters/${name.toLowerCase()}-web.webp`;
}

export const STAGE_LABELS: Record<number, string> = {
  0: "Paused",
  1: "Free Mint",
  2: "GTD Allowlist Mint",
  3: "FCFS Allowlist Mint",
  4: "Public Mint",
};

// Phase start times (UTC) for countdown display
const PROD_STAGE_START_TIMES: Record<number, Date> = {
  1: new Date("2026-04-07T15:00:00Z"),
  2: new Date("2026-04-08T03:00:00Z"),
  3: new Date("2026-04-08T15:00:00Z"),
  4: new Date("2026-04-09T15:00:00Z"),
};
const PROD_MINT_CLOSE_TIME = new Date("2026-04-14T15:00:00Z");

// Staging schedule: 1-hour intervals for testing (2026-04-07 KST 11:00~15:00)
const STAGING_STAGE_START_TIMES: Record<number, Date> = {
  1: new Date("2026-04-07T02:00:00Z"), // KST 11:00
  2: new Date("2026-04-07T03:00:00Z"), // KST 12:00
  3: new Date("2026-04-07T04:00:00Z"), // KST 13:00
  4: new Date("2026-04-07T05:00:00Z"), // KST 14:00
};
const STAGING_MINT_CLOSE_TIME = new Date("2026-04-07T06:00:00Z"); // KST 15:00

// import.meta.env.PROD is true for ANY `vite build` (including --mode development).
// Use MODE to distinguish staging (development mode build) from production.
const IS_PROD = import.meta.env.MODE === "production";
export const STAGE_START_TIMES = IS_PROD ? PROD_STAGE_START_TIMES : STAGING_STAGE_START_TIMES;
export const MINT_CLOSE_TIME = IS_PROD ? PROD_MINT_CLOSE_TIME : STAGING_MINT_CLOSE_TIME;

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
