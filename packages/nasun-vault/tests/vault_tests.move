// A.3 tests: deposit / request_withdrawal / claim_withdrawal cash-path math.
//
// All scenarios are cash-only (the vault holds NUSDC + DEEP, never NBTC), so
// NAV stays exactly 1.0 (NAV_SCALE) and share math is 1:1. This isolates the
// share-accounting and cooldown logic of A.3 from the two-asset NAV path,
// which is exercised in A.4 (execute_trade) once the vault can hold NBTC.
//
// Expected values are hand-derived from NAV = 1.0, never computed via the
// contract under test.
#[test_only]
module nasun_vault::vault_tests;

use std::type_name;
use std::unit_test::{assert_eq, destroy};
use sui::clock::{Self, Clock};
use sui::transfer;
use deepbook::balance_manager;
use sui::coin::mint_for_testing;
use sui::test_scenario::{Scenario, begin, end, return_shared, most_recent_id_shared};

use nasun_vault::vault::{Self, Vault, VaultFactory, VaultFactoryAdminCap, VaultWitness};
use nasun_tier::tier;
use baram_aer::capability::{Self, Capability, CapabilityRegistry};
use baram_agent::agent_profile::{Self, AgentProfile, AgentProfileRegistry};
use deepbook::registry::{Self, Registry};
use deepbook::pool::{Self, Pool};
use deepbook::constants;
use devnet_tokens::nusdc::NUSDC;
use devnet_tokens::nbtc::NBTC;
use token::deep::DEEP;

const MANAGER: address = @0xA11CE;
const ALICE: address = @0xA;
const BOB: address = @0xB;

// Mirrors of private vault.move constants. If the source defaults change, the
// create_vault setup or assertions below fail loudly (never silently wrong).
const SEED_NUSDC: u64 = 100_000_000; // vault::DEFAULT_MIN_SEED_NUSDC (100 NUSDC)
const SEED_DEEP: u64 = 1_000_000_000; // vault::DEFAULT_MIN_SEED_DEEP (1000 DEEP)
const SHARE_LOCK: u64 = 1_000; // vault::SHARE_LOCK_AMOUNT
const COOLDOWN_MS: u64 = 259_200_000; // vault::DEFAULT_COOLDOWN_MS (3 days)
const TIER_3: u8 = 3; // nasun_tier::tier::TIER_3
const PERF_FEE_BPS: u64 = 1_000; // 10%, within the 30% cap

const ALICE_DEPOSIT: u64 = 50_000_000; // 50 NUSDC
const BOB_DEPOSIT: u64 = 30_000_000; // 30 NUSDC
const NBTC_INJECT: u64 = 30_000_000; // 30 NBTC-units (simulated trade outcome)
const NBTC_INJECT_50: u64 = 50_000_000; // 50 NBTC-units
const MARK_2X: u64 = 2_000_000_000; // last_mark = 2.0 NUSDC/NBTC (FLOAT_SCALING 1e9)
const DEPOSIT_100: u64 = 100_000_000; // 100 NUSDC
const NBTC_UNEVEN: u64 = 31_000_000; // NBTC inject that does NOT divide evenly

// A.4 execute_trade
const AGENT: address = @0xA9E; // delegated agent-runtime address (≠ manager)
const ATTACKER: address = @0xBAD;
const LP: address = @0x77; // liquidity provider seeding the order book
const MAX_NOTIONAL: u64 = 1_000_000_000; // capability per-order notional cap (1000 NUSDC)
const ASK_PRICE: u64 = 1_000_000_000; // LP ask @ 1.0 (FLOAT_SCALING), tick-aligned
const BID_PRICE_LP: u64 = 800_000_000; // LP resting bid @ 0.8
const LP_QTY: u64 = 10_000_000; // LP order qty (lot-aligned, ≥ min_size)
const VAULT_BID_QTY: u64 = 5_000_000; // vault buys this many NBTC, fully fills
const TRADE_EXPIRE_MS: u64 = 1_000_000_000_000; // far-future order expiry
const EXPECTED_FILL_NUSDC: u64 = 5_000_000; // VAULT_BID_QTY * ASK_PRICE / 1e9
const EXPECTED_POST_TRADE_MID: u64 = 900_000_000; // (0.8 + 1.0)/2 live mid after fill
const HEARTBEAT_TIMEOUT: u64 = 86_400_000; // vault::HEARTBEAT_TIMEOUT_MS (24h)

