/// Perpetual Futures DEX
///
/// Unified margin integrated perpetual futures trading
/// "Trade with leverage, settle in NUSDC"
///
/// Features:
/// - Up to 20x leverage
/// - Long/Short positions
/// - Cross margin with Unified Margin integration
/// - 8-hour funding rate settlement
/// - AdminCap-gated market creation
/// - Taker fee collection into fee_pool
///
/// @version 1.1.0 (SEC hardening: AdminCap, fee collection, notional guard)
module pado_perp::perpetual {
    use sui::event;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use devnet_tokens::nusdc::NUSDC;
    use pado_oracle::dev_oracle::{Self, OracleRegistry};

    // ===== Error Codes =====

    const ENotOwner: u64 = 100;
    const EMarketNotActive: u64 = 101;
    const EInvalidLeverage: u64 = 102;
    const EInvalidSize: u64 = 103;
    const EInsufficientMargin: u64 = 104;
    const EPositionNotFound: u64 = 105;
    const EPositionExists: u64 = 106;
    const EMaxOpenInterestReached: u64 = 107;
    const ENotAdmin: u64 = 108;
    const EMarketPaused: u64 = 109;
    const EOracleStale: u64 = 110;
    const EOraclePriceOverflow: u64 = 111;
    const ENotionalOverflow: u64 = 112;
    const EFeeTooHigh: u64 = 113;
    const EFundingNotDue: u64 = 114;

    // ===== Constants =====

    /// Maximum leverage (20x)
    const MAX_LEVERAGE: u64 = 20;

    /// Funding interval (8 hours in milliseconds)
    const FUNDING_INTERVAL_MS: u64 = 8 * 60 * 60 * 1000;

    /// Basis points denominator
    const BPS: u64 = 10000;

    /// Price precision (8 decimals)
    const PRICE_DECIMALS: u64 = 100_000_000;

    /// Maximum oracle staleness (120 seconds)
    const MAX_ORACLE_AGE_MS: u64 = 120_000;

    /// Maximum reasonable price in oracle units (8 decimals).
    /// $10,000,000 = 1_000_000_000_000_000. Guards against oracle misconfiguration.
    const MAX_ORACLE_PRICE: u128 = 1_000_000_000_000_000;

    /// Minimum position size in USD (10 NUSDC)
    const MIN_POSITION_SIZE: u64 = 10_000_000;

    /// Default maker fee (2 bps = 0.02%)
    const DEFAULT_MAKER_FEE_BPS: u64 = 2;

    /// Default taker fee (5 bps = 0.05%)
    const DEFAULT_TAKER_FEE_BPS: u64 = 5;

    /// Initial margin requirement (5% = 20x max leverage)
    const INITIAL_MARGIN_BPS: u64 = 500;

    /// Maintenance margin requirement (2.5%)
    const MAINTENANCE_MARGIN_BPS: u64 = 250;

    /// Maximum notional value per position (guards u128->u64 overflow)
    const MAX_NOTIONAL: u64 = 1_000_000_000_000_000;

    /// Maximum allowed fee in basis points (10%)
    const MAX_FEE_BPS: u64 = 1000;

    // ===== Structs =====

    /// Admin capability — only holder can create markets.
    /// Created once during package publish and transferred to deployer.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Perpetual market configuration (shared object)
    public struct PerpMarket has key {
        id: UID,
        /// Admin address
        admin: address,
        /// Oracle symbol ID (1=BTC, 2=ETH, 3=NASUN)
        base_symbol: u64,
        /// Market name for display (e.g., "BTC-PERP")
        name: vector<u8>,
        /// Maximum leverage allowed
        max_leverage: u64,
        /// Maker fee in basis points
        maker_fee_bps: u64,
        /// Taker fee in basis points
        taker_fee_bps: u64,
        /// Total long open interest (in base units)
        open_interest_long: u64,
        /// Total short open interest (in base units)
        open_interest_short: u64,
        /// Maximum open interest cap per side
        max_open_interest: u64,
        /// Current funding rate (signed, basis points per 8h)
        /// Positive = longs pay shorts, Negative = shorts pay longs
        funding_rate_value: u64,
        funding_rate_negative: bool,
        /// Cumulative funding index (for position P&L calculation)
        cumulative_funding_value: u64,
        cumulative_funding_negative: bool,
        /// Last funding settlement timestamp
        last_funding_time: u64,
        /// Insurance fund balance
        insurance_fund: Balance<NUSDC>,
        /// Accumulated trading fees
        fee_pool: Balance<NUSDC>,
        /// Market active status
        is_active: bool,
        /// Created timestamp
        created_at: u64,
    }

