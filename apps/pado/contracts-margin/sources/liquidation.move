/// Liquidation Engine
///
/// Handles partial liquidation of undercollateralized margin accounts
/// "Protect the protocol, reward the liquidators"
///
/// Features:
/// - Partial liquidation (max 50% per call)
/// - Liquidation bonus (5% to liquidator)
/// - Tiered thresholds (5% MM, 3% Forced)
/// - Event emission for transparency
///
/// @version 1.0.0 (Phase 16.4)
module unified_margin::liquidation {
    use sui::event;
    use unified_margin::unified_margin::{Self, MarginAccount, MarginRegistry};
    use unified_margin::account_positions::{AccountPositions, PriceInfo};
    use unified_margin::risk_engine;

    // ===== Error Codes =====

    const ENotLiquidatable: u64 = 300;
    const EInvalidLiquidationAmount: u64 = 301;
    const EExceedsMaxLiquidation: u64 = 302;
    const ESelfLiquidation: u64 = 303;
    const EInsufficientCollateral: u64 = 304;

    // ===== Constants =====

    /// Liquidation bonus in basis points (5%)
    const LIQUIDATION_BONUS_BPS: u64 = 500;

    /// Maximum liquidation ratio per call (50%)
    const MAX_LIQUIDATION_RATIO_BPS: u64 = 5000;

    /// Basis points denominator
    const BPS: u64 = 10000;

    /// Minimum liquidation amount in NUSDC (1 NUSDC = 1_000_000)
    const MIN_LIQUIDATION_AMOUNT: u64 = 1_000_000;

    // ===== Events =====

    /// Emitted when a liquidation occurs
    public struct LiquidationExecuted has copy, drop {
        /// The liquidated account
        account_id: ID,
        /// Account owner
        account_owner: address,
        /// Liquidator address
        liquidator: address,
        /// Amount of NUSDC liquidated
        nusdc_liquidated: u64,
        /// Amount of NBTC liquidated (raw, 8 decimals)
        nbtc_liquidated: u64,
        /// Bonus paid to liquidator in NUSDC
        bonus_nusdc: u64,
        /// Bonus paid to liquidator in NBTC
        bonus_nbtc: u64,
        /// Margin ratio before liquidation (basis points)
        margin_ratio_before: u64,
        /// Margin ratio after liquidation (basis points)
        margin_ratio_after: u64,
        /// Timestamp
        timestamp: u64,
    }

    /// Emitted when forced liquidation is triggered
    public struct ForcedLiquidationTriggered has copy, drop {
        account_id: ID,
        account_owner: address,
        margin_ratio: u64,
        timestamp: u64,
    }

    // ===== Public Functions =====

