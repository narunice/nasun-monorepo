/// AgentEscrow - delegated treasury paired 1:1 with a Capability.
///
/// Plan C C3-v2 (DV1..DV4). Funds physically live inside a shared
/// `AgentEscrow` (NOT the user's wallet), but the wallet retains the
/// exclusive recovery path (`withdraw_owner`) that ignores cap state.
/// The plan-narrative framing for this is "recoverable delegated
/// custody" (Foundation 결정 2). The capability does NOT hold funds;
/// it holds *authority* (allowed_actions / allowed_assets / risk_limits
/// / reciprocal escrow id). Splitting authority and treasury this way
/// keeps Capability read-only on the agent's hot path while still
/// gating every spend.
///
/// Balances are stored as `Balance<T>` values keyed by `TypeName` via
/// `dynamic_field`. Mirrors the existing `Balance<NUSDC>` idiom in
/// `baram.move::BaramRegistry` -- lower gas than `Coin<T>`-via-DOF,
/// no extra `key` requirement, and consistent with how the rest of
/// this package already represents pooled balances.
///
/// Atomic spend invariant (DV3):
///   `withdraw_for_action<T>` returns `(Coin<T>, SpendObligation)`.
///   `SpendObligation` has NO abilities: it cannot be dropped,
///   stored, copied, or transferred. The ONLY consumer is
///   `settle_action<U>`, which (a) asserts the same cap that
///   authorized the withdraw is settling the result, (b) asserts the
///   output asset is in `cap.allowed_assets`, and (c) joins the
///   output coin back into the escrow. This statically rules out:
///     - cap-mixing (Cmd 0 cap A, Cmd 4 cap B): obligation carries
///       cap id; settle aborts on mismatch.
///     - deposit-back skip (route swap output to attacker): the
///       PTB cannot be built without a `SpendObligation` consumer,
///       and the only consumer deposits back to the same escrow.
///     - dust deposit attack: settle_action asserts U is allowed.
///
/// Atomic setup invariant (DV5):
///   `new_escrow_linked(witness, ctx)` consumes a `LinkWitness`
///   minted by `capability::new_capability_and_link`. Because the
///   witness has no abilities, the PTB cannot succeed without
///   consuming it; the wallet-signed setup tx therefore must finalize
///   the cap<->escrow link in the same tx that creates the cap. The
///   `escrow_id = None` window observable to other txs is zero
///   blocks.
module baram_aer::escrow {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::dynamic_field as df;
    use sui::event;
    use std::type_name::{Self, TypeName};
    use baram_aer::capability::{Self as cap_mod, Capability, LinkWitness};

    // ========== Error Codes (570-589 range owned by escrow) ==========
    const E_ESCROW_CAP_MISMATCH: u64 = 570;
    const E_ESCROW_OWNER_MISMATCH: u64 = 571;
    const E_ASSET_NOT_ALLOWED: u64 = 572;
    const E_INSUFFICIENT_ESCROW_BALANCE: u64 = 573;
    const E_ESCROW_NOT_EMPTY: u64 = 574;
    const E_OBLIGATION_ESCROW_MISMATCH: u64 = 575;
    const E_OBLIGATION_CAP_MISMATCH: u64 = 576;
    const E_RECIPROCAL_BINDING_BROKEN: u64 = 577;
    const E_OUTPUT_COIN_ZERO: u64 = 578;
    const E_ESCROW_NO_BALANCE: u64 = 579;

    // ========== Mirrored capability error codes ==========
    //
    // These re-declare integer codes that live in `baram_aer::capability`
    // so escrow can abort with the canonical numbers when its own checks
    // discover a cap-rail violation. Abort `location` differs (the test
    // expectation is `location = baram_aer::escrow` for these), but the
    // numeric code remains stable across the package so off-chain
    // decoders can render a single error name regardless of which
    // module raised it.
    const E_CAPABILITY_PAUSED: u64 = 550;
    const E_PAYMENT_EXCEEDS_NOTIONAL_CAP: u64 = 552;
    const E_INVALID_CAPABILITY_VERSION: u64 = 560;
    const E_CAPABILITY_REVOKED: u64 = 562;

