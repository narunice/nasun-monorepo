/// Risk Engine v1
///
/// Portfolio-level risk calculation and validation
/// "Validate before trade, protect the margin"
///
/// v0: Basic balance validation with buffer
/// v0.5: Integration with use_margin() and locked margin
/// v1: Full risk metrics, 4-tier thresholds, liquidation triggers
///
/// Threshold Levels:
/// - 10% Initial Margin (IM): Required to open new positions
/// - 8% Warning: UI shows warning, trading still allowed
/// - 5% Maintenance Margin (MM): Liquidation possible
/// - 3% Forced Liquidation: Automatic partial liquidation
///
/// @version 1.0.0 (Phase 16.3)
module unified_margin::risk_engine {
    use unified_margin::unified_margin::{Self, MarginAccount, MarginRegistry};
    use unified_margin::account_positions::{Self, AccountPositions, PriceInfo};

    // ===== Constants =====

    /// Initial Margin requirement (10%)
    const INITIAL_MARGIN_BPS: u64 = 1000;
    /// Warning threshold (8%)
    const WARNING_THRESHOLD_BPS: u64 = 800;
    /// Maintenance Margin requirement (5%)
    const MAINTENANCE_MARGIN_BPS: u64 = 500;
    /// Forced liquidation threshold (3%)
    const FORCED_LIQUIDATION_BPS: u64 = 300;

    /// Basis points denominator (10000 = 100%)
    const BASIS_POINTS: u64 = 10000;

    /// Maximum margin ratio (when no positions)
    const MAX_MARGIN_RATIO: u64 = 1000000; // 10000%

    /// Legacy: Buffer percentage for v0 compatibility
    const BUFFER_PERCENTAGE: u64 = 110;

    /// Maximum deviation between caller-provided price and Oracle price (5%)
    /// Prevents price manipulation attacks where attacker supplies inflated/deflated prices
    const MAX_PRICE_DEVIATION_BPS: u64 = 500;

    // ===== Error Codes =====

    /// Caller-provided price deviates too much from Oracle price
    const EPriceDeviationTooLarge: u64 = 100;

    // ===== Risk Levels =====

    const RISK_LEVEL_HEALTHY: u8 = 0;
    const RISK_LEVEL_WARNING: u8 = 1;
    const RISK_LEVEL_LIQUIDATABLE: u8 = 2;
    const RISK_LEVEL_CRITICAL: u8 = 3;

    // ===== Structs =====

    /// Comprehensive risk metrics for an account
    public struct RiskMetrics has copy, drop {
        /// Total collateral value in USD (after haircuts)
        collateral_value: u64,
        /// Total position notional value
        position_value: u64,
        /// Unrealized P&L value (absolute)
        unrealized_pnl_value: u64,
        /// Whether unrealized PnL is negative
        unrealized_pnl_negative: bool,
        /// Margin ratio in basis points (collateral / position)
        margin_ratio: u64,
        /// Available for new positions
        free_collateral: u64,
        /// Risk level (0=Healthy, 1=Warning, 2=Liquidatable, 3=Critical)
        risk_level: u8,
        /// Whether account is liquidatable
        is_liquidatable: bool,
    }

    // ===== Core Risk Functions =====

    /// Calculate comprehensive risk metrics for an account
    ///
    /// @param account - The margin account
    /// @param registry - The margin registry for haircut config
    /// @param positions - The account's positions
    /// @param current_prices - Current market prices for each pool
    /// @param nbtc_price - Current NBTC price in USD (8 decimals, from Oracle)
    public fun calculate_risk_metrics(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): RiskMetrics {
        // Validate caller-provided prices against Oracle price (deviation bound)
        validate_prices_against_oracle(&current_prices, nbtc_price);

        // Get collateral value (with haircuts applied)
        let collateral_value = unified_margin::calculate_collateral_value_usd(
            account,
            registry,
            nbtc_price,
        );

        // Get position value and unrealized PnL
        // Note: find_price_for_pool now aborts if any active pool's price is missing
        let (position_value, pnl_value, pnl_negative) = account_positions::get_total_position_value(
            positions,
            current_prices,
        );

        // Calculate margin ratio
        // margin_ratio = collateral_value / position_value * 10000
        let margin_ratio = if (position_value == 0) {
            MAX_MARGIN_RATIO
        } else {
            ((collateral_value as u128) * (BASIS_POINTS as u128) / (position_value as u128)) as u64
        };

        // Calculate free collateral (available for new positions)
        // Required margin = position_value * INITIAL_MARGIN_BPS / BASIS_POINTS
        let required_margin = (position_value * INITIAL_MARGIN_BPS) / BASIS_POINTS;
        let free_collateral = if (collateral_value > required_margin) {
            collateral_value - required_margin
        } else {
            0
        };

        // Determine risk level
        let risk_level = get_risk_level(margin_ratio);
        let is_liquidatable = risk_level >= RISK_LEVEL_LIQUIDATABLE;

        RiskMetrics {
            collateral_value,
            position_value,
            unrealized_pnl_value: pnl_value,
            unrealized_pnl_negative: pnl_negative,
            margin_ratio,
            free_collateral,
            risk_level,
            is_liquidatable,
        }
    }

