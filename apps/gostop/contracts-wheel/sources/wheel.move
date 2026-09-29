/// GoStop Wheel Module
///
/// Atomic wheel-of-fortune: player commits a NUSDC bet, VRF picks one of
/// 20 fixed segments, payout = bet * segment_multiplier_bps / 10_000 is
/// paid out in the same transaction. RTP 97.5% (house edge 2.5%).
///
/// Ports the numbermatch skeleton (Registry + GameCap install + entry
/// random) and mirrors mines' BankrollPool call shape (collect_bet 5-arg,
/// pay_winner returning Coin<NUSDC> that the game transfers itself).
///
/// Security notes:
/// - `spin` is `entry` (not `public entry`). sui::random forbids
///   `public entry` for random-consuming functions to prevent PTB
///   composition / test-and-abort attacks.
/// - All pre-random assertions (paused, bet bounds, solvency) run before
///   random consumption.
/// - u128 intermediate guards `bet * multiplier_bps` from u64 overflow at
///   MAX_BET * 5x (well within u64, but kept defensively).
/// - Solvency: pool_balance must cover MAX multiplier (5x) bet plus a
///   100 NUSDC buffer at call time.
#[allow(unused_const)]
module gostop_wheel::wheel {
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::dynamic_object_field as dof;
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap};

    // ===== Game Parameters =====

    const SEGMENT_COUNT: u64 = 20;

    // Bet bounds (NUSDC, 6 decimals). Mirrors mines bet bounds.
    const MIN_BET: u64 = 1_000_000;        // 1 NUSDC
    const MAX_BET: u64 = 100_000_000;      // 100 NUSDC

    // Max payout multiplier present in v1 segments (5x).
    const MAX_MULT_BPS: u64 = 50_000;      // 5.00x

    // Solvency buffer kept on top of MIN_POOL_BALANCE.
    const POOL_BUFFER: u64 = 100_000_000;  // 100 NUSDC

    /// game_id assigned by BankrollPool for wheel. Must match the value
    /// used in `bankroll_pool::issue_game_cap` at bootstrap.
    /// Mapping: 1=lottery, 2=scratch, 3=numbermatch, 4=crash, 5=mines,
    ///          6=wheel.
    const GAME_ID_SELF: u8 = 6;

    // ===== Error Codes =====

    const EPaused: u64 = 0;
    const EBetOutOfRange: u64 = 1;
    const EInsufficientBankroll: u64 = 2;
    const EGameCapAlreadyInstalled: u64 = 3;
    const EGameCapNotInstalled: u64 = 4;
    const EGameCapMismatch: u64 = 5;
    const EGameCapNotInOption: u64 = 6;
    const ESentinelNotRevoked: u64 = 7;
    const EWrongVersion: u64 = 8;
    const ELedgerAlreadyCurrent: u64 = 9;
    const EObsolete: u64 = 10;

    /// Bumped by every upgrade that must retire the one before it.
    const LEDGER_VERSION: u64 = 2;

    // ===== Dynamic Field Keys =====

    /// Where the first ledger version kept the GameCap. Since ledger version 2
    /// it holds a revoked sentinel (`seal_legacy_field`), so that version's
    /// code finds a dead cap here and its cap-moving entry point aborts.
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

    /// Shared registry. `segments` holds the multiplier (in basis points)
    /// for each of the 20 wheel positions. Layout is fixed at init.
    public struct WheelRegistry has key {
        id: UID,
        game_cap: Option<GameCap>,
        segments: vector<u64>,
        min_bet: u64,
        max_bet: u64,
        paused: bool,
        next_game_id: u64,
        total_plays: u64,
        total_prizes_paid: u64,
    }

    // ===== Events =====

    /// Game-specific event consumed by the gostop frontend history list.
    /// `game_id` is the registry-local sequence (separate from
    /// bankroll_pool's standardized GameResult event used by the
    /// leaderboard indexer).
    public struct WheelResultEvent has copy, drop {
        game_id: u64,
        player: address,
        bet: u64,
        segment_index: u64,
        multiplier_bps: u64,
        payout: u64,
        timestamp_ms: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );

        // Balanced visual layout of the 20 segments (in basis points):
        //   0x: 11, 1.5x: 5, 2x: 2, 3x: 1, 5x: 1  -> RTP 97.5%
        // Index:    0     1      2     3     4      5     6     7     8     9
        //         0x  1.5x   0x    2x    0x  1.5x    0x   0x    5x   0x
        // Index:   10    11     12    13    14    15    16    17    18    19
        //        1.5x   0x     2x    0x  1.5x    0x    3x   0x  1.5x   0x
        let mut segments: vector<u64> = vector::empty<u64>();
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 15_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 20_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 15_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 50_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 15_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 20_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 15_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 30_000);
        vector::push_back(&mut segments, 0);
        vector::push_back(&mut segments, 15_000);
        vector::push_back(&mut segments, 0);

        transfer::share_object(WheelRegistry {
            id: object::new(ctx),
            game_cap: option::none(),
            segments,
            min_bet: MIN_BET,
            max_bet: MAX_BET,
            paused: false,
            next_game_id: 0,
            total_plays: 0,
            total_prizes_paid: 0,
        });
    }

    // ===== Admin =====

    /// One-time install of the bankroll_pool GameCap issued to wheel.
    public entry fun install_game_cap(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
        cap: GameCap,
    ) {
        assert_current(&registry.id);
        assert!(!cap_installed(&registry.id), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        dof::add(&mut registry.id, LiveCapKey {}, cap);
    }

    /// Obsolete since ledger version 1 moved every cap to LiveCapKey. Kept only
    /// because a compatible upgrade cannot remove a public function.
    public entry fun move_game_cap_to_field(
        _admin: &AdminCap,
        _registry: &mut WheelRegistry,
    ) {
        abort EObsolete
    }

    /// Retire every earlier version of this module by stamping LEDGER_VERSION,
    /// which every entry point of this version checks. Run once the frontend
    /// calls this package; until then this version runs on the older stamp.
    public entry fun migrate(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
    ) {
        assert!(dof::exists_(&registry.id, LiveCapKey {}), EGameCapNotInstalled);
        if (sui::dynamic_field::exists_(&registry.id, VersionKey {})) {
            let stamped: &mut u64 = sui::dynamic_field::borrow_mut(&mut registry.id, VersionKey {});
            assert!(*stamped < LEDGER_VERSION, ELedgerAlreadyCurrent);
            *stamped = LEDGER_VERSION;
        } else {
            sui::dynamic_field::add(&mut registry.id, VersionKey {}, LEDGER_VERSION);
        }
    }

    /// Park a revoked GameCap in GameCapKey, the field the ledger code before
    /// LiveCapKey read. With it occupied, that code's move_game_cap_to_field
    /// aborts instead of emptying the `game_cap` option (which would let the
    /// pre-ledger install_game_cap take a live cap again), and anything else it
    /// tries with the cap aborts on the revocation.
    public entry fun seal_legacy_field(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
        sentinel: GameCap,
    ) {
        assert_current(&registry.id);
        assert!(dof::exists_(&registry.id, LiveCapKey {}), EGameCapNotInstalled);
        assert!(!dof::exists_(&registry.id, GameCapKey {}), EGameCapAlreadyInstalled);
        assert!(bankroll_pool::game_cap_revoked(&sentinel), ESentinelNotRevoked);
        assert!(bankroll_pool::game_cap_id(&sentinel) == GAME_ID_SELF, EGameCapMismatch);
        dof::add(&mut registry.id, GameCapKey {}, sentinel);
    }

    /// Park a revoked GameCap in the emptied `game_cap` option. The
    /// pre-upgrade code reads only that option: once it holds a revoked cap,
    /// its install_game_cap aborts on the occupied slot and every bet, payout
    /// or release it attempts aborts on the revocation (only moves that touch
    /// no bankroll call, such as a safe mines reveal, still pass), so no stale
    /// script or config can bring the unpaired path back. The live cap stays in
    /// LiveCapKey, which is all the current code reads.
    public entry fun seal_legacy_slot(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
        sentinel: GameCap,
    ) {
        assert_current(&registry.id);
        assert!(dof::exists_(&registry.id, LiveCapKey {}), EGameCapNotInstalled);
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(bankroll_pool::game_cap_revoked(&sentinel), ESentinelNotRevoked);
        assert!(bankroll_pool::game_cap_id(&sentinel) == GAME_ID_SELF, EGameCapMismatch);
        option::fill(&mut registry.game_cap, sentinel);
    }

    public entry fun set_paused(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
        paused: bool,
    ) {
        assert_current(&registry.id);
        registry.paused = paused;
    }

    // ===== Core: Spin =====

    /// entry-only (not `public entry`) because `&Random` is consumed.
    entry fun spin(
        registry: &mut WheelRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_current(&registry.id);
        assert!(cap_installed(&registry.id), EGameCapNotInstalled);
        assert!(!registry.paused, EPaused);

        let sender = tx_context::sender(ctx);
        let bet = coin::value(&bet_coin);

        // ===== Phase 1: Pre-random assertions =====

        assert!(bet >= registry.min_bet && bet <= registry.max_bet, EBetOutOfRange);

        // Solvency pre-check: pool must cover worst-case (MAX_MULT_BPS) payout
        // plus a buffer on top of BankrollPool's own MIN_POOL_BALANCE so a
        // concurrent tx cannot drain the pool between our check and
        // pay_winner.
        let max_payout = (((bet as u128) * (MAX_MULT_BPS as u128)) / 10_000u128) as u64;
        assert!(
            bankroll_pool::pool_balance(pool) >= max_payout + POOL_BUFFER,
            EInsufficientBankroll,
        );

        let cap = cap_ref(&registry.id);

        // A spin pays at most once, so it takes one reservation of the most
        // it can pay, and releases it below whatever the segment. Reserving
        // before any random is drawn also moves the max_single_payout check
        // ahead of the draw, where the old pay_winner abort sat after it.
        bankroll_pool::reserve_exposure(pool, cap, max_payout, clock);
        bankroll_pool::collect_bet_no_reserve(pool, cap, bet_coin, sender, clock);

        // ===== Phase 2: Random consumption (no abort past this point) =====

        let mut g = random::new_generator(r, ctx);
        // generate_u64_in_range is inclusive at both ends.
        let idx = random::generate_u64_in_range(
            &mut g,
            0,
            SEGMENT_COUNT - 1,
        );
        let mult_bps = *vector::borrow(&registry.segments, idx);

        let payout = (((bet as u128) * (mult_bps as u128)) / 10_000u128) as u64;

        if (payout > 0) {
            let coin = bankroll_pool::pay_winner_no_release(
                pool,
                cap,
                payout,
                sender,
                clock,
                ctx,
            );
            transfer::public_transfer(coin, sender);
        };
        bankroll_pool::release_exposure(pool, cap, max_payout, clock);

        // Standardized cross-game result event (leaderboard indexer).
        let game_id = registry.next_game_id;
        let sid = sui::bcs::to_bytes(&game_id);
        bankroll_pool::emit_game_result(
            cap,
            sender,
            bet,
            payout,
            sid,
            clock,
        );

        registry.next_game_id = registry.next_game_id + 1;
        registry.total_plays = registry.total_plays + 1;
        registry.total_prizes_paid = registry.total_prizes_paid + payout;

        // Game-specific event (frontend history).
        event::emit(WheelResultEvent {
            game_id,
            player: sender,
            bet,
            segment_index: idx,
            multiplier_bps: mult_bps,
            payout,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    // ===== Internal =====

    /// Take the UID rather than the registry so callers can keep mutating the
    /// registry's counters while the cap is borrowed.
    fun cap_installed(id: &UID): bool {
        dof::exists_(id, LiveCapKey {})
    }

    /// Abort once a later version's `migrate` has stamped the registry past
    /// this one. An older stamp is accepted, so this version already runs
    /// between its upgrade and its own `migrate` and the frontend can switch
    /// over before the stamp retires the version it replaces.
    fun assert_current(id: &UID) {
        if (sui::dynamic_field::exists_(id, VersionKey {})) {
            assert!(
                *sui::dynamic_field::borrow<VersionKey, u64>(id, VersionKey {}) <= LEDGER_VERSION,
                EWrongVersion,
            );
        }
    }

    fun cap_ref(id: &UID): &GameCap {
        dof::borrow(id, LiveCapKey {})
    }

    // ===== Views =====

    public fun min_bet(r: &WheelRegistry): u64 { r.min_bet }
    public fun max_bet(r: &WheelRegistry): u64 { r.max_bet }
    public fun segments(r: &WheelRegistry): &vector<u64> { &r.segments }
    public fun is_paused(r: &WheelRegistry): bool { r.paused }
    public fun segment_count(): u64 { SEGMENT_COUNT }
    public fun max_mult_bps(): u64 { MAX_MULT_BPS }

    public fun registry_stats(r: &WheelRegistry): (u64, u64, u64) {
        (r.next_game_id, r.total_plays, r.total_prizes_paid)
    }

    public fun is_game_cap_installed(r: &WheelRegistry): bool {
        cap_installed(&r.id)
    }

    /// Stamp an arbitrary version, standing in for a later upgrade's migrate.
    #[test_only]
    public fun stamp_version_for_testing(registry: &mut WheelRegistry, version: u64) {
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
    public fun spin_for_testing(
        registry: &mut WheelRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        spin(registry, pool, bet_coin, r, clock, ctx);
    }

    // ===== Pure-logic tests =====

    #[test_only]
    fun build_init_segments(): vector<u64> {
        let mut s: vector<u64> = vector::empty<u64>();
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 15_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 20_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 15_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 50_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 15_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 20_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 15_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 30_000);
        vector::push_back(&mut s, 0);
        vector::push_back(&mut s, 15_000);
        vector::push_back(&mut s, 0);
        s
    }

    #[test]
    fun test_init_segments_layout() {
        let s = build_init_segments();
        assert!(vector::length(&s) == 20, 100);

        // Count each multiplier band.
        let mut zeros: u64 = 0;
        let mut p15: u64 = 0;
        let mut p20: u64 = 0;
        let mut p30: u64 = 0;
        let mut p50: u64 = 0;

        let mut i: u64 = 0;
        while (i < vector::length(&s)) {
            let v = *vector::borrow(&s, i);
            if (v == 0) { zeros = zeros + 1; }
            else if (v == 15_000) { p15 = p15 + 1; }
            else if (v == 20_000) { p20 = p20 + 1; }
            else if (v == 30_000) { p30 = p30 + 1; }
            else if (v == 50_000) { p50 = p50 + 1; }
            else { assert!(false, 101); };
            i = i + 1;
        };

        assert!(zeros == 11, 110);
        assert!(p15 == 5, 111);
        assert!(p20 == 2, 112);
        assert!(p30 == 1, 113);
        assert!(p50 == 1, 114);
    }

    #[test]
    fun test_rtp_equals_target() {
        // Weighted average of multiplier_bps == 9_750 (97.5% RTP).
        // sum = 0*11 + 15000*5 + 20000*2 + 30000*1 + 50000*1 = 195_000
        // avg = 195_000 / 20 = 9_750
        let s = build_init_segments();
        let mut sum: u128 = 0;
        let mut i: u64 = 0;
        while (i < vector::length(&s)) {
            sum = sum + (*vector::borrow(&s, i) as u128);
            i = i + 1;
        };
        assert!(sum == 195_000u128, 200);
        let avg = sum / (vector::length(&s) as u128);
        assert!(avg == 9_750u128, 201);
    }

    #[test]
    fun test_segment_index_bounds() {
        // generate_u64_in_range(0, SEGMENT_COUNT - 1) is inclusive at both
        // ends, so indices 0 and 19 must be valid borrowable positions and
        // index 20 must be out of bounds. We check via vector::length so
        // the test does not depend on hitting the RNG.
        let s = build_init_segments();
        assert!(SEGMENT_COUNT == 20, 300);
        let _lo = *vector::borrow(&s, 0);
        let _hi = *vector::borrow(&s, (SEGMENT_COUNT - 1));
        assert!(vector::length(&s) == SEGMENT_COUNT, 301);
    }

    #[test]
    fun test_payout_no_overflow() {
        // MAX_BET * MAX_MULT_BPS / 10_000 must fit in u64 with u128
        // intermediate.
        let bet: u128 = (MAX_BET as u128);
        let mb: u128 = (MAX_MULT_BPS as u128);
        let prod = bet * mb;
        let payout = prod / 10_000u128;
        // MAX_BET=100_000_000, MAX_MULT_BPS=50_000
        // prod = 5_000_000_000_000_000 fits u64.
        assert!(prod <= 18_446_744_073_709_551_615u128, 400);
        // Expected payout = 500_000_000 (500 NUSDC at 5x of 100 NUSDC bet).
        assert!((payout as u64) == 500_000_000u64, 401);
    }

    #[test]
    fun test_bet_bounds_constants() {
        assert!(MIN_BET == 1_000_000, 500);
        assert!(MAX_BET == 100_000_000, 501);
        assert!(MIN_BET < MAX_BET, 502);
    }

    #[test]
    fun test_pool_buffer_sane() {
        // POOL_BUFFER must be >= MAX payout at MIN_BET to keep the
        // solvency invariant non-degenerate when the pool is near empty.
        let min_payout = (((MIN_BET as u128) * (MAX_MULT_BPS as u128)) / 10_000u128) as u64;
        assert!(POOL_BUFFER >= min_payout, 600);
    }
}
