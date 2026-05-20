/**
 * Comprehensive e2e for the prediction features shipped in the last 3 days:
 *
 *   1. v5 fresh-publish + legacy dual-package dispatch (2026-05-20)
 *      - Discovery covers both originalIds
 *      - packageIdForMarketType() and adminCapForMarketType() map every market's
 *        on-chain type tag to v5 or legacy without throwing
 *      - The legacy v3 unsafe mint_admin_cap_via_upgrade* now aborts with
 *        EAdminRecoveryDeprecated=24 (v4 patch) -- assert via devInspect.
 *
 *   2. Category surface (Space/Music/Sports/Weather/UFC + Crypto/Finance)
 *      - Frontend bucketCategory() drops only 'Other' onto the canonical list.
 *      - Every on-chain market category is either canonical or 'ufc'/'soccer'/
 *        etc. (which the frontend buckets as 'Other' -- flagged here).
 *      - UFC markets per 557f7f9c MUST use category='sports' to surface under
 *        the Sports tab. Any UFC market still tagged 'ufc' fails this check.
 *
 *   3. Auto-resolve dispatcher (4-category + UFC)
 *      - detectKind() routes each criteria text to the correct resolver.
 *      - Each resolver's parser accepts the criteria without throwing.
 *      - For pre-close markets, resolveXxx(now) returns {state:'pending'}.
 *      - For OPEN markets past close+deadline, resolver returns either resolved
 *        or pending -- both acceptable; the Move side will then enforce.
 *
 *   4. Move guards (state machine)
 *      - devInspect resolve_market(YES) with sender=market.resolver:
 *          - OPEN + now<close            -> EMarketNotClosed (1)
 *          - OPEN + now>resolve_deadline -> EResolveDeadlinePassed (12)
 *          - RESOLVED                    -> EMarketAlreadyResolved (2)
 *          - CANCELLED                   -> EMarketAlreadyCancelled (15)
 *      - devInspect cancel_expired_market with the same sender:
 *          - OPEN + now<=deadline        -> EMarketNotExpired (13)
 *          - RESOLVED                    -> EMarketAlreadyResolved (2)
 *          - CANCELLED                   -> EMarketAlreadyCancelled (15)
 *
 *   5. Auto-cancel path (keeper)
 *      - For any OPEN market past resolve_deadline+EXPIRE_GRACE_MS, the keeper
 *        is expected to call cancel_expired_market. devInspect should succeed.
 *
 *   6. LP coverage on open v5/legacy markets
 *      - All four orderbook sides (yes_bids/yes_asks/no_bids/no_asks) should
 *        carry depth -- the LP ladder must populate before the market opens.
 *
 *   7. Resolver address invariant
 *      - All markets share a single resolver address (the keeper); a mismatch
 *        means the keeper will silently skip that market.
 *
 *   8. State machine cross-field invariants
 *      - status=RESOLVED implies outcome=Some(bool); status!=RESOLVED implies
 *        outcome=None. status=OPEN implies close_time and resolve_deadline > 0
 *        and resolve_deadline > close_time.
 *
 * Read-only. No PTB is signed. Single env var optional: NASUN_RPC_URL.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Agent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 8000 } }));

// devnet-config is not in bots' deps; load devnet-ids.json directly.
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const idsPath = resolvePath(__dirname, '../../../../packages/devnet-config/devnet-ids.json');
const ids = JSON.parse(readFileSync(idsPath, 'utf8')) as {
  prediction: { packageId: string; originalPackageId?: string; adminCap: string };
  prediction_legacy?: {
    packageId: string;
    originalPackageId: string;
    adminCap: string;
    upgradeCap: string;
    cutoverDate?: string;
  };
};
const PREDICTION = {
  packageId: ids.prediction.packageId,
  originalPackageId: ids.prediction.originalPackageId ?? ids.prediction.packageId,
  adminCap: ids.prediction.adminCap,
};
const PREDICTION_LEGACY = ids.prediction_legacy ?? null;
const PREDICTION_ORIGINAL_IDS: string[] =
  PREDICTION_LEGACY && PREDICTION_LEGACY.originalPackageId !== PREDICTION.originalPackageId
    ? [PREDICTION.originalPackageId, PREDICTION_LEGACY.originalPackageId]
    : [PREDICTION.originalPackageId];

function packageIdForMarketType(marketType: string): string {
  if (marketType.startsWith(`${PREDICTION.originalPackageId}::`)) return PREDICTION.packageId;
  if (PREDICTION_LEGACY && marketType.startsWith(`${PREDICTION_LEGACY.originalPackageId}::`))
    return PREDICTION_LEGACY.packageId;
  throw new Error(`unknown prediction market origin: ${marketType}`);
}
function adminCapForMarketType(marketType: string): string {
  if (marketType.startsWith(`${PREDICTION.originalPackageId}::`)) return PREDICTION.adminCap;
  if (PREDICTION_LEGACY && marketType.startsWith(`${PREDICTION_LEGACY.originalPackageId}::`))
    return PREDICTION_LEGACY.adminCap;
  throw new Error(`unknown prediction market origin: ${marketType}`);
}

import { discoverMarketIds } from '../lib/prediction-market-discovery.js';
import { EXPIRE_GRACE_MS, detectKind, type ResolverKind, type ResolveResult } from '../lib/resolvers/types.js';
import { parseSpaceCriteria, resolveSpace, SpaceParseError, _clearSpaceCaches } from '../lib/resolvers/space.js';
import { parseMusicCriteria, resolveMusic, MusicParseError } from '../lib/resolvers/music.js';
import { parseSportsCriteria, resolveSports, SportsParseError, _clearSportsCaches } from '../lib/resolvers/sports.js';
import { parseWeatherCriteria, resolveWeather, WeatherParseError, _clearWeatherCaches } from '../lib/resolvers/weather.js';
import { parseUfcCriteria, resolveUfc, UfcParseError, _clearUfcCaches } from '../lib/resolvers/ufc.js';
import { parseResolutionCriteria } from '../lib/prediction-criteria.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) {
  console.error('Refusing to run against mainnet. Aborting.');
  process.exit(1);
}
const CLOCK_ID = '0x6';
const STATUS_OPEN = 0;
const STATUS_RESOLVED = 2;
const STATUS_CANCELLED = 3;

const MOVE_ABORT_CODE = {
  EMarketNotClosed: 1,
  EMarketAlreadyResolved: 2,
  ENotResolver: 3,
  EResolveDeadlinePassed: 12,
  EMarketNotExpired: 13,
  EMarketAlreadyCancelled: 15,
  EAdminRecoveryDeprecated: 24,
} as const;

// Frontend bucketCategory mirror (must stay in sync with
// apps/pado/frontend/src/features/prediction/hooks/usePredictionFilters.ts).
const FRONTEND_CANONICAL = new Set(['crypto', 'space', 'music', 'sports', 'weather', 'finance']);

function bucketCategoryUiSurface(raw: string): 'Other' | string {
  const lower = raw.toLowerCase();
  if (FRONTEND_CANONICAL.has(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return 'Other';
}

_clearSpaceCaches();
_clearSportsCaches();
_clearWeatherCaches();
_clearUfcCaches();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MarketSnapshot {
  id: string;
  type: string;                  // full type tag, e.g. "0x...::prediction_market::Market"
  status: number;
  category: string;
  question: string;
  closeTime: number;
  resolveDeadline: number;
  resolver: string;
  resolutionCriteria: string;
  resolutionSource: string;
  outcomePresent: boolean;
  orderbook: { yb: number; ya: number; nb: number; na: number };
}

interface CheckResult {
  ok: boolean;
  detail?: string;
}

interface MarketReport {
  marketId: string;
  packageHint: 'v5' | 'legacy' | 'unknown';
  category: string;
  uiCategory: string;
  kind: ResolverKind | null;
  status: string;
  closeInH: string;
  deadlineInH: string;
  checks: Record<string, CheckResult>;
}

function statusLabel(s: number): string {
  if (s === STATUS_OPEN) return 'OPEN';
  if (s === STATUS_RESOLVED) return 'RESOLVED';
  if (s === STATUS_CANCELLED) return 'CANCELLED';
  return `UNK(${s})`;
}

function abortCodeOf(err: string): number | null {
  // Real format (devnet 2026-05-20):
  //   MoveAbort(MoveLocation { module: ModuleId { address: 0x..., name:
  //     Identifier("...") }, function: N, instruction: N, function_name:
  //     Some("...") }, CODE) in command N
  // The MoveLocation struct contains commas, so anchor on the closing brace
  // before the code.
  const m = /MoveAbort\(.*?\}\s*,\s*(\d+)\)/.exec(err);
  return m ? Number(m[1]) : null;
}

async function devInspect(
  client: SuiClient,
  sender: string,
  build: (tx: Transaction) => void,
): Promise<{ ok: boolean; abortCode: number | null; raw: string }> {
  const tx = new Transaction();
  build(tx);
  tx.setSender(sender);
  tx.setGasBudget(100_000_000);
  try {
    const r = await client.devInspectTransactionBlock({ sender, transactionBlock: tx });
    if (r.effects?.status?.status === 'success') return { ok: true, abortCode: null, raw: 'success' };
    const raw = r.effects?.status?.error ?? '?';
    return { ok: false, abortCode: abortCodeOf(raw), raw };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, abortCode: abortCodeOf(raw), raw };
  }
}

async function fetchSnapshot(client: SuiClient, id: string): Promise<MarketSnapshot | null> {
  const obj = await client.getObject({ id, options: { showContent: true, showType: true } });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
  const type = obj.data.type ?? obj.data.content.type ?? '';
  const fields = obj.data.content.fields as Record<string, unknown>;

  const sideCounts: { yb: number; ya: number; nb: number; na: number } = { yb: 0, ya: 0, nb: 0, na: 0 };
  const sideKeys = [
    ['yes_bids', 'yb'],
    ['yes_asks', 'ya'],
    ['no_bids', 'nb'],
    ['no_asks', 'na'],
  ] as const;
  for (const [key, short] of sideKeys) {
    const tblId = ((fields as Record<string, { fields?: { id?: { id?: string } } }>)[key])?.fields?.id?.id;
    if (tblId) {
      try {
        const dfs = await client.getDynamicFields({ parentId: tblId, limit: 50 });
        sideCounts[short] = dfs.data.length;
      } catch {
        sideCounts[short] = -1; // probe failed
      }
    }
  }

  return {
    id,
    type,
    status: Number(fields.status ?? 0),
    category: String(fields.category ?? ''),
    question: String(fields.question ?? ''),
    closeTime: Number(fields.close_time ?? 0),
    resolveDeadline: Number(fields.resolve_deadline ?? 0),
    resolver: String(fields.resolver ?? ''),
    resolutionCriteria: String(fields.resolution_criteria ?? ''),
    resolutionSource: String(fields.resolution_source ?? ''),
    // SuiClient normalizes Option<bool> to bool | null (not the raw vec form).
    outcomePresent: fields.outcome !== null && fields.outcome !== undefined,
    orderbook: sideCounts,
  };
}

function classifyPackage(type: string): 'v5' | 'legacy' | 'unknown' {
  if (type.startsWith(`${PREDICTION.originalPackageId}::`)) return 'v5';
  if (PREDICTION_LEGACY && type.startsWith(`${PREDICTION_LEGACY.originalPackageId}::`)) return 'legacy';
  return 'unknown';
}

async function runResolver(text: string, now: number): Promise<{ kind: ResolverKind | null; result: ResolveResult | { state: 'error'; reason: string } }> {
  const kind = detectKind(text);
  try {
    if (kind === 'space')   return { kind, result: await resolveSpace(parseSpaceCriteria(text), now) };
    if (kind === 'music')   return { kind, result: await resolveMusic(parseMusicCriteria(text), now) };
    if (kind === 'sports')  return { kind, result: await resolveSports(parseSportsCriteria(text), now) };
    if (kind === 'weather') return { kind, result: await resolveWeather(parseWeatherCriteria(text), now) };
    if (kind === 'ufc')     return { kind, result: await resolveUfc(parseUfcCriteria(text), now) };
    // Legacy crypto/stock path: only parser exercised here (network calls require
    // external APIs that may rate-limit). detectKind returns null but the legacy
    // parser still classifies by Source URL host.
    const legacy = parseResolutionCriteria(text);
    if (legacy) {
      return {
        kind: legacy.kind === 'stock' ? 'stock' : 'crypto',
        result: { state: 'pending', reason: `legacy parser ok (kind=${legacy.kind}, symbol=${legacy.symbol})` },
      };
    }
    return { kind: null, result: { state: 'pending', reason: 'no Kind: line and legacy parser declined' } };
  } catch (err) {
    const reason = err instanceof Error
      ? `${err.constructor.name}: ${err.message}`
      : String(err);
    return { kind, result: { state: 'error', reason } };
  }
}

// ---------------------------------------------------------------------------
// Per-market checks
// ---------------------------------------------------------------------------

async function checkMarket(client: SuiClient, marketId: string, now: number): Promise<MarketReport | null> {
  const m = await fetchSnapshot(client, marketId);
  if (!m) return null;

  const report: MarketReport = {
    marketId,
    packageHint: classifyPackage(m.type),
    category: m.category,
    uiCategory: bucketCategoryUiSurface(m.category),
    kind: null,
    status: statusLabel(m.status),
    closeInH: ((m.closeTime - now) / 3600_000).toFixed(1),
    deadlineInH: ((m.resolveDeadline - now) / 3600_000).toFixed(1),
    checks: {},
  };

  // -- (1) dual-package dispatch -------------------------------------------
  // packageIdForMarketType must not throw and must return v5 or legacy id.
  try {
    const dispatchedPkg = packageIdForMarketType(m.type);
    const dispatchedAdm = adminCapForMarketType(m.type);
    const expectPkg = report.packageHint === 'v5' ? PREDICTION.packageId : PREDICTION_LEGACY?.packageId;
    const expectAdm = report.packageHint === 'v5' ? PREDICTION.adminCap   : PREDICTION_LEGACY?.adminCap;
    report.checks['dispatch.package'] = dispatchedPkg === expectPkg
      ? { ok: true }
      : { ok: false, detail: `got ${dispatchedPkg.slice(0, 12)} expected ${(expectPkg ?? '').slice(0, 12)}` };
    report.checks['dispatch.adminCap'] = dispatchedAdm === expectAdm
      ? { ok: true }
      : { ok: false, detail: `got ${dispatchedAdm.slice(0, 12)} expected ${(expectAdm ?? '').slice(0, 12)}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    report.checks['dispatch.package'] = { ok: false, detail: `throw: ${msg.slice(0, 80)}` };
    report.checks['dispatch.adminCap'] = { ok: false, detail: 'skipped (package dispatch threw)' };
  }

  // -- (2) category surface ------------------------------------------------
  // UFC markets must use category='sports' (the 557f7f9c fix). Skip the check
  // for CANCELLED markets -- those are the reissue originals that were
  // intentionally cancelled, not user-visible.
  const isUfcByQuestion = /UFC|🥊/i.test(m.question) ||
    /Provider:\s*espn/i.test(m.resolutionCriteria);
  if (isUfcByQuestion && m.status === STATUS_OPEN) {
    report.checks['category.ufcAsSports'] = m.category === 'sports'
      ? { ok: true }
      : { ok: false, detail: `UFC market category='${m.category}' -- frontend hides under Other` };
  }
  // Only flag user-visible markets (OPEN or RESOLVED). CANCELLED markets are
  // not shown in the Active tab so category drift doesn't matter to users.
  if (m.status !== STATUS_CANCELLED) {
    report.checks['category.bucketingSurfaces'] = report.uiCategory !== 'Other'
      ? { ok: true }
      : { ok: false, detail: `category='${m.category}' falls into Other (hidden from canonical tabs)` };
  }

  // -- (3) resolver dispatch -----------------------------------------------
  const { kind, result } = await runResolver(m.resolutionCriteria, now);
  report.kind = kind;
  if (result.state === 'error') {
    report.checks['resolver.parse'] = { ok: false, detail: result.reason.slice(0, 100) };
  } else {
    report.checks['resolver.parse'] = { ok: true };
    // For pre-close markets, the resolver must return pending. After close,
    // it may return resolved or pending depending on external data.
    if (now < m.closeTime && result.state === 'resolved') {
      report.checks['resolver.preCloseReturnsPending'] = {
        ok: false,
        detail: `resolver returned resolved (${(result as { outcome: boolean }).outcome ? 'YES' : 'NO'}) before close_time`,
      };
    } else if (now < m.closeTime) {
      report.checks['resolver.preCloseReturnsPending'] = { ok: true };
    }
  }

  // -- (4) state-machine cross-field invariants ----------------------------
  if (m.status === STATUS_RESOLVED && !m.outcomePresent) {
    report.checks['state.resolvedHasOutcome'] = { ok: false, detail: 'status=RESOLVED but outcome=None' };
  } else if (m.status !== STATUS_RESOLVED && m.outcomePresent) {
    report.checks['state.resolvedHasOutcome'] = { ok: false, detail: `status=${report.status} but outcome=Some(...)` };
  } else {
    report.checks['state.resolvedHasOutcome'] = { ok: true };
  }
  report.checks['state.deadlineAfterClose'] = m.resolveDeadline > m.closeTime
    ? { ok: true }
    : { ok: false, detail: `deadline=${m.resolveDeadline} <= close=${m.closeTime}` };

  // -- (5) Move guards via devInspect --------------------------------------
  // For RESOLVED/CANCELLED markets, the package the moveCall targets must be
  // the one that created the market (dispatch above). For OPEN markets, the
  // same. So always use the dispatched packageId.
  let dispatchedPkg: string;
  try {
    dispatchedPkg = packageIdForMarketType(m.type);
  } catch {
    dispatchedPkg = PREDICTION.packageId; // fallback; downstream check will catch
  }

  const resolveProbe = await devInspect(client, m.resolver, (tx) => {
    tx.moveCall({
      target: `${dispatchedPkg}::prediction_market::resolve_market`,
      arguments: [tx.object(m.id), tx.pure.bool(true), tx.object(CLOCK_ID)],
    });
  });

  // Expected abort code depends on state.
  let expectedResolveAbort: number | 'any' = 'any';
  if (m.status === STATUS_RESOLVED) {
    expectedResolveAbort = MOVE_ABORT_CODE.EMarketAlreadyResolved;
  } else if (m.status === STATUS_CANCELLED) {
    expectedResolveAbort = MOVE_ABORT_CODE.EMarketAlreadyCancelled;
  } else if (now < m.closeTime) {
    expectedResolveAbort = MOVE_ABORT_CODE.EMarketNotClosed;
  } else if (now > m.resolveDeadline) {
    expectedResolveAbort = MOVE_ABORT_CODE.EResolveDeadlinePassed;
  } else {
    // OPEN, within [close, deadline]. resolve_market should succeed (when sender
    // is the resolver). devInspect doesn't mutate state, so this is safe.
    expectedResolveAbort = -1; // success
  }
  if (expectedResolveAbort === -1) {
    report.checks['moveGuard.resolve'] = resolveProbe.ok
      ? { ok: true }
      : { ok: false, detail: `expected success, got abort=${resolveProbe.abortCode ?? '?'} raw=${resolveProbe.raw.slice(0, 60)}` };
  } else {
    report.checks['moveGuard.resolve'] = resolveProbe.abortCode === expectedResolveAbort
      ? { ok: true }
      : { ok: false, detail: `expected abort ${expectedResolveAbort}, got ${resolveProbe.abortCode ?? 'success/other'} (${resolveProbe.raw.slice(0, 60)})` };
  }

  const cancelProbe = await devInspect(client, m.resolver, (tx) => {
    tx.moveCall({
      target: `${dispatchedPkg}::prediction_market::cancel_expired_market`,
      arguments: [tx.object(m.id), tx.object(CLOCK_ID)],
    });
  });

  // cancel_expired_market asserts (in source order):
  //   1. now > resolve_deadline      -> EMarketNotExpired (13)
  //   2. status != RESOLVED          -> EMarketAlreadyResolved (2)
  //   3. status != CANCELLED         -> EMarketAlreadyCancelled (15)
  // Deadline check fires FIRST, so a RESOLVED or CANCELLED market that has
  // never passed its deadline still aborts with 13 (the deadline guard).
  let expectedCancelAbort: number | 'success' = 'success';
  if (now <= m.resolveDeadline) {
    expectedCancelAbort = MOVE_ABORT_CODE.EMarketNotExpired;
  } else if (m.status === STATUS_RESOLVED) {
    expectedCancelAbort = MOVE_ABORT_CODE.EMarketAlreadyResolved;
  } else if (m.status === STATUS_CANCELLED) {
    expectedCancelAbort = MOVE_ABORT_CODE.EMarketAlreadyCancelled;
  }
  if (expectedCancelAbort === 'success') {
    // Past deadline -- keeper should auto-cancel. devInspect succeeds.
    report.checks['moveGuard.cancelExpired'] = cancelProbe.ok
      ? { ok: true }
      : { ok: false, detail: `expected success, got abort=${cancelProbe.abortCode ?? '?'} raw=${cancelProbe.raw.slice(0, 60)}` };
    // Additionally flag: keeper should have already done this.
    if (m.status === STATUS_OPEN && now > m.resolveDeadline + EXPIRE_GRACE_MS) {
      report.checks['keeper.shouldHaveCancelled'] = {
        ok: false,
        detail: `OPEN past deadline+grace (${((now - m.resolveDeadline - EXPIRE_GRACE_MS) / 3600_000).toFixed(1)}h overdue) -- keeper should have called cancel_expired_market`,
      };
    }
  } else {
    report.checks['moveGuard.cancelExpired'] = cancelProbe.abortCode === expectedCancelAbort
      ? { ok: true }
      : { ok: false, detail: `expected abort ${expectedCancelAbort}, got ${cancelProbe.abortCode ?? 'success/other'} (${cancelProbe.raw.slice(0, 60)})` };
  }

  // -- (6) LP coverage (only for OPEN markets, pre-close)  -----------------
  // After close_time the LP bot intentionally pulls its quotes (resolution
  // imminent), so post-close depth=0 is expected, not a regression.
  if (m.status === STATUS_OPEN && now < m.closeTime) {
    const ob = m.orderbook;
    const allSidesHaveDepth = ob.yb > 0 && ob.ya > 0 && ob.nb > 0 && ob.na > 0;
    report.checks['lp.depth'] = allSidesHaveDepth
      ? { ok: true }
      : { ok: false, detail: `yb/ya/nb/na = ${ob.yb}/${ob.ya}/${ob.nb}/${ob.na}` };
  }

  return report;
}

// ---------------------------------------------------------------------------
// Aggregate / global checks
// ---------------------------------------------------------------------------

async function checkAdminRecoveryDeprecation(client: SuiClient): Promise<CheckResult> {
  // The v4 patch replaced both mint_admin_cap_via_upgrade* bodies with
  // `abort EAdminRecoveryDeprecated` (24). The function lives on the legacy
  // package (v4 == latest legacy publish). devInspect with ANY upgrade cap
  // argument should abort with 24 before reaching the body's logic.
  //
  // We use the legacy UpgradeCap that we know exists. The sender doesn't
  // matter -- the abort is unconditional.
  if (!PREDICTION_LEGACY) return { ok: true, detail: 'no legacy package (skipped)' };
  const upgradeCap = PREDICTION_LEGACY.upgradeCap;
  // Use a known address as sender (admin from any market). devInspect doesn't
  // need a real signer.
  const dummySender = '0x0000000000000000000000000000000000000000000000000000000000000001';
  const probe = await devInspect(client, dummySender, (tx) => {
    tx.moveCall({
      target: `${PREDICTION_LEGACY.packageId}::prediction_market::mint_admin_cap_via_upgrade_entry`,
      arguments: [tx.object(upgradeCap)],
    });
  });
  if (probe.abortCode === MOVE_ABORT_CODE.EAdminRecoveryDeprecated) {
    return { ok: true };
  }
  if (probe.ok) {
    return { ok: false, detail: `SECURITY: mint_admin_cap_via_upgrade_entry succeeded (expected abort 24)` };
  }
  return {
    ok: false,
    detail: `expected abort 24, got ${probe.abortCode ?? 'other'}: ${probe.raw.slice(0, 100)}`,
  };
}

function checkResolverAddressConsistency(reports: MarketReport[], allSnapshots: Map<string, MarketSnapshot>): CheckResult {
  const resolvers = new Set<string>();
  for (const r of reports) {
    const s = allSnapshots.get(r.marketId);
    if (s) resolvers.add(s.resolver);
  }
  if (resolvers.size === 0) return { ok: true, detail: 'no markets' };
  if (resolvers.size === 1) return { ok: true };
  return {
    ok: false,
    detail: `multiple resolver addresses on chain: ${[...resolvers].map(r => r.slice(0, 12)).join(', ')}`,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const client = new SuiClient({ url: RPC_URL });
  const now = Date.now();

  console.log('=== prediction features e2e ===');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`now: ${new Date(now).toISOString()}`);
  console.log(`v5 originalId:     ${PREDICTION.originalPackageId}`);
  console.log(`legacy originalId: ${PREDICTION_LEGACY?.originalPackageId ?? '(absent)'}`);
  console.log('');

  // (G1) Admin recovery deprecation guard (v4) -- run once, not per market.
  console.log('[G1] mint_admin_cap_via_upgrade_entry deprecation guard...');
  const adminRecoveryCheck = await checkAdminRecoveryDeprecation(client);
  console.log(adminRecoveryCheck.ok
    ? '     OK -- abort EAdminRecoveryDeprecated(24)'
    : `     FAIL -- ${adminRecoveryCheck.detail}`);
  console.log('');

  // (D1) Dual-package discovery.
  console.log('[D1] dual-package MarketCreated discovery...');
  const ids = await discoverMarketIds(client, [...PREDICTION_ORIGINAL_IDS]);
  console.log(`     discovered ${ids.length} markets across ${PREDICTION_ORIGINAL_IDS.length} originalId(s)`);

  // Per-market sweep.
  const reports: MarketReport[] = [];
  const snapshots = new Map<string, MarketSnapshot>();

  console.log('');
  console.log('[M] per-market checks (this may take 1-3 min for full set)...');
  // Limit concurrency to keep RPC happy on devnet.
  const POOL = 4;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const idx = cursor++;
      const id = ids[idx];
      try {
        const snap = await fetchSnapshot(client, id);
        if (snap) snapshots.set(id, snap);
        const r = await checkMarket(client, id, now);
        if (r) reports.push(r);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`     [${idx + 1}/${ids.length}] ${id.slice(0, 10)} ERROR: ${msg}`);
      }
      if ((idx + 1) % 10 === 0) process.stderr.write(`     progress: ${idx + 1}/${ids.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: POOL }, worker));
  console.log(`     swept ${reports.length}/${ids.length} markets`);

  // Aggregate output --------------------------------------------------------
  console.log('\n=== per-market table ===');
  const headers = ['marketId', 'pkg', 'status', 'closeIn(h)', 'category->ui', 'kind', 'failures'];
  console.log(headers.join('\t'));
  const failuresByKey = new Map<string, number>();
  for (const r of reports) {
    const failed = Object.entries(r.checks).filter(([, c]) => !c.ok);
    for (const [k] of failed) {
      failuresByKey.set(k, (failuresByKey.get(k) ?? 0) + 1);
    }
    const failStr = failed.length === 0
      ? 'pass'
      : failed.map(([k, c]) => `${k}: ${c.detail ?? '?'}`).join(' | ');
    console.log([
      r.marketId.slice(0, 12),
      r.packageHint,
      r.status,
      r.closeInH,
      `${r.category}->${r.uiCategory}`,
      r.kind ?? 'none',
      failStr,
    ].join('\t'));
  }

  // -- (G2) global resolver-address invariant ------------------------------
  console.log('\n=== global checks ===');
  const resolverConsistency = checkResolverAddressConsistency(reports, snapshots);
  console.log(`[G2] resolver address consistency: ${resolverConsistency.ok ? 'OK' : `FAIL -- ${resolverConsistency.detail}`}`);

  // -- (G3) package distribution & frontend visibility ---------------------
  const byPkg = { v5: 0, legacy: 0, unknown: 0 };
  const uiHidden: { id: string; cat: string }[] = [];
  let openCount = 0;
  let resolvedCount = 0;
  let cancelledCount = 0;
  for (const r of reports) {
    byPkg[r.packageHint]++;
    if (r.uiCategory === 'Other') uiHidden.push({ id: r.marketId.slice(0, 12), cat: r.category });
    if (r.status === 'OPEN') openCount++;
    else if (r.status === 'RESOLVED') resolvedCount++;
    else if (r.status === 'CANCELLED') cancelledCount++;
  }
  console.log(`[G3] package mix: v5=${byPkg.v5}  legacy=${byPkg.legacy}  unknown=${byPkg.unknown}`);
  console.log(`     lifecycle:   OPEN=${openCount}  RESOLVED=${resolvedCount}  CANCELLED=${cancelledCount}`);
  console.log(`     ui-hidden (category->Other): ${uiHidden.length}`);
  if (uiHidden.length > 0 && uiHidden.length <= 10) {
    for (const h of uiHidden) console.log(`       ${h.id} category='${h.cat}'`);
  }

  // -- summary by check key ------------------------------------------------
  console.log('\n=== failure rollup ===');
  if (failuresByKey.size === 0) {
    console.log('all per-market checks passed.');
  } else {
    for (const [k, n] of [...failuresByKey.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}: ${n}/${reports.length} markets failed`);
    }
  }

  const anyFail =
    !adminRecoveryCheck.ok ||
    !resolverConsistency.ok ||
    byPkg.unknown > 0 ||
    failuresByKey.size > 0;
  console.log('');
  console.log(anyFail ? 'RESULT: FAILED' : 'RESULT: ALL PASS');
  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(2);
});
