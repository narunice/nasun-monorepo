# Handoff: Battalion NFT Withdraw & Unlink cognitoToken 수정

**생성**: 2026-03-02 16:30
**브랜치**: main
**이전 핸드오프**: [2026-03-02-metamask-mobile-install-hint.md](2026-03-02-metamask-mobile-install-hint.md)

## 현재 상태 요약

Battalion NFT Allowlist의 My Account 페이지에서 withdraw/unlink 버튼이 "Session expired"로 실패하던 문제를 수정했다. 원인은 사이트 로그인 없이 Battalion NFT 페이지에서 X 인증 후 등록한 사용자의 cognitoToken이 auth context에 없는 것이었다. useBattalionNftStore의 cognitoToken을 fallback으로 사용하도록 수정.

## 완료된 작업

- [x] Withdraw 버튼을 빨간 원형 아이콘(−)으로 변경 (시각적 비중 축소)
- [x] Withdraw 확인 모달의 버튼 크기 키우고 좌우 grid 배치 (모바일 UX 개선)
- [x] Withdraw silent failure 원인 진단 (cognitoToken: false 확인)
- [x] CompactNftStatus: useBattalionNftStore에서 cognitoToken fallback 추가
- [x] battalionNftApi: withdrawUserApi의 cognitoToken 파라미터를 optional로 변경
- [x] useAccountLinking: handleLinkMetaMask와 unlinkAccount에 동일한 cognitoToken fallback 적용
- [x] security review + code review 완료 후 push

## 미완료 작업

- [ ] Staging 배포 후 실제 테스트 (Battalion NFT 등록 → My Account → Withdraw/Unlink 전체 플로우)
- [ ] cognitoToken이 아예 없는 경우(store에도 없는 경우) 사용자에게 더 명확한 안내 제공 검토

## 중요 컨텍스트

### 결정사항

- **cognitoToken fallback 패턴**: `user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken`
  - 이유: Battalion NFT 페이지에서 X 인증 시 cognitoToken이 store에만 저장되고 auth context에는 없음
  - 동일 Cognito Identity이므로 보안 위험 낮음 (security review에서 이론적 우려 제기했으나 실제 위험 미미)
  - 기존 패턴: Step4WalletConnectCard.tsx에서 이미 동일 패턴 사용 중

- **withdrawUserApi cognitoToken optional화**: 백엔드 API Gateway에 Token Authorizer가 설정되어 있어 실제로는 토큰 필수. 하지만 프론트에서 optional 처리하여 토큰 없을 때도 API 호출 시도 → 명확한 에러 반환

### 주의사항

- **cognitoToken은 메모리에만 존재**: useBattalionNftStore의 partialize 설정에서 cognitoToken은 localStorage에 저장하지 않음 (보안). 페이지 새로고침 시 토큰 소실
- **백엔드 withdraw endpoint**: API Gateway Token Authorizer 필수. 토큰 없이 호출하면 401 + CORS 에러 (CORS 헤더가 401 응답에 포함되지 않음)
- **withdraw endpoint CORS**: `ALLOWED_ORIGINS` 환경변수에 localhost가 포함되어야 dev 환경에서 테스트 가능

### 파일 위치

- `apps/nasun-website/frontend/src/sections/myAccount/CompactNftStatus.tsx` — withdraw 버튼 + 모달
- `apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts` — link/unlink 로직
- `apps/nasun-website/frontend/src/services/battalionNftApi.ts` — withdrawUserApi (cognitoToken optional)
- `apps/nasun-website/frontend/src/stores/useBattalionNftStore.ts` — Battalion NFT 상태 (cognitoToken 저장)
- `apps/nasun-website/cdk/lib/nft-event-stack.ts` — withdraw Lambda + Token Authorizer CDK 정의
- `apps/nasun-website/cdk/lambda-src/nft-event/withdraw-user/src/authorizer.ts` — Cognito JWT 검증

## 최근 변경 파일

커밋 `43f304b9`:
- `apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts` — cognitoToken fallback

이전 커밋(이 세션 중 커밋됨):
- `apps/nasun-website/frontend/src/sections/myAccount/CompactNftStatus.tsx` — withdraw 아이콘 + 모달 + fallback
- `apps/nasun-website/frontend/src/services/battalionNftApi.ts` — optional cognitoToken

## 즉시 다음 단계

1. staging에 배포하고 전체 플로우 테스트: 로그인 안 한 상태 → Battalion NFT 등록 → My Account → Withdraw/Unlink
2. 토큰 만료 시나리오 테스트: 오래된 세션에서 withdraw 시도 시 적절한 에러 메시지 표시 여부 확인
