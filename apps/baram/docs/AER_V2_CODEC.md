# AER v2 Canonical Codec Specification

> Off-chain decoder spec for the AER v2 schema implemented in
> `apps/baram/contracts-aer/sources/aer.move`. Reference implementation lives
> at `packages/baram-sdk/src/aer/`.

Status: draft (Plan A foundation). Subsequent plans (B/C/E) extend the
action_type registry and tighten governance.

---

## 1. Canonical wire order

Move's BCS serializes each struct field in declaration order. The AER v2
canonical wire order is the declaration order in
`baram_aer::aer`. Field declarations MUST NEVER be reordered after publish.

Top-level (UID + 11 fields):

```
AIExecutionReport {
  id, request_id, requester, executor, payment, inference, why, trust,
  time, chain, envelope, wake, replay
}
```

`WhyContext` wire order (Plan B added one field):

```
WhyContext {
  purpose,            // Option<String>
  policy_version,     // Option<u64>  - snapshotted from registry.policy_version
  capability_version, // Option<u64>  - Plan B: snapshotted from cap.version on gated path, None on ungated. Wire-position locked here.
  constraints,        // Option<String>
}
```

Each sub-struct's field order is fixed in the Move source. When in doubt,
read `apps/baram/contracts-aer/sources/aer.move` directly - the declared
field order there is the canonical wire order, full stop.

---

## 2. Primitive encoding

- **u8 / u16 / u32 / u64** - little-endian fixed width.
- **bool** - one byte: `0x00` (false) / `0x01` (true).
- **address / ID** - 32 bytes raw.
- **String** - UTF-8 bytes, ULEB128 length prefix.
- **vector<T>** - ULEB128 length prefix + T element encoding repeated.
- **Option<T>** - one byte tag: `0x00` (None, no value follows) /
  `0x01` (Some, value follows).

SHA-256 hashes are always 32-byte raw.

`intent_id` and `parent_intent_id` are 16-byte raw UUIDv7 per RFC 9562 §5.7.

---

## 3. VecMap two-layer wrapping

`sui::vec_map::VecMap<K, V>` BCS-encodes as:

```
VecMap<K, V> {
  contents: vector<Entry<K, V>>
}
Entry<K, V> { key: K, value: V }
```

The off-chain codec MUST define both layers explicitly. `replay_extras` uses
`VecMap<String, vector<u8>>`.

### Canonical key ordering

Writers MUST insert keys in **strict-ascending UTF-8 byte order**: encode
each key as UTF-8 bytes, compare byte by byte, and require strictly less
than. The reference implementation is `compareKeysCanonical(a, b)` in
`@nasun/baram-sdk` (`packages/baram-sdk/src/aer/helpers.ts`), which uses
`TextEncoder` to produce the UTF-8 byte sequence and does a manual byte
comparison. In Node-style runtimes `Buffer.compare(Buffer.from(a, 'utf8'),
Buffer.from(b, 'utf8'))` is equivalent.

This is **not** enforced on-chain. The Move entry checks length cap + per-key
size cap + duplicate-key abort (the latter falls out of `vec_map::insert`),
but does not verify ordering. Off-chain decoders MUST verify ordering and
throw `AER_NONCANONICAL_REPLAY_EXTRAS` if violated. Indexers SHOULD drop the
AER from canonical projections on violation and surface it as quarantined.

`localeCompare`, JS `<`, and `Array.prototype.sort` (which uses locale by
default in non-V8 environments) are forbidden.

---

## 4. payload_hash binding

```
payload_hash = SHA-256( action_type_bytes || payload_bytes )
```

where `||` is byte concatenation. This binds `action_type` and
`payload_bytes` cryptographically. The contract verifies length (32 bytes)
but not content. The off-chain decoder MUST recompute and verify the hash;
mismatch surfaces as `AER_PAYLOAD_HASH_MISMATCH`. Indexers SHOULD reject
mismatched AERs from canonical projections.

This is a one-line spec change with zero on-chain cost that prevents
type-label/payload jamming attacks.

---

## 5. payload_codec

`payload_codec` is fixed to `"bcs"` in this schema version (the v2 canonical
wire format). The Move entry rejects any other value. This is **not** a
permanent protocol invariant; a future schema_version bump (new struct type
`AIExecutionReportV3` or similar) may introduce other codecs (`protobuf`,
`dag-cbor`, zk-friendly encodings). Off-chain decoders may pre-check the
codec field, but the on-chain assertion is authoritative.

