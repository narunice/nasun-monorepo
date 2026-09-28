/// Reservation ledger tests for the upgraded mines: a session reserves once
/// at creation and releases once however it ends, sessions that end in
/// reveal_cell or forfeit_session settle through the pending queue, and
/// legacy sessions settle against the unattributed remainder.
#[test_only]
module gostop_mines::mines_ledger_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::clock;
    use sui::random::{Self, Random};
    use bankroll_pool::bankroll_pool::{Self as bp, AdminCap as BpAdminCap, GameCap, BankrollPool};
    use devnet_tokens::nusdc::NUSDC;
    use gostop_mines::mines::{Self, AdminCap, MinesRegistry, MinesSession};

    const SYSTEM: address = @0x0;
    const ALICE: address = @0xA1;
    const BOB: address = @0xB0;
    const GAME_ID: u8 = 5;
    const CAP_MAX: u64 = 2_000_000_000;
    const BET: u64 = 1_000_000;

    fun setup(): Scenario {
        let mut scenario = ts::begin(SYSTEM);
        random::create_for_testing(scenario.ctx());
        bp::init_for_testing(scenario.ctx());
        mines::init_for_testing(scenario.ctx());

        scenario.next_tx(SYSTEM);
        let mut rnd = scenario.take_shared<Random>();
        rnd.update_randomness_state_for_testing(
            0,
            x"3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C3C",
            scenario.ctx(),
        );
        ts::return_shared(rnd);

        let bp_admin = scenario.take_from_sender<BpAdminCap>();
        bp::issue_game_cap(&bp_admin, GAME_ID, b"mines", CAP_MAX, SYSTEM, scenario.ctx());
        scenario.return_to_sender(bp_admin);

        scenario.next_tx(SYSTEM);
        let cap = scenario.take_from_sender<GameCap>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        bp::treasury_deposit(&mut pool, &cap, coin::mint_for_testing<NUSDC>(100_000_000_000, scenario.ctx()), &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);

        let admin = scenario.take_from_sender<AdminCap>();
        let mut registry = scenario.take_shared<MinesRegistry>();
        mines::install_game_cap(&admin, &mut registry, cap);
        mines::set_max_bet(&admin, &mut registry, 100_000_000);
        ts::return_shared(registry);
        scenario.return_to_sender(admin);
        scenario
    }

    fun open_session(scenario: &mut Scenario, player: address, mine_count: u8, legacy: bool) {
        scenario.next_tx(player);
        let mut registry = scenario.take_shared<MinesRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let rnd = scenario.take_shared<Random>();
        let clk = clock::create_for_testing(scenario.ctx());
        let c = coin::mint_for_testing<NUSDC>(BET, scenario.ctx());
        if (legacy) {
            mines::create_legacy_session_for_testing(&mut registry, &mut pool, c, mine_count, &rnd, &clk, scenario.ctx());
        } else {
            mines::create_session_for_testing(&mut registry, &mut pool, c, mine_count, &rnd, &clk, scenario.ctx());
        };
        clock::destroy_for_testing(clk);
        ts::return_shared(rnd);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    /// First unrevealed cell that is (or is not) a mine on this session.
    fun pick_cell(session: &MinesSession, want_mine: bool): u8 {
        let mines_at = mines::mine_positions_for_testing(session);
        let revealed = mines::session_revealed(session);
        let mut i: u8 = 0;
        while (i < 25) {
            let open = !*vector::borrow(&revealed, i as u64);
            if (open && vector::contains(&mines_at, &i) == want_mine) return i;
            i = i + 1;
        };
        abort 9999
    }

    fun reveal(scenario: &mut Scenario, player: address, want_mine: bool) {
        scenario.next_tx(player);
        let session = scenario.take_from_sender<MinesSession>();
        let cell = pick_cell(&session, want_mine);
        let mut registry = scenario.take_shared<MinesRegistry>();
        let clk = clock::create_for_testing(scenario.ctx());
        mines::reveal_cell_for_testing(session, &mut registry, cell, &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        ts::return_shared(registry);
    }

    fun cashout(scenario: &mut Scenario, player: address) {
        scenario.next_tx(player);
        let session = scenario.take_from_sender<MinesSession>();
        let mut registry = scenario.take_shared<MinesRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        mines::cashout_for_testing(session, &mut registry, &mut pool, &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    fun forfeit(scenario: &mut Scenario, player: address) {
        scenario.next_tx(player);
        let session = scenario.take_from_sender<MinesSession>();
        let mut registry = scenario.take_shared<MinesRegistry>();
        let clk = clock::create_for_testing(scenario.ctx());
        mines::forfeit_for_testing(session, &mut registry, &clk, scenario.ctx());
        clock::destroy_for_testing(clk);
        ts::return_shared(registry);
    }

    fun flush(scenario: &mut Scenario) {
        scenario.next_tx(SYSTEM);
        let mut registry = scenario.take_shared<MinesRegistry>();
        let mut pool = scenario.take_shared<BankrollPool>();
        let clk = clock::create_for_testing(scenario.ctx());
        mines::flush_pending_releases(&mut registry, &mut pool, &clk);
        clock::destroy_for_testing(clk);
        ts::return_shared(pool);
        ts::return_shared(registry);
    }

    /// (game exposure, attributed, total)
    fun exposure(scenario: &mut Scenario): (u64, u64, u64) {
        scenario.next_tx(SYSTEM);
        let pool = scenario.take_shared<BankrollPool>();
        let game = bp::game_open_exposure(&pool, GAME_ID);
        let attributed = bp::attributed_open_exposure(&pool);
        let total = bp::open_exposure(&pool);
        ts::return_shared(pool);
        (game, attributed, total)
    }

    /// 1 mine: the full-board payout is BET * 24.25x, well under the cap, so
    /// the reservation is the full-board figure rather than the cap.
    fun one_mine_reserve(): u64 {
        ((BET as u128) * (mines::max_multiplier_bps_for_testing(1) as u128) / 10_000) as u64
    }

    #[test]
    fun test_reserve_is_the_session_ceiling() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 1, false);
        let (game, _, total) = exposure(&mut scenario);
        assert!(game == one_mine_reserve(), 1);
        assert!(game < CAP_MAX, 2);
        assert!(total == game, 3);

        // 12 mines: the full board is astronomically large, so the cap binds.
        open_session(&mut scenario, BOB, 12, false);
        let (game2, _, _) = exposure(&mut scenario);
        assert!(game2 == one_mine_reserve() + CAP_MAX, 4);
        ts::end(scenario);
    }

    #[test]
    fun test_cashout_releases() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 1, false);
        reveal(&mut scenario, ALICE, false);
        reveal(&mut scenario, ALICE, false);
        cashout(&mut scenario, ALICE);
        let (game, attributed, total) = exposure(&mut scenario);
        assert!(game == 0 && attributed == 0 && total == 0, 10);
        ts::end(scenario);
    }

    #[test]
    fun test_mine_hit_queues_then_flushes() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 3, false);
        let (reserved, _, _) = exposure(&mut scenario);
        reveal(&mut scenario, ALICE, true);
        // reveal_cell holds no pool, so the reservation is still standing.
        let (queued, _, _) = exposure(&mut scenario);
        assert!(queued == reserved, 20);
        flush(&mut scenario);
        let (game, _, total) = exposure(&mut scenario);
        assert!(game == 0 && total == 0, 21);
        ts::end(scenario);
    }

    #[test]
    fun test_next_session_flushes_forfeit() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 2, false);
        forfeit(&mut scenario, ALICE);
        // Bob's create_session settles Alice's queued release first.
        open_session(&mut scenario, BOB, 1, false);
        let (game, _, total) = exposure(&mut scenario);
        assert!(game == one_mine_reserve(), 30);
        assert!(total == game, 31);
        ts::end(scenario);
    }

    #[test]
    fun test_legacy_sessions_settle_against_unattributed() {
        let mut scenario = setup();
        // Two legacy sessions (cap max each, unattributed) and one paired.
        open_session(&mut scenario, ALICE, 1, true);
        open_session(&mut scenario, BOB, 1, true);
        open_session(&mut scenario, @0xC0, 1, false);
        let (game, attributed, total) = exposure(&mut scenario);
        assert!(game == one_mine_reserve() && attributed == game, 40);
        assert!(total == game + 2 * CAP_MAX, 41);

        // Alice's legacy session cashes out, Bob's hits a mine.
        reveal(&mut scenario, ALICE, false);
        cashout(&mut scenario, ALICE);
        reveal(&mut scenario, BOB, true);
        flush(&mut scenario);
        let (game2, attributed2, total2) = exposure(&mut scenario);
        assert!(game2 == one_mine_reserve() && attributed2 == game2, 42);
        assert!(total2 == game2, 43);
        ts::end(scenario);
    }

    #[test]
    fun test_reset_counts_legacy_on_chain() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 1, true);
        open_session(&mut scenario, BOB, 1, true);
        open_session(&mut scenario, @0xC0, 1, false);
        // A legacy leak with no session behind it (a lost wheel spin under
        // the old code): collect_bet with nothing to release it.
        scenario.next_tx(SYSTEM);
        {
            let bp_admin = scenario.take_from_sender<BpAdminCap>();
            bp::issue_game_cap(&bp_admin, 6, b"leak", 500_000_000, SYSTEM, scenario.ctx());
            scenario.return_to_sender(bp_admin);
        };
        scenario.next_tx(SYSTEM);
        {
            let leak_cap = scenario.take_from_sender<GameCap>();
            let mut pool = scenario.take_shared<BankrollPool>();
            let clk = clock::create_for_testing(scenario.ctx());
            bp::collect_bet(&mut pool, &leak_cap, coin::mint_for_testing<NUSDC>(BET, scenario.ctx()), SYSTEM, &clk);
            clock::destroy_for_testing(clk);
            ts::return_shared(pool);
            scenario.return_to_sender(leak_cap);
        };
        // Bob's legacy session ends, queued but not yet flushed.
        reveal(&mut scenario, BOB, true);

        scenario.next_tx(SYSTEM);
        {
            let admin = scenario.take_from_sender<AdminCap>();
            let bp_admin = scenario.take_from_sender<BpAdminCap>();
            let mut registry = scenario.take_shared<MinesRegistry>();
            let mut pool = scenario.take_shared<BankrollPool>();
            let clk = clock::create_for_testing(scenario.ctx());
            mines::reset_legacy_exposure(&admin, &bp_admin, &mut registry, &mut pool, &clk);
            clock::destroy_for_testing(clk);
            ts::return_shared(pool);
            ts::return_shared(registry);
            scenario.return_to_sender(bp_admin);
            scenario.return_to_sender(admin);
        };
        // Leak discarded, Bob's ended session not counted, Alice's still is.
        let (game, attributed, total) = exposure(&mut scenario);
        assert!(game == one_mine_reserve() && attributed == game, 50);
        assert!(total == game + CAP_MAX, 51);

        // Alice cashes out: back to exactly the paired session.
        reveal(&mut scenario, ALICE, false);
        cashout(&mut scenario, ALICE);
        let (_, _, total2) = exposure(&mut scenario);
        assert!(total2 == one_mine_reserve(), 52);
        ts::end(scenario);
    }

    #[test]
    fun test_cap_move_keeps_sessions_settling() {
        let mut scenario = setup();
        open_session(&mut scenario, ALICE, 1, false);
        scenario.next_tx(SYSTEM);
        {
            let admin = scenario.take_from_sender<AdminCap>();
            let mut registry = scenario.take_shared<MinesRegistry>();
            mines::move_game_cap_to_field(&admin, &mut registry);
            assert!(mines::is_game_cap_installed(&registry), 60);
            ts::return_shared(registry);
            scenario.return_to_sender(admin);
        };
        reveal(&mut scenario, ALICE, false);
        cashout(&mut scenario, ALICE);
        open_session(&mut scenario, BOB, 1, false);
        let (game, _, total) = exposure(&mut scenario);
        assert!(game == one_mine_reserve() && total == game, 61);
        ts::end(scenario);
    }

}
