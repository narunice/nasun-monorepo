/// Account Positions
///
/// Per-account position registry (owned object)
/// Avoids Shared Object bottleneck for high-throughput trading
///
/// Design: Each MarginAccount has a 1:1 AccountPositions object
/// - Spot positions (Deepbook trades)
/// - Perp positions (Phase 11)
/// - Prediction references (NFT IDs)
///
/// @version 0.1.0 (Phase 16.3)
module unified_margin::account_positions {

    // ===== Error Codes =====

    const ENotOwner: u64 = 200;
    const EPositionNotFound: u64 = 201;
    const EMaxPositionsReached: u64 = 202;

    // ===== Constants =====

    /// Maximum number of positions per type
    const MAX_SPOT_POSITIONS: u64 = 50;
    const MAX_PREDICTION_REFS: u64 = 100;

    // ===== Structs =====

    /// Per-account position registry (owned object)
    public struct AccountPositions has key, store {
        id: UID,
        owner: address,
        // Spot positions
        spot_positions: vector<SpotPosition>,
        // Perp positions (Phase 11) - placeholder
        perp_position_count: u64,
        // Prediction NFT references
        prediction_refs: vector<ID>,
        // Timestamps
        created_at: u64,
        last_updated: u64,
    }

    /// Spot trading position
    public struct SpotPosition has store, copy, drop {
        pool_id: ID,
        base_amount: u64,          // Amount of base token
        quote_amount: u64,         // Amount of quote token (cost basis)
        entry_price_avg: u64,      // Average entry price (8 decimals)
        is_long: bool,             // Long (bought base) or Short (sold base)
        created_at: u64,
    }

    /// Signed value representation (for PnL)
    public struct SignedValue has copy, drop, store {
        value: u64,
        is_negative: bool,
    }

    // ===== Events =====

    public struct PositionsCreated has copy, drop {
        positions_id: ID,
        owner: address,
        created_at: u64,
    }

    public struct SpotPositionOpened has copy, drop {
        positions_id: ID,
        pool_id: ID,
        base_amount: u64,
        quote_amount: u64,
        entry_price: u64,
        is_long: bool,
    }

    public struct SpotPositionClosed has copy, drop {
        positions_id: ID,
        pool_id: ID,
        base_amount: u64,
        realized_pnl_value: u64,
        realized_pnl_negative: bool,
    }

    public struct SpotPositionUpdated has copy, drop {
        positions_id: ID,
        pool_id: ID,
        new_base_amount: u64,
        new_entry_price_avg: u64,
    }

    // ===== Entry Functions =====

    /// Create AccountPositions for the sender
    /// Called once when user enables Pado margin features
    public entry fun create_positions(
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);

        let positions = AccountPositions {
            id: object::new(ctx),
            owner: sender,
            spot_positions: vector::empty(),
            perp_position_count: 0,
            prediction_refs: vector::empty(),
            created_at: now,
            last_updated: now,
        };

        sui::event::emit(PositionsCreated {
            positions_id: object::id(&positions),
            owner: sender,
            created_at: now,
        });