---

## 6. Enum forward-compat

`event_class`, `action_outcome`, and `triggered_by_type` are append-only
enums. Values listed in the Move source today MAY be deprecated in future
schemas but MUST NOT be reused for different semantics.

Off-chain decoders MUST NOT throw on unknown enum values. Instead, surface
them as the sentinel `"unknown"`:

- `event_class`: known values map to `cognition` / `execution` / `settlement`
  / `observation` / `coordination`. Unknown → `unknown`.
- `action_outcome`: known values map to `success` / `hold-noop` / `failure`.
  Unknown → `unknown`.
- `triggered_by_type`: known values map to `heartbeat` / `user_message` /
  `price_alert` / `manual`. Unknown → `unknown`.

This lets the schema evolve additively without breaking deployed decoders.

---

## 7. action_type form and registry

### Well-formedness (enforced by Move entry)

- Length 1..=64.
- All bytes in `0x20..=0x7E` (ASCII printable).
- At least one `.` present.

Recommended form: `<domain>.<verb>.v<n>` (e.g., `trade.swap.v1`). The Move
layer does not enforce vendor prefixes; vendor namespace governance is
deferred to Plan F (see §9).

### Registry (Plan A - 1차 공개)

Four typed action payload schemas. Off-chain decoders dispatch on
`envelope.action_type` and decode `payload_bytes` as the typed struct below.
Unregistered types decode as raw bytes (forward-compat).

#### trade.swap.v1

`event_class = execution(2)`.

```
{
  pool_id: address,
  direction: u8,          // 1=buy, 2=sell
  input_amount: u64,
  min_output_amount: u64,
  max_slippage_bps: u16,
  deadline_ms: u64,
}
```

#### analysis.v1

`event_class = cognition(1)`. Used for user-question responses, market
interpretation, HOLD reasoning that is externally inspectable.

```
{
  topic: String,                    // free-form, ≤ 280 bytes recommended
  response_summary_hash: vector<u8>, // SHA-256 of full reasoning text
  references: vector<vector<u8>>,    // list of prior AER object ids (32-byte addresses)
}
```

#### noop.v1

`event_class = cognition(1)`, `action_outcome = hold-noop(2)`. Emitted when a
wake produced an externally observable HOLD decision.

```
{
  reason_code: u8,        // 1=spread-too-wide, 2=low-confidence, 3=risk-cap, 4=other
  rationale_hash: vector<u8>,
}
```

#### executor.fee.v1

`event_class = settlement(3)`. Auto-emitted alongside execution AERs to
record the executor's earned fee. 1:1 with `SettlementReceipt` consumption.

```
{
  executor: address,
  fee_amount: u64,
  fee_token: u8,          // 0=NUSDC, 1=NASUN (matches AER PaymentContext.payment_token)
}
```

---

## 8. replay_extras reserved keys

The following keys are reserved for replay metadata. New keys are added via
PR to this document.

- `inference_params` - BCS-encoded inference parameters (temperature, top_p,
  etc.).
- `tokenizer_version` - UTF-8 string identifier.
- `retrieval_corpus_hash` - SHA-256 of the retrieval corpus snapshot.
- `memory_snapshot_hash` - SHA-256 of the agent's memory state at inference time.
- `tool_response_hash` - SHA-256 of concatenated tool call responses (when
  the agent uses external tools).

Inserts MUST follow strict-ascending UTF-8 byte order (§3).

---

## 9. Vendor namespace (deferred to Plan F)

Plan A defines action_types as the simple `<domain>.<verb>.v<n>` form. When
third-party executors emerge (post-launch), this document will add a
`<vendor>.<domain>.<verb>.v<n>` extension and a registry section listing
allowed vendor prefixes. Until then, all 1차 공개 action_types belong to the
Nasun/Baram default namespace by convention.

---

## 10. Witness-gated receipt consumption (M1 fix, 2026-05-12)

The invariant **economic settlement ⇔ canonical AER existence** is enforced at
the Move contract layer:

