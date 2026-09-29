/// Reservation ledger tests for the upgraded spin: every spin, win or lose,
/// leaves the wheel's paired exposure at zero, and the GameCap move keeps the
/// game running while refusing a second install.
#[test_only]
module gostop_wheel::wheel_ledger_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::clock;
    use sui::random::{Self, Random};
    use bankroll_pool::bankroll_pool::{Self as bp, AdminCap as BpAdminCap, GameCap, BankrollPool};
    use devnet_tokens::nusdc::NUSDC;
    use gostop_wheel::wheel::{Self, AdminCap, WheelRegistry};

    const SYSTEM: address = @0x0;
    const GAME_ID: u8 = 6;
    const MAX_PAYOUT: u64 = 500_000_000;
    const SEED: u64 = 100_000_000_000;

    fun setup(): Scenario {
        let mut scenario = ts::begin(SYSTEM);
        random::create_for_testing(scenario.ctx());
        bp::init_for_testing(scenario.ctx());
        wheel::init_for_testing(scenario.ctx());

        scenario.next_tx(SYSTEM);
        let mut rnd = scenario.take_shared<Random>();
        rnd.update_randomness_state_for_testing(
            0,
            x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
            scenario.ctx(),
        );
        ts::return_shared(rnd);

        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"wheel", MAX_PAYOUT, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);

        scenario.next_tx(SYSTEM);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::treasury_deposit(&mut pool, &cap, coin::mint_for_testing<NUSDC>(SEED, scenario.ctx()), &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::install_game_cap(&admin, &mut registry, cap);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
        scenario
    }

    fun spin_many(scenario: &mut Scenario, n: u64, bet: u64) {
        let mut registry = scenario.take_shared<WheelRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let rnd = scenario.take_shared<Random>();
        let clk = clock::create_for_testing(scenario.ctx());
        let start_balance = bp::pool_balance(&pool);
        let mut i = 0;
        while (i < n) {
            let c = coin::mint_for_testing<NUSDC>(bet, scenario.ctx());
            wheel::spin_for_testing(&mut registry, &mut pool, c, &rnd, &clk, scenario.ctx());
            assert!(bp::game_open_exposure(&pool, GAME_ID) == 0, 1000 + i);
            assert!(bp::open_exposure(&pool) == 0, 2000 + i);
            i = i + 1;
        };
        // Some spins must have paid and some lost, or the test proves little.
        let (_, plays, prizes) = wheel::registry_stats(&registry);
        assert!(plays >= n, 3000);
        assert!(prizes > 0, 3001);
        assert!(bp::pool_balance(&pool) != start_balance + n * bet, 3002);
        clock::destroy_for_testing(clk);
        ts::return_shared(rnd);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    #[test]
    fun test_every_spin_pairs() {
        let mut scenario = setup();
        spin_many(&mut scenario, 40, 100_000_000);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::EObsolete)]
    fun test_move_is_obsolete() {
        let mut scenario = setup();
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::move_game_cap_to_field(&admin, &mut registry);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::EGameCapAlreadyInstalled)]
    fun test_second_install_aborts() {
        let mut scenario = setup();
        let second = sentinel(&mut scenario, false);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::install_game_cap(&admin, &mut registry, second);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    // ---- legacy seals ----

    /// A second cap for the same game, revoked unless `revoke` is false.
    fun sentinel(scenario: &mut Scenario, revoke: bool): GameCap {
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"sentinel", 1, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);
        scenario.next_tx(SYSTEM);
        let mut cap = scenario.take_from_sender<GameCap>();
        if (revoke) {
            let bp_admin = scenario.take_from_sender<BpAdminCap>();
            let clk = clock::create_for_testing(scenario.ctx());
            bp::revoke_game_cap(&bp_admin, &mut cap, &clk);
            clock::destroy_for_testing(clk);
            scenario.return_to_sender(bp_admin);
        };
        scenario.next_tx(SYSTEM);
        cap
    }

    /// Both legacy places sealed, as on devnet.
    fun seal_both(scenario: &mut Scenario) {
        let slot = sentinel(scenario, true);
        let field = sentinel(scenario, true);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::seal_legacy_slot(&admin, &mut registry, slot);
        wheel::seal_legacy_field(&admin, &mut registry, field);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
    }

    #[test]
    fun test_sealed_legacy_keeps_game_running() {
        let mut scenario = setup();
        seal_both(&mut scenario);
        spin_many(&mut scenario, 10, 50_000_000);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::ESentinelNotRevoked)]
    fun test_seal_slot_rejects_live_cap() {
        let mut scenario = setup();
        let live = sentinel(&mut scenario, false);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::seal_legacy_slot(&admin, &mut registry, live);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::ESentinelNotRevoked)]
    fun test_seal_field_rejects_live_cap() {
        let mut scenario = setup();
        let live = sentinel(&mut scenario, false);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::seal_legacy_field(&admin, &mut registry, live);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    // ---- version gate ----

    fun migrate(scenario: &mut Scenario) {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::migrate(&admin, &mut registry);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
    }

    fun stamp(scenario: &mut Scenario, version: u64) {
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::stamp_version_for_testing(&mut registry, version);
        ts::return_shared(registry);
        scenario.next_tx(SYSTEM);
    }

    #[test]
    fun test_migrate_from_live_chain_state() {
        // Devnet: both legacy places sealed, version 1 stamped.
        let mut scenario = setup();
        seal_both(&mut scenario);
        stamp(&mut scenario, 1);
        migrate(&mut scenario);
        spin_many(&mut scenario, 10, 50_000_000);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::ELedgerAlreadyCurrent)]
    fun test_migrate_twice_aborts() {
        let mut scenario = setup();
        migrate(&mut scenario);
        migrate(&mut scenario);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::EWrongVersion)]
    fun test_later_version_retires_play() {
        let mut scenario = setup();
        migrate(&mut scenario);
        stamp(&mut scenario, 3);
        spin_many(&mut scenario, 1, 50_000_000);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = wheel::EWrongVersion)]
    fun test_later_version_retires_admin() {
        let mut scenario = setup();
        migrate(&mut scenario);
        stamp(&mut scenario, 3);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<WheelRegistry>();
        wheel::set_paused(&admin, &mut registry, true);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    #[test]
    fun test_runs_on_older_stamp_before_migrate() {
        // Between the upgrade and its migrate the registry still carries the
        // previous version's stamp; this version must already accept bets.
        let mut scenario = setup();
        stamp(&mut scenario, 1);
        spin_many(&mut scenario, 5, 50_000_000);
        ts::end(scenario);
    }
}
