/// Prediction Market Module for Pado
/// Binary prediction markets (YES/NO outcomes) with on-chain CLOB matching.
/// NUSDC collateral; admin (multisig) resolution.
///
/// Design highlights (per round-6 plan):
/// - Atomic taker matching with deferred-mutation pattern (walk loop only mutates
///   `vector<Order>`; sorted-index updates / event emission / maker payouts are
///   accumulated into local Vecs and applied after the walk borrow drops).
/// - Per-maker payout batching (one Coin object per unique maker, not per fill).
/// - Per-Market `next_order_id` (no shared GlobalState) to avoid cross-market contention.
/// - All-paths fund recovery: STATUS_CANCELLED + STATUS_RESOLVED markets both have
///   `claim_resting_order_refund` for resting maker orders.
/// - Rounding favors the pool/maker (floor division), never the taker.
module prediction::prediction_market;

use sui::coin::{Self, Coin};
use sui::balance::{Self, Balance};
use sui::table::{Self, Table};
use sui::clock::{Self, Clock};
use sui::event;
use sui::package::UpgradeCap;
use std::string::String;
use devnet_tokens::nusdc::NUSDC;

// ===== Error Codes =====
const EMarketNotOpen: u64 = 0;
const EMarketNotClosed: u64 = 1;
const EMarketAlreadyResolved: u64 = 2;
const ENotResolver: u64 = 3;
const EMarketNotResolved: u64 = 4;
const EWrongOutcome: u64 = 5;
// const EInsufficientBalance: u64 = 6;            // unused
const EInvalidPrice: u64 = 7;                       // retained for explicit price-bound checks (use EInvalidInput=17 generally)
const ENotOrderOwner: u64 = 9;                      // reused for cancel/refund auth
const EMarketExpired: u64 = 10;
// const ESelfTrade: u64 = 11;                     // removed — self-trade is skip, not abort
const EResolveDeadlinePassed: u64 = 12;
const EMarketNotExpired: u64 = 13;
const EMarketNotCancelled: u64 = 14;
const EMarketAlreadyCancelled: u64 = 15;
const ECreatorIsResolver: u64 = 16;
const EInvalidInput: u64 = 17;
const ECapacityExceeded: u64 = 18;
const ENoFillsAtMarketPrice: u64 = 19;
const EOrderNotFound: u64 = 20;
const EWrongMarket: u64 = 21;
const EMergeEmpty: u64 = 22;
const EMergeMismatch: u64 = 23;
/// Deprecated recovery path. The original `mint_admin_cap_via_upgrade*` accepted
/// any `&UpgradeCap`, which let any caller mint an AdminCap by publishing a
/// trivial Move package. Bodies were rewritten to abort with this code in v4.
const EAdminRecoveryDeprecated: u64 = 24;

// ===== Constants =====
const MAX_PRICE: u64 = 10000;                       // 100% in basis points (NUSDC = 6 decimals)

// Caps (round-6 plan §1.4). Sync with frontend constants.ts after gas dry-run check.
const MAX_PAYMENT_AMOUNT: u64 = 100_000_000_000;    // 100k NUSDC at 6 decimals
const MAX_MINT_AMOUNT: u64 = 100_000_000_000;
const MAX_WALK_LEVELS: u64 = 10;
const MAX_FIFO_PER_LEVEL: u64 = 20;
const MAX_PRICE_LEVELS_PER_SIDE: u64 = 200;

// Market metadata length caps
const MAX_QUESTION_LEN: u64 = 500;
const MAX_DESCRIPTION_LEN: u64 = 2000;
const MAX_CATEGORY_LEN: u64 = 50;
const MAX_RESOLUTION_SOURCE_LEN: u64 = 500;
const MAX_RESOLUTION_CRITERIA_LEN: u64 = 2000;

// Market status
const STATUS_OPEN: u8 = 0;
// const STATUS_CLOSED: u8 = 1;                     // removed (round-6, never set anywhere; soft-closed via clock)
const STATUS_RESOLVED: u8 = 2;
const STATUS_CANCELLED: u8 = 3;

// ===== Structs =====

/// Admin capability for creating markets. Held by admin multisig post-deploy.
public struct AdminCap has key, store {
    id: UID,
}

/// Prediction Market — shared object.
public struct Market has key {
    id: UID,

    // Metadata
    question: String,
    description: String,
    category: String,
    resolution_source: String,                      // round-5 W2: structured resolution metadata
    resolution_criteria: String,

    // Timing
    created_at: u64,
    close_time: u64,
    resolve_deadline: u64,

    // Collateral
    collateral_pool: Balance<NUSDC>,

    // Supply tracking
    yes_supply: u64,
    no_supply: u64,

    // Order books: price -> FIFO vector<Order>.
    yes_bids: Table<u64, vector<Order>>,
    yes_asks: Table<u64, vector<Order>>,
    no_bids: Table<u64, vector<Order>>,
    no_asks: Table<u64, vector<Order>>,

    // Sorted price-level indices. Move Table cannot iterate; sui::priority_queue
    // lacks remove-by-key. Sorted vector with binary insert/linear remove is
    // simplest viable structure given MAX_PRICE_LEVELS_PER_SIDE = 200 cap.
    yes_ask_prices: vector<u64>,                    // ascending
    yes_bid_prices: vector<u64>,                    // descending
    no_ask_prices: vector<u64>,                     // ascending
    no_bid_prices: vector<u64>,                     // descending

    // Statistics
    total_volume: u64,

    // Lifecycle
    status: u8,
    outcome: Option<bool>,                          // Some(true) = YES wins

    // Admin
    creator: address,
    resolver: address,

    // Per-Market order ID counter (round-5 C6 fix: removes GlobalState contention).
    next_order_id: u64,

    // Tracks NUSDC locked by open bid orders currently held in collateral_pool.
    // claim_cancelled_refund subtracts this from pool_balance so bid-locked funds
    // are not redistributed to position holders on market cancellation.
    total_locked_bid_nusdc: u64,
}