- `baram::baram::consume_receipt` takes a generic witness `W: drop` plus a
  reference to `BaramRegistry`. It uses `std::type_name::with_original_ids<W>()`
  to verify that:
  - `W`'s defining package address equals `BaramRegistry.aer_original_id`
    (set once post-publish via `set_aer_authority(AdminCap, ...)`).
  - `W`'s defining module name is exactly `"aer"`.
- `baram_aer::aer::AERWitness` is a `has drop` struct with no public
  constructor, so it can only be instantiated inside the `aer` module.
  `create_report_with_receipt` produces `AERWitness {}` inline before calling
  `consume_receipt`.
- Before `set_aer_authority` is called, `aer_original_id` is `@0x0` and
  every `consume_receipt` call aborts with `E_INVALID_AER_WITNESS` (11).
  This prevents settlements from completing on a misconfigured deployment.
- Tx-atomicity is provided by Sui PTB semantics: if AER creation aborts
  anywhere in the transaction, the entire PTB rolls back, including the
  NUSDC payout transfer inside `submit_proof_with_receipt`. Therefore
  "payout received without AER" is impossible at the chain level.

Migration note: if the AER package is re-published clean-slate (new original
id), the operator MUST call `set_aer_authority` again. Until then, every
`consume_receipt` call aborts and no new settlements complete. This is the
intended fail-closed behavior.

---

## 11. Canonical event boundary (Foundation 결정 7)

The host decides whether to emit an AER. AER MUST be emitted iff one or
more of the following hold:

- **Economic implication**: Budget is debited, an asset moves, settlement
  occurs.
- **User-facing decision**: The reasoning was surfaced to a user or produced
  in response to a user query.
- **Capability evaluation** (post Plan B): An action_call passed/failed
  capability/risk_limits checks.
- **Execution intent created**: A PTB was composed (regardless of whether it
  was submitted).
- **Externally-inspectable reasoning**: HOLD rationale, refusal cause,
  policy-change response - anything an external auditor should be able to
  see.

The following are **never** AER candidates and MUST stay in host trace only:

- Internal chain-of-thought, intermediate planning steps.
- Tool retries, retrieval rank adjustments.
- Memory ranking, prompt decomposition.
- Speculative plans not surfaced to the user.
- LLM self-correction loops.

Per-event-class normative bindings:

- `cognition`: externally-inspectable reasoning only. Internal noise
  excluded.
- `execution`: a state-changing onchain action MUST occur in the same PTB.
- `settlement`: 1:1 with `baram::baram::SettlementReceipt` consumption.
- `observation` (Phase 2): pure-read snapshots intended for replay
  reconstruction.
- `coordination` (Phase 2): multi-agent handoff messages.

### 11.1 `triggered_action` auto-fill for execution-class AERs (Plan C C3-v2)

Pre-C3-v2, `triggered_action` was caller-supplied and treated identically
for cognition and execution AERs: the trader passed the digest of "the
trade this analysis followed." For execution-class AERs (`event_class=2`)
this is the wrong shape — the digest of the trade IS the digest of THIS
PTB, which the caller cannot know before submission.

C3-v2 introduces a contract-side auto-fill (`aer.move` §1.3 / DV10):

- `event_class=1` (cognition): `triggered_action` is caller-supplied
  (`Option<address>`). Trader passes the digest of the *prior settled
  execution AER* (chains cognition to the trade it follows). Unchanged.
- `event_class=2` (execution): `triggered_action` is **always**
  overwritten with `tx_context::digest(ctx)` — the digest of the current
  PTB. Any caller-supplied value is silently dropped to prevent the
  trader from forging cross-tx attribution. Decoders MUST treat the
  field as authoritative for execution AERs.
- `event_class=3` (settlement): unchanged from Plan B. Caller-supplied;
  typically `None` since fee/refund pseudo-actions don't reference a
  preceding action.

Replay implication: cognition→execution chains via `triggered_action`
are forward-pointing for cognition (cognition AER points to its prior
trade) and self-referential for execution (the trade AER's digest IS
its own triggered_action). The combined chain is reconstructed by
joining `aer.parent_intent_id` (lineage) AND `aer.triggered_action`
(causation): cognition cycle N references trade N-1's digest, trade N
references its own.

`tx_context::digest` invariant: the digest is deterministic per PTB
but only available inside the same Move call, so the host MUST emit
the AER creation in the SAME PTB as the state-changing action (DV9
Cmd 7 follows Cmd 0–6 within one tx). Splitting them defeats the
auto-fill and was rejected during plan review.

