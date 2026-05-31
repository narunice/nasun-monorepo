// Nasun Vault Manager MVP — capability-constrained NUSDC vault on Pado spot.
//
// Tier 3 operators create a vault, bind it to an AgentProfile + Capability,
// and seed initial NUSDC + DEEP. Tier 2 depositors can deposit; the operator's
// agent runtime executes trades on NBTC/NUSDC via DeepBook V3 using the vault's
// owned BalanceManager + TradeCap (held as dynamic_object_fields). HWM
// performance fee crystallizes via Yearn V3-style share mint to the manager.
// Withdrawals follow a Clock-based cooldown; killed vaults expose a pro-rata
// emergency claim for both NUSDC and NBTC.
//
// Attribution: every trade emits TradeExecuted carrying agent_profile_id +
// capability_id, so the indexer can rebuild full agent attribution chains
// without depending on baram_aer settlement. AER v4 integration is deferred
// to the Component 9 (AI inference subsidy) sprint where the settlement
// semantics naturally apply.
module nasun_vault::vault;

use std::option::{Self, Option};
use std::type_name;
use std::vector;

use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::object::{Self, UID, ID};
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

use baram_aer::capability::{Self, Capability};
use baram_agent::agent_profile::{Self, AgentProfile};
use deepbook::balance_manager::{Self, BalanceManager, DepositCap, WithdrawCap, TradeCap};
use deepbook::pool::{Self, Pool};
use deepbook::registry::Registry as DeepbookRegistry;
use deepbook::constants;
use nasun_tier::tier::{Self, TierRegistry};
use nasun_tier::policy;
use devnet_tokens::nusdc::NUSDC;
use devnet_tokens::nbtc::NBTC;
use token::deep::DEEP;

// === Constants ===

const NAV_SCALE: u128 = 1_000_000_000;                 // 1e9, matches deepbook FLOAT_SCALING
const HEARTBEAT_TIMEOUT_MS: u64 = 24 * 3_600_000;       // 24h
const DEFAULT_COOLDOWN_MS: u64 = 3 * 86_400_000;        // 3 days
const DEFAULT_MIN_SEED_NUSDC: u64 = 100_000_000;        // 100 NUSDC (6 decimals)
const DEFAULT_MIN_SEED_DEEP: u64 = 1_000_000_000;       // 1,000 DEEP
const DEFAULT_PROTOCOL_FEE_CAP_BPS: u64 = 3_000;        // 30%
const SHARE_LOCK_AMOUNT: u64 = 1_000;                   // Yearn V3 dead-share lock

// Capability action gate for vault trades; must be present in the bound
// capability's allowed_actions. DeepBook order-type / self-matching come from
// deepbook::constants at the call site (immediate_or_cancel = IOC, cancel_taker).
const ACTION_SPOT_TRADE: vector<u8> = b"nasun_vault.spot_trade";

// === Errors ===

const ENotTier3: u64 = 1;
const EFeeBpsExceedsCap: u64 = 2;
const EInitialSeedTooSmall: u64 = 3;
const EDeepSeedTooSmall: u64 = 4;
const EAgentProfileOwnerMismatch: u64 = 5;
const ECapabilityOwnerMismatch: u64 = 6;
const EAgentProfileCapabilityMismatch: u64 = 7;
const EVaultKilled: u64 = 8;
const ECapabilityMismatch: u64 = 9;
const EAssetNotAllowed: u64 = 10;
const EZeroShares: u64 = 11;
const EWithdrawalPending: u64 = 12;
const ECooldownNotElapsed: u64 = 13;
const ENotDepositor: u64 = 14;
const EHeartbeatNotElapsed: u64 = 16;
const ENotManager: u64 = 17;
const ENotKilled: u64 = 18;
const EInsufficientShares: u64 = 19;
const ENoPendingWithdrawal: u64 = 20;
const ESlippageExceeded: u64 = 21;

// === Witness for DeepBook App authorization ===
// Has only `drop` so external modules cannot instantiate it. authorize_app
// must be called by the DeepBook admin once before create_vault works.
public struct VaultWitness has drop {}

// === Factory ===

public struct VaultFactory has key {
    id: UID,
    cooldown_ms: u64,
    min_initial_seed_nusdc: u64,
    min_initial_seed_deep: u64,
    protocol_fee_cap_bps: u64,
    allowed_base_pool_id: ID,         // MVP: nbtcNusdc pool only
    vault_ids: vector<ID>,            // enumeration for indexer
}

public struct VaultFactoryAdminCap has key, store {
    id: UID,
}

// === Vault ===

public struct Vault has key {
    id: UID,
    total_shares: u64,                                          // includes SHARE_LOCK_AMOUNT
    shares: Table<address, u64>,
    manager: address,
    // Delegated agent-runtime address authorized to call execute_trade
    // alongside the manager. Snapshot of AgentProfile.agent_address at create,
    // rotatable/disable-able by the manager via set_agent_address /
    // clear_agent_address (e.g. to revoke a compromised runtime key without
    // revoking the shared capability or killing the vault).
    agent_address: address,
    agent_profile_id: ID,
    agent_capability_id: ID,
    performance_fee_bps: u64,
    // nav_per_share at most recent HWM update, scaled by NAV_SCALE (1e9).
    high_water_mark_nav: u128,
    // Last NBTC price in NUSDC terms (FLOAT_SCALING 1e9), refreshed by
    // execute_trade. Used as the NAV mark when the order book is one-sided
    // (mid unavailable) and as the conservative floor for deposit valuation.
    // Only authorized (manager/agent) trades move it, so it cannot be
    // manipulated by an outside actor skewing the order book.
    last_mark_price: u64,
    pending_withdrawals: Table<address, PendingWithdrawal>,
    last_agent_heartbeat_ms: u64,
    is_killed: bool,
    cooldown_ms: u64,                                           // snapshot from factory
    allowed_base_pool_id: ID,
    client_order_id_seq: u64,
    // Owned BalanceManager + 3 caps. Stored as struct fields (not dof) so
    // `&mut vault.balance_manager` and `&vault.<*_cap>` can coexist in the
    // same statement (Move borrow checker sees them as disjoint fields).
    // BM owner = vault object address → no wallet ever passes BM's
    // `validate_owner`, so the caps below are the only operational access
    // path. Both BalanceManager and the caps carry `key + store`.
    balance_manager: BalanceManager,
    deposit_cap: DepositCap,
    withdraw_cap: WithdrawCap,
    trade_cap: TradeCap,
}

