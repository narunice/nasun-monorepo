# Handoff: Battalion NFT 지갑/계정 연결 엣지케이스 수정

**생성**: 2026-02-28 16:30
**브랜치**: main
**이전 핸드오프**: [2026-02-28-metamask-desktop-fix.md](2026-02-28-metamask-desktop-fix.md)

## 현재 상태 요약

Battalion NFT 이벤트에서 이미 등록된 X 계정(@Fall2026)을 다른 MetaMask 지갑으로 재등록 시 발생하는 불일치 문제를 수정 중. 백엔드 409 duplicate 처리는 배포 완료. 프론트엔드 수정(identity 우선순위, wallet mismatch 재링크, stale 스토어 데이터 정리)은 코드 완료 + 빌드 성공했으나 **스테이징 미배포 상태**.

## 재현 시나리오 (엣지케이스)

1. MetaMask 지갑 A(fd3E)로 로그인 → Battalion NFT에서 X @Fall2026으로 등록 완료
2. 로그아웃 → MetaMask 지갑 B(cb90)로 로그인
3. Battalion NFT → 같은 X @Fall2026으로 task verification 통과
4. Step 4: 화면에 fd3E(이전 지갑) 표시, MetaMask는 cb90으로 서명 요청
5. Step 5: Register → 성공 (기대: 409 에러)
6. Step 6: "Registration Complete!" (cb90 표시)
7. My Account: X "Not linked", Battalion NFT "Not Registered"

## 완료된 작업

### 백엔드 (NftEventStack — dev + prod 배포 완료)

- [x] `register-user/src/index.ts`: duplicate 처리 분리
  - 같은 wallet 재등록 → 200 (idempotent)
  - 다른 wallet + 같은 X → 409 `X_ACCOUNT_ALREADY_REGISTERED`
- [x] `register-user/src/types/index.ts`: `X_ACCOUNT_ALREADY_REGISTERED` ErrorCode 추가
- [x] NftEventError 응답에 `code` 필드 추가 (이전에 누락)
- [x] i18n 번역 추가 (en/ko `battalion-nft.json`)

### 프론트엔드 (코드 완료, 스테이징 미배포)

- [x] **Step4WalletConnectCard.tsx**: identity 우선순위 수정
  - `cognitoIdentityId || user?.identityId` → `user?.identityId || cognitoIdentityId`
  - Google 로그인 시 MetaMask가 Google identity에 링크됨 (기존: X identity에 링크 → 세션 교체)
  - `cognitoToken` 우선순위도 동일하게 변경
- [x] **Step4WalletConnectCard.tsx**: wallet mismatch 재링크
  - `!linkedWallet` → `!linkedWallet || linkedWallet !== walletAddress` (mismatch detection)
  - Self-link 방지: `primaryIdentityId !== authResult.identityId` 체크
  - Profile refresh로 stale wallet 주소 동기화
- [x] **useBattalionNftStore.ts**: `setXAuth`에서 stale 데이터 클리어
  - 새 flow 시작 시 `registered`, `whitelist`, `walletAddress`, `walletProof`, `proofIssuedAt` 초기화
- [x] **BattalionNftPage.tsx**: wallet 비교 가드 추가
  - 초기 마운트 status check: 응답 wallet ≠ 현재 wallet이면 `setRegistered()` 스킵
  - `handleRegister`: 응답 wallet ≠ 현재 wallet이면 에러 throw
- [x] **useBattalionNftStatus.ts**: hook에서 wallet 비교
  - status API가 twitterId로 다른 지갑 등록을 찾으면 `isRegistered = false` 처리

### 빌드 에러 수정

- [x] **Tailwind CSS 4.2.1 → 3.4.19**: `package.json`에서 `~3.4.17`로 핀 (lockfile 오염으로 v4 설치됨)
- [x] **@mysten/ledgerjs-hw-app-sui 0.7.1 → 0.7.0**: `pnpm.overrides`로 고정 (0.7.1이 `node:module` import 추가 → 브라우저 빌드 실패)

## 미완료 작업