---

## 12. Enum append-only

Re-emphasis (see §6): enum values for `event_class`, `action_outcome`, and
`triggered_by_type` are append-only forever. Deprecating a value is
acceptable; reusing the same integer for new semantics breaks deployed
decoders and historic AERs.

---

## 13. Object explosion + payload overflow future direction

The current model is AER-per-event. If cognition density spikes or single
reasoning bodies exceed the 8 KB `payload_bytes` cap, the following options
are reserved (not implemented in Plan A):

- (a) **Batched Merkle commitments**: aggregate N cognition events into one
  AER whose payload is a Merkle root, with leaf data off-chain.
- (b) **Hot/cold tiering**: indexer keeps recent N days in hot storage,
  archives older AERs to cold (onchain still authoritative).
- (c) **Ephemeral cognition trace + checkpointed canonical event**: host
  buffers fine-grained reasoning off-chain and emits periodic canonical
  checkpoints.
- (d) **Off-chain blob storage** (IPFS / Arweave / S3) + onchain
  commitment hash: `payload_bytes` contains only a 32-byte content
  identifier; full text lives off-chain. The reserved `replay_extras` key
  `external_blob_uri` carries the resolution URI.

Trigger conditions for activation:
- Mean `payload_bytes` size > 4 KB across a 7-day window, OR
- Per-day `E_PAYLOAD_TOO_LARGE` reject rate > 1%.

Activation procedure: host truncates reasoning text into a summary that
fits the 280-byte `action_summary` cap, emits a hash-only payload with the
external-blob URI in `replay_extras`, and stores the raw text in host trace
plus the off-chain blob.

---

## 14. Forward-compat handling for decoders

- Unknown `action_type` → return raw `payload_bytes`. Do not throw.
- Unknown `event_class` → surface as `"unknown"`. Do not throw.
- Unknown `action_outcome` / `triggered_by_type` → same.
- New replay_extras keys → preserve raw bytes; named accessors should fall
  back gracefully.

The contract is the source of truth for validation. Decoders should
*tolerate* schema extensions, not *enforce* them.

---

## 15. Indexer storage hints

For PostgreSQL projections:

- `intent_id` and `parent_intent_id`: store as `BYTEA` (16 bytes). Do NOT
  hex-encode at the column level; hex-encode only for display.
- Recommended indexes:
  - `CREATE INDEX idx_aer_intent_id ON aer_records (intent_id, execution_id);`
  - `CREATE INDEX idx_aer_parent_intent ON aer_records (parent_intent_id) WHERE parent_intent_id IS NOT NULL;`
  - `CREATE INDEX idx_aer_event_class ON aer_records (event_class, settled_at DESC);`
  - `CREATE INDEX idx_aer_action_type ON aer_records (action_type, settled_at DESC);`
  - `CREATE INDEX idx_aer_capability_version ON aer_records (capability_version, settled_at DESC) WHERE capability_version IS NOT NULL;` (Plan B)
- `payload_hash` and `payload_bytes`: store as `BYTEA`. Mark `payload_hash`
  `UNIQUE` only at the (request_id, payload_hash) pair level; the same
  reasoning can legitimately appear in distinct executions.
- `capability_version` (Plan B): store as `BIGINT NULL`. Null distinguishes
  ungated (settlement-only) AERs from gated AERs even when both come from
  the same executor/agent pair.

These hints are advisory. Plan A does not modify the indexer; subsequent
plans wire up the projections.

---

## 16. References

- Move source: `apps/baram/contracts-aer/sources/aer.move`
- Move tests: `apps/baram/contracts-aer/tests/aer_test.move`

---

## 17. Capability gating (Plan B)

Plan B adds a `baram_aer::capability::Capability` shared object that gates
AER creation. The AER schema gains exactly one new field
(`why.capability_version: Option<u64>`) and the package exposes two entry
functions with disjoint event_class admittance.

### 17.1 Two entry functions, two paths

| Entry | Path | Admitted `event_class` | `why.capability_version` |
|---|---|---|---|
| `create_report_with_receipt` | ungated | settlement (3) ONLY | `None` |
| `create_report_with_receipt_capability` | gated (takes `&Capability`) | cognition (1), execution (2) | `Some(cap.version)` |

