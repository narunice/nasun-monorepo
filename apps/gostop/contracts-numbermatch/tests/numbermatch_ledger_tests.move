/// Reservation ledger tests for the upgraded play: every play reserves the
/// win and releases it whatever the draw, so the game's paired exposure is
/// zero after each play, before and after the GameCap moves and the legacy
/// slot is sealed.
#[test_only]
module gostop_numbermatch::numbermatch_ledger_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::clock;
    use sui::random::{Self, Random};
    use bankroll_pool::bankroll_pool::{Self as bp, AdminCap as BpAdminCap, GameCap, BankrollPool};
    use devnet_tokens::nusdc::NUSDC;
    use gostop_numbermatch::numbermatch::{Self, AdminCap, NumberMatchRegistry};

    const SYSTEM: address = @0x0;
    const GAME_ID: u8 = 3;
    const CAP_MAX: u64 = 20_000_000;
    const PRICE: u64 = 5_000_000;

    fun setup(): Scenario {
        let mut scenario = ts::begin(SYSTEM);
        random::create_for_testing(scenario.ctx());
        bp::init_for_testing(scenario.ctx());
        numbermatch::init_for_testing(scenario.ctx());

        scenario.next_tx(SYSTEM);
        let mut rnd = scenario.take_shared<Random>();
        rnd.update_randomness_state_for_testing(
            0,
            x"4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D4D",
            scenario.ctx(),
        );
        ts::return_shared(rnd);

        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"numbermatch", CAP_MAX, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);

        scenario.next_tx(SYSTEM);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::treasury_deposit(&mut pool, &cap, coin::mint_for_testing<NUSDC>(100_000_000_000, scenario.ctx()), &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<NumberMatchRegistry>();
        numbermatch::install_game_cap(&admin, &mut registry, cap);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);
        scenario
    }

    fun play_many(scenario: &mut Scenario, n: u64) {
        let mut registry = scenario.take_shared<NumberMatchRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let rnd = scenario.take_shared<Random>();
        let clk = clock::create_for_testing(scenario.ctx());
        let mut i = 0;
        while (i < n) {
            let picks = if (i % 3 == 0) { vector[1u8] } else if (i % 3 == 1) { vector[2u8, 4u8] } else { vector[1u8, 3u8, 5u8] };
            let pay = coin::mint_for_testing<NUSDC>(PRICE * vector::length(&picks), scenario.ctx());
            numbermatch::play_for_testing(&mut registry, &mut pool, pay, picks, &rnd, &clk, scenario.ctx());
            assert!(bp::game_open_exposure(&pool, GAME_ID) == 0, 1000 + i);
            assert!(bp::open_exposure(&pool) == 0, 2000 + i);
            i = i + 1;
        };
        let (_, plays, _) = numbermatch::registry_stats(&registry);
        assert!(plays >= n, 3000);
        clock::destroy_for_testing(clk);
        ts::return_shared(rnd);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    #[test]
    fun test_every_play_pairs() {
        let mut scenario = setup();
        play_many(&mut scenario, 30);
        ts::end(scenario);
    }

    #[test]
    fun test_plays_after_cap_move_and_seal() {
        let mut scenario = setup();
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<NumberMatchRegistry>();
        numbermatch::move_game_cap_to_field(&admin, &mut registry);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"sentinel", 1, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);
        scenario.next_tx(SYSTEM);

        let mut sentinel = scenario.take_from_sender<GameCap>();
        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::revoke_game_cap(&bp_admin, &mut sentinel, &clk);
        clock::destroy_for_testing(clk);
        scenario.return_to_sender(bp_admin);
        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<NumberMatchRegistry>();
        numbermatch::seal_legacy_slot(&admin, &mut registry, sentinel);
        assert!(numbermatch::is_game_cap_installed(&registry), 4000);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario.next_tx(SYSTEM);

        play_many(&mut scenario, 12);
        ts::end(scenario);
    }
}
