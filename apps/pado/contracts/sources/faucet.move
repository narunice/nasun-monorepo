/// Token Faucet for Pado Testnet
/// Allows anyone to get test tokens for trading
/// TreasuryCaps are stored in shared objects for public access
#[allow(lint(self_transfer))]
module pado::faucet {
    use sui::coin::{Self, TreasuryCap};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use pado::nbtc::NBTC;
    use pado::nusdc::NUSDC;

    // Faucet amounts
    const NBTC_FAUCET_AMOUNT: u64 = 100_000_000; // 1 NBTC (8 decimals)
    const NUSDC_FAUCET_AMOUNT: u64 = 100_000_000_000; // 100,000 NUSDC (6 decimals)

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
            (current_epoch + 1) * RESET_INTERVAL_MS - now
        }
    }

    // =========================================
    // Internal functions
    // =========================================

    /// Check cooldown and update last claim time
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
}