The ungated path is for system pseudo-actions: `executor.fee.v1`,
`gas.refund.v1`. The gated path is for everything a user-owned agent does
on the user's behalf. An executor that routes a non-settlement AER through
the ungated path aborts with `E_UNGATED_REQUIRES_SETTLEMENT_CLASS` (554);
the reverse (settlement AER through gated path) aborts with
`E_GATED_REQUIRES_NON_SETTLEMENT_CLASS` (564).

### 17.2 Hard rail vs soft rail (trust model)

Plan B is explicit (D12): Baram 1차 is "trust-constrained delegated
execution," NOT "trustless." Two layers of enforcement with asymmetric
strength:

| Layer | Enforced by | What it covers |
|---|---|---|
| Hard rail | Move contract (`capability::assert_can_execute`) | `action_type` membership, payment amount cap, pause state, owner match, cap version race |
| Soft rail | Host (executor-nitro) | target package, function selector, asset exposure (input/output coin types), max_slippage, daily-loss rolling window |

The soft rail is host-trusted. A malicious Nasun-run executor could let
through an action that violates D4's off-chain checks if the hard rail's
coarse checks (action_type string + payment cap) admit it. The 1차 trust
assumption: the executor is operationally incentivized to refuse out-of-scope
actions because its reputation and stake are at risk.

**Wording discipline**: external narrative, dashboard UI, and whitepaper
sections MUST describe Baram 1차 as "trust-constrained delegated execution,"
NEVER "trustless" or "fully onchain enforced." Future plans (TEE attestation
in execution path, third-party executor marketplace, onchain action class
registry, selector-level capability granularity) progressively tighten the
soft rail toward trust-minimized.

### 17.3 Capability hard rail check order

`capability::assert_can_execute` runs (in order, fail-fast cheapest first):

1. `!cap.revoked` → else `E_CAPABILITY_REVOKED` (562).
2. `cap.pause_mode == PAUSE_ACTIVE` → else `E_CAPABILITY_PAUSED` (550).
3. `cap.owner == receipt.requester` → else `E_CAPABILITY_OWNER_MISMATCH` (553).
4. `cap.version == expected_capability_version` → else
   `E_INVALID_CAPABILITY_VERSION` (560). This catches in-flight wallet
   mutations that race host PTB submission. The PTB rolls back (receipt is
   NOT consumed); the host should detect this off-chain and resubmit with
   the fresh `cap.version`.
5. `action_type ∈ cap.allowed_actions` → else `E_ACTION_NOT_ALLOWED` (551).
6. `payment_amount <= cap.risk_limits.max_notional_per_action` → else
   `E_PAYMENT_EXCEEDS_NOTIONAL_CAP` (552).

On success, `cap.version` is returned and the gated entry snapshots it into
`AER.why.capability_version = Some(cap.version)`. Replay can therefore
verify "was this action within scope at the moment it happened?" by
comparing the snapshotted version against the `CapabilityMutated` event
stream.

### 17.4 Pause mode discipline (phase 1)

Phase 1 contract honors `{ 0 = active, 2 = wake_blocked }`. Setting modes
1 (`execution_only`) or 3 (`full_suspend`) via `set_pause_mode` aborts with
`E_PAUSE_MODE_NOT_SUPPORTED` (559) even though the integers are reserved
for forward compat. Rationale: a contract that accepts but the host
doesn't honor diverges user mental model from reality. Decoders surface
modes 1/3 faithfully if they ever appear on-chain in a phase 2 upgrade
(see baram-sdk `pauseModeFromTag`).

### 17.5 Revocation semantics

`revoke(cap)` flips `revoked: true` (terminal). Version is NOT bumped
(monotonic counter is meaningless past terminal state). All subsequent
gated entries abort with `E_CAPABILITY_REVOKED`. The capability object is
preserved (not destroyed) so indexers can read the final state without
object-lookup failures. To recover: create a new Capability and call
`agent_profile::unlink_capability` then `link_capability` with the new id.

### 17.6 Mutation history replay

`CapabilityCreated` / `CapabilityMutated` / `CapabilityRevoked` events are
emitted on every state transition. Replay reconstructs the cap at any
historical version by replaying events from the creation event up to the
target version. Plan B requires the indexer to capture every mutation
event - future hardening (state-snapshot events every N mutations) is
listed as F2 in Plan B §11.

