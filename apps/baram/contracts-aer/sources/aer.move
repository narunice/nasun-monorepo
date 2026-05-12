/// AI Execution Report (AER) - Canonical Execution Ledger.
///
/// Immutable, BCS-canonical record of one AI execution event. Replaces the
/// v1 "LLM call receipt" schema with an event-sourced design where every
/// reported event carries:
///   - 8 categorical sub-structs preserved from v1 (who/where/cost/inference/
///     why/trust/when/chain)
///   - Action envelope (event_class, action_type, payload, outcome)
///   - Intent lineage (intent_id / parent_intent_id / execution_id)
///   - Wake trigger metadata (heartbeat / user_message / price_alert / manual)
///   - Replay metadata (model_version + hashes + extensible bag)
///
/// Design principles:
///   1. Field declaration order = canonical BCS wire order. Never reorder.
///   2. Payload is opaque on-chain. `payload_hash = SHA256(action_type || payload_bytes)`
///      gives a cryptographic action_type ↔ payload binding without semantic
///      parsing in Move.
///   3. AER is created via a hot-potato `SettlementReceipt` consumed from
///      baram::baram. No standalone construction path.
///   4. Forward-compat: enum values are append-only; unknown values surface
///      as "unknown" off-chain rather than aborting.
module baram_aer::aer {
    use sui::event;
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use std::string::{Self, String};
    use baram_aer::capability::{Self, Capability};

    // ========== Error Codes ==========
    // Codes 400 and 405 are reserved (formerly E_NOT_ADMIN and E_DEPRECATED in
    // v1) and intentionally left unused for forward-compat audit trails.
    const E_INVALID_INPUT_HASH: u64 = 401;
    const E_INVALID_OUTPUT_HASH: u64 = 402;
    const E_DELEGATION_PATH_TOO_LONG: u64 = 403;
    const E_EXECUTOR_MISMATCH: u64 = 404;
    const E_INVALID_INITIATOR: u64 = 406;
    const E_INVALID_PAYLOAD_HASH: u64 = 407;
    const E_INVALID_PROMPT_TEMPLATE_HASH: u64 = 408;
    const E_INVALID_INTENT_ID: u64 = 409;
    const E_INVALID_ENUM_VALUE: u64 = 410;
    const E_INVALID_PAYLOAD_CODEC: u64 = 411;
    const E_INVALID_REPLAY_EXTRAS: u64 = 412;
    const E_INVALID_MARKET_SNAPSHOT_HASH: u64 = 413;
    const E_INVALID_ACTION_TYPE: u64 = 414;
    const E_ACTION_SUMMARY_TOO_LONG: u64 = 415;
    const E_PAYLOAD_TOO_LARGE: u64 = 416;
    const E_DUPLICATE_REQUEST_ID: u64 = 417;
    const E_INVALID_TEE_ATTESTATION_HASH: u64 = 418;
    const E_INVALID_PARENT_INTENT_ID: u64 = 419;
    // Plan B: ungated entry restricted to settlement event_class. Code lives in
    // the capability error range (550-599) by design since this guards the
    // boundary between gated and ungated AER creation paths.
    const E_UNGATED_REQUIRES_SETTLEMENT_CLASS: u64 = 554;
    // Plan B: gated entry restricted to cognition + execution event_class.
    const E_GATED_REQUIRES_NON_SETTLEMENT_CLASS: u64 = 564;

    // ========== Constants ==========
    const HASH_LENGTH: u64 = 32;
    const INTENT_ID_LENGTH: u64 = 16;
    const MAX_DELEGATION_DEPTH: u64 = 5;
    const MAX_PAYLOAD_BYTES: u64 = 8192;
    const MAX_ACTION_SUMMARY: u64 = 280;
    const MAX_ACTION_TYPE_LEN: u64 = 64;
    const MAX_REPLAY_EXTRAS_KEYS: u64 = 16;
    const MAX_REPLAY_EXTRAS_KEY_LEN: u64 = 64;
    const MAX_REPLAY_EXTRAS_VAL_LEN: u64 = 4096;
    const PAYLOAD_CODEC_BCS: vector<u8> = b"bcs";

