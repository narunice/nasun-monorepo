// Nasun Standing Index (NSI) — derived tier registry.
//
// Off-chain `nsi-compute` worker computes each operator's NSI score (0-1000)
// from staking, LP, transaction activity, ecosystem diversity, and NFT health,
// then derives a tier (1/2/3) and pushes changes to this on-chain registry via
// `update_tiers_batch`. Downstream Move modules (Pado fee discount, GoStop
// max bet floor, Vault manager eligibility, etc.) read tier through `get` and
// gate behavior accordingly.
//
// Forward-compatibility: `get` returns a `TierView` struct (not raw u8), and
// `version()` exports a numeric version constant so downstream packages can
// detect upgrades. Sui's dependent linkage is publish-time frozen, so the
// public API surface here must remain stable across upgrades.
module nasun_tier::tier;

use nasun_tier::events;

// === Tier constants ===
const TIER_UNSET: u8 = 0;
const TIER_1: u8 = 1;
const TIER_2: u8 = 2;
const TIER_3: u8 = 3;

// === Rate-limit defaults (admin-tunable post-publish via setters in Phase 2+) ===
const DEFAULT_MAX_BATCH_SIZE: u64 = 500;
const DEFAULT_MAX_UPDATES_PER_EPOCH: u64 = 50_000;

// Hard ceilings on the rate-limit setters. Even with a compromised AdminCap an
// attacker cannot raise the rate limits past these — caps the blast radius of
// a single-key compromise.
const HARD_CEILING_BATCH_SIZE: u64 = 2_000;
const HARD_CEILING_UPDATES_PER_EPOCH: u64 = 200_000;

// === Errors ===
const EInvalidTier: u64 = 1;
const EBatchLengthMismatch: u64 = 2;
const EBatchTooLarge: u64 = 3;
const EEpochCapExceeded: u64 = 4;
const EAboveHardCeiling: u64 = 5;

// === Shared object holding tier state ===
public struct TierRegistry has key {
    id: UID,
    tiers: sui::table::Table<address, u8>,
    last_updated_epoch: u64,
    total_operators: u64,
    // Rate-limit knobs (reduce blast radius of single-key compromise)
    max_batch_size: u64,
    max_updates_per_epoch: u64,
    updates_in_current_epoch: u64,
}

// === Admin cap held off-chain by tier-worker signer ===
public struct TierAdminCap has key, store {
    id: UID,
}

// === Read-side view returned by `get` ===
// Future struct field additions remain ABI-compatible because callers extract
// via the accessor functions below, not by destructuring.
public struct TierView has copy, drop, store {
    tier: u8,
    last_updated_epoch: u64,
}

// === Init ===
fun init(ctx: &mut TxContext) {
    let admin_cap = TierAdminCap { id: object::new(ctx) };
    let admin_cap_id = object::id(&admin_cap);
    transfer::transfer(admin_cap, tx_context::sender(ctx));

    let registry = TierRegistry {
        id: object::new(ctx),
        tiers: sui::table::new(ctx),
        last_updated_epoch: tx_context::epoch(ctx),
        total_operators: 0,
        max_batch_size: DEFAULT_MAX_BATCH_SIZE,
        max_updates_per_epoch: DEFAULT_MAX_UPDATES_PER_EPOCH,
        updates_in_current_epoch: 0,
    };
    let registry_id = object::id(&registry);
    transfer::share_object(registry);

    events::emit_tier_registry_created(registry_id, admin_cap_id);
}

// === Public read ===
// Returns TierView. Operators with no row default to TIER_1 (baseline for
// new users — guarantees downstream "floor at tier 1" without explicit init).
public fun get(registry: &TierRegistry, operator: address): TierView {
    let tier = if (sui::table::contains(&registry.tiers, operator)) {
        *sui::table::borrow(&registry.tiers, operator)
    } else {
        TIER_1
    };
    TierView { tier, last_updated_epoch: registry.last_updated_epoch }
}

public fun tier_of(view: &TierView): u8 { view.tier }
public fun freshness_epoch(view: &TierView): u64 { view.last_updated_epoch }

