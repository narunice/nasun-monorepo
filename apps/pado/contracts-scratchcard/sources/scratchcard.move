/// Pado Instant Scratch Card Module
/// Buy a card, get instant random result, win prizes up to 100x
/// Uses sui::random VRF for provably fair outcomes
#[allow(unused_const)]
module scratchcard::scratchcard {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;

    // ===== Constants =====

    // Card pricing (NUSDC has 6 decimals)
    const CARD_PRICE: u64 = 1_000_000;          // 1 NUSDC
    const MAX_MULTIPLIER: u64 = 100;             // 100x max
    const MAX_PRIZE: u64 = 100_000_000;          // 100 NUSDC = CARD_PRICE * MAX_MULTIPLIER

    // Pool safety (5x buffer for concurrent max-prize wins)
    const POOL_MIN_BALANCE: u64 = 500_000_000;   // 500 NUSDC = MAX_PRIZE * 5

    // Daily global card cap (initial launch value, upgrade to increase)
    const MAX_DAILY_CARDS: u64 = 1000;
    const MS_PER_DAY: u64 = 86_400_000;          // 24h in milliseconds (UTC midnight reset)

    // Prize table thresholds (descending check on u16 range 0-9999)
    // Contiguous ranges, no gaps
    const THRESHOLD_100X: u16 = 9995;   // 9995-9999 = 5 slots = 0.05%
    const THRESHOLD_50X: u16 = 9980;    // 9980-9994 = 15 slots = 0.15%
    const THRESHOLD_20X: u16 = 9900;    // 9900-9979 = 80 slots = 0.80%
    const THRESHOLD_10X: u16 = 9750;    // 9750-9899 = 150 slots = 1.50%
    const THRESHOLD_5X: u16 = 9450;     // 9450-9749 = 300 slots = 3.00%
    const THRESHOLD_2X: u16 = 9050;     // 9050-9449 = 400 slots = 4.00%
    const THRESHOLD_1X: u16 = 7500;     // 7500-9049 = 1550 slots = 15.50%
    // 0-7499 = 7500 slots = 75.00% (lose)
    // RTP = 0.155 + 0.08 + 0.15 + 0.15 + 0.16 + 0.075 + 0.05 = 0.82 (82%)

    // PoolLow warning threshold (3x of POOL_MIN_BALANCE)
    const POOL_LOW_THRESHOLD: u64 = 1_500_000_000; // 1500 NUSDC

    // ===== Error Codes =====
    const EPaused: u64 = 0;
    const EInsufficientPayment: u64 = 1;
    const EPoolInsufficient: u64 = 2;
    const EDailyCapReached: u64 = 3;
    const EWithdrawExceedsBalance: u64 = 4;
    const EWithdrawBelowMinimum: u64 = 5;

    // ===== Structs =====

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared prize pool + global state
    public struct ScratchCardPool has key {
        id: UID,
        pool: Balance<NUSDC>,
        is_paused: bool,
        // Global daily card counter
        current_day: u64,
        daily_card_count: u64,
        // Statistics
        total_cards_sold: u64,
        total_prizes_paid: u64,
        next_card_id: u64,
    }

    /// Winner scratch card NFT (only created for winners)
    public struct ScratchCard has key, store {
        id: UID,
        card_id: u64,
        purchase_time: u64,
        multiplier: u64,
        prize_amount: u64,
    }

    // ===== Events =====

    public struct ScratchCardPurchased has copy, drop {
        card_id: u64,
        buyer: address,
        multiplier: u64,
        prize_amount: u64,
    }

    public struct PoolFunded has copy, drop {
        funder: address,
        amount: u64,
        new_balance: u64,
    }

    public struct PoolWithdrawn has copy, drop {
        amount: u64,
        recipient: address,
        remaining_balance: u64,
    }

    public struct EmergencyWithdraw has copy, drop {
        amount: u64,
        recipient: address,
    }

    public struct PoolLow has copy, drop {
        current_balance: u64,
        threshold: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let admin = AdminCap { id: object::new(ctx) };
        transfer::transfer(admin, ctx.sender());

        let pool = ScratchCardPool {
            id: object::new(ctx),
            pool: balance::zero(),
            is_paused: true, // Start paused; admin must fund_pool then unpause
            current_day: 0,
            daily_card_count: 0,
            total_cards_sold: 0,
            total_prizes_paid: 0,
            next_card_id: 0,
        };
        transfer::share_object(pool);
    }

    // ===== Core: Buy Scratch Card =====

