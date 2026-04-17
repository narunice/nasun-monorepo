# Pado Score Leaderboard Technical Specification

**상태**: 운영 중 (Production)
**최근 업데이트**: 2026-04-17
**관련 경로**:
- Frontend Page: `apps/pado/frontend/src/pages/LeaderboardPage.tsx`
- Backend API: `apps/nasun-website/chat-server/src/leaderboard-api.ts`
- Point Engine: `apps/nasun-website/chat-server/src/aggregator.ts`
- Data Store: `apps/nasun-website/chat-server/src/leaderboard-store.ts`

---

## 1. 개요 (Overview)
Pado Score 리더보드는 단순한 거래량(Volume)이나 수익(PnL)을 넘어, 사용자의 트레이딩 활동성, 다양성, 그리고 실력을 종합적으로 정량화하여 순위를 매기는 시스템입니다. 이 점수는 향후 Nasun Ecosystem Points와 연동되어 생태계 기여도의 핵심 지표로 활용될 예정입니다.

## 2. 점수 계산 공식 (Score Formula)

점수는 4가지 주요 카테고리의 합산으로 계산됩니다. (참조: `chat-server/src/leaderboard-types.ts` 의 `POINTS` 상수)

### 2.1 거래 활동 점수 (Trading Activity)
사용자의 꾸준한 참여를 독려하기 위한 점수입니다.
- **첫 거래 보너스 (First Trade Bonus)**: 1회 한정 **100 pts**
- **거래 횟수 점수 (Per Trade)**: 거래 1회(Fill 기준) 당 **10 pts**

### 2.2 거래량 점수 (Trading Volume)
생태계 유동성 공급에 따른 보상입니다.
- **단위 거래량 점수 (Per $1,000 Volume)**: 거래량 $1,000 (NUSDC 6 decimals 기준 1e9 raw) 당 **5 pts**
- *계산식*: `floor(volume_raw / 1,000,000,000) * 5`

### 2.3 다양성 점수 (Diversity)
다양한 자산군 거래를 장려합니다.
- **고유 풀 보너스 (Per Unique Pool)**: 이용한 서로 다른 풀(Pool) 1개당 **25 pts**

### 2.4 성과 점수 (Performance/PnL)
트레이딩 실력에 따른 차등 보상입니다. (손실 시 감점은 없으며 0점으로 처리)
- **수익 금액 점수 (Per $1,000 PnL)**: 실현 수익 $1,000 당 **20 pts**
- **수익률 보너스 (Per 10% Return)**: 수익률 10% 당 **15 pts**
- *특이사항*: `realized_pnl > 0` 및 `pnl_percent > 0` 인 경우에만 합산됩니다.

---

## 3. 시스템 아키텍처 및 운영 (Architecture & Operation)

### 3.1 데이터 파이프라인
1.  **인덱싱**: `chat-server/src/indexer.ts`가 DeepBook V3 이벤트를 감지하여 SQLite의 `trade_fills` 테이블에 저장.
2.  **PnL 계산**: `aggregator.ts`가 주기적으로 `computeTraderPnl`을 실행하여 메모리 캐시에 수익 데이터를 로드.
3.  **점수 집계 (Aggregation)**: `runPointsAggregation` 함수가 `trade_fills`와 PnL 캐시를 결합하여 `trader_points` 테이블을 갱신.
4.  **순위 산정**: 총점 기준 내림차순으로 정렬하여 `rank` 및 `prev_rank`를 할당.

### 3.2 스코프 및 주기
- **시간 범위 (Scope)**: 현재 **All-time** (서비스 시작 이후 전체 기간) 스코어만 지원합니다.
- **갱신 주기**: `aggregationIntervalMs` 설정에 따라 주기적으로 백그라운드에서 계산됩니다 (현재 약 30~60초).
- **데이터 정합성**: 정산 시점의 타임스탬프는 `pado_aggregator_last_run_ms` 키로 저장되어 프론트엔드에 `updatedAt`으로 전달됩니다.

### 3.3 API 엔드포인트
- `GET /api/pado/leaderboard/score`: 전체 리더보드 순위 조회 (Pagination 지원)
- `GET /api/pado/leaderboard/trader/:address/score`: 특정 사용자의 점수 구성(Breakdown) 및 순위 조회

---

## 4. 향후 로드맵: Ecosystem Points 연동
현재의 Pado Score는 Pado 앱 내의 활동에 국한되어 있습니다. 향후 다음과 같은 연동이 계획되어 있습니다:

1.  **Linked Wallet 지원**: 사용자가 연결한 모든 지갑의 Pado 활동 점수를 하나의 Identity로 통합.
2.  **Ecosystem Multiplier 적용**: Genesis Pass 보유자(2.0x) 등 NFT 보유에 따른 점수 가중치 적용.
3.  **데이터 소스 통합**: `chat-server`의 트레이딩 데이터와 `network-explorer`의 온체인 활동(Ecosystem Points) 데이터를 결합한 통합 리더보드 구축.
