import type { BonusFeedResponse } from "@/services/ecosystemScoreApi";

// Mock celebration carousel data for screen-recording / demo purposes only.
// Activated by useBonusFeed when running in DEV mode AND the signed-in user
// is the admin account (which has no real bonus history). Never included in
// production bundles' code path because the gate requires import.meta.env.DEV.
export const MOCK_BONUS_FEED: BonusFeedResponse = {
  data: [
    {
      id: "mock-eco-w18",
      category: "ecosystem-bonus-leaderboard",
      activityType: "weekly-leaderboard",
      points: 250,
      awardedAt: "2026-05-04T00:15:00.000Z",
      metadata: {
        rank: 5,
        previousRank: 8,
        rankDelta: 3,
        weekId: "W18",
        totalParticipants: 2840,
      },
    },
    {
      id: "mock-pado-w18",
      category: "ecosystem-bonus-pado",
      activityType: "weekly-leaderboard",
      points: 400,
      awardedAt: "2026-05-04T00:20:00.000Z",
      metadata: {
        rank: 3,
        previousRank: 5,
        rankDelta: 2,
        weekId: "W18",
        totalParticipants: 1620,
      },
    },
    {
      id: "mock-eco-w17",
      category: "ecosystem-bonus-leaderboard",
      activityType: "weekly-leaderboard",
      points: 150,
      awardedAt: "2026-04-27T00:15:00.000Z",
      metadata: {
        rank: 12,
        previousRank: 17,
        rankDelta: 5,
        weekId: "W17",
        totalParticipants: 2710,
      },
    },
    {
      id: "mock-pado-w17",
      category: "ecosystem-bonus-pado",
      activityType: "weekly-leaderboard",
      points: 280,
      awardedAt: "2026-04-27T00:20:00.000Z",
      metadata: {
        rank: 7,
        previousRank: 6,
        rankDelta: -1,
        weekId: "W17",
        totalParticipants: 1554,
      },
    },
  ],
  cumulativeByCategory: {
    "ecosystem-bonus-leaderboard": 1820,
    "ecosystem-bonus-pado": 2850,
  },
  totalBonusAllTime: 4670,
};