// Builds a fully wired, seeded vault and returns the live Clock plus the
// shared Vault / Pool ids. The Clock is returned because every A.3 entrypoint
// takes it and claim tests must advance it; the caller destroys it. All other
// setup-only owned objects (tier registry/cap, deepbook admin cap) are
// destroyed here since no test needs them past creation.
// Thin wrapper for the A.3 (cash-path) tests: non-whitelisted pool, bare
// capability, tier registry discarded (those tests never trade).
fun setup_vault(test: &mut Scenario): (Clock, ID, ID) {
    let (clock, tier_reg, vault_id, pool_id) = build_vault(test, false, false);
    destroy(tier_reg);
    (clock, vault_id, pool_id)
}

// Full harness. `whitelisted` makes the bound pool zero-fee so trades fill
// without a DEEP price reference (the real DEEP-fee path is covered by Track D
// E2E). `enrich_cap` gives the capability the spot-trade action + NBTC asset +
// a notional cap so execute_trade's assert_can_execute passes. Returns the live
// TierRegistry (execute_trade needs it); the caller destroys it.
fun build_vault(
    test: &mut Scenario,
    whitelisted: bool,
    enrich_cap: bool,
): (Clock, tier::TierRegistry, ID, ID) {
    let clock = clock::create_for_testing(test.ctx());

    let (mut tier_reg, tier_cap) = tier::new_for_testing(test.ctx());
    tier::update_tiers_batch(&tier_cap, &mut tier_reg, vector[MANAGER], vector[TIER_3], test.ctx());

    let admin_cap = registry::get_admin_cap_for_testing(test.ctx());
    let dbreg_id = registry::test_registry(test.ctx());
    capability::init_for_testing(test.ctx());
    agent_profile::init_for_testing(test.ctx());
    vault::init_for_testing(test.ctx());

    // Capability is created in its own tx so its id is in the scenario
    // inventory for the AgentProfile link in the following tx.
    test.next_tx(MANAGER);
    {
        let cap_reg = test.take_shared<CapabilityRegistry>();
        if (enrich_cap) {
            capability::new_capability(
                &cap_reg,
                vector[b"nasun_vault.spot_trade".to_string()],
                vector[type_name::with_defining_ids<NBTC>()],
                vector[],
                MAX_NOTIONAL,
                0, 0, 0, 0,
                test.ctx(),
            );
        } else {
            capability::new_capability(&cap_reg, vector[], vector[], vector[], 0, 0, 0, 0, 0, test.ctx());
        };
        return_shared(cap_reg);
    };

    let pool_id;
    test.next_tx(MANAGER);
    {
        let cap = test.take_shared<Capability>();
        let cap_id = object::id(&cap);
        return_shared(cap);

        let mut agent_reg = test.take_shared<AgentProfileRegistry>();
        agent_profile::create_agent_with_capability(
            &mut agent_reg,
            AGENT,
            b"agent".to_string(),
            b"trader".to_string(),
            vector[],
            cap_id,
            &clock,
            test.ctx(),
        );
        return_shared(agent_reg);

        let mut dbreg = test.take_shared_by_id<Registry>(dbreg_id);
        registry::authorize_app<VaultWitness>(&mut dbreg, &admin_cap);
        pool_id = pool::create_pool_admin<NBTC, NUSDC>(
            &mut dbreg,
            constants::tick_size(),
            constants::lot_size(),
            constants::min_size(),
            whitelisted,
            false,
            &admin_cap,
            test.ctx(),
        );
        return_shared(dbreg);

        let factory_cap = test.take_from_sender<VaultFactoryAdminCap>();
        vault::init_factory(&factory_cap, pool_id, test.ctx());
        test.return_to_sender(factory_cap);
    };

    let vault_id;
    test.next_tx(MANAGER);
    {
        let mut factory = test.take_shared<VaultFactory>();
        let mut dbreg = test.take_shared_by_id<Registry>(dbreg_id);
        let cap = test.take_shared<Capability>();
        let agent_profile = test.take_from_sender<AgentProfile>();

        vault_id = vault::create_vault(
            &mut factory,
            &tier_reg,
            &mut dbreg,
            &agent_profile,
            &cap,
            mint_for_testing<NUSDC>(SEED_NUSDC, test.ctx()),
            mint_for_testing<DEEP>(SEED_DEEP, test.ctx()),
            PERF_FEE_BPS,
            &clock,
            test.ctx(),
        );

        return_shared(factory);
        return_shared(dbreg);
        return_shared(cap);
        test.return_to_sender(agent_profile);
    };

    destroy(tier_cap);
    destroy(admin_cap);

    (clock, tier_reg, vault_id, pool_id)
}