    // event_class enum
    const EVENT_CLASS_COGNITION: u8 = 1;
    const EVENT_CLASS_EXECUTION: u8 = 2;
    const EVENT_CLASS_SETTLEMENT: u8 = 3;
    #[allow(unused_const)]
    const EVENT_CLASS_OBSERVATION: u8 = 4;
    #[allow(unused_const)]
    const EVENT_CLASS_COORDINATION: u8 = 5;
    const EVENT_CLASS_MAX: u8 = 5;

    // action_outcome enum
    #[allow(unused_const)]
    const OUTCOME_SUCCESS: u8 = 1;
    #[allow(unused_const)]
    const OUTCOME_HOLD_NOOP: u8 = 2;
    #[allow(unused_const)]
    const OUTCOME_FAILURE: u8 = 3;
    const OUTCOME_MAX: u8 = 3;

    // triggered_by_type enum
    #[allow(unused_const)]
    const TRIGGER_HEARTBEAT: u8 = 1;
    #[allow(unused_const)]
    const TRIGGER_USER_MESSAGE: u8 = 2;
    #[allow(unused_const)]
    const TRIGGER_PRICE_ALERT: u8 = 3;
    #[allow(unused_const)]
    const TRIGGER_MANUAL: u8 = 4;
    const TRIGGER_MAX: u8 = 4;

    // AER status
    const STATUS_SETTLED: u8 = 0;
    #[allow(unused_const)]
    const STATUS_DISPUTED: u8 = 1;
    #[allow(unused_const)]
    const STATUS_SLASHED: u8 = 2;

    // Payment token tag (mirrors v1 - full token registry is out of scope here)
    const TOKEN_NUSDC: u8 = 0;
    #[allow(unused_const)]
    const TOKEN_NASUN: u8 = 1;

    // ========== Witness ==========

    /// Capability witness that gates `baram::baram::consume_receipt`.
    ///
    /// Has only `drop` so it can be discarded at PTB end, but cannot be
    /// constructed outside this module (no public constructor). Combined
    /// with `baram::baram::consume_receipt`'s runtime TypeName check on
    /// the supplied witness type, this enforces:
    ///
    ///   SettlementReceipt can only be consumed by code that runs inside
    ///   `baram_aer::aer`, i.e. by `create_report_with_receipt`.
    ///
    /// Without this, the public `consume_receipt` would allow an executor
    /// to call `submit_proof_with_receipt -> consume_receipt` directly in
    /// a PTB, collect the payout, and silently drop the primitive return
    /// values - never producing an AER. That bypass would break the core
    /// "economic settlement <=> canonical AER existence" invariant.
    ///
    /// See `apps/baram/docs/AER_V2_CODEC.md` §10.
    public struct AERWitness has drop {}

    // ========== Admin & Registry ==========

    public struct AdminCap has key, store {
        id: UID,
    }

    public struct AERRegistry has key {
        id: UID,
        total_records: u64,
        // request_id -> AER object id (unique; v2 strict-aborts on duplicate)
        record_ids: Table<u64, address>,
        policy_version: u64,
    }

    // ========== Sub-structs ==========
    //
    // Field declaration order below is the canonical BCS wire order. Off-chain
    // decoders in @nasun/baram-sdk follow the same order.

    /// Authorization chain (who-acts-on-whose-behalf).
    /// Distinct from `ChainContext.lineage` which encodes the causal/reasoning chain.
    public struct RequesterContext has store, copy, drop {
        initiator: address,
        authorizer: address,
        delegation_path: vector<address>,
    }

    public struct ExecutorContext has store, copy, drop {
        executor: address,
        executor_principal: Option<address>,
    }

    public struct PaymentContext has store, copy, drop {
        payment_amount: u64,
        // Reserved for future multi-token settlement. Currently always set to
        // `TOKEN_NUSDC` by `create_report_with_receipt` since `SettlementReceipt`
        // only carries NUSDC payments. Caller cannot supply this directly; do
        // not interpret a non-NUSDC value as a real signal until the
        // SettlementReceipt schema threads the tag through.
        payment_token: u8,
        executor_received: u64,
        fee_detail: Option<String>,
        budget_id: Option<ID>,
        budget_remaining: Option<u64>,
    }

