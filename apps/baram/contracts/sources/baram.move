/// Baram - Private AI Computation Settlement
///
/// Core concept: Escrow + Execution Proof = Trustless Settlement
///
/// User pays NUSDC upfront, funds are locked until:
/// 1. Executor submits proof -> payment released to executor
/// 2. Timeout reached -> user can claim refund
/// 3. User cancels before execution -> user gets refund
#[allow(lint(self_transfer))]
module baram::baram {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::address as sui_address;
    use std::string::String;
    use std::type_name;
    use std::ascii;
    use devnet_tokens::nusdc::NUSDC;

    // ========== Error Codes ==========
    const E_INVALID_AMOUNT: u64 = 0;
    const E_INVALID_PROMPT_HASH: u64 = 1;
    const E_REQUEST_NOT_FOUND: u64 = 2;
    const E_NOT_EXECUTOR: u64 = 3;
    const E_NOT_REQUESTER: u64 = 4;
    const E_ALREADY_SETTLED: u64 = 5;
    #[allow(unused_const)]
    const E_ALREADY_CANCELLED: u64 = 6; // Reserved for future use
    const E_TIMEOUT_NOT_REACHED: u64 = 7;
    const E_TIMEOUT_REACHED: u64 = 8;
    const E_INVALID_RESULT_HASH: u64 = 9;
    const E_INVALID_PRICE: u64 = 10;
    /// Settlement receipt was consumed by a module other than the registered
    /// AER package. See `consume_receipt` for the witness-gate rationale.
    const E_INVALID_AER_WITNESS: u64 = 11;
    /// Caller does not hold a valid `AdminCap`.
    #[allow(unused_const)]
    const E_NOT_ADMIN: u64 = 12;

    // ========== Constants ==========
    const STATUS_PENDING: u8 = 0;
    const STATUS_EXECUTING: u8 = 1;
    const STATUS_COMPLETED: u8 = 2;
    const STATUS_CANCELLED: u8 = 3;
    const STATUS_REFUNDED: u8 = 4;

    const DEFAULT_TIMEOUT_MS: u64 = 300_000; // 5 minutes
    const MIN_PRICE: u64 = 100_000; // 0.1 NUSDC (6 decimals)
    const PROMPT_HASH_LENGTH: u64 = 32; // SHA-256

    // ========== Structs ==========

    /// Shared registry for all compute requests
    /// Anyone can read, only specific addresses can modify specific requests
    public struct BaramRegistry has key {
        id: UID,
        next_request_id: u64,
        requests: Table<u64, ComputeRequest>,
        total_volume: u64,      // Total NUSDC volume processed
        total_requests: u64,    // Total requests created
        total_completed: u64,   // Total requests completed
        /// Original package id of the AER module authorized to consume
        /// SettlementReceipts. Initialized to @0x0 (no module authorized) and
        /// set post-publish by AdminCap via `set_aer_authority`. While zero,
        /// `consume_receipt` aborts unconditionally - preventing any
        /// settlement from completing until the operator wires AER in.
        aer_original_id: address,
    }

    /// Admin capability for baram-side governance (currently: AER authority binding).
    public struct AdminCap has key, store {
        id: UID,
    }

    /// A single compute request with escrow
    public struct ComputeRequest has store {
        request_id: u64,
        requester: address,
        executor: address,

        // Escrow
        escrow: Balance<NUSDC>,
        price: u64,

        // Request data
        prompt_hash: vector<u8>,  // SHA-256 of encrypted prompt
        model: String,            // e.g., "gpt-4o-mini"

        // Timing
        created_at: u64,
        timeout_at: u64,
        completed_at: u64,

        // Status
        status: u8,

        // Result (set after execution)
        result_hash: vector<u8>,
        execution_time_ms: u64,
    }

    /// Receipt NFT for requester (proof of request)
    public struct RequestReceipt has key, store {
        id: UID,
        request_id: u64,
        requester: address,
        executor: address,
        price: u64,
        prompt_hash: vector<u8>,
        model: String,
        created_at: u64,
        timeout_at: u64,
    }