    /// User's perpetual position (owned object)
    public struct PerpPosition has key, store {
        id: UID,
        /// Market ID this position belongs to
        market_id: ID,
        /// Position owner
        owner: address,
        /// True = Long, False = Short
        is_long: bool,
        /// Position size in base units (8 decimals)
        size: u64,
        /// Average entry price (8 decimals)
        entry_price: u64,
        /// Collateral deposited for this position (isolated margin)
        collateral: Balance<NUSDC>,
        /// Leverage used (1-20)
        leverage: u64,
        /// Funding index at position open (for funding P&L)
        entry_funding_value: u64,
        entry_funding_negative: bool,
        /// Realized P&L accumulated
        realized_pnl_value: u64,
        realized_pnl_negative: bool,
        /// Created timestamp
        created_at: u64,
        /// Last updated timestamp
        last_updated: u64,
    }

    /// Position summary for view functions
    public struct PositionInfo has copy, drop {
        market_id: ID,
        owner: address,
        is_long: bool,
        size: u64,
        entry_price: u64,
        collateral: u64,
        leverage: u64,
        unrealized_pnl_value: u64,
        unrealized_pnl_negative: bool,
        margin_ratio: u64,
        liquidation_price: u64,
    }

    // ===== Events =====

    public struct MarketCreated has copy, drop {
        market_id: ID,
        base_symbol: u64,
        name: vector<u8>,
        max_leverage: u64,
        created_at: u64,
    }

    public struct PositionOpened has copy, drop {
        position_id: ID,
        market_id: ID,
        owner: address,
        is_long: bool,
        size: u64,
        entry_price: u64,
        collateral: u64,
        leverage: u64,
        fee: u64,
        timestamp: u64,
    }

    public struct PositionClosed has copy, drop {
        position_id: ID,
        market_id: ID,
        owner: address,
        size: u64,
        exit_price: u64,
        realized_pnl_value: u64,
        realized_pnl_negative: bool,
        fee: u64,
        timestamp: u64,
    }

    public struct PositionIncreased has copy, drop {
        position_id: ID,
        market_id: ID,
        size_delta: u64,
        new_size: u64,
        new_entry_price: u64,
        collateral_added: u64,
        timestamp: u64,
    }

    public struct PositionDecreased has copy, drop {
        position_id: ID,
        market_id: ID,
        size_delta: u64,
        new_size: u64,
        exit_price: u64,
        realized_pnl_value: u64,
        realized_pnl_negative: bool,
        collateral_removed: u64,
        timestamp: u64,
    }

    public struct CollateralAdded has copy, drop {
        position_id: ID,
        amount: u64,
        new_collateral: u64,
        new_leverage: u64,
        timestamp: u64,
    }

    public struct CollateralRemoved has copy, drop {
        position_id: ID,
        amount: u64,
        new_collateral: u64,
        new_leverage: u64,
        timestamp: u64,
    }

    public struct FeesWithdrawn has copy, drop {
        market_id: ID,
        admin: address,
        amount: u64,
    }

    public struct FundingSettled has copy, drop {
        market_id: ID,
        rate_value: u64,
        rate_negative: bool,
        cumulative_value: u64,
        cumulative_negative: bool,
        timestamp: u64,
    }

    public struct InsuranceFundSeeded has copy, drop {
        market_id: ID,
        amount: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
    }

    // ===== Internal Helpers =====

