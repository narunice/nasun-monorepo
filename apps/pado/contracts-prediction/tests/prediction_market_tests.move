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
    place_sell_taker,
    cancel_order,
    cancel_expired_market,
    claim_resting_order_refund,
    claim_cancelled_refund,
    resolve_market,
    claim_winnings,
    burn_losing_position,
    merge_positions,
    merge_positions_entry,
    get_position_shares,
    is_position_yes,
    get_position_cost_basis,
    get_position_market,
    get_yes_supply,
    get_no_supply,
    get_total_volume,
    get_collateral_balance,
    get_market_status,
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

/// P0 #8: cancel_expired_market + claim_resting_order_refund (CANCELLED branch).
/// Bid maker recovers locked_nusdc when market expires unresolved.
#[test]
fun test_cancelled_market_resting_bid_refund() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    // U1 places buy maker for 30 NUSDC at 5000.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 30 * NUSDC_UNIT);
        place_buy_maker(&mut market, true, 5000, payment, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // Time advances past resolve_deadline (START + 7_200_000); use 10_000_000.
    // Anyone calls cancel_expired_market.
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, START_TIME_MS + RESOLVE_OFFSET_MS + 1_000);
        cancel_expired_market(&mut market, &clock);
        assert!(get_market_status(&market) == 3, 30); // STATUS_CANCELLED
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 claims their resting bid refund.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        claim_resting_order_refund(
            &mut market,
            true,                                 // is_yes
            true,                                 // is_bid
            5000,                                 // price
            1,                                    // order_id
            ts::ctx(scenario),
        );
        // Pool drained.
        assert!(get_collateral_balance(&market) == 0, 31);
        ts::return_shared(market);
    };

    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) == 30 * NUSDC_UNIT, 32);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}

/// P0 #9: resolve_market + claim_resting_order_refund (RESOLVED branch).
/// Bid maker recovers locked_nusdc; minter claims winnings on YES Position.
/// This is the round-2-audit Critical C7 fix verification: resolved markets must NOT
/// trap resting maker funds.
#[test]
fun test_resolved_market_resting_bid_refund_and_winnings() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _market_id = setup_market(scenario);

    // U1 mints 100 NUSDC (will be the eventual winner of YES outcome).
    user_mints(scenario, USER1, 100 * NUSDC_UNIT);

    // U2 places resting bid for 30 NUSDC at 5000 (never filled).
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 30 * NUSDC_UNIT);
        place_buy_maker(&mut market, true, 5000, payment, &clock, ts::ctx(scenario));
        // Pool: 100 (U1 mint) + 30 (U2 bid locked) = 130.
        assert!(get_collateral_balance(&market) == 130 * NUSDC_UNIT, 40);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // Time advances past close_time but before resolve_deadline. Resolver calls
    // resolve_market with outcome=YES.
    ts::next_tx(scenario, RESOLVER);
    {
        let mut market = take_market(scenario);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, START_TIME_MS + CLOSE_OFFSET_MS + 1_000);
        resolve_market(&mut market, true, &clock, ts::ctx(scenario));
        assert!(get_market_status(&market) == 2, 41); // STATUS_RESOLVED
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U2 claims their resting bid refund (RESOLVED branch).
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        claim_resting_order_refund(
            &mut market, true, true, 5000, 1, ts::ctx(scenario),
        );
        // Pool: 130 - 30 = 100 (still backing winner claims).
        assert!(get_collateral_balance(&market) == 100 * NUSDC_UNIT, 42);
        ts::return_shared(market);
    };

    ts::next_tx(scenario, USER2);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) == 30 * NUSDC_UNIT, 43);
        ts::return_to_sender(scenario, received);
    };

    // U1 claims winnings on YES Position. NO position is left untouched (could be burned).
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let (yes_pos, no_pos) = take_yes_no_positions(scenario);
        claim_winnings(&mut market, yes_pos, ts::ctx(scenario));
        // Pool drained: 100 - 100 = 0.
        assert!(get_collateral_balance(&market) == 0, 44);
        // Winning supply decremented.
        assert!(get_yes_supply(&market) == 0, 45);
        // NO supply unchanged (NO position not burned yet).
        assert!(get_no_supply(&market) == 100 * NUSDC_UNIT, 46);
        ts::return_to_sender(scenario, no_pos);
        ts::return_shared(market);
    };

    ts::next_tx(scenario, USER1);
    {
        let payout = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&payout) == 100 * NUSDC_UNIT, 47);
        ts::return_to_sender(scenario, payout);
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

