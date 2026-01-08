/// Risk Engine v0
///
/// Minimal risk validation for Pado Balance usage
/// "Validate before trade, protect the margin"
///
/// v0: Basic balance validation with buffer
/// v0.5: Integration with use_margin() and locked margin
/// v1: Full risk metrics, maintenance margin, liquidation triggers
///
/// ⛔ v0 Explicit Non-Goals:
/// - Liquidation logic
/// - Cross-position margin netting
/// - Volatility-based haircut
/// - Oracle confidence band usage
/// - Real-time margin call notifications
module unified_margin::risk_engine {
    use unified_margin::unified_margin::{MarginAccount, get_available_margin};

    // ===== Constants =====

    /// 10% buffer requirement (110 = 110%)
    const BUFFER_PERCENTAGE: u64 = 110;
    /// Basis points (10000 = 100%)
    const BASIS_POINTS: u128 = 10000;
    /// Maximum margin level (when no positions)
    const MAX_MARGIN_LEVEL: u128 = 1000000; // 10000% = max safe

    // ===== Error Codes =====

    const EInsufficientMargin: u64 = 100;
    const EZeroTradeValue: u64 = 101;

    // ===== Public Functions =====

    /// Check if account can afford a trade (simple balance check)
    /// Returns true if available_margin >= trade_value
    public fun can_afford(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        get_available_margin(account) >= trade_value
    }

    /// Validate trade with 10% buffer requirement
    /// Returns true if available_margin >= trade_value * 1.10
    ///
    /// Example: For a $100 trade, account needs at least $110 available
    public fun validate_trade(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        if (trade_value == 0) {
            return true
        };

        let available = get_available_margin(account);
        let required = (trade_value * BUFFER_PERCENTAGE) / 100;

        available >= required
    }

    /// Get current margin level as basis points
    ///
    /// v0 Implementation: Always returns MAX_MARGIN_LEVEL since no positions exist
    /// v0.5: Will calculate (available_margin / position_value) * 10000
    ///
    /// Examples:
    /// - 10000 = 100% (break-even)
    /// - 15000 = 150% (healthy)
    /// - 5000 = 50% (danger zone, would trigger liquidation in v1)
    public fun get_margin_level(_account: &MarginAccount): u128 {
        // v0: No positions, so margin level is always max (fully safe)
        // v0.5: Will calculate based on locked margin and position values
        MAX_MARGIN_LEVEL
    }

    /// Check if margin level is healthy (above 110% in v0.5+)
    /// v0: Always returns true since no positions exist
    public fun is_margin_healthy(_account: &MarginAccount): bool {
        // v0: Always healthy (no positions to be underwater)
        true
    }

    /// Get required margin for a trade value (with buffer)
    /// Returns the minimum balance needed to execute a trade
    public fun get_required_margin(trade_value: u64): u64 {
        (trade_value * BUFFER_PERCENTAGE) / 100
    }

    // ===== View Functions =====

    /// Get buffer percentage (for UI display)
    public fun get_buffer_percentage(): u64 {
        BUFFER_PERCENTAGE
    }

    /// Get basis points constant
    public fun get_basis_points(): u128 {
        BASIS_POINTS
    }

    // ===== Future: v0.5 Integration Points =====
    //
    // When use_margin() and lock_margin() are implemented:
    //
    // /// Get margin utilization rate
    // public fun get_utilization_rate(account: &MarginAccount): u128 {
    //     let total = get_balance(account);
    //     let locked = get_locked_margin(account);
    //     if (total == 0) { return 0 };
    //     ((locked as u128) * BASIS_POINTS) / (total as u128)
    // }
    //
    // /// Calculate margin level with position value from Oracle
    // public fun calculate_margin_level(
    //     account: &MarginAccount,
    //     position_value: u64,
    // ): u128 {
    //     let available = get_available_margin(account);
    //     if (position_value == 0) { return MAX_MARGIN_LEVEL };
    //     ((available as u128) * BASIS_POINTS) / (position_value as u128)
    // }

    // ===== Test Functions =====
    #[test_only]
    public fun test_validate_trade(
        account: &MarginAccount,
        trade_value: u64
    ): bool {
        validate_trade(account, trade_value)
    }
}