/// Order in the book.
public struct Order has store, copy, drop {
    order_id: u64,
    owner: address,
    is_yes: bool,                                   // for cancel-side validation
    is_bid: bool,
    price: u64,                                     // basis points
    amount: u64,                                    // shares
    locked_nusdc: u64,                              // bids: NUSDC sitting in pool. Asks: 0.
    cost_basis: u64,                                // asks: original Position basis. Bids: 0.
    timestamp: u64,
}

/// Position NFT — represents YES or NO shares. Owned object.
public struct Position has key, store {
    id: UID,
    market_id: ID,
    is_yes: bool,
    shares: u64,
    cost_basis: u64,
}

// Local matching helpers (drop-only, no key/store).
public struct MakerPayout has drop, copy { owner: address, amount: u64 }
public struct MakerPositionGrant has drop, copy { owner: address, shares: u64, cost_basis: u64 }
public struct PendingFill has drop, copy {
    order_id: u64,
    maker: address,
    price: u64,
    fill_shares: u64,
    cost: u64,
}

// ===== Events =====

public struct MarketCreated has copy, drop {
    market_id: ID,
    question: String,
    category: String,
    close_time: u64,
    creator: address,
    resolver: address,
}

public struct TokensMinted has copy, drop {
    market_id: ID,
    user: address,
    amount: u64,
}

public struct OrderPlaced has copy, drop {
    market_id: ID,
    order_id: u64,
    user: address,
    is_yes: bool,
    is_bid: bool,
    price: u64,
    amount: u64,
    locked_nusdc: u64,
    cost_basis: u64,
}

public struct OrderFilled has copy, drop {
    market_id: ID,
    order_id: u64,
    maker: address,
    taker: address,
    is_yes: bool,
    is_bid: bool,                                   // is_bid of the maker side
    price: u64,
    fill_shares: u64,
    cost: u64,
}

public struct OrderCancelled has copy, drop {
    market_id: ID,
    order_id: u64,
    owner: address,
}

public struct MarketResolved has copy, drop {
    market_id: ID,
    outcome: bool,
    resolver: address,
}

public struct WinningsClaimed has copy, drop {
    market_id: ID,
    user: address,
    shares: u64,
    payout: u64,
}

public struct MarketCancelled has copy, drop {
    market_id: ID,
    timestamp: u64,
}

public struct ResolveDeadlineExtended has copy, drop {
    market_id: ID,
    old_deadline: u64,
    new_deadline: u64,
}

public struct CancelledRefundClaimed has copy, drop {
    market_id: ID,
    user: address,
    shares: u64,
    refund: u64,
}

public struct RestingOrderRefunded has copy, drop {
    market_id: ID,
    order_id: u64,
    owner: address,
    locked_nusdc: u64,
    shares: u64,
}

public struct PositionsMerged has copy, drop {
    market_id: ID,
    owner: address,
    is_yes: bool,
    count: u64,                                     // number of input Positions consumed
    total_shares: u64,
    total_cost_basis: u64,
}

// ===== Init =====

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        AdminCap { id: object::new(ctx) },
        tx_context::sender(ctx),
    );
    // No GlobalState created (round-5 C6: per-Market next_order_id).
}

// ===== Admin Recovery (DEPRECATED in v4) =====

/// DEPRECATED. The original implementation accepted any `&UpgradeCap`, which
/// did not actually bind the recovery to *this* package's UpgradeCap. A
/// caller could publish a trivial Move package, receive a generic UpgradeCap,
/// and mint a prediction_market AdminCap (full admin compromise).
///
/// Signature preserved for Sui upgrade compatibility; body now aborts.
/// Future admin recovery must either come from a fresh publish or be
/// reintroduced with a SharedConfig-anchored package-id assertion.
public fun mint_admin_cap_via_upgrade(
    _upgrade_cap: &UpgradeCap,
    _ctx: &mut TxContext,
): AdminCap {
    abort EAdminRecoveryDeprecated
}

/// DEPRECATED. See `mint_admin_cap_via_upgrade`.
public fun mint_admin_cap_via_upgrade_entry(
    _upgrade_cap: &UpgradeCap,
    _ctx: &mut TxContext,
) {
    abort EAdminRecoveryDeprecated
}

// ===== Admin: Create / Resolve =====

public fun create_market(
    _admin: &AdminCap,
    question: String,
    description: String,
    category: String,
    resolution_source: String,
    resolution_criteria: String,
    close_time: u64,
    resolve_deadline: u64,
    resolver: address,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let now = clock::timestamp_ms(clock);
    let creator = tx_context::sender(ctx);

    // Validation (round-2 audit + round-5 plan).
    assert!(creator != resolver, ECreatorIsResolver);
    assert!(close_time > now, EInvalidInput);
    assert!(resolve_deadline > close_time, EInvalidInput);
    assert!(question.length() > 0 && question.length() <= MAX_QUESTION_LEN, EInvalidInput);
    assert!(description.length() <= MAX_DESCRIPTION_LEN, EInvalidInput);
    assert!(category.length() > 0 && category.length() <= MAX_CATEGORY_LEN, EInvalidInput);
    assert!(resolution_source.length() <= MAX_RESOLUTION_SOURCE_LEN, EInvalidInput);
    assert!(resolution_criteria.length() <= MAX_RESOLUTION_CRITERIA_LEN, EInvalidInput);

    let market = Market {
        id: object::new(ctx),
        question,
        description,
        category,
        resolution_source,
        resolution_criteria,
        created_at: now,
        close_time,
        resolve_deadline,
        collateral_pool: balance::zero(),
        yes_supply: 0,
        no_supply: 0,
        yes_bids: table::new(ctx),
        yes_asks: table::new(ctx),
        no_bids: table::new(ctx),
        no_asks: table::new(ctx),
        yes_ask_prices: vector::empty(),
        yes_bid_prices: vector::empty(),
        no_ask_prices: vector::empty(),
        no_bid_prices: vector::empty(),
        total_volume: 0,
        status: STATUS_OPEN,
        outcome: option::none(),
        creator,
        resolver,
        next_order_id: 1,
        total_locked_bid_nusdc: 0,
    };

    event::emit(MarketCreated {
        market_id: object::id(&market),
        question: market.question,
        category: market.category,
        close_time,
        creator,
        resolver,
    });

    transfer::share_object(market);
}

