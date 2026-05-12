/// Capability - user-owned authority object for delegated AI agent execution.
///
/// Plan B introduces a first-class capability primitive that gates the AER
/// creation path. Funds + assets remain in the user's wallet; the agent is
/// authorized to act ("trust-constrained delegated execution," see codec
/// doc §17 and Plan B D12) only insofar as a Capability says so.
///
/// Capability shape (Plan B §1.1):
///   - Owned-by-wallet semantics enforced by a stored `owner` field.
///   - Shared object so the host can reference it in every wake without
///     transfer-in/transfer-out gymnastics.
///   - Wallet-signed mutations only; monotonic `version` counter snapshotted
///     into AER.why.capability_version for replay.
///
/// Pause semantics (Plan B D2, Foundation 결정 6):
///   - Phase 1 contract accepts ONLY {0=active, 2=wake_blocked}.
///   - Modes 1 (execution_only) and 3 (full_suspend) are reserved by integer
///     for forward compat but `set_pause_mode` rejects them with
///     E_PAUSE_MODE_NOT_SUPPORTED until the host honors them in phase 2.
///   - This avoids latent semantics: the user's mental model of pause must
///     match host behavior.
module baram_aer::capability {
    use sui::event;
    use std::string::{Self, String};
    use std::type_name::TypeName;

    // ========== Error Codes (550-599 range) ==========
    const E_CAPABILITY_PAUSED: u64 = 550;
    const E_ACTION_NOT_ALLOWED: u64 = 551;
    const E_PAYMENT_EXCEEDS_NOTIONAL_CAP: u64 = 552;
    const E_CAPABILITY_OWNER_MISMATCH: u64 = 553;
    // 554 is owned by aer::E_UNGATED_REQUIRES_SETTLEMENT_CLASS (asserted in aer.move).
    const E_INVALID_PAUSE_MODE: u64 = 555;
    const E_RISK_LIMITS_OUT_OF_RANGE: u64 = 556;
    const E_ALLOWED_LIST_TOO_LARGE: u64 = 557;
    const E_NOT_CAPABILITY_OWNER: u64 = 558;
    const E_PAUSE_MODE_NOT_SUPPORTED: u64 = 559;
    const E_INVALID_CAPABILITY_VERSION: u64 = 560;
    const E_DUPLICATE_ALLOWED_ENTRY: u64 = 561;
    const E_CAPABILITY_REVOKED: u64 = 562;
    const E_ALLOWED_ACTION_TOO_LONG: u64 = 563;

    // ========== Constants ==========
    const MAX_ALLOWED_ACTIONS: u64 = 16;
    const MAX_ALLOWED_ASSETS: u64 = 16;
    const MAX_ALLOWED_TARGETS: u64 = 8;
    const MAX_BPS: u16 = 10_000;
    // Mirrors aer::MAX_ACTION_TYPE_LEN. Kept duplicated to avoid a cross-module
    // dependency in a hot-validation path.
    const MAX_ACTION_TYPE_LEN: u64 = 64;

    // Pause modes - integer values are stable forever (Plan A §11, codec doc).
    // Phase 1 contract honors only {0, 2}; 1 and 3 abort with
    // E_PAUSE_MODE_NOT_SUPPORTED. See module doc.
    const PAUSE_ACTIVE: u8 = 0;
    const PAUSE_WAKE_BLOCKED: u8 = 2;
    const PAUSE_MAX_VALID_ENUM: u8 = 3;

    // Mutation kind enum (CapabilityMutated event).
    const MUTATION_KIND_PAUSE: u8 = 1;
    const MUTATION_KIND_RISK: u8 = 2;
    const MUTATION_KIND_ACTIONS: u8 = 3;
    const MUTATION_KIND_ASSETS: u8 = 4;
    const MUTATION_KIND_TARGETS: u8 = 5;

    // ========== Structs ==========

    public struct RiskLimits has store, copy, drop {
        max_notional_per_action: u64,
        max_daily_loss: u64,
        max_slippage_bps: u16,
        stop_loss_bps: u16,
        take_profit_bps: u16,
    }

    public struct Capability has key, store {
        id: UID,
        owner: address,
        version: u64,
        pause_mode: u8,
        revoked: bool,
        allowed_actions: vector<String>,
        allowed_assets: vector<TypeName>,
        allowed_targets: vector<address>,
        risk_limits: RiskLimits,
    }