        transfer::transfer(positions, sender);
    }

    // ===== Spot Position Functions =====

    /// Open or add to a spot position
    public fun open_spot_position(
        positions: &mut AccountPositions,
        pool_id: ID,
        base_amount: u64,
        quote_amount: u64,
        entry_price: u64,
        is_long: bool,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ) {
        assert!(positions.owner == tx_context::sender(ctx), ENotOwner);
        let now = sui::clock::timestamp_ms(clock);

        // Check if position exists for this pool
        let (exists, idx) = find_spot_position(positions, pool_id);

        if (exists) {
            // Update existing position (average in)
            let pos = vector::borrow_mut(&mut positions.spot_positions, idx);
            let new_base = pos.base_amount + base_amount;
            let new_quote = pos.quote_amount + quote_amount;
            // Calculate new average entry price
            let new_avg_price = if (new_base > 0) {
                ((new_quote as u128) * 100_000_000 / (new_base as u128)) as u64
            } else {
                0
            };
            pos.base_amount = new_base;
            pos.quote_amount = new_quote;
            pos.entry_price_avg = new_avg_price;

            sui::event::emit(SpotPositionUpdated {
                positions_id: object::id(positions),
                pool_id,
                new_base_amount: new_base,
                new_entry_price_avg: new_avg_price,
            });
        } else {
            // Create new position
            assert!(
                vector::length(&positions.spot_positions) < MAX_SPOT_POSITIONS,
                EMaxPositionsReached
            );

            let pos = SpotPosition {
                pool_id,
                base_amount,
                quote_amount,
                entry_price_avg: entry_price,
                is_long,
                created_at: now,
            };
            vector::push_back(&mut positions.spot_positions, pos);

            sui::event::emit(SpotPositionOpened {
                positions_id: object::id(positions),
                pool_id,
                base_amount,
                quote_amount,
                entry_price,
                is_long,
            });
        };

        positions.last_updated = now;
    }

    /// Close or reduce a spot position
    /// Returns (pnl_value, is_negative)
    public fun close_spot_position(
        positions: &mut AccountPositions,
        pool_id: ID,
        base_amount_to_close: u64,
        exit_price: u64,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ): (u64, bool) {
        assert!(positions.owner == tx_context::sender(ctx), ENotOwner);
        let now = sui::clock::timestamp_ms(clock);

        let (exists, idx) = find_spot_position(positions, pool_id);
        assert!(exists, EPositionNotFound);

        let pos = vector::borrow_mut(&mut positions.spot_positions, idx);
        let close_amount = if (base_amount_to_close > pos.base_amount) {
            pos.base_amount
        } else {
            base_amount_to_close
        };

        // Calculate realized PnL
        // PnL = (exit_price - entry_price) * amount for long
        // PnL = (entry_price - exit_price) * amount for short
        let (pnl_value, is_negative) = if (pos.is_long) {
            if (exit_price >= pos.entry_price_avg) {
                let profit = ((exit_price - pos.entry_price_avg) as u128) * (close_amount as u128) / 100_000_000;
                ((profit as u64), false)
            } else {
                let loss = ((pos.entry_price_avg - exit_price) as u128) * (close_amount as u128) / 100_000_000;
                ((loss as u64), true)
            }
        } else {
            if (pos.entry_price_avg >= exit_price) {
                let profit = ((pos.entry_price_avg - exit_price) as u128) * (close_amount as u128) / 100_000_000;
                ((profit as u64), false)
            } else {
                let loss = ((exit_price - pos.entry_price_avg) as u128) * (close_amount as u128) / 100_000_000;
                ((loss as u64), true)
            }
        };

        if (close_amount >= pos.base_amount) {
            // Full close - remove position
            let _ = vector::swap_remove(&mut positions.spot_positions, idx);
        } else {
            // Partial close - reduce position
            let quote_reduction = (pos.quote_amount * close_amount) / pos.base_amount;
            pos.base_amount = pos.base_amount - close_amount;
            pos.quote_amount = pos.quote_amount - quote_reduction;
        };

        sui::event::emit(SpotPositionClosed {
            positions_id: object::id(positions),
            pool_id,
            base_amount: close_amount,
            realized_pnl_value: pnl_value,
            realized_pnl_negative: is_negative,
        });

        positions.last_updated = now;
        (pnl_value, is_negative)
    }

    /// Add prediction NFT reference
    public fun add_prediction_ref(
        positions: &mut AccountPositions,
        prediction_id: ID,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ) {
        assert!(positions.owner == tx_context::sender(ctx), ENotOwner);
        assert!(
            vector::length(&positions.prediction_refs) < MAX_PREDICTION_REFS,
            EMaxPositionsReached
        );

        vector::push_back(&mut positions.prediction_refs, prediction_id);
        positions.last_updated = sui::clock::timestamp_ms(clock);
    }

    /// Remove prediction NFT reference
    public fun remove_prediction_ref(
        positions: &mut AccountPositions,
        prediction_id: ID,
        clock: &sui::clock::Clock,
        ctx: &TxContext,
    ) {
        assert!(positions.owner == tx_context::sender(ctx), ENotOwner);

        let len = vector::length(&positions.prediction_refs);
        let mut i = 0;
        while (i < len) {
            if (*vector::borrow(&positions.prediction_refs, i) == prediction_id) {
                vector::swap_remove(&mut positions.prediction_refs, i);
                break
            };
            i = i + 1;
        };

        positions.last_updated = sui::clock::timestamp_ms(clock);
    }

    // ===== View Functions =====

    /// Get total position value (notional) and unrealized PnL
    /// current_prices: vector of (pool_id, current_price) tuples
    /// Returns: (notional_value, pnl_value, pnl_is_negative)
    public fun get_total_position_value(
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
    ): (u64, u64, bool) {
        let mut total_notional: u64 = 0;
        let mut total_profit: u128 = 0;
        let mut total_loss: u128 = 0;

        let len = vector::length(&positions.spot_positions);
        let mut i = 0;

        while (i < len) {
            let pos = vector::borrow(&positions.spot_positions, i);

            // Find current price for this pool
            let current_price = find_price_for_pool(&current_prices, pos.pool_id);

            // Notional = base_amount * current_price
            let notional = ((pos.base_amount as u128) * (current_price as u128) / 100_000_000) as u64;
            total_notional = total_notional + notional;

            // Unrealized PnL
            if (pos.is_long) {
                if (current_price >= pos.entry_price_avg) {
                    let profit = ((current_price - pos.entry_price_avg) as u128) * (pos.base_amount as u128) / 100_000_000;
                    total_profit = total_profit + profit;
                } else {
                    let loss = ((pos.entry_price_avg - current_price) as u128) * (pos.base_amount as u128) / 100_000_000;
                    total_loss = total_loss + loss;
                }
            } else {
                if (pos.entry_price_avg >= current_price) {
                    let profit = ((pos.entry_price_avg - current_price) as u128) * (pos.base_amount as u128) / 100_000_000;
                    total_profit = total_profit + profit;
                } else {
                    let loss = ((current_price - pos.entry_price_avg) as u128) * (pos.base_amount as u128) / 100_000_000;
                    total_loss = total_loss + loss;
                }
            };

            i = i + 1;
        };

        // Net PnL
        let (pnl_value, is_negative) = if (total_profit >= total_loss) {
            (((total_profit - total_loss) as u64), false)
        } else {
            (((total_loss - total_profit) as u64), true)
        };

        (total_notional, pnl_value, is_negative)
    }

    /// Get spot positions count
    public fun get_spot_positions_count(positions: &AccountPositions): u64 {
        vector::length(&positions.spot_positions)
    }

    /// Get perp positions count (Phase 11)
    public fun get_perp_positions_count(positions: &AccountPositions): u64 {
        positions.perp_position_count
    }

    /// Get prediction refs count
    public fun get_prediction_refs_count(positions: &AccountPositions): u64 {
        vector::length(&positions.prediction_refs)
    }

    /// Get owner address
    public fun get_owner(positions: &AccountPositions): address {
        positions.owner
    }

    /// Check if positions exist for a pool
    public fun has_spot_position(positions: &AccountPositions, pool_id: ID): bool {
        let (exists, _) = find_spot_position(positions, pool_id);
        exists
    }

    /// Get spot position details
    public fun get_spot_position(
        positions: &AccountPositions,
        pool_id: ID
    ): (u64, u64, u64, bool) {
        let (exists, idx) = find_spot_position(positions, pool_id);
        if (!exists) {
            return (0, 0, 0, false)
        };
        let pos = vector::borrow(&positions.spot_positions, idx);
        (pos.base_amount, pos.quote_amount, pos.entry_price_avg, pos.is_long)
    }

    // ===== Helper Structs =====

    /// Price info for position valuation
    public struct PriceInfo has copy, drop {
        pool_id: ID,
        price: u64,
    }

    public fun create_price_info(pool_id: ID, price: u64): PriceInfo {
        PriceInfo { pool_id, price }
    }

    /// Get price from PriceInfo
    public fun get_price_info_price(info: &PriceInfo): u64 {
        info.price
    }

    /// Create signed value helper
    public fun create_signed_value(value: u64, is_negative: bool): SignedValue {
        SignedValue { value, is_negative }
    }

    public fun get_signed_value(sv: &SignedValue): (u64, bool) {
        (sv.value, sv.is_negative)
    }

    // ===== Internal Functions =====

    fun find_spot_position(positions: &AccountPositions, pool_id: ID): (bool, u64) {
        let len = vector::length(&positions.spot_positions);
        let mut i = 0;
        while (i < len) {
            let pos = vector::borrow(&positions.spot_positions, i);
            if (pos.pool_id == pool_id) {
                return (true, i)
            };
            i = i + 1;
        };
        (false, 0)
    }

    fun find_price_for_pool(prices: &vector<PriceInfo>, pool_id: ID): u64 {
        let len = vector::length(prices);
        let mut i = 0;
        while (i < len) {
            let info = vector::borrow(prices, i);
            if (info.pool_id == pool_id) {
                return info.price
            };
            i = i + 1;
        };
        // Abort if price not found: prevents attack where omitting a pool's price
        // zeros its notional, making the account appear over-collateralized
        abort EMissingPoolPrice
    }

    /// Error: caller-provided prices vector is missing a required pool price
    const EMissingPoolPrice: u64 = 203;

    // ===== Test Functions =====

    #[test_only]
    public fun test_create_positions(
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ): AccountPositions {
        let sender = tx_context::sender(ctx);
        let now = sui::clock::timestamp_ms(clock);

        AccountPositions {
            id: object::new(ctx),
            owner: sender,
            spot_positions: vector::empty(),
            perp_position_count: 0,
            prediction_refs: vector::empty(),
            created_at: now,
            last_updated: now,
        }
    }
}
