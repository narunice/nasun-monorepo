/// Pado Lottery Module
/// Weekly lottery with 1-32 range, 5 numbers selection
/// NUSDC collateral, Sui Random for drawing
module lottery::lottery {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use pado::nusdc::NUSDC;

    // ===== Constants =====
    const NUMBERS_COUNT: u64 = 5;           // Numbers to select
    const MAX_NUMBER: u8 = 32;              // Range: 1-32
    const TICKET_PRICE: u64 = 1_000_000;    // 1 NUSDC (6 decimals)
    const MAX_TICKETS_PER_ADDRESS: u64 = 100;  // Anti-sybil limit

    // Prize distribution (basis points, total = 10000)
    const PRIZE_POOL_BPS: u64 = 7000;       // 70% to winners
    const ROLLOVER_BPS: u64 = 2000;         // 20% to next round
    const TREASURY_BPS: u64 = 1000;         // 10% to treasury

    // Multi-tier prize distribution within PRIZE_POOL_BPS (70%)
    const TIER1_BPS: u64 = 6000;            // Jackpot (5 match): 60% of 70%
    const TIER2_BPS: u64 = 2500;            // 2nd (4 match): 25% of 70%
    const TIER3_BPS: u64 = 1500;            // 3rd (3 match): 15% of 70%

    // Prize tier identifiers
    const TIER_NONE: u8 = 0;
    const TIER_JACKPOT: u8 = 1;             // 5 numbers match
    const TIER_SECOND: u8 = 2;              // 4 numbers match
    const TIER_THIRD: u8 = 3;               // 3 numbers match

    // Round status
    const STATUS_OPEN: u8 = 0;              // Ticket sales open
    const STATUS_CLOSED: u8 = 1;            // Sales closed, awaiting draw
    const STATUS_DRAWN: u8 = 2;             // Numbers drawn, awaiting settlement
    const STATUS_SETTLED: u8 = 3;           // Fully settled

    // ===== Error Codes =====
    const ERoundNotOpen: u64 = 0;
    const ERoundNotClosed: u64 = 1;
    const ERoundNotDrawn: u64 = 2;
    const ERoundAlreadyDrawn: u64 = 3;
    const EInvalidNumbers: u64 = 4;
    const EDuplicateNumber: u64 = 5;
    const ENotAdmin: u64 = 6;
    const EAlreadyClaimed: u64 = 7;
    const ENotWinner: u64 = 8;
    const ETicketLimitExceeded: u64 = 9;
    const EInsufficientPayment: u64 = 10;
    const EWrongRound: u64 = 11;
    const ERoundNotSettled: u64 = 12;
    const ENumberOutOfRange: u64 = 13;
    const EWrongNumberCount: u64 = 14;
    const ERoundExpired: u64 = 15;
    const ECloseTimeNotReached: u64 = 16;   // For permissionless close
    const EDrawTimeNotReached: u64 = 17;    // For permissionless draw
    const ENotPrizeWinner: u64 = 18;        // Less than 3 matches

    // ===== Structs =====

    /// Admin capability
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Global lottery registry (shared)
    public struct LotteryRegistry has key {
        id: UID,
        current_round: u64,
        treasury_balance: Balance<NUSDC>,
        treasury_address: address,
        next_ticket_id: u64,
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
        drawn_numbers: Option<vector<u8>>,

        // Statistics
        ticket_count: u64,
        total_sales: u64,

        // Multi-tier winner tracking (replaces jackpot_winners)
        tier1_winners: u64,                 // Jackpot (5 match)
        tier2_winners: u64,                 // 2nd prize (4 match)
        tier3_winners: u64,                 // 3rd prize (3 match)
        tier1_payout_per_winner: u64,
        tier2_payout_per_winner: u64,
        tier3_payout_per_winner: u64,

        // Rollover tracking per tier (for no-winner cases)
        tier1_rollover_out: u64,
        tier2_rollover_out: u64,
        tier3_rollover_out: u64,

        // Anti-sybil: track tickets per address
        tickets_by_address: Table<address, u64>,
    }

    /// Ticket NFT (owned)
    public struct Ticket has key, store {
        id: UID,
        ticket_id: u64,
        round_id: ID,
        round_number: u64,
        owner: address,
        numbers: vector<u8>,    // Sorted 5 numbers
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
        // Multi-tier winner info
        tier1_winners: u64,
        tier2_winners: u64,
        tier3_winners: u64,
        tier1_payout: u64,
        tier2_payout: u64,
        tier3_payout: u64,
        // Rollover per tier (for no-winner tiers)
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
        tier: u8,           // 1=Jackpot, 2=2nd, 3=3rd
        match_count: u64,   // Number of matching numbers
        amount: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);

