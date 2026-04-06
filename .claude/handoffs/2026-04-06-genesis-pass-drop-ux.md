# Handoff: Genesis Pass Drop 페이지 UX 개선

**생성**: 2026-04-06 13:00
**브랜치**: main
**이전 핸드오프**: [2026-04-07-genesis-pass-final-prep.md](2026-04-07-genesis-pass-final-prep.md)

## 현재 상태 요약

Genesis Pass 드롭 페이지(`/dev/genesis-pass-drop`)의 프론트엔드 UX를 개선하고, Sepolia 테스트넷에서 민팅 E2E 테스트를 성공적으로 완료했다. 스테이징 배포 완료 상태이며, My Account 페이지의 Genesis Pass 섹션 후속 작업이 남아있다.

## 완료된 작업

### 보안 리뷰
- [x] 외부 감사자 보안 리뷰 결과 수령 및 독립 평가 완료
- [x] 감사자 권장 `<=` -> `<` 변경에 동의하지 않음 (현재 코드가 올바른 forward-only 안전장치)
- [x] 소각(burn) 차단은 의도된 설계로 확인 (Genesis Pass에 소각 use case 없음)
- [x] 보안 리뷰 요청서 작성 (`docs/genesis-pass-security-review-request.md`)
- [x] 로열티 0%로 변경 (`deploy.cjs`)

### 스테이징 테스트 환경 구축
- [x] `.env.development`의 `VITE_ETHEREUM_CHAIN_ID`를 11155111(Sepolia)로 변경
- [x] wagmi config에 Sepolia 퍼블릭 RPC fallback 3개 추가
- [x] AWS Secrets Manager에 signer 키 생성 (`nasun/genesis-pass/signer`)
- [x] Lambda `CONTRACT_ADDRESS`를 Sepolia 주소로 업데이트
- [x] SSM `/nasun/genesis-pass/current-stage`를 "4" (PUBLIC)로 변경
- [x] 스테이징 빌드(`--mode development`) + 배포 완료

### 드롭 페이지 UX 개선
- [x] 모바일 일반 브라우저: "Connect Wallet" 대신 "Open in MetaMask" 딥링크 표시
- [x] MetaMask 인앱 브라우저: 하단 중복 배너 제거
- [x] 온체인 `mintedPerStage`/`walletLimitPerStage` 조회로 이미 민팅한 사용자 감지
- [x] 이미 민팅한 사용자에게 "You already own a Genesis Pass" 메시지 표시
- [x] 민팅 성공 후 NFT 프리뷰 + Etherscan 링크 표시 (`MintSuccessView` 컴포넌트)
- [x] 데스크탑: "Check your Genesis Pass" -> `/my-account?justMinted=genesis-pass` 이동
- [x] MetaMask 인앱: "Leave this MetaMask browser..." 안내 텍스트

### Sepolia E2E 테스트
- [x] 갤럭시 크롬 -> MetaMask 인앱 브라우저 이동 -> PUBLIC 단계 민팅 성공
- [x] 민팅 후 "You already own" 메시지 정상 표시 확인

## 미완료 작업

### My Account 페이지 Genesis Pass 섹션 (다음 세션)
- [ ] `hasGenesisPassNft` 감지 실패 원인 조사 (Alchemy API 키 만료 또는 NFT collections 설정 누락)
- [ ] Genesis Pass 민팅 완료 사용자에게 적절한 UI 표시 (현재 "Join Allowlist FCFS" 버튼이 그대로 보임)
- [ ] `justMinted=genesis-pass` 쿼리 파라미터 처리 (FeaturedNftSection에 이미 폴링 패턴 존재)
- [ ] 플랜 리뷰 결과 반영: 폴링 중복 방지, useSearchParams race condition 해결

### React Error #310 (다른 세션에서 처리 중)
- [ ] `DevMyAccountPage` 컴포넌트에서 무한 re-render 루프 발생
- [ ] 스택 트레이스: `DevMyAccountPage-Don7cMOI.js:542:343` at `U1`
- [ ] 최근 커밋(`40a0a280` 또는 이전)에서 도입된 버그 가능성

