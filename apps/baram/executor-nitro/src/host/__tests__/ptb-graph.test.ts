/**
 * PTB command-graph assertion (Plan C C3-v2 §4.6 / W9).
 *
 * Builds a Transaction via `buildAERTransaction` and walks the
 * resulting command graph to assert:
 *
 *   - cognition path: 4 commands (receipt + AER + 2 housekeeping)
 *   - execution path: 10 commands (DV9 layout — withdraw + zero_deep +
 *     swap + settle + leftover deposit + destroy_zero + receipt + AER
 *     + 2 housekeeping). The swap's `withdraw_coin` arg is wired to
 *     Cmd 0.0; `zero_deep` to Cmd 1; settle consumes Cmd 0.1 + Cmd
 *     2.<primary>; leftover deposit consumes Cmd 2.<leftoverInput>;
 *     destroy_zero consumes Cmd 2.<leftoverDeep>.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAERTransaction,
  type SubmitProofWithCapabilityInput,
  type SuiConfig,
  type ActionCallSpec,
} from '../sui-client.js';
import type { CapabilityRef } from '../capability.js';

const CFG: Pick<
  SuiConfig,
  | 'packageId'
  | 'registryId'
  | 'aerPackageId'
  | 'aerRegistryId'
  | 'executorPackageId'
  | 'executorRegistryId'
  | 'tierRegistryId'
  | 'executorStakeId'
  | 'processedRequestsId'
> = {
  packageId: '0x' + '11'.repeat(32),
  registryId: '0x' + '22'.repeat(32),
  aerPackageId: '0x' + '33'.repeat(32),
  aerRegistryId: '0x' + '44'.repeat(32),
  executorPackageId: '0x' + '55'.repeat(32),
  executorRegistryId: '0x' + '66'.repeat(32),
  tierRegistryId: '0x' + '77'.repeat(32),
  executorStakeId: '0x' + '88'.repeat(32),
  processedRequestsId: '0x' + '99'.repeat(32),
};

const CAP_REF: CapabilityRef = {
  objectId: '0x' + 'aa'.repeat(32),
  initialSharedVersion: 100n,
  cap: {
    id: '0x' + 'aa'.repeat(32),
    owner: '0x' + 'bb'.repeat(32),
    version: 7n,
    pauseMode: 'active',
    revoked: false,
    allowedActions: ['trade.swap.v1'],
    allowedAssets: [],
    allowedTargets: [],
    riskLimits: {
      maxNotionalPerAction: 1_000_000_000n,
      maxDailyLoss: 1_000_000_000n,
      maxSlippageBps: 100,
      stopLossBps: 100,
      takeProfitBps: 100,
    },
    escrowId: null,
  },
};

function baseInput(): Omit<SubmitProofWithCapabilityInput, 'envelope' | 'actionCall' | 'execution'> {
  return {
    requestId: 1,
    resultHash: 'a'.repeat(64),
    executionTimeMs: 1234,
    request: {
      requestId: 1,
      requester: '0x' + 'cc'.repeat(32),
      executor: '0x' + 'dd'.repeat(32),
      price: 1,
      promptHash: 'b'.repeat(64),
      model: 'm',
      createdAt: 0,
      timeoutAt: 0,
      status: 0,
    },
    aer: {
      delegationPath: [],
      executorPrincipal: null,
      feeDetail: null,
      budgetId: null,
      budgetRemaining: null,
      modelMetadata: null,
      purpose: null,
      constraints: null,
      executorTier: 0,
      executorReputation: 0,
      executorStakeAmount: 0,
      teeVerified: false,
      teeAttestationHash: null,
      triggeredBy: null,
      triggeredAction: null,
    },
    capRef: CAP_REF,
    lineage: { intentId: new Array(16).fill(0), parentIntentId: null, executionId: 1 },
    wake: { triggeredByType: 1, triggeredByRef: null },
    replay: {
      modelVersion: 'm',
      promptTemplateHash: new Array(32).fill(0),
      marketSnapshotHash: null,
      replayExtras: [],
    },
  };
}

const NBTC = '0x' + 'ee'.repeat(32) + '::nbtc::NBTC';
const NUSDC = '0x' + 'ff'.repeat(32) + '::nusdc::NUSDC';
const DEEP = '0x' + 'ab'.repeat(32) + '::deep::DEEP';
const POOL = '0x' + 'cd'.repeat(32);
const DEEPBOOK_PKG = '0x' + 'ef'.repeat(32);

function getCommands(tx: ReturnType<typeof buildAERTransaction>): Array<Record<string, unknown>> {
  // @mysten/sui Transaction stores commands on its internal data state.
  // The shape is { kind: 'MoveCall', ... } per command.
  const data = (tx as unknown as { getData: () => { commands: unknown[] } }).getData();
  return data.commands as Array<Record<string, unknown>>;
}

function isMoveCall(c: Record<string, unknown>): { target: string; args: unknown[]; tyArgs: string[] } | null {
  // @mysten/sui shape: { $kind: 'MoveCall', MoveCall: { package, module, function, arguments, typeArguments } }
  const mc = c.MoveCall as
    | {
        package: string;
        module: string;
        function: string;
        arguments: unknown[];
        typeArguments: string[];
      }
    | undefined;
  if (!mc) return null;
  return {
    target: `${mc.package}::${mc.module}::${mc.function}`,
    args: mc.arguments,
    tyArgs: mc.typeArguments,
  };
}

describe('buildAERTransaction (cognition path)', () => {
  it('emits 4 commands when actionCall + execution are both null', () => {
    const tx = buildAERTransaction(
      {
        ...baseInput(),
        envelope: {
          eventClass: 1,
          actionType: 'noop.v1',
          actionSchemaVersion: 1,
          payloadCodec: 'bcs',
          payloadHash: new Array(32).fill(0),
          payloadBytes: [],
          actionSummary: '',
          actionOutcome: 2,
        },
        actionCall: null,
        execution: null,
      },
      CFG,
    );
    const cmds = getCommands(tx);
    expect(cmds).toHaveLength(4);
    const fns = cmds.map((c) => isMoveCall(c)?.target);
    expect(fns[0]).toBe(`${CFG.packageId}::baram::submit_proof_with_receipt`);
    expect(fns[1]).toBe(
      `${CFG.aerPackageId}::aer::create_report_with_receipt_capability`,
    );
    expect(fns[2]).toBe(`${CFG.executorPackageId}::executor::record_job_completion`);
    expect(fns[3]).toBe(`${CFG.executorPackageId}::executor_tier::refresh_tier_from_state`);
  });
});

describe('buildAERTransaction (execution path)', () => {
  it('emits 10 commands matching the DV9 layout (BUY: NUSDC -> NBTC)', () => {
    const actionCall: ActionCallSpec = {
      targetPackage: DEEPBOOK_PKG,
      module: 'pool',
      fn: 'swap_exact_quote_for_base',
      typeArguments: [NBTC, NUSDC],
      args: [
        { kind: 'object', id: POOL },
        { kind: 'pipe', from: 'withdraw_coin' },
        { kind: 'pipe', from: 'zero_deep' },
        { kind: 'pure', bytes: new Uint8Array(8) },
        { kind: 'object', id: '0x6' },
      ],
    };
    const tx = buildAERTransaction(
      {
        ...baseInput(),
        envelope: {
          eventClass: 2,
          actionType: 'trade.swap.v1',
          actionSchemaVersion: 1,
          payloadCodec: 'bcs',
          payloadHash: new Array(32).fill(0),
          payloadBytes: [],
          actionSummary: '',
          actionOutcome: 1,
        },
        actionCall,
        execution: {
          escrow: {
            objectId: '0x' + 'ba'.repeat(32),
            initialSharedVersion: 200n,
            capabilityId: CAP_REF.objectId,
          },
          spend: { inputAssetType: NUSDC, amount: 1_000_000n },
          outputAssetType: NBTC,
          deepType: DEEP,
          outputCoinResult: { primary: 0, leftoverInput: 1, leftoverDeep: 2 },
          expectedCapabilityVersion: CAP_REF.cap.version,
        },
      },
      CFG,
    );
    const cmds = getCommands(tx);
    expect(cmds).toHaveLength(10);

    const fns = cmds.map((c) => isMoveCall(c)!.target);
    const SUI_PKG = '0x' + '00'.repeat(31) + '02';
    expect(fns).toEqual([
      `${CFG.aerPackageId}::escrow::withdraw_for_action`,
      `${SUI_PKG}::coin::zero`,
      `${DEEPBOOK_PKG}::pool::swap_exact_quote_for_base`,
      `${CFG.aerPackageId}::escrow::settle_action`,
      `${CFG.aerPackageId}::escrow::deposit_swap_leftover`,
      `${SUI_PKG}::coin::destroy_zero`,
      `${CFG.packageId}::baram::submit_proof_with_receipt`,
      `${CFG.aerPackageId}::aer::create_report_with_receipt_capability`,
      `${CFG.executorPackageId}::executor::record_job_completion`,
      `${CFG.executorPackageId}::executor_tier::refresh_tier_from_state`,
    ]);

    // Cmd 0: withdraw_for_action<NUSDC>
    expect(isMoveCall(cmds[0])!.tyArgs).toEqual([NUSDC]);
    // Cmd 1: coin::zero<DEEP>
    expect(isMoveCall(cmds[1])!.tyArgs).toEqual([DEEP]);
    // Cmd 2: swap with <Base, Quote>
    expect(isMoveCall(cmds[2])!.tyArgs).toEqual([NBTC, NUSDC]);

    // Pipe wiring: swap's arg[1] (input coin) must reference Cmd 0's
    // first return; arg[2] (deep_in) must reference Cmd 1's first
    // return. @mysten/sui represents these as
    // { $kind: 'Result', Result: <cmd_index> } or
    // { $kind: 'NestedResult', NestedResult: [cmd_index, nested_index] }.
    const swapArgs = isMoveCall(cmds[2])!.args;
    const inputArg = swapArgs[1] as Record<string, unknown>;
    const deepArg = swapArgs[2] as Record<string, unknown>;

    const inputNested = inputArg.NestedResult as [number, number] | undefined;
    const inputResult = inputArg.Result as number | undefined;
    // Cmd 0 returns a tuple — should be NestedResult [0, 0]
    expect(inputNested?.[0] ?? inputResult).toBe(0);
    expect(deepArg.Result ?? (deepArg.NestedResult as [number, number])?.[0]).toBe(1);

    // Cmd 3: settle_action<NBTC>, 4 args (escrow, cap, obligation, primaryOut)
    const settle = isMoveCall(cmds[3])!;
    expect(settle.tyArgs).toEqual([NBTC]);
    expect(settle.args).toHaveLength(4);
    // obligation arg is Cmd 0.1
    const obligationArg = settle.args[2] as Record<string, unknown>;
    const obligationNested = obligationArg.NestedResult as [number, number] | undefined;
    expect(obligationNested?.[0]).toBe(0);
    expect(obligationNested?.[1]).toBe(1);
    // primaryOut arg is Cmd 2.<primary=0>
    const primaryArg = settle.args[3] as Record<string, unknown>;
    const primaryNested = primaryArg.NestedResult as [number, number] | undefined;
    expect(primaryNested?.[0]).toBe(2);
    expect(primaryNested?.[1]).toBe(0);

    // Cmd 4: deposit_swap_leftover<NUSDC>, leftoverInput is Cmd 2.<leftoverInput=1>
    const dep = isMoveCall(cmds[4])!;
    expect(dep.tyArgs).toEqual([NUSDC]);
    const leftoverInputArg = dep.args[2] as Record<string, unknown>;
    const leftoverNested = leftoverInputArg.NestedResult as [number, number] | undefined;
    expect(leftoverNested?.[0]).toBe(2);
    expect(leftoverNested?.[1]).toBe(1);

    // Cmd 5: coin::destroy_zero<DEEP>, leftoverDeep is Cmd 2.<leftoverDeep=2>
    const destroy = isMoveCall(cmds[5])!;
    expect(destroy.tyArgs).toEqual([DEEP]);
    const destroyArg = destroy.args[0] as Record<string, unknown>;
    const destroyNested = destroyArg.NestedResult as [number, number] | undefined;
    expect(destroyNested?.[0]).toBe(2);
    expect(destroyNested?.[1]).toBe(2);
  });

  it('emits 10 commands matching the DV9 layout (SELL: NBTC -> NUSDC)', () => {
    // SELL flips outputCoinResult.primary/leftoverInput vs BUY: the
    // pool returns (Coin<Base>, Coin<Quote>, Coin<DEEP>) in fixed
    // order, so when input=NBTC the leftover is `0` (base) and the
    // primary output is `1` (quote). A regression that swaps these
    // positions would silently deposit the swap output as "leftover"
    // and refund nothing to the trader.
    const actionCall: ActionCallSpec = {
      targetPackage: DEEPBOOK_PKG,
      module: 'pool',
      fn: 'swap_exact_base_for_quote',
      typeArguments: [NBTC, NUSDC],
      args: [
        { kind: 'object', id: POOL },
        { kind: 'pipe', from: 'withdraw_coin' },
        { kind: 'pipe', from: 'zero_deep' },
        { kind: 'pure', bytes: new Uint8Array(8) },
        { kind: 'object', id: '0x6' },
      ],
    };
    const tx = buildAERTransaction(
      {
        ...baseInput(),
        envelope: {
          eventClass: 2,
          actionType: 'trade.swap.v1',
          actionSchemaVersion: 1,
          payloadCodec: 'bcs',
          payloadHash: new Array(32).fill(0),
          payloadBytes: [],
          actionSummary: '',
          actionOutcome: 1,
        },
        actionCall,
        execution: {
          escrow: {
            objectId: '0x' + 'ba'.repeat(32),
            initialSharedVersion: 200n,
            capabilityId: CAP_REF.objectId,
          },
          spend: { inputAssetType: NBTC, amount: 100_000n },
          outputAssetType: NUSDC,
          deepType: DEEP,
          // Pool returns are positional: idx 0 = Coin<Base> (NBTC),
          // idx 1 = Coin<Quote> (NUSDC), idx 2 = Coin<DEEP>.
          // SELL primary = NUSDC = idx 1.
          outputCoinResult: { primary: 1, leftoverInput: 0, leftoverDeep: 2 },
          expectedCapabilityVersion: CAP_REF.cap.version,
        },
      },
      CFG,
    );
    const cmds = getCommands(tx);
    expect(cmds).toHaveLength(10);

    // Cmd 0: withdraw_for_action<NBTC> — input asset is the base.
    expect(isMoveCall(cmds[0])!.tyArgs).toEqual([NBTC]);
    // Cmd 2: swap_exact_base_for_quote<NBTC, NUSDC>
    expect(isMoveCall(cmds[2])!.target).toBe(
      `${DEEPBOOK_PKG}::pool::swap_exact_base_for_quote`,
    );
    expect(isMoveCall(cmds[2])!.tyArgs).toEqual([NBTC, NUSDC]);

    // Cmd 3: settle_action<NUSDC>; primaryOut is Cmd 2.<primary=1>
    const settle = isMoveCall(cmds[3])!;
    expect(settle.tyArgs).toEqual([NUSDC]);
    const primaryArg = settle.args[3] as Record<string, unknown>;
    const primaryNested = primaryArg.NestedResult as [number, number] | undefined;
    expect(primaryNested?.[0]).toBe(2);
    expect(primaryNested?.[1]).toBe(1);

    // Cmd 4: deposit_swap_leftover<NBTC>; leftoverInput is Cmd 2.<0>
    const dep = isMoveCall(cmds[4])!;
    expect(dep.tyArgs).toEqual([NBTC]);
    const leftoverInputArg = dep.args[2] as Record<string, unknown>;
    const leftoverNested = leftoverInputArg.NestedResult as [number, number] | undefined;
    expect(leftoverNested?.[0]).toBe(2);
    expect(leftoverNested?.[1]).toBe(0);

    // Cmd 5: coin::destroy_zero<DEEP>; Cmd 2.<2>
    const destroy = isMoveCall(cmds[5])!;
    expect(destroy.tyArgs).toEqual([DEEP]);
    const destroyArg = destroy.args[0] as Record<string, unknown>;
    const destroyNested = destroyArg.NestedResult as [number, number] | undefined;
    expect(destroyNested?.[0]).toBe(2);
    expect(destroyNested?.[1]).toBe(2);
  });

  it('refuses to compose when actionCall present without execution plan', () => {
    expect(() =>
      buildAERTransaction(
        {
          ...baseInput(),
          envelope: {
            eventClass: 2,
            actionType: 'trade.swap.v1',
            actionSchemaVersion: 1,
            payloadCodec: 'bcs',
            payloadHash: new Array(32).fill(0),
            payloadBytes: [],
            actionSummary: '',
            actionOutcome: 1,
          },
          actionCall: {
            targetPackage: DEEPBOOK_PKG,
            module: 'pool',
            fn: 'swap_exact_quote_for_base',
            typeArguments: [NBTC, NUSDC],
            args: [],
          },
          execution: null,
        },
        CFG,
      ),
    ).toThrow(/execution plan/);
  });

  it('refuses when execution.escrow.capabilityId mismatches capRef', () => {
    expect(() =>
      buildAERTransaction(
        {
          ...baseInput(),
          envelope: {
            eventClass: 2,
            actionType: 'trade.swap.v1',
            actionSchemaVersion: 1,
            payloadCodec: 'bcs',
            payloadHash: new Array(32).fill(0),
            payloadBytes: [],
            actionSummary: '',
            actionOutcome: 1,
          },
          actionCall: {
            targetPackage: DEEPBOOK_PKG,
            module: 'pool',
            fn: 'swap_exact_quote_for_base',
            typeArguments: [NBTC, NUSDC],
            args: [
              { kind: 'object', id: POOL },
              { kind: 'pipe', from: 'withdraw_coin' },
              { kind: 'pipe', from: 'zero_deep' },
              { kind: 'pure', bytes: new Uint8Array(8) },
              { kind: 'object', id: '0x6' },
            ],
          },
          execution: {
            escrow: {
              objectId: '0x' + 'ba'.repeat(32),
              initialSharedVersion: 200n,
              capabilityId: '0x' + 'de'.repeat(32),
            },
            spend: { inputAssetType: NUSDC, amount: 1_000_000n },
            outputAssetType: NBTC,
            deepType: DEEP,
            outputCoinResult: { primary: 0, leftoverInput: 1, leftoverDeep: 2 },
            expectedCapabilityVersion: CAP_REF.cap.version,
          },
        },
        CFG,
      ),
    ).toThrow(/capabilityId mismatch/);
  });
});
