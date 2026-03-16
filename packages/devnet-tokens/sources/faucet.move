/// Token Faucet for Nasun Devnet
/// Allows anyone to get test tokens for all apps (pado, baram, etc.)
/// TreasuryCaps are stored in shared objects for public access
module devnet_tokens::faucet {
    use sui::coin::{Self, TreasuryCap};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use devnet_tokens::nbtc::NBTC;
    use devnet_tokens::nusdc::NUSDC;

    // Faucet amounts
    const NBTC_FAUCET_AMOUNT: u64 = 10_000_000; // 0.1 NBTC (8 decimals)
    const NUSDC_FAUCET_AMOUNT: u64 = 10_000_000_000; // 10,000 NUSDC (6 decimals)

    // Rate limiting: daily reset at 00:00 UTC (09:00 KST)
    const RESET_INTERVAL_MS: u64 = 86_400_000; // 24 hours

    // Error codes
    const E_COOLDOWN_NOT_MET: u64 = 1;

    /// Shared faucet holding TreasuryCaps
    public struct TokenFaucet has key {
        id: UID,
        nbtc_cap: TreasuryCap<NBTC>,
        nusdc_cap: TreasuryCap<NUSDC>,
    }

    /// Claim record for rate limiting
    public struct ClaimRecord has key {
        id: UID,
        last_claims: Table<address, u64>,  // address -> last claim timestamp (ms)
    }

    /// Create the shared faucet (one-time setup by TreasuryCap owner)
    public fun create_faucet(
        nbtc_cap: TreasuryCap<NBTC>,
        nusdc_cap: TreasuryCap<NUSDC>,
        ctx: &mut TxContext
    ) {
        let faucet = TokenFaucet {
            id: object::new(ctx),
            nbtc_cap,
            nusdc_cap,
        };
        transfer::share_object(faucet);
    }

    /// Create shared claim record for rate limiting
    public fun create_claim_record(ctx: &mut TxContext) {
        let record = ClaimRecord {
            id: object::new(ctx),
            last_claims: table::new(ctx),
        };
        transfer::share_object(record);
    }

    // =========================================
    // Rate-limited functions (recommended)
    // =========================================

    /// Request test tokens with 24-hour cooldown
    public fun request_tokens_with_cooldown(
        faucet: &mut TokenFaucet,
        record: &mut ClaimRecord,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        // Check cooldown
        check_and_update_cooldown(record, sender, now);

        // Mint NBTC
        let nbtc_coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nbtc_coin, sender);