### 프로덕션 배포 준비 (별도 세션)
- [ ] CDK deploy (prod 계정, API Gateway throttle)
- [ ] 메인넷 콘트랙트 배포 + Etherscan 검증
- [ ] 온체인 설정 (setStagePrice, setWalletLimit, setMintDeadline, setMaxSupply, setSigner)
- [ ] `.env.development`의 `VITE_ETHEREUM_CHAIN_ID`를 1(Mainnet)로 복원
- [ ] 프론트엔드 프로덕션 빌드 + 배포

## 중요 컨텍스트

### 스테이징 빌드 주의사항
- 스테이징 배포 시 반드시 `--mode development` 플래그 필요
- `pnpm --filter @nasun/nasun-website exec -- vite build --mode development`
- 플래그 없이 빌드하면 `.env.production` (Mainnet, chainId=1)을 사용하여 "contract not deployed" 에러 발생

### Sepolia 콘트랙트 현재 상태
- 주소: `0x3b89DA1241Ea70D5c2c105601bF77A93bD7e7Aae`
- Stage: PUBLIC (4)
- Signer: `0xE6828A10190b0360d75A1731C495FdEF604D4c5E`
- Wallet limit: 1 per stage
- Mint deadline: 1775486007

### AWS 설정 (dev 계정, default 프로필)
- GenesisPassStack: 배포 완료 (스택명 `GenesisPassStack`, NOT `NasunGenesisPassStack`)
- SSM `/nasun/genesis-pass/current-stage`: "4"
- Secrets Manager `nasun/genesis-pass/signer`: 생성 완료
- Lambda CONTRACT_ADDRESS: `0x3b89DA1241Ea70D5c2c105601bF77A93bD7e7Aae`

### 플랜 리뷰 결과 요약 (My Account 페이지)
리뷰 결과 BLOCK 판정. 핵심 이슈:
1. `hasGenesisPassNft` 감지 실패의 근본 원인 진단 필요 (Alchemy API 키? NFT collections 설정?)
2. `FeaturedNftSection`과 `CompactNftStatus`의 `justMinted` 폴링 중복 방지
3. 대안 리뷰어: 4-state 모델은 over-engineering일 수 있음. 근본 원인 해결 후 최소 변경으로 충분할 가능성

### MetaMask 인앱 브라우저 제약
- `window.close()`: 동작하지 않음
- `intent://` URI: "자동 외부 앱 열기 차단" 경고 발생, 동작하지 않음
- `target="_blank"`: 인앱 브라우저 내에서 열림 (외부 브라우저로 열리지 않음)
- 현재 해결책: 안내 텍스트로 대체 ("Leave this MetaMask browser...")

## 핵심 파일

| 파일 | 역할 | 변경 상태 |
|------|------|----------|
| `frontend/src/hooks/useNftDrop.ts` | 민팅 hook (hasReachedLimit 추가) | 커밋됨 |
| `frontend/src/sections/wave1/nft-drop/NftDropMintSection.tsx` | 민팅 UI (MintSuccessView, 환경별 분기) | 커밋됨 |
| `frontend/src/config/wagmiConfig.ts` | Sepolia RPC fallback 추가 | 커밋됨 |
| `frontend/src/pages/wave1/NftDropPage.tsx` | MetaMask 배너 제거 | 커밋됨 |
| `frontend/.env.development` | CHAIN_ID=11155111 (Sepolia) | 커밋됨 |
| `frontend/src/sections/myAccount/CompactNftStatus.tsx` | Genesis Pass 섹션 (미완료) | 다른 세션에서 수정 중 |
| `contracts/genesis-pass/scripts/deploy.cjs` | 로열티 0% | 커밋됨 |

## 즉시 다음 단계

1. React Error #310 해결 (다른 세션에서 진행 중)
2. My Account 페이지 `hasGenesisPassNft` 감지 실패 원인 조사
3. Genesis Pass 섹션 UI 분기 구현 (최소 변경 접근)
4. 프로덕션 배포 준비 (메인넷 콘트랙트 + CDK + 프론트엔드)