    // SECURITY: Must be entry-only to prevent selective reveal via PTB composition.
    // (1) entry-only prevents cross-module composition
    // (2) Sui protocol enforces single-MoveCall when Random is used
    entry fun buy_scratch_card(
        pool: &mut ScratchCardPool,
        payment: Coin<NUSDC>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();

        // === Phase 1: Pre-random validation (fail fast) ===
        assert!(!pool.is_paused, EPaused);
        assert!(coin::value(&payment) >= CARD_PRICE, EInsufficientPayment);

        // Global daily cap check + reset
        let today = clock::timestamp_ms(clock) / MS_PER_DAY;
        if (pool.current_day != today) {
            pool.current_day = today;
            pool.daily_card_count = 0;
        };
        pool.daily_card_count = pool.daily_card_count + 1;
        assert!(pool.daily_card_count <= MAX_DAILY_CARDS, EDailyCapReached);

        // Pool solvency check (5x buffer)
        assert!(balance::value(&pool.pool) >= POOL_MIN_BALANCE, EPoolInsufficient);

        // === Phase 2: Payment processing (before random) ===
        let payment_amount = coin::value(&payment);
        if (payment_amount == CARD_PRICE) {
            balance::join(&mut pool.pool, coin::into_balance(payment));
        } else {
            // Split exact amount, return change (avoid 0-value coin)
            let mut payment_balance = coin::into_balance(payment);
            let card_payment = balance::split(&mut payment_balance, CARD_PRICE);
            balance::join(&mut pool.pool, card_payment);
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        };

        // === Phase 3: Random + result (no abort after this point) ===
        let mut g = random::new_generator(r, ctx);
        let roll = random::generate_u16_in_range(&mut g, 0, 9999);
        let multiplier = get_multiplier(roll);
        let prize_amount = CARD_PRICE * multiplier;

        // === Phase 4: Payout + record ===
        let card_id = pool.next_card_id;
        pool.next_card_id = pool.next_card_id + 1;
        pool.total_cards_sold = pool.total_cards_sold + 1;

        if (multiplier > 0) {
            // Winner: pay prize + create NFT
            let prize_balance = balance::split(&mut pool.pool, prize_amount);
            let prize_coin = coin::from_balance(prize_balance, ctx);
            transfer::public_transfer(prize_coin, sender);

            pool.total_prizes_paid = pool.total_prizes_paid + prize_amount;

            let card = ScratchCard {
                id: object::new(ctx),
                card_id,
                purchase_time: clock::timestamp_ms(clock),
                multiplier,
                prize_amount,
            };
            transfer::public_transfer(card, sender);
        };
        // Losers: no NFT, only event

        // Emit purchase event (both wins and losses)
        event::emit(ScratchCardPurchased {
            card_id,
            buyer: sender,
            multiplier,
            prize_amount,
        });

        // Emit pool low warning if needed
        let pool_balance = balance::value(&pool.pool);
        if (pool_balance < POOL_LOW_THRESHOLD) {
            event::emit(PoolLow {
                current_balance: pool_balance,
                threshold: POOL_LOW_THRESHOLD,
            });
        };
    }

    // ===== Prize Table Lookup =====

    /// Descending threshold check. Hardcoded for auditability.
    fun get_multiplier(roll: u16): u64 {
        if (roll >= THRESHOLD_100X) 100
        else if (roll >= THRESHOLD_50X) 50
        else if (roll >= THRESHOLD_20X) 20
        else if (roll >= THRESHOLD_10X) 10
        else if (roll >= THRESHOLD_5X) 5
        else if (roll >= THRESHOLD_2X) 2
        else if (roll >= THRESHOLD_1X) 1
        else 0
    }

    // ===== Admin Functions =====

    /// Deposit NUSDC into the prize pool
    entry fun fund_pool(
        _admin: &AdminCap,
        pool: &mut ScratchCardPool,
        funds: Coin<NUSDC>,
        ctx: &TxContext,
    ) {
        let amount = coin::value(&funds);
        balance::join(&mut pool.pool, coin::into_balance(funds));

        event::emit(PoolFunded {
            funder: ctx.sender(),
            amount,
            new_balance: balance::value(&pool.pool),
        });
    }

