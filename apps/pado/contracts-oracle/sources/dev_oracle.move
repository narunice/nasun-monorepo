/// DevOracle - Admin Oracle for Nasun Devnet
///
/// Purpose: Provide price feeds for Risk Engine, Perp Market, and Unified Margin
/// on Nasun Devnet where Switchboard/Pyth are not available.
///
/// Mainnet Strategy: Replace with PythOracleClient via interface abstraction.
///
/// @author Pado Team
/// @version 0.1.0
module pado_oracle::dev_oracle {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::clock::{Self, Clock};
    use sui::transfer;
    use sui::table::{Self, Table};

    // ========================================
    // Constants - Symbol IDs
    // ========================================

    const BTCUSD: u64 = 1;
    const ETHUSD: u64 = 2;
    const NASUSD: u64 = 3;

    /// Price decimals (Pyth standard)
    const DECIMALS: u8 = 8;

    // ========================================
    // Error Codes
    // ========================================

    const E_NOT_ADMIN: u64 = 1;
    const E_PRICE_STALE: u64 = 2;
    const E_FEED_NOT_FOUND: u64 = 3;
    const E_VECTOR_LENGTH_MISMATCH: u64 = 4;

    // ========================================
    // Structs
    // ========================================

    /// Admin capability - only holder can update prices
    public struct AdminCap has key, store {
        id: UID
    }

    /// Shared oracle registry containing all price feeds
    public struct OracleRegistry has key {
        id: UID,
        feeds: Table<u64, PriceFeed>,
    }

    /// Individual price feed data
    public struct PriceFeed has store {
        price: u128,       // 8 decimals (e.g., 9500000000000 = $95,000.00)
        confidence: u128,  // Price confidence interval (±)
        timestamp: u64,    // Milliseconds
    }

    // ========================================
    // Init - Called on package publish
    // ========================================

    fun init(ctx: &mut TxContext) {
        // Create and transfer AdminCap to deployer
        let admin = AdminCap { id: object::new(ctx) };
        transfer::transfer(admin, tx_context::sender(ctx));

        // Create shared OracleRegistry
        let registry = OracleRegistry {
            id: object::new(ctx),
            feeds: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ========================================
    // Admin Functions
    // ========================================

    /// Update a single price feed
    /// Requires AdminCap ownership (implicit authorization via &AdminCap)
    public entry fun update_price(
        _admin: &AdminCap,
        registry: &mut OracleRegistry,
        symbol: u64,
        price: u128,
        confidence: u128,
        clock: &Clock,
    ) {
        let ts = clock::timestamp_ms(clock);

        if (table::contains(&registry.feeds, symbol)) {
            let feed = table::borrow_mut(&mut registry.feeds, symbol);
            feed.price = price;
            feed.confidence = confidence;
            feed.timestamp = ts;
        } else {
            table::add(&mut registry.feeds, symbol, PriceFeed {
                price,
                confidence,
                timestamp: ts,
            });
        }
    }

    /// Batch update multiple prices in one transaction (gas efficient)
    public entry fun batch_update(
        admin: &AdminCap,
        registry: &mut OracleRegistry,
        symbols: vector<u64>,
        prices: vector<u128>,
        confidences: vector<u128>,
        clock: &Clock,
    ) {
        let len = vector::length(&symbols);
        assert!(vector::length(&prices) == len, E_VECTOR_LENGTH_MISMATCH);
        assert!(vector::length(&confidences) == len, E_VECTOR_LENGTH_MISMATCH);

        let mut i = 0;
        while (i < len) {
            update_price(
                admin,
                registry,
                *vector::borrow(&symbols, i),
                *vector::borrow(&prices, i),
                *vector::borrow(&confidences, i),
                clock
            );
            i = i + 1;
        }
    }

    // ========================================
    // Public Read Functions (for Risk Engine)
    // ========================================

    /// Get price data for a symbol
    /// Returns: (price, confidence, timestamp)
    public fun get_price(
        registry: &OracleRegistry,
        symbol: u64
    ): (u128, u128, u64) {
        assert!(table::contains(&registry.feeds, symbol), E_FEED_NOT_FOUND);
        let feed = table::borrow(&registry.feeds, symbol);
        (feed.price, feed.confidence, feed.timestamp)
    }

    /// Check if price feed is fresh (within max_age_ms)
    public fun is_fresh(
        registry: &OracleRegistry,
        symbol: u64,
        max_age_ms: u64,
        clock: &Clock
    ): bool {
        if (!table::contains(&registry.feeds, symbol)) {
            return false
        };
        let feed = table::borrow(&registry.feeds, symbol);
        clock::timestamp_ms(clock) - feed.timestamp <= max_age_ms
    }

    /// Get price with freshness check in one call (optimized for Risk Engine)
    /// Returns: (price, confidence, is_fresh)
    public fun get_price_if_fresh(
        registry: &OracleRegistry,
        symbol: u64,
        max_age_ms: u64,
        clock: &Clock
    ): (u128, u128, bool) {
        assert!(table::contains(&registry.feeds, symbol), E_FEED_NOT_FOUND);
        let feed = table::borrow(&registry.feeds, symbol);
        let is_valid = clock::timestamp_ms(clock) - feed.timestamp <= max_age_ms;
        (feed.price, feed.confidence, is_valid)
    }

    /// Check if a symbol exists in the registry
    public fun has_feed(registry: &OracleRegistry, symbol: u64): bool {
        table::contains(&registry.feeds, symbol)
    }

    // ========================================
    // Helper Constants (for external modules)
    // ========================================

    public fun btcusd(): u64 { BTCUSD }
    public fun ethusd(): u64 { ETHUSD }
    public fun nasusd(): u64 { NASUSD }
    public fun decimals(): u8 { DECIMALS }

    // ========================================
    // Test-only Functions
    // ========================================

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