        // Create and transfer AdminCap to deployer
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            sender
        );

        // Create shared registry
        transfer::share_object(LotteryRegistry {
            id: object::new(ctx),
            current_round: 0,
            treasury_balance: balance::zero(),
            treasury_address: sender,
            next_ticket_id: 1,
        });
    }

    // ===== Admin Functions =====

    /// Create a new lottery round
    public entry fun create_round(
        _admin: &AdminCap,
        registry: &mut LotteryRegistry,
        close_time: u64,
        draw_time: u64,
        rollover_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        registry.current_round = registry.current_round + 1;
        let round_number = registry.current_round;

        let mut round = LotteryRound {
            id: object::new(ctx),
            round_number,
            status: STATUS_OPEN,
            start_time: clock::timestamp_ms(clock),
            close_time,
            draw_time,
            prize_pool: balance::zero(),
            rollover_in: rollover_amount,
            drawn_numbers: option::none(),
            ticket_count: 0,
            total_sales: 0,
            // Multi-tier winner tracking
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

        // If rollover provided, it should be transferred separately
        // For now, just track the amount (actual balance transfer happens in settle_round)

        event::emit(RoundCreated {
            round_id: object::id(&round),
            round_number,
            close_time,
            draw_time,
            rollover_in: rollover_amount,
        });

        transfer::share_object(round);
    }

    /// Close round for ticket sales
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

    /// Draw winning numbers using Sui Random
    public entry fun draw_numbers(
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

    /// Settle round: calculate multi-tier payouts
    /// tier1 = 5 match (Jackpot), tier2 = 4 match, tier3 = 3 match
    /// Called after counting winners off-chain
    public entry fun settle_round(
        _admin: &AdminCap,
        round: &mut LotteryRound,
        registry: &mut LotteryRegistry,
        tier1_winners_count: u64,
        tier2_winners_count: u64,
        tier3_winners_count: u64,
    ) {
        assert!(round.status == STATUS_DRAWN, ERoundNotDrawn);

        let total_pool = balance::value(&round.prize_pool) + round.rollover_in;

        // Calculate base distributions
        let prize_amount = (total_pool * PRIZE_POOL_BPS) / 10000;  // 70%
        let base_rollover = (total_pool * ROLLOVER_BPS) / 10000;   // 20%
        let treasury_amount = total_pool - prize_amount - base_rollover;  // 10%

        // Calculate tier-specific prize pools (from the 70% prize_amount)
        let tier1_pool = (prize_amount * TIER1_BPS) / 10000;  // 60% of 70% = 42% total
        let tier2_pool = (prize_amount * TIER2_BPS) / 10000;  // 25% of 70% = 17.5% total
        let tier3_pool = (prize_amount * TIER3_BPS) / 10000;  // 15% of 70% = 10.5% total

        // Store winner counts
        round.tier1_winners = tier1_winners_count;
        round.tier2_winners = tier2_winners_count;
        round.tier3_winners = tier3_winners_count;

        // Calculate payouts per winner and rollovers per tier
        // Tier 1 (Jackpot)
        if (tier1_winners_count > 0) {
            round.tier1_payout_per_winner = tier1_pool / tier1_winners_count;
            round.tier1_rollover_out = 0;
        } else {
            round.tier1_payout_per_winner = 0;
            round.tier1_rollover_out = tier1_pool;  // Roll over unclaimed tier1 prizes
        };

        // Tier 2 (4 match)
        if (tier2_winners_count > 0) {
            round.tier2_payout_per_winner = tier2_pool / tier2_winners_count;
            round.tier2_rollover_out = 0;
        } else {
            round.tier2_payout_per_winner = 0;
            round.tier2_rollover_out = tier2_pool;
        };

        // Tier 3 (3 match)
        if (tier3_winners_count > 0) {
            round.tier3_payout_per_winner = tier3_pool / tier3_winners_count;
            round.tier3_rollover_out = 0;
        } else {
            round.tier3_payout_per_winner = 0;
            round.tier3_rollover_out = tier3_pool;
        };

        // Transfer treasury portion
        if (treasury_amount > 0 && balance::value(&round.prize_pool) >= treasury_amount) {
            let treasury_balance = balance::split(&mut round.prize_pool, treasury_amount);
            balance::join(&mut registry.treasury_balance, treasury_balance);
        };

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
            treasury_amount,
        });
    }

    /// Withdraw treasury balance
    public entry fun withdraw_treasury(
        _admin: &AdminCap,
        registry: &mut LotteryRegistry,
        ctx: &mut TxContext
    ) {
        let amount = balance::value(&registry.treasury_balance);
        if (amount > 0) {
            let treasury_coin = coin::from_balance(
                balance::split(&mut registry.treasury_balance, amount),
                ctx
            );
            transfer::public_transfer(treasury_coin, registry.treasury_address);
        }
    }

    /// Update treasury address
    public entry fun set_treasury_address(
        _admin: &AdminCap,
        registry: &mut LotteryRegistry,
        new_address: address,
    ) {
        registry.treasury_address = new_address;
    }

    // ===== User Functions =====

    /// Buy a lottery ticket with selected numbers
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

        // Check ticket limit per address
        let current_count = if (table::contains(&round.tickets_by_address, sender)) {
            *table::borrow(&round.tickets_by_address, sender)
        } else {
            0
        };
        assert!(current_count < MAX_TICKETS_PER_ADDRESS, ETicketLimitExceeded);

        // Validate payment
        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= TICKET_PRICE, EInsufficientPayment);

        // Validate numbers
        let mut numbers = vector[n1, n2, n3, n4, n5];
        validate_numbers(&numbers);
        sort_numbers(&mut numbers);

        // Add payment to prize pool
        if (payment_amount == TICKET_PRICE) {
            balance::join(&mut round.prize_pool, coin::into_balance(payment));
        } else {
            // Split exact amount and return change
            let mut payment_balance = coin::into_balance(payment);
            let ticket_payment = balance::split(&mut payment_balance, TICKET_PRICE);
            balance::join(&mut round.prize_pool, ticket_payment);

            // Return change
            let change = coin::from_balance(payment_balance, ctx);
            transfer::public_transfer(change, sender);
        };

        // Update ticket count for address
        if (table::contains(&round.tickets_by_address, sender)) {
            let count = table::borrow_mut(&mut round.tickets_by_address, sender);
            *count = *count + 1;
        } else {
            table::add(&mut round.tickets_by_address, sender, 1);
        };

        // Create ticket
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

        // Update round stats
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

    /// Claim prize for winning ticket (tier 1/2/3)
    /// tier1 = 5 match, tier2 = 4 match, tier3 = 3 match
    public entry fun claim_prize(
        round: &mut LotteryRound,
        ticket: Ticket,
        ctx: &mut TxContext
    ) {
        assert!(round.status == STATUS_SETTLED, ERoundNotSettled);
        assert!(ticket.round_id == object::id(round), EWrongRound);

        // Count matching numbers and determine tier
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        let tier = get_prize_tier(match_count);

        // Must be at least tier 3 (3 matches)
        assert!(tier != TIER_NONE, ENotPrizeWinner);

        // Get payout based on tier
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

        // Destroy ticket
        let Ticket { id, ticket_id: _, round_id: _, round_number: _, owner: _, numbers: _, purchase_time: _ } = ticket;
        object::delete(id);

        // Transfer prize
        let payout_balance = balance::split(&mut round.prize_pool, payout);
        let payout_coin = coin::from_balance(payout_balance, ctx);

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

    /// Burn non-winning ticket (less than 3 matches)
    public entry fun burn_ticket(
        round: &LotteryRound,
        ticket: Ticket,
    ) {
        assert!(round.status == STATUS_SETTLED, ERoundNotSettled);
        assert!(ticket.round_id == object::id(round), EWrongRound);

        // Only allow burning if ticket has less than 3 matches (no prize tier)
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        let tier = get_prize_tier(match_count);
        assert!(tier == TIER_NONE, ENotWinner); // Must NOT be a prize winner

        let Ticket { id, ticket_id: _, round_id: _, round_number: _, owner: _, numbers: _, purchase_time: _ } = ticket;
        object::delete(id);
    }

    // ===== Internal Functions =====

    /// Draw 5 unique numbers from 1-32
    fun draw_lottery_numbers(r: &Random, ctx: &mut TxContext): vector<u8> {
        let mut g = random::new_generator(r, ctx);
        let mut numbers: vector<u8> = vector::empty();

        // Track which numbers have been drawn (index 0-32, use indices 1-32)
        let mut drawn: vector<bool> = vector::empty();
        let mut i = 0;
        while (i < 33) {
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

    /// Validate that all numbers are in range and unique
    fun validate_numbers(numbers: &vector<u8>) {
        assert!(vector::length(numbers) == NUMBERS_COUNT, EWrongNumberCount);

        // Track seen numbers (index 0-32, use indices 1-32)
        let mut seen: vector<bool> = vector::empty();
        let mut j = 0;
        while (j < 33) {
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

    /// Sort numbers in ascending order (bubble sort for small arrays)
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

    /// Count how many numbers match between drawn and ticket (both sorted)
    fun count_matching_numbers(drawn: &vector<u8>, ticket_numbers: &vector<u8>): u64 {
        let mut count: u64 = 0;
        let mut i: u64 = 0;
        let mut j: u64 = 0;
        let drawn_len = vector::length(drawn);
        let ticket_len = vector::length(ticket_numbers);

        // Two-pointer merge-like comparison (both sorted)
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

    /// Get prize tier from match count
    /// 5 match = Tier 1 (Jackpot), 4 match = Tier 2, 3 match = Tier 3, <3 = No prize
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

    public fun get_round_status(round: &LotteryRound): u8 {
        round.status
    }

    public fun get_drawn_numbers(round: &LotteryRound): Option<vector<u8>> {
        round.drawn_numbers
    }

    public fun get_prize_pool(round: &LotteryRound): u64 {
        balance::value(&round.prize_pool)
    }

    public fun get_ticket_count(round: &LotteryRound): u64 {
        round.ticket_count
    }

    public fun get_total_sales(round: &LotteryRound): u64 {
        round.total_sales
    }

    /// Get tier 1 (Jackpot) info: (winners, payout_per_winner, rollover_out)
    public fun get_tier1_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier1_winners, round.tier1_payout_per_winner, round.tier1_rollover_out)
    }

    /// Get tier 2 (4 match) info: (winners, payout_per_winner, rollover_out)
    public fun get_tier2_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier2_winners, round.tier2_payout_per_winner, round.tier2_rollover_out)
    }

    /// Get tier 3 (3 match) info: (winners, payout_per_winner, rollover_out)
    public fun get_tier3_info(round: &LotteryRound): (u64, u64, u64) {
        (round.tier3_winners, round.tier3_payout_per_winner, round.tier3_rollover_out)
    }

    /// Get all tier info at once (for frontend convenience)
    public fun get_all_tier_info(round: &LotteryRound): (
        u64, u64, u64,  // tier1: winners, payout, rollover
        u64, u64, u64,  // tier2: winners, payout, rollover
        u64, u64, u64   // tier3: winners, payout, rollover
    ) {
        (
            round.tier1_winners, round.tier1_payout_per_winner, round.tier1_rollover_out,
            round.tier2_winners, round.tier2_payout_per_winner, round.tier2_rollover_out,
            round.tier3_winners, round.tier3_payout_per_winner, round.tier3_rollover_out
        )
    }

    public fun get_ticket_numbers(ticket: &Ticket): vector<u8> {
        ticket.numbers
    }

    public fun get_ticket_round_id(ticket: &Ticket): ID {
        ticket.round_id
    }

    /// Check if ticket is a winner (any tier) - legacy compatibility
    public fun is_winner(round: &LotteryRound, ticket: &Ticket): bool {
        if (round.status < STATUS_DRAWN || option::is_none(&round.drawn_numbers)) {
            return false
        };
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        match_count >= 3  // At least 3 matches = prize winner
    }

    /// Get ticket's prize tier and match count (0 = no prize)
    public fun get_ticket_tier(round: &LotteryRound, ticket: &Ticket): (u8, u64) {
        if (round.status < STATUS_DRAWN || option::is_none(&round.drawn_numbers)) {
            return (TIER_NONE, 0)
        };
        let drawn = option::borrow(&round.drawn_numbers);
        let match_count = count_matching_numbers(drawn, &ticket.numbers);
        (get_prize_tier(match_count), match_count)
    }

    /// Get expected payout for a ticket based on current round settlement
    public fun get_ticket_payout(round: &LotteryRound, ticket: &Ticket): u64 {
        if (round.status != STATUS_SETTLED) {
            return 0
        };
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

    public fun get_registry_info(registry: &LotteryRegistry): (u64, u64, address) {
        (
            registry.current_round,
            balance::value(&registry.treasury_balance),
            registry.treasury_address
        )
    }

    // ===== Permissionless Keeper Functions =====

    /// Permissionless close - anyone can call after close_time
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

    /// Permissionless draw - anyone can call after draw_time
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

    // ===== Test Functions =====
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
