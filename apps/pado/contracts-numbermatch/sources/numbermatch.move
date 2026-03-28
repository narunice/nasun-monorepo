/// Pado Number Match Module
/// Pick 1-3 numbers from 1-5, match the VRF-drawn winning number to win.
/// More picks = higher cost, higher win probability, lower multiplier.
/// Partial slashing: losers get 20% refund. RTP 80% uniform across all pick counts.
#[allow(unused_const)]
module numbermatch::numbermatch {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;

    // ===== Game Parameters =====

    const MIN_NUMBER: u8 = 1;              // Minimum pickable number
    const MAX_NUMBER: u8 = 5;              // Maximum pickable number (pool size = 5)
    const MAX_PICKS: u64 = 3;              // Maximum numbers a player can pick

    // Pricing: 5 NUSDC per pick (NUSDC has 6 decimals)
    const PRICE_PER_PICK: u64 = 5_000_000; // 5 NUSDC

    // Payout formula: win_payout = WIN_PAYOUT_BASE + picks * PAYOUT_PER_PICK
    //   Pick 1: 15 + 1 = 16 NUSDC (3.2x), Pick 2: 15 + 2 = 17 NUSDC (1.7x), Pick 3: 15 + 3 = 18 NUSDC (1.2x)
    // Loss refund formula: refund = picks * PAYOUT_PER_PICK
    //   Pick 1: 1 NUSDC, Pick 2: 2 NUSDC, Pick 3: 3 NUSDC (= 20% of cost)
    const WIN_PAYOUT_BASE: u64 = 15_000_000;  // 15 NUSDC base
    const PAYOUT_PER_PICK: u64 = 1_000_000;   // 1 NUSDC per pick (used for both win payout and loss refund)
    const MAX_PAYOUT: u64 = 18_000_000;        // 18 NUSDC (3 picks win = maximum single payout)

    // RTP verification (all pick counts yield 80%):
    //   Pick K: P(win)=K/5, win_payout=(15+K), refund=K, cost=5K
    //   EV = (K/5)*(15+K) + ((5-K)/5)*K = (K*15 + K^2 + 5K - K^2) / 5 = 20K/5 = 4K
    //   RTP = 4K / 5K = 80%

    // Pool safety
    const POOL_MIN_BALANCE: u64 = 500_000_000;    // 500 NUSDC (~28x MAX_PAYOUT)
    const POOL_LOW_THRESHOLD: u64 = 1_500_000_000; // 1500 NUSDC (3x POOL_MIN_BALANCE)

    // Rate limiting
    const MAX_DAILY_PLAYS: u64 = 1000;
    const MS_PER_DAY: u64 = 86_400_000;           // 24h in milliseconds (UTC midnight reset)

    // ===== Error Codes =====

    const EPaused: u64 = 0;
    const EInsufficientPayment: u64 = 1;
    const EPoolInsufficient: u64 = 2;
    const EDailyCapReached: u64 = 3;
    const EWithdrawExceedsBalance: u64 = 4;
    const EWithdrawBelowMinimum: u64 = 5;
    const EInvalidPickCount: u64 = 6;
    const ENumberOutOfRange: u64 = 7;
    const EDuplicateNumber: u64 = 8;

    // ===== Structs =====

    /// Admin capability for pool management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared game pool + global state
    public struct NumberMatchPool has key {
        id: UID,
        pool: Balance<NUSDC>,
        is_paused: bool,
        // Global daily play counter
        current_day: u64,
        daily_play_count: u64,
        // Statistics
        total_plays: u64,
        total_prizes_paid: u64,
        next_game_id: u64,
    }

    // ===== Events =====

    /// Emitted for every play (both wins and losses)
    public struct NumberMatchPlayed has copy, drop {
        game_id: u64,
        player: address,
        picks: vector<u8>,
        winning_number: u8,
        is_win: bool,
        cost: u64,
        payout: u64,  // win: win_payout amount, lose: refund amount
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

        let pool = NumberMatchPool {
            id: object::new(ctx),
            pool: balance::zero(),
            is_paused: true, // Start paused; admin must fund_pool then unpause
            current_day: 0,
            daily_play_count: 0,
            total_plays: 0,
            total_prizes_paid: 0,
            next_game_id: 0,
        };
        transfer::share_object(pool);
    }

    // ===== Core: Play Number Match =====