// ============================================
// Position Merge Tests
// ============================================

/// Helper — take all Positions in sender's inventory filtered by is_yes.
fun take_positions_by_side(scenario: &Scenario, want_yes: bool): vector<Position> {
    let ids = ts::ids_for_sender<Position>(scenario);
    let mut out = vector::empty<Position>();
    let mut i = 0;
    while (i < vector::length(&ids)) {
        let pos = ts::take_from_sender_by_id<Position>(scenario, *vector::borrow(&ids, i));
        if (is_position_yes(&pos) == want_yes) {
            vector::push_back(&mut out, pos);
        } else {
            ts::return_to_sender(scenario, pos);
        };
        i = i + 1;
    };
    out
}

/// Merge with a single input must be the identity on shares/cost_basis.
#[test]
fun test_merge_single_position_identity() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 50 * NUSDC_UNIT);

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let (yes_pos, no_pos) = take_yes_no_positions(scenario);
        ts::return_to_sender(scenario, no_pos);

        let mut inputs = vector::empty<Position>();
        vector::push_back(&mut inputs, yes_pos);

        let merged = merge_positions(&market, inputs, ts::ctx(scenario));
        assert!(is_position_yes(&merged) == true, 1);
        assert!(get_position_shares(&merged) == 50 * NUSDC_UNIT, 2);
        assert!(get_position_cost_basis(&merged) == 50 * NUSDC_UNIT, 3);

        // Return merged to sender so scenario can drop it.
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// Merge 3 same-side Positions → sums of shares and cost_basis.
#[test]
fun test_merge_three_same_side() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    // Mint 3 times → 3 YES + 3 NO positions for USER1.
    user_mints(scenario, USER1, 30 * NUSDC_UNIT);
    user_mints(scenario, USER1, 70 * NUSDC_UNIT);
    user_mints(scenario, USER1, 100 * NUSDC_UNIT);

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 3, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        assert!(is_position_yes(&merged) == true, 2);
        assert!(get_position_shares(&merged) == 200 * NUSDC_UNIT, 3);
        assert!(get_position_cost_basis(&merged) == 200 * NUSDC_UNIT, 4);

        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// merge_positions_entry — standalone "merge and keep" path, leaves a single
/// Position in sender's inventory.
#[test]
fun test_merge_positions_entry_consolidates_inventory() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 25 * NUSDC_UNIT);
    user_mints(scenario, USER1, 75 * NUSDC_UNIT);

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let no_positions = take_positions_by_side(scenario, false);
        assert!(vector::length(&no_positions) == 2, 1);

        merge_positions_entry(&market, no_positions, ts::ctx(scenario));
        ts::return_shared(market);
    };

    // After entry call, USER1's inventory contains: 2 YES (untouched) + 1 merged NO.
    ts::next_tx(scenario, USER1);
    {
        let no_after = take_positions_by_side(scenario, false);
        assert!(vector::length(&no_after) == 1, 2);
        let merged = vector::borrow(&no_after, 0);
        assert!(get_position_shares(merged) == 100 * NUSDC_UNIT, 3);
        assert!(get_position_cost_basis(merged) == 100 * NUSDC_UNIT, 4);
        let mut leftover = no_after;
        let m = vector::pop_back(&mut leftover);
        vector::destroy_empty(leftover);
        ts::return_to_sender(scenario, m);
    };

    ts::end(scenario_val);
}