// Posts a two-sided book on the (whitelisted) pool from a fresh LP account:
// a resting bid @ BID_PRICE_LP and a resting ask @ ASK_PRICE, each LP_QTY.
// The vault will take the ask; the LP bid keeps the post-trade book two-sided
// so live_mid is exercised.
fun seed_orderbook(test: &mut Scenario, pool_id: ID, clock: &Clock) {
    test.next_tx(LP);
    {
        let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        let mut lp_bm = balance_manager::new(test.ctx());
        lp_bm.deposit(mint_for_testing<NBTC>(LP_QTY * 2, test.ctx()), test.ctx());
        lp_bm.deposit(mint_for_testing<NUSDC>(LP_QTY * 2, test.ctx()), test.ctx());
        let proof = lp_bm.generate_proof_as_owner(test.ctx());

        // resting ask: sell LP_QTY NBTC @ ASK_PRICE (vault will take this)
        pool.place_limit_order<NBTC, NUSDC>(
            &mut lp_bm, &proof, 1,
            constants::no_restriction(), constants::self_matching_allowed(),
            ASK_PRICE, LP_QTY, false, true, TRADE_EXPIRE_MS, clock, test.ctx(),
        );
        // resting bid: buy LP_QTY NBTC @ BID_PRICE_LP (stays on book)
        pool.place_limit_order<NBTC, NUSDC>(
            &mut lp_bm, &proof, 2,
            constants::no_restriction(), constants::self_matching_allowed(),
            BID_PRICE_LP, LP_QTY, true, true, TRADE_EXPIRE_MS, clock, test.ctx(),
        );

        transfer::public_share_object(lp_bm);
        return_shared(pool);
    };
}