    // ========== Structs ==========

    /// Shared treasury object paired 1:1 with a Capability.
    ///
    /// `owner` is mirrored from `cap.owner` at creation time and is
    /// immutable. `capability_id` is the reciprocal half of the
    /// cap<->escrow binding (the cap also stores `escrow_id =
    /// Some(this.id)`). Both sides are checked on every privileged
    /// operation.
    ///
    /// Balances live under `dynamic_field<TypeName, Balance<T>>` for
    /// arbitrary asset types T. `balance_keys` is a lightweight
    /// mirror that lets `close_escrow` cheaply assert "no assets
    /// remaining" without a dynamic-field iterator (which Sui does
    /// not expose).
    public struct AgentEscrow has key {
        id: UID,
        owner: address,
        capability_id: ID,
        balance_keys: vector<TypeName>,
    }

    /// Hot-potato debt from `withdraw_for_action`. The PTB cannot be
    /// built unless every issued obligation is consumed -- which only
    /// `settle_action` can do.
    public struct SpendObligation {
        escrow_id: ID,
        capability_id: ID,
        asset: TypeName,
        amount: u64,
    }

    // ========== Events ==========

    public struct EscrowCreated has copy, drop {
        escrow_id: address,
        owner: address,
        capability_id: ID,
    }

    public struct EscrowDeposited has copy, drop {
        escrow_id: address,
        asset: TypeName,
        amount: u64,
        // True when the deposit was emitted by a cap-gated path
        // (settle_action / deposit_swap_leftover). False when it
        // was a top-up via the open `deposit` entry.
        by_capability: bool,
    }

    public struct EscrowWithdrawn has copy, drop {
        escrow_id: address,
        asset: TypeName,
        amount: u64,
        // True when withdrawn via cap-gated `withdraw_for_action`
        // (agent flow). False when withdrawn via owner-only
        // `withdraw_owner` (recovery flow).
        by_capability: bool,
    }

    // ========== Atomic setup partner (DV5 Cmd 1) ==========

    /// Consumes a `LinkWitness` minted by `capability::new_capability_and_link`,
    /// creates and shares a fresh `AgentEscrow`, and returns the escrow
    /// id so Cmd 2 can stamp it onto the cap via
    /// `capability::finalize_link_and_share`.
    public fun new_escrow_linked(witness: LinkWitness, ctx: &mut TxContext): ID {
        let (capability_id, owner) = cap_mod::consume_link_witness(witness);
        let escrow = AgentEscrow {
            id: object::new(ctx),
            owner,
            capability_id,
            balance_keys: vector::empty<TypeName>(),
        };
        let escrow_id = object::id(&escrow);
        let escrow_addr = object::id_address(&escrow);
        event::emit(EscrowCreated {
            escrow_id: escrow_addr,
            owner,
            capability_id,
        });
        transfer::share_object(escrow);
        escrow_id
    }

    // ========== Public top-ups ==========

    /// Open deposit entry. Anyone can top up an escrow without owner
    /// signature -- enabling external funding flows (faucet, payroll,
    /// gas-station refill). Does NOT check cap state or asset
    /// allowlist; the escrow's owner accepted that policy when they
    /// created it.
    public fun deposit<T>(escrow: &mut AgentEscrow, coin: Coin<T>, _ctx: &TxContext) {
        let asset = type_name::get<T>();
        let amount = coin::value(&coin);
        let bal = coin::into_balance(coin);
        deposit_balance_internal(escrow, asset, bal);
        event::emit(EscrowDeposited {
            escrow_id: object::id_address(escrow),
            asset,
            amount,
            by_capability: false,
        });
    }

    // ========== Owner-only recovery (escape hatch) ==========