        // Mint NUSDC
        let nusdc_coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nusdc_coin, sender);
    }

    /// Request only NBTC with cooldown
    public fun request_nbtc_with_cooldown(
        faucet: &mut TokenFaucet,
        record: &mut ClaimRecord,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        check_and_update_cooldown(record, sender, now);

        let coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request only NUSDC with cooldown
    public fun request_nusdc_with_cooldown(
        faucet: &mut TokenFaucet,
        record: &mut ClaimRecord,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        check_and_update_cooldown(record, sender, now);

        let coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Check remaining cooldown time (returns 0 if can claim)
    /// Resets daily at 00:00 UTC (09:00 KST)
    public fun get_remaining_cooldown(
        record: &ClaimRecord,
        user: address,
        clock: &Clock
    ): u64 {
        if (!table::contains(&record.last_claims, user)) {
            return 0
        };

        let last_claim = *table::borrow(&record.last_claims, user);
        let now = clock.timestamp_ms();
        let current_epoch = now / RESET_INTERVAL_MS;
        let last_epoch = last_claim / RESET_INTERVAL_MS;

        if (current_epoch > last_epoch) {
            0
        } else {
            // Time until next reset boundary
            (current_epoch + 1) * RESET_INTERVAL_MS - now
        }
    }

    // =========================================
    // Per-token rate-limited functions (V2)
    // Each token has independent 24h cooldown
    // =========================================

    /// Per-token claim record with independent cooldown per token type
    public struct PerTokenClaimRecord has key {
        id: UID,
        nbtc_claims: Table<address, u64>,
        nusdc_claims: Table<address, u64>,
    }

    /// Create shared per-token claim record (call once after upgrade)
    public fun create_per_token_claim_record(ctx: &mut TxContext) {
        let record = PerTokenClaimRecord {
            id: object::new(ctx),
            nbtc_claims: table::new(ctx),
            nusdc_claims: table::new(ctx),
        };
        transfer::share_object(record);
    }

    /// Request NBTC with independent 24h cooldown (does NOT affect NUSDC cooldown)
    public fun request_nbtc_individual(
        faucet: &mut TokenFaucet,
        record: &mut PerTokenClaimRecord,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        check_and_update_per_token_cooldown(&mut record.nbtc_claims, sender, now);

        let coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request NUSDC with independent 24h cooldown (does NOT affect NBTC cooldown)
    public fun request_nusdc_individual(
        faucet: &mut TokenFaucet,
        record: &mut PerTokenClaimRecord,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        check_and_update_per_token_cooldown(&mut record.nusdc_claims, sender, now);

        let coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Check remaining NBTC cooldown (returns 0 if can claim)
    public fun get_nbtc_remaining_cooldown(
        record: &PerTokenClaimRecord,
        user: address,
        clock: &Clock
    ): u64 {
        get_per_token_remaining_cooldown(&record.nbtc_claims, user, clock)
    }

    /// Check remaining NUSDC cooldown (returns 0 if can claim)
    public fun get_nusdc_remaining_cooldown(
        record: &PerTokenClaimRecord,
        user: address,
        clock: &Clock
    ): u64 {
        get_per_token_remaining_cooldown(&record.nusdc_claims, user, clock)
    }

    // =========================================
    // Legacy functions (no rate limiting)
    // Kept for backward compatibility and bot usage
    // =========================================

    /// Request test tokens (anyone can call) - LEGACY, no rate limiting
    public fun request_tokens(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        // Mint NBTC
        let nbtc_coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nbtc_coin, sender);

        // Mint NUSDC
        let nusdc_coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nusdc_coin, sender);
    }

    /// Request only NBTC - LEGACY, no rate limiting
    public fun request_nbtc(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let coin = coin::mint(&mut faucet.nbtc_cap, NBTC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request only NUSDC - LEGACY, no rate limiting
    public fun request_nusdc(
        faucet: &mut TokenFaucet,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let coin = coin::mint(&mut faucet.nusdc_cap, NUSDC_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    // =========================================
    // Internal functions
    // =========================================

    /// Check cooldown and update last claim time (shared ClaimRecord)
    /// Uses epoch-based daily reset at 00:00 UTC (09:00 KST)
    fun check_and_update_cooldown(
        record: &mut ClaimRecord,
        sender: address,
        now: u64
    ) {
        let current_epoch = now / RESET_INTERVAL_MS;
        if (table::contains(&record.last_claims, sender)) {
            let last_claim = *table::borrow(&record.last_claims, sender);
            let last_epoch = last_claim / RESET_INTERVAL_MS;
            assert!(current_epoch > last_epoch, E_COOLDOWN_NOT_MET);
            *table::borrow_mut(&mut record.last_claims, sender) = now;
        } else {
            table::add(&mut record.last_claims, sender, now);
        };
    }

    /// Check cooldown and update last claim time (per-token table)
    /// Uses epoch-based daily reset at 00:00 UTC (09:00 KST)
    fun check_and_update_per_token_cooldown(
        claims: &mut Table<address, u64>,
        sender: address,
        now: u64
    ) {
        let current_epoch = now / RESET_INTERVAL_MS;
        if (table::contains(claims, sender)) {
            let last_claim = *table::borrow(claims, sender);
            let last_epoch = last_claim / RESET_INTERVAL_MS;
            assert!(current_epoch > last_epoch, E_COOLDOWN_NOT_MET);
            *table::borrow_mut(claims, sender) = now;
        } else {
            table::add(claims, sender, now);
        };
    }

    /// Get remaining cooldown for a per-token claim table
    fun get_per_token_remaining_cooldown(
        claims: &Table<address, u64>,
        user: address,
        clock: &Clock
    ): u64 {
        if (!table::contains(claims, user)) {
            return 0
        };

        let last_claim = *table::borrow(claims, user);
        let now = clock.timestamp_ms();
        let current_epoch = now / RESET_INTERVAL_MS;
        let last_epoch = last_claim / RESET_INTERVAL_MS;

        if (current_epoch > last_epoch) {
            0
        } else {
            (current_epoch + 1) * RESET_INTERVAL_MS - now
        }
    }
}