    /// Withdraw excess funds from pool (must leave >= POOL_MIN_BALANCE)
    entry fun withdraw_pool(
        _admin: &AdminCap,
        pool: &mut ScratchCardPool,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        let current_balance = balance::value(&pool.pool);
        assert!(current_balance >= amount, EWithdrawExceedsBalance);
        assert!(current_balance - amount >= POOL_MIN_BALANCE, EWithdrawBelowMinimum);

        let withdrawn = balance::split(&mut pool.pool, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        let recipient = ctx.sender();
        transfer::public_transfer(coin, recipient);

        event::emit(PoolWithdrawn {
            amount,
            recipient,
            remaining_balance: balance::value(&pool.pool),
        });
    }

    /// Emergency: withdraw all funds and auto-pause
    entry fun emergency_withdraw_all(
        _admin: &AdminCap,
        pool: &mut ScratchCardPool,
        ctx: &mut TxContext,
    ) {
        pool.is_paused = true;

        let amount = balance::value(&pool.pool);
        if (amount > 0) {
            let withdrawn = balance::split(&mut pool.pool, amount);
            let coin = coin::from_balance(withdrawn, ctx);
            let recipient = ctx.sender();
            transfer::public_transfer(coin, recipient);

            event::emit(EmergencyWithdraw { amount, recipient });
        };
    }

    /// Pause or unpause the scratch card game
    entry fun set_paused(
        _admin: &AdminCap,
        pool: &mut ScratchCardPool,
        paused: bool,
    ) {
        pool.is_paused = paused;
    }

    // ===== View Functions =====

    /// Returns the full prize table for on-chain auditing.
    /// Each pair (threshold, multiplier) means: roll >= threshold yields that multiplier.
    /// Roll values below the lowest threshold (7500) yield 0x (lose).
    public fun get_prize_table(): (vector<u16>, vector<u64>) {
        let thresholds = vector[
            THRESHOLD_1X, THRESHOLD_2X, THRESHOLD_5X, THRESHOLD_10X,
            THRESHOLD_20X, THRESHOLD_50X, THRESHOLD_100X,
        ];
        let multipliers = vector[1, 2, 5, 10, 20, 50, 100];
        (thresholds, multipliers)
    }

    /// Pool balance and status for frontend display
    public fun pool_info(pool: &ScratchCardPool): (u64, bool, u64, u64, u64) {
        (
            balance::value(&pool.pool),
            pool.is_paused,
            pool.total_cards_sold,
            pool.total_prizes_paid,
            pool.daily_card_count,
        )
    }

    // ===== Tests =====

    #[test]
    fun test_prize_table_ev() {
        // EV = SUM(range_size / 10000 * multiplier)
        // 1x: 1550/10000 * 1 = 0.155
        // 2x: 400/10000 * 2 = 0.08
        // 5x: 300/10000 * 5 = 0.15
        // 10x: 150/10000 * 10 = 0.15
        // 20x: 80/10000 * 20 = 0.16
        // 50x: 15/10000 * 50 = 0.075
        // 100x: 5/10000 * 100 = 0.05
        // Total = 0.82 (RTP 82%, house edge 18%)
        let ev_bps: u64 = 0 + 1550 + 800 + 1500 + 1500 + 1600 + 750 + 500;
        assert!(ev_bps == 8200); // Exact EV = 82.00%
        assert!(ev_bps < 10000); // House always wins on average
    }

    #[test]
    fun test_threshold_coverage() {
        // Verify all 10000 outcomes are mapped correctly with no gaps
        assert!(get_multiplier(0) == 0);         // First lose
        assert!(get_multiplier(7499) == 0);       // Last lose
        assert!(get_multiplier(7500) == 1);       // First 1x
        assert!(get_multiplier(9049) == 1);       // Last 1x
        assert!(get_multiplier(9050) == 2);       // First 2x
        assert!(get_multiplier(9449) == 2);       // Last 2x
        assert!(get_multiplier(9450) == 5);       // First 5x
        assert!(get_multiplier(9749) == 5);       // Last 5x
        assert!(get_multiplier(9750) == 10);      // First 10x
        assert!(get_multiplier(9899) == 10);      // Last 10x
        assert!(get_multiplier(9900) == 20);      // First 20x
        assert!(get_multiplier(9979) == 20);      // Last 20x
        assert!(get_multiplier(9980) == 50);      // First 50x
        assert!(get_multiplier(9994) == 50);      // Last 50x
        assert!(get_multiplier(9995) == 100);     // First 100x
        assert!(get_multiplier(9999) == 100);     // Last 100x (max roll)
    }

    #[test]
    fun test_max_prize_no_overflow() {
        // Verify CARD_PRICE * MAX_MULTIPLIER does not overflow u64
        let prize = (CARD_PRICE as u128) * (MAX_MULTIPLIER as u128);
        assert!(prize <= 18_446_744_073_709_551_615u128); // u64::MAX
        assert!((prize as u64) == MAX_PRIZE);
    }

    #[test]
    fun test_constants_consistency() {
        // MAX_PRIZE must equal CARD_PRICE * MAX_MULTIPLIER
        assert!(MAX_PRIZE == CARD_PRICE * MAX_MULTIPLIER);
        // POOL_MIN_BALANCE must be 5x MAX_PRIZE
        assert!(POOL_MIN_BALANCE == MAX_PRIZE * 5);
        // POOL_LOW_THRESHOLD must be 3x POOL_MIN_BALANCE
        assert!(POOL_LOW_THRESHOLD == POOL_MIN_BALANCE * 3);
    }
}
