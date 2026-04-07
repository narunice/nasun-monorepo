# Handoff: Genesis Pass Drop - 라이브 운영 및 잔여 작업

**생성**: 2026-04-07 18:30 KST
**브랜치**: main
**이전 핸드오프**: [2026-04-07-genesis-pass-final-prep.md](2026-04-07-genesis-pass-final-prep.md)

## 현재 상태 요약

Genesis Pass NFT Drop 인프라 강화, 프론트엔드 UX 개선, 스마트 컨트랙트 설정을 완료하고 dev/prod 환경 모두 배포했다. Free Mint 스테이지에서 스테이징 테스트를 성공적으로 마쳤다. 드롭은 오늘밤 15:00 UTC(4/8 00:00 KST)에 시작된다.

## 완료된 작업

- [x] CDK 인프라 강화: API Gateway -> Lambda alias 연결 수정 (provisioned concurrency 활성화)
- [x] CDK: grantReadWriteData (rate limiting UpdateCommand 권한 수정)
- [x] CDK: provisioned concurrency 5 -> 15, SSM cache TTL 60s -> 15s
- [x] CDK: Lambda identity resolution 병렬 쿼리, 중복 호출 제거
- [x] CDK: genesis-pass-allowlist DynamoDB 스로틀 알람 추가
- [x] Lambda/CDK: CONTRACT_ADDRESS, CHAIN_ID 환경변수 설정 (dev=Sepolia, prod=Mainnet)
- [x] Sepolia 컨트랙트 walletLimitPerStage 1-4 모두 1로 설정
- [x] 프론트엔드: fetchWithTimeout 4개 API 함수 적용, ErrorBoundary, 에러 메시지 개선
- [x] 프론트엔드: eligibility 기반 statusMessage (스테이지별 정확한 자격 표시)
- [x] 프론트엔드: 민팅 진행 오버레이 (Spinner + 단계별 메시지)
- [x] 프론트엔드: 민팅 성공 모달 (Dialog + NFT 비디오 + CTA)
- [x] 프론트엔드: admin Metadata URI 컨트롤, owner 검증, 네트워크 배너
- [x] 프론트엔드: RPC refetchInterval 30s, staleTime 적용, drpc/mevblocker fallback
- [x] 프론트엔드: RATE_LIMITED 60초 쿨다운 안내 메시지
- [x] 메타데이터: 8개 토큰 JSON + 8개 썸네일 PNG + Arweave manifest
- [x] dev + prod CDK 배포 완료 (GenesisPassStack + MonitoringStack)
- [x] 스테이징 프론트엔드 배포 + Free Mint 테스트 성공

## 미완료 작업

- [ ] 프로덕션 프론트엔드 배포 (라우트 전환 포함: NftDropPage를 /wave1/genesis-pass-drop로 교체)
- [ ] 프로덕션 SSM stage 파라미터 설정 (현재 상태 확인 필요)
- [ ] 프로덕션 admin NFT Collections에 Genesis Pass 메인넷 주소 등록: `0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1`
- [ ] 스테이징 admin NFT Collections에 Genesis Pass Sepolia 주소 등록: `0xdE0769F2d43e9f85E688F0641Ec4bF699b6DdBc8`
- [ ] Lambda 사전 워밍 (드롭 15분 전)
- [ ] 메인넷 컨트랙트 최종 확인: stage, price, walletLimit, signer, owner
- [ ] 드롭 후: IAM grantReadWriteData를 scoped policy로 축소
- [ ] 드롭 후: requestMintSignature fetchWithTimeout 통일 (에러 타입 정리)
- [ ] 드롭 후: monitoring-stack 429 알람 metricClientError -> 429 전용 메트릭 필터
- [ ] 드롭 후: cdk-out-dev/, cdk-out-prod/ .gitignore 추가

## 중요 컨텍스트

### 결정사항
- **429 재시도**: 이전 세션에서 "부하 증폭 위험, 단일 jitter retry만 유지" 결정. 3회 exponential backoff 제안을 철회함
- **requestMintSignature fetchWithTimeout 미적용**: 기존 인라인 AbortController가 DOMException을 throw하고 useNftDrop.ts:173에서 캐치. fetchWithTimeout은 Error로 re-throw하므로 에러 타입 불일치. 드롭 후 통일 리팩토링
- **provisioned concurrency 15**: Console에서 25-40으로 추가 조정 가능
- **SSM stage와 온체인 stage 동시 변경 필수**: 어긋나면 서명은 발급되지만 컨트랙트에서 거부됨