public struct PendingWithdrawal has store, drop {
    shares: u64,
    request_at_ms: u64,
    cooldown_until_ms: u64,
}

// === Dynamic field keys ===

// df keys: Yearn V3-style 1000 dead-share lock (df because LockedShares has
// `store` but no `key`). BM + caps moved to vault struct fields above to
// avoid Move borrow-checker conflicts on `&mut vault.id` + `&vault.id`.
public struct LockedSharesKey has copy, drop, store {}
public struct LockedShares has store, drop { amount: u64 }

// === Events ===

public struct VaultCreated has copy, drop {
    vault_id: ID,
    manager: address,
    agent_profile_id: ID,
    agent_capability_id: ID,
    performance_fee_bps: u64,
    initial_seed_nusdc: u64,
    initial_seed_deep: u64,
    balance_manager_id: ID,
    cooldown_ms: u64,
    timestamp_ms: u64,
}

public struct DepositEvent has copy, drop {
    vault_id: ID,
    depositor: address,
    nusdc_in: u64,
    shares_minted: u64,
    nav_per_share: u128,
    timestamp_ms: u64,
}

public struct WithdrawRequested has copy, drop {
    vault_id: ID,
    depositor: address,
    shares: u64,
    request_at_ms: u64,
    cooldown_until_ms: u64,
}

public struct WithdrawClaimed has copy, drop {
    vault_id: ID,
    depositor: address,
    shares: u64,
    nusdc_out: u64,
    nbtc_out: u64,                    // 0 for normal claim, pro-rata for emergency
    nav_per_share: u128,
    was_emergency: bool,
    timestamp_ms: u64,
}

// Carries full attribution chain inline so the indexer never needs AER lookup.
public struct TradeExecuted has copy, drop {
    vault_id: ID,
    agent_profile_id: ID,
    capability_id: ID,
    agent_address: address,           // ctx.sender() of execute_trade (delegated agent or manager)
    pool_id: ID,
    is_bid: bool,
    price: u64,
    qty: u64,
    fill_notional: u64,               // OrderInfo::cumulative_quote_quantity
    nav_after: u128,
    timestamp_ms: u64,
    action_type: vector<u8>,          // e.g. b"nasun_vault.spot_trade"
}

public struct FeeCrystallized has copy, drop {
    vault_id: ID,
    manager: address,
    nav_per_share_at_crystallize: u128,
    previous_hwm: u128,
    new_hwm: u128,
    fee_shares_minted: u64,
    timestamp_ms: u64,
}

public struct VaultKilled has copy, drop {
    vault_id: ID,
    killer: address,
    timestamp_ms: u64,
}

// === Init (admin cap only; factory shared object via init_factory) ===

fun init(ctx: &mut TxContext) {
    let admin_cap = VaultFactoryAdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, tx_context::sender(ctx));
}

// === Admin: initialize the VaultFactory shared object ===
//
// Called once after publish. `allowed_base_pool_id` is the on-chain ID of
// the NBTC/NUSDC DeepBook pool MVP whitelists; all vaults snapshot this at
// create_vault and refuse trades against any other pool.
public fun init_factory(
    _cap: &VaultFactoryAdminCap,
    allowed_base_pool_id: ID,
    ctx: &mut TxContext,
) {
    let factory = VaultFactory {
        id: object::new(ctx),
        cooldown_ms: DEFAULT_COOLDOWN_MS,
        min_initial_seed_nusdc: DEFAULT_MIN_SEED_NUSDC,
        min_initial_seed_deep: DEFAULT_MIN_SEED_DEEP,
        protocol_fee_cap_bps: DEFAULT_PROTOCOL_FEE_CAP_BPS,
        allowed_base_pool_id,
        vault_ids: vector::empty(),
    };
    transfer::share_object(factory);
}

