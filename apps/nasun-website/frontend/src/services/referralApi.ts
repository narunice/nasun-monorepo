/**
 * Referral System API Client
 *
 * Authenticated API - requires Cognito JWT token.
 * Calls Lambda endpoints at VITE_REFERRAL_API.
 */

const API_BASE = import.meta.env.VITE_REFERRAL_API;

export class ReferralApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ReferralApiError";
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface ReferralStats {
  referralCode: string | null;
  totalReferrals: number;
  activatedCount: number;
  pendingCount: number;
  referrals: Array<{
    status: string;
    appliedAt: string;
    activatedAt: string | null;
  }>;
  referredBy: {
    referralCode: string;
    appliedAt: string;
    status: string;
  } | null;
  bonusStats: {
    totalBonusPoints: number;
  } | null;
}

/**
 * Get or generate referral code (lazy generation)
 */
export async function getMyReferralCode(
  token: string,
): Promise<{ referralCode: string }> {
  if (!API_BASE) throw new ReferralApiError("Referral API not configured");

  const res = await fetch(`${API_BASE}/referral/my-code`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Failed to get referral code: ${res.status}`,
      res.status,
      body.error,
      body,
    );
  }

  return res.json();
}

/**
 * Apply a referral code
 */
export async function applyReferralCode(
  token: string,
  referralCode: string,
): Promise<{ success: boolean }> {
  if (!API_BASE) throw new ReferralApiError("Referral API not configured");

  const res = await fetch(`${API_BASE}/referral/apply`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ referralCode }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Failed to apply referral code: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json();
}

/**
 * Get referral statistics and invitee list
 */
export async function getMyReferralStats(
  token: string,
): Promise<ReferralStats> {
  if (!API_BASE) throw new ReferralApiError("Referral API not configured");

  const res = await fetch(`${API_BASE}/referral/my-stats`, {
    headers: authHeaders(token),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Failed to get referral stats: ${res.status}`,
      res.status,
      body.error,
    );
  }

  return res.json();
}
