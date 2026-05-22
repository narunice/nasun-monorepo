#[test_only]
module nasun_tier::tier_tests;

use sui::test_scenario as ts;
use nasun_tier::tier;
use nasun_tier::policy;

const ADMIN: address = @0xAD;
const ALICE: address = @0xA1;
const BOB: address = @0xB0;
const CAROL: address = @0xC4;

#[test]
fun default_tier_is_1_for_unset_operator() {
    let mut scenario = ts::begin(ADMIN);
    let (registry, cap) = tier::new_for_testing(scenario.ctx());

    let view = tier::get(&registry, ALICE);
    assert!(tier::tier_of(&view) == tier::tier_1(), 0);

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test]
fun batch_update_single_assigns_tier() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE], vector[tier::tier_3()],
        scenario.ctx(),
    );

    let view = tier::get(&registry, ALICE);
    assert!(tier::tier_of(&view) == tier::tier_3(), 0);
    assert!(tier::total_operators(&registry) == 1, 1);

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test]
fun batch_update_overwrite_keeps_total_count() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE], vector[tier::tier_2()],
        scenario.ctx(),
    );
    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE], vector[tier::tier_3()],
        scenario.ctx(),
    );

    let view = tier::get(&registry, ALICE);
    assert!(tier::tier_of(&view) == tier::tier_3(), 0);
    assert!(tier::total_operators(&registry) == 1, 1);

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test]
fun batch_update_mixed_new_and_existing() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE, BOB], vector[tier::tier_2(), tier::tier_3()],
        scenario.ctx(),
    );
    // Add CAROL + raise ALICE
    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[CAROL, ALICE], vector[tier::tier_1(), tier::tier_3()],
        scenario.ctx(),
    );

    assert!(tier::tier_of(&tier::get(&registry, ALICE)) == tier::tier_3(), 0);
    assert!(tier::tier_of(&tier::get(&registry, BOB)) == tier::tier_3(), 1);
    assert!(tier::tier_of(&tier::get(&registry, CAROL)) == tier::tier_1(), 2);
    assert!(tier::total_operators(&registry) == 3, 3);

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_tier::tier::EInvalidTier)]
fun invalid_tier_is_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE], vector[4],
        scenario.ctx(),
    );

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_tier::tier::EBatchLengthMismatch)]
fun batch_length_mismatch_is_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE, BOB], vector[tier::tier_2()],
        scenario.ctx(),
    );

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_tier::tier::EBatchTooLarge)]
fun batch_size_cap_enforced() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    // Lower the cap so we can hit it cheaply.
    tier::set_max_batch_size(&cap, &mut registry, 2);

    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE, BOB, CAROL], vector[tier::tier_1(), tier::tier_2(), tier::tier_3()],
        scenario.ctx(),
    );

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_tier::tier::EEpochCapExceeded)]
fun epoch_cap_enforced() {
    let mut scenario = ts::begin(ADMIN);
    let (mut registry, cap) = tier::new_for_testing(scenario.ctx());

    tier::set_max_updates_per_epoch(&cap, &mut registry, 1);

    // First update succeeds, exhausts the per-epoch budget.
    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[ALICE], vector[tier::tier_2()],
        scenario.ctx(),
    );
    // Second update in the same epoch must abort.
    tier::update_tiers_batch(
        &cap, &mut registry,
        vector[BOB], vector[tier::tier_3()],
        scenario.ctx(),
    );

    tier::destroy_for_testing(registry, cap);
    scenario.end();
}

#[test]
fun policy_values_match_design() {
    // Pado fee discount
    assert!(policy::fee_discount_bps(tier::tier_1()) == 0, 0);
    assert!(policy::fee_discount_bps(tier::tier_2()) == 3500, 1);
    assert!(policy::fee_discount_bps(tier::tier_3()) == 6000, 2);

    // Staking multiplier
    assert!(policy::staking_multiplier_bps(tier::tier_1()) == 10000, 3);
    assert!(policy::staking_multiplier_bps(tier::tier_2()) == 12500, 4);
    assert!(policy::staking_multiplier_bps(tier::tier_3()) == 15000, 5);

    // GoStop LP yield
    assert!(policy::lp_yield_multiplier_bps(tier::tier_1()) == 10000, 6);
    assert!(policy::lp_yield_multiplier_bps(tier::tier_2()) == 13000, 7);
    assert!(policy::lp_yield_multiplier_bps(tier::tier_3()) == 16000, 8);

    // AI inference subsidy
    assert!(policy::inference_subsidy_bps(tier::tier_1()) == 0, 9);
    assert!(policy::inference_subsidy_bps(tier::tier_2()) == 3000, 10);
    assert!(policy::inference_subsidy_bps(tier::tier_3()) == 6000, 11);

    // GoStop max bet floor
    assert!(policy::max_bet_floor_usdc(tier::tier_1()) == 100_000_000, 12);
    assert!(policy::max_bet_floor_usdc(tier::tier_2()) == 1_000_000_000, 13);
    assert!(policy::max_bet_floor_usdc(tier::tier_3()) == 10_000_000_000, 14);

    // Vault eligibility
    assert!(!policy::can_create_vault(tier::tier_1()), 15);
    assert!(!policy::can_create_vault(tier::tier_2()), 16);
    assert!(policy::can_create_vault(tier::tier_3()), 17);
}

#[test]
fun version_is_exported() {
    assert!(tier::version() == 1, 0);
}
