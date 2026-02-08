/// AI Execution Report (AER)
///
/// Immutable on-chain proof of AI execution — the "black box" of AI economic activity.
///
/// Unlike the previous ECR (hardware-centric, 22 fields), AER answers the questions
/// that matter for AI agent economy auditing:
///   WHO requested and executed? HOW MUCH was paid and to whom?
///   WHAT model ran and what were the I/O hashes? WHY was it executed?
///   HOW TRUSTWORTHY was the executor? WHEN did it happen?
///   What CHAIN of actions does this belong to?
///
/// Design principles:
/// 1. No content — only process metadata and cryptographic anchors
/// 2. Immutable after creation — reports cannot be altered
/// 3. 8 categories, 31 fields — structured for programmatic audit
/// 4. Standalone — no cross-package dependencies (data passed as parameters)
/// 5. Option<T> for fields not always available — honest about what we know
///
/// Note: max_fields_in_struct=32 on Nasun devnet. Rarely-used fields
/// (model metadata, fee breakdown) are consolidated into JSON strings.
///
/// Naming: Inspired by FIX Protocol Execution Report (MsgType=8)
module baram_aer::aer {
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use std::string::String;

    // ========== Error Codes ==========
    #[allow(unused_const)]
    const E_NOT_ADMIN: u64 = 400;
    const E_INVALID_INPUT_HASH: u64 = 401;
    const E_INVALID_OUTPUT_HASH: u64 = 402;
    const E_DELEGATION_PATH_TOO_LONG: u64 = 403;

    // ========== Constants ==========
    const HASH_LENGTH: u64 = 32;          // SHA-256
    const MAX_DELEGATION_DEPTH: u64 = 5;  // D-6: max delegation chain length

    // Status codes
    const STATUS_SETTLED: u8 = 0;
    #[allow(unused_const)]
    const STATUS_DISPUTED: u8 = 1;
    #[allow(unused_const)]
    const STATUS_SLASHED: u8 = 2;

    // Payment token types
    #[allow(unused_const)]
    const TOKEN_NUSDC: u8 = 0;
    #[allow(unused_const)]
    const TOKEN_NASUN: u8 = 1;

    // ========== Structs ==========

    /// Admin capability for AER registry operations
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry tracking all AI Execution Reports
    public struct AERRegistry has key {
        id: UID,
        /// Total reports created
        total_records: u64,
        /// Reports indexed by request_id for lookup
        record_ids: Table<u64, address>,
        /// Current policy version (snapshotted into reports)
        policy_version: u64,
    }

    /// AI Execution Report — the "black box" record
    ///
    /// 8 categories, 31 fields. Transferred to the initiator as proof.
    /// (max_fields_in_struct=32 on Nasun devnet; UID + 30 data fields = 31)
    ///
    /// Consolidated JSON fields:
    /// - model_metadata: {"version":"1.0","hash":"abc...","quantization":"Q4_K_M"}
    /// - fee_detail: {"model_creator":"0x...","royalty":1000,"protocol_fee":500}
    ///
    /// Option<T> fields are None when not applicable:
    /// - executor_principal: None for direct execution
    /// - budget_id/budget_remaining: None for direct payment
    /// - model_metadata: None when executor doesn't report model details
    /// - fee_detail: None until fee split is implemented
    /// - purpose/constraints: None when not specified
    /// - tee_attestation_hash: None for non-TEE execution
    /// - triggered_by/triggered_action: None for standalone executions
    public struct AIExecutionReport has key, store {
        id: UID,
        request_id: u64,

        // === 1. WHO — Requester Side (3) ===
        /// Address that initiated the request (end user or agent)
        initiator: address,
        /// Address that authorized payment (= initiator for direct, = budget owner for delegated)
        authorizer: address,
        /// Delegation chain: [user] -> [agent1] -> [agent2] -> ... (empty for direct)
        delegation_path: vector<address>,

        // === 2. WHO — Executor Side (2) ===
        /// Executor operator address that performed the computation
        executor: address,
        /// Entity the executor acts on behalf of (e.g., organization address)
        executor_principal: Option<address>,

        // === 3. HOW MUCH — Economic Facts (6) ===
        /// Total payment amount (in payment_token smallest unit)
        payment_amount: u64,
        /// Payment token type: 0=NUSDC, 1=NASUN
        payment_token: u8,
        /// Amount the executor actually received after fees
        executor_received: u64,
        /// Fee breakdown as JSON: {model_creator, royalty_amount, protocol_fee}
        fee_detail: Option<String>,
        /// Budget object ID (if delegated execution)
        budget_id: Option<ID>,
        /// Budget remaining balance after this execution
        budget_remaining: Option<u64>,

        // === 4. WHAT — Execution Content (5) ===
        /// Model identifier (e.g., "llama-3.3-70b-versatile")
        model_name: String,
        /// Model details as JSON: {version, hash, quantization}
        model_metadata: Option<String>,
        /// SHA-256 of encrypted prompt
        input_hash: vector<u8>,
        /// SHA-256 of AI output
        output_hash: vector<u8>,
        /// Wall-clock execution time in milliseconds
        execution_time_ms: u64,

