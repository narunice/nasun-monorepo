# Handoff: Pado LP Bot Faucet Contention 해결

**생성**: 2026-03-23 02:30
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

Pado LP 봇(3개)과 일반 사용자 간 faucet contention 문제를 해결하기 위한 코드 변경이 완료됨. 봇별 keypair 분리, 토큰 faucet 비활성화, NETH faucetBaseAmount 수정, pre-fund 스크립트 작성이 완료되었고 TypeScript 체크 통과. **아직 커밋/배포되지 않았으며, 서버에 keypair 생성 및 pre-fund 실행이 필요.**

## 완료된 작업

- [x] Faucet 버그 분석 및 원인 파악 (shared object + owned gas coin contention)
- [x] wallet 패키지 faucet 안정성 개선 (commit `ad74d60b`) - timeout, error parsing
- [x] 모든 앱 스테이징/프로덕션 배포 (nasun-website, pado, explorer, baram)
- [x] Pado 봇 중단 (`pm2 stop all`)
- [x] 플랜 작성 + 4차 리뷰 통과 (PASS WITH WARNINGS)
- [x] 코드 변경 4건 구현:
  - NETH faucetBaseAmount 0.1 -> 2.5 (config.ts)
  - TOKEN_FAUCET_DISABLED env var (faucet.ts + config.ts)
  - 봇별 keypair 분리 + kill_timeout: 10000 (ecosystem.config.cjs)
  - Pre-fund 스크립트 (scripts/prefund-bot.ts)
- [x] TypeScript 체크 통과 (봇 코드)
- [x] strategy.test.ts에 disableTokenFaucet 필드 추가

## 미완료 작업

- [ ] 변경사항 커밋 + 푸시 (`/ship`)
- [ ] 서버에 3개 keypair 생성 (`nasun client new-address ed25519`)
- [ ] 서버 `.env`에 keypair 추가 (`LP_PRIVATE_KEY_NBTC/NETH/NSOL`)
- [ ] 각 keypair에 gas 충전 (HTTP faucet)
- [ ] pre-fund 스크립트로 각 봇에 토큰 적재
- [ ] 봇 배포 + PM2 start
- [ ] 안정 운영 확인 (restart 없이 동작하는지)
- [ ] Phase B: Admin Bulk Mint (별도 이슈, Move 계약 변경)

## 중요 컨텍스트

다음 세션에서 반드시 알아야 할 정보:

- **봇은 현재 중단 상태**: `pm2 stop all` 실행됨. Pado DEX에서 LP/가격 업데이트/TP-SL 모두 비활성
- **결정사항**: Move 계약 변경 없이 봇 코드만 변경. legacy faucet 함수 + PTB 배칭으로 pre-fund. Admin Bulk Mint는 Phase B로 분리.
- **BalanceManager owner 주의**: 새 keypair는 기존 BalanceManager의 owner가 아니므로 접근 불가. 기존 state file 삭제 필요. 기존 BM 잔고는 devnet이므로 포기.
- **NBTC faucetBaseAmount 불일치**: config 1.0 vs Move 소스 0.1. 배포된 계약이 업그레이드됐을 수 있음. on-chain 확인 필요 (`nasun client call --dry-run`).
- **pnpm build:pado 실패**: 기존 IchimokuCloudRenderer.ts의 미사용 변수 에러 (이번 변경과 무관). 봇 tsc는 통과.
- **플랜 파일**: `.claude/plans/enumerated-hugging-perlis.md` - 배포 순서 8단계 상세 기술

### 배포 순서 (엄수)

1. 서버 `.env`에 3개 keypair 추가
2. 기존 봇 `pm2 stop all` (이미 완료)
3. 기존 state file 백업
4. 기존 BM 잔고 포기 (devnet)
5. state file 삭제
6. 각 keypair에 gas 충전
7. pre-fund 스크립트로 토큰 적재
8. 새 코드 배포 + `pm2 start ecosystem.config.cjs`

## 최근 변경 파일

| 파일 | 변경 |
|------|------|
| `apps/pado/bots/lib/config.ts` | NETH faucetBaseAmount 0.1->2.5, LPConfig에 disableTokenFaucet 필드 |
| `apps/pado/bots/lib/faucet.ts` | TOKEN_FAUCET_DISABLED 체크 (requestTokens만) |
| `apps/pado/bots/ecosystem.config.cjs` | 봇별 LP_PRIVATE_KEY 분리 + kill_timeout: 10000 |
| `apps/pado/bots/lib/strategy.test.ts` | disableTokenFaucet 필드 추가 |
| `apps/pado/bots/scripts/prefund-bot.ts` | 신규: PTB 배칭 pre-fund 스크립트 |

## 즉시 다음 단계

1. `/ship`으로 변경사항 커밋 + 푸시
2. 서버 SSH 접속 후 keypair 생성 + `.env` 업데이트
3. pre-fund 스크립트 실행 후 봇 배포