// === Create vault (Tier 3 manager only) ===
//
// Atomic setup: validates manager tier, fee cap, AgentProfile + Capability
// binding, and seed minimums. Mints a BalanceManager with all caps owned by
// the vault object address (BM owner = vault address → no wallet can ever
// invoke the BM owner path, so the dof-stored caps become the only access
// path). Yearn V3-style 1000-share dead lock + min_initial_seed_nusdc
// together close share-inflation grief.
//
// IMPORTANT: assert_app_is_authorized<VaultWitness> must have been called on
// the DeepBook Registry by the DeepBook admin before any create_vault call
// succeeds (one-time setup after publish).
public fun create_vault(
    factory: &mut VaultFactory,
    tier_registry: &TierRegistry,
    deepbook_registry: &mut DeepbookRegistry,
    agent_profile: &AgentProfile,
    cap: &Capability,
    nusdc_seed: Coin<NUSDC>,
    deep_seed: Coin<DEEP>,
    performance_fee_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): ID {
    let sender = tx_context::sender(ctx);

    // 1. Tier 3 check via NSI on-chain registry snapshot.
    let tier_view = tier::get(tier_registry, sender);
    assert!(policy::can_create_vault(tier::tier_of(&tier_view)), ENotTier3);

    // 2. Protocol fee cap.
    assert!(performance_fee_bps <= factory.protocol_fee_cap_bps, EFeeBpsExceedsCap);

    // 3. Agent identity binding — manager owns both objects, and the
    //    capability is the one the AgentProfile points to (1:1 invariant).
    assert!(agent_profile::get_owner(agent_profile) == sender, EAgentProfileOwnerMismatch);
    assert!(capability::owner(cap) == sender, ECapabilityOwnerMismatch);
    let cap_id_opt = agent_profile::get_capability(agent_profile);
    assert!(option::is_some(&cap_id_opt), EAgentProfileCapabilityMismatch);
    let cap_id_expected = *option::borrow(&cap_id_opt);
    assert!(cap_id_expected == object::id(cap), EAgentProfileCapabilityMismatch);

    // 4. Seed minimums (anti-spam + share-inflation defense floor).
    let nusdc_seed_value = coin::value(&nusdc_seed);
    let deep_seed_value = coin::value(&deep_seed);
    assert!(nusdc_seed_value >= factory.min_initial_seed_nusdc, EInitialSeedTooSmall);
    assert!(deep_seed_value >= factory.min_initial_seed_deep, EDeepSeedTooSmall);
    assert!(nusdc_seed_value > SHARE_LOCK_AMOUNT, EInitialSeedTooSmall);

    // 5. Allocate UID first so we know the vault address for BM owner.
    let agent_profile_id = object::id(agent_profile);
    let agent_capability_id = object::id(cap);
    let mut vault_uid = object::new(ctx);
    let vault_id = object::uid_to_inner(&vault_uid);
    let vault_addr = object::uid_to_address(&vault_uid);

    // 6. BalanceManager + DepositCap + WithdrawCap + TradeCap — vault
    //    address is the BM owner. `validate_owner(ctx)` can never pass
    //    (no wallet matches), so the three caps below are the only
    //    operational access path.
    let (mut bm, deposit_cap, withdraw_cap, trade_cap) =
        balance_manager::new_with_custom_owner_caps_v2<VaultWitness>(
            VaultWitness {}, deepbook_registry, vault_addr, ctx,
        );

    // 7. Seed NUSDC + DEEP into the BM. validate_deposit_cap checks the
    //    allow-list only — ctx.sender independent — so the vault module
    //    holding the cap is sufficient.
    balance_manager::deposit_with_cap<NUSDC>(&mut bm, &deposit_cap, nusdc_seed, ctx);
    balance_manager::deposit_with_cap<DEEP>(&mut bm, &deposit_cap, deep_seed, ctx);
    let balance_manager_id = object::id(&bm);

    // 8. Yearn V3 dead-share lock recorded as a dynamic field on the UID.
    df::add(&mut vault_uid, LockedSharesKey {}, LockedShares { amount: SHARE_LOCK_AMOUNT });

    // 9. Build the vault with BM + caps as struct fields (not dof) so the
    //    borrow checker sees them as disjoint fields — `&mut bm` and
    //    `&deposit_cap` can coexist in the same statement at trade time.
    let mut shares = table::new<address, u64>(ctx);
    let manager_shares = nusdc_seed_value - SHARE_LOCK_AMOUNT;
    table::add(&mut shares, sender, manager_shares);

    let vault = Vault {
        id: vault_uid,
        total_shares: nusdc_seed_value,   // includes SHARE_LOCK_AMOUNT
        shares,
        manager: sender,
        agent_address: agent_profile::get_agent_address(agent_profile),
        agent_profile_id,
        agent_capability_id,
        performance_fee_bps,
        high_water_mark_nav: NAV_SCALE,   // initial NAV = 1.0
        last_mark_price: (NAV_SCALE as u64),  // 1.0; refreshed on first trade
        pending_withdrawals: table::new(ctx),
        // 0 = "agent has never traded". set_killed's permissionless stale-kill
        // path is gated on this being non-zero, so a freshly-created vault that
        // has not yet traded can only be killed by the manager (prevents a
        // stranger bricking a legit paused vault 24h after creation). The first
        // execute_trade sets it to the real clock time.
        last_agent_heartbeat_ms: 0,
        is_killed: false,
        cooldown_ms: factory.cooldown_ms,
        allowed_base_pool_id: factory.allowed_base_pool_id,
        client_order_id_seq: 0,
        balance_manager: bm,
        deposit_cap,
        withdraw_cap,
        trade_cap,
    };

    // 10. Register + share.
    vector::push_back(&mut factory.vault_ids, vault_id);
    event::emit(VaultCreated {
        vault_id,
        manager: sender,
        agent_profile_id,
        agent_capability_id,
        performance_fee_bps,
        initial_seed_nusdc: nusdc_seed_value,
        initial_seed_deep: deep_seed_value,
        balance_manager_id,
        cooldown_ms: vault.cooldown_ms,
        timestamp_ms: clock::timestamp_ms(clock),
    });
    transfer::share_object(vault);

    vault_id
}

// === Admin: factory parameter setters ===

public fun set_cooldown_ms(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_cooldown_ms: u64,
) {
    factory.cooldown_ms = new_cooldown_ms;
}

public fun set_min_initial_seed_nusdc(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_min: u64,
) {
    factory.min_initial_seed_nusdc = new_min;
}

public fun set_min_initial_seed_deep(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_min: u64,
) {
    factory.min_initial_seed_deep = new_min;
}

public fun set_protocol_fee_cap_bps(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_cap_bps: u64,
) {
    factory.protocol_fee_cap_bps = new_cap_bps;
}

