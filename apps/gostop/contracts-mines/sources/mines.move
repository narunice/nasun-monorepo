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
/// - All pre-random assertions happen before random consumption.
/// - create_session enforces a 1-session-per-address invariant via the
///   MinesRegistry active_sessions table.
/// - Payout cap policy: the upfront check only ensures `bet_amount` itself
///   does not exceed cap.max_single_payout. The theoretical max multiplier
///   at high mine counts (e.g. C(25,7)=480700x) is so large that a
///   bet*max_mul check would force max bet to ~0. cashout silently clamps
///   payout to cap.max_single_payout so the pool stays bounded regardless.
#[allow(unused_const)]
module gostop_mines::mines {
    use sui::coin::Coin;
    use sui::clock::{Self, Clock};
    use sui::dynamic_field;
    use sui::dynamic_object_field as dof;
    use sui::event;
    use sui::random::{Self, Random};
    use sui::table::{Self, Table};
    use devnet_tokens::nusdc::NUSDC;
    use bankroll_pool::bankroll_pool::{Self, BankrollPool, GameCap, AdminCap as BpAdminCap};

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
    const STATUS_FORFEITED: u8 = 3;

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
    const EGameCapNotInOption: u64 = 12;
    const ESentinelNotRevoked: u64 = 13;
    const EWrongVersion: u64 = 14;
    const ELedgerAlreadyCurrent: u64 = 15;

    /// Bumped by every upgrade that must retire the one before it.
    const LEDGER_VERSION: u64 = 1;

    // ===== Dynamic Field Keys =====

    /// Key for the per-game max bet limit stored on MinesRegistry.
    public struct MaxBetKey has copy, drop, store {}

    /// Where the GameCap lives once `move_game_cap_to_field` has run. The
    /// pre-upgrade code only knows the `game_cap` option, so emptying it is
    /// what stops that code from opening sessions under the unpaired ledger.
    public struct GameCapKey has copy, drop, store {}

    /// Where the live GameCap sits once `migrate` has run. Every earlier
    /// version of this module looks only in GameCapKey or the `game_cap`
    /// option, so moving the cap here retires all of them at once: they find
    /// the revoked sentinel in the option and abort.
    public struct LiveCapKey has copy, drop, store {}

    /// u64 on the registry: the ledger version `migrate` last stamped. Every
    /// entry point asserts it equals LEDGER_VERSION, so the next upgrade only
    /// has to bump the constant and call `migrate` to retire this code too.
    public struct VersionKey has copy, drop, store {}

    /// u64 on a MinesSession: what `create_session` reserved for it. Absent on
    /// sessions opened by the pre-upgrade code, whose reservation the legacy
    /// `collect_bet` took and never booked against the game.
    public struct ReservedKey has copy, drop, store {}

    /// vector<u64> on MinesRegistry: reservations of sessions that ended
    /// without a payout (a mine, a forfeit). `reveal_cell` and
    /// `forfeit_session` do not take the pool, deliberately, so they queue
    /// the release and the next call holding the pool settles it.
    public struct PendingReleasesKey has copy, drop, store {}

    /// vector<u64> on MinesRegistry: the same queue for legacy sessions,
    /// released against the unattributed remainder instead of the game.
    public struct PendingLegacyReleasesKey has copy, drop, store {}

    /// u64 on MinesRegistry: sessions open under the paired ledger. The rest
    /// of `active_sessions` are legacy sessions.
    public struct PairedLiveKey has copy, drop, store {}

