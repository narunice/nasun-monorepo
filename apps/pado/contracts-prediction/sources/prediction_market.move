/// Prediction Market Module for Pado
/// Binary prediction markets (YES/NO outcomes)
/// NUSDC collateral, Admin resolution
module prediction::prediction_market {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::string::String;
    use devnet_tokens::nusdc::NUSDC;

    // ===== Error Codes =====
    const EMarketNotOpen: u64 = 0;
    const EMarketNotClosed: u64 = 1;
    const EMarketAlreadyResolved: u64 = 2;
    const ENotResolver: u64 = 3;
    const EMarketNotResolved: u64 = 4;
    const EWrongOutcome: u64 = 5;
    const EInsufficientBalance: u64 = 6;
    const EInvalidPrice: u64 = 7;
    const EOrderNotFound: u64 = 8;
    const ENotOrderOwner: u64 = 9;
    const EMarketExpired: u64 = 10;
    const ESelfTrade: u64 = 11;
    const EResolveDeadlinePassed: u64 = 12;
    const EMarketNotExpired: u64 = 13;
    const EMarketNotCancelled: u64 = 14;
    const EMarketAlreadyCancelled: u64 = 15;

    // ===== Constants =====
    const DECIMALS: u64 = 6; // NUSDC decimals
    const PRICE_DECIMALS: u64 = 4; // Price in basis points (0-10000 = 0%-100%)
    const MAX_PRICE: u64 = 10000; // 100%

    // Market status
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLOSED: u8 = 1;
    const STATUS_RESOLVED: u8 = 2;
    const STATUS_CANCELLED: u8 = 3;

    // ===== Structs =====

    /// Admin capability for creating markets
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Prediction Market
    public struct Market has key {
        id: UID,
        // Market info
        question: String,
        description: String,
        category: String,

        // Timing
        created_at: u64,
        close_time: u64,
        resolve_deadline: u64,

        // Collateral pool
        collateral_pool: Balance<NUSDC>,

        // Token supply tracking
        yes_supply: u64,
        no_supply: u64,

        // Order books (price -> orders)
        yes_bids: Table<u64, vector<Order>>,  // Buy YES orders
        yes_asks: Table<u64, vector<Order>>,  // Sell YES orders
        no_bids: Table<u64, vector<Order>>,   // Buy NO orders
        no_asks: Table<u64, vector<Order>>,   // Sell NO orders

        // Statistics
        total_volume: u64,

        // Status
        status: u8,
        outcome: Option<bool>, // true = YES wins, false = NO wins

        // Admin
        creator: address,
        resolver: address,
    }

    /// Order in the order book
    public struct Order has store, copy, drop {
        order_id: u64,
        owner: address,
        price: u64,      // In basis points (0-10000)
        amount: u64,     // Number of shares
        timestamp: u64,
    }

    /// Position NFT - represents YES or NO shares
    public struct Position has key, store {
        id: UID,
        market_id: ID,
        is_yes: bool,
        shares: u64,
        cost_basis: u64, // Total NUSDC spent
    }

    /// Global state for order ID generation
    public struct GlobalState has key {
        id: UID,
        next_order_id: u64,
    }

    // ===== Events =====

    public struct MarketCreated has copy, drop {
        market_id: ID,
        question: String,
        category: String,
        close_time: u64,
        creator: address,
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
    }

    public struct OrderFilled has copy, drop {
        market_id: ID,
        order_id: u64,
        maker: address,
        taker: address,
        is_yes: bool,
        price: u64,
        amount: u64,
    }

    public struct OrderCancelled has copy, drop {
        market_id: ID,
        order_id: u64,
        user: address,
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

    public struct CancelledRefundClaimed has copy, drop {
        market_id: ID,
        user: address,
        shares: u64,
        refund: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        // Create and transfer AdminCap to deployer
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx)
        );

