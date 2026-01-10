/// Unified Margin v0.5 (Multi-Collateral)
///
/// Single collateral pool for all Pado products
/// "One Account, One Margin Pool, Every Asset Works Harder"
///
/// v0: Basic deposit/withdraw functionality (NUSDC only)
/// v0.5: Multi-collateral support (NUSDC + NBTC with haircuts)
/// v1: Integration with DeepBook + Prediction + Oracle
module unified_margin::unified_margin {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use pado::nusdc::NUSDC;
    use pado::nbtc::NBTC;

    // ===== Error Codes =====
    const EInsufficientBalance: u64 = 0;
    const EZeroAmount: u64 = 1;
    const ENotOwner: u64 = 2;
    const EInvalidHaircut: u64 = 3;
    const ENotAdmin: u64 = 4;

    // ===== Constants =====

    /// Basis points (10000 = 100%)
    const BPS: u64 = 10_000;

    /// Default haircuts (basis points)
    /// NUSDC: 0 bps = 100% collateral value
    /// NBTC: 500 bps = 95% collateral value (5% haircut)
    const DEFAULT_NUSDC_HAIRCUT: u64 = 0;
    const DEFAULT_NBTC_HAIRCUT: u64 = 500;

    // ===== Structs =====

    /// User's unified margin account
    /// Owned object - each user has their own
    public struct MarginAccount has key, store {
        id: UID,
        /// Account owner
        owner: address,
        /// NUSDC balance (primary collateral)
        nusdc_balance: Balance<NUSDC>,
        /// NBTC balance (secondary collateral)
        nbtc_balance: Balance<NBTC>,
        /// Total deposited in USD (for statistics)
        total_deposited_usd: u64,
        /// Total withdrawn in USD (for statistics)
        total_withdrawn_usd: u64,
        /// Created timestamp
        created_at: u64,
    }

    /// Global registry for statistics and configuration (shared object)
    public struct MarginRegistry has key {
        id: UID,
        /// Admin address for config updates
        admin: address,
        /// Total accounts created
        total_accounts: u64,
        /// Total NUSDC deposited across all accounts
        total_nusdc_tvl: u64,
        /// Total NBTC deposited across all accounts (raw amount)
        total_nbtc_tvl: u64,
        /// Haircut for NUSDC (basis points, default 0)
        nusdc_haircut_bps: u64,
        /// Haircut for NBTC (basis points, default 500)
        nbtc_haircut_bps: u64,
    }

    // ===== Events =====

    public struct AccountCreated has copy, drop {
        account_id: ID,
        owner: address,
        timestamp: u64,
    }

    public struct NusdcDeposited has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NusdcWithdrawn has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NbtcDeposited has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NbtcWithdrawn has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct HaircutUpdated has copy, drop {
        token: vector<u8>,
        old_haircut_bps: u64,
        new_haircut_bps: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let registry = MarginRegistry {
            id: object::new(ctx),
            admin: sender,
            total_accounts: 0,
            total_nusdc_tvl: 0,
            total_nbtc_tvl: 0,
            nusdc_haircut_bps: DEFAULT_NUSDC_HAIRCUT,
            nbtc_haircut_bps: DEFAULT_NBTC_HAIRCUT,
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
            nbtc_balance: balance::zero(),
            total_deposited_usd: 0,
            total_withdrawn_usd: 0,
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

    // ===== NUSDC Functions =====

    /// Deposit NUSDC into margin account
    public fun deposit_nusdc(
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

        // Update statistics (NUSDC is 1:1 with USD)
        account.total_deposited_usd = account.total_deposited_usd + amount;
        registry.total_nusdc_tvl = registry.total_nusdc_tvl + amount;

        let new_balance = balance::value(&account.nusdc_balance);

        event::emit(NusdcDeposited {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
    }

    /// Backward compatible deposit function (NUSDC)
    public fun deposit(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        payment: Coin<NUSDC>,
        ctx: &mut TxContext
    ) {
        deposit_nusdc(account, registry, payment, ctx)
    }

    /// Withdraw NUSDC from margin account
    public fun withdraw_nusdc(
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
        account.total_withdrawn_usd = account.total_withdrawn_usd + amount;
        registry.total_nusdc_tvl = registry.total_nusdc_tvl - amount;

        let new_balance = balance::value(&account.nusdc_balance);

        event::emit(NusdcWithdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });

        transfer::public_transfer(coin, sender);
    }

    /// Backward compatible withdraw function (NUSDC)
    public fun withdraw(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        withdraw_nusdc(account, registry, amount, ctx)
    }

    /// Withdraw all NUSDC from margin account
    public fun withdraw_all_nusdc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        let balance_value = balance::value(&account.nusdc_balance);
        if (balance_value > 0) {
            withdraw_nusdc(account, registry, balance_value, ctx);
        }
    }

    /// Backward compatible withdraw_all function
    public fun withdraw_all(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        withdraw_all_nusdc(account, registry, ctx)
    }

    // ===== NBTC Functions =====

    /// Deposit NBTC into margin account
    public fun deposit_nbtc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        payment: Coin<NBTC>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);

        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroAmount);

        // Add to balance
        balance::join(&mut account.nbtc_balance, coin::into_balance(payment));

        // Update TVL (raw amount, USD conversion happens in view functions)
        registry.total_nbtc_tvl = registry.total_nbtc_tvl + amount;

        let new_balance = balance::value(&account.nbtc_balance);