    /// Liquidate an undercollateralized account
    ///
    /// Anyone can call this function to liquidate an account below maintenance margin.
    /// The liquidator receives the liquidated collateral plus a bonus.
    ///
    /// @param account - The margin account to liquidate
    /// @param registry - The margin registry
    /// @param positions - The account's positions
    /// @param current_prices - Current market prices for position valuation
    /// @param nbtc_price - Current NBTC price in USD (8 decimals)
    /// @param liquidation_amount_usd - Amount to liquidate in USD (6 decimals)
    /// @param clock - Clock for timestamp
    /// @param ctx - Transaction context
    public fun liquidate(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
        liquidation_amount_usd: u64,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext,
    ) {
        let liquidator = tx_context::sender(ctx);
        let account_owner = unified_margin::get_owner(account);

        // Prevent self-liquidation
        assert!(liquidator != account_owner, ESelfLiquidation);

        // Calculate risk metrics
        let metrics = risk_engine::calculate_risk_metrics(
            account,
            registry,
            positions,
            current_prices,
            nbtc_price,
        );

        // Check if account is liquidatable
        assert!(risk_engine::is_account_liquidatable(&metrics), ENotLiquidatable);

        // Validate liquidation amount
        assert!(liquidation_amount_usd >= MIN_LIQUIDATION_AMOUNT, EInvalidLiquidationAmount);

        // Calculate max liquidatable amount (50% of collateral value)
        let collateral_value = risk_engine::get_collateral_value(&metrics);
        let max_liquidation = (collateral_value * MAX_LIQUIDATION_RATIO_BPS) / BPS;
        assert!(liquidation_amount_usd <= max_liquidation, EExceedsMaxLiquidation);

        // Calculate bonus
        let bonus_amount = (liquidation_amount_usd * LIQUIDATION_BONUS_BPS) / BPS;
        let total_to_transfer = liquidation_amount_usd + bonus_amount;

        // Execute liquidation - take from NUSDC first, then NBTC
        let (nusdc_transferred, nbtc_transferred, bonus_nusdc, bonus_nbtc) =
            execute_liquidation_transfer(
                account,
                registry,
                total_to_transfer,
                bonus_amount,
                nbtc_price,
                ctx,
            );

        // Calculate new margin ratio
        let new_metrics = risk_engine::calculate_risk_metrics(
            account,
            registry,
            positions,
            current_prices,
            nbtc_price,
        );
        let new_margin_ratio = risk_engine::get_margin_ratio(&new_metrics);

        // Emit event
        let timestamp = sui::clock::timestamp_ms(clock);
        event::emit(LiquidationExecuted {
            account_id: object::id(account),
            account_owner,
            liquidator,
            nusdc_liquidated: nusdc_transferred - bonus_nusdc,
            nbtc_liquidated: nbtc_transferred - bonus_nbtc,
            bonus_nusdc,
            bonus_nbtc,
            margin_ratio_before: risk_engine::get_margin_ratio(&metrics),
            margin_ratio_after: new_margin_ratio,
            timestamp,
        });
    }

    /// Check if forced liquidation should be triggered (margin < 3%)
    /// Returns true if the account is in critical state
    public fun should_force_liquidate(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): bool {
        let metrics = risk_engine::calculate_risk_metrics(
            account,
            registry,
            positions,
            current_prices,
            nbtc_price,
        );
        risk_engine::get_metrics_risk_level(&metrics) >= 3 // RISK_LEVEL_CRITICAL
    }

    /// Emit forced liquidation event (for keeper monitoring)
    public fun emit_forced_liquidation_warning(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
        clock: &sui::clock::Clock,
    ) {
        let metrics = risk_engine::calculate_risk_metrics(
            account,
            registry,
            positions,
            current_prices,
            nbtc_price,
        );

        if (risk_engine::get_metrics_risk_level(&metrics) >= 3) {
            event::emit(ForcedLiquidationTriggered {
                account_id: object::id(account),
                account_owner: unified_margin::get_owner(account),
                margin_ratio: risk_engine::get_margin_ratio(&metrics),
                timestamp: sui::clock::timestamp_ms(clock),
            });
        }
    }

    // ===== View Functions =====

    /// Calculate maximum liquidatable amount for an account
    public fun get_max_liquidatable_amount(
        account: &MarginAccount,
        registry: &MarginRegistry,
        positions: &AccountPositions,
        current_prices: vector<PriceInfo>,
        nbtc_price: u64,
    ): u64 {
        let metrics = risk_engine::calculate_risk_metrics(
            account,
            registry,
            positions,
            current_prices,
            nbtc_price,
        );

        if (!risk_engine::is_account_liquidatable(&metrics)) {
            return 0
        };

        let collateral_value = risk_engine::get_collateral_value(&metrics);
        (collateral_value * MAX_LIQUIDATION_RATIO_BPS) / BPS
    }

    /// Calculate expected liquidation bonus
    public fun calculate_liquidation_bonus(liquidation_amount: u64): u64 {
        (liquidation_amount * LIQUIDATION_BONUS_BPS) / BPS
    }

    /// Get liquidation bonus rate in basis points
    public fun get_liquidation_bonus_bps(): u64 {
        LIQUIDATION_BONUS_BPS
    }

    /// Get max liquidation ratio in basis points
    public fun get_max_liquidation_ratio_bps(): u64 {
        MAX_LIQUIDATION_RATIO_BPS
    }

