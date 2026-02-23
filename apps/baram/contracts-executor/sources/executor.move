/// Executor Registry - Manages registered AI executors for Baram
///
/// Phase B MVP:
/// - Whitelist-based executor registration (AdminCap required)
/// - TEE info stored but not verified (Phase C)
/// - Stake optional (mandatory in Phase D)
///
/// Phase D (Current):
/// - Staking integration via executor_staking module
/// - stake_object_id links to ExecutorStake
/// - is_staked indicates minimum stake requirement met
///
/// Future phases:
/// - Phase E: Tiered system (Validator/Staked/Open)
module baram_executor::executor {
    use sui::table::{Self, Table};
    use sui::clock::Clock;
    use sui::event;
    use std::string::String;

    // ========== Error Codes ==========
    #[allow(unused_const)]
    const E_NOT_ADMIN: u64 = 100;
    const E_EXECUTOR_EXISTS: u64 = 101;
    const E_EXECUTOR_NOT_FOUND: u64 = 102;
    #[allow(unused_const)]
    const E_EXECUTOR_NOT_ACTIVE: u64 = 103;
    const E_NOT_INACTIVE_LONG_ENOUGH: u64 = 104;
    const E_REPUTATION_AT_MINIMUM: u64 = 105;
    const E_REQUEST_ALREADY_PROCESSED: u64 = 106;

    // ========== Constants ==========
    // Reputation decay: fixed amount per call, protocol-determined (not admin-discretionary)
    const DECAY_AMOUNT: u64 = 50;
    const DECAY_THRESHOLD_MS: u64 = 2_592_000_000; // 30 days in milliseconds
    const DECAY_MIN_REPUTATION: u64 = 100;

    const TEE_NONE: u8 = 0;
    #[allow(unused_const)]
    const TEE_NITRO: u8 = 1;
    #[allow(unused_const)]
    const TEE_SGX: u8 = 2;
    #[allow(unused_const)]
    const TEE_SEV: u8 = 3;

    // ========== Structs ==========

    /// Admin capability for managing executor registry
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry for all executors
    public struct ExecutorRegistry has key {
        id: UID,
        executors: Table<address, ExecutorInfo>,
        total_executors: u64,
        active_executors: u64,
    }

    /// Executor registration information
    public struct ExecutorInfo has store, copy, drop {
        operator: address,
        name: String,
        endpoint_url: String,     // API endpoint (Lambda URL for now)
        tee_type: u8,             // 0=None, 1=Nitro, 2=SGX, 3=SEV
        tee_attestation: vector<u8>, // TEE attestation hash (for future verification)
        supported_models: vector<String>, // e.g., ["gpt-4o-mini", "gpt-4o"]
        reputation: u64,          // 0-1000 (starts at 500)
        completed_jobs: u64,
        failed_jobs: u64,
        registered_at: u64,
        last_active_at: u64,
        is_active: bool,
        // Phase D: Staking integration
        stake_object_id: Option<ID>,  // Reference to ExecutorStake object
        is_staked: bool,              // True if minimum stake requirement met
    }

    // ========== Events ==========

    public struct ExecutorRegistered has copy, drop {
        operator: address,
        name: String,
        endpoint_url: String,
        tee_type: u8,
    }

    public struct ExecutorUpdated has copy, drop {
        operator: address,
        name: String,
        endpoint_url: String,
        is_active: bool,
    }

    public struct ExecutorDeactivated has copy, drop {
        operator: address,
        reason: String,
    }

    public struct ExecutorStatsUpdated has copy, drop {
        operator: address,
        completed_jobs: u64,
        failed_jobs: u64,
        reputation: u64,
    }

    public struct ExecutorEndpointUpdated has copy, drop {
        operator: address,
        endpoint_url: String,
    }

    public struct ReputationDecayed has copy, drop {
        operator: address,
        old_reputation: u64,
        new_reputation: u64,
    }

    /// Separate shared object for request_id dedup guard.
    /// Stored independently from ExecutorRegistry to allow upgrade-compatible addition.
    public struct ProcessedRequests has key {
        id: UID,
        requests: Table<u64, bool>,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        // Create AdminCap for the deployer
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        // Create shared ExecutorRegistry
        let registry = ExecutorRegistry {
            id: object::new(ctx),
            executors: table::new(ctx),
            total_executors: 0,
            active_executors: 0,
        };
        transfer::share_object(registry);