public fun set_allowed_base_pool_id(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_pool_id: ID,
) {
    factory.allowed_base_pool_id = new_pool_id;
}

// === Depositor: deposit NUSDC, mint shares at conservative NAV ===
//
// Shares mint against pre-deposit NAV, computed BEFORE the coin is credited to
// the BM (crediting first would dilute the depositor's own share count).
// `shares_minted > 0` rejects dust deposits that would round to zero shares
// (the ERC4626 inflation-grief vector), already floored by the 1000 dead-share
// lock + min_initial_seed at create_vault. No tier gate on chain: depositor
// eligibility is a product-layer (frontend/API) decision, not a custody
// invariant. Direct donation to the BM is impossible (deposit needs the
// DepositCap the vault module holds), so balances only move via this path or
// authorized trades.
//
// NBTC valuation has two guards pulling in opposite directions:
//   - Existing holders: NBTC is marked at deposit_mark = max(live mid,
//     last_mark_price). Using the *higher* mark means a stale-low mark cannot
//     be exploited to mint cheap shares (a live mid above it is used instead).
//   - The depositor: that same higher mark can OVER-value NBTC when an existing
//     holder front-runs the order-book mid upward, minting the depositor too
//     few shares. `min_shares_out` is the depositor's slippage floor: the
//     deposit aborts if the conservative NAV would mint fewer than they accept.
// A manipulation-proof oracle/TWAP mark is deferred; until then last_mark is
// the authorized-fill price and min_shares_out is the depositor's protection.
public fun deposit(
    vault: &mut Vault,
    coin: Coin<NUSDC>,
    pool: &Pool<NBTC, NUSDC>,
    min_shares_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault.is_killed, EVaultKilled);

    let nusdc_in = coin::value(&coin);
    // The mark only matters when the vault actually holds NBTC; for a cash-only
    // vault the NBTC term is zero, so skip the order-book read entirely (saves
    // gas and keeps the shared Pool out of this tx's input set).
    let mark = if (balance_manager::balance<NBTC>(&vault.balance_manager) == 0) {
        vault.last_mark_price
    } else {
        deposit_mark(vault, pool, clock)
    };
    let nav = nav_with_mark(vault, mark);
    let shares_minted = (((nusdc_in as u128) * NAV_SCALE) / nav) as u64;
    assert!(shares_minted > 0, EZeroShares);
    assert!(shares_minted >= min_shares_out, ESlippageExceeded);

    balance_manager::deposit_with_cap<NUSDC>(
        &mut vault.balance_manager,
        &vault.deposit_cap,
        coin,
        ctx,
    );

    let sender = tx_context::sender(ctx);
    credit_shares(vault, sender, shares_minted);

    event::emit(DepositEvent {
        vault_id: object::id(vault),
        depositor: sender,
        nusdc_in,
        shares_minted,
        nav_per_share: nav,
        timestamp_ms: clock::timestamp_ms(clock),
    });
}

// === Depositor: request withdrawal (starts cooldown) ===
//
// Moves `shares` out of the active balance into a single per-depositor pending
// slot. The shares stay counted in `total_shares` (they retain a claim on
// vault assets and are burned only at claim time), so NAV is unaffected here.
// One pending request per depositor at a time; killed vaults route through the
// emergency path instead.
public fun request_withdrawal(
    vault: &mut Vault,
    shares: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault.is_killed, EVaultKilled);
    assert!(shares > 0, EZeroShares);
    let sender = tx_context::sender(ctx);
    assert!(table::contains(&vault.shares, sender), ENotDepositor);
    assert!(!table::contains(&vault.pending_withdrawals, sender), EWithdrawalPending);

    let cur = *table::borrow(&vault.shares, sender);
    assert!(cur >= shares, EInsufficientShares);
    let remaining = cur - shares;
    if (remaining == 0) {
        table::remove(&mut vault.shares, sender);
    } else {
        *table::borrow_mut(&mut vault.shares, sender) = remaining;
    };

    let now = clock::timestamp_ms(clock);
    let cooldown_until_ms = now + vault.cooldown_ms;
    table::add(&mut vault.pending_withdrawals, sender, PendingWithdrawal {
        shares,
        request_at_ms: now,
        cooldown_until_ms,
    });

    event::emit(WithdrawRequested {
        vault_id: object::id(vault),
        depositor: sender,
        shares,
        request_at_ms: now,
        cooldown_until_ms,
    });
}

// === Depositor: claim withdrawal after cooldown (in-kind pro-rata) ===
//
// After the cooldown, burns the pending shares and returns the depositor's
// pro-rata slice of BOTH vault assets: `shares / total_shares` of the current
// NUSDC and NBTC balances. Paying in-kind means NBTC is never priced here, so
// the claim cannot be gamed by manipulating the order-book mid (the attack the
// price-based payout would have been exposed to). Both outputs round DOWN, so
// a claimer never receives more than their exact share; the rounding dust
// stays in the vault for remaining holders. Depositors bear the vault's
// NUSDC/NBTC mix as it stands at claim time (the agent may rebalance during
// cooldown). Killed vaults route through claim_withdrawal_emergency, which is
// the same pro-rata payout without the cooldown gate.
public fun claim_withdrawal(
    vault: &mut Vault,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<NUSDC>, Coin<NBTC>) {
    assert!(!vault.is_killed, EVaultKilled);
    let sender = tx_context::sender(ctx);
    assert!(table::contains(&vault.pending_withdrawals, sender), ENoPendingWithdrawal);

    let cooldown_until_ms = table::borrow(&vault.pending_withdrawals, sender).cooldown_until_ms;
    assert!(clock::timestamp_ms(clock) >= cooldown_until_ms, ECooldownNotElapsed);

    let PendingWithdrawal { shares, .. } =
        table::remove(&mut vault.pending_withdrawals, sender);

    // NAV snapshot BEFORE the payout mutates state, so the event reports the
    // per-share value the claim settled at (telemetry only; payout_pro_rata is
    // in-kind and never consults NAV).
    let nav_at_claim = nav_with_mark(vault, vault.last_mark_price);
    let (nusdc_coin, nbtc_coin) = payout_pro_rata(vault, shares, ctx);

    event::emit(WithdrawClaimed {
        vault_id: object::id(vault),
        depositor: sender,
        shares,
        nusdc_out: nusdc_coin.value(),
        nbtc_out: nbtc_coin.value(),
        nav_per_share: nav_at_claim,
        was_emergency: false,
        timestamp_ms: clock::timestamp_ms(clock),
    });

    (nusdc_coin, nbtc_coin)
}

