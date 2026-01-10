/// Funding Rate Calculation
///
/// 8-hour funding rate mechanism for perpetual futures
/// "Balance long/short through periodic payments"
///
/// Features:
/// - Funding rate = (mark_price - index_price) / index_price * factor
/// - 8-hour settlement interval
/// - Oracle staleness protection
/// - Cumulative funding index for position P&L
///
/// @version 1.0.0 (Phase 11.2)
module pado_perp::funding {
    use sui::event;

    // ===== Error Codes =====

    const EOracleTooStale: u64 = 200;
    const EFundingNotDue: u64 = 201;
    const EInvalidFundingRate: u64 = 202;

    // ===== Constants =====

    /// Funding interval (8 hours in milliseconds)
    const FUNDING_INTERVAL_MS: u64 = 8 * 60 * 60 * 1000;

    /// Maximum funding rate per 8h (1.25% = 125 bps)
    const MAX_FUNDING_RATE_BPS: u64 = 125;

    /// Funding rate factor (controls sensitivity)
    /// rate = premium_index * FUNDING_FACTOR / 10000
    const FUNDING_FACTOR: u64 = 125;

    /// Maximum oracle age for funding settlement (2 minutes)
    const MAX_ORACLE_AGE_MS: u64 = 120_000;

    /// Basis points
    const BPS: u64 = 10000;

    // ===== Structs =====

    /// Funding state for a market (can be embedded in PerpMarket)
    public struct FundingState has store, copy, drop {
        /// Current funding rate (signed)
        rate_value: u64,
        rate_negative: bool,
        /// Cumulative funding index
        cumulative_value: u64,
        cumulative_negative: bool,
        /// Last settlement timestamp
        last_settlement: u64,
    }

    // ===== Events =====

    public struct FundingRateCalculated has copy, drop {
        mark_price: u64,
        index_price: u64,
        rate_value: u64,
        rate_negative: bool,
        timestamp: u64,
    }

    public struct FundingSettled has copy, drop {
        market_id: ID,
        rate_value: u64,
        rate_negative: bool,
        open_interest_long: u64,
        open_interest_short: u64,
        timestamp: u64,
    }

    public struct FundingSkipped has copy, drop {
        market_id: ID,
        reason: u8,  // 1 = Oracle stale, 2 = Not due yet
        timestamp: u64,
    }

    // ===== Funding Rate Functions =====

    /// Create initial funding state
    public fun create_funding_state(timestamp: u64): FundingState {
        FundingState {
            rate_value: 0,
            rate_negative: false,
            cumulative_value: 0,
            cumulative_negative: false,
            last_settlement: timestamp,
        }
    }

    /// Calculate funding rate based on mark price vs index price
    /// Returns (rate_value, is_negative)
    /// Positive rate: longs pay shorts
    /// Negative rate: shorts pay longs
    public fun calculate_funding_rate(
        mark_price: u64,
        index_price: u64,
    ): (u64, bool) {
        if (index_price == 0) {
            return (0, false)
        };

        // premium_index = (mark - index) / index * 10000
        let (premium_value, premium_negative) = if (mark_price >= index_price) {
            let premium = ((mark_price - index_price) as u128) * (BPS as u128) / (index_price as u128);
            ((premium as u64), false)
        } else {
            let premium = ((index_price - mark_price) as u128) * (BPS as u128) / (index_price as u128);
            ((premium as u64), true)
        };

        // funding_rate = premium_index * FUNDING_FACTOR / 10000
        let rate = (premium_value * FUNDING_FACTOR) / BPS;

        // Cap at maximum
        let capped_rate = if (rate > MAX_FUNDING_RATE_BPS) {
            MAX_FUNDING_RATE_BPS
        } else {
            rate
        };

        (capped_rate, premium_negative)
    }

    /// Check if funding settlement is due
    public fun is_funding_due(
        state: &FundingState,
        current_time: u64,
    ): bool {
        current_time >= state.last_settlement + FUNDING_INTERVAL_MS
    }

