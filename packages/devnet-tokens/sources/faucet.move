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
    const NBTC_FAUCET_AMOUNT: u64 = 100_000_000; // 1 NBTC (8 decimals)
    const NUSDC_FAUCET_AMOUNT: u64 = 100_000_000_000; // 100,000 NUSDC (6 decimals)

    // Rate limiting
    const COOLDOWN_MS: u64 = 86400000; // 24 hours in milliseconds

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
        let elapsed = now - last_claim;

        if (elapsed >= COOLDOWN_MS) {
            0
        } else {
            COOLDOWN_MS - elapsed
        }
    }

    // =========================================
    // Legacy functions (no rate limiting)
    // Kept for backward compatibility
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

    /// Check cooldown and update last claim time
    fun check_and_update_cooldown(
        record: &mut ClaimRecord,
        sender: address,
        now: u64
    ) {
        if (table::contains(&record.last_claims, sender)) {
            let last_claim = *table::borrow(&record.last_claims, sender);
            assert!(now - last_claim >= COOLDOWN_MS, E_COOLDOWN_NOT_MET);
            *table::borrow_mut(&mut record.last_claims, sender) = now;
        } else {
            table::add(&mut record.last_claims, sender, now);
        };
    }
}
