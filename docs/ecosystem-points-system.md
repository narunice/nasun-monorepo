# Nasun Ecosystem Points System Technical Specification

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-04-17 (Wallet Transfer SQL 전환 및 Linked Wallet 지원 반영)
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
- **하이브리드 스캐닝**: 
    - **Event-based**: 일반 활동은 `points-scanner.ts`가 60초 간격으로 Sui 이벤트를 구독하여 감지합니다.
    - **Indexer-SQL**: 지갑 전송(`wallet-transfer`)과 같은 대규모 트래픽 카테고리는 인덱서의 `tx_affected_addresses` 테이블을 직접 쿼리하여 RPC 부하 없이 실시간 처리합니다. (O(daily delta) 확장성 구현)
- **포인트 카테고리**:
    - **Base Categories**: 하루에 한 번만 인정되는 활동 (DEX 거래, 로또 구매, 지갑 전송 등).
    - **Score Categories**: 수행할 때마다 점수가 누적되거나 특별 보너스가 지급되는 활동 (거버넌스 투표, 추천인 보너스).
- **야간 정합성 검사 (Nightly Reconciliation)**: `rpc-reconcile.ts`가 매일 자정 이후 RPC를 통해 블록체인 데이터를 직접 전수 조사하여 누락된 이벤트를 복구합니다.

### 2.2 Frontend: 실시간 미션 체크 (Real-time Detection)
- **Direct RPC Query**: 백엔드 인덱싱 지연을 우회하기 위해 브라우저에서 직접 Sui RPC(`queryEvents`, `queryTransactionBlocks`)를 호출합니다.
- **Multi-wallet Tracking**: `useDailyMissions.ts` 훅이 사용자의 모든 연결된 지갑(Linked Wallets)을 동시에 검사하여 어떤 지갑에서든 미션이 달성되면 UI에 즉시 반영합니다.

---

## 3. 데이터 파이프라인 (Data Pipeline)

### 3.1 원장 기록 (Logging)
1. 사용자가 온체인 트랜잭션 수행.
2. 스캐너가 이벤트 또는 SQL 인덱스(`tx_affected_addresses`)를 통해 활동 포착.
3. **Identity Attribution**: 트랜잭션 주체(Sender)가 등록된 지갑 목록 중 하나인 경우 해당 Identity ID로 포인트를 귀속시킴.
4. 데이터 포맷: `identity_id`, `category`, `activity_type`, `final_points`, `tx_digest`.

### 3.2 집계 및 스냅샷 (Aggregation & Snapshot)
1. **Materialized View**: `ecosystem_daily_scores` 뷰가 `activity_points`를 일 단위/카테고리 단위로 집계. (리프레시 목표 < 60s)
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
| `wallet-transfer` | 타 지갑으로 자산 전송 (Linked Wallet 포함) | Base (1pt) |
| `governance` | 제안서 투표 (Vote) | Score (10pts) |
| `daily-mission` | 특정 티어 달성 시 보너스 | Score (변동) |

---

## 5. 보안 및 무결성 (Security & Integrity)
- **중복 방지**: `identityId::category` 기반의 일일 고유 키를 사용하여 동일 카테고리의 중복 점수 획득을 차단합니다.
- **자가 전송 제외 (Anti-Self-Transfer)**: 동일 Identity에 연결된 지갑 간의 전송은 포인트 적립 대상에서 자동으로 제외됩니다.
- **역진 방지 (Never-reduce)**: 누적 원장 모델은 Anchor 포인트를 기준으로 증분만 더하며, 과거 데이터를 임의로 삭감하지 않습니다.
- **패널티 시스템**: `alliance_penalties` 테이블을 통해 부정 행위가 적발된 사용자의 배수를 강제로 1.0x로 고정할 수 있습니다.

---

## 6. 관련 DB 테이블 스키마
- `activity_points`: 개별 활동 로그
- `ecosystem_daily_scores`: 일 단위 집계 (Matview)
- `ecosystem_score_snapshots`: 일일 확정 점수 및 누적 점수 (Source of Truth for Leaderboard)
- `tx_affected_addresses`: SQL 스캐너가 참조하는 실시간 인덱서 데이터
- `identity_to_wallet_map`: Cognito ID와 지갑 주소 간 매핑 원장