    /// Wallet-only withdraw. Ignores cap state (pause/revoke do NOT
    /// block this path). This is the recoverable-delegated-custody
    /// escape hatch: the wallet can always pull funds out, even after
    /// the agent has been compromised or the cap has been paused.
    public fun withdraw_owner<T>(
        escrow: &mut AgentEscrow,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(escrow.owner == tx_context::sender(ctx), E_ESCROW_OWNER_MISMATCH);
        let asset = type_name::get<T>();
        let withdrawn = split_balance_internal<T>(escrow, asset, amount);
        let c = coin::from_balance(withdrawn, ctx);
        event::emit(EscrowWithdrawn {
            escrow_id: object::id_address(escrow),
            asset,
            amount,
            by_capability: false,
        });
        c
    }

    // ========== Cap-gated spend flow (DV3) ==========

    /// Withdraws `amount` units of `Coin<T>` from the escrow and
    /// returns it along with a `SpendObligation` that MUST be
    /// consumed by `settle_action` in the same PTB.
    ///
    /// Hard rail checks (fail-fast cheapest first):
    ///   1. Cap not revoked.
    ///   2. Cap pause_mode == PAUSE_ACTIVE.
    ///   3. Cap.version matches caller's `expected_capability_version`.
    ///   4. escrow.capability_id == id(cap).
    ///   5. cap.escrow_id == Some(id(escrow)) (reciprocal binding).
    ///   6. escrow.owner == cap.owner (defense-in-depth).
    ///   7. T in cap.allowed_assets.
    ///   8. amount <= cap.risk_limits.max_notional_per_action.
    ///   9. Escrow holds >= amount of T.
    public fun withdraw_for_action<T>(
        escrow: &mut AgentEscrow,
        cap: &Capability,
        amount: u64,
        expected_capability_version: u64,
        ctx: &mut TxContext,
    ): (Coin<T>, SpendObligation) {
        assert!(!cap_mod::is_revoked(cap), E_CAPABILITY_REVOKED);
        assert!(cap_mod::pause_mode(cap) == cap_mod::pause_active(), E_CAPABILITY_PAUSED);
        assert!(cap_mod::version(cap) == expected_capability_version, E_INVALID_CAPABILITY_VERSION);

        let cap_id = object::id(cap);
        assert!(escrow.capability_id == cap_id, E_ESCROW_CAP_MISMATCH);

        let escrow_id = object::id(escrow);
        let cap_escrow_opt = cap_mod::escrow_id(cap);
        assert!(option::is_some(&cap_escrow_opt), E_RECIPROCAL_BINDING_BROKEN);
        assert!(*option::borrow(&cap_escrow_opt) == escrow_id, E_RECIPROCAL_BINDING_BROKEN);

        assert!(escrow.owner == cap_mod::owner(cap), E_ESCROW_OWNER_MISMATCH);

        let asset = type_name::get<T>();
        assert!(cap_mod::is_asset_allowed(cap, &asset), E_ASSET_NOT_ALLOWED);
        assert!(amount <= cap_mod::max_notional_per_action(cap), E_PAYMENT_EXCEEDS_NOTIONAL_CAP);

        let withdrawn = split_balance_internal<T>(escrow, asset, amount);
        let c = coin::from_balance(withdrawn, ctx);
        event::emit(EscrowWithdrawn {
            escrow_id: object::id_address(escrow),
            asset,
            amount,
            by_capability: true,
        });
        let obligation = SpendObligation {
            escrow_id,
            capability_id: cap_id,
            asset,
            amount,
        };
        (c, obligation)
    }

