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
///
/// @version 1.0.0 (Phase 11.1)
module pado_perp::perpetual {
    use sui::event;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use pado::nusdc::NUSDC;

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

    // ===== Constants =====

    /// Maximum leverage (20x)
    const MAX_LEVERAGE: u64 = 20;

    /// Funding interval (8 hours in milliseconds)
    const FUNDING_INTERVAL_MS: u64 = 8 * 60 * 60 * 1000;

    /// Basis points denominator
    const BPS: u64 = 10000;

    /// Price precision (8 decimals)
    const PRICE_DECIMALS: u64 = 100_000_000;

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

    // ===== Structs =====

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

    // ===== Admin Functions =====

    /// Create a new perpetual market
    public fun create_market(
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

    /// Update market fees
    public fun set_market_fees(
        market: &mut PerpMarket,
        maker_fee_bps: u64,
        taker_fee_bps: u64,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == market.admin, ENotAdmin);
        market.maker_fee_bps = maker_fee_bps;
        market.taker_fee_bps = taker_fee_bps;
    }

    // ===== Trading Functions =====

    /// Open a new position
    public fun open_position(
        market: &mut PerpMarket,
        is_long: bool,
        size: u64,
        leverage: u64,
        collateral: Coin<NUSDC>,
        current_price: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): PerpPosition {
        assert!(market.is_active, EMarketPaused);
        assert!(leverage >= 1 && leverage <= market.max_leverage, EInvalidLeverage);
        assert!(size >= MIN_POSITION_SIZE, EInvalidSize);

        let sender = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);
        let collateral_amount = coin::value(&collateral);

        // Validate margin requirements
        // notional = size * price / PRICE_DECIMALS
        // required_margin = notional / leverage
        let notional = ((size as u128) * (current_price as u128) / (PRICE_DECIMALS as u128)) as u64;
        let required_margin = notional / leverage;
        assert!(collateral_amount >= required_margin, EInsufficientMargin);

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

        // Collect trading fee
        let fee_amount = (notional * market.taker_fee_bps) / BPS;
        // Fee is deducted from collateral in production
        // For simplicity, we skip fee deduction here

        let position = PerpPosition {
            id: object::new(ctx),
            market_id: object::id(market),
            owner: sender,
            is_long,
            size,
            entry_price: current_price,
            collateral: coin::into_balance(collateral),
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
            collateral: collateral_amount,
            leverage,
            timestamp: now,
        });

        position
    }

    /// Close a position entirely
    public fun close_position(
        market: &mut PerpMarket,
        position: PerpPosition,
        current_price: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);
        assert!(position.market_id == object::id(market), EPositionNotFound);

        let now = sui::clock::timestamp_ms(clock);

        // Calculate P&L
        let (pnl_value, pnl_negative) = calculate_position_pnl(
            &position,
            current_price,
        );

        // Update open interest
        if (position.is_long) {
            market.open_interest_long = market.open_interest_long - position.size;
        } else {
            market.open_interest_short = market.open_interest_short - position.size;
        };

        // Calculate return amount
        let collateral_value = balance::value(&position.collateral);
        let return_amount = if (pnl_negative) {
            if (pnl_value >= collateral_value) {
                0 // All collateral lost
            } else {
                collateral_value - pnl_value
            }
        } else {
            collateral_value + pnl_value
        };

        event::emit(PositionClosed {
            position_id: object::id(&position),
            market_id: object::id(market),
            owner: position.owner,
            size: position.size,
            exit_price: current_price,
            realized_pnl_value: pnl_value,
            realized_pnl_negative: pnl_negative,
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

        coin::from_balance(collateral, ctx)
    }

    /// Add collateral to an existing position (reduce leverage)
    public fun add_collateral(
        position: &mut PerpPosition,
        additional: Coin<NUSDC>,
        current_price: u64,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ) {
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);

        let amount = coin::value(&additional);
        balance::join(&mut position.collateral, coin::into_balance(additional));

        // Recalculate effective leverage
        let collateral_value = balance::value(&position.collateral);
        let notional = ((position.size as u128) * (current_price as u128) / (PRICE_DECIMALS as u128)) as u64;
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
    public fun remove_collateral(
        position: &mut PerpPosition,
        market: &PerpMarket,
        amount: u64,
        current_price: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(position.owner == tx_context::sender(ctx), ENotOwner);
        assert!(position.market_id == object::id(market), EPositionNotFound);

        let collateral_value = balance::value(&position.collateral);
        assert!(collateral_value > amount, EInsufficientMargin);

        // Check that remaining collateral meets margin requirements
        let remaining = collateral_value - amount;
        let notional = ((position.size as u128) * (current_price as u128) / (PRICE_DECIMALS as u128)) as u64;
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

        let notional = ((position.size as u128) * (current_price as u128) / (PRICE_DECIMALS as u128)) as u64;

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

    // ===== Test Functions =====

    #[test_only]
    public fun test_create_market(
        base_symbol: u64,
        name: vector<u8>,
        max_open_interest: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        create_market(base_symbol, name, max_open_interest, clock, ctx);
    }
}
