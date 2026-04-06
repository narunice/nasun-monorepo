# Handoff: Genesis Pass Drop 부하 대비 및 민팅 플로우 완성

**생성**: 2026-04-06 23:00
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

Genesis Pass NFT 드롭 (4월 7일 Free Mint 시작, ~5,500명 allowlist)을 위해 allowlist 스테이지(1-3) 민팅 플로우를 프론트엔드에 구현하고, API Gateway throttle을 200/500으로 증가시켰다. 코드는 push 완료 (`53b35704`). CDK 배포와 Sepolia E2E 테스트가 남아있다.

## 완료된 작업

- [x] 인프라 부하 분석: EC2, API Gateway, Lambda, DynamoDB, zkLogin prover 점검
- [x] 3라운드 독립 리뷰 (실현가능성/아키텍처/대안, 각 3명씩)
- [x] API Gateway throttle 50->200 req/s, burst 100->500 (CDK 변경)
- [x] `genesisPassApi.ts`에 `requestMintSignature()` 추가 (15s timeout, 429 jitter retry)
- [x] `useNftDrop.ts` mint 함수: stage 1-3은 서명 발급 후 contract 호출, stage 4는 기존 로직
- [x] 지갑 주소 불일치 가드 (`.toLowerCase()` 비교)
- [x] `NftDropMintSection.tsx` 인증 통합 (미로그인 메시지, "Preparing mint..." 상태)
- [x] 에러 매핑: InvalidSignature, SignatureExpired, TransfersLocked, StageNotPriced
- [x] 코드 리뷰 통과 (security + code quality, critical/high 없음)
- [x] TypeScript 타입 체크 통과
- [x] git push 완료 (`53b35704`)

## 미완료 작업

- [ ] `cdk deploy NasunGenesisPassStack` (prod 계정에서 API Gateway throttle 반영)
- [ ] 컨트랙트 `walletLimitPerStage[stage]` 설정 확인 (미설정 시 0이므로 모든 mint revert)
- [ ] Secrets Manager에 signer key 로드 확인
- [ ] SSM 파라미터 `/nasun/genesis-pass/current-stage` = "0" 확인
- [ ] Sepolia E2E 테스트: Stage 1 설정 -> allowlist 등록 -> mint-signature -> 민팅
- [ ] SSM 스테이지 전환 테스트: "0" -> "1" 변경 후 60초 대기 -> 서명 반환 확인
- [ ] 미커밋 파일 처리: contracts/*, constants, GenesisPassDropPage.tsx (별도 커밋 필요)

## 중요 컨텍스트

다음 세션에서 반드시 알아야 할 정보:

- **민팅 플로우**: MetaMask 연결 -> (Stage 1-3) mint-signature Lambda에서 EIP-712 서명 발급 -> contract.mint() 호출. Stage 4(PUBLIC)는 빈 서명으로 직접 호출.
- **서명 TTL**: 300초 (5분). just-in-time 발급, 캐싱 안 함.
- **Lambda SSM 캐시**: 스테이지 값 60초 캐시. 스테이지 전환 시 최대 60초 지연.
- **signer key 캐시**: Lambda 메모리에 무기한 캐시. key 교체 시 Lambda 재배포 필요.
- **빌드 환경 이슈**: Node.js 18에서 Vite 7 빌드 실패 (`crypto.hash` API 미지원). Node 20+ 필요. tsc는 통과.
- **zkLogin prover**: 단일 인스턴스, 민팅 크리티컬 패스 아님. 드롭 후 보강.
- **하지 않기로 한 것**: Lambda provisioned concurrency, k6 부하 테스트, zkLogin 변경, EC2 스펙업/CloudFront, elaborate retry 라이브러리

## 핵심 파일

- `apps/nasun-website/cdk/lib/genesis-pass-stack.ts` - CDK 스택 (throttle, Lambda, DynamoDB)
- `apps/nasun-website/cdk/lambda-src/genesis-pass/mint-signature/src/index.ts` - EIP-712 서명 Lambda
- `apps/nasun-website/frontend/src/hooks/useNftDrop.ts` - 민팅 hook
- `apps/nasun-website/frontend/src/services/genesisPassApi.ts` - API 클라이언트
- `apps/nasun-website/frontend/src/sections/wave1/nft-drop/NftDropMintSection.tsx` - 민팅 UI
- `apps/nasun-website/contracts/genesis-pass/contracts/NasunGenesisPass.sol` - 스마트 컨트랙트

## 최근 변경 파일 (미커밋)

```
M  apps/nasun-website/contracts/genesis-pass/contracts/NasunGenesisPass.sol
M  apps/nasun-website/contracts/genesis-pass/deployments/11155111.json
M  apps/nasun-website/contracts/genesis-pass/scripts/deploy.cjs
M  apps/nasun-website/contracts/genesis-pass/test/*.test.cjs (4 files)
M  apps/nasun-website/frontend/src/constants/genesis-pass-contract.ts
M  apps/nasun-website/frontend/src/pages/wave1/GenesisPassDropPage.tsx
```

## 드롭 당일 운영 체크리스트

### 스테이지 전환
```bash
aws ssm put-parameter --name "/nasun/genesis-pass/current-stage" --value "1" --overwrite --profile nasun-prod
# 60초 대기 후 mint-signature API 호출하여 서명 반환 확인
```

### 킬스위치
- 컨트랙트: `setStage(Stage.PAUSED)` 호출
- SSM: stage를 "0"으로 변경

### 모니터링
- CloudWatch: API Gateway 4xx/5xx, Lambda errors/duration p99
- Etherscan: 컨트랙트 트랜잭션

## 즉시 다음 단계

1. `cdk deploy NasunGenesisPassStack` 실행 (prod 계정)
2. 미커밋 contract/frontend 파일들 검토 후 커밋
3. Sepolia에서 Stage 1 E2E 테스트 수행
4. `walletLimitPerStage` 설정 확인/실행