/// Mixing YES and NO Positions must abort with EMergeMismatch (23).
#[test]
#[expected_failure(abort_code = 23, location = prediction::prediction_market)]
fun test_merge_mixed_sides_aborts() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 50 * NUSDC_UNIT);

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let (yes_pos, no_pos) = take_yes_no_positions(scenario);

        let mut inputs = vector::empty<Position>();
        vector::push_back(&mut inputs, yes_pos);
        vector::push_back(&mut inputs, no_pos);

        let merged = merge_positions(&market, inputs, ts::ctx(scenario));
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// Empty vector input must abort with EMergeEmpty (22).
#[test]
#[expected_failure(abort_code = 22, location = prediction::prediction_market)]
fun test_merge_empty_vector_aborts() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let inputs = vector::empty<Position>();
        let merged = merge_positions(&market, inputs, ts::ctx(scenario));
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// Passing a Market reference whose ID does not match the Positions' market_id
/// must abort with EWrongMarket (21). Set up two markets, then try to merge a
/// market-1 Position while passing market-2 as the &Market arg.
///
/// Deterministic: market2 is identified by ID; we mint in market1 and then
/// take_shared_by_id(market2) for the merge call.
#[test]
#[expected_failure(abort_code = 21, location = prediction::prediction_market)]
fun test_merge_wrong_market_aborts() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;

    let market1_id = setup_market(scenario);

    // Create market 2.
    ts::next_tx(scenario, CREATOR);
    {
        let admin_cap = ts::take_from_sender<AdminCap>(scenario);
        let clock = setup_clock(scenario);
        create_market(
            &admin_cap,
            b"Second market?".to_string(),
            b"Another test".to_string(),
            b"sports".to_string(),
            b"https://example.com/source2".to_string(),
            b"Resolves YES if Y happens".to_string(),
            START_TIME_MS + CLOSE_OFFSET_MS,
            START_TIME_MS + RESOLVE_OFFSET_MS,
            RESOLVER,
            &clock,
            ts::ctx(scenario),
        );
        ts::return_to_sender(scenario, admin_cap);
        clock::destroy_for_testing(clock);
    };

    // Capture market 2's ID (it is the only shared Market not equal to market1_id).
    let market2_id: ID = {
        ts::next_tx(scenario, USER1);
        let m1 = ts::take_shared_by_id<Market>(scenario, market1_id);
        let m2 = ts::take_shared<Market>(scenario);
        let id2 = object::id(&m2);
        ts::return_shared(m1);
        ts::return_shared(m2);
        id2
    };

    // Mint in market 1 (user_mints uses generic take_market — which is fine when
    // only one shared Market is open; ensure deterministic mint into market1 by
    // returning market2 first via explicit take.)
    ts::next_tx(scenario, USER1);
    {
        // Park market2 out of the way (already returned above, no-op here).
        let mut market1 = ts::take_shared_by_id<Market>(scenario, market1_id);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 40 * NUSDC_UNIT);
        mint_outcome_tokens(&mut market1, payment, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market1);
    };

    // Take market2 explicitly, attempt to merge market-1 Position against it.
    ts::next_tx(scenario, USER1);
    {
        let market2 = ts::take_shared_by_id<Market>(scenario, market2_id);
        let (yes_pos, no_pos) = take_yes_no_positions(scenario);
        ts::return_to_sender(scenario, no_pos);

        let mut inputs = vector::empty<Position>();
        vector::push_back(&mut inputs, yes_pos);

        // yes_pos.market_id == market1_id; passing market2 must abort EWrongMarket.
        let merged = merge_positions(&market2, inputs, ts::ctx(scenario));
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market2);
    };

    ts::end(scenario_val);
}

/// Integration: merge two YES positions, then claim_winnings on the merged NFT.
/// Payout must equal Σ shares.
#[test]
fun test_merge_then_claim_winnings() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 40 * NUSDC_UNIT);
    user_mints(scenario, USER1, 60 * NUSDC_UNIT);

    // Resolve YES.
    ts::next_tx(scenario, RESOLVER);
    {
        let mut market = take_market(scenario);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, START_TIME_MS + CLOSE_OFFSET_MS + 1_000);
        resolve_market(&mut market, true, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // Merge then claim in the same tx.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        claim_winnings(&mut market, merged, ts::ctx(scenario));

        // U1 minted 40 + 60 = 100 NUSDC total. Pool starts at 100. Claim of 100
        // (shares = 40 + 60) drains it to 0. NO positions remain unburned but
        // are losers and carry no claim on the pool.
        assert!(get_collateral_balance(&market) == 0, 2);
        assert!(get_yes_supply(&market) == 0, 3);

        ts::return_shared(market);
    };

    ts::next_tx(scenario, USER1);
    {
        let payout = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&payout) == 100 * NUSDC_UNIT, 4);
        ts::return_to_sender(scenario, payout);
    };

    ts::end(scenario_val);
}

