/// GoStop BankrollPool Module (v3)
///
/// Shared NUSDC bankroll for all gostop games.
/// Treasury-seeded on devnet; optional community LP (soulbound, 24h cooldown).
/// Per-game GameCap gates all pool writes; max_single_payout is the per-call cap.
/// Emits a standardized GameResult event for leaderboard aggregation.
///
/// Security hardening over v1 (2026-04-24 audit):
/// - treasury_deposit now requires GameCap (closes LP inflation donation vector).
/// - provide_liquidity enforces MIN_LP_DEPOSIT to resist inflation attacks.
/// - Virtual-offset share math (ERC4626-style) as belt-and-suspenders.
/// - LPToken is soulbound (no store); redeem recipient is tx sender.
/// - emit_game_result uses cap.game_id (no caller spoof); session_id is vector<u8>
///   so ephemeral games (crash, plinko) do not need a per-round object.
///
/// Tier 1.0 spike finding 5.3 fix (2026-05-18):
/// - seed_pool_shares: admin-only, idempotent. Locks pre-existing pool.balance
///   (e.g. treasury_deposit seed) into total_shares so the first public LP cannot
///   absorb the unshared seed via the `total_shares == 0` fast-path.
/// - set_utilization_cap + collect_bet check: admin-set advisory cap that
///   rejects new bets when a GameCap's max_single_payout exceeds cap_bps of
///   current pool balance. cap_bps == 0 disables (default). Stored in a
///   sui::dynamic_field so BankrollPool struct layout is unchanged, keeping
///   the v0.0.2 -> v0.0.3 path safe under UpgradeCap compatible policy.
///
/// Tier 1 post-cleanup §10.B Liability-aware NAV (v0.0.4, 2026-05-19):
/// - open_exposure: live sum of max_single_payouts reserved across in-flight
///   rounds. collect_bet adds cap.max_single_payout; pay_winner and refund_bet
///   release the same amount. Stored as a dynamic_field (b"open_exposure")
///   so BankrollPool layout stays compatible with v0.0.2/v0.0.3 instances.
/// - utilization cap semantics tighten: now compares the cumulative reservation
///   (open_exposure + new cap.max_single_payout) to pool.balance, instead of
///   only the new bet's max. Cap_bps == 0 still disables.
/// - Game contracts (scratchcard, numbermatch, mines, wheel) need no changes —
///   they already pass `cap: &GameCap` to collect_bet/pay_winner/refund_bet,
///   and the reservation unit is taken from cap.max_single_payout internally.
/// - OpenExposureSnapshot event emitted after every collect/pay/refund so the
///   indexer can backfill the per-event open_exposure_after column (Migration
///   006). Reconciler pattern mirrors total_shares_after (PR-A).
module bankroll_pool::bankroll_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::dynamic_field as df;
    use devnet_tokens::nusdc::NUSDC;

    // ===== Constants =====
    const EXIT_COOLDOWN_MS: u64 = 86_400_000; // 24h
    const MIN_POOL_BALANCE: u64 = 100_000_000; // 100 NUSDC safety margin (6 decimals)
    const MIN_LP_DEPOSIT: u64 = 10_000_000;    // 10 NUSDC minimum LP deposit
    const SHARE_PRICE_SCALE: u128 = 1_000_000_000; // 1e9 fixed-point for share math
    const CAP_BPS_DENOM: u128 = 10_000;        // basis-point denominator (100% = 10000)
    const MAX_CAP_BPS: u64 = 10_000;           // utilization cap upper bound (100%)

    // dynamic_field key for utilization_cap_bps (u64). v0.0.3 addition; absent on
    // freshly initialized v0.0.2 pools (read defaults to 0 = disabled).
    const UTILIZATION_KEY: vector<u8> = b"utilization_cap_bps";

    // v0.0.4 dynamic_field key for open_exposure (u64). Absent on v0.0.3 and
    // older pools (read defaults to 0). First call to collect_bet on an
    // upgraded pool initializes the field via df::add.
    const OPEN_EXPOSURE_KEY: vector<u8> = b"open_exposure";

    // ===== Errors =====
    const EInsufficientPoolBalance: u64 = 1;
    const EGameCapRevoked: u64 = 2;
    const EPaused: u64 = 3;
    const ECooldownNotElapsed: u64 = 4;
    const ECooldownNotRequested: u64 = 5;
    const EInvalidAmount: u64 = 6;
    const EPayoutExceedsCap: u64 = 7;
    const EDepositTooSmall: u64 = 8;
    // v0.0.3 additions
    const EAlreadySeeded: u64 = 9;
    const EEmptyPool: u64 = 10;
    const EInvalidCapBps: u64 = 11;
    const EUtilizationCapExceeded: u64 = 12;
    const EReserveExceedsCap: u64 = 13;

    // ===== Capabilities =====

    /// Global admin capability (issued at init to deployer).
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Per-game capability. Admin issues one per game module.
    /// Holding this allows collect_bet / pay_winner / treasury_deposit /
    /// emit_game_result / refund_bet.
    public struct GameCap has key, store {
        id: UID,
        game_id: u8,           // 1=lottery, 2=scratch, 3=numbermatch, 4=crash, ...
        name: vector<u8>,      // ASCII label for events/debug
        max_single_payout: u64,
        revoked: bool,
    }

    // ===== Pool & LP =====

    /// Shared bankroll pool.
    public struct BankrollPool has key {
        id: UID,
        balance: Balance<NUSDC>,
        total_shares: u128,
        paused: bool,
        // Per-game stats (analytics)
        game_cumulative_bets: Table<u8, u64>,
        game_cumulative_payouts: Table<u8, u64>,
    }

    /// LP position (soulbound: no `store` ability, not transferable).
    /// Lifecycle: provide_liquidity -> request_withdraw (starts cooldown)
    ///   -> redeem_liquidity (after 24h; consumes token, coin to tx sender).
    public struct LPToken has key {
        id: UID,
        shares: u128,
        deposit_time: u64,
        withdraw_requested_at: Option<u64>,
    }

    // ===== Events =====

    public struct BetCollected has copy, drop {
        game_id: u8,
        player: address,
        amount: u64,
        timestamp_ms: u64,
    }

    public struct WinnerPaid has copy, drop {
        game_id: u8,
        player: address,
        amount: u64,
        timestamp_ms: u64,
    }

    public struct BetRefunded has copy, drop {
        game_id: u8,
        player: address,
        amount: u64,
        reason_code: u8,
        timestamp_ms: u64,
    }

    public struct LiquidityProvided has copy, drop {
        provider: address,
        amount: u64,
        shares: u128,
        timestamp_ms: u64,
    }

    public struct WithdrawRequested has copy, drop {
        provider: address,
        shares: u128,
        requested_at: u64,
        claimable_at: u64,
    }

    public struct LiquidityRedeemed has copy, drop {
        provider: address,
        amount: u64,
        shares: u128,
        timestamp_ms: u64,
    }

    public struct TreasuryDeposited has copy, drop {
        source_game_id: u8,
        amount: u64,
        timestamp_ms: u64,
    }

    public struct PoolPausedToggled has copy, drop {
        paused: bool,
        timestamp_ms: u64,
    }

    public struct GameCapRevokedEvent has copy, drop {
        cap_id: ID,
        game_id: u8,
        timestamp_ms: u64,
    }

    public struct GameCapMaxPayoutUpdated has copy, drop {
        cap_id: ID,
        game_id: u8,
        old_max: u64,
        new_max: u64,
        timestamp_ms: u64,
    }

    // v0.0.3: one-shot seed lock and admin utilization cap updates.
    public struct PoolSharesSeeded has copy, drop {
        seed_amount: u64,
        seed_shares: u128,
        timestamp_ms: u64,
    }

    public struct UtilizationCapUpdated has copy, drop {
        old_cap_bps: u64,
        new_cap_bps: u64,
        timestamp_ms: u64,
    }

    /// v0.0.4: emitted after every collect_bet / pay_winner / refund_bet so
    /// the indexer can snapshot live max-liability exposure per bankroll event.
    /// `delta_signed` is +N for collect_bet (reserve), -N for pay_winner /
    /// refund_bet (release). `open_exposure_after` is the post-event total.
    public struct OpenExposureSnapshot has copy, drop {
        game_id: u8,
        // Move has no signed primitive; encode sign in a flag + abs delta.
        delta_is_release: bool,
        delta_abs: u64,
        open_exposure_after: u64,
        timestamp_ms: u64,
    }

    /// Standardized cross-game result. Leaderboard subscribes to this single type.
    public struct GameResult has copy, drop {
        game_id: u8,
        player: address,
        bet_amount: u64,
        payout: u64,
        multiplier_bps: u64,     // basis points, 10000 = 1.00x
        timestamp_ms: u64,
        session_id: vector<u8>,  // caller-defined bytes (e.g., round_id, (round,nonce))
    }

    // ===== Init =====

    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        transfer::transfer(AdminCap { id: object::new(ctx) }, sender);
        transfer::share_object(BankrollPool {
            id: object::new(ctx),
            balance: balance::zero(),
            total_shares: 0,
            paused: false,
            game_cumulative_bets: table::new(ctx),
            game_cumulative_payouts: table::new(ctx),
        });
    }

    // ===== Admin Functions =====

    /// Issue a GameCap to a game module's admin.
    public fun issue_game_cap(
        _admin: &AdminCap,
        game_id: u8,
        name: vector<u8>,
        max_single_payout: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        transfer::transfer(
            GameCap {
                id: object::new(ctx),
                game_id,
                name,
                max_single_payout,
                revoked: false,
            },
            recipient
        );
    }

    public fun revoke_game_cap(
        _admin: &AdminCap,
        cap: &mut GameCap,
        clock: &Clock,
    ) {
        cap.revoked = true;
        event::emit(GameCapRevokedEvent {
            cap_id: object::id(cap),
            game_id: cap.game_id,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public fun update_max_payout(
        _admin: &AdminCap,
        cap: &mut GameCap,
        new_max: u64,
        clock: &Clock,
    ) {
        let old = cap.max_single_payout;
        cap.max_single_payout = new_max;
        event::emit(GameCapMaxPayoutUpdated {
            cap_id: object::id(cap),
            game_id: cap.game_id,
            old_max: old,
            new_max,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public fun set_paused(
        _admin: &AdminCap,
        pool: &mut BankrollPool,
        paused: bool,
        clock: &Clock,
    ) {
        pool.paused = paused;
        event::emit(PoolPausedToggled {
            paused,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// v0.0.3: lock the pre-existing pool balance into total_shares so the
    /// first public LP cannot absorb unshared seed via the
    /// `total_shares == 0` fast-path of provide_liquidity (Tier 1.0 finding 5.3).
    ///
    /// Constraints:
    /// - admin-only via AdminCap
    /// - requires pool.total_shares == 0 (idempotent: a second call aborts)
    /// - requires pool.balance > 0 (no point seeding an empty pool)
    ///
    /// Effect: total_shares := pool.balance (as u128). No LPToken is minted,
    /// so the seed shares are permanently un-redeemable -- effectively burned.
    /// After this call share_price_scaled returns SHARE_PRICE_SCALE (1.0 pps).
    ///
    /// Once any real LP has provided liquidity, total_shares can never return
    /// to 0 without burning all LPTokens, so EAlreadySeeded permanently locks
    /// re-seeding.
    public fun seed_pool_shares(
        _admin: &AdminCap,
        pool: &mut BankrollPool,
        clock: &Clock,
    ) {
        let bal = balance::value(&pool.balance);
        assert!(bal > 0, EEmptyPool);
        assert!(pool.total_shares == 0, EAlreadySeeded);
        let seed_shares = bal as u128;
        pool.total_shares = seed_shares;
        event::emit(PoolSharesSeeded {
            seed_amount: bal,
            seed_shares,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// v0.0.3: set the global utilization cap (basis points). cap_bps == 0
    /// disables the cap (default state on freshly-published v0.0.3 pools).
    /// When non-zero, collect_bet rejects bets whose calling GameCap's
    /// max_single_payout exceeds cap_bps of current pool.balance.
    public fun set_utilization_cap(
        _admin: &AdminCap,
        pool: &mut BankrollPool,
        cap_bps: u64,
        clock: &Clock,
    ) {
        assert!(cap_bps <= MAX_CAP_BPS, EInvalidCapBps);
        let old_cap_bps = read_utilization_cap_bps(pool);
        if (df::exists_(&pool.id, UTILIZATION_KEY)) {
            let stored: &mut u64 = df::borrow_mut(&mut pool.id, UTILIZATION_KEY);
            *stored = cap_bps;
        } else {
            df::add(&mut pool.id, UTILIZATION_KEY, cap_bps);
        };
        event::emit(UtilizationCapUpdated {
            old_cap_bps,
            new_cap_bps: cap_bps,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Internal helper: returns 0 when the dynamic_field is absent
    /// (i.e. cap never set, including all freshly-initialized pools).
    fun read_utilization_cap_bps(pool: &BankrollPool): u64 {
        if (df::exists_(&pool.id, UTILIZATION_KEY)) {
            *df::borrow<vector<u8>, u64>(&pool.id, UTILIZATION_KEY)
        } else {
            0
        }
    }

    /// v0.0.4: live max-liability exposure (sum of reserved max_single_payouts
    /// across in-flight rounds). Returns 0 when the dynamic_field is absent
    /// (pre-v0.0.4 pool that has never collected a bet under v0.0.4 logic).
    fun read_open_exposure(pool: &BankrollPool): u64 {
        if (df::exists_(&pool.id, OPEN_EXPOSURE_KEY)) {
            *df::borrow<vector<u8>, u64>(&pool.id, OPEN_EXPOSURE_KEY)
        } else {
            0
        }
    }

    /// v0.0.4: idempotent setter for the open_exposure dynamic_field. Creates
    /// the field on first use, otherwise overwrites in place.
    fun write_open_exposure(pool: &mut BankrollPool, new_val: u64) {
        if (df::exists_(&pool.id, OPEN_EXPOSURE_KEY)) {
            let stored: &mut u64 = df::borrow_mut(&mut pool.id, OPEN_EXPOSURE_KEY);
            *stored = new_val;
        } else {
            df::add(&mut pool.id, OPEN_EXPOSURE_KEY, new_val);
        }
    }

    /// Utilization cap on cumulative reservations. cap_bps == 0 disables it.
    fun assert_within_utilization_cap(pool: &BankrollPool, new_open: u64) {
        let cap_bps = read_utilization_cap_bps(pool);
        if (cap_bps > 0) {
            let pool_balance_u128 = balance::value(&pool.balance) as u128;
            let new_open_u128 = new_open as u128;
            assert!(
                new_open_u128 * CAP_BPS_DENOM <= pool_balance_u128 * (cap_bps as u128),
                EUtilizationCapExceeded,
            );
        };
    }

    // ===== Game Interface (callable by GameCap holders) =====

    /// LEGACY. Reserves `cap.max_single_payout` regardless of the bet, so a
    /// 1 NUSDC wager holds the whole game maximum, and it has no matching
    /// release for rounds that settle without paying out. Retained only so
    /// packages not yet rebound keep working. New callers use
    /// `reserve_exposure` + `collect_bet_no_reserve`, and release every
    /// reservation through `release_exposure`.
    public fun collect_bet(
        pool: &mut BankrollPool,
        cap: &GameCap,
        bet: Coin<NUSDC>,
        player: address,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        assert!(!pool.paused, EPaused);

        let amount = coin::value(&bet);
        assert!(amount > 0, EInvalidAmount);

        // v0.0.4: reserve cap.max_single_payout against open_exposure. The
        // utilization cap now compares CUMULATIVE reservation (existing
        // open_exposure + new bet's max_single_payout) against pool.balance,
        // a tighter check than v0.0.3's per-bet-only precondition. Cap_bps==0
        // still disables enforcement.
        let reserve = cap.max_single_payout;
        let current_open = read_open_exposure(pool);
        let new_open = current_open + reserve;

        assert_within_utilization_cap(pool, new_open);

        balance::join(&mut pool.balance, coin::into_balance(bet));
        update_game_bet_stats(pool, cap.game_id, amount);
        write_open_exposure(pool, new_open);

        let ts = clock::timestamp_ms(clock);
        event::emit(BetCollected {
            game_id: cap.game_id,
            player,
            amount,
            timestamp_ms: ts,
        });
        event::emit(OpenExposureSnapshot {
            game_id: cap.game_id,
            delta_is_release: false,
            delta_abs: reserve,
            open_exposure_after: new_open,
            timestamp_ms: ts,
        });
    }

    /// Reserve one potential payout against `open_exposure`.
    ///
    /// The reservation unit is a single payout, so the bound is the same
    /// `cap.max_single_payout` that `pay_winner` enforces. A round that can pay
    /// several times (a scratch card bulk buy) reserves once per payout it can
    /// make. Every reservation is released by exactly one `release_exposure` of
    /// the same amount, whatever the outcome, which keeps reserve and release
    /// counts equal per game.
    ///
    /// Call before `collect_bet_no_reserve` so the utilization cap is checked
    /// against the balance without the incoming bet, as `collect_bet` does.
    public fun reserve_exposure(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        assert!(!pool.paused, EPaused);
        assert!(amount <= cap.max_single_payout, EReserveExceedsCap);

        let new_open = read_open_exposure(pool) + amount;
        assert_within_utilization_cap(pool, new_open);
        write_open_exposure(pool, new_open);

        event::emit(OpenExposureSnapshot {
            game_id: cap.game_id,
            delta_is_release: false,
            delta_abs: amount,
            open_exposure_after: new_open,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Collect a bet without touching `open_exposure`. The round's
    /// reservations are taken separately through `reserve_exposure`, because
    /// their number depends on how many payouts the round can make, not on
    /// how many coins it collects.
    public fun collect_bet_no_reserve(
        pool: &mut BankrollPool,
        cap: &GameCap,
        bet: Coin<NUSDC>,
        player: address,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        assert!(!pool.paused, EPaused);

        let amount = coin::value(&bet);
        assert!(amount > 0, EInvalidAmount);

        balance::join(&mut pool.balance, coin::into_balance(bet));
        update_game_bet_stats(pool, cap.game_id, amount);

        event::emit(BetCollected {
            game_id: cap.game_id,
            player,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Release a reservation for a round that settles without moving coins.
    ///
    /// The single release point for `reserve_exposure`, called once per
    /// reservation regardless of outcome. Under the legacy path a losing wheel spin,
    /// a losing scratch card, a mines board that hit a mine and a crash entry
    /// that never cashed out all ended with nothing to pay, and so left their
    /// reservation standing forever. Callers pass the same amount they
    /// reserved.
    ///
    /// Deliberately unbounded by `cap.max_single_payout`: an admin may lower
    /// the cap while a multi-transaction round (a mines session) is still
    /// open, and a bound here would then abort that round's settlement. A
    /// release moves no coins, so the worst a wrong amount can do is
    /// understate exposure, which the per-game reserve/release counts expose.
    ///
    /// Saturating, so a release against a pool whose exposure was reset
    /// underneath it clamps at zero instead of aborting and wedging the game.
    public fun release_exposure(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        // pool.paused is deliberately not checked: releasing is the settlement
        // of an obligation the pool already took on, same rationale as
        // pay_winner and refund_bet.
        let current_open = read_open_exposure(pool);
        let new_open = if (current_open >= amount) { current_open - amount } else { 0 };
        write_open_exposure(pool, new_open);

        event::emit(OpenExposureSnapshot {
            game_id: cap.game_id,
            delta_is_release: true,
            delta_abs: amount,
            open_exposure_after: new_open,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Admin override for `open_exposure`.
    ///
    /// There was no way to correct this field, which is why an unpaired ledger
    /// could not be cleaned up without one. Needed once after the games move to
    /// `reserve_exposure`, to discard the reservations the legacy path
    /// leaked, and thereafter only if an audit finds a mismatch.
    ///
    /// Takes an explicit value rather than zeroing, so an operator can set the
    /// audited in-flight total instead of erasing live obligations. Emits a
    /// snapshot so the indexer sees the correction like any other movement.
    public fun admin_set_open_exposure(
        _admin: &AdminCap,
        pool: &mut BankrollPool,
        new_open: u64,
        clock: &Clock,
    ) {
        write_open_exposure(pool, new_open);
        event::emit(OpenExposureSnapshot {
            // game_id 0 marks a pool-level correction rather than a game action.
            game_id: 0,
            delta_is_release: true,
            delta_abs: 0,
            open_exposure_after: new_open,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    public fun pay_winner(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let out = pay_out(pool, cap, amount, player, clock, ctx);
        // v0.0.4: release the reservation taken by the matching collect_bet.
        // Each round maps to exactly one pay_winner OR refund_bet, so the
        // release unit is cap.max_single_payout (same value collect_bet
        // reserved).
        release_legacy_reservation(pool, cap, clock);
        out
    }

    /// Pay a winner without touching `open_exposure`. For games on
    /// `reserve_exposure`, which release each reservation through
    /// `release_exposure` whether or not it paid.
    public fun pay_winner_no_release(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        pay_out(pool, cap, amount, player, clock, ctx)
    }

    /// Refund a previously collected bet (e.g., aborted round). Separate from
    /// pay_winner so analytics distinguish PnL from round voids.
    public fun refund_bet(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        reason_code: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        let out = refund_out(pool, cap, amount, player, reason_code, clock, ctx);
        // v0.0.4: refund also closes the round, so release the reservation
        // (same unit as the matching collect_bet).
        release_legacy_reservation(pool, cap, clock);
        out
    }

    /// Refund without touching `open_exposure`. Counterpart of
    /// `pay_winner_no_release` for the `reserve_exposure` path.
    public fun refund_bet_no_release(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        reason_code: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        refund_out(pool, cap, amount, player, reason_code, clock, ctx)
    }

    fun pay_out(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(!cap.revoked, EGameCapRevoked);
        // NOTE: pool.paused is intentionally NOT checked here. Pause must
        // never freeze legitimate winner payouts; otherwise users' funds
        // become hostage during ops. Pause gates new bets (collect_bet);
        // for emergency winner halt, revoke the GameCap instead.
        assert!(amount <= cap.max_single_payout, EPayoutExceedsCap);

        let bal = balance::value(&pool.balance);
        assert!(bal >= amount + MIN_POOL_BALANCE, EInsufficientPoolBalance);

        let out = coin::from_balance(balance::split(&mut pool.balance, amount), ctx);
        update_game_payout_stats(pool, cap.game_id, amount);

        event::emit(WinnerPaid {
            game_id: cap.game_id,
            player,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        out
    }

    fun refund_out(
        pool: &mut BankrollPool,
        cap: &GameCap,
        amount: u64,
        player: address,
        reason_code: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<NUSDC> {
        assert!(!cap.revoked, EGameCapRevoked);
        // NOTE: pool.paused not checked. Refunds are obligation settlements,
        // not new exposure; same rationale as pay_winner.

        let bal = balance::value(&pool.balance);
        assert!(bal >= amount, EInsufficientPoolBalance);

        let out = coin::from_balance(balance::split(&mut pool.balance, amount), ctx);

        event::emit(BetRefunded {
            game_id: cap.game_id,
            player,
            amount,
            reason_code,
            timestamp_ms: clock::timestamp_ms(clock),
        });
        out
    }

    /// Saturating subtraction defends against a pre-v0.0.4 pool upgraded
    /// mid-flight where some collect_bets happened before the open_exposure
    /// dynamic_field existed.
    fun release_legacy_reservation(pool: &mut BankrollPool, cap: &GameCap, clock: &Clock) {
        let release = cap.max_single_payout;
        let current_open = read_open_exposure(pool);
        let new_open = if (current_open >= release) { current_open - release } else { 0 };
        write_open_exposure(pool, new_open);

        event::emit(OpenExposureSnapshot {
            game_id: cap.game_id,
            delta_is_release: true,
            delta_abs: release,
            open_exposure_after: new_open,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Forward a fee / house edge / forfeited prize into the pool.
    /// GameCap-gated: public-entry donation path is intentionally removed to
    /// close the LP inflation attack vector.
    public fun treasury_deposit(
        pool: &mut BankrollPool,
        cap: &GameCap,
        coin: Coin<NUSDC>,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        let amount = coin::value(&coin);
        assert!(amount > 0, EInvalidAmount);
        balance::join(&mut pool.balance, coin::into_balance(coin));
        event::emit(TreasuryDeposited {
            source_game_id: cap.game_id,
            amount,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Emit a standardized GameResult event. `game_id` is read from the cap
    /// (caller cannot spoof). `session_id` is opaque bytes defined by the
    /// calling game (e.g., BCS-encoded LotteryRound id, or (round, nonce)).
    public fun emit_game_result(
        cap: &GameCap,
        player: address,
        bet_amount: u64,
        payout: u64,
        session_id: vector<u8>,
        clock: &Clock,
    ) {
        assert!(!cap.revoked, EGameCapRevoked);
        let multiplier_bps = if (bet_amount > 0) {
            (((payout as u128) * 10000) / (bet_amount as u128)) as u64
        } else {
            0
        };
        event::emit(GameResult {
            game_id: cap.game_id,
            player,
            bet_amount,
            payout,
            multiplier_bps,
            timestamp_ms: clock::timestamp_ms(clock),
            session_id,
        });
    }

    // ===== LP Interface =====

    public entry fun provide_liquidity(
        pool: &mut BankrollPool,
        coin: Coin<NUSDC>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!pool.paused, EPaused);
        let amount = coin::value(&coin);
        assert!(amount >= MIN_LP_DEPOSIT, EDepositTooSmall);

        // Virtual-offset share math (ERC4626 style): resists inflation attacks
        // even if a hostile cap holder managed to donate large balance.
        let pool_balance = balance::value(&pool.balance) as u128;
        let shares: u128 = if (pool.total_shares == 0) {
            // First LP: shares = amount. MIN_LP_DEPOSIT prevents 1-wei attacks.
            amount as u128
        } else {
            ((amount as u128) * (pool.total_shares + 1)) / (pool_balance + 1)
        };
        assert!(shares > 0, EDepositTooSmall);

        balance::join(&mut pool.balance, coin::into_balance(coin));
        pool.total_shares = pool.total_shares + shares;

        let sender = tx_context::sender(ctx);
        let lp = LPToken {
            id: object::new(ctx),
            shares,
            deposit_time: clock::timestamp_ms(clock),
            withdraw_requested_at: option::none(),
        };
        transfer::transfer(lp, sender);

        event::emit(LiquidityProvided {
            provider: sender,
            amount,
            shares,
            timestamp_ms: clock::timestamp_ms(clock),
        });
    }

    /// Step 1: start 24h cooldown. Must be called by the LPToken holder
    /// (enforced via Sui owned-object semantics, since LPToken has no `store`).
    public entry fun request_withdraw(
        lp: &mut LPToken,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        let now = clock::timestamp_ms(clock);
        lp.withdraw_requested_at = option::some(now);

        event::emit(WithdrawRequested {
            provider: tx_context::sender(_ctx),
            shares: lp.shares,
            requested_at: now,
            claimable_at: now + EXIT_COOLDOWN_MS,
        });
    }

    /// Step 2: redeem after cooldown. Consumes the LPToken; coin goes to the
    /// tx sender (who must own the object).
    public entry fun redeem_liquidity(
        pool: &mut BankrollPool,
        lp: LPToken,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(option::is_some(&lp.withdraw_requested_at), ECooldownNotRequested);
        let requested_at = *option::borrow(&lp.withdraw_requested_at);
        let now = clock::timestamp_ms(clock);
        assert!(now >= requested_at + EXIT_COOLDOWN_MS, ECooldownNotElapsed);

        let pool_balance = balance::value(&pool.balance) as u128;
        // Virtual offset symmetric with provide_liquidity.
        let amount_u128 = (lp.shares * (pool_balance + 1)) / (pool.total_shares + 1);
        let amount = amount_u128 as u64;

        pool.total_shares = pool.total_shares - lp.shares;
        let out = coin::from_balance(balance::split(&mut pool.balance, amount), ctx);

        let LPToken { id, shares, deposit_time: _, withdraw_requested_at: _ } = lp;
        object::delete(id);

        let recipient = tx_context::sender(ctx);
        transfer::public_transfer(out, recipient);

        event::emit(LiquidityRedeemed {
            provider: recipient,
            amount,
            shares,
            timestamp_ms: now,
        });
    }

    // ===== Views =====

    public fun pool_balance(pool: &BankrollPool): u64 {
        balance::value(&pool.balance)
    }

    public fun total_shares(pool: &BankrollPool): u128 {
        pool.total_shares
    }

    public fun is_paused(pool: &BankrollPool): bool {
        pool.paused
    }

    /// Share price scaled by 1e9 (e.g. 1_000_000_000 = 1.0).
    public fun share_price_scaled(pool: &BankrollPool): u128 {
        if (pool.total_shares == 0) return SHARE_PRICE_SCALE;
        ((balance::value(&pool.balance) as u128) * SHARE_PRICE_SCALE) / pool.total_shares
    }

    /// v0.0.3: utilization cap in basis points (0 = disabled).
    public fun utilization_cap_bps(pool: &BankrollPool): u64 {
        read_utilization_cap_bps(pool)
    }

    /// v0.0.4: live reserved max-payout across in-flight rounds. Equal to
    /// SUM(cap.max_single_payout) over rounds whose collect_bet has fired
    /// but whose pay_winner/refund_bet has not yet. Returns 0 on pools that
    /// have never collected a bet under v0.0.4 logic.
    public fun open_exposure(pool: &BankrollPool): u64 {
        read_open_exposure(pool)
    }

    /// v0.0.3: true once seed_pool_shares (or any LP) has minted shares.
    /// Off-chain consumers use this to gate the public LP UI.
    public fun is_seeded(pool: &BankrollPool): bool {
        pool.total_shares > 0
    }

    public fun game_cap_id(cap: &GameCap): u8 { cap.game_id }
    public fun game_cap_max_payout(cap: &GameCap): u64 { cap.max_single_payout }
    public fun game_cap_revoked(cap: &GameCap): bool { cap.revoked }

    public fun lp_shares(lp: &LPToken): u128 { lp.shares }
    public fun lp_deposit_time(lp: &LPToken): u64 { lp.deposit_time }
    public fun lp_withdraw_requested_at(lp: &LPToken): Option<u64> { lp.withdraw_requested_at }

    // ===== Internal Helpers =====

    fun update_game_bet_stats(pool: &mut BankrollPool, game_id: u8, amount: u64) {
        if (!table::contains(&pool.game_cumulative_bets, game_id)) {
            table::add(&mut pool.game_cumulative_bets, game_id, 0u64);
        };
        let entry = table::borrow_mut(&mut pool.game_cumulative_bets, game_id);
        *entry = *entry + amount;
    }

    fun update_game_payout_stats(pool: &mut BankrollPool, game_id: u8, amount: u64) {
        if (!table::contains(&pool.game_cumulative_payouts, game_id)) {
            table::add(&mut pool.game_cumulative_payouts, game_id, 0u64);
        };
        let entry = table::borrow_mut(&mut pool.game_cumulative_payouts, game_id);
        *entry = *entry + amount;
    }

    // ===== Test-only =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