    // SECURITY: Must be entry-only (not public entry) to prevent selective reveal.
    // A malicious PTB could read the Random result and conditionally abort to only
    // accept winning outcomes. entry-only prevents cross-module composition.
    // Sui protocol also enforces single-MoveCall when &Random is used (defense-in-depth).
    entry fun play_game(
        pool: &mut NumberMatchPool,
        payment: Coin<NUSDC>,
        picks: vector<u8>,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        let num_picks = vector::length(&picks);

        // === Phase 1: Validation (abort allowed) ===

        assert!(!pool.is_paused, EPaused);

        // Pick count: 1-3
        assert!(num_picks >= 1 && num_picks <= MAX_PICKS, EInvalidPickCount);

        // Range + duplicate validation using boolean seen-vector
        // (lottery.move pattern: vector<bool> of size MAX_NUMBER+1, indices 0..MAX_NUMBER)
        let mut seen = vector::empty<bool>();
        let mut i: u64 = 0;
        while (i <= (MAX_NUMBER as u64)) {
            vector::push_back(&mut seen, false);
            i = i + 1;
        };

        let mut j: u64 = 0;
        while (j < num_picks) {
            let pick = *vector::borrow(&picks, j);
            assert!(pick >= MIN_NUMBER && pick <= MAX_NUMBER, ENumberOutOfRange);
            let pick_idx = (pick as u64);
            assert!(!*vector::borrow(&seen, pick_idx), EDuplicateNumber);
            *vector::borrow_mut(&mut seen, pick_idx) = true;
            j = j + 1;
        };

        // Cost calculation
        let cost = num_picks * PRICE_PER_PICK;
        assert!(coin::value(&payment) >= cost, EInsufficientPayment);

        // Daily cap check + reset
        let today = clock::timestamp_ms(clock) / MS_PER_DAY;
        if (pool.current_day != today) {
            pool.current_day = today;
            pool.daily_play_count = 0;
        };
        pool.daily_play_count = pool.daily_play_count + 1;
        assert!(pool.daily_play_count <= MAX_DAILY_PLAYS, EDailyCapReached);

        // === Phase 2: Payment + Solvency (abort allowed) ===

        // Absorb payment into pool (return change if overpaid)
        let payment_amount = coin::value(&payment);
        if (payment_amount == cost) {
            balance::join(&mut pool.pool, coin::into_balance(payment));
        } else {
            let mut payment_balance = coin::into_balance(payment);
            let exact_payment = balance::split(&mut payment_balance, cost);
            balance::join(&mut pool.pool, exact_payment);
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        };

        // Solvency check: pool must cover worst-case (win) payout
        // After payment absorbed, pool has old_balance + cost.
        // Max payout = WIN_PAYOUT_BASE + num_picks * PAYOUT_PER_PICK (16/17/18 NUSDC)
        let max_payout = WIN_PAYOUT_BASE + num_picks * PAYOUT_PER_PICK;
        assert!(balance::value(&pool.pool) >= max_payout, EPoolInsufficient);

        // === Phase 3: Random (NO ABORT after this point) ===

        let mut g = random::new_generator(r, ctx);
        // generate_u8_in_range returns value in [MIN_NUMBER, MAX_NUMBER] inclusive (5 outcomes)
        let winning_number = random::generate_u8_in_range(&mut g, MIN_NUMBER, MAX_NUMBER);

        // === Phase 4: Settlement (guaranteed no-abort, all ops succeed) ===
        // Phase 2 solvency ensures pool >= max_payout, so balance::split always succeeds.

        let is_win = vector::contains(&picks, &winning_number);

        let payout;
        if (is_win) {
            // Winner: pay (15 + picks) NUSDC from pool
            payout = WIN_PAYOUT_BASE + num_picks * PAYOUT_PER_PICK;
            let payout_balance = balance::split(&mut pool.pool, payout);
            let payout_coin = coin::from_balance(payout_balance, ctx);
            transfer::public_transfer(payout_coin, sender);
        } else {
            // Loser: refund picks NUSDC from pool (20% of cost)
            payout = num_picks * PAYOUT_PER_PICK;
            let refund_balance = balance::split(&mut pool.pool, payout);
            let refund_coin = coin::from_balance(refund_balance, ctx);
            transfer::public_transfer(refund_coin, sender);
        };

        // Statistics
        let game_id = pool.next_game_id;
        pool.next_game_id = pool.next_game_id + 1;
        pool.total_plays = pool.total_plays + 1;
        pool.total_prizes_paid = pool.total_prizes_paid + payout;

        // Emit play event
        event::emit(NumberMatchPlayed {
            game_id,
            player: sender,
            picks,
            winning_number,
            is_win,
            cost,
            payout,
        });

        // Pool low warning
        let pool_balance = balance::value(&pool.pool);
        if (pool_balance < POOL_LOW_THRESHOLD) {
            event::emit(PoolLow {
                current_balance: pool_balance,
                threshold: POOL_LOW_THRESHOLD,
            });
        };
    }

    // ===== Admin Functions =====