public fun resolve_market(
    market: &mut Market,
    outcome: bool,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(market.status != STATUS_RESOLVED, EMarketAlreadyResolved);
    assert!(market.status != STATUS_CANCELLED, EMarketAlreadyCancelled);
    assert!(tx_context::sender(ctx) == market.resolver, ENotResolver);
    let now = clock::timestamp_ms(clock);
    assert!(now >= market.close_time, EMarketNotClosed);
    assert!(now <= market.resolve_deadline, EResolveDeadlinePassed);

    market.status = STATUS_RESOLVED;
    market.outcome = option::some(outcome);

    event::emit(MarketResolved {
        market_id: object::id(market),
        outcome,
        resolver: market.resolver,
    });
}

// ===== User: Mint =====

public fun mint_outcome_tokens(
    market: &mut Market,
    payment: Coin<NUSDC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, EMarketNotOpen);
    assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);

    let amount = coin::value(&payment);
    assert!(amount > 0 && amount <= MAX_MINT_AMOUNT, EInvalidInput);

    let sender = tx_context::sender(ctx);
    balance::join(&mut market.collateral_pool, coin::into_balance(payment));

    market.yes_supply = market.yes_supply + amount;
    market.no_supply = market.no_supply + amount;

    let yes_position = Position {
        id: object::new(ctx),
        market_id: object::id(market),
        is_yes: true,
        shares: amount,
        cost_basis: amount,
    };
    let no_position = Position {
        id: object::new(ctx),
        market_id: object::id(market),
        is_yes: false,
        shares: amount,
        cost_basis: amount,
    };

    event::emit(TokensMinted { market_id: object::id(market), user: sender, amount });

    transfer::transfer(yes_position, sender);
    transfer::transfer(no_position, sender);
}

// ===== Maker: Place limit orders =====

public fun place_buy_maker(
    market: &mut Market,
    is_yes: bool,
    price: u64,
    payment: Coin<NUSDC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, EMarketNotOpen);
    assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
    assert!(price > 0 && price < MAX_PRICE, EInvalidPrice);

    let amount_nusdc = coin::value(&payment);
    assert!(amount_nusdc > 0 && amount_nusdc <= MAX_PAYMENT_AMOUNT, EInvalidInput);

    let shares = (((amount_nusdc as u128) * (MAX_PRICE as u128)) / (price as u128)) as u64;
    assert!(shares > 0, EInvalidInput);

    let owner = tx_context::sender(ctx);
    let now = clock::timestamp_ms(clock);

    insert_resting_bid_internal(
        market, is_yes, price,
        amount_nusdc, shares,
        owner, coin::into_balance(payment),
        now, ctx,
    );
}

public fun place_sell_maker(
    market: &mut Market,
    position: Position,
    price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, EMarketNotOpen);
    assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
    assert!(price > 0 && price < MAX_PRICE, EInvalidPrice);

    let Position {
        id, market_id: pos_market_id, is_yes,
        shares, cost_basis,
    } = position;
    object::delete(id);
    assert!(pos_market_id == object::id(market), EWrongMarket);
    assert!(shares > 0, EInvalidInput);

    let owner = tx_context::sender(ctx);
    let now = clock::timestamp_ms(clock);

    insert_resting_ask_internal(
        market, is_yes, price,
        shares, cost_basis,
        owner, now, ctx,
    );
}

// ===== Taker: Atomic matching =====

