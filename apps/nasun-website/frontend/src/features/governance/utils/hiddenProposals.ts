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