        // === 5. WHY — Execution Purpose (3) ===
        /// Declared purpose (e.g., "customer_support", "code_review")
        purpose: Option<String>,
        /// Policy version that governed this execution
        policy_version: Option<u64>,
        /// Constraints as JSON string (e.g., timeout, max_tokens, temperature)
        constraints: Option<String>,

        // === 6. HOW TRUSTWORTHY — Trust Snapshot (5) ===
        /// Executor tier at execution time (0=Open, 1=Bronze, 2=Silver, 3=Gold)
        executor_tier: u8,
        /// Executor reputation score at execution time (0-1000)
        executor_reputation: u64,
        /// Executor staked NASUN amount at execution time (in SOE)
        executor_stake_amount: u64,
        /// Whether execution was TEE-verified
        tee_verified: bool,
        /// SHA-256 of TEE attestation document (None if no TEE)
        tee_attestation_hash: Option<vector<u8>>,

        // === 7. WHEN — Temporal (3) ===
        /// When the original request was created (ms since epoch)
        requested_at: u64,
        /// When settlement was finalized (ms since epoch, set by Clock)
        settled_at: u64,
        /// Status: 0=settled, 1=disputed, 2=slashed
        status: u8,

        // === 8. CHAIN — Action Linkage (2) ===
        /// AER that triggered this execution (for chained agent actions)
        triggered_by: Option<ID>,
        /// AER created as a result of this execution
        triggered_action: Option<ID>,
    }

    // ========== Events ==========

    /// Emitted when a new AI Execution Report is created
    public struct ExecutionReportCreated has copy, drop {
        request_id: u64,
        record_id: address,
        initiator: address,
        executor: address,
        model_name: String,
        payment_amount: u64,
        executor_tier: u8,
        tee_verified: bool,
        settled_at: u64,
    }

    /// Emitted when policy version is updated
    public struct PolicyUpdated has copy, drop {
        new_version: u64,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        let registry = AERRegistry {
            id: object::new(ctx),
            total_records: 0,
            record_ids: table::new(ctx),
            policy_version: 1,
        };
        transfer::share_object(registry);
    }

    // ========== Core Functions ==========

    /// Create an AI Execution Report after settlement.
    ///
    /// Called by the executor in the same PTB as submit_proof for atomicity.
    /// All data is passed as parameters — no cross-package reads.
    /// The report is transferred to the initiator as proof.
    public fun create_report(
        registry: &mut AERRegistry,
        // 1. WHO — Requester
        request_id: u64,
        initiator: address,
        authorizer: address,
        delegation_path: vector<address>,
        // 2. WHO — Executor
        executor: address,
        executor_principal: Option<address>,
        // 3. HOW MUCH
        payment_amount: u64,
        payment_token: u8,
        executor_received: u64,
        fee_detail: Option<String>,
        budget_id: Option<ID>,
        budget_remaining: Option<u64>,
        // 4. WHAT
        model_name: String,
        model_metadata: Option<String>,
        input_hash: vector<u8>,
        output_hash: vector<u8>,
        execution_time_ms: u64,
        // 5. WHY
        purpose: Option<String>,
        policy_version: Option<u64>,
        constraints: Option<String>,
        // 6. HOW TRUSTWORTHY
        executor_tier: u8,
        executor_reputation: u64,
        executor_stake_amount: u64,
        tee_verified: bool,
        tee_attestation_hash: Option<vector<u8>>,
        // 7. WHEN
        requested_at: u64,
        // 8. CHAIN
        triggered_by: Option<ID>,
        triggered_action: Option<ID>,
        // System
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Validate hashes
        assert!(
            vector::length(&input_hash) == HASH_LENGTH,
            E_INVALID_INPUT_HASH,
        );
        assert!(
            vector::length(&output_hash) == HASH_LENGTH,
            E_INVALID_OUTPUT_HASH,
        );

        // Validate delegation path depth (D-6)
        assert!(
            vector::length(&delegation_path) <= MAX_DELEGATION_DEPTH,
            E_DELEGATION_PATH_TOO_LONG,
        );

        let now = clock.timestamp_ms();

        let report = AIExecutionReport {
            id: object::new(ctx),
            request_id,
            // 1. WHO — Requester
            initiator,
            authorizer,
            delegation_path,
            // 2. WHO — Executor
            executor,
            executor_principal,
            // 3. HOW MUCH
            payment_amount,
            payment_token,
            executor_received,
            fee_detail,
            budget_id,
            budget_remaining,
            // 4. WHAT
            model_name,
            model_metadata,
            input_hash,
            output_hash,
            execution_time_ms,
            // 5. WHY
            purpose,
            policy_version,
            constraints,
            // 6. HOW TRUSTWORTHY
            executor_tier,
            executor_reputation,
            executor_stake_amount,
            tee_verified,
            tee_attestation_hash,
            // 7. WHEN
            requested_at,
            settled_at: now,
            status: STATUS_SETTLED,
            // 8. CHAIN
            triggered_by,
            triggered_action,
        };

        let record_id = object::id_address(&report);

        // Track in registry
        registry.total_records = registry.total_records + 1;
        if (!table::contains(&registry.record_ids, request_id)) {
            table::add(&mut registry.record_ids, request_id, record_id);
        };

        // Emit event for off-chain indexing
        event::emit(ExecutionReportCreated {
            request_id,
            record_id,
            initiator,
            executor,
            model_name,
            payment_amount,
            executor_tier,
            tee_verified,
            settled_at: now,
        });

        // Transfer to initiator as immutable proof
        transfer::transfer(report, initiator);
    }

