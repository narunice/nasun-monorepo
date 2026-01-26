/// Baram - Private AI Computation Settlement
///
/// Core concept: Escrow + Execution Proof = Trustless Settlement
///
/// User pays NUSDC upfront, funds are locked until:
/// 1. Executor submits proof -> payment released to executor
/// 2. Timeout reached -> user can claim refund
/// 3. User cancels before execution -> user gets refund
module baram::baram {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};
    use std::string::String;
    use pado::nusdc::NUSDC;

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
        };
        transfer::share_object(registry);
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

    // ========== Test Functions ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
