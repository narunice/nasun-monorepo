// Event emit helpers for nasun_treasury. Sui requires event::emit to be
// invoked from the module that declares the event type, so all emits funnel
// through this module.
module nasun_treasury::events;

use sui::event;

public struct PoolCreated<phantom T> has copy, drop {
    pool_id: ID,
    purpose: vector<u8>,
}

public struct Funded<phantom T> has copy, drop {
    pool_id: ID,
    amount: u64,
    funder: address,
}

public struct Drawn<phantom T> has copy, drop {
    pool_id: ID,
    draw_cap_id: ID,
    tier: u8,
    amount: u64,
}

public struct DrawCapIssued<phantom T> has copy, drop {
    pool_id: ID,
    draw_cap_id: ID,
    recipient: address,
}

public struct DrawCapRevoked<phantom T> has copy, drop {
    pool_id: ID,
    draw_cap_id: ID,
}

public(package) fun emit_pool_created<T>(pool_id: ID, purpose: vector<u8>) {
    event::emit(PoolCreated<T> { pool_id, purpose });
}

public(package) fun emit_funded<T>(pool_id: ID, amount: u64, funder: address) {
    event::emit(Funded<T> { pool_id, amount, funder });
}

public(package) fun emit_drawn<T>(
    pool_id: ID,
    draw_cap_id: ID,
    tier: u8,
    amount: u64,
) {
    event::emit(Drawn<T> { pool_id, draw_cap_id, tier, amount });
}

public(package) fun emit_draw_cap_issued<T>(
    pool_id: ID,
    draw_cap_id: ID,
    recipient: address,
) {
    event::emit(DrawCapIssued<T> { pool_id, draw_cap_id, recipient });
}

public(package) fun emit_draw_cap_revoked<T>(pool_id: ID, draw_cap_id: ID) {
    event::emit(DrawCapRevoked<T> { pool_id, draw_cap_id });
}
