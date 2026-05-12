/**
 * Referral System API Client
 *
 * Authenticated API - requires Cognito JWT token.
 * Calls Lambda endpoints at VITE_REFERRAL_API.
 */

const API_BASE = import.meta.env.VITE_REFERRAL_API;
const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

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

export interface RefereeRow {
  // No identifying info exposed to the referrer (no identityId, no
  // twitterHandle). They see only their own bonus pipeline state.
  // serial: stable chronological order (oldest=1), survives new signups.
  serial: number;
  twitterLinked: boolean;
  status: string;
  appliedAt: string;
  activatedAt: string | null;
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
  referees?: {
    items: RefereeRow[];
    nextCursor: string | null;
  };
  referredBy: {
    referralCode: string;
    appliedAt: string;
    status: string;
    activatedAt: string | null;
  } | null;
  declineInfo: {
    status: "DECLINED" | "APPEALED";
    reviewedAt: string;
    reviewerNote: string;
    retryAt: string;
    appealedAt?: string;
    appealText?: string;
    appealResolution?: "reversed" | "reconfirmed";
    appealResolvedAt?: string;
  } | null;
  bonusStats: {
    totalBonusPoints: number;
  } | null;
}

export type ReviewStatus = "pending" | "appealed" | "declined" | "activated";

export interface ReviewItem {
  serial: number;
  referredIdentityId: string;
  referrerIdentityId: string;
  twitterHandle: string | null;
  twitterLinked: boolean;
  referrerHandle: string | null;
  referralCode: string | null;
  appliedAt: string | null;
  activatedAt: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  appealedAt: string | null;
  appealText: string | null;
  appealResolution: "reversed" | "reconfirmed" | null;
  appealResolvedAt: string | null;
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

/**
 * Fetch additional referees beyond the first page returned inline by my-stats.
 */
export async function getMoreReferees(
  token: string,
  cursor: string,
  limit = 20,
): Promise<{ items: RefereeRow[]; nextCursor: string | null }> {
  if (!API_BASE) throw new ReferralApiError("Referral API not configured");

  const url = new URL(`${API_BASE}/referral/my-referees`);
  url.searchParams.set("cursor", cursor);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Failed to fetch referees: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}

// ==================== Admin: Referral Review ====================

export async function listReferralReview(
  token: string,
  status: ReviewStatus = "pending",
): Promise<{ items: ReviewItem[]; total: number; status: string }> {
  if (!ADMIN_API_URL) throw new ReferralApiError("Admin API not configured");

  const url = new URL(`${ADMIN_API_URL}/admin/referral-review`);
  url.searchParams.set("status", status);

  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Failed to load review queue: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}

export async function resolveAppeal(
  token: string,
  identityId: string,
  action: "reverse" | "reconfirm",
  resolverNote?: string,
): Promise<{ resolved: number; action: string; identityId: string }> {
  if (!ADMIN_API_URL) throw new ReferralApiError("Admin API not configured");

  const res = await fetch(`${ADMIN_API_URL}/admin/referral-review/resolve-appeal`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ identityId, action, resolverNote }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Resolve appeal failed: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}

/**
 * Submit appeal for a DECLINED referral (one-shot).
 */
export async function submitAppeal(
  token: string,
  appealText: string,
): Promise<{ ok: boolean; appealedAt: string }> {
  if (!API_BASE) throw new ReferralApiError("Referral API not configured");

  const res = await fetch(`${API_BASE}/referral/appeal`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ appealText }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Appeal failed: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}

export async function approveReferral(
  token: string,
  identityId: string,
): Promise<{ activated: number; identityId: string }> {
  if (!ADMIN_API_URL) throw new ReferralApiError("Admin API not configured");

  const res = await fetch(`${ADMIN_API_URL}/admin/referral-review/approve`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ identityId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Approve failed: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}

export async function declineReferral(
  token: string,
  identityId: string,
  reviewerNote: string,
): Promise<{ declined: number; identityId: string }> {
  if (!ADMIN_API_URL) throw new ReferralApiError("Admin API not configured");

  const res = await fetch(`${ADMIN_API_URL}/admin/referral-review/decline`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ identityId, reviewerNote }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ReferralApiError(
      body.message || `Decline failed: ${res.status}`,
      res.status,
      body.error,
    );
  }
  return res.json();
}
