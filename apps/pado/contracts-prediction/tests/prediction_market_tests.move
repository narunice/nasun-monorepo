// Copyright (c) Nasun
// SPDX-License-Identifier: Apache-2.0

#[test_only]
module prediction::prediction_market_tests;

use prediction::prediction_market::{
    AdminCap,
    Market,
    Position,
    init_for_testing,
    create_market,
    mint_outcome_tokens,
    place_buy_maker,
    place_sell_maker,
    place_buy_taker,
    cancel_order,
    get_position_shares,
    is_position_yes,
    get_position_cost_basis,
    get_yes_supply,
    get_no_supply,
    get_total_volume,
    get_collateral_balance,
};

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::test_scenario::{Self as ts, Scenario};
use devnet_tokens::nusdc::NUSDC;

// Test addresses
const CREATOR: address = @0xC1EA70;
const RESOLVER: address = @0x4E501;
const USER1: address = @0x1111;
const USER2: address = @0x2222;

// NUSDC has 6 decimals.
const NUSDC_UNIT: u64 = 1_000_000;

// Default close/resolve offsets in milliseconds.
const CLOSE_OFFSET_MS: u64 = 3_600_000;             // 1 hour
const RESOLVE_OFFSET_MS: u64 = 7_200_000;           // 2 hours
const START_TIME_MS: u64 = 1_000_000;

// ===== Test helpers =====

fun setup_clock(scenario: &mut Scenario): Clock {
    let mut clock = clock::create_for_testing(ts::ctx(scenario));
    clock::set_for_testing(&mut clock, START_TIME_MS);
    clock
}

fun setup_market(scenario: &mut Scenario): ID {
    // Tx 0: init module (run by Sui in publish; emulate here).
    init_for_testing(ts::ctx(scenario));
    ts::next_tx(scenario, CREATOR);

    // Tx 1: AdminCap is now in CREATOR's inventory; create market.
    let admin_cap = ts::take_from_sender<AdminCap>(scenario);
    let clock = setup_clock(scenario);
    create_market(
        &admin_cap,
        b"Will X happen?".to_string(),
        b"Test prediction market".to_string(),
        b"sports".to_string(),
        b"https://example.com/source".to_string(),
        b"Resolves YES if X happens by close time".to_string(),
        START_TIME_MS + CLOSE_OFFSET_MS,
        START_TIME_MS + RESOLVE_OFFSET_MS,
        RESOLVER,
        &clock,
        ts::ctx(scenario),
    );
    clock::destroy_for_testing(clock);
    ts::return_to_sender(scenario, admin_cap);
    ts::next_tx(scenario, CREATOR);

    // Capture market ID.
    let market = ts::take_shared<Market>(scenario);
    let mid = object::id(&market);
    ts::return_shared(market);
    mid
}

fun take_market(scenario: &Scenario): Market {
    ts::take_shared<Market>(scenario)
}

fun mint_nusdc(scenario: &mut Scenario, amount: u64): Coin<NUSDC> {
    coin::mint_for_testing<NUSDC>(amount, ts::ctx(scenario))
}

/// Take both YES and NO Positions from sender's inventory. Caller decides what to do
/// with each. Useful after mint_outcome_tokens.
fun take_yes_no_positions(scenario: &Scenario): (Position, Position) {
    let positions = ts::ids_for_sender<Position>(scenario);
    let mut yes_opt = option::none<Position>();
    let mut no_opt = option::none<Position>();
    let mut i = 0;
    while (i < vector::length(&positions)) {
        let pos = ts::take_from_sender_by_id<Position>(scenario, *vector::borrow(&positions, i));
        if (is_position_yes(&pos)) {
            option::fill(&mut yes_opt, pos);
        } else {
            option::fill(&mut no_opt, pos);
        };
        i = i + 1;
    };
    let yes_pos = option::extract(&mut yes_opt);
    let no_pos = option::extract(&mut no_opt);
    option::destroy_none(yes_opt);
    option::destroy_none(no_opt);
    (yes_pos, no_pos)
}

/// Mint NUSDC and call mint_outcome_tokens for `user`, leaving them with both Positions.
fun user_mints(scenario: &mut Scenario, user: address, amount: u64) {
    ts::next_tx(scenario, user);
    let mut market = take_market(scenario);
    let clock = setup_clock(scenario);
    let payment = mint_nusdc(scenario, amount);
    mint_outcome_tokens(&mut market, payment, &clock, ts::ctx(scenario));
    clock::destroy_for_testing(clock);
    ts::return_shared(market);
}