#[test]
fun create_vault_initial_accounting() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let vault = test.take_shared_by_id<Vault>(vault_id);
        // total_shares == seed (includes the 1000 dead-share lock).
        assert_eq!(vault.total_shares(), SEED_NUSDC);
        // manager holds seed minus the locked dead shares.
        assert_eq!(vault.shares_of(MANAGER), SEED_NUSDC - SHARE_LOCK);
        // full NUSDC seed sits in the balance manager.
        assert_eq!(vault.nusdc_balance(), SEED_NUSDC);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun deposit_mints_one_to_one() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // NAV = 100_000_000 * 1e9 / 100_000_000 = 1e9 (1.0), so a 50_000_000
    // deposit mints exactly 50_000_000 shares.
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());

        assert_eq!(vault.shares_of(ALICE), ALICE_DEPOSIT);
        assert_eq!(vault.total_shares(), SEED_NUSDC + ALICE_DEPOSIT);
        assert_eq!(vault.nusdc_balance(), SEED_NUSDC + ALICE_DEPOSIT);

        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun second_depositor_preserves_first_shares() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    // NAV is still 1.0, so BOB also mints 1:1 and ALICE's balance is untouched.
    test.next_tx(BOB);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(BOB_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());

        assert_eq!(vault.shares_of(BOB), BOB_DEPOSIT);
        assert_eq!(vault.shares_of(ALICE), ALICE_DEPOSIT);
        assert_eq!(vault.total_shares(), SEED_NUSDC + ALICE_DEPOSIT + BOB_DEPOSIT);

        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun request_moves_shares_to_pending() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    // Request the full balance: active shares drop to 0, the amount parks in
    // pending, and total_shares is unchanged (assets still back the claim).
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());

        assert_eq!(vault.shares_of(ALICE), 0);
        assert_eq!(vault.has_pending(ALICE), true);
        assert_eq!(vault.pending_shares(ALICE), ALICE_DEPOSIT);
        assert_eq!(vault.total_shares(), SEED_NUSDC + ALICE_DEPOSIT);

        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun claim_after_cooldown_returns_principal() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    // Request at clock = 0 → cooldown_until = COOLDOWN_MS.
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());
        return_shared(vault);
    };

    // Advance to the exact cooldown boundary (now == cooldown_until) and claim.
    clock.set_for_testing(COOLDOWN_MS);
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let (out_nusdc, out_nbtc) = vault.claim_withdrawal(&clock, test.ctx());

        // Cash-only vault: 50M shares of 150M redeem 50M NUSDC pro-rata, 0 NBTC.
        assert_eq!(out_nusdc.value(), ALICE_DEPOSIT);
        assert_eq!(out_nbtc.value(), 0);
        assert_eq!(vault.has_pending(ALICE), false);
        assert_eq!(vault.total_shares(), SEED_NUSDC); // ALICE's shares burned
        assert_eq!(vault.nusdc_balance(), SEED_NUSDC); // ALICE's NUSDC paid out

        destroy(out_nusdc);
        destroy(out_nbtc);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// === Abort-code coverage (one expected_failure per A.3 error) ===

#[test, expected_failure(abort_code = nasun_vault::vault::EZeroShares)]
fun deposit_zero_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    vault.deposit(mint_for_testing<NUSDC>(0, test.ctx()), &pool, 0, &clock, test.ctx());

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::EVaultKilled)]
fun deposit_to_killed_vault_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    vault.set_killed_for_testing();
    vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::ENotDepositor)]
fun request_non_depositor_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    // BOB never deposited, so he holds no shares.
    test.next_tx(BOB);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::EInsufficientShares)]
fun request_exceeds_balance_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    vault.request_withdrawal(ALICE_DEPOSIT + 1, &clock, test.ctx());

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::EWithdrawalPending)]
fun request_twice_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    vault.request_withdrawal(ALICE_DEPOSIT / 2, &clock, test.ctx());
    vault.request_withdrawal(ALICE_DEPOSIT / 2, &clock, test.ctx());

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::ECooldownNotElapsed)]
fun claim_before_cooldown_aborts() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());
        return_shared(vault);
    };

    // One ms short of the cooldown boundary.
    clock.set_for_testing(COOLDOWN_MS - 1);
    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let (a, b) = vault.claim_withdrawal(&clock, test.ctx());

    destroy(a);
    destroy(b);
    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::ENoPendingWithdrawal)]
fun claim_without_request_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // ALICE is a depositor but never requested a withdrawal.
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let (a, b) = vault.claim_withdrawal(&clock, test.ctx());

    destroy(a);
    destroy(b);
    abort 0
}

// === A.3 NAV revision (v2): in-kind claim + conservative deposit ===

