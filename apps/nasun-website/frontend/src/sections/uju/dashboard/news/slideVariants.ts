import type { BonusFeedEntry } from "@/services/ecosystemScoreApi";

// Per-category visual + copy config for the celebration carousel. Centralized
// here so the slide component stays presentational.
//
// Tailwind tokens used (Nasun brand): nasun-c1..c7, pado-2..4, pado-violet,
// pado-lavender, uju-primary/secondary. Avoid nasun-scarlet which reads as
// "error" in the rest of the product.

export type SlideKind =
  | "leaderboard-eco"
  | "leaderboard-pado"
  | "game"
  | "bugreport"
  | "feedback"
  | "airdrop-gp"
  | "airdrop-alliance"
  | "referral"
  | "earlybird"
  | "creator-post"
  | "creators-appreciation"
  | "generic";

export interface SlideVariant {
  kind: SlideKind;
  // Tailwind class fragment for the radial-glow background (rendered behind
  // the slide content).
  glowGradient: string;
  // Tailwind class for the points number gradient text (bg-gradient-to-r ...).
  pointsGradient: string;
  // Tailwind class for the small "tag" chip in the top-left.
  tagClass: string;
  // Headline shown above the points number.
  headline: string;
  // Optional render-time subline builder. Receives the raw award entry so it
  // can pull rank/weekId/etc. from metadata. Returns null if the data is too
  // sparse for a meaningful subline (slide falls back to a generic copy).
  buildSubline: (entry: BonusFeedEntry) => string | null;
  // Icon glyph rendered at top-left next to the tag. SVG strings keep the
  // bundle small vs. importing from a library.
  iconKey: IconKey;
}

export type IconKey =
  | "trophy"
  | "chart"
  | "controller"
  | "bug"
  | "chat"
  | "gift"
  | "shield"
  | "sunrise"
  | "users"
  | "pen"
  | "sparkle";

const CATEGORY_TO_KIND: Record<string, SlideKind> = {
  "ecosystem-bonus-leaderboard": "leaderboard-eco",
  "ecosystem-bonus-pado": "leaderboard-pado",
  "ecosystem-bonus-game": "game",
  "ecosystem-bonus-bugreport": "bugreport",
  "ecosystem-bonus-feedback": "feedback",
  "ecosystem-bonus-genesis-pass-airdrop": "airdrop-gp",
  "ecosystem-bonus-alliance-airdrop": "airdrop-alliance",
  "ecosystem-bonus-earlybird": "earlybird",
  "ecosystem-bonus-creator-posts": "creator-post",
  "ecosystem-bonus-creators-appreciation": "creators-appreciation",
  "referral-bonus": "referral",
};

export function classifyEntry(entry: BonusFeedEntry): SlideKind {
  return CATEGORY_TO_KIND[entry.category] ?? "generic";
}

function rankSubline(label: string, entry: BonusFeedEntry): string | null {
  const m = entry.metadata;
  if (!m) return `${label} weekly reward`;
  const rank = typeof m.rank === "number" ? m.rank : null;
  const weekId = typeof m.weekId === "string" ? m.weekId : null;
  const totalParticipants =
    typeof m.totalParticipants === "number" ? m.totalParticipants : null;

  if (rank == null) {
    return weekId ? `${label} - ${weekId}` : `${label} weekly reward`;
  }

  const parts: string[] = [`#${rank} on ${label}`];
  if (weekId) parts.push(weekId);
  if (totalParticipants && totalParticipants > rank) {
    const percentile = ((1 - rank / totalParticipants) * 100).toFixed(1);
    parts.push(`top ${percentile}%`);
  }
  return parts.join(" - ");
}

