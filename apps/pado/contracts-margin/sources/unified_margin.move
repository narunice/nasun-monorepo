/// Unified Margin v0
///
/// Single collateral pool for all Pado products
/// "One Account, One Margin Pool, Every Asset Works Harder"
///
/// v0: Basic deposit/withdraw functionality
/// v1: Integration with DeepBook + Prediction
/// v2: Multi-collateral support + Oracle integration
module unified_margin::unified_margin {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use pado::nusdc::NUSDC;

    // ===== Error Codes =====
    const EInsufficientBalance: u64 = 0;
    const EZeroAmount: u64 = 1;
    const ENotOwner: u64 = 2;

    // ===== Structs =====

    /// User's unified margin account
    /// Owned object - each user has their own
    public struct MarginAccount has key, store {
        id: UID,
        /// Account owner
        owner: address,
        /// NUSDC balance (primary collateral)
        nusdc_balance: Balance<NUSDC>,
        /// Total deposited (for statistics)
        total_deposited: u64,
        /// Total withdrawn (for statistics)
        total_withdrawn: u64,
        /// Created timestamp
        created_at: u64,
    }

    /// Global registry for statistics (shared object)
    public struct MarginRegistry has key {
        id: UID,
        /// Total accounts created
        total_accounts: u64,
        /// Total NUSDC deposited across all accounts
        total_tvl: u64,
    }

    // ===== Events =====

    public struct AccountCreated has copy, drop {
        account_id: ID,
        owner: address,
        timestamp: u64,
    }

    public struct Deposited has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct Withdrawn has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let registry = MarginRegistry {
            id: object::new(ctx),
            total_accounts: 0,
            total_tvl: 0,
        };
        transfer::share_object(registry);
    }

    // ===== Public Functions =====

    /// Create a new margin account for the caller
    public fun create_account(
        registry: &mut MarginRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let timestamp = sui::clock::timestamp_ms(clock);

        let account = MarginAccount {
            id: object::new(ctx),
            owner: sender,
            nusdc_balance: balance::zero(),
            total_deposited: 0,
            total_withdrawn: 0,
            created_at: timestamp,
        };

        registry.total_accounts = registry.total_accounts + 1;

        event::emit(AccountCreated {
            account_id: object::id(&account),
            owner: sender,
            timestamp,
        });

        transfer::transfer(account, sender);
    }

    /// Deposit NUSDC into margin account
    public fun deposit(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        payment: Coin<NUSDC>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);

        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroAmount);

        // Add to balance
        balance::join(&mut account.nusdc_balance, coin::into_balance(payment));

        // Update statistics
        account.total_deposited = account.total_deposited + amount;
        registry.total_tvl = registry.total_tvl + amount;

        let new_balance = balance::value(&account.nusdc_balance);

        event::emit(Deposited {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
    }

    /// Withdraw NUSDC from margin account
    public fun withdraw(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&account.nusdc_balance) >= amount, EInsufficientBalance);

        // Withdraw from balance
        let withdrawn = balance::split(&mut account.nusdc_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        // Update statistics
        account.total_withdrawn = account.total_withdrawn + amount;
        registry.total_tvl = registry.total_tvl - amount;

        let new_balance = balance::value(&account.nusdc_balance);

        event::emit(Withdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });

        transfer::public_transfer(coin, sender);
    }

    /// Withdraw all NUSDC from margin account
    public fun withdraw_all(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        let balance_value = balance::value(&account.nusdc_balance);
        if (balance_value > 0) {
            withdraw(account, registry, balance_value, ctx);
        }
    }

    // ===== View Functions =====

    /// Get available margin (currently = total balance, v1 will subtract used_margin)
    public fun get_available_margin(account: &MarginAccount): u64 {
        balance::value(&account.nusdc_balance)
    }

    /// Get total balance
    public fun get_balance(account: &MarginAccount): u64 {
        balance::value(&account.nusdc_balance)
    }

    /// Get account owner
    public fun get_owner(account: &MarginAccount): address {
        account.owner
    }

    /// Get total deposited
    public fun get_total_deposited(account: &MarginAccount): u64 {
        account.total_deposited
    }

    /// Get total withdrawn
    public fun get_total_withdrawn(account: &MarginAccount): u64 {
        account.total_withdrawn
    }

    /// Get registry statistics
    public fun get_registry_stats(registry: &MarginRegistry): (u64, u64) {
        (registry.total_accounts, registry.total_tvl)
    }

    // ===== Future: Integration Points =====
    // v1에서 추가될 함수들:
    //
    // /// Lock margin for a trade (called by authorized modules)
    // public fun lock_margin(
    //     account: &mut MarginAccount,
    //     amount: u64,
    //     _auth: &TradeAuth,
    // ): LockedMargin { ... }
    //
    // /// Unlock margin after trade completion
    // public fun unlock_margin(
    //     account: &mut MarginAccount,
    //     locked: LockedMargin,
    // ) { ... }
    //
    // /// Use margin directly (for integration with other contracts)
    // public fun use_margin(
    //     account: &mut MarginAccount,
    //     amount: u64,
    //     _auth: &IntegrationAuth,
    // ): Balance<NUSDC> { ... }

    // ===== Test Functions =====
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