    /// Deposit NUSDC into the prize pool
    entry fun fund_pool(
        _admin: &AdminCap,
        pool: &mut NumberMatchPool,
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
        pool: &mut NumberMatchPool,
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
        pool: &mut NumberMatchPool,
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

    /// Pause or unpause the game
    entry fun set_paused(
        _admin: &AdminCap,
        pool: &mut NumberMatchPool,
        paused: bool,
    ) {
        pool.is_paused = paused;
    }

    // ===== View Functions =====

    /// Pool balance and status for frontend display
    public fun pool_info(pool: &NumberMatchPool): (u64, bool, u64, u64, u64) {
        (
            balance::value(&pool.pool),
            pool.is_paused,
            pool.total_plays,
            pool.total_prizes_paid,
            pool.daily_play_count,
        )
    }

    // ===== Tests =====

    #[test]
    fun test_rtp_all_picks() {
        // RTP = (win_rate * win_payout + loss_rate * loss_refund) / cost
        // For all pick counts K: EV = (K/5)*(15+K) + ((5-K)/5)*K = 20K/5 = 4K
        // RTP = 4K / 5K = 80% (= 8000 BPS)

        // Pick 1: win_rate=2000bps, win_payout=16M, loss_rate=8000bps, refund=1M, cost=5M
        let ev1 = (2000u64 * 16_000_000 + 8000u64 * 1_000_000) / 10000;
        assert!(ev1 == 4_000_000); // 4M = 5M * 80%

        // Pick 2: win_rate=4000bps, win_payout=17M, loss_rate=6000bps, refund=2M, cost=10M
        let ev2 = (4000u64 * 17_000_000 + 6000u64 * 2_000_000) / 10000;
        assert!(ev2 == 8_000_000); // 8M = 10M * 80%

        // Pick 3: win_rate=6000bps, win_payout=18M, loss_rate=4000bps, refund=3M, cost=15M
        let ev3 = (6000u64 * 18_000_000 + 4000u64 * 3_000_000) / 10000;
        assert!(ev3 == 12_000_000); // 12M = 15M * 80%
    }

    #[test]
    fun test_constants_consistency() {
        // MAX_PAYOUT must equal WIN_PAYOUT_BASE + MAX_PICKS * PAYOUT_PER_PICK
        assert!(MAX_PAYOUT == WIN_PAYOUT_BASE + MAX_PICKS * PAYOUT_PER_PICK);
        // POOL_MIN_BALANCE >= MAX_PAYOUT * 5 (5x buffer)
        assert!(POOL_MIN_BALANCE >= MAX_PAYOUT * 5);
        // POOL_LOW_THRESHOLD = 3 * POOL_MIN_BALANCE
        assert!(POOL_LOW_THRESHOLD == POOL_MIN_BALANCE * 3);
        // Number range consistency
        assert!((MAX_NUMBER as u64) - (MIN_NUMBER as u64) + 1 == 5); // pool size = 5
    }

    #[test]
    fun test_payout_no_overflow() {
        // Verify max cost and max payout fit in u64
        let max_cost = (MAX_PICKS as u128) * (PRICE_PER_PICK as u128);
        assert!(max_cost <= 18_446_744_073_709_551_615u128); // u64::MAX

        let max_payout = (WIN_PAYOUT_BASE as u128) + (MAX_PICKS as u128) * (PAYOUT_PER_PICK as u128);
        assert!(max_payout <= 18_446_744_073_709_551_615u128);
        assert!((max_payout as u64) == MAX_PAYOUT);
    }

    #[test]
    fun test_validate_picks() {
        // Valid picks should not trigger any issues in the seen-vector logic
        // We test the validation logic inline since it's not a separate function

        // Test: duplicate detection with seen vector
        let mut seen = vector::empty<bool>();
        let mut i: u64 = 0;
        while (i <= (MAX_NUMBER as u64)) {
            vector::push_back(&mut seen, false);
            i = i + 1;
        };

        // Pick 3 (valid)
        let pick_idx = 3u64;
        assert!(!*vector::borrow(&seen, pick_idx)); // not seen yet
        *vector::borrow_mut(&mut seen, pick_idx) = true;
        assert!(*vector::borrow(&seen, pick_idx));  // now seen

        // Pick 3 again (duplicate -- should be caught)
        assert!(*vector::borrow(&seen, pick_idx));  // already seen = duplicate

        // Pick 1 (valid, not seen)
        let pick_idx2 = 1u64;
        assert!(!*vector::borrow(&seen, pick_idx2));
    }

    #[test]
    fun test_solvency_invariant() {
        // After payment absorbed and solvency check passes:
        // pool_balance >= max_payout
        // Therefore balance::split(pool, payout) always succeeds for any outcome.

        // Worst case: 3 picks win = 18M payout
        let pool_after_payment = POOL_MIN_BALANCE + 3 * PRICE_PER_PICK; // 500M + 15M
        let max_payout_3 = WIN_PAYOUT_BASE + 3 * PAYOUT_PER_PICK;       // 18M
        assert!(pool_after_payment >= max_payout_3);

        // Even minimum pool (just above solvency threshold after payment):
        // With 3 picks: pool needs >= 18M after absorbing 15M payment
        // So pre-payment pool needs >= 18M - 15M = 3M (trivially met by POOL_MIN_BALANCE=500M)
        assert!(MAX_PAYOUT <= POOL_MIN_BALANCE);

        // Loss refund is always less than win payout, so if win payout works, refund works
        let max_refund = MAX_PICKS * PAYOUT_PER_PICK; // 3M
        assert!(max_refund < MAX_PAYOUT);
    }
}
