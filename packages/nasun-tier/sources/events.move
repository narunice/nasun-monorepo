// Event types + emit helpers for nasun_tier.
//
// Sui's `event::emit` requires the event type to be declared in the calling
// module, so we expose `emit_*` helpers here that other modules in this
// package call. Keeping all event surfaces in one file makes off-chain
// indexer code (which watches `nasun_tier::events::*` patterns) trivial to
// maintain.
module nasun_tier::events;

use sui::event;

public struct TierRegistryCreated has copy, drop {
    registry_id: ID,
    admin_cap_id: ID,
}

public struct TierUpdated has copy, drop {
    operator: address,
    old_tier: u8,
    new_tier: u8,
    epoch: u64,
}

// Summary emitted once per batch. Off-chain indexer monitors caller + count
// for anomaly detection (whitelist of expected tx digests).
public struct TierBatchUpdate has copy, drop {
    caller: address,
    count: u64,
    epoch: u64,
}

public(package) fun emit_tier_registry_created(
    registry_id: ID,
    admin_cap_id: ID,
) {
    event::emit(TierRegistryCreated { registry_id, admin_cap_id });
}

public(package) fun emit_tier_updated(
    operator: address,
    old_tier: u8,
    new_tier: u8,
    epoch: u64,
) {
    event::emit(TierUpdated { operator, old_tier, new_tier, epoch });
}

public(package) fun emit_tier_batch_update(
    caller: address,
    count: u64,
    epoch: u64,
) {
    event::emit(TierBatchUpdate { caller, count, epoch });
}
