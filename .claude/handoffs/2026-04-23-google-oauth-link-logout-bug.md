# Google OAuth 연동 시 자동 로그아웃 버그 조사

**Date**: 2026-04-23
**Reporter**: 사용자 리포트 `0f5c31a5-5` (`0xbf8696be717a79681ccddfd878702f1937e1982060aaac0dea30fb184dcf584c`, 2026-04-20)
**Priority**: Medium (재현 가능한 로그인 단절, 신규 사용자의 Google 연동 유입 차단)
**Scope**: 조사 + 수정. 토큰 예산은 bug-triage 7% 상한과 별개 책정.

---

## 증상 (사용자 리포트 원문)

> 나선 대시보드에서 구글 계정을 연동하려고 하면, 로그인 과정 이후 자동으로 로그아웃되는 문제가 발생합니다.
> X(트위터), 텔레그램, 메타마스크 등 다른 계정들은 정상적으로 연동되지만, 구글 계정만 동일한 문제가 반복됩니다.
> 나선 계정이 오픈되면서 초기에도 해보았었는데.. 지금도 계속 이러한 오류가 생기고 있습니다.

답장은 `fixed + 3pts`로 나갈 예정이지만, 문안은 "콜백 처리 중 세션이 초기화되며 메인으로 리다이렉트되는 분기를 확인했다, 개선 과제에 반영" 수준이고 실제 수정은 아직 안 됨.

---

## 지금까지 파악한 것 (가설, 검증 필요)

**추측으로 확정짓지 말고 반드시 재현·로그·코드 흐름으로 검증한 뒤에 고치시오.** 아래는 초기 가설일 뿐임.

1. `Callback.tsx`의 4-way 분기 중 Case 4(`!isLoading && !isAuthenticated && !error → navigate("/")`)로 빠지면 증상과 정확히 일치. [apps/nasun-website/frontend/src/features/auth/components/Callback.tsx:126-130](apps/nasun-website/frontend/src/features/auth/components/Callback.tsx#L126-L130)

2. Google OAuth linking 플로우가 세션 상태를 set하는 지점: [apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts:20-36](apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts#L20-L36)
   - `google_link_session`을 sessionStorage + localStorage 두 곳 모두에 저장
   - `auth_provider_preference: "Google"`을 localStorage에 저장
   - `buildGoogleAuthUrl()` 로 redirect

3. Callback.tsx 상단 주석(line 25-30)이 이미 경고하는 점:
   > `auth_provider_preference` (localStorage) can survive abandoned linking flows and would cause a symmetric mis-routing regression for a future genuine zkLogin attempt.

   즉 버려진 linking 세션 키가 다른 경로에 간섭할 수 있다는 것을 팀이 이미 인지하고 있음. 유사 패턴이 Google linking 자체에서 재생산될 가능성.

4. Cognito Identity Pool은 사용자 한 명에 한 시점의 identity provider 하나만 활성화 가능. MetaMask(Developer Identity)로 이미 로그인한 세션에 Google Federated Identity가 붙을 때 `refreshAndSaveUserProfile` 같은 경로가 silent throw하면 `isAuthenticated`가 false로 전환되고 Case 4로 빠짐.

---

## 첫 조사 단계 (이 순서로 시작 권장, 그러나 증거 보며 유연하게)

1. **재현**: 스테이징 또는 로컬에서 MetaMask로 먼저 로그인 → My Account → Google 연동 버튼 클릭 → 실제로 `/`로 튕기는지 확인. 재현이 우선.
2. **DevTools 네트워크 + Console**: 콜백 도착 직후의 Cognito `/oauth2/token` 또는 Federated Identity 관련 호출 로그 확인. 에러 응답이 있는지, AuthContext가 어떤 분기를 타는지 console.log 추가해서 추적.
3. **AuthContext 코드 리뷰**: `refreshAndSaveUserProfile`와 Google callback 처리 경로. throw를 setError로 propagate하는지, 그냥 catch로 먹는지 확인.
4. **Case 4 재진입 경로**: Callback.tsx가 `google_link_session`이 있는데 인증이 null로 떨어진 경우를 명시적으로 처리하지 않고 있음. 이 케이스를 별도 분기로 명시하거나 에러 메시지를 보여주는 게 맞을 수 있음.

---

## 수정 방향 (확정 아님, 검증 후 결정)

- Case 4 안에서 linking session이 active였는지 체크하고, 그에 맞는 사용자 피드백 ("구글 연동에 실패했습니다") 을 보여주는 경로를 분리
- linking 플로우 완료 시점에 Cognito session이 정상적으로 재구성되었는지 explicit check, 실패하면 원래 인증으로 롤백
- `auth_provider_preference` 같은 잔존 localStorage 키 정리 타이밍 재검토
- (옵션) Google linking은 현재 "새 Cognito identity로 바꾸기"가 아니라 "기존 identity에 Google claim을 추가하기"로 의도되어 있음이 맞는지 확인. 이게 혼재되어 있을 가능성

---

## 참고 파일

- [Callback.tsx](apps/nasun-website/frontend/src/features/auth/components/Callback.tsx) — 주요 분기 로직
- [useAccountLinking.ts](apps/nasun-website/frontend/src/sections/myAccount/hooks/useAccountLinking.ts) — Link Google 시작 지점
- [AuthContext / useAuth](apps/nasun-website/frontend/src/features/auth/hooks/useAuth.ts) — 인증 상태 관리 (파일 경로는 프로젝트 내 검색으로 확정 필요)
- [googleAuthUrl.ts](apps/nasun-website/frontend/src/features/auth/utils/googleAuthUrl.ts)

## 관련 메모리

- [feedback_verify_before_claim.md](/home/naru/.claude/projects/-home-naru-my_apps-nasun-monorepo/memory/feedback_verify_before_claim.md) — 이 핸드오프의 모든 가설은 코드 검증 후에만 수정 근거로 쓸 것

## 완료 조건

1. 로컬/스테이징에서 MetaMask 로그인 + Google 연동 → /my-account로 정상 이동하며 `user.linkedAccounts.google` 채워짐 확인
2. 연동 실패 케이스(예: 팝업 닫기, 네트워크 오류)는 "로그아웃"이 아니라 사용자가 현재 세션을 유지한 채 에러 메시지를 보는 경로로 흐르는지 확인
3. 기존 Twitter / Telegram / MetaMask linking이 회귀되지 않았는지 확인

## 스코프 가드

- 이 건은 bug-triage 답장 건이 아니라 실제 엔지니어링 작업. 답장은 이미 나갔거나 곧 나갈 예정이므로 사용자에게 별도 공지 필요 없음
- Cognito Identity Pool 구조 자체를 재설계하지 말 것. 현재 linking flow 내의 버그 수정에 한정
- 다른 인증 제공자(X/Telegram/MetaMask) 코드는 건드리지 말 것, 회귀 위험
