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

Each sub-struct's order is fixed in §1.1-§1.4 of
[fuzzy-growing-piglet.md](../../../.claude/plans/fuzzy-growing-piglet.md) and
in the Move source. Re-read the Move source when in doubt.

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

Writers MUST insert keys in **strict-ascending UTF-8 byte order**
(`Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')) < 0`).

This is **not** enforced on-chain. The Move entry checks length cap + per-key
size cap + duplicate-key abort (the latter falls out of `vec_map::insert`),
but does not verify ordering. Off-chain decoders MUST verify ordering and
throw `AER_NONCANONICAL_REPLAY_EXTRAS` if violated. Indexers SHOULD drop the
AER from canonical projections on violation and surface it as quarantined.

`localeCompare`, JS `<`, and `Array.prototype.sort` (which uses locale by
default in non-V8 environments) are forbidden. Use a byte-wise comparator
helper such as `compareKeysCanonical(a, b)` (provided by `@nasun/baram-sdk`).

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
deferred to Plan F (see §9 below).

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

## 9.5. Witness-gated receipt consumption (M1 fix, 2026-05-12)

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

## 10. Canonical event boundary (Foundation 결정 7)

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

---

## 11. Enum append-only

Re-emphasis (see §6): enum values for `event_class`, `action_outcome`, and
`triggered_by_type` are append-only forever. Deprecating a value is
acceptable; reusing the same integer for new semantics breaks deployed
decoders and historic AERs.

---

## 12. Object explosion + payload overflow future direction

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

## 13. Forward-compat handling for decoders

- Unknown `action_type` → return raw `payload_bytes`. Do not throw.
- Unknown `event_class` → surface as `"unknown"`. Do not throw.
- Unknown `action_outcome` / `triggered_by_type` → same.
- New replay_extras keys → preserve raw bytes; named accessors should fall
  back gracefully.

The contract is the source of truth for validation. Decoders should
*tolerate* schema extensions, not *enforce* them.

---

## 14. Indexer storage hints

For PostgreSQL projections:

- `intent_id` and `parent_intent_id`: store as `BYTEA` (16 bytes). Do NOT
  hex-encode at the column level; hex-encode only for display.
- Recommended indexes:
  - `CREATE INDEX idx_aer_intent_id ON aer_records (intent_id, execution_id);`
  - `CREATE INDEX idx_aer_parent_intent ON aer_records (parent_intent_id) WHERE parent_intent_id IS NOT NULL;`
  - `CREATE INDEX idx_aer_event_class ON aer_records (event_class, settled_at DESC);`
  - `CREATE INDEX idx_aer_action_type ON aer_records (action_type, settled_at DESC);`
- `payload_hash` and `payload_bytes`: store as `BYTEA`. Mark `payload_hash`
  `UNIQUE` only at the (request_id, payload_hash) pair level; the same
  reasoning can legitimately appear in distinct executions.

These hints are advisory. Plan A does not modify the indexer; subsequent
plans wire up the projections.

---

## 15. References

- Move source: `apps/baram/contracts-aer/sources/aer.move`
- Move tests: `apps/baram/contracts-aer/tests/aer_test.move`
- TypeScript codec: `packages/baram-sdk/src/aer/`
- Plan A: `.claude/plans/fuzzy-growing-piglet.md`
- Big picture (foundation decisions 1-7): `.claude/plans/pick-an-executor-majestic-thacker.md`
