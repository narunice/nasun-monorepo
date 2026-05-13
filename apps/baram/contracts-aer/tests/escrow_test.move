#[test_only]
module baram_aer::escrow_test {
    use sui::test_scenario as ts;
    use sui::balance;
    use sui::coin::{Self, Coin};
    use std::string::{Self, String};
    use std::type_name::{Self, TypeName};

    use baram_aer::capability::{
        Self as cap_mod,
        Capability,
        CapabilityRegistry,
    };
    use baram_aer::escrow::{Self as escrow_mod, AgentEscrow};

    const OWNER: address = @0xB0B;
    const STRANGER: address = @0xC0C;

    // ===== Test-only asset types =====

    public struct ASSET_A has drop {}
    public struct ASSET_B has drop {}
    public struct ASSET_UNAUTH has drop {} // never added to cap.allowed_assets

    fun a_type(): TypeName { type_name::get<ASSET_A>() }
    fun b_type(): TypeName { type_name::get<ASSET_B>() }

    // ===== Fixture helpers =====

    fun allowed_actions(): vector<String> {
        let mut v = vector::empty<String>();
        vector::push_back(&mut v, string::utf8(b"trade.swap.v1"));
        v
    }

    fun allowed_assets_a_b(): vector<TypeName> {
        let mut v = vector::empty<TypeName>();
        vector::push_back(&mut v, a_type());
        vector::push_back(&mut v, b_type());
        v
    }

    fun allowed_assets_a_only(): vector<TypeName> {
        let mut v = vector::empty<TypeName>();
        vector::push_back(&mut v, a_type());
        v
    }

    fun setup(): ts::Scenario {
        let mut scenario = ts::begin(OWNER);
        cap_mod::init_for_testing(ts::ctx(&mut scenario));
        scenario
    }

    /// Atomic-setup primitive used by every test. Returns nothing; the
    /// shared Capability and AgentEscrow are accessible via
    /// ts::take_shared in the test's next tx.
    fun setup_linked(
        scenario: &mut ts::Scenario,
        allowed: vector<TypeName>,
        max_notional: u64,
    ) {
        ts::next_tx(scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(scenario);
        let (c, witness) = cap_mod::new_capability_and_link(
            &registry,
            allowed_actions(),
            allowed,
            vector::empty(),
            max_notional,
            10_000_000_000,
            100, 200, 500,
            ts::ctx(scenario),
        );
        let escrow_id = escrow_mod::new_escrow_linked(witness, ts::ctx(scenario));
        cap_mod::finalize_link_and_share(c, escrow_id, ts::ctx(scenario));
        ts::return_shared(registry);
    }

    /// Mints a fresh `Coin<T>` with `amount` units for tests. Uses
    /// balance::create_for_testing which bypasses the supply/treasury
    /// machinery.
    fun mint_coin<T>(amount: u64, ctx: &mut TxContext): Coin<T> {
        let bal = balance::create_for_testing<T>(amount);
        coin::from_balance(bal, ctx)
    }

    fun deposit_a(scenario: &mut ts::Scenario, amount: u64) {
        ts::next_tx(scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(scenario);
        let c = mint_coin<ASSET_A>(amount, ts::ctx(scenario));
        escrow_mod::deposit<ASSET_A>(&mut e, c, ts::ctx(scenario));
        ts::return_shared(e);
    }

    // ===== Construction / linking =====

    #[test]
    fun atomic_setup_emits_linked_pair() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let c = ts::take_shared<Capability>(&scenario);
        let e = ts::take_shared<AgentEscrow>(&scenario);
        let cap_escrow = cap_mod::escrow_id(&c);
        assert!(option::is_some(&cap_escrow), 1);
        assert!(*option::borrow(&cap_escrow) == object::id(&e), 2);
        assert!(escrow_mod::capability_id(&e) == object::id(&c), 3);
        assert!(escrow_mod::owner(&e) == OWNER, 4);
        assert!(vector::is_empty(escrow_mod::balance_keys(&e)), 5);
        ts::return_shared(c);
        ts::return_shared(e);
        ts::end(scenario);
    }

    // ===== deposit =====

    #[test]
    fun deposit_increments_balance_and_keys() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);
        deposit_a(&mut scenario, 500);