    public struct InferenceContext has store, copy, drop {
        model_name: String,
        model_metadata: Option<String>,
        input_hash: vector<u8>,
        output_hash: vector<u8>,
        execution_time_ms: u64,
    }

    public struct WhyContext has store, copy, drop {
        purpose: Option<String>,
        // Snapshotted from registry.policy_version at AER creation. Caller does not supply it.
        policy_version: Option<u64>,
        // Plan B: snapshotted from capability.version when the gated entry path
        // is used; None for the ungated (settlement-only) entry path. Lets AER
        // replay reflect the cap state at the moment of execution and lets the
        // indexer flag any execution whose cap was rotated mid-flight.
        // Wire-position: between policy_version and constraints. Do not reorder.
        capability_version: Option<u64>,
        constraints: Option<String>,
    }

    public struct TrustContext has store, copy, drop {
        executor_tier: u8,
        executor_reputation: u64,
        executor_stake_amount: u64,
        tee_verified: bool,
        tee_attestation_hash: Option<vector<u8>>,
    }

    public struct TimeContext has store, copy, drop {
        requested_at: u64,
        settled_at: u64,
        status: u8,
    }

    /// Lineage triple: intent_id (one user intent / heartbeat),
    /// parent_intent_id (chained reasoning), execution_id (Nth retry).
    public struct IntentLineage has store, copy, drop {
        intent_id: vector<u8>,
        parent_intent_id: Option<vector<u8>>,
        execution_id: u32,
    }

    /// Causal chain (what-reasoning-led-to-what). Independent from delegation_path.
    public struct ChainContext has store, copy, drop {
        triggered_by: Option<ID>,
        triggered_action: Option<ID>,
        lineage: IntentLineage,
    }

    /// Action envelope. payload_bytes is opaque on-chain; payload_hash binds
    /// action_type and payload_bytes cryptographically.
    public struct ActionEnvelope has store, copy, drop {
        event_class: u8,
        action_type: String,
        action_schema_version: u16,
        payload_codec: String,
        // SHA-256(action_type_bytes || payload_bytes). Off-chain decoder verifies.
        payload_hash: vector<u8>,
        payload_bytes: vector<u8>,
        action_summary: String,
        action_outcome: u8,
    }

    public struct WakeContext has store, copy, drop {
        triggered_by_type: u8,
        triggered_by_ref: Option<String>,
    }

    public struct ReplayContext has store, copy, drop {
        model_version: String,
        prompt_template_hash: vector<u8>,
        market_snapshot_hash: Option<vector<u8>>,
        // Keys MUST be in strict-ascending UTF-8 byte order. Validated off-chain;
        // contract only enforces length cap + duplicate-key abort via vec_map::insert.
        replay_extras: VecMap<String, vector<u8>>,
    }

    // ========== Top-level AER ==========

    public struct AIExecutionReport has key, store {
        id: UID,
        request_id: u64,
        requester: RequesterContext,
        executor: ExecutorContext,
        payment: PaymentContext,
        inference: InferenceContext,
        why: WhyContext,
        trust: TrustContext,
        time: TimeContext,
        chain: ChainContext,
        envelope: ActionEnvelope,
        wake: WakeContext,
        replay: ReplayContext,
    }

    // ========== Events ==========

    public struct ExecutionReportCreated has copy, drop {
        request_id: u64,
        record_id: address,
        initiator: address,
        executor: address,
        event_class: u8,
        action_type: String,
        action_outcome: u8,
        payment_amount: u64,
        settled_at: u64,
    }

    public struct PolicyUpdated has copy, drop {
        new_version: u64,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap { id: object::new(ctx) };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        let registry = AERRegistry {
            id: object::new(ctx),
            total_records: 0,
            record_ids: table::new(ctx),
            policy_version: 1,
        };
        transfer::share_object(registry);
    }

    // ========== Core ==========

