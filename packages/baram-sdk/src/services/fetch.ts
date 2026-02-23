/**
 * On-chain AER data fetching service.
 * Uses Sui RPC to query ExecutionReportCreated events and fetch AER objects.
 */

import { SuiClient } from '@mysten/sui/client';
import type { AERConfig } from '../config';
import type { AERRecord } from '../types/aer';
import type { PaginatedResult, QueryOptions } from '../types/filter';
import { parseAERFields } from './parse';
import { AERError, AERNotFoundError, RpcError } from '../errors';

interface EventJson {
  request_id?: string | number;
  record_id?: string;
}

interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

const MAX_QUERY_LIMIT = 200;

function parseCursor(raw: string): EventCursor {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.txDigest !== 'string' || typeof parsed?.eventSeq !== 'string') {
      throw new AERError('Invalid cursor format', 'INVALID_CURSOR');
    }
    return parsed as EventCursor;
  } catch (e) {
    if (e instanceof AERError) throw e;
    throw new AERError('Malformed cursor string', 'INVALID_CURSOR');
  }
}

/**
 * Fetch a single AER record by its on-chain object ID.
 */
export async function fetchAERObject(
  client: SuiClient,
  objectId: string,
): Promise<AERRecord> {
  try {
    const obj = await client.getObject({
      id: objectId,
      options: { showContent: true },
    });

    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new AERNotFoundError(objectId);
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    return parseAERFields(fields, objectId);
  } catch (error) {
    if (error instanceof AERNotFoundError) throw error;
    throw new RpcError('fetchAERObject', error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch multiple AER records by their on-chain object IDs (batch).
 */
export async function fetchAERObjects(
  client: SuiClient,
  objectIds: string[],
): Promise<AERRecord[]> {
  if (objectIds.length === 0) return [];

  try {
    const objects = await client.multiGetObjects({
      ids: objectIds,
      options: { showContent: true },
    });

    const records: AERRecord[] = [];
    for (const obj of objects) {
      if (obj.data?.content && obj.data.content.dataType === 'moveObject') {
        const fields = obj.data.content.fields as Record<string, unknown>;
        records.push(parseAERFields(fields, obj.data.objectId));
      }
    }
    return records;
  } catch (error) {
    throw new RpcError('fetchAERObjects', error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch AER record by request ID via ExecutionReportCreated event query.
 * Returns null if no AER exists for this request.
 */
export async function fetchAERByRequestId(
  client: SuiClient,
  config: AERConfig,
  requestId: number,
): Promise<AERRecord | null> {
  try {
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${config.aer.packageId}::aer::ExecutionReportCreated`,
      },
      limit: 50,
      order: 'descending',
    });

    const matchingEvent = events.data.find((event) => {
      const json = event.parsedJson as EventJson;
      return Number(json?.request_id) === requestId;
    });

    if (!matchingEvent) return null;

    const eventJson = matchingEvent.parsedJson as EventJson;
    const recordId = eventJson.record_id;
    if (!recordId) return null;

    return await fetchAERObject(client, recordId);
  } catch (error) {
    if (error instanceof AERNotFoundError) return null;
    if (error instanceof RpcError) throw error;
    throw new RpcError('fetchAERByRequestId', error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch recent AER events with cursor-based pagination.
 * Returns AERRecords with pagination metadata.
 */
export async function fetchRecentAEREvents(
  client: SuiClient,
  config: AERConfig,
  options: QueryOptions = {},
): Promise<PaginatedResult<AERRecord>> {
  const limit = Math.min(options.limit ?? 25, MAX_QUERY_LIMIT);
  const order = options.order ?? 'descending';

  try {
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${config.aer.packageId}::aer::ExecutionReportCreated`,
      },
      limit,
      order,
      cursor: options.cursor ? parseCursor(options.cursor) : undefined,
    });

    const recordIds = events.data
      .map((e) => (e.parsedJson as EventJson).record_id)
      .filter((id): id is string => !!id);

    const records = await fetchAERObjects(client, recordIds);

    return {
      data: records,
      hasNextPage: events.hasNextPage,
      nextCursor: events.nextCursor ? JSON.stringify(events.nextCursor) : null,
    };
  } catch (error) {
    if (error instanceof AERError) throw error;
    if (error instanceof RpcError) throw error;
    throw new RpcError('fetchRecentAEREvents', error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch all AER records for a specific address (by event field matching).
 * Scans events and filters by the specified role field.
 */
export async function fetchAERByAddress(
  client: SuiClient,
  config: AERConfig,
  address: string,
  role: 'initiator' | 'executor' | 'authorizer',
  options: QueryOptions = {},
): Promise<AERRecord[]> {
  const limit = options.limit ?? 50;
  const targetCount = limit;

  try {
    const result: AERRecord[] = [];
    let cursor = options.cursor ? parseCursor(options.cursor) : undefined;
    let scannedPages = 0;
    const maxPages = 10;

    while (result.length < targetCount && scannedPages < maxPages) {
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${config.aer.packageId}::aer::ExecutionReportCreated`,
        },
        limit: 50,
        order: options.order ?? 'descending',
        cursor,
      });

      if (events.data.length === 0) break;

      const recordIds = events.data
        .map((e) => (e.parsedJson as EventJson).record_id)
        .filter((id): id is string => !!id);

      const records = await fetchAERObjects(client, recordIds);
      const matching = records.filter((r) => r[role] === address);
      result.push(...matching);

      if (!events.hasNextPage) break;
      cursor = events.nextCursor;
      scannedPages++;
    }

    return result.slice(0, targetCount);
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError('fetchAERByAddress', error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch all AER records linked to a specific budget ID.
 */
export async function fetchAERByBudgetId(
  client: SuiClient,
  config: AERConfig,
  budgetId: string,
  options: QueryOptions = {},
): Promise<AERRecord[]> {
  const limit = options.limit ?? 50;

  try {
    const result: AERRecord[] = [];
    let cursor = options.cursor ? parseCursor(options.cursor) : undefined;
    let scannedPages = 0;
    const maxPages = 10;

    while (result.length < limit && scannedPages < maxPages) {
      const events = await client.queryEvents({
        query: {
          MoveEventType: `${config.aer.packageId}::aer::ExecutionReportCreated`,
        },
        limit: 50,
        order: options.order ?? 'descending',
        cursor,
      });

      if (events.data.length === 0) break;

      const recordIds = events.data
        .map((e) => (e.parsedJson as EventJson).record_id)
        .filter((id): id is string => !!id);

      const records = await fetchAERObjects(client, recordIds);
      const matching = records.filter((r) => r.budgetId === budgetId);
      result.push(...matching);

      if (!events.hasNextPage) break;
      cursor = events.nextCursor;
      scannedPages++;
    }

    return result.slice(0, limit);
  } catch (error) {
    if (error instanceof RpcError) throw error;
    throw new RpcError('fetchAERByBudgetId', error instanceof Error ? error : undefined);
  }
}
