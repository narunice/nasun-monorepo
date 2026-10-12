/**
 * LP pool-scope audit — fail the build if an LP query over
 * gostop.bankroll_event forgets to scope to one BankrollPool object.
 *
 * Origin: 2026-10-12. `bankroll_event` spans two chains, because the v8 fresh
 * genesis on 2026-06-19 published a new BankrollPool object while the ledger
 * kept accumulating into the same table. Migration 008 had already fixed
 * divergence detection by keying its checkpoint on pool_object_id, but the LP
 * share aggregates still scanned from genesis and mixed the retired chain's
 * 11.3e12 shares into live figures against 6.8e12 on chain. Measured that day:
 * 377 LPs reported where 215 were real, a rank-1 share of 57.28% against a real
 * 54.28%, a wallet with no live position ranked fourth, and 162 wallets told by
 * /me/lp/position that they held shares no LPToken backs, so they could never
 * redeem.
 *
 * The defect was not that any single query was wrong in an interesting way. It
 * was that the era scope lives in a WHERE clause that a new aggregate can
 * simply omit, and nothing failed when it did. This test is that missing
 * failure: any SQL literal that aggregates LP share events must name
 * pool_object_id.
 *
 * Scope: SQL template literals in src/ that read gostop.bankroll_event and
 * mention a share-affecting LP event type. Matching on source text rather than
 * behaviour is deliberate; these queries need a live Postgres to execute, and
 * the regression this guards against is visible in the text.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = join(HERE, '..', '..', '..');
const SRC_DIR = join(BACKEND_ROOT, 'src');

/**
 * Files allowed to read LP share events without a pool_object_id predicate,
 * each with the reason it is sound without one. Adding an entry here is a
 * design decision that needs the same scrutiny as dropping the scope.
 */
const EXEMPT: Record<string, string> = {
  // The divergence detector is era-correct by anchoring, not by filtering: it
  // sums deltas over rows NEWER than a checkpoint whose own key IS the pool
  // object, and ids are assigned in insert order, so no row from the retired
  // chain can land above a checkpoint anchored after the reset. Adding a
  // pool_object_id predicate here would make the detector drop any row the
  // indexer wrote before it learned to stamp the column, and report that gap
  // as chain divergence. This is the one signal data_quality depends on, so it
  // keeps the design migration 008 chose for it.
  'src/indexer/shares-checkpoint.ts':
    'era-correct via checkpoint anchoring; see migration 008',
  // The indexer writes these rows rather than aggregating them, and it is what
  // stamps pool_object_id in the first place, so there is no era to confuse.
  // Its INSERT column list is audited by schema-audit.test.ts instead.
  'src/indexer/streams/bankroll-pool.ts':
    'writes and stamps these rows; INSERT audited by schema-audit',
};

const LP_EVENT_TYPES = ['liquidity_provided', 'liquidity_redeemed', 'shares_seeded'];

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip // and block comments so a prose mention cannot trip the audit. */
function stripTsComments(ts: string): string {
  return ts
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Template literal bodies. SQL here never nests a backtick, so a non-greedy
 * scan between backticks yields whole statements including their ${} holes.
 */
function templateLiterals(ts: string): string[] {
  return [...ts.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
}

interface Offender {
  file: string;
  snippet: string;
}

function findUnscopedLpQueries(): Offender[] {
  const offenders: Offender[] = [];
  for (const full of listTsFiles(SRC_DIR)) {
    const rel = relative(BACKEND_ROOT, full).split('\\').join('/');
    if (EXEMPT[rel]) continue;
    const src = stripTsComments(readFileSync(full, 'utf8'));
    for (const lit of templateLiterals(src)) {
      if (!lit.includes('gostop.bankroll_event')) continue;
      if (!LP_EVENT_TYPES.some((t) => lit.includes(`'${t}'`))) continue;
      if (lit.includes('pool_object_id')) continue;
      offenders.push({
        file: rel,
        snippet: lit.trim().replace(/\s+/g, ' ').slice(0, 160),
      });
    }
  }
  return offenders;
}

describe('LP queries over gostop.bankroll_event', () => {
  it('always scope to one BankrollPool object', () => {
    const offenders = findUnscopedLpQueries();
    expect(
      offenders,
      offenders.length === 0
        ? ''
        : `These SQL literals read LP share events without a pool_object_id ` +
          `predicate, so they would sum the chain retired by the v8 fresh ` +
          `genesis into live figures:\n` +
          offenders.map((o) => `  ${o.file}: ${o.snippet}`).join('\n'),
    ).toEqual([]);
  });

  it('audits the files that actually carry these queries', () => {
    // Guards the guard: if the literal scan silently stops matching (a helper
    // is renamed, the queries move behind a builder), this test fails rather
    // than passing vacuously on zero inspected queries.
    let inspected = 0;
    for (const full of listTsFiles(SRC_DIR)) {
      const rel = relative(BACKEND_ROOT, full).split('\\').join('/');
      if (EXEMPT[rel]) continue;
      const src = stripTsComments(readFileSync(full, 'utf8'));
      for (const lit of templateLiterals(src)) {
        if (!lit.includes('gostop.bankroll_event')) continue;
        if (!LP_EVENT_TYPES.some((t) => lit.includes(`'${t}'`))) continue;
        inspected++;
      }
    }
    // risk-metrics topLp5 (2), me/lp-position (2), lp.ts deposit lookup (1).
    expect(inspected).toBeGreaterThanOrEqual(5);
  });

  it('keeps every exemption documented', () => {
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(20);
    }
  });
});
