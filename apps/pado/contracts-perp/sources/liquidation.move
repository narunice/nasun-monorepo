/// Perpetual Liquidation Engine
///
/// Handles liquidation of underwater positions
/// Anyone can call liquidate_position to close positions below maintenance margin
///
/// Liquidation Mechanism:
/// 1. Read verified price from on-chain Oracle (prevents price manipulation attacks)
/// 2. Check if position margin ratio < MAINTENANCE_MARGIN_BPS (2.5%)
/// 3. Calculate remaining equity after P&L
/// 4. Pay liquidator bonus (5% of remaining collateral)
/// 5. Send rest to insurance fund
/// 6. Delete the position
///
/// @version 1.1.0 (SEC-1 fix: Oracle integration)
module pado_perp::liquidation {
    use sui::event;
    use sui::coin::Coin;
    use devnet_tokens::nusdc::NUSDC;
    use pado_oracle::dev_oracle::{Self, OracleRegistry};
    use pado_perp::perpetual::{
        Self,
        PerpMarket,
        PerpPosition,
    };

    // ===== Error Codes =====

    const ENotLiquidatable: u64 = 200;
    const EMarketMismatch: u64 = 202;
    const EOracleStale: u64 = 203;
    const EOraclePriceOverflow: u64 = 204;

    // ===== Constants =====

    /// Liquidation bonus for liquidator (5% = 500 bps)
    const LIQUIDATION_BONUS_BPS: u64 = 500;

    /// Basis points denominator
    const BPS: u64 = 10000;

    /// Minimum liquidation bonus in NUSDC units (0.1 NUSDC)
    const MIN_LIQUIDATION_BONUS: u64 = 100_000;

    /// Maximum oracle staleness for liquidation (120 seconds)
    const MAX_ORACLE_AGE_MS: u64 = 120_000;

    /// Maximum reasonable price in oracle units (8 decimals).
    /// $10,000,000 = 1_000_000_000_000_000. Guards against oracle misconfiguration.
    const MAX_ORACLE_PRICE: u128 = 1_000_000_000_000_000;

    // ===== Events =====

    public struct PositionLiquidated has copy, drop {
        position_id: ID,
        market_id: ID,
        owner: address,
        liquidator: address,
        is_long: bool,
        size: u64,
        entry_price: u64,
        liquidation_price: u64,
        collateral_remaining: u64,
        liquidator_bonus: u64,
        insurance_fund_amount: u64,
        timestamp: u64,
    }

    // ===== Internal Helper =====

    /// Core liquidation logic using a pre-verified oracle price.
    /// Called by both liquidate_position (single) and batch_liquidate (batch).
    /// The price MUST be read from the on-chain oracle before calling this.
    fun liquidate_with_verified_price(
        market: &mut PerpMarket,
        position: PerpPosition,
        current_price: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        // Verify position belongs to this market
        let market_id = object::id(market);
        assert!(perpetual::get_position_market_id(&position) == market_id, EMarketMismatch);

        // Check if position is liquidatable
        assert!(perpetual::is_liquidatable(&position, current_price), ENotLiquidatable);

        let liquidator = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);

        // Get position details before destruction
        let position_id = object::id(&position);
        let owner = perpetual::get_position_owner(&position);
        let is_long = perpetual::get_position_is_long(&position);
        let size = perpetual::get_position_size(&position);
        let entry_price = perpetual::get_position_entry_price(&position);
        let collateral_value = perpetual::get_position_collateral(&position);

        // Calculate P&L
        let (pnl_value, pnl_negative) = perpetual::calculate_position_pnl(&position, current_price);

        // Calculate remaining equity
        let remaining_equity = if (pnl_negative) {
            if (pnl_value >= collateral_value) {
                0
            } else {
                collateral_value - pnl_value
            }
        } else {
            collateral_value + pnl_value
        };

        // Calculate liquidator bonus (5% of remaining equity)
        let liquidator_bonus = if (remaining_equity > 0) {
            let bonus = (remaining_equity * LIQUIDATION_BONUS_BPS) / BPS;
            if (bonus < MIN_LIQUIDATION_BONUS && remaining_equity >= MIN_LIQUIDATION_BONUS) {
                MIN_LIQUIDATION_BONUS
            } else {
                bonus
            }
        } else {
            0
        };