    /// Calculate notional value with u128->u64 overflow guard.
    fun calculate_notional(size: u64, price: u64): u64 {
        let n = (size as u128) * (price as u128) / (PRICE_DECIMALS as u128);
        assert!(n <= (MAX_NOTIONAL as u128), ENotionalOverflow);
        (n as u64)
    }

    // ===== Oracle =====

    /// Read and validate oracle price. Shared by all trading and liquidation functions.
    public(package) fun read_oracle_price(
        market: &PerpMarket,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
    ): u64 {
        let (price_u128, _confidence, is_fresh) = dev_oracle::get_price_if_fresh(
            oracle_registry, market.base_symbol, MAX_ORACLE_AGE_MS, clock
        );
        assert!(is_fresh, EOracleStale);
        assert!(price_u128 <= MAX_ORACLE_PRICE, EOraclePriceOverflow);
        (price_u128 as u64)
    }

    // ===== Admin Functions =====

    /// Create a new perpetual market (AdminCap required)
    public fun create_market(
        _admin: &AdminCap,
        base_symbol: u64,
        name: vector<u8>,
        max_open_interest: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);

        let market = PerpMarket {
            id: object::new(ctx),
            admin: sender,
            base_symbol,
            name,
            max_leverage: MAX_LEVERAGE,
            maker_fee_bps: DEFAULT_MAKER_FEE_BPS,
            taker_fee_bps: DEFAULT_TAKER_FEE_BPS,
            open_interest_long: 0,
            open_interest_short: 0,
            max_open_interest,
            funding_rate_value: 0,
            funding_rate_negative: false,
            cumulative_funding_value: 0,
            cumulative_funding_negative: false,
            last_funding_time: now,
            insurance_fund: balance::zero(),
            fee_pool: balance::zero(),
            is_active: true,
            created_at: now,
        };

        event::emit(MarketCreated {
            market_id: object::id(&market),
            base_symbol,
            name,
            max_leverage: MAX_LEVERAGE,
            created_at: now,
        });

