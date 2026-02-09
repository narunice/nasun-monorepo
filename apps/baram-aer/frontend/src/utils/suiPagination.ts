/**
 * Sui dynamic field pagination utility
 *
 * Drains all pages from getDynamicFields(), which returns paginated results.
 * Reusable across any Sui Table/Bag query.
 */

import type { SuiClient } from '@mysten/sui/client';

export interface DynamicFieldEntry {
  name: { type: string; value: unknown };
  objectType: string;
  objectId: string;
}

/**
 * Fetch ALL pages of dynamic fields from a Sui Table/Bag.
 * getDynamicFields is paginated; this drains the cursor until hasNextPage is false.
 */
export async function fetchAllDynamicFields(
  client: SuiClient,
  parentId: string,
): Promise<DynamicFieldEntry[]> {
  const all: DynamicFieldEntry[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;

  while (hasNext) {
    const page = await client.getDynamicFields({
      parentId,
      ...(cursor ? { cursor } : {}),
    });
    all.push(...(page.data as DynamicFieldEntry[]));
    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }

  return all;
}
