/// Execution Compliance Record
///
/// Immutable proof that an AI execution followed defined process rules.
/// Created at settlement time, anchored on-chain for verifiable audit.
///
/// This object does NOT contain prompts, outputs, or subjective quality judgments.
/// It records: "This execution was performed under these conditions, by this executor,
/// in this TEE environment, and settled with this economic outcome."
///
/// Design principles:
/// 1. No content — only process metadata and cryptographic anchors
/// 2. Immutable after creation — compliance records cannot be altered
/// 3. Verifiable by anyone — all fields are on-chain and queryable
/// 4. Standalone — no cross-package dependencies (data passed as parameters)
module baram_compliance::compliance {
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use std::string::String;

    // ========== Error Codes ==========
    #[allow(unused_const)]
    const E_NOT_ADMIN: u64 = 300;
    const E_INVALID_RESULT_HASH: u64 = 301;
    const E_INVALID_PROMPT_HASH: u64 = 302;

    // ========== Constants ==========
    const HASH_LENGTH: u64 = 32; // SHA-256
    #[allow(unused_const)]
    const PCR_LENGTH: u64 = 48;  // SHA-384

    // TEE types (mirrors executor.move)
    const TEE_NONE: u8 = 0;
    #[allow(unused_const)]
    const TEE_NITRO: u8 = 1;
    #[allow(unused_const)]
    const TEE_SGX: u8 = 2;
    #[allow(unused_const)]
    const TEE_SEV: u8 = 3;

    // ========== Structs ==========

    /// Admin capability for compliance registry operations
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry that tracks all compliance records
    public struct ComplianceRegistry has key {
        id: UID,
        /// Total records created
        total_records: u64,
        /// Records indexed by request_id
        record_ids: Table<u64, address>,
        /// Current policy version
        policy_version: u64,
        /// Policy parameters (snapshotted into each record)
        default_timeout_ms: u64,
        min_price: u64,
    }

    /// Execution Compliance Record (ECR)
    ///
    /// An immutable on-chain proof that an AI execution was performed
    /// under specific, verifiable conditions. Transferred to the requester
    /// as an NFT-like receipt after settlement.
    ///
    /// This is NOT "the answer was correct."
    /// This IS "the process followed the rules."
    public struct ExecutionComplianceRecord has key, store {
        id: UID,

        // === Execution Context ===
        /// On-chain request ID from BaramRegistry
        request_id: u64,
        /// User who requested the computation
        requester: address,
        /// Executor who performed the computation
        executor: address,
        /// AI model identifier (e.g., "llama-3.2-3b-local")
        model: String,
        /// SHA-256 of encrypted prompt (identifier, not content)
        prompt_hash: vector<u8>,

        // === Execution Result ===
        /// SHA-256 of AI output (identifier, not content)
        result_hash: vector<u8>,
        /// Wall-clock execution time in milliseconds
        execution_time_ms: u64,

        // === Environment Proof ===
        /// TEE type: 0=None, 1=Nitro, 2=SGX, 3=SEV
        tee_type: u8,
        /// Actual PCR0 from attestation (48 bytes, empty if no TEE)
        pcr0: vector<u8>,
        /// SHA-256 of COSE_Sign1 rawDocument (empty if no TEE)
        attestation_hash: vector<u8>,
        /// AttestationRegistry baseline version used for verification
        pcr_baseline_version: u64,
        /// Whether PCR values matched the registered baseline
        pcr_verified: bool,

        // === Credibility Snapshot ===
        /// Executor's reputation score at execution time (0-1000)
        executor_reputation: u64,
        /// Executor's staked NASUN amount at execution time (in SOE)
        executor_stake_amount: u64,
        /// Executor's cumulative slash count at execution time
        executor_slash_count: u64,

        // === Economic Finality ===
        /// NUSDC payment amount (6 decimals)
        payment_amount: u64,

        // === Temporal Proof ===
        /// When the original request was created (ms since epoch)
        request_created_at: u64,
        /// When the settlement was finalized (ms since epoch)
        settled_at: u64,

        // === Policy Snapshot ===
        /// Policy version at time of settlement
        policy_version: u64,
        /// Timeout that applied to this request (ms)
        timeout_ms: u64,
        /// Minimum price that applied to this request
        min_price: u64,
    }

    // ========== Events ==========

    /// Emitted when a new compliance record is created
    public struct ComplianceRecordCreated has copy, drop {
        request_id: u64,
        record_id: address,
        executor: address,
        requester: address,
        tee_type: u8,
        pcr_verified: bool,
        executor_reputation: u64,
        payment_amount: u64,
        settled_at: u64,
    }

    /// Emitted when policy parameters are updated
    public struct PolicyUpdated has copy, drop {
        new_version: u64,
        default_timeout_ms: u64,
        min_price: u64,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        let registry = ComplianceRegistry {
            id: object::new(ctx),
            total_records: 0,
            record_ids: table::new(ctx),
            policy_version: 1,
            // Mirrors baram.move defaults
            default_timeout_ms: 300_000, // 5 minutes
            min_price: 100_000,          // 0.1 NUSDC
        };
        transfer::share_object(registry);
    }

    // ========== Core Functions ==========