public fun place_buy_taker(
    market: &mut Market,
    is_yes: bool,
    max_price: u64,
    rest_on_no_fill: bool,
    payment: Coin<NUSDC>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, EMarketNotOpen);
    assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
    assert!(max_price > 0 && max_price < MAX_PRICE, EInvalidInput);

    let amount_nusdc = coin::value(&payment);
    assert!(amount_nusdc > 0 && amount_nusdc <= MAX_PAYMENT_AMOUNT, EInvalidInput);

    let taker = tx_context::sender(ctx);
    let mut payment_balance = coin::into_balance(payment);
    let market_id = object::id(market);
    let now = clock::timestamp_ms(clock);

    // Snapshot price levels (vector<u64> has copy via primitive elements).
    let price_snapshot: vector<u64> = if (is_yes) {
        market.yes_ask_prices
    } else {
        market.no_ask_prices
    };

    // Local accumulators — all market-side mutations deferred until walk ends.
    let mut total_filled_shares: u64 = 0;
    let mut total_filled_cost: u64 = 0;
    let mut running_filled: u64 = 0;
    let mut maker_payouts: vector<MakerPayout> = vector::empty();
    let mut levels_to_remove: vector<u64> = vector::empty();
    let mut pending_fills: vector<PendingFill> = vector::empty();
    let mut levels_walked: u64 = 0;

    let snapshot_len = vector::length(&price_snapshot);
    let mut i = 0;
    while (i < snapshot_len) {
        if (levels_walked >= MAX_WALK_LEVELS) break;
        if (running_filled >= amount_nusdc) break;
        let price = *vector::borrow(&price_snapshot, i);
        if (price > max_price) break;

        let mut non_self_orders_at_level: u64 = 0;
        let mut level_emptied: bool = false;
        {
            // SCOPED BORROW: orders borrow drops at end of this block (round-5 C1 fix).
            let asks_table = if (is_yes) { &mut market.yes_asks } else { &mut market.no_asks };
            let orders = table::borrow_mut(asks_table, price);

            let mut order_idx: u64 = 0;
            let mut actual_fills_at_level: u64 = 0;

            while (order_idx < vector::length(orders)) {
                if (running_filled >= amount_nusdc) break;
                if (actual_fills_at_level >= MAX_FIFO_PER_LEVEL) abort ECapacityExceeded;

                let order_copy = *vector::borrow(orders, order_idx);

                // Self-skip — does NOT count toward fill cap (round-5 C3 + W1).
                if (order_copy.owner == taker) {
                    order_idx = order_idx + 1;
                    continue
                };
                non_self_orders_at_level = non_self_orders_at_level + 1;

                let nusdc_avail = amount_nusdc - running_filled;
                let max_shares = (((nusdc_avail as u128) * (MAX_PRICE as u128)) / (price as u128)) as u64;
                let fill_shares = min_u64(order_copy.amount, max_shares);
                if (fill_shares == 0) break;
                let cost = (((fill_shares as u128) * (price as u128)) / (MAX_PRICE as u128)) as u64;

                accumulate_payout(&mut maker_payouts, order_copy.owner, cost);

                // Ask-maker fill: cost_basis from Order.cost_basis (preserved at place_sell_maker).
                let cost_basis_portion = (((fill_shares as u128) * (order_copy.cost_basis as u128))
                                          / (order_copy.amount as u128)) as u64;
                let updated = Order {
                    order_id: order_copy.order_id,
                    owner: order_copy.owner,
                    is_yes: order_copy.is_yes,
                    is_bid: order_copy.is_bid,
                    price: order_copy.price,
                    amount: order_copy.amount - fill_shares,
                    locked_nusdc: 0,
                    cost_basis: order_copy.cost_basis - cost_basis_portion,
                    timestamp: order_copy.timestamp,
                };
                if (updated.amount == 0) {
                    vector::remove(orders, order_idx);
                } else {
                    *vector::borrow_mut(orders, order_idx) = updated;
                    order_idx = order_idx + 1;
                };

                vector::push_back(&mut pending_fills, PendingFill {
                    order_id: order_copy.order_id,
                    maker: order_copy.owner,
                    price, fill_shares, cost,
                });

                actual_fills_at_level = actual_fills_at_level + 1;
                total_filled_shares = total_filled_shares + fill_shares;
                total_filled_cost = total_filled_cost + cost;
                running_filled = running_filled + cost;
            };
            level_emptied = vector::is_empty(orders);
        }; // END SCOPED BORROW

        if (level_emptied) {
            vector::push_back(&mut levels_to_remove, price);
        };
        if (non_self_orders_at_level > 0) {
            levels_walked = levels_walked + 1;
        };
        i = i + 1;
    };

    // === Apply deferred mutations === //

    // 1. Remove emptied levels.
    apply_level_removals(market, is_yes, false, &levels_to_remove);

    // 2. Dispense maker payouts (one Coin per unique maker).
    let mut p = 0;
    let payout_count = vector::length(&maker_payouts);
    while (p < payout_count) {
        let payout = *vector::borrow(&maker_payouts, p);
        let part = balance::split(&mut payment_balance, payout.amount);
        transfer::public_transfer(coin::from_balance(part, ctx), payout.owner);
        p = p + 1;
    };

    // 3. Emit OrderFilled events.
    let mut k = 0;
    let fill_count = vector::length(&pending_fills);
    while (k < fill_count) {
        let pf = *vector::borrow(&pending_fills, k);
        event::emit(OrderFilled {
            market_id,
            order_id: pf.order_id,
            maker: pf.maker,
            taker,
            is_yes,
            is_bid: false,
            price: pf.price,
            fill_shares: pf.fill_shares,
            cost: pf.cost,
        });
        k = k + 1;
    };

    // 4. Mint Position for filled portion + update volume.
    if (total_filled_shares > 0) {
        let pos = Position {
            id: object::new(ctx),
            market_id,
            is_yes,
            shares: total_filled_shares,
            cost_basis: total_filled_cost,
        };
        transfer::transfer(pos, taker);
        market.total_volume = market.total_volume + total_filled_cost;
    };

    // 5. Leftover handling — Balance must be consumed (no drop ability).
    let nusdc_remaining = balance::value(&payment_balance);
    if (nusdc_remaining == 0) {
        balance::destroy_zero(payment_balance);
    } else if (total_filled_shares == 0 && !rest_on_no_fill) {
        // Market mode + zero fills: refund Balance to taker, then abort to roll back.
        // Tx revert undoes the transfer, so taker's original Coin is unaffected.
        // We must consume payment_balance before abort or it drops illegally.
        transfer::public_transfer(coin::from_balance(payment_balance, ctx), taker);
        abort ENoFillsAtMarketPrice
    } else {
        // Limit mode OR partial fill: rest leftover at max_price.
        let leftover_shares = (((nusdc_remaining as u128) * (MAX_PRICE as u128)) / (max_price as u128)) as u64;
        if (leftover_shares > 0) {
            insert_resting_bid_internal(
                market, is_yes, max_price,
                nusdc_remaining, leftover_shares,
                taker, payment_balance, now, ctx,
            );
        } else {
            // Dust < 1 share — refund.
            transfer::public_transfer(coin::from_balance(payment_balance, ctx), taker);
        };
    };
}

