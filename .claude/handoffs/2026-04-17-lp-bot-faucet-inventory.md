# Handoff: LP Bot NETH Faucet & Inventory Recovery

**생성**: 2026-04-17 10:20
**브랜치**: main
**이전 핸드오프**: [2026-04-17-lp-bot-price-divergence.md](2026-04-17-lp-bot-price-divergence.md)

## 현재 상태 요약

NBTC/NETH 가격 divergence 수정 완료 후 NETH ask 오더북 얕음 문제를 해결 중. 근본 원인은 `LP_DISABLE_TOKEN_FAUCET=true`로 NETH 자동 리필이 비활성화되어 있었던 것. PM2 데몬 재시작 과정에서 NETH 봇 전용 키(`LP_PRIVATE_KEY_NETH`)가 .env에 없어 유실됐다가 복원됐다. NETH 봇은 현재 25/45 asks로 매 10초마다 0.5 NETH씩 쌓이는 중.

## 완료된 작업

- [x] `LP_DISABLE_TOKEN_FAUCET=true` prod .env에서 제거
- [x] `LP_PRIVATE_KEY_NETH` .env에 복원 (`suiprivkey1qptcxyhw3wjdtunnuuklxzzkg44rvx7uqqk2zcw5cj9nzdep7zn8jea7j4x`)
- [x] NETH 봇이 원래 BalanceManager(`0xfe0ffbdd486bde`) 복원, 100.7 NETH 회수
- [x] `balance-manager.ts`: "not available for consumption" 에러 retry 처리 추가 (maxRetries 5, 5s/10s/15s delay)
- [x] `faucet.ts`: V2/NUSDC faucet에 "not available for consumption" retry 처리 추가
- [x] `lp-bot.ts`: 시작 시 faucet 라운드 30 → 5로 줄임 + 라운드 간 3초 간격 추가 (RPC 버전 충돌 방지)
- [x] 이전 세션 수정들 (arb skip gate 분리, max arb quantity, skew cap, order TTL) 모두 prod 배포 완료
- [x] 수정 검증: 매 10s 사이클마다 arb 실행, NBTC 가격 = Binance, NETH 가격 = Binance

## 미완료 작업

- [ ] NETH ask depth 완전 복원 (현재 25/45, ~216 NETH 필요, 약 20분 소요 예상)
- [ ] LP_PRIVATE_KEY_NSOL 유실 여부 확인 및 복원 (NSOL 봇은 원래부터 2729 restarts 문제 있었음)
- [ ] NSOL 봇 안정성 문제 조사 (이전 세션에서 2729 restarts 확인됐지만 미해결)
- [ ] 로컬 변경 파일 git commit (bot 수정 6개 파일 + leaderboard UI 파일들)
- [ ] Leaderboard UI staging 검증 후 prod 배포 (이전 핸드오프에서 pending이었던 것)
- [ ] Wash trading filter 연결 (`aggregateTraderVolume`에 `sameIdentityPairs` 연결)

## 중요 컨텍스트

- **PM2 env 관리 원칙**: `pm2 kill` 후 재시작하면 LP_PRIVATE_KEY_* 가 .env에 없으면 유실됨. 반드시 `.env`에 모든 per-bot 키 보관. 재시작 시 `cd ~/pado-bots && export $(grep -v '^#' .env | grep -v '^$' | xargs) && pm2 startOrRestart ecosystem.config.cjs` 사용. `pm2 restart --update-env`는 ecosystem CJS를 재평가하지 않으므로 LP_PRIVATE_KEY 변경에는 효과 없음.

- **PM2 env 업데이트 올바른 방법**:
  1. 새 env var 추가/변경: `export $(.env) && pm2 startOrRestart ecosystem.config.cjs --only <bot>`
  2. env var 삭제: `pm2 delete <bot> && export $(.env) && pm2 start ecosystem.config.cjs --only <bot>` (이것도 안 되면 `pm2 kill && export $(.env) && pm2 start ecosystem.config.cjs`)

- **LP_DISABLE_TOKEN_FAUCET**: prod .env에서 제거됨. 재배포 시 .env 파일에 다시 넣지 말 것. 원래 V1 faucet contention 우려로 추가됐었지만, NETH/NSOL V2 faucet은 별도 오브젝트이므로 contention 없음. NBTC는 잔고 충분해서 faucet 트리거 안 됨.

- **NETH 전용 키**: `LP_PRIVATE_KEY_NETH=suiprivkey1qptcxyhw3wjdtunnuuklxzzkg44rvx7uqqk2zcw5cj9nzdep7zn8jea7j4x` - prod `.env`에 이미 복원됨. NSOL 전용 키(`LP_PRIVATE_KEY_NSOL`)는 확인 안 됨, 없으면 공유 키 사용 중.

- **NETH BalanceManager**: `0xfe0ffbdd486bde` (원래 BM, NETH 키 주소 `0x07d68dd07bbecb` 소유). state file `~/pado-bots/.lp-bot-state-neth.json`에 매핑 있음.

- **faucet 한계**: V2 faucet은 0.5 NETH/call, 45 asks 전부 채우려면 ~216 NETH 필요. 매 10s 사이클에 0.5 NETH 증가 = 풀 depth 도달까지 20-25분. "무제한 faucet이 있다"는 말이 더 많이 주는 별도 오브젝트를 가리킬 수 있음 - 확인 필요.

- **수정된 파일 (prod 배포 완료, 로컬 uncommitted)**:
  - `apps/pado/bots/lp-bot.ts` - arb/skip gate 분리, 시작 faucet rounds 5로 제한, 3s 간격
  - `apps/pado/bots/lib/strategy.ts` - skew adjustment cap 추가 (max 30% of spreadBps)
  - `apps/pado/bots/lib/order-manager.ts` - 24h TTL → 10min TTL (split-TX path)
  - `apps/pado/bots/lib/balance-manager.ts` - "not available for consumption" retry
  - `apps/pado/bots/lib/faucet.ts` - V2/NUSDC faucet version conflict retry
  - `apps/pado/bots/ecosystem.config.cjs` - NBTC `LP_MAX_ARB_QUANTITY` 0.1 → 2

## 최근 변경 파일 (bot 관련)

```
M apps/pado/bots/ecosystem.config.cjs
M apps/pado/bots/lib/balance-manager.ts
M apps/pado/bots/lib/config.ts
M apps/pado/bots/lib/faucet.ts
M apps/pado/bots/lib/order-manager.ts
M apps/pado/bots/lib/strategy.ts
M apps/pado/bots/lp-bot.ts
```

그 외 leaderboard UI 파일들 (이전 핸드오프 참조):
```
M apps/pado/frontend/src/features/leaderboard/...
M apps/pado/frontend/src/pages/LeaderboardPage.tsx
```

## 즉시 다음 단계

1. NETH ask depth 모니터링: `ssh prod "pm2 logs lp-bot-neth --lines 5 --nostream | grep 'asks\|Inventory'"` - 25 → 45 asks 도달 확인
2. NSOL 봇 상태 확인: `ssh prod "pm2 logs lp-bot-nsol --lines 20 --nostream | tail -20"` - 안정 여부 및 ask depth 확인
3. 필요 시 NSOL 전용 키 확인: `pm2 env 3 | grep LP_PRIVATE_KEY` - LP_PRIVATE_KEY_NSOL이 다른 값인지 확인
4. bot 파일 6개 git commit: `git add apps/pado/bots/ && git commit -m "fix(pado/bots): fix price divergence - decouple arb from skip gate, add faucet retry, fix order TTL"`
5. Leaderboard UI staging 검증 후 prod 배포 (이전 핸드오프 참조)