#[test]
fun claim_pays_both_assets_pro_rata() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, pool_id) = setup_vault(&mut test);

    // ALICE deposits 50M while the vault is still cash → 50M shares, total 150M.
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    // Simulate the agent trading some NUSDC into 30M NBTC. BM now holds
    // 150M NUSDC + 30M NBTC backing 150M shares.
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_INJECT, test.ctx()), test.ctx());
        return_shared(vault);
    };

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());
        return_shared(vault);
    };

    // In-kind pro-rata of BOTH assets (no price needed → mid-manipulation proof):
    // nusdc_out = 150M * 50M / 150M = 50M ; nbtc_out = 30M * 50M / 150M = 10M.
    clock.set_for_testing(COOLDOWN_MS);
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let (out_nusdc, out_nbtc) = vault.claim_withdrawal(&clock, test.ctx());

        assert_eq!(out_nusdc.value(), 50_000_000);
        assert_eq!(out_nbtc.value(), 10_000_000);
        assert_eq!(vault.total_shares(), SEED_NUSDC); // 150M - 50M
        assert_eq!(vault.nusdc_balance(), 100_000_000); // 150M - 50M
        assert_eq!(vault.nbtc_balance(), 20_000_000); // 30M - 10M

        destroy(out_nusdc);
        destroy(out_nbtc);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun deposit_values_nbtc_at_last_mark_when_book_empty() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // Agent has traded into 50M NBTC at mark 2.0 (2 NUSDC/NBTC). Vault value =
    // 100M NUSDC + 50M*2 = 200M for 100M shares → NAV 2.0. The order book is
    // empty, so deposit must fall back to last_mark_price (no mid abort).
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_INJECT_50, test.ctx()), test.ctx());
        vault.set_last_mark_for_testing(MARK_2X);
        return_shared(vault);
    };

    // ALICE deposits 100M NUSDC at NAV 2.0 → 50M shares (not 100M).
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(DEPOSIT_100, test.ctx()), &pool, 0, &clock, test.ctx());

        assert_eq!(vault.shares_of(ALICE), 50_000_000);
        assert_eq!(vault.total_shares(), SEED_NUSDC + 50_000_000);

        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// Proves in-kind payout rounds DOWN: 31M NBTC * 50M / 150M = 10,333,333.33 →
// floored to 10,333,333 (a round-UP bug would pay 10,333,334 and drain the
// dead-share buffer over time). Dust stays in the vault for remaining holders.
#[test]
fun claim_rounds_down_on_uneven_split() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_UNEVEN, test.ctx()), test.ctx());
        return_shared(vault);
    };

    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(ALICE_DEPOSIT, &clock, test.ctx());
        return_shared(vault);
    };

    clock.set_for_testing(COOLDOWN_MS);
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let (out_nusdc, out_nbtc) = vault.claim_withdrawal(&clock, test.ctx());

        assert_eq!(out_nusdc.value(), 50_000_000); // 150M*50M/150M, divides evenly
        assert_eq!(out_nbtc.value(), 10_333_333); // floor(31M*50M/150M), NOT 10_333_334
        assert_eq!(vault.nbtc_balance(), NBTC_UNEVEN - 10_333_333); // dust retained

        destroy(out_nusdc);
        destroy(out_nbtc);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// min_shares_out aborts the deposit when the conservative NAV would mint fewer
// shares than the depositor accepts (slippage / mid-manipulation protection).
#[test, expected_failure(abort_code = nasun_vault::vault::ESlippageExceeded)]
fun deposit_below_min_shares_out_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // Cash vault: 50M NUSDC mints exactly 50M shares at NAV 1.0; demanding
    // 50M+1 must abort.
    test.next_tx(ALICE);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    vault.deposit(
        mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()),
        &pool,
        ALICE_DEPOSIT + 1,
        &clock,
        test.ctx(),
    );

    abort 0
}

// === A.4 execute_trade ===

#[test]
fun execute_trade_fills_and_updates_mark() {
    let mut test = begin(MANAGER);
    let (clock, tier_reg, vault_id, pool_id) = build_vault(&mut test, true, true);
    seed_orderbook(&mut test, pool_id, &clock);

    // AGENT (the delegated runtime, ≠ manager) buys VAULT_BID_QTY NBTC by
    // crossing the LP ask. Proves B2 agent authorization AND the fill path.
    test.next_tx(AGENT);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        let cap = test.take_shared<Capability>();

        vault.execute_trade(
            &cap,
            &tier_reg,
            &mut pool,
            1, // expected_cap_version (new_capability starts at 1)
            true, // is_bid (buy NBTC)
            ASK_PRICE, // crosses the resting LP ask
            VAULT_BID_QTY,
            TRADE_EXPIRE_MS,
            &clock,
            test.ctx(),
        );

        // Bought exactly VAULT_BID_QTY NBTC (quantity-based, scaling-independent).
        assert_eq!(vault.nbtc_balance(), VAULT_BID_QTY);
        // Paid EXPECTED_FILL_NUSDC (whitelisted pool → 0 fee).
        assert_eq!(vault.nusdc_balance(), SEED_NUSDC - EXPECTED_FILL_NUSDC);
        // A trade mints/burns no shares.
        assert_eq!(vault.total_shares(), SEED_NUSDC);
        // Post-trade book is two-sided (LP bid 0.8 + LP ask 1.0 remnant) → live
        // mid 0.9 recorded as the new mark.
        assert_eq!(vault.last_mark_price(), EXPECTED_POST_TRADE_MID);

        return_shared(cap);
        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    destroy(tier_reg);
    end(test);
}

