# Handoff: LP Bot Price Divergence - 근본 조사 필요

**생성**: 2026-04-17 09:15
**브랜치**: main
**이전 핸드오프**: `.claude/handoffs/2026-04-17-lp-bot-gas-ttl-improvement.md`

## 현재 상태 요약

오늘(4/17) 오후부터 NBTC, NETH, NSOL 세 마켓 모두에서 Pado 표시 가격이 Binance보다 높아지는 문제가 동시다발적으로 발생했다. 원인은 16개+ 외부 BM(사용자/봇)들이 모든 pool에서 활발히 주문을 넣고 있어, 우리 봇의 POST_ONLY ask와 교차 가능성이 높아진 것이다. NBTC는 split TX 수정으로 stale order 누적은 막았고 spread 0.40% 복구됐으나, NETH(0.99%), NSOL(1.19%)는 여전히 비정상이다. 외부 bid가 ask grid 일부 레벨을 스킵시켜 bestAsk가 올라가 mid가 바이낸스보다 높게 표시된다.

## 완료된 작업 (이번 세션 전체)

- [x] `strategy.ts`: cascade 버그 수정 (skip logic), 300bps clamp 적용
- [x] `lp-bot.ts`: post-arb 3s delay, MAX_SKIP_CYCLES 30→6, requoteThreshold 50→20
- [x] `order-manager.ts`: **split TX 수정** - assert_execution(code 5) 실패 시 cancel-only TX + place-only TX 분리 실행
- [x] `order-manager.ts`: TTL 30min→10min (캔들 30min 내 자동 소멸)
- [x] `scripts/sweep-stale-orders.ts`: IOC sweep 스크립트 생성
- [x] 0xcaa08c7 BM 청소 (IOC sweep + cancel)
- [x] $738k/$407k stale bid sweep (IOC SELL)
- [x] NBTC spread 0.40% 복구 확인

## 미완료 작업 (근본 조사 필요)

- [ ] **NETH spread 0.99% 원인 조사** (목표 30bps)
  - 외부 BM들이 NETH pool에서 어떤 BM이 얼마나 활동 중인지 확인
  - `client.queryTransactionBlocks({ filter: { InputObject: NETH_POOL_ID } })` 로 active BMs 목록 추출
- [ ] **NSOL spread 1.19% 원인 조사** (목표 40bps)
  - NSOL bot 2729회 재시작 원인 확인 (InsufficientGas? MoveAbort?)
  - NSOL pool active BMs 확인
- [ ] **NETH ask depth 낮음** (user 보고: sell order가 buy보다 적음)
- [ ] **NSOL ask depth 낮음** (같은 패턴)
- [ ] spread가 좁아지지 않는 근본 해결:
  - 옵션 A: 외부 bid를 arb으로 더 빠르게 소비 (arb 임계값 낮추기)
  - 옵션 B: 전략적으로 외부 bid 위에 ask 배치 (minAskPrice 무시 + skipping 제거)
  - 옵션 C: LP_SPREAD_BPS를 각 마켓별로 충분히 넓게 설정하여 skip 없이 배치

## 중요 컨텍스트

### 오늘 갑자기 문제가 터진 이유
- **3가지 버그의 복합 작용**:
  1. strategy.ts cascade 버그 (minAskPrice 초과 시 모든 asks가 한 가격으로 밀림)
  2. arb 후 orderbook 재조회 없이 stale snapshot 사용
  3. cancel+place 원자 TX 실패 시 cancel도 롤백 → stale orders 누적
- 모두 기존에 있던 버그이나, 오늘 fat-finger $400k bid + 가스 부족이 겹쳐 증폭됨

### assert_execution code 5 (MoveAbort)
- DeepBook POST_ONLY 주문이 existing bid를 cross할 때 발생
- cancel_all_orders + place_orders가 같은 TX → TX 실패 시 cancel도 롤백
- **수정 완료**: assert_execution 에러 시 cancel-only TX 먼저 실행, 성공하면 place-only TX
- NBTC는 이미 0.40%로 복구. NETH/NSOL도 이 수정 적용되어 있으나 spread는 여전히 넓음

### 외부 BM 현황 (NBTC pool 기준)
- 17개 BM이 최근 NBTC pool에서 활동 확인 (queryTransactionBlocks로 파악)
- 알려진 prod BMs: `0x760562b` (NBTC), `0xf08a313d` (NETH), unknown NSOL BM
- 외부 bid들이 (Binance mid + 20-60bps) 범위에 지속 배치 → 봇 ask levels 스킵 유발

