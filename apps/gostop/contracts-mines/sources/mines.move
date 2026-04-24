/// GoStop Mines Module (devnet prototype)
///
/// 5x5 grid Mines: player sets bet amount + mine count, reveals cells one
/// at a time, and may cash out after revealing at least one safe cell.
/// Hitting a mine ends the session with zero payout.
///
/// Shares liquidity with the gostop BankrollPool via the standard
/// Registry + GameCap install pattern (same as Lottery / ScratchCard /
/// NumberMatch). Bet collection and payouts flow through BankrollPool.
///
/// === DEVNET ONLY ===
/// MinesSession.mine_positions is an owned-object field, which means any
/// RPC caller can read it via getObject(showContent: true). This is a
/// fairness concern that is explicitly scoped to devnet prototype. It is
/// mitigated by a low cap.max_single_payout (set at bootstrap to bet * 5)
/// so a mine-position leak still bounds pool drain.
/// Before mainnet: switch to encrypted placement (ECIES + house key) or
/// commit-reveal. CI grep rule should block any view function exposing
/// `mine_positions`.
///
/// Security notes:
/// - `create_session` is `entry` (not `public entry`). `&Random` is
///   consumed; plain entry prevents PTB composition abuse.
/// - `reveal_cell` and `cashout` take `session: MinesSession` by value so
///   the module can `object::delete` on mine hit / cashout. Safe reveals
///   transfer the session back to the sender.
/// - All pre-random assertions (including bet-too-large clamp against
///   cap.max_single_payout) happen before random consumption.
/// - create_session enforces a 1-session-per-address invariant via the
///   MinesRegistry active_sessions table. No silent payout clamp on
///   cashout: oversized bets are rejected up-front with EBetTooLarge.
#[allow(unused_const)]
module gostop_mines::mines {
    use sui::coin::Coin;
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::random::{Self, Random};
    use sui::table::{Self, Table};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap};

    // ===== Constants =====

    const GRID_SIZE: u8 = 25;                  // 5x5
    const MIN_MINES: u8 = 1;
    const MAX_MINES: u8 = 24;

    const HOUSE_EDGE_BPS: u64 = 300;           // 3% edge => 97% RTP

    /// game_id assigned by BankrollPool for mines. Must match the value
    /// used in `bankroll_pool::issue_game_cap` at bootstrap.
    const GAME_ID_SELF: u8 = 5;

    // Status codes
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_CASHED_OUT: u8 = 1;
    const STATUS_EXPLODED: u8 = 2;

    // ===== Error Codes =====

    const EInvalidMineCount: u64 = 0;
    const ESessionNotActive: u64 = 1;
    const ECellAlreadyRevealed: u64 = 2;
    const ECellIndexOutOfRange: u64 = 3;
    const ENotSessionOwner: u64 = 4;
    const EZeroBet: u64 = 5;
    const ENoSafeReveals: u64 = 6;
    const EBetTooLarge: u64 = 7;
    const ESessionAlreadyActive: u64 = 8;
    const EGameCapAlreadyInstalled: u64 = 9;
    const EGameCapNotInstalled: u64 = 10;
    const EGameCapMismatch: u64 = 11;

    // ===== Structs =====

    public struct AdminCap has key, store {
        id: UID,
    }

    /// Shared registry. Holds the installed GameCap and a map of active
    /// sessions for the 1-session-per-address invariant.
    public struct MinesRegistry has key {
        id: UID,
        game_cap: Option<GameCap>,
        active_sessions: Table<address, ID>,
        total_sessions: u64,
        total_cashouts: u64,
        total_explosions: u64,
    }

    /// Owned per-session object. DEVNET ONLY: mine_positions is visible
    /// via getObject RPC. See module doc.
    public struct MinesSession has key {
        id: UID,
        player: address,
        bet_amount: u64,
        mine_count: u8,
        mine_positions: vector<u8>,
        revealed: vector<bool>,
        safe_reveals: u8,
        status: u8,
        created_at: u64,
    }

    // ===== Events =====

    public struct SessionCreated has copy, drop {
        session_id: ID,
        player: address,
        bet_amount: u64,
        mine_count: u8,
        timestamp_ms: u64,
    }

    public struct CellRevealed has copy, drop {
        session_id: ID,
        player: address,
        cell_index: u8,
        is_mine: bool,
        safe_reveals: u8,
        multiplier_bps: u64, // 0 when mine; basis points otherwise
    }

    public struct SessionFinished has copy, drop {
        session_id: ID,
        player: address,
        bet_amount: u64,
        payout: u64,
        outcome: u8, // STATUS_CASHED_OUT or STATUS_EXPLODED
        timestamp_ms: u64,
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        transfer::transfer(
            AdminCap { id: object::new(ctx) },
            tx_context::sender(ctx),
        );
        transfer::share_object(MinesRegistry {
            id: object::new(ctx),
            game_cap: option::none(),
            active_sessions: table::new(ctx),
            total_sessions: 0,
            total_cashouts: 0,
            total_explosions: 0,
        });
    }

    // ===== Admin =====

    public entry fun install_game_cap(
        _admin: &AdminCap,
        registry: &mut MinesRegistry,
        cap: GameCap,
    ) {
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    // ===== Core =====

    /// Create a new session. entry-only (not `public entry`) because
    /// `&Random` is consumed. Enforces the 1-session-per-address
    /// invariant and the cap.max_single_payout bound.
    entry fun create_session(
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        mine_count: u8,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&registry.game_cap), EGameCapNotInstalled);
        let cap = option::borrow(&registry.game_cap);

        let sender = tx_context::sender(ctx);
        let bet_amount = sui::coin::value(&bet_coin);

        // ===== Phase 1: Pre-random assertions =====
        assert!(bet_amount > 0, EZeroBet);
        assert!(mine_count >= MIN_MINES && mine_count <= MAX_MINES, EInvalidMineCount);
        assert!(
            !table::contains(&registry.active_sessions, sender),
            ESessionAlreadyActive,
        );

        // Max theoretical multiplier: reveal every safe cell.
        let max_mul_bps = max_multiplier_bps(mine_count);
        let max_payout = ((bet_amount as u128) * (max_mul_bps as u128) / 10000) as u64;
        assert!(
            max_payout <= bankroll_pool::game_cap_max_payout(cap),
            EBetTooLarge,
        );

        // Collect bet.
        bankroll_pool::collect_bet(pool, cap, bet_coin, sender, clock);

        // ===== Phase 2: Random consumption (no abort past this point) =====
        let mine_positions = sample_mine_positions(r, mine_count, ctx);
        let revealed = init_revealed_vector();
        let now = clock::timestamp_ms(clock);

        let session = MinesSession {
            id: object::new(ctx),
            player: sender,
            bet_amount,
            mine_count,
            mine_positions,
            revealed,
            safe_reveals: 0,
            status: STATUS_ACTIVE,
            created_at: now,
        };
        let sid = object::id(&session);

        table::add(&mut registry.active_sessions, sender, sid);
        registry.total_sessions = registry.total_sessions + 1;

        event::emit(SessionCreated {
            session_id: sid,
            player: sender,
            bet_amount,
            mine_count,
            timestamp_ms: now,
        });

        transfer::transfer(session, sender);
    }

    /// Reveal a cell. By-value session so mine hit can consume + delete.
    /// On safe reveal we transfer the session back to sender so they can
    /// keep revealing or call cashout.
    ///
    /// Intentionally does NOT take `&mut BankrollPool`: reveal does not
    /// collect or pay anything (mine hit just emits a loss result), so
    /// skipping the pool ref avoids serializing rapid reveals behind
    /// every other game's BankrollPool writes.
    entry fun reveal_cell(
        mut session: MinesSession,
        registry: &mut MinesRegistry,
        cell_index: u8,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(session.player == sender, ENotSessionOwner);
        assert!(session.status == STATUS_ACTIVE, ESessionNotActive);
        assert!(cell_index < GRID_SIZE, ECellIndexOutOfRange);
        assert!(
            !*vector::borrow(&session.revealed, cell_index as u64),
            ECellAlreadyRevealed,
        );

        let cap = option::borrow(&registry.game_cap);
        *vector::borrow_mut(&mut session.revealed, cell_index as u64) = true;

        let is_mine = vector::contains(&session.mine_positions, &cell_index);
        let sid = object::id(&session);
        let now = clock::timestamp_ms(clock);

        if (is_mine) {
            session.status = STATUS_EXPLODED;

            let sid_bytes = sui::bcs::to_bytes(&sid);
            bankroll_pool::emit_game_result(
                cap,
                session.player,
                session.bet_amount,
                0,
                sid_bytes,
                clock,
            );

            event::emit(CellRevealed {
                session_id: sid,
                player: session.player,
                cell_index,
                is_mine: true,
                safe_reveals: session.safe_reveals,
                multiplier_bps: 0,
            });
            event::emit(SessionFinished {
                session_id: sid,
                player: session.player,
                bet_amount: session.bet_amount,
                payout: 0,
                outcome: STATUS_EXPLODED,
                timestamp_ms: now,
            });

            table::remove(&mut registry.active_sessions, session.player);
            registry.total_explosions = registry.total_explosions + 1;

            destroy_session(session);
        } else {
            session.safe_reveals = session.safe_reveals + 1;
            let mul_bps = compute_multiplier_bps(session.mine_count, session.safe_reveals);

            event::emit(CellRevealed {
                session_id: sid,
                player: session.player,
                cell_index,
                is_mine: false,
                safe_reveals: session.safe_reveals,
                multiplier_bps: mul_bps,
            });

            transfer::transfer(session, sender);
        }
    }

    /// Cash out. By-value so the session can be destroyed after payout.
    /// No silent clamp: max_single_payout was checked up-front in
    /// create_session, so payout cannot exceed cap here.
    entry fun cashout(
        session: MinesSession,
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        assert!(session.player == sender, ENotSessionOwner);
        assert!(session.status == STATUS_ACTIVE, ESessionNotActive);
        assert!(session.safe_reveals > 0, ENoSafeReveals);

        let cap = option::borrow(&registry.game_cap);
        let mul_bps = compute_multiplier_bps(session.mine_count, session.safe_reveals);
        let payout = ((session.bet_amount as u128) * (mul_bps as u128) / 10000) as u64;

        let coin = bankroll_pool::pay_winner(
            pool,
            cap,
            payout,
            session.player,
            clock,
            ctx,
        );
        transfer::public_transfer(coin, session.player);

        let sid = object::id(&session);
        let sid_bytes = sui::bcs::to_bytes(&sid);
        let now = clock::timestamp_ms(clock);

        bankroll_pool::emit_game_result(
            cap,
            session.player,
            session.bet_amount,
            payout,
            sid_bytes,
            clock,
        );

        event::emit(SessionFinished {
            session_id: sid,
            player: session.player,
            bet_amount: session.bet_amount,
            payout,
            outcome: STATUS_CASHED_OUT,
            timestamp_ms: now,
        });

        table::remove(&mut registry.active_sessions, session.player);
        registry.total_cashouts = registry.total_cashouts + 1;

        destroy_session(session);
    }

    // ===== Internal =====

    fun destroy_session(session: MinesSession) {
        let MinesSession {
            id,
            player: _,
            bet_amount: _,
            mine_count: _,
            mine_positions: _,
            revealed: _,
            safe_reveals: _,
            status: _,
            created_at: _,
        } = session;
        object::delete(id);
    }

    fun init_revealed_vector(): vector<bool> {
        let mut v = vector::empty<bool>();
        let mut i: u64 = 0;
        while (i < (GRID_SIZE as u64)) {
            vector::push_back(&mut v, false);
            i = i + 1;
        };
        v
    }

    /// Sample `count` unique positions from [0, GRID_SIZE) using a
    /// Fisher-Yates style partial shuffle. Avoids rejection sampling so
    /// gas stays bounded even at MAX_MINES.
    fun sample_mine_positions(
        r: &Random,
        count: u8,
        ctx: &mut TxContext,
    ): vector<u8> {
        let mut g = random::new_generator(r, ctx);
        let mut pool = vector::empty<u8>();
        let mut i: u8 = 0;
        while (i < GRID_SIZE) {
            vector::push_back(&mut pool, i);
            i = i + 1;
        };

        let mut picks = vector::empty<u8>();
        let mut remaining = GRID_SIZE;
        let mut k: u8 = 0;
        while (k < count) {
            let idx = random::generate_u8_in_range(&mut g, 0, remaining - 1);
            let chosen = *vector::borrow(&pool, idx as u64);
            vector::push_back(&mut picks, chosen);
            // Swap-remove: move last element into the chosen slot.
            let last = vector::pop_back(&mut pool);
            if ((idx as u64) < vector::length(&pool)) {
                *vector::borrow_mut(&mut pool, idx as u64) = last;
            };
            remaining = remaining - 1;
            k = k + 1;
        };
        picks
    }

    /// Multiplier in basis points (10000 = 1.00x) after `safe_reveals`
    /// successful reveals with `mine_count` mines on the board.
    ///
    /// M(k) = PROD_{i=0}^{k-1} (n - i) / (n - m - i) * (1 - edge)
    /// where n = GRID_SIZE, m = mine_count, k = safe_reveals.
    ///
    /// Computed with step-wise multiply-then-divide to keep the u128
    /// accumulator bounded. Final result clamped to >= 10000 bps so the
    /// very first safe reveal never pays below 1.00x even with edge
    /// applied at extreme boards.
    fun compute_multiplier_bps(mine_count: u8, safe_reveals: u8): u64 {
        let n = GRID_SIZE as u128;
        let m = mine_count as u128;
        let k = safe_reveals as u128;

        let mut result: u128 = 10000;
        let mut i: u128 = 0;
        while (i < k) {
            let safe = n - m - i;
            let total = n - i;
            // Step-wise divide keeps result bounded.
            result = result * total / safe;
            i = i + 1;
        };
        let after_edge = result * ((10000 - HOUSE_EDGE_BPS) as u128) / 10000;
        let clamped = if (after_edge < 10000) { 10000u128 } else { after_edge };
        clamped as u64
    }

    /// Theoretical maximum multiplier for a given mine count (reveal all
    /// safe cells). Used for the cap.max_single_payout pre-check.
    fun max_multiplier_bps(mine_count: u8): u64 {
        let safe_cells = GRID_SIZE - mine_count;
        compute_multiplier_bps(mine_count, safe_cells)
    }

    // ===== Views =====

    public fun grid_size(): u8 { GRID_SIZE }
    public fun mine_range(): (u8, u8) { (MIN_MINES, MAX_MINES) }
    public fun house_edge_bps(): u64 { HOUSE_EDGE_BPS }

    public fun multiplier_bps(mine_count: u8, safe_reveals: u8): u64 {
        compute_multiplier_bps(mine_count, safe_reveals)
    }

    public fun session_owner(s: &MinesSession): address { s.player }
    public fun session_status(s: &MinesSession): u8 { s.status }
    public fun session_bet(s: &MinesSession): u64 { s.bet_amount }
    public fun session_mine_count(s: &MinesSession): u8 { s.mine_count }
    public fun session_safe_reveals(s: &MinesSession): u8 { s.safe_reveals }
    public fun session_revealed(s: &MinesSession): vector<bool> { s.revealed }

    public fun registry_stats(r: &MinesRegistry): (u64, u64, u64) {
        (r.total_sessions, r.total_cashouts, r.total_explosions)
    }

    public fun is_game_cap_installed(r: &MinesRegistry): bool {
        option::is_some(&r.game_cap)
    }

    public fun has_active_session(r: &MinesRegistry, player: address): bool {
        table::contains(&r.active_sessions, player)
    }

    // ===== Pure-logic tests =====

    #[test]
    fun test_multiplier_mine1_k1() {
        // mines=1, k=1: 25/24 * 0.97 = 1.0104x => 10104 bps
        let bps = compute_multiplier_bps(1, 1);
        // Allow ±5 bps for integer truncation.
        assert!(bps >= 10099 && bps <= 10109);
    }

    #[test]
    fun test_multiplier_mine1_k24() {
        // mines=1, k=24: product of 25!/(24!*1) terms => 25 then * 0.97
        // = 24.25x => 242500 bps
        let bps = compute_multiplier_bps(1, 24);
        assert!(bps >= 242000 && bps <= 243000);
    }

    #[test]
    fun test_multiplier_mine24_k1() {
        // mines=24, k=1: 25/1 * 0.97 = 24.25x => 242500 bps
        let bps = compute_multiplier_bps(24, 1);
        assert!(bps >= 242000 && bps <= 243000);
    }

    #[test]
    fun test_multiplier_k0_clamped() {
        // safe_reveals=0 should clamp to 10000 (1.00x). cashout reverts
        // on k=0 via ENoSafeReveals, but the pure function should still
        // return a floor value.
        let bps = compute_multiplier_bps(5, 0);
        assert!(bps == 10000);
    }

    #[test]
    fun test_max_multiplier_matches_full_reveal() {
        // max_multiplier_bps(m) should equal compute_multiplier_bps(m, n-m).
        let m = 3u8;
        let direct = compute_multiplier_bps(m, GRID_SIZE - m);
        let via_max = max_multiplier_bps(m);
        assert!(direct == via_max);
    }

    #[test]
    fun test_constants_consistency() {
        assert!(MAX_MINES < GRID_SIZE);
        assert!(MIN_MINES >= 1);
        assert!(HOUSE_EDGE_BPS < 10000);
    }

    #[test]
    fun test_status_codes_distinct() {
        assert!(STATUS_ACTIVE != STATUS_CASHED_OUT);
        assert!(STATUS_ACTIVE != STATUS_EXPLODED);
        assert!(STATUS_CASHED_OUT != STATUS_EXPLODED);
    }
}