// === Agent/manager: execute a spot trade on the bound pool ===
//
// Authorization is the load-bearing gate (without it ANY address could drive
// the vault into a self-set-up bad-price fill and drain it): only the manager
// or the snapshotted agent_address may call. The capability is then re-checked
// via assert_can_execute (revoked / paused / owner==manager / version / action
// allowed / per-order notional cap), and the pool must be the one the vault was
// bound to at creation.
//
// The order is placed through DeepBook's tier-aware v2 entry (taker/maker fee
// discounted by the *caller's* nasun tier) as IMMEDIATE_OR_CANCEL (IOC), NOT
// GTC. This is deliberate and load-bearing for NAV correctness: the vault is a
// pure TAKER and never rests a maker order. DeepBook moves a resting order's
// escrow OUT of the BalanceManager free balance into the pool, and balance<T>()
// (which nav_with_mark and payout_pro_rata read) returns ONLY free balance —
// the vault has no cancel/settle entry to see or reclaim open-order escrow. A
// resting order would therefore make NAV under-count vault assets, letting a
// depositor over-mint or a claimer be shortchanged. IOC sidesteps this: the
// fillable part executes (proceeds settle into free balance within THIS tx, as
// the fill tests confirm) and the unfilled remainder is cancelled, so after the
// call no escrow is locked in an open order. IOC also closes a self-referential
// mark — a resting vault order would appear in the level-2 book that
// mark_after_trade reads, letting the vault dictate its own mark; with IOC the
// order is gone before that read. cancel_taker self-matching is kept as
// belt-and-suspenders; pay_with_deep draws fees from the seeded DEEP.
//
// last_mark_price is refreshed in the SAME tx that may acquire NBTC (atomic): a
// buy fills NBTC into the BM and then the mark is set from the post-trade live
// mid (or the realized fill price). Because execute_trade is the only path that
// adds NBTC, no externally observable state ever has NBTC priced at the stale
// 1.0 init sentinel.
public fun execute_trade(
    vault: &mut Vault,
    cap: &Capability,
    tier_registry: &TierRegistry,
    pool: &mut Pool<NBTC, NUSDC>,
    expected_cap_version: u64,
    is_bid: bool,
    price: u64,
    quantity: u64,
    expire_ts_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!vault.is_killed, EVaultKilled);

    let sender = tx_context::sender(ctx);
    assert!(sender == vault.manager || sender == vault.agent_address, ENotManager);

    assert!(object::id(pool) == vault.allowed_base_pool_id, EAssetNotAllowed);
    assert!(object::id(cap) == vault.agent_capability_id, ECapabilityMismatch);

    let base_type = type_name::with_defining_ids<NBTC>();
    assert!(capability::is_asset_allowed(cap, &base_type), EAssetNotAllowed);

    // Per-order notional ceiling (NUSDC units): price*qty/FLOAT_SCALING. This is
    // a per-call cap, not a cumulative/position limit (a resting order can be
    // re-placed); position-level risk is out of scope for the MVP.
    let notional = (((price as u128) * (quantity as u128)) / NAV_SCALE) as u64;
    let action = ACTION_SPOT_TRADE.to_string();
    capability::assert_can_execute(cap, vault.manager, &action, notional, expected_cap_version);

    let proof = balance_manager::generate_proof_as_trader(
        &mut vault.balance_manager,
        &vault.trade_cap,
        ctx,
    );
    vault.client_order_id_seq = vault.client_order_id_seq + 1;
    let order_info = pool::place_limit_order_v2(
        pool,
        &mut vault.balance_manager,
        &proof,
        tier_registry,
        vault.client_order_id_seq,
        constants::immediate_or_cancel(), // IOC: taker-only, never rests (see doc above)
        constants::cancel_taker(),
        price,
        quantity,
        is_bid,
        true, // pay_with_deep
        expire_ts_ms,
        clock,
        ctx,
    );

    let fill_notional = order_info.cumulative_quote_quantity();
    let executed_qty = order_info.executed_quantity();

    vault.last_mark_price = mark_after_trade(pool, clock, fill_notional, executed_qty, vault.last_mark_price);
    let nav_after = nav_with_mark(vault, vault.last_mark_price);
    vault.last_agent_heartbeat_ms = clock::timestamp_ms(clock);

    event::emit(TradeExecuted {
        vault_id: object::id(vault),
        agent_profile_id: vault.agent_profile_id,
        capability_id: vault.agent_capability_id,
        agent_address: sender,
        pool_id: object::id(pool),
        is_bid,
        price,
        qty: executed_qty,
        fill_notional,
        nav_after,
        timestamp_ms: vault.last_agent_heartbeat_ms,
        action_type: ACTION_SPOT_TRADE,
    });
}

