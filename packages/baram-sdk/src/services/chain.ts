/**
 * Decision chain traversal - trace linked AER records via triggeredBy/triggeredAction.
 * Supports both backward (to parent) and forward (to children) traversal.
 */

import { SuiClient } from '@mysten/sui/client';
import type { AERConfig } from '../config';
import type { AERRecord } from '../types/aer';
import { ChainDepthExceededError } from '../errors';
import { fetchAERObject, fetchRecentAEREvents } from './fetch';

const DEFAULT_MAX_DEPTH = 10;

/**
 * Trace the decision chain backward from a given AER record.
 * Follows triggeredBy links until reaching the root or maxDepth.
 * Returns records in order from root → target (oldest first).
 */
export async function traceChainBackward(
  client: SuiClient,
  _config: AERConfig,
  objectId: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<AERRecord[]> {
  const chain: AERRecord[] = [];
  const visited = new Set<string>();
  let currentId: string | null = objectId;

  while (currentId && chain.length <= maxDepth) {
    if (visited.has(currentId)) break; // circular reference guard
    visited.add(currentId);

    const record = await fetchAERObject(client, currentId);
    chain.push(record);

    currentId = record.triggeredBy;
  }

  if (chain.length > maxDepth) {
    throw new ChainDepthExceededError(maxDepth);
  }

  // Reverse so root is first
  return chain.reverse();
}

/**
 * Trace the decision chain forward from a given AER record.
 * Scans events to find records whose triggeredBy points to the given object.
 * Returns records in order from target → latest child (oldest first).
 *
 * Note: Forward traversal is more expensive as there's no on-chain reverse index.
 * It requires scanning events to find children.
 */
export async function traceChainForward(
  client: SuiClient,
  config: AERConfig,
  objectId: string,
  maxDepth: number = DEFAULT_MAX_DEPTH,
): Promise<AERRecord[]> {
  const chain: AERRecord[] = [];
  const visited = new Set<string>();
  let currentIds = [objectId];

  // Fetch the starting record
  const startRecord = await fetchAERObject(client, objectId);
  chain.push(startRecord);
  visited.add(objectId);

  let depth = 0;

  while (currentIds.length > 0 && depth < maxDepth) {
    const children = await findChildRecords(client, config, currentIds, visited);
    if (children.length === 0) break;

    for (const child of children) {
      visited.add(child.objectId);
      chain.push(child);
    }

    currentIds = children.map((c) => c.objectId);
    depth++;
  }

  if (depth >= maxDepth && currentIds.length > 0) {
    throw new ChainDepthExceededError(maxDepth);
  }

  return chain;
}

/**
 * Scan recent events to find AER records whose triggeredBy matches any of the parent IDs.
 */
async function findChildRecords(
  client: SuiClient,
  config: AERConfig,
  parentIds: string[],
  visited: Set<string>,
): Promise<AERRecord[]> {
  const parentSet = new Set(parentIds);
  const children: AERRecord[] = [];
  let cursor: string | undefined;
  let scannedPages = 0;
  const maxPages = 5;

  while (scannedPages < maxPages) {
    const result = await fetchRecentAEREvents(client, config, {
      limit: 50,
      cursor,
      order: 'descending',
    });

    for (const record of result.data) {
      if (
        record.triggeredBy &&
        parentSet.has(record.triggeredBy) &&
        !visited.has(record.objectId)
      ) {
        children.push(record);
      }
    }

    if (!result.hasNextPage || !result.nextCursor) break;
    cursor = result.nextCursor;
    scannedPages++;
  }

  return children;
}
