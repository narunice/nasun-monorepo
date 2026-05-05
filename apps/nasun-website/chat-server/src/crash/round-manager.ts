import { randomInt, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { blake2b } from '@noble/hashes/blake2b';
import { bcs } from '@mysten/bcs';
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { multiplierAtBps, inverseMultiplierAt } from './math.js';
import type { RoundState, RecentRound, WsEvent, ResolvePlayerRow } from './types.js';
import { RESOLVE_RETRY_ATTEMPTS, RESOLVE_RETRY_DELAY_MS } from './constants.js';

// CRASH game id within bankroll_pool::GameResult events.
// Must match apps/gostop/devnet-ids.json crash.gameId.
const CRASH_GAME_ID = 4;

// Sui addresses are always 0x + 32-byte hex (64 chars) when emitted from Move
// events. A loose {1,64} regex would let truncated/malformed values reach the
// DB and silently break history lookups.
const SUI_ADDRESS_RE = /^0x[0-9a-f]{64}$/;

// Parse bankroll_pool::GameResult events from a resolve_round tx response into
// JSON-safe per-player history rows. Filters by game_id to avoid sibling games
// sharing the same pool (none today, but defensive). Caller catches any throw.
function parsePlayerResultsFromEvents(
  events: unknown[] | undefined,
): ResolvePlayerRow[] {
  if (!Array.isArray(events)) return [];
  const out: ResolvePlayerRow[] = [];
  for (const evRaw of events) {
    const ev = evRaw as { type?: string; parsedJson?: Record<string, unknown> } | null;
    if (!ev || typeof ev.type !== 'string') continue;
    if (!ev.type.endsWith('::bankroll_pool::GameResult')) continue;
    const d = ev.parsedJson ?? {};
    if (Number(d.game_id) !== CRASH_GAME_ID) continue;

    const player = String(d.player ?? '').toLowerCase();
    if (!SUI_ADDRESS_RE.test(player)) continue;

    const sessionRaw = d.session_id;
    let sessionIdHex = '';
    if (Array.isArray(sessionRaw)) {
      sessionIdHex = (sessionRaw as number[])
        .map((b) => (b & 0xff).toString(16).padStart(2, '0'))
        .join('');
    } else if (typeof sessionRaw === 'string') {
      sessionIdHex = sessionRaw.startsWith('0x') ? sessionRaw.slice(2) : sessionRaw;
    }

    out.push({
      player,
      betAmount: String(d.bet_amount ?? '0'),
      payout: String(d.payout ?? '0'),
      multiplierBps: Number(d.multiplier_bps ?? 0),
      timestampMs: Number(d.timestamp_ms ?? 0),
      sessionIdHex,
      betTx: null,
    });
  }
  return out;
}

// Fetch BetPlaced events for `roundId` from the crash module and return a
// map of player -> tx digest. Used to enrich resolve rows so the history UI
// can link both the user's place_bet tx and the keeper's resolve tx.
//
// Strategy: page descending from latest. The keeper just emitted RoundResolved
// for this round, so BetPlaced events for it are within recent history. We
// stop once a page yields zero matches AND we've seen at least one event with
// `round_id < target` (older), or we hit a hard page cap. Failures return an
// empty map; callers must tolerate missing digests.
async function fetchBetTxByPlayer(
  client: SuiClient,
  packageId: string,
  roundId: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const eventType = `${packageId}::crash::BetPlaced`;
  const PAGE_LIMIT = 50;
  const MAX_PAGES = 10;
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = null;
  let sawOlder = false;

  for (let i = 0; i < MAX_PAGES; i++) {
    let page;
    try {
      page = await client.queryEvents({
        query: { MoveEventType: eventType },
        order: 'descending',
        limit: PAGE_LIMIT,
        cursor: cursor ?? null,
      });
    } catch (err) {
      console.error('[Crash] queryEvents BetPlaced failed', { roundId, err: (err as Error).message });
      return out;
    }
    let matchedThisPage = 0;
    for (const ev of page.data) {
      const d = (ev.parsedJson ?? {}) as { round_id?: unknown; player?: unknown };
      const rid = Number(d.round_id);
      if (rid === roundId) {
        const player = String(d.player ?? '').toLowerCase();
        if (SUI_ADDRESS_RE.test(player) && !out.has(player)) {
          out.set(player, ev.id.txDigest);
          matchedThisPage++;
        }
      } else if (rid < roundId) {
        sawOlder = true;
      }
    }
    if (sawOlder && matchedThisPage === 0) break;
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

// Hardcoded BankrollPool + SUI clock (stable across Crash upgrades).
const BANKROLL_POOL = '0xf74e8c3c16ee077651f82459f350e96027c82319686395679d10f08ed0cd306d';
const SUI_CLOCK = '0x6';

// Must match Move INVERSE_SEARCH_TOP_BPS to keep the post-crash bound enforceable.
const CRASH_POINT_CAP_BPS = 26_650_000;

export interface RoundManagerConfig {
  rpcUrl: string;
  operatorPrivkey: string;
  saltDbPath: string;
  bettingWindowMs: number;
  roundIntervalMs: number;
  packageId: string;       // env-driven (allows future upgrade without code change)
  registryId: string;
}

interface InternalRoundState {
  state: RoundState;
  roundId: number | null;
  roundObjectId: string | null;
  commitHash: string | null;
  bettingEndsAt: number | null;
  flyingStartedAt: number | null;
  crashedAt: number | null;
  crashPointBps: number | null;
  recentRounds: RecentRound[];
  crashedAlreadyFired: boolean;
  stateVersion: number;
}

type BroadcastFn = (event: WsEvent) => void;

export class RoundManager {
  private db: Database.Database;
  private client: SuiClient;
  private kp: Ed25519Keypair;
  private config: RoundManagerConfig;
  private broadcast: BroadcastFn;
  private running = false;
  private draining = false;
  // Phase 1 scope: no participants list, no on-chain event subscription.
  // Each player's frontend tracks its own bet/cashout from tx results.
  private roundState: InternalRoundState;

  constructor(config: RoundManagerConfig, broadcast: BroadcastFn) {
    this.config = config;
    this.broadcast = broadcast;

    const { secretKey } = decodeSuiPrivateKey(config.operatorPrivkey);
    this.kp = Ed25519Keypair.fromSecretKey(secretKey);
    this.client = new SuiClient({ url: config.rpcUrl });

    // Ensure parent dir exists; fail-fast if path is unwritable.
    try {
      mkdirSync(dirname(config.saltDbPath), { recursive: true });
    } catch (err) {
      throw new Error(`Cannot create sqlite parent dir ${dirname(config.saltDbPath)}: ${(err as Error).message}`);
    }

    this.db = new Database(config.saltDbPath);
    // A-W2 / A-W5: file mode 0600 (deploy umask 077 보강용 명시적 설정)
    try { chmodSync(config.saltDbPath, 0o600); } catch {}
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crash_salts (
        round_id INTEGER PRIMARY KEY,
        crash_point_bps INTEGER NOT NULL,
        salt BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_resolved_created ON crash_salts(resolved, created_at);
    `);

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.db.prepare('DELETE FROM crash_salts WHERE resolved = 1 AND created_at < ?').run(cutoff);

    // Boot stateVersion from a wall-clock seed so reconnecting clients with stale cache
    // see a higher version and resync via /api/crash/current-round.
    this.roundState = {
      state: 'IDLE',
      roundId: null,
      roundObjectId: null,
      commitHash: null,
      bettingEndsAt: null,
      flyingStartedAt: null,
      crashedAt: null,
      crashPointBps: null,
      recentRounds: [],
      crashedAlreadyFired: false,
      stateVersion: Date.now(),
    };
  }

  getState(): InternalRoundState {
    return { ...this.roundState, recentRounds: [...this.roundState.recentRounds] };
  }

  /** Returns true if keeper started normally, false if boot-blocked (stale round with entries in registry). */
  async start(): Promise<boolean> {
    this.running = true;
    const verdict = await this.recover();
    if (verdict === 'block') {
      this.running = false;
      return false;
    }
    await this.runLoop();
    return true;
  }

  /// Boot-time recovery. Returns 'ok' to proceed with normal loop, 'block' to
  /// exit (parent will retry every 60s).
  /// - clean (registry empty): 'ok'
  /// - empty stuck round: auto operator_finalize_empty_stuck_round → 'ok'
  /// - entries>0 stuck round: 'block' (manual emergency_refund + admin_finalize)
  /// - RPC errors: 'block' (transient, parent retry recovers)
  private async recover(): Promise<'ok' | 'block'> {
    let currentId: string | null;
    try {
      currentId = await this.fetchCurrentRoundId();
    } catch (err) {
      console.error('[Crash] recover: registry fetch failed:', err);
      return 'block';
    }
    if (!currentId) {
      console.log('[Crash] Recover: clean start (no stuck round)');
      return 'ok';
    }

    let round: Awaited<ReturnType<RoundManager['fetchRoundScalars']>>;
    try {
      round = await this.fetchRoundScalars(currentId);
    } catch (err) {
      console.error('[Crash] recover: round fetch failed:', err);
      return 'block';
    }
    if (!round) {
      console.error(`[Crash] BOOT BLOCKED: registry points to non-existent round ${currentId}; manual intervention required`);
      return 'block';
    }

    // STATE_FLYING(=1): close_betting completed but resolve_round did not run
    // (PM2 reload, OOM kill, EC2 reboot mid-round). Salt was persisted to SQLite
    // before betting opened, so we can self-heal without manual intervention.
    if (round.state === 1) {
      return await this.recoverFlying(round);
    }

    if (round.entriesCount > 0) {
      console.error(`[Crash] BOOT BLOCKED: round ${round.roundId} has ${round.entriesCount} entries. Run emergency_refund_batch + admin_finalize.`);
      return 'block';
    }

    // Empty stuck round. Move's state/time guard rejects calls during an active
    // BETTING window, so keeper-side check is defensive only.
    try {
      await this.operatorFinalizeEmpty(round.objectId);
      console.warn(`[Crash] Recover: finalized empty stuck round ${round.roundId}`);
      return 'ok';
    } catch (err) {
      const msg = (err as Error).message;
      // EBettingNotEnded = 18: BETTING window still active. Block; next 60s parent
      // retry will catch the round after the window expires.
      if (msg.includes(', 18)') || msg.includes('EBettingNotEnded')) {
        console.warn(`[Crash] Recover: round ${round.roundId} still in active BETTING window; blocking for retry`);
        return 'block';
      }
      console.error('[Crash] Recover: finalize tx failed:', err);
      return 'block';
    }
  }

  /// Boot-time auto-recovery for a stuck FLYING round. Called only when on-chain
  /// state == STATE_FLYING. SQLite holds (crash_point_bps, salt) since start_round.
  /// 'ok' lets runLoop proceed, 'block' defers to manual ops.
  private async recoverFlying(round: {
    roundId: number;
    objectId: string;
    flyingStartedAt: number;
    commitHash: Buffer;
  }): Promise<'ok' | 'block'> {
    const saltRow = this.db.prepare(
      'SELECT salt, crash_point_bps FROM crash_salts WHERE round_id = ?'
    ).get(round.roundId) as { salt: Buffer | Uint8Array; crash_point_bps: number } | undefined;

    if (!saltRow) {
      console.error(
        `[Crash] BOOT BLOCKED: round ${round.roundId} FLYING but no salt in SQLite — manual emergency_refund_batch required`
      );
      return 'block';
    }

    const salt = Buffer.from(saltRow.salt);
    const bps = Number(saltRow.crash_point_bps);

    // commit_hash equality subsumes bps/salt sanity checks: any DB drift mutates
    // the local hash and fails this check before spending gas on a Move abort.
    const localHash = Buffer.from(this.computeCommitHash(bps, salt));
    if (!localHash.equals(round.commitHash)) {
      console.error(
        `[Crash] BOOT BLOCKED: round ${round.roundId} commit_hash mismatch ` +
        `(local=${localHash.toString('hex')} chain=${round.commitHash.toString('hex')}) — DB corruption suspected`
      );
      return 'block';
    }

    console.warn(`[Crash] Boot recovery: resolving round ${round.roundId}, bps=${bps}`);
    let digest: string;
    try {
      const res = await this.execResolveWithRetry(() => {
        const tx = new Transaction();
        tx.moveCall({
          target: `${this.config.packageId}::crash::resolve_round`,
          arguments: [
            tx.object(round.objectId),
            tx.pure.u64(bps),
            tx.pure.vector('u8', Array.from(salt)),
            tx.object(this.config.registryId),
            tx.object(BANKROLL_POOL),
            tx.object(SUI_CLOCK),
          ],
        });
        return tx;
      });
      digest = res.digest;
    } catch (err) {
      // Race: another process resolved between our state read and tx submit.
      // Use on-chain ground truth instead of error-string parsing — robust to
      // SDK format changes.
      const stillExists = await this.fetchRoundScalars(round.objectId).catch(() => null);
      if (!stillExists || stillExists.state !== 1) {
        console.warn(
          `[Crash] Boot recovery: round ${round.roundId} already resolved on-chain (race detected) — proceeding`
        );
        this.db.prepare('UPDATE crash_salts SET resolved = 1 WHERE round_id = ?').run(round.roundId);
        return 'ok';
      }
      console.error(`[Crash] Boot recovery: resolve_round failed for round ${round.roundId}:`, err);
      return 'block';
    }

    this.db.prepare('UPDATE crash_salts SET resolved = 1 WHERE round_id = ?').run(round.roundId);
    console.warn(`[Crash] Boot recovery: round ${round.roundId} resolved digest=${digest}`);
    return 'ok';
  }

  private async fetchCurrentRoundId(): Promise<string | null> {
    const reg = await this.client.getObject({
      id: this.config.registryId,
      options: { showContent: true },
    });
    const fields = (reg.data?.content as { fields?: { current_round_id?: unknown } })?.fields;
    const cri = fields?.current_round_id;
    if (typeof cri === 'string' && cri.length > 0) return cri;
    const vec1 = (cri as { vec?: unknown[] } | null)?.vec;
    if (Array.isArray(vec1) && vec1.length > 0 && typeof vec1[0] === 'string') return vec1[0] as string;
    const vec2 = (cri as { fields?: { vec?: unknown[] } } | null)?.fields?.vec;
    if (Array.isArray(vec2) && vec2.length > 0 && typeof vec2[0] === 'string') return vec2[0] as string;
    return null;
  }

  private async fetchRoundScalars(
    objectId: string,
  ): Promise<{
    roundId: number;
    objectId: string;
    state: number;
    entriesCount: number;
    bettingEndsAt: number;
    flyingStartedAt: number;
    commitHash: Buffer;
  } | null> {
    const obj = await this.client.getObject({ id: objectId, options: { showContent: true } });
    const fields = (obj.data?.content as { fields?: Record<string, unknown> })?.fields;
    if (!fields) return null;
    const entries = fields.entries;
    const commitArr = fields.commit_hash;
    const commitHash = Array.isArray(commitArr)
      ? Buffer.from(commitArr as number[])
      : Buffer.alloc(0);
    return {
      roundId: Number(fields.round_id ?? 0),
      objectId,
      state: Number(fields.state ?? 0),
      entriesCount: Array.isArray(entries) ? entries.length : 0,
      bettingEndsAt: Number(fields.betting_ends_at ?? 0),
      flyingStartedAt: Number(fields.flying_started_at ?? 0),
      commitHash,
    };
  }

  private async operatorFinalizeEmpty(roundObjectId: string): Promise<void> {
    await this.execTx(() => {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.config.packageId}::crash::operator_finalize_empty_stuck_round`,
        arguments: [
          tx.object(this.config.registryId),
          tx.object(roundObjectId),
          tx.object(SUI_CLOCK),
        ],
      });
      return tx;
    }, 'operator_finalize_empty_stuck_round');
  }

  /// `drain: true` keeps `running=true` so the in-flight `runRound()` finishes
  /// (close_betting → resolve), then the next loop iteration exits via the
  /// `draining` guard. `drain: false` is the hard-stop path used by the
  /// child-entry backstop just before process.exit.
  stop(opts: { drain?: boolean } = {}): void {
    if (opts.drain) {
      if (!this.draining) {
        console.warn('[Crash] Drain requested; finishing in-flight round before exit');
        this.draining = true;
      }
      return;
    }
    this.running = false;
  }

  /// A-W5: SIGTERM shutdown 시 sqlite WAL flush를 위해 호출.
  close(): void {
    try { this.db.close(); } catch {}
  }

  private bumpVersion(): number {
    this.roundState.stateVersion += 1;
    return this.roundState.stateVersion;
  }

  private generateCrashPoint(): { crashPointBps: number; salt: Buffer } {
    // Standard provably-fair crash distribution. Instant-crash band kept narrow
    // so most rounds give players a real chance to cash out.
    // Numerator (10000 - INSTANT_BAND) sets the on-chain house edge: 1%.
    const INSTANT_BAND = 100;
    const raw = randomInt(0, 10_000);
    let crashPointBps = raw < INSTANT_BAND
      ? 10_000
      : Math.floor((10_000 - INSTANT_BAND) * 10_000 / (10_000 - raw));
    // Cap matches Move INVERSE_SEARCH_TOP_BPS.
    if (crashPointBps > CRASH_POINT_CAP_BPS) crashPointBps = CRASH_POINT_CAP_BPS;
    const salt = randomBytes(32);
    return { crashPointBps, salt };
  }

  private computeCommitHash(crashPointBps: number, salt: Buffer): Uint8Array {
    const bcsBytes = bcs.u64().serialize(BigInt(crashPointBps)).toBytes();
    const msg = Buffer.concat([Buffer.from(bcsBytes), salt]);
    return blake2b(msg, { dkLen: 32 });
  }

  // LockConflict ("Object ... is not available for consumption") at submit time
  // means the SDK resolved a stale ObjectRef before the fullnode caught up to
  // the previous tx's effects. waitForTransaction reduces but doesn't fully
  // eliminate the race, so we rebuild the Transaction (forcing fresh ObjectRef
  // resolution) and retry with backoff. Move aborts and other failures fall
  // through immediately.
  private static readonly LOCK_CONFLICT_RETRIES = 3;
  private static readonly LOCK_CONFLICT_BACKOFF_MS = 600;
  // After waitForTransaction, give the fullnode a moment to propagate effects so
  // the next tx's input resolution doesn't resolve stale ObjectRefs.
  private static readonly TX_PROPAGATION_SLEEP_MS = 300;
  // close_betting outer retry budget (separate from execTx inner LockConflict retry).
  private static readonly CLOSE_BETTING_NOT_ENDED_MAX = 5;
  private static readonly CLOSE_BETTING_LOCK_CONFLICT_MAX = 3;
  private static readonly CLOSE_BETTING_LOCK_BACKOFF_MS = 1_500;

  private isLockConflict(msg: string): boolean {
    return msg.includes('is not available for consumption');
  }

  private async execTx(
    buildTx: () => Transaction,
    label: string,
  ): Promise<{ digest: string; objectChanges?: unknown[]; events?: unknown[] }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < RoundManager.LOCK_CONFLICT_RETRIES; attempt++) {
      try {
        const tx = buildTx();
        tx.setGasBudget(100_000_000);
        const res = await this.client.signAndExecuteTransaction({
          transaction: tx,
          signer: this.kp,
          requestType: 'WaitForLocalExecution',
          options: { showEffects: true, showObjectChanges: true, showEvents: true },
        });
        if (res.effects?.status.status !== 'success') {
          const errStr = JSON.stringify(res.effects?.status);
          // Execution-level LockConflict is also retriable; Move aborts are not.
          if (this.isLockConflict(errStr) && attempt < RoundManager.LOCK_CONFLICT_RETRIES - 1) {
            console.warn(`[Crash] ${label} LockConflict at exec (attempt ${attempt + 1}); retrying`);
            await this.sleep(RoundManager.LOCK_CONFLICT_BACKOFF_MS * (attempt + 1));
            continue;
          }
          throw new Error(`Tx ${label} failed: ${errStr}`);
        }
        // Belt-and-suspenders: requestType=WaitForLocalExecution already calls
        // waitForTransaction internally, but it swallows errors. Repeat here so
        // a propagated failure surfaces, and so the next tx's input resolution
        // observes the new versions.
        await this.client.waitForTransaction({ digest: res.digest });
        // Let the fullnode propagate effects before the next tx resolves inputs.
        await this.sleep(RoundManager.TX_PROPAGATION_SLEEP_MS);
        return { digest: res.digest, objectChanges: res.objectChanges ?? [], events: res.events ?? [] };
      } catch (err) {
        lastErr = err;
        const msg = (err as Error).message ?? String(err);
        if (this.isLockConflict(msg) && attempt < RoundManager.LOCK_CONFLICT_RETRIES - 1) {
          console.warn(`[Crash] ${label} LockConflict at submit (attempt ${attempt + 1}): ${msg}`);
          await this.sleep(RoundManager.LOCK_CONFLICT_BACKOFF_MS * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error(`execTx ${label}: exhausted retries`);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      if (this.draining) {
        console.warn('[Crash] Drain complete, exiting loop');
        this.running = false;
        return;
      }
      try {
        const startedAt = Date.now();
        await this.runRound();
        console.log(`[Crash] Round duration: ${Date.now() - startedAt}ms`);
      } catch (err) {
        const msg = String(err);
        const ecurrentRoundExists = msg.includes('Tx start_round failed') && msg.includes('}, 13)');

        if (ecurrentRoundExists) {
          // Registry occupied. Most likely cause: the previous round failed
          // mid-flight (LockConflict or transient RPC error after start_round
          // succeeded), leaving the round on-chain. Try recover() in-loop so a
          // single transient blip doesn't force a child fork + 60s parent retry.
          // recover() auto-finalizes empty stuck rounds, blocks on entries>0
          // (manual cleanup needed), and blocks on RPC errors (transient).
          console.warn('[Crash] start_round saw ECurrentRoundExists; attempting in-loop recover()');
        } else {
          console.error('[Crash] Round error:', err);
        }

        // Reset internal state before recover so any future logic sees IDLE.
        this.roundState.state = 'IDLE';
        this.roundState.roundId = null;
        this.roundState.roundObjectId = null;
        this.bumpVersion();

        if (this.draining) {
          console.warn('[Crash] Drain: round error during drain, exiting loop');
          this.running = false;
          return;
        }

        // Best-effort cleanup: if a round was left on-chain (mid-round error or
        // ECurrentRoundExists at boot of a new round), try to clear it. recover()
        // is safe to call when the registry is already clean (returns 'ok' fast).
        let verdict: 'ok' | 'block' = 'ok';
        try {
          verdict = await this.recover();
        } catch (recoverErr) {
          console.error('[Crash] In-loop recover() threw:', recoverErr);
          verdict = 'block';
        }

        if (verdict === 'block') {
          if (ecurrentRoundExists) {
            console.error('[Crash] HALTED: registry still occupied after recover(); manual intervention required.');
          } else {
            console.error('[Crash] HALTED: post-error recover() returned block; deferring to parent retry.');
          }
          this.running = false;
          return;
        }

        await this.sleep(this.config.roundIntervalMs);
      }
    }
  }

  /// Tight retry around resolve_round so a transient RPC blip during drain doesn't
  /// leave a CRASHED round un-resolved. See plan v2 §Drain 설계.
  /// Note: execTx itself retries LockConflict; this outer loop catches
  /// non-LockConflict transient failures (RPC timeouts, network blips, etc.).
  private async execResolveWithRetry(buildTx: () => Transaction): Promise<{ digest: string; events?: unknown[] }> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < RESOLVE_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.execTx(buildTx, 'resolve_round');
      } catch (err) {
        lastErr = err;
        console.warn(`[Crash] resolve_round attempt ${attempt + 1}/${RESOLVE_RETRY_ATTEMPTS} failed:`, (err as Error).message);
        if (attempt < RESOLVE_RETRY_ATTEMPTS - 1) {
          await this.sleep(RESOLVE_RETRY_DELAY_MS);
        }
      }
    }
    throw lastErr;
  }

  private async runRound(): Promise<void> {
    const { crashPointBps, salt } = this.generateCrashPoint();
    const commitHashBytes = this.computeCommitHash(crashPointBps, salt);
    const commitHash = Buffer.from(commitHashBytes).toString('hex');

    // --- start_round tx (canonical round_id comes from the on-chain event) ---
    const startRes = await this.execTx(() => {
      const startTx = new Transaction();
      startTx.moveCall({
        target: `${this.config.packageId}::crash::start_round`,
        arguments: [
          startTx.object(this.config.registryId),
          startTx.pure.u64(this.config.bettingWindowMs),
          startTx.pure.vector('u8', Array.from(commitHashBytes)),
          startTx.object(SUI_CLOCK),
        ],
      });
      return startTx;
    }, 'start_round');

    // Read canonical round_id from RoundStarted event (avoids sqlite/on-chain drift).
    const events = (startRes.events as Array<{ type: string; parsedJson?: { round_id?: string } }>) ?? [];
    const roundStarted = events.find(e => e.type.includes('::crash::RoundStarted'));
    const onChainRoundId = roundStarted?.parsedJson?.round_id;
    if (!onChainRoundId) throw new Error('start_round succeeded but no RoundStarted event');
    const roundId = Number(onChainRoundId);

    // Persist salt only AFTER start_round succeeds, keyed by canonical id.
    this.db.prepare(
      'INSERT INTO crash_salts (round_id, crash_point_bps, salt, created_at, resolved) VALUES (?, ?, ?, ?, 0)'
    ).run(roundId, crashPointBps, salt, Date.now());

    const roundChange = (startRes.objectChanges as Array<{ type: string; objectType?: string; objectId: string }>)
      ?.find(c => c.type === 'created' && c.objectType?.includes('::crash::CrashRound'));
    const roundObjectId = roundChange?.objectId ?? null;
    if (!roundObjectId) throw new Error('start_round: CrashRound object id not found');

    const bettingEndsAt = Date.now() + this.config.bettingWindowMs;

    this.roundState = {
      ...this.roundState,
      state: 'BETTING',
      roundId,
      roundObjectId,
      commitHash,
      bettingEndsAt,
      flyingStartedAt: null,
      crashedAt: null,
      crashPointBps: null,
      crashedAlreadyFired: false,
      stateVersion: this.bumpVersion(),
    };

    this.broadcast({
      type: 'round_started',
      roundId,
      roundObjectId,
      commitHash,
      bettingEndsAt,
      serverTime: Date.now(),
      stateVersion: this.roundState.stateVersion,
    });

    // --- Wait for betting window with small safety margin for on-chain clock skew ---
    // Buffer kept small (Sui devnet clock now tracks wall clock); EBettingNotEnded
    // retry below covers the rare residual skew case.
    const waitMs = Math.max(0, bettingEndsAt - Date.now()) + 200;
    await this.sleep(waitMs);
    if (!this.running) return;

    // --- close_betting tx (retry on EBettingNotEnded or outer LockConflict) ---
    // EBettingNotEnded: on-chain clock lagged, retry up to NOT_ENDED_MAX times.
    // LockConflict: execTx inner 3-retry already exhausted; outer retry rebuilds
    // Transaction for fresh ObjectRef resolution (same fix as execTx inner, but
    // at a longer cadence). The two error types are mutually exclusive in practice.
    let closed = false;
    let closeRes: { digest: string; events?: unknown[] } | null = null;
    let eNotEndedCount = 0;
    let lcCount = 0;
    while (!closed) {
      try {
        closeRes = await this.execTx(() => {
          const closeTx = new Transaction();
          closeTx.moveCall({
            target: `${this.config.packageId}::crash::close_betting`,
            arguments: [
              closeTx.object(this.config.registryId),
              closeTx.object(roundObjectId),
              closeTx.object(SUI_CLOCK),
            ],
          });
          return closeTx;
        }, 'close_betting');
        closed = true;
      } catch (err) {
        const msg = (err as Error).message;
        if ((msg.includes(', 18)') || msg.includes('EBettingNotEnded')) && eNotEndedCount < RoundManager.CLOSE_BETTING_NOT_ENDED_MAX) {
          eNotEndedCount++;
          await this.sleep(2_000);
          continue;
        }
        if (this.isLockConflict(msg) && lcCount < RoundManager.CLOSE_BETTING_LOCK_CONFLICT_MAX) {
          lcCount++;
          console.warn(`[Crash] close_betting outer LockConflict (${lcCount}/${RoundManager.CLOSE_BETTING_LOCK_CONFLICT_MAX}); rebuilding tx`);
          await this.sleep(RoundManager.CLOSE_BETTING_LOCK_BACKOFF_MS * lcCount);
          continue;
        }
        throw err;
      }
    }
    if (!closeRes) throw new Error('close_betting failed after retries');

    // Use the on-chain flying_started_at from BettingClosed event, NOT Date.now().
    // The on-chain value is the Sui clock at execution; Date.now() here is later
    // by RPC + consensus delay (observed up to 2.4s on devnet). Anchoring the
    // broadcast + polling to the on-chain value keeps the client display, the
    // server polling loop, and the on-chain crash_deadline in agreement so
    // legitimate cashouts are not invalidated by recorded_at > crash_deadline.
    const closeEvents = (closeRes.events as Array<{ type: string; parsedJson?: { flying_started_at?: string } }>) ?? [];
    const bettingClosedEv = closeEvents.find((e) => e.type.includes('::crash::BettingClosed'));
    const onChainFlyingStartedAt = Number(bettingClosedEv?.parsedJson?.flying_started_at ?? 0);
    if (!onChainFlyingStartedAt) {
      throw new Error('close_betting succeeded but no BettingClosed event found');
    }
    const flyingStartedAt = onChainFlyingStartedAt;
    this.roundState.state = 'FLYING';
    this.roundState.flyingStartedAt = flyingStartedAt;
    this.roundState.stateVersion = this.bumpVersion();

    this.broadcast({
      type: 'betting_closed',
      roundId,
      flyingStartedAt,
      stateVersion: this.roundState.stateVersion,
    });

    // --- Flying: server-side timer until crash_point reached ---
    // Use Date.now() vs on-chain flyingStartedAt: this is server wall clock vs
    // on-chain wall clock. Sui devnet clock tracks wall time within tens of ms,
    // so this approximation is safe. The 100ms poll cadence is the dominant
    // error term anyway.
    while (this.running) {
      await this.sleep(100);
      const elapsed = Date.now() - flyingStartedAt;
      if (multiplierAtBps(elapsed) >= crashPointBps) break;
    }
    if (!this.running) return;

    this.roundState.state = 'CRASHED';
    this.roundState.crashedAt = Date.now();
    this.roundState.crashedAlreadyFired = true;
    this.roundState.stateVersion = this.bumpVersion();

    // Safe to reveal crashPointBps now: state is CRASHED on-chain too, so any
    // late cash_out attempt is rejected. Sending it here lets the client snap
    // the displayed multiplier to the true value instead of overshooting via
    // rAF during network latency until 'resolved' arrives.
    this.broadcast({
      type: 'crashed',
      roundId,
      crashPointBps,
      stateVersion: this.roundState.stateVersion,
    });

    // --- resolve_round tx ---
    const saltRow = this.db.prepare(
      'SELECT salt, crash_point_bps FROM crash_salts WHERE round_id = ?'
    ).get(roundId) as { salt: Buffer; crash_point_bps: number } | undefined;
    if (!saltRow) throw new Error(`salt not found for round_id ${roundId}`);

    const resolveRes = await this.execResolveWithRetry(() => {
      const resolveTx = new Transaction();
      resolveTx.moveCall({
        target: `${this.config.packageId}::crash::resolve_round`,
        arguments: [
          resolveTx.object(roundObjectId),
          resolveTx.pure.u64(saltRow.crash_point_bps),
          resolveTx.pure.vector('u8', Array.from(saltRow.salt)),
          resolveTx.object(this.config.registryId),
          resolveTx.object(BANKROLL_POOL),
          resolveTx.object(SUI_CLOCK),
        ],
      });
      return resolveTx;
    });

    this.db.prepare('UPDATE crash_salts SET resolved = 1 WHERE round_id = ?').run(roundId);

    // History persistence: parse GameResult events from the resolve_round
    // response and ship to parent via IPC. Failures here MUST NOT abort the
    // round loop, so wrap defensively. INSERTs happen in the parent (single
    // writer for the history DB; child stays focused on tx execution).
    try {
      const rows = parsePlayerResultsFromEvents(resolveRes.events);
      if (rows.length > 0) {
        // Enrich with bet_tx digests by querying BetPlaced events for this
        // round. Done out-of-band so a query failure doesn't lose the row.
        try {
          const betTxMap = await fetchBetTxByPlayer(this.client, this.config.packageId, roundId);
          for (const r of rows) {
            const tx = betTxMap.get(r.player);
            if (tx) r.betTx = tx;
          }
        } catch (err) {
          console.error('[Crash] fetchBetTxByPlayer failed', { roundId, err: (err as Error).message });
        }
        this.broadcast({
          type: 'resolve_persisted',
          roundId,
          resolveTx: resolveRes.digest,
          rows,
          stateVersion: this.roundState.stateVersion,
        });
      }
    } catch (err) {
      console.error('[Crash] persistResolveResults parse failed', { roundId, err: (err as Error).message });
    }

    const crashTimeMs = inverseMultiplierAt(crashPointBps);
    this.roundState.state = 'RESOLVED';
    this.roundState.crashPointBps = crashPointBps;
    this.roundState.recentRounds = [
      { roundId, crashPointBps },
      ...this.roundState.recentRounds.slice(0, 19),
    ];
    this.roundState.stateVersion = this.bumpVersion();

    this.broadcast({
      type: 'resolved',
      roundId,
      crashPointBps,
      crashTimeMs,
      nextRoundAt: Date.now() + this.config.roundIntervalMs,
      stateVersion: this.roundState.stateVersion,
    });

    await this.sleep(this.config.roundIntervalMs);
    if (!this.running) return;

    this.roundState = {
      ...this.roundState,
      state: 'IDLE',
      roundId: null,
      roundObjectId: null,
      commitHash: null,
      bettingEndsAt: null,
      flyingStartedAt: null,
      crashedAt: null,
      crashPointBps: null,
      crashedAlreadyFired: false,
      stateVersion: this.bumpVersion(),
    };
  }
}