    /// Create an ExecutionComplianceRecord after settlement.
    ///
    /// Called by the executor (or admin) after submit_proof succeeds on BaramRegistry.
    /// All data is passed as parameters — no cross-package reads.
    /// The record is transferred to the requester as proof of compliant execution.
    ///
    /// Designed to be called in the same PTB as submit_proof for atomicity.
    public entry fun create_record(
        registry: &mut ComplianceRegistry,
        // Execution context (from ComputeRequest)
        request_id: u64,
        requester: address,
        executor: address,
        model: String,
        prompt_hash: vector<u8>,
        // Execution result
        result_hash: vector<u8>,
        execution_time_ms: u64,
        // Environment proof
        tee_type: u8,
        pcr0: vector<u8>,
        attestation_hash: vector<u8>,
        pcr_baseline_version: u64,
        pcr_verified: bool,
        // Credibility snapshot (from ExecutorInfo + ExecutorStake)
        executor_reputation: u64,
        executor_stake_amount: u64,
        executor_slash_count: u64,
        // Economic finality
        payment_amount: u64,
        // Temporal
        request_created_at: u64,
        // Clock
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Validate hashes
        assert!(
            vector::length(&prompt_hash) == HASH_LENGTH,
            E_INVALID_PROMPT_HASH,
        );
        assert!(
            vector::length(&result_hash) == HASH_LENGTH,
            E_INVALID_RESULT_HASH,
        );

        let now = clock.timestamp_ms();

        let record = ExecutionComplianceRecord {
            id: object::new(ctx),
            // Execution context
            request_id,
            requester,
            executor,
            model,
            prompt_hash,
            // Execution result
            result_hash,
            execution_time_ms,
            // Environment proof
            tee_type,
            pcr0,
            attestation_hash,
            pcr_baseline_version,
            pcr_verified,
            // Credibility snapshot
            executor_reputation,
            executor_stake_amount,
            executor_slash_count,
            // Economic finality
            payment_amount,
            // Temporal proof
            request_created_at,
            settled_at: now,
            // Policy snapshot
            policy_version: registry.policy_version,
            timeout_ms: registry.default_timeout_ms,
            min_price: registry.min_price,
        };

        let record_id = object::id_address(&record);

        // Track in registry
        registry.total_records = registry.total_records + 1;
        if (!table::contains(&registry.record_ids, request_id)) {
            table::add(&mut registry.record_ids, request_id, record_id);
        };

        // Emit event
        event::emit(ComplianceRecordCreated {
            request_id,
            record_id,
            executor,
            requester,
            tee_type,
            pcr_verified,
            executor_reputation,
            payment_amount,
            settled_at: now,
        });

        // Transfer to requester as immutable proof
        transfer::transfer(record, requester);
    }

    // ========== Admin Functions ==========

    /// Update policy parameters. Increments policy_version automatically.
    public entry fun update_policy(
        _admin: &AdminCap,
        registry: &mut ComplianceRegistry,
        default_timeout_ms: u64,
        min_price: u64,
        _ctx: &mut TxContext,
    ) {
        registry.policy_version = registry.policy_version + 1;
        registry.default_timeout_ms = default_timeout_ms;
        registry.min_price = min_price;

        event::emit(PolicyUpdated {
            new_version: registry.policy_version,
            default_timeout_ms,
            min_price,
        });
    }

    // ========== View Functions ==========

    /// Get total number of compliance records created
    public fun get_total_records(registry: &ComplianceRegistry): u64 {
        registry.total_records
    }

    /// Get current policy version
    public fun get_policy_version(registry: &ComplianceRegistry): u64 {
        registry.policy_version
    }

    /// Check if a compliance record exists for a request
    public fun has_record(registry: &ComplianceRegistry, request_id: u64): bool {
        table::contains(&registry.record_ids, request_id)
    }

    /// Get compliance record object ID for a request
    public fun get_record_id(registry: &ComplianceRegistry, request_id: u64): address {
        *table::borrow(&registry.record_ids, request_id)
    }

    /// Get ECR fields — Execution Context
    public fun get_request_id(record: &ExecutionComplianceRecord): u64 { record.request_id }
    public fun get_requester(record: &ExecutionComplianceRecord): address { record.requester }
    public fun get_executor(record: &ExecutionComplianceRecord): address { record.executor }
    public fun get_model(record: &ExecutionComplianceRecord): String { record.model }

    /// Get ECR fields — Environment Proof
    public fun get_tee_type(record: &ExecutionComplianceRecord): u8 { record.tee_type }
    public fun get_pcr_verified(record: &ExecutionComplianceRecord): bool { record.pcr_verified }
    public fun get_pcr_baseline_version(record: &ExecutionComplianceRecord): u64 { record.pcr_baseline_version }

    /// Get ECR fields — Credibility
    public fun get_executor_reputation(record: &ExecutionComplianceRecord): u64 { record.executor_reputation }
    public fun get_executor_stake_amount(record: &ExecutionComplianceRecord): u64 { record.executor_stake_amount }

    /// Get ECR fields — Economic
    public fun get_payment_amount(record: &ExecutionComplianceRecord): u64 { record.payment_amount }

    /// Get ECR fields — Temporal
    public fun get_settled_at(record: &ExecutionComplianceRecord): u64 { record.settled_at }

    /// Get ECR fields — Policy
    public fun get_record_policy_version(record: &ExecutionComplianceRecord): u64 { record.policy_version }

    /// Check if execution used TEE
    public fun is_tee_execution(record: &ExecutionComplianceRecord): bool {
        record.tee_type != TEE_NONE
    }

    /// Check if execution is fully compliant (TEE + PCR verified + staked)
    public fun is_fully_compliant(record: &ExecutionComplianceRecord): bool {
        record.tee_type != TEE_NONE &&
        record.pcr_verified &&
        record.executor_stake_amount > 0
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
