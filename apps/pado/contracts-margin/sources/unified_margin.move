/// Unified Margin v0.6 (Liquidation Support)
///
/// Single collateral pool for all Pado products
/// "One Account, One Margin Pool, Every Asset Works Harder"
///
/// v0: Basic deposit/withdraw functionality (NUSDC only)
/// v0.5: Multi-collateral support (NUSDC + NBTC with haircuts)
/// v0.6: Liquidation support (friend functions for privileged withdraw)
/// v1: Integration with DeepBook + Prediction + Oracle
module unified_margin::unified_margin {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::dynamic_field as df;
    use sui::event;
    use devnet_tokens::nusdc::NUSDC;
    use devnet_tokens::nbtc::NBTC;
    use devnet_tokens_v2::nsol::NSOL;
    use devnet_tokens_v2_neth::neth::NETH;

    // ===== Dynamic Field Keys (NETH/NSOL extension) =====
    //
    // MarginAccount struct cannot grow new fields under Sui upgrade rules,
    // so per-account NETH/NSOL balances are attached as dynamic fields keyed
    // by phantom-typed keys. MarginRegistry reuses the same pattern for
    // per-asset haircut and TVL counters.

    public struct NethBalanceKey has copy, drop, store {}
    public struct NsolBalanceKey has copy, drop, store {}
    public struct NethHaircutKey has copy, drop, store {}
    public struct NsolHaircutKey has copy, drop, store {}
    public struct NethTvlKey has copy, drop, store {}
    public struct NsolTvlKey has copy, drop, store {}

    /// Default NETH haircut (10%) — conservative for ETH volatility
    const DEFAULT_NETH_HAIRCUT: u64 = 1000;
    /// Default NSOL haircut (15%) — higher for SOL volatility
    const DEFAULT_NSOL_HAIRCUT: u64 = 1500;

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

    public struct NethDeposited has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NethWithdrawn has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NsolDeposited has copy, drop {
        account_id: ID,
        owner: address,
        amount: u64,
        new_balance: u64,
    }

    public struct NsolWithdrawn has copy, drop {
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