### rsync 주의사항
- `rsync --delete` 옵션이 prod의 `node_modules/.bin/tsx`를 삭제함!
- 배포 후 `npm install` 실행 또는 rsync에 `--exclude node_modules` 추가 필요
- **현재 배포 패턴**: `rsync -avz --delete -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/pado/bots/ ec2-user@43.200.67.52:/home/ec2-user/pado-bots/` → node_modules 삭제됨
- **올바른 패턴**: `--exclude node_modules` 추가

### Prod 서버 BM 매핑 (완전 확인)
| 주소(앞 10자) | BM ID(앞 10자) | 용도 |
|---|---|---|
| 0xdbff61d... | 0x760562b... | NBTC bot (LP_PRIVATE_KEY_NBTC) |
| 0x07d68dd... | 0xf08a313d... | NETH bot (LP_PRIVATE_KEY_NETH) |
| 0x86cf58... | (확인 필요) | NSOL bot (LP_PRIVATE_KEY_NSOL) |
| 0x6d33f7d... | 0xcaa08c7... | fallback key (비활성, 오늘 청소됨) |
| 0x9c8ef05c... | (BM 없음) | suspicious-hematite, 로컬 keystore에 있음 |

### 현재 prod 봇 상태 (09:12 기준)
- NBTC: 0.40% spread, 90 orders (정상)
- NETH: 0.99% spread, 52-62 orders (비정상)
- NSOL: 1.19% spread, 55-73 orders (비정상), 2729 재시작
- 세 봇 모두 `online` 상태

## 최근 변경 파일

봇 관련:
- `apps/pado/bots/lib/strategy.ts` - cascade → skip, 300bps clamp
- `apps/pado/bots/lib/order-manager.ts` - split TX, TTL 10min
- `apps/pado/bots/lp-bot.ts` - post-arb delay, MAX_SKIP_CYCLES=6, requoteThreshold=20
- `apps/pado/bots/lib/config.ts` - debug log 리팩터
- `apps/pado/bots/scripts/sweep-stale-orders.ts` - NEW

## 즉시 다음 단계

### 1. NETH/NSOL pool active BM 목록 추출

```javascript
// NETH pool
const NETH_POOL_ID = '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7';
const txns = await client.queryTransactionBlocks({
  filter: { InputObject: NETH_POOL_ID },
  limit: 50, order: 'descending',
  options: { showEvents: true },
});
```

이 BM들 중 external bids의 소유자를 파악 → 취소 가능한지 확인

### 2. NSOL 재시작 2729회 근본 원인 파악

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  "grep -c 'Failed\|Error' ~/pado-bots/logs/lp-bot-nsol-error.log && tail -20 ~/pado-bots/logs/lp-bot-nsol-error.log"
```

### 3. 외부 bid 기반 spread 넓어짐 해결

옵션 C (가장 빠름): spread를 충분히 넓혀서 외부 bid와 교차 가능성 낮춤

```bash
# 각 봇의 LP_SPREAD_BPS 값 확인
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  "grep -A5 'lp-bot-neth\|lp-bot-nsol' ~/pado-bots/ecosystem.config.cjs | grep SPREAD"
```

현재 NETH = 30bps, NSOL = 40bps. 외부 bid가 50-60bps 범위에 있으면 SPREAD를 70bps로 올리면 skip 없이 배치 가능.

### 4. rsync 배포 패턴 수정 (node_modules 보호)

```bash
# 올바른 rsync 패턴
rsync -avz --delete --exclude node_modules \
  -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" \
  apps/pado/bots/ ec2-user@43.200.67.52:/home/ec2-user/pado-bots/
```

### 5. git commit

변경된 파일들 커밋 (strategy.ts, lp-bot.ts, order-manager.ts, config.ts, sweep-stale-orders.ts)

```bash
git add apps/pado/bots/lib/strategy.ts apps/pado/bots/lib/order-manager.ts \
        apps/pado/bots/lp-bot.ts apps/pado/bots/lib/config.ts \
        apps/pado/bots/scripts/sweep-stale-orders.ts
git commit -m "fix(pado/bots): resolve LP price divergence from Binance

- strategy: fix cascade bug to skip-only, add 300bps stale-bid clamp
- order-manager: split cancel+place TX on POST_ONLY crossing (assert_execution)
- order-manager: reduce order TTL 30min to 10min
- lp-bot: post-arb 3s RPC delay, MAX_SKIP_CYCLES 6, requoteThreshold 20bps
- add sweep-stale-orders.ts one-shot script for emergency cleanup"
```