    /// Hot-potato receipt proving a settlement occurred.
    /// Has NO `drop` ability - must be consumed by AER module.
    /// Ensures every settlement generates an audit report.
    public struct SettlementReceipt {
        request_id: u64,
        requester: address,
        executor: address,
        price: u64,
        model: String,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        settled_at: u64,
    }

    // ========== Events ==========

    public struct RequestCreated has copy, drop {
        request_id: u64,
        requester: address,
        executor: address,
        price: u64,
        prompt_hash: vector<u8>,
        model: String,
        timeout_at: u64,
    }

    public struct RequestSettled has copy, drop {
        request_id: u64,
        executor: address,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        payout: u64,
    }

    public struct RequestCancelled has copy, drop {
        request_id: u64,
        requester: address,
        refund: u64,
        reason: u8,  // 0=user_cancelled, 1=timeout
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let registry = BaramRegistry {
            id: object::new(ctx),
            next_request_id: 1,
            requests: table::new(ctx),
            total_volume: 0,
            total_requests: 0,
            total_completed: 0,
            // Operator must call `set_aer_authority` after the AER package is
            // published. Until then, `consume_receipt` aborts and no settlement
            // can complete.
            aer_original_id: @0x0,
        };
        transfer::share_object(registry);

        let admin = AdminCap { id: object::new(ctx) };
        transfer::transfer(admin, tx_context::sender(ctx));
    }

    // ========== Admin Functions ==========

    /// Set the AER package's original id (Sui Move package address at first
    /// publish). Must be called once after the AER package is published.
    /// Can be re-called to migrate to a re-published AER package, but doing so
    /// invalidates any unconsumed SettlementReceipts that bound to the previous
    /// authority. AdminCap holder is responsible for coordinating cutover.
    public fun set_aer_authority(
        _admin: &AdminCap,
        registry: &mut BaramRegistry,
        aer_original_id: address,
    ) {
        registry.aer_original_id = aer_original_id;
    }

    public fun get_aer_authority(registry: &BaramRegistry): address {
        registry.aer_original_id
    }

    // ========== User Functions ==========

    /// Create a new compute request with NUSDC escrow
    ///
    /// Arguments:
    /// - registry: Shared BaramRegistry
    /// - payment: NUSDC coin for payment
    /// - prompt_hash: SHA-256 hash of the encrypted prompt (32 bytes)
    /// - model: AI model identifier (e.g., "gpt-4o-mini")
    /// - executor: Address of the executor who will process this request
    /// - clock: Sui Clock object for timestamp
    public entry fun create_request(
        registry: &mut BaramRegistry,
        payment: Coin<NUSDC>,
        prompt_hash: vector<u8>,
        model: String,
        executor: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let price = coin::value(&payment);

        // Validations
        assert!(price >= MIN_PRICE, E_INVALID_AMOUNT);
        assert!(vector::length(&prompt_hash) == PROMPT_HASH_LENGTH, E_INVALID_PROMPT_HASH);

        let requester = tx_context::sender(ctx);
        let now = clock.timestamp_ms();
        let request_id = registry.next_request_id;

        // Increment counters
        registry.next_request_id = request_id + 1;
        registry.total_requests = registry.total_requests + 1;
        registry.total_volume = registry.total_volume + price;

        // Create request
        let request = ComputeRequest {
            request_id,
            requester,
            executor,
            escrow: coin::into_balance(payment),
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
            completed_at: 0,
            status: STATUS_PENDING,
            result_hash: vector::empty(),
            execution_time_ms: 0,
        };

        // Store request
        table::add(&mut registry.requests, request_id, request);

        // Create receipt NFT for requester
        let receipt = RequestReceipt {
            id: object::new(ctx),
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        };

        // Emit event
        event::emit(RequestCreated {
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        });

        // Transfer receipt to requester
        transfer::transfer(receipt, requester);
    }

