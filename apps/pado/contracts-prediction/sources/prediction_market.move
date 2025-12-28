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
    use pado::nusdc::NUSDC;

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

    // ===== Constants =====
    const DECIMALS: u64 = 6; // NUSDC decimals
    const PRICE_DECIMALS: u64 = 4; // Price in basis points (0-10000 = 0%-100%)
    const MAX_PRICE: u64 = 10000; // 100%

    // Market status
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLOSED: u8 = 1;
    const STATUS_RESOLVED: u8 = 2;

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
        assert!(tx_context::sender(ctx) == market.resolver, ENotResolver);
        assert!(clock::timestamp_ms(clock) >= market.close_time, EMarketNotClosed);

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
}