    /// Marker shared object (Plan B D13). No counters. Exists so `new_capability`
    /// can be wired through a canonical entry-point for indexer tooling and to
    /// match the AERRegistry pattern.
    public struct CapabilityRegistry has key {
        id: UID,
    }

    // ========== Events ==========

    public struct CapabilityCreated has copy, drop {
        cap_id: address,
        owner: address,
    }

    public struct CapabilityMutated has copy, drop {
        cap_id: address,
        new_version: u64,
        mutation_kind: u8,
        owner: address,
    }

    public struct CapabilityRevoked has copy, drop {
        cap_id: address,
        owner: address,
    }

    // ========== Init ==========

    fun init(ctx: &mut TxContext) {
        let registry = CapabilityRegistry { id: object::new(ctx) };
        transfer::share_object(registry);
    }

    // ========== Constructor ==========

    /// Create and share a new Capability owned by ctx.sender.
    ///
    /// Registry is taken by immutable reference (D13: no counters to bump).
    /// The wallet that signs this tx becomes the immutable `owner` and is the
    /// only address that can subsequently mutate or revoke the capability.
    public fun new_capability(
        _registry: &CapabilityRegistry,
        allowed_actions: vector<String>,
        allowed_assets: vector<TypeName>,
        allowed_targets: vector<address>,
        max_notional_per_action: u64,
        max_daily_loss: u64,
        max_slippage_bps: u16,
        stop_loss_bps: u16,
        take_profit_bps: u16,
        ctx: &mut TxContext,
    ) {
        validate_allowed_actions(&allowed_actions);
        validate_allowed_assets(&allowed_assets);
        validate_allowed_targets(&allowed_targets);
        validate_risk_limits(max_slippage_bps, stop_loss_bps, take_profit_bps);

        let owner = tx_context::sender(ctx);
        let cap = Capability {
            id: object::new(ctx),
            owner,
            version: 1,
            pause_mode: PAUSE_ACTIVE,
            revoked: false,
            allowed_actions,
            allowed_assets,
            allowed_targets,
            risk_limits: RiskLimits {
                max_notional_per_action,
                max_daily_loss,
                max_slippage_bps,
                stop_loss_bps,
                take_profit_bps,
            },
        };

        let cap_id = object::id_address(&cap);
        event::emit(CapabilityCreated { cap_id, owner });
        transfer::share_object(cap);
    }

    // ========== Mutations (wallet-signed only) ==========