// === Manager-only: rotate / disable the delegated agent-runtime address ===
//
// Lets the manager revoke a compromised runtime key without revoking the shared
// capability or killing the vault. clear_agent_address sets it back to the
// manager, so only the manager can trade.
public fun set_agent_address(vault: &mut Vault, new_agent: address, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == vault.manager, ENotManager);
    vault.agent_address = new_agent;
}

public fun clear_agent_address(vault: &mut Vault, ctx: &TxContext) {
    assert!(tx_context::sender(ctx) == vault.manager, ENotManager);
    vault.agent_address = vault.manager;
}

// === Permissionless: crystallize the HWM performance fee ===
//
// Yearn V3-style: when NAV per share exceeds the high-water mark, the manager's
// cut of the gain (performance_fee_bps of the excess) is paid by MINTING new
// shares to the manager, diluting holders proportionally rather than moving
// assets out. Two safety choices make the fee hard to game:
//   1. is_killed gate: a killed/winding-down vault cannot be cranked. Otherwise
//      anyone could crystallize fresh manager shares right before depositors
//      exit via claim_withdrawal_emergency, diluting their in-kind payout.
//   2. CONSERVATIVE mark: NBTC is valued at min(live mid, last_mark_price) (the
//      LOWER of the two) via crystallize_mark — the mirror image of deposit's
//      max(). The low mark yields the smallest NAV/excess/fee, so neither a
//      stale last_mark nor a momentarily-skewed live mid can inflate the fee
//      against depositors.
// The HWM resets to the crystallized NAV. Permissionless crank: anyone may call
// it; the fee is bounded by the agreed bps on real profit above the HWM.
//
// fee_shares uses the dilution-corrected Yearn-V3 mint m = fee*S/(V-fee), NOT
// the naive fee*1e9/nav: newly minted manager shares dilute themselves, so the
// naive form under-pays the manager by the fee fraction. m is solved so the
// manager's new shares are worth exactly `fee` at the POST-mint NAV (a mint
// adds shares but no assets, so V is unchanged). V - fee > 0 always, since
// fee = bps*excess <= excess <= V and bps < 1.
public fun crystallize_fee(vault: &mut Vault, pool: &Pool<NBTC, NUSDC>, clock: &Clock) {
    assert!(!vault.is_killed, EVaultKilled);

    let current_nav = nav_with_mark(vault, crystallize_mark(vault, pool, clock));
    if (current_nav <= vault.high_water_mark_nav) return;

    let total_shares_u128 = vault.total_shares as u128;
    let total_value_nusdc = (current_nav * total_shares_u128) / NAV_SCALE; // V (AUM)
    let excess_per_share = current_nav - vault.high_water_mark_nav;
    let total_excess_nusdc = (excess_per_share * total_shares_u128) / NAV_SCALE;
    let fee_nusdc = (total_excess_nusdc * (vault.performance_fee_bps as u128)) / 10_000u128;
    let fee_shares = ((fee_nusdc * total_shares_u128) / (total_value_nusdc - fee_nusdc)) as u64;
    if (fee_shares == 0) return; // dust

    let manager = vault.manager;
    let previous_hwm = vault.high_water_mark_nav;
    credit_shares(vault, manager, fee_shares);
    vault.high_water_mark_nav = current_nav;

    event::emit(FeeCrystallized {
        vault_id: object::id(vault),
        manager,
        nav_per_share_at_crystallize: current_nav,
        previous_hwm,
        new_hwm: current_nav,
        fee_shares_minted: fee_shares,
        timestamp_ms: clock::timestamp_ms(clock),
    });
}

// === Kill switch: manager any time, or anyone once the agent goes dark ===
//
// The manager can always kill the vault. Anyone else may kill it only after the
// agent has TRADED AT LEAST ONCE and then gone quiet for HEARTBEAT_TIMEOUT_MS (a
// liveness backstop so a dead agent cannot trap depositor funds). The
// "traded at least once" gate (last_agent_heartbeat_ms != 0) is what stops a
// stranger from bricking a freshly-created, not-yet-started vault 24h after
// creation: until the first trade the heartbeat is the 0 sentinel, so only the
// manager can kill. is_killed is one-way; the !is_killed guard keeps the kill
// idempotent (no duplicate VaultKilled events with conflicting killer info).
// Killed vaults block deposit/trade/normal claim and route withdrawals through
// claim_withdrawal_emergency.
public fun set_killed(vault: &mut Vault, clock: &Clock, ctx: &TxContext) {
    assert!(!vault.is_killed, EVaultKilled);
    let sender = tx_context::sender(ctx);
    let traded = vault.last_agent_heartbeat_ms != 0;
    let agent_stale =
        traded && clock::timestamp_ms(clock) >= vault.last_agent_heartbeat_ms + HEARTBEAT_TIMEOUT_MS;
    assert!(sender == vault.manager || agent_stale, EHeartbeatNotElapsed);
    vault.is_killed = true;
    event::emit(VaultKilled {
        vault_id: object::id(vault),
        killer: sender,
        timestamp_ms: clock::timestamp_ms(clock),
    });
}

