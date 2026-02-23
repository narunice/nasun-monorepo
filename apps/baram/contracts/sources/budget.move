/// Budget - Delegated AI Agent Spending Authority
///
/// Enables users to delegate compute spending to AI agents with constraints.
/// Part of the Baram AI Settlement Layer.
///
/// Core concept: User deposits NUSDC into Budget -> Agent spends within limits
///
/// Constraints:
/// - max_per_request: Maximum amount per single request
/// - allowed_models: Whitelist of AI models (empty = all allowed)
/// - allowed_executors: Whitelist of executors (empty = all allowed)
/// - expires_at: Budget expiration timestamp (0 = no expiration)
module baram::budget {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::event;
    use sui::dynamic_field;
    use std::string::String;
    use devnet_tokens::nusdc::NUSDC;

    // ========== Error Codes ==========
    const E_NOT_OWNER: u64 = 100;
    const E_NOT_AGENT: u64 = 101;
    const E_BUDGET_EXPIRED: u64 = 102;
    const E_BUDGET_INACTIVE: u64 = 103;
    const E_INSUFFICIENT_BALANCE: u64 = 104;
    const E_EXCEEDS_MAX_PER_REQUEST: u64 = 105;
    const E_MODEL_NOT_ALLOWED: u64 = 106;
    const E_EXECUTOR_NOT_ALLOWED: u64 = 107;
    const E_INVALID_AMOUNT: u64 = 108;
    const E_INVALID_EXPIRATION: u64 = 109;
    const E_ZERO_WITHDRAWAL: u64 = 110;
    const E_CATEGORY_NOT_ALLOWED: u64 = 111;
    const E_DAILY_LIMIT_EXCEEDED: u64 = 112;
    const E_WEEKLY_LIMIT_EXCEEDED: u64 = 113;
    const E_MONTHLY_LIMIT_EXCEEDED: u64 = 114;
    const E_RATE_LIMITED: u64 = 115;

    // ========== Constants ==========
    const MIN_DEPOSIT: u64 = 100_000; // 0.1 NUSDC (6 decimals)
    const DEFAULT_MAX_PER_REQUEST: u64 = 10_000_000; // 10 NUSDC
    const DAY_MS: u64 = 86_400_000;       // 24 hours
    const WEEK_MS: u64 = 604_800_000;     // 7 days
    const MONTH_MS: u64 = 2_592_000_000;  // 30 days

    // ========== Structs ==========

    /// Delegated spending authority for AI agents
    public struct Budget has key, store {
        id: UID,
        owner: address,           // Budget owner (human)
        agent: address,           // Delegated agent address

        // Escrow
        balance: Balance<NUSDC>,  // Current balance
        total_deposited: u64,     // Lifetime deposits
        total_spent: u64,         // Lifetime spending

        // Constraints
        max_per_request: u64,     // Max amount per request
        allowed_models: vector<String>,    // Empty = all allowed
        allowed_executors: vector<address>, // Empty = all allowed

        // Timing
        created_at: u64,
        expires_at: u64,          // 0 = no expiration

        // Stats
        request_count: u64,       // Total requests made
        is_active: bool,          // Active status
    }

    /// Receipt for budget creation (proof of delegation)
    public struct BudgetReceipt has key, store {
        id: UID,
        budget_id: address,       // ID of the Budget object
        owner: address,
        agent: address,
        initial_deposit: u64,
        max_per_request: u64,
        created_at: u64,
        expires_at: u64,
    }

    // ========== Dynamic Field Keys ==========

    /// Key for SpendingLimits dynamic field on Budget
    public struct SpendingLimitsKey has copy, drop, store {}

    /// Key for CategoryLimits dynamic field on Budget
    public struct CategoryLimitsKey has copy, drop, store {}

    // ========== Dynamic Field Values ==========