/// Integration: merge two NO positions, then burn_losing_position on the merged NFT.
#[test]
fun test_merge_then_burn_losing() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 20 * NUSDC_UNIT);
    user_mints(scenario, USER1, 30 * NUSDC_UNIT);

    // Resolve YES (so NO positions lose).
    ts::next_tx(scenario, RESOLVER);
    {
        let mut market = take_market(scenario);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, START_TIME_MS + CLOSE_OFFSET_MS + 1_000);
        resolve_market(&mut market, true, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // Merge 2 NO positions then burn.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let no_positions = take_positions_by_side(scenario, false);
        assert!(vector::length(&no_positions) == 2, 1);

        let merged = merge_positions(&market, no_positions, ts::ctx(scenario));
        burn_losing_position(&mut market, merged, ts::ctx(scenario));

        // NO supply drops by Σ = 50 NUSDC. Two mints created NO supply 50 total.
        assert!(get_no_supply(&market) == 0, 2);

        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

// ============================================
// Position Merge — Edge Cases
// ============================================

/// Merging Positions with *different* cost_basis values must sum (not average).
/// Without this guard a naive "merge identical positions" test would pass even
/// if the implementation averaged or copied first-only.
#[test]
fun test_merge_preserves_cost_basis_sum_distinct_values() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    // U1 mints YES via place_sell_maker pattern is awkward; we just use
    // mint_outcome_tokens which yields equal shares == cost_basis. To get
    // distinct cost_basis per Position we need fills at different prices.
    // Easiest: U1 sells YES at 60¢ to U2 (cost_basis=60 for 100 shares), then
    // U1 sells YES at 80¢ to U3 (cost_basis=80 for 100 shares). U2 then
    // receives YES from U3 reselling... too complex.
    //
    // Simpler: mint twice with different amounts, both yielding identical
    // cost_basis/shares per Position. To exercise *summation* (not averaging)
    // we mint amounts that produce distinct numerical values per Position.
    user_mints(scenario, USER1, 30 * NUSDC_UNIT);   // YES_a: shares=30, cost=30
    user_mints(scenario, USER1, 70 * NUSDC_UNIT);   // YES_b: shares=70, cost=70

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        // Sum: shares = 30 + 70 = 100; cost_basis = 30 + 70 = 100. Average
        // would be 50/50, half. Sum is the correct invariant.
        assert!(get_position_shares(&merged) == 100 * NUSDC_UNIT, 2);
        assert!(get_position_cost_basis(&merged) == 100 * NUSDC_UNIT, 3);

        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// Merge a larger batch (20 positions) to ensure the loop scales and gas
/// budget headroom is OK. Conservative — production cap is 256 per call.
#[test]
fun test_merge_large_batch_20_same_side() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    let mut i: u64 = 0;
    while (i < 20) {
        user_mints(scenario, USER1, 5 * NUSDC_UNIT);
        i = i + 1;
    };

    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 20, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        // 20 × 5 NUSDC = 100 NUSDC total shares + cost.
        assert!(get_position_shares(&merged) == 100 * NUSDC_UNIT, 2);
        assert!(get_position_cost_basis(&merged) == 100 * NUSDC_UNIT, 3);

        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// Two-market disagreement at the input vector level (not just &Market vs
/// inputs). When the first Position has market_id A and a subsequent Position
/// has market_id B, the merge must abort EMergeMismatch (23) even if &Market
/// matches the first Position's market.
#[test]
#[expected_failure(abort_code = 23, location = prediction::prediction_market)]
fun test_merge_positions_disagree_on_market_id() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;

    let market1_id = setup_market(scenario);

    // Create market 2.
    ts::next_tx(scenario, CREATOR);
    {
        let admin_cap = ts::take_from_sender<AdminCap>(scenario);
        let clock = setup_clock(scenario);
        create_market(
            &admin_cap,
            b"M2".to_string(),
            b"Test".to_string(),
            b"sports".to_string(),
            b"https://ex.com/s2".to_string(),
            b"Resolves YES".to_string(),
            START_TIME_MS + CLOSE_OFFSET_MS,
            START_TIME_MS + RESOLVE_OFFSET_MS,
            RESOLVER,
            &clock,
            ts::ctx(scenario),
        );
        ts::return_to_sender(scenario, admin_cap);
        clock::destroy_for_testing(clock);
    };

    let market2_id: ID = {
        ts::next_tx(scenario, USER1);
        let m1 = ts::take_shared_by_id<Market>(scenario, market1_id);
        let m2 = ts::take_shared<Market>(scenario);
        let id2 = object::id(&m2);
        ts::return_shared(m1);
        ts::return_shared(m2);
        id2
    };

    // Mint a YES Position in market1.
    ts::next_tx(scenario, USER1);
    {
        let mut market1 = ts::take_shared_by_id<Market>(scenario, market1_id);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 50 * NUSDC_UNIT);
        mint_outcome_tokens(&mut market1, payment, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market1);
    };
    // Mint a YES Position in market2.
    ts::next_tx(scenario, USER1);
    {
        let mut market2 = ts::take_shared_by_id<Market>(scenario, market2_id);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 50 * NUSDC_UNIT);
        mint_outcome_tokens(&mut market2, payment, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market2);
    };

    // Deterministically partition Positions by market using get_position_market
    // (we don't rely on inventory iteration order, which isn't guaranteed).
    // Construct inputs so &Market = market1 AND the first popped Position is
    // from market1 (passes the EWrongMarket guard), then the next iteration
    // sees a market2 Position → EMergeMismatch (23).
    ts::next_tx(scenario, USER1);
    {
        let market1 = ts::take_shared_by_id<Market>(scenario, market1_id);
        let market2 = ts::take_shared_by_id<Market>(scenario, market2_id);

        let all = take_positions_by_side(scenario, true);
        assert!(vector::length(&all) == 2, 50);

        // Partition by reading market_id via the public getter.
        let mut m1_pos_opt = option::none<Position>();
        let mut m2_pos_opt = option::none<Position>();
        let mut bag = all;
        while (!vector::is_empty(&bag)) {
            let p = vector::pop_back(&mut bag);
            if (get_position_market(&p) == market1_id) {
                option::fill(&mut m1_pos_opt, p);
            } else {
                option::fill(&mut m2_pos_opt, p);
            };
        };
        vector::destroy_empty(bag);
        let m1_pos = option::extract(&mut m1_pos_opt);
        let m2_pos = option::extract(&mut m2_pos_opt);
        option::destroy_none(m1_pos_opt);
        option::destroy_none(m2_pos_opt);

        // pop_back is LIFO. To set m1_pos as the anchor (first popped), push
        // m2_pos first, then m1_pos. Anchor passes &Market check (market1
        // matches); next iteration sees m2_pos with disagreeing market_id →
        // aborts EMergeMismatch.
        let mut inputs = vector::empty<Position>();
        vector::push_back(&mut inputs, m2_pos);
        vector::push_back(&mut inputs, m1_pos);

        let merged = merge_positions(&market1, inputs, ts::ctx(scenario));
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market1);
        ts::return_shared(market2);
    };

    ts::end(scenario_val);
}