export const VARIANTS: Record<SlideKind, SlideVariant> = {
  "leaderboard-eco": {
    kind: "leaderboard-eco",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(148,225,211,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(94,225,228,0.22),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-c3 via-pado-3 to-pado-2",
    tagClass: "bg-pado-2/15 text-nasun-c3 border border-pado-2/30",
    headline: "Ecosystem Leaderboard Reward",
    buildSubline: (e) => rankSubline("Ecosystem", e),
    iconKey: "trophy",
  },
  "leaderboard-pado": {
    kind: "leaderboard-pado",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(124,92,255,0.30),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(59,185,216,0.22),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-pado-violet via-pado-2 to-pado-3",
    tagClass: "bg-pado-violet/15 text-pado-lavender border border-pado-violet/30",
    headline: "Pado DeFi Leaderboard Reward",
    buildSubline: (e) => rankSubline("Pado DeFi", e),
    iconKey: "chart",
  },
  game: {
    kind: "game",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(201,167,255,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(124,92,255,0.22),transparent_55%)]",
    pointsGradient:
      "bg-gradient-to-br from-pado-lavender via-pado-violet to-pado-2",
    tagClass: "bg-pado-violet/15 text-pado-lavender border border-pado-violet/30",
    headline: "Game Bonus",
    buildSubline: (e) => {
      const m = e.metadata;
      const weekId = m && typeof m.weekId === "string" ? m.weekId : null;
      return weekId ? `Weekly game settlement - ${weekId}` : "Game settlement bonus";
    },
    iconKey: "controller",
  },
  bugreport: {
    kind: "bugreport",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(167,215,191,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(94,225,228,0.20),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-pado-4 via-pado-3 to-nasun-c3",
    tagClass: "bg-pado-3/15 text-pado-3 border border-pado-3/30",
    headline: "Bug Report Accepted",
    buildSubline: (e) => {
      const m = e.metadata;
      const reason = m && typeof m.reason === "string" ? m.reason : null;
      if (reason && reason.length > 0) {
        return reason.length > 80 ? `${reason.slice(0, 77)}...` : reason;
      }
      return "Thank you for making Nasun better";
    },
    iconKey: "bug",
  },
  feedback: {
    kind: "feedback",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(178,226,177,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(94,225,228,0.18),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-pado-4 via-pado-3 to-pado-2",
    tagClass: "bg-pado-4/15 text-pado-4 border border-pado-4/30",
    headline: "Feedback Accepted",
    buildSubline: (e) => {
      const m = e.metadata;
      const reason = m && typeof m.reason === "string" ? m.reason : null;
      if (reason && reason.length > 0) {
        return reason.length > 80 ? `${reason.slice(0, 77)}...` : reason;
      }
      return "Your voice shapes the product";
    },
    iconKey: "chat",
  },
  "airdrop-gp": {
    kind: "airdrop-gp",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(249,168,36,0.30),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(246,229,162,0.22),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-c1 via-nasun-c2 to-nasun-c3",
    tagClass: "bg-nasun-c1/15 text-nasun-c1 border border-nasun-c1/40",
    headline: "Genesis Pass Airdrop",
    buildSubline: () => "Genesis-tier holder reward",
    iconKey: "gift",
  },
  "airdrop-alliance": {
    kind: "airdrop-alliance",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(148,225,211,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(179,224,255,0.18),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-c3 via-nasun-c7 to-pado-2",
    tagClass: "bg-nasun-c3/15 text-nasun-c3 border border-nasun-c3/40",
    headline: "Alliance Airdrop",
    buildSubline: () => "Alliance NFT holder reward",
    iconKey: "shield",
  },
  referral: {
    kind: "referral",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(255,77,77,0.22),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(249,168,36,0.20),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-coral via-nasun-c1 to-nasun-c2",
    tagClass: "bg-nasun-coral/15 text-nasun-coral border border-nasun-coral/30",
    headline: "Referral Bonus",
    buildSubline: (e) => {
      const m = e.metadata;
      const count = m && typeof m.count === "number" ? m.count : null;
      const date = m && typeof m.date === "string" ? m.date : null;
      if (count != null && count > 0) {
        return `${count} referral activit${count === 1 ? "y" : "ies"}${date ? ` on ${date}` : ""}`;
      }
      return "Your referrals are paying off";
    },
    iconKey: "users",
  },
  earlybird: {
    kind: "earlybird",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(249,168,36,0.28),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(255,77,77,0.18),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-c1 via-nasun-coral to-pado-violet",
    tagClass: "bg-nasun-c1/15 text-nasun-c1 border border-nasun-c1/40",
    headline: "Early Bird Bonus",
    buildSubline: () => "One-time launch reward",
    iconKey: "sunrise",
  },
  "creator-post": {
    kind: "creator-post",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(124,92,255,0.25),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(201,167,255,0.20),transparent_55%)]",
    pointsGradient:
      "bg-gradient-to-br from-pado-violet via-pado-lavender to-pado-3",
    tagClass: "bg-pado-violet/15 text-pado-lavender border border-pado-violet/30",
    headline: "Creator Post Reward",
    buildSubline: () => "Curated post bonus",
    iconKey: "pen",
  },
  "creators-appreciation": {
    kind: "creators-appreciation",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(124,92,255,0.25),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(94,225,228,0.18),transparent_55%)]",
    pointsGradient:
      "bg-gradient-to-br from-pado-violet via-nasun-c3 to-pado-3",
    tagClass: "bg-pado-violet/15 text-pado-lavender border border-pado-violet/30",
    headline: "Creators Appreciation",
    buildSubline: () => "Season-end recognition",
    iconKey: "sparkle",
  },
  generic: {
    kind: "generic",
    glowGradient:
      "bg-[radial-gradient(120%_80%_at_15%_20%,rgba(148,225,211,0.20),transparent_60%),radial-gradient(120%_80%_at_85%_85%,rgba(59,185,216,0.16),transparent_55%)]",
    pointsGradient: "bg-gradient-to-br from-nasun-c3 via-pado-2 to-pado-3",
    tagClass: "bg-pado-2/15 text-nasun-c3 border border-pado-2/30",
    headline: "Bonus Awarded",
    buildSubline: () => "Keep building, keep earning",
    iconKey: "sparkle",
  },
};

// Cumulative key matches the API's `cumulativeByCategory` — same string as the
// raw category. Exported here so the carousel container can label correctly.
export function cumulativeKeyFor(entry: BonusFeedEntry): string {
  return entry.category;
}

// Human-readable label for the cumulative line. The API key is the raw
// category like 'ecosystem-bonus-leaderboard'; this maps to e.g.
// "Total Ecosystem Leaderboard rewards".
export function cumulativeLabelFor(kind: SlideKind): string {
  switch (kind) {
    case "leaderboard-eco":
      return "Total Ecosystem rewards";
    case "leaderboard-pado":
      return "Total Pado DeFi rewards";
    case "game":
      return "Total Game rewards";
    case "bugreport":
      return "Total Bug Report rewards";
    case "feedback":
      return "Total Feedback rewards";
    case "airdrop-gp":
    case "airdrop-alliance":
      return "Total Airdrop rewards";
    case "referral":
      return "Total Referral bonuses";
    case "earlybird":
      return "Early Bird (one-time)";
    case "creator-post":
    case "creators-appreciation":
      return "Total Creator rewards";
    default:
      return "Total bonuses";
  }
}