    /// Time-windowed spending limits with automatic reset
    public struct SpendingLimits has copy, drop, store {
        daily_limit: u64,       // 0 = no daily limit
        weekly_limit: u64,      // 0 = no weekly limit
        monthly_limit: u64,     // 0 = no monthly limit
        daily_spent: u64,       // Accumulator for current day
        weekly_spent: u64,      // Accumulator for current week
        monthly_spent: u64,     // Accumulator for current month
        daily_reset_at: u64,    // Timestamp when daily counter resets
        weekly_reset_at: u64,   // Timestamp when weekly counter resets
        monthly_reset_at: u64,  // Timestamp when monthly counter resets
        min_interval_ms: u64,   // Minimum time between requests (0 = no limit)
        last_request_at: u64,   // Timestamp of last request
    }

    /// Category-based spending restrictions
    public struct CategoryLimits has copy, drop, store {
        allowed_categories: vector<String>, // Empty = all allowed
    }

    // ========== Events ==========

    public struct BudgetCreated has copy, drop {
        budget_id: address,
        owner: address,
        agent: address,
        initial_deposit: u64,
        max_per_request: u64,
        expires_at: u64,
    }

    public struct BudgetDeposited has copy, drop {
        budget_id: address,
        depositor: address,
        amount: u64,
        new_balance: u64,
    }

    public struct BudgetSpent has copy, drop {
        budget_id: address,
        agent: address,
        amount: u64,
        request_id: u64,
        model: String,
        executor: address,
        remaining_balance: u64,
    }

    public struct BudgetWithdrawn has copy, drop {
        budget_id: address,
        owner: address,
        amount: u64,
        remaining_balance: u64,
    }

    public struct BudgetDeactivated has copy, drop {
        budget_id: address,
        owner: address,
        final_balance: u64,
    }

    public struct BudgetConstraintsUpdated has copy, drop {
        budget_id: address,
        owner: address,
        max_per_request: u64,
        models_count: u64,
        executors_count: u64,
        expires_at: u64,
    }

    public struct SpendingLimitsUpdated has copy, drop {
        budget_id: address,
        owner: address,
        daily_limit: u64,
        weekly_limit: u64,
        monthly_limit: u64,
        min_interval_ms: u64,
    }

    public struct CategoryLimitsUpdated has copy, drop {
        budget_id: address,
        owner: address,
        categories_count: u64,
    }

    public struct BudgetSpentWithCategory has copy, drop {
        budget_id: address,
        agent: address,
        amount: u64,
        request_id: u64,
        model: String,
        executor: address,
        category: String,
        remaining_balance: u64,
    }

    // ========== Owner Functions ==========

    /// Create a new budget with delegated authority to an agent
    public entry fun create_budget(
        deposit: Coin<NUSDC>,
        agent: address,
        max_per_request: u64,
        allowed_models: vector<String>,
        allowed_executors: vector<address>,
        expires_at: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let deposit_amount = coin::value(&deposit);
        let now = clock.timestamp_ms();

        // Validations
        assert!(deposit_amount >= MIN_DEPOSIT, E_INVALID_AMOUNT);
        assert!(expires_at == 0 || expires_at > now, E_INVALID_EXPIRATION);

        let owner = tx_context::sender(ctx);
        let max_request = if (max_per_request == 0) { DEFAULT_MAX_PER_REQUEST } else { max_per_request };

        let budget = Budget {
            id: object::new(ctx),
            owner,
            agent,
            balance: coin::into_balance(deposit),
            total_deposited: deposit_amount,
            total_spent: 0,
            max_per_request: max_request,
            allowed_models,
            allowed_executors,
            created_at: now,
            expires_at,
            request_count: 0,
            is_active: true,
        };

        let budget_id = object::uid_to_address(&budget.id);

        // Create receipt for owner
        let receipt = BudgetReceipt {
            id: object::new(ctx),
            budget_id,
            owner,
            agent,
            initial_deposit: deposit_amount,
            max_per_request: max_request,
            created_at: now,
            expires_at,
        };

        // Emit event
        event::emit(BudgetCreated {
            budget_id,
            owner,
            agent,
            initial_deposit: deposit_amount,
            max_per_request: max_request,
            expires_at,
        });

        // Transfer budget as shared object (accessible by both owner and agent)
        transfer::share_object(budget);
        transfer::transfer(receipt, owner);
    }