/// merge → place_sell_taker chained within a single tx. Verifies the chained-
/// form (returning Position by value) integrates with downstream consumers
/// that take Position by value.
#[test]
fun test_merge_then_place_sell_taker_chained() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    // U1 mints YES + NO (two mints → two YES, two NO).
    user_mints(scenario, USER1, 40 * NUSDC_UNIT);
    user_mints(scenario, USER1, 60 * NUSDC_UNIT);

    // U2 places a buy maker at 6000 (60¢) for 50 NUSDC (≈ 83 YES at 60¢ floor).
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let payment = mint_nusdc(scenario, 50 * NUSDC_UNIT);
        place_buy_maker(&mut market, true, 6000, payment, &clock, ts::ctx(scenario));
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 merges YES positions then sells into the resting bid.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        // Limit sell at 6000; rest=true so leftover stays as ask.
        place_sell_taker(&mut market, merged, 6000, true, &clock, ts::ctx(scenario));

        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 should have received NUSDC proportional to filled shares; total
    // shares = 100, fills against U2's 50 NUSDC bid at 6000 (≈ 83.33 shares
    // floor = 83 shares ≈ 49.8 NUSDC). The remainder rests as a maker ask.
    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        // Lower bound: at least some payment received.
        assert!(coin::value(&received) > 0, 2);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}