// === Killed-vault exit: in-kind pro-rata of BOTH active and pending shares ===
//
// When the vault is killed, depositors exit here without the cooldown. A
// depositor's claim is their active shares PLUS any shares parked in a pending
// withdrawal (both must be paid, or in-cooldown depositors would be stranded).
// Payout is the same in-kind pro-rata as the normal claim.
public fun claim_withdrawal_emergency(
    vault: &mut Vault,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<NUSDC>, Coin<NBTC>) {
    assert!(vault.is_killed, ENotKilled);
    let sender = tx_context::sender(ctx);

    let active = if (table::contains(&vault.shares, sender)) {
        table::remove(&mut vault.shares, sender)
    } else {
        0
    };
    let pending = if (table::contains(&vault.pending_withdrawals, sender)) {
        let PendingWithdrawal { shares, .. } = table::remove(&mut vault.pending_withdrawals, sender);
        shares
    } else {
        0
    };
    let shares = active + pending;
    assert!(shares > 0, ENotDepositor);

    let nav_now = nav_with_mark(vault, vault.last_mark_price);
    let (nusdc_coin, nbtc_coin) = payout_pro_rata(vault, shares, ctx);

    event::emit(WithdrawClaimed {
        vault_id: object::id(vault),
        depositor: sender,
        shares,
        nusdc_out: nusdc_coin.value(),
        nbtc_out: nbtc_coin.value(),
        nav_per_share: nav_now,
        was_emergency: true,
        timestamp_ms: clock::timestamp_ms(clock),
    });

    (nusdc_coin, nbtc_coin)
}

// === Manager-only: recover seeded DEEP from a killed vault ===
//
// DEEP is operational gas (never part of NAV/shares), so claims never
// distribute it. Once the vault is killed (no more trading), the manager
// recovers the remaining DEEP.
public fun recover_deep(vault: &mut Vault, ctx: &mut TxContext): Coin<DEEP> {
    assert!(tx_context::sender(ctx) == vault.manager, ENotManager);
    assert!(vault.is_killed, ENotKilled);
    let amount = balance_manager::balance<DEEP>(&vault.balance_manager);
    balance_manager::withdraw_with_cap<DEEP>(
        &mut vault.balance_manager,
        &vault.withdraw_cap,
        amount,
        ctx,
    )
}

// === Manager-only: top up DEEP balance (used to pay DeepBook v1 fees) ===
//
// `place_limit_order_v2` requires `pay_with_deep = true`, so the BM must
// hold DEEP at all times. If the manager runs the vault long enough that
// DEEP runs low, they top up via this entry. Sender must be the vault
// manager — depositor or stranger top-ups are intentionally rejected to
// avoid spam.
public fun top_up_deep(
    vault: &mut Vault,
    deep_coin: Coin<DEEP>,
    ctx: &TxContext,
) {
    assert!(tx_context::sender(ctx) == vault.manager, ENotManager);
    balance_manager::deposit_with_cap<DEEP>(
        &mut vault.balance_manager,
        &vault.deposit_cap,
        deep_coin,
        ctx,
    );
}

// === Internal: share + payout helpers ===

// Credit `delta` shares to `who` (creating the entry if absent) and bump
// total_shares. Single writer for share minting (deposit + crystallize_fee) so
// the invariant total_shares == sum(active) + sum(pending) + locked holds.
fun credit_shares(vault: &mut Vault, who: address, delta: u64) {
    if (table::contains(&vault.shares, who)) {
        let bal = table::borrow_mut(&mut vault.shares, who);
        *bal = *bal + delta;
    } else {
        table::add(&mut vault.shares, who, delta);
    };
    vault.total_shares = vault.total_shares + delta;
}

// Burn `shares` from total_shares and return the pro-rata slice of BOTH vault
// assets. Both amounts round DOWN, so the vault never overpays and the dust
// accrues to remaining holders. Shared by the normal in-kind claim and the
// emergency claim so the rounding/burn semantics can never diverge.
fun payout_pro_rata(vault: &mut Vault, shares: u64, ctx: &mut TxContext): (Coin<NUSDC>, Coin<NBTC>) {
    let total = vault.total_shares;
    let nusdc_bal = balance_manager::balance<NUSDC>(&vault.balance_manager);
    let nbtc_bal = balance_manager::balance<NBTC>(&vault.balance_manager);
    let nusdc_out = (((nusdc_bal as u128) * (shares as u128)) / (total as u128)) as u64;
    let nbtc_out = (((nbtc_bal as u128) * (shares as u128)) / (total as u128)) as u64;

    vault.total_shares = total - shares;

    let nusdc_coin = balance_manager::withdraw_with_cap<NUSDC>(
        &mut vault.balance_manager,
        &vault.withdraw_cap,
        nusdc_out,
        ctx,
    );
    let nbtc_coin = balance_manager::withdraw_with_cap<NBTC>(
        &mut vault.balance_manager,
        &vault.withdraw_cap,
        nbtc_out,
        ctx,
    );
    (nusdc_coin, nbtc_coin)
}

// === Internal: NAV ===
//
// NAV per share scaled by NAV_SCALE (1e9). Vault value = NUSDC balance + NBTC
// valued at `mark` (NUSDC per NBTC, FLOAT_SCALING 1e9); DEEP is operational gas
// and is never counted. When the vault holds no NBTC the mark is irrelevant
// (the NBTC term is zero), so a cash-only vault always reads NAV == 1.0 right
// after creation. The caller chooses the mark, never raw `pool::mid_price`
// (which aborts on a one-sided book and is manipulable on a thin one).
fun nav_with_mark(vault: &Vault, mark: u64): u128 {
    if (vault.total_shares == 0) return NAV_SCALE;
    let nusdc_balance = balance_manager::balance<NUSDC>(&vault.balance_manager);
    let nbtc_balance = balance_manager::balance<NBTC>(&vault.balance_manager);
    let nbtc_value_nusdc = if (nbtc_balance == 0) {
        0u128
    } else {
        ((nbtc_balance as u128) * (mark as u128)) / NAV_SCALE
    };
    let total_value_nusdc = (nusdc_balance as u128) + nbtc_value_nusdc;
    // A wiped vault (no NUSDC, only NBTC dust that values to 0) would yield a
    // 0 NAV, which divides-by-zero in deposit. Floor to 1.0 so a depositor can
    // recapitalize an empty vault instead of bricking it. Caveat: at this floor
    // a recapitalizer mints 1:1 while the outstanding (now-worthless) shares
    // still dilute their claim — they self-protect with deposit's min_shares_out
    // (they will see they receive few shares and can abort). Reaching here at
    // all requires the vault to have lost ~all value, an extreme edge.
    if (total_value_nusdc == 0) return NAV_SCALE;
    (total_value_nusdc * NAV_SCALE) / (vault.total_shares as u128)
}