// §3.2 exploit regression: any address other than manager/agent must NOT be
// able to drive the vault's trades (the unauthenticated-caller drain vector).
#[test, expected_failure(abort_code = nasun_vault::vault::ENotManager)]
fun execute_trade_unauthorized_caller_aborts() {
    let mut test = begin(MANAGER);
    let (clock, tier_reg, vault_id, pool_id) = build_vault(&mut test, true, true);

    test.next_tx(ATTACKER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    let cap = test.take_shared<Capability>();
    vault.execute_trade(
        &cap, &tier_reg, &mut pool, 1, true, ASK_PRICE, VAULT_BID_QTY, TRADE_EXPIRE_MS, &clock, test.ctx(),
    );

    abort 0
}

// Capability whose allowed_assets does not include NBTC must block the trade.
#[test, expected_failure(abort_code = nasun_vault::vault::EAssetNotAllowed)]
fun execute_trade_asset_not_allowed_aborts() {
    let mut test = begin(MANAGER);
    let (clock, tier_reg, vault_id, pool_id) = build_vault(&mut test, true, false); // bare cap

    test.next_tx(MANAGER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    let cap = test.take_shared<Capability>();
    vault.execute_trade(
        &cap, &tier_reg, &mut pool, 1, true, ASK_PRICE, VAULT_BID_QTY, TRADE_EXPIRE_MS, &clock, test.ctx(),
    );

    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::EVaultKilled)]
fun execute_trade_on_killed_vault_aborts() {
    let mut test = begin(MANAGER);
    let (clock, tier_reg, vault_id, pool_id) = build_vault(&mut test, true, true);

    test.next_tx(MANAGER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    let cap = test.take_shared<Capability>();
    vault.set_killed_for_testing();
    vault.execute_trade(
        &cap, &tier_reg, &mut pool, 1, true, ASK_PRICE, VAULT_BID_QTY, TRADE_EXPIRE_MS, &clock, test.ctx(),
    );

    abort 0
}

// === A.5 crystallize_fee ===

#[test]
fun crystallize_fee_mints_manager_shares_above_hwm() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // Simulate the agent doubling NAV: 50M NBTC marked at 2.0 → vault value
    // V = 100M + 100M = 200M for 100M shares → NAV 2.0 (HWM was 1.0).
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_INJECT_50, test.ctx()), test.ctx());
        vault.set_last_mark_for_testing(MARK_2X);
        return_shared(vault);
    };

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        // Empty book → crystallize_mark falls back to last_mark (2.0).
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.crystallize_fee(&pool, &clock);

        // fee = 10% of the 100M excess = 10M NUSDC. Dilution-correct Yearn mint
        // m = fee*S/(V-fee) = 10M*100M/(200M-10M) = floor(5,263,157.89) =
        // 5,263,157. (Hand-check: 5,263,157 * 200M/105,263,157 ≈ 10M = 10%.)
        assert_eq!(vault.shares_of(MANAGER), SEED_NUSDC - SHARE_LOCK + 5_263_157);
        assert_eq!(vault.total_shares(), SEED_NUSDC + 5_263_157);
        assert_eq!(vault.high_water_mark(), MARK_2X as u128);

        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun crystallize_fee_noop_at_hwm() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // Cash vault: NAV == HWM == 1.0, no profit → no fee, no mint.
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.crystallize_fee(&pool, &clock);
        assert_eq!(vault.shares_of(MANAGER), SEED_NUSDC - SHARE_LOCK);
        assert_eq!(vault.total_shares(), SEED_NUSDC);
        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// HWM ratchet: a gain crystallizes, then a subsequent drop below the raised HWM
