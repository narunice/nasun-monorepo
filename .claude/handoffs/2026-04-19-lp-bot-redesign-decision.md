# Handoff: Pado LP/Arb 봇 재설계 결정

**생성**: 2026-04-19 02:50
**브랜치**: main
**이전 핸드오프**:
- [2026-04-17-lp-bot-gas-ttl-improvement.md](2026-04-17-lp-bot-gas-ttl-improvement.md)
- [2026-04-17-lp-bot-faucet-inventory.md](2026-04-17-lp-bot-faucet-inventory.md)
- [2026-04-17-lp-bot-price-divergence.md](2026-04-17-lp-bot-price-divergence.md)
- [2026-03-23-pado-bot-faucet-contention.md](2026-03-23-pado-bot-faucet-contention.md)

---

## 핵심 문제의식

**봇 시스템을 4개월 동안 반복 패치했지만 동일한 장애가 계속 재발하고 있다. 이건 패치로 해결될 문제가 아니다. 근본적인 재설계가 필요하다.**

현재 증상: 오더북 비어있음 (특히 buy side), 가스 부족, stale object 오류, 봇 재시작 누적

---

## 재발 장애 히스토리

| 날짜 | 증상 | 임시 픽스 | 재발 여부 |
|------|------|-----------|-----------|
| 2026-03-23 | Faucet contention으로 봇 전체 중단 | 봇별 키페어 분리, TOKEN_FAUCET_DISABLED | 재발 |
| 2026-04-17 오전 | NBTC 가격 Binance 대비 $1,000 이상 divergence | 300bps clamp, cascade 버그 수정, split TX | 재발 |
| 2026-04-17 오후 | NETH/NSOL ask depth 고갈, 가스 부족 | faucet retry, watchdog 개선, 전용 키 복원 | 재발 |
| 2026-04-19 (오늘) | 모든 마켓 오더북 비어있음 (buy side 완전 소멸) | oracle admin 지갑 충전 (300 NASUN), 봇 재시작 | 현재 진행 중 |

---

## 오늘 장애의 근본 원인 분석

### 1. Watchdog가 LP 봇을 살리지 못하는 구조

```
watchdog 체크 주기: 5분
LP 봇 가스 소비: ~90 TX/40s * 3 bots = 6.75 TX/분
1 TX 가스 비용: ~0.008 NASUN (추정)
5분간 소비: ~0.27 NASUN

GAS_LOW_THRESHOLD = 5 NASUN  (watchdog 리필 기준)
GAS_REFILL_AMOUNT = 50 NASUN (watchdog 1회 전송량)
```

**문제**: 5분 사이클 동안 가스가 계속 소비되는데, watchdog가 리필에 실패하면 봇이 멈출 때까지 5분 이상 공백 발생. 오늘은 oracle admin 잔액(35 NASUN)이 REFILL_AMOUNT(50 NASUN)보다 작아서 리필 자체가 실패.

### 2. 3개 봇이 1개 지갑 공유 (LP_PRIVATE_KEY)

```
LP_PRIVATE_KEY = 0x6d33f7d624da24...
- lp-bot-nbtc: 동일 주소
- lp-bot-neth: 동일 주소 (LP_PRIVATE_KEY_NETH 따로 있지만 watchdog는 LP_PRIVATE_KEY 기준)
- lp-bot-nsol: 동일 주소
```

**문제**: 동일 지갑의 coin object를 3개 봇이 동시에 소비하려 하면 `Object already locked` 오류 발생. 오늘 에러 로그에도 이 패턴이 반복됨:

```
Object (0x4e4dab04...) already locked by a different transaction: TransactionDigest(2HWFmrQp...)
```

### 3. BalanceManager stale object 오류 반복

```
Object ID 0x4e4dab04... is not available for consumption, current version: 0x6d27a0d
```

