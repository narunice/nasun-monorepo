# Handoff: Genesis Pass Drop 최종 준비 상태

**생성**: 2026-04-07 01:30
**브랜치**: main
**이전 핸드오프**: [2026-04-06-genesis-pass-drop-readiness.md](2026-04-06-genesis-pass-drop-readiness.md)

## 현재 상태 요약

Genesis Pass NFT 드롭 (4/7 15:00 UTC Free Mint 시작)을 위한 고트래픽 대비 종합 점검을 수행했다. 3라운드 독립 리뷰 (실현가능성/아키텍처/대안, 총 9명 리뷰어)를 거쳐 플랜을 v1->v4로 진화시켰고, 공지 내용과 구현의 모순 3건을 발견하여 수정했다. 핵심 민팅 플로우 구현은 이전 세션(`53b35704`)에서 이미 완료되어 있었으며, 이번 세션에서는 공지 정합성 수정(stage 설명, 가격 폴링)만 코드 변경하고, 미커밋 콘트랙트/프론트엔드 파일과 함께 커밋+배포가 필요한 상태이다.

## 완료된 작업

### 이전 세션 (commit `53b35704`)
- [x] `genesisPassApi.ts`에 `requestMintSignature()` 추가 (15s timeout, 429 jitter retry)
- [x] `useNftDrop.ts` mint 함수: stage 1-3 서명 발급 후 contract 호출, stage 4 직접 호출 분기
- [x] 지갑 주소 불일치 가드 (`.toLowerCase()` 비교)
- [x] 401 세션 만료 / 403 미자격 에러 처리
- [x] `NftDropMintSection.tsx` 인증 통합 (needsLogin 메시지, "Preparing mint..." 상태)
- [x] 동적 Etherscan URL (`getEtherscanUrl` 함수)
- [x] API Gateway throttle 200 req/s, burst 500 (CDK 코드 변경 완료, 배포 미완)
- [x] 콘트랙트 per-stage pricing (`mintPricePerStage` mapping + `setStagePrice()`)
- [x] 콘트랙트 transfer lock (`transfersUnlocked` + `_update` override)
- [x] `currentMintPrice()` view 함수 (stage별 동적 가격 반환)
- [x] `setStage` 가격 미설정 시 revert (`StageNotPriced`) 안전장치
- [x] `cognitoToken` zustand 연동 (`userData?.cognitoToken`)

### 이번 세션
- [x] 3라운드 독립 리뷰 (v1->v2->v3, 총 9명 리뷰어) + 공지 대조 검증
- [x] 공지와의 모순 3건 식별 및 분석
- [x] Stage 설명 업데이트 (nft-drop.ts: "guaranteed access" -> "discounted price" 개념 반영)
- [x] `currentMintPrice` 폴링 추가 (`refetchInterval: 15_000`, stage 전환 시 가격 변동 반영)
- [x] `currentStage` 폴링 최적화 (10s->15s, `refetchOnWindowFocus: true` 추가)
- [x] TypeScript 타입 체크 통과

## 미완료 작업

### 배포/인프라
- [ ] `cdk deploy NasunGenesisPassStack` (prod 계정, API Gateway throttle 반영)
- [ ] 메인넷 콘트랙트 배포 + Etherscan source 검증
- [ ] `GENESIS_PASS_ADDRESSES`에 메인넷 주소 추가 -> `pnpm copy-abi`
- [ ] `VITE_ETHEREUM_CHAIN_ID=1` 설정 + 프론트엔드 빌드 + 배포

### 온체인 설정 (배포 후)
- [ ] `setStagePrice(GTD, ~$8 in ETH wei)`, `setStagePrice(FCFS, ~$10)`, `setStagePrice(PUBLIC, ~$15)`
- [ ] `setWalletLimit` 각 stage별 (기본값 0 = 모든 mint revert, **가장 위험한 실수**)
- [ ] `setMintDeadline(1776171600)` (2026-04-14T15:00Z)
- [ ] `setMaxSupply(tokenId, VERY_LARGE)` (공지: "no fixed supply cap")
- [ ] `setSigner(mainnetSignerAddress)` + Secrets Manager에 메인넷 signer key 저장

### SSM / 테스트
- [ ] SSM `/nasun/genesis-pass/current-stage = "0"` 확인
- [ ] CDK 스택 `chainId`, `contractAddress`, `signerSecretName` 메인넷 값 업데이트
- [ ] Sepolia E2E 테스트: Stage 1 -> allowlist 등록 -> mint-signature -> 민팅

### 커밋
- [ ] 미커밋 파일 검토 후 커밋 (콘트랙트 변경 + 프론트엔드 수정 포함)

## 중요 컨텍스트

### 공지 기반 핵심 원칙
- **Supply is limited by time, not by number**. 고정 supply cap 없음. `maxSupply`를 매우 큰 값으로 설정해야 함.
- **GTD/FCFS는 가격 할인**이지 접근 제한이 아님. 가격: Free->$8->$10->$15.
- **가격이 stage별로 다름**: 콘트랙트 `mintPricePerStage` mapping으로 이미 구현됨. `setStage` 전에 `setStagePrice` 필수.

