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
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    public entry fun set_paused(
        _admin: &AdminCap,
        registry: &mut WheelRegistry,
        paused: bool,
    ) {
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
        assert!(option::is_some(&registry.game_cap), EGameCapNotInstalled);
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

        let cap = option::borrow(&registry.game_cap);

        // Collect the bet into BankrollPool.
        bankroll_pool::collect_bet(pool, cap, bet_coin, sender, clock);

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
            let coin = bankroll_pool::pay_winner(
                pool,
                cap,
                payout,
                sender,
                clock,
                ctx,
            );
            transfer::public_transfer(coin, sender);
        };

        let game_id = registry.next_game_id;
        registry.next_game_id = registry.next_game_id + 1;
        registry.total_plays = registry.total_plays + 1;
        registry.total_prizes_paid = registry.total_prizes_paid + payout;

        // Standardized cross-game result event (leaderboard indexer).
        let sid = sui::bcs::to_bytes(&game_id);
        bankroll_pool::emit_game_result(
            cap,
            sender,
            bet,
            payout,
            sid,
            clock,
        );

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
        option::is_some(&r.game_cap)
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
