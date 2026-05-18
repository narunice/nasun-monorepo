/// Tier 1.0 spike v0.0.3 regression + fix tests for `seed_pool_shares` and
/// the global utilization cap. Six cases:
///
/// 1. test_first_lp_exploit_v002_pattern   — locks W6: with treasury seed but
///    no seed_pool_shares, the first public LP absorbs ~all pool balance.
/// 2. test_seed_pool_shares_blocks_exploit — after seed_pool_shares, first
///    public LP gets fair shares (≈ deposit amount, no seed absorption).
/// 3. test_seed_pool_shares_idempotent     — second call aborts EAlreadySeeded.
/// 4. test_seed_pool_shares_requires_balance — empty pool aborts EEmptyPool.
/// 5. test_utilization_cap_disabled_default — cap_bps == 0 lets bets through
///    regardless of GameCap max_single_payout.
/// 6. test_utilization_cap_blocks_bet      — non-zero cap rejects bets from
///    GameCaps whose max_single_payout exceeds cap_bps of pool.balance.
#[test_only]
module bankroll_pool::bankroll_pool_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock;
    use bankroll_pool::bankroll_pool::{
        Self as bp,
        AdminCap,
        GameCap,
        BankrollPool,
        LPToken,
    };
    use devnet_tokens::nusdc::NUSDC;

    const ADMIN: address = @0xA11CE;
    const ATTACKER: address = @0xBADD;

    // 100K NUSDC at 6 decimals = 100_000_000_000 base units.
    const SEED_AMOUNT: u64 = 100_000_000_000;
    // 100 NUSDC at 6 decimals.
    const SMALL_DEPOSIT: u64 = 100_000_000;

    // ---- helpers ----

    fun begin_with_init(): Scenario {
        let mut scenario = ts::begin(ADMIN);
        bp::init_for_testing(scenario.ctx());
        scenario
    }

    /// Issue a GameCap (game_id = 1, name "test") with the requested
    /// max_single_payout to `recipient`. Returns nothing; the cap arrives via
    /// transfer and is taken from sender on the next tx.
    fun issue_test_game_cap(
        scenario: &mut Scenario,
        max_single_payout: u64,
        recipient: address,
    ) {
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        bp::issue_game_cap(
            &admin_cap,
            1,
            b"test",
            max_single_payout,
            recipient,
            scenario.ctx(),
        );
        scenario.return_to_sender(admin_cap);
    }

    /// Deposit `amount` NUSDC into the pool via `treasury_deposit` so it
    /// credits pool.balance without minting shares (reproduces the seed
    /// state from `bots/seed-bankroll-v2.ts`).
    fun treasury_seed(scenario: &mut Scenario, amount: u64) {
        scenario.next_tx(ADMIN);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        let coin = coin::mint_for_testing<NUSDC>(amount, scenario.ctx());
        bp::treasury_deposit(&mut pool, &cap, coin, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(cap);
    }

    /// Run seed_pool_shares with the test AdminCap.
    fun call_seed_pool_shares(scenario: &mut Scenario) {
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::seed_pool_shares(&admin_cap, &mut pool, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(admin_cap);
    }

    // ---- 1. W6 exploit lock (v0.0.2 baseline behavior) ----

    #[test]
    fun test_first_lp_exploit_v002_pattern() {
        let mut scenario = begin_with_init();
        // Admin issues itself a GameCap so it can call treasury_deposit.
        issue_test_game_cap(&mut scenario, /*max_payout*/ 1_000_000_000, ADMIN);
        // Seed the pool via treasury_deposit (no shares minted).
        treasury_seed(&mut scenario, SEED_AMOUNT);

        // Attacker provides 100 NUSDC -- because total_shares == 0, first-LP
        // fast-path mints shares == deposit amount, but the LP now holds
        // ~entire pool by share fraction. Redeem path will drain.
        scenario.next_tx(ATTACKER);
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        let deposit_coin = coin::mint_for_testing<NUSDC>(SMALL_DEPOSIT, scenario.ctx());
        bp::provide_liquidity(&mut pool, deposit_coin, &clk, scenario.ctx());

        // After deposit: balance = SEED + SMALL_DEPOSIT, total_shares = SMALL_DEPOSIT.
        let balance_after_deposit = bp::pool_balance(&pool);
        assert!(balance_after_deposit == SEED_AMOUNT + SMALL_DEPOSIT, 1001);
        assert!(bp::total_shares(&pool) == (SMALL_DEPOSIT as u128), 1002);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        // Attacker requests withdraw, then redeems after cooldown.
        scenario.next_tx(ATTACKER);
        let mut lp = scenario.take_from_sender<LPToken>();
        let mut clk = clock::create_for_testing(scenario.ctx());
        bp::request_withdraw(&mut lp, &clk, scenario.ctx());
        // Advance clock past the 24h cooldown (86_400_000 ms).
        clock::increment_for_testing(&mut clk, 86_400_001);

        scenario.next_tx(ATTACKER);
        let mut pool = scenario.take_shared<BankrollPool>();
        bp::redeem_liquidity(&mut pool, lp, &clk, scenario.ctx());

        // Attacker receives essentially the full pool (seed + own deposit)
        // minus 1 base unit virtual-offset rounding. Verify on the Coin.
        scenario.next_tx(ATTACKER);
        let payout = scenario.take_from_sender<Coin<NUSDC>>();
        let payout_amount = coin::value(&payout);
        // Attacker spent SMALL_DEPOSIT and walks away with >= 99_000 NUSDC
        // net of the seed (the exact math: 100_000_000 × (100_100_000_001) / (100_000_001)).
        assert!(payout_amount >= 99_000_000_000, 1003);
        // And the pool should now be near-empty (small dust from rounding).
        let bal_after_redeem = bp::pool_balance(&pool);
        assert!(bal_after_redeem < 200_000_000, 1004); // < 200 NUSDC remaining

        // Cleanup
        coin::burn_for_testing(payout);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        ts::end(scenario);
    }

    // ---- 2. seed_pool_shares blocks the exploit ----

    #[test]
    fun test_seed_pool_shares_blocks_exploit() {
        let mut scenario = begin_with_init();
        issue_test_game_cap(&mut scenario, 1_000_000_000, ADMIN);
        treasury_seed(&mut scenario, SEED_AMOUNT);

        // Admin seeds the shares BEFORE attacker LPs.
        call_seed_pool_shares(&mut scenario);

        // After seed: balance = SEED, total_shares = SEED (1:1 mapping → pps = 1.0).
        scenario.next_tx(ADMIN);
        let pool_view = scenario.take_shared<BankrollPool>();
        assert!(bp::pool_balance(&pool_view) == SEED_AMOUNT, 2001);
        assert!(bp::total_shares(&pool_view) == (SEED_AMOUNT as u128), 2002);
        assert!(bp::is_seeded(&pool_view), 2003);
        ts::return_shared(pool_view);

        // Attacker deposits 100 NUSDC.
        scenario.next_tx(ATTACKER);
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        let deposit_coin = coin::mint_for_testing<NUSDC>(SMALL_DEPOSIT, scenario.ctx());
        bp::provide_liquidity(&mut pool, deposit_coin, &clk, scenario.ctx());
        // shares minted ≈ SMALL_DEPOSIT × (SEED + 1) / (SEED + 1) = SMALL_DEPOSIT
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        scenario.next_tx(ATTACKER);
        let mut lp = scenario.take_from_sender<LPToken>();
        let mut clk = clock::create_for_testing(scenario.ctx());
        bp::request_withdraw(&mut lp, &clk, scenario.ctx());
        clock::increment_for_testing(&mut clk, 86_400_001);

        scenario.next_tx(ATTACKER);
        let mut pool = scenario.take_shared<BankrollPool>();
        bp::redeem_liquidity(&mut pool, lp, &clk, scenario.ctx());

        scenario.next_tx(ATTACKER);
        let payout = scenario.take_from_sender<Coin<NUSDC>>();
        let payout_amount = coin::value(&payout);
        // Attacker recovers ≈ deposit amount (within 1 base unit virtual offset).
        // SHOULD NOT receive the 100K seed.
        assert!(payout_amount >= SMALL_DEPOSIT - 1, 2004);
        assert!(payout_amount <= SMALL_DEPOSIT + 1, 2005);

        // Pool should still hold the seed ± dust.
        let bal_after = bp::pool_balance(&pool);
        assert!(bal_after >= SEED_AMOUNT - 1, 2006);
        assert!(bal_after <= SEED_AMOUNT + 1, 2007);

        coin::burn_for_testing(payout);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        ts::end(scenario);
    }

    // ---- 3. seed_pool_shares is idempotent (second call aborts) ----

    #[test]
    #[expected_failure(abort_code = 9, location = bp)]
    fun test_seed_pool_shares_idempotent() {
        let mut scenario = begin_with_init();
        issue_test_game_cap(&mut scenario, 1_000_000_000, ADMIN);
        treasury_seed(&mut scenario, SEED_AMOUNT);

        call_seed_pool_shares(&mut scenario);
        // Second call must abort EAlreadySeeded.
        call_seed_pool_shares(&mut scenario);

        ts::end(scenario);
    }

    // ---- 4. seed_pool_shares requires a non-empty pool ----

    #[test]
    #[expected_failure(abort_code = 10, location = bp)]
    fun test_seed_pool_shares_requires_balance() {
        let mut scenario = begin_with_init();
        // No treasury_seed -- pool.balance == 0.
        call_seed_pool_shares(&mut scenario);
        ts::end(scenario);
    }

    // ---- 5. utilization cap defaults to disabled (0) ----

    #[test]
    fun test_utilization_cap_disabled_default() {
        let mut scenario = begin_with_init();
        // Issue a GameCap whose max_single_payout exceeds 100% of pool.balance,
        // which WOULD trip the cap if it were enabled.
        issue_test_game_cap(&mut scenario, /*max_payout*/ 999_999_999_999, ADMIN);
        // Seed enough so collect_bet has room to consume; pool.balance is small.
        treasury_seed(&mut scenario, SEED_AMOUNT);

        scenario.next_tx(ADMIN);
        let pool_view = scenario.take_shared<BankrollPool>();
        assert!(bp::utilization_cap_bps(&pool_view) == 0, 5001);
        ts::return_shared(pool_view);

        // collect_bet must succeed because cap_bps == 0.
        scenario.next_tx(ADMIN);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        let bet = coin::mint_for_testing<NUSDC>(1_000_000, scenario.ctx());
        bp::collect_bet(&mut pool, &cap, bet, ADMIN, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(cap);

        ts::end(scenario);
    }

    // ---- 6. utilization cap blocks bets when GameCap max_payout exceeds cap ----

    #[test]
    #[expected_failure(abort_code = bp::EUtilizationCapExceeded)]
    fun test_utilization_cap_blocks_bet() {
        let mut scenario = begin_with_init();
        // GameCap allows up to 5_001 NUSDC single payout (5_001_000_000 base units).
        issue_test_game_cap(&mut scenario, /*max_payout*/ 5_001_000_000, ADMIN);
        // Seed pool with 10_000 NUSDC.
        treasury_seed(&mut scenario, 10_000_000_000);

        // Admin sets cap at 50% (5000 bps). max_payout 5_001 NUSDC exceeds
        // 50% of pool.balance (5_000 NUSDC) by 1 base unit -- collect_bet
        // must abort EUtilizationCapExceeded.
        scenario.next_tx(ADMIN);
        let admin_cap = scenario.take_from_sender<AdminCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::set_utilization_cap(&admin_cap, &mut pool, 5_000, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(admin_cap);

        // Attempt a bet -- should abort.
        scenario.next_tx(ADMIN);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        let bet = coin::mint_for_testing<NUSDC>(1_000_000, scenario.ctx());
        bp::collect_bet(&mut pool, &cap, bet, ADMIN, &clk);
        // unreachable -- expected_failure aborts above.
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(cap);
        ts::end(scenario);
    }
}