// ============================================
// P0 Tests
// ============================================

/// P0 #1: mint → place_sell_maker → place_buy_taker fully fills.
/// Verify: Position transferred to taker, NUSDC delivered to maker,
/// supply unchanged (still equal to initial mint).
#[test]
fun test_buy_taker_full_fill() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    user_mints(scenario, USER1, 100 * NUSDC_UNIT);

    // Verify supply & pool after mint.
    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        assert!(get_yes_supply(&market) == 100 * NUSDC_UNIT, 0);
        assert!(get_no_supply(&market) == 100 * NUSDC_UNIT, 0);
        assert!(get_collateral_balance(&market) == 100 * NUSDC_UNIT, 0);
        ts::return_shared(market);
    };

    // U1 places sell maker for full YES Position at price 6000 (60%).
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let (yes_position, no_position) = take_yes_no_positions(scenario);
        place_sell_maker(&mut market, yes_position, 6000, &clock, ts::ctx(scenario));
        ts::return_to_sender(scenario, no_position);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 places buy taker, paying 60 NUSDC (exactly enough for 100 shares at 60¢).
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 60 * NUSDC_UNIT);

        place_buy_taker(
            &mut market,
            true,                                // is_yes
            6000,                                // max_price
            true,                                // rest_on_no_fill (limit mode)
            payment,
            &clock,
            ts::ctx(scenario),
        );

        // After fill: total_volume = 60 NUSDC.
        assert!(get_total_volume(&market) == 60 * NUSDC_UNIT, 1);
        // Pool: 100 NUSDC initial mint - 0 (maker paid from taker) = 100. Then taker paid 60 to maker
        // directly (NOT via pool), so pool stays at 100.
        assert!(get_collateral_balance(&market) == 100 * NUSDC_UNIT, 2);
        // Supply unchanged.
        assert!(get_yes_supply(&market) == 100 * NUSDC_UNIT, 3);
        assert!(get_no_supply(&market) == 100 * NUSDC_UNIT, 4);

        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 should now own a YES Position with 100 shares.
    ts::next_tx(scenario, USER2);
    {
        let user2_pos = ts::take_from_sender<Position>(scenario);
        assert!(is_position_yes(&user2_pos) == true, 5);
        assert!(get_position_shares(&user2_pos) == 100 * NUSDC_UNIT, 6);
        assert!(get_position_cost_basis(&user2_pos) == 60 * NUSDC_UNIT, 7);
        ts::return_to_sender(scenario, user2_pos);
    };

    // U1 should have received 60 NUSDC.
    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) == 60 * NUSDC_UNIT, 8);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}

/// P0 #2: place_buy_taker partial fill — leftover rests as bid with exact locked_nusdc.
/// U1 sells 50 YES at 60¢. U2 buys with 60 NUSDC (would buy 100 shares at 60¢ if there were
/// 100 available; only 50 available → fills 50 at 30 NUSDC, leaves 30 NUSDC resting).
#[test]
fun test_buy_taker_partial_fill_rest() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    // U1 mints 50 NUSDC then sells YES (50 shares) at 60¢.
    user_mints(scenario, USER1, 50 * NUSDC_UNIT);
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let (yes_position, no_position) = take_yes_no_positions(scenario);
        place_sell_maker(&mut market, yes_position, 6000, &clock, ts::ctx(scenario));
        ts::return_to_sender(scenario, no_position);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 places buy taker for 60 NUSDC at max 6000.
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 60 * NUSDC_UNIT);
        place_buy_taker(
            &mut market, true, 6000, true, payment, &clock, ts::ctx(scenario),
        );
        // Filled 50 shares at 6000 = 30 NUSDC; 30 NUSDC remaining → leftover bid.
        assert!(get_total_volume(&market) == 30 * NUSDC_UNIT, 1);
        // Pool: 50 (initial mint) + 30 (resting bid locked_nusdc) = 80.
        assert!(get_collateral_balance(&market) == 80 * NUSDC_UNIT, 2);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 should have YES Position (50 shares, cost_basis = 30 NUSDC paid).
    ts::next_tx(scenario, USER2);
    {
        let pos = ts::take_from_sender<Position>(scenario);
        assert!(is_position_yes(&pos) == true, 3);
        assert!(get_position_shares(&pos) == 50 * NUSDC_UNIT, 4);
        assert!(get_position_cost_basis(&pos) == 30 * NUSDC_UNIT, 5);
        ts::return_to_sender(scenario, pos);
    };

    // U1 should have received 30 NUSDC.
    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) == 30 * NUSDC_UNIT, 6);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}