// must NOT charge a second fee (no fee on a loss / on un-recovered ground).
#[test]
fun crystallize_fee_noop_below_hwm_after_gain() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_INJECT_50, test.ctx()), test.ctx());
        vault.set_last_mark_for_testing(MARK_2X); // NAV 2.0
        return_shared(vault);
    };
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.crystallize_fee(&pool, &clock); // HWM → 2.0, fee minted
        return_shared(pool);
        return_shared(vault);
    };

    // Mark drops to 1.5 → NAV ≈ 1.66 < HWM 2.0 → no further fee.
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_last_mark_for_testing(1_500_000_000);
        return_shared(vault);
    };
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        let shares_before = vault.shares_of(MANAGER);
        let total_before = vault.total_shares();
        vault.crystallize_fee(&pool, &clock);
        assert_eq!(vault.shares_of(MANAGER), shares_before); // unchanged
        assert_eq!(vault.total_shares(), total_before);
        return_shared(pool);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// === A.6 set_killed / emergency / recover_deep ===

#[test]
fun set_killed_by_manager() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_killed(&clock, test.ctx());
        assert_eq!(vault.is_killed(), true);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

// A never-traded vault (heartbeat == 0 sentinel) cannot be killed by a stranger
// even long past the timeout — only the manager can. Prevents bricking a legit,
// freshly-created-but-not-yet-started vault (the §4 griefing fix).
#[test, expected_failure(abort_code = nasun_vault::vault::EHeartbeatNotElapsed)]
fun set_killed_stranger_never_traded_aborts() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, _pool_id) = setup_vault(&mut test);

    clock.set_for_testing(HEARTBEAT_TIMEOUT * 10);
    test.next_tx(ATTACKER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    vault.set_killed(&clock, test.ctx());

    abort 0
}

// Agent traded at t=1000, then one ms short of the 24h window → stranger can't
// kill yet (boundary at TIMEOUT-1).
#[test, expected_failure(abort_code = nasun_vault::vault::EHeartbeatNotElapsed)]
fun set_killed_stranger_before_timeout_aborts() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_heartbeat_for_testing(1_000);
        return_shared(vault);
    };
    clock.set_for_testing(1_000 + HEARTBEAT_TIMEOUT - 1);
    test.next_tx(ATTACKER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    vault.set_killed(&clock, test.ctx());

    abort 0
}

#[test]
fun set_killed_stranger_after_heartbeat_timeout() {
    let mut test = begin(MANAGER);
    let (mut clock, vault_id, _pool_id) = setup_vault(&mut test);

    // Agent traded at t=1000 then went dark; exactly at the 24h boundary anyone
    // may kill the dead-agent vault.
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_heartbeat_for_testing(1_000);
        return_shared(vault);
    };
    clock.set_for_testing(1_000 + HEARTBEAT_TIMEOUT);
    test.next_tx(ATTACKER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_killed(&clock, test.ctx());
        assert_eq!(vault.is_killed(), true);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test]
