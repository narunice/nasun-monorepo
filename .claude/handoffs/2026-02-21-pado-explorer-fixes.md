# Handoff: Pado BalanceManager + Explorer Top Accounts Fix

**생성**: 2026-02-21 17:15
**브랜치**: main
**이전 핸드오프**: [2026-02-21-devnet-infra-migration-complete.md](2026-02-21-devnet-infra-migration-complete.md)

## 현재 상태 요약

두 가지 버그 수정을 완료하고 커밋+배포까지 마침. Pado의 DeepBook BalanceManager notExists 에러(레이스 컨디션)와 Explorer Top Accounts 페이지가 6개 지갑만 표시하던 문제를 해결. 추가로 node-2의 잔재 서비스를 정리하고, node-3의 인덱서를 복구함.

## 완료된 작업

- [x] **Pado BalanceManager 레이스 컨디션 수정** — `useBalanceManagerBalance`에 `balanceManagerId` 파라미터 추가, 3개 consumer 업데이트
- [x] **Explorer Top Accounts 하이브리드 아키텍처** — PostgreSQL + RPC 주소 발견 → RPC 실시간 잔액 조회 (6개 → 50개 지갑)
- [x] **rpc.ts 모듈 생성** — 공유 JSON-RPC 헬퍼 + `getBalance` + `discoverAddressesViaRpc` 함수
- [x] **Node-3 배포** — explorer-api 코드 rsync + PM2 재시작, `.env`에 `SUI_RPC_URL`, `GENESIS_ADDRESSES` 추가
- [x] **Node-2 잔재 정리** — sui-indexer, PostgreSQL, explorer-api 서비스 중지/제거/삭제 (3.5GB 디스크 회수)
- [x] **Node-3 인덱서 복구** — DB 리셋 + `--start-checkpoint 6584888` 설정, 실시간 인덱싱 정상화
- [x] 모든 변경 커밋 완료 (push 여부는 미확인)

## 미완료 작업

- [ ] **git push 필요** — 커밋은 완료됐지만 remote에 push 안 됨 (사용자 확인 필요)
- [ ] **첫 호출 레이턴시 최적화** — RPC 주소 발견 첫 호출 ~20초 소요 (5분 캐시로 완화). 백그라운드 프리워밍 고려 가능
- [ ] **security-reviewer + code-reviewer 실행** — CLAUDE.md 규칙에 따라 push 전 보안 검사 필요

## 중요 컨텍스트

### 3-Node 아키텍처 (2026-02-21 마이그레이션 완료)

| Node | IP | 역할 | SSH |
|------|-----|------|-----|
| node-1 | 3.38.127.23 | Validator + Faucet | `ubuntu@` + `nasun-devnet-key.pem` |
| node-2 | 3.38.76.85 | Validator + zkLogin Prover | `ubuntu@` + `nasun-devnet-key.pem` |
| node-3 | 54.180.61.196 | Fullnode + Indexer + PostgreSQL + Explorer API + Nginx | `ubuntu@` + `nasun-devnet-key.pem` |

SSH 키: `/home/naru/.ssh/.awskey/nasun-devnet-key.pem`

### 결정사항

- **하이브리드 주소 발견**: PostgreSQL (인덱서가 최근 체크포인트에서 발견) + RPC (`suix_queryTransactionBlocks`로 faucet 트랜잭션 순회). RPC 발견은 5분 캐시, 잔액 조회는 60초 캐시.
- **GENESIS_ADDRESSES 환경변수**: faucet/admin 주소를 콤마 구분으로 지정 → 해당 주소의 트랜잭션에서 수신자 추출
- **Node-2에서 인덱서/DB/API 완전 제거**: 3-node 마이그레이션으로 모든 인덱서 인프라가 node-3으로 이전됨

### 주의사항

- **Node-1 port 9000 안 열려있음**: Node-1의 validator에는 JSON-RPC가 없음 (config: `json-rpc-address: "127.0.0.1:38143"` + `rpc: {}`). 실제 RPC는 node-3의 fullnode에서 제공.
- **Node-3 인덱서 data-ingestion GC**: Fullnode이 checkpoint 파일을 생성하고 indexer가 GC하는 구조. 인덱서가 뒤처지면 checkpoint 파일이 없어져 영구 stuck됨 → DB 리셋 + start-checkpoint 재설정 필요
- **인덱서 systemd에 start-checkpoint 하드코딩**: `/etc/systemd/system/sui-indexer.service`에 `--start-checkpoint 6584888` 추가됨. 다음 devnet 리셋 시 이 값 업데이트 필요.
- **Node-3 explorer-api .env**: `~/explorer-api/.env` — `GENESIS_ADDRESSES` 포함. 새 주요 주소 추가 시 여기 업데이트.

### 파일 위치

**Pado 수정 (커밋 e4474b5a):**
- `apps/pado/frontend/src/features/trading/hooks/useBalanceManagerBalance.ts` — `balanceManagerId` optional param 추가
- `apps/pado/frontend/src/features/trading/containers/TradingPanel.tsx` — validated ID 전달
- `apps/pado/frontend/src/features/trading/components/BottomTabPanel.tsx` — validated ID 전달
- `apps/pado/frontend/src/features/trading/hooks/useAutoDeposit.ts` — validated ID 전달

**Explorer API 수정 (커밋 21fb633e, cebf871c):**
- `apps/network-explorer/api-server/src/rpc.ts` — 공유 RPC 헬퍼 + 주소 발견 (NEW)
- `apps/network-explorer/api-server/src/routes/stats.ts` — 하이브리드 top-accounts
- `apps/network-explorer/api-server/src/routes/health.ts` — 공유 rpc.ts 사용으로 리팩터

## 최근 커밋

```
cebf871c fix(network-explorer): merge RPC address discovery into top-accounts
e4474b5a fix(pado,wallet-ui): pass balanceManagerId explicitly + use selectors
21fb633e refactor(network-explorer): extract RPC helper + harden top-accounts
```

## 즉시 다음 단계

1. security-reviewer + code-reviewer 에이전트 실행 (push 전 보안 검사)
2. `git push origin main` 실행 (사용자 확인 후)
3. (선택) explorer-api 시작 시 RPC 주소 캐시를 백그라운드로 프리워밍하여 첫 요청 레이턴시 개선