    /// u64 on MinesRegistry: the unit every legacy session is reserved and
    /// released at, pinned by the first `reset_legacy_exposure`. Without it the
    /// unit would follow max_single_payout, and a cap change while legacy
    /// sessions are open would release a different amount than was counted.
    public struct LegacyUnitKey has copy, drop, store {}

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
        outcome: u8, // STATUS_CASHED_OUT, STATUS_EXPLODED, or STATUS_FORFEITED
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
        assert!(!cap_installed(&registry.id, &registry.game_cap), EGameCapAlreadyInstalled);
        assert!(
            bankroll_pool::game_cap_id(&cap) == GAME_ID_SELF,
            EGameCapMismatch,
        );
        option::fill(&mut registry.game_cap, cap);
    }

    /// Set the per-bet upper limit enforced in create_session.
    /// Stored as a dynamic field so it survives package upgrades without
    /// requiring a struct layout change on MinesRegistry.
    public entry fun set_max_bet(
        _admin: &AdminCap,
        registry: &mut MinesRegistry,
        new_max: u64,
    ) {
        if (dynamic_field::exists_(&registry.id, MaxBetKey {})) {
            *dynamic_field::borrow_mut<MaxBetKey, u64>(&mut registry.id, MaxBetKey {}) = new_max;
        } else {
            dynamic_field::add(&mut registry.id, MaxBetKey {}, new_max);
        }
    }

    /// Adjust max_single_payout on the GameCap that lives inside the registry.
    /// Mirrors crash::update_max_payout_via_bp_admin: a single PTB holding both
    /// the Mines AdminCap and the BankrollPool AdminCap can mut-borrow the
    /// wrapped cap and bump its cap without uninstalling.
    public entry fun update_max_payout_via_bp_admin(
        _mines_admin: &AdminCap,
        bp_admin: &BpAdminCap,
        registry: &mut MinesRegistry,
        new_max: u64,
        clock: &Clock,
    ) {
        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);
        let cap = cap_mut(&mut registry.id, &mut registry.game_cap);
        bankroll_pool::update_max_payout(bp_admin, cap, new_max, clock);
    }

    /// Move the installed GameCap out of the `game_cap` option into a
    /// dynamic object field. The current code reads either place; the
    /// pre-upgrade code aborts with EGameCapNotInstalled once the option is
    /// empty, so from then on every session is opened, and every legacy
    /// session settled, by the paired code. Run after the frontend calls the
    /// upgraded package.
    public entry fun move_game_cap_to_field(
        _admin: &AdminCap,
        registry: &mut MinesRegistry,
    ) {
        assert!(!dof::exists_(&registry.id, LiveCapKey {}), EGameCapAlreadyInstalled);
        assert!(option::is_some(&registry.game_cap), EGameCapNotInOption);
        let cap = option::extract(&mut registry.game_cap);
        dof::add(&mut registry.id, GameCapKey {}, cap);
    }

    /// Retire every earlier version of this module. Moves the live GameCap
    /// to LiveCapKey, where neither the pre-ledger code nor the ledger code
    /// before this one can see it, and stamps LEDGER_VERSION, which every
    /// entry point of this version checks. Run once the frontend calls this
    /// package; until then this version reads the cap wherever it is.
    public entry fun migrate(
        _admin: &AdminCap,
        registry: &mut MinesRegistry,
    ) {
        if (dof::exists_(&registry.id, GameCapKey {})) {
            let cap: GameCap = dof::remove(&mut registry.id, GameCapKey {});
            dof::add(&mut registry.id, LiveCapKey {}, cap);
        } else if (
            option::is_some(&registry.game_cap)
                && !bankroll_pool::game_cap_revoked(option::borrow(&registry.game_cap))
        ) {
            // Never moved out of the option. A revoked sentinel there stays put.
            let cap = option::extract(&mut registry.game_cap);
            dof::add(&mut registry.id, LiveCapKey {}, cap);
        };
        assert!(dof::exists_(&registry.id, LiveCapKey {}), EGameCapNotInstalled);
        if (sui::dynamic_field::exists_(&registry.id, VersionKey {})) {
            let stamped: &mut u64 = sui::dynamic_field::borrow_mut(&mut registry.id, VersionKey {});
            assert!(*stamped < LEDGER_VERSION, ELedgerAlreadyCurrent);
            *stamped = LEDGER_VERSION;
        } else {
            sui::dynamic_field::add(&mut registry.id, VersionKey {}, LEDGER_VERSION);
        }
    }

    /// Park a revoked GameCap in the emptied `game_cap` option. The
    /// pre-upgrade code reads only that option: once it holds a revoked cap,
    /// its install_game_cap aborts on the occupied slot and every bet, payout
    /// or release it attempts aborts on the revocation (only moves that touch
    /// no bankroll call, such as a safe mines reveal, still pass), so no stale
    /// script or config can bring the unpaired path back. The live cap stays in the dynamic object
    /// field, which is all the current code reads.
    public entry fun seal_legacy_slot(
        _admin: &AdminCap,
        registry: &mut MinesRegistry,
        sentinel: GameCap,
    ) {
        assert!(
            dof::exists_(&registry.id, LiveCapKey {}) || dof::exists_(&registry.id, GameCapKey {}),
            EGameCapNotInstalled,
        );
        assert!(option::is_none(&registry.game_cap), EGameCapAlreadyInstalled);
        assert!(bankroll_pool::game_cap_revoked(&sentinel), ESentinelNotRevoked);
        assert!(bankroll_pool::game_cap_id(&sentinel) == GAME_ID_SELF, EGameCapMismatch);
        option::fill(&mut registry.game_cap, sentinel);
    }

    /// Settle every queued release. Anyone may call it: it only releases
    /// reservations of sessions that already ended.
    public entry fun flush_pending_releases(
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
    ) {
        assert_current(&registry.id);
        flush_pending(registry, pool, clock);
    }

    /// Set the pool's unattributed exposure to exactly the legacy mines
    /// sessions still open, each at the legacy unit: the `max_single_payout`
    /// the legacy `collect_bet` reserved, pinned here on first use so later
    /// releases stay at the counted amount whatever happens to the cap.
    ///
    /// Counted on chain in the same transaction, so a session that settles
    /// while the operator prepares this cannot be double counted. Mines is
    /// the only game still holding legacy reservations at rest once the other
    /// games' caps have moved (wheel and scratch settle in one transaction),
    /// which is why the pool-wide reset lives here. Run after every game's
    /// `move_game_cap_to_field`.
    public entry fun reset_legacy_exposure(
        _mines_admin: &AdminCap,
        bp_admin: &BpAdminCap,
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
    ) {
        assert_current(&registry.id);
        flush_pending(registry, pool, clock);
        let unit = legacy_unit(registry);
        if (!dynamic_field::exists_(&registry.id, LegacyUnitKey {})) {
            dynamic_field::add(&mut registry.id, LegacyUnitKey {}, unit);
        };
        let legacy_live = table::length(&registry.active_sessions) - paired_live(&registry.id);
        bankroll_pool::admin_reset_unattributed_exposure(bp_admin, pool, legacy_live * unit, clock);
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
        assert_current(&registry.id);
        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);
        flush_pending(registry, pool, clock);
        let cap = cap_ref(&registry.id, &registry.game_cap);

        let sender = tx_context::sender(ctx);
        let bet_amount = sui::coin::value(&bet_coin);

        // ===== Phase 1: Pre-random assertions =====
        assert!(bet_amount > 0, EZeroBet);
        assert!(mine_count >= MIN_MINES && mine_count <= MAX_MINES, EInvalidMineCount);
        assert!(
            !table::contains(&registry.active_sessions, sender),
            ESessionAlreadyActive,
        );

        // Bet must not exceed the admin-configured max bet. Falls back to
        // game_cap_max_payout if set_max_bet has never been called (e.g. old
        // registry objects before this upgrade).
        let max_bet = if (dynamic_field::exists_(&registry.id, MaxBetKey {})) {
            *dynamic_field::borrow<MaxBetKey, u64>(&registry.id, MaxBetKey {})
        } else {
            bankroll_pool::game_cap_max_payout(cap)
        };
        assert!(bet_amount <= max_bet, EBetTooLarge);

        // Reserve the most this session can ever pay: cashout clamps to
        // max_single_payout, and short of that a full board is the ceiling.
        let full_board = ((bet_amount as u128) * (max_multiplier_bps(mine_count) as u128)) / 10_000;
        let cap_max = bankroll_pool::game_cap_max_payout(cap);
        let reserved = if (full_board < (cap_max as u128)) { full_board as u64 } else { cap_max };
        bankroll_pool::reserve_exposure(pool, cap, reserved, clock);
        bankroll_pool::collect_bet_no_reserve(pool, cap, bet_coin, sender, clock);

        // ===== Phase 2: Random consumption (no abort past this point) =====
        let mine_positions = sample_mine_positions(r, mine_count, ctx);
        let revealed = init_revealed_vector();
        let now = clock::timestamp_ms(clock);

        let mut session = MinesSession {
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
        dynamic_field::add(&mut session.id, ReservedKey {}, reserved);
        let sid = object::id(&session);

        table::add(&mut registry.active_sessions, sender, sid);
        registry.total_sessions = registry.total_sessions + 1;
        let live = paired_live(&registry.id) + 1;
        set_paired_live(&mut registry.id, live);

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
        assert_current(&registry.id);
        let sender = tx_context::sender(ctx);
        assert!(session.player == sender, ENotSessionOwner);
        assert!(session.status == STATUS_ACTIVE, ESessionNotActive);
        assert!(cell_index < GRID_SIZE, ECellIndexOutOfRange);
        assert!(
            !*vector::borrow(&session.revealed, cell_index as u64),
            ECellAlreadyRevealed,
        );

        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);
        let cap = cap_ref(&registry.id, &registry.game_cap);
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

            queue_release(registry, &mut session);
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
    /// Silent clamp: payout is capped at cap.max_single_payout so the pool
    /// stays bounded even at extreme mine counts where bet * multiplier
    /// would otherwise blow past cap.
    entry fun cashout(
        mut session: MinesSession,
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert_current(&registry.id);
        let sender = tx_context::sender(ctx);
        assert!(session.player == sender, ENotSessionOwner);
        assert!(session.status == STATUS_ACTIVE, ESessionNotActive);
        assert!(session.safe_reveals > 0, ENoSafeReveals);
        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);

        flush_pending(registry, pool, clock);
        let reservation = take_reservation(&mut session);
        let cap = cap_ref(&registry.id, &registry.game_cap);
        let mul_bps = compute_multiplier_bps(session.mine_count, session.safe_reveals);
        let raw_payout = ((session.bet_amount as u128) * (mul_bps as u128) / 10000) as u64;
        let max_payout = bankroll_pool::game_cap_max_payout(cap);
        let payout = if (raw_payout > max_payout) { max_payout } else { raw_payout };

        let coin = bankroll_pool::pay_winner_no_release(
            pool,
            cap,
            payout,
            session.player,
            clock,
            ctx,
        );
        transfer::public_transfer(coin, session.player);
        let paired = option::is_some(&reservation);
        if (paired) {
            bankroll_pool::release_exposure(pool, cap, option::destroy_some(reservation), clock);
        } else {
            option::destroy_none(reservation);
            bankroll_pool::release_legacy_exposure(pool, cap, legacy_unit(registry), clock);
        };

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
        if (paired) {
            let live = paired_live(&registry.id) - 1;
            set_paired_live(&mut registry.id, live);
        };

        destroy_session(session);
    }

    /// Voluntary session forfeit. The bet has already been collected to the
    /// bankroll at create_session time; forfeit just clears the
    /// active_sessions table entry and destroys the owned session so the
    /// player can start a new game. The bet is treated as fully lost (no
    /// refund), which is consistent with the player abandoning a session
    /// they could have continued revealing or cashed out from.
    ///
    /// Primary use case: recover from a stuck active_sessions entry after
    /// the player's tab/wallet aborted mid-reveal. Without this, the
    /// 1-session-per-address invariant would lock them out of mines
    /// permanently.
    entry fun forfeit_session(
        mut session: MinesSession,
        registry: &mut MinesRegistry,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert_current(&registry.id);
        let sender = tx_context::sender(ctx);
        assert!(session.player == sender, ENotSessionOwner);
        assert!(session.status == STATUS_ACTIVE, ESessionNotActive);
        assert!(cap_installed(&registry.id, &registry.game_cap), EGameCapNotInstalled);

        let cap = cap_ref(&registry.id, &registry.game_cap);
        let sid = object::id(&session);
        let sid_bytes = sui::bcs::to_bytes(&sid);
        let now = clock::timestamp_ms(clock);

        // Cross-game result feed: forfeit is a complete loss (bet collected,
        // zero payout). Leaderboards and stats consumers can count it like
        // any other losing round.
        bankroll_pool::emit_game_result(
            cap,
            session.player,
            session.bet_amount,
            0,
            sid_bytes,
            clock,
        );

        event::emit(SessionFinished {
            session_id: sid,
            player: session.player,
            bet_amount: session.bet_amount,
            payout: 0,
            outcome: STATUS_FORFEITED,
            timestamp_ms: now,
        });

        table::remove(&mut registry.active_sessions, session.player);

        queue_release(registry, &mut session);
        destroy_session(session);
    }

    // ===== Internal =====

    /// Take the fields rather than the registry so callers can keep mutating
    /// the registry's counters while the cap is borrowed.
    fun cap_installed(id: &UID, slot: &Option<GameCap>): bool {
        dof::exists_(id, LiveCapKey {}) || dof::exists_(id, GameCapKey {}) || option::is_some(slot)
    }

    /// Abort unless the registry is stamped for this version, or not stamped
    /// yet (between this upgrade and its `migrate`).
    fun assert_current(id: &UID) {
        if (sui::dynamic_field::exists_(id, VersionKey {})) {
            assert!(
                *sui::dynamic_field::borrow<VersionKey, u64>(id, VersionKey {}) == LEDGER_VERSION,
                EWrongVersion,
            );
        }
    }

    fun cap_ref(id: &UID, slot: &Option<GameCap>): &GameCap {
        if (dof::exists_(id, LiveCapKey {})) {
            dof::borrow(id, LiveCapKey {})
        } else if (dof::exists_(id, GameCapKey {})) {
            dof::borrow(id, GameCapKey {})
        } else {
            option::borrow(slot)
        }
    }

    fun cap_mut(id: &mut UID, slot: &mut Option<GameCap>): &mut GameCap {
        if (dof::exists_(id, LiveCapKey {})) {
            dof::borrow_mut(id, LiveCapKey {})
        } else if (dof::exists_(id, GameCapKey {})) {
            dof::borrow_mut(id, GameCapKey {})
        } else {
            option::borrow_mut(slot)
        }
    }

    fun paired_live(id: &UID): u64 {
        if (dynamic_field::exists_(id, PairedLiveKey {})) {
            *dynamic_field::borrow<PairedLiveKey, u64>(id, PairedLiveKey {})
        } else {
            0
        }
    }

    fun set_paired_live(id: &mut UID, val: u64) {
        if (dynamic_field::exists_(id, PairedLiveKey {})) {
            *dynamic_field::borrow_mut<PairedLiveKey, u64>(id, PairedLiveKey {}) = val;
        } else {
            dynamic_field::add(id, PairedLiveKey {}, val);
        }
    }

    /// Remove and return the session's reservation; none for a legacy session.
    fun take_reservation(session: &mut MinesSession): Option<u64> {
        if (dynamic_field::exists_(&session.id, ReservedKey {})) {
            option::some(dynamic_field::remove<ReservedKey, u64>(&mut session.id, ReservedKey {}))
        } else {
            option::none()
        }
    }

    fun push_pending<K: copy + drop + store>(id: &mut UID, key: K, amount: u64) {
        if (dynamic_field::exists_(id, key)) {
            vector::push_back(dynamic_field::borrow_mut<K, vector<u64>>(id, key), amount);
        } else {
            dynamic_field::add(id, key, vector[amount]);
        }
    }

    fun take_pending<K: copy + drop + store>(id: &mut UID, key: K): vector<u64> {
        if (dynamic_field::exists_(id, key)) {
            dynamic_field::remove<K, vector<u64>>(id, key)
        } else {
            vector[]
        }
    }

    /// What a legacy session was reserved at: the pinned unit once
    /// `reset_legacy_exposure` has run, the current max_single_payout before.
    fun legacy_unit(registry: &MinesRegistry): u64 {
        if (dynamic_field::exists_(&registry.id, LegacyUnitKey {})) {
            *dynamic_field::borrow<LegacyUnitKey, u64>(&registry.id, LegacyUnitKey {})
        } else {
            bankroll_pool::game_cap_max_payout(cap_ref(&registry.id, &registry.game_cap))
        }
    }

    /// Queue the release of a session that ended without a payout. A legacy
    /// session queues its legacy unit.
    fun queue_release(registry: &mut MinesRegistry, session: &mut MinesSession) {
        let reservation = take_reservation(session);
        if (option::is_some(&reservation)) {
            push_pending(&mut registry.id, PendingReleasesKey {}, option::destroy_some(reservation));
            let live = paired_live(&registry.id) - 1;
            set_paired_live(&mut registry.id, live);
        } else {
            option::destroy_none(reservation);
            let unit = legacy_unit(registry);
            push_pending(&mut registry.id, PendingLegacyReleasesKey {}, unit);
        }
    }

    /// One release per queued session, so reserve and release counts still
    /// pair one to one.
    fun flush_pending(registry: &mut MinesRegistry, pool: &mut BankrollPool, clock: &Clock) {
        let mut paired = take_pending(&mut registry.id, PendingReleasesKey {});
        let mut legacy = take_pending(&mut registry.id, PendingLegacyReleasesKey {});
        if (vector::is_empty(&paired) && vector::is_empty(&legacy)) return;
        let cap = cap_ref(&registry.id, &registry.game_cap);
        while (!vector::is_empty(&paired)) {
            bankroll_pool::release_exposure(pool, cap, vector::pop_back(&mut paired), clock);
        };
        while (!vector::is_empty(&legacy)) {
            bankroll_pool::release_legacy_exposure(pool, cap, vector::pop_back(&mut legacy), clock);
        };
    }

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
        cap_installed(&r.id, &r.game_cap)
    }

    public fun has_active_session(r: &MinesRegistry, player: address): bool {
        table::contains(&r.active_sessions, player)
    }

    /// Stamp an arbitrary version, standing in for a later upgrade's migrate.
    #[test_only]
    public fun stamp_version_for_testing(registry: &mut MinesRegistry, version: u64) {
        if (sui::dynamic_field::exists_(&registry.id, VersionKey {})) {
            *sui::dynamic_field::borrow_mut<VersionKey, u64>(&mut registry.id, VersionKey {}) = version;
        } else {
            sui::dynamic_field::add(&mut registry.id, VersionKey {}, version);
        }
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test_only]
    public fun create_session_for_testing(
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        mine_count: u8,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        create_session(registry, pool, bet_coin, mine_count, r, clock, ctx);
    }

    /// What the pre-upgrade `create_session` left behind: a legacy
    /// `collect_bet` reservation and a session with no ReservedKey.
    #[test_only]
    public fun create_legacy_session_for_testing(
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        bet_coin: Coin<NUSDC>,
        mine_count: u8,
        r: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = tx_context::sender(ctx);
        let bet_amount = sui::coin::value(&bet_coin);
        bankroll_pool::collect_bet(pool, cap_ref(&registry.id, &registry.game_cap), bet_coin, sender, clock);
        let session = MinesSession {
            id: object::new(ctx),
            player: sender,
            bet_amount,
            mine_count,
            mine_positions: sample_mine_positions(r, mine_count, ctx),
            revealed: init_revealed_vector(),
            safe_reveals: 0,
            status: STATUS_ACTIVE,
            created_at: clock::timestamp_ms(clock),
        };
        table::add(&mut registry.active_sessions, sender, object::id(&session));
        transfer::transfer(session, sender);
    }

    #[test_only]
    public fun reveal_cell_for_testing(
        session: MinesSession,
        registry: &mut MinesRegistry,
        cell_index: u8,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        reveal_cell(session, registry, cell_index, clock, ctx);
    }

    #[test_only]
    public fun cashout_for_testing(
        session: MinesSession,
        registry: &mut MinesRegistry,
        pool: &mut BankrollPool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        cashout(session, registry, pool, clock, ctx);
    }

    #[test_only]
    public fun forfeit_for_testing(
        session: MinesSession,
        registry: &mut MinesRegistry,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        forfeit_session(session, registry, clock, ctx);
    }

    #[test_only]
    public fun mine_positions_for_testing(s: &MinesSession): vector<u8> {
        s.mine_positions
    }

    #[test_only]
    public fun max_multiplier_bps_for_testing(mine_count: u8): u64 {
        max_multiplier_bps(mine_count)
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
    fun test_payout_clamp_at_cap() {
        // Pure clamp logic: at extreme mine counts a 1 NUSDC bet would
        // theoretically pay millions. The cashout silent-clamp must cap
        // payout to max_single_payout. This test mirrors the clamp formula
        // used inside `cashout`.
        let bet: u64 = 1_000_000;            // 1 NUSDC
        let cap: u64 = 2_000_000_000;        // 2,000 NUSDC
        let mul_bps = compute_multiplier_bps(7, 18);
        let raw = ((bet as u128) * (mul_bps as u128) / 10000) as u64;
        let clamped = if (raw > cap) { cap } else { raw };
        assert!(raw > cap);
        assert!(clamped == cap);
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