    /// Create an AER by consuming a `SettlementReceipt` from baram::baram.
    ///
    /// PTB flow:
    ///   `baram::submit_proof_with_receipt` -> `aer::create_report_with_receipt`
    ///
    /// Fields drawn from the receipt: request_id, requester (=> authorizer),
    /// executor, price (=> payment_amount/executor_received), model_name,
    /// output_hash (=receipt.result_hash), execution_time_ms, settled_at.
    /// Everything else is caller-supplied and validated below.
    public fun create_report_with_receipt(
        registry: &mut AERRegistry,
        baram_registry: &baram::baram::BaramRegistry,
        receipt: baram::baram::SettlementReceipt,
        // Requester
        initiator: address,
        delegation_path: vector<address>,
        // Executor
        executor_principal: Option<address>,
        // Payment
        fee_detail: Option<String>,
        budget_id: Option<ID>,
        budget_remaining: Option<u64>,
        // Inference
        model_metadata: Option<String>,
        input_hash: vector<u8>,
        // Why
        purpose: Option<String>,
        constraints: Option<String>,
        // Trust
        executor_tier: u8,
        executor_reputation: u64,
        executor_stake_amount: u64,
        tee_verified: bool,
        tee_attestation_hash: Option<vector<u8>>,
        // When
        requested_at: u64,
        // Chain
        triggered_by: Option<ID>,
        triggered_action: Option<ID>,
        intent_id: vector<u8>,
        parent_intent_id: Option<vector<u8>>,
        execution_id: u32,
        // Envelope
        event_class: u8,
        action_type: String,
        action_schema_version: u16,
        payload_codec: String,
        payload_hash: vector<u8>,
        payload_bytes: vector<u8>,
        action_summary: String,
        action_outcome: u8,
        // Wake
        triggered_by_type: u8,
        triggered_by_ref: Option<String>,
        // Replay
        model_version: String,
        prompt_template_hash: vector<u8>,
        market_snapshot_hash: Option<vector<u8>>,
        replay_extras_keys: vector<String>,
        replay_extras_vals: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        // Plan B §1.7 hardening: ungated path is for SETTLEMENT class only
        // (executor.fee.v1, gas.refund.v1 patterns). Cognition + execution
        // belong on the capability-gated entry below. Reject up-front so a
        // bad caller cannot bypass capability scope by routing through here.
        assert!(event_class == EVENT_CLASS_SETTLEMENT, E_UNGATED_REQUIRES_SETTLEMENT_CLASS);

        // Consume receipt (destroys hot-potato). The witness gates the call
        // in baram::baram so that no other module can destructure receipts
        // and skip AER creation. See `AERWitness` doc comment.
        let (
            request_id,
            requester,
            receipt_executor,
            price,
            model_name,
            output_hash,
            execution_time_ms,
            settled_at,
        ) = baram::baram::consume_receipt(baram_registry, receipt, AERWitness {});

        finalize_aer_from_receipt(
            registry,
            request_id, requester, receipt_executor, price, model_name, output_hash,
            execution_time_ms, settled_at,
            initiator, delegation_path, executor_principal,
            fee_detail, budget_id, budget_remaining,
            model_metadata, input_hash,
            purpose, option::none<u64>(), constraints,
            executor_tier, executor_reputation, executor_stake_amount, tee_verified, tee_attestation_hash,
            requested_at,
            triggered_by, triggered_action, intent_id, parent_intent_id, execution_id,
            event_class, action_type, action_schema_version, payload_codec,
            payload_hash, payload_bytes, action_summary, action_outcome,
            triggered_by_type, triggered_by_ref,
            model_version, prompt_template_hash, market_snapshot_hash,
            replay_extras_keys, replay_extras_vals,
            ctx,
        );
    }

