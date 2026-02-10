/// Executor Tier Registry - Compliance Eligibility Signal
///
/// Tier reflects staking commitment and operational track record.
/// It is NOT a trust guarantee, reward mechanism, or job allocation factor.
/// Tier = Compliance Eligibility Signal for user decision-making only.
///
/// Protocol Policy:
/// - No fee differentiation by tier
/// - No reward differentiation by tier
/// - No job quota/allocation by tier
/// - Tier is an eligibility profile, not a reward
///
/// Tier Calculation:
///   tier = min(stake_tier(staked_amount), reputation_tier(reputation))
///   Both conditions must be met simultaneously.
module baram_executor::executor_tier {
    use baram_executor::executor::{Self, AdminCap, ExecutorRegistry};
    use baram_executor::executor_staking::{Self, ExecutorStake};
    use sui::table::{Self, Table};
    use sui::event;
    use std::string::String;

    // ========== Error Codes ==========
    const E_TIER_REGISTRY_EXISTS: u64 = 300;
    const E_EXECUTOR_NOT_FOUND: u64 = 301;
    const E_EXECUTOR_ALREADY_REGISTERED: u64 = 302;
    const E_INVALID_TIER: u64 = 303;
    const E_BATCH_LENGTH_MISMATCH: u64 = 304;
    const E_BATCH_TOO_LARGE: u64 = 305;

    // ========== Batch Limits ==========
    const MAX_BATCH_SIZE: u64 = 100;

    // ========== Tier Constants ==========
    const TIER_OPEN: u8 = 0;
    const TIER_BRONZE: u8 = 1;
    const TIER_SILVER: u8 = 2;
    const TIER_GOLD: u8 = 3;

    // ========== Stake Thresholds (SOE, 9 decimals) ==========
    const BRONZE_STAKE: u64 = 1_000_000_000_000;    // 1,000 NASUN
    const SILVER_STAKE: u64 = 5_000_000_000_000;    // 5,000 NASUN
    const GOLD_STAKE: u64 = 10_000_000_000_000;     // 10,000 NASUN

    // ========== Reputation Thresholds (0-1000 scale) ==========
    const BRONZE_REP: u64 = 300;
    const SILVER_REP: u64 = 500;
    const GOLD_REP: u64 = 700;

    // ========== Structs ==========

    /// Shared registry mapping executor addresses to their tier
    public struct TierRegistry has key {
        id: UID,
        tiers: Table<address, u8>,
        total_registered: u64,
    }

    // ========== Events ==========

    public struct TierRegistryCreated has copy, drop {
        registry_id: address,
    }

    public struct TierChanged has copy, drop {
        executor: address,
        old_tier: u8,
        new_tier: u8,
        stake_amount: u64,
        reputation: u64,
    }

    public struct ExecutorTierRemoved has copy, drop {
        executor: address,
        old_tier: u8,
    }

    // ========== Admin Functions ==========

    /// Initialize TierRegistry shared object (one-time setup after package upgrade)
    public entry fun create_tier_registry(
        _admin: &AdminCap,
        ctx: &mut TxContext
    ) {
        let registry = TierRegistry {
            id: object::new(ctx),
            tiers: table::new(ctx),
            total_registered: 0,
        };

        event::emit(TierRegistryCreated {
            registry_id: object::id_address(&registry),
        });

        transfer::share_object(registry);
    }

    /// Recalculate and update tier for a single executor.
    /// stake_amount and reputation are passed as parameters (no cross-package reads).
    /// Admin is responsible for passing correct values from ExecutorStake and ExecutorInfo.
    public entry fun update_tier(
        _admin: &AdminCap,
        registry: &mut TierRegistry,
        operator: address,
        stake_amount: u64,
        reputation: u64,
        _ctx: &mut TxContext
    ) {
        let new_tier = calculate_tier(stake_amount, reputation);

        if (table::contains(&registry.tiers, operator)) {
            let old_tier = *table::borrow(&registry.tiers, operator);
            if (old_tier != new_tier) {
                *table::borrow_mut(&mut registry.tiers, operator) = new_tier;
                event::emit(TierChanged {
                    executor: operator,
                    old_tier,
                    new_tier,
                    stake_amount,
                    reputation,
                });
            };
        } else {
            // First time registration
            table::add(&mut registry.tiers, operator, new_tier);
            registry.total_registered = registry.total_registered + 1;
            event::emit(TierChanged {
                executor: operator,
                old_tier: TIER_OPEN,
                new_tier,
                stake_amount,
                reputation,
            });
        };
    }