        transfer::share_object(market);
    }

    /// Pause/unpause market
    public fun set_market_active(
        market: &mut PerpMarket,
        is_active: bool,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == market.admin, ENotAdmin);
        market.is_active = is_active;
    }

    /// Update market fees (capped at MAX_FEE_BPS = 10%)
    public fun set_market_fees(
        market: &mut PerpMarket,
        maker_fee_bps: u64,
        taker_fee_bps: u64,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == market.admin, ENotAdmin);
        assert!(maker_fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
        assert!(taker_fee_bps <= MAX_FEE_BPS, EFeeTooHigh);
        market.maker_fee_bps = maker_fee_bps;
        market.taker_fee_bps = taker_fee_bps;
    }

    /// Withdraw accumulated trading fees (admin only)
    public fun withdraw_fees(
        market: &mut PerpMarket,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(tx_context::sender(ctx) == market.admin, ENotAdmin);
        let amount = balance::value(&market.fee_pool);

        event::emit(FeesWithdrawn {
            market_id: object::id(market),
            admin: tx_context::sender(ctx),
            amount,
        });

        coin::from_balance(balance::split(&mut market.fee_pool, amount), ctx)
    }

    // ===== Funding Settlement =====

    /// Settle funding rate for the market.
    /// Permissionless: anyone can call (keeper bot pattern).
    /// Uses Clock for timestamp (not caller-provided) to prevent time manipulation.
    /// Devnet: mark == index (Oracle price), so funding rate will be 0.
    /// Mainnet: mark should come from DEX TWAP, index from Oracle.
    public fun settle_funding(
        market: &mut PerpMarket,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
    ) {
        let current_time = sui::clock::timestamp_ms(clock);
        assert!(current_time >= market.last_funding_time + FUNDING_INTERVAL_MS, EFundingNotDue);

        let oracle_price = read_oracle_price(market, oracle_registry, clock);

        // Devnet: mark == index (single Oracle source), funding rate = 0
        // TODO(mainnet): separate mark price (DEX TWAP) from index price (Oracle)
        let mark_price = oracle_price;
        let index_price = oracle_price;

        let (rate_value, rate_negative) = pado_perp::funding::calculate_funding_rate(
            mark_price, index_price
        );

        // Update inline funding fields via public(package) add_signed
        let (new_cumulative, new_cumulative_neg) = pado_perp::funding::add_signed(
            market.cumulative_funding_value, market.cumulative_funding_negative,
            rate_value, rate_negative
        );

        market.funding_rate_value = rate_value;
        market.funding_rate_negative = rate_negative;
        market.cumulative_funding_value = new_cumulative;
        market.cumulative_funding_negative = new_cumulative_neg;
        market.last_funding_time = current_time;

        event::emit(FundingSettled {
            market_id: object::id(market),
            rate_value,
            rate_negative,
            cumulative_value: new_cumulative,
            cumulative_negative: new_cumulative_neg,
            timestamp: current_time,
        });
    }

    /// Seed insurance fund with NUSDC (admin only).
    /// Required before mainnet launch to ensure profitable positions can be paid.
    public fun seed_insurance_fund(
        _admin: &AdminCap,
        market: &mut PerpMarket,
        funds: Coin<NUSDC>,
    ) {
        let amount = coin::value(&funds);
        balance::join(&mut market.insurance_fund, coin::into_balance(funds));

        event::emit(InsuranceFundSeeded {
            market_id: object::id(market),
            amount,
        });
    }

    // ===== Trading Functions =====

    /// Open a new position
    /// Price is read from the on-chain OracleRegistry to prevent manipulation.
    /// Taker fee is deducted from collateral and sent to the market fee_pool.
    public fun open_position(
        market: &mut PerpMarket,
        is_long: bool,
        size: u64,
        leverage: u64,
        collateral: Coin<NUSDC>,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): PerpPosition {
        let current_price = read_oracle_price(market, oracle_registry, clock);
        assert!(market.is_active, EMarketPaused);
        assert!(leverage >= 1 && leverage <= market.max_leverage, EInvalidLeverage);
        assert!(size >= MIN_POSITION_SIZE, EInvalidSize);

        let sender = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);
        let collateral_amount = coin::value(&collateral);

        // Calculate notional with overflow guard
        let notional = calculate_notional(size, current_price);
        let fee_amount = (notional * market.taker_fee_bps) / BPS;
        let required_margin = notional / leverage;
        assert!(collateral_amount >= required_margin + fee_amount, EInsufficientMargin);

        // Check open interest limits
        if (is_long) {
            assert!(
                market.open_interest_long + size <= market.max_open_interest,
                EMaxOpenInterestReached
            );
            market.open_interest_long = market.open_interest_long + size;
        } else {
            assert!(
                market.open_interest_short + size <= market.max_open_interest,
                EMaxOpenInterestReached
            );
            market.open_interest_short = market.open_interest_short + size;
        };

        // Deduct taker fee from collateral
        let mut collateral_balance = coin::into_balance(collateral);
        if (fee_amount > 0) {
            balance::join(&mut market.fee_pool, balance::split(&mut collateral_balance, fee_amount));
        };

        let position = PerpPosition {
            id: object::new(ctx),
            market_id: object::id(market),
            owner: sender,
            is_long,
            size,
            entry_price: current_price,
            collateral: collateral_balance,
            leverage,
            entry_funding_value: market.cumulative_funding_value,
            entry_funding_negative: market.cumulative_funding_negative,
            realized_pnl_value: 0,
            realized_pnl_negative: false,
            created_at: now,
            last_updated: now,
        };

        event::emit(PositionOpened {
            position_id: object::id(&position),
            market_id: object::id(market),
            owner: sender,
            is_long,
            size,
            entry_price: current_price,
            collateral: collateral_amount - fee_amount,
            leverage,
            fee: fee_amount,
            timestamp: now,
        });

        position
    }

    /// Close a position entirely
    /// Price is read from the on-chain OracleRegistry to prevent manipulation.
    /// Taker fee is deducted from the return amount.
    public fun close_position(
        market: &mut PerpMarket,
        position: PerpPosition,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let current_price = read_oracle_price(market, oracle_registry, clock);
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);
        assert!(position.market_id == object::id(market), EPositionNotFound);

        let now = sui::clock::timestamp_ms(clock);
        let position_size = position.size;

        // Calculate P&L
        let (pnl_value, pnl_negative) = calculate_position_pnl(
            &position,
            current_price,
        );

        // Calculate close fee
        let close_notional = calculate_notional(position_size, current_price);
        let close_fee = (close_notional * market.taker_fee_bps) / BPS;

        // Update open interest
        if (position.is_long) {
            market.open_interest_long = market.open_interest_long - position_size;
        } else {
            market.open_interest_short = market.open_interest_short - position_size;
        };

        event::emit(PositionClosed {
            position_id: object::id(&position),
            market_id: object::id(market),
            owner: position.owner,
            size: position_size,
            exit_price: current_price,
            realized_pnl_value: pnl_value,
            realized_pnl_negative: pnl_negative,
            fee: close_fee,
            timestamp: now,
        });

        // Destroy position and return collateral
        let PerpPosition {
            id,
            market_id: _,
            owner: _,
            is_long: _,
            size: _,
            entry_price: _,
            mut collateral,
            leverage: _,
            entry_funding_value: _,
            entry_funding_negative: _,
            realized_pnl_value: _,
            realized_pnl_negative: _,
            created_at: _,
            last_updated: _,
        } = position;

        object::delete(id);

        // Handle P&L transfer
        if (pnl_negative && pnl_value > 0) {
            // Loss: take from collateral, send to insurance fund
            let loss_amount = if (pnl_value > balance::value(&collateral)) {
                balance::value(&collateral)
            } else {
                pnl_value
            };
            let loss_balance = balance::split(&mut collateral, loss_amount);
            balance::join(&mut market.insurance_fund, loss_balance);
        } else if (!pnl_negative && pnl_value > 0) {
            // Profit: pay from insurance fund if available
            let available = balance::value(&market.insurance_fund);
            let payout = if (pnl_value > available) { available } else { pnl_value };
            if (payout > 0) {
                let profit_balance = balance::split(&mut market.insurance_fund, payout);
                balance::join(&mut collateral, profit_balance);
            }
        };

        // Deduct taker fee from return (partial if insufficient)
        if (close_fee > 0) {
            let available = balance::value(&collateral);
            let actual_fee = if (available >= close_fee) { close_fee } else { available };
            if (actual_fee > 0) {
                balance::join(&mut market.fee_pool, balance::split(&mut collateral, actual_fee));
            };
        };

        coin::from_balance(collateral, ctx)
    }

    /// Add collateral to an existing position (reduce leverage)
    /// Price is read from the on-chain OracleRegistry for accurate leverage calculation.
    public fun add_collateral(
        market: &PerpMarket,
        position: &mut PerpPosition,
        additional: Coin<NUSDC>,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ) {
        let current_price = read_oracle_price(market, oracle_registry, clock);
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);

        let amount = coin::value(&additional);
        balance::join(&mut position.collateral, coin::into_balance(additional));

        // Recalculate effective leverage
        let collateral_value = balance::value(&position.collateral);
        let notional = calculate_notional(position.size, current_price);
        let new_leverage = if (collateral_value > 0) {
            notional / collateral_value
        } else {
            MAX_LEVERAGE
        };

        position.last_updated = sui::clock::timestamp_ms(clock);

        event::emit(CollateralAdded {
            position_id: object::id(position),
            amount,
            new_collateral: collateral_value,
            new_leverage,
            timestamp: position.last_updated,
        });
    }

    /// Remove collateral from a position (increase leverage)
    /// Price is read from the on-chain OracleRegistry for accurate margin validation.
    public fun remove_collateral(
        market: &PerpMarket,
        position: &mut PerpPosition,
        amount: u64,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let current_price = read_oracle_price(market, oracle_registry, clock);
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);
        assert!(position.market_id == object::id(market), EPositionNotFound);

        let collateral_value = balance::value(&position.collateral);
        assert!(collateral_value > amount, EInsufficientMargin);

        // Check that remaining collateral meets margin requirements
        let remaining = collateral_value - amount;
        let notional = calculate_notional(position.size, current_price);
        let new_leverage = notional / remaining;
        assert!(new_leverage <= market.max_leverage, EInvalidLeverage);

        // Check maintenance margin
        let required_maintenance = (notional * MAINTENANCE_MARGIN_BPS) / BPS;
        assert!(remaining >= required_maintenance, EInsufficientMargin);

        let withdrawn = balance::split(&mut position.collateral, amount);
        position.last_updated = sui::clock::timestamp_ms(clock);

        event::emit(CollateralRemoved {
            position_id: object::id(position),
            amount,
            new_collateral: remaining,
            new_leverage,
            timestamp: position.last_updated,
        });

        coin::from_balance(withdrawn, ctx)
    }

    // ===== View Functions =====

    /// Get position P&L
    public fun calculate_position_pnl(
        position: &PerpPosition,
        current_price: u64,
    ): (u64, bool) {
        // pnl = (current_price - entry_price) * size / PRICE_DECIMALS for long
        // pnl = (entry_price - current_price) * size / PRICE_DECIMALS for short
        if (position.is_long) {
            if (current_price >= position.entry_price) {
                let profit = ((current_price - position.entry_price) as u128)
                    * (position.size as u128) / (PRICE_DECIMALS as u128);
                ((profit as u64), false)
            } else {
                let loss = ((position.entry_price - current_price) as u128)
                    * (position.size as u128) / (PRICE_DECIMALS as u128);
                ((loss as u64), true)
            }
        } else {
            if (position.entry_price >= current_price) {
                let profit = ((position.entry_price - current_price) as u128)
                    * (position.size as u128) / (PRICE_DECIMALS as u128);
                ((profit as u64), false)
            } else {
                let loss = ((current_price - position.entry_price) as u128)
                    * (position.size as u128) / (PRICE_DECIMALS as u128);
                ((loss as u64), true)
            }
        }
    }

    /// Calculate liquidation price for a position
    public fun calculate_liquidation_price(
        position: &PerpPosition,
    ): u64 {
        let collateral = balance::value(&position.collateral);
        // Maintenance margin = 2.5% of notional
        // liquidation when: collateral - pnl = maintenance_margin
        // For long: collateral - (liq_price - entry) * size = 0.025 * liq_price * size
        // liq_price = entry - (collateral / size) * (1 - 0.025)
        // For short: collateral - (entry - liq_price) * size = 0.025 * liq_price * size
        // liq_price = entry + (collateral / size) * (1 - 0.025)

        let size_factor = ((collateral as u128) * (PRICE_DECIMALS as u128) / (position.size as u128)) as u64;
        let margin_adjustment = (size_factor * (BPS - MAINTENANCE_MARGIN_BPS)) / BPS;

        if (position.is_long) {
            if (position.entry_price > margin_adjustment) {
                position.entry_price - margin_adjustment
            } else {
                0
            }
        } else {
            position.entry_price + margin_adjustment
        }
    }

    /// Get position margin ratio
    public fun get_margin_ratio(
        position: &PerpPosition,
        current_price: u64,
    ): u64 {
        let collateral = balance::value(&position.collateral);
        let (pnl_value, pnl_negative) = calculate_position_pnl(position, current_price);

        let equity = if (pnl_negative) {
            if (pnl_value >= collateral) { 0 } else { collateral - pnl_value }
        } else {
            collateral + pnl_value
        };

        let notional = calculate_notional(position.size, current_price);

        if (notional == 0) {
            return BPS * 100 // Max ratio
        };

        (equity * BPS) / notional
    }

    /// Check if position is liquidatable
    public fun is_liquidatable(
        position: &PerpPosition,
        current_price: u64,
    ): bool {
        get_margin_ratio(position, current_price) < MAINTENANCE_MARGIN_BPS
    }

    // ===== Getters =====

    public fun get_position_size(position: &PerpPosition): u64 {
        position.size
    }

    public fun get_position_collateral(position: &PerpPosition): u64 {
        balance::value(&position.collateral)
    }

    public fun get_position_entry_price(position: &PerpPosition): u64 {
        position.entry_price
    }

    public fun get_position_leverage(position: &PerpPosition): u64 {
        position.leverage
    }

    public fun get_position_owner(position: &PerpPosition): address {
        position.owner
    }

    public fun get_position_is_long(position: &PerpPosition): bool {
        position.is_long
    }

    public fun get_market_open_interest(market: &PerpMarket): (u64, u64) {
        (market.open_interest_long, market.open_interest_short)
    }

    public fun get_market_funding_rate(market: &PerpMarket): (u64, bool) {
        (market.funding_rate_value, market.funding_rate_negative)
    }

    public fun get_insurance_fund_balance(market: &PerpMarket): u64 {
        balance::value(&market.insurance_fund)
    }

    public fun get_fee_pool_balance(market: &PerpMarket): u64 {
        balance::value(&market.fee_pool)
    }

    public fun get_position_market_id(position: &PerpPosition): ID {
        position.market_id
    }

    public fun get_market_base_symbol(market: &PerpMarket): u64 {
        market.base_symbol
    }

    // ===== Liquidation Support (package-only) =====

    /// Execute liquidation - can only be called by liquidation module
    /// Returns the liquidator bonus as a Coin
    public(package) fun execute_liquidation(
        market: &mut PerpMarket,
        position: PerpPosition,
        current_price: u64,
        liquidator_bonus: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let _now = sui::clock::timestamp_ms(clock);

        // Update open interest
        if (position.is_long) {
            market.open_interest_long = market.open_interest_long - position.size;
        } else {
            market.open_interest_short = market.open_interest_short - position.size;
        };

        // Calculate P&L
        let (pnl_value, pnl_negative) = calculate_position_pnl(&position, current_price);
        let collateral_value = balance::value(&position.collateral);

        // Destroy position and extract collateral
        let PerpPosition {
            id,
            market_id: _,
            owner: _,
            is_long: _,
            size: _,
            entry_price: _,
            mut collateral,
            leverage: _,
            entry_funding_value: _,
            entry_funding_negative: _,
            realized_pnl_value: _,
            realized_pnl_negative: _,
            created_at: _,
            last_updated: _,
        } = position;

        object::delete(id);

        // Calculate remaining equity after P&L
        let _remaining = if (pnl_negative) {
            if (pnl_value >= collateral_value) { 0 } else { collateral_value - pnl_value }
        } else {
            collateral_value
        };

        // If there's profit, we don't add it (position was liquidated due to losses)
        // Handle loss by reducing collateral
        if (pnl_negative && pnl_value > 0 && pnl_value < collateral_value) {
            let loss_balance = balance::split(&mut collateral, pnl_value);
            balance::join(&mut market.insurance_fund, loss_balance);
        };

        // Extract liquidator bonus
        let bonus_amount = if (liquidator_bonus > 0 && balance::value(&collateral) >= liquidator_bonus) {
            liquidator_bonus
        } else {
            balance::value(&collateral)
        };

        let liquidator_coin = if (bonus_amount > 0) {
            let bonus_balance = balance::split(&mut collateral, bonus_amount);
            coin::from_balance(bonus_balance, ctx)
        } else {
            coin::from_balance(balance::zero(), ctx)
        };

        // Send remaining collateral to insurance fund
        if (balance::value(&collateral) > 0) {
            balance::join(&mut market.insurance_fund, collateral);
        } else {
            balance::destroy_zero(collateral);
        };

        liquidator_coin
    }

    // ===== Test Functions =====

    #[test_only]
    public fun test_create_admin_cap(ctx: &mut TxContext): AdminCap {
        AdminCap { id: object::new(ctx) }
    }

    #[test_only]
    public fun test_create_market(
        admin: &AdminCap,
        base_symbol: u64,
        name: vector<u8>,
        max_open_interest: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        create_market(admin, base_symbol, name, max_open_interest, clock, ctx);
    }
}
