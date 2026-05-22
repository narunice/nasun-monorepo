// Subsidy pool primitive.
//
// `SubsidyPool<T>` is a shared object holding a token balance + a global
// daily withdrawal cap. Downstream modules (GoStop LP boost, AI inference
// subsidy, NSN staking emissions) hold `DrawCap` objects authorized to
// withdraw from a specific pool. `DrawCap` is soulbound (no `store`) so it
// cannot be transferred away from its recipient — rotation requires admin
// to `revoke_draw_cap` and re-issue.
//
// Daily cap semantics (Phase 1 prototype): one global cap across all tiers.
// Per-tier-cohort accounting (Table<(epoch, tier), u64>) is deferred until a
// downstream surface actually needs it. Lowering the cap is one tx; raising
// happens via admin update.
module nasun_treasury::pool;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};
use nasun_treasury::events;

// === Errors ===
const EUnauthorizedDraw: u64 = 1;
const EWrongPool: u64 = 2;
const EDailyCapExceeded: u64 = 3;
const EInsufficientBalance: u64 = 4;
const EInvalidTier: u64 = 5;

// === Treasury admin cap held by deployer ===
public struct TreasuryAdminCap has key, store {
    id: UID,
}

// === Subsidy pool per (purpose, coin type T) ===
// `purpose` is a human-readable label (e.g. b"gostop_lp", b"ai_inference").
// pool_id is the real authorization link — `purpose` is for off-chain
// indexing/filtering, not security.
public struct SubsidyPool<phantom T> has key {
    id: UID,
    purpose: vector<u8>,
    balance: Balance<T>,
    daily_cap_total: u64,           // global daily cap in T units
    daily_drawn: Table<u64, u64>,   // day_epoch -> total drawn that day
    authorized_draw_caps: VecSet<ID>,
    total_funded: u64,
    total_drawn: u64,
}

// === Soulbound draw capability (no `store` -> cannot transfer) ===
public struct DrawCap has key {
    id: UID,
    pool_id: ID,
}

// === Init ===
fun init(ctx: &mut TxContext) {
    let admin_cap = TreasuryAdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, tx_context::sender(ctx));
}

// === Admin: create pool ===
public fun create_pool<T>(
    _cap: &TreasuryAdminCap,
    purpose: vector<u8>,
    daily_cap_total: u64,
    ctx: &mut TxContext,
) {
    let pool = SubsidyPool<T> {
        id: object::new(ctx),
        purpose,
        balance: balance::zero<T>(),
        daily_cap_total,
        daily_drawn: table::new(ctx),
        authorized_draw_caps: vec_set::empty(),
        total_funded: 0,
        total_drawn: 0,
    };
    let pool_id = object::id(&pool);
    events::emit_pool_created<T>(pool_id, purpose);
    transfer::share_object(pool);
}

// === Admin: fund pool ===
public fun fund<T>(
    _cap: &TreasuryAdminCap,
    pool: &mut SubsidyPool<T>,
    coin_in: Coin<T>,
    ctx: &TxContext,
) {
    let amount = coin::value(&coin_in);
    let bal = coin::into_balance(coin_in);
    balance::join(&mut pool.balance, bal);
    pool.total_funded = pool.total_funded + amount;
    events::emit_funded<T>(object::id(pool), amount, tx_context::sender(ctx));
}

// === Admin: tune daily cap ===
public fun set_daily_cap<T>(
    _cap: &TreasuryAdminCap,
    pool: &mut SubsidyPool<T>,
    new_cap: u64,
) {
    pool.daily_cap_total = new_cap;
}

// === Admin: issue draw cap ===
public fun issue_draw_cap<T>(
    _cap: &TreasuryAdminCap,
    pool: &mut SubsidyPool<T>,
    recipient: address,
    ctx: &mut TxContext,
) {
    let pool_id = object::id(pool);
    let draw_cap = DrawCap { id: object::new(ctx), pool_id };
    let cap_id = object::id(&draw_cap);
    vec_set::insert(&mut pool.authorized_draw_caps, cap_id);
    events::emit_draw_cap_issued<T>(pool_id, cap_id, recipient);
    // `DrawCap` is soulbound (no `store`); the recipient cannot forward it.
    transfer::transfer(draw_cap, recipient);
}

// === Admin: revoke draw cap ===
public fun revoke_draw_cap<T>(
    _cap: &TreasuryAdminCap,
    pool: &mut SubsidyPool<T>,
    draw_cap_id: ID,
) {
    if (vec_set::contains(&pool.authorized_draw_caps, &draw_cap_id)) {
        vec_set::remove(&mut pool.authorized_draw_caps, &draw_cap_id);
        events::emit_draw_cap_revoked<T>(object::id(pool), draw_cap_id);
    }
}

// === Public draw (called by downstream module holding DrawCap) ===
// Returns Balance<T> so caller composes it into the operator's outgoing
// flow (e.g. yield distribution coin merge, subsidy transfer).
public fun draw<T>(
    pool: &mut SubsidyPool<T>,
    draw_cap: &DrawCap,
    tier: u8,
    amount: u64,
    ctx: &TxContext,
): Balance<T> {
    let pool_id = object::id(pool);
    let cap_id = object::id(draw_cap);
    assert!(vec_set::contains(&pool.authorized_draw_caps, &cap_id), EUnauthorizedDraw);
    assert!(draw_cap.pool_id == pool_id, EWrongPool);
    assert!(tier >= 1 && tier <= 3, EInvalidTier);
    assert!(balance::value(&pool.balance) >= amount, EInsufficientBalance);

    let day = tx_context::epoch(ctx);
    let already_drawn = if (table::contains(&pool.daily_drawn, day)) {
        *table::borrow(&pool.daily_drawn, day)
    } else {
        0
    };
    assert!(already_drawn + amount <= pool.daily_cap_total, EDailyCapExceeded);

    if (table::contains(&pool.daily_drawn, day)) {
        let r = table::borrow_mut(&mut pool.daily_drawn, day);
        *r = *r + amount;
    } else {
        table::add(&mut pool.daily_drawn, day, amount);
    };

    pool.total_drawn = pool.total_drawn + amount;
    events::emit_drawn<T>(pool_id, cap_id, tier, amount);

    balance::split(&mut pool.balance, amount)
}

// === View functions ===
public fun balance_value<T>(pool: &SubsidyPool<T>): u64 {
    balance::value(&pool.balance)
}

public fun purpose<T>(pool: &SubsidyPool<T>): &vector<u8> {
    &pool.purpose
}

public fun daily_cap_total<T>(pool: &SubsidyPool<T>): u64 {
    pool.daily_cap_total
}

public fun total_funded<T>(pool: &SubsidyPool<T>): u64 {
    pool.total_funded
}

public fun total_drawn<T>(pool: &SubsidyPool<T>): u64 {
    pool.total_drawn
}

public fun version(): u64 { 1 }

// === Test-only helpers ===
#[test_only]
public fun new_admin_cap_for_testing(ctx: &mut TxContext): TreasuryAdminCap {
    TreasuryAdminCap { id: object::new(ctx) }
}

#[test_only]
public fun destroy_admin_cap_for_testing(cap: TreasuryAdminCap) {
    let TreasuryAdminCap { id } = cap;
    object::delete(id);
}

#[test_only]
public fun destroy_draw_cap_for_testing(cap: DrawCap) {
    let DrawCap { id, pool_id: _ } = cap;
    object::delete(id);
}
