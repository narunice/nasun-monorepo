# PR1.5 — Atomic Swap Path Specification

**Status**: Wire schema frozen 2026-05-16. Runtime/Lambda implementation lands in next session.
**Plan**: [`/home/naru/.claude/plans/2026-05-16-pr1.5-swap-path-implementation-plan-v3.md`](../../../../.claude/plans/2026-05-16-pr1.5-swap-path-implementation-plan-v3.md)
**Scope**: Atomic 6-call PTB that withdraws NUSDC from AgentEscrow, swaps on whitelisted DeepBook v3 pool, deposits leftover, settles output coin back into escrow, and emits AER — all in a single PTB.

---

## 1. Facts (verified against Move)

### 1.1 Escrow ABI

From `apps/baram/contracts-aer/sources/escrow.move`:

| Function | Signature (relevant args) | Returns |
|---|---|---|
| `withdraw_for_action<T>` | `&mut AgentEscrow, &Capability, amount: u64, expected_capability_version: u64, ctx` | `(Coin<T>, ActionObligation)` |
| `deposit_swap_leftover<T>` | `&mut AgentEscrow, &Capability, leftover: Coin<T>` | (none) |
| `settle_action<T>` | `&mut AgentEscrow, &Capability, ActionObligation, output: Coin<T>` | (none) |

Hard rails enforced on-chain:
- `cap.version == expected_capability_version` (TOCTOU guard).
- `cap.allowed_assets` covers the type T at settle/leftover.
- `cap.risk_limits.max_slippage_bps` checked at settle.
- ActionObligation is a hot potato; the PTB cannot drop it.

### 1.2 Capability shared object

From `apps/baram/contracts-aer/sources/capability.move`:

- `Capability` is a shared object passed as `&Capability` (immutable) to all swap-path calls.
- `set_pause_mode(cap: &mut Capability, mode: u8, ctx)` (L350) bumps `cap.version` (L363) → any in-flight cycle with a stale `expected_capability_version` aborts on withdraw. This is the **nuclear option** kill switch.
- `allowed_targets` has a getter at L526 but is **NOT** enforced anywhere in withdraw/settle/leftover. Lambda is the only boundary that pins `targetPackage`.

### 1.3 DeepBook v3 swap ABI

Confirmed via `sui_getNormalizedMoveFunction` against `0xb4a100f2…78134::pool` on devnet (2026-05-16).

| fn | typeArguments | args (in PTB order) |
|---|---|---|
| `swap_exact_quote_for_base<Base, Quote>` | `[Base, Quote]` | `[pool: &mut Pool<Base,Quote>, quote_in: Coin<Quote>, deep_in: Coin<DEEP>, min_base_out: u64, clock: &Clock]` |
| `swap_exact_base_for_quote<Base, Quote>` | `[Base, Quote]` | `[pool, base_in: Coin<Base>, deep_in: Coin<DEEP>, min_quote_out: u64, clock]` |
| Returns | `(Coin<Base>, Coin<Quote>, Coin<DEEP>)` | One of base/quote is zero-coin (leftover side), the other is the swap output; `Coin<DEEP>` is always zero in whitelisted-pool config. |
| `get_quantity_out` (optional dry-run quote) | `[Base, Quote]` | `(pool: &Pool, base_qty: u64, quote_qty: u64, clock: &Clock) -> (u64 base_out, u64 quote_out, u64 deep_required)` |

**Operating pool (NBTC/NUSDC) — confirmed**

| field | value |
|---|---|
| `objectId` | `0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0` |
| `type` | `Pool<NBTC, NUSDC>` (base=NBTC, quote=NUSDC) |
| `owner` | `Shared { initial_shared_version: 144448 }` |
| `deepbookPackage` | `0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134` |
| `DEEP type` | `0x71afcf8e…1c3e::deep::DEEP` (always `0x2::coin::zero<DEEP>()` — Pado pool whitelisted, fee=0) |

