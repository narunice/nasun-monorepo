/// GoStop Crash Game (game_id = 4)
///
/// Multiplayer crash game. Server commits to crash_point via blake2b256 hash before
/// the round starts, then reveals it at resolve time. Players cash out before crash
/// to win their bet * multiplier. Crash_point + salt are stored off-chain (chat-server
/// sqlite); only commit_hash lives on-chain.
///
/// Security model:
/// - commit_hash = blake2b256(bcs(crash_point_bps) || salt32) prevents post-hoc manipulation.
/// - cash_out records (multiplier_bps, recorded_at) on-chain with a 3% multiplicative bound.
/// - resolve checks cashout.recorded_at <= flying_started_at + inverse_multiplier(crash_point)
///   to block post-crash cash-out exploits.
/// - crashed WS event does NOT carry crashPointBps; only resolved event reveals it.
/// - 24h emergency_refund (permissionless, no salt needed) ensures player funds are never locked.
module gostop_crash::crash {
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::dynamic_field;
    use sui::hash;
    use sui::bcs;
    use sui::event;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap, AdminCap as BpAdminCap};
    use devnet_tokens::nusdc::NUSDC;

    // ===== Constants =====

    #[allow(unused_const)]
    const GAME_ID_SELF: u8 = 4;

    const MAX_PARTICIPANTS: u64 = 30;
    const MIN_BET_AMOUNT: u64 = 1_000_000;         // 1 NUSDC (6 decimals)

    // Quadratic multiplier: mult_bps(t_ms) = 10000 + 3*t + 9*t*t/20000
    // Matches e^(0.00003*t) within ~3% for t in [0, 120_000 ms].
    // Coefficients halved (6→3, 36→9) on 2026-04-28 to give players longer
    // FLYING windows; the cap multiplier is preserved by doubling the
    // inverse-search horizon below.
    const MULT_BASE: u64 = 10_000;
    const MULT_LINEAR: u64 = 3;
    const MULT_QUAD_NUM: u64 = 9;
    const MULT_QUAD_DEN: u64 = 20_000;

    // 3% multiplicative tolerance for cash_out bound check.
    const TOLERANCE_MULT_BPS: u64 = 10_300;

    // Max elapsed for binary search in inverse_multiplier_at (240 seconds).
    // multiplier_at_bps(240_000) = 10_000 + 720_000 + 25_920_000 = 26_650_000.
    // crash_point above this would silently saturate inverse search, breaking the
    // post-crash bound. resolve_round asserts crash_point_bps <= INVERSE_SEARCH_TOP_BPS.
    const INVERSE_SEARCH_HI: u64 = 240_000;
    const INVERSE_SEARCH_TOP_BPS: u64 = 26_650_000;

    // Liveness timeouts.
    const EMERGENCY_REFUND_TIMEOUT_MS: u64 = 86_400_000;  // 24h from flying_started_at
    const BETTING_REFUND_TIMEOUT_MS: u64 = 3_600_000;     // 1h from betting_ends_at

    // Round states.
    const STATE_BETTING: u8 = 0;
    const STATE_FLYING: u8 = 1;

    // Max theoretical multiplier for place_bet pre-check.
    // Capped at 200x to keep per-bet payout ceiling reasonable vs bankroll size.
    // Rounds that crash above 200x are extremely rare; cash_out above this aborts
    // (frontend caps auto-cashout accordingly).
    const MAX_THEORETICAL_MUL_BPS: u64 = 2_000_000;

    // Reason code for refund_bet calls.
    const REFUND_REASON_EMERGENCY: u8 = 1;

    // ===== Errors =====

    const ERoundNotInBetting: u64 = 0;
    const ERoundNotInFlying: u64 = 1;
    const EAlreadyBet: u64 = 2;
    const EAlreadyCashedOut: u64 = 3;
    const EBetTooSmall: u64 = 4;
    const EBetTooLarge: u64 = 5;
    const EMultiplierTooLow: u64 = 6;
    const EMultiplierExceedsBound: u64 = 7;
    const ERefundTimeoutNotReached: u64 = 8;
    const ECommitHashMismatch: u64 = 9;
    const EGameCapNotInstalled: u64 = 10;
    const EGameCapAlreadyInstalled: u64 = 11;
    const EMaxParticipantsReached: u64 = 12;
    const ECurrentRoundExists: u64 = 13;
    const ENotCurrentRound: u64 = 14;
    const EOperatorCannotPlay: u64 = 15;
    const ENotOperator: u64 = 16;
    const ENotBetter: u64 = 17;
    const EBettingNotEnded: u64 = 18;
    const EEntriesNotEmpty: u64 = 19;
    const ECrashPointTooHigh: u64 = 21;

    // ===== Structs =====

    public struct AdminCap has key, store { id: UID }

    /// Key for the per-game max bet limit stored on CrashRegistry.
    public struct MaxBetKey has copy, drop, store {}

    public struct CrashRegistry has key {
        id: UID,
        game_cap: Option<GameCap>,
        current_round_id: Option<ID>,
        operator_address: address,
        round_counter: u64,
        total_rounds: u64,
        total_cashouts: u64,
    }

    public struct CrashRound has key {
        id: UID,
        round_id: u64,
        commit_hash: vector<u8>,               // blake2b256(bcs(crash_point_bps) || salt)
        total_bet_amount: u64,
        entries: vector<Entry>,
        state: u8,
        betting_ends_at: u64,
        flying_started_at: u64,                // set by close_betting; 0 while BETTING
        created_at: u64,
    }

    public struct Entry has store {
        player: address,
        bet_amount: u64,
        placed_at: u64,
        cashout: Option<CashOut>,
    }

    public struct CashOut has store, drop, copy {
        multiplier_bps: u64,
        recorded_at: u64,                      // clock.timestamp_ms() at cash_out call
    }

    // ===== Events =====

    public struct RoundStarted has copy, drop {
        round_id: u64,
        round_object_id: ID,
        commit_hash: vector<u8>,
        betting_ends_at: u64,
        timestamp_ms: u64,
    }

    public struct BetPlaced has copy, drop {
        round_id: u64,
        player: address,
        amount: u64,
        total_pool: u64,
        participant_count: u64,
        timestamp_ms: u64,
    }

    public struct BettingClosed has copy, drop {
        round_id: u64,
        flying_started_at: u64,
    }

    public struct CashOutRecorded has copy, drop {
        round_id: u64,
        player: address,
        multiplier_bps: u64,
        recorded_at: u64,
    }

    public struct RoundResolved has copy, drop {
        round_id: u64,
        crash_point_bps: u64,
        crash_time_ms: u64,
        total_bet: u64,
        total_payout: u64,
        cashout_count: u64,
        timestamp_ms: u64,
    }

    public struct RoundRefunded has copy, drop {
        round_id: u64,
        refunded_count: u64,
        total_refunded: u64,
        stall_state: u8,
        timestamp_ms: u64,
    }

    public struct OperatorEmptyFinalize has copy, drop {
        round_id: u64,
        timestamp_ms: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        transfer::transfer(AdminCap { id: object::new(ctx) }, sender);
        transfer::share_object(CrashRegistry {
            id: object::new(ctx),
            game_cap: option::none(),
            current_round_id: option::none(),
            operator_address: sender,          // replaced via set_operator after deploy
            round_counter: 0,
            total_rounds: 0,
            total_cashouts: 0,
        });
    }

    // ===== Admin =====

    public entry fun install_game_cap(
        _a: &AdminCap,
        reg: &mut CrashRegistry,
        cap: GameCap,
    ) {
        assert!(option::is_none(&reg.game_cap), EGameCapAlreadyInstalled);
        option::fill(&mut reg.game_cap, cap);
    }

    public entry fun set_operator(
        _a: &AdminCap,
        reg: &mut CrashRegistry,
        operator: address,
    ) {
        reg.operator_address = operator;
    }

    /// Set the per-bet upper limit enforced in place_bet.
    /// Stored as a dynamic field so it survives package upgrades without
    /// requiring a struct layout change on CrashRegistry.
    public entry fun set_max_bet(
        _a: &AdminCap,
        reg: &mut CrashRegistry,
        new_max: u64,
    ) {
        if (dynamic_field::exists_(&reg.id, MaxBetKey {})) {
            *dynamic_field::borrow_mut<MaxBetKey, u64>(&mut reg.id, MaxBetKey {}) = new_max;
        } else {
            dynamic_field::add(&mut reg.id, MaxBetKey {}, new_max);
        }
    }

    /// Adjust max_single_payout on the GameCap that lives inside the registry.
    /// admin laptop이 BP AdminCap + Crash AdminCap 둘 다 보유 (cold storage).
    /// PTB 1개로 안전 호출. cap은 registry 밖으로 나가지 않음 (extract window 자기모순 해소).
    public entry fun update_max_payout_via_bp_admin(
        _crash_admin: &AdminCap,
        bp_admin: &BpAdminCap,
        reg: &mut CrashRegistry,
        new_max: u64,
        clock: &Clock,
    ) {
        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow_mut(&mut reg.game_cap);
        bankroll_pool::update_max_payout(bp_admin, cap, new_max, clock);
    }

    /// Disaster recovery: clear current_round_id when an in-flight round is permanently
    /// stuck (e.g., resolve_round repeatedly fails due to bankroll insolvency). All entries
    /// must be refunded via emergency_refund_batch first; this only releases the registry slot.
    public entry fun admin_finalize_stuck_round(
        _a: &AdminCap,
        reg: &mut CrashRegistry,
        round: CrashRound,
        _ctx: &mut TxContext,
    ) {
        assert!(vector::is_empty(&round.entries), EEntriesNotEmpty);
        if (option::is_some(&reg.current_round_id)) {
            let _ = option::extract(&mut reg.current_round_id);
        };
        destroy_round(round);
    }

    /// Operator-initiated finalize for a stuck *empty* round. Allows the keeper to
    /// auto-recover after PM2 restart / OOM without requiring AdminCap. Funds are
    /// never at risk because entries must be empty. The state guard rejects calls
    /// during an active BETTING window so a compromised operator key cannot wipe a
    /// freshly-started valid round.
    public entry fun operator_finalize_empty_stuck_round(
        reg: &mut CrashRegistry,
        round: CrashRound,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == reg.operator_address, ENotOperator);
        assert!(vector::is_empty(&round.entries), EEntriesNotEmpty);
        let now = clock::timestamp_ms(clock);
        assert!(
            round.state == STATE_FLYING || now > round.betting_ends_at,
            EBettingNotEnded,
        );
        let round_id = round.round_id;
        if (option::is_some(&reg.current_round_id)) {
            let _ = option::extract(&mut reg.current_round_id);
        };
        event::emit(OperatorEmptyFinalize { round_id, timestamp_ms: now });
        destroy_round(round);
    }

    // ===== Operator =====

    /// Start a new round. commit_hash = blake2b256(bcs(crash_point_bps) || salt32).
    /// The crash_point and salt are stored off-chain in chat-server sqlite.
    public entry fun start_round(
        reg: &mut CrashRegistry,
        betting_duration_ms: u64,
        commit_hash: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == reg.operator_address, ENotOperator);
        assert!(option::is_none(&reg.current_round_id), ECurrentRoundExists);
        assert!(vector::length(&commit_hash) == 32, ECommitHashMismatch);

        reg.round_counter = reg.round_counter + 1;
        let now = clock::timestamp_ms(clock);
        let round_id = reg.round_counter;

        let round = CrashRound {
            id: object::new(ctx),
            round_id,
            commit_hash,
            total_bet_amount: 0,
            entries: vector::empty(),
            state: STATE_BETTING,
            betting_ends_at: now + betting_duration_ms,
            flying_started_at: 0,
            created_at: now,
        };
        let round_obj_id = object::id(&round);
        option::fill(&mut reg.current_round_id, round_obj_id);

        event::emit(RoundStarted {
            round_id,
            round_object_id: round_obj_id,
            commit_hash: round.commit_hash,
            betting_ends_at: round.betting_ends_at,
            timestamp_ms: now,
        });

        transfer::share_object(round);
    }

    /// Transition round from BETTING to FLYING. Called after betting window closes.
    public entry fun close_betting(
        reg: &CrashRegistry,
        round: &mut CrashRound,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == reg.operator_address, ENotOperator);
        assert!(round.state == STATE_BETTING, ERoundNotInBetting);
        let now = clock::timestamp_ms(clock);
        assert!(now >= round.betting_ends_at, EBettingNotEnded);

        round.state = STATE_FLYING;
        round.flying_started_at = now;

        event::emit(BettingClosed {
            round_id: round.round_id,
            flying_started_at: now,
        });
    }

    /// Resolve the round: verify commit, compute crash_time, pay winners, delete round.
    public entry fun resolve_round(
        round: CrashRound,
        crash_point_bps: u64,
        salt: vector<u8>,
        reg: &mut CrashRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(tx_context::sender(ctx) == reg.operator_address, ENotOperator);
        let round_obj_id = object::id(&round);
        assert!(
            option::borrow(&reg.current_round_id) == &round_obj_id,
            ENotCurrentRound
        );
        assert!(round.state == STATE_FLYING, ERoundNotInFlying);

        // Verify commit: hash(bcs(crash_point_bps) || salt) must match commit_hash.
        let mut commit_msg = bcs::to_bytes(&crash_point_bps);
        vector::append(&mut commit_msg, salt);
        assert!(
            round.commit_hash == hash::blake2b256(&commit_msg),
            ECommitHashMismatch
        );

        // Above this, inverse_multiplier_at saturates at 120s and the post-crash
        // cash-out bound becomes ineffective. Off-chain crash_point generator must cap.
        assert!(crash_point_bps <= INVERSE_SEARCH_TOP_BPS, ECrashPointTooHigh);

        let crash_time_ms = inverse_multiplier_at(crash_point_bps);
        let crash_deadline = round.flying_started_at + crash_time_ms;

        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&reg.game_cap);

        let total_bet = round.total_bet_amount;
        let round_id = round.round_id;

        let n = vector::length(&round.entries);
        let mut total_payout: u64 = 0;
        let mut cashout_count: u64 = 0;
        let mut i = 0;

        while (i < n) {
            let entry = vector::borrow(&round.entries, i);
            let payout = if (option::is_some(&entry.cashout)) {
                let co = option::borrow(&entry.cashout);
                // strict inequality: multiplier == crash_point does NOT pay
                if (co.multiplier_bps < crash_point_bps && co.recorded_at <= crash_deadline) {
                    let p = ((entry.bet_amount as u128) * (co.multiplier_bps as u128) / 10_000) as u64;
                    let coin_out = bankroll_pool::pay_winner(pool, cap, p, entry.player, clock, ctx);
                    transfer::public_transfer(coin_out, entry.player);
                    cashout_count = cashout_count + 1;
                    total_payout = total_payout + p;
                    p
                } else { 0 }
            } else { 0 };

            // session_id = bcs(round_id) || player_address — unique per (round, player)
            // so the leaderboard aggregator does not see duplicates.
            let mut session_id = bcs::to_bytes(&round_id);
            vector::append(&mut session_id, bcs::to_bytes(&entry.player));

            bankroll_pool::emit_game_result(
                cap,
                entry.player,
                entry.bet_amount,
                payout,
                session_id,
                clock,
            );
            i = i + 1;
        };

        event::emit(RoundResolved {
            round_id,
            crash_point_bps,
            crash_time_ms,
            total_bet,
            total_payout,
            cashout_count,
            timestamp_ms: clock::timestamp_ms(clock),
        });

        option::extract(&mut reg.current_round_id);
        reg.total_rounds = reg.total_rounds + 1;
        reg.total_cashouts = reg.total_cashouts + cashout_count;

        destroy_round(round);
    }

    // ===== Player =====

    public entry fun place_bet(
        round: &mut CrashRound,
        reg: &CrashRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.state == STATE_BETTING, ERoundNotInBetting);
        let now = clock::timestamp_ms(clock);
        assert!(now < round.betting_ends_at, ERoundNotInBetting);

        let sender = tx_context::sender(ctx);
        assert!(sender != reg.operator_address, EOperatorCannotPlay);

        let bet_amount = coin::value(&bet_coin);
        assert!(bet_amount >= MIN_BET_AMOUNT, EBetTooSmall);

        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&reg.game_cap);
        // Enforce admin-configured max bet. Falls back to deriving it from
        // max_single_payout for registries created before this upgrade.
        let max_bet = if (dynamic_field::exists_(&reg.id, MaxBetKey {})) {
            *dynamic_field::borrow<MaxBetKey, u64>(&reg.id, MaxBetKey {})
        } else {
            bankroll_pool::game_cap_max_payout(cap) * 10_000 / MAX_THEORETICAL_MUL_BPS
        };
        assert!(bet_amount <= max_bet, EBetTooLarge);

        assert!(
            vector::length(&round.entries) < MAX_PARTICIPANTS,
            EMaxParticipantsReached
        );
        assert!(
            option::is_none(&find_entry_index_opt(&round.entries, sender)),
            EAlreadyBet
        );

        bankroll_pool::collect_bet(pool, cap, bet_coin, sender, clock);

        round.total_bet_amount = round.total_bet_amount + bet_amount;
        vector::push_back(&mut round.entries, Entry {
            player: sender,
            bet_amount,
            placed_at: now,
            cashout: option::none(),
        });

        event::emit(BetPlaced {
            round_id: round.round_id,
            player: sender,
            amount: bet_amount,
            total_pool: round.total_bet_amount,
            participant_count: vector::length(&round.entries),
            timestamp_ms: now,
        });
    }

    /// Record a cash-out. Validates multiplier is within 3% multiplicative bound
    /// of the on-chain curve at the current elapsed time.
    public entry fun cash_out(
        round: &mut CrashRound,
        _reg: &CrashRegistry,
        multiplier_bps: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.state == STATE_FLYING, ERoundNotInFlying);

        let now = clock::timestamp_ms(clock);
        let elapsed = now - round.flying_started_at;

        // 3% multiplicative bound: player cannot claim a multiplier beyond 3% above curve.
        let base = multiplier_at_bps(elapsed);
        let max_allowed = base * TOLERANCE_MULT_BPS / 10_000;
        assert!(multiplier_bps >= MULT_BASE, EMultiplierTooLow);
        assert!(multiplier_bps <= max_allowed, EMultiplierExceedsBound);

        let sender = tx_context::sender(ctx);
        let idx = find_entry_index(&round.entries, sender);
        let entry = vector::borrow_mut(&mut round.entries, idx);
        assert!(option::is_none(&entry.cashout), EAlreadyCashedOut);

        option::fill(&mut entry.cashout, CashOut { multiplier_bps, recorded_at: now });

        event::emit(CashOutRecorded {
            round_id: round.round_id,
            player: sender,
            multiplier_bps,
            recorded_at: now,
        });
    }

    // ===== Liveness / Emergency =====

    /// Permissionless refund after 24h of FLYING state. No salt needed.
    public entry fun emergency_refund(
        round: CrashRound,
        reg: &mut CrashRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.state == STATE_FLYING, ERoundNotInFlying);
        let now = clock::timestamp_ms(clock);
        assert!(
            now >= round.flying_started_at + EMERGENCY_REFUND_TIMEOUT_MS,
            ERefundTimeoutNotReached
        );

        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&reg.game_cap);
        let n = vector::length(&round.entries);
        let mut total_refunded: u64 = 0;
        let mut i = 0;
        while (i < n) {
            let entry = vector::borrow(&round.entries, i);
            let coin_out = bankroll_pool::refund_bet(
                pool, cap, entry.bet_amount, entry.player,
                REFUND_REASON_EMERGENCY, clock, ctx,
            );
            transfer::public_transfer(coin_out, entry.player);
            total_refunded = total_refunded + entry.bet_amount;
            i = i + 1;
        };

        event::emit(RoundRefunded {
            round_id: round.round_id,
            refunded_count: n,
            total_refunded,
            stall_state: STATE_FLYING,
            timestamp_ms: now,
        });

        option::extract(&mut reg.current_round_id);
        destroy_round(round);
    }

    /// Permissionless refund if BETTING state stalls (operator didn't call close_betting).
    public entry fun refund_stale_betting(
        round: CrashRound,
        reg: &mut CrashRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(round.state == STATE_BETTING, ERoundNotInBetting);
        let now = clock::timestamp_ms(clock);
        assert!(
            now >= round.betting_ends_at + BETTING_REFUND_TIMEOUT_MS,
            ERefundTimeoutNotReached
        );

        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&reg.game_cap);
        let n = vector::length(&round.entries);
        let mut total_refunded: u64 = 0;
        let mut i = 0;
        while (i < n) {
            let entry = vector::borrow(&round.entries, i);
            let coin_out = bankroll_pool::refund_bet(
                pool, cap, entry.bet_amount, entry.player,
                REFUND_REASON_EMERGENCY, clock, ctx,
            );
            transfer::public_transfer(coin_out, entry.player);
            total_refunded = total_refunded + entry.bet_amount;
            i = i + 1;
        };

        event::emit(RoundRefunded {
            round_id: round.round_id,
            refunded_count: n,
            total_refunded,
            stall_state: STATE_BETTING,
            timestamp_ms: now,
        });

        option::extract(&mut reg.current_round_id);
        destroy_round(round);
    }

    /// Paginated refund for the edge case where a single tx cannot cover all 30 entries.
    /// Call repeatedly until entries is empty, then call emergency_finalize.
    public entry fun emergency_refund_batch(
        round: &mut CrashRound,
        reg: &CrashRegistry,
        pool: &mut BankrollPool,
        max_count: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        if (round.state == STATE_FLYING) {
            assert!(
                now >= round.flying_started_at + EMERGENCY_REFUND_TIMEOUT_MS,
                ERefundTimeoutNotReached
            );
        } else {
            assert!(round.state == STATE_BETTING, ERoundNotInBetting);
            assert!(
                now >= round.betting_ends_at + BETTING_REFUND_TIMEOUT_MS,
                ERefundTimeoutNotReached
            );
        };

        assert!(option::is_some(&reg.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&reg.game_cap);
        let mut count = 0;
        while (count < max_count && !vector::is_empty(&round.entries)) {
            let Entry { player, bet_amount, placed_at: _, cashout: _ }
                = vector::pop_back(&mut round.entries);
            let coin_out = bankroll_pool::refund_bet(
                pool, cap, bet_amount, player,
                REFUND_REASON_EMERGENCY, clock, ctx,
            );
            transfer::public_transfer(coin_out, player);
            count = count + 1;
        };
    }

    /// Finalize an empty round after batch refunds. Clears current_round_id.
    public entry fun emergency_finalize(
        round: CrashRound,
        reg: &mut CrashRegistry,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(vector::is_empty(&round.entries), EEntriesNotEmpty);
        let now = clock::timestamp_ms(clock);
        if (round.state == STATE_FLYING) {
            assert!(
                now >= round.flying_started_at + EMERGENCY_REFUND_TIMEOUT_MS,
                ERefundTimeoutNotReached
            );
        } else {
            assert!(round.state == STATE_BETTING, ERoundNotInBetting);
            assert!(
                now >= round.betting_ends_at + BETTING_REFUND_TIMEOUT_MS,
                ERefundTimeoutNotReached
            );
        };
        option::extract(&mut reg.current_round_id);
        destroy_round(round);
    }

    // ===== Math =====

    /// Quadratic approximation of e^(0.00003*t). Same formula as TypeScript client.
    /// mult_bps(t_ms) = 10000 + 3*t + 9*t*t/20000
    public fun multiplier_at_bps(elapsed_ms: u64): u64 {
        let t = elapsed_ms;
        let linear = MULT_LINEAR * t;
        let quad = MULT_QUAD_NUM * t * t / MULT_QUAD_DEN;
        MULT_BASE + linear + quad
    }

    /// Binary search inverse: find t such that multiplier_at_bps(t) >= target_bps.
    /// Used in resolve_round to compute crash_deadline from crash_point.
    public fun inverse_multiplier_at(target_bps: u64): u64 {
        if (target_bps <= MULT_BASE) return 0;
        let mut lo: u64 = 0;
        let mut hi: u64 = INVERSE_SEARCH_HI;
        while (lo < hi) {
            let mid = (lo + hi) / 2;
            if (multiplier_at_bps(mid) < target_bps) {
                lo = mid + 1;
            } else {
                hi = mid;
            };
        };
        lo
    }

    // ===== Internal Helpers =====

    fun find_entry_index(entries: &vector<Entry>, addr: address): u64 {
        let n = vector::length(entries);
        let mut i = 0;
        while (i < n) {
            if (vector::borrow(entries, i).player == addr) return i;
            i = i + 1;
        };
        abort ENotBetter
    }

    fun find_entry_index_opt(entries: &vector<Entry>, addr: address): Option<u64> {
        let n = vector::length(entries);
        let mut i = 0;
        while (i < n) {
            if (vector::borrow(entries, i).player == addr) return option::some(i);
            i = i + 1;
        };
        option::none()
    }

    /// Destructure and delete a CrashRound. Entry has no drop, so we must drain manually.
    fun destroy_round(round: CrashRound) {
        let CrashRound {
            id,
            round_id: _,
            commit_hash: _,
            total_bet_amount: _,
            mut entries,
            state: _,
            betting_ends_at: _,
            flying_started_at: _,
            created_at: _,
        } = round;
        while (!vector::is_empty(&entries)) {
            let Entry { player: _, bet_amount: _, placed_at: _, cashout: _ }
                = vector::pop_back(&mut entries);
        };
        vector::destroy_empty(entries);
        object::delete(id);
    }

    // ===== Test-only =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }

    #[test_only]
    public fun multiplier_at_bps_test(t: u64): u64 {
        multiplier_at_bps(t)
    }

    #[test_only]
    public fun inverse_multiplier_at_test(target: u64): u64 {
        inverse_multiplier_at(target)
    }
}