// Live order-book mid via the NON-aborting level-2 read (empty side -> empty
// vector, never aborts). Returns none when either side is empty so callers can
// fall back to last_mark_price instead of failing on a one-sided book.
fun live_mid(pool: &Pool<NBTC, NUSDC>, clock: &Clock): Option<u64> {
    let (bid_price, _bq, ask_price, _aq) = pool::get_level2_ticks_from_mid(pool, 1, clock);
    if (!vector::is_empty(&bid_price) && !vector::is_empty(&ask_price)) {
        // Widen to u128 for the average so two near-u64::MAX top-of-book prices
        // (a thin/garbage book) can't overflow-abort this read and DoS deposits.
        option::some((((bid_price[0] as u128) + (ask_price[0] as u128)) / 2) as u64)
    } else {
        option::none()
    }
}

// Conservative (higher) NBTC mark for deposit valuation: max(live mid,
// last_mark_price), or last_mark_price when the book is one-sided. Picking the
// higher mark means a depositor can never mint cheap shares by skewing the mid
// down (falls back to last_mark) or up (pays the higher mid).
fun deposit_mark(vault: &Vault, pool: &Pool<NBTC, NUSDC>, clock: &Clock): u64 {
    let lm = live_mid(pool, clock);
    if (lm.is_some()) {
        let mid = lm.destroy_some();
        if (mid > vault.last_mark_price) mid else vault.last_mark_price
    } else {
        vault.last_mark_price
    }
}

// Conservative (lower) NBTC mark for fee crystallization: min(live mid,
// last_mark_price). The mirror of deposit_mark's max(): valuing NBTC LOW yields
// the smallest excess-over-HWM and thus the smallest performance fee, so the
// manager cannot over-charge depositors by crystallizing on a stale-high
// last_mark or a momentarily-inflated live mid.
fun crystallize_mark(vault: &Vault, pool: &Pool<NBTC, NUSDC>, clock: &Clock): u64 {
    let lm = live_mid(pool, clock);
    if (lm.is_some()) {
        let mid = lm.destroy_some();
        if (mid < vault.last_mark_price) mid else vault.last_mark_price
    } else {
        vault.last_mark_price
    }
}

// Mark to record after a trade: the post-trade live mid if the book is still
// two-sided, else the realized fill price (fill_notional/executed_qty), else
// the previous mark when nothing filled. Keeps last_mark_price current with the
// vault's own authorized fills.
fun mark_after_trade(
    pool: &Pool<NBTC, NUSDC>,
    clock: &Clock,
    fill_notional: u64,
    executed_qty: u64,
    prev: u64,
): u64 {
    let lm = live_mid(pool, clock);
    if (lm.is_some()) {
        lm.destroy_some()
    } else if (executed_qty > 0) {
        (((fill_notional as u128) * NAV_SCALE) / (executed_qty as u128)) as u64
    } else {
        prev
    }
}

// === Test-only helpers ===

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}

#[test_only]
public fun total_shares(vault: &Vault): u64 {
    vault.total_shares
}

#[test_only]
public fun shares_of(vault: &Vault, who: address): u64 {
    if (table::contains(&vault.shares, who)) *table::borrow(&vault.shares, who) else 0
}

#[test_only]
public fun has_pending(vault: &Vault, who: address): bool {
    table::contains(&vault.pending_withdrawals, who)
}

#[test_only]
public fun pending_shares(vault: &Vault, who: address): u64 {
    table::borrow(&vault.pending_withdrawals, who).shares
}

#[test_only]
public fun nusdc_balance(vault: &Vault): u64 {
    balance_manager::balance<NUSDC>(&vault.balance_manager)
}

#[test_only]
public fun set_killed_for_testing(vault: &mut Vault) {
    vault.is_killed = true;
}

#[test_only]
public fun nbtc_balance(vault: &Vault): u64 {
    balance_manager::balance<NBTC>(&vault.balance_manager)
}

#[test_only]
public fun last_mark_price(vault: &Vault): u64 {
    vault.last_mark_price
}

#[test_only]
public fun high_water_mark(vault: &Vault): u128 {
    vault.high_water_mark_nav
}

#[test_only]
public fun is_killed(vault: &Vault): bool {
    vault.is_killed
}

// Inject NBTC straight into the BM (simulates a trade outcome) so the in-kind
// claim and conservative-deposit NAV paths can be exercised in isolation,
// without driving a real trade through execute_trade.
#[test_only]
public fun give_nbtc_for_testing(vault: &mut Vault, coin: Coin<NBTC>, ctx: &TxContext) {
    balance_manager::deposit_with_cap<NBTC>(&mut vault.balance_manager, &vault.deposit_cap, coin, ctx);
}

#[test_only]
public fun set_last_mark_for_testing(vault: &mut Vault, mark: u64) {
    vault.last_mark_price = mark;
}

// Simulate "the agent traded at time `ms`" so the set_killed stale-kill path can
// be tested without driving a real execute_trade (heartbeat is the 0 sentinel
// until the first trade).
#[test_only]
public fun set_heartbeat_for_testing(vault: &mut Vault, ms: u64) {
    vault.last_agent_heartbeat_ms = ms;
}
