/// Executor Staking - Economic security for Baram executors
///
/// Phase D-4 MVP:
/// - Single stake model (Reserve + Active bond split in D-4b)
/// - Objective fault-based slashing only (Timeout, Attestation failure)
/// - 7-day unbonding period
/// - Admin-triggered slashing
///
/// Settlement Scope (명문화):
/// - What is paid for? → Verified TEE execution
/// - What is NOT paid for? → Output quality, User satisfaction
/// - When is slashed? → Objective faults only (timeout, attestation mismatch)
///
/// Future phases (D-4b):
/// - Bond Split: Reserve Bond + Active Bond
/// - Dual Score: Stake × Performance
/// - Risk-weighted stake exposure
module baram_executor::executor_staking {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use sui::event;
    use sui::sui::SUI;

    // ========== Error Codes ==========
    #[allow(unused_const)]
    const E_NOT_ADMIN: u64 = 200;
    const E_BELOW_MIN_STAKE: u64 = 201;
    const E_ALREADY_STAKING: u64 = 202;
    const E_NOT_STAKING: u64 = 203;
    const E_UNBONDING_IN_PROGRESS: u64 = 204;
    const E_UNBONDING_NOT_READY: u64 = 205;
    const E_INSUFFICIENT_STAKE: u64 = 206;
    const E_NO_UNBONDING: u64 = 207;
    const E_ZERO_AMOUNT: u64 = 208;

    // ========== Constants ==========
    const MIN_STAKE: u64 = 1_000_000_000_000;     // 1,000 NASUN (9 decimals)
    const UNBONDING_PERIOD_MS: u64 = 604_800_000; // 7 days in milliseconds
    const SLASH_TIMEOUT_PERCENT: u64 = 5;         // 5% for timeout
    const SLASH_ATTESTATION_PERCENT: u64 = 10;    // 10% for attestation mismatch
    const SLASH_FRAUD_PERCENT: u64 = 100;         // 100% for attestation fraud

    // Slash reason codes
    const SLASH_REASON_TIMEOUT: u8 = 1;
    const SLASH_REASON_ATTESTATION: u8 = 2;
    const SLASH_REASON_FRAUD: u8 = 3;

    // ========== Structs ==========

    /// Admin capability for managing staking system
    public struct StakingAdminCap has key, store {
        id: UID,
    }

    /// Global staking configuration (shared object)
    public struct StakingConfig has key {
        id: UID,
        min_stake: u64,
        unbonding_period_ms: u64,
        slash_timeout_percent: u64,
        slash_attestation_percent: u64,
        slash_fraud_percent: u64,
        total_staked: u64,
        total_slashed: u64,
        treasury: Balance<SUI>,  // Slashed funds accumulate here
    }

    /// Individual executor stake (owned object)
    public struct ExecutorStake has key, store {
        id: UID,
        executor: address,
        staked_amount: Balance<SUI>,
        unbonding_amount: u64,
        unbonding_start_ms: u64,
        slash_count: u64,
        total_slashed: u64,
        created_at: u64,
    }

    /// Registry mapping executor addresses to stake object IDs
    public struct StakingRegistry has key {
        id: UID,
        stakes: Table<address, ID>,  // executor address -> ExecutorStake object ID
        total_stakers: u64,
    }

    // ========== Events ==========

    public struct Staked has copy, drop {
        executor: address,
        amount: u64,
        total_staked: u64,
    }

    public struct UnbondingStarted has copy, drop {
        executor: address,
        amount: u64,
        available_at: u64,
    }

    public struct Withdrawn has copy, drop {
        executor: address,
        amount: u64,
    }

    public struct Slashed has copy, drop {
        executor: address,
        amount: u64,
        reason: u8,
        request_id: u64,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        // Create StakingAdminCap for the deployer
        let admin_cap = StakingAdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        // Create shared StakingConfig
        let config = StakingConfig {
            id: object::new(ctx),
            min_stake: MIN_STAKE,
            unbonding_period_ms: UNBONDING_PERIOD_MS,
            slash_timeout_percent: SLASH_TIMEOUT_PERCENT,
            slash_attestation_percent: SLASH_ATTESTATION_PERCENT,
            slash_fraud_percent: SLASH_FRAUD_PERCENT,
            total_staked: 0,
            total_slashed: 0,
            treasury: balance::zero(),
        };
        transfer::share_object(config);

        // Create shared StakingRegistry
        let registry = StakingRegistry {
            id: object::new(ctx),
            stakes: table::new(ctx),
            total_stakers: 0,
        };
        transfer::share_object(registry);
    }

    // ========== Entry Functions ==========