    /// Capability-gated AER creation (Plan B §1.5).
    ///
    /// Same args as `create_report_with_receipt` plus:
    ///   - `cap: &Capability` (immutable ref, never consumed).
    ///   - `expected_capability_version: u64` (caller asserts; aborts with
    ///     E_INVALID_CAPABILITY_VERSION on mismatch to catch in-flight wallet
    ///     mutations that race with host PTB submission).
    ///
    /// Enforces (in addition to all common validation):
    ///   - event_class ∈ {cognition, execution}. settlement class is the
    ///     ungated path's job; routing it here would let the agent emit
    ///     fake settlement attestations.
    ///   - capability::assert_can_execute (not revoked, not paused, owner ==
    ///     receipt.requester, version matches, action_type in allowed set,
    ///     payment within notional cap). On success, the cap.version is
    ///     snapshotted into AER.why.capability_version.
    public fun create_report_with_receipt_capability(
        registry: &mut AERRegistry,
        baram_registry: &baram::baram::BaramRegistry,
        receipt: baram::baram::SettlementReceipt,
        cap: &Capability,
        expected_capability_version: u64,
        // Requester
        initiator: address,
        delegation_path: vector<address>,
        // Executor
        executor_principal: Option<address>,
        // Payment
        fee_detail: Option<String>,
        budget_id: Option<ID>,
        budget_remaining: Option<u64>,
        // Inference
        model_metadata: Option<String>,
        input_hash: vector<u8>,
        // Why
        purpose: Option<String>,
        constraints: Option<String>,
        // Trust
        executor_tier: u8,
        executor_reputation: u64,
        executor_stake_amount: u64,
        tee_verified: bool,
        tee_attestation_hash: Option<vector<u8>>,
        // When
        requested_at: u64,
        // Chain
        triggered_by: Option<ID>,
        triggered_action: Option<ID>,
        intent_id: vector<u8>,
        parent_intent_id: Option<vector<u8>>,
        execution_id: u32,
        // Envelope
        event_class: u8,
        action_type: String,
        action_schema_version: u16,
        payload_codec: String,
        payload_hash: vector<u8>,
        payload_bytes: vector<u8>,
        action_summary: String,
        action_outcome: u8,
        // Wake
        triggered_by_type: u8,
        triggered_by_ref: Option<String>,
        // Replay
        model_version: String,
        prompt_template_hash: vector<u8>,
        market_snapshot_hash: Option<vector<u8>>,
        replay_extras_keys: vector<String>,
        replay_extras_vals: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        // Gated path admits only cognition + execution. settlement is reserved
        // for the ungated entry; allowing it here would let the agent forge
        // "settlement" AERs under a user capability.
        assert!(
            event_class == EVENT_CLASS_COGNITION || event_class == EVENT_CLASS_EXECUTION,
            E_GATED_REQUIRES_NON_SETTLEMENT_CLASS,
        );

        // Consume receipt FIRST so we get the authoritative requester + price
        // (capability scope check needs both).
        let (
            request_id,
            requester,
            receipt_executor,
            price,
            model_name,
            output_hash,
            execution_time_ms,
            settled_at,
        ) = baram::baram::consume_receipt(baram_registry, receipt, AERWitness {});

        // Capability hard rail. Snapshots cap.version on success so replay can
        // verify scope at the moment of execution.
        let cap_version = capability::assert_can_execute(
            cap,
            requester,
            &action_type,
            price,
            expected_capability_version,
        );

        finalize_aer_from_receipt(
            registry,
            request_id, requester, receipt_executor, price, model_name, output_hash,
            execution_time_ms, settled_at,
            initiator, delegation_path, executor_principal,
            fee_detail, budget_id, budget_remaining,
            model_metadata, input_hash,
            purpose, option::some(cap_version), constraints,
            executor_tier, executor_reputation, executor_stake_amount, tee_verified, tee_attestation_hash,
            requested_at,
            triggered_by, triggered_action, intent_id, parent_intent_id, execution_id,
            event_class, action_type, action_schema_version, payload_codec,
            payload_hash, payload_bytes, action_summary, action_outcome,
            triggered_by_type, triggered_by_ref,
            model_version, prompt_template_hash, market_snapshot_hash,
            replay_extras_keys, replay_extras_vals,
            ctx,
        );
    }