봇이 이전 TX에서 사용한 object의 오래된 version을 참조. retry 로직을 추가했지만 완전 해결 안 됨. DeepBook BalanceManager는 매 TX마다 버전이 업데이트되는 owned object인데, 봇이 RPC에서 fresh version을 얻지 못하는 경우 반복 실패.

### 4. Faucet 의존 구조의 한계

devnet 토큰(NBTC, NETH, NSOL, NUSDC)을 faucet으로 계속 채워야 하는 구조. faucet은 rate limit, shared object contention, 24h 쿨다운 등의 제약이 있어 안정적이지 않음.

---

## 현재 봇 시스템 구조 (문제점 포함)

```
prod EC2 (43.200.67.52)
/home/ec2-user/pado-bots/
  lp-bot.ts         (595 lines) - NBTC/NETH/NSOL 공통 코드
  scripts/
    balance-watchdog.ts (324 lines) - 5분마다 가스/토큰 체크
    sweep-stale-orders.ts - 수동 실행용
  ecosystem.config.cjs - PM2 설정

문제 있는 의존 관계:
- lp-bot-nbtc, neth, nsol -> 동일 LP_PRIVATE_KEY 지갑 (coin 충돌)
- watchdog -> oracle admin 지갑 (ORACLE_ADMIN_KEY) 에서 가스 전송
  -> oracle admin 잔액이 refill amount보다 적으면 전체 실패
  -> watchdog 재시작 없이는 stale coin object 오류 계속
- 토큰 리필 -> faucet (rate limit, contention)
```

---

## 재설계 방향 검토

### 옵션 A: 현행 유지 + 핀포인트 픽스 (비권장)

고칠 것:
1. oracle admin 지갑에 1000+ NASUN 충전 (충분한 여유)
2. watchdog가 여러 coin을 merge해서 사용하도록 수정
3. WATCHDOG_GAS_AMOUNT를 20으로 낮춰서 실패 없이 보내기

**한계**: 가스 소비율이 높고 faucet 의존을 해결 못 함. 3-4주 후 또 동일 문제 발생.

### 옵션 B: 봇 아키텍처 재설계 (권장)

핵심 변경사항:

**B-1. 각 봇이 독립 지갑 사용 (완전 분리)**

현재도 LP_PRIVATE_KEY_NBTC/NETH/NSOL이 있지만 watchdog는 LP_PRIVATE_KEY 하나만 본다. 진짜로 각 봇이 완전히 독립된 지갑을 쓰고, watchdog도 각 지갑을 개별 관리.

**B-2. Sponsored Transaction으로 가스 문제 근본 해결**

LP 봇 TX를 Nasun 노드가 sponsor하면 봇 지갑에 가스 충전 불필요. devnet이므로 sponsor 주소를 별도로 관리.

또는: **가스 오브젝트를 재사용하지 않고 매번 신규 split**. 현재는 gas coin을 재사용하다 stale version 오류 발생. 매 TX 전 최신 gas coin object 조회 후 사용.

**B-3. 토큰 Pre-fund로 faucet 의존 제거**

`scripts/prefund-bot.ts`가 이미 있음. 대량 pre-fund 후 faucet 사용 제거(`LP_DISABLE_TOKEN_FAUCET=true`). 잔고 임계값에서 alert만 발생시키고 자동 refill 안 함.

**B-4. Watchdog를 reactive에서 proactive로**

현재: 가스 부족 감지 후 충전 시도 (이미 실패한 상태)
개선: 가스가 threshold *2 미만이면 선제 충전 (아직 여유 있을 때)

**B-5. Heartbeat + 자동 재시작 from clean state**

봇이 5분 이상 주문을 배치 못하면 (stuck 감지) PM2 restart + state file 삭제로 완전 초기화.

---

## 즉시 해야 할 것 vs 나중에 해야 할 것

### 지금 당장 (오늘 내)