        // Create shared ProcessedRequests (dedup guard for self-service stats)
        let processed = ProcessedRequests {
            id: object::new(ctx),
            requests: table::new(ctx),
        };
        transfer::share_object(processed);
    }

    /// Create ProcessedRequests shared object (for package upgrade migration).
    /// Call once after upgrading from a version that did not have ProcessedRequests.
    public entry fun create_processed_requests(
        _admin: &AdminCap,
        ctx: &mut TxContext,
    ) {
        let processed = ProcessedRequests {
            id: object::new(ctx),
            requests: table::new(ctx),
        };
        transfer::share_object(processed);
    }

    // ========== Admin Functions ==========

    /// Register a new executor (admin only)
    public entry fun register_executor(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        name: String,
        endpoint_url: String,
        tee_type: u8,
        tee_attestation: vector<u8>,
        supported_models: vector<String>,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        assert!(!table::contains(&registry.executors, operator), E_EXECUTOR_EXISTS);

        let now = clock.timestamp_ms();

        let info = ExecutorInfo {
            operator,
            name,
            endpoint_url,
            tee_type,
            tee_attestation,
            supported_models,
            reputation: 500,  // Start at neutral
            completed_jobs: 0,
            failed_jobs: 0,
            registered_at: now,
            last_active_at: now,
            is_active: true,
            // Phase D: Initially no stake
            stake_object_id: option::none(),
            is_staked: false,
        };

        table::add(&mut registry.executors, operator, info);
        registry.total_executors = registry.total_executors + 1;
        registry.active_executors = registry.active_executors + 1;

        event::emit(ExecutorRegistered {
            operator,
            name,
            endpoint_url,
            tee_type,
        });
    }

    /// Update executor info (admin only)
    public entry fun update_executor(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        name: String,
        endpoint_url: String,
        supported_models: vector<String>,
        is_active: bool,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        let was_active = info.is_active;

        info.name = name;
        info.endpoint_url = endpoint_url;
        info.supported_models = supported_models;
        info.is_active = is_active;

        // Update active count if status changed
        if (was_active && !is_active) {
            registry.active_executors = registry.active_executors - 1;
        } else if (!was_active && is_active) {
            registry.active_executors = registry.active_executors + 1;
        };

        event::emit(ExecutorUpdated {
            operator,
            name,
            endpoint_url,
            is_active,
        });
    }

    /// Deactivate an executor (admin only)
    public entry fun deactivate_executor(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        reason: String,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);

        if (info.is_active) {
            info.is_active = false;
            registry.active_executors = registry.active_executors - 1;
        };

