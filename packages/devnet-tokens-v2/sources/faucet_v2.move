/// Token Faucet V2 for NETH and NSOL
/// Allows anyone to get test NETH/NSOL tokens
module devnet_tokens_v2::faucet_v2 {
    use sui::coin::{Self, TreasuryCap};
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use devnet_tokens_v2::neth::NETH;
    use devnet_tokens_v2::nsol::NSOL;

    // Faucet amounts (reduced to prevent u64 supply overflow)
    const NETH_FAUCET_AMOUNT: u64 = 10_000_000; // 0.1 NETH (8 decimals)
    const NSOL_FAUCET_AMOUNT: u64 = 10_000_000_000;          // 10 NSOL (9 decimals)

    // Rate limiting
    const COOLDOWN_MS: u64 = 86400000; // 24 hours

    // Error codes
    const E_COOLDOWN_NOT_MET: u64 = 1;

    /// Shared faucet holding TreasuryCaps
    public struct TokenFaucetV2 has key {
        id: UID,
        neth_cap: TreasuryCap<NETH>,
        nsol_cap: TreasuryCap<NSOL>,
    }

    /// Claim record for rate limiting
    public struct ClaimRecordV2 has key {
        id: UID,
        last_claims: Table<address, u64>,
    }

    /// Create the shared faucet (one-time setup by TreasuryCap owner)
    public fun create_faucet(
        neth_cap: TreasuryCap<NETH>,
        nsol_cap: TreasuryCap<NSOL>,
        ctx: &mut TxContext
    ) {
        let faucet = TokenFaucetV2 {
            id: object::new(ctx),
            neth_cap,
            nsol_cap,
        };
        transfer::share_object(faucet);
    }

    /// Create shared claim record for rate limiting
    public fun create_claim_record(ctx: &mut TxContext) {
        let record = ClaimRecordV2 {
            id: object::new(ctx),
            last_claims: table::new(ctx),
        };
        transfer::share_object(record);
    }

    /// Request both NETH and NSOL with cooldown
    public fun request_tokens_with_cooldown(
        faucet: &mut TokenFaucetV2,
        record: &mut ClaimRecordV2,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();

        check_and_update_cooldown(record, sender, now);

        let neth_coin = coin::mint(&mut faucet.neth_cap, NETH_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(neth_coin, sender);

        let nsol_coin = coin::mint(&mut faucet.nsol_cap, NSOL_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nsol_coin, sender);
    }

    /// Request only NETH with cooldown
    public fun request_neth_with_cooldown(
        faucet: &mut TokenFaucetV2,
        record: &mut ClaimRecordV2,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();
        check_and_update_cooldown(record, sender, now);

        let coin = coin::mint(&mut faucet.neth_cap, NETH_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request only NSOL with cooldown
    public fun request_nsol_with_cooldown(
        faucet: &mut TokenFaucetV2,
        record: &mut ClaimRecordV2,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let now = clock.timestamp_ms();
        check_and_update_cooldown(record, sender, now);

        let coin = coin::mint(&mut faucet.nsol_cap, NSOL_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(coin, sender);
    }

    /// Request tokens without cooldown (legacy/admin use)
    public fun request_tokens(
        faucet: &mut TokenFaucetV2,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);

        let neth_coin = coin::mint(&mut faucet.neth_cap, NETH_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(neth_coin, sender);

        let nsol_coin = coin::mint(&mut faucet.nsol_cap, NSOL_FAUCET_AMOUNT, ctx);
        transfer::public_transfer(nsol_coin, sender);
    }

    /// Check remaining cooldown time (returns 0 if can claim)
    public fun get_remaining_cooldown(
        record: &ClaimRecordV2,
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

    fun check_and_update_cooldown(
        record: &mut ClaimRecordV2,
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
