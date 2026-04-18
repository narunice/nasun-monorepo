# Handoff: LP Bot Structural Risk Improvements

**생성**: 2026-04-17 (NBTC 가격 이상 incident 직후)
**브랜치**: main
**이전 핸드오프**: 없음 (이번 세션에서 incident 해결 후 작성)

## 현재 상태 요약

오늘 NBTC/NUSDC 마켓에서 가격이 시장가($74,700) 대비 $75,742까지 치솟는 사고가 발생했다.
root cause는 두 가지: (1) arb 후 stale orderbook snapshot으로 order 계산, (2) 이상 주문(fat-finger $400k bid)에 대한 상한 방어 없음.
두 버그는 이미 수정 및 prod 배포 완료. 현재 NBTC spread = 0.40% (정상). 남은 구조적 위험 3건을 이번 작업에서 처리한다.

## 완료된 작업 (이번 세션)

- [x] `lp-bot.ts`: arb 성공 후 orderbook 재조회 (`Object.assign(fullOrderbook, postArbOrderbook)`)
- [x] `strategy.ts`: `minAskPrice`/`maxBidPrice`를 mid price 기준 ±300 bps로 clamp
- [x] Prod 배포 완료 (rsync), 세 봇(NBTC, NETH, NSOL) 모두 재시작
- [x] NBTC spread 정상화 확인

## 미완료 작업 (이번 핸드오프 대상)

### Task 1: Order TTL 단축 (ecosystem.config.cjs)

**현재**: `Date.now() + 1800000` (30분) - `order-manager.ts:75, 117`  
**목표**: `Date.now() + 600000` (10분)

파일: `apps/pado/bots/lib/order-manager.ts`
- L75: `buildCancelAndPlaceOrders` 내 `place_limit_order` expiry
- L117: `buildPlaceOrders` 내 `place_limit_order` expiry

둘 다 600000으로 변경. 봇이 10분마다 cancel-and-replace 하므로 실질적으로 항상 갱신되고, 봇 다운 시 10분 내 orders 자동 소멸.

```typescript
// Before
tx.pure.u64(Date.now() + 1800000), // 30min expiry

// After
tx.pure.u64(Date.now() + 600000), // 10min expiry — auto-expire if bot goes down
```

prod 서버 ecosystem.config.cjs는 수정 불필요 (코드 레벨 변경).
변경 후 prod rsync 필요.

### Task 2: Balance-watchdog 가스 선제 충전

**현재 문제**: `gasRefillThreshold` 이하로 떨어진 후 충전 시도하지만, InsufficientGas 에러로 TX 자체가 실패 → cancel-and-place 못함 → stale orders 쌓임.

**목표**: 가스 잔액이 `gasRefillThreshold * 2` 이하로 떨어지면 선제 충전 (TX 실패 전에 충전).

파일: `apps/pado/bots/lp-bot.ts` - 가스 체크 로직

```typescript
// 현재 (대략적인 패턴, 실제 라인은 lp-bot.ts에서 확인)
if (gasBalance < config.gasRefillThreshold) {
  // refill
}

// 개선: 2배 여유를 두고 선제 충전
const GAS_PREEMPTIVE_MULTIPLIER = 2;
if (gasBalance < config.gasRefillThreshold * GAS_PREEMPTIVE_MULTIPLIER) {
  // preemptive refill — avoid InsufficientGas TX failure
}
```

정확한 구현 위치를 확인하려면 lp-bot.ts에서 `gasRefillThreshold` 검색.

### Task 3: UI Limit Order 가격 경고 (선택적, 우선순위 낮음)

**목표**: limit order 제출 시 시장가 대비 ±10% 초과하면 확인 팝업.

파일: `apps/pado/frontend/src/features/` - limit order form component
- 정확한 파일은 `Grep "limit.*order" --type tsx` 로 찾을 것
- 확인 팝업: "This price is X% away from market price. Continue?"

이 작업은 frontend 작업으로 bot과 무관. 우선순위 낮음.

## 중요 컨텍스트

### 오늘 사고 원인 요약
1. 가스 부족 → cancel-and-place TX 실패 → 전 cycle orders 남아있음
2. 오래된 LP orders (BTC 가격 높을 때) + 사용자 fat-finger $400k bid가 orderbook에 혼재
3. strategy.ts가 `minAskPrice = bestBid * 1.0001 = $400,040`으로 설정
4. 45개 asks 전부 $400k-$587k에 배치
5. UI midPrice = $(400k + 489k) / 2 = $444k 표시

### 알려진 잔존 이슈
- `0xcaa08c7...` BalanceManager: key가 ecosystem.config.cjs에 없음. 사용자 fat-finger 주문이거나 잊힌 오래된 BM.
  - 300 bps clamp로 방어됨. 능동 취소 불가.
  - NBTC orderbook에 $738,000 stale ask 1개 잔존 (bot 동작에는 영향 없음)
- TTL 단축으로 향후 stale orders는 10분 내 자동 소멸

### Prod 서버 bot 상태
- PM2: `pm2 list` on prod EC2
- Config: `apps/pado/bots/ecosystem.config.cjs` on prod server (local repo에 없음)
- rsync 패턴: `rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/pado/bots/ ec2-user@43.200.67.52:/home/ec2-user/pado-bots/`
  (정확한 경로는 prod 서버에서 확인 필요)

### LP Bot 주요 파일
- `apps/pado/bots/lp-bot.ts` - 메인 루프, arb, gas 관리
- `apps/pado/bots/lib/strategy.ts` - order grid 계산 (이미 수정됨)
- `apps/pado/bots/lib/order-manager.ts` - TX 빌더, TTL 설정 위치
- `apps/pado/bots/lib/config.ts` - LPConfig, gasRefillThreshold 정의

## 최근 변경 파일 (미커밋)

- `apps/pado/bots/lp-bot.ts` - post-arb orderbook re-fetch
- `apps/pado/bots/lib/strategy.ts` - 300 bps constraint clamp
- `apps/pado/bots/lib/config.ts` - debug log 리팩터 (이전 세션)
- `apps/pado/bots/ecosystem.config.cjs` (tracked 여부 불명, prod 서버본과 다를 수 있음)

## 즉시 다음 단계

1. `apps/pado/bots/lib/order-manager.ts` 읽고 TTL 두 곳 600000으로 변경
2. `apps/pado/bots/lp-bot.ts`에서 `gasRefillThreshold` 사용 위치 grep, 선제 충전 로직 추가
3. 변경 후 prod rsync + PM2 restart (NBTC부터)
4. NBTC spread 확인 (목표: 0.40% 유지)
5. git commit (task별 별도 커밋 권장)