public fun place_sell_taker(
    market: &mut Market,
    position: Position,
    min_price: u64,
    rest_on_no_fill: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_OPEN, EMarketNotOpen);
    assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
    assert!(min_price > 0 && min_price < MAX_PRICE, EInvalidInput);

    let Position {
        id, market_id: pos_market_id, is_yes,
        shares: position_shares, cost_basis: position_cost_basis,
    } = position;
    object::delete(id);
    assert!(pos_market_id == object::id(market), EWrongMarket);
    assert!(position_shares > 0, EInvalidInput);

    let taker = tx_context::sender(ctx);
    let market_id = object::id(market);
    let now = clock::timestamp_ms(clock);

    let price_snapshot: vector<u64> = if (is_yes) {
        market.yes_bid_prices
    } else {
        market.no_bid_prices
    };

    let mut shares_remaining: u64 = position_shares;
    let mut total_filled_shares: u64 = 0;
    let mut total_received_nusdc: u64 = 0;
    let mut levels_walked: u64 = 0;
    let mut levels_to_remove: vector<u64> = vector::empty();
    let mut maker_grants: vector<MakerPositionGrant> = vector::empty();
    let mut pending_fills: vector<PendingFill> = vector::empty();

    let snapshot_len = vector::length(&price_snapshot);
    let mut i = 0;
    while (i < snapshot_len) {
        if (levels_walked >= MAX_WALK_LEVELS) break;
        if (shares_remaining == 0) break;
        let price = *vector::borrow(&price_snapshot, i);
        if (price < min_price) break;

        let mut non_self_orders_at_level: u64 = 0;
        let mut level_emptied: bool = false;
        {
            let bids_table = if (is_yes) { &mut market.yes_bids } else { &mut market.no_bids };
            let orders = table::borrow_mut(bids_table, price);

            let mut order_idx: u64 = 0;
            let mut actual_fills_at_level: u64 = 0;

            while (order_idx < vector::length(orders)) {
                if (shares_remaining == 0) break;
                if (actual_fills_at_level >= MAX_FIFO_PER_LEVEL) abort ECapacityExceeded;

                let order_copy = *vector::borrow(orders, order_idx);

                if (order_copy.owner == taker) {
                    order_idx = order_idx + 1;
                    continue
                };
                non_self_orders_at_level = non_self_orders_at_level + 1;

                let fill_shares = min_u64(order_copy.amount, shares_remaining);
                if (fill_shares == 0) break;

                // Bid-maker fill: NUSDC paid to taker = proportional locked_nusdc (NOT cost_basis).
                let nusdc_to_taker = (((fill_shares as u128) * (order_copy.locked_nusdc as u128))
                                      / (order_copy.amount as u128)) as u64;

                let updated = Order {
                    order_id: order_copy.order_id,
                    owner: order_copy.owner,
                    is_yes: order_copy.is_yes,
                    is_bid: order_copy.is_bid,
                    price: order_copy.price,
                    amount: order_copy.amount - fill_shares,
                    locked_nusdc: order_copy.locked_nusdc - nusdc_to_taker,
                    cost_basis: 0,
                    timestamp: order_copy.timestamp,
                };
                if (updated.amount == 0) {
                    vector::remove(orders, order_idx);
                } else {
                    *vector::borrow_mut(orders, order_idx) = updated;
                    order_idx = order_idx + 1;
                };

                vector::push_back(&mut maker_grants, MakerPositionGrant {
                    owner: order_copy.owner,
                    shares: fill_shares,
                    cost_basis: nusdc_to_taker,
                });
                vector::push_back(&mut pending_fills, PendingFill {
                    order_id: order_copy.order_id,
                    maker: order_copy.owner,
                    price, fill_shares, cost: nusdc_to_taker,
                });

                actual_fills_at_level = actual_fills_at_level + 1;
                total_filled_shares = total_filled_shares + fill_shares;
                total_received_nusdc = total_received_nusdc + nusdc_to_taker;
                shares_remaining = shares_remaining - fill_shares;
            };
            level_emptied = vector::is_empty(orders);
        };

        if (level_emptied) {
            vector::push_back(&mut levels_to_remove, price);
        };
        if (non_self_orders_at_level > 0) {
            levels_walked = levels_walked + 1;
        };
        i = i + 1;
    };

    // === Apply deferred mutations === //

    apply_level_removals(market, is_yes, true, &levels_to_remove);

    // Pay taker NUSDC from pool.
    if (total_received_nusdc > 0) {
        let payment = balance::split(&mut market.collateral_pool, total_received_nusdc);
        transfer::public_transfer(coin::from_balance(payment, ctx), taker);
        market.total_volume = market.total_volume + total_received_nusdc;
        market.total_locked_bid_nusdc = market.total_locked_bid_nusdc - total_received_nusdc;
    };

    // Mint Position for each unique bid maker.
    let mut k = 0;
    let grant_count = vector::length(&maker_grants);
    while (k < grant_count) {
        let grant = *vector::borrow(&maker_grants, k);
        let pos = Position {
            id: object::new(ctx),
            market_id,
            is_yes,
            shares: grant.shares,
            cost_basis: grant.cost_basis,
        };
        transfer::transfer(pos, grant.owner);
        k = k + 1;
    };

    // Emit fills.
    let mut m = 0;
    let fill_count = vector::length(&pending_fills);
    while (m < fill_count) {
        let pf = *vector::borrow(&pending_fills, m);
        event::emit(OrderFilled {
            market_id,
            order_id: pf.order_id,
            maker: pf.maker,
            taker,
            is_yes,
            is_bid: true,
            price: pf.price,
            fill_shares: pf.fill_shares,
            cost: pf.cost,
        });
        m = m + 1;
    };

    // Leftover handling.
    if (shares_remaining > 0) {
        if (total_filled_shares == 0 && !rest_on_no_fill) {
            // Market mode + zero fills: refund Position back to taker, then abort.
            let leftover_cost_basis = (((shares_remaining as u128) * (position_cost_basis as u128))
                                       / (position_shares as u128)) as u64;
            let pos = Position {
                id: object::new(ctx),
                market_id,
                is_yes,
                shares: shares_remaining,
                cost_basis: leftover_cost_basis,
            };
            transfer::transfer(pos, taker);
            abort ENoFillsAtMarketPrice
        } else {
            // Rest leftover at min_price.
            let leftover_cost_basis = (((shares_remaining as u128) * (position_cost_basis as u128))
                                       / (position_shares as u128)) as u64;
            insert_resting_ask_internal(
                market, is_yes, min_price,
                shares_remaining, leftover_cost_basis,
                taker, now, ctx,
            );
        };
    };
}

// ===== Cancel / Refund =====

public fun cancel_order(
    market: &mut Market,
    is_yes: bool,
    is_bid: bool,
    price: u64,
    order_id: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let _ = clock; // close_time check intentionally omitted — allow cancel at any time
    let sender = tx_context::sender(ctx);
    let market_id = object::id(market);

    let (locked_nusdc, shares, cost_basis) = remove_order_from_book(
        market, is_yes, is_bid, price, order_id, sender,
    );

    if (is_bid) {
        let refund = balance::split(&mut market.collateral_pool, locked_nusdc);
        transfer::public_transfer(coin::from_balance(refund, ctx), sender);
    } else {
        let pos = Position {
            id: object::new(ctx),
            market_id,
            is_yes,
            shares,
            cost_basis,
        };
        transfer::transfer(pos, sender);
    };

    event::emit(OrderCancelled { market_id, order_id, owner: sender });
}