### 17.7 `SpendObligation` hot-potato lifecycle (Plan C C3-v2)

Plan B's capability gated AER creation but funds still moved through
the trader's own wallet on the swap leg. Plan C C3-v2 moves the funds
into a shared `AgentEscrow` and delegates spend authority via a
single-use, non-storable, non-droppable `SpendObligation` struct (hot
potato — Move type with no abilities).

`withdraw_for_action<T>(escrow, &cap, amount, expected_cap_version)`
returns `(Coin<T>, SpendObligation)`. The obligation:

- Pins `cap.id` so it can only be settled by the same cap that minted
  it (closes the cap-mixing attack: Cmd 0 with cap A, Cmd 4 with cap B
  is rejected with `E_OBLIGATION_CAP_MISMATCH` 576).
- Pins the `input_amount` so the swap consumes exactly what was
  withdrawn — no partial spend leaks.
- Pins `allowed_output_assets` so `settle_action<U>` (Cmd 3) refuses to
  re-deposit a coin not on the cap's allow list
  (`E_ASSET_NOT_ALLOWED` 572 — closes the dust-deposit attack).
- Has no `key` / `store` / `copy` / `drop` abilities. The Move type
  system forces it to be consumed by `settle_action` within the same
  PTB; any unconsumed value at end-of-tx aborts the entire PTB.

PTB layout (DV9, 10 commands; execution AER):

```
Cmd 0: escrow::withdraw_for_action<T>      → (Coin<T>, SpendObligation)
Cmd 1: coin::zero<DEEP>                    → Coin<DEEP>  (whitelisted pool)
Cmd 2: pool::swap_exact_*_for_*            → (Coin<Base>, Coin<Quote>, Coin<DEEP>)
Cmd 3: escrow::settle_action<U>            → consumes obligation, deposits primary
Cmd 4: escrow::deposit_swap_leftover<T>    → returns lot-size dust to escrow
Cmd 5: coin::destroy_zero<DEEP>            → DEEP whitelist invariant (S14)
Cmd 6: baram::submit_proof_with_receipt    → SettlementReceipt
Cmd 7: aer::create_report_with_receipt_capability → AER (gated)
Cmd 8: executor::record_job_completion
Cmd 9: executor_tier::refresh_tier_from_state
```

Failure modes (any abort rolls back the entire PTB; escrow untouched):

- Cmd 0: cap revoked / paused / version stale / amount > notional cap
- Cmd 2: pool slippage exceeds host-derived floor (C3-v2c min_out)
- Cmd 3: output type not in `cap.allowed_assets`, OR obligation cap
  mismatch
- Cmd 5: leftover DEEP non-zero (smoke S14 probe; phase-2 fix: switch
  to `deposit_swap_leftover<DEEP>` + add DEEP to `cap.allowed_assets`)

The wallet-signed atomic setup PTB (DV5 / `LinkWitness` hot potato)
guarantees cap and escrow are created with reciprocal references in a
single tx: `cap.escrow_id = Some(escrow.id)` AND
`escrow.capability_id = cap.id`. A standalone `new_capability` /
`new_escrow` flow is not exposed; the link is the only constructor.

### 17.8 Inference token (Plan C C3-v2 DV8)

Independent of the on-chain rails, the host splits the legacy
`/execute` endpoint into:

| Endpoint | Purpose | State mutation |
|---|---|---|
| `POST /infer` | Forward encrypted prompt to enclave, return result + HMAC token | None — no AER, no on-chain tx |
| `POST /execute-capability` | Verify token, build PTB (Cmd 0–9 above), submit | Full AER + escrow mutation |

The HMAC token binds `(requestId, resultHash, walletAddress)` with
SHA-256 + 32-byte secret (`HOST_HMAC_KEY` env or random-at-boot).
Single-use nonce, 30s expiry, LRU-bounded at 10k. A tampered
`resultHash` between `/infer` and `/execute-capability` fails closed
at the verify step (`reason: 'invalid'`); a replayed
`(nonce, spendToken)` fails with `reason: 'replay'`.

