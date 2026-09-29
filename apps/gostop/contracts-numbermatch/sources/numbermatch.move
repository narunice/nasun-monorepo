/// GoStop Number Match Module
///
/// Pick 1-3 numbers from 1-5, match the VRF-drawn winning number to win.
/// More picks = higher cost, higher win probability, lower multiplier.
/// Partial slashing: losers get 20% refund. RTP 80% uniform across all
/// pick counts.
///
/// Ported from Pado's numbermatch, converted to use the shared gostop
/// BankrollPool + GameCap pattern. All bet collection and payouts flow
/// through BankrollPool; every resolved game emits the standardized
/// GameResult event for leaderboard aggregation.
///
/// Security notes:
/// - `play_game` is `entry` (not `public entry`). sui::random guidance
///   forbids `public entry` for random-consuming functions.
/// - All pre-random assertions happen before random consumption.
/// - Loser refund is issued via BankrollPool::pay_winner (payout semantics
///   from the pool's perspective); refund amount is always < win payout,
///   so cap.max_single_payout dominates.
#[allow(unused_const)]
module gostop_numbermatch::numbermatch {
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::dynamic_object_field as dof;
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap};

    // ===== Game Parameters =====

    const MIN_NUMBER: u8 = 1;
    const MAX_NUMBER: u8 = 5;
    const MAX_PICKS: u64 = 3;

    const PRICE_PER_PICK: u64 = 5_000_000;  // 5 NUSDC (6 decimals)

    // Payout formula: win_payout = WIN_PAYOUT_BASE + picks * PAYOUT_PER_PICK
    //   Pick 1: 15 + 1 = 16 NUSDC (3.2x)
    //   Pick 2: 15 + 2 = 17 NUSDC (1.7x)
    //   Pick 3: 15 + 3 = 18 NUSDC (1.2x)
    // Loss refund = picks * PAYOUT_PER_PICK (1/2/3 NUSDC = 20% of cost)
    const WIN_PAYOUT_BASE: u64 = 15_000_000;
    const PAYOUT_PER_PICK: u64 = 1_000_000;
    const MAX_PAYOUT: u64 = 18_000_000;      // 3 picks win

    // Pool safety buffer on top of BankrollPool's own MIN_POOL_BALANCE.
    const POOL_BUFFER: u64 = 100_000_000;    // 100 NUSDC

    /// game_id assigned by BankrollPool for number match. Must match the
    /// value used in `bankroll_pool::issue_game_cap` at bootstrap.
    const GAME_ID_SELF: u8 = 3;

    // ===== Error Codes =====

    const EInvalidPickCount: u64 = 0;
    const ENumberOutOfRange: u64 = 1;
    const EDuplicateNumber: u64 = 2;
    const EInsufficientPayment: u64 = 3;
    const EInsufficientBankroll: u64 = 4;
    const EGameCapAlreadyInstalled: u64 = 5;
    const EGameCapNotInstalled: u64 = 6;
    const EGameCapMismatch: u64 = 7;
    const EGameCapNotInOption: u64 = 8;
    const ESentinelNotRevoked: u64 = 9;
    const EWrongVersion: u64 = 10;
    const ELedgerAlreadyCurrent: u64 = 11;

    /// Bumped by every upgrade that must retire the one before it.
    const LEDGER_VERSION: u64 = 1;

    // ===== Dynamic Field Keys =====

    /// Where the GameCap lives once `move_game_cap_to_field` has run. The
    /// pre-upgrade code only knows the `game_cap` option, so emptying it is
    /// what stops that code from taking bets under the legacy ledger.
    public struct GameCapKey has copy, drop, store {}

    /// Where the live GameCap sits once `migrate` has run. Every earlier
    /// version of this module looks only in GameCapKey or the `game_cap`
    /// option, so moving the cap here retires all of them at once: they find
    /// the revoked sentinel in the option and abort.
    public struct LiveCapKey has copy, drop, store {}

    /// u64 on the registry: the ledger version `migrate` last stamped. Every
    /// entry point asserts it equals LEDGER_VERSION, so the next upgrade only
    /// has to bump the constant and call `migrate` to retire this code too.
    public struct VersionKey has copy, drop, store {}

    // ===== Structs =====

    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry holding the installed GameCap. Mirrors
    /// LotteryRegistry / ScratchCardRegistry.
    public struct NumberMatchRegistry has key {
        id: UID,
        game_cap: Option<GameCap>,
        next_game_id: u64,
        total_plays: u64,
        total_prizes_paid: u64,
    }

    // ===== Events =====

    /// Emitted for every play (both wins and losses).
    public struct NumberMatchPlayed has copy, drop {
        game_id: u64,
        player: address,
        picks: vector<u8>,
        winning_number: u8,
        is_win: bool,
        cost: u64,
        payout: u64,    // win: win_payout amount; lose: refund amount
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
        transfer::share_object(NumberMatchRegistry {
            id: object::new(ctx),
            game_cap: option::none(),
            next_game_id: 0,
            total_plays: 0,
            total_prizes_paid: 0,
        });
    }

    // ===== Admin =====

    /// One-time install of the bankroll_pool GameCap issued to number match.
    public entry fun install_game_cap(
        _admin: &AdminCap,
        registry: &mut NumberMatchRegistry,
        cap: GameCap,
    ) {
        assert!(!cap_installed(&registry.id, &registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    /// Move the installed GameCap out of the `game_cap` option into a
    /// dynamic object field. The current code reads either place; the
    /// pre-upgrade code aborts with EGameCapNotInstalled once the option is
    /// empty, so every play from then on reserves through the paired ledger.
    /// Run after the frontend calls the upgraded package.
    public entry fun move_game_cap_to_field(
        _admin: &AdminCap,
        registry: &mut NumberMatchRegistry,
    ) {
        assert!(!dof::exists_(&registry.id, LiveCapKey {}), EGameCapAlreadyInstalled);
        assert!(option::is_some(&registry.game_cap), EGameCapNotInOption);
        let cap = option::extract(&mut registry.game_cap);
        dof::add(&mut registry.id, GameCapKey {}, cap);
    }

    /// Retire every earlier version of this module. Moves the live GameCap
    /// to LiveCapKey, where neither the pre-ledger code nor the ledger code
    /// before this one can see it, and stamps LEDGER_VERSION, which every
    /// entry point of this version checks. Run once the frontend calls this
    /// package; until then this version reads the cap wherever it is.
    public entry fun migrate(
        _admin: &AdminCap,
        registry: &mut NumberMatchRegistry,
    ) {
        if (dof::exists_(&registry.id, GameCapKey {})) {
            let cap: GameCap = dof::remove(&mut registry.id, GameCapKey {});
            dof::add(&mut registry.id, LiveCapKey {}, cap);
        } else if (
            option::is_some(&registry.game_cap)
                && !bankroll_pool::game_cap_revoked(option::borrow(&registry.game_cap))
        ) {
            // Never moved out of the option. A revoked sentinel there stays put.
            let cap = option::extract(&mut registry.game_cap);
            dof::add(&mut registry.id, LiveCapKey {}, cap);
        };
        assert!(dof::exists_(&registry.id, LiveCapKey {}), EGameCapNotInstalled);
        if (sui::dynamic_field::exists_(&registry.id, VersionKey {})) {
            let stamped: &mut u64 = sui::dynamic_field::borrow_mut(&mut registry.id, VersionKey {});
            assert!(*stamped < LEDGER_VERSION, ELedgerAlreadyCurrent);
            *stamped = LEDGER_VERSION;
        } else {
            sui::dynamic_field::add(&mut registry.id, VersionKey {}, LEDGER_VERSION);
        }
    }

    /// Park a revoked GameCap in the emptied `game_cap` option. The
    /// pre-upgrade code reads only that option: once it holds a revoked cap,
    /// its install_game_cap aborts on the occupied slot and every bet, payout
    /// or release it attempts aborts on the revocation (only moves that touch
    /// no bankroll call, such as a safe mines reveal, still pass), so no stale
    /// script or config can bring the legacy path back. The live cap stays in the dynamic object
    /// field, which is all the current code reads.
    public entry fun seal_legacy_slot(
        _admin: &AdminCap,
        registry: &mut NumberMatchRegistry,
        sentinel: GameCap,
    ) {
        assert!(
            dof::exists_(&registry.id, LiveCapKey {}) || dof::exists_(&registry.id, GameCapKey {}),
            EGameCapNotInstalled,
        );
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(bankroll_pool::game_cap_revoked(&sentinel), ESentinelNotRevoked);
        assert!(bankroll_pool::game_cap_id(&sentinel) == GAME_ID_SELF, EGameCapMismatch);
        option::fill(&mut registry.game_cap, sentinel);
    }

    // ===== Core: Play =====

    /// entry-only (not `public entry`) because `&Random` is consumed.
    /// Single-play game (no bulk): each play is an immediate reveal, so
    /// batching multiple plays in one tx has no UX value.
    entry fun play_game(
        registry: &mut NumberMatchRegistry,
        pool: &mut BankrollPool,
        payment: Coin<NUSDC>,
        picks: vector<u8>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_current(&registry.id);
        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);

        let sender = tx_context::sender(ctx);
        let num_picks = vector::length(&picks);

        // ===== Phase 1: Pre-random assertions =====

        assert!(num_picks >= 1 && num_picks <= MAX_PICKS, EInvalidPickCount);

        // Range + duplicate validation via seen-vector (lottery pattern).
        let mut seen = vector::empty<bool>();
        let mut i: u64 = 0;
        while (i <= (MAX_NUMBER as u64)) {
            vector::push_back(&mut seen, false);
            i = i + 1;
        };
        let mut j: u64 = 0;
        while (j < num_picks) {
            let pick = *vector::borrow(&picks, j);
            assert!(pick >= MIN_NUMBER && pick <= MAX_NUMBER, ENumberOutOfRange);
            let pick_idx = (pick as u64);
            assert!(!*vector::borrow(&seen, pick_idx), EDuplicateNumber);
            *vector::borrow_mut(&mut seen, pick_idx) = true;
            j = j + 1;
        };

        let cost = num_picks * PRICE_PER_PICK;
        assert!(coin::value(&payment) == cost, EInsufficientPayment);

        // Solvency pre-check: pool must cover worst-case (win) payout
        // after bet collection. BankrollPool::pay_winner also enforces
        // MIN_POOL_BALANCE; we add POOL_BUFFER on top so a concurrent tx
        // cannot drain the pool between our check and pay_winner.
        let max_payout = WIN_PAYOUT_BASE + num_picks * PAYOUT_PER_PICK;
        assert!(
            bankroll_pool::pool_balance(pool) >= max_payout + POOL_BUFFER,
            EInsufficientBankroll,
        );

        let cap = cap_ref(&registry.id, &registry.game_cap);

        // A play pays exactly once (the win, or the 20% refund on a loss), so
        // it reserves the win and releases it below whatever the draw. The
        // legacy collect_bet reserved the whole max_single_payout instead.
        bankroll_pool::reserve_exposure(pool, cap, max_payout, clock);
        bankroll_pool::collect_bet_no_reserve(pool, cap, payment, sender, clock);

        // ===== Phase 2: Random consumption (no abort past this point) =====

        let mut g = random::new_generator(r, ctx);
        let winning_number = random::generate_u8_in_range(&mut g, MIN_NUMBER, MAX_NUMBER);

        let is_win = vector::contains(&picks, &winning_number);
        let payout = if (is_win) {
            WIN_PAYOUT_BASE + num_picks * PAYOUT_PER_PICK
        } else {
            num_picks * PAYOUT_PER_PICK // 20% refund on loss
        };

        let payout_coin = bankroll_pool::pay_winner_no_release(
            pool,
            cap,
            payout,
            sender,
            clock,
            ctx,
        );
        transfer::public_transfer(payout_coin, sender);
        bankroll_pool::release_exposure(pool, cap, max_payout, clock);

        let game_id = registry.next_game_id;
        registry.next_game_id = registry.next_game_id + 1;
        registry.total_plays = registry.total_plays + 1;
        registry.total_prizes_paid = registry.total_prizes_paid + payout;

        // Standardized cross-game result event.
        let sid = sui::bcs::to_bytes(&game_id);
        bankroll_pool::emit_game_result(
            cap,
            sender,
            cost,
            payout,
            sid,
            clock,
        );

        event::emit(NumberMatchPlayed {
            game_id,
            player: sender,
            picks,
            winning_number,
            is_win,
            cost,
            payout,
        });
    }

    // ===== Views =====

    public fun price_per_pick(): u64 { PRICE_PER_PICK }
    public fun max_picks(): u64 { MAX_PICKS }
    public fun max_payout(): u64 { MAX_PAYOUT }
    public fun number_range(): (u8, u8) { (MIN_NUMBER, MAX_NUMBER) }

    public fun registry_stats(registry: &NumberMatchRegistry): (u64, u64, u64) {
        (
            registry.next_game_id,
            registry.total_plays,
            registry.total_prizes_paid,
        )
    }

    public fun is_game_cap_installed(registry: &NumberMatchRegistry): bool {
        cap_installed(&registry.id, &registry.game_cap)
    }

    // ===== Internal =====

    /// Takes the two fields rather than the registry so callers can keep
    /// mutating the registry's counters while the cap is borrowed.
    fun cap_installed(id: &UID, slot: &Option<GameCap>): bool {
        dof::exists_(id, LiveCapKey {}) || dof::exists_(id, GameCapKey {}) || option::is_some(slot)
    }

    /// Abort unless the registry is stamped for this version, or not stamped
    /// yet (between this upgrade and its `migrate`).
    fun assert_current(id: &UID) {
        if (sui::dynamic_field::exists_(id, VersionKey {})) {
            assert!(
                *sui::dynamic_field::borrow<VersionKey, u64>(id, VersionKey {}) == LEDGER_VERSION,
                EWrongVersion,
            );
        }
    }

    fun cap_ref(id: &UID, slot: &Option<GameCap>): &GameCap {
        if (dof::exists_(id, LiveCapKey {})) {
            dof::borrow(id, LiveCapKey {})
        } else if (dof::exists_(id, GameCapKey {})) {
            dof::borrow(id, GameCapKey {})
        } else {
            option::borrow(slot)
        }
    }

    /// Stamp an arbitrary version, standing in for a later upgrade's migrate.
    #[test_only]
    public fun stamp_version_for_testing(registry: &mut NumberMatchRegistry, version: u64) {
        if (sui::dynamic_field::exists_(&registry.id, VersionKey {})) {
            *sui::dynamic_field::borrow_mut<VersionKey, u64>(&mut registry.id, VersionKey {}) = version;
        } else {
            sui::dynamic_field::add(&mut registry.id, VersionKey {}, version);
        }
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun play_for_testing(
        registry: &mut NumberMatchRegistry,
        pool: &mut BankrollPool,
        payment: Coin<NUSDC>,
        picks: vector<u8>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        play_game(registry, pool, payment, picks, r, clock, ctx);
    }

    // ===== Pure-logic tests =====

    #[test]
    fun test_rtp_all_picks() {
        // RTP = 80% for all pick counts K.
        // Pick K: win_rate = K/5, win_payout = 15+K, refund = K, cost = 5K
        // EV = (K/5)*(15+K) + ((5-K)/5)*K = 20K/5 = 4K
        // RTP = 4K / 5K = 80%
        let ev1 = (2000u64 * 16_000_000 + 8000u64 * 1_000_000) / 10000;
        assert!(ev1 == 4_000_000); // 5M * 80%
        let ev2 = (4000u64 * 17_000_000 + 6000u64 * 2_000_000) / 10000;
        assert!(ev2 == 8_000_000); // 10M * 80%
        let ev3 = (6000u64 * 18_000_000 + 4000u64 * 3_000_000) / 10000;
        assert!(ev3 == 12_000_000); // 15M * 80%
    }

    #[test]
    fun test_constants_consistency() {
        assert!(MAX_PAYOUT == WIN_PAYOUT_BASE + MAX_PICKS * PAYOUT_PER_PICK);
        assert!((MAX_NUMBER as u64) - (MIN_NUMBER as u64) + 1 == 5);
    }

    #[test]
    fun test_payout_no_overflow() {
        let max_cost = (MAX_PICKS as u128) * (PRICE_PER_PICK as u128);
        assert!(max_cost <= 18_446_744_073_709_551_615u128);
        let mp = (WIN_PAYOUT_BASE as u128) + (MAX_PICKS as u128) * (PAYOUT_PER_PICK as u128);
        assert!(mp <= 18_446_744_073_709_551_615u128);
        assert!((mp as u64) == MAX_PAYOUT);
    }

    #[test]
    fun test_refund_smaller_than_win() {
        // Loss refund < win payout across all pick counts, so cap.max_single_payout
        // bound computed against win payout is sufficient for the loss branch too.
        let mut k = 1u64;
        while (k <= MAX_PICKS) {
            let win = WIN_PAYOUT_BASE + k * PAYOUT_PER_PICK;
            let refund = k * PAYOUT_PER_PICK;
            assert!(refund < win);
            k = k + 1;
        };
    }
}