        event::emit(NbtcDeposited {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
    }

    /// Withdraw NBTC from margin account
    public fun withdraw_nbtc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&account.nbtc_balance) >= amount, EInsufficientBalance);

        // Withdraw from balance
        let withdrawn = balance::split(&mut account.nbtc_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        // Update TVL
        registry.total_nbtc_tvl = registry.total_nbtc_tvl - amount;

        let new_balance = balance::value(&account.nbtc_balance);

        event::emit(NbtcWithdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });

        transfer::public_transfer(coin, sender);
    }

    /// Withdraw all NBTC from margin account
    public fun withdraw_all_nbtc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        let balance_value = balance::value(&account.nbtc_balance);
        if (balance_value > 0) {
            withdraw_nbtc(account, registry, balance_value, ctx);
        }
    }

    // ===== Admin Functions =====

    /// Update NUSDC haircut (admin only)
    public fun set_nusdc_haircut(
        registry: &mut MarginRegistry,
        new_haircut_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAdmin);
        assert!(new_haircut_bps < BPS, EInvalidHaircut);

        let old = registry.nusdc_haircut_bps;
        registry.nusdc_haircut_bps = new_haircut_bps;

        event::emit(HaircutUpdated {
            token: b"NUSDC",
            old_haircut_bps: old,
            new_haircut_bps,
        });
    }

    /// Update NBTC haircut (admin only)
    public fun set_nbtc_haircut(
        registry: &mut MarginRegistry,
        new_haircut_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAdmin);
        assert!(new_haircut_bps < BPS, EInvalidHaircut);

        let old = registry.nbtc_haircut_bps;
        registry.nbtc_haircut_bps = new_haircut_bps;

        event::emit(HaircutUpdated {
            token: b"NBTC",
            old_haircut_bps: old,
            new_haircut_bps,
        });
    }

    // ===== View Functions =====

    /// Get NUSDC balance
    public fun get_nusdc_balance(account: &MarginAccount): u64 {
        balance::value(&account.nusdc_balance)
    }

    /// Get NBTC balance
    public fun get_nbtc_balance(account: &MarginAccount): u64 {
        balance::value(&account.nbtc_balance)
    }

    /// Get available margin (currently = NUSDC balance only for backward compatibility)
    /// v1 will calculate: sum(collateral * (1 - haircut) * price) - locked_margin
    public fun get_available_margin(account: &MarginAccount): u64 {
        balance::value(&account.nusdc_balance)
    }

    /// Get total balance (backward compatible, returns NUSDC only)
    public fun get_balance(account: &MarginAccount): u64 {
        balance::value(&account.nusdc_balance)
    }

    /// Get account owner
    public fun get_owner(account: &MarginAccount): address {
        account.owner
    }

    /// Get total deposited USD
    public fun get_total_deposited(account: &MarginAccount): u64 {
        account.total_deposited_usd
    }

    /// Get total withdrawn USD
    public fun get_total_withdrawn(account: &MarginAccount): u64 {
        account.total_withdrawn_usd
    }

    /// Get registry statistics
    public fun get_registry_stats(registry: &MarginRegistry): (u64, u64, u64) {
        (registry.total_accounts, registry.total_nusdc_tvl, registry.total_nbtc_tvl)
    }

    /// Get haircut for NUSDC (basis points)
    public fun get_nusdc_haircut(registry: &MarginRegistry): u64 {
        registry.nusdc_haircut_bps
    }

    /// Get haircut for NBTC (basis points)
    public fun get_nbtc_haircut(registry: &MarginRegistry): u64 {
        registry.nbtc_haircut_bps
    }

    /// Calculate collateral value in USD with haircuts
    /// nbtc_price: BTC price in USD with 8 decimals (e.g., 97000_00000000 = $97,000)
    /// Returns: Total collateral value in NUSDC units (6 decimals)
    public fun calculate_collateral_value_usd(
        account: &MarginAccount,
        registry: &MarginRegistry,
        nbtc_price: u64, // 8 decimals
    ): u64 {
        // NUSDC value (1:1 with USD, apply haircut)
        let nusdc_raw = balance::value(&account.nusdc_balance);
        let nusdc_haircut = registry.nusdc_haircut_bps;
        let nusdc_value = apply_haircut(nusdc_raw, nusdc_haircut);

        // NBTC value (convert to USD, apply haircut)
        // NBTC has 8 decimals, price has 8 decimals, NUSDC has 6 decimals
        // nbtc_usd = (nbtc_amount * nbtc_price) / 10^8 / 10^2 (adjust 8->6 decimals)
        let nbtc_raw = balance::value(&account.nbtc_balance);
        let nbtc_haircut = registry.nbtc_haircut_bps;
        let nbtc_usd = ((nbtc_raw as u128) * (nbtc_price as u128) / 100_000_000 / 100) as u64;
        let nbtc_value = apply_haircut(nbtc_usd, nbtc_haircut);

        nusdc_value + nbtc_value
    }

    /// Apply haircut to a value
    /// haircut_bps: haircut in basis points (e.g., 500 = 5%)
    /// Returns: value * (1 - haircut/10000)
    fun apply_haircut(value: u64, haircut_bps: u64): u64 {
        if (haircut_bps == 0) {
            return value
        };
        let factor = BPS - haircut_bps;
        ((value as u128) * (factor as u128) / (BPS as u128)) as u64
    }

    // ===== Test Functions =====
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
