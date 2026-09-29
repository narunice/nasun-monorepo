/// Reservation ledger tests for the upgraded buy: a bulk round reserves and
/// releases once per card, so the scratch card's paired exposure is zero after
/// every buy whatever the cards paid.
#[test_only]
module gostop_scratchcard::scratchcard_ledger_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::clock;
    use sui::random::{Self, Random};
    use bankroll_pool::bankroll_pool::{Self as bp, AdminCap as BpAdminCap, GameCap, BankrollPool};
    use devnet_tokens::nusdc::NUSDC;
    use gostop_scratchcard::scratchcard::{Self, AdminCap, ScratchCardRegistry};

    const SYSTEM: address = @0x0;
    const GAME_ID: u8 = 2;
    const MAX_PRIZE: u64 = 500_000_000;
    const CARD_PRICE: u64 = 5_000_000;

    fun setup(seed: u64): Scenario {
        let mut scenario = ts::begin(SYSTEM);
        random::create_for_testing(scenario.ctx());
        bp::init_for_testing(scenario.ctx());
        scratchcard::init_for_testing(scenario.ctx());

        scenario.next_tx(SYSTEM);
        let mut rnd = scenario.take_shared<Random>();
        rnd.update_randomness_state_for_testing(
            0,
            x"2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A2A",
            scenario.ctx(),
        );
        ts::return_shared(rnd);

        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"scratch", MAX_PRIZE, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);

        scenario.next_tx(SYSTEM);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::treasury_deposit(&mut pool, &cap, coin::mint_for_testing<NUSDC>(seed, scenario.ctx()), &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::install_game_cap(&admin, &mut registry, cap);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
        scenario
    }

    fun setup_default(): Scenario { setup(100_000_000_000) }

    fun buy_rounds(scenario: &mut Scenario, rounds: u64, count: u8) {
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let rnd = scenario.take_shared<Random>();
        let clk = clock::create_for_testing(scenario.ctx());
        let mut i = 0;
        while (i < rounds) {
            let pay = coin::mint_for_testing<NUSDC>(CARD_PRICE * (count as u64), scenario.ctx());
            scratchcard::buy_bulk_for_testing(&mut registry, &mut pool, pay, count, &rnd, &clk, scenario.ctx());
            assert!(bp::game_open_exposure(&pool, GAME_ID) == 0, 1000 + i);
            assert!(bp::open_exposure(&pool) == 0, 2000 + i);
            i = i + 1;
        };
        let (_, sold, prizes) = scratchcard::registry_stats(&registry);
        assert!(sold == rounds * (count as u64), 3000);
        // Several winning cards per test run, so the multi-payout path ran.
        assert!(prizes > 0, 3001);
        clock::destroy_for_testing(clk);
        ts::return_shared(rnd);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    #[test]
    fun test_bulk_rounds_pair() {
        let mut scenario = setup(100_000_000_000);
        buy_rounds(&mut scenario, 20, 10);
        ts::end(scenario);
    }

    #[test]
    fun test_single_rounds_pair_after_cap_move() {
        let mut scenario = setup(100_000_000_000);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::move_game_cap_to_field(&admin, &mut registry);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
        buy_rounds(&mut scenario, 60, 1);
        ts::end(scenario);
    }

    // pool 20_000 NUSDC, cap 20% = 4_000 NUSDC: a 10-card round needs 5_000
    // of reservations, so it is refused before any random is drawn.
    #[test]
    #[expected_failure(abort_code = bp::EUtilizationCapExceeded)]
    fun test_bulk_round_respects_utilization_cap() {
        let mut scenario = setup(20_000_000_000);
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::set_utilization_cap(&bp_admin, &mut pool, 2_000, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        scenario.return_to_sender(bp_admin);
        scenario.next_tx(SYSTEM);
        buy_rounds(&mut scenario, 1, 10);
        ts::end(scenario);
    }

    // ---- legacy slot seal ----

    /// Move the live cap out, then issue a second cap for the same game and
    /// optionally revoke it, returning it for the seal.
    fun moved_with_sentinel(scenario: &mut Scenario, revoke: bool): GameCap {
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::move_game_cap_to_field(&admin, &mut registry);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"sentinel", 1, SYSTEM, scenario.ctx());
        scenario.next_tx(SYSTEM);
        let mut sentinel = scenario.take_from_sender<GameCap>();
        if (revoke) {
            let clk = clock::create_for_testing(scenario.ctx());
            bp::revoke_game_cap(&bp_admin, &mut sentinel, &clk);
            clock::destroy_for_testing(clk);
        };
        scenario.return_to_sender(bp_admin);
        scenario.next_tx(SYSTEM);
        sentinel
    }

    #[test]
    fun test_sealed_slot_keeps_game_running() {
        let mut scenario = setup_default();
        let sentinel = moved_with_sentinel(&mut scenario, true);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::seal_legacy_slot(&admin, &mut registry, sentinel);
        assert!(scratchcard::is_game_cap_installed(&registry), 5000);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
        buy_rounds(&mut scenario, 10, 10);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = scratchcard::ESentinelNotRevoked)]
    fun test_seal_rejects_live_cap() {
        let mut scenario = setup_default();
        let sentinel = moved_with_sentinel(&mut scenario, false);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::seal_legacy_slot(&admin, &mut registry, sentinel);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = scratchcard::EGameCapAlreadyInstalled)]
    fun test_sealed_slot_refuses_install() {
        let mut scenario = setup_default();
        let sentinel = moved_with_sentinel(&mut scenario, true);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::seal_legacy_slot(&admin, &mut registry, sentinel);
        ts::return_shared(registry);
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"again", 1, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);
        scenario.next_tx(SYSTEM);
        let another = scenario.take_from_sender<GameCap>();
        let mut registry = scenario.take_shared<ScratchCardRegistry>();
        scratchcard::install_game_cap(&admin, &mut registry, another);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        ts::end(scenario);
    }
}