fun emergency_claim_pays_active_and_pending_shares() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, pool_id) = setup_vault(&mut test);

    // ALICE deposits 50M (active 50M, total 150M).
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
        vault.deposit(mint_for_testing<NUSDC>(ALICE_DEPOSIT, test.ctx()), &pool, 0, &clock, test.ctx());
        return_shared(pool);
        return_shared(vault);
    };

    // ALICE requests 20M → active 30M + pending 20M (total unchanged at 150M).
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.request_withdrawal(20_000_000, &clock, test.ctx());
        return_shared(vault);
    };

    // Manager injects 30M NBTC (simulated trade) and kills the vault.
    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.give_nbtc_for_testing(mint_for_testing<NBTC>(NBTC_INJECT, test.ctx()), test.ctx());
        vault.set_killed(&clock, test.ctx());
        return_shared(vault);
    };

    // Emergency pays ALICE's FULL stake = active(30M) + pending(20M) = 50M shares.
    // If only the active table were paid (30M), nusdc_out would be 30M, not 50M.
    // nusdc_out = 150M*50M/150M = 50M ; nbtc_out = 30M*50M/150M = 10M.
    test.next_tx(ALICE);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        let (out_nusdc, out_nbtc) = vault.claim_withdrawal_emergency(&clock, test.ctx());

        assert_eq!(out_nusdc.value(), 50_000_000);
        assert_eq!(out_nbtc.value(), 10_000_000);
        assert_eq!(vault.shares_of(ALICE), 0);
        assert_eq!(vault.has_pending(ALICE), false);
        assert_eq!(vault.total_shares(), SEED_NUSDC); // 150M - 50M

        destroy(out_nusdc);
        destroy(out_nbtc);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test, expected_failure(abort_code = nasun_vault::vault::ENotKilled)]
fun emergency_claim_on_live_vault_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let (a, b) = vault.claim_withdrawal_emergency(&clock, test.ctx());

    destroy(a);
    destroy(b);
    abort 0
}

#[test]
fun recover_deep_after_kill() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_killed(&clock, test.ctx());
        let deep = vault.recover_deep(test.ctx());
        assert_eq!(deep.value(), SEED_DEEP); // full seeded DEEP recovered
        destroy(deep);
        return_shared(vault);
    };

    destroy(clock);
    end(test);
}

#[test, expected_failure(abort_code = nasun_vault::vault::ENotKilled)]
fun recover_deep_on_live_vault_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    // DEEP is needed to pay fees while live, so recovery is gated on is_killed.
    test.next_tx(MANAGER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let deep = vault.recover_deep(test.ctx());

    destroy(deep);
    abort 0
}

#[test, expected_failure(abort_code = nasun_vault::vault::ENotManager)]
fun recover_deep_non_manager_aborts() {
    let mut test = begin(MANAGER);
    let (clock, vault_id, _pool_id) = setup_vault(&mut test);

    test.next_tx(MANAGER);
    {
        let mut vault = test.take_shared_by_id<Vault>(vault_id);
        vault.set_killed(&clock, test.ctx());
        return_shared(vault);
    };
    test.next_tx(ATTACKER);
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let deep = vault.recover_deep(test.ctx());

    destroy(deep);
    abort 0
}

// The cap-identity binding (object::id(cap) == vault.agent_capability_id) must
// reject a different, even fully-enriched, capability — only the bound cap can
// drive the vault.
#[test, expected_failure(abort_code = nasun_vault::vault::ECapabilityMismatch)]
fun execute_trade_wrong_capability_aborts() {
    let mut test = begin(MANAGER);
    let (clock, tier_reg, vault_id, pool_id) = build_vault(&mut test, true, true);

    // Mint a SECOND, unrelated capability (enriched so it would otherwise pass
    // assert_can_execute); its object id differs from the bound one.
    test.next_tx(MANAGER);
    {
        let cap_reg = test.take_shared<CapabilityRegistry>();
        capability::new_capability(
            &cap_reg,
            vector[b"nasun_vault.spot_trade".to_string()],
            vector[type_name::with_defining_ids<NBTC>()],
            vector[],
            MAX_NOTIONAL,
            0, 0, 0, 0,
            test.ctx(),
        );
        return_shared(cap_reg);
    };

    test.next_tx(MANAGER);
    let wrong_cap_id = most_recent_id_shared<Capability>().destroy_some();
    let mut vault = test.take_shared_by_id<Vault>(vault_id);
    let mut pool = test.take_shared_by_id<Pool<NBTC, NUSDC>>(pool_id);
    let wrong_cap = test.take_shared_by_id<Capability>(wrong_cap_id);
    vault.execute_trade(
        &wrong_cap, &tier_reg, &mut pool, 1, true, ASK_PRICE, VAULT_BID_QTY, TRADE_EXPIRE_MS, &clock, test.ctx(),
    );

    abort 0
}