        ts::next_tx(&mut scenario, OWNER);
        let e = ts::take_shared<AgentEscrow>(&scenario);
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 1_500, 10);
        assert!(vector::length(escrow_mod::balance_keys(&e)) == 1, 11);
        ts::return_shared(e);
        ts::end(scenario);
    }

    /// Anyone can deposit -- no owner check on the open `deposit` entry.
    #[test]
    fun deposit_by_stranger_allowed() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);

        ts::next_tx(&mut scenario, STRANGER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = mint_coin<ASSET_A>(42, ts::ctx(&mut scenario));
        escrow_mod::deposit<ASSET_A>(&mut e, c, ts::ctx(&mut scenario));
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 42, 20);
        ts::return_shared(e);
        ts::end(scenario);
    }

    // ===== withdraw_owner (escape hatch) =====

    #[test]
    fun withdraw_owner_happy() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 600, ts::ctx(&mut scenario));
        assert!(coin::value(&c) == 600, 30);
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 400, 31);
        // Burn the withdrawn coin via test-only destroy.
        coin::burn_for_testing(c);
        ts::return_shared(e);
        ts::end(scenario);
    }

    #[test]
    fun withdraw_owner_drains_clears_balance_key() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 1_000, ts::ctx(&mut scenario));
        coin::burn_for_testing(c);
        // Fully drained -> key should be removed so close_escrow works.
        assert!(vector::is_empty(escrow_mod::balance_keys(&e)), 32);
        ts::return_shared(e);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 571, location = baram_aer::escrow)]
    fun withdraw_owner_rejects_non_owner() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, STRANGER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 1, ts::ctx(&mut scenario));
        coin::burn_for_testing(c);
        ts::return_shared(e);
        ts::end(scenario);
    }

    /// Owner can withdraw even when the cap is paused (escape hatch).
    #[test]
    fun withdraw_owner_works_while_paused() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        // Pause the cap.
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap_mod::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        ts::return_shared(c);

        // withdraw_owner still works.
        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let withdrawn = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 500, ts::ctx(&mut scenario));
        assert!(coin::value(&withdrawn) == 500, 40);
        coin::burn_for_testing(withdrawn);
        ts::return_shared(e);
        ts::end(scenario);
    }

    /// Owner can withdraw even when the cap is revoked (escape hatch).
    #[test]
    fun withdraw_owner_works_while_revoked() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap_mod::revoke(&mut c, ts::ctx(&mut scenario));
        ts::return_shared(c);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let withdrawn = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 1, ts::ctx(&mut scenario));
        coin::burn_for_testing(withdrawn);
        ts::return_shared(e);
        ts::end(scenario);
    }

    // ===== withdraw_for_action (cap-gated) =====

    /// Helper: cap-gated withdraw + immediate settle of same-asset
    /// output. Returns the deposited remaining balance for assertions.
    fun gated_withdraw_and_settle(
        scenario: &mut ts::Scenario,
        withdraw_amt: u64,
        output_amt: u64,
        expected_version: u64,
    ) {
        ts::next_tx(scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(scenario);
        let c = ts::take_shared<Capability>(scenario);
        let (coin_a, obligation) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e,
            &c,
            withdraw_amt,
            expected_version,
            ts::ctx(scenario),
        );
        coin::burn_for_testing(coin_a);
        let output = mint_coin<ASSET_B>(output_amt, ts::ctx(scenario));
        escrow_mod::settle_action<ASSET_B>(&mut e, &c, obligation, output, ts::ctx(scenario));
        ts::return_shared(e);
        ts::return_shared(c);
    }

    #[test]
    fun withdraw_for_action_and_settle_happy_swap() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        gated_withdraw_and_settle(&mut scenario, 800, 750, 1);

        // After swap: 200 A remaining (1000 - 800), 750 B deposited.
        ts::next_tx(&mut scenario, OWNER);
        let e = ts::take_shared<AgentEscrow>(&scenario);
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 200, 50);
        assert!(escrow_mod::balance_of<ASSET_B>(&e) == 750, 51);
        ts::return_shared(e);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 562, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_revoked() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap_mod::revoke(&mut c, ts::ctx(&mut scenario));
        ts::return_shared(c);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c2 = ts::take_shared<Capability>(&scenario);
        let (coin_a, ob) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e, &c2, 100, 1, ts::ctx(&mut scenario),
        );
        coin::burn_for_testing(coin_a);
        // Unreachable; consume to satisfy hot-potato.
        let dummy_b = mint_coin<ASSET_B>(1, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_B>(&mut e, &c2, ob, dummy_b, ts::ctx(&mut scenario));
        ts::return_shared(e);
        ts::return_shared(c2);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 550, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_paused() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap_mod::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        ts::return_shared(c);

        // After pause, cap.version was bumped to 2.
        gated_withdraw_and_settle(&mut scenario, 100, 100, 2);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 560, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_stale_version() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        // expected_version = 99 but cap.version = 1.
        gated_withdraw_and_settle(&mut scenario, 100, 100, 99);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 572, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_unauthorized_asset() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_only(), 100_000_000);
        // Deposit B (unauthorized in cap.allowed_assets) using the open
        // deposit entry (which doesn't check cap.allowed_assets).
        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c_b = mint_coin<ASSET_B>(1_000, ts::ctx(&mut scenario));
        escrow_mod::deposit<ASSET_B>(&mut e, c_b, ts::ctx(&mut scenario));
        ts::return_shared(e);

        // Now try to withdraw B via the cap-gated path. Should abort.
        ts::next_tx(&mut scenario, OWNER);
        let mut e2 = ts::take_shared<AgentEscrow>(&scenario);
        let c2 = ts::take_shared<Capability>(&scenario);
        let (coin_b, ob) = escrow_mod::withdraw_for_action<ASSET_B>(
            &mut e2, &c2, 100, 1, ts::ctx(&mut scenario),
        );
        coin::burn_for_testing(coin_b);
        let dummy = mint_coin<ASSET_A>(1, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_A>(&mut e2, &c2, ob, dummy, ts::ctx(&mut scenario));
        ts::return_shared(e2);
        ts::return_shared(c2);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 552, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_above_notional_cap() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100); // tiny cap
        deposit_a(&mut scenario, 1_000);

        // amount = 200 > max_notional_per_action = 100.
        gated_withdraw_and_settle(&mut scenario, 200, 200, 1);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 573, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_insufficient_balance() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 100);

        // amount > balance.
        gated_withdraw_and_settle(&mut scenario, 200, 200, 1);
        ts::end(scenario);
    }

    /// Reciprocal binding broken: cap.escrow_id points to a DIFFERENT
    /// escrow. set_escrow lets the wallet shoot its own foot; the
    /// runtime check then refuses the spend.
    #[test]
    #[expected_failure(abort_code = 577, location = baram_aer::escrow)]
    fun withdraw_for_action_rejects_reciprocal_binding_broken() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        // Rebind cap to a different (bogus) escrow id.
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        let bogus = object::id_from_address(@0xDEAD);
        cap_mod::set_escrow(&mut c, option::some(bogus), ts::ctx(&mut scenario));
        ts::return_shared(c);

        // cap.version is now 2 (set_escrow bumps). Pass expected=2 so the
        // version check passes but the reciprocal check fails.
        gated_withdraw_and_settle(&mut scenario, 100, 100, 2);
        ts::end(scenario);
    }

    // ===== settle_action =====

    /// Cap-mixing attack: withdraw from escrow_A's cap_A, try to settle
    /// with cap_B. The SpendObligation carries cap_A's id; settle aborts.
    /// This is the structural correction over v1 (DV3).
    #[test]
    #[expected_failure(abort_code = 576, location = baram_aer::escrow)]
    fun settle_action_rejects_cap_mixing() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        // Snapshot cap_A's id and escrow_A's id, then create cap_B
        // (with its own escrow_B that we deliberately won't use).
        ts::next_tx(&mut scenario, OWNER);
        let cap_a_view = ts::take_shared<Capability>(&scenario);
        let escrow_a_view = ts::take_shared<AgentEscrow>(&scenario);
        let cap_a_id = object::id(&cap_a_view);
        let escrow_a_id = object::id(&escrow_a_view);
        ts::return_shared(cap_a_view);
        ts::return_shared(escrow_a_view);

        // Build a second cap+escrow pair.
        ts::next_tx(&mut scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(&scenario);
        let (cap_b, witness_b) = cap_mod::new_capability_and_link(
            &registry,
            allowed_actions(),
            allowed_assets_a_b(),
            vector::empty(),
            100_000_000,
            10_000_000_000,
            100, 200, 500,
            ts::ctx(&mut scenario),
        );
        let cap_b_id = object::id(&cap_b);
        let escrow_b_id = escrow_mod::new_escrow_linked(witness_b, ts::ctx(&mut scenario));
        cap_mod::finalize_link_and_share(cap_b, escrow_b_id, ts::ctx(&mut scenario));
        ts::return_shared(registry);

        // Take both caps by id (multiple shared objects of the same
        // type require take_shared_by_id for deterministic selection).
        ts::next_tx(&mut scenario, OWNER);
        let mut e_a = ts::take_shared_by_id<AgentEscrow>(&scenario, escrow_a_id);
        let a = ts::take_shared_by_id<Capability>(&scenario, cap_a_id);
        let b = ts::take_shared_by_id<Capability>(&scenario, cap_b_id);

        // Withdraw from escrow_a using cap_a -> obligation carries cap_a's id.
        let (coin_a, ob) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e_a, &a, 100, 1, ts::ctx(&mut scenario),
        );
        coin::burn_for_testing(coin_a);
        // Settle with cap_b (DIFFERENT cap). Should abort with E_OBLIGATION_CAP_MISMATCH.
        let out = mint_coin<ASSET_B>(100, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_B>(&mut e_a, &b, ob, out, ts::ctx(&mut scenario));

        ts::return_shared(e_a);
        ts::return_shared(a);
        ts::return_shared(b);
        ts::end(scenario);
    }

    /// Dust-deposit attack: swap output is an unauthorized asset.
    /// settle_action aborts so the attacker can't smuggle a non-allowed
    /// token into the escrow under the guise of a legitimate spend.
    #[test]
    #[expected_failure(abort_code = 572, location = baram_aer::escrow)]
    fun settle_action_rejects_unauthorized_output_asset() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        let (coin_a, ob) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e, &c, 100, 1, ts::ctx(&mut scenario),
        );
        coin::burn_for_testing(coin_a);
        // Settle with ASSET_UNAUTH which is NOT in cap.allowed_assets.
        let bad_out = mint_coin<ASSET_UNAUTH>(100, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_UNAUTH>(&mut e, &c, ob, bad_out, ts::ctx(&mut scenario));
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 578, location = baram_aer::escrow)]
    fun settle_action_rejects_zero_output_coin() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        let (coin_a, ob) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e, &c, 100, 1, ts::ctx(&mut scenario),
        );
        coin::burn_for_testing(coin_a);
        let zero_out = mint_coin<ASSET_B>(0, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_B>(&mut e, &c, ob, zero_out, ts::ctx(&mut scenario));
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }

    // ===== deposit_swap_leftover =====

    #[test]
    fun deposit_swap_leftover_happy() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        // Simulate the swap PTB Cmd 4: deposit a leftover input coin.
        let leftover = mint_coin<ASSET_A>(25, ts::ctx(&mut scenario));
        escrow_mod::deposit_swap_leftover<ASSET_A>(&mut e, &c, leftover);
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 1_025, 60);
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }

    /// Zero-value leftover (lot-size rounding produced exact-fill) is
    /// accepted; we don't punish the swap for being clean.
    #[test]
    fun deposit_swap_leftover_zero_accepted() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        let zero = mint_coin<ASSET_A>(0, ts::ctx(&mut scenario));
        escrow_mod::deposit_swap_leftover<ASSET_A>(&mut e, &c, zero);
        // Balance still zero, key registered.
        assert!(escrow_mod::balance_of<ASSET_A>(&e) == 0, 70);
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 572, location = baram_aer::escrow)]
    fun deposit_swap_leftover_rejects_unauthorized_asset() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_only(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        let bad = mint_coin<ASSET_B>(10, ts::ctx(&mut scenario));
        escrow_mod::deposit_swap_leftover<ASSET_B>(&mut e, &c, bad);
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }

    // ===== close_escrow =====

    #[test]
    fun close_escrow_after_full_drain() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        // Drain.
        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let withdrawn = escrow_mod::withdraw_owner<ASSET_A>(&mut e, 1_000, ts::ctx(&mut scenario));
        coin::burn_for_testing(withdrawn);
        ts::return_shared(e);

        // Now close.
        ts::next_tx(&mut scenario, OWNER);
        let e2 = ts::take_shared<AgentEscrow>(&scenario);
        escrow_mod::close_escrow(e2, ts::ctx(&mut scenario));

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 574, location = baram_aer::escrow)]
    fun close_escrow_rejects_non_empty() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let e = ts::take_shared<AgentEscrow>(&scenario);
        escrow_mod::close_escrow(e, ts::ctx(&mut scenario));

        ts::end(scenario);
    }

    // ===== SpendObligation views (sanity) =====

    #[test]
    fun spend_obligation_views_match() {
        let mut scenario = setup();
        setup_linked(&mut scenario, allowed_assets_a_b(), 100_000_000);
        deposit_a(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut e = ts::take_shared<AgentEscrow>(&scenario);
        let c = ts::take_shared<Capability>(&scenario);
        let (coin_a, ob) = escrow_mod::withdraw_for_action<ASSET_A>(
            &mut e, &c, 250, 1, ts::ctx(&mut scenario),
        );
        assert!(escrow_mod::obligation_amount(&ob) == 250, 80);
        assert!(escrow_mod::obligation_capability_id(&ob) == object::id(&c), 81);
        assert!(escrow_mod::obligation_escrow_id(&ob) == object::id(&e), 82);
        let _ot: TypeName = escrow_mod::obligation_asset(&ob);
        // Drop the obligation by consuming via settle.
        coin::burn_for_testing(coin_a);
        let out = mint_coin<ASSET_B>(250, ts::ctx(&mut scenario));
        escrow_mod::settle_action<ASSET_B>(&mut e, &c, ob, out, ts::ctx(&mut scenario));
        ts::return_shared(e);
        ts::return_shared(c);
        ts::end(scenario);
    }
}