Lambda raw PTB builder MUST encode the pool input as `SharedObjectRef { objectId, initialSharedVersion: 144448, mutable: true }`. Runtime path uses `tx.object(poolId)` which the SDK resolves to the same shared ref. Reference implementation already in production: [trader.ts:299-310](../../nasun-ai-runtime/src/presets/trader.ts#L299-L310).

---

## 2. 6-call PTB structure

| # | Move call | typeArguments | args | ctx |
|---|---|---|---|---|
| 0 | `aer::escrow::withdraw_for_action<T_in>` | `[spend.coinAssetType]` | `[escrowRef, capArg, u64(spend.amount), u64(expectedCapabilityVersion)]` | (SDK auto) |
| 1 | `0x2::coin::zero<DEEP>` | `[DEEP_TYPE]` | `[]` | (SDK auto) |
| 2 | `<deepbookPackage>::pool::<swap_fn>` | `[Base, Quote]` (from `actionCall.typeArguments`) | resolved from `actionCall.args` (pipe `withdraw_coin` → coinIn from cmd 0; pipe `zero_deep` → zeroDeep from cmd 1; pure/object → as encoded) | (SDK auto) |
| 3 | `0x2::coin::destroy_zero<DEEP>` | `[DEEP_TYPE]` | `[deepOut]` | — |
| 4 | `aer::escrow::deposit_swap_leftover<T_in>` | `[spend.coinAssetType]` | `[escrowRef, capArg, leftoverInput]` | — |
| 5 | `aer::escrow::settle_action<T_out>` | `[outputType]` | `[escrowRef, capArg, obligation, primaryOutput]` | (SDK auto) |
| 6+ | `aer::report::create_report_with_receipt_capability` (class=2) | — | — | (SDK auto) |

Direction logic:
- `fn == 'swap_exact_quote_for_base'` → direction=BUY → `T_in=Quote`, `T_out=Base`, `leftoverInput=quoteOut`, `primaryOutput=baseOut`.
- `fn == 'swap_exact_base_for_quote'` → direction=SELL → `T_in=Base`, `T_out=Quote`, `leftoverInput=baseOut`, `primaryOutput=quoteOut`.

### 2.1 Lambda PTB builder (canonical reference)

```ts
const tx = new Transaction();

const escrowRef = tx.sharedObjectRef({
  objectId: swap.escrow.objectId,
  initialSharedVersion: swap.escrow.initialSharedVersion,
  mutable: true,  // withdraw / settle / leftover all take &mut AgentEscrow
});
const capArg = tx.sharedObjectRef({
  objectId: swap.escrow.capabilityId,
  initialSharedVersion: swap.escrow.capabilityInitialSharedVersion,
  mutable: false,  // all swap-path entries take &Capability immutable
});

// Cmd 0
const [coinIn, obligation] = tx.moveCall({
  target: `${AER_PACKAGE_ID}::escrow::withdraw_for_action`,
  typeArguments: [swap.spend.coinAssetType],
  arguments: [
    escrowRef,
    capArg,
    tx.pure.u64(BigInt(swap.spend.amount)),
    tx.pure.u64(BigInt(swap.expectedCapabilityVersion)),  // body field, used as-is — no re-fetch
  ],
});

// Cmd 1
const [zeroDeep] = tx.moveCall({
  target: '0x2::coin::zero',
  typeArguments: [DEEP_TYPE_FROM_ENV],
});

// Cmd 2
const [baseOut, quoteOut, deepOut] = tx.moveCall({
  target: `${swap.actionCall.targetPackage}::${swap.actionCall.module}::${swap.actionCall.fn}`,
  typeArguments: swap.actionCall.typeArguments,
  arguments: resolveArgs(swap.actionCall.args, { withdraw_coin: coinIn, zero_deep: zeroDeep, tx }),
});

// Cmd 3
tx.moveCall({
  target: '0x2::coin::destroy_zero',
  typeArguments: [DEEP_TYPE_FROM_ENV],
  arguments: [deepOut],
});

// Cmd 4
const direction = swap.actionCall.fn === 'swap_exact_quote_for_base' ? 'BUY' : 'SELL';
const leftoverInput = direction === 'BUY' ? quoteOut : baseOut;
const primaryOutput = direction === 'BUY' ? baseOut : quoteOut;
tx.moveCall({
  target: `${AER_PACKAGE_ID}::escrow::deposit_swap_leftover`,
  typeArguments: [swap.spend.coinAssetType],
  arguments: [escrowRef, capArg, leftoverInput],
});

// Cmd 5
const outputType = direction === 'BUY' ? swap.actionCall.typeArguments[0] : swap.actionCall.typeArguments[1];
tx.moveCall({
  target: `${AER_PACKAGE_ID}::escrow::settle_action`,
  typeArguments: [outputType],
  arguments: [escrowRef, capArg, obligation, primaryOutput],
});

// Cmd 6+: AER report creation (class=2) — same PTB for atomicity.
```

---

## 3. Wire schema (runtime → Lambda)

`POST /execute-capability` body additions vs PR1.A:

```ts
actionCallHash: string;  // HOLD: ZERO_ACTION_CALL_HASH; swap: computeActionCallHash({actionCall, escrow, spend})
actionCall: ActionCallSpecWire | null;
escrow: {
  objectId: string;
  initialSharedVersion: string;
  capabilityId: string;
  capabilityInitialSharedVersion: string;  // NEW in PR1.5
} | null;
spend: { coinAssetType: string; amount: string } | null;
```

Where `ActionCallSpecWire`:
```ts
{
  targetPackage: string;
  module: string;
  fn: string;
  typeArguments: string[];
  args: Array<{
    kind: 'object' | 'pure' | 'pipe';
    id?: string;       // kind=object
    bytes?: string;    // kind=pure, base64 BCS
    from?: 'withdraw_coin' | 'zero_deep';  // kind=pipe
  }>;
}
```

### 3.1 `actionCallHash` binding

- HOLD: `actionCallHash = ZERO_ACTION_CALL_HASH = 0x00..00`.
- Swap: `actionCallHash = sha256(canonicalJson({actionCall, escrow, spend}))`.

Sig2 covers `actionCallHash` via `canonicalSettle()` (slot 11). Lambda recomputes from the wire body and asserts byte-equality before signing the PTB → any tamper between runtime and Lambda fails sig2 verification.

Canonical JSON: lexicographic key sort at every depth, no whitespace. Identical implementation in [`apps/nasun-ai-runtime/src/sig.ts`](../../../apps/nasun-ai-runtime/src/sig.ts) and [`apps/baram/cdk/lambda-src/executor/src/_shared/canonical-hash.ts`](../cdk/lambda-src/executor/src/_shared/canonical-hash.ts). Pinned by golden vector test [`sig.test.ts`](../../../apps/nasun-ai-runtime/src/sig.test.ts) — Lambda must assert the same hash for the same SAMPLE.

### 3.2 `expectedCapabilityVersion` invariant

- Runtime fetches `cap.version` at cycle start, passes as `body.expectedCapabilityVersion`, signs into sig2.
- **Lambda MUST use the body value as-is** when building PTB cmd 0; re-fetching breaks TOCTOU protection. If the wallet-signed nuclear option fires mid-cycle (`set_pause_mode` bumps version), the on-chain `withdraw_for_action` aborts with `E_INVALID_CAPABILITY_VERSION` — by design.

### 3.3 `capabilityInitialSharedVersion`

- The Capability shared object's initialSharedVersion is immutable post-creation. Lambda uses it to build the `sharedObjectRef` for the PTB without an extra `getObject` roundtrip per cycle.
- Not covered by sig2; Lambda performs a self-check (`getObject({showOwner:true})` once, cache 24h+) and asserts the wire value matches the on-chain initialSharedVersion. Cache invariant: the value is immutable.
- Rationale for not extending sig2: the canonical pipe-delimited slot list (`sig.ts:canonicalSettle`) already covers `capabilityId` and `expectedCapabilityVersion`; adding initialSharedVersion would require coordinating slot-11+ across sig-verify.ts. Lambda self-check is simpler and equivalent in safety (immutable + on-chain reconciliation).

---

## 4. Validation at Lambda boundary

Order (fail-fast):

1. **L2 kill switch**: `LAMBDA_SWAP_DISABLED === 'true'` → reject any non-null `actionCall` with 4xx.
2. **Wire well-formed**: `actionCall`, `escrow`, `spend` all non-null XOR all null.
3. **actionCallHash recompute**: `sha256(canonicalJson({actionCall, escrow, spend}))` must equal `body.actionCallHash`.
4. **Sig2 verify**: existing PR1.A flow over `canonicalSettle()`.
5. **Address normalize**: apply `normalizeSuiAddress()` to `actionCall.targetPackage`, `actionCall.args[0].id` (pool), `escrow.objectId`, `escrow.capabilityId` before allow-list compare.
6. **Package allow-list**: `actionCall.targetPackage ∈ DEEPBOOK_PACKAGE_ALLOWLIST` (Lambda env, comma-separated).
7. **Pool allow-list**: `actionCall.args[0]` must be `kind=object` and `actionCall.args[0].id ∈ DEEPBOOK_POOL_ALLOWLIST` (Lambda env). This is the **only** boundary that blocks attacker-pool routing.
8. **Capability fetch + assertions**: cap.owner == principalAddress, cap.version == expectedCapabilityVersion, cap.pause_mode == 0.
9. **Asset coverage**: `spend.coinAssetType ∈ cap.allowed_assets`, `actionCall.typeArguments[0] ∈ cap.allowed_assets`, `actionCall.typeArguments[1] ∈ cap.allowed_assets`.
10. **Slippage cap**: `cap.risk_limits.max_slippage_bps <= MAX_SLIPPAGE_BPS_CAP` (Lambda env, default 500).
11. **clientMinOut sanity**: `actionCall.args[3]` (BCS u64) decodes successfully (any valid u64 passes).
12. **Cap initialSharedVersion**: `getObject(capabilityId).initialSharedVersion === body.escrow.capabilityInitialSharedVersion` (cache 24h+).

Note: server-side `quoteMinOut` recomputation is **not performed** in PR1.5. The pool allow-list is the precision MEV defense for the prototype. Trade-off: ~200ms RPC saved per cycle, no devInspect flake; lose precise sandwich detection against attacker pools (mitigated by allow-list).

---

## 5. Environment variables (Lambda)

| Variable | Default | Purpose |
|---|---|---|
| `LAMBDA_SWAP_DISABLED` | `true` (at deploy) | Canonical kill switch (L2). Single-action rollback. |
| `DEEPBOOK_PACKAGE_ALLOWLIST` | `${TRADER_CONFIG.deepbookPackage}` | targetPackage pin (Lambda-only — no on-chain enforce). |
| `DEEPBOOK_POOL_ALLOWLIST` | `${TRADER_CONFIG.pool}` | Pool object id pin (attacker-pool defense). |
| `DEEP_TYPE` | `${TRADER_CONFIG.deepType}` | typeArg for `coin::zero<DEEP>` / `destroy_zero<DEEP>`. |
| `MAX_SLIPPAGE_BPS_CAP` | `500` (5%) | Upper bound on `cap.risk_limits.max_slippage_bps`. |

---

## 6. Kill switches

| Layer | Mechanism | Latency | Notes |
|---|---|---|---|
| L1 (runtime default) | `PR1A_SWAP_DISABLED=true` env at chat-server | ~10s pm2 hot-swap | Operational tilt; not the cryptographic boundary. |
| L2 (canonical) | `LAMBDA_SWAP_DISABLED=true` Lambda env | Next invocation | **Single-action rollback.** Cryptographic boundary lives in Lambda, so this is the only authoritative switch. |
| Nuclear | wallet-signed `capability::set_pause_mode(cap, PAUSE_WAKE_BLOCKED, ctx)` | Tx finality | Permanent revoke — bumps cap.version, invalidates **all** in-flight cycles. Recovery: restart all runtime spawns + re-fetch cap.version + sign new sig2 for new cycles. |

Nuclear option tx skeleton:
```ts
const tx = new Transaction();
tx.moveCall({
  target: `${CAPABILITY_PACKAGE_ID}::capability::set_pause_mode`,
  arguments: [
    tx.sharedObjectRef({
      objectId: CAP_ID,
      initialSharedVersion: CAP_INITIAL_SHARED_VERSION,
      mutable: true,  // set_pause_mode takes &mut Capability
    }),
    tx.pure.u8(2),  // PAUSE_WAKE_BLOCKED
  ],
});
// signed by cap.owner wallet
```

---

## 7. Deploy ordering (Phase E)

| Step | Action | Gate |
|---|---|---|
| 24 | Runtime prod deploy with `PR1A_SWAP_DISABLED=true` baked (behavior unchanged). | runtime |
| 25 | Lambda prod deploy with `LAMBDA_SWAP_DISABLED=true`. HOLD path uses ZERO hash; swap path blocked at boundary. | Lambda |
| 25.5 | Dev smoke: 1 NUSDC test cycle — Lambda env toggle true→false→true to validate code path. | dev burn-in |
| 26 | Lambda env flip `LAMBDA_SWAP_DISABLED=false` → canonical kill switch open. | Lambda gate |
| 27 | Runtime env flip `PR1A_SWAP_DISABLED=false` + JB03 spawn restart. | runtime gate |
| 28 | Monitor first BUY/SELL cycle (5min × 2). | verify |
| 29 | Rollback path: `LAMBDA_SWAP_DISABLED=true` (single env update). Nuclear option remains `set_pause_mode`. | rollback |

L2 is canonical authority. L1 is operational default but not the safety net.

---

## 8. Open follow-ups (out of PR1.5 scope)

| # | Item | Disposition |
|---|---|---|
| R10 | AER is not a cryptographic witness of swap success | PR1.6 candidate: extend `SettleReceipt` |
| — | Single BCS-PTB blob wire format (replace ActionCallSpec) | Post-PR1.5 design retro |
| — | sig2 cover for `capabilityInitialSharedVersion` | Out of scope (Lambda self-check sufficient) |
| — | "5-call" doc drift (resolved 2026-05-16) | Verified: AER_DESIGN.md has no "5-call" string; manual-execution.ts comment updated to 6-call |
