/// Pado Lending Pool
/// Simple NUSDC lending pool with deposit/withdraw functionality
/// Phase 12: Core lending infrastructure
module lending::lending_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::event;
    use devnet_tokens::nusdc::NUSDC;

    // ============================================================================
    // Constants
    // ============================================================================

    /// Precision for rate calculations (1e8 = 100%)
    const RATE_PRECISION: u64 = 100_000_000;

    /// Base interest rate: 2% per year
    const BASE_RATE: u64 = 2_000_000; // 2%

    /// Rate multiplier: 20% at 100% utilization
    const MULTIPLIER: u64 = 20_000_000; // 20%

    /// Jump multiplier: 100% above kink
    const JUMP_MULTIPLIER: u64 = 100_000_000; // 100%

    /// Kink point: 80% utilization
    const KINK: u64 = 80_000_000; // 80%

    /// Reserve factor: 10% of interest goes to reserves
    const RESERVE_FACTOR: u64 = 10_000_000; // 10%

    /// Seconds per year (approximate)
    const SECONDS_PER_YEAR: u64 = 31_536_000;

    /// Minimum deposit amount (1 NUSDC = 1_000_000)
    const MIN_DEPOSIT: u64 = 1_000_000;

    // ============================================================================
    // Error Codes
    // ============================================================================

    const E_INSUFFICIENT_BALANCE: u64 = 1;
    const E_POOL_INSUFFICIENT_LIQUIDITY: u64 = 2;
    const E_AMOUNT_TOO_SMALL: u64 = 3;
    const E_POSITION_NOT_FOUND: u64 = 4;
    const E_NOTHING_TO_WITHDRAW: u64 = 5;

    // ============================================================================
    // Structs
    // ============================================================================

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// The lending pool state
    public struct LendingPool has key {
        id: UID,
        /// Total NUSDC deposited in the pool
        total_deposits: Balance<NUSDC>,
        /// Total NUSDC borrowed from the pool
        total_borrows: u64,
        /// Total reserves (accumulated from interest)
        total_reserves: u64,
        /// Last update timestamp
        last_update_time: u64,
        /// Accumulated interest index (for calculating interest)
        borrow_index: u64,
        /// Supply index for deposit interest
        supply_index: u64,
    }

    /// User deposit position
    public struct DepositPosition has key, store {
        id: UID,
        /// Owner address
        owner: address,
        /// Deposited principal (in shares, not absolute amount)
        shares: u64,
        /// Index at deposit time
        deposit_index: u64,
        /// Deposit timestamp
        created_at: u64,
    }

    // ============================================================================
    // Events
    // ============================================================================

    public struct PoolCreated has copy, drop {
        pool_id: address,
    }

    public struct Deposited has copy, drop {
        pool_id: address,
        depositor: address,
        amount: u64,
        shares: u64,
    }

    public struct Withdrawn has copy, drop {
        pool_id: address,
        depositor: address,
        amount: u64,
        shares: u64,
    }

    // ============================================================================
    // Init
    // ============================================================================

    /// Initialize the lending pool
    fun init(ctx: &mut TxContext) {
        // Create admin cap
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, tx_context::sender(ctx));

        // Create the lending pool
        let pool = LendingPool {
            id: object::new(ctx),
            total_deposits: balance::zero<NUSDC>(),
            total_borrows: 0,
            total_reserves: 0,
            last_update_time: 0,
            borrow_index: RATE_PRECISION, // Start at 1.0
            supply_index: RATE_PRECISION, // Start at 1.0
        };

        let pool_id = object::uid_to_address(&pool.id);
        event::emit(PoolCreated { pool_id });

        transfer::share_object(pool);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /// Get total deposits in the pool
    public fun get_total_deposits(pool: &LendingPool): u64 {
        balance::value(&pool.total_deposits)
    }

    /// Get total borrows from the pool
    public fun get_total_borrows(pool: &LendingPool): u64 {
        pool.total_borrows
    }

    /// Get available liquidity
    public fun get_available_liquidity(pool: &LendingPool): u64 {
        let deposits = balance::value(&pool.total_deposits);
        if (deposits > pool.total_borrows) {
            deposits - pool.total_borrows
        } else {
            0
        }
    }

    /// Calculate utilization rate (0 to RATE_PRECISION)
    public fun get_utilization_rate(pool: &LendingPool): u64 {
        let deposits = balance::value(&pool.total_deposits);
        if (deposits == 0) {
            return 0
        };
        (pool.total_borrows * RATE_PRECISION) / deposits
    }

    /// Calculate borrow APR based on utilization
    public fun get_borrow_apr(pool: &LendingPool): u64 {
        let utilization = get_utilization_rate(pool);

        if (utilization <= KINK) {
            // Linear rate below kink
            BASE_RATE + (utilization * MULTIPLIER) / RATE_PRECISION
        } else {
            // Jump rate above kink
            let normal_rate = BASE_RATE + (KINK * MULTIPLIER) / RATE_PRECISION;
            let excess_util = utilization - KINK;
            normal_rate + (excess_util * JUMP_MULTIPLIER) / RATE_PRECISION
        }
    }

    /// Calculate supply APY
    public fun get_supply_apy(pool: &LendingPool): u64 {
        let borrow_apr = get_borrow_apr(pool);
        let utilization = get_utilization_rate(pool);

        // Supply APY = Borrow APR * Utilization * (1 - Reserve Factor)
        let gross_supply = (borrow_apr * utilization) / RATE_PRECISION;
        (gross_supply * (RATE_PRECISION - RESERVE_FACTOR)) / RATE_PRECISION
    }

    /// Get position value including accrued interest
    public fun get_position_value(pool: &LendingPool, position: &DepositPosition): u64 {
        // shares * current_index / deposit_index
        (position.shares * pool.supply_index) / position.deposit_index
    }

    // ============================================================================
    // User Functions
    // ============================================================================

    /// Deposit NUSDC into the lending pool
    public entry fun deposit(
        pool: &mut LendingPool,
        coin: Coin<NUSDC>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&coin);
        assert!(amount >= MIN_DEPOSIT, E_AMOUNT_TOO_SMALL);

        // Update interest first
        accrue_interest(pool, clock);

        // Calculate shares to mint
        let total_supply = balance::value(&pool.total_deposits);
        let shares = if (total_supply == 0) {
            amount
        } else {
            (amount * RATE_PRECISION) / pool.supply_index
        };

        // Add to pool
        let deposit_balance = coin::into_balance(coin);
        balance::join(&mut pool.total_deposits, deposit_balance);

        // Create position NFT
        let position = DepositPosition {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            shares,
            deposit_index: pool.supply_index,
            created_at: clock::timestamp_ms(clock),
        };

        let pool_id = object::uid_to_address(&pool.id);
        event::emit(Deposited {
            pool_id,
            depositor: tx_context::sender(ctx),
            amount,
            shares,
        });

        transfer::transfer(position, tx_context::sender(ctx));
    }

    /// Withdraw NUSDC from the lending pool
    public entry fun withdraw(
        pool: &mut LendingPool,
        position: DepositPosition,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(position.shares > 0, E_NOTHING_TO_WITHDRAW);

        // Update interest first
        accrue_interest(pool, clock);

        // Calculate amount to withdraw (including interest)
        let amount = get_position_value(pool, &position);

        // Check liquidity
        let available = get_available_liquidity(pool);
        assert!(amount <= available, E_POOL_INSUFFICIENT_LIQUIDITY);

        // Withdraw from pool
        let withdrawn = balance::split(&mut pool.total_deposits, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        let pool_id = object::uid_to_address(&pool.id);
        let shares = position.shares;

        event::emit(Withdrawn {
            pool_id,
            depositor: tx_context::sender(ctx),
            amount,
            shares,
        });

        // Destroy position
        let DepositPosition { id, owner: _, shares: _, deposit_index: _, created_at: _ } = position;
        object::delete(id);

        // Transfer withdrawn funds
        transfer::public_transfer(coin, tx_context::sender(ctx));
    }

    /// Partial withdraw - withdraw specific amount
    public entry fun withdraw_amount(
        pool: &mut LendingPool,
        position: &mut DepositPosition,
        amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Update interest first
        accrue_interest(pool, clock);

        // Calculate current value
        let current_value = get_position_value(pool, position);
        assert!(amount <= current_value, E_INSUFFICIENT_BALANCE);

        // Check liquidity
        let available = get_available_liquidity(pool);
        assert!(amount <= available, E_POOL_INSUFFICIENT_LIQUIDITY);

        // Calculate shares to burn
        let shares_to_burn = (amount * position.deposit_index) / pool.supply_index;
        position.shares = position.shares - shares_to_burn;

        // Withdraw from pool
        let withdrawn = balance::split(&mut pool.total_deposits, amount);
        let coin = coin::from_balance(withdrawn, ctx);

        let pool_id = object::uid_to_address(&pool.id);

        event::emit(Withdrawn {
            pool_id,
            depositor: tx_context::sender(ctx),
            amount,
            shares: shares_to_burn,
        });

        transfer::public_transfer(coin, tx_context::sender(ctx));
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /// Accrue interest based on time passed
    fun accrue_interest(pool: &mut LendingPool, clock: &Clock) {
        let current_time = clock::timestamp_ms(clock) / 1000; // Convert to seconds

        if (pool.last_update_time == 0) {
            pool.last_update_time = current_time;
            return
        };

        let time_delta = current_time - pool.last_update_time;
        if (time_delta == 0) {
            return
        };

        // Calculate interest accrued
        let borrow_apr = get_borrow_apr(pool);
        let interest_factor = (borrow_apr * time_delta) / SECONDS_PER_YEAR;

        // Update borrow index
        let borrow_interest = (pool.total_borrows * interest_factor) / RATE_PRECISION;
        pool.borrow_index = pool.borrow_index + (pool.borrow_index * interest_factor) / RATE_PRECISION;

        // Update supply index (depositors earn interest)
        let supply_apy = get_supply_apy(pool);
        let supply_factor = (supply_apy * time_delta) / SECONDS_PER_YEAR;
        pool.supply_index = pool.supply_index + (pool.supply_index * supply_factor) / RATE_PRECISION;

        // Add to reserves
        let reserve_share = (borrow_interest * RESERVE_FACTOR) / RATE_PRECISION;
        pool.total_reserves = pool.total_reserves + reserve_share;

        pool.last_update_time = current_time;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /// Withdraw reserves (admin only)
    public entry fun withdraw_reserves(
        _admin: &AdminCap,
        pool: &mut LendingPool,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(amount <= pool.total_reserves, E_INSUFFICIENT_BALANCE);

        let available = get_available_liquidity(pool);
        assert!(amount <= available, E_POOL_INSUFFICIENT_LIQUIDITY);

        pool.total_reserves = pool.total_reserves - amount;

        let withdrawn = balance::split(&mut pool.total_deposits, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, recipient);
    }

    // ============================================================================
    // Test Functions
    // ============================================================================

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
