// Tier-aware fee discount tests for state::process_create_with_tier.
//
// Mirrors the canonical state_tests::process_create_ok flow but routes
// through the v2 path so the sender's NSI tier maps to a fee discount
// applied to taker/maker baseline (BEFORE EWMA penalty).
//
// Discount math (plain integer, matches policy.move + on-chain):
//   effective_taker = (baseline * (10000 - discount_bps)) / 10000
//   discount_bps    = 0 / 3500 / 6000 for tier 1 / 2 / 3
//
// The default fee schedule the test pool starts with comes from
// `state::empty(false, false, ctx)` -> volatile pool, taker = MAX_TAKER_VOLATILE
// (1_000_000), maker = MAX_MAKER_VOLATILE (500_000). Stake-discounted-half
// path doesn't fire (active_stake = 0), so taker_fee_for_user returns the
// full 1_000_000.

#[test_only]
module deepbook::state_tier_tests;

use deepbook::{
    balances,
    constants,
    ewma_tests::test_init_ewma_state,
    order_info_tests::create_order_info_base,
    state
};
use nasun_tier::tier;
use std::unit_test::{assert_eq, destroy};
use sui::test_scenario::begin;

const ALICE: address = @0xA;

// Helper: build a fresh volatile pool state and a TierRegistry with `alice`
// set to the given tier. Returns ownership for the caller to destroy.
fun setup_state_and_tier(
    test: &mut sui::test_scenario::Scenario,
    alice_tier: u8,
): (state::State, tier::TierRegistry, tier::TierAdminCap) {
    let whitelisted = false;
    let stable_pool = false;
    let state_obj = state::empty(whitelisted, stable_pool, test.ctx());
    let (mut registry, cap) = tier::new_for_testing(test.ctx());
    if (alice_tier > 0) {
        tier::update_tiers_batch(
            &cap,
            &mut registry,
            vector[ALICE],
            vector[alice_tier],
            test.ctx(),
        );
    };
    (state_obj, registry, cap)
}

// Baseline (no discount) — verifies process_create_with_tier matches
// process_create's owed values for a tier-1 user.
#[test]
fun tier_1_no_discount() {
    let mut test = begin(ALICE);
    let (mut state_obj, registry, cap) = setup_state_and_tier(&mut test, 1);

    test.next_tx(ALICE);
    let price = 1 * constants::usdc_unit();
    let quantity = 1 * constants::sui_unit();
    let mut order_info = create_order_info_base(
        ALICE,
        price,
        quantity,
        true,
        test.ctx().epoch(),
    );
    let ewma_state = test_init_ewma_state(test.ctx());
    let (settled, owed) = state_obj.process_create_with_tier(
        &mut order_info,
        &ewma_state,
        object::id_from_address(@0x0),
        &registry,
        test.ctx(),
    );

    // tier 1 → discount 0 → identical to v1 baseline.
    // process_create_ok asserts: owed = balances::new(0, 1 * usdc_unit, 500_000)
    // (maker fee 500_000 = MAX_MAKER_VOLATILE * 1 sui_unit / float_scaling)
    assert_eq!(settled, balances::new(0, 0, 0));
    assert_eq!(owed, balances::new(0, 1 * constants::usdc_unit(), 500_000));

    tier::destroy_for_testing(registry, cap);
    destroy(state_obj);
    test.end();
}

// Tier 2 — 35% discount on baseline taker AND maker.
#[test]
fun tier_2_35_pct_discount() {
    let mut test = begin(ALICE);
    let (mut state_obj, registry, cap) = setup_state_and_tier(&mut test, 2);

    test.next_tx(ALICE);
    let price = 1 * constants::usdc_unit();
    let quantity = 1 * constants::sui_unit();
    let mut order_info = create_order_info_base(
        ALICE,
        price,
        quantity,
        true,
        test.ctx().epoch(),
    );
    let ewma_state = test_init_ewma_state(test.ctx());
    let (settled, owed) = state_obj.process_create_with_tier(
        &mut order_info,
        &ewma_state,
        object::id_from_address(@0x0),
        &registry,
        test.ctx(),
    );

    // tier 2 → discount 3500 → maker fee = 500_000 * 6500 / 10000 = 325_000
    assert_eq!(settled, balances::new(0, 0, 0));
    assert_eq!(owed, balances::new(0, 1 * constants::usdc_unit(), 325_000));

    tier::destroy_for_testing(registry, cap);
    destroy(state_obj);
    test.end();
}

// Tier 3 — 60% discount: effective ≈ Hyperliquid VIP territory.
#[test]
fun tier_3_60_pct_discount() {
    let mut test = begin(ALICE);
    let (mut state_obj, registry, cap) = setup_state_and_tier(&mut test, 3);

    test.next_tx(ALICE);
    let price = 1 * constants::usdc_unit();
    let quantity = 1 * constants::sui_unit();
    let mut order_info = create_order_info_base(
        ALICE,
        price,
        quantity,
        true,
        test.ctx().epoch(),
    );
    let ewma_state = test_init_ewma_state(test.ctx());
    let (settled, owed) = state_obj.process_create_with_tier(
        &mut order_info,
        &ewma_state,
        object::id_from_address(@0x0),
        &registry,
        test.ctx(),
    );

    // tier 3 → discount 6000 → maker fee = 500_000 * 4000 / 10000 = 200_000
    assert_eq!(settled, balances::new(0, 0, 0));
    assert_eq!(owed, balances::new(0, 1 * constants::usdc_unit(), 200_000));

    tier::destroy_for_testing(registry, cap);
    destroy(state_obj);
    test.end();
}

// Table miss — operator with no registry entry defaults to TIER_1 baseline.
// Verifies the table-miss invariant that protects new users from accidentally
// receiving zero fees.
#[test]
fun tier_default_on_table_miss() {
    let mut test = begin(ALICE);
    // alice_tier = 0 → no batch update → ALICE remains table-miss in registry.
    let (mut state_obj, registry, cap) = setup_state_and_tier(&mut test, 0);

    test.next_tx(ALICE);
    let price = 1 * constants::usdc_unit();
    let quantity = 1 * constants::sui_unit();
    let mut order_info = create_order_info_base(
        ALICE,
        price,
        quantity,
        true,
        test.ctx().epoch(),
    );
    let ewma_state = test_init_ewma_state(test.ctx());
    let (settled, owed) = state_obj.process_create_with_tier(
        &mut order_info,
        &ewma_state,
        object::id_from_address(@0x0),
        &registry,
        test.ctx(),
    );

    // Table miss → TIER_1 baseline → maker fee identical to tier_1_no_discount.
    assert_eq!(settled, balances::new(0, 0, 0));
    assert_eq!(owed, balances::new(0, 1 * constants::usdc_unit(), 500_000));

    tier::destroy_for_testing(registry, cap);
    destroy(state_obj);
    test.end();
}
