#[test_only]
module baram_aer::capability_test {
    use sui::test_scenario as ts;
    use std::string::{Self, String};

    use baram::baram::{Self, BaramRegistry, AdminCap as BaramAdminCap};
    use baram_aer::aer::{Self, AERRegistry, AIExecutionReport};
    use baram_aer::capability::{
        Self as cap,
        Capability,
        CapabilityRegistry,
        RiskLimits,
    };
    use baram_aer::escrow::{Self as escrow_mod, AgentEscrow};

    const ADMIN: address = @0xA11CE;
    const OWNER: address = @0xB0B;          // Wallet that holds the cap + agent
    const OTHER: address = @0xC0C;          // Non-owner; mutations must reject
    const EXECUTOR: address = @0xE7EC;      // Signs the AER tx

    // ===== Fixture helpers =====

    fun hash32(seed: u8): vector<u8> {
        let mut v = vector::empty<u8>();
        let mut i: u64 = 0;
        while (i < 32) {
            vector::push_back(&mut v, seed);
            i = i + 1;
        };
        v
    }

    fun uuidv7_bytes(seed: u8): vector<u8> {
        let mut v = vector::empty<u8>();
        let mut i: u64 = 0;
        while (i < 16) {
            vector::push_back(&mut v, seed);
            i = i + 1;
        };
        v
    }

    fun valid_payload_bytes(): vector<u8> {
        let mut v = vector::empty<u8>();
        vector::push_back(&mut v, 1);
        vector::push_back(&mut v, 2);
        vector::push_back(&mut v, 3);
        v
    }

    fun trade_swap_action_type(): String { string::utf8(b"trade.swap.v1") }
    fun noop_action_type(): String { string::utf8(b"noop.v1") }

    fun setup(): ts::Scenario {
        let mut scenario = ts::begin(ADMIN);
        aer::init_for_testing(ts::ctx(&mut scenario));
        baram::init_for_testing(ts::ctx(&mut scenario));
        cap::init_for_testing(ts::ctx(&mut scenario));

        // Wire the AER authority so consume_receipt accepts AERWitness.
        ts::next_tx(&mut scenario, ADMIN);
        let admin_cap = ts::take_from_sender<BaramAdminCap>(&scenario);
        let mut br = ts::take_shared<BaramRegistry>(&scenario);
        baram::set_aer_authority(&admin_cap, &mut br, @baram_aer);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(br);

        scenario
    }

