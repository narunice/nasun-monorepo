export type Tier = 1 | 2 | 3;

export interface SubScores {
  staking: number;
  lp: number;
  tx: number;
  diversity: number;
  nft: number;
}

export interface TierBenefits {
  fee_discount_bps: number;
  staking_multiplier_bps: number;
  lp_yield_multiplier_bps: number;
  inference_subsidy_bps: number;
  gostop_max_bet_usdc_micro: number;
  gostop_max_bet_usd: number;
  can_create_vault: boolean;
}

export type SubScoreWindowKind = 'sliding' | 'current_state';

export interface SubScoreWindow {
  kind: SubScoreWindowKind;
  days?: number;
}

export interface NsiFormula {
  version: string;
  weights: {
    staking: number;
    lp: number;
    tx: number;
    diversity: number;
    nft: number;
  };
  windows: {
    staking: SubScoreWindow;
    lp: SubScoreWindow;
    tx: SubScoreWindow;
    diversity: SubScoreWindow;
    nft: SubScoreWindow;
  };
}

/**
 * Response shape for `GET /api/v1/standing/by-address/:address`.
 *
 * Public-by-design: no auth, IP rate-limited. Wallet enumeration is
 * acceptable because tier is a coarse public signal also pushed to on-chain
 * `nasun_tier::TierRegistry`. See `standing.ts` header for full threat model.
 */
export interface PublicStandingResponse {
  tier: Tier;
  nsi_score: number;
  next_threshold: number | null;
  benefits: TierBenefits;
  has_gp: boolean;
  computed_at: string | null;
}

/**
 * Response shape for `GET /api/v1/standing/me` (Phase 2 — zkLogin/Cognito).
 *
 * Self-only: extends public response with behavioural breakdown. `sub_scores`
 * reveals user activity pattern across categories and must not leak via the
 * public endpoint.
 */
export interface PrivateStandingResponse extends PublicStandingResponse {
  sub_scores: SubScores;
  max_seen_tier: Tier;
  previous_tier: Tier | 0 | null;
  first_computed_at: string;
}