    /// Batch update tiers for multiple executors.
    /// All vectors must have the same length.
    public entry fun batch_update_tiers(
        _admin: &AdminCap,
        registry: &mut TierRegistry,
        operators: vector<address>,
        stake_amounts: vector<u64>,
        reputations: vector<u64>,
        _ctx: &mut TxContext
    ) {
        let len = vector::length(&operators);
        assert!(len <= MAX_BATCH_SIZE, E_BATCH_TOO_LARGE);
        assert!(len == vector::length(&stake_amounts), E_BATCH_LENGTH_MISMATCH);
        assert!(len == vector::length(&reputations), E_BATCH_LENGTH_MISMATCH);

        let mut i = 0;
        while (i < len) {
            let operator = *vector::borrow(&operators, i);
            let stake_amount = *vector::borrow(&stake_amounts, i);
            let reputation = *vector::borrow(&reputations, i);
            let new_tier = calculate_tier(stake_amount, reputation);

            if (table::contains(&registry.tiers, operator)) {
                let old_tier = *table::borrow(&registry.tiers, operator);
                if (old_tier != new_tier) {
                    *table::borrow_mut(&mut registry.tiers, operator) = new_tier;
                    event::emit(TierChanged {
                        executor: operator,
                        old_tier,
                        new_tier,
                        stake_amount,
                        reputation,
                    });
                };
            } else {
                table::add(&mut registry.tiers, operator, new_tier);
                registry.total_registered = registry.total_registered + 1;
                event::emit(TierChanged {
                    executor: operator,
                    old_tier: TIER_OPEN,
                    new_tier,
                    stake_amount,
                    reputation,
                });
            };

            i = i + 1;
        };
    }

