# Gostop GameResult Event Schema (Tier 0.0 Spike Output)

**작성일**: 2026-05-17
**범위**: Tier 0 backend indexer가 모든 게임 결과를 단일 canonical row(`gostop.game_round`)로 정규화하는 규칙
**상위 plan**: [2026-05-17-gostop-tier0-implementation.md](/home/naru/.claude/plans/2026-05-17-gostop-tier0-implementation.md)

---

## 1. 단일 source 이벤트: `bankroll_pool::GameResult`

[bankroll_pool.move:151](../contracts-bankroll-pool/sources/bankroll_pool.move#L151)

```move
public struct GameResult has copy, drop {
    game_id: u8,              // 1..6
    player: address,
    bet_amount: u64,          // MIST (USDC raw)
    payout: u64,              // MIST. 0 = loss, > bet = win, == bet = push
    multiplier_bps: u64,      // 10000 = 1.00x
    timestamp_ms: u64,
    session_id: vector<u8>,   // 게임별 unique key (round_id, ticket_idx, player 조합)
}
```

| Game ID | Game | `emit_game_result` 호출 | session_id 인코딩 |
|---:|---|:---:|---|
| 1 | lottery | ✗ (자체 이벤트로 합성, 4절 참조) | (인덱서 합성) `bcs(round_number) ‖ bcs(ticket_id)` |
| 2 | scratchcard | ✓ ([scratchcard.move:264](../contracts-scratchcard/sources/scratchcard.move#L264)) | `bcs(card_id)` (단일 카드 = 단일 라운드) |
| 3 | numbermatch | ✓ ([numbermatch.move:212](../contracts-numbermatch/sources/numbermatch.move#L212)) | `bcs(game_id_self) ‖ bcs(player) ‖ bcs(nonce)` |
| 4 | crash | ✓ ([crash.move:425](../contracts-crash/sources/crash.move#L425)) | `bcs(round_id) ‖ bcs(player_address)` |
| 5 | mines | ✓ ([mines.move:313, 396](../contracts-mines/sources/mines.move#L313)) | `bcs(round_id)` (bet 시점 / cashout 시점 2회 emit 가능 — 2절 참조) |
| 6 | wheel | ✓ ([wheel.move:236](../contracts-wheel/sources/wheel.move#L236)) | `bcs(spin_nonce)` |

**Indexer 내부 정규화**: `(tx_digest, event_seq)` UNIQUE 보장. `session_id`는 게임별 dedup 단위지만 cross-game collision 방지를 위해 인덱서는 항상 `(game_id, session_id)` 복합 키로 다룬다.

---

## 2. Multiplier 및 push/refund 의미론

| 상황 | `bet_amount` | `payout` | `multiplier_bps` | 분류 |
|---|---|---|---|---|
| 패배 | > 0 | 0 | 0 | loss |
| 승리 | > 0 | > 0 | round(payout/bet × 10000) | win |
| Push (원금 회수, scratch breakeven 등) | > 0 | == bet | 10000 | push |
| Refund (라운드 중단 / `bankroll_pool::refund_bet`) | > 0 | 0 | 0 | refund — **emit_game_result 호출 안 됨** ([crash.move:572,615,666](../contracts-crash/sources/crash.move#L572)). 인덱서는 refund 발생 시 해당 (game_id, session_id) row가 있다면 `is_refunded=true`로 표시 (4.3절) |
| Mines 부분 cashout | > 0 | > 0 | bet × cells revealed multiplier | win — round 중간 cashout이라 추가 emit은 1회만 |

**중요**: refund는 별도 `BetRefunded` 이벤트(`bankroll_pool::refund_bet`)로 emit되며 GameResult는 emit되지 않는다. 인덱서는 두 stream을 모두 구독해야 한다.

---

## 3. Canonical row: `gostop.game_round`

```sql
CREATE TABLE gostop.game_round (
  id              BIGSERIAL PRIMARY KEY,
  tx_digest       TEXT NOT NULL,
  event_seq       INT NOT NULL,
  game_id         SMALLINT NOT NULL,
  player          TEXT NOT NULL,        -- 0x... lowercased, 66 chars
  bet_amount      NUMERIC(30,0) NOT NULL,
  payout          NUMERIC(30,0) NOT NULL DEFAULT 0,
  multiplier_bps  BIGINT NOT NULL DEFAULT 0,
  session_id      BYTEA NOT NULL,
  timestamp_ms    BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'final',
    -- 'final': 결과 확정 (대다수 게임)
    -- 'pending_resolve': 베팅 기록됐고 결과 미정 (lottery ticket, 4절)
    -- 'pending_claim': winning ticket이지만 user가 아직 claim 안 함 (lottery, 4절)
    -- 'unclaimed_expired': claim window 경과 후 forfeit (lottery, 4절)
    -- 'refunded': BetRefunded 발생 (2절)
  inserted_at     TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tx_digest, event_seq),
  UNIQUE (game_id, session_id)         -- 게임별 dedup 보장
);
```

**SoT 원칙**:
- `bet_amount`, `payout`은 **인덱서가 본 마지막 진실**. lottery는 단계별 update, 나머지는 1회 INSERT.
- `status='final'` row는 사용자 입장 net_pnl 계산에 그대로 사용.
- `status IN ('pending_resolve', 'pending_claim')`는 leaderboard SUM에서 `payout`을 0 또는 expected_payout으로 어떻게 다룰지 4절에서 게임별 정의.

---

## 4. Lottery 인덱서 합성 규칙 (B안 확정)

**근거**: 컨트랙트 변경 없음. `TicketPurchased`(베팅), `NumbersDrawn`(추첨), `RoundSettled`(tier별 통계), `PrizeClaimed`(개별 청구), `UnclaimedSwept`(만료) 5개 이벤트로 ticket 단위 row를 합성한다.

### 4.1 보조 테이블

```sql
CREATE TABLE gostop.lottery_round (
  round_number    BIGINT PRIMARY KEY,
  round_id        TEXT NOT NULL,           -- Sui object ID hex
  draw_time_ms    BIGINT NOT NULL,
  close_time_ms   BIGINT NOT NULL,
  drawn_numbers   SMALLINT[],              -- NumbersDrawn 이후 채움
  drawn_at_ms     BIGINT,
  settled         BOOLEAN NOT NULL DEFAULT false,
  tier1_payout    NUMERIC(30,0),
  tier2_payout    NUMERIC(30,0),
  tier3_payout    NUMERIC(30,0),
  tier1_winners   INT,
  tier2_winners   INT,
  tier3_winners   INT,
  treasury_amount NUMERIC(30,0),
  claim_deadline_ms BIGINT,                -- draw_time + CLAIM_WINDOW_MS
  fully_claimed_at_ms BIGINT,              -- 마지막 PrizeClaimed 또는 UnclaimedSwept
  inserted_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gostop.lottery_ticket (
  round_number    BIGINT NOT NULL REFERENCES gostop.lottery_round(round_number),
  ticket_id       BIGINT NOT NULL,
  buyer           TEXT NOT NULL,
  numbers         SMALLINT[] NOT NULL,
  bet_amount      NUMERIC(30,0) NOT NULL,
  purchase_tx     TEXT NOT NULL,
  purchase_seq    INT NOT NULL,
  purchase_ts_ms  BIGINT NOT NULL,
  match_count     SMALLINT,                -- NumbersDrawn 직후 인덱서가 계산
  tier            SMALLINT,                -- 0 = no prize, 1/2/3
  expected_payout NUMERIC(30,0),           -- RoundSettled 직후 tier별 / winners로 분배 추정
  claim_tx        TEXT,
  claim_ts_ms     BIGINT,
  claimed_payout  NUMERIC(30,0),           -- PrizeClaimed.amount
  status          TEXT NOT NULL DEFAULT 'pending_resolve',
  PRIMARY KEY (round_number, ticket_id)
);
```

### 4.2 합성 파이프라인

| 이벤트 | 작업 |
|---|---|
| `RoundCreated` | `lottery_round` INSERT. `claim_deadline_ms = draw_time + CLAIM_WINDOW_MS` (CLAIM_WINDOW_MS는 컨트랙트 상수, 인덱서가 함께 보관) |
| `TicketPurchased` | `lottery_ticket` INSERT (`status='pending_resolve'`) + `game_round` INSERT (`bet_amount`, `payout=0`, `status='pending_resolve'`, `session_id=bcs(round_number) ‖ bcs(ticket_id)`) |
| `NumbersDrawn` | `lottery_round.drawn_numbers` UPDATE. 해당 라운드의 모든 ticket row를 SQL로 batch 비교하여 `match_count`/`tier` 채움. tier > 0이면 `status='pending_claim'`, tier=0이면 `status='final'`(loss) |
| `RoundSettled` | `lottery_round`에 tierN_payout/winners 채움. winning ticket의 `expected_payout = tierN_payout / tierN_winners`로 update. (display/추정 RTP 용 — `game_round.payout`은 아직 0 유지) |
| `PrizeClaimed` | `lottery_ticket`에 claim_tx/claim_ts_ms/claimed_payout 채우고 `status='final'`. `game_round.payout = claimed_payout`, `status='final'`, `multiplier_bps = round(claimed_payout / bet_amount × 10000)` |
| `UnclaimedSwept` | 해당 라운드의 `status='pending_claim'` ticket들을 `status='unclaimed_expired'`로 변경. `game_round.status='unclaimed_expired'` (payout=0 유지) |

### 4.3 Leaderboard / RTP 영향

- **사용자 net_pnl (User Dashboard `/me`)**: 사용자가 실제로 받은 돈 기준. `claimed_payout` SUM 사용. `pending_resolve` / `pending_claim` / `unclaimed_expired`는 payout=0으로 본다 → 사용자가 claim을 미루면 자기 net_pnl이 일시적으로 낮게 보임. UI에서 "Unclaimed: X USDC (claim before YYYY-MM-DD)" 별도 노출.
- **게임 실측 RTP (Transparency Dashboard)**: 게임의 fair-pricing 검증이 목적이므로 *intended* payout 사용. RTP = `(SUM(claimed_payout WHERE status='final') + SUM(expected_payout WHERE status IN ('pending_claim','unclaimed_expired'))) / SUM(bet_amount WHERE NOT status='pending_resolve')`. unclaimed는 RTP 계산에 포함 (게임은 정확히 분배했고, 사용자가 받지 않은 것).
- **Leaderboard ranking (Tier 0.1)**: net_pnl 기준 ranking은 위 사용자 net_pnl 정의 그대로. unclaimed는 ranking 손해이지만 사용자 행위 책임.
- **Volume bonus 연동 (미래 ecosystem leaderboard 확장)**: `bet_amount`는 `status != 'refunded'`인 모든 row 합산. unclaimed/pending도 volume에는 포함.

### 4.4 누락 티켓 방지

- `TicketPurchased`는 batch 구매도 1 ticket당 1 이벤트로 emit ([lottery.move:540, 616](../contracts-lottery/sources/lottery.move#L540)) — 누락 위험 없음.
- 인덱서가 `RoundSettled`를 받았을 때 `lottery_ticket WHERE round_number = X AND status='pending_resolve'` 가 남아있으면 RPC로 누락 이벤트 backfill 시도 후에도 남으면 ALERT (Telegram 알람).

---

## 5. Crash 시드 복구 (review 보완 반영)

`emit_game_result.session_id = bcs(round_id) ‖ bcs(player)`는 dedup용. multiplier curve 복구에는 별도 round-level 데이터 필요.

```sql
CREATE TABLE gostop.crash_round (
  round_id          BIGINT PRIMARY KEY,
  start_tx          TEXT NOT NULL,
  start_ts_ms       BIGINT NOT NULL,           -- RoundStarted.timestamp_ms
  commit_hash       BYTEA NOT NULL,            -- RoundStarted.commit_hash (32 bytes)
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolve_tx        TEXT,
  resolve_ts_ms    BIGINT,
  crash_point_bps  BIGINT,                     -- RoundResolved.crash_point_bps (reveal)
  crash_time_ms    BIGINT,                     -- RoundResolved.crash_time_ms (relative)
  salt              BYTEA,                     -- resolve 시 reveal (commit 검증용)
  total_bet         NUMERIC(30,0),
  total_payout      NUMERIC(30,0),
  cashout_count     INT,
  refunded          BOOLEAN NOT NULL DEFAULT false,
  inserted_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE gostop.crash_cashout (
  round_id          BIGINT NOT NULL REFERENCES gostop.crash_round(round_id),
  player            TEXT NOT NULL,
  cashout_mul_bps   BIGINT NOT NULL,           -- CashOutRecorded
  cashout_ts_ms     BIGINT NOT NULL,
  PRIMARY KEY (round_id, player)
);
```

- Curve 함수는 deterministic (현 컨트랙트에서 `multiplier(t) = exp(...)` 또는 backend math.ts 정의). Replay 페이지는 `start_ts_ms`, `crash_time_ms`, `crash_point_bps`, 그리고 사용자별 `cashout_mul_bps`/`cashout_ts_ms` 4개만 있으면 완전 재생 가능.
- Commit 검증: `blake2b256(bcs(crash_point_bps) ‖ salt) == commit_hash`. 인덱서가 INSERT 시점에 검증. 불일치 시 ALERT (절대 발생해선 안 됨).

---

## 6. 인덱서 stream 구독 목록

| Stream | 출처 | 처리 |
|---|---|---|
| `bankroll_pool::GameResult` | bankroll_pool 모듈 | 5개 게임(scratch/numbermatch/crash/mines/wheel) → `game_round` INSERT |
| `bankroll_pool::BetRefunded` | bankroll_pool | `game_round` UPDATE `status='refunded'` (4절) |
| `lottery::TicketPurchased` | lottery 모듈 | `lottery_ticket` + `game_round` INSERT |
| `lottery::RoundCreated` | lottery | `lottery_round` INSERT |
| `lottery::NumbersDrawn` | lottery | `lottery_round.drawn_numbers` + ticket match 계산 |
| `lottery::RoundSettled` | lottery | tier 통계 + expected_payout 분배 |
| `lottery::PrizeClaimed` | lottery | ticket/game_round 확정 |
| `lottery::UnclaimedSwept` | lottery | pending_claim → unclaimed_expired |
| `crash::RoundStarted` | crash 모듈 | `crash_round` INSERT |
| `crash::CashOutRecorded` | crash | `crash_cashout` INSERT |
| `crash::RoundResolved` | crash | `crash_round` reveal + commit 검증 |
| `crash::RoundRefunded` | crash | `crash_round.refunded=true` + 관련 `game_round` cascade |

각 stream은 `gostop.indexer_cursor`에 별도 row로 cursor 관리 (`stream` PK).

---

## 7. 위험 / 후속 작업

1. **lottery CLAIM_WINDOW_MS 상수 sync**: 컨트랙트 상수 변경 시 인덱서도 함께 업데이트. `lottery_round.claim_deadline_ms` 계산식 1곳에서 관리.
2. **RPC 재처리**: 인덱서 down 시간 동안의 이벤트는 cursor가 멈춰 있어 재시작 시 catch-up. RPC 503 burst는 `rpc.ts` retry+backoff 패턴 재사용 ([2026-05-12 mitigation](../../../docs/ecosystem-points-system.md#2026-05-12-rpc-503-mitigation)).
3. **bcs encoding 검증**: lottery session_id 합성은 인덱서 단 BCS 직렬화. Move bcs와 1:1 호환되도록 `@mysten/bcs` 라이브러리 사용 + 단위 테스트로 round_number/ticket_id 양수 변환 검증.
4. **Wheel/Mines session_id collision**: wheel은 `spin_nonce`만 있어 cross-player collision 가능. 인덱서는 `(game_id, session_id)` 키에 `player`를 추가한 internal index를 두어 dedup. 단순화 위해 `UNIQUE (game_id, session_id)` 대신 `UNIQUE (game_id, session_id, player)`로 가능. 결정: **`(tx_digest, event_seq)` UNIQUE가 1차 dedup이므로 `(game_id, session_id)` UNIQUE는 옵션**. 본 plan은 1차 UNIQUE만 강제하고 game-specific dedup은 게임별 결정.

→ **migration SQL에서는 `(tx_digest, event_seq)` UNIQUE만 채택**. `(game_id, session_id)` UNIQUE는 제외 (오버 제약, wheel/mines에서 false positive 우려).