        event::emit(ExecutorDeactivated {
            operator,
            reason,
        });
    }

    /// Update executor TEE attestation (admin only)
    public entry fun update_tee_attestation(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        tee_type: u8,
        tee_attestation: vector<u8>,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        info.tee_type = tee_type;
        info.tee_attestation = tee_attestation;
    }

    /// Update executor stats after job completion (called by BaramRegistry)
    /// For MVP, admin calls this. Future: automated via BaramRegistry integration
    public entry fun update_executor_stats(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        job_completed: bool,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        info.last_active_at = clock.timestamp_ms();

        if (job_completed) {
            info.completed_jobs = info.completed_jobs + 1;
            // Increase reputation (max 1000)
            if (info.reputation < 990) {
                info.reputation = info.reputation + 10;
            } else {
                info.reputation = 1000;
            };
        } else {
            info.failed_jobs = info.failed_jobs + 1;
            // Decrease reputation (min 0)
            if (info.reputation > 20) {
                info.reputation = info.reputation - 20;
            } else {
                info.reputation = 0;
            };
        };

        event::emit(ExecutorStatsUpdated {
            operator,
            completed_jobs: info.completed_jobs,
            failed_jobs: info.failed_jobs,
            reputation: info.reputation,
        });
    }

    /// Link executor to their stake object (admin only)
    /// Called after executor creates a stake in executor_staking module
    public entry fun link_stake(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        stake_id: ID,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        info.stake_object_id = option::some(stake_id);
    }

    /// Update executor's staking status (admin only)
    /// Called when stake amount changes (stake added, slashed, withdrawn)
    public entry fun update_stake_status(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        is_staked: bool,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        info.is_staked = is_staked;
    }

    /// Unlink stake from executor (admin only)
    /// Called when executor withdraws all stake
    public entry fun unlink_stake(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        info.stake_object_id = option::none();
        info.is_staked = false;
    }

    // ========== Reputation Decay ==========

    /// Decay reputation for inactive executor (admin only).
    /// Decay amount is fixed at DECAY_AMOUNT (50) per call — protocol-determined, not admin-discretionary.
    /// Only callable when last_active_at + DECAY_THRESHOLD_MS (30 days) has been exceeded.
    /// Reputation cannot drop below DECAY_MIN_REPUTATION (100).
    public entry fun decay_reputation(
        _admin: &AdminCap,
        registry: &mut ExecutorRegistry,
        operator: address,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        let now = clock.timestamp_ms();

        // Must be inactive for at least 30 days
        assert!(now >= info.last_active_at + DECAY_THRESHOLD_MS, E_NOT_INACTIVE_LONG_ENOUGH);

        // Must have reputation above minimum
        assert!(info.reputation > DECAY_MIN_REPUTATION, E_REPUTATION_AT_MINIMUM);

        // Apply fixed decay, floor at DECAY_MIN_REPUTATION
        if (info.reputation > DECAY_MIN_REPUTATION + DECAY_AMOUNT) {
            info.reputation = info.reputation - DECAY_AMOUNT;
        } else {
            info.reputation = DECAY_MIN_REPUTATION;
        };

        event::emit(ExecutorStatsUpdated {
            operator,
            completed_jobs: info.completed_jobs,
            failed_jobs: info.failed_jobs,
            reputation: info.reputation,
        });
    }

    // ========== Self-Service Functions (Phase F-2) ==========

    /// Record successful job completion — callable by the executor itself.
    /// Must be called in the same PTB as submit_proof for correctness.
    /// request_id dedup prevents double-claiming reputation for the same job.
    ///
    /// SECURITY NOTE: This function cannot cross-validate that request_id exists
    /// in BaramRegistry (separate package). A registered executor could fabricate
    /// request_ids to inflate reputation. Mitigated by: dedup guard, executor
    /// whitelist, reputation cap (1000). Proper fix requires cross-package witness
    /// pattern or package merge (tracked for Phase G).
    public entry fun record_job_completion(
        registry: &mut ExecutorRegistry,
        processed: &mut ProcessedRequests,
        request_id: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.executors, sender), E_EXECUTOR_NOT_FOUND);
        assert!(!table::contains(&processed.requests, request_id), E_REQUEST_ALREADY_PROCESSED);

        table::add(&mut processed.requests, request_id, true);

        let info = table::borrow_mut(&mut registry.executors, sender);
        info.completed_jobs = info.completed_jobs + 1;
        if (info.reputation < 990) {
            info.reputation = info.reputation + 10;
        } else {
            info.reputation = 1000;
        };
        info.last_active_at = clock.timestamp_ms();

        event::emit(ExecutorStatsUpdated {
            operator: sender,
            completed_jobs: info.completed_jobs,
            failed_jobs: info.failed_jobs,
            reputation: info.reputation,
        });
    }

    /// Record failed job — callable by the executor itself.
    /// Used in auto-cancel flow when execution fails.
    /// request_id dedup prevents double-penalizing for the same job.
    public entry fun record_job_failure(
        registry: &mut ExecutorRegistry,
        processed: &mut ProcessedRequests,
        request_id: u64,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.executors, sender), E_EXECUTOR_NOT_FOUND);
        assert!(!table::contains(&processed.requests, request_id), E_REQUEST_ALREADY_PROCESSED);

        table::add(&mut processed.requests, request_id, true);

        let info = table::borrow_mut(&mut registry.executors, sender);
        info.failed_jobs = info.failed_jobs + 1;
        if (info.reputation > 20) {
            info.reputation = info.reputation - 20;
        } else {
            info.reputation = 0;
        };
        info.last_active_at = clock.timestamp_ms();

        event::emit(ExecutorStatsUpdated {
            operator: sender,
            completed_jobs: info.completed_jobs,
            failed_jobs: info.failed_jobs,
            reputation: info.reputation,
        });
    }

    /// Executor updates its own endpoint URL and supported models.
    /// Only the registered executor (tx.sender) can modify its own operational metadata.
    /// Cannot change name, is_active, or TEE attestation (admin-only fields).
    public entry fun update_own_endpoint(
        registry: &mut ExecutorRegistry,
        endpoint_url: String,
        supported_models: vector<String>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.executors, sender), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, sender);
        info.endpoint_url = endpoint_url;
        info.supported_models = supported_models;
        info.last_active_at = clock.timestamp_ms();

        event::emit(ExecutorEndpointUpdated {
            operator: sender,
            endpoint_url,
        });
    }

    /// Permissionless reputation decay for inactive executors.
    /// Anyone can call this as a protocol maintenance action.
    /// Fixed decay amount (50), 30-day inactivity threshold enforced by Clock.
    /// last_active_at is advanced by 30 days to prevent re-decay within that window.
    public entry fun decay_reputation_permissionless(
        registry: &mut ExecutorRegistry,
        operator: address,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);

        let info = table::borrow_mut(&mut registry.executors, operator);
        let now = clock.timestamp_ms();

        assert!(now >= info.last_active_at + DECAY_THRESHOLD_MS, E_NOT_INACTIVE_LONG_ENOUGH);
        assert!(info.reputation > DECAY_MIN_REPUTATION, E_REPUTATION_AT_MINIMUM);

        let old_reputation = info.reputation;
        if (info.reputation > DECAY_MIN_REPUTATION + DECAY_AMOUNT) {
            info.reputation = info.reputation - DECAY_AMOUNT;
        } else {
            info.reputation = DECAY_MIN_REPUTATION;
        };

        // Advance last_active_at by DECAY_THRESHOLD_MS to prevent re-decay within 30 days
        info.last_active_at = info.last_active_at + DECAY_THRESHOLD_MS;

        event::emit(ReputationDecayed {
            operator,
            old_reputation,
            new_reputation: info.reputation,
        });
    }

    // ========== View Functions ==========

    /// Check if an executor is registered and active
    public fun is_valid_executor(registry: &ExecutorRegistry, operator: address): bool {
        if (!table::contains(&registry.executors, operator)) {
            return false
        };
        let info = table::borrow(&registry.executors, operator);
        info.is_active
    }

    /// Check if executor exists (regardless of active status)
    public fun executor_exists(registry: &ExecutorRegistry, operator: address): bool {
        table::contains(&registry.executors, operator)
    }

    /// Get executor info (aborts if not found)
    public fun get_executor_info(registry: &ExecutorRegistry, operator: address): ExecutorInfo {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);
        *table::borrow(&registry.executors, operator)
    }

    /// Get executor reputation
    public fun get_executor_reputation(registry: &ExecutorRegistry, operator: address): u64 {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);
        let info = table::borrow(&registry.executors, operator);
        info.reputation
    }

    /// Get executor TEE type
    public fun get_executor_tee_type(registry: &ExecutorRegistry, operator: address): u8 {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);
        let info = table::borrow(&registry.executors, operator);
        info.tee_type
    }

    /// Get executor endpoint URL
    public fun get_executor_endpoint(registry: &ExecutorRegistry, operator: address): String {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);
        let info = table::borrow(&registry.executors, operator);
        info.endpoint_url
    }

    /// Get registry statistics
    public fun get_registry_stats(registry: &ExecutorRegistry): (u64, u64) {
        (registry.total_executors, registry.active_executors)
    }

    /// Check if executor has staked minimum amount
    public fun is_executor_staked(registry: &ExecutorRegistry, operator: address): bool {
        if (!table::contains(&registry.executors, operator)) {
            return false
        };
        let info = table::borrow(&registry.executors, operator);
        info.is_staked
    }

    /// Get executor's stake object ID (if linked)
    public fun get_executor_stake_id(registry: &ExecutorRegistry, operator: address): Option<ID> {
        assert!(table::contains(&registry.executors, operator), E_EXECUTOR_NOT_FOUND);
        let info = table::borrow(&registry.executors, operator);
        info.stake_object_id
    }

    /// Check if executor is valid AND staked (for job assignment)
    public fun is_valid_staked_executor(registry: &ExecutorRegistry, operator: address): bool {
        if (!table::contains(&registry.executors, operator)) {
            return false
        };
        let info = table::borrow(&registry.executors, operator);
        info.is_active && info.is_staked
    }

    /// Check if executor supports a specific model
    public fun supports_model(registry: &ExecutorRegistry, operator: address, model: &String): bool {
        if (!table::contains(&registry.executors, operator)) {
            return false
        };
        let info = table::borrow(&registry.executors, operator);
        let models = &info.supported_models;
        let len = vector::length(models);
        let mut i = 0;
        while (i < len) {
            if (vector::borrow(models, i) == model) {
                return true
            };
            i = i + 1;
        };
        false
    }

    // ========== Helper Functions ==========

    /// Get TEE type name (for display purposes)
    public fun tee_type_name(tee_type: u8): String {
        if (tee_type == TEE_NONE) {
            std::string::utf8(b"None")
        } else if (tee_type == 1) {
            std::string::utf8(b"AWS Nitro")
        } else if (tee_type == 2) {
            std::string::utf8(b"Intel SGX")
        } else if (tee_type == 3) {
            std::string::utf8(b"AMD SEV")
        } else {
            std::string::utf8(b"Unknown")
        }
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun create_processed_requests_for_testing(ctx: &mut TxContext) {
        let processed = ProcessedRequests {
            id: object::new(ctx),
            requests: table::new(ctx),
        };
        transfer::share_object(processed);
    }

    // ========== Tests ==========

    #[test_only]
    use sui::test_scenario;
    #[test_only]
    use sui::clock;

    #[test_only]
    fun setup_executor(scenario: &mut test_scenario::Scenario, operator: address) {
        test_scenario::next_tx(scenario, @0xA1);
        {
            init_for_testing(test_scenario::ctx(scenario));
        };
        test_scenario::next_tx(scenario, @0xA1);
        {
            let admin = test_scenario::take_from_sender<AdminCap>(scenario);
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(scenario));

            register_executor(
                &admin,
                &mut registry,
                operator,
                std::string::utf8(b"Test Executor"),
                std::string::utf8(b"http://localhost:3000"),
                TEE_NONE,
                vector[],
                vector[std::string::utf8(b"llama-3.2-3b")],
                &clk,
                test_scenario::ctx(scenario),
            );

            clock::destroy_for_testing(clk);
            test_scenario::return_to_sender(scenario, admin);
            test_scenario::return_shared(registry);
        };
    }

    #[test]
    fun test_record_job_completion() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        // Record job completion as the executor
        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut processed = test_scenario::take_shared<ProcessedRequests>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            record_job_completion(&mut registry, &mut processed, 1001, &clk, test_scenario::ctx(&mut scenario));

            let info = get_executor_info(&registry, operator);
            assert!(info.completed_jobs == 1);
            assert!(info.reputation == 510); // 500 + 10

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
            test_scenario::return_shared(processed);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_REQUEST_ALREADY_PROCESSED)]
    fun test_record_job_completion_dedup() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut processed = test_scenario::take_shared<ProcessedRequests>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            record_job_completion(&mut registry, &mut processed, 1001, &clk, test_scenario::ctx(&mut scenario));
            // Second call with same request_id should abort
            record_job_completion(&mut registry, &mut processed, 1001, &clk, test_scenario::ctx(&mut scenario));

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
            test_scenario::return_shared(processed);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_record_job_failure() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut processed = test_scenario::take_shared<ProcessedRequests>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            record_job_failure(&mut registry, &mut processed, 2001, &clk, test_scenario::ctx(&mut scenario));

            let info = get_executor_info(&registry, operator);
            assert!(info.failed_jobs == 1);
            assert!(info.reputation == 480); // 500 - 20

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
            test_scenario::return_shared(processed);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_update_own_endpoint() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            update_own_endpoint(
                &mut registry,
                std::string::utf8(b"http://new-endpoint:3000"),
                vector[std::string::utf8(b"gpt-4o"), std::string::utf8(b"llama-3.2-3b")],
                &clk,
                test_scenario::ctx(&mut scenario),
            );

            let info = get_executor_info(&registry, operator);
            assert!(info.endpoint_url == std::string::utf8(b"http://new-endpoint:3000"));

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_EXECUTOR_NOT_FOUND)]
    fun test_update_own_endpoint_not_registered() {
        let mut scenario = test_scenario::begin(@0xA1);
        // Init but don't register any executor
        test_scenario::next_tx(&mut scenario, @0xA1);
        {
            init_for_testing(test_scenario::ctx(&mut scenario));
        };

        // Try to update endpoint as unregistered address
        test_scenario::next_tx(&mut scenario, @0xC1);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            update_own_endpoint(
                &mut registry,
                std::string::utf8(b"http://malicious:3000"),
                vector[],
                &clk,
                test_scenario::ctx(&mut scenario),
            );

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_decay_reputation_permissionless() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        // Anyone can call decay after 30 days
        test_scenario::next_tx(&mut scenario, @0xB1);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            // Advance clock past 30 days
            clock::set_for_testing(&mut clk, DECAY_THRESHOLD_MS + 1);

            decay_reputation_permissionless(&mut registry, operator, &clk, test_scenario::ctx(&mut scenario));

            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 450); // 500 - 50

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = E_NOT_INACTIVE_LONG_ENOUGH)]
    fun test_decay_reputation_too_early() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        test_scenario::next_tx(&mut scenario, @0xB1);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            // Clock at 0 — should fail because 30 days haven't passed
            decay_reputation_permissionless(&mut registry, operator, &clk, test_scenario::ctx(&mut scenario));

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_decay_prevents_re_decay() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        // First decay at day 31
        test_scenario::next_tx(&mut scenario, @0xB1);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            clock::set_for_testing(&mut clk, DECAY_THRESHOLD_MS + 1);

            decay_reputation_permissionless(&mut registry, operator, &clk, test_scenario::ctx(&mut scenario));
            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 450);

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        // Second decay at day 61 (last_active_at was advanced to day 30, so day 61 > day 30 + 30)
        test_scenario::next_tx(&mut scenario, @0xB1);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            clock::set_for_testing(&mut clk, 2 * DECAY_THRESHOLD_MS + 2);

            decay_reputation_permissionless(&mut registry, operator, &clk, test_scenario::ctx(&mut scenario));
            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 400); // 450 - 50

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_reputation_cap_at_1000() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        // Set reputation to 995 via admin, then record completion to test cap
        test_scenario::next_tx(&mut scenario, @0xA1);
        {
            let admin = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            // Bring reputation to near-max via repeated completions (admin version)
            let mut i = 0;
            while (i < 50) {
                update_executor_stats(&admin, &mut registry, operator, true, &clk, test_scenario::ctx(&mut scenario));
                i = i + 1;
            };

            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 1000); // capped at 1000

            clock::destroy_for_testing(clk);
            test_scenario::return_to_sender(&scenario, admin);
            test_scenario::return_shared(registry);
        };

        // Now record one more completion via self-service — should stay at 1000
        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut processed = test_scenario::take_shared<ProcessedRequests>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            record_job_completion(&mut registry, &mut processed, 9999, &clk, test_scenario::ctx(&mut scenario));

            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 1000);

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
            test_scenario::return_shared(processed);
        };

        test_scenario::end(scenario);
    }

    #[test]
    fun test_reputation_floor_at_zero() {
        let operator = @0xE1;
        let mut scenario = test_scenario::begin(@0xA1);
        setup_executor(&mut scenario, operator);

        // Set reputation to near-zero via admin failures
        test_scenario::next_tx(&mut scenario, @0xA1);
        {
            let admin = test_scenario::take_from_sender<AdminCap>(&scenario);
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            let mut i = 0;
            while (i < 25) {
                update_executor_stats(&admin, &mut registry, operator, false, &clk, test_scenario::ctx(&mut scenario));
                i = i + 1;
            };

            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 0); // 500 - 25*20 = 0

            clock::destroy_for_testing(clk);
            test_scenario::return_to_sender(&scenario, admin);
            test_scenario::return_shared(registry);
        };

        // Record failure via self-service — should stay at 0
        test_scenario::next_tx(&mut scenario, operator);
        {
            let mut registry = test_scenario::take_shared<ExecutorRegistry>(&scenario);
            let mut processed = test_scenario::take_shared<ProcessedRequests>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));

            record_job_failure(&mut registry, &mut processed, 8888, &clk, test_scenario::ctx(&mut scenario));

            let info = get_executor_info(&registry, operator);
            assert!(info.reputation == 0);

            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
            test_scenario::return_shared(processed);
        };

        test_scenario::end(scenario);
    }
}
