/// GoStop Instant Scratch Card Module
///
/// Buy one or up to 10 cards at once; each card produces an instant
/// provably-fair outcome via sui::random. Shares liquidity with the gostop
/// BankrollPool via the standard Registry + GameCap pattern (same as
/// contracts-lottery): all bet collection and prize payouts flow through
/// BankrollPool, and every resolved card emits the standardized GameResult
/// event for cross-game leaderboard aggregation.
///
/// Security notes:
/// - Buy functions are `entry` (not `public entry`). sui::random guidance
///   forbids `public entry` for random-consuming functions (composition
///   attack surface).
/// - All pre-random assertions happen before random consumption. After the
///   first `generate_*` call we do not abort, to avoid selective reveal.
/// - Bulk variant runs a pre-loop solvency check so the last card cannot
///   abort mid-loop and revert the prior cards.
/// - NFT is minted only for winning cards; losers only emit the event
///   (devnet object-bloat reduction).
#[allow(unused_const)]
module gostop_scratchcard::scratchcard {
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap};

    // ===== Constants =====

    const CARD_PRICE: u64 = 5_000_000;            // 5 NUSDC (6 decimals)
    const MAX_MULTIPLIER: u64 = 100;               // 100x max
    const MAX_PRIZE: u64 = 500_000_000;            // 500 NUSDC = CARD_PRICE * MAX_MULTIPLIER

    const MAX_BULK_COUNT: u8 = 10;

    /// Safety margin kept on top of the worst-case bulk payout when checking
    /// pool solvency (10 cards × MAX_PRIZE = 5000 NUSDC). BankrollPool
    /// already enforces its own MIN_POOL_BALANCE (100 NUSDC) inside
    /// `pay_winner`; we add this buffer so pay_winner cannot abort mid-loop
    /// if a concurrent tx moves the pool close to the minimum between our
    /// pre-check and the first per-card payout.
    const BULK_POOL_BUFFER: u64 = 500_000_000;    // 500 NUSDC

    // Prize table thresholds (descending check on u16 range 0-9999)
    // Contiguous ranges, no gaps. Unchanged from Pado's scratch card:
    // RTP 82%, house edge 18%.
    const THRESHOLD_100X: u16 = 9995;
    const THRESHOLD_50X: u16  = 9980;
    const THRESHOLD_20X: u16  = 9900;
    const THRESHOLD_10X: u16  = 9750;
    const THRESHOLD_5X: u16   = 9450;
    const THRESHOLD_2X: u16   = 9050;
    const THRESHOLD_1X: u16   = 7500;
    // 0-7499: lose (0x)

    /// game_id assigned by BankrollPool for scratch card. Must match the
    /// value used in `bankroll_pool::issue_game_cap` at bootstrap.
    const GAME_ID_SELF: u8 = 2;

    // ===== Error Codes =====

    const EInvalidCount: u64 = 0;
    const EInsufficientPayment: u64 = 1;
    const EInsufficientBankroll: u64 = 2;
    const EGameCapAlreadyInstalled: u64 = 3;
    const EGameCapNotInstalled: u64 = 4;
    const EGameCapMismatch: u64 = 5;

    // ===== Structs =====

    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry holding the installed GameCap. One-time install
    /// mirrors the Lottery pattern: deployer calls `issue_game_cap` in
    /// bankroll_pool, then `install_game_cap` here.
    public struct ScratchCardRegistry has key {
        id: UID,
        /// Installed at bootstrap; borrowed by each buy call. Never moved
        /// out after install, so user-signed txs can only access it via
        /// immutable reference.
        game_cap: Option<GameCap>,
        next_card_id: u64,
        total_cards_sold: u64,
        total_prizes_paid: u64,
    }

    /// Winner scratch card NFT (only created for winners).
    public struct ScratchCard has key, store {
        id: UID,
        card_id: u64,
        purchase_time: u64,
        multiplier: u64,
        prize_amount: u64,
    }

    // ===== Events =====

    /// Emitted for every resolved card (win AND loss) so the frontend can
    /// render bulk results without a follow-up query. `card_nft_id` is
    /// Some only for winners.
    public struct ScratchCardPurchased has copy, drop {
        card_id: u64,
        card_nft_id: Option<ID>,
        buyer: address,
        multiplier: u64,
        prize_amount: u64,
        bulk_index: u8,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
        transfer::share_object(ScratchCardRegistry {
            id: object::new(ctx),
            game_cap: option::none(),
            next_card_id: 0,
            total_cards_sold: 0,
            total_prizes_paid: 0,
        });
    }

    // ===== Admin =====

    /// One-time install of the bankroll_pool GameCap issued to scratch card.
    /// Matches LotteryRegistry::install_game_cap. After install, the cap is
    /// borrowed (not owned) by each buy call — there is no uninstall.
    public entry fun install_game_cap(
        _admin: &AdminCap,
        registry: &mut ScratchCardRegistry,
        cap: GameCap,
    ) {
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    // ===== Core: Buy (single) =====

    /// Single-card buy. Equivalent to `buy_scratch_cards_bulk` with count=1,
    /// but kept as a separate entry so the UI single-card path skips the
    /// extra bulk-count validation and slightly smaller PTB.
    ///
    /// entry-only (not `public entry`) because `&Random` is consumed.
    entry fun buy_scratch_card(
        registry: &mut ScratchCardRegistry,
        pool: &mut BankrollPool,
        payment: Coin<NUSDC>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        buy_internal(registry, pool, payment, 1, r, clock, ctx);
    }

    // ===== Core: Buy (bulk) =====

    /// Bulk buy up to 10 cards in a single call. Must be non-public entry
    /// because `&Random` is consumed; the internal loop avoids the PTB
    /// composition restriction that would otherwise prevent buying
    /// multiple cards per transaction.
    entry fun buy_scratch_cards_bulk(
        registry: &mut ScratchCardRegistry,
        pool: &mut BankrollPool,
        payment: Coin<NUSDC>,
        count: u8,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(count >= 1 && count <= MAX_BULK_COUNT, EInvalidCount);
        buy_internal(registry, pool, payment, count, r, clock, ctx);
    }

    // ===== Internal =====

    fun buy_internal(
        registry: &mut ScratchCardRegistry,
        pool: &mut BankrollPool,
        payment: Coin<NUSDC>,
        count: u8,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&registry.game_cap), EGameCapNotInstalled);

        // ===== Phase 1: Pre-random assertions =====
        let required_payment = CARD_PRICE * (count as u64);
        assert!(coin::value(&payment) == required_payment, EInsufficientPayment);

        // Solvency pre-check: the bulk path must guarantee all per-card
        // payouts can succeed before consuming random. BankrollPool's own
        // `pay_winner` also enforces MIN_POOL_BALANCE, but a pre-check here
        // lets us fail fast (no random consumed, no partial state) on the
        // degenerate all-100x case. Worst case = count * MAX_PRIZE.
        let worst_case_payout = MAX_PRIZE * (count as u64);
        assert!(
            bankroll_pool::pool_balance(pool) >= worst_case_payout + BULK_POOL_BUFFER,
            EInsufficientBankroll,
        );

        let cap = option::borrow(&registry.game_cap);
        let sender = tx_context::sender(ctx);

        // Collect the entire bulk payment in one go (analytics attribute
        // the full amount to a single tx).
        bankroll_pool::collect_bet(pool, cap, payment, sender, clock);

        // ===== Phase 2: Random consumption (no abort past this point) =====
        let mut g = random::new_generator(r, ctx);
        let now = clock::timestamp_ms(clock);

        let mut i: u8 = 0;
        while (i < count) {
            let roll = random::generate_u16_in_range(&mut g, 0, 9999);
            let multiplier = get_multiplier(roll);
            let prize = CARD_PRICE * multiplier;

            let card_id = registry.next_card_id;
            registry.next_card_id = registry.next_card_id + 1;
            registry.total_cards_sold = registry.total_cards_sold + 1;

            let card_nft_id: Option<ID> = if (multiplier > 0) {
                // Winner: pay prize + mint NFT.
                let prize_coin = bankroll_pool::pay_winner(
                    pool,
                    cap,
                    prize,
                    sender,
                    clock,
                    ctx,
                );
                transfer::public_transfer(prize_coin, sender);
                registry.total_prizes_paid = registry.total_prizes_paid + prize;

                let card = ScratchCard {
                    id: object::new(ctx),
                    card_id,
                    purchase_time: now,
                    multiplier,
                    prize_amount: prize,
                };
                let nft_id = object::id(&card);
                transfer::public_transfer(card, sender);
                option::some(nft_id)
            } else {
                option::none()
            };

            // Standardized cross-game result (leaderboard feed). session_id
            // encodes the unique per-card id so off-chain consumers can
            // de-dupe within a bulk transaction.
            let sid = sui::bcs::to_bytes(&card_id);
            bankroll_pool::emit_game_result(
                cap,
                sender,
                CARD_PRICE,
                prize,
                sid,
                clock,
            );

            event::emit(ScratchCardPurchased {
                card_id,
                card_nft_id,
                buyer: sender,
                multiplier,
                prize_amount: prize,
                bulk_index: i,
            });

            i = i + 1;
        };
    }

    // ===== Prize Table =====

    /// Descending threshold check. Hardcoded for on-chain auditability.
    fun get_multiplier(roll: u16): u64 {
        if (roll >= THRESHOLD_100X) 100
        else if (roll >= THRESHOLD_50X) 50
        else if (roll >= THRESHOLD_20X) 20
        else if (roll >= THRESHOLD_10X) 10
        else if (roll >= THRESHOLD_5X) 5
        else if (roll >= THRESHOLD_2X) 2
        else if (roll >= THRESHOLD_1X) 1
        else 0
    }

    // ===== Views =====

    public fun card_price(): u64 { CARD_PRICE }
    public fun max_prize(): u64 { MAX_PRIZE }
    public fun max_bulk_count(): u8 { MAX_BULK_COUNT }

    public fun registry_stats(registry: &ScratchCardRegistry): (u64, u64, u64) {
        (
            registry.next_card_id,
            registry.total_cards_sold,
            registry.total_prizes_paid,
        )
    }

    public fun is_game_cap_installed(registry: &ScratchCardRegistry): bool {
        option::is_some(&registry.game_cap)
    }

    /// Prize table for on-chain auditing. Pairs (threshold, multiplier):
    /// roll >= threshold yields that multiplier. Rolls below the lowest
    /// threshold (7500) are losing rolls (0x).
    public fun get_prize_table(): (vector<u16>, vector<u64>) {
        let thresholds = vector[
            THRESHOLD_1X, THRESHOLD_2X, THRESHOLD_5X, THRESHOLD_10X,
            THRESHOLD_20X, THRESHOLD_50X, THRESHOLD_100X,
        ];
        let multipliers = vector[1, 2, 5, 10, 20, 50, 100];
        (thresholds, multipliers)
    }

    // ===== Pure-logic tests =====

    #[test]
    fun test_prize_table_ev() {
        // EV in basis points. Same distribution as Pado.
        // 1x: 1550, 2x: 800, 5x: 1500, 10x: 1500, 20x: 1600, 50x: 750, 100x: 500
        let ev_bps: u64 = 1550 + 800 + 1500 + 1500 + 1600 + 750 + 500;
        assert!(ev_bps == 8200);
        assert!(ev_bps < 10000); // house always wins on average
    }

    #[test]
    fun test_threshold_coverage() {
        assert!(get_multiplier(0) == 0);
        assert!(get_multiplier(7499) == 0);
        assert!(get_multiplier(7500) == 1);
        assert!(get_multiplier(9049) == 1);
        assert!(get_multiplier(9050) == 2);
        assert!(get_multiplier(9449) == 2);
        assert!(get_multiplier(9450) == 5);
        assert!(get_multiplier(9749) == 5);
        assert!(get_multiplier(9750) == 10);
        assert!(get_multiplier(9899) == 10);
        assert!(get_multiplier(9900) == 20);
        assert!(get_multiplier(9979) == 20);
        assert!(get_multiplier(9980) == 50);
        assert!(get_multiplier(9994) == 50);
        assert!(get_multiplier(9995) == 100);
        assert!(get_multiplier(9999) == 100);
    }

    #[test]
    fun test_max_prize_no_overflow() {
        let prize = (CARD_PRICE as u128) * (MAX_MULTIPLIER as u128);
        assert!(prize <= 18_446_744_073_709_551_615u128);
        assert!((prize as u64) == MAX_PRIZE);
    }

    #[test]
    fun test_constants_consistency() {
        assert!(MAX_PRIZE == CARD_PRICE * MAX_MULTIPLIER);
    }

    #[test]
    fun test_bulk_worst_case_no_overflow() {
        // 10 * MAX_PRIZE must fit in u64 comfortably.
        let worst = (MAX_PRIZE as u128) * (MAX_BULK_COUNT as u128);
        assert!(worst <= 18_446_744_073_709_551_615u128);
    }
}