    public fun set_pause_mode(cap: &mut Capability, new_mode: u8, ctx: &TxContext) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        // Forward-compat enum range check first so unknown high values get a
        // distinct error code from "valid but unsupported in phase 1."
        assert!(new_mode <= PAUSE_MAX_VALID_ENUM, E_INVALID_PAUSE_MODE);
        // Phase 1: only {0, 2} honored. {1, 3} reserved but contract-rejected
        // (D2). Latent semantics would diverge from host behavior.
        assert!(
            new_mode == PAUSE_ACTIVE || new_mode == PAUSE_WAKE_BLOCKED,
            E_PAUSE_MODE_NOT_SUPPORTED,
        );
        cap.pause_mode = new_mode;
        bump_version(cap);
        emit_mutated(cap, MUTATION_KIND_PAUSE);
    }

    public fun update_risk_limits(cap: &mut Capability, new: RiskLimits, ctx: &TxContext) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        validate_risk_limits(new.max_slippage_bps, new.stop_loss_bps, new.take_profit_bps);
        cap.risk_limits = new;
        bump_version(cap);
        emit_mutated(cap, MUTATION_KIND_RISK);
    }

    public fun replace_allowed_actions(
        cap: &mut Capability,
        new: vector<String>,
        ctx: &TxContext,
    ) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        validate_allowed_actions(&new);
        cap.allowed_actions = new;
        bump_version(cap);
        emit_mutated(cap, MUTATION_KIND_ACTIONS);
    }

    public fun replace_allowed_assets(
        cap: &mut Capability,
        new: vector<TypeName>,
        ctx: &TxContext,
    ) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        validate_allowed_assets(&new);
        cap.allowed_assets = new;
        bump_version(cap);
        emit_mutated(cap, MUTATION_KIND_ASSETS);
    }

    public fun replace_allowed_targets(
        cap: &mut Capability,
        new: vector<address>,
        ctx: &TxContext,
    ) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        validate_allowed_targets(&new);
        cap.allowed_targets = new;
        bump_version(cap);
        emit_mutated(cap, MUTATION_KIND_TARGETS);
    }

    /// Mark the capability as revoked. Terminal state - all gated AER entries
    /// will subsequently abort with E_CAPABILITY_REVOKED. The capability object
    /// is preserved (not destroyed) so indexers and replay tools can read the
    /// final state without object-lookup failures. User creates a new
    /// Capability and re-links AgentProfile.capability to recover.
    public fun revoke(cap: &mut Capability, ctx: &TxContext) {
        assert_owner(cap, ctx);
        assert_not_revoked(cap);
        cap.revoked = true;
        // Do not bump version - revoke is terminal, version is meaningless past
        // this point. Dedicated CapabilityRevoked event surfaces the transition.
        let owner = cap.owner;
        event::emit(CapabilityRevoked { cap_id: object::id_address(cap), owner });
    }

    // ========== Helpers (private) ==========

    fun assert_owner(cap: &Capability, ctx: &TxContext) {
        assert!(cap.owner == tx_context::sender(ctx), E_NOT_CAPABILITY_OWNER);
    }

    fun assert_not_revoked(cap: &Capability) {
        assert!(!cap.revoked, E_CAPABILITY_REVOKED);
    }

    fun bump_version(cap: &mut Capability) {
        cap.version = cap.version + 1;
    }

    fun emit_mutated(cap: &Capability, kind: u8) {
        event::emit(CapabilityMutated {
            cap_id: object::id_address(cap),
            new_version: cap.version,
            mutation_kind: kind,
            owner: cap.owner,
        });
    }

    fun validate_allowed_actions(actions: &vector<String>) {
        let len = actions.length();
        assert!(len <= MAX_ALLOWED_ACTIONS, E_ALLOWED_LIST_TOO_LARGE);
        // Per-entry length cap + duplicate detection (small N, O(n^2) fine).
        let mut i = 0;
        while (i < len) {
            let a = &actions[i];
            assert!(string::length(a) <= MAX_ACTION_TYPE_LEN, E_ALLOWED_ACTION_TOO_LONG);
            let mut j = i + 1;
            while (j < len) {
                let b = &actions[j];
                assert!(!string_eq(a, b), E_DUPLICATE_ALLOWED_ENTRY);
                j = j + 1;
            };
            i = i + 1;
        };
    }

    fun validate_allowed_assets(assets: &vector<TypeName>) {
        let len = assets.length();
        assert!(len <= MAX_ALLOWED_ASSETS, E_ALLOWED_LIST_TOO_LARGE);
        let mut i = 0;
        while (i < len) {
            let a = &assets[i];
            let mut j = i + 1;
            while (j < len) {
                let b = &assets[j];
                assert!(a != b, E_DUPLICATE_ALLOWED_ENTRY);
                j = j + 1;
            };
            i = i + 1;
        };
    }

    fun validate_allowed_targets(targets: &vector<address>) {
        let len = targets.length();
        assert!(len <= MAX_ALLOWED_TARGETS, E_ALLOWED_LIST_TOO_LARGE);
        let mut i = 0;
        while (i < len) {
            let a = targets[i];
            let mut j = i + 1;
            while (j < len) {
                let b = targets[j];
                assert!(a != b, E_DUPLICATE_ALLOWED_ENTRY);
                j = j + 1;
            };
            i = i + 1;
        };
    }

    fun validate_risk_limits(max_slippage_bps: u16, stop_loss_bps: u16, take_profit_bps: u16) {
        assert!(max_slippage_bps <= MAX_BPS, E_RISK_LIMITS_OUT_OF_RANGE);
        assert!(stop_loss_bps <= MAX_BPS, E_RISK_LIMITS_OUT_OF_RANGE);
        assert!(take_profit_bps <= MAX_BPS, E_RISK_LIMITS_OUT_OF_RANGE);
    }

    fun string_eq(a: &String, b: &String): bool {
        a.as_bytes() == b.as_bytes()
    }

    // ========== Public read-side API ==========

    public fun id_address(cap: &Capability): address { object::id_address(cap) }
    public fun owner(cap: &Capability): address { cap.owner }
    public fun version(cap: &Capability): u64 { cap.version }
    public fun pause_mode(cap: &Capability): u8 { cap.pause_mode }
    public fun is_revoked(cap: &Capability): bool { cap.revoked }
    public fun max_notional_per_action(cap: &Capability): u64 {
        cap.risk_limits.max_notional_per_action
    }
    public fun risk_limits(cap: &Capability): &RiskLimits { &cap.risk_limits }
    public fun allowed_actions(cap: &Capability): &vector<String> { &cap.allowed_actions }
    public fun allowed_assets(cap: &Capability): &vector<TypeName> { &cap.allowed_assets }
    public fun allowed_targets(cap: &Capability): &vector<address> { &cap.allowed_targets }

    /// Returns true iff `action_type` is a member of `cap.allowed_actions`.
    /// O(n) scan; n <= MAX_ALLOWED_ACTIONS (16).
    public fun is_action_allowed(cap: &Capability, action_type: &String): bool {
        let actions = &cap.allowed_actions;
        let len = actions.length();
        let mut i = 0;
        while (i < len) {
            if (string_eq(&actions[i], action_type)) { return true };
            i = i + 1;
        };
        false
    }

    /// Hard rail capability check used by `aer::create_report_with_receipt_capability`.
    ///
    /// Asserts (in order, fail-fast cheapest-first):
    ///   1. Capability is not revoked.
    ///   2. Capability is not paused (phase 1: only `active` permitted on this
    ///      path; `wake_blocked` means the host should never have called this
    ///      entry, treat as caller bug).
    ///   3. Owner matches the receipt requester (prevents using someone else's
    ///      cap with your own money - would still abort at receipt consume,
    ///      but explicit error is clearer).
    ///   4. Caller's `expected_version` matches `cap.version` (optimistic
    ///      concurrency against in-flight wallet mutations).
    ///   5. `action_type` is in cap.allowed_actions.
    ///   6. `payment_amount` <= cap.risk_limits.max_notional_per_action.
    ///
    /// Returns the now-validated `cap.version` so the caller can snapshot it
    /// into AER.WhyContext.capability_version.
    public fun assert_can_execute(
        cap: &Capability,
        receipt_requester: address,
        action_type: &String,
        payment_amount: u64,
        expected_version: u64,
    ): u64 {
        assert!(!cap.revoked, E_CAPABILITY_REVOKED);
        assert!(cap.pause_mode == PAUSE_ACTIVE, E_CAPABILITY_PAUSED);
        assert!(cap.owner == receipt_requester, E_CAPABILITY_OWNER_MISMATCH);
        assert!(cap.version == expected_version, E_INVALID_CAPABILITY_VERSION);
        assert!(is_action_allowed(cap, action_type), E_ACTION_NOT_ALLOWED);
        assert!(
            payment_amount <= cap.risk_limits.max_notional_per_action,
            E_PAYMENT_EXCEEDS_NOTIONAL_CAP,
        );
        cap.version
    }

    // ========== Public constructor for RiskLimits ==========
    //
    // Callers (e.g. update_risk_limits via PTB pure args) build RiskLimits
    // through this constructor so the bps range is validated at the same
    // point regardless of entry. The mutation entries re-validate after
    // assignment as defense-in-depth.

    public fun new_risk_limits(
        max_notional_per_action: u64,
        max_daily_loss: u64,
        max_slippage_bps: u16,
        stop_loss_bps: u16,
        take_profit_bps: u16,
    ): RiskLimits {
        validate_risk_limits(max_slippage_bps, stop_loss_bps, take_profit_bps);
        RiskLimits {
            max_notional_per_action,
            max_daily_loss,
            max_slippage_bps,
            stop_loss_bps,
            take_profit_bps,
        }
    }

    public fun risk_limits_max_notional(r: &RiskLimits): u64 { r.max_notional_per_action }
    public fun risk_limits_max_daily_loss(r: &RiskLimits): u64 { r.max_daily_loss }
    public fun risk_limits_max_slippage_bps(r: &RiskLimits): u16 { r.max_slippage_bps }
    public fun risk_limits_stop_loss_bps(r: &RiskLimits): u16 { r.stop_loss_bps }
    public fun risk_limits_take_profit_bps(r: &RiskLimits): u16 { r.take_profit_bps }

    // ========== Test helpers ==========

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }
}