/// P0 #3: place_buy_taker with rest_on_no_fill=false (Market mode) and empty asks
/// must abort ENoFillsAtMarketPrice. (Error code 19.)
#[test]
#[expected_failure(abort_code = 19, location = prediction::prediction_market)]
fun test_buy_taker_market_mode_no_fill_aborts() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    // No mint, no asks — book empty.
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 60 * NUSDC_UNIT);
        // Market mode (rest_on_no_fill=false) — should abort.
        place_buy_taker(
            &mut market, true, 6000, false, payment, &clock, ts::ctx(scenario),
        );
        // Unreachable.
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// P0 #5: cancel ask → Position re-minted with original cost_basis preserved.
#[test]
fun test_cancel_ask_remints_position() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    user_mints(scenario, USER1, 100 * NUSDC_UNIT);

    // U1 places sell maker. Order ID will be 1 (per-Market starts at 1).
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let (yes_position, no_position) = take_yes_no_positions(scenario);
        place_sell_maker(&mut market, yes_position, 6000, &clock, ts::ctx(scenario));
        ts::return_to_sender(scenario, no_position);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 cancels their own order. Should receive Position with original cost_basis.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        cancel_order(
            &mut market,
            true,                        // is_yes
            false,                       // is_bid (this was an ask)
            6000,                        // price
            1,                           // order_id (first order in this market)
            &clock,
            ts::ctx(scenario),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 should now have Position with 100 YES shares + cost_basis 100 (preserved from mint).
    ts::next_tx(scenario, USER1);
    {
        // Take all positions; should be NO position (kept from before) + re-minted YES.
        let positions = ts::ids_for_sender<Position>(scenario);
        assert!(vector::length(&positions) == 2, 10);

        let (yes_pos, no_pos) = take_yes_no_positions(scenario);
        assert!(get_position_shares(&yes_pos) == 100 * NUSDC_UNIT, 11);
        assert!(get_position_cost_basis(&yes_pos) == 100 * NUSDC_UNIT, 12);
        assert!(get_position_shares(&no_pos) == 100 * NUSDC_UNIT, 13);
        ts::return_to_sender(scenario, yes_pos);
        ts::return_to_sender(scenario, no_pos);
    };

    ts::end(scenario_val);
}

/// P0 #6: cancel auth — non-owner cannot cancel.
#[test]
#[expected_failure(abort_code = 9, location = prediction::prediction_market)]
fun test_cancel_other_user_aborts() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    user_mints(scenario, USER1, 100 * NUSDC_UNIT);

    // U1 places sell maker.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let (yes_position, no_position) = take_yes_no_positions(scenario);
        place_sell_maker(&mut market, yes_position, 6000, &clock, ts::ctx(scenario));
        ts::return_to_sender(scenario, no_position);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 tries to cancel U1's order → ENotOrderOwner = 9.
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        cancel_order(
            &mut market, true, false, 6000, 1, &clock, ts::ctx(scenario),
        );
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// P0 #4: cancel bid → NUSDC returned exactly; sorted index empties.
#[test]
fun test_cancel_bid_returns_nusdc() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    // U1 places buy maker (bid) for 30 NUSDC at price 5000 (50¢).
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 30 * NUSDC_UNIT);
        place_buy_maker(
            &mut market, true, 5000, payment, &clock, ts::ctx(scenario),
        );
        // Pool absorbed 30 NUSDC.
        assert!(get_collateral_balance(&market) == 30 * NUSDC_UNIT, 20);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 cancels — should get back 30 NUSDC.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        cancel_order(
            &mut market, true, true, 5000, 1, &clock, ts::ctx(scenario),
        );
        // Pool drained.
        assert!(get_collateral_balance(&market) == 0, 21);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) == 30 * NUSDC_UNIT, 22);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}
