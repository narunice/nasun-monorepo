# Ecosystem Points 인시던트 보고서

**일시**: 2026-04-11
**보고자**: edyjayakarya (X/Twitter)
**심각도**: High (34,430명 영향, 랭킹 왜곡)
**상태**: 해결 완료 + 재발 방지 배포 완료

---

## 1. 보고된 증상

- 모든 daily mission을 완료해도 base points가 날마다 다르게 기록됨
- 4/1-2: base=4, 4/8: base=2, 4/10: base=6 (7이어야 함)
- 리더보드 랭킹이 #217에서 #2525로 급락
- 보고된 날짜만 합산해도 약 6점 누락

---

## 2. 원인 분석

세 가지 독립적인 문제가 복합적으로 작용했다.

### 2-A. Scan loop 실행 순서 버그 (코드 결함)

`runDailyNftChecks()` (wallet-transfer, staking-daily, genesis-passive를 기록하는 함수)가
matview refresh 판단 **이후**에 실행되고 있었다. 이 함수의 insert 건수가 `totalProcessed`에
합산되지 않아 matview refresh를 트리거하지 못했고, 같은 loop에서 스냅샷이 찍히면
stale matview 데이터를 읽어 잘못된 base_score가 기록되었다.

```
수정 전:
  이벤트 -> faucet -> chat -> matview refresh -> daily-nft-check -> 스냅샷
                                                  ^^^^^^^^^^^^^^^^
                                                  이 insert가 matview에 미반영

수정 후:
  이벤트 -> faucet -> chat -> daily-nft-check -> matview refresh -> 스냅샷
```

**영향**: wallet-transfer, staking-daily 카테고리가 스냅샷에 체계적으로 누락됨.

### 2-B. wallet-transfer RPC 조회 범위 부족 (설정 결함)

`detectWalletTransfers()`가 지갑당 최근 10개 트랜잭션만 조회(내림차순).
하루에 10건 이상의 비-transfer 트랜잭션을 수행한 활발한 사용자의 경우
transfer가 조회 범위 밖으로 밀려남.

**영향**: 활발한 사용자의 wallet-transfer가 간헐적으로 미감지.

### 2-C. 인프라 불안정 (운영 이슈)

영향받은 기간 동안 PM2가 59회 재시작. 원인:
- DB 연결 끊김 (`ECONNRESET`, `CONNECTION_ENDED`)
- 인덱서 테이블 가용성 문제 (`relation "event_struct_name" does not exist`)

재시작마다 scanner의 인메모리 상태(`dailyCategorySeen`)가 초기화되고,
crash와 recovery 사이 구간의 이벤트가 누락될 수 있었다.

4/8이 가장 심각한 영향을 받은 날이다. 인덱서 DB가 수 시간 불안정하여
이벤트 기반 scanner가 대부분의 카테고리(lottery, scratchcard, games 등)를 놓쳤다.
faucet과 wallet-transfer만 기록되었다 (이들은 다른 감지 경로 사용).

**영향**: 해당 사용자의 4/8 base_score=2 (실제로는 5-6이어야 함).
이것이 랭킹 #217에서 #9069으로 급락한 직접적 원인이다.

---

## 3. 해결 조치

### 3-A. 코드 수정: scan loop 순서 (2026-04-11 배포)

커밋 `3d84d2ea`:
- `runDailyNftChecks`를 matview refresh 이전으로 이동
- insert 건수를 `totalProcessed`에 합산하여 matview refresh 트리거
- 스냅샷 직전 matview refresh를 안전장치로 추가
- wallet-transfer RPC 조회 limit을 10에서 50으로 증가

### 3-B. 데이터 복구: 3단계 backfill

#### 1단계: 인덱서 DB 기반 backfill
인덱서의 `event_struct_name` 테이블에서 인덱싱은 되었지만 `activity_points`에
기록되지 않은 이벤트를 조회. 2,917건 복구.

#### 2단계: RPC 블록체인 직접 backfill
블록체인에서 RPC `suix_queryEvents`로 각 이벤트 타입을 직접 조회.
인덱서 자체가 놓친 이벤트까지 포착.

| 카테고리 | 복구 건수 |
|----------|----------|
| pado-scratchcard | 156,407 |
| pado-games (numbermatch) | 117,036 |
| pado-lottery | 90,676 |
| staking | 16,943 |
| pado-dex | 1 |
| baram-executor | 2 |
| **합계** | **381,065** |

#### 3단계: 스냅샷 보정
- 40,390건의 스냅샷을 보정된 base_score로 UPDATE (DELETE 없이 UPDATE only)
- 6,009건의 누락 스냅샷 행 INSERT (활동 기록은 있지만 스냅샷이 없던 사용자)
- 영향받은 모든 날짜의 랭킹 재계산
- 모든 보정 행에 `is_backfilled = TRUE` 표시 (감사 추적)

### 3-C. staking을 base_score에서 제외

