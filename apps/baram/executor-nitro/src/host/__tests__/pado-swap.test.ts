import { describe, it, expect, vi } from 'vitest';
import {
  buildSwapActionCall,
  quoteMinOut,
  quoteExpectedOutput,
  applySlippageFloor,
  decodeU64LE,
  type PadoSwapConfig,
} from '../pado-swap.js';

const CFG: PadoSwapConfig = {
  deepbookPackageId: '0x' + 'aa'.repeat(32),
  poolId: '0x' + 'bb'.repeat(32),
  baseType: '0x' + 'cc'.repeat(32) + '::nbtc::NBTC',
  quoteType: '0x' + 'dd'.repeat(32) + '::nusdc::NUSDC',
  deepType: '0x' + 'ee'.repeat(32) + '::deep::DEEP',
};

describe('pado-swap.buildSwapActionCall', () => {
  it('BUY emits swap_exact_quote_for_base with <Base, Quote> typeArgs', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: 100n });
    expect(spec.targetPackage).toBe(CFG.deepbookPackageId);
    expect(spec.module).toBe('pool');
    expect(spec.fn).toBe('swap_exact_quote_for_base');
    expect(spec.typeArguments).toEqual([CFG.baseType, CFG.quoteType]);
    // pool, withdraw_coin (pipe), zero_deep (pipe), min_out (pure), clock
    expect(spec.args).toHaveLength(5);
    expect(spec.args[0]).toEqual({ kind: 'object', id: CFG.poolId });
    expect(spec.args[1]).toEqual({ kind: 'pipe', from: 'withdraw_coin' });
    expect(spec.args[2]).toEqual({ kind: 'pipe', from: 'zero_deep' });
    expect(spec.args[3].kind).toBe('pure');
    expect(spec.args[4]).toEqual({ kind: 'object', id: '0x6' });
  });

  it('SELL emits swap_exact_base_for_quote with <Base, Quote> typeArgs', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'SELL', minOut: 0n });
    expect(spec.fn).toBe('swap_exact_base_for_quote');
    expect(spec.typeArguments).toEqual([CFG.baseType, CFG.quoteType]);
    expect(spec.args[1]).toEqual({ kind: 'pipe', from: 'withdraw_coin' });
    expect(spec.args[2]).toEqual({ kind: 'pipe', from: 'zero_deep' });
  });

  it('encodes minOut as 8-byte LE u64 in the pure arg', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: 0x0102030405060708n });
    const pureArg = spec.args[3] as { kind: 'pure'; bytes: Uint8Array };
    expect(Array.from(pureArg.bytes)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('rejects negative minOut', () => {
    expect(() => buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: -1n })).toThrow();
  });
});

describe('pado-swap.quoteMinOut', () => {
  // Mid price: 1 NBTC = 50_000 NUSDC. Decimals: NBTC=8, NUSDC=6.
  // priceNum/priceDen represent quote-per-base in raw ratio.
  // For 1 NBTC = 50_000 NUSDC:
  //   1 * 1e8 base_raw <-> 50_000 * 1e6 quote_raw
  //   priceNum = 50_000 * 1e6 = 5e10 (quote_raw per 1e8 base_raw)
  //   priceDen = 1e8           (1 base in raw)
  // Then BUY 50 NUSDC (5e7 quote_raw) -> base out = 5e7 * 1e8 / 5e10 = 1e5 base_raw
  const priceNum = 50_000n * 1_000_000n;
  const priceDen = 100_000_000n;

  it('BUY with no slippage returns full expected output', () => {
    const out = quoteMinOut({
      direction: 'BUY',
      sizeInRaw: 50_000_000n,
      priceNum,
      priceDen,
      slippageBps: 0,
    });
    expect(out).toBe(100_000n);
  });

  it('SELL with 100 bps (1.0%) tolerates 1% less', () => {
    const out = quoteMinOut({
      direction: 'SELL',
      sizeInRaw: 100_000n,
      priceNum,
      priceDen,
      slippageBps: 100,
    });
    // expected = 100_000 * 5e10 / 1e8 = 5e7. * (10_000 - 100) / 10_000 = 4.95e7
    expect(out).toBe(49_500_000n);
  });

  it('rejects out-of-range slippage', () => {
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum, priceDen, slippageBps: -1 }),
    ).toThrow();
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum, priceDen, slippageBps: 10_001 }),
    ).toThrow();
  });

  it('rejects non-positive price', () => {
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum: 0n, priceDen, slippageBps: 0 }),
    ).toThrow();
  });
});