    /// Common AER validation + construction body, factored out of both entry
    /// functions to keep their gating logic narrow. event_class restriction
    /// is the caller's responsibility (settlement-only for ungated, cognition
    /// or execution for gated). The `capability_version_opt` argument carries
    /// the snapshot of cap.version when the gated path was taken, or None
    /// for the ungated settlement path.
    ///
    /// Validation order is identical to Plan A's create_report_with_receipt;
    /// only the WhyContext construction differs (capability_version field).
    fun finalize_aer_from_receipt(
        registry: &mut AERRegistry,
        // From receipt
        request_id: u64,
        requester: address,
        receipt_executor: address,
        price: u64,
        model_name: String,
        output_hash: vector<u8>,
        execution_time_ms: u64,
        settled_at: u64,
        // Requester
        initiator: address,
        delegation_path: vector<address>,
        // Executor
        executor_principal: Option<address>,
        // Payment
        fee_detail: Option<String>,
        budget_id: Option<ID>,
        budget_remaining: Option<u64>,
        // Inference
        model_metadata: Option<String>,
        input_hash: vector<u8>,
        // Why (capability_version_opt encodes ungated vs gated)
        purpose: Option<String>,
        capability_version_opt: Option<u64>,
        constraints: Option<String>,
        // Trust
        executor_tier: u8,
        executor_reputation: u64,
        executor_stake_amount: u64,
        tee_verified: bool,
        tee_attestation_hash: Option<vector<u8>>,
        // When
        requested_at: u64,
        // Chain
        triggered_by: Option<ID>,
        triggered_action: Option<ID>,
        intent_id: vector<u8>,
        parent_intent_id: Option<vector<u8>>,
        execution_id: u32,
        // Envelope
        event_class: u8,
        action_type: String,
        action_schema_version: u16,
        payload_codec: String,
        payload_hash: vector<u8>,
        payload_bytes: vector<u8>,
        action_summary: String,
        action_outcome: u8,
        // Wake
        triggered_by_type: u8,
        triggered_by_ref: Option<String>,
        // Replay
        model_version: String,
        prompt_template_hash: vector<u8>,
        market_snapshot_hash: Option<vector<u8>>,
        replay_extras_keys: vector<String>,
        replay_extras_vals: vector<vector<u8>>,
        ctx: &mut TxContext,
    ) {
        // The executor signing this tx must match the receipt.
        assert!(receipt_executor == tx_context::sender(ctx), E_EXECUTOR_MISMATCH);
        // The initiator must match the receipt's requester to prevent
        // sending AER objects to arbitrary addresses.
        assert!(initiator == requester, E_INVALID_INITIATOR);

        // Hash length checks
        assert!(vector::length(&input_hash) == HASH_LENGTH, E_INVALID_INPUT_HASH);
        assert!(vector::length(&output_hash) == HASH_LENGTH, E_INVALID_OUTPUT_HASH);
        assert!(vector::length(&payload_hash) == HASH_LENGTH, E_INVALID_PAYLOAD_HASH);
        assert!(vector::length(&prompt_template_hash) == HASH_LENGTH, E_INVALID_PROMPT_TEMPLATE_HASH);
        if (option::is_some(&market_snapshot_hash)) {
            assert!(
                vector::length(option::borrow(&market_snapshot_hash)) == HASH_LENGTH,
                E_INVALID_MARKET_SNAPSHOT_HASH,
            );
        };
        if (option::is_some(&tee_attestation_hash)) {
            assert!(
                vector::length(option::borrow(&tee_attestation_hash)) == HASH_LENGTH,
                E_INVALID_TEE_ATTESTATION_HASH,
            );
        };

        // Intent id length
        assert!(vector::length(&intent_id) == INTENT_ID_LENGTH, E_INVALID_INTENT_ID);
        if (option::is_some(&parent_intent_id)) {
            assert!(
                vector::length(option::borrow(&parent_intent_id)) == INTENT_ID_LENGTH,
                E_INVALID_PARENT_INTENT_ID,
            );
        };

        // Enum range checks. event_class is also class-restricted by the
        // entry function above; this only enforces overall enum bounds.
        assert!(event_class >= 1 && event_class <= EVENT_CLASS_MAX, E_INVALID_ENUM_VALUE);
        assert!(action_outcome >= 1 && action_outcome <= OUTCOME_MAX, E_INVALID_ENUM_VALUE);
        assert!(triggered_by_type >= 1 && triggered_by_type <= TRIGGER_MAX, E_INVALID_ENUM_VALUE);

        // payload_codec must be exactly "bcs" in this schema version.
        assert!(*string::as_bytes(&payload_codec) == PAYLOAD_CODEC_BCS, E_INVALID_PAYLOAD_CODEC);

        // Size caps (DOS + PTB pure arg size protection)
        assert!(vector::length(&payload_bytes) <= MAX_PAYLOAD_BYTES, E_PAYLOAD_TOO_LARGE);
        assert!(string::length(&action_summary) <= MAX_ACTION_SUMMARY, E_ACTION_SUMMARY_TOO_LONG);

        // action_type well-formedness: length 1..=64, ASCII printable, at least one dot.
        validate_action_type(&action_type);

        // Delegation depth
        assert!(vector::length(&delegation_path) <= MAX_DELEGATION_DEPTH, E_DELEGATION_PATH_TOO_LONG);

        // replay_extras length + per-entry caps. duplicate-key abort happens
        // automatically inside vec_map::insert below.
        let extras_len = vector::length(&replay_extras_keys);
        assert!(extras_len == vector::length(&replay_extras_vals), E_INVALID_REPLAY_EXTRAS);
        assert!(extras_len <= MAX_REPLAY_EXTRAS_KEYS, E_INVALID_REPLAY_EXTRAS);

        // Build replay_extras VecMap. Caller is expected to have inserted keys
        // in strict-ascending UTF-8 byte order; off-chain decoder verifies.
        let mut replay_extras = vec_map::empty<String, vector<u8>>();
        let mut i = 0;
        while (i < extras_len) {
            let key = *vector::borrow(&replay_extras_keys, i);
            let val = *vector::borrow(&replay_extras_vals, i);
            assert!(string::length(&key) <= MAX_REPLAY_EXTRAS_KEY_LEN, E_INVALID_REPLAY_EXTRAS);
            assert!(vector::length(&val) <= MAX_REPLAY_EXTRAS_VAL_LEN, E_INVALID_REPLAY_EXTRAS);
            // vec_map::insert aborts on duplicate key, providing canonical-set semantics.
            vec_map::insert(&mut replay_extras, key, val);
            i = i + 1;
        };

        // Strict-aborts on duplicate request_id (v1 silent-skip pattern intentionally dropped).
        assert!(!table::contains(&registry.record_ids, request_id), E_DUPLICATE_REQUEST_ID);

        let report = AIExecutionReport {
            id: object::new(ctx),
            request_id,
            requester: RequesterContext {
                initiator,
                authorizer: requester,
                delegation_path,
            },
            executor: ExecutorContext {
                executor: receipt_executor,
                executor_principal,
            },
            payment: PaymentContext {
                payment_amount: price,
                // SettlementReceipt currently only carries NUSDC; revisit when
                // the receipt schema threads a token tag (Plan B+ territory).
                payment_token: TOKEN_NUSDC,
                executor_received: price,
                fee_detail,
                budget_id,
                budget_remaining,
            },
            inference: InferenceContext {
                model_name,
                model_metadata,
                input_hash,
                output_hash,
                execution_time_ms,
            },
            why: WhyContext {
                purpose,
                policy_version: option::some(registry.policy_version),
                capability_version: capability_version_opt,
                constraints,
            },
            trust: TrustContext {
                executor_tier,
                executor_reputation,
                executor_stake_amount,
                tee_verified,
                tee_attestation_hash,
            },
            time: TimeContext {
                requested_at,
                settled_at,
                status: STATUS_SETTLED,
            },
            chain: ChainContext {
                triggered_by,
                triggered_action,
                lineage: IntentLineage {
                    intent_id,
                    parent_intent_id,
                    execution_id,
                },
            },
            envelope: ActionEnvelope {
                event_class,
                action_type,
                action_schema_version,
                payload_codec,
                payload_hash,
                payload_bytes,
                action_summary,
                action_outcome,
            },
            wake: WakeContext {
                triggered_by_type,
                triggered_by_ref,
            },
            replay: ReplayContext {
                model_version,
                prompt_template_hash,
                market_snapshot_hash,
                replay_extras,
            },
        };

        let record_id = object::id_address(&report);

        registry.total_records = registry.total_records + 1;
        table::add(&mut registry.record_ids, request_id, record_id);

        event::emit(ExecutionReportCreated {
            request_id,
            record_id,
            initiator,
            executor: receipt_executor,
            event_class: report.envelope.event_class,
            action_type: report.envelope.action_type,
            action_outcome: report.envelope.action_outcome,
            payment_amount: price,
            settled_at,
        });

        transfer::transfer(report, initiator);
    }

