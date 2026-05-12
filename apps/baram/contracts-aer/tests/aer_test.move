#[test_only]
module baram_aer::aer_test {
    use sui::test_scenario as ts;
    use std::string;

    use baram::baram::{Self, BaramRegistry, AdminCap as BaramAdminCap};
    use baram_aer::aer::{Self, AERRegistry, AIExecutionReport};

    const ADMIN: address = @0xA11CE;
    const REQUESTER: address = @0xB0B;
    const EXECUTOR: address = @0xE7EC;

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
        // Stand-in for BCS-encoded action payload. Contents are irrelevant on-chain.
        let mut v = vector::empty<u8>();
        vector::push_back(&mut v, 1);
        vector::push_back(&mut v, 2);
        vector::push_back(&mut v, 3);
        v
    }

    // Issues an AER with the standard happy-path inputs, optionally overriding
    // a single field via the `override` enum-like switch. Each negative test
    // toggles exactly one validation to isolate the abort.
    fun call_create(
        scenario: &mut ts::Scenario,
        request_id: u64,
        // overrides - pass sentinels to swap one field
        intent_id_override: Option<vector<u8>>,
        event_class_override: Option<u8>,
        action_outcome_override: Option<u8>,
        trigger_type_override: Option<u8>,
        payload_codec_override: Option<vector<u8>>,
        payload_hash_override: Option<vector<u8>>,
        payload_bytes_override: Option<vector<u8>>,
        action_type_override: Option<vector<u8>>,
        action_summary_override: Option<vector<u8>>,
        prompt_template_hash_override: Option<vector<u8>>,
        market_snapshot_hash_override: Option<Option<vector<u8>>>,
        replay_extras_keys_override: Option<vector<string::String>>,
        replay_extras_vals_override: Option<vector<vector<u8>>>,
    ) {
        ts::next_tx(scenario, EXECUTOR);
        let mut registry = ts::take_shared<AERRegistry>(scenario);
        let baram_registry = ts::take_shared<BaramRegistry>(scenario);
        let ctx = ts::ctx(scenario);

        let receipt = baram::new_settlement_receipt_for_testing(
            request_id,
            REQUESTER,
            EXECUTOR,
            1_000_000,
            string::utf8(b"llama-3.3-70b"),
            hash32(0xAA), // result_hash -> AER output_hash
            5_000,
            1_700_000_000_000,
        );

        // Defaults (happy path)
        let intent_id = if (option::is_some(&intent_id_override)) {
            option::destroy_some(intent_id_override)
        } else {
            uuidv7_bytes(0x77)
        };
        let event_class = if (option::is_some(&event_class_override)) {
            option::destroy_some(event_class_override)
        } else { 2 /* execution */ };
        let action_outcome = if (option::is_some(&action_outcome_override)) {
            option::destroy_some(action_outcome_override)
        } else { 1 /* success */ };
        let trigger_type = if (option::is_some(&trigger_type_override)) {
            option::destroy_some(trigger_type_override)
        } else { 1 /* heartbeat */ };
        let payload_codec = if (option::is_some(&payload_codec_override)) {
            string::utf8(option::destroy_some(payload_codec_override))
        } else {
            string::utf8(b"bcs")
        };
        let payload_bytes = if (option::is_some(&payload_bytes_override)) {
            option::destroy_some(payload_bytes_override)
        } else {
            valid_payload_bytes()
        };
        let payload_hash = if (option::is_some(&payload_hash_override)) {
            option::destroy_some(payload_hash_override)
        } else {
            hash32(0xBB)
        };
        let action_type = if (option::is_some(&action_type_override)) {
            string::utf8(option::destroy_some(action_type_override))
        } else {
            string::utf8(b"trade.swap.v1")
        };
        let action_summary = if (option::is_some(&action_summary_override)) {
            string::utf8(option::destroy_some(action_summary_override))
        } else {
            string::utf8(b"BUY 50 NUSDC -> NBTC")
        };
        let prompt_template_hash = if (option::is_some(&prompt_template_hash_override)) {
            option::destroy_some(prompt_template_hash_override)
        } else {
            hash32(0xCC)
        };
        let market_snapshot_hash = if (option::is_some(&market_snapshot_hash_override)) {
            option::destroy_some(market_snapshot_hash_override)
        } else {
            option::some(hash32(0xDD))
        };
        let replay_extras_keys = if (option::is_some(&replay_extras_keys_override)) {
            option::destroy_some(replay_extras_keys_override)
        } else {
            vector::empty<string::String>()
        };
        let replay_extras_vals = if (option::is_some(&replay_extras_vals_override)) {
            option::destroy_some(replay_extras_vals_override)
        } else {
            vector::empty<vector<u8>>()
        };

        aer::create_report_with_receipt(
            &mut registry,
            &baram_registry,
            receipt,
            // Requester
            REQUESTER,
            vector::empty<address>(),
            // Executor
            option::none<address>(),
            // Payment
            option::none<string::String>(),
            option::none<sui::object::ID>(),
            option::none<u64>(),
            // Inference
            option::none<string::String>(),
            hash32(0x11), // input_hash
            // Why
            option::none<string::String>(),
            option::none<string::String>(),
            // Trust
            1, // tier
            500, // reputation
            0, // stake
            false, // tee_verified
            option::none<vector<u8>>(),
            // When
            1_699_999_995_000,
            // Chain
            option::none<sui::object::ID>(),
            option::none<sui::object::ID>(),
            intent_id,
            option::none<vector<u8>>(),
            1,
            // Envelope
            event_class,
            action_type,
            1, // action_schema_version
            payload_codec,
            payload_hash,
            payload_bytes,
            action_summary,
            action_outcome,
            // Wake
            trigger_type,
            option::none<string::String>(),
            // Replay
            string::utf8(b"llama-3.3-70b-v1"),
            prompt_template_hash,
            market_snapshot_hash,
            replay_extras_keys,
            replay_extras_vals,
            ctx,
        );

        ts::return_shared(registry);
        ts::return_shared(baram_registry);
    }

    fun call_create_default(scenario: &mut ts::Scenario, request_id: u64) {
        call_create(
            scenario,
            request_id,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
    }

    fun setup(): ts::Scenario {
        let mut scenario = ts::begin(ADMIN);
        aer::init_for_testing(ts::ctx(&mut scenario));
        baram::init_for_testing(ts::ctx(&mut scenario));

        // Wire BaramRegistry's AER authority to this package. The witness
        // check in baram::consume_receipt compares against aer's original
        // package id, which in Move tests resolves to @baram_aer.
        ts::next_tx(&mut scenario, ADMIN);
        let admin_cap = ts::take_from_sender<BaramAdminCap>(&scenario);
        let mut br = ts::take_shared<BaramRegistry>(&scenario);
        baram::set_aer_authority(&admin_cap, &mut br, @baram_aer);
        ts::return_to_sender(&scenario, admin_cap);
        ts::return_shared(br);

        scenario
    }

    // ===== Happy path =====

    #[test]
    fun happy_path_creates_aer_object_and_event() {
        let mut scenario = setup();
        call_create_default(&mut scenario, 1);

        // AER object delivered to initiator (== requester)
        ts::next_tx(&mut scenario, REQUESTER);
        let aer_obj = ts::take_from_sender<AIExecutionReport>(&scenario);
        assert!(aer::request_id(&aer_obj) == 1, 1001);
        ts::return_to_sender(&scenario, aer_obj);

        // Registry counter incremented and record_id present
        ts::next_tx(&mut scenario, ADMIN);
        let registry = ts::take_shared<AERRegistry>(&scenario);
        assert!(aer::get_total_records(&registry) == 1, 1002);
        assert!(aer::has_record(&registry, 1), 1003);
        ts::return_shared(registry);

        ts::end(scenario);
    }

    #[test]
    fun happy_path_two_distinct_requests() {
        let mut scenario = setup();
        call_create_default(&mut scenario, 1);
        call_create_default(&mut scenario, 2);

        ts::next_tx(&mut scenario, ADMIN);
        let registry = ts::take_shared<AERRegistry>(&scenario);
        assert!(aer::get_total_records(&registry) == 2, 2001);
        ts::return_shared(registry);

        ts::end(scenario);
    }

    // ===== Negative paths =====

    #[test]
    #[expected_failure(abort_code = 407, location = baram_aer::aer)]
    fun rejects_payload_hash_wrong_length() {
        let mut scenario = setup();
        let mut short = vector::empty<u8>();
        vector::push_back(&mut short, 1);
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
            option::some(short),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 408, location = baram_aer::aer)]
    fun rejects_prompt_template_hash_wrong_length() {
        let mut scenario = setup();
        let bad = vector::empty<u8>();
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
            option::some(bad),
            option::none(), option::none(), option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 409, location = baram_aer::aer)]
    fun rejects_intent_id_wrong_length() {
        let mut scenario = setup();
        let bad = vector::empty<u8>();
        call_create(
            &mut scenario, 1,
            option::some(bad),
            option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 410, location = baram_aer::aer)]
    fun rejects_event_class_out_of_range() {
        let mut scenario = setup();
        call_create(
            &mut scenario, 1,
            option::none(),
            option::some(99u8),
            option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 410, location = baram_aer::aer)]
    fun rejects_action_outcome_out_of_range() {
        let mut scenario = setup();
        call_create(
            &mut scenario, 1,
            option::none(), option::none(),
            option::some(7u8),
            option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 410, location = baram_aer::aer)]
    fun rejects_trigger_type_out_of_range() {
        let mut scenario = setup();
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(),
            option::some(9u8),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 411, location = baram_aer::aer)]
    fun rejects_non_bcs_payload_codec() {
        let mut scenario = setup();
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::some(b"protobuf"),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 412, location = baram_aer::aer)]
    fun rejects_replay_extras_length_mismatch() {
        let mut scenario = setup();
        let mut keys = vector::empty<string::String>();
        vector::push_back(&mut keys, string::utf8(b"a"));
        let vals = vector::empty<vector<u8>>(); // empty -> mismatch
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(),
            option::some(keys),
            option::some(vals),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 412, location = baram_aer::aer)]
    fun rejects_replay_extras_too_many_keys() {
        let mut scenario = setup();
        let mut keys = vector::empty<string::String>();
        let mut vals = vector::empty<vector<u8>>();
        let mut i: u64 = 0;
        while (i < 17) {
            let mut s = vector::empty<u8>();
            vector::push_back(&mut s, 0x6B); // 'k'
            vector::push_back(&mut s, (i as u8) + 0x30);
            vector::push_back(&mut keys, string::utf8(s));
            vector::push_back(&mut vals, vector::empty<u8>());
            i = i + 1;
        };
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(),
            option::some(keys),
            option::some(vals),
        );
        ts::end(scenario);
    }

    // Duplicate replay_extras key triggers vec_map::insert's own abort.
    // vec_map::EKeyAlreadyExists = 0 in sui::vec_map.
    #[test]
    #[expected_failure(abort_code = sui::vec_map::EKeyAlreadyExists)]
    fun rejects_replay_extras_duplicate_key() {
        let mut scenario = setup();
        let mut keys = vector::empty<string::String>();
        vector::push_back(&mut keys, string::utf8(b"dup"));
        vector::push_back(&mut keys, string::utf8(b"dup"));
        let mut vals = vector::empty<vector<u8>>();
        vector::push_back(&mut vals, vector::empty<u8>());
        vector::push_back(&mut vals, vector::empty<u8>());
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(),
            option::some(keys),
            option::some(vals),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 414, location = baram_aer::aer)]
    fun rejects_malformed_action_type_no_dot() {
        let mut scenario = setup();
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(),
            option::some(b"swapv1"), // no dot
            option::none(), option::none(), option::none(), option::none(),
            option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 415, location = baram_aer::aer)]
    fun rejects_action_summary_too_long() {
        let mut scenario = setup();
        let mut s = vector::empty<u8>();
        let mut i: u64 = 0;
        while (i < 281) { vector::push_back(&mut s, 0x78); i = i + 1; };
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::some(s),
            option::none(), option::none(), option::none(), option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 416, location = baram_aer::aer)]
    fun rejects_payload_bytes_too_large() {
        let mut scenario = setup();
        let mut big = vector::empty<u8>();
        let mut i: u64 = 0;
        while (i < 8193) { vector::push_back(&mut big, 0); i = i + 1; };
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(),
            option::some(big),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(),
        );
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 417, location = baram_aer::aer)]
    fun rejects_duplicate_request_id() {
        let mut scenario = setup();
        call_create_default(&mut scenario, 1);
        call_create_default(&mut scenario, 1); // duplicate
        ts::end(scenario);
    }

    // ===== M1 witness gate =====

    /// Foreign witness type defined outside `baram_aer::aer`. Any caller
    /// trying to bypass AER by passing this to `baram::baram::consume_receipt`
    /// must be rejected by the witness gate.
    public struct ForeignWitness has drop {}

    #[test]
    #[expected_failure(abort_code = 11)]
    fun rejects_consume_receipt_with_foreign_witness() {
        let mut scenario = setup();
        ts::next_tx(&mut scenario, EXECUTOR);

        let baram_registry = ts::take_shared<BaramRegistry>(&scenario);
        let receipt = baram::new_settlement_receipt_for_testing(
            999,
            REQUESTER,
            EXECUTOR,
            1_000_000,
            string::utf8(b"llama-3.3-70b"),
            hash32(0xAA),
            5_000,
            1_700_000_000_000,
        );
        // Attempt to consume the receipt via a foreign witness type. This is
        // exactly the M1 attack path the witness gate must close.
        let (_a, _b, _c, _d, _e, _f, _g, _h) =
            baram::consume_receipt(&baram_registry, receipt, ForeignWitness {});
        ts::return_shared(baram_registry);
        ts::end(scenario);
    }

    /// Before `set_aer_authority` is ever called, BaramRegistry.aer_original_id
    /// is @0x0 and ALL consume_receipt calls must abort - even the genuine
    /// AERWitness path. This protects against a misconfigured deployment
    /// where settlement could complete before AER wiring is in place.
    #[test]
    #[expected_failure(abort_code = 11)]
    fun rejects_consume_receipt_when_authority_unset() {
        let mut scenario = ts::begin(ADMIN);
        aer::init_for_testing(ts::ctx(&mut scenario));
        baram::init_for_testing(ts::ctx(&mut scenario));
        // Deliberately skip set_aer_authority.

        ts::next_tx(&mut scenario, EXECUTOR);
        let baram_registry = ts::take_shared<BaramRegistry>(&scenario);
        let receipt = baram::new_settlement_receipt_for_testing(
            1,
            REQUESTER,
            EXECUTOR,
            1_000_000,
            string::utf8(b"llama-3.3-70b"),
            hash32(0xAA),
            5_000,
            1_700_000_000_000,
        );
        let (_a, _b, _c, _d, _e, _f, _g, _h) =
            baram::consume_receipt(&baram_registry, receipt, ForeignWitness {});
        ts::return_shared(baram_registry);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = 413, location = baram_aer::aer)]
    fun rejects_market_snapshot_hash_wrong_length() {
        let mut scenario = setup();
        let mut bad = vector::empty<u8>();
        vector::push_back(&mut bad, 1);
        call_create(
            &mut scenario, 1,
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(), option::none(), option::none(),
            option::none(), option::none(),
            option::some(option::some(bad)),
            option::none(), option::none(),
        );
        ts::end(scenario);
    }
}