staking(delegate/unstake)은 Daily Missions UI에 포함되지 않으며,
향후 독립적인 스코어링 시스템을 구축할 예정이다.
matview 제외 목록에 `'staking'` 추가하여 base_score 계산에서 제외.
기존 activity_points의 staking 레코드는 삭제하지 않음 (향후 활용).

### 3-D. edyjayakarya 개인 결과

| 날짜 | 수정 전 | 수정 후 | 변화 |
|------|--------|--------|------|
| 4/1 | 4 | 5 | +1 (pado-games 복구) |
| 4/2 | 4 | 6 | +2 (pado-games, wallet-transfer) |
| 4/8 | 2 | 6 | +4 (lottery, scratchcard, games, staking을 RPC로 복구) |
| 4/10 | 7 | 8 | +1 (wallet-transfer) |

---

## 4. 영향 규모

- **점수가 보정된 사용자**: 34,430명
- **복구된 활동 기록**: 383,981건
- **보정된 스냅샷**: 46,399건 (40,390 업데이트 + 6,009 신규 생성)
- **영향받은 기간**: 2026-04-01 ~ 2026-04-10
- **모든 보정이 점수 증가 방향** (점수가 감소한 사용자 0명)

---

## 5. 재발 방지: Nightly RPC Reconciliation

scanner에 매일 자동 검증 시스템을 내장했다.

**동작 방식**:
매일 스냅샷 직후(UTC 00:05 이후), scanner가 블록체인을 RPC로 직접 조회하여
모든 이벤트 타입의 전날 활동을 검증한다. `activity_points`와 비교하여 누락 건이
있으면 자동으로 INSERT하고, matview refresh 및 스냅샷 보정까지 수행한다.

**왜 이것으로 충분한가**:
- 블록체인이 변조 불가능한 진실의 원천(source of truth)
- RPC는 인덱서를 우회하여 풀노드에서 직접 읽음
- `ON CONFLICT DO NOTHING`으로 멱등성 보장, 반복 실행 안전
- 스냅샷 보정 자동화 (matview > snapshot인 경우만 UPDATE + 누락 행 INSERT)
- 10분 총 타임아웃으로 scan loop 블로킹 방지

**커버하지 않는 항목** (의도적 트레이드오프):
- pado-dex: 1,300만건 이벤트, 인덱서가 99.99999% 정확도로 포착
- chat: 오프체인(WebSocket + SQLite), 블록체인에 없음
- wallet-transfer: RPC per-user 쿼리, 기존 once-per-day scanner가 limit 50으로 처리

**모니터링**: `[Reconcile]` 로그 프리픽스.
정상: `[Reconcile] 2026-04-11: no gaps found`
보정: `[Reconcile] 2026-04-11: 127 gaps filled from RPC`

---

## 6. 재발 방지 대책 평가

### 대응 가능한 시나리오

| 시나리오 | 수정 전 | 수정 후 |
|---------|--------|--------|
| Scanner 커서가 이벤트를 건너뜀 | 영구 손실 | RPC reconciliation이 다음 날 자동 복구 |
| 인덱서 DB 장애 | 수동 backfill 전까지 누락 | 24시간 내 자동 복구 |
| PM2 재시작으로 인메모리 상태 손실 | 이벤트 누락 | Reconciliation이 누락 이벤트 포착 |
| 스냅샷 전 matview 미갱신 | 잘못된 base_score 기록 | 스냅샷 전 matview 강제 refresh + reconciliation 보정 |

### 잔존 리스크

| 리스크 | 발생 가능성 | 영향 | 대응 |
|--------|-----------|------|------|
| RPC 노드 자체 장애 | 낮음 | 당일 reconciliation skip, 다음 날 재시도 | 수동 backfill 스크립트 보유 |
| pado-dex 인덱서 누락 | 매우 낮음 (역사적 1/1,300만) | 해당 사용자 base_score 1점 영향 | 수용, 인덱서 헬스 모니터링 |
| chat 서버 장애 | 중간 (현재 Pado chat 서버 접속 불가) | chat 카테고리 미기록 | 별도 인프라 이슈, 블록체인 데이터 아님 |
| 새 이벤트 타입 추가 시 reconciliation 미반영 | 낮음 | 신규 카테고리 미검증 | 코드 리뷰에서 RECONCILE_QUERIES 업데이트 확인 |

### 결론

재발 방지 시스템은 **블록체인에 대한 매일 자동 검증**을 제공하며,
이는 유일하게 신뢰할 수 있는 진실의 원천이다. scan loop 순서 수정과 결합하여
방어가 다층화되었다:

1. **1계층 (실시간)**: 인덱서 기반 이벤트 scanner (60초 간격)
2. **2계층 (실시간)**: Faucet scanner, chat scanner, wallet-transfer scanner
3. **3계층 (일일)**: RPC reconciliation (블록체인 직접 검증)
4. **4계층 (수동)**: backfill-points.ts, backfill-from-indexer.ts 스크립트

사용자에게 중요한 카테고리(lottery, scratchcard, games, governance, prediction, perp,
lending, baram)에 대해, RPC reconciliation은 24시간 이내에 누락 제로를
블록체인 검증으로 보장한다.