public fun claim_resting_order_refund(
    market: &mut Market,
    is_yes: bool,
    is_bid: bool,
    price: u64,
    order_id: u64,
    ctx: &mut TxContext,
) {
    assert!(
        market.status == STATUS_CANCELLED || market.status == STATUS_RESOLVED,
        EMarketNotOpen,
    );

    let sender = tx_context::sender(ctx);
    let market_id = object::id(market);

    let (locked_nusdc, shares, cost_basis) = remove_order_from_book(
        market, is_yes, is_bid, price, order_id, sender,
    );

    if (is_bid) {
        let refund = balance::split(&mut market.collateral_pool, locked_nusdc);
        transfer::public_transfer(coin::from_balance(refund, ctx), sender);
    } else {
        let pos = Position {
            id: object::new(ctx),
            market_id,
            is_yes,
            shares,
            cost_basis,
        };
        transfer::transfer(pos, sender);
    };

    event::emit(RestingOrderRefunded {
        market_id, order_id, owner: sender,
        locked_nusdc, shares,
    });
}

// ===== Resolution Claims =====

public fun claim_winnings(
    market: &mut Market,
    position: Position,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_RESOLVED, EMarketNotResolved);

    let Position { id, market_id, is_yes, shares, cost_basis: _ } = position;
    object::delete(id);

    assert!(market_id == object::id(market), EWrongMarket);
    let winning_outcome = *option::borrow(&market.outcome);
    assert!(is_yes == winning_outcome, EWrongOutcome);

    let sender = tx_context::sender(ctx);
    let payout = shares; // 1 winning share = 1 NUSDC

    let payout_balance = balance::split(&mut market.collateral_pool, payout);
    let payout_coin = coin::from_balance(payout_balance, ctx);

    // Decrement winning supply (round-2 C4).
    if (is_yes) {
        market.yes_supply = market.yes_supply - shares;
    } else {
        market.no_supply = market.no_supply - shares;
    };

    event::emit(WinningsClaimed {
        market_id: object::id(market),
        user: sender,
        shares,
        payout,
    });

    transfer::public_transfer(payout_coin, sender);
}

public fun burn_losing_position(
    market: &mut Market,
    position: Position,
    _ctx: &TxContext,
) {
    assert!(market.status == STATUS_RESOLVED, EMarketNotResolved);

    let Position { id, market_id, is_yes, shares, cost_basis: _ } = position;
    object::delete(id);

    assert!(market_id == object::id(market), EWrongMarket);
    let winning_outcome = *option::borrow(&market.outcome);
    assert!(is_yes != winning_outcome, EWrongOutcome);

    // Decrement losing supply.
    if (is_yes) {
        market.yes_supply = market.yes_supply - shares;
    } else {
        market.no_supply = market.no_supply - shares;
    };
}

// ===== Position Merge =====

/// Merge N >= 1 same-(market, side) Position NFTs into a single Position.
/// All inputs are consumed; the resulting Position is returned by value so
/// callers can chain it into the next moveCall (e.g. place_sell_taker) within
/// the same PTB. For a standalone "just merge and keep" flow, use
/// `merge_positions_entry` which transfers the merged Position to the sender.
///
/// Lossless: Position carries only (market_id, is_yes, shares, cost_basis);
/// shares and cost_basis are additively combined, identifiers unchanged.
///
/// Safety:
/// - All inputs must share market_id and is_yes (else EMergeMismatch).
/// - The passed &Market must match market_id (else EWrongMarket); prevents
///   cross-market consolidation within a single tx.
/// - Owned-object semantics guarantee only the sender can supply their own
///   Position values; no transfer-redirection vector.
public fun merge_positions(
    market: &Market,
    mut positions: vector<Position>,
    ctx: &mut TxContext,
): Position {
    let n = vector::length(&positions);
    assert!(n >= 1, EMergeEmpty);

    let first = vector::pop_back(&mut positions);
    let Position { id: first_id, market_id, is_yes, mut shares, mut cost_basis } = first;
    object::delete(first_id);

    assert!(market_id == object::id(market), EWrongMarket);

    while (!vector::is_empty(&positions)) {
        let p = vector::pop_back(&mut positions);
        let Position {
            id,
            market_id: m2,
            is_yes: y2,
            shares: s2,
            cost_basis: c2,
        } = p;
        assert!(m2 == market_id, EMergeMismatch);
        assert!(y2 == is_yes, EMergeMismatch);
        shares = shares + s2;
        cost_basis = cost_basis + c2;
        object::delete(id);
    };
    vector::destroy_empty(positions);

    event::emit(PositionsMerged {
        market_id,
        owner: tx_context::sender(ctx),
        is_yes,
        count: n,
        total_shares: shares,
        total_cost_basis: cost_basis,
    });

    Position {
        id: object::new(ctx),
        market_id,
        is_yes,
        shares,
        cost_basis,
    }
}

/// Standalone "merge and keep" entry — wraps `merge_positions` and transfers
/// the resulting Position to the sender. Used when the frontend wants to tidy
/// up positions without chaining into a sell/claim.
public fun merge_positions_entry(
    market: &Market,
    positions: vector<Position>,
    ctx: &mut TxContext,
) {
    let sender = tx_context::sender(ctx);
    let merged = merge_positions(market, positions, ctx);
    transfer::transfer(merged, sender);
}

// ===== Admin: Extend Deadline / Void Market =====

public fun extend_resolve_deadline(
    _admin: &AdminCap,
    market: &mut Market,
    new_deadline: u64,
    clock: &Clock,
) {
    assert!(market.status != STATUS_RESOLVED, EMarketAlreadyResolved);
    assert!(market.status != STATUS_CANCELLED, EMarketAlreadyCancelled);
    assert!(new_deadline > market.resolve_deadline, EInvalidInput);
    assert!(new_deadline > clock::timestamp_ms(clock), EInvalidInput);

    let old_deadline = market.resolve_deadline;
    market.resolve_deadline = new_deadline;

    event::emit(ResolveDeadlineExtended {
        market_id: object::id(market),
        old_deadline,
        new_deadline,
    });
}

public fun admin_cancel_market(
    _admin: &AdminCap,
    market: &mut Market,
    clock: &Clock,
) {
    assert!(market.status != STATUS_RESOLVED, EMarketAlreadyResolved);
    assert!(market.status != STATUS_CANCELLED, EMarketAlreadyCancelled);

    market.status = STATUS_CANCELLED;

    event::emit(MarketCancelled {
        market_id: object::id(market),
        timestamp: clock::timestamp_ms(clock),
    });
}

// ===== Cancellation =====