    /// Get minimum liquidation amount
    public fun get_min_liquidation_amount(): u64 {
        MIN_LIQUIDATION_AMOUNT
    }

    // ===== Internal Functions =====

    /// Execute the actual transfer of collateral from account to liquidator
    /// Returns (nusdc_transferred, nbtc_transferred, bonus_nusdc, bonus_nbtc)
    fun execute_liquidation_transfer(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        total_to_transfer_usd: u64,
        bonus_amount_usd: u64,
        nbtc_price: u64,
        ctx: &mut TxContext,
    ): (u64, u64, u64, u64) {
        let liquidator = tx_context::sender(ctx);
        let mut remaining = total_to_transfer_usd;
        let mut nusdc_transferred: u64 = 0;
        let mut nbtc_transferred: u64 = 0;

        // First, try to take from NUSDC balance
        let nusdc_balance = unified_margin::get_nusdc_balance(account);
        if (nusdc_balance > 0 && remaining > 0) {
            let nusdc_to_take = if (nusdc_balance >= remaining) {
                remaining
            } else {
                nusdc_balance
            };

            // Use internal transfer
            transfer_nusdc_from_account(account, registry, nusdc_to_take, liquidator, ctx);
            nusdc_transferred = nusdc_to_take;
            remaining = remaining - nusdc_to_take;
        };

        // If still remaining, take from NBTC balance
        if (remaining > 0) {
            let nbtc_balance = unified_margin::get_nbtc_balance(account);
            if (nbtc_balance > 0) {
                // Convert USD remaining to NBTC amount
                // remaining (6 decimals) * 10^8 * 100 / nbtc_price (8 decimals) = nbtc (8 decimals)
                let nbtc_to_take = ((remaining as u128) * 100_000_000 * 100 / (nbtc_price as u128)) as u64;
                let actual_nbtc = if (nbtc_to_take > nbtc_balance) {
                    nbtc_balance
                } else {
                    nbtc_to_take
                };

                if (actual_nbtc > 0) {
                    transfer_nbtc_from_account(account, registry, actual_nbtc, liquidator, ctx);
                    nbtc_transferred = actual_nbtc;
                }
            }
        };

        // Calculate bonus breakdown
        let total_transferred_usd = nusdc_transferred +
            (((nbtc_transferred as u128) * (nbtc_price as u128) / 100_000_000 / 100) as u64);

        let bonus_nusdc = if (total_transferred_usd > 0) {
            (nusdc_transferred * bonus_amount_usd) / total_transferred_usd
        } else {
            0
        };
        let bonus_nbtc = if (nbtc_transferred > 0) {
            (nbtc_transferred * bonus_amount_usd) / total_transferred_usd
        } else {
            0
        };

        (nusdc_transferred, nbtc_transferred, bonus_nusdc, bonus_nbtc)
    }

    /// Transfer NUSDC from margin account to liquidator
    /// Uses package-level privileged withdraw function
    fun transfer_nusdc_from_account(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nusdc_balance = unified_margin::get_nusdc_balance(account);
        assert!(nusdc_balance >= amount, EInsufficientCollateral);

        // Use package-level privileged withdraw
        unified_margin::liquidation_withdraw_nusdc(account, registry, amount, recipient, ctx);
    }

    /// Transfer NBTC from margin account to liquidator
    /// Uses package-level privileged withdraw function
    fun transfer_nbtc_from_account(
        account: &mut MarginAccount,
        registry: &mut MarginRegistry,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext,
    ) {
        let nbtc_balance = unified_margin::get_nbtc_balance(account);
        assert!(nbtc_balance >= amount, EInsufficientCollateral);

        // Use package-level privileged withdraw
        unified_margin::liquidation_withdraw_nbtc(account, registry, amount, recipient, ctx);
    }

    // ===== Test Functions =====

    #[test_only]
    public fun test_calculate_bonus(amount: u64): u64 {
        calculate_liquidation_bonus(amount)
    }

    #[test_only]
    public fun test_get_max_liquidation_ratio(): u64 {
        MAX_LIQUIDATION_RATIO_BPS
    }
}