    /// Get risk level from margin ratio
    public fun get_risk_level(margin_ratio: u64): u8 {
        if (margin_ratio >= WARNING_THRESHOLD_BPS) {
            RISK_LEVEL_HEALTHY
        } else if (margin_ratio >= MAINTENANCE_MARGIN_BPS) {
            RISK_LEVEL_WARNING
        } else if (margin_ratio >= FORCED_LIQUIDATION_BPS) {
            RISK_LEVEL_LIQUIDATABLE
        } else {
            RISK_LEVEL_CRITICAL
        }
    }

    /// Check if account can open a new position
    /// Returns true if margin ratio after trade would be >= Initial Margin
    public fun can_open_position(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        new_position_value: u64,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): bool {
        // Get current collateral value
        let collateral_value = unified_margin::calculate_collateral_value_usd(
            account,
            registry,
            nbtc_price,
        );

        // Get current position value
        let (current_position_value, _, _) = account_positions::get_total_position_value(
            positions,
            current_prices,
        );

        // Calculate new total position value
        let new_total_position = current_position_value + new_position_value;
        if (new_total_position == 0) {
            return true
        };

        // Check if margin ratio would be above Initial Margin
        let new_margin_ratio = ((collateral_value as u128) * (BASIS_POINTS as u128) / (new_total_position as u128)) as u64;
        new_margin_ratio >= INITIAL_MARGIN_BPS
    }

    /// Validate trade with Initial Margin requirement
    /// More strict than v0 - requires 10% margin ratio after trade
    public fun validate_trade_v1(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        trade_value: u64,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): bool {
        can_open_position(
            account,
            registry,
            positions,
            trade_value,
            current_prices,
            nbtc_price,
        )
    }

    // ===== V2 Risk Functions (NETH/NSOL collateral support) =====

    /// V2 calculate_risk_metrics — same as V1 but consults V2 collateral value
    /// (NUSDC + NBTC + NETH + NSOL with respective haircuts).
    public fun calculate_risk_metrics_v2(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
        neth_price: u64,
        nsol_price: u64,
    ): RiskMetrics {
        validate_prices_against_oracle(&current_prices, nbtc_price);

        let collateral_value = unified_margin::calculate_collateral_value_usd_v2(
            account,
            registry,
            nbtc_price,
            neth_price,
            nsol_price,
        );

        let (position_value, pnl_value, pnl_negative) = account_positions::get_total_position_value(
            positions,
            current_prices,
        );

        let margin_ratio = if (position_value == 0) {
            MAX_MARGIN_RATIO
        } else {
            ((collateral_value as u128) * (BASIS_POINTS as u128) / (position_value as u128)) as u64
        };

        let required_margin = (position_value * INITIAL_MARGIN_BPS) / BASIS_POINTS;
        let free_collateral = if (collateral_value > required_margin) {
            collateral_value - required_margin
        } else { 0 };

        let risk_level = get_risk_level(margin_ratio);
        let is_liquidatable = risk_level >= RISK_LEVEL_LIQUIDATABLE;

        RiskMetrics {
            collateral_value,
            position_value,
            unrealized_pnl_value: pnl_value,
            unrealized_pnl_negative: pnl_negative,
            margin_ratio,
            free_collateral,
            risk_level,
            is_liquidatable,
        }
    }

