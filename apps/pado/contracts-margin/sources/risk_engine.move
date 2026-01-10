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
    /// @param nbtc_price - Current NBTC price in USD (8 decimals)
    public fun calculate_risk_metrics(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): RiskMetrics {
        // Get collateral value (with haircuts applied)
        let collateral_value = unified_margin::calculate_collateral_value_usd(
            account,
            registry,
            nbtc_price,
        );

        // Get position value and unrealized PnL
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
}