    // ========== Admin Functions ==========

    /// Increment policy version. Called when governance parameters change.
    public fun update_policy(
        _admin: &AdminCap,
        registry: &mut AERRegistry,
        _ctx: &mut TxContext,
    ) {
        registry.policy_version = registry.policy_version + 1;

        event::emit(PolicyUpdated {
            new_version: registry.policy_version,
        });
    }

    // ========== View Functions ==========

    // --- Registry views ---

    public fun get_total_records(registry: &AERRegistry): u64 {
        registry.total_records
    }

    public fun get_policy_version(registry: &AERRegistry): u64 {
        registry.policy_version
    }

    public fun has_record(registry: &AERRegistry, request_id: u64): bool {
        table::contains(&registry.record_ids, request_id)
    }

    public fun get_record_id(registry: &AERRegistry, request_id: u64): address {
        *table::borrow(&registry.record_ids, request_id)
    }

    // --- Report field accessors ---

    // 1. WHO — Requester
    public fun get_request_id(report: &AIExecutionReport): u64 { report.request_id }
    public fun get_initiator(report: &AIExecutionReport): address { report.initiator }
    public fun get_authorizer(report: &AIExecutionReport): address { report.authorizer }
    public fun get_delegation_path(report: &AIExecutionReport): &vector<address> { &report.delegation_path }

    // 2. WHO — Executor
    public fun get_executor(report: &AIExecutionReport): address { report.executor }
    public fun get_executor_principal(report: &AIExecutionReport): &Option<address> { &report.executor_principal }

    // 3. HOW MUCH
    public fun get_payment_amount(report: &AIExecutionReport): u64 { report.payment_amount }
    public fun get_payment_token(report: &AIExecutionReport): u8 { report.payment_token }
    public fun get_executor_received(report: &AIExecutionReport): u64 { report.executor_received }
    public fun get_fee_detail(report: &AIExecutionReport): &Option<String> { &report.fee_detail }
    public fun get_budget_id(report: &AIExecutionReport): &Option<ID> { &report.budget_id }
    public fun get_budget_remaining(report: &AIExecutionReport): &Option<u64> { &report.budget_remaining }

    // 4. WHAT
    public fun get_model_name(report: &AIExecutionReport): String { report.model_name }
    public fun get_model_metadata(report: &AIExecutionReport): &Option<String> { &report.model_metadata }
    public fun get_execution_time_ms(report: &AIExecutionReport): u64 { report.execution_time_ms }

    // 5. WHY
    public fun get_purpose(report: &AIExecutionReport): &Option<String> { &report.purpose }
    public fun get_constraints(report: &AIExecutionReport): &Option<String> { &report.constraints }

    // 6. HOW TRUSTWORTHY
    public fun get_executor_tier(report: &AIExecutionReport): u8 { report.executor_tier }
    public fun get_executor_reputation(report: &AIExecutionReport): u64 { report.executor_reputation }
    public fun get_executor_stake_amount(report: &AIExecutionReport): u64 { report.executor_stake_amount }
    public fun get_tee_verified(report: &AIExecutionReport): bool { report.tee_verified }

    // 7. WHEN
    public fun get_requested_at(report: &AIExecutionReport): u64 { report.requested_at }
    public fun get_settled_at(report: &AIExecutionReport): u64 { report.settled_at }
    public fun get_status(report: &AIExecutionReport): u8 { report.status }

    // --- Derived helpers ---

    /// Check if this was a delegated (budget-funded) execution
    public fun is_delegated(report: &AIExecutionReport): bool {
        option::is_some(&report.budget_id)
    }

    /// Check if this was a TEE-verified execution
    public fun is_tee_verified(report: &AIExecutionReport): bool {
        report.tee_verified
    }

    /// Check if execution has delegation chain
    public fun has_delegation(report: &AIExecutionReport): bool {
        !vector::is_empty(&report.delegation_path)
    }

    /// Check if this execution is part of a chain
    public fun is_chained(report: &AIExecutionReport): bool {
        option::is_some(&report.triggered_by) || option::is_some(&report.triggered_action)
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