    /// Deposit additional funds to budget (owner only)
    public entry fun deposit_to_budget(
        budget: &mut Budget,
        deposit: Coin<NUSDC>,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&deposit);
        assert!(amount > 0, E_INVALID_AMOUNT);
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(budget.is_active, E_BUDGET_INACTIVE);

        balance::join(&mut budget.balance, coin::into_balance(deposit));
        budget.total_deposited = budget.total_deposited + amount;

        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetDeposited {
            budget_id,
            depositor: tx_context::sender(ctx),
            amount,
            new_balance: balance::value(&budget.balance),
        });
    }

    /// Withdraw funds from budget (owner only)
    public entry fun withdraw_from_budget(
        budget: &mut Budget,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(amount > 0, E_ZERO_WITHDRAWAL);
        assert!(balance::value(&budget.balance) >= amount, E_INSUFFICIENT_BALANCE);

        let withdrawn = balance::split(&mut budget.balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetWithdrawn {
            budget_id,
            owner: budget.owner,
            amount,
            remaining_balance: balance::value(&budget.balance),
        });

        transfer::public_transfer(coin, budget.owner);
    }

    /// Deactivate budget and withdraw all remaining funds (owner only)
    public entry fun deactivate_budget(
        budget: &mut Budget,
        ctx: &mut TxContext
    ) {
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);

        budget.is_active = false;

        let remaining = balance::value(&budget.balance);
        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetDeactivated {
            budget_id,
            owner: budget.owner,
            final_balance: remaining,
        });

        // Withdraw all remaining funds
        if (remaining > 0) {
            let withdrawn = balance::withdraw_all(&mut budget.balance);
            let coin = coin::from_balance(withdrawn, ctx);
            transfer::public_transfer(coin, budget.owner);
        };
    }

    /// Update budget constraints (owner only)
    public entry fun update_constraints(
        budget: &mut Budget,
        max_per_request: u64,
        allowed_models: vector<String>,
        allowed_executors: vector<address>,
        expires_at: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(budget.is_active, E_BUDGET_INACTIVE);

        let now = clock.timestamp_ms();
        assert!(expires_at == 0 || expires_at > now, E_INVALID_EXPIRATION);

        budget.max_per_request = if (max_per_request == 0) { DEFAULT_MAX_PER_REQUEST } else { max_per_request };
        budget.allowed_models = allowed_models;
        budget.allowed_executors = allowed_executors;
        budget.expires_at = expires_at;

        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetConstraintsUpdated {
            budget_id,
            owner: budget.owner,
            max_per_request: budget.max_per_request,
            models_count: vector::length(&budget.allowed_models),
            executors_count: vector::length(&budget.allowed_executors),
            expires_at,
        });
    }

    /// Set time-windowed spending limits (owner only)
    /// Pass 0 for any limit to disable it. All limits are in NUSDC (6 decimals).
    public entry fun set_spending_limits(
        budget: &mut Budget,
        daily_limit: u64,
        weekly_limit: u64,
        monthly_limit: u64,
        min_interval_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(budget.is_active, E_BUDGET_INACTIVE);

        let now = clock.timestamp_ms();
        let limits = SpendingLimits {
            daily_limit,
            weekly_limit,
            monthly_limit,
            daily_spent: 0,
            weekly_spent: 0,
            monthly_spent: 0,
            daily_reset_at: now + DAY_MS,
            weekly_reset_at: now + WEEK_MS,
            monthly_reset_at: now + MONTH_MS,
            min_interval_ms,
            last_request_at: 0,
        };

        let budget_id = object::uid_to_address(&budget.id);

        // Add or replace dynamic field
        if (dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            *dynamic_field::borrow_mut(&mut budget.id, SpendingLimitsKey {}) = limits;
        } else {
            dynamic_field::add(&mut budget.id, SpendingLimitsKey {}, limits);
        };

        event::emit(SpendingLimitsUpdated {
            budget_id,
            owner: budget.owner,
            daily_limit,
            weekly_limit,
            monthly_limit,
            min_interval_ms,
        });
    }

    /// Set allowed spending categories (owner only)
    /// Empty vector = all categories allowed
    public entry fun set_categories(
        budget: &mut Budget,
        allowed_categories: vector<String>,
        ctx: &mut TxContext
    ) {
        assert!(budget.owner == tx_context::sender(ctx), E_NOT_OWNER);
        assert!(budget.is_active, E_BUDGET_INACTIVE);

        let cat_limits = CategoryLimits { allowed_categories };
        let budget_id = object::uid_to_address(&budget.id);

        if (dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            *dynamic_field::borrow_mut(&mut budget.id, CategoryLimitsKey {}) = cat_limits;
        } else {
            dynamic_field::add(&mut budget.id, CategoryLimitsKey {}, cat_limits);
        };

        event::emit(CategoryLimitsUpdated {
            budget_id,
            owner: budget.owner,
            categories_count: vector::length(&cat_limits.allowed_categories),
        });
    }

    // ========== Agent Functions ==========

    /// Spend from budget (agent only) - returns Balance for use with baram::create_request
    /// This is called by the baram module when creating a request with budget
    public fun spend_from_budget(
        budget: &mut Budget,
        amount: u64,
        model: String,
        executor: address,
        request_id: u64,
        clock: &Clock,
        ctx: &TxContext
    ): Balance<NUSDC> {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        // Validations
        assert!(budget.agent == sender, E_NOT_AGENT);
        assert!(budget.is_active, E_BUDGET_INACTIVE);
        assert!(budget.expires_at == 0 || now < budget.expires_at, E_BUDGET_EXPIRED);
        assert!(balance::value(&budget.balance) >= amount, E_INSUFFICIENT_BALANCE);
        assert!(amount <= budget.max_per_request, E_EXCEEDS_MAX_PER_REQUEST);

        // Check model allowlist
        if (!vector::is_empty(&budget.allowed_models)) {
            assert!(vector::contains(&budget.allowed_models, &model), E_MODEL_NOT_ALLOWED);
        };

        // Check executor allowlist
        if (!vector::is_empty(&budget.allowed_executors)) {
            assert!(vector::contains(&budget.allowed_executors, &executor), E_EXECUTOR_NOT_ALLOWED);
        };

        // Deduct from budget
        let spent = balance::split(&mut budget.balance, amount);
        budget.total_spent = budget.total_spent + amount;
        budget.request_count = budget.request_count + 1;

        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetSpent {
            budget_id,
            agent: sender,
            amount,
            request_id,
            model,
            executor,
            remaining_balance: balance::value(&budget.balance),
        });

        spent
    }

    /// Spend from budget with category + time-windowed limit enforcement (agent only)
    /// Enhanced version of spend_from_budget that checks SpendingLimits and CategoryLimits.
    /// Returns Balance for use with baram::create_request_with_budget_v2
    public fun spend_from_budget_with_category(
        budget: &mut Budget,
        amount: u64,
        model: String,
        executor: address,
        request_id: u64,
        category: String,
        clock: &Clock,
        ctx: &TxContext
    ): Balance<NUSDC> {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        // Basic validations (same as spend_from_budget)
        assert!(budget.agent == sender, E_NOT_AGENT);
        assert!(budget.is_active, E_BUDGET_INACTIVE);
        assert!(budget.expires_at == 0 || now < budget.expires_at, E_BUDGET_EXPIRED);
        assert!(balance::value(&budget.balance) >= amount, E_INSUFFICIENT_BALANCE);
        assert!(amount <= budget.max_per_request, E_EXCEEDS_MAX_PER_REQUEST);

        // Check model allowlist
        if (!vector::is_empty(&budget.allowed_models)) {
            assert!(vector::contains(&budget.allowed_models, &model), E_MODEL_NOT_ALLOWED);
        };

        // Check executor allowlist
        if (!vector::is_empty(&budget.allowed_executors)) {
            assert!(vector::contains(&budget.allowed_executors, &executor), E_EXECUTOR_NOT_ALLOWED);
        };

        // Check category allowlist (if CategoryLimits exist)
        if (dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            let cat_limits: &CategoryLimits = dynamic_field::borrow(&budget.id, CategoryLimitsKey {});
            if (!vector::is_empty(&cat_limits.allowed_categories)) {
                assert!(
                    vector::contains(&cat_limits.allowed_categories, &category),
                    E_CATEGORY_NOT_ALLOWED
                );
            };
        };

        // Check and enforce time-windowed spending limits
        if (dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            let limits: &mut SpendingLimits = dynamic_field::borrow_mut(
                &mut budget.id, SpendingLimitsKey {}
            );

            // Reset expired windows
            maybe_reset_limits(limits, now);

            // Rate limiting: minimum interval between requests
            if (limits.min_interval_ms > 0 && limits.last_request_at > 0) {
                assert!(
                    now >= limits.last_request_at + limits.min_interval_ms,
                    E_RATE_LIMITED
                );
            };

            // Check daily limit
            if (limits.daily_limit > 0) {
                assert!(
                    limits.daily_spent + amount <= limits.daily_limit,
                    E_DAILY_LIMIT_EXCEEDED
                );
            };

            // Check weekly limit
            if (limits.weekly_limit > 0) {
                assert!(
                    limits.weekly_spent + amount <= limits.weekly_limit,
                    E_WEEKLY_LIMIT_EXCEEDED
                );
            };

            // Check monthly limit
            if (limits.monthly_limit > 0) {
                assert!(
                    limits.monthly_spent + amount <= limits.monthly_limit,
                    E_MONTHLY_LIMIT_EXCEEDED
                );
            };

            // Update accumulators
            limits.daily_spent = limits.daily_spent + amount;
            limits.weekly_spent = limits.weekly_spent + amount;
            limits.monthly_spent = limits.monthly_spent + amount;
            limits.last_request_at = now;
        };

        // Deduct from budget
        let spent = balance::split(&mut budget.balance, amount);
        budget.total_spent = budget.total_spent + amount;
        budget.request_count = budget.request_count + 1;

        let budget_id = object::uid_to_address(&budget.id);

        event::emit(BudgetSpentWithCategory {
            budget_id,
            agent: sender,
            amount,
            request_id,
            model,
            executor,
            category,
            remaining_balance: balance::value(&budget.balance),
        });

        spent
    }

    // ========== Internal Functions ==========

    /// Reset expired time windows in SpendingLimits
    fun maybe_reset_limits(limits: &mut SpendingLimits, now: u64) {
        if (now >= limits.daily_reset_at) {
            limits.daily_spent = 0;
            limits.daily_reset_at = now + DAY_MS;
        };
        if (now >= limits.weekly_reset_at) {
            limits.weekly_spent = 0;
            limits.weekly_reset_at = now + WEEK_MS;
        };
        if (now >= limits.monthly_reset_at) {
            limits.monthly_spent = 0;
            limits.monthly_reset_at = now + MONTH_MS;
        };
    }

    // ========== View Functions ==========

    /// Get budget balance
    public fun get_balance(budget: &Budget): u64 {
        balance::value(&budget.balance)
    }

    /// Get budget owner
    public fun get_owner(budget: &Budget): address {
        budget.owner
    }

    /// Get budget agent
    public fun get_agent(budget: &Budget): address {
        budget.agent
    }

    /// Get max per request limit
    public fun get_max_per_request(budget: &Budget): u64 {
        budget.max_per_request
    }

    /// Get total spent
    public fun get_total_spent(budget: &Budget): u64 {
        budget.total_spent
    }

    /// Get request count
    public fun get_request_count(budget: &Budget): u64 {
        budget.request_count
    }

    /// Check if budget is active
    public fun is_active(budget: &Budget): bool {
        budget.is_active
    }

    /// Check if budget is expired
    public fun is_expired(budget: &Budget, clock: &Clock): bool {
        let now = clock.timestamp_ms();
        budget.expires_at != 0 && now >= budget.expires_at
    }

    /// Get budget stats
    public fun get_stats(budget: &Budget): (u64, u64, u64, u64, bool) {
        (
            balance::value(&budget.balance),
            budget.total_deposited,
            budget.total_spent,
            budget.request_count,
            budget.is_active
        )
    }

    /// Check if model is allowed
    public fun is_model_allowed(budget: &Budget, model: &String): bool {
        if (vector::is_empty(&budget.allowed_models)) {
            true
        } else {
            vector::contains(&budget.allowed_models, model)
        }
    }

    /// Check if executor is allowed
    public fun is_executor_allowed(budget: &Budget, executor: address): bool {
        if (vector::is_empty(&budget.allowed_executors)) {
            true
        } else {
            vector::contains(&budget.allowed_executors, &executor)
        }
    }

    /// Check if spending limits are configured
    public fun has_spending_limits(budget: &Budget): bool {
        dynamic_field::exists_(&budget.id, SpendingLimitsKey {})
    }

    /// Check if category limits are configured
    public fun has_category_limits(budget: &Budget): bool {
        dynamic_field::exists_(&budget.id, CategoryLimitsKey {})
    }

    /// Get spending limits: (daily_limit, weekly_limit, monthly_limit, daily_spent, weekly_spent, monthly_spent)
    /// Returns all zeros if no spending limits are set
    public fun get_spending_limits(budget: &Budget): (u64, u64, u64, u64, u64, u64) {
        if (!dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            return (0, 0, 0, 0, 0, 0)
        };
        let limits: &SpendingLimits = dynamic_field::borrow(&budget.id, SpendingLimitsKey {});
        (
            limits.daily_limit,
            limits.weekly_limit,
            limits.monthly_limit,
            limits.daily_spent,
            limits.weekly_spent,
            limits.monthly_spent
        )
    }

    /// Get spending limits rate config: (min_interval_ms, last_request_at)
    public fun get_rate_limits(budget: &Budget): (u64, u64) {
        if (!dynamic_field::exists_(&budget.id, SpendingLimitsKey {})) {
            return (0, 0)
        };
        let limits: &SpendingLimits = dynamic_field::borrow(&budget.id, SpendingLimitsKey {});
        (limits.min_interval_ms, limits.last_request_at)
    }

    /// Get allowed categories (empty vector if no category limits set)
    public fun get_allowed_categories(budget: &Budget): vector<String> {
        if (!dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            return vector::empty()
        };
        let cat_limits: &CategoryLimits = dynamic_field::borrow(&budget.id, CategoryLimitsKey {});
        cat_limits.allowed_categories
    }

    /// Check if a category is allowed
    public fun is_category_allowed(budget: &Budget, category: &String): bool {
        if (!dynamic_field::exists_(&budget.id, CategoryLimitsKey {})) {
            return true
        };
        let cat_limits: &CategoryLimits = dynamic_field::borrow(&budget.id, CategoryLimitsKey {});
        if (vector::is_empty(&cat_limits.allowed_categories)) {
            true
        } else {
            vector::contains(&cat_limits.allowed_categories, category)
        }
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun create_budget_for_testing(
        deposit: Coin<NUSDC>,
        owner: address,
        agent: address,
        max_per_request: u64,
        ctx: &mut TxContext
    ): Budget {
        Budget {
            id: object::new(ctx),
            owner,
            agent,
            balance: coin::into_balance(deposit),
            total_deposited: 0,
            total_spent: 0,
            max_per_request,
            allowed_models: vector::empty(),
            allowed_executors: vector::empty(),
            created_at: 0,
            expires_at: 0,
            request_count: 0,
            is_active: true,
        }
    }
}