/// merge → place_sell_maker chained: rest the entire merged Position as a
/// resting ask. Verifies the chained form composes with the maker entry.
#[test]
fun test_merge_then_place_sell_maker_chained() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 25 * NUSDC_UNIT);
    user_mints(scenario, USER1, 75 * NUSDC_UNIT);

    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let clock = setup_clock(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        place_sell_maker(&mut market, merged, 7500, &clock, ts::ctx(scenario));

        // U1's YES side now sits as a resting ask. Volume hasn't moved (no fill).
        assert!(get_total_volume(&market) == 0, 2);

        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}

/// merge after market cancelled, then claim_cancelled_refund. Verifies the
/// downstream claim path on cancelled markets composes with merge.
#[test]
fun test_merge_after_cancel_then_claim_refund() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 20 * NUSDC_UNIT);
    user_mints(scenario, USER1, 30 * NUSDC_UNIT);

    // Cancel the market by advancing past resolve_deadline.
    ts::next_tx(scenario, USER2);
    {
        let mut market = take_market(scenario);
        let mut clock = clock::create_for_testing(ts::ctx(scenario));
        clock::set_for_testing(&mut clock, START_TIME_MS + RESOLVE_OFFSET_MS + 1_000);
        cancel_expired_market(&mut market, &clock);
        clock::destroy_for_testing(clock);
        ts::return_shared(market);
    };

    // U1 merges YES positions then claims refund on the merged NFT.
    ts::next_tx(scenario, USER1);
    {
        let mut market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1);

        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        claim_cancelled_refund(&mut market, merged, ts::ctx(scenario));

        ts::return_shared(market);
    };

    // U1 received cancellation refund proportional to merged shares
    // (50 NUSDC across both sides via formula; merged YES alone covers part).
    // Lower bound: refund > 0 since merged shares > 0.
    ts::next_tx(scenario, USER1);
    {
        let received = ts::take_from_sender<Coin<NUSDC>>(scenario);
        assert!(coin::value(&received) > 0, 2);
        ts::return_to_sender(scenario, received);
    };

    ts::end(scenario_val);
}

/// Sanity that the merged Position's shares + cost_basis sum is preserved
/// across a second merge in a subsequent tx (idempotency under composition).
#[test]
fun test_merge_idempotent_across_subsequent_merge() {
    let mut scenario_val = ts::begin(CREATOR);
    let scenario = &mut scenario_val;
    let _ = setup_market(scenario);

    user_mints(scenario, USER1, 10 * NUSDC_UNIT);
    user_mints(scenario, USER1, 20 * NUSDC_UNIT);
    user_mints(scenario, USER1, 30 * NUSDC_UNIT);

    // First tx: merge the three into one (60 NUSDC YES).
    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        let merged = merge_positions(&market, yes_positions, ts::ctx(scenario));
        transfer::public_transfer(merged, USER1);
        ts::return_shared(market);
    };

    // Second tx: mint one more (15 NUSDC), merge the new YES with the
    // already-merged 60. Result must equal 75 NUSDC sum.
    user_mints(scenario, USER1, 15 * NUSDC_UNIT);
    ts::next_tx(scenario, USER1);
    {
        let market = take_market(scenario);
        let yes_positions = take_positions_by_side(scenario, true);
        assert!(vector::length(&yes_positions) == 2, 1); // prior-merged + new

        let merged2 = merge_positions(&market, yes_positions, ts::ctx(scenario));
        assert!(get_position_shares(&merged2) == 75 * NUSDC_UNIT, 2);
        assert!(get_position_cost_basis(&merged2) == 75 * NUSDC_UNIT, 3);

        transfer::public_transfer(merged2, USER1);
        ts::return_shared(market);
    };

    ts::end(scenario_val);
}
