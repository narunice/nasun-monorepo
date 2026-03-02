# Handoff: MetaMask 모바일 앱 미설치 감지 + 계정 연결 수정

**생성**: 2026-03-02 02:30
**브랜치**: main
**이전 핸드오프**: [2026-02-28-battalion-nft-wallet-identity-fix.md](2026-02-28-battalion-nft-wallet-identity-fix.md)

## 현재 상태 요약

모바일에서 MetaMask 앱이 미설치된 상태로 MetaMask 버튼 클릭 시 120초간 무한 대기하던 문제를 해결했다. `connectMetaMaskSDK()`에 8초 휴리스틱 타이머를 추가하여, 8초 내 연결이 안 되면 "MetaMask app not detected + Install MetaMask" 인라인 경고를 표시한다. 5개 진입점 모두 적용 완료. 빌드 통과, 배포 대기 중.

추가로 `useAccountLinking.ts`의 `handleLinkMetaMask()`를 데스크탑 전용에서 모바일+데스크탑 지원으로 리팩토링했다 (prepareChallenge + connectVerify 신규 인증 플로우 적용).

## 완료된 작업

- [x] `useAccountLinking.ts` — handleLinkMetaMask 모바일 SDK 지원 + 신규 인증 플로우
- [x] `metamaskSdkProvider.ts` — `onAppNotDetected` 콜백 + 8초 타이머 추가
- [x] `WalletLoginButton.tsx` — mobileInstallHint state + 오렌지색 설치 안내 UI
- [x] `Step4WalletConnectCard.tsx` — mobileInstallHint state + 설치 안내 UI
- [x] `useAccountLinking.ts` — mobileInstallHint state + 콜백 전달
- [x] `AccountLinking.tsx` — mobileInstallHint 렌더링
- [x] `useMetaMaskConnection.ts` — mobileInstallHint state + 콜백 전달
- [x] `useWhitelistRegistration.ts` — 콜백 → 모달 에러 상태 설정
- [x] 색상 변경: yellow → orange (가독성 개선, 유저 피드백 반영)
- [x] `pnpm build:nasun-website` 빌드 통과

## 미완료 작업

- [ ] 프론트엔드 스테이징 배포 (`bash scripts/deploy-nasun-website-staging.sh`)
- [ ] 프론트엔드 프로덕션 배포 (`bash scripts/deploy-nasun-website-production.sh`)
- [ ] 실기기 테스트: Android + iOS에서 MetaMask 설치/미설치 케이스
- [ ] `useMetaMaskConnection.ts` 호출자(ConnectMetaMaskWallet.tsx, ProfileHeroCard.tsx)에서 `mobileInstallHint` UI 렌더링 (hook은 state를 반환하지만 호출자가 아직 렌더링하지 않음)
- [ ] git commit + push

## 중요 컨텍스트

- **결정사항**: Pre-connection dialog 대신 8초 휴리스틱 채택. MetaMask 있는 유저에게 마찰 제로, 없는 유저에게만 8초 후 안내 표시.
- **주의사항**: `ConnectMetaMaskWallet.tsx`와 `ProfileHeroCard.tsx`가 `useMetaMaskConnection` hook의 `mobileInstallHint`를 아직 렌더링하지 않음. 이 두 컴포넌트에서 설치 안내 UI를 추가해야 함.
- **백엔드**: prepareChallenge/connectVerify 엔드포인트는 이미 dev/prod 모두 배포 완료. 프론트엔드만 배포하면 됨.
- **타이머 상수**: `MOBILE_APP_DETECT_TIMEOUT_MS = 8_000` (metamaskSdkProvider.ts)
- **self-linking 방지**: useAccountLinking.ts에서 `user.identityId !== authResult.identityId` 체크 추가

## 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/frontend/src/lib/wallet/metamaskSdkProvider.ts` | 핵심: 8초 타이머 + onAppNotDetected 콜백 |
| `apps/nasun-website/frontend/src/features/auth/components/WalletLoginButton.tsx` | 로그인 버튼 UI |
| `apps/nasun-website/frontend/src/sections/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx` | NFT 이벤트 Step4 UI |
| `apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts` | 계정 연결 hook (리팩토링됨) |
| `apps/nasun-website/frontend/src/components/account/AccountLinking.tsx` | 계정 연결 UI |
| `apps/nasun-website/frontend/src/features/wallet/hooks/useMetaMaskConnection.ts` | 공유 연결 hook |
| `apps/nasun-website/frontend/src/hooks/whitelist/useWhitelistRegistration.ts` | 화이트리스트 hook |

## 최근 변경 파일 (이번 세션)

```
modified:   frontend/src/lib/wallet/metamaskSdkProvider.ts
modified:   frontend/src/features/auth/components/WalletLoginButton.tsx
modified:   frontend/src/sections/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx
modified:   frontend/src/sections/myAccount/hooks/useAccountLinking.ts
modified:   frontend/src/components/account/AccountLinking.tsx
modified:   frontend/src/features/wallet/hooks/useMetaMaskConnection.ts
modified:   frontend/src/hooks/whitelist/useWhitelistRegistration.ts
```

(경로는 `apps/nasun-website/` 기준 상대 경로)

## 즉시 다음 단계

1. `ConnectMetaMaskWallet.tsx`와 `ProfileHeroCard.tsx`에서 `mobileInstallHint` UI 렌더링 추가
2. `bash scripts/deploy-nasun-website-staging.sh`로 스테이징 배포
3. Android/iOS 실기기 테스트 (MetaMask 미설치 → 8초 후 안내 표시 확인)
4. 확인 후 git commit + push + 프로덕션 배포