        // Amount going to insurance fund
        let insurance_amount = if (remaining_equity > liquidator_bonus) {
            remaining_equity - liquidator_bonus
        } else {
            0
        };

        // Emit liquidation event
        event::emit(PositionLiquidated {
            position_id,
            market_id,
            owner,
            liquidator,
            is_long,
            size,
            entry_price,
            liquidation_price: current_price,
            collateral_remaining: remaining_equity,
            liquidator_bonus,
            insurance_fund_amount: insurance_amount,
            timestamp: now,
        });

        // Execute liquidation through perpetual module
        perpetual::execute_liquidation(
            market,
            position,
            current_price,
            liquidator_bonus,
            clock,
            ctx,
        )
    }

    // ===== Public Functions =====

    /// Read oracle price and return validated u64 value.
    fun read_oracle_price(
        market: &PerpMarket,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
    ): u64 {
        let base_symbol = perpetual::get_market_base_symbol(market);
        let (price_u128, _confidence, is_fresh) = dev_oracle::get_price_if_fresh(
            oracle_registry, base_symbol, MAX_ORACLE_AGE_MS, clock
        );
        assert!(is_fresh, EOracleStale);
        assert!(price_u128 <= MAX_ORACLE_PRICE, EOraclePriceOverflow);
        (price_u128 as u64)
    }

    /// Liquidate an underwater position using on-chain oracle price
    /// Anyone can call this function to liquidate positions below maintenance margin
    /// Liquidator receives a bonus (5% of remaining collateral)
    ///
    /// Price is read from the on-chain OracleRegistry to prevent manipulation.
    /// The caller cannot provide an arbitrary price.
    public fun liquidate_position(
        market: &mut PerpMarket,
        position: PerpPosition,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let current_price = read_oracle_price(market, oracle_registry, clock);
        liquidate_with_verified_price(market, position, current_price, clock, ctx)
    }

    /// Batch liquidate multiple positions using on-chain oracle price
    /// Gas-efficient: reads oracle once, applies to all positions
    public fun batch_liquidate(
        market: &mut PerpMarket,
        mut positions: vector<PerpPosition>,
        oracle_registry: &OracleRegistry,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): vector<Coin<NUSDC>> {
        let current_price = read_oracle_price(market, oracle_registry, clock);

        let mut results = vector::empty<Coin<NUSDC>>();

        while (!vector::is_empty(&positions)) {
            let position = vector::pop_back(&mut positions);
            let owner = perpetual::get_position_owner(&position);

            if (perpetual::is_liquidatable(&position, current_price)) {
                let bonus_coin = liquidate_with_verified_price(
                    market, position, current_price, clock, ctx,
                );
                vector::push_back(&mut results, bonus_coin);
            } else {
                transfer::public_transfer(position, owner);
            };
        };

        vector::destroy_empty(positions);
        results
    }

    // ===== View Functions =====

    /// Get the liquidation bonus percentage
    public fun get_liquidation_bonus_bps(): u64 {
        LIQUIDATION_BONUS_BPS
    }

    /// Calculate expected liquidator bonus for a position (view function, caller-provided price is acceptable)
    public fun calculate_liquidator_bonus(
        position: &PerpPosition,
        current_price: u64,
    ): u64 {
        if (!perpetual::is_liquidatable(position, current_price)) {
            return 0
        };

        let collateral = perpetual::get_position_collateral(position);
        let (pnl_value, pnl_negative) = perpetual::calculate_position_pnl(position, current_price);

        let remaining = if (pnl_negative) {
            if (pnl_value >= collateral) { 0 } else { collateral - pnl_value }
        } else {
            collateral + pnl_value
        };

        let bonus = (remaining * LIQUIDATION_BONUS_BPS) / BPS;
        if (bonus < MIN_LIQUIDATION_BONUS && remaining >= MIN_LIQUIDATION_BONUS) {
            MIN_LIQUIDATION_BONUS
        } else {
            bonus
        }
    }
}