Residual risk (§12.1 in C3-v2 plan): HMAC binds inference *identity*,
not envelope *semantics*. A compromised trader can claim a different
BUY/SELL interpretation than what the LLM produced, attach the
genuine token, and the host accepts because the token validates. The
on-chain `resultHash` matches the enclave's signed output but the
`analysis.v1` payload claims a different decision. Mitigation
deferred to Plan F (envelope-hash binding on chain).

---

## 18. AgentEscrow shape (Plan C C3-v2)

The `AgentEscrow` shared object replaces "trader signs the swap tx
with their own private key" from Plan B. Funds live in a
`Balance<T>`-per-asset map keyed by Move `TypeName`, accessible only
through the cap + obligation rails defined in §17.7.

### 18.1 Struct outline

```move
struct AgentEscrow has key {
    id: UID,
    capability_id: ID,              // reciprocal to cap.escrow_id
    owner: address,                 // = cap.owner; doubles as withdraw_owner
    // Balance<T> stored via dynamic_field keyed by TypeName
    // (NOT dynamic_object_field — Balance has no key/store-key).
}
```

Why `Balance<T> + dynamic_field` (DV2):

- `Balance<T>` is `store`-only (no `key`). It cannot be top-level shared
  or owned; it must live inside a parent object's field.
- `dynamic_field<TypeName, Balance<T>>` lets a single shared escrow hold
  arbitrary asset types without pre-declaring them in the struct
  (multi-asset support without schema migration).
- `dynamic_object_field` was considered and rejected: `Balance<T>` lacks
  the required abilities, and the indirection adds an extra fetch per
  read.

### 18.2 Lifecycle entries

| Entry | Caller | Effect |
|---|---|---|
| `new_capability_and_link` (atomic setup) | Wallet sig | Creates cap + escrow + reciprocal binding in one PTB |
| `deposit<T>(escrow, coin)` | Anyone | Adds to `Balance<T>` for type `T` |
| `withdraw_owner<T>(escrow, cap, amount)` | `cap.owner` sig | Wallet escape hatch — pulls funds out without going through the trader |
| `withdraw_for_action<T>(escrow, &cap, amount, version)` | Host (executor key) | Mints `SpendObligation`; consumed by `settle_action` in same PTB |
| `settle_action<U>(escrow, &cap, obligation, primary_out)` | Host | Consumes obligation, deposits primary swap output (type `U`) |
| `deposit_swap_leftover<T>(escrow, &cap, leftover)` | Host | Returns lot-size dust (type `T`, same as withdraw input) |

`withdraw_owner` is the only path that escapes the capability rails
entirely — the wallet always retains the right to drain its own
escrow without trader involvement. This is the core of Foundation
결정 2's "recoverable delegated custody" framing.

### 18.3 Indexer projection (advisory)

| Field | Postgres type | Notes |
|---|---|---|
| `escrow_id` | `BYTEA NOT NULL` | from `AgentEscrowCreated` event |
| `capability_id` | `BYTEA NOT NULL` | reciprocal lookup |
| `owner` | `BYTEA NOT NULL` | for "my escrows" UI |
| `balance_<asset>_raw` | `NUMERIC(78, 0)` | per-asset projection from `BalanceCredited` / `BalanceDebited` events; one column per known asset OR a side table |

C3-v2 indexer change is minimal: add `escrow_id` to the `Capability`
parser. Full escrow projection lives in Plan E.

### 18.4 Wording discipline

External narrative refers to this pattern as **"recoverable delegated
custody"** — funds are held by the protocol (not the trader), but the
wallet retains an unconditional withdrawal path. Forbidden framings:

- "Non-custodial" — the protocol holds the funds; the wallet does not.
- "Trustless escrow" — the host's soft rails still gate execution.
- "Atomic settlement" alone is acceptable for the swap-leg description,
  but does not characterize the custody model.

The pattern is *trust-constrained delegated execution with recoverable
custody* — same trust framing as Plan B (§17.2), with the additional
guarantee that the wallet can always reclaim funds via
`withdraw_owner`.

---

- TypeScript codec: `packages/baram-sdk/src/aer/`
- Plan A: `.claude/plans/fuzzy-growing-piglet.md`
- Plan C C3-v2: `.claude/plans/2026-05-12-baram-plan-c-c3-v2-delegated-spend.md`
- Big picture (foundation decisions 1-7): `.claude/plans/pick-an-executor-majestic-thacker.md`
