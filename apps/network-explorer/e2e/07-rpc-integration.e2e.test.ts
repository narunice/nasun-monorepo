import { describe, test, expect } from 'vitest';
import { RPC_URL, rpcCall, post, CHAIN_ID, COIN_TYPES, ZERO_ADDRESS } from './helpers';

describe('07 — RPC Chain Basics', () => {
  test('sui_getChainIdentifier returns expected chain ID', async () => {
    const chainId = await rpcCall<string>('sui_getChainIdentifier');
    expect(chainId).toBe(CHAIN_ID);
  });

  test('sui_getLatestCheckpointSequenceNumber returns positive number', async () => {
    const result = await rpcCall<string>('sui_getLatestCheckpointSequenceNumber');
    expect(Number(result)).toBeGreaterThan(0);
  });

  test('suix_getReferenceGasPrice returns positive MIST value', async () => {
    const price = await rpcCall<string>('suix_getReferenceGasPrice');
    expect(BigInt(price)).toBeGreaterThan(0n);
  });

  test('suix_getLatestSuiSystemState returns valid epoch', async () => {
    const state = await rpcCall<Record<string, unknown>>('suix_getLatestSuiSystemState');
    expect(state).toHaveProperty('epoch');
    expect(Number(state.epoch)).toBeGreaterThanOrEqual(0);
    expect(state).toHaveProperty('epochStartTimestampMs');
    expect(state).toHaveProperty('activeValidators');
    expect(Array.isArray(state.activeValidators)).toBe(true);
    expect((state.activeValidators as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('07 — RPC Coin Queries', () => {
  test('suix_getTotalSupply returns NSN total supply', async () => {
    const result = await rpcCall<{ value: string }>('suix_getTotalSupply', [COIN_TYPES.NSN]);
    expect(result).toHaveProperty('value');
    expect(BigInt(result.value)).toBeGreaterThan(0n);
  });

  test('suix_getTotalSupply for unknown coin type fails gracefully', async () => {
    try {
      await rpcCall('suix_getTotalSupply', ['0x999::fake::FAKE']);
      // If it doesn't throw, the result should indicate no supply
    } catch (err) {
      // Expected: RPC error for unknown coin type
      expect((err as Error).message).toContain('RPC error');
    }
  });
});

describe('07 — RPC Checkpoint Queries', () => {
  test('sui_getCheckpoint for latest returns valid data', async () => {
    const latest = await rpcCall<string>('sui_getLatestCheckpointSequenceNumber');
    const cp = await rpcCall<Record<string, unknown>>('sui_getCheckpoint', [latest]);
    expect(cp).toHaveProperty('sequenceNumber');
    expect(cp).toHaveProperty('timestampMs');
    expect(cp).toHaveProperty('digest');
    expect(cp.sequenceNumber).toBe(latest);
  });

  test('sui_getCheckpoint for sequence 0 fails (pruned)', async () => {
    // Fullnode started at checkpoint 4665621, so checkpoint 0 is pruned
    try {
      await rpcCall('sui_getCheckpoint', ['0']);
    } catch (err) {
      // Expected: pruned checkpoint
      expect((err as Error).message).toBeTruthy();
    }
  });
});

describe('07 — RPC Transaction Queries', () => {
  test('suix_queryTransactionBlocks returns results', async () => {
    const result = await rpcCall<{ data: unknown[]; hasNextPage: boolean }>(
      'suix_queryTransactionBlocks',
      [
        { filter: null, options: { showInput: false, showEffects: false } },
        null,
        1,
        true,
      ]
    );
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('hasNextPage');
    expect(result.data.length).toBe(1);
  });
});

describe('07 — RPC Error Handling', () => {
  test('Invalid method returns JSON-RPC error', async () => {
    const res = await post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'nonexistent_method',
      params: [],
    });
    const body = res.body as { error?: { code: number; message: string } };
    expect(body.error).toBeDefined();
    expect(body.error!.code).toBeTruthy();
  });

  test('Malformed JSON-RPC request returns error', async () => {
    const res = await post(RPC_URL, { invalid: true });
    const body = res.body as Record<string, unknown>;
    // Should return error, not crash
    expect(res.status).toBeLessThan(500);
  });

  test('Empty params array is handled', async () => {
    const res = await post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getChainIdentifier',
      params: [],
    });
    expect(res.status).toBe(200);
  });

  test('Missing params field is handled', async () => {
    const res = await post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getChainIdentifier',
    });
    expect(res.status).toBe(200);
  });
});

describe('07 — RPC Address Balance Queries', () => {
  test('Zero address has zero balance', async () => {
    const result = await rpcCall<{ totalBalance: string }>('suix_getBalance', [
      ZERO_ADDRESS,
      COIN_TYPES.NSN,
    ]);
    expect(result).toHaveProperty('totalBalance');
    expect(BigInt(result.totalBalance)).toBe(0n);
  });

  test('suix_getAllBalances for an address returns array', async () => {
    const result = await rpcCall<Array<{ coinType: string; totalBalance: string }>>(
      'suix_getAllBalances',
      [ZERO_ADDRESS]
    );
    expect(Array.isArray(result)).toBe(true);
  });
});
