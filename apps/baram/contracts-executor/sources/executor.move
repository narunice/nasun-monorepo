/// Executor Registry - Manages registered AI executors for Baram
///
/// Phase B MVP:
/// - Whitelist-based executor registration (AdminCap required)
/// - TEE info stored but not verified (Phase C)
/// - Stake optional (mandatory in Phase D)
///
/// Future phases:
/// - Phase C: TEE attestation verification
/// - Phase D: Stake requirements, slashing mechanism
/// - Phase E: Tiered system (Validator/Staked/Open)
module baram_executor::executor {
    use sui::table::{Self, Table};
    use sui::clock::Clock;
    use sui::event;
    use std::string::String;

    // ========== Error Codes ==========
    const E_NOT_ADMIN: u64 = 100;
    const E_EXECUTOR_EXISTS: u64 = 101;
    const E_EXECUTOR_NOT_FOUND: u64 = 102;
    const E_EXECUTOR_NOT_ACTIVE: u64 = 103;

    // ========== Constants ==========
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
}
