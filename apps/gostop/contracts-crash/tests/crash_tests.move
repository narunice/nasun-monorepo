#[test_only]
module gostop_crash::crash_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::clock::{Self, Clock};
    use sui::hash;
    use sui::bcs;
    use gostop_crash::crash::{
        Self, AdminCap, CrashRegistry, CrashRound,
        multiplier_at_bps_test, inverse_multiplier_at_test,
    };
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, AdminCap as BPAdminCap, GameCap};
    use devnet_tokens::nusdc::NUSDC;
    use sui::coin;

    const ADMIN: address = @0xAD;
    const OPERATOR: address = @0x0E;
    const PLAYER_A: address = @0xA1;
    const PLAYER_B: address = @0xA2;

    const BETTING_DURATION_MS: u64 = 10_000;

    // ===== Multiplier math tests =====

    #[test]
    fun test_multiplier_at_zero() {
        // t=0 => 10000 (1.00x)
        assert!(multiplier_at_bps_test(0) == 10_000, 0);
    }

    #[test]
    fun test_multiplier_increases() {
        let m0 = multiplier_at_bps_test(0);
        let m1 = multiplier_at_bps_test(1_000);
        let m2 = multiplier_at_bps_test(10_000);
        let m3 = multiplier_at_bps_test(60_000);
        assert!(m0 < m1, 1);
        assert!(m1 < m2, 2);
        assert!(m2 < m3, 3);
    }

    #[test]
    fun test_multiplier_at_10s() {
        // t=10000ms: 10000 + 6*10000 + 36*10000*10000/20000 = 10000 + 60000 + 180000 = 250000
        let expected: u64 = 10_000 + 60_000 + 180_000;
        assert!(multiplier_at_bps_test(10_000) == expected, 0);
    }

    #[test]
    fun test_inverse_multiplier_roundtrip() {
        // inverse_multiplier_at(multiplier_at_bps(t)) >= t (binary search ceiling)
        let targets = vector[10_000u64, 15_000, 20_000, 50_000, 100_000, 250_000];
        let mut i = 0;
        while (i < vector::length(&targets)) {
            let m = *vector::borrow(&targets, i);
            let t = inverse_multiplier_at_test(m);
            // multiplier_at_bps(t) should be >= m
            assert!(multiplier_at_bps_test(t) >= m, i);
            // and t-1 should give < m (or t==0)
            if (t > 0) {
                assert!(multiplier_at_bps_test(t - 1) < m, i + 100);
            };
            i = i + 1;
        };
    }

    #[test]
    fun test_inverse_at_base_returns_zero() {
        assert!(inverse_multiplier_at_test(10_000) == 0, 0);
        assert!(inverse_multiplier_at_test(9_999) == 0, 1);
    }

    // ===== RTP simulation (10k rounds) =====

    #[test]
    fun test_rtp_simulation() {
        // Simulate a player always targeting 2.00x cashout.
        // P(win) = P(crash_bps > 20000) = P(raw > 5150 AND raw >= 300) / 10000 = 4850/10000 = 0.485
        // RTP = 0.485 * 2.0 = 0.97 = 9700 bps. Expected [9400, 9900] with variance.
        let n: u64 = 10_000;
        let target_mul: u64 = 20_000; // 2.00x in bps
        let mut wins: u64 = 0;
        let mut seed: u64 = 0x12345678ABCDEF;
        let mut i = 0;
        while (i < n) {
            seed = lcg_next(seed);
            let raw = seed % 10_000;
            let crash_bps: u64 = if (raw < 300) {
                10_000 // instant crash
            } else {
                (10_000 - 300) * 10_000 / (10_000 - raw)
            };
            if (crash_bps > target_mul) {
                wins = wins + 1;
            };
            i = i + 1;
        };
        // wins/n * target_mul = RTP in bps
        let rtp_bps = (wins as u128) * (target_mul as u128) / (n as u128);
        // Expect ~9700 bps (3% house edge). Accept [9000, 10000] for n=10k variance.
        assert!(rtp_bps >= 9_000, (rtp_bps as u64));
        assert!(rtp_bps <= 10_000, (rtp_bps as u64));
    }

    fun lcg_next(seed: u64): u64 {
        // Simple LCG for deterministic test simulation (wrapping via u128 truncation)
        let next = (seed as u128) * 6_364_136_223_846_793_005 + 1_442_695_040_888_963_407;
        (next % (18_446_744_073_709_551_616u128)) as u64
    }

    // ===== Commit-reveal tests =====

    #[test]
    fun test_commit_hash_deterministic() {
        let crash_point_bps: u64 = 25_000;
        let salt = b"00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
        let mut msg = bcs::to_bytes(&crash_point_bps);
        vector::append(&mut msg, salt);
        let h1 = hash::blake2b256(&msg);
        let h2 = hash::blake2b256(&msg);
        assert!(h1 == h2, 0);
        assert!(vector::length(&h1) == 32, 1);
    }

    #[test]
    fun test_commit_hash_salt_dependent() {
        let crash_point_bps: u64 = 25_000;
        let salt1 = b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let salt2 = b"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        let mut msg1 = bcs::to_bytes(&crash_point_bps);
        vector::append(&mut msg1, salt1);
        let mut msg2 = bcs::to_bytes(&crash_point_bps);
        vector::append(&mut msg2, salt2);
        assert!(hash::blake2b256(&msg1) != hash::blake2b256(&msg2), 0);
    }

    // ===== Full round lifecycle (scenario tests) =====

    fun setup(scenario: &mut Scenario): Clock {
        // Deploy BankrollPool
        ts::next_tx(scenario, ADMIN);
        {
            bankroll_pool::init_for_testing(ts::ctx(scenario));
        };
        // Deploy Crash
        ts::next_tx(scenario, ADMIN);
        {
            crash::init_for_testing(ts::ctx(scenario));
        };
        // Create clock
        let clock = clock::create_for_testing(ts::ctx(scenario));
        clock
    }

    fun install_caps(scenario: &mut Scenario, clock: &Clock) {
        // Issue GameCap from BankrollPool
        ts::next_tx(scenario, ADMIN);
        {
            let bp_admin_cap = ts::take_from_sender<BPAdminCap>(scenario);
            let pool = ts::take_shared<BankrollPool>(scenario);
            // Issue to ADMIN (Crash admin), who will then install it
            bankroll_pool::issue_game_cap(
                &bp_admin_cap,
                4u8,
                b"crash",
                10_000_000_000u64, // 10000 NUSDC max payout
                ADMIN,
                ts::ctx(scenario),
            );
            ts::return_shared(pool);
            ts::return_to_sender(scenario, bp_admin_cap);
        };
        // Install GameCap into CrashRegistry + set operator
        ts::next_tx(scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(scenario);
            let mut reg = ts::take_shared<CrashRegistry>(scenario);
            let game_cap = ts::take_from_sender<GameCap>(scenario);
            crash::install_game_cap(&admin_cap, &mut reg, game_cap);
            crash::set_operator(&admin_cap, &mut reg, OPERATOR);
            ts::return_shared(reg);
            ts::return_to_sender(scenario, admin_cap);
        };
    }

    fun make_commit_hash(crash_point_bps: u64, salt: vector<u8>): vector<u8> {
        let mut msg = bcs::to_bytes(&crash_point_bps);
        vector::append(&mut msg, salt);
        hash::blake2b256(&msg)
    }

    fun mint_nusdc(amount: u64, ctx: &mut sui::tx_context::TxContext): sui::coin::Coin<NUSDC> {
        coin::mint_for_testing<NUSDC>(amount, ctx)
    }

    #[test]
    fun test_full_round_lifecycle() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let crash_point_bps: u64 = 25_000; // 2.50x
        let salt = b"saltsaltsaltsaltsaltsaltsaltsalt"; // 32 bytes
        let commit_hash = make_commit_hash(crash_point_bps, salt);

        // Seed pool with 200 NUSDC so pay_winner has enough above MIN_POOL_BALANCE (100 NUSDC)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let seed_coin = mint_nusdc(200_000_000, ts::ctx(&mut scenario));
            bankroll_pool::provide_liquidity(&mut pool, seed_coin, &clock, ts::ctx(&mut scenario));
            ts::return_shared(pool);
        };

        // Start round
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        // Player A bets 5 NUSDC
        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet = mint_nusdc(5_000_000, ts::ctx(&mut scenario));
            crash::place_bet(&mut round, &reg, &mut pool, bet, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        // Advance clock past betting window
        clock::increment_for_testing(&mut clock, BETTING_DURATION_MS + 1);

        // Close betting
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::close_betting(&reg, &mut round, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        // Player A cashes out at 2.00x (below crash 2.50x). Elapsed = 1ms (just opened).
        // multiplier_at_bps(1) = 10006, so max_allowed = 10006 * 10300 / 10000 = 10306
        // Cash_out at 10000 is within bounds.
        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::cash_out(&mut round, &reg, 10_000u64, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        // Resolve round
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let round = ts::take_shared<CrashRound>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            crash::resolve_round(round, crash_point_bps, salt, &mut reg, &mut pool, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = gostop_crash::crash::ECommitHashMismatch)]
    fun test_resolve_wrong_salt_fails() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let crash_point_bps: u64 = 20_000;
        let salt = b"correctsaltcorrectsaltcorrectsal"; // 32 bytes
        let bad_salt = b"wrongsaltwrongsaltwrongsaltwrong"; // 32 bytes
        let commit_hash = make_commit_hash(crash_point_bps, salt);

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        clock::increment_for_testing(&mut clock, BETTING_DURATION_MS + 1);

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::close_betting(&reg, &mut round, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let round = ts::take_shared<CrashRound>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            // Pass wrong salt => should abort ECommitHashMismatch
            crash::resolve_round(round, crash_point_bps, bad_salt, &mut reg, &mut pool, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = gostop_crash::crash::EAlreadyBet)]
    fun test_double_bet_fails() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let commit_hash = make_commit_hash(20_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet = mint_nusdc(1_000_000, ts::ctx(&mut scenario));
            crash::place_bet(&mut round, &reg, &mut pool, bet, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet2 = mint_nusdc(1_000_000, ts::ctx(&mut scenario));
            // Should abort EAlreadyBet
            crash::place_bet(&mut round, &reg, &mut pool, bet2, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = gostop_crash::crash::EOperatorCannotPlay)]
    fun test_operator_cannot_bet() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let commit_hash = make_commit_hash(20_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet = mint_nusdc(1_000_000, ts::ctx(&mut scenario));
            // Should abort EOperatorCannotPlay
            crash::place_bet(&mut round, &reg, &mut pool, bet, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = gostop_crash::crash::ECurrentRoundExists)]
    fun test_cannot_start_two_rounds() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let commit_hash = make_commit_hash(20_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let commit_hash2 = make_commit_hash(30_000, b"saltsaltsaltsaltsaltsaltsaltsalt");
            // Should abort ECurrentRoundExists
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash2, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = gostop_crash::crash::EMultiplierExceedsBound)]
    fun test_cashout_exceeds_bound_fails() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let commit_hash = make_commit_hash(50_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet = mint_nusdc(1_000_000, ts::ctx(&mut scenario));
            crash::place_bet(&mut round, &reg, &mut pool, bet, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::increment_for_testing(&mut clock, BETTING_DURATION_MS + 1);

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::close_betting(&reg, &mut round, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        // At elapsed=0ms, max_allowed = multiplier_at(0)*10300/10000 = 10000*10300/10000 = 10300
        // Try to cash out at 999_999_999 (way above)
        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::cash_out(&mut round, &reg, 999_999_999u64, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    // ===== v3 patch tests (4건 추가) =====

    /// admin_finalize_stuck_round: empty entries → 정상 finalize
    #[test]
    fun test_admin_finalize_with_empty_entries_succeeds() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        let commit_hash = make_commit_hash(20_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        // round 시작 (entries=0)
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        clock::increment_for_testing(&mut clock, BETTING_DURATION_MS + 1);

        // close_betting → FLYING (entries 여전히 0)
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::close_betting(&reg, &mut round, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        // admin_finalize_stuck_round 호출 (admin)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let round = ts::take_shared<CrashRound>(&scenario);
            crash::admin_finalize_stuck_round(&admin_cap, &mut reg, round, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_to_sender(&scenario, admin_cap);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// admin_finalize_stuck_round: entries > 0 → abort EEntriesNotEmpty (=19)
    #[test]
    #[expected_failure(abort_code = 19, location = gostop_crash::crash)]
    fun test_admin_finalize_with_entries_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        // pool seed
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let seed_coin = mint_nusdc(200_000_000, ts::ctx(&mut scenario));
            bankroll_pool::provide_liquidity(&mut pool, seed_coin, &clock, ts::ctx(&mut scenario));
            ts::return_shared(pool);
        };

        let commit_hash = make_commit_hash(20_000, b"saltsaltsaltsaltsaltsaltsaltsalt");

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        // place_bet (entries = 1)
        ts::next_tx(&mut scenario, PLAYER_A);
        {
            let mut round = ts::take_shared<CrashRound>(&scenario);
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let bet = mint_nusdc(1_000_000, ts::ctx(&mut scenario));
            crash::place_bet(&mut round, &reg, &mut pool, bet, &clock, ts::ctx(&mut scenario));
            ts::return_shared(round);
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        // admin_finalize 시도 → EEntriesNotEmpty
        ts::next_tx(&mut scenario, ADMIN);
        {
            let admin_cap = ts::take_from_sender<AdminCap>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let round = ts::take_shared<CrashRound>(&scenario);
            crash::admin_finalize_stuck_round(&admin_cap, &mut reg, round, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_to_sender(&scenario, admin_cap);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// resolve_round: crash_point > INVERSE_SEARCH_TOP_BPS (26_650_000) → abort ECrashPointTooHigh (=21)
    #[test]
    #[expected_failure(abort_code = 21, location = gostop_crash::crash)]
    fun test_resolve_with_crash_point_above_top_bps_aborts() {
        let mut scenario = ts::begin(ADMIN);
        let mut clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            let seed_coin = mint_nusdc(200_000_000, ts::ctx(&mut scenario));
            bankroll_pool::provide_liquidity(&mut pool, seed_coin, &clock, ts::ctx(&mut scenario));
            ts::return_shared(pool);
        };

        // 너무 큰 crash_point로 commit_hash 만들고 resolve 시도
        let too_high_crash_point: u64 = 27_000_000;  // > INVERSE_SEARCH_TOP_BPS
        let salt = b"saltsaltsaltsaltsaltsaltsaltsalt";
        let commit_hash = make_commit_hash(too_high_crash_point, salt);

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::start_round(&mut reg, BETTING_DURATION_MS, commit_hash, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
        };

        clock::increment_for_testing(&mut clock, BETTING_DURATION_MS + 1);

        ts::next_tx(&mut scenario, OPERATOR);
        {
            let reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut round = ts::take_shared<CrashRound>(&scenario);
            crash::close_betting(&reg, &mut round, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(round);
        };

        // resolve with too-high crash_point → ECrashPointTooHigh
        ts::next_tx(&mut scenario, OPERATOR);
        {
            let round = ts::take_shared<CrashRound>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            let mut pool = ts::take_shared<BankrollPool>(&scenario);
            crash::resolve_round(round, too_high_crash_point, salt, &mut reg, &mut pool, &clock, ts::ctx(&mut scenario));
            ts::return_shared(reg);
            ts::return_shared(pool);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    /// update_max_payout_via_bp_admin: BP AdminCap + Crash AdminCap PTB로 cap mut borrow → max 변경
    #[test]
    fun test_update_max_payout_via_bp_admin_succeeds() {
        let mut scenario = ts::begin(ADMIN);
        let clock = setup(&mut scenario);
        install_caps(&mut scenario, &clock);

        // ADMIN이 BP AdminCap + Crash AdminCap 둘 다 보유 (admin laptop 가정)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let crash_admin = ts::take_from_sender<AdminCap>(&scenario);
            let bp_admin = ts::take_from_sender<BPAdminCap>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            // 1k NUSDC로 변경 (canary)
            crash::update_max_payout_via_bp_admin(
                &crash_admin, &bp_admin, &mut reg, 1_000_000_000, &clock,
            );
            ts::return_to_sender(&scenario, crash_admin);
            ts::return_to_sender(&scenario, bp_admin);
            ts::return_shared(reg);
        };

        // 다시 10k로 (정상 운영)
        ts::next_tx(&mut scenario, ADMIN);
        {
            let crash_admin = ts::take_from_sender<AdminCap>(&scenario);
            let bp_admin = ts::take_from_sender<BPAdminCap>(&scenario);
            let mut reg = ts::take_shared<CrashRegistry>(&scenario);
            crash::update_max_payout_via_bp_admin(
                &crash_admin, &bp_admin, &mut reg, 10_000_000_000, &clock,
            );
            ts::return_to_sender(&scenario, crash_admin);
            ts::return_to_sender(&scenario, bp_admin);
            ts::return_shared(reg);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
