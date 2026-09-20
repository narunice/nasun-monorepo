/**
 * Owner-scoped object fetching that follows pagination.
 *
 * getOwnedObjects returns one page (50 objects by default). Reading only the
 * first page makes "have I voted?" answer false for anyone holding more vote
 * proofs than that, and quietly under-reports participation.
 */

import { SuiClient, SuiObjectResponse } from "@mysten/sui/client";

const PAGE_SIZE = 50;

/** Bound the walk so a pathological wallet cannot spin the RPC forever. */
const MAX_PAGES = 20;

export interface OwnedObjectsResult {
  data: SuiObjectResponse[];
}

export async function fetchAllOwnedObjects(
  client: SuiClient,
  owner: string,
  structType: string
): Promise<OwnedObjectsResult> {
  const collected: SuiObjectResponse[] = [];
  let cursor: string | null = null;
  let truncated = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.getOwnedObjects({
      owner,
      cursor,
      limit: PAGE_SIZE,
      options: { showContent: true },
      filter: { StructType: structType },
    });

    collected.push(...response.data);

    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
    truncated = page === MAX_PAGES - 1;
  }

  // Stopping at the cap is the same under-report this module exists to prevent,
  // so it must not pass silently: past the cap a vote proof goes unseen, the
  // Vote button reappears, and a direct vote burns gas on an EDuplicateVote.
  if (truncated) {
    console.warn(
      `Owned ${structType} objects exceeded ${MAX_PAGES * PAGE_SIZE}; ` +
        `the list is truncated and "already voted" may read false.`
    );
  }

  return { data: collected };
}
