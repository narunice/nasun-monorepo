# Handoff: EVM Wallet Link 모바일 지원

**생성**: 2026-03-16 (세션 중)
**브랜치**: main
**이전 핸드오프**: [2026-03-15-nasun-link-and-address-book-sync.md](.claude/handoffs/2026-03-15-nasun-link-and-address-book-sync.md)

## 현재 상태 요약

My Account 페이지의 MetaMask Link 버튼이 모바일에서 완전히 숨겨져 있던 문제를 수정했다. iOS Safari와 MetaMask 인앱 브라우저에서는 Link 버튼을 직접 표시하고, 그 외 모바일(Android, iOS Chrome/Firefox)에서는 MetaMask 딥링크 + Safari 복사 링크 안내를 제공하도록 구현. 빌드 성공, 커밋/푸시는 아직 안 함.

## 완료된 작업

- [x] mobileDetect 유틸 함수 확인 (isAndroidBrowser, isMetaMaskInAppBrowser, isIOSSafari 이미 존재)
- [x] ProfileHeroCard.tsx import 업데이트
- [x] EvmWalletSection 컴포넌트 추출 (플랫폼별 분기)
- [x] EvmMobileGuidance 컴포넌트 구현 (MetaMask 딥링크 + Copy Link for Safari)
- [x] 빌드 검증 통과

## 미완료 작업

- [ ] 커밋 및 푸시 (사용자 지시 대기)
- [ ] 실기기 테스트 (iOS Safari, Android Chrome, iOS Chrome)
- [ ] CompactNftStatus.tsx 변경 확인 (별도 수정, 이 작업과 무관할 수 있음)

## 중요 컨텍스트

- **결정사항**: 3개 에이전트 병렬 리뷰(/review)를 2회 실행. 첫 번째는 일반 리뷰, 두 번째는 UX 집중 리뷰. UX 리뷰에서 actions에 텍스트를 넣는 이중 배치를 제거하고, children만 사용하는 단순 구조로 변경.
- **`_self` vs `_blank`**: MetaMask 딥링크는 반드시 `_self`로 열어야 앱 전환이 정상 동작 (Step1WelcomeCard 패턴 참조)
- **세션 끊김 안내**: MetaMask 인앱 브라우저는 별도 브라우저 컨텍스트라 localStorage 세션이 없음. 사용자에게 재로그인 필요를 안내하는 문구 포함
- **iOS Safari는 WalletConnect 정상**: 여러 차례 검증됨. Link 버튼 직접 표시
- **Android에서 Safari 옵션 불필요**: `isAndroidBrowser()` 체크로 "Copy Link for Safari" 버튼 숨김
- **파일 위치**:
  - 핵심: `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx`
  - 유틸: `apps/nasun-website/frontend/src/utils/mobileDetect.ts`
  - 참조 패턴: `apps/nasun-website/frontend/src/sections/wave1/battalion-nft/cards/Step1WelcomeCard.tsx`
  - AccountItem: `apps/nasun-website/frontend/src/sections/myAccount/components/AccountItem.tsx`

## 최근 변경 파일

- `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` (이 작업)
- `apps/nasun-website/frontend/src/sections/myAccount/CompactNftStatus.tsx` (별도)
- `apps/pado/.env.production` (별도)

## 즉시 다음 단계

1. 실기기에서 테스트: iOS Safari, Android Chrome, iOS Chrome에서 my-account 페이지 접속하여 EVM wallet 섹션 확인
2. 테스트 통과 후 `/ship` 으로 커밋 및 푸시
3. 스테이징 배포 후 모바일 실기기 재검증