    /// V2 can_open_position with NETH/NSOL collateral
    public fun can_open_position_v2(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        new_position_value: u64,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
        neth_price: u64,
        nsol_price: u64,
    ): bool {
        let collateral_value = unified_margin::calculate_collateral_value_usd_v2(
            account,
            registry,
            nbtc_price,
            neth_price,
            nsol_price,
        );

        let (current_position_value, _, _) = account_positions::get_total_position_value(
            positions,
            current_prices,
        );

        let new_total_position = current_position_value + new_position_value;
        if (new_total_position == 0) { return true };

        let new_margin_ratio = ((collateral_value as u128) * (BASIS_POINTS as u128) / (new_total_position as u128)) as u64;
        new_margin_ratio >= INITIAL_MARGIN_BPS
    }

    /// V2 validate_trade
    public fun validate_trade_v2(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        trade_value: u64,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
        neth_price: u64,
        nsol_price: u64,
    ): bool {
        can_open_position_v2(
            account, registry, positions, trade_value,
            current_prices, nbtc_price, neth_price, nsol_price,
        )
    }

    // ===== Price Validation =====

    /// Validate caller-provided prices against Oracle reference price.
    /// Currently BTC-only: each PriceInfo.price is compared against nbtc_price.
    /// Aborts if any price deviates more than MAX_PRICE_DEVIATION_BPS (5%).
    fun validate_prices_against_oracle(
        current_prices: &vector<PriceInfo>,
        oracle_nbtc_price: u64,
    ) {
        if (oracle_nbtc_price == 0) return; // Skip validation if Oracle unavailable

        let len = vector::length(current_prices);
        let mut i = 0;
        while (i < len) {
            let info = vector::borrow(current_prices, i);
            let caller_price = account_positions::get_price_info_price(info);
            if (caller_price > 0) {
                // Check deviation: |caller - oracle| / oracle <= MAX_PRICE_DEVIATION_BPS / BPS
                let (higher, lower) = if (caller_price >= oracle_nbtc_price) {
                    (caller_price, oracle_nbtc_price)
                } else {
                    (oracle_nbtc_price, caller_price)
                };
                let diff = higher - lower;
                // diff * BPS / oracle_price > MAX_PRICE_DEVIATION_BPS means too much deviation
                let deviation_bps = ((diff as u128) * (BASIS_POINTS as u128) / (oracle_nbtc_price as u128)) as u64;
                assert!(deviation_bps <= MAX_PRICE_DEVIATION_BPS, EPriceDeviationTooLarge);
            };
            i = i + 1;
        };
    }

    // ===== Legacy v0 Functions (for backward compatibility) =====

    /// Check if account can afford a trade (simple balance check)
    /// @deprecated Use validate_trade_v1 for proper margin validation
    public fun can_afford(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        unified_margin::get_available_margin(account) >= trade_value
    }

    /// Validate trade with 10% buffer requirement
    /// @deprecated Use validate_trade_v1 for proper margin validation
    public fun validate_trade(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        if (trade_value == 0) {
            return true
        };

        let available = unified_margin::get_available_margin(account);
        let required = (trade_value * BUFFER_PERCENTAGE) / 100;

        available >= required
    }

    /// Get current margin level
    /// @deprecated Use calculate_risk_metrics for comprehensive risk assessment
    public fun get_margin_level(_account: &MarginAccount): u128 {
        // v0 compatibility: Returns max when no positions tracked
        (MAX_MARGIN_RATIO as u128)
    }

    /// Check if margin level is healthy
    /// @deprecated Use calculate_risk_metrics for comprehensive risk assessment
    public fun is_margin_healthy(_account: &MarginAccount): bool {
        true
    }

    /// Get required margin for a trade value (with buffer)
    public fun get_required_margin(trade_value: u64): u64 {
        (trade_value * BUFFER_PERCENTAGE) / 100
    }

    // ===== Getter Functions =====

    /// Get Initial Margin requirement in basis points
    public fun get_initial_margin_bps(): u64 {
        INITIAL_MARGIN_BPS
    }

    /// Get Warning threshold in basis points
    public fun get_warning_threshold_bps(): u64 {
        WARNING_THRESHOLD_BPS
    }