public fun total_operators(registry: &TierRegistry): u64 { registry.total_operators }
public fun last_updated_epoch(registry: &TierRegistry): u64 { registry.last_updated_epoch }

// Tier value accessors for downstream code that wants to compare without
// hardcoding magic numbers.
public fun tier_1(): u8 { TIER_1 }
public fun tier_2(): u8 { TIER_2 }
public fun tier_3(): u8 { TIER_3 }

// Version export — bump on every breaking change. Downstream can
// `assert!(nasun_tier::tier::version() >= N, EOldPkg)` to gate behavior.
public fun version(): u64 { 1 }

// === Admin: batch update ===
public fun update_tiers_batch(
    _cap: &TierAdminCap,
    registry: &mut TierRegistry,
    operators: vector<address>,
    new_tiers: vector<u8>,
    ctx: &mut TxContext,
) {
    let n = vector::length(&operators);
    assert!(n == vector::length(&new_tiers), EBatchLengthMismatch);
    assert!(n <= registry.max_batch_size, EBatchTooLarge);

    let current_epoch = tx_context::epoch(ctx);
    if (registry.last_updated_epoch != current_epoch) {
        registry.updates_in_current_epoch = 0;
        registry.last_updated_epoch = current_epoch;
    };
    assert!(
        registry.updates_in_current_epoch + n <= registry.max_updates_per_epoch,
        EEpochCapExceeded,
    );

    let mut i = 0;
    while (i < n) {
        let op = *vector::borrow(&operators, i);
        let t = *vector::borrow(&new_tiers, i);
        assert!(t >= TIER_1 && t <= TIER_3, EInvalidTier);

        let old_tier = if (sui::table::contains(&registry.tiers, op)) {
            let r = sui::table::borrow_mut(&mut registry.tiers, op);
            let prev = *r;
            *r = t;
            prev
        } else {
            sui::table::add(&mut registry.tiers, op, t);
            registry.total_operators = registry.total_operators + 1;
            TIER_UNSET
        };

        if (old_tier != t) {
            events::emit_tier_updated(op, old_tier, t, current_epoch);
        };
        i = i + 1;
    };

    registry.updates_in_current_epoch = registry.updates_in_current_epoch + n;

    events::emit_tier_batch_update(tx_context::sender(ctx), n, current_epoch);
}

// === Admin: rate-limit tuning (Phase 2+; admin may want larger batches) ===
public fun set_max_batch_size(
    _cap: &TierAdminCap,
    registry: &mut TierRegistry,
    new_max: u64,
) {
    assert!(new_max <= HARD_CEILING_BATCH_SIZE, EAboveHardCeiling);
    registry.max_batch_size = new_max;
}

public fun set_max_updates_per_epoch(
    _cap: &TierAdminCap,
    registry: &mut TierRegistry,
    new_max: u64,
) {
    assert!(new_max <= HARD_CEILING_UPDATES_PER_EPOCH, EAboveHardCeiling);
    registry.max_updates_per_epoch = new_max;
}

// === Test-only helpers ===
#[test_only]
public fun new_for_testing(ctx: &mut TxContext): (TierRegistry, TierAdminCap) {
    let registry = TierRegistry {
        id: object::new(ctx),
        tiers: sui::table::new(ctx),
        last_updated_epoch: 0,
        total_operators: 0,
        max_batch_size: DEFAULT_MAX_BATCH_SIZE,
        max_updates_per_epoch: DEFAULT_MAX_UPDATES_PER_EPOCH,
        updates_in_current_epoch: 0,
    };
    let cap = TierAdminCap { id: object::new(ctx) };
    (registry, cap)
}

#[test_only]
public fun destroy_for_testing(registry: TierRegistry, cap: TierAdminCap) {
    let TierRegistry {
        id,
        tiers,
        last_updated_epoch: _,
        total_operators: _,
        max_batch_size: _,
        max_updates_per_epoch: _,
        updates_in_current_epoch: _,
    } = registry;
    sui::table::drop(tiers);
    object::delete(id);
    let TierAdminCap { id: cap_id } = cap;
    object::delete(cap_id);
}
