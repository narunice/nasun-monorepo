/**
 * In-memory AER record filter engine.
 *
 * Sui RPC only supports event-type-level filtering, so field-level
 * filtering must be done in-memory after fetching.
 * All filter fields combine with AND logic.
 */

import type { AERRecord } from '../types/aer';
import type { AERFilter } from '../types/filter';

type Predicate = (r: AERRecord) => boolean;

function buildPredicates(filter: AERFilter): Predicate[] {
  const predicates: Predicate[] = [];

  // Address filters
  if (filter.initiator) {
    const addr = filter.initiator;
    predicates.push((r) => r.initiator === addr);
  }
  if (filter.executor) {
    const addr = filter.executor;
    predicates.push((r) => r.executor === addr);
  }
  if (filter.authorizer) {
    const addr = filter.authorizer;
    predicates.push((r) => r.authorizer === addr);
  }

  // Budget filters
  if (filter.budgetId) {
    const id = filter.budgetId;
    predicates.push((r) => r.budgetId === id);
  }
  if (filter.hasBudget === true) {
    predicates.push((r) => r.budgetId !== null);
  } else if (filter.hasBudget === false) {
    predicates.push((r) => r.budgetId === null);
  }

  // Model filters
  if (filter.modelName) {
    const name = filter.modelName;
    predicates.push((r) => r.modelName === name);
  }
  if (filter.modelNames && filter.modelNames.length > 0) {
    const names = new Set(filter.modelNames);
    predicates.push((r) => names.has(r.modelName));
  }

  // Tier / trust filters
  if (filter.minTier !== undefined) {
    const min = filter.minTier;
    predicates.push((r) => r.executorTier >= min);
  }
  if (filter.teeVerified !== undefined) {
    const expected = filter.teeVerified;
    predicates.push((r) => r.teeVerified === expected);
  }

  // Status filter
  if (filter.status !== undefined) {
    const expected = filter.status;
    predicates.push((r) => r.status === expected);
  }

  // Time range
  if (filter.settledAfter !== undefined) {
    const after = filter.settledAfter;
    predicates.push((r) => r.settledAt >= after);
  }
  if (filter.settledBefore !== undefined) {
    const before = filter.settledBefore;
    predicates.push((r) => r.settledAt <= before);
  }

  // Payment range
  if (filter.minPayment !== undefined) {
    const min = filter.minPayment;
    predicates.push((r) => r.paymentAmount >= min);
  }
  if (filter.maxPayment !== undefined) {
    const max = filter.maxPayment;
    predicates.push((r) => r.paymentAmount <= max);
  }
  if (filter.paymentToken !== undefined) {
    const token = filter.paymentToken;
    predicates.push((r) => r.paymentToken === token);
  }

  // Chain filters
  if (filter.hasTriggeredBy === true) {
    predicates.push((r) => r.triggeredBy !== null);
  } else if (filter.hasTriggeredBy === false) {
    predicates.push((r) => r.triggeredBy === null);
  }

  return predicates;
}

/**
 * Apply filter criteria to an array of AERRecords.
 * Returns filtered results respecting the optional limit.
 */
export function applyFilter(records: AERRecord[], filter: AERFilter): AERRecord[] {
  const predicates = buildPredicates(filter);

  if (predicates.length === 0) {
    return filter.limit ? records.slice(0, filter.limit) : records;
  }

  const result: AERRecord[] = [];
  const limit = filter.limit ?? Infinity;

  for (const record of records) {
    if (result.length >= limit) break;
    if (predicates.every((p) => p(record))) {
      result.push(record);
    }
  }

  return result;
}
