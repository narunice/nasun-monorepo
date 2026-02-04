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
 * Fetch hidden proposal IDs from the Admin API.
 * This is a public endpoint that doesn't require authentication.
 * Returns an empty array on error.
 */
export const fetchHiddenProposalIds = async (): Promise<string[]> => {
  try {
    const url = `${ADMIN_API_URL}/hidden-proposals`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      console.warn("[fetchHiddenProposalIds] API returned error:", response.status);
      return [];
    }

    const data: HiddenProposalsResponse = await response.json();
    return data.proposalIds;
  } catch (error) {
    console.error("[fetchHiddenProposalIds] Failed to fetch:", error);
    return [];
  }
};