- [ ] **스테이징 프론트엔드 배포**: `./scripts/deploy-nasun-website-staging.sh` 실행 필요
- [ ] **배포 후 검증**: 아래 시나리오 모두 확인
  - 같은 X + 다른 wallet → 409 에러 메시지 표시 확인
  - Google 로그인 → Battalion NFT → 로그인 방법 유지 확인
  - MetaMask 로그인 → Battalion NFT → wallet 주소 일관성 확인
  - My Account 페이지에서 등록 상태 정확성 확인
- [ ] **프로덕션 프론트엔드 배포**: 검증 완료 후 `./scripts/deploy-nasun-website-production.sh`

## 중요 컨텍스트

### 핵심 버그 원인

**Identity 우선순위 역전** (Step4WalletConnectCard.tsx:114):
```typescript
// 기존 (버그): X identity가 우선 → Google 세션이 X로 교체
const primaryIdentityId = cognitoIdentityId || user?.identityId;

// 수정: 현재 로그인 identity 우선, X는 fallback
const primaryIdentityId = user?.identityId || cognitoIdentityId;
```
Google로 로그인한 사용자가 Battalion NFT에서 X를 연결하면, MetaMask가 X identity에 링크되고 `refreshAndSaveUserProfile(X_identity)` 호출로 세션이 Google에서 X로 교체됨.

### Stale 프로필 데이터

이전 세션의 버그로 인해 Cognito identity 간 잘못된 링크가 생성됨:
- MetaMask cb90 identity가 X @Fall2026 identity에 링크됨
- cb90으로 로그인해도 프로필에 fd3E가 linked wallet로 표시
- **수정**: wallet mismatch 감지 시 re-link + profile refresh

### Backend Register API (이미 배포됨)

```
POST /event/register
- 같은 wallet 재등록: 200 (idempotent) → 기존 whitelist 반환
- 다른 wallet + 같은 X: 409 X_ACCOUNT_ALREADY_REGISTERED → 에러
```

### 주의사항

- **lockfile 오염**: `pnpm add` 실행 시 transitive dependency 버전이 올라갈 수 있음. `tailwindcss`와 `@mysten/ledgerjs-hw-app-sui`는 overrides로 고정.
- **Cognito identity 링크 정리**: 이전 버그로 생성된 잘못된 identity 링크는 수동 정리 필요할 수 있음 (Cognito console). 프론트엔드 수정으로 향후 발생은 방지됨.
- **프론트엔드 배포는 수동**: `/deploy` 스킬은 CDK(백엔드)만 해당. 프론트엔드는 `scripts/deploy-nasun-website-*.sh` 직접 실행.

## 핵심 파일 위치

| 파일 | 변경 내용 |
|------|-----------|
| `apps/nasun-website/cdk/lambda-src/nft-event/register-user/src/index.ts` | 409 duplicate 처리 |
| `apps/nasun-website/cdk/lambda-src/nft-event/register-user/src/types/index.ts` | ErrorCode 추가 |
| `apps/nasun-website/frontend/src/sections/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx` | Identity 우선순위 + wallet mismatch 재링크 |
| `apps/nasun-website/frontend/src/stores/useBattalionNftStore.ts` | setXAuth에서 stale 데이터 클리어 |
| `apps/nasun-website/frontend/src/sections/wave1/battalion-nft/BattalionNftPage.tsx` | wallet 비교 가드 |
| `apps/nasun-website/frontend/src/hooks/useBattalionNftStatus.ts` | hook wallet 비교 |
| `apps/nasun-website/frontend/src/assets/locales/en/battalion-nft.json` | i18n 에러 메시지 |
| `apps/nasun-website/frontend/src/assets/locales/ko/battalion-nft.json` | i18n 에러 메시지 |
| `apps/nasun-website/frontend/package.json` | tailwindcss ~3.4.17 핀 |
| `package.json` | pnpm.overrides: ledgerjs 0.7.0 고정 |

## 즉시 다음 단계

1. 스테이징 프론트엔드 배포: `./scripts/deploy-nasun-website-staging.sh`
2. 스테이징에서 엣지케이스 검증 (위 "배포 후 검증" 항목)
3. 검증 통과 시 프로덕션 배포: `./scripts/deploy-nasun-website-production.sh`
4. (선택) Cognito console에서 이전 버그로 생성된 stale identity 링크 정리
