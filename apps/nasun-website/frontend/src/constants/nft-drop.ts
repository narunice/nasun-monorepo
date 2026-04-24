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

// Arweave asset IDs mirrored from public/metadata/genesis-pass/{id}.json.
// Used to recover the edition id from an Alchemy-provided imageUrl when
// tokenId is missing, so we never pair the wrong name with an image.
const EDITION_ARWEAVE_IDS: Record<number, string[]> = {
  1: ["hdl2nNaLUqSTa83i5vpbKNr_O4eRpYITUlYF5VWbJnY", "UJlRjW3YpmYZqUbp7--yFxSLpL61fHH4MJ47cXY9sWA"],
  2: ["9VWyXbqk8ElxYBd23EzfnqO2RjWPr6JHiLK1fOexZog", "Q_W9FjHbeuxruRAdVNpdbjkRBWi-gLq8J5eb3HiJFPs"],
  3: ["0WXwTkmIfmlrkQh2fhryycN62y7ufy-1rdw-9YEB5Xo", "d5m3O_tbGI5jwdXZT8qfwwSxGu2jL-9Q4XtUjzQjEGY"],
  4: ["63QBkxBUCR1Zj4tUUOA3PkogYNu6gD9WfUnOPsM9RK0", "A4D9QTFc7-rbvJUNA5pxBRaicaO2U8MJPL9F7_nB_As"],
  5: ["PW1w0Fm0mvKatIrFpha42npI673X6YIvBBVerfvqY1w", "6NHX8Nk1i0f3L2sBXZQFSMgRyeAOe0pwAbMKg2uX6No"],
  6: ["caX8xVqXFW3wWVpdtVrIgxvFsTT3UTlSjCMpYEkbR7E", "mI19P8fUK6hHCUU1skIlHkcG3_c-wb0vbwCX3yIRYfI"],
  7: ["M9QVeN0cmP0yQJKGgG2sSVzZVHRyoBQqDLitssUN6I0", "YPYyVIduzY8tPWN-ZgstegjPWT1T4dZVK24qilLuMng"],
  8: ["4wcST8n6rmCoZ6wOd97kp3I0a-R2NhjhMoD_uPJX8F4", "LKmq5M80bMyvmpCq3MEeSW5JW-CNef6Gpvdv7uCnjTc"],
};

export function getEditionIdFromMediaUrl(url: string | undefined): number | undefined {
  if (!url) return undefined;
  for (const [id, cids] of Object.entries(EDITION_ARWEAVE_IDS)) {
    if (cids.some((cid) => url.includes(cid))) return Number(id);
  }
  return undefined;
}

// Extract edition id from a tokenUri like ".../metadata/genesis-pass/{id}.json".
// Survives image CID rotation since the contract baseURI is the source of truth.
export function getEditionIdFromTokenUri(url: string | undefined): number | undefined {
  if (!url) return undefined;
  const match = url.match(/\/genesis-pass\/(\d+)\.json(?:[?#]|$)/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return NFT_EDITIONS.some((e) => e.id === id) ? id : undefined;
}

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

// Staging now uses the same schedule as production
export const STAGE_START_TIMES = PROD_STAGE_START_TIMES;
export const MINT_CLOSE_TIME = PROD_MINT_CLOSE_TIME;

// Lore text shown in the gate modal entrance sequence
export const GENESIS_LORE_LINES = [
  "A mysterious pentahedron appears across time and space, disrupting systems that concentrate power into the hands of a few.",
  "Its presence creates new timelines where communities,",
  "not individuals, shape powerful civilizations.",
] as const;

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