    /// Internal helper: deduct NUSDC from account, update accounting, emit event.
    /// Does NOT transfer — caller owns the returned Coin.
    fun split_nusdc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        sender: address,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&account.nusdc_balance) >= amount, EInsufficientBalance);

        registry.total_nusdc_tvl = registry.total_nusdc_tvl - amount;
        account.total_withdrawn_usd = account.total_withdrawn_usd + amount;

        let withdrawn = balance::split(&mut account.nusdc_balance, amount);
        let new_balance = balance::value(&account.nusdc_balance);

        event::emit(NusdcWithdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });

        coin::from_balance(withdrawn, ctx)
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
        let coin = split_nusdc(account, registry, amount, sender, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Withdraw NUSDC and return Coin for PTB composition.
    /// Allows atomic MA-withdraw + downstream call (e.g. prediction buy) in one PTB.
    public fun withdraw_nusdc_as_coin(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        split_nusdc(account, registry, amount, sender, ctx)
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

        // Update TVL.
        // NOTE: total_withdrawn_usd is intentionally NOT updated here. It tracks NUSDC-denominated
        // withdrawal stats only (v0.5 design). NBTC oracle-denominated accounting is deferred to v1.
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

    // ===== NETH Functions (dynamic field-backed) =====

    /// Internal: borrow_mut Balance<NETH>, creating zero balance if absent.
    fun neth_balance_mut(account: &mut MarginAccount): &mut Balance<NETH> {
        if (!df::exists_with_type<NethBalanceKey, Balance<NETH>>(&account.id, NethBalanceKey {})) {
            df::add(&mut account.id, NethBalanceKey {}, balance::zero<NETH>());
        };
        df::borrow_mut(&mut account.id, NethBalanceKey {})
    }

    /// Internal: read-only Balance<NETH>, returns 0 if absent.
    fun neth_balance_value(account: &MarginAccount): u64 {
        if (!df::exists_with_type<NethBalanceKey, Balance<NETH>>(&account.id, NethBalanceKey {})) {
            0
        } else {
            balance::value(df::borrow<NethBalanceKey, Balance<NETH>>(&account.id, NethBalanceKey {}))
        }
    }

    /// Internal: registry NETH TVL bump
    fun bump_neth_tvl(registry: &mut MarginRegistry, delta: u64, add: bool) {
        if (!df::exists_with_type<NethTvlKey, u64>(&registry.id, NethTvlKey {})) {
            df::add(&mut registry.id, NethTvlKey {}, 0u64);
        };
        let cur = df::borrow_mut<NethTvlKey, u64>(&mut registry.id, NethTvlKey {});
        if (add) { *cur = *cur + delta; } else { *cur = *cur - delta; };
    }

    /// Deposit NETH into margin account
    public fun deposit_neth(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        payment: Coin<NETH>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroAmount);

        balance::join(neth_balance_mut(account), coin::into_balance(payment));
        bump_neth_tvl(registry, amount, true);

        let new_balance = neth_balance_value(account);
        event::emit(NethDeposited {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
    }

    /// Withdraw NETH; transfers Coin<NETH> to sender
    public fun withdraw_neth(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        let coin = split_neth(account, registry, amount, sender, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Withdraw NETH and return Coin for PTB composition
    public fun withdraw_neth_as_coin(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<NETH> {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        split_neth(account, registry, amount, sender, ctx)
    }

    /// Internal helper: split + accounting + event for NETH
    fun split_neth(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        sender: address,
        ctx: &mut TxContext,
    ): Coin<NETH> {
        assert!(amount > 0, EZeroAmount);
        assert!(neth_balance_value(account) >= amount, EInsufficientBalance);

        let bal_mut = neth_balance_mut(account);
        let withdrawn = balance::split(bal_mut, amount);
        bump_neth_tvl(registry, amount, false);

        let new_balance = neth_balance_value(account);
        event::emit(NethWithdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
        coin::from_balance(withdrawn, ctx)
    }

    /// Withdraw all NETH
    public fun withdraw_all_neth(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        let v = neth_balance_value(account);
        if (v > 0) { withdraw_neth(account, registry, v, ctx); }
    }

    // ===== NSOL Functions (dynamic field-backed) =====

    fun nsol_balance_mut(account: &mut MarginAccount): &mut Balance<NSOL> {
        if (!df::exists_with_type<NsolBalanceKey, Balance<NSOL>>(&account.id, NsolBalanceKey {})) {
            df::add(&mut account.id, NsolBalanceKey {}, balance::zero<NSOL>());
        };
        df::borrow_mut(&mut account.id, NsolBalanceKey {})
    }

    fun nsol_balance_value(account: &MarginAccount): u64 {
        if (!df::exists_with_type<NsolBalanceKey, Balance<NSOL>>(&account.id, NsolBalanceKey {})) {
            0
        } else {
            balance::value(df::borrow<NsolBalanceKey, Balance<NSOL>>(&account.id, NsolBalanceKey {}))
        }
    }

    fun bump_nsol_tvl(registry: &mut MarginRegistry, delta: u64, add: bool) {
        if (!df::exists_with_type<NsolTvlKey, u64>(&registry.id, NsolTvlKey {})) {
            df::add(&mut registry.id, NsolTvlKey {}, 0u64);
        };
        let cur = df::borrow_mut<NsolTvlKey, u64>(&mut registry.id, NsolTvlKey {});
        if (add) { *cur = *cur + delta; } else { *cur = *cur - delta; };
    }

    public fun deposit_nsol(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        payment: Coin<NSOL>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroAmount);

        balance::join(nsol_balance_mut(account), coin::into_balance(payment));
        bump_nsol_tvl(registry, amount, true);

        let new_balance = nsol_balance_value(account);
        event::emit(NsolDeposited {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
    }

    public fun withdraw_nsol(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        let coin = split_nsol(account, registry, amount, sender, ctx);
        transfer::public_transfer(coin, sender);
    }

    public fun withdraw_nsol_as_coin(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<NSOL> {
        let sender = tx_context::sender(ctx);
        assert!(account.owner == sender, ENotOwner);
        split_nsol(account, registry, amount, sender, ctx)
    }

    fun split_nsol(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        sender: address,
        ctx: &mut TxContext,
    ): Coin<NSOL> {
        assert!(amount > 0, EZeroAmount);
        assert!(nsol_balance_value(account) >= amount, EInsufficientBalance);

        let bal_mut = nsol_balance_mut(account);
        let withdrawn = balance::split(bal_mut, amount);
        bump_nsol_tvl(registry, amount, false);

        let new_balance = nsol_balance_value(account);
        event::emit(NsolWithdrawn {
            account_id: object::id(account),
            owner: sender,
            amount,
            new_balance,
        });
        coin::from_balance(withdrawn, ctx)
    }

    public fun withdraw_all_nsol(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        ctx: &mut TxContext
    ) {
        let v = nsol_balance_value(account);
        if (v > 0) { withdraw_nsol(account, registry, v, ctx); }
    }

    // ===== Liquidation Functions (Package-level access) =====

    /// Withdraw NUSDC for liquidation (no owner check)
    /// Only callable by liquidation module within this package
    public(package) fun liquidation_withdraw_nusdc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&account.nusdc_balance) >= amount, EInsufficientBalance);

        // Withdraw from balance
        let withdrawn = balance::split(&mut account.nusdc_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        // Update statistics
        account.total_withdrawn_usd = account.total_withdrawn_usd + amount;
        registry.total_nusdc_tvl = registry.total_nusdc_tvl - amount;

        // Transfer to liquidator (not sender)
        transfer::public_transfer(coin, recipient);
    }

    /// Withdraw NBTC for liquidation (no owner check)
    /// Only callable by liquidation module within this package
    public(package) fun liquidation_withdraw_nbtc(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&account.nbtc_balance) >= amount, EInsufficientBalance);

        // Withdraw from balance
        let withdrawn = balance::split(&mut account.nbtc_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        // Update TVL
        registry.total_nbtc_tvl = registry.total_nbtc_tvl - amount;

        // Transfer to liquidator (not sender)
        transfer::public_transfer(coin, recipient);
    }

    /// Withdraw NETH for liquidation (no owner check)
    public(package) fun liquidation_withdraw_neth(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, EZeroAmount);
        assert!(neth_balance_value(account) >= amount, EInsufficientBalance);
        let bal_mut = neth_balance_mut(account);
        let withdrawn = balance::split(bal_mut, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        bump_neth_tvl(registry, amount, false);
        transfer::public_transfer(coin, recipient);
    }

    /// Withdraw NSOL for liquidation (no owner check)
    public(package) fun liquidation_withdraw_nsol(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(amount > 0, EZeroAmount);
        assert!(nsol_balance_value(account) >= amount, EInsufficientBalance);
        let bal_mut = nsol_balance_mut(account);
        let withdrawn = balance::split(bal_mut, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        bump_nsol_tvl(registry, amount, false);
        transfer::public_transfer(coin, recipient);
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

    /// Update NETH haircut (admin only). Stored as dynamic field on registry.
    public fun set_neth_haircut(
        registry: &mut MarginRegistry,
        new_haircut_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAdmin);
        assert!(new_haircut_bps < BPS, EInvalidHaircut);
        let old = get_neth_haircut(registry);
        if (df::exists_with_type<NethHaircutKey, u64>(&registry.id, NethHaircutKey {})) {
            *df::borrow_mut<NethHaircutKey, u64>(&mut registry.id, NethHaircutKey {}) = new_haircut_bps;
        } else {
            df::add(&mut registry.id, NethHaircutKey {}, new_haircut_bps);
        };
        event::emit(HaircutUpdated {
            token: b"NETH",
            old_haircut_bps: old,
            new_haircut_bps,
        });
    }

    /// Update NSOL haircut (admin only). Stored as dynamic field on registry.
    public fun set_nsol_haircut(
        registry: &mut MarginRegistry,
        new_haircut_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, ENotAdmin);
        assert!(new_haircut_bps < BPS, EInvalidHaircut);
        let old = get_nsol_haircut(registry);
        if (df::exists_with_type<NsolHaircutKey, u64>(&registry.id, NsolHaircutKey {})) {
            *df::borrow_mut<NsolHaircutKey, u64>(&mut registry.id, NsolHaircutKey {}) = new_haircut_bps;
        } else {
            df::add(&mut registry.id, NsolHaircutKey {}, new_haircut_bps);
        };
        event::emit(HaircutUpdated {
            token: b"NSOL",
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

    /// Get NETH balance (0 if account never deposited NETH)
    public fun get_neth_balance(account: &MarginAccount): u64 {
        neth_balance_value(account)
    }

    /// Get NSOL balance (0 if account never deposited NSOL)
    public fun get_nsol_balance(account: &MarginAccount): u64 {
        nsol_balance_value(account)
    }

    /// Get haircut for NETH (basis points). Returns DEFAULT until admin sets it.
    public fun get_neth_haircut(registry: &MarginRegistry): u64 {
        if (df::exists_with_type<NethHaircutKey, u64>(&registry.id, NethHaircutKey {})) {
            *df::borrow<NethHaircutKey, u64>(&registry.id, NethHaircutKey {})
        } else {
            DEFAULT_NETH_HAIRCUT
        }
    }

    /// Get haircut for NSOL (basis points). Returns DEFAULT until admin sets it.
    public fun get_nsol_haircut(registry: &MarginRegistry): u64 {
        if (df::exists_with_type<NsolHaircutKey, u64>(&registry.id, NsolHaircutKey {})) {
            *df::borrow<NsolHaircutKey, u64>(&registry.id, NsolHaircutKey {})
        } else {
            DEFAULT_NSOL_HAIRCUT
        }
    }

    /// Get registry NETH TVL (raw amount; 0 if no deposits yet)
    public fun get_neth_tvl(registry: &MarginRegistry): u64 {
        if (df::exists_with_type<NethTvlKey, u64>(&registry.id, NethTvlKey {})) {
            *df::borrow<NethTvlKey, u64>(&registry.id, NethTvlKey {})
        } else { 0 }
    }

    /// Get registry NSOL TVL (raw amount; 0 if no deposits yet)
    public fun get_nsol_tvl(registry: &MarginRegistry): u64 {
        if (df::exists_with_type<NsolTvlKey, u64>(&registry.id, NsolTvlKey {})) {
            *df::borrow<NsolTvlKey, u64>(&registry.id, NsolTvlKey {})
        } else { 0 }
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

    /// V2: Calculate collateral value in USD with all four assets (NUSDC + NBTC + NETH + NSOL).
    /// Backward-compatible: V1 (`calculate_collateral_value_usd`) remains unchanged.
    /// All prices are 8-decimal USD. Returns NUSDC units (6 decimals).
    ///
    /// Decimal scaling per asset:
    ///   NBTC (8 dec) * price (8 dec) / 10^8 / 10^2 -> 6 dec USD
    ///   NETH (8 dec) * price (8 dec) / 10^8 / 10^2 -> 6 dec USD
    ///   NSOL (9 dec) * price (8 dec) / 10^8 / 10^3 -> 6 dec USD
    public fun calculate_collateral_value_usd_v2(
        account: &MarginAccount,
        registry: &MarginRegistry,
        nbtc_price: u64,
        neth_price: u64,
        nsol_price: u64,
    ): u64 {
        // NUSDC + NBTC reuse V1 math
        let v1 = calculate_collateral_value_usd(account, registry, nbtc_price);

        // NETH (8 dec amount, 8 dec price -> 6 dec USD via /10^10)
        let neth_raw = neth_balance_value(account);
        let neth_haircut = get_neth_haircut(registry);
        let neth_usd = ((neth_raw as u128) * (neth_price as u128) / 100_000_000 / 100) as u64;
        let neth_value = apply_haircut(neth_usd, neth_haircut);

        // NSOL (9 dec amount, 8 dec price -> 6 dec USD via /10^11)
        let nsol_raw = nsol_balance_value(account);
        let nsol_haircut = get_nsol_haircut(registry);
        let nsol_usd = ((nsol_raw as u128) * (nsol_price as u128) / 100_000_000 / 1_000) as u64;
        let nsol_value = apply_haircut(nsol_usd, nsol_haircut);

        v1 + neth_value + nsol_value
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

    #[test]
    fun test_withdraw_nusdc_as_coin_returns_coin_and_updates_state() {
        use sui::test_scenario;
        use sui::clock;

        let owner = @0xABCD;
        let mut scenario = test_scenario::begin(owner);

        // Init registry
        test_scenario::next_tx(&mut scenario, owner);
        {
            init_for_testing(test_scenario::ctx(&mut scenario));
        };

        // Create account
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<MarginRegistry>(&scenario);
            let clk = clock::create_for_testing(test_scenario::ctx(&mut scenario));
            create_account(&mut registry, &clk, test_scenario::ctx(&mut scenario));
            clock::destroy_for_testing(clk);
            test_scenario::return_shared(registry);
        };

        // Deposit 100 NUSDC
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<MarginRegistry>(&scenario);
            let mut account = test_scenario::take_from_sender<MarginAccount>(&scenario);
            let payment = coin::mint_for_testing<NUSDC>(100, test_scenario::ctx(&mut scenario));
            deposit_nusdc(&mut account, &mut registry, payment, test_scenario::ctx(&mut scenario));
            test_scenario::return_shared(registry);
            test_scenario::return_to_sender(&scenario, account);
        };

        // withdraw_nusdc_as_coin: withdraw 40
        test_scenario::next_tx(&mut scenario, owner);
        {
            let mut registry = test_scenario::take_shared<MarginRegistry>(&scenario);
            let mut account = test_scenario::take_from_sender<MarginAccount>(&scenario);

            let coin = withdraw_nusdc_as_coin(
                &mut account, &mut registry, 40,
                test_scenario::ctx(&mut scenario),
            );

            // Returned coin has correct value
            assert!(coin::value(&coin) == 40, 0);
            // Account balance decreased
            assert!(get_nusdc_balance(&account) == 60, 1);
            // Registry TVL decreased
            let (_, tvl, _) = get_registry_stats(&registry);
            assert!(tvl == 60, 2);
            // Accounting updated
            assert!(get_total_withdrawn(&account) == 40, 3);

            coin::burn_for_testing(coin);
            test_scenario::return_shared(registry);
            test_scenario::return_to_sender(&scenario, account);
        };

        test_scenario::end(scenario);
    }
}