public fun cancel_expired_market(
    market: &mut Market,
    clock: &Clock,
) {
    assert!(clock::timestamp_ms(clock) > market.resolve_deadline, EMarketNotExpired);
    assert!(market.status != STATUS_RESOLVED, EMarketAlreadyResolved);
    assert!(market.status != STATUS_CANCELLED, EMarketAlreadyCancelled);

    market.status = STATUS_CANCELLED;

    event::emit(MarketCancelled {
        market_id: object::id(market),
        timestamp: clock::timestamp_ms(clock),
    });
}

public fun claim_cancelled_refund(
    market: &mut Market,
    position: Position,
    ctx: &mut TxContext,
) {
    assert!(market.status == STATUS_CANCELLED, EMarketNotCancelled);

    let Position { id, market_id, is_yes, shares, cost_basis: _ } = position;
    object::delete(id);
    assert!(market_id == object::id(market), EWrongMarket);

    // Exclude bid-locked NUSDC from the refund pool so open bid orders don't
    // subsidize position holders on cancellation.
    let effective_pool = balance::value(&market.collateral_pool) - market.total_locked_bid_nusdc;
    let total_shares = market.yes_supply + market.no_supply;

    let refund_amount = if (total_shares > 0) {
        (((shares as u128) * (effective_pool as u128) / (total_shares as u128)) as u64)
    } else {
        0
    };

    if (is_yes) {
        market.yes_supply = market.yes_supply - shares;
    } else {
        market.no_supply = market.no_supply - shares;
    };

    let sender = tx_context::sender(ctx);

    if (refund_amount > 0) {
        let refund_balance = balance::split(&mut market.collateral_pool, refund_amount);
        let refund_coin = coin::from_balance(refund_balance, ctx);
        event::emit(CancelledRefundClaimed {
            market_id: object::id(market),
            user: sender,
            shares,
            refund: refund_amount,
        });
        transfer::public_transfer(refund_coin, sender);
    };
}

// ===== Private Helpers =====

fun min_u64(a: u64, b: u64): u64 { if (a < b) { a } else { b } }

/// Insert price into ascending vector if absent. Linear insertion (binary search not
/// trivially expressible without recursion / mutable indices in Move; linear is fine
/// for MAX_PRICE_LEVELS_PER_SIDE = 200 cap).
fun sorted_insert_asc(prices: &mut vector<u64>, p: u64) {
    let len = vector::length(prices);
    let mut i = 0;
    while (i < len) {
        let cur = *vector::borrow(prices, i);
        if (cur == p) return;
        if (cur > p) {
            vector::insert(prices, p, i);
            return
        };
        i = i + 1;
    };
    vector::push_back(prices, p);
}

fun sorted_insert_desc(prices: &mut vector<u64>, p: u64) {
    let len = vector::length(prices);
    let mut i = 0;
    while (i < len) {
        let cur = *vector::borrow(prices, i);
        if (cur == p) return;
        if (cur < p) {
            vector::insert(prices, p, i);
            return
        };
        i = i + 1;
    };
    vector::push_back(prices, p);
}

fun sorted_remove(prices: &mut vector<u64>, p: u64) {
    let len = vector::length(prices);
    let mut i = 0;
    while (i < len) {
        if (*vector::borrow(prices, i) == p) {
            vector::remove(prices, i);
            return
        };
        i = i + 1;
    };
}

/// Linear scan accumulator; up to MAX_FIFO_PER_LEVEL × MAX_WALK_LEVELS = 200 entries.
fun accumulate_payout(payouts: &mut vector<MakerPayout>, owner: address, amount: u64) {
    let len = vector::length(payouts);
    let mut i = 0;
    while (i < len) {
        let entry = vector::borrow_mut(payouts, i);
        if (entry.owner == owner) {
            entry.amount = entry.amount + amount;
            return
        };
        i = i + 1;
    };
    vector::push_back(payouts, MakerPayout { owner, amount });
}

/// Apply emptied price-level removals to both Table and sorted index. Called after
/// walk borrow drops.
fun apply_level_removals(
    market: &mut Market,
    is_yes: bool,
    is_bid: bool,
    levels: &vector<u64>,
) {
    let len = vector::length(levels);
    let mut j = 0;
    while (j < len) {
        let price = *vector::borrow(levels, j);
        if (is_yes && is_bid) {
            table::remove(&mut market.yes_bids, price);
            sorted_remove(&mut market.yes_bid_prices, price);
        } else if (is_yes && !is_bid) {
            table::remove(&mut market.yes_asks, price);
            sorted_remove(&mut market.yes_ask_prices, price);
        } else if (!is_yes && is_bid) {
            table::remove(&mut market.no_bids, price);
            sorted_remove(&mut market.no_bid_prices, price);
        } else {
            table::remove(&mut market.no_asks, price);
            sorted_remove(&mut market.no_ask_prices, price);
        };
        j = j + 1;
    };
}

/// Insert a resting bid order. Joins NUSDC into pool; updates sorted index.
/// Asserts price-level cap if creating a new level.
fun insert_resting_bid_internal(
    market: &mut Market,
    is_yes: bool,
    price: u64,
    locked_nusdc: u64,
    shares: u64,
    owner: address,
    payment: Balance<NUSDC>,
    timestamp: u64,
    _ctx: &mut TxContext,
) {
    let order_id = market.next_order_id;
    market.next_order_id = market.next_order_id + 1;
    let market_id = object::id(market);

    let order = Order {
        order_id,
        owner,
        is_yes,
        is_bid: true,
        price,
        amount: shares,
        locked_nusdc,
        cost_basis: 0,
        timestamp,
    };

    balance::join(&mut market.collateral_pool, payment);
    market.total_locked_bid_nusdc = market.total_locked_bid_nusdc + locked_nusdc;

    let prices_idx = if (is_yes) { &mut market.yes_bid_prices } else { &mut market.no_bid_prices };
    let creating_new_level = !vector::contains(prices_idx, &price);
    if (creating_new_level) {
        assert!(vector::length(prices_idx) < MAX_PRICE_LEVELS_PER_SIDE, ECapacityExceeded);
        sorted_insert_desc(prices_idx, price);
    };

    let bids_table = if (is_yes) { &mut market.yes_bids } else { &mut market.no_bids };
    if (!table::contains(bids_table, price)) {
        table::add(bids_table, price, vector::empty());
    };
    let bucket = table::borrow_mut(bids_table, price);
    vector::push_back(bucket, order);

    event::emit(OrderPlaced {
        market_id, order_id, user: owner,
        is_yes, is_bid: true, price, amount: shares,
        locked_nusdc, cost_basis: 0,
    });
}