### 콘트랙트 주요 변경 (이전 세션, 미커밋)
- `mintPrice` 단일 변수 -> `mintPricePerStage` mapping으로 교체
- `setStagePrice(stage, price)` 함수 추가
- `setStage()` 시 paid stage 가격 미설정이면 `StageNotPriced` revert (안전장치)
- `currentMintPrice()` view 함수: 현재 stage의 가격 반환
- Transfer lock: `transfersUnlocked` bool + `_update` override

### 하지 않기로 한 것 (리뷰 반영)
- Lambda provisioned concurrency (API Gateway throttle이 concurrency cap 역할)
- AWS WAF (JWT + throttle + 온체인 서명 = 다층 방어 충분)
- Multi-tab 중복 방지 (온체인 walletLimitPerStage가 가드)
- 429 자동 retry 제거 (부하 증폭 위험, 단일 jitter retry만 유지)
- Sold Out 사전 표시 UI (공지: "no fixed supply cap"이므로 불필요)
- k6 부하 테스트 (hey로 대체 가능, 2일 남은 시점에서 과도)

### 빌드 환경 이슈
- Node.js 18에서 Vite 7 빌드 실패 (`crypto.hash` API 미지원). **Node 20+ 필요**.

## 핵심 파일

| 파일 | 역할 | 상태 |
|------|------|------|
| `contracts/genesis-pass/contracts/NasunGenesisPass.sol` | 스마트 컨트랙트 (per-stage pricing, transfer lock) | 미커밋 |
| `contracts/genesis-pass/test/*.test.cjs` (4 files) | 콘트랙트 테스트 | 미커밋 |
| `frontend/src/hooks/useNftDrop.ts` | 민팅 hook (서명 연동 + 가격 폴링) | 미커밋 |
| `frontend/src/services/genesisPassApi.ts` | API 클라이언트 (requestMintSignature) | 커밋됨 |
| `frontend/src/sections/wave1/nft-drop/NftDropMintSection.tsx` | 민팅 UI (인증, 에러, Etherscan) | 커밋됨 |
| `frontend/src/constants/nft-drop.ts` | Stage 설명 (공지 반영 수정) | 미커밋 |
| `frontend/src/constants/genesis-pass-contract.ts` | ABI (per-stage pricing 반영) | 미커밋 |
| `frontend/src/pages/wave1/GenesisPassDropPage.tsx` | 드롭 카운트다운 페이지 | 미커밋 |
| `cdk/lib/genesis-pass-stack.ts` | CDK 스택 (throttle 200/500) | 커밋됨 |

## 최근 변경 파일 (미커밋)

```
 M apps/nasun-website/contracts/genesis-pass/contracts/NasunGenesisPass.sol
 M apps/nasun-website/contracts/genesis-pass/deployments/11155111.json
 M apps/nasun-website/contracts/genesis-pass/scripts/deploy.cjs
 M apps/nasun-website/contracts/genesis-pass/test/EdgeCases.test.cjs
 M apps/nasun-website/contracts/genesis-pass/test/NasunGenesisPass.test.cjs
 M apps/nasun-website/contracts/genesis-pass/test/Security.test.cjs
 M apps/nasun-website/contracts/genesis-pass/test/TodayEdgeCases.test.cjs
 M apps/nasun-website/frontend/src/constants/genesis-pass-contract.ts
 M apps/nasun-website/frontend/src/constants/nft-drop.ts
 M apps/nasun-website/frontend/src/hooks/useNftDrop.ts
 M apps/nasun-website/frontend/src/pages/wave1/GenesisPassDropPage.tsx
```

## 드롭 당일 운영 체크리스트

### Stage 전환 절차
```bash
# 1. 온체인 setStage(N) 트랜잭션 전송 + 블록 확인
# 2. SSM 업데이트
aws ssm put-parameter --name "/nasun/genesis-pass/current-stage" --value "N" --overwrite --profile nasun-prod
# 3. 60초 대기 (Lambda SSM 캐시 만료)
# 4. 테스트 지갑으로 mint-signature API 호출하여 서명 반환 확인
```

주의: `setStagePrice`는 stage 전환 전에 미리 설정. `setStage`가 가격 0인 paid stage를 활성화하면 `StageNotPriced` revert.

### 킬스위치
- 콘트랙트: `setStage(Stage.PAUSED)`
- SSM: stage를 "0"으로

### 모니터링
- CloudWatch: API Gateway 4xx/5xx, Lambda errors/duration p99
- Etherscan: 콘트랙트 트랜잭션

## 즉시 다음 단계

1. 미커밋 파일 검토 후 커밋 (콘트랙트 per-stage pricing + 프론트엔드 수정)
2. `cdk deploy NasunGenesisPassStack` (prod, API Gateway throttle 반영)
3. 메인넷 콘트랙트 배포 + 온체인 설정 (`setStagePrice`, `setWalletLimit`, `setMintDeadline`, `setMaxSupply`)
4. Sepolia E2E 테스트 (Stage 1 설정 -> 서명 -> 민팅 성공 확인)
5. 프론트엔드 프로덕션 빌드 + 배포 (Node 20+, `VITE_ETHEREUM_CHAIN_ID=1`)
