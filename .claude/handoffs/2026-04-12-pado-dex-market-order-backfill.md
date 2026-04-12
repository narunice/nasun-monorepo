# Handoff: Pado DEX Market Order 포인트 누락 수정

**생성**: 2026-04-12 00:20
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

버그 리포트 조사 중 pado-dex의 market order가 포인트 스캐너에 매핑되지 않아 처음부터 추적되지 않았던 근본 버그를 발견했다. limit order(OrderPlaced)와 cancel order(OrderCanceled)는 정상 추적되지만, market order(OrderFilled/OrderFullyFilled)는 EVENT_MAP에 없어서 완전히 누락된다. nightly reconciliation에 pado-dex 추가 + backfill 스크립트 배포는 완료했으나, market order 매핑 추가 작업이 남아있다.

## 완료된 작업

- [x] 버그 리포트 #1 (thiencd): airdrop pending + chat points - Won't Fix 답장 완료
- [x] 버그 리포트 #2 (thejediworld77): spot trade 포인트 누락 조사
- [x] rpc-reconcile.ts에 pado-dex (OrderPlaced, OrderCanceled) 추가 (커밋 ef483d49, 이미 push됨)
- [x] backfill-dex.ts 스크립트 작성 및 push (커밋 68195c29)
- [x] API 서버 배포 (node-3, PM2 restart 완료)
- [x] backfill 실행: 4/1~4/11 전 기간, 2건 복구 (모두 limit-order)
- [x] thejediworld77 지갑 RPC 조회 -> market order만 사용한 것 확인

## 미완료 작업

- [ ] market order 이벤트 매핑 추가 (핵심 버그 수정)
- [ ] market order backfill 실행
- [ ] thejediworld77 답장 올리기 (복구 완료 확인 후)

## 중요 컨텍스트

### 발견한 근본 원인

thejediworld77의 지갑 `0x3d9e30edf5506017db6cf2b10d7f85bada12225d6ed3b7648a37e46a310e9012`의 최신 TX에서 확인한 이벤트:
- `OrderInfo` - companion event (의도적 제외, OK)
- `OrderFullyFilled` - market order 완전 체결
- `OrderFilled` - 부분 체결
- `EWMAUpdate` - 내부 가격 업데이트

`BASE_POINTS`에 `'market-order': 1`이 정의되어 있지만, `EVENT_MAP_ENTRIES`에 매핑이 없다.

### 수정 방향

1. **points.ts** (EVENT_MAP_ENTRIES): `OrderFilled` 또는 `OrderFullyFilled` -> `pado-dex` / `market-order` 매핑 추가
   - 주의: double-counting 방지 필요. `OrderFilled`는 부분체결마다 발생, `OrderFullyFilled`는 완전체결 시만 발생. daily cap이 category 단위이므로 어느 쪽이든 하루 1회만 카운트됨. 하지만 올바른 이벤트 선택이 중요.
   - `OrderFilled`가 더 포괄적 (부분체결도 감지). daily cap 덕분에 중복은 문제없음.
2. **rpc-reconcile.ts** (RECONCILE_QUERIES): 같은 이벤트 추가
3. **backfill-dex.ts** (DEX_QUERIES): 같은 이벤트 추가
4. 배포 후 전 기간 backfill 재실행

### 핵심 파일 위치

- Scanner event mapping: `apps/network-explorer/api-server/src/config/points.ts` (L129-192)
- Nightly reconciliation: `apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts` (L58-98)
- Backfill script: `apps/network-explorer/api-server/src/scripts/backfill-dex.ts`
- DeepBook package ID: `0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134`

### 주의사항

- market order backfill은 이벤트 수가 매우 많을 수 있음 (13M+ 중 상당수가 market order). backfill 스크립트의 MAX_PAGES(500) 조정이 필요할 수 있음
- pado-dex는 daily cap category이므로 하루 1건만 카운트. market order만 한 유저도 limit order만 한 유저도 동일하게 1점
- 이미 limit-order로 pado-dex 점수를 받은 유저는 market-order 추가해도 영향 없음 (daily cap)
- `OrderInfo`는 `OrderPlaced`와 동시 발생하므로 제외 유지

## 최근 변경 파일

- `apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts` (pushed, ef483d49)
- `apps/network-explorer/api-server/src/scripts/backfill-dex.ts` (pushed, 68195c29)

## 즉시 다음 단계

1. `points.ts` EVENT_MAP_ENTRIES에 `OrderFilled` -> `pado-dex` / `market-order` 매핑 추가
2. `rpc-reconcile.ts` RECONCILE_QUERIES에 같은 이벤트 추가
3. `backfill-dex.ts` DEX_QUERIES에 같은 이벤트 추가
4. 배포 + 전 기간 backfill 재실행
5. thejediworld77 지갑 복구 확인 후 답장 올리기