    /// Get Maintenance Margin requirement in basis points
    public fun get_maintenance_margin_bps(): u64 {
        MAINTENANCE_MARGIN_BPS
    }

    /// Get Forced Liquidation threshold in basis points
    public fun get_forced_liquidation_bps(): u64 {
        FORCED_LIQUIDATION_BPS
    }

    /// Get buffer percentage (legacy)
    public fun get_buffer_percentage(): u64 {
        BUFFER_PERCENTAGE
    }

    /// Get basis points constant
    public fun get_basis_points(): u128 {
        (BASIS_POINTS as u128)
    }

    // ===== RiskMetrics Accessors =====

    public fun get_collateral_value(metrics: &RiskMetrics): u64 {
        metrics.collateral_value
    }

    public fun get_position_value(metrics: &RiskMetrics): u64 {
        metrics.position_value
    }

    public fun get_unrealized_pnl(metrics: &RiskMetrics): (u64, bool) {
        (metrics.unrealized_pnl_value, metrics.unrealized_pnl_negative)
    }

    public fun get_margin_ratio(metrics: &RiskMetrics): u64 {
        metrics.margin_ratio
    }

    public fun get_free_collateral(metrics: &RiskMetrics): u64 {
        metrics.free_collateral
    }

    public fun get_metrics_risk_level(metrics: &RiskMetrics): u8 {
        metrics.risk_level
    }

    public fun is_account_liquidatable(metrics: &RiskMetrics): bool {
        metrics.is_liquidatable
    }

    // ===== Test Functions =====

    #[test_only]
    public fun test_validate_trade(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        validate_trade(account, trade_value)
    }

    #[test_only]
    public fun test_get_risk_level(margin_ratio: u64): u8 {
        get_risk_level(margin_ratio)
    }

    // ===== Unit Tests =====

    #[test]
    fun test_deviation_within_bound() {
        // Oracle price: 10000, caller price: 10400 (4% deviation, within 5%)
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 10400
        )];
        validate_prices_against_oracle(&prices, 10000);
        // Should not abort
    }

    #[test]
    #[expected_failure(abort_code = EPriceDeviationTooLarge)]
    fun test_deviation_exceeds_bound() {
        // Oracle price: 10000, caller price: 10600 (6% deviation, exceeds 5%)
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 10600
        )];
        validate_prices_against_oracle(&prices, 10000);
    }

    #[test]
    fun test_deviation_oracle_zero_skipped() {
        // Oracle price = 0: skip validation (no reference price)
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 99999
        )];
        validate_prices_against_oracle(&prices, 0);
        // Should not abort
    }

    #[test]
    fun test_deviation_caller_zero_skipped() {
        // Caller price = 0: skip this entry (no trade on this pool)
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 0
        )];
        validate_prices_against_oracle(&prices, 10000);
        // Should not abort
    }

    #[test]
    fun test_deviation_exact_boundary() {
        // Exactly 5% deviation (500 bps): should pass
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 10500
        )];
        validate_prices_against_oracle(&prices, 10000);
        // 500/10000 * 10000 = 500 bps = MAX, should pass
    }

    #[test]
    #[expected_failure(abort_code = EPriceDeviationTooLarge)]
    fun test_deviation_just_over_boundary() {
        // 5.01% deviation: should fail
        let prices = vector[account_positions::create_price_info(
            object::id_from_address(@0x1), 10501
        )];
        validate_prices_against_oracle(&prices, 10000);
    }

    #[test]
    fun test_risk_level_healthy() {
        assert!(get_risk_level(1000) == 0); // 10% = IM, healthy
        assert!(get_risk_level(2000) == 0); // 20% = above IM
    }

    #[test]
    fun test_risk_level_warning() {
        assert!(get_risk_level(799) == 1); // Below 8%, warning
        assert!(get_risk_level(500) == 1); // At 5%, warning (not yet liquidatable)
    }

    #[test]
    fun test_risk_level_liquidatable() {
        assert!(get_risk_level(499) == 2); // Below 5%, liquidatable
        assert!(get_risk_level(300) == 2); // At 3%
    }

    #[test]
    fun test_risk_level_critical() {
        assert!(get_risk_level(299) == 3); // Below 3%, critical
        assert!(get_risk_level(0) == 3);   // 0% = critical
    }
}
