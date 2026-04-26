import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { RoundManager } from '../round-manager.js';

// Test handle: RoundManager is opaque (private members), so we use an `any`
// shim purely to monkey-patch private methods for unit tests.
type Stubbed = {
  fetchCurrentRoundId: (...args: unknown[]) => Promise<string | null>;
  fetchRoundScalars: (...args: unknown[]) => Promise<{
    roundId: number;
    objectId: string;
    state: number;
    entriesCount: number;
    bettingEndsAt: number;
  } | null>;
  operatorFinalizeEmpty: (...args: unknown[]) => Promise<void>;
  recover: () => Promise<'ok' | 'block'>;
  close: () => void;
};

function makeManager(): { manager: Stubbed; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'crash-recover-'));
  const dbPath = join(tempDir, 'salts.sqlite');
  const kp = new Ed25519Keypair();
  // Encode privkey to suiprivkey format that RoundManager expects.
  const privkey = kp.getSecretKey();

  const manager = new RoundManager(
    {
      rpcUrl: 'http://localhost:9999', // never reached because we stub
      operatorPrivkey: privkey,
      saltDbPath: dbPath,
      bettingWindowMs: 10_000,
      roundIntervalMs: 5_000,
      packageId: '0xpkg',
      registryId: '0xreg',
    },
    () => {}, // broadcast no-op
  ) as unknown as Stubbed;

  return {
    manager,
    cleanup: () => {
      try { manager.close(); } catch {}
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    },
  };
}

describe('recover()', () => {
  let ctx: ReturnType<typeof makeManager>;

  beforeEach(() => {
    ctx = makeManager();
  });

  it("returns 'ok' on clean start (no current round)", async () => {
    ctx.manager.fetchCurrentRoundId = vi.fn().mockResolvedValue(null);
    ctx.manager.fetchRoundScalars = vi.fn();
    ctx.manager.operatorFinalizeEmpty = vi.fn();

    const verdict = await ctx.manager.recover();

    expect(verdict).toBe('ok');
    expect(ctx.manager.fetchRoundScalars).not.toHaveBeenCalled();
    expect(ctx.manager.operatorFinalizeEmpty).not.toHaveBeenCalled();
    ctx.cleanup();
  });

  it("auto-finalizes empty stuck round and returns 'ok'", async () => {
    ctx.manager.fetchCurrentRoundId = vi.fn().mockResolvedValue('0xstuck');
    ctx.manager.fetchRoundScalars = vi.fn().mockResolvedValue({
      roundId: 42,
      objectId: '0xstuck',
      state: 1, // FLYING
      entriesCount: 0,
      bettingEndsAt: 0,
    });
    const finalize = vi.fn().mockResolvedValue(undefined);
    ctx.manager.operatorFinalizeEmpty = finalize;

    const verdict = await ctx.manager.recover();

    expect(verdict).toBe('ok');
    expect(finalize).toHaveBeenCalledWith('0xstuck');
    ctx.cleanup();
  });

  it("returns 'block' on entries>0 stuck round and skips finalize", async () => {
    ctx.manager.fetchCurrentRoundId = vi.fn().mockResolvedValue('0xstuck');
    ctx.manager.fetchRoundScalars = vi.fn().mockResolvedValue({
      roundId: 99,
      objectId: '0xstuck',
      state: 1,
      entriesCount: 3,
      bettingEndsAt: 0,
    });
    const finalize = vi.fn();
    ctx.manager.operatorFinalizeEmpty = finalize;

    const verdict = await ctx.manager.recover();

    expect(verdict).toBe('block');
    expect(finalize).not.toHaveBeenCalled();
    ctx.cleanup();
  });

  it("returns 'block' when finalize hits Move EBettingNotEnded (BETTING window still active)", async () => {
    ctx.manager.fetchCurrentRoundId = vi.fn().mockResolvedValue('0xstuck');
    ctx.manager.fetchRoundScalars = vi.fn().mockResolvedValue({
      roundId: 7,
      objectId: '0xstuck',
      state: 0, // BETTING
      entriesCount: 0,
      bettingEndsAt: Date.now() + 5_000,
    });
    ctx.manager.operatorFinalizeEmpty = vi.fn().mockRejectedValue(
      // execTx error format: includes ', 18)' for abort_code=18
      new Error('Tx operator_finalize_empty_stuck_round failed: {"status":"failure","error":"MoveAbort(... }, 18)"}'),
    );

    const verdict = await ctx.manager.recover();

    expect(verdict).toBe('block');
    ctx.cleanup();
  });

  it("returns 'block' on transient registry RPC error", async () => {
    ctx.manager.fetchCurrentRoundId = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    ctx.manager.fetchRoundScalars = vi.fn();
    ctx.manager.operatorFinalizeEmpty = vi.fn();

    const verdict = await ctx.manager.recover();

    expect(verdict).toBe('block');
    expect(ctx.manager.fetchRoundScalars).not.toHaveBeenCalled();
    expect(ctx.manager.operatorFinalizeEmpty).not.toHaveBeenCalled();
    ctx.cleanup();
  });
});