    /// Cancel request and get refund (only before execution starts)
    /// Can only be called by the requester
    public entry fun cancel_request(
        registry: &mut BaramRegistry,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.requests, request_id), E_REQUEST_NOT_FOUND);
        let request = table::borrow_mut(&mut registry.requests, request_id);

        // Validations
        assert!(request.requester == tx_context::sender(ctx), E_NOT_REQUESTER);
        assert!(request.status == STATUS_PENDING, E_ALREADY_SETTLED);

        let now = clock.timestamp_ms();
        // Can only cancel before timeout (after timeout, use claim_timeout_refund)
        assert!(now < request.timeout_at, E_TIMEOUT_REACHED);

        // Update status
        request.status = STATUS_CANCELLED;

        // Refund
        let refund_amount = balance::value(&request.escrow);
        let refund_balance = balance::withdraw_all(&mut request.escrow);
        let refund_coin = coin::from_balance(refund_balance, ctx);

        // Emit event
        event::emit(RequestCancelled {
            request_id,
            requester: request.requester,
            refund: refund_amount,
            reason: 0, // user_cancelled
        });

        // Send refund to requester
        transfer::public_transfer(refund_coin, request.requester);
    }

    /// Claim refund after timeout (executor didn't complete in time)
    /// Can only be called by the requester
    public entry fun claim_timeout_refund(
        registry: &mut BaramRegistry,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.requests, request_id), E_REQUEST_NOT_FOUND);
        let request = table::borrow_mut(&mut registry.requests, request_id);

        // Validations
        assert!(request.requester == tx_context::sender(ctx), E_NOT_REQUESTER);
        assert!(
            request.status == STATUS_PENDING || request.status == STATUS_EXECUTING,
            E_ALREADY_SETTLED
        );

        let now = clock.timestamp_ms();
        // Must be after timeout
        assert!(now >= request.timeout_at, E_TIMEOUT_NOT_REACHED);

        // Update status
        request.status = STATUS_REFUNDED;

        // Refund
        let refund_amount = balance::value(&request.escrow);
        let refund_balance = balance::withdraw_all(&mut request.escrow);
        let refund_coin = coin::from_balance(refund_balance, ctx);

        // Emit event
        event::emit(RequestCancelled {
            request_id,
            requester: request.requester,
            refund: refund_amount,
            reason: 1, // timeout
        });

        // Send refund to requester
        transfer::public_transfer(refund_coin, request.requester);
    }

    // ========== Executor Functions ==========

    /// Mark request as executing (optional, for status tracking)
    public entry fun mark_executing(
        registry: &mut BaramRegistry,
        request_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.requests, request_id), E_REQUEST_NOT_FOUND);
        let request = table::borrow_mut(&mut registry.requests, request_id);

        // Validations
        assert!(request.executor == tx_context::sender(ctx), E_NOT_EXECUTOR);
        assert!(request.status == STATUS_PENDING, E_ALREADY_SETTLED);

        let now = clock.timestamp_ms();
        assert!(now < request.timeout_at, E_TIMEOUT_REACHED);

        // Update status
        request.status = STATUS_EXECUTING;
    }

    /// Submit execution proof and receive payment
    /// Can only be called by the designated executor
    public entry fun submit_proof(
        registry: &mut BaramRegistry,
        request_id: u64,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&registry.requests, request_id), E_REQUEST_NOT_FOUND);
        let request = table::borrow_mut(&mut registry.requests, request_id);

        // Validations
        let sender = tx_context::sender(ctx);
        assert!(request.executor == sender, E_NOT_EXECUTOR);
        assert!(
            request.status == STATUS_PENDING || request.status == STATUS_EXECUTING,
            E_ALREADY_SETTLED
        );
        assert!(vector::length(&result_hash) == PROMPT_HASH_LENGTH, E_INVALID_RESULT_HASH);

        let now = clock.timestamp_ms();
        // Must complete before timeout
        assert!(now < request.timeout_at, E_TIMEOUT_REACHED);

        // Update request
        request.status = STATUS_COMPLETED;
        request.result_hash = result_hash;
        request.execution_time_ms = execution_time_ms;
        request.completed_at = now;

        // Update registry stats
        registry.total_completed = registry.total_completed + 1;

        // Transfer payment to executor
        let payout = balance::value(&request.escrow);
        let payout_balance = balance::withdraw_all(&mut request.escrow);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        // Emit event
        event::emit(RequestSettled {
            request_id,
            executor: sender,
            result_hash,
            execution_time_ms,
            payout,
        });

        // Send payment to executor
        transfer::public_transfer(payout_coin, sender);
    }

    /// Submit execution proof and receive payment + SettlementReceipt.
    /// The receipt MUST be consumed by AER module (hot-potato pattern).
    /// Use in a PTB: submit_proof_with_receipt -> aer::create_report_with_receipt
    public fun submit_proof_with_receipt(
        registry: &mut BaramRegistry,
        request_id: u64,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): SettlementReceipt {
        assert!(table::contains(&registry.requests, request_id), E_REQUEST_NOT_FOUND);
        let request = table::borrow_mut(&mut registry.requests, request_id);

        // Validations
        let sender = tx_context::sender(ctx);
        assert!(request.executor == sender, E_NOT_EXECUTOR);
        assert!(
            request.status == STATUS_PENDING || request.status == STATUS_EXECUTING,
            E_ALREADY_SETTLED
        );
        assert!(vector::length(&result_hash) == PROMPT_HASH_LENGTH, E_INVALID_RESULT_HASH);

        let now = clock.timestamp_ms();
        assert!(now < request.timeout_at, E_TIMEOUT_REACHED);

        // Update request
        request.status = STATUS_COMPLETED;
        request.result_hash = result_hash;
        request.execution_time_ms = execution_time_ms;
        request.completed_at = now;

        // Update registry stats
        registry.total_completed = registry.total_completed + 1;

        // Transfer payment to executor
        let payout = balance::value(&request.escrow);
        let payout_balance = balance::withdraw_all(&mut request.escrow);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        // Emit event
        event::emit(RequestSettled {
            request_id,
            executor: sender,
            result_hash,
            execution_time_ms,
            payout,
        });

        transfer::public_transfer(payout_coin, sender);

        // Return hot-potato receipt (MUST be consumed by AER module)
        SettlementReceipt {
            request_id,
            requester: request.requester,
            executor: sender,
            price: request.price,
            model: request.model,
            result_hash,
            execution_time_ms,
            settled_at: now,
        }
    }

    /// Consume a SettlementReceipt and return its fields.
    ///
    /// Witness-gated: the generic witness `W` must be a type defined inside
    /// the AER module that the operator registered via `set_aer_authority`.
    /// This enforces the invariant
    ///
    ///   economic settlement <=> canonical AER existence
    ///
    /// - without it, any caller could destructure a SettlementReceipt directly
    /// in a PTB (since the returned primitives all have `drop`) and pocket the
    /// payout without ever creating an AER. The check uses
    /// `type_name::with_original_ids` so the authority binding survives AER
    /// package upgrades but breaks deliberately on a clean-slate AER republish
    /// (admin must call `set_aer_authority` to migrate).
    ///
    /// The witness is consumed (it has `drop`); only its TypeName is inspected.
    /// Callers from the authorized AER module pass `AERWitness {}`.
    public fun consume_receipt<W: drop>(
        registry: &BaramRegistry,
        receipt: SettlementReceipt,
        _witness: W,
    ): (u64, address, address, u64, String, vector<u8>, u64, u64) {
        // Reject when no authority registered yet (operator forgot to wire AER).
        assert!(registry.aer_original_id != @0x0, E_INVALID_AER_WITNESS);

        // TypeName check: W must come from <registered aer original id>::aer::*.
        // address_string() returns lowercase hex without 0x prefix, matching
        // sui_address::to_ascii_string's format.
        let tn = type_name::with_original_ids<W>();
        let actual_addr = tn.address_string();
        let expected_addr = sui_address::to_ascii_string(registry.aer_original_id);
        assert!(actual_addr == expected_addr, E_INVALID_AER_WITNESS);
        let actual_module = tn.module_string();
        assert!(actual_module == ascii::string(b"aer"), E_INVALID_AER_WITNESS);

        let SettlementReceipt {
            request_id,
            requester,
            executor,
            price,
            model,
            result_hash,
            execution_time_ms,
            settled_at,
        } = receipt;

        (request_id, requester, executor, price, model, result_hash, execution_time_ms, settled_at)
    }

    // ========== Test Helpers ==========

    /// Mint a SettlementReceipt for unit tests without going through the full
    /// escrow flow. Receipt remains a hot-potato (no drop) so callers must
    /// still hand it to `aer::create_report_with_receipt` or `consume_receipt`.
    #[test_only]
    public fun new_settlement_receipt_for_testing(
        request_id: u64,
        requester: address,
        executor: address,
        price: u64,
        model: String,
        result_hash: vector<u8>,
        execution_time_ms: u64,
        settled_at: u64,
    ): SettlementReceipt {
        SettlementReceipt {
            request_id,
            requester,
            executor,
            price,
            model,
            result_hash,
            execution_time_ms,
            settled_at,
        }
    }

    // ========== View Functions ==========

    /// Get request status (returns 255 if not found)
    public fun get_request_status(registry: &BaramRegistry, request_id: u64): u8 {
        if (!table::contains(&registry.requests, request_id)) {
            return 255
        };
        let request = table::borrow(&registry.requests, request_id);
        request.status
    }

    /// Get request price
    public fun get_request_price(registry: &BaramRegistry, request_id: u64): u64 {
        let request = table::borrow(&registry.requests, request_id);
        request.price
    }

    /// Get request requester
    public fun get_request_requester(registry: &BaramRegistry, request_id: u64): address {
        let request = table::borrow(&registry.requests, request_id);
        request.requester
    }

    /// Get request executor
    public fun get_request_executor(registry: &BaramRegistry, request_id: u64): address {
        let request = table::borrow(&registry.requests, request_id);
        request.executor
    }

    /// Get request timeout timestamp
    public fun get_request_timeout(registry: &BaramRegistry, request_id: u64): u64 {
        let request = table::borrow(&registry.requests, request_id);
        request.timeout_at
    }

    /// Get request result hash (empty if not completed)
    public fun get_request_result_hash(registry: &BaramRegistry, request_id: u64): vector<u8> {
        let request = table::borrow(&registry.requests, request_id);
        request.result_hash
    }

    /// Get registry statistics
    public fun get_registry_stats(registry: &BaramRegistry): (u64, u64, u64, u64) {
        (
            registry.next_request_id - 1,  // total created
            registry.total_completed,
            registry.total_requests,
            registry.total_volume
        )
    }

    /// Check if request exists
    public fun request_exists(registry: &BaramRegistry, request_id: u64): bool {
        table::contains(&registry.requests, request_id)
    }

    /// Get next request ID (for use with Budget spending)
    public fun get_next_request_id(registry: &BaramRegistry): u64 {
        registry.next_request_id
    }

    // ========== Budget Integration ==========

    /// DEPRECATED: Use create_request_with_budget_v2 instead.
    /// This v1 function always charges max_per_request regardless of actual cost,
    /// leading to systematic overcharging. Kept for signature compatibility only.
    public entry fun create_request_with_budget(
        registry: &mut BaramRegistry,
        budget: &mut baram::budget::Budget,
        prompt_hash: vector<u8>,
        model: String,
        executor: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Validations
        assert!(vector::length(&prompt_hash) == PROMPT_HASH_LENGTH, E_INVALID_PROMPT_HASH);

        let now = clock.timestamp_ms();
        let request_id = registry.next_request_id;

        // Get price from Budget's max_per_request or use min price
        // In production, this would be determined by model pricing
        let budget_max = baram::budget::get_max_per_request(budget);
        let price = if (budget_max < MIN_PRICE) { MIN_PRICE } else { budget_max };

        // Spend from budget (validates agent authorization, limits, allowlists)
        let payment_balance = baram::budget::spend_from_budget(
            budget,
            price,
            model,
            executor,
            request_id,
            clock,
            ctx
        );

        // Increment counters
        registry.next_request_id = request_id + 1;
        registry.total_requests = registry.total_requests + 1;
        registry.total_volume = registry.total_volume + price;

        // Create request with budget owner as requester (not the agent)
        let requester = baram::budget::get_owner(budget);

        let request = ComputeRequest {
            request_id,
            requester,
            executor,
            escrow: payment_balance,
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
            completed_at: 0,
            status: STATUS_PENDING,
            result_hash: vector::empty(),
            execution_time_ms: 0,
        };

        // Store request
        table::add(&mut registry.requests, request_id, request);

        // Create receipt NFT for requester (budget owner)
        let receipt = RequestReceipt {
            id: object::new(ctx),
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        };

        // Emit event
        event::emit(RequestCreated {
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        });

        // Transfer receipt to requester (budget owner)
        transfer::transfer(receipt, requester);
    }

    /// Create a request using Budget with category + time-windowed limit enforcement
    /// Enhanced version of create_request_with_budget that uses SpendingLimits
    public entry fun create_request_with_budget_v2(
        registry: &mut BaramRegistry,
        budget: &mut baram::budget::Budget,
        prompt_hash: vector<u8>,
        model: String,
        executor: address,
        price: u64,
        category: String,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Validations
        assert!(vector::length(&prompt_hash) == PROMPT_HASH_LENGTH, E_INVALID_PROMPT_HASH);
        assert!(price >= MIN_PRICE, E_INVALID_PRICE);

        let now = clock.timestamp_ms();
        let request_id = registry.next_request_id;

        // Spend from budget with category + limit enforcement
        let payment_balance = baram::budget::spend_from_budget_with_category(
            budget,
            price,
            model,
            executor,
            request_id,
            category,
            clock,
            ctx
        );

        // Increment counters
        registry.next_request_id = request_id + 1;
        registry.total_requests = registry.total_requests + 1;
        registry.total_volume = registry.total_volume + price;

        // Create request with budget owner as requester (not the agent)
        let requester = baram::budget::get_owner(budget);

        let request = ComputeRequest {
            request_id,
            requester,
            executor,
            escrow: payment_balance,
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
            completed_at: 0,
            status: STATUS_PENDING,
            result_hash: vector::empty(),
            execution_time_ms: 0,
        };

        // Store request
        table::add(&mut registry.requests, request_id, request);

        // Create receipt NFT for requester (budget owner)
        let receipt = RequestReceipt {
            id: object::new(ctx),
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        };

        // Emit event
        event::emit(RequestCreated {
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            timeout_at: now + DEFAULT_TIMEOUT_MS,
        });

        // Transfer receipt to requester (budget owner)
        transfer::transfer(receipt, requester);
    }

    // ========== Restore Functions (admin only, post-devnet-reset) ==========

    /// Restore a RequestReceipt from off-chain snapshot data.
    /// Gated by UpgradeCap since baram module has no AdminCap.
    public fun admin_restore_receipt(
        _cap: &sui::package::UpgradeCap,
        request_id: u64,
        requester: address,
        executor: address,
        price: u64,
        prompt_hash: vector<u8>,
        model: String,
        created_at: u64,
        timeout_at: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let receipt = RequestReceipt {
            id: object::new(ctx),
            request_id,
            requester,
            executor,
            price,
            prompt_hash,
            model,
            created_at,
            timeout_at,
        };
        transfer::public_transfer(receipt, recipient);
    }

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