    /// Create a new stake for an executor
    /// Executor must not already have an active stake
    public entry fun create_stake(
        config: &mut StakingConfig,
        registry: &mut StakingRegistry,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let executor = tx_context::sender(ctx);
        let amount = coin::value(&payment);

        // Check minimum stake
        assert!(amount >= config.min_stake, E_BELOW_MIN_STAKE);

        // Check not already staking
        assert!(!table::contains(&registry.stakes, executor), E_ALREADY_STAKING);

        let now = clock.timestamp_ms();

        // Create stake object
        let stake = ExecutorStake {
            id: object::new(ctx),
            executor,
            staked_amount: coin::into_balance(payment),
            unbonding_amount: 0,
            unbonding_start_ms: 0,
            slash_count: 0,
            total_slashed: 0,
            created_at: now,
        };

        let stake_id = object::id(&stake);

        // Update registry
        table::add(&mut registry.stakes, executor, stake_id);
        registry.total_stakers = registry.total_stakers + 1;

        // Update global stats
        config.total_staked = config.total_staked + amount;

        // Emit event
        event::emit(Staked {
            executor,
            amount,
            total_staked: balance::value(&stake.staked_amount),
        });

        // Transfer stake object to executor
        transfer::transfer(stake, executor);
    }

    /// Add more stake to an existing stake object
    public entry fun add_stake(
        config: &mut StakingConfig,
        stake: &mut ExecutorStake,
        payment: Coin<SUI>,
        ctx: &TxContext
    ) {
        let executor = tx_context::sender(ctx);
        assert!(stake.executor == executor, E_NOT_STAKING);

        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Add to stake
        balance::join(&mut stake.staked_amount, coin::into_balance(payment));

        // Update global stats
        config.total_staked = config.total_staked + amount;

        // Emit event
        event::emit(Staked {
            executor,
            amount,
            total_staked: balance::value(&stake.staked_amount),
        });
    }

    /// Start unbonding process (7 day cooldown)
    public entry fun start_unbonding(
        config: &StakingConfig,
        stake: &mut ExecutorStake,
        amount: u64,
        clock: &Clock,
        ctx: &TxContext
    ) {
        let executor = tx_context::sender(ctx);
        assert!(stake.executor == executor, E_NOT_STAKING);
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Check no unbonding already in progress
        assert!(stake.unbonding_amount == 0, E_UNBONDING_IN_PROGRESS);

        // Check sufficient stake
        let current_stake = balance::value(&stake.staked_amount);
        assert!(current_stake >= amount, E_INSUFFICIENT_STAKE);

        let now = clock.timestamp_ms();
        let available_at = now + config.unbonding_period_ms;

        // Set unbonding state
        stake.unbonding_amount = amount;
        stake.unbonding_start_ms = now;

        // Emit event
        event::emit(UnbondingStarted {
            executor,
            amount,
            available_at,
        });
    }

