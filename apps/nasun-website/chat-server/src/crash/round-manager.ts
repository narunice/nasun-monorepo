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
import type { RoundState, RecentRound, WsEvent } from './types.js';

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

  async start(): Promise<void> {
    this.running = true;

    // Boot recovery: if registry has a current_round_id, the previous chat-server crashed
    // mid-round. Refuse to start a new round until an admin clears it manually
    // (admin_finalize_stuck_round + emergency_refund_batch).
    try {
      const reg = await this.client.getObject({ id: this.config.registryId, options: { showContent: true } });
      // Sui RPC renders Option<ID> as: null when None, the inner ID string when Some.
      // Some older shapes used {fields:{vec:[...]}}; cover both.
      const fields = (reg.data?.content as { fields?: { current_round_id?: unknown } })?.fields;
      const cri = fields?.current_round_id;
      const isSome =
        (typeof cri === 'string' && cri.length > 0) ||
        (typeof cri === 'object' && cri !== null && Array.isArray((cri as { fields?: { vec?: unknown[] } }).fields?.vec) && ((cri as { fields: { vec: unknown[] } }).fields.vec.length > 0));
      if (isSome) {
        console.error('[Crash] BOOT BLOCKED: registry.current_round_id is non-empty. A previous round is in flight on-chain.');
        console.error('[Crash] Run admin_finalize_stuck_round + emergency_refund_batch to clear, then restart with CRASH_ENABLED=true.');
        this.running = false;
        return;
      }
    } catch (err) {
      console.error('[Crash] Boot recovery check failed:', err);
      this.running = false;
      return;
    }

    await this.runLoop();
  }

  stop(): void {
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
    const raw = randomInt(0, 10_000);
    let crashPointBps = raw < 300
      ? 10_000
      : Math.floor((10_000 - 300) * 10_000 / (10_000 - raw));
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

  private async execTx(tx: Transaction, label: string): Promise<{ digest: string; objectChanges?: unknown[]; events?: unknown[] }> {
    tx.setGasBudget(100_000_000);
    const res = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.kp,
      options: { showEffects: true, showObjectChanges: true, showEvents: true },
    });
    if (res.effects?.status.status !== 'success') {
      throw new Error(`Tx ${label} failed: ${JSON.stringify(res.effects?.status)}`);
    }
    // Wait so subsequent tx sees consistent object versions (avoids LockConflict).
    await this.client.waitForTransaction({ digest: res.digest });
    return { digest: res.digest, objectChanges: res.objectChanges ?? [], events: res.events ?? [] };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        await this.runRound();
      } catch (err) {
        console.error('[Crash] Round error:', err);
        this.roundState.state = 'IDLE';
        this.roundState.roundId = null;
        this.roundState.roundObjectId = null;
        this.bumpVersion();
        await this.sleep(this.config.roundIntervalMs);
      }
    }
  }

  private async runRound(): Promise<void> {
    const { crashPointBps, salt } = this.generateCrashPoint();
    const commitHashBytes = this.computeCommitHash(crashPointBps, salt);
    const commitHash = Buffer.from(commitHashBytes).toString('hex');

    // --- start_round tx (canonical round_id comes from the on-chain event) ---
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
    const startRes = await this.execTx(startTx, 'start_round');

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

    // --- Wait for betting window with safety margin for on-chain clock skew ---
    const waitMs = Math.max(0, bettingEndsAt - Date.now()) + 1_000; // +1s buffer
    await this.sleep(waitMs);
    if (!this.running) return;

    // --- close_betting tx (retry on EBettingNotEnded) ---
    let closed = false;
    for (let attempt = 0; attempt < 5 && !closed; attempt++) {
      try {
        const closeTx = new Transaction();
        closeTx.moveCall({
          target: `${this.config.packageId}::crash::close_betting`,
          arguments: [
            closeTx.object(this.config.registryId),
            closeTx.object(roundObjectId),
            closeTx.object(SUI_CLOCK),
          ],
        });
        await this.execTx(closeTx, 'close_betting');
        closed = true;
      } catch (err) {
        const msg = (err as Error).message;
        // EBettingNotEnded = 18; on-chain clock lagged. Retry after backoff.
        if (msg.includes(', 18)') || msg.includes('EBettingNotEnded')) {
          await this.sleep(2_000);
          continue;
        }
        throw err;
      }
    }
    if (!closed) throw new Error('close_betting failed after retries');

    const flyingStartedAt = Date.now();
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

    // crashPointBps intentionally NOT included here (frontrun prevention).
    this.broadcast({
      type: 'crashed',
      roundId,
      stateVersion: this.roundState.stateVersion,
    });

    // --- resolve_round tx ---
    const saltRow = this.db.prepare(
      'SELECT salt, crash_point_bps FROM crash_salts WHERE round_id = ?'
    ).get(roundId) as { salt: Buffer; crash_point_bps: number } | undefined;
    if (!saltRow) throw new Error(`salt not found for round_id ${roundId}`);

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
    await this.execTx(resolveTx, 'resolve_round');

    this.db.prepare('UPDATE crash_salts SET resolved = 1 WHERE round_id = ?').run(roundId);

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
