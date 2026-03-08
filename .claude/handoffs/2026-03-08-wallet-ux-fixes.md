# Handoff: My Account 지갑 UX 3가지 이슈 수정

**생성**: 2026-03-08 (세션 2)
**브랜치**: main
**이전 핸드오프**: `.claude/handoffs/2026-03-06-nasun-wallet-auth-plan.md`
**플랜 파일**: `~/.claude/plans/fancy-floating-ocean.md`

## 현재 상태 요약

Q1 (closeDropdown 패턴)과 Q3 (dismissed flag 초기화) 구현 완료. Q2는 설계상 정상으로 확인. 빌드 성공 (wallet-ui + nasun-website). **새로운 이슈 1건 미해결**: Add 버튼으로 두 번째 지갑 import 시 auto-register가 안 되고 Register 버튼이 노출됨.

## 완료된 작업

- [x] Q1: `closeDropdown` 통합 메서드 구현 (useWalletViewState.ts)
- [x] Q1: useWalletActions.ts — 5곳 `setShowDropdown(false)` → `closeDropdown()` 교체
- [x] Q1: viewModeRouter.tsx — 3곳 `setShowDropdown(false)` → `closeDropdown()` 교체
- [x] Q1: WalletConnect.tsx — Escape/overlay 핸들러에서 `s.closeDropdown()` 사용
- [x] Q2: 설계상 정상 확인 (등록과 연결은 독립 시스템)
- [x] Q3: ProfileHeroCard.tsx — Connect Wallet/Add 클릭 시 dismissed flag + ref 초기화
- [x] 빌드 검증: wallet-ui, nasun-website 빌드 성공
- [x] `closeDropdown` 선언 순서 버그 수정 (click-outside useEffect 위로 이동)

## 미완료 작업

- [ ] **NEW BUG**: Add 버튼으로 두 번째 지갑 import 후 auto-register 안 됨 → Register 버튼 노출
- [ ] 사용자 E2E 테스트 (Q1 create/import 플로우, Q3 re-import 플로우)
- [ ] git commit (사용자 요청 시)

## 중요 컨텍스트

### 결정사항
- `closeDropdown` 메서드 패턴 채택 (useEffect 대신). 리뷰 에이전트 3명이 동시성/타이밍 이슈 없는 동기적 접근을 권장
- `closeDropdownGuarded`로 rename한 로컬 함수 (WalletConnect.tsx) — 백업 플로우 중 viewMode 가드 유지

### 주의사항
- **선언 순서**: `closeDropdown` useCallback은 반드시 click-outside useEffect 위에 위치해야 함 (TDZ 에러)
- **baram 빌드 에러**: `ChatPage.tsx(109,17): TS2322` — 기존 버그, 이번 작업과 무관
- **auto-register 4-layer 방어**: ref(dedup), isLoading(remount race), sessionStorage(dismissed), hasSigner(timing)

### NEW BUG 분석 (미해결)
사용자 보고: 첫 번째 지갑은 auto-register 성공, Add → Import로 두 번째 지갑 추가 시 Register 버튼 노출.

가설:
1. `autoRegisterAttemptedRef.current`가 Add 클릭 시 null로 초기화되지만, import 완료 후 effect가 다시 실행될 때 `walletReg.isLoading`이 아직 true일 수 있음
2. `hasSigner` 타이밍 — signer가 아직 준비 안 됨
3. AddWalletModal의 `onClose` → `closeDropdown` → `setViewMode("main")` 과정에서 WalletConnect가 unmount되며 signer 상태가 리셋될 수 있음

조사 시작점: `ProfileHeroCard.tsx:174-186`의 auto-register effect + `useWalletRegistration.ts`의 `hasSigner` 값 추적

### 핵심 파일 경로
| 파일 | 역할 |
|------|------|
| `packages/wallet-ui/src/connect/hooks/useWalletViewState.ts` | closeDropdown 정의 |
| `packages/wallet-ui/src/connect/hooks/useWalletActions.ts` | 액션에서 closeDropdown 호출 |
| `packages/wallet-ui/src/connect/viewModeRouter.tsx` | 뷰 라우팅에서 closeDropdown 호출 |
| `packages/wallet-ui/src/connect/WalletConnect.tsx` | Escape/overlay에서 closeDropdown 호출 |
| `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` | auto-register effect, Connect/Add onClick |
| `apps/nasun-website/frontend/src/sections/myAccount/hooks/useWalletRegistration.ts` | 등록 로직, hasSigner |
| `apps/nasun-website/frontend/src/sections/myAccount/components/AddWalletModal.tsx` | Add 모달 |

## 최근 변경 파일

**wallet-ui (closeDropdown 패턴):**
- `packages/wallet-ui/src/connect/hooks/useWalletViewState.ts` — closeDropdown 콜백 추가
- `packages/wallet-ui/src/connect/hooks/useWalletActions.ts` — 5곳 교체
- `packages/wallet-ui/src/connect/viewModeRouter.tsx` — 3곳 교체
- `packages/wallet-ui/src/connect/WalletConnect.tsx` — Escape/overlay 핸들러

**nasun-website (Q3 + auto-register):**
- `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` — dismissed flag 초기화

## 즉시 다음 단계

1. NEW BUG 조사: `ProfileHeroCard.tsx:174-186` auto-register effect에서 두 번째 지갑 import 시 어떤 guard가 차단하는지 확인. `console.log`로 각 guard 상태 추적하거나, 코드 흐름 분석.
2. 수정 구현 후 빌드 검증
3. 사용자에게 E2E 테스트 결과 확인 요청