/// Insert a resting ask order. Records cost_basis preserved from caller's Position.
fun insert_resting_ask_internal(
    market: &mut Market,
    is_yes: bool,
    price: u64,
    shares: u64,
    cost_basis: u64,
    owner: address,
    timestamp: u64,
    _ctx: &mut TxContext,
) {
    let order_id = market.next_order_id;
    market.next_order_id = market.next_order_id + 1;
    let market_id = object::id(market);

    let order = Order {
        order_id,
        owner,
        is_yes,
        is_bid: false,
        price,
        amount: shares,
        locked_nusdc: 0,
        cost_basis,
        timestamp,
    };

    let prices_idx = if (is_yes) { &mut market.yes_ask_prices } else { &mut market.no_ask_prices };
    let creating_new_level = !vector::contains(prices_idx, &price);
    if (creating_new_level) {
        assert!(vector::length(prices_idx) < MAX_PRICE_LEVELS_PER_SIDE, ECapacityExceeded);
        sorted_insert_asc(prices_idx, price);
    };

    let asks_table = if (is_yes) { &mut market.yes_asks } else { &mut market.no_asks };
    if (!table::contains(asks_table, price)) {
        table::add(asks_table, price, vector::empty());
    };
    let bucket = table::borrow_mut(asks_table, price);
    vector::push_back(bucket, order);

    event::emit(OrderPlaced {
        market_id, order_id, user: owner,
        is_yes, is_bid: false, price, amount: shares,
        locked_nusdc: 0, cost_basis,
    });
}

/// Remove an order from the book. Validates owner. Cleans up empty level (Table +
/// sorted index) atomically. Returns (locked_nusdc, shares, cost_basis) of removed.
fun remove_order_from_book(
    market: &mut Market,
    is_yes: bool,
    is_bid: bool,
    price: u64,
    order_id: u64,
    expected_owner: address,
): (u64, u64, u64) {
    let level_emptied: bool;
    let removed_locked_nusdc: u64;
    let removed_shares: u64;
    let removed_cost_basis: u64;
    {
        let table_ref = if (is_yes && is_bid) { &mut market.yes_bids }
                       else if (is_yes && !is_bid) { &mut market.yes_asks }
                       else if (!is_yes && is_bid) { &mut market.no_bids }
                       else { &mut market.no_asks };

        assert!(table::contains(table_ref, price), EOrderNotFound);
        let orders = table::borrow_mut(table_ref, price);

        let len = vector::length(orders);
        let mut found_idx: u64 = len;
        let mut k = 0;
        while (k < len) {
            let o = vector::borrow(orders, k);
            if (o.order_id == order_id) {
                assert!(o.owner == expected_owner, ENotOrderOwner);
                found_idx = k;
                break
            };
            k = k + 1;
        };
        assert!(found_idx < len, EOrderNotFound);

        let removed = vector::remove(orders, found_idx);
        removed_locked_nusdc = removed.locked_nusdc;
        removed_shares = removed.amount;
        removed_cost_basis = removed.cost_basis;
        level_emptied = vector::is_empty(orders);
    };

    if (level_emptied) {
        if (is_yes && is_bid) {
            table::remove(&mut market.yes_bids, price);
            sorted_remove(&mut market.yes_bid_prices, price);
        } else if (is_yes && !is_bid) {
            table::remove(&mut market.yes_asks, price);
            sorted_remove(&mut market.yes_ask_prices, price);
        } else if (!is_yes && is_bid) {
            table::remove(&mut market.no_bids, price);
            sorted_remove(&mut market.no_bid_prices, price);
        } else {
            table::remove(&mut market.no_asks, price);
            sorted_remove(&mut market.no_ask_prices, price);
        };
    };

    if (is_bid) {
        market.total_locked_bid_nusdc = market.total_locked_bid_nusdc - removed_locked_nusdc;
    };

    (removed_locked_nusdc, removed_shares, removed_cost_basis)
}

// ===== View Functions =====

public fun get_market_status(market: &Market): u8 { market.status }

public fun get_market_outcome(market: &Market): Option<bool> { market.outcome }

public fun get_yes_supply(market: &Market): u64 { market.yes_supply }
public fun get_no_supply(market: &Market): u64 { market.no_supply }

public fun get_collateral_balance(market: &Market): u64 { balance::value(&market.collateral_pool) }

public fun get_total_volume(market: &Market): u64 { market.total_volume }

public fun get_position_shares(position: &Position): u64 { position.shares }
public fun is_position_yes(position: &Position): bool { position.is_yes }
public fun get_position_market(position: &Position): ID { position.market_id }
public fun get_position_cost_basis(position: &Position): u64 { position.cost_basis }

// ===== Test-Only =====

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}

#[test_only]
public fun compute_locked_bids(market: &Market): u64 {
    let mut total: u64 = 0;
    let mut sides = vector::empty<bool>();
    vector::push_back(&mut sides, true);
    vector::push_back(&mut sides, false);

    let mut s = 0;
    while (s < 2) {
        let is_yes = *vector::borrow(&sides, s);
        let prices = if (is_yes) { &market.yes_bid_prices } else { &market.no_bid_prices };
        let table_ref = if (is_yes) { &market.yes_bids } else { &market.no_bids };
        let plen = vector::length(prices);
        let mut i = 0;
        while (i < plen) {
            let price = *vector::borrow(prices, i);
            if (table::contains(table_ref, price)) {
                let bucket = table::borrow(table_ref, price);
                let blen = vector::length(bucket);
                let mut j = 0;
                while (j < blen) {
                    let o = vector::borrow(bucket, j);
                    total = total + o.locked_nusdc;
                    j = j + 1;
                };
            };
            i = i + 1;
        };
        s = s + 1;
    };
    total
}
