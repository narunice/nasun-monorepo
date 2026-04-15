# Nasun Ecosystem Points System Technical Specification

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-04-15
**핵심 경로**:
- Backend API: `apps/network-explorer/api-server/src/routes/ecosystem.ts`
- Scanners: `apps/network-explorer/api-server/src/scanner/`
- Frontend Hook: `apps/nasun-website/frontend/src/hooks/useDailyMissions.ts`

---

## 1. 시스템 목적 (System Objective)
나선(Nasun) 에코시스템 내에서의 사용자 활동(On-chain & Off-chain)을 정량화하여 보상하는 시스템입니다. 사용자의 충성도를 측정하고, Genesis Pass 등 NFT 보유자에게 배수(Multiplier) 혜택을 제공하여 생태계 참여를 독려합니다.

## 2. 아키텍처 개요 (Architecture Overview)
본 시스템은 **"실시간 사용자 피드백(Frontend)"**과 **"신뢰할 수 있는 포인트 원장(Backend)"**이 분리된 이중 구조를 가집니다.

### 2.1 Backend: 포인트 엔진 (Point Engine)
- **이벤트 기반 스캐닝**: `points-scanner.ts`가 60초 간격으로 Sui 이벤트를 구독하여 활동을 감지합니다.
- **포인트 카테고리**:
    - **Base Categories**: 하루에 한 번만 인정되는 활동 (DEX 거래, 로또 구매 등).
    - **Score Categories**: 수행할 때마다 점수가 누적되거나 특별 보너스가 지급되는 활동 (거버넌스 투표, 추천인 보너스).
- **야간 정합성 검사 (Nightly Reconciliation)**: `rpc-reconcile.ts`가 매일 자정 이후 RPC를 통해 블록체인 데이터를 직접 전수 조사하여 누락된 이벤트를 복구합니다.

### 2.2 Frontend: 실시간 미션 체크 (Real-time Detection)
- **Direct RPC Query**: 백엔드 인덱싱 지연을 우회하기 위해 브라우저에서 직접 Sui RPC(`queryEvents`, `queryTransactionBlocks`)를 호출합니다.
- **미션 체크리스트**: `useDailyMissions.ts` 훅이 사용자의 모든 연결된 지갑을 검사하여 오늘의 미션 달성 여부를 UI에 즉시 반영합니다.

---

## 3. 데이터 파이프라인 (Data Pipeline)

### 3.1 원장 기록 (Logging)
1. 사용자가 온체인 트랜잭션 수행.
2. `points-scanner`가 이벤트를 포착하여 `activity_points` 테이블에 기록.
3. 데이터 포맷: `identity_id`, `category`, `activity_type`, `final_points`, `tx_digest`.

### 3.2 집계 및 스냅샷 (Aggregation & Snapshot)
1. **Materialized View**: `ecosystem_daily_scores` 뷰가 `activity_points`를 일 단위/카테고리 단위로 집계.
2. **Daily Snapshot**: 매일 00:05 UTC에 `daily-snapshot.ts`가 실행되어 각 사용자의 당일 점수를 확정하고 NFT 배수를 적용하여 `ecosystem_score_snapshots`에 저장.
3. **Cumulative Ledger (V3)**: 최신 리팩토링을 통해 모든 과거 점수를 실시간 SUM 하지 않고, 스냅샷에 `all_time_score` 컬럼을 유지하여 누적 점수를 관리합니다.

---

## 4. 주요 로직 및 규칙 (Core Logic & Rules)

### 4.1 점수 계산 공식 (Score Formula)
- **일일 점수 (Daily Score)**: `(Base Score + Staking Score) * Multiplier + Bonus Points`
- **배수 (Multiplier)**:
    - 기본: 1.0x
    - Genesis Pass 보유: **2.0x** (중첩 불가, 최고 등급 적용)
    - Alliance NFT: 보유 시 활동 가능 (미보유 시 일부 미션 제한)

### 4.2 미션 카테고리 (Mission Categories)
| 카테고리 | 활동 내용 | 점수 유형 |
| :--- | :--- | :--- |
| `pado-dex` | DEX Swap 또는 주문 생성 | Base (1pt) |
| `pado-lottery` | 로또 티켓 구매 | Base (1pt) |
| `pado-games` | NumberMatch 등 게임 참여 | Base (1pt) |
| `governance` | 제안서 투표 (Vote) | Score (10pts) |
| `daily-mission` | 특정 티어 달성 시 보너스 | Score (변동) |

---

## 5. 보안 및 무결성 (Security & Integrity)
- **중복 방지**: `identityId::category` 기반의 일일 고유 키를 사용하여 동일 카테고리의 중복 점수 획득을 차단합니다.
- **역진 방지 (Never-reduce)**: 누적 원장 모델은 Anchor 포인트를 기준으로 증분만 더하며, 과거 데이터를 임의로 삭감하지 않습니다.
- **패널티 시스템**: `alliance_penalties` 테이블을 통해 부정 행위가 적발된 사용자의 배수를 강제로 1.0x로 고정할 수 있습니다.

---

## 6. 관련 DB 테이블 스키마
- `activity_points`: 개별 활동 로그
- `ecosystem_daily_scores`: 일 단위 집계 (Matview)
- `ecosystem_score_snapshots`: 일일 확정 점수 및 누적 점수 (Source of Truth for Leaderboard)
- `identity_to_wallet_map`: Cognito ID와 지갑 주소 간 매핑 원장