    /// Withdraw after unbonding period has passed
    public entry fun withdraw(
        config: &mut StakingConfig,
        registry: &mut StakingRegistry,
        stake: &mut ExecutorStake,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let executor = tx_context::sender(ctx);
        assert!(stake.executor == executor, E_NOT_STAKING);
        assert!(stake.unbonding_amount > 0, E_NO_UNBONDING);

        let now = clock.timestamp_ms();
        let available_at = stake.unbonding_start_ms + config.unbonding_period_ms;
        assert!(now >= available_at, E_UNBONDING_NOT_READY);

        let amount = stake.unbonding_amount;

        // Reset unbonding state
        stake.unbonding_amount = 0;
        stake.unbonding_start_ms = 0;

        // Withdraw from stake
        let withdrawn = balance::split(&mut stake.staked_amount, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        // Update global stats
        config.total_staked = config.total_staked - amount;

        // Check if stake is now empty - if so, clean up registry
        if (balance::value(&stake.staked_amount) == 0) {
            table::remove(&mut registry.stakes, executor);
            registry.total_stakers = registry.total_stakers - 1;
        };

        // Emit event
        event::emit(Withdrawn {
            executor,
            amount,
        });

        // Transfer withdrawn funds to executor
        transfer::public_transfer(coin, executor);
    }

    /// Cancel unbonding and keep stake active
    public entry fun cancel_unbonding(
        stake: &mut ExecutorStake,
        ctx: &TxContext
    ) {
        let executor = tx_context::sender(ctx);
        assert!(stake.executor == executor, E_NOT_STAKING);
        assert!(stake.unbonding_amount > 0, E_NO_UNBONDING);

        // Reset unbonding state (funds remain staked)
        stake.unbonding_amount = 0;
        stake.unbonding_start_ms = 0;
    }

    // ========== Admin Functions (Slashing) ==========

    /// Slash executor for timeout (admin only)
    /// Called when executor fails to submit proof within timeout period
    public entry fun slash_for_timeout(
        _admin: &StakingAdminCap,
        config: &mut StakingConfig,
        stake: &mut ExecutorStake,
        request_id: u64,
        _ctx: &mut TxContext
    ) {
        slash_internal(config, stake, SLASH_REASON_TIMEOUT, request_id);
    }

    /// Slash executor for attestation mismatch (admin only)
    /// Called when PCR values don't match baseline
    public entry fun slash_for_attestation(
        _admin: &StakingAdminCap,
        config: &mut StakingConfig,
        stake: &mut ExecutorStake,
        request_id: u64,
        _ctx: &mut TxContext
    ) {
        slash_internal(config, stake, SLASH_REASON_ATTESTATION, request_id);
    }

    /// Slash executor for attestation fraud (admin only)
    /// Called when executor submits forged attestation - 100% slash
    public entry fun slash_for_fraud(
        _admin: &StakingAdminCap,
        config: &mut StakingConfig,
        stake: &mut ExecutorStake,
        request_id: u64,
        _ctx: &mut TxContext
    ) {
        slash_internal(config, stake, SLASH_REASON_FRAUD, request_id);
    }

    /// Internal slashing logic
    fun slash_internal(
        config: &mut StakingConfig,
        stake: &mut ExecutorStake,
        reason: u8,
        request_id: u64,
    ) {
        let current_stake = balance::value(&stake.staked_amount);
        if (current_stake == 0) {
            return
        };

        // Calculate slash amount based on reason
        let slash_percent = if (reason == SLASH_REASON_TIMEOUT) {
            config.slash_timeout_percent
        } else if (reason == SLASH_REASON_ATTESTATION) {
            config.slash_attestation_percent
        } else {
            config.slash_fraud_percent
        };

        let mut slash_amount = (current_stake * slash_percent) / 100;
        if (slash_amount == 0) {
            slash_amount = 1; // Minimum 1 unit slash
        };

        // Cap at available stake
        if (slash_amount > current_stake) {
            slash_amount = current_stake;
        };

        // Perform slash
        let slashed = balance::split(&mut stake.staked_amount, slash_amount);
        balance::join(&mut config.treasury, slashed);

        // Cap unbonding_amount at remaining balance to prevent withdraw abort
        let remaining = balance::value(&stake.staked_amount);
        if (stake.unbonding_amount > remaining) {
            stake.unbonding_amount = remaining;
        };

        // Update stats
        stake.slash_count = stake.slash_count + 1;
        stake.total_slashed = stake.total_slashed + slash_amount;
        config.total_staked = config.total_staked - slash_amount;
        config.total_slashed = config.total_slashed + slash_amount;

        // Emit event
        event::emit(Slashed {
            executor: stake.executor,
            amount: slash_amount,
            reason,
            request_id,
        });
    }

    /// Withdraw treasury funds (admin only)
    public entry fun withdraw_treasury(
        _admin: &StakingAdminCap,
        config: &mut StakingConfig,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let treasury_balance = balance::value(&config.treasury);
        let withdraw_amount = if (amount > treasury_balance) {
            treasury_balance
        } else {
            amount
        };

        if (withdraw_amount > 0) {
            let withdrawn = balance::split(&mut config.treasury, withdraw_amount);
            let coin = coin::from_balance(withdrawn, ctx);
            transfer::public_transfer(coin, recipient);
        };
    }

    // ========== View Functions ==========

    /// Get the executor address that owns this stake
    public fun get_executor(stake: &ExecutorStake): address {
        stake.executor
    }

    /// Get stake amount for an executor
    public fun get_stake_amount(stake: &ExecutorStake): u64 {
        balance::value(&stake.staked_amount)
    }

    /// Check if executor meets minimum stake requirement
    public fun is_above_minimum(stake: &ExecutorStake, config: &StakingConfig): bool {
        balance::value(&stake.staked_amount) >= config.min_stake
    }

    /// Check if executor can withdraw (unbonding complete)
    public fun can_withdraw(stake: &ExecutorStake, config: &StakingConfig, clock: &Clock): bool {
        if (stake.unbonding_amount == 0) {
            return false
        };
        let now = clock.timestamp_ms();
        let available_at = stake.unbonding_start_ms + config.unbonding_period_ms;
        now >= available_at
    }

    /// Get unbonding info
    public fun get_unbonding_info(stake: &ExecutorStake): (u64, u64) {
        (stake.unbonding_amount, stake.unbonding_start_ms)
    }

    /// Get slash stats for executor
    public fun get_slash_stats(stake: &ExecutorStake): (u64, u64) {
        (stake.slash_count, stake.total_slashed)
    }

    /// Get global staking stats
    public fun get_global_stats(config: &StakingConfig): (u64, u64, u64) {
        (config.total_staked, config.total_slashed, balance::value(&config.treasury))
    }

    /// Get total stakers count
    public fun get_total_stakers(registry: &StakingRegistry): u64 {
        registry.total_stakers
    }

    /// Check if executor has a stake
    public fun has_stake(registry: &StakingRegistry, executor: address): bool {
        table::contains(&registry.stakes, executor)
    }

    /// Get stake object ID for executor
    public fun get_stake_id(registry: &StakingRegistry, executor: address): ID {
        *table::borrow(&registry.stakes, executor)
    }

    /// Get minimum stake requirement
    public fun get_min_stake(config: &StakingConfig): u64 {
        config.min_stake
    }

    /// Get unbonding period in milliseconds
    public fun get_unbonding_period(config: &StakingConfig): u64 {
        config.unbonding_period_ms
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
