# Handoff: MetaMask 데스크탑 익스텐션 팝업 미작동 수정

**생성**: 2026-02-28 23:50
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

데스크탑 브라우저(Chrome/Edge)에서 MetaMask 익스텐션 팝업이 뜨지 않는 버그의 원인을 진단 완료했고, 수정 계획을 작성하여 아키텍트 리뷰까지 통과한 상태. 코드 수정은 아직 시작하지 않음.

## 완료된 작업

- [x] 문제 원인 조사 (Explore 에이전트로 전체 MetaMask 관련 코드 분석)
- [x] 수정 계획 작성 (`.claude/plans/reflective-purring-sonnet.md`)
- [x] 아키텍트 리뷰 완료 — 계획 타당성 승인

## 미완료 작업

- [ ] Step4WalletConnectCard.tsx 코드 수정
- [ ] metamaskSdkProvider.ts에 모바일 전용 가드 추가
- [ ] `pnpm build:nasun-website` 빌드 검증
- [ ] 보안 리뷰 (security-reviewer + code-reviewer 에이전트)
- [ ] 스테이징 배포 및 데스크탑/모바일 수동 테스트

## 중요 컨텍스트

다음 세션에서 반드시 알아야 할 정보:

- **근본 원인**: `Step4WalletConnectCard.tsx` 라인 82-84에서 데스크탑 경로가 `connectAndSignSDK()`를 사용. 이 함수는 MetaMask SDK를 `headless: true`로 초기화하여 Socket.io 릴레이만 시작하고 데스크탑 익스텐션 팝업을 트리거하지 않음 → 120초 타임아웃 실패.
- **유일한 문제 파일**: `Step4WalletConnectCard.tsx`만 문제. WalletLoginButton, useMetaMaskConnection, useWhitelistRegistration, CompactNftStatus는 모두 이미 올바른 `mobile ? SDK : window.ethereum` 패턴 사용 중.
- **수정 방향**: 데스크탑 경로를 `connectAndSignSDK()` → `connectWallet()` + `signMessage()` (window.ethereum 직접 사용)으로 변경. WalletLoginButton과 동일한 패턴으로 통일.
- **추가 방어**: `metamaskSdkProvider.ts`의 `getSDK()`에 `if (!isMobileBrowser()) throw` 가드 추가.
- **API 호환성**: `connectVerify()`는 signature+nonce만 받고 서버에서 ecrecover하므로, 클라이언트에서 address를 어떻게 얻든 무관.

- **주의사항**: `connectAndSignSDK` import만 제거. `connectMetaMaskSDK`, `signMessageViaSDK`, `disconnectMetaMaskSDK`는 모바일 경로에서 여전히 사용하므로 유지.

## 핵심 파일 경로

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/frontend/src/sections/wave1/battalion-nft/cards/Step4WalletConnectCard.tsx` | **수정 대상** — 데스크탑 경로 변경 |
| `apps/nasun-website/frontend/src/lib/wallet/metamaskSdkProvider.ts` | **수정 대상** — 모바일 전용 가드 추가 |
| `apps/nasun-website/frontend/src/utils/metamaskUtils.ts` | 참조 — `connectWallet`, `signMessage` import 소스 |
| `apps/nasun-website/frontend/src/features/auth/components/WalletLoginButton.tsx` | 참조 — 올바른 패턴의 예시 |
| `.claude/plans/reflective-purring-sonnet.md` | 상세 수정 계획 + 아키텍트 리뷰 결과 |

## 즉시 다음 단계

1. `.claude/plans/reflective-purring-sonnet.md` 읽고 ExitPlanMode로 계획 승인 받기
2. `Step4WalletConnectCard.tsx` 수정: import 변경 + 데스크탑 분기 로직 변경
3. `metamaskSdkProvider.ts` 수정: `getSDK()`에 모바일 전용 가드 추가
4. `pnpm build:nasun-website` 빌드 확인
5. 보안/코드 리뷰 에이전트 실행
6. 스테이징 배포 후 데스크탑 + 모바일 수동 테스트