describe('pado-swap.decodeU64LE', () => {
  it('inverts bcsU64', () => {
    const spec = buildSwapActionCall({
      config: CFG,
      direction: 'BUY',
      minOut: 0x1122334455667788n,
    });
    const pure = spec.args[3] as { kind: 'pure'; bytes: Uint8Array };
    expect(decodeU64LE(pure.bytes)).toBe(0x1122334455667788n);
  });

  it('rejects non-8-byte input', () => {
    expect(() => decodeU64LE(new Uint8Array(7))).toThrow();
    expect(() => decodeU64LE(new Uint8Array(9))).toThrow();
  });
});

describe('pado-swap.applySlippageFloor', () => {
  it('returns full expected at 0 bps', () => {
    expect(applySlippageFloor(1_000_000n, 0)).toBe(1_000_000n);
  });
  it('applies 100 bps (1%) tolerance', () => {
    expect(applySlippageFloor(1_000_000n, 100)).toBe(990_000n);
  });
  it('floors at 10_000 bps (no minimum)', () => {
    expect(applySlippageFloor(1_000_000n, 10_000)).toBe(0n);
  });
  it('rejects negative expected', () => {
    expect(() => applySlippageFloor(-1n, 0)).toThrow();
  });
  it('rejects out-of-range slippage', () => {
    expect(() => applySlippageFloor(1n, -1)).toThrow();
    expect(() => applySlippageFloor(1n, 10_001)).toThrow();
    expect(() => applySlippageFloor(1n, 0.5)).toThrow();
  });
});