    // Creates a Capability shared object owned by OWNER with the supplied
    // allowed_actions and max_notional_per_action. Returns nothing; caller
    // takes the shared cap via ts::take_shared<Capability>.
    fun create_cap(
        scenario: &mut ts::Scenario,
        allowed_actions: vector<String>,
        max_notional_per_action: u64,
    ) {
        ts::next_tx(scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(scenario);
        let ctx = ts::ctx(scenario);
        cap::new_capability(
            &registry,
            allowed_actions,
            vector::empty(),
            vector::empty(),
            max_notional_per_action,
            10_000_000_000, // max_daily_loss
            100,            // max_slippage_bps
            200,            // stop_loss_bps
            500,            // take_profit_bps
            ctx,
        );
        ts::return_shared(registry);
    }

    // Default allowed_actions for the happy-path gated AER tests.
    fun default_allowed_actions(): vector<String> {
        let mut v = vector::empty<String>();
        vector::push_back(&mut v, trade_swap_action_type());
        vector::push_back(&mut v, noop_action_type());
        v
    }

    // Issues a SettlementReceipt for (OWNER as requester, EXECUTOR) and calls
    // the gated AER entry. Overrides let each negative test toggle exactly one
    // field. price defaults to 1_000_000 (well under default max_notional).
    fun call_gated(
        scenario: &mut ts::Scenario,
        request_id: u64,
        price: u64,
        action_type: String,
        event_class: u8,
        action_outcome: u8,
        expected_cap_version: u64,
        receipt_requester_override: Option<address>,
    ) {
        ts::next_tx(scenario, EXECUTOR);
        let mut registry = ts::take_shared<AERRegistry>(scenario);
        let baram_registry = ts::take_shared<BaramRegistry>(scenario);
        let capability = ts::take_shared<Capability>(scenario);
        let ctx = ts::ctx(scenario);

        let receipt_requester = if (option::is_some(&receipt_requester_override)) {
            option::destroy_some(receipt_requester_override)
        } else { OWNER };

        let receipt = baram::new_settlement_receipt_for_testing(
            request_id,
            receipt_requester,
            EXECUTOR,
            price,
            string::utf8(b"llama-3.3-70b"),
            hash32(0xAA),
            5_000,
            1_700_000_000_000,
        );

        aer::create_report_with_receipt_capability(
            &mut registry,
            &baram_registry,
            receipt,
            &capability,
            expected_cap_version,
            receipt_requester,                     // initiator
            vector::empty<address>(),
            option::none<address>(),
            option::none<string::String>(),
            option::none<sui::object::ID>(),
            option::none<u64>(),
            option::none<string::String>(),
            hash32(0x11),
            option::none<string::String>(),
            option::none<string::String>(),
            1, 500, 0, false,
            option::none<vector<u8>>(),
            1_699_999_995_000,
            option::none<sui::object::ID>(),
            option::none<sui::object::ID>(),
            uuidv7_bytes(0x77),
            option::none<vector<u8>>(),
            1,
            event_class,
            action_type,
            1,
            string::utf8(b"bcs"),
            hash32(0xBB),
            valid_payload_bytes(),
            string::utf8(b"BUY 50 NUSDC -> NBTC"),
            action_outcome,
            1,
            option::none<string::String>(),
            string::utf8(b"llama-3.3-70b-v1"),
            hash32(0xCC),
            option::some(hash32(0xDD)),
            vector::empty<string::String>(),
            vector::empty<vector<u8>>(),
            ctx,
        );

        ts::return_shared(registry);
        ts::return_shared(baram_registry);
        ts::return_shared(capability);
    }

    // ===== Capability lifecycle tests =====

    #[test]
    fun new_capability_starts_active_unrevoked_version_1() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let c = ts::take_shared<Capability>(&scenario);
        assert!(cap::owner(&c) == OWNER, 1);
        assert!(cap::version(&c) == 1, 2);
        assert!(cap::pause_mode(&c) == 0, 3);
        assert!(!cap::is_revoked(&c), 4);
        assert!(cap::max_notional_per_action(&c) == 100_000_000, 5);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    fun set_pause_mode_wake_blocked_bumps_version() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        assert!(cap::pause_mode(&c) == 2, 10);
        assert!(cap::version(&c) == 2, 11);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    fun set_pause_mode_back_to_active_bumps_version_again() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        cap::set_pause_mode(&mut c, 0, ts::ctx(&mut scenario));
        assert!(cap::pause_mode(&c) == 0, 20);
        assert!(cap::version(&c) == 3, 21);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 559, location = baram_aer::capability)]
    fun set_pause_mode_rejects_execution_only_phase_1() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        // Mode 1 (execution_only) is reserved by integer but not honored in
        // phase 1. D2: avoids latent semantics divergence with host.
        cap::set_pause_mode(&mut c, 1, ts::ctx(&mut scenario));
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 559, location = baram_aer::capability)]
    fun set_pause_mode_rejects_full_suspend_phase_1() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 3, ts::ctx(&mut scenario));
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 555, location = baram_aer::capability)]
    fun set_pause_mode_rejects_out_of_range_enum() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 99, ts::ctx(&mut scenario));
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    fun revoke_flips_flag() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::revoke(&mut c, ts::ctx(&mut scenario));
        assert!(cap::is_revoked(&c), 30);
        // version is NOT bumped by revoke (terminal state).
        assert!(cap::version(&c) == 1, 31);
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 558, location = baram_aer::capability)]
    fun non_owner_cannot_mutate() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        // OTHER tries to pause the cap. Should abort with E_NOT_CAPABILITY_OWNER.
        ts::next_tx(&mut scenario, OTHER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 562, location = baram_aer::capability)]
    fun mutation_after_revoke_rejected() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::revoke(&mut c, ts::ctx(&mut scenario));
        // After revoke, even owner cannot further mutate.
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        ts::return_shared(c);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 556, location = baram_aer::capability)]
    fun new_capability_rejects_bps_out_of_range() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(&scenario);
        cap::new_capability(
            &registry,
            default_allowed_actions(),
            vector::empty(),
            vector::empty(),
            100_000_000,
            10_000_000_000,
            10_001,         // > MAX_BPS (10000)
            200,
            500,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(registry);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 557, location = baram_aer::capability)]
    fun new_capability_rejects_allowed_actions_too_large() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(&scenario);
        let mut actions = vector::empty<String>();
        let mut i: u64 = 0;
        while (i < 17) { // MAX_ALLOWED_ACTIONS = 16
            let mut s = vector::empty<u8>();
            vector::push_back(&mut s, 0x61); // 'a'
            vector::push_back(&mut s, (i as u8) + 0x30);
            vector::push_back(&mut s, 0x2E); // '.'
            vector::push_back(&mut s, 0x76); // 'v'
            vector::push_back(&mut s, 0x31); // '1'
            vector::push_back(&mut actions, string::utf8(s));
            i = i + 1;
        };
        cap::new_capability(
            &registry,
            actions,
            vector::empty(),
            vector::empty(),
            100_000_000,
            10_000_000_000,
            100,
            200,
            500,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(registry);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 561, location = baram_aer::capability)]
    fun new_capability_rejects_duplicate_allowed_action() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, OWNER);
        let registry = ts::take_shared<CapabilityRegistry>(&scenario);
        let mut actions = vector::empty<String>();
        vector::push_back(&mut actions, trade_swap_action_type());
        vector::push_back(&mut actions, trade_swap_action_type()); // dup
        cap::new_capability(
            &registry,
            actions,
            vector::empty(),
            vector::empty(),
            100_000_000,
            10_000_000_000,
            100,
            200,
            500,
            ts::ctx(&mut scenario),
        );
        ts::return_shared(registry);
        ts::end(scenario);
    }

    // ===== Gated AER entry happy paths =====

    #[test]
    fun gated_buy_trade_swap_creates_aer_with_capability_version() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // event_class = 2 (execution), action_outcome = 1 (success).
        call_gated(
            &mut scenario,
            1,
            1_000_000,
            trade_swap_action_type(),
            2,
            1,
            1,
            option::none(),
        );

        // Verify AER was created and capability_version snapshot present.
        ts::next_tx(&mut scenario, OWNER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        let why = aer::why(&aer_obj);
        let cap_v = aer::why_capability_version(why);
        assert!(option::is_some(&cap_v), 100);
        assert!(*option::borrow(&cap_v) == 1, 101);
        ts::return_to_sender(&scenario, aer_obj);

        ts::end(scenario);
    }

    #[test]
    fun gated_hold_noop_cognition_succeeds() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // event_class = 1 (cognition), action_outcome = 2 (hold-noop).
        call_gated(
            &mut scenario,
            1,
            1_000_000,
            noop_action_type(),
            1,
            2,
            1,
            option::none(),
        );

        ts::next_tx(&mut scenario, OWNER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        let why = aer::why(&aer_obj);
        let cap_v = aer::why_capability_version(why);
        assert!(option::is_some(&cap_v), 110);
        ts::return_to_sender(&scenario, aer_obj);

        ts::end(scenario);
    }

    #[test]
    fun gated_post_mutation_version_advances() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // Pause then unpause → cap.version == 3.
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        cap::set_pause_mode(&mut c, 0, ts::ctx(&mut scenario));
        assert!(cap::version(&c) == 3, 120);
        ts::return_shared(c);

        // Caller now must supply expected_cap_version = 3.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 3, option::none());

        ts::next_tx(&mut scenario, OWNER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        let why = aer::why(&aer_obj);
        assert!(*option::borrow(&aer::why_capability_version(why)) == 3, 121);
        ts::return_to_sender(&scenario, aer_obj);

        ts::end(scenario);
    }

    // ===== Gated AER entry negative paths =====

    #[test]
    #[expected_failure(abort_code = 551, location = baram_aer::capability)]
    fun gated_rejects_action_not_in_allowed_actions() {
        let mut scenario = setup();
        // Cap allows only "noop.v1" - "trade.swap.v1" should be rejected.
        let mut narrow = vector::empty<String>();
        vector::push_back(&mut narrow, noop_action_type());
        create_cap(&mut scenario, narrow, 100_000_000);

        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 1, option::none());
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 552, location = baram_aer::capability)]
    fun gated_rejects_payment_above_notional_cap() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100); // tight cap

        // price = 1_000_000 >> max_notional_per_action = 100.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 1, option::none());
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 550, location = baram_aer::capability)]
    fun gated_rejects_when_paused() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // Pause the cap, then try a gated AER with event_class=execution.
        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::set_pause_mode(&mut c, 2, ts::ctx(&mut scenario));
        ts::return_shared(c);

        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 2, option::none());
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 553, location = baram_aer::capability)]
    fun gated_rejects_when_owner_mismatch() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // Receipt requester is OTHER, but cap.owner is OWNER. Mismatch.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 1, option::some(OTHER));
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 560, location = baram_aer::capability)]
    fun gated_rejects_stale_capability_version() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // Caller asserts expected_cap_version = 99, but cap.version = 1.
        // Models the race where host built PTB with stale snapshot.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 99, option::none());
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 562, location = baram_aer::capability)]
    fun gated_rejects_revoked_capability() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        cap::revoke(&mut c, ts::ctx(&mut scenario));
        ts::return_shared(c);

        // version is still 1 (revoke doesn't bump), but revoked flag is checked first.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 2, 1, 1, option::none());
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 564, location = baram_aer::aer)]
    fun gated_rejects_settlement_event_class() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // event_class = 3 (settlement) is reserved for the ungated entry.
        // The gated entry must refuse so an executor can't forge "settlement"
        // attestations under a user capability.
        call_gated(&mut scenario, 1, 1_000_000, trade_swap_action_type(), 3, 1, 1, option::none());
        ts::end(scenario);
    }

    // ===== Helper smoke: RiskLimits constructor =====

    #[test]
    fun risk_limits_constructor_validates_bps() {
        // Round-trip a valid RiskLimits via the public constructor.
        let r: RiskLimits = cap::new_risk_limits(100, 1_000, 100, 200, 500);
        assert!(cap::risk_limits_max_notional(&r) == 100, 200);
        assert!(cap::risk_limits_max_daily_loss(&r) == 1_000, 201);
        assert!(cap::risk_limits_max_slippage_bps(&r) == 100, 202);
        assert!(cap::risk_limits_stop_loss_bps(&r) == 200, 203);
        assert!(cap::risk_limits_take_profit_bps(&r) == 500, 204);
    }

    #[test]
    #[expected_failure(abort_code = 556, location = baram_aer::capability)]
    fun risk_limits_constructor_rejects_bps_out_of_range() {
        let _r: RiskLimits = cap::new_risk_limits(100, 1_000, 10_001, 200, 500);
    }

    // ===== Plan C C3-v2 additions =====

    /// `set_escrow` bumps version and emits MUTATION_KIND_ESCROW (6).
    #[test]
    fun set_escrow_bumps_version_and_records_link() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        ts::next_tx(&mut scenario, OWNER);
        let mut c = ts::take_shared<Capability>(&scenario);
        assert!(option::is_none(&cap::escrow_id(&c)), 700);
        assert!(cap::version(&c) == 1, 701);

        // Use an arbitrary id as a stand-in. The cap module doesn't
        // validate the target object's reciprocal binding here; that
        // happens at withdraw_for_action / settle_action time.
        let fake_escrow_id = object::id_from_address(@0xE5C7);
        cap::set_escrow(&mut c, option::some(fake_escrow_id), ts::ctx(&mut scenario));

        assert!(cap::version(&c) == 2, 702);
        let stamped = cap::escrow_id(&c);
        assert!(option::is_some(&stamped), 703);
        assert!(*option::borrow(&stamped) == fake_escrow_id, 704);
        ts::return_shared(c);
        ts::end(scenario);
    }

    /// Atomic setup PTB (3 commands) leaves cap.escrow_id linked AND
    /// reciprocally bound by the escrow's capability_id field. Models
    /// the wallet-signed setup tx described in DV5.
    #[test]
    fun atomic_setup_links_cap_and_escrow_in_one_tx() {
        let mut scenario = setup();

        ts::next_tx(&mut scenario, OWNER);
        // Three commands compose in one tx-scenario step. In a real
        // PTB these would be Cmd 0/1/2.
        let registry = ts::take_shared<CapabilityRegistry>(&scenario);
        let (cap_obj, witness) = cap::new_capability_and_link(
            &registry,
            default_allowed_actions(),
            vector::empty(),
            vector::empty(),
            100_000_000,
            10_000_000_000,
            100, 200, 500,
            ts::ctx(&mut scenario),
        );
        let cap_id = cap::id_address(&cap_obj);
        let escrow_id = escrow_mod::new_escrow_linked(witness, ts::ctx(&mut scenario));
        cap::finalize_link_and_share(cap_obj, escrow_id, ts::ctx(&mut scenario));
        ts::return_shared(registry);

        // The cap should now exist as a shared object with escrow_id stamped.
        ts::next_tx(&mut scenario, OWNER);
        let c = ts::take_shared<Capability>(&scenario);
        let e = ts::take_shared<AgentEscrow>(&scenario);
        assert!(cap::id_address(&c) == cap_id, 800);
        // Reciprocal binding: cap.escrow_id == id(escrow), escrow.capability_id == id(cap).
        let cap_escrow = cap::escrow_id(&c);
        assert!(option::is_some(&cap_escrow), 801);
        assert!(*option::borrow(&cap_escrow) == object::id(&e), 802);
        assert!(escrow_mod::capability_id(&e) == object::id(&c), 803);
        assert!(escrow_mod::owner(&e) == OWNER, 804);
        // version still 1 (link is creation-time, not a post-hoc mutation).
        assert!(cap::version(&c) == 1, 805);

        ts::return_shared(c);
        ts::return_shared(e);
        ts::end(scenario);
    }

    /// Execution-class gated AER auto-fills `triggered_action` with the
    /// current PTB digest, ignoring caller value (DV10). Cognition-class
    /// preserves caller-supplied value.
    #[test]
    fun gated_execution_triggered_action_autofills_to_tx_digest() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        // Execution-class AER. Caller supplies a sentinel triggered_action
        // that must be IGNORED in favor of the current tx digest.
        let bogus_action_id = object::id_from_address(@0xDEAD);
        call_gated_with_triggered_action(
            &mut scenario,
            1,
            1_000_000,
            trade_swap_action_type(),
            2,
            1,
            1,
            option::some(bogus_action_id),
        );

        ts::next_tx(&mut scenario, OWNER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        let ch = aer::chain(&aer_obj);
        let ta = aer::chain_triggered_action(ch);
        assert!(option::is_some(&ta), 900);
        // Must NOT equal the caller-supplied bogus id.
        assert!(*option::borrow(&ta) != bogus_action_id, 901);
        ts::return_to_sender(&scenario, aer_obj);
        ts::end(scenario);
    }

    /// Cognition-class gated AER preserves caller-supplied
    /// triggered_action (the prior cycle's swap digest pattern from DV11).
    #[test]
    fun gated_cognition_triggered_action_preserves_caller_value() {
        let mut scenario = setup();
        create_cap(&mut scenario, default_allowed_actions(), 100_000_000);

        let prior_swap_id = object::id_from_address(@0xCAFE);
        call_gated_with_triggered_action(
            &mut scenario,
            1,
            1_000_000,
            noop_action_type(),
            1, // cognition
            2, // hold-noop
            1,
            option::some(prior_swap_id),
        );

        ts::next_tx(&mut scenario, OWNER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        let ch = aer::chain(&aer_obj);
        let ta = aer::chain_triggered_action(ch);
        assert!(option::is_some(&ta), 910);
        assert!(*option::borrow(&ta) == prior_swap_id, 911);
        ts::return_to_sender(&scenario, aer_obj);
        ts::end(scenario);
    }

    /// Like `call_gated` but lets the test override the
    /// `triggered_action` arg so DV10's caller-value-vs-auto-fill
    /// behavior can be asserted directly.
    fun call_gated_with_triggered_action(
        scenario: &mut ts::Scenario,
        request_id: u64,
        price: u64,
        action_type: String,
        event_class: u8,
        action_outcome: u8,
        expected_cap_version: u64,
        triggered_action: Option<sui::object::ID>,
    ) {
        ts::next_tx(scenario, EXECUTOR);
        let mut registry = ts::take_shared<AERRegistry>(scenario);
        let baram_registry = ts::take_shared<BaramRegistry>(scenario);
        let capability = ts::take_shared<Capability>(scenario);
        let ctx = ts::ctx(scenario);

        let receipt = baram::new_settlement_receipt_for_testing(
            request_id,
            OWNER,
            EXECUTOR,
            price,
            string::utf8(b"llama-3.3-70b"),
            hash32(0xAA),
            5_000,
            1_700_000_000_000,
        );

        aer::create_report_with_receipt_capability(
            &mut registry,
            &baram_registry,
            receipt,
            &capability,
            expected_cap_version,
            OWNER,
            vector::empty<address>(),
            option::none<address>(),
            option::none<string::String>(),
            option::none<sui::object::ID>(),
            option::none<u64>(),
            option::none<string::String>(),
            hash32(0x11),
            option::none<string::String>(),
            option::none<string::String>(),
            1, 500, 0, false,
            option::none<vector<u8>>(),
            1_699_999_995_000,
            option::none<sui::object::ID>(),
            triggered_action,
            uuidv7_bytes(0x77),
            option::none<vector<u8>>(),
            1,
            event_class,
            action_type,
            1,
            string::utf8(b"bcs"),
            hash32(0xBB),
            valid_payload_bytes(),
            string::utf8(b"BUY 50 NUSDC -> NBTC"),
            action_outcome,
            1,
            option::none<string::String>(),
            string::utf8(b"llama-3.3-70b-v1"),
            hash32(0xCC),
            option::some(hash32(0xDD)),
            vector::empty<string::String>(),
            vector::empty<vector<u8>>(),
            ctx,
        );

        ts::return_shared(registry);
        ts::return_shared(baram_registry);
        ts::return_shared(capability);
    }
}