    // Validates that action_type is well-formed: 1..=64 bytes, all bytes in
    // 0x20..=0x7E (ASCII printable), and contains at least one '.'.
    fun validate_action_type(action_type: &String) {
        let bytes = string::as_bytes(action_type);
        let len = vector::length(bytes);
        assert!(len >= 1 && len <= MAX_ACTION_TYPE_LEN, E_INVALID_ACTION_TYPE);
        let mut dot_count: u64 = 0;
        let mut i: u64 = 0;
        while (i < len) {
            let b = *vector::borrow(bytes, i);
            assert!(b >= 0x20 && b <= 0x7E, E_INVALID_ACTION_TYPE);
            if (b == 0x2E /* '.' */) {
                dot_count = dot_count + 1;
            };
            i = i + 1;
        };
        assert!(dot_count >= 1, E_INVALID_ACTION_TYPE);
    }

    // ========== Admin ==========

    /// Bump the registry's policy version. Snapshotted into future AERs' why.policy_version.
    public fun update_policy(
        _admin: &AdminCap,
        registry: &mut AERRegistry,
    ) {
        registry.policy_version = registry.policy_version + 1;
        event::emit(PolicyUpdated { new_version: registry.policy_version });
    }

    // ========== Registry views ==========

    public fun get_total_records(registry: &AERRegistry): u64 { registry.total_records }
    public fun get_policy_version(registry: &AERRegistry): u64 { registry.policy_version }
    public fun has_record(registry: &AERRegistry, request_id: u64): bool {
        table::contains(&registry.record_ids, request_id)
    }
    public fun get_record_id(registry: &AERRegistry, request_id: u64): address {
        *table::borrow(&registry.record_ids, request_id)
    }

