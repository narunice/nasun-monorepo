/**
 * Hidden Proposals Utility
 *
 * Read-only utility to get hidden proposal IDs from the Admin API.
 * Used by the public governance page to filter out hidden proposals.
 */

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

interface HiddenProposalsResponse {
  proposalIds: string[];
}

/**
 * Shared so the governance list and the vote history resolve one list. They
 * disagreeing on what is hidden is what let hidden proposals count toward
 * participation while never appearing in the list they were counted against.
 */
export const HIDDEN_PROPOSALS_QUERY_KEY = ["hiddenProposals"] as const;
export const HIDDEN_PROPOSALS_STALE_TIME = 30 * 1000;

/**
 * Fetch hidden proposal IDs from the Admin API.
 * This is a public endpoint that doesn't require authentication.
 * Throws on error so callers (e.g. React Query) can handle failure explicitly.
 */
export const fetchHiddenProposalIds = async (): Promise<string[]> => {
  const url = `${ADMIN_API_URL}/hidden-proposals`;
  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw Object.assign(
      new Error(`Hidden proposals API error: ${response.status}`),
      { status: response.status }
    );
  }

  const data: HiddenProposalsResponse = await response.json();
  return data.proposalIds;
};