    /// Check if oracle is too stale for funding
    public fun is_oracle_stale(
        oracle_timestamp: u64,
        current_time: u64,
    ): bool {
        current_time - oracle_timestamp > MAX_ORACLE_AGE_MS
    }

    /// Update funding state with new rate
    /// Returns updated state
    public fun update_funding_state(
        state: FundingState,
        new_rate_value: u64,
        new_rate_negative: bool,
        timestamp: u64,
    ): FundingState {
        // Update cumulative funding
        let (new_cumulative_value, new_cumulative_negative) = add_signed(
            state.cumulative_value,
            state.cumulative_negative,
            new_rate_value,
            new_rate_negative,
        );

        FundingState {
            rate_value: new_rate_value,
            rate_negative: new_rate_negative,
            cumulative_value: new_cumulative_value,
            cumulative_negative: new_cumulative_negative,
            last_settlement: timestamp,
        }
    }

    /// Calculate funding payment for a position
    /// Returns (payment_value, position_pays)
    /// position_pays = true means position owes funding
    /// position_pays = false means position receives funding
    public fun calculate_position_funding(
        position_size: u64,
        is_long: bool,
        entry_funding_value: u64,
        entry_funding_negative: bool,
        current_funding_value: u64,
        current_funding_negative: bool,
    ): (u64, bool) {
        // Calculate funding delta since position opened
        let (delta_value, delta_negative) = subtract_signed(
            current_funding_value,
            current_funding_negative,
            entry_funding_value,
            entry_funding_negative,
        );

        // Funding payment = size * delta / BPS
        let payment = (position_size * delta_value) / BPS;

        // Long pays if delta is positive (funding rate was positive)
        // Short pays if delta is negative (funding rate was negative)
        let position_pays = if (is_long) {
            !delta_negative  // Long pays when cumulative funding increased
        } else {
            delta_negative   // Short pays when cumulative funding decreased
        };

        (payment, position_pays)
    }

    // ===== Signed Arithmetic Helpers =====

    /// Add two signed values: (a_value, a_neg) + (b_value, b_neg)
    fun add_signed(
        a_value: u64,
        a_negative: bool,
        b_value: u64,
        b_negative: bool,
    ): (u64, bool) {
        if (a_negative == b_negative) {
            // Same sign: add values, keep sign
            (a_value + b_value, a_negative)
        } else {
            // Different signs: subtract smaller from larger
            if (a_value >= b_value) {
                (a_value - b_value, a_negative)
            } else {
                (b_value - a_value, b_negative)
            }
        }
    }

    /// Subtract two signed values: (a_value, a_neg) - (b_value, b_neg)
    fun subtract_signed(
        a_value: u64,
        a_negative: bool,
        b_value: u64,
        b_negative: bool,
    ): (u64, bool) {
        // a - b = a + (-b)
        add_signed(a_value, a_negative, b_value, !b_negative)
    }

    // ===== View Functions =====

    /// Get funding state values
    public fun get_funding_state_values(state: &FundingState): (u64, bool, u64, bool, u64) {
        (
            state.rate_value,
            state.rate_negative,
            state.cumulative_value,
            state.cumulative_negative,
            state.last_settlement,
        )
    }

    /// Get funding interval in milliseconds
    public fun get_funding_interval_ms(): u64 {
        FUNDING_INTERVAL_MS
    }

    /// Get max funding rate in basis points
    public fun get_max_funding_rate_bps(): u64 {
        MAX_FUNDING_RATE_BPS
    }

    /// Get max oracle age for funding settlement
    public fun get_max_oracle_age_ms(): u64 {
        MAX_ORACLE_AGE_MS
    }

    // ===== Test Functions =====

    #[test_only]
    public fun test_calculate_funding_rate(
        mark_price: u64,
        index_price: u64,
    ): (u64, bool) {
        calculate_funding_rate(mark_price, index_price)
    }

    #[test_only]
    public fun test_add_signed(
        a_value: u64,
        a_negative: bool,
        b_value: u64,
        b_negative: bool,
    ): (u64, bool) {
        add_signed(a_value, a_negative, b_value, b_negative)
    }
}
