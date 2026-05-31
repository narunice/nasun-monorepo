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
use std::string::{Self, String};
use std::type_name::{Self, TypeName};
use std::vector;

use sui::balance::{Self, Balance};
use sui::clock::{Self, Clock};
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::dynamic_object_field as dof;
use sui::event;
use sui::object::{Self, UID, ID};
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

use baram_aer::capability::{Self, Capability};
use baram_agent::agent_profile::{Self, AgentProfile};
use deepbook::balance_manager::{Self, BalanceManager, DepositCap, WithdrawCap, TradeCap};
use deepbook::pool::{Self, Pool};
use deepbook::order_info::{Self, OrderInfo};
use deepbook::registry::{Self, Registry as DeepbookRegistry};
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
const DEFAULT_MIN_SEED_DEEP: u64 = 1_000_000_000;       // 1,000 DEEP (verify at A.2)
const DEFAULT_PROTOCOL_FEE_CAP_BPS: u64 = 3_000;        // 30%
const DEFAULT_MIN_EMERGENCY_SHARE_BPS: u64 = 100;       // 1% of total_shares
const SHARE_LOCK_AMOUNT: u64 = 1_000;                   // Yearn V3 dead-share lock

// DeepBook order constants (verify exact values in deepbook::constants at A.4)
const ORDER_TYPE_GTC: u8 = 0;
const SELF_MATCHING_CANCEL_TAKER: u8 = 0;

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
const EBelowEmergencyThreshold: u64 = 15;
const EHeartbeatNotElapsed: u64 = 16;
const ENotManager: u64 = 17;
const ENotKilled: u64 = 18;

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
    min_emergency_share_bps: u64,
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
    agent_profile_id: ID,
    agent_capability_id: ID,
    performance_fee_bps: u64,
    // nav_per_share at most recent HWM update, scaled by NAV_SCALE (1e9).
    high_water_mark_nav: u128,
    pending_withdrawals: Table<address, PendingWithdrawal>,
    last_agent_heartbeat_ms: u64,
    is_killed: bool,
    cooldown_ms: u64,                                           // snapshot from factory
    min_emergency_share_bps: u64,
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
        min_emergency_share_bps: DEFAULT_MIN_EMERGENCY_SHARE_BPS,
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
        agent_profile_id,
        agent_capability_id,
        performance_fee_bps,
        high_water_mark_nav: NAV_SCALE,   // initial NAV = 1.0
        pending_withdrawals: table::new(ctx),
        last_agent_heartbeat_ms: clock::timestamp_ms(clock),
        is_killed: false,
        cooldown_ms: factory.cooldown_ms,
        min_emergency_share_bps: factory.min_emergency_share_bps,
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

public fun set_min_emergency_share_bps(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_bps: u64,
) {
    factory.min_emergency_share_bps = new_bps;
}

public fun set_allowed_base_pool_id(
    _cap: &VaultFactoryAdminCap,
    factory: &mut VaultFactory,
    new_pool_id: ID,
) {
    factory.allowed_base_pool_id = new_pool_id;
}

#[allow(unused_function)]
public fun deposit(
    _vault: &mut Vault,
    _coin: Coin<NUSDC>,
    _pool: &Pool<NBTC, NUSDC>,
    _clock: &Clock,
    _ctx: &mut TxContext,
) {
    abort 0
}

#[allow(unused_function)]
public fun request_withdrawal(
    _vault: &mut Vault,
    _shares: u64,
    _clock: &Clock,
    _ctx: &mut TxContext,
) {
    abort 0
}

#[allow(unused_function)]
public fun claim_withdrawal(
    _vault: &mut Vault,
    _pool: &Pool<NBTC, NUSDC>,
    _clock: &Clock,
    _ctx: &mut TxContext,
): Coin<NUSDC> {
    abort 0
}

#[allow(unused_function)]
public fun execute_trade(
    _vault: &mut Vault,
    _cap: &Capability,
    _expected_cap_version: u64,
    _tier_registry: &TierRegistry,
    _pool: &mut Pool<NBTC, NUSDC>,
    _is_bid: bool,
    _price: u64,
    _quantity: u64,
    _expire_ts_ms: u64,
    _clock: &Clock,
    _ctx: &mut TxContext,
) {
    abort 0
}

#[allow(unused_function)]
public fun crystallize_fee(
    _vault: &mut Vault,
    _pool: &Pool<NBTC, NUSDC>,
    _clock: &Clock,
    _ctx: &TxContext,
) {
    abort 0
}

#[allow(unused_function)]
public fun set_killed(
    _vault: &mut Vault,
    _clock: &Clock,
    _ctx: &TxContext,
) {
    abort 0
}

#[allow(unused_function)]
public fun claim_withdrawal_emergency(
    _vault: &mut Vault,
    _pool: &Pool<NBTC, NUSDC>,
    _clock: &Clock,
    _ctx: &mut TxContext,
): (Coin<NUSDC>, Coin<NBTC>) {
    abort 0
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

// === Admin entries (set_cooldown_ms / set_min_seed / set_max_slippage_bps etc.) ===
// Bodies in A.2 (factory) and A.4 (per-vault knobs if any).