    // ========== AER views (per category) ==========

    public fun request_id(r: &AIExecutionReport): u64 { r.request_id }
    public fun requester(r: &AIExecutionReport): &RequesterContext { &r.requester }
    public fun executor(r: &AIExecutionReport): &ExecutorContext { &r.executor }
    public fun payment(r: &AIExecutionReport): &PaymentContext { &r.payment }
    public fun inference(r: &AIExecutionReport): &InferenceContext { &r.inference }
    public fun why(r: &AIExecutionReport): &WhyContext { &r.why }
    public fun trust(r: &AIExecutionReport): &TrustContext { &r.trust }
    public fun time(r: &AIExecutionReport): &TimeContext { &r.time }
    public fun chain(r: &AIExecutionReport): &ChainContext { &r.chain }
    public fun envelope(r: &AIExecutionReport): &ActionEnvelope { &r.envelope }
    public fun wake(r: &AIExecutionReport): &WakeContext { &r.wake }
    public fun replay(r: &AIExecutionReport): &ReplayContext { &r.replay }

    // ========== Test helpers ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

    #[test_only]
    public fun why_policy_version(w: &WhyContext): Option<u64> { w.policy_version }

    #[test_only]
    public fun why_capability_version(w: &WhyContext): Option<u64> { w.capability_version }

    #[test_only]
    public fun time_requested_at(t: &TimeContext): u64 { t.requested_at }

    #[test_only]
    public fun time_settled_at(t: &TimeContext): u64 { t.settled_at }
}