describe('pado-swap.quoteExpectedOutput (devInspect)', () => {
  // u64 LE byte helper.
  function u64(n: bigint): number[] {
    const out: number[] = [];
    let x = n;
    for (let i = 0; i < 8; i++) {
      out.push(Number(x & 0xffn));
      x >>= 8n;
    }
    return out;
  }

  function makeClient(returnValues: number[][]) {
    return {
      devInspectTransactionBlock: vi.fn().mockResolvedValue({
        effects: { status: { status: 'success' } },
        results: [{ returnValues: returnValues.map((v) => [v, 'u64']) }],
      }),
    } as unknown as Parameters<typeof quoteExpectedOutput>[0]['client'];
  }

  // Extract the (base_q, quote_q) u64 args sent to pool::get_quantity_out
  // by the quoter. Looks at the captured Transaction's move call args
  // and resolves the {$kind:'Input'} references to their pure bytes.
  function extractQuoteArgs(
    captured: { transactionBlock: unknown },
  ): { baseQ: bigint; quoteQ: bigint } {
    const data = (
      captured.transactionBlock as { getData: () => { commands: unknown[]; inputs: unknown[] } }
    ).getData();
    const mc = (data.commands[0] as { MoveCall?: { arguments: unknown[] } }).MoveCall;
    if (!mc) throw new Error('Expected MoveCall command');
    const decodeInputAt = (argIdx: number): bigint => {
      const arg = mc.arguments[argIdx] as { Input?: number };
      if (typeof arg.Input !== 'number') {
        throw new Error(`arg ${argIdx} is not an Input ref`);
      }
      const input = data.inputs[arg.Input] as
        | { Pure?: { bytes: string } | number[] | { bytes: number[] } }
        | undefined;
      // @mysten/sui v1.x: inputs[i].Pure.bytes is base64 string OR
      // a number[] depending on builder shape. Normalize.
      const pureField = input?.Pure;
      let bytes: Uint8Array;
      if (Array.isArray(pureField)) {
        bytes = Uint8Array.from(pureField);
      } else if (pureField && Array.isArray((pureField as { bytes?: unknown }).bytes)) {
        bytes = Uint8Array.from((pureField as { bytes: number[] }).bytes);
      } else if (pureField && typeof (pureField as { bytes?: unknown }).bytes === 'string') {
        bytes = Uint8Array.from(
          Buffer.from((pureField as { bytes: string }).bytes, 'base64'),
        );
      } else {
        throw new Error(`Unexpected Pure input shape: ${JSON.stringify(input)}`);
      }
      if (bytes.length !== 8) {
        throw new Error(`Expected 8-byte u64, got ${bytes.length}`);
      }
      let v = 0n;
      for (let i = 0; i < 8; i++) v |= BigInt(bytes[i]) << BigInt(i * 8);
      return v;
    };
    // pool::get_quantity_out signature: (self, base_q, quote_q, clock)
    return { baseQ: decodeInputAt(1), quoteQ: decodeInputAt(2) };
  }

  it('BUY returns the base_quantity_out field AND passes sizeInRaw as the quote_q arg', async () => {
    // (base_out, quote_out, deep_req) = (123, 456, 7)
    const client = makeClient([u64(123n), u64(456n), u64(7n)]);
    const out = await quoteExpectedOutput({
      client,
      config: CFG,
      direction: 'BUY',
      sizeInRaw: 7n,
    });
    expect(out).toBe(123n);
    const captured = (
      client.devInspectTransactionBlock as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    const { baseQ, quoteQ } = extractQuoteArgs(captured);
    // BUY: input is quote → quote_q must be sizeInRaw, base_q must be 0.
    // This catches a regression that inverts the arg-side assignment.
    expect(baseQ).toBe(0n);
    expect(quoteQ).toBe(7n);
  });

  it('SELL returns the quote_quantity_out field AND passes sizeInRaw as the base_q arg', async () => {
    const client = makeClient([u64(123n), u64(456n), u64(7n)]);
    const out = await quoteExpectedOutput({
      client,
      config: CFG,
      direction: 'SELL',
      sizeInRaw: 13n,
    });
    expect(out).toBe(456n);
    const captured = (
      client.devInspectTransactionBlock as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    const { baseQ, quoteQ } = extractQuoteArgs(captured);
    // SELL: input is base → base_q must be sizeInRaw, quote_q must be 0.
    expect(baseQ).toBe(13n);
    expect(quoteQ).toBe(0n);
  });

  it('rejects sizeInRaw <= 0', async () => {
    const client = makeClient([u64(0n), u64(0n), u64(0n)]);
    await expect(
      quoteExpectedOutput({ client, config: CFG, direction: 'BUY', sizeInRaw: 0n }),
    ).rejects.toThrow();
  });

  it('throws on devInspect failure', async () => {
    const client = {
      devInspectTransactionBlock: vi.fn().mockResolvedValue({
        effects: { status: { status: 'failure', error: 'pool not found' } },
        results: [],
      }),
    } as unknown as Parameters<typeof quoteExpectedOutput>[0]['client'];
    await expect(
      quoteExpectedOutput({ client, config: CFG, direction: 'BUY', sizeInRaw: 1n }),
    ).rejects.toThrow(/get_quantity_out/);
  });

  it('throws when fewer than 3 return values', async () => {
    const client = makeClient([u64(1n), u64(2n)]);
    await expect(
      quoteExpectedOutput({ client, config: CFG, direction: 'BUY', sizeInRaw: 1n }),
    ).rejects.toThrow(/3 values/);
  });
});