### 주의사항
- **프로덕션 SSM stage**: 현재 값 미확인. 드롭 전 반드시 확인하고 적절히 설정
- **monitoring-stack 429 알람**: metricClientError가 모든 4XX를 감지하여 드롭 중 노이즈 발생 가능. 5xx 알람 위주로 모니터링
- **CDK 배포 시 cdk.out 락**: 동시 실행 시 "Other CLIs are currently reading" 에러. `--output cdk-out-xxx` 사용

### 파일 위치
- CDK 스택: `apps/nasun-website/cdk/lib/genesis-pass-stack.ts`
- Lambda 서명 발급: `apps/nasun-website/cdk/lambda-src/genesis-pass/mint-signature/src/index.ts`
- 민팅 UI: `apps/nasun-website/frontend/src/sections/wave1/nft-drop/NftDropMintSection.tsx`
- 민팅 훅: `apps/nasun-website/frontend/src/hooks/useNftDrop.ts`
- API 클라이언트: `apps/nasun-website/frontend/src/services/genesisPassApi.ts`
- Admin 페이지: `apps/nasun-website/frontend/src/features/admin/pages/GenesisPassDropAdmin.tsx`
- 라우트 설정: `apps/nasun-website/frontend/src/config/routesConfig.ts`
- 운영 플랜: `.claude/plans/snappy-foraging-hollerith.md`

### 컨트랙트 정보
- Sepolia: `0xdE0769F2d43e9f85E688F0641Ec4bF699b6DdBc8` (stage 1/Free Mint, walletLimit 모두 1)
- Mainnet: `0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1` (walletLimit 모두 1)
- Owner/Signer: Secrets Manager `nasun/genesis-pass/signer`에서 관리
- Signer 주소: `0xE6828A10190b0360d75A1731C495FdEF604D4c5E`

### 스테이지 전환 절차
1. T-5분: 커뮤니티 공지
2. T-2분: 유료 스테이지면 setStagePrice 호출
3. T-0: SSM 파라미터 + 온체인 setStage 동시 변경
4. T+15s: CloudWatch 로그에서 새 스테이지 반영 확인
5. Stage 4 (Public): Lambda 서명 불필요, 프론트엔드가 직접 컨트랙트 호출

## 최근 변경 파일

- `apps/nasun-website/cdk/lib/genesis-pass-stack.ts` (alias, IAM, concurrency)
- `apps/nasun-website/cdk/lib/monitoring-stack.ts` (DynamoDB 알람)
- `apps/nasun-website/cdk/lambda-src/genesis-pass/mint-signature/src/index.ts` (SSM TTL, 병렬 쿼리)
- `apps/nasun-website/cdk/.env.development` (CONTRACT_ADDRESS, CHAIN_ID 추가)
- `apps/nasun-website/cdk/.env.production` (CONTRACT_ADDRESS, CHAIN_ID 추가)
- `apps/nasun-website/frontend/src/sections/wave1/nft-drop/NftDropMintSection.tsx` (오버레이, 성공 모달, eligibility)
- `apps/nasun-website/frontend/src/hooks/useNftDrop.ts` (에러 메시지, refetchInterval)
- `apps/nasun-website/frontend/src/services/genesisPassApi.ts` (fetchWithTimeout)
- `apps/nasun-website/frontend/src/pages/wave1/NftDropPage.tsx` (ErrorBoundary)
- `apps/nasun-website/frontend/src/config/wagmiConfig.ts` (RPC fallback)

## 즉시 다음 단계

1. 프로덕션 라우트 전환: `routesConfig.ts`에서 `/wave1/genesis-pass-drop`를 NftDropPage로 교체
2. 프로덕션 프론트엔드 빌드 + 배포 (Node 22 필수: `source ~/.nvm/nvm.sh && nvm use 22`)
3. 프로덕션 SSM stage 확인 및 설정: `aws ssm get-parameter --name /nasun/genesis-pass/current-stage --profile nasun-prod`
4. Admin NFT Collections에 Genesis Pass 주소 등록 (staging + prod)
5. 드롭 15분 전: Lambda 워밍 (`aws lambda invoke --function-name nasun-genesis-pass-mint-signature --qualifier live`)
6. 메인넷 컨트랙트 최종 점검: stage, price, walletLimit, deadline