        // Create global state
        transfer::share_object(GlobalState {
            id: object::new(ctx),
            next_order_id: 1,
        });
    }

    // ===== Admin Functions =====

    /// Create a new prediction market
    public entry fun create_market(
        _admin: &AdminCap,
        question: String,
        description: String,
        category: String,
        close_time: u64,
        resolve_deadline: u64,
        resolver: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let market = Market {
            id: object::new(ctx),
            question,
            description,
            category,
            created_at: clock::timestamp_ms(clock),
            close_time,
            resolve_deadline,
            collateral_pool: balance::zero(),
            yes_supply: 0,
            no_supply: 0,
            yes_bids: table::new(ctx),
            yes_asks: table::new(ctx),
            no_bids: table::new(ctx),
            no_asks: table::new(ctx),
            total_volume: 0,
            status: STATUS_OPEN,
            outcome: option::none(),
            creator: tx_context::sender(ctx),
            resolver,
        };

        event::emit(MarketCreated {
            market_id: object::id(&market),
            question: market.question,
            category: market.category,
            close_time,
            creator: market.creator,
        });

        transfer::share_object(market);
    }

    /// Resolve the market (only resolver can call)
    public entry fun resolve_market(
        market: &mut Market,
        outcome: bool,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(market.status != STATUS_RESOLVED, EMarketAlreadyResolved);
        assert!(market.status != STATUS_CANCELLED, EMarketAlreadyCancelled);
        assert!(tx_context::sender(ctx) == market.resolver, ENotResolver);
        assert!(clock::timestamp_ms(clock) >= market.close_time, EMarketNotClosed);
        assert!(clock::timestamp_ms(clock) <= market.resolve_deadline, EResolveDeadlinePassed);

        market.status = STATUS_RESOLVED;
        market.outcome = option::some(outcome);

        event::emit(MarketResolved {
            market_id: object::id(market),
            outcome,
            resolver: market.resolver,
        });
    }

    // ===== User Functions =====

    /// Mint YES and NO tokens by depositing NUSDC
    /// 1 NUSDC = 1 YES + 1 NO (always minted in pairs)
    public entry fun mint_outcome_tokens(
        market: &mut Market,
        payment: Coin<NUSDC>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(market.status == STATUS_OPEN, EMarketNotOpen);
        assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);

        let amount = coin::value(&payment);
        let sender = tx_context::sender(ctx);

        // Add collateral to pool
        balance::join(&mut market.collateral_pool, coin::into_balance(payment));

        // Update supply
        market.yes_supply = market.yes_supply + amount;
        market.no_supply = market.no_supply + amount;

        // Create YES position
        let yes_position = Position {
            id: object::new(ctx),
            market_id: object::id(market),
            is_yes: true,
            shares: amount,
            cost_basis: amount,
        };

        // Create NO position
        let no_position = Position {
            id: object::new(ctx),
            market_id: object::id(market),
            is_yes: false,
            shares: amount,
            cost_basis: amount,
        };

        event::emit(TokensMinted {
            market_id: object::id(market),
            user: sender,
            amount,
        });

        transfer::transfer(yes_position, sender);
        transfer::transfer(no_position, sender);
    }

    /// Place a limit order to buy outcome tokens
    public entry fun place_bid_order(
        market: &mut Market,
        state: &mut GlobalState,
        is_yes: bool,
        price: u64,  // Price in basis points (e.g., 6500 = 65%)
        payment: Coin<NUSDC>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(market.status == STATUS_OPEN, EMarketNotOpen);
        assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
        assert!(price > 0 && price < MAX_PRICE, EInvalidPrice);

        let amount = coin::value(&payment);
        let shares = (amount * MAX_PRICE) / price; // Calculate shares from payment
        let sender = tx_context::sender(ctx);

        // Store payment in collateral pool temporarily
        balance::join(&mut market.collateral_pool, coin::into_balance(payment));

        let order = Order {
            order_id: state.next_order_id,
            owner: sender,
            price,
            amount: shares,
            timestamp: clock::timestamp_ms(clock),
        };

        state.next_order_id = state.next_order_id + 1;

        // Add to appropriate order book
        let bids = if (is_yes) { &mut market.yes_bids } else { &mut market.no_bids };
        if (!table::contains(bids, price)) {
            table::add(bids, price, vector::empty());
        };
        let orders = table::borrow_mut(bids, price);
        vector::push_back(orders, order);

        event::emit(OrderPlaced {
            market_id: object::id(market),
            order_id: order.order_id,
            user: sender,
            is_yes,
            is_bid: true,
            price,
            amount: shares,
        });
    }

    /// Place a limit order to sell outcome tokens
    public entry fun place_ask_order(
        market: &mut Market,
        state: &mut GlobalState,
        position: Position,
        price: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(market.status == STATUS_OPEN, EMarketNotOpen);
        assert!(clock::timestamp_ms(clock) < market.close_time, EMarketExpired);
        assert!(price > 0 && price < MAX_PRICE, EInvalidPrice);
        assert!(position.market_id == object::id(market), EWrongOutcome);

        let Position { id, market_id: _, is_yes, shares, cost_basis: _ } = position;
        object::delete(id);

        let sender = tx_context::sender(ctx);

        let order = Order {
            order_id: state.next_order_id,
            owner: sender,
            price,
            amount: shares,
            timestamp: clock::timestamp_ms(clock),
        };

        state.next_order_id = state.next_order_id + 1;

        // Add to appropriate order book
        let asks = if (is_yes) { &mut market.yes_asks } else { &mut market.no_asks };
        if (!table::contains(asks, price)) {
            table::add(asks, price, vector::empty());
        };
        let orders = table::borrow_mut(asks, price);
        vector::push_back(orders, order);

        event::emit(OrderPlaced {
            market_id: object::id(market),
            order_id: order.order_id,
            user: sender,
            is_yes,
            is_bid: false,
            price,
            amount: shares,
        });
    }

    /// Claim winnings after market resolution
    public entry fun claim_winnings(
        market: &mut Market,
        position: Position,
        ctx: &mut TxContext
    ) {
        assert!(market.status == STATUS_RESOLVED, EMarketNotResolved);
        assert!(position.market_id == object::id(market), EWrongOutcome);

        let winning_outcome = *option::borrow(&market.outcome);
        assert!(position.is_yes == winning_outcome, EWrongOutcome);

        let Position { id, market_id: _, is_yes: _, shares, cost_basis: _ } = position;
        object::delete(id);

        let sender = tx_context::sender(ctx);

        // Each winning share = 1 NUSDC
        let payout = shares;
        let payout_balance = balance::split(&mut market.collateral_pool, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        event::emit(WinningsClaimed {
            market_id: object::id(market),
            user: sender,
            shares,
            payout,
        });

        transfer::public_transfer(payout_coin, sender);
    }

    // ===== Market Cancellation (resolve_deadline expired) =====

    /// Cancel a market that passed its resolve_deadline without resolution.
    /// Permissionless: anyone can call after deadline expires.
    /// After cancellation, position holders can claim pro-rata refunds.
    public entry fun cancel_expired_market(
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

    /// Claim pro-rata refund from a cancelled market.
    /// Refund is proportional to shares held relative to total outstanding supply.
    /// Uses shares-based pro-rata (not cost_basis) to prevent pool insolvency
    /// when positions have been traded on the secondary orderbook.
    public entry fun claim_cancelled_refund(
        market: &mut Market,
        position: Position,
        ctx: &mut TxContext
    ) {
        assert!(market.status == STATUS_CANCELLED, EMarketNotCancelled);
        assert!(position.market_id == object::id(market), EWrongOutcome);

        let pool_balance = balance::value(&market.collateral_pool);
        let total_shares = market.yes_supply + market.no_supply;

        let refund_amount = if (total_shares > 0) {
            ((position.shares as u128) * (pool_balance as u128) / (total_shares as u128)) as u64
        } else {
            0
        };

        // Decrement supply tracking
        if (position.is_yes) {
            market.yes_supply = market.yes_supply - position.shares;
        } else {
            market.no_supply = market.no_supply - position.shares;
        };

        // Destroy position
        let Position { id, market_id: _, is_yes: _, shares, cost_basis: _ } = position;
        object::delete(id);

        if (refund_amount > 0) {
            let refund_balance = balance::split(&mut market.collateral_pool, refund_amount);
            let refund_coin = coin::from_balance(refund_balance, ctx);
            let sender = tx_context::sender(ctx);

            event::emit(CancelledRefundClaimed {
                market_id: object::id(market),
                user: sender,
                shares,
                refund: refund_amount,
            });

            transfer::public_transfer(refund_coin, sender);
        };
    }

    /// Burn losing positions (optional, for cleanup)
    public entry fun burn_losing_position(
        market: &Market,
        position: Position,
    ) {
        assert!(market.status == STATUS_RESOLVED, EMarketNotResolved);
        assert!(position.market_id == object::id(market), EWrongOutcome);

        let winning_outcome = *option::borrow(&market.outcome);
        assert!(position.is_yes != winning_outcome, EWrongOutcome); // Must be losing position

        let Position { id, market_id: _, is_yes: _, shares: _, cost_basis: _ } = position;
        object::delete(id);
    }

    // ===== View Functions =====

    public fun get_market_status(market: &Market): u8 {
        market.status
    }

    public fun get_market_outcome(market: &Market): Option<bool> {
        market.outcome
    }

    public fun get_yes_supply(market: &Market): u64 {
        market.yes_supply
    }

    public fun get_no_supply(market: &Market): u64 {
        market.no_supply
    }

    public fun get_collateral_balance(market: &Market): u64 {
        balance::value(&market.collateral_pool)
    }

    public fun get_position_shares(position: &Position): u64 {
        position.shares
    }

    public fun is_position_yes(position: &Position): bool {
        position.is_yes
    }

    // ===== Test Functions =====
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    // ===== Unit Tests =====

    #[test]
    fun test_pro_rata_refund_math() {
        // Pool = 1000 NUSDC, total_shares = 200 (100 YES + 100 NO)
        // User has 50 shares
        let pool_balance: u128 = 1_000_000_000; // 1000 NUSDC
        let total_shares: u128 = 200_000_000;    // 200 shares
        let user_shares: u128 = 50_000_000;      // 50 shares

        let refund = (user_shares * pool_balance / total_shares) as u64;
        // 50/200 * 1000 = 250 NUSDC
        assert!(refund == 250_000_000);
    }

    #[test]
    fun test_pro_rata_refund_preserves_total() {
        // Verify sequential claims preserve ratio (no over/under-payment)
        let pool: u128 = 1_000_000;
        let total: u128 = 300;

        // User A: 100 shares
        let refund_a = (100u128 * pool / total) as u64;
        let pool_after_a = pool - (refund_a as u128);
        let total_after_a = total - 100;

        // User B: 100 shares (from remaining)
        let refund_b = (100u128 * pool_after_a / total_after_a) as u64;
        let pool_after_b = pool_after_a - (refund_b as u128);
        let total_after_b = total_after_a - 100;

        // User C: 100 shares (last)
        let refund_c = (100u128 * pool_after_b / total_after_b) as u64;

        // All should get equal amounts (within 1 unit rounding tolerance)
        // Integer division may cause last claimer to get slightly different amount
        let max_diff = 1u64;
        let diff_ab = if (refund_a >= refund_b) { refund_a - refund_b } else { refund_b - refund_a };
        let diff_bc = if (refund_b >= refund_c) { refund_b - refund_c } else { refund_c - refund_b };
        assert!(diff_ab <= max_diff);
        assert!(diff_bc <= max_diff);
        // Total refunds should not exceed pool
        assert!((refund_a as u128) + (refund_b as u128) + (refund_c as u128) <= pool);
    }

    #[test]
    fun test_pro_rata_zero_shares() {
        let pool_balance: u128 = 1_000_000;
        let total_shares: u128 = 100;
        let user_shares: u128 = 0;

        let refund = if (total_shares > 0) {
            (user_shares * pool_balance / total_shares) as u64
        } else { 0 };
        assert!(refund == 0);
    }

    #[test]
    fun test_status_constants() {
        assert!(STATUS_OPEN == 0);
        assert!(STATUS_CLOSED == 1);
        assert!(STATUS_RESOLVED == 2);
        assert!(STATUS_CANCELLED == 3);
    }
}
