/// GoStop Lottery Module
///
/// Weekly lottery on Nasun devnet with 5-of-25 number selection.
/// Range was 5-of-32 in v1/v2 (C=201,376) but recalibrated to 5-of-25
/// (C=53,130) in v3 for ~3.8x higher jackpot frequency at prototype
/// traffic levels. Tier payout BPS unchanged.
/// NUSDC collateral (shared Nasun ecosystem token), sui::random for fair draws.
/// Settle flow forwards the 10% treasury portion directly to the shared
/// gostop BankrollPool, so LPs benefit pro-rata from lottery house edge.
///
/// Round cadence (set by keeper): close every Sunday 24:00 UTC (Monday
/// 00:00 UTC); draw + settle + new round immediately after.
module gostop_lottery::lottery {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap};

    // ===== Constants =====
    const NUMBERS_COUNT: u64 = 5;           // Numbers to select
    const MAX_NUMBER: u8 = 25;              // Range: 1-25
    const TICKET_PRICE: u64 = 5_000_000; // 5 NUSDC (6 decimals), same as Pado lottery
    const MAX_TICKETS_PER_ADDRESS: u64 = 500;

    // Prize distribution (basis points, total = 10000)
    const PRIZE_POOL_BPS: u64 = 7000;       // 70% to winners
    const ROLLOVER_BPS: u64 = 2000;         // 20% to next round
    const TREASURY_BPS: u64 = 1000;         // 10% to BankrollPool treasury

    // Tier split within the 70% prize pool
    const TIER1_BPS: u64 = 6000;            // Jackpot (5 match): 60% of 70%
    const TIER2_BPS: u64 = 2500;            // 2nd (4 match):    25% of 70%
    const TIER3_BPS: u64 = 1500;            // 3rd (3 match):    15% of 70%

    // Prize tier identifiers
    const TIER_NONE: u8 = 0;
    const TIER_JACKPOT: u8 = 1;             // 5 numbers match
    const TIER_SECOND: u8 = 2;              // 4 numbers match
    const TIER_THIRD: u8 = 3;               // 3 numbers match

    // Round status
    const STATUS_OPEN: u8 = 0;
    const STATUS_CLOSED: u8 = 1;
    const STATUS_DRAWN: u8 = 2;
    const STATUS_SETTLED: u8 = 3;

    // Game id used when depositing treasury into BankrollPool
    const GAME_ID_LOTTERY: u8 = 1;

    /// Deadline after which unclaimed winning tickets forfeit their prize.
    /// Counted from round.draw_time. Any NUSDC still in round.prize_pool after
    /// this window can be permissionlessly swept into the gostop BankrollPool
    /// (so LPs ultimately receive unclaimed prizes rather than leaving them
    /// stranded).
    const CLAIM_WINDOW_MS: u64 = 30 * 24 * 60 * 60 * 1000; // 30 days
    /// Buffer between claim deadline and earliest sweep. Closes the
    /// same-block race where a user submits claim_prize at exactly
    /// draw_time + CLAIM_WINDOW_MS while a keeper submits sweep.
    const SWEEP_GRACE_MS: u64 = 1 * 60 * 60 * 1000; // 1 hour

    // ===== Error Codes =====
    const ERoundNotOpen: u64 = 0;
    const ERoundNotClosed: u64 = 1;
    const ERoundNotDrawn: u64 = 2;
    const EInvalidNumbers: u64 = 4;
    const EDuplicateNumber: u64 = 5;
    const EAlreadyClaimed: u64 = 7;
    const ENotWinner: u64 = 8;
    const ETicketLimitExceeded: u64 = 9;
    const EInsufficientPayment: u64 = 10;
    const EWrongRound: u64 = 11;
    const ERoundNotSettled: u64 = 12;
    const ENumberOutOfRange: u64 = 13;
    const EWrongNumberCount: u64 = 14;
    const ERoundExpired: u64 = 15;
    const ECloseTimeNotReached: u64 = 16;
    const EDrawTimeNotReached: u64 = 17;
    const ENotPrizeWinner: u64 = 18;
    const ERoundNotSettledForTransfer: u64 = 19;
    const ETargetRoundNotOpen: u64 = 20;
    const EClaimWindowExpired: u64 = 21;    // claim_prize: deadline passed
    const EClaimWindowNotReached: u64 = 22; // sweep_unclaimed: too early
    const ECloseTimeInPast: u64 = 23;
    const EDrawTimeBeforeClose: u64 = 24;
    const EDrawTimeTooFar: u64 = 25;
    const EGameCapAlreadyInstalled: u64 = 26;
    const EGameCapNotInstalled: u64 = 27;
    const EGameCapMismatch: u64 = 28;

    // Sanity: draw must happen within 7 days of close.
    const MAX_DRAW_DELAY_MS: u64 = 7 * 24 * 60 * 60 * 1000;
    // Game id for the bankroll pool GameCap assigned to this lottery.
    const GAME_ID_SELF: u8 = 1;

    // ===== Structs =====

    public struct AdminCap has key, store {
        id: UID,
    }

    /// Global registry (shared). Treasury no longer held here; it flows
    /// directly to BankrollPool at settle time via the installed GameCap.
    public struct LotteryRegistry has key {
        id: UID,
        current_round: u64,
        next_ticket_id: u64,
        /// GameCap issued by bankroll_pool and installed by admin after
        /// both packages are deployed. Required for settle/sweep.
        game_cap: Option<GameCap>,
    }

    /// Lottery round (shared)
    public struct LotteryRound has key {
        id: UID,
        round_number: u64,
        status: u8,

        // Timing (milliseconds)
        start_time: u64,
        close_time: u64,
        draw_time: u64,

        // Prize pool
        prize_pool: Balance<NUSDC>,
        rollover_in: u64,
        /// Total payout obligation to winners (decremented on each claim).
        /// Used by sweep_unclaimed_to_bankroll to forfeit only the unclaimed
        /// winner portion, never the rollover destined for the next round.
        obligated_amount: u64,
        drawn_numbers: Option<vector<u8>>,

        // Statistics
        ticket_count: u64,
        total_sales: u64,

        // Multi-tier winner tracking
        tier1_winners: u64,
        tier2_winners: u64,
        tier3_winners: u64,
        tier1_payout_per_winner: u64,
        tier2_payout_per_winner: u64,
        tier3_payout_per_winner: u64,

        tier1_rollover_out: u64,
        tier2_rollover_out: u64,
        tier3_rollover_out: u64,

        tickets_by_address: Table<address, u64>,
    }

    /// Ticket NFT (owned)
    public struct Ticket has key, store {
        id: UID,
        ticket_id: u64,
        round_id: ID,
        round_number: u64,
        owner: address,
        numbers: vector<u8>,
        purchase_time: u64,
    }

    // ===== Events =====

    public struct RoundCreated has copy, drop {
        round_id: ID,
        round_number: u64,
        close_time: u64,
        draw_time: u64,
        rollover_in: u64,
    }

    public struct TicketPurchased has copy, drop {
        round_id: ID,
        round_number: u64,
        ticket_id: u64,
        buyer: address,
        numbers: vector<u8>,
        amount: u64,
    }

    public struct RoundClosed has copy, drop {
        round_id: ID,
        round_number: u64,
        ticket_count: u64,
        total_sales: u64,
    }

    public struct NumbersDrawn has copy, drop {
        round_id: ID,
        round_number: u64,
        drawn_numbers: vector<u8>,
    }

    public struct RoundSettled has copy, drop {
        round_id: ID,
        round_number: u64,
        tier1_winners: u64,
        tier2_winners: u64,
        tier3_winners: u64,
        tier1_payout: u64,
        tier2_payout: u64,
        tier3_payout: u64,
        base_rollover: u64,
        obligated_amount: u64,
        tier1_rollover: u64,
        tier2_rollover: u64,
        tier3_rollover: u64,
        treasury_amount: u64,
    }

    public struct PrizeClaimed has copy, drop {
        round_id: ID,
        round_number: u64,
        ticket_id: u64,
        winner: address,
        tier: u8,
        match_count: u64,
        amount: u64,
    }

    /// Unclaimed prize pool forfeited to the gostop BankrollPool after
    /// CLAIM_WINDOW_MS has elapsed since draw_time.
    public struct UnclaimedSwept has copy, drop {
        round_id: ID,
        round_number: u64,
        amount: u64,
        swept_at: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        transfer::transfer(AdminCap { id: object::new(ctx) }, sender);
        transfer::share_object(LotteryRegistry {
            id: object::new(ctx),
            current_round: 0,
            next_ticket_id: 1,
            game_cap: option::none(),
        });
    }

    // ===== Admin Functions =====

    /// One-time install of the bankroll_pool GameCap issued to this lottery.
    /// Must be called after both packages are deployed and admin has the cap.
    public entry fun install_game_cap(
        _admin: &AdminCap,
        registry: &mut LotteryRegistry,
        cap: GameCap,
    ) {
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    /// Create a new lottery round. Keeper computes close_time/draw_time to
    /// align with Monday 00:00 UTC cadence.
    public entry fun create_round(
        _admin: &AdminCap,
        registry: &mut LotteryRegistry,
        close_time: u64,
        draw_time: u64,
        rollover_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let now = clock::timestamp_ms(clock);
        assert!(close_time > now, ECloseTimeInPast);
        assert!(draw_time >= close_time, EDrawTimeBeforeClose);
        assert!(draw_time <= close_time + MAX_DRAW_DELAY_MS, EDrawTimeTooFar);

        registry.current_round = registry.current_round + 1;
        let round_number = registry.current_round;

        let round = LotteryRound {
            id: object::new(ctx),
            round_number,
            status: STATUS_OPEN,
            start_time: clock::timestamp_ms(clock),
            close_time,
            draw_time,
            prize_pool: balance::zero(),
            rollover_in: rollover_amount,
            obligated_amount: 0,
            drawn_numbers: option::none(),
            ticket_count: 0,
            total_sales: 0,
            tier1_winners: 0,
            tier2_winners: 0,
            tier3_winners: 0,
            tier1_payout_per_winner: 0,
            tier2_payout_per_winner: 0,
            tier3_payout_per_winner: 0,
            tier1_rollover_out: 0,
            tier2_rollover_out: 0,
            tier3_rollover_out: 0,
            tickets_by_address: table::new(ctx),
        };

        event::emit(RoundCreated {
            round_id: object::id(&round),
            round_number,
            close_time,
            draw_time,
            rollover_in: rollover_amount,
        });

        transfer::share_object(round);
    }

    /// Close round for ticket sales (admin path).
    public entry fun close_round(
        _admin: &AdminCap,
        round: &mut LotteryRound,
        clock: &Clock,
    ) {
        assert!(round.status == STATUS_OPEN, ERoundNotOpen);
        assert!(clock::timestamp_ms(clock) >= round.close_time, ERoundNotClosed);

        round.status = STATUS_CLOSED;
        event::emit(RoundClosed {
            round_id: object::id(round),
            round_number: round.round_number,
            ticket_count: round.ticket_count,
            total_sales: round.total_sales,
        });
    }

    /// Draw winning numbers using Sui Random (admin path).
    entry fun draw_numbers(
        _admin: &AdminCap,
        round: &mut LotteryRound,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_CLOSED, ERoundNotClosed);
        assert!(clock::timestamp_ms(clock) >= round.draw_time, ERoundNotDrawn);

        let numbers = draw_lottery_numbers(r, ctx);
        round.drawn_numbers = option::some(numbers);
        round.status = STATUS_DRAWN;

        event::emit(NumbersDrawn {
            round_id: object::id(round),
            round_number: round.round_number,
            drawn_numbers: numbers,
        });
    }

    /// Settle round: compute tier payouts and forward treasury to BankrollPool.
    /// Winner counts are computed off-chain by the keeper bot and passed in.
    public entry fun settle_round(
        _admin: &AdminCap,
        round: &mut LotteryRound,
        registry: &LotteryRegistry,
        pool: &mut BankrollPool,
        tier1_winners_count: u64,
        tier2_winners_count: u64,
        tier3_winners_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.status == STATUS_DRAWN, ERoundNotDrawn);
        assert!(option::is_some(&registry.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&registry.game_cap);

        let total_pool = balance::value(&round.prize_pool);

        let prize_amount = (total_pool * PRIZE_POOL_BPS) / 10000;
        let base_rollover = (total_pool * ROLLOVER_BPS) / 10000;
        let treasury_amount = total_pool - prize_amount - base_rollover;

        let tier1_pool = (prize_amount * TIER1_BPS) / 10000;
        let tier2_pool = (prize_amount * TIER2_BPS) / 10000;
        let tier3_pool = (prize_amount * TIER3_BPS) / 10000;

        round.tier1_winners = tier1_winners_count;
        round.tier2_winners = tier2_winners_count;
        round.tier3_winners = tier3_winners_count;

        if (tier1_winners_count > 0) {
            round.tier1_payout_per_winner = tier1_pool / tier1_winners_count;
            let r1 = tier1_pool - (round.tier1_payout_per_winner * tier1_winners_count);
            round.tier1_rollover_out = r1;
        } else {
            round.tier1_payout_per_winner = 0;
            round.tier1_rollover_out = tier1_pool;
        };

        if (tier2_winners_count > 0) {
            round.tier2_payout_per_winner = tier2_pool / tier2_winners_count;
            let r2 = tier2_pool - (round.tier2_payout_per_winner * tier2_winners_count);
            round.tier2_rollover_out = r2;
        } else {
            round.tier2_payout_per_winner = 0;
            round.tier2_rollover_out = tier2_pool;
        };

        if (tier3_winners_count > 0) {
            round.tier3_payout_per_winner = tier3_pool / tier3_winners_count;
            let r3 = tier3_pool - (round.tier3_payout_per_winner * tier3_winners_count);
            round.tier3_rollover_out = r3;
        } else {
            round.tier3_payout_per_winner = 0;
            round.tier3_rollover_out = tier3_pool;
        };

        // Treasury portion flows directly to BankrollPool (no intermediate balance held).
        if (treasury_amount > 0) {
            let treasury_balance = balance::split(&mut round.prize_pool, treasury_amount);
            let treasury_coin = coin::from_balance(treasury_balance, ctx);
            bankroll_pool::treasury_deposit(pool, cap, treasury_coin, clock);
        };

        // Lock in the obligation owed to winners. claim_prize decrements
        // this; sweep_unclaimed_to_bankroll uses it as the upper bound for
        // forfeiture (so rollover destined for next round is never swept).
        round.obligated_amount =
            round.tier1_payout_per_winner * tier1_winners_count +
            round.tier2_payout_per_winner * tier2_winners_count +
            round.tier3_payout_per_winner * tier3_winners_count;

        round.status = STATUS_SETTLED;

        event::emit(RoundSettled {
            round_id: object::id(round),
            round_number: round.round_number,
            tier1_winners: tier1_winners_count,
            tier2_winners: tier2_winners_count,
            tier3_winners: tier3_winners_count,
            tier1_payout: round.tier1_payout_per_winner,
            tier2_payout: round.tier2_payout_per_winner,
            tier3_payout: round.tier3_payout_per_winner,
            tier1_rollover: round.tier1_rollover_out,
            tier2_rollover: round.tier2_rollover_out,
            tier3_rollover: round.tier3_rollover_out,
            base_rollover,
            obligated_amount: round.obligated_amount,
            treasury_amount,
        });
    }

    /// Transfer the carry-over (rollover) balance from a settled round to the
    /// newly created open round. Safe at any time; only transfers the excess
    /// beyond the reserved winner obligations.
    public entry fun transfer_rollover(
        _admin: &AdminCap,
        from_round: &mut LotteryRound,
        to_round: &mut LotteryRound,
    ) {
        assert!(from_round.status == STATUS_SETTLED, ERoundNotSettledForTransfer);
        assert!(to_round.status == STATUS_OPEN, ETargetRoundNotOpen);

        let reserved_for_claims =
            from_round.tier1_payout_per_winner * from_round.tier1_winners +
            from_round.tier2_payout_per_winner * from_round.tier2_winners +
            from_round.tier3_payout_per_winner * from_round.tier3_winners;

        let available = balance::value(&from_round.prize_pool);
        if (available > reserved_for_claims) {
            let transferable = available - reserved_for_claims;
            let rollover_bal = balance::split(&mut from_round.prize_pool, transferable);
            balance::join(&mut to_round.prize_pool, rollover_bal);
        };
    }

    // ===== User Functions =====

    /// Buy a lottery ticket (1 NSN).
    public entry fun buy_ticket(
        round: &mut LotteryRound,
        registry: &mut LotteryRegistry,
        payment: Coin<NUSDC>,
        n1: u8, n2: u8, n3: u8, n4: u8, n5: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_OPEN, ERoundNotOpen);
        assert!(clock::timestamp_ms(clock) < round.close_time, ERoundExpired);

        let sender = tx_context::sender(ctx);

        let current_count = if (table::contains(&round.tickets_by_address, sender)) {
            *table::borrow(&round.tickets_by_address, sender)
        } else {
            0
        };
        assert!(current_count < MAX_TICKETS_PER_ADDRESS, ETicketLimitExceeded);

        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= TICKET_PRICE, EInsufficientPayment);

        let mut numbers = vector[n1, n2, n3, n4, n5];
        validate_numbers(&numbers);
        sort_numbers(&mut numbers);

        if (payment_amount == TICKET_PRICE) {
            balance::join(&mut round.prize_pool, coin::into_balance(payment));
        } else {
            let mut payment_balance = coin::into_balance(payment);
            let ticket_payment = balance::split(&mut payment_balance, TICKET_PRICE);
            balance::join(&mut round.prize_pool, ticket_payment);

            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        };

        if (table::contains(&round.tickets_by_address, sender)) {
            let count = table::borrow_mut(&mut round.tickets_by_address, sender);
            *count = *count + 1;
        } else {
            table::add(&mut round.tickets_by_address, sender, 1);
        };

        let ticket_id = registry.next_ticket_id;
        registry.next_ticket_id = registry.next_ticket_id + 1;

        let ticket = Ticket {
            id: object::new(ctx),
            ticket_id,
            round_id: object::id(round),
            round_number: round.round_number,
            owner: sender,
            numbers,
            purchase_time: clock::timestamp_ms(clock),
        };

        round.ticket_count = round.ticket_count + 1;
        round.total_sales = round.total_sales + TICKET_PRICE;

        event::emit(TicketPurchased {
            round_id: object::id(round),
            round_number: round.round_number,
            ticket_id,
            buyer: sender,
            numbers,
            amount: TICKET_PRICE,
        });

        transfer::transfer(ticket, sender);
    }

    /// Same as `buy_ticket` but omits `&mut LotteryRegistry` to eliminate the
    /// global write-lock that serializes every concurrent purchase across all
    /// rounds. ticket_id becomes per-round (1-indexed off `round.ticket_count`)
    /// since it is only an informational label (claim/burn use the Ticket
    /// object id, not this field).
    public entry fun buy_ticket_v2(
        round: &mut LotteryRound,
        payment: Coin<NUSDC>,
        n1: u8, n2: u8, n3: u8, n4: u8, n5: u8,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_OPEN, ERoundNotOpen);
        assert!(clock::timestamp_ms(clock) < round.close_time, ERoundExpired);

        let sender = tx_context::sender(ctx);

        let current_count = if (table::contains(&round.tickets_by_address, sender)) {
            *table::borrow(&round.tickets_by_address, sender)
        } else {
            0
        };
        assert!(current_count < MAX_TICKETS_PER_ADDRESS, ETicketLimitExceeded);

        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= TICKET_PRICE, EInsufficientPayment);

        let mut numbers = vector[n1, n2, n3, n4, n5];
        validate_numbers(&numbers);
        sort_numbers(&mut numbers);

        if (payment_amount == TICKET_PRICE) {
            balance::join(&mut round.prize_pool, coin::into_balance(payment));
        } else {
            let mut payment_balance = coin::into_balance(payment);
            let ticket_payment = balance::split(&mut payment_balance, TICKET_PRICE);
            balance::join(&mut round.prize_pool, ticket_payment);

            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        };

        if (table::contains(&round.tickets_by_address, sender)) {
            let count = table::borrow_mut(&mut round.tickets_by_address, sender);
            *count = *count + 1;
        } else {
            table::add(&mut round.tickets_by_address, sender, 1);
        };

        let ticket_id = round.ticket_count + 1;

        let ticket = Ticket {
            id: object::new(ctx),
            ticket_id,
            round_id: object::id(round),
            round_number: round.round_number,
            owner: sender,
            numbers,
            purchase_time: clock::timestamp_ms(clock),
        };

        round.ticket_count = round.ticket_count + 1;
        round.total_sales = round.total_sales + TICKET_PRICE;

        event::emit(TicketPurchased {
            round_id: object::id(round),
            round_number: round.round_number,
            ticket_id,
            buyer: sender,
            numbers,
            amount: TICKET_PRICE,
        });

        transfer::transfer(ticket, sender);
    }

    /// Claim prize for a winning ticket (tier 1/2/3).
    /// Must be claimed within `CLAIM_WINDOW_MS` after `round.draw_time`;
    /// otherwise the prize is forfeit and can be swept to BankrollPool.
    public entry fun claim_prize(
        round: &mut LotteryRound,
        ticket: Ticket,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_SETTLED, ERoundNotSettled);
        assert!(ticket.round_id == object::id(round), EWrongRound);
        assert!(
            clock::timestamp_ms(clock) < round.draw_time + CLAIM_WINDOW_MS,
            EClaimWindowExpired,
        );

        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        let tier = get_prize_tier(match_count);

        assert!(tier != TIER_NONE, ENotPrizeWinner);

        let payout = if (tier == TIER_JACKPOT) {
            round.tier1_payout_per_winner
        } else if (tier == TIER_SECOND) {
            round.tier2_payout_per_winner
        } else {
            round.tier3_payout_per_winner
        };

        assert!(payout > 0, ENotWinner);
        assert!(balance::value(&round.prize_pool) >= payout, EInsufficientPayment);

        let sender = tx_context::sender(ctx);
        let ticket_id = ticket.ticket_id;

        let Ticket { id, ticket_id: _, round_id: _, round_number: _, owner: _, numbers: _, purchase_time: _ } = ticket;
        object::delete(id);

        let payout_balance = balance::split(&mut round.prize_pool, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

        // Reduce remaining winner obligation. Saturating subtract so we
        // never panic on accounting drift (defensive; should always be >=).
        round.obligated_amount = if (round.obligated_amount >= payout) {
            round.obligated_amount - payout
        } else {
            0
        };

        event::emit(PrizeClaimed {
            round_id: object::id(round),
            round_number: round.round_number,
            ticket_id,
            winner: sender,
            tier,
            match_count,
            amount: payout,
        });

        transfer::public_transfer(payout_coin, sender);
    }

    /// Burn a non-winning ticket (< 3 matches) from a settled round.
    public entry fun burn_ticket(
        round: &LotteryRound,
        ticket: Ticket,
    ) {
        assert!(round.status == STATUS_SETTLED, ERoundNotSettled);
        assert!(ticket.round_id == object::id(round), EWrongRound);

        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        let tier = get_prize_tier(match_count);
        assert!(tier == TIER_NONE, ENotWinner);

        let Ticket { id, ticket_id: _, round_id: _, round_number: _, owner: _, numbers: _, purchase_time: _ } = ticket;
        object::delete(id);
    }

    /// Permissionless sweep: once the 30-day claim window after draw_time has
    /// elapsed, any remaining balance in round.prize_pool is forfeited and
    /// forwarded to the shared gostop BankrollPool (LP benefit). Callable by
    /// anyone so ops outages can't strand funds.
    public entry fun sweep_unclaimed_to_bankroll(
        round: &mut LotteryRound,
        registry: &LotteryRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.status == STATUS_SETTLED, ERoundNotSettled);
        assert!(option::is_some(&registry.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&registry.game_cap);

        let now = clock::timestamp_ms(clock);
        // Strict inequality + SWEEP_GRACE_MS buffer ensures any in-flight
        // claim_prize tx near the boundary lands before sweep can proceed,
        // closing the same-block race window.
        assert!(
            now >= round.draw_time + CLAIM_WINDOW_MS + SWEEP_GRACE_MS,
            EClaimWindowNotReached,
        );

        // Only sweep the remaining winner obligation. The rollover portion
        // (next round's seed) is intentionally LEFT in prize_pool until
        // transfer_rollover moves it. Sweeping the whole pool would steal
        // next round's funds if transfer_rollover hasn't run yet.
        let pool_balance = balance::value(&round.prize_pool);
        let sweep_amount = if (round.obligated_amount <= pool_balance) {
            round.obligated_amount
        } else {
            pool_balance
        };

        if (sweep_amount > 0) {
            let bal = balance::split(&mut round.prize_pool, sweep_amount);
            let coin = coin::from_balance(bal, ctx);
            bankroll_pool::treasury_deposit(pool, cap, coin, clock);
            round.obligated_amount = 0;

            event::emit(UnclaimedSwept {
                round_id: object::id(round),
                round_number: round.round_number,
                amount: sweep_amount,
                swept_at: now,
            });
        };
    }

    // ===== Permissionless Keeper Functions =====

    entry fun close_round_permissionless(
        round: &mut LotteryRound,
        clock: &Clock,
    ) {
        assert!(round.status == STATUS_OPEN, ERoundNotOpen);
        assert!(clock::timestamp_ms(clock) >= round.close_time, ECloseTimeNotReached);

        round.status = STATUS_CLOSED;
        event::emit(RoundClosed {
            round_id: object::id(round),
            round_number: round.round_number,
            ticket_count: round.ticket_count,
            total_sales: round.total_sales,
        });
    }

    entry fun draw_numbers_permissionless(
        round: &mut LotteryRound,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_CLOSED, ERoundNotClosed);
        assert!(clock::timestamp_ms(clock) >= round.draw_time, EDrawTimeNotReached);

        let numbers = draw_lottery_numbers(r, ctx);
        round.drawn_numbers = option::some(numbers);
        round.status = STATUS_DRAWN;

        event::emit(NumbersDrawn {
            round_id: object::id(round),
            round_number: round.round_number,
            drawn_numbers: numbers,
        });
    }

    // ===== Internal Functions =====

    fun draw_lottery_numbers(r: &Random, ctx: &mut TxContext): vector<u8> {
        let mut g = random::new_generator(r, ctx);
        let mut numbers: vector<u8> = vector::empty();

        let mut drawn: vector<bool> = vector::empty();
        let mut i = 0;
        while (i < 26) {
            vector::push_back(&mut drawn, false);
            i = i + 1;
        };

        while (vector::length(&numbers) < NUMBERS_COUNT) {
            let n = random::generate_u8_in_range(&mut g, 1, MAX_NUMBER);
            if (!*vector::borrow(&drawn, (n as u64))) {
                *vector::borrow_mut(&mut drawn, (n as u64)) = true;
                vector::push_back(&mut numbers, n);
            };
        };

        sort_numbers(&mut numbers);
        numbers
    }

    fun validate_numbers(numbers: &vector<u8>) {
        assert!(vector::length(numbers) == NUMBERS_COUNT, EWrongNumberCount);

        let mut seen: vector<bool> = vector::empty();
        let mut j = 0;
        while (j < 26) {
            vector::push_back(&mut seen, false);
            j = j + 1;
        };

        let mut i = 0;
        while (i < NUMBERS_COUNT) {
            let n = *vector::borrow(numbers, i);
            assert!(n >= 1 && n <= MAX_NUMBER, ENumberOutOfRange);
            assert!(!*vector::borrow(&seen, (n as u64)), EDuplicateNumber);
            *vector::borrow_mut(&mut seen, (n as u64)) = true;
            i = i + 1;
        };
    }

    fun sort_numbers(v: &mut vector<u8>) {
        let len = vector::length(v);
        let mut i = 0;
        while (i < len) {
            let mut j = i + 1;
            while (j < len) {
                if (*vector::borrow(v, i) > *vector::borrow(v, j)) {
                    vector::swap(v, i, j);
                };
                j = j + 1;
            };
            i = i + 1;
        };
    }

    fun count_matching_numbers(drawn: &vector<u8>, ticket_numbers: &vector<u8>): u64 {
        let mut count: u64 = 0;
        let mut i: u64 = 0;
        let mut j: u64 = 0;
        let drawn_len = vector::length(drawn);
        let ticket_len = vector::length(ticket_numbers);

        while (i < drawn_len && j < ticket_len) {
            let d = *vector::borrow(drawn, i);
            let t = *vector::borrow(ticket_numbers, j);

            if (d == t) {
                count = count + 1;
                i = i + 1;
                j = j + 1;
            } else if (d < t) {
                i = i + 1;
            } else {
                j = j + 1;
            };
        };

        count
    }

    fun get_prize_tier(match_count: u64): u8 {
        if (match_count == 5) {
            TIER_JACKPOT
        } else if (match_count == 4) {
            TIER_SECOND
        } else if (match_count == 3) {
            TIER_THIRD
        } else {
            TIER_NONE
        }
    }

    // ===== View Functions =====

    public fun get_round_status(round: &LotteryRound): u8 { round.status }
    public fun get_drawn_numbers(round: &LotteryRound): Option<vector<u8>> { round.drawn_numbers }
    public fun get_prize_pool(round: &LotteryRound): u64 { balance::value(&round.prize_pool) }
    public fun get_ticket_count(round: &LotteryRound): u64 { round.ticket_count }
    public fun get_total_sales(round: &LotteryRound): u64 { round.total_sales }
    public fun get_round_timing(round: &LotteryRound): (u64, u64, u64) {
        (round.start_time, round.close_time, round.draw_time)
    }

    public fun get_tier1_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier1_winners, round.tier1_payout_per_winner, round.tier1_rollover_out)
    }
    public fun get_tier2_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier2_winners, round.tier2_payout_per_winner, round.tier2_rollover_out)
    }
    public fun get_tier3_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier3_winners, round.tier3_payout_per_winner, round.tier3_rollover_out)
    }

    public fun get_all_tier_info(round: &LotteryRound): (
        u64, u64, u64,
        u64, u64, u64,
        u64, u64, u64
    ) {
        (
            round.tier1_winners, round.tier1_payout_per_winner, round.tier1_rollover_out,
            round.tier2_winners, round.tier2_payout_per_winner, round.tier2_rollover_out,
            round.tier3_winners, round.tier3_payout_per_winner, round.tier3_rollover_out
        )
    }

    public fun get_ticket_numbers(ticket: &Ticket): vector<u8> { ticket.numbers }
    public fun get_ticket_round_id(ticket: &Ticket): ID { ticket.round_id }

    public fun is_winner(round: &LotteryRound, ticket: &Ticket): bool {
        if (round.status < STATUS_DRAWN || option::is_none(&round.drawn_numbers)) {
            return false
        };
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        match_count >= 3
    }

    public fun get_ticket_tier(round: &LotteryRound, ticket: &Ticket): (u8, u64) {
        if (round.status < STATUS_DRAWN || option::is_none(&round.drawn_numbers)) {
            return (TIER_NONE, 0)
        };
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        (get_prize_tier(match_count), match_count)
    }

    public fun get_ticket_payout(round: &LotteryRound, ticket: &Ticket): u64 {
        if (round.status != STATUS_SETTLED) return 0;
        let (tier, _) = get_ticket_tier(round, ticket);
        if (tier == TIER_JACKPOT) {
            round.tier1_payout_per_winner
        } else if (tier == TIER_SECOND) {
            round.tier2_payout_per_winner
        } else if (tier == TIER_THIRD) {
            round.tier3_payout_per_winner
        } else {
            0
        }
    }

    public fun get_registry_info(registry: &LotteryRegistry): (u64, u64) {
        (registry.current_round, registry.next_ticket_id)
    }

    // ===== Test Helpers =====
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test]
    fun test_remainder_calculation() {
        let tier_pool: u64 = 100;
        let winners: u64 = 3;
        let payout_per_winner = tier_pool / winners;
        let remainder = tier_pool - (payout_per_winner * winners);
        assert!(payout_per_winner == 33);
        assert!(remainder == 1);
        assert!(payout_per_winner * winners + remainder == tier_pool);
    }
}
