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

    // ========== Constants ==========
    const MIN_DEPOSIT: u64 = 100_000; // 0.1 NUSDC (6 decimals)
    const DEFAULT_MAX_PER_REQUEST: u64 = 10_000_000; // 10 NUSDC

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

    /// Deposit additional funds to budget (anyone can deposit)
    public entry fun deposit_to_budget(
        budget: &mut Budget,
        deposit: Coin<NUSDC>,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&deposit);
        assert!(amount > 0, E_INVALID_AMOUNT);
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