    /// Consumes a `SpendObligation` and deposits the swap output back
    /// into the escrow. The two-stage withdraw+settle pattern is what
    /// guarantees that delegated spend cannot leak funds to an
    /// arbitrary recipient: every `Coin<T>` produced by
    /// `withdraw_for_action` must eventually pair with a matching
    /// `settle_action` (because the obligation is non-droppable).
    ///
    /// Hard rail checks:
    ///   1. obligation.escrow_id == id(escrow).
    ///   2. obligation.capability_id == id(cap)
    ///      [closes cap-mixing attack: Cmd 0 cap_A, Cmd N cap_B].
    ///   3. !cap.revoked && pause_mode == PAUSE_ACTIVE
    ///      [defense; matches the withdraw side].
    ///   4. cap.escrow_id == Some(id(escrow)).
    ///   5. U in cap.allowed_assets
    ///      [closes dust-deposit attack: swap to an unauthorized
    ///       token, settle would otherwise smuggle it in].
    ///   6. coin::value(&output_coin) > 0.
    public fun settle_action<U>(
        escrow: &mut AgentEscrow,
        cap: &Capability,
        obligation: SpendObligation,
        output_coin: Coin<U>,
        _ctx: &TxContext,
    ) {
        let SpendObligation {
            escrow_id: ob_escrow_id,
            capability_id: ob_cap_id,
            asset: _ob_asset,
            amount: _ob_amount,
        } = obligation;

        let escrow_id = object::id(escrow);
        assert!(ob_escrow_id == escrow_id, E_OBLIGATION_ESCROW_MISMATCH);

        let cap_id = object::id(cap);
        assert!(ob_cap_id == cap_id, E_OBLIGATION_CAP_MISMATCH);

        assert!(!cap_mod::is_revoked(cap), E_CAPABILITY_REVOKED);
        assert!(cap_mod::pause_mode(cap) == cap_mod::pause_active(), E_CAPABILITY_PAUSED);

        let cap_escrow_opt = cap_mod::escrow_id(cap);
        assert!(option::is_some(&cap_escrow_opt), E_RECIPROCAL_BINDING_BROKEN);
        assert!(*option::borrow(&cap_escrow_opt) == escrow_id, E_RECIPROCAL_BINDING_BROKEN);

        let out_asset = type_name::get<U>();
        assert!(cap_mod::is_asset_allowed(cap, &out_asset), E_ASSET_NOT_ALLOWED);

        let val = coin::value(&output_coin);
        assert!(val > 0, E_OUTPUT_COIN_ZERO);

        let bal = coin::into_balance(output_coin);
        deposit_balance_internal(escrow, out_asset, bal);
        event::emit(EscrowDeposited {
            escrow_id: object::id_address(escrow),
            asset: out_asset,
            amount: val,
            by_capability: true,
        });
    }

    /// Cap-checked deposit for the swap's leftover input coin (DV9
    /// Cmd 4). DeepBookV3 returns 3 coins from a swap; the primary
    /// output goes through `settle_action`, the leftover input goes
    /// through THIS function, and the leftover DEEP fee gets
    /// `coin::destroy_zero`'d (whitelisted pools, leftover guaranteed
    /// zero).
    ///
    /// Distinct from open `deposit<T>` because the leftover input is
    /// part of the cap's authorized spend graph -- it MUST respect
    /// `allowed_assets`. Accepts `coin::value == 0` (lot-size
    /// rounding can produce a genuinely-zero leftover, which is
    /// fine).
    public fun deposit_swap_leftover<T>(
        escrow: &mut AgentEscrow,
        cap: &Capability,
        coin: Coin<T>,
    ) {
        let cap_id = object::id(cap);
        assert!(escrow.capability_id == cap_id, E_ESCROW_CAP_MISMATCH);

        let escrow_id = object::id(escrow);
        let cap_escrow_opt = cap_mod::escrow_id(cap);
        assert!(option::is_some(&cap_escrow_opt), E_RECIPROCAL_BINDING_BROKEN);
        assert!(*option::borrow(&cap_escrow_opt) == escrow_id, E_RECIPROCAL_BINDING_BROKEN);

        let asset = type_name::get<T>();
        assert!(cap_mod::is_asset_allowed(cap, &asset), E_ASSET_NOT_ALLOWED);

        let amount = coin::value(&coin);
        let bal = coin::into_balance(coin);
        deposit_balance_internal(escrow, asset, bal);
        event::emit(EscrowDeposited {
            escrow_id: object::id_address(escrow),
            asset,
            amount,
            by_capability: true,
        });
    }