1. **oracle admin 잔액 유지**: oracle admin(`0xe1c4c90bd18d22d5...`)에 현재 35+300=335 NASUN 있음. watchdog WATCHDOG_GAS_AMOUNT=20으로 낮추면 16회 리필 가능. 당장 문제는 없으나 주기적 모니터링 필요.

2. **watchdog 환경변수 추가**: prod 서버 PM2 설정에 `WATCHDOG_GAS_AMOUNT=20` 추가해서 oracle admin이 50 NASUN 보내려다 실패하는 문제 방지.

3. **가스 소비율 확인**: 봇 3개가 1개 지갑을 공유할 때 시간당 NASUN 소비량 계산. oracle admin의 현재 잔액으로 며칠 버티는지.

### 다음 세션 (재설계)

1. **봇 3개 완전 독립 지갑 분리** (가장 효과 높음)
2. **매 TX 전 fresh gas coin 조회** (stale object 오류 제거)
3. **토큰 대량 pre-fund + faucet 비활성화** (faucet 의존 제거)
4. **watchdog proactive 충전 (threshold * 2)** (가스 고갈 전 충전)

---

## 현재 상태 (2026-04-19 02:50)

```
PM2 프로세스:
- lp-bot-nbtc: online (21회 재시작, 24m uptime)
- lp-bot-neth: online (26회 재시작, 24m uptime)
- lp-bot-nsol: online (21회 재시작, 24m uptime)
- balance-watchdog: online (5회 재시작, 42m uptime)

지갑 잔액:
- LP 봇 공유 지갑 (0x6d33f7d6...): ~0.2 NASUN (또 낮아지는 중)
- Oracle admin (0xe1c4c90b...): ~335 NASUN (방금 300 NASUN 충전)

오류 패턴 (lp-bot-nbtc-error.log):
- "Low gas: X NASUN, skipping cycle" - 반복 (가스 소진)
- "Object already locked by a different transaction" - 동시성 충돌
- "Object is not available for consumption" - stale reference
```

---

## 중요 파일 위치

| 파일 | 위치 |
|------|------|
| LP 봇 메인 | `/home/ec2-user/pado-bots/lp-bot.ts` (prod 서버) |
| Watchdog | `/home/ec2-user/pado-bots/scripts/balance-watchdog.ts` (prod 서버) |
| PM2 설정 | `/home/ec2-user/pado-bots/ecosystem.config.cjs` (prod 서버) |
| .env | `/home/ec2-user/pado-bots/.env` (prod 서버) |
| 로컬 소스 | `apps/pado/bots/` (monorepo, prod 서버와 sync 불확실) |

**주의**: prod 서버의 `pado-bots/`와 로컬 `apps/pado/bots/`의 sync 상태 불명. 서버에서 직접 수정된 것들이 있어 diff가 있을 가능성 높음.

---

## 즉시 다음 단계

1. watchdog 환경변수 조정 (WATCHDOG_GAS_AMOUNT 낮추기):
   ```bash
   ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52
   # ecosystem.config.cjs에서 balance-watchdog env에 WATCHDOG_GAS_AMOUNT=20 추가
   pm2 delete balance-watchdog && pm2 start ecosystem.config.cjs --only balance-watchdog
   ```

2. 봇 가스 소비율 측정:
   ```bash
   # 1시간 후 LP 봇 지갑 잔액 확인으로 시간당 소비량 계산
   curl -s https://rpc.devnet.nasun.io -X POST -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"suix_getBalance","params":["0x6d33f7d624da24c82ec46ac62a431135dfc4a8c26542a05efcd499890e4e28bc","0x2::sui::SUI"]}'
   ```

3. 재설계 결정:
   - 재설계를 결정했다면 `apps/pado/bots/` 를 새 디렉토리(`apps/pado/bots-v2/`)로 시작
   - 핵심 변경: 독립 지갑, fresh gas coin, pre-fund, proactive watchdog
   - 배포 전 staging에서 반드시 검증
