#[test_only]
module nasun_treasury::pool_tests;

use sui::test_scenario as ts;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::balance;
use nasun_treasury::pool::{Self, SubsidyPool, DrawCap};

const ADMIN: address = @0xAD;
const DOWNSTREAM: address = @0xD0;

const GOSTOP_LP: vector<u8> = b"gostop_lp";
const DAILY_CAP: u64 = 1_000_000_000;  // 1B units

fun mint_coin(amount: u64, ctx: &mut TxContext): Coin<SUI> {
    coin::from_balance(balance::create_for_testing<SUI>(amount), ctx)
}

#[test]
fun create_and_fund_pool() {
    let mut scenario = ts::begin(ADMIN);

    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());
    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, DAILY_CAP, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(5_000, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());

    assert!(pool::balance_value(&p) == 5_000, 0);
    assert!(pool::total_funded(&p) == 5_000, 1);
    assert!(pool::daily_cap_total(&p) == DAILY_CAP, 2);

    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test]
fun issue_cap_and_draw() {
    let mut scenario = ts::begin(ADMIN);

    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());
    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, DAILY_CAP, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(10_000, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());

    pool::issue_draw_cap(&admin_cap, &mut p, DOWNSTREAM, scenario.ctx());
    ts::return_shared(p);

    // DOWNSTREAM now holds the DrawCap and draws 1000 at tier 2.
    scenario.next_tx(DOWNSTREAM);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let drawn = pool::draw(&mut p, &draw_cap, 2, 1_000, scenario.ctx());
    assert!(balance::value(&drawn) == 1_000, 0);
    assert!(pool::balance_value(&p) == 9_000, 1);
    assert!(pool::total_drawn(&p) == 1_000, 2);

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_treasury::pool::EUnauthorizedDraw)]
fun unrevoked_cap_from_wrong_pool_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());

    // Pool A
    pool::create_pool<SUI>(&admin_cap, b"pool_a", DAILY_CAP, scenario.ctx());
    scenario.next_tx(ADMIN);
    let mut pool_a = scenario.take_shared<SubsidyPool<SUI>>();
    pool::issue_draw_cap(&admin_cap, &mut pool_a, DOWNSTREAM, scenario.ctx());
    ts::return_shared(pool_a);

    // Pool B (different shared object)
    scenario.next_tx(ADMIN);
    pool::create_pool<SUI>(&admin_cap, b"pool_b", DAILY_CAP, scenario.ctx());
    scenario.next_tx(ADMIN);
    // The newly shared pool B is the one returned by take_shared now.
    let mut pool_b = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(10_000, scenario.ctx());
    pool::fund(&admin_cap, &mut pool_b, funding, scenario.ctx());
    ts::return_shared(pool_b);

    // DOWNSTREAM tries to draw from pool B using pool A's DrawCap.
    scenario.next_tx(DOWNSTREAM);
    let mut pool_b = scenario.take_shared<SubsidyPool<SUI>>();
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let drawn = pool::draw(&mut pool_b, &draw_cap, 2, 100, scenario.ctx());

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(pool_b);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_treasury::pool::EDailyCapExceeded)]
fun daily_cap_enforced() {
    let mut scenario = ts::begin(ADMIN);
    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());

    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, 500, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(10_000, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());
    pool::issue_draw_cap(&admin_cap, &mut p, DOWNSTREAM, scenario.ctx());
    ts::return_shared(p);

    scenario.next_tx(DOWNSTREAM);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let drawn = pool::draw(&mut p, &draw_cap, 1, 600, scenario.ctx());  // exceeds 500 cap

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_treasury::pool::EInsufficientBalance)]
fun insufficient_balance_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());
    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, DAILY_CAP, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(100, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());
    pool::issue_draw_cap(&admin_cap, &mut p, DOWNSTREAM, scenario.ctx());
    ts::return_shared(p);

    scenario.next_tx(DOWNSTREAM);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let drawn = pool::draw(&mut p, &draw_cap, 1, 500, scenario.ctx());  // pool only has 100

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_treasury::pool::EInvalidTier)]
fun invalid_tier_rejected() {
    let mut scenario = ts::begin(ADMIN);
    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());
    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, DAILY_CAP, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(10_000, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());
    pool::issue_draw_cap(&admin_cap, &mut p, DOWNSTREAM, scenario.ctx());
    ts::return_shared(p);

    scenario.next_tx(DOWNSTREAM);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let drawn = pool::draw(&mut p, &draw_cap, 0, 100, scenario.ctx());  // tier 0 invalid

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test, expected_failure(abort_code = nasun_treasury::pool::EUnauthorizedDraw)]
fun revoked_cap_cannot_draw() {
    let mut scenario = ts::begin(ADMIN);
    let admin_cap = pool::new_admin_cap_for_testing(scenario.ctx());
    pool::create_pool<SUI>(&admin_cap, GOSTOP_LP, DAILY_CAP, scenario.ctx());

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let funding = mint_coin(10_000, scenario.ctx());
    pool::fund(&admin_cap, &mut p, funding, scenario.ctx());
    pool::issue_draw_cap(&admin_cap, &mut p, DOWNSTREAM, scenario.ctx());
    ts::return_shared(p);

    // Admin revokes the cap before DOWNSTREAM can use it.
    scenario.next_tx(DOWNSTREAM);
    let draw_cap = scenario.take_from_sender<DrawCap>();
    let cap_id = object::id(&draw_cap);

    scenario.next_tx(ADMIN);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    pool::revoke_draw_cap(&admin_cap, &mut p, cap_id);
    ts::return_shared(p);

    scenario.next_tx(DOWNSTREAM);
    let mut p = scenario.take_shared<SubsidyPool<SUI>>();
    let drawn = pool::draw(&mut p, &draw_cap, 1, 100, scenario.ctx());

    balance::destroy_for_testing(drawn);
    scenario.return_to_sender(draw_cap);
    ts::return_shared(p);
    pool::destroy_admin_cap_for_testing(admin_cap);
    scenario.end();
}

#[test]
fun version_is_exported() {
    assert!(pool::version() == 1, 0);
}