    /// Destroys an escrow that has been fully drained. Owner-only.
    /// Aborts with E_ESCROW_NOT_EMPTY if any balance keys remain.
    public fun close_escrow(escrow: AgentEscrow, ctx: &TxContext) {
        assert!(escrow.owner == tx_context::sender(ctx), E_ESCROW_OWNER_MISMATCH);
        assert!(vector::is_empty(&escrow.balance_keys), E_ESCROW_NOT_EMPTY);
        let AgentEscrow { id, owner: _, capability_id: _, balance_keys: _ } = escrow;
        object::delete(id);
    }

    // ========== Read-side ==========

    public fun owner(escrow: &AgentEscrow): address { escrow.owner }
    public fun capability_id(escrow: &AgentEscrow): ID { escrow.capability_id }

    /// Returns the current balance of `Coin<T>` held in the escrow,
    /// or 0 if no balance exists for T.
    public fun balance_of<T>(escrow: &AgentEscrow): u64 {
        let asset = type_name::get<T>();
        if (df::exists_<TypeName>(&escrow.id, asset)) {
            let b: &Balance<T> = df::borrow(&escrow.id, asset);
            balance::value(b)
        } else {
            0
        }
    }

    public fun balance_keys(escrow: &AgentEscrow): &vector<TypeName> {
        &escrow.balance_keys
    }

    // ========== SpendObligation views (testing aid) ==========

    public fun obligation_escrow_id(o: &SpendObligation): ID { o.escrow_id }
    public fun obligation_capability_id(o: &SpendObligation): ID { o.capability_id }
    public fun obligation_asset(o: &SpendObligation): TypeName { o.asset }
    public fun obligation_amount(o: &SpendObligation): u64 { o.amount }

    // ========== Private helpers ==========

    /// Joins `bal` into the escrow's `Balance<T>` field, lazily
    /// initializing the dynamic field (and the `balance_keys` mirror
    /// entry) when this is the first observation of `asset`.
    fun deposit_balance_internal<T>(
        escrow: &mut AgentEscrow,
        asset: TypeName,
        bal: Balance<T>,
    ) {
        if (df::exists_<TypeName>(&escrow.id, asset)) {
            let existing: &mut Balance<T> = df::borrow_mut(&mut escrow.id, asset);
            balance::join(existing, bal);
        } else {
            vector::push_back(&mut escrow.balance_keys, asset);
            df::add(&mut escrow.id, asset, bal);
        };
    }

    /// Splits `amount` units from the escrow's `Balance<T>` field
    /// and, if the remaining balance is zero, removes the DOF and
    /// pops the asset from `balance_keys` so `close_escrow` can
    /// succeed on a fully-drained escrow.
    fun split_balance_internal<T>(
        escrow: &mut AgentEscrow,
        asset: TypeName,
        amount: u64,
    ): Balance<T> {
        assert!(df::exists_<TypeName>(&escrow.id, asset), E_ESCROW_NO_BALANCE);
        let withdrawn = {
            let existing: &mut Balance<T> = df::borrow_mut(&mut escrow.id, asset);
            assert!(balance::value(existing) >= amount, E_INSUFFICIENT_ESCROW_BALANCE);
            balance::split(existing, amount)
        };

        let residual_zero = {
            let view: &Balance<T> = df::borrow(&escrow.id, asset);
            balance::value(view) == 0
        };
        if (residual_zero) {
            let zero_bal: Balance<T> = df::remove(&mut escrow.id, asset);
            balance::destroy_zero(zero_bal);
            let (found, idx) = vector::index_of(&escrow.balance_keys, &asset);
            if (found) {
                vector::remove(&mut escrow.balance_keys, idx);
            };
        };
        withdrawn
    }
}