    /// Remove an executor from the tier registry
    public entry fun remove_executor(
        _admin: &AdminCap,
        registry: &mut TierRegistry,
        operator: address,
        _ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.tiers, operator), E_EXECUTOR_NOT_FOUND);

        let old_tier = table::remove(&mut registry.tiers, operator);
        registry.total_registered = registry.total_registered - 1;

        event::emit(ExecutorTierRemoved {
            executor: operator,
            old_tier,
        });
    }

    // ========== Self-Service Functions (Phase F-2) ==========

    /// Permissionless tier refresh using on-chain state.
    /// Reads reputation from ExecutorRegistry and stake from ExecutorStake.
    /// Anyone can call — result is always the correct tier based on current on-chain data.
    public entry fun refresh_tier_from_state(
        tier_registry: &mut TierRegistry,
        executor_registry: &ExecutorRegistry,
        stake: &ExecutorStake,
        _ctx: &mut TxContext,
    ) {
        let operator = executor_staking::get_executor(stake);
        let reputation = executor::get_executor_reputation(executor_registry, operator);
        let stake_amount = executor_staking::get_stake_amount(stake);
        let new_tier = calculate_tier(stake_amount, reputation);

        if (table::contains(&tier_registry.tiers, operator)) {
            let old_tier = *table::borrow(&tier_registry.tiers, operator);
            if (old_tier != new_tier) {
                *table::borrow_mut(&mut tier_registry.tiers, operator) = new_tier;
                event::emit(TierChanged {
                    executor: operator,
                    old_tier,
                    new_tier,
                    stake_amount,
                    reputation,
                });
            };
        } else {
            table::add(&mut tier_registry.tiers, operator, new_tier);
            tier_registry.total_registered = tier_registry.total_registered + 1;
            event::emit(TierChanged {
                executor: operator,
                old_tier: TIER_OPEN,
                new_tier,
                stake_amount,
                reputation,
            });
        };
    }

    // ========== View Functions ==========

    /// Get the tier for a specific executor (returns TIER_OPEN if not registered)
    public fun get_tier(registry: &TierRegistry, operator: address): u8 {
        if (table::contains(&registry.tiers, operator)) {
            *table::borrow(&registry.tiers, operator)
        } else {
            TIER_OPEN
        }
    }

    /// Check if an executor is registered in the tier registry
    public fun is_registered(registry: &TierRegistry, operator: address): bool {
        table::contains(&registry.tiers, operator)
    }

    /// Get total number of registered executors
    public fun get_total_registered(registry: &TierRegistry): u64 {
        registry.total_registered
    }

    /// Pure function to calculate tier from stake amount and reputation.
    /// tier = min(stake_tier, reputation_tier)
    public fun calculate_tier(stake_amount: u64, reputation: u64): u8 {
        let stake_tier = if (stake_amount >= GOLD_STAKE) {
            TIER_GOLD
        } else if (stake_amount >= SILVER_STAKE) {
            TIER_SILVER
        } else if (stake_amount >= BRONZE_STAKE) {
            TIER_BRONZE
        } else {
            TIER_OPEN
        };

        let rep_tier = if (reputation >= GOLD_REP) {
            TIER_GOLD
        } else if (reputation >= SILVER_REP) {
            TIER_SILVER
        } else if (reputation >= BRONZE_REP) {
            TIER_BRONZE
        } else {
            TIER_OPEN
        };

        // Tier = min(stake_tier, rep_tier)
        if (stake_tier < rep_tier) { stake_tier } else { rep_tier }
    }

    /// Get human-readable tier name
    public fun get_tier_name(tier: u8): String {
        if (tier == TIER_OPEN) {
            std::string::utf8(b"Open")
        } else if (tier == TIER_BRONZE) {
            std::string::utf8(b"Bronze")
        } else if (tier == TIER_SILVER) {
            std::string::utf8(b"Silver")
        } else if (tier == TIER_GOLD) {
            std::string::utf8(b"Gold")
        } else {
            std::string::utf8(b"Unknown")
        }
    }

    /// Get stake threshold for a given tier
    public fun get_stake_threshold(tier: u8): u64 {
        if (tier == TIER_GOLD) { GOLD_STAKE }
        else if (tier == TIER_SILVER) { SILVER_STAKE }
        else if (tier == TIER_BRONZE) { BRONZE_STAKE }
        else { 0 }
    }

    /// Get reputation threshold for a given tier
    public fun get_reputation_threshold(tier: u8): u64 {
        if (tier == TIER_GOLD) { GOLD_REP }
        else if (tier == TIER_SILVER) { SILVER_REP }
        else if (tier == TIER_BRONZE) { BRONZE_REP }
        else { 0 }
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        let registry = TierRegistry {
            id: object::new(ctx),
            tiers: table::new(ctx),
            total_registered: 0,
        };
        transfer::share_object(registry);
    }

    #[test]
    fun test_calculate_tier() {
        // Both conditions must be met
        assert!(calculate_tier(0, 0) == TIER_OPEN);
        assert!(calculate_tier(BRONZE_STAKE, 0) == TIER_OPEN);     // stake OK, rep not
        assert!(calculate_tier(0, BRONZE_REP) == TIER_OPEN);       // rep OK, stake not
        assert!(calculate_tier(BRONZE_STAKE, BRONZE_REP) == TIER_BRONZE);

        // min(stake_tier, rep_tier)
        assert!(calculate_tier(GOLD_STAKE, BRONZE_REP) == TIER_BRONZE);  // capped by rep
        assert!(calculate_tier(BRONZE_STAKE, GOLD_REP) == TIER_BRONZE);  // capped by stake

        // Full gold
        assert!(calculate_tier(GOLD_STAKE, GOLD_REP) == TIER_GOLD);

        // Silver
        assert!(calculate_tier(SILVER_STAKE, SILVER_REP) == TIER_SILVER);
        assert!(calculate_tier(GOLD_STAKE, SILVER_REP) == TIER_SILVER);
    }
}
