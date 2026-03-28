# Handoff: My Account 게이미피케이션 개편

**생성**: 2026-03-28 11:30
**업데이트**: 2026-03-28 (Phase A 완료)
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

My Account 페이지 게이미피케이션 개편의 3-phase 계획 중 Phase A(ProfileHeroCard 리팩토링)와 Phase B(Daily Mission 보너스 포인트)가 완료되었다. Phase C(Display Name 편집)만 남아있다. 변경사항은 아직 커밋되지 않은 상태.

## 완료된 작업

### Phase B: Daily Mission 보너스 포인트 (이전 세션)
- [x] daily-mission.ts 모듈 (dm: synthetic digest, aggregate 쿼리)
- [x] points-scanner.ts 통합 (scanLoop 끝, totalProcessed > 0 가드)
- [x] config/points.ts daily-mission 카테고리 추가
- [x] DailyMissionsCard all-clear 보너스 UI

### Phase A: ProfileHeroCard 리팩토링 (이번 세션)
- [x] A-1: `utils/identicon.ts` - generateWalletIdenticon 순수 함수 추출 (~30줄)
- [x] A-1: `hooks/useProfileDisplay.ts` - displayName, avatar, loginIdentifier 훅 (~85줄)
- [x] A-1: `hooks/useNasunWalletState.ts` - 지갑 상태 derivation + auto-register 훅 (~90줄)
- [x] A-2: `components/EvmWalletLink.tsx` - EVM 서브컴포넌트 4개 분리 (~280줄)
- [x] A-2: `ConnectedAccountsCard.tsx` - Connected Accounts 독립 카드 (~310줄)
- [x] A-3: ProfileHeroCard 슬림화 (1000줄 -> ~75줄, 프로필 표시 전용)
- [x] A-4: DevMyAccountPage 레이아웃 변경 (row-span-2 제거, ConnectedAccounts Row 4 배치)
- [x] tsc --noEmit 통과 (타입 에러 없음)

## 미완료 작업

### Phase C: Display Name 편집
- [ ] C-1: CDK common-stack.ts CORS에 PATCH 추가
- [ ] C-2: Lambda corsHeaders에 PATCH 추가
- [ ] C-3: get-user-profile Lambda에 PATCH 핸들러 (UpdateItemCommand, JWT-only identityId, 필드 allowlist)
- [ ] C-4: useProfileDisplay 훅에 customDisplayName 우선순위 추가
- [ ] C-5: ProfileHeroCard 인라인 편집 UI (연필 아이콘, Enter/Esc)
- [ ] C-6: services/userProfileApi.ts 신규 (PATCH API 클라이언트)

### 기타
- [ ] Phase A + B 변경사항 커밋/푸시
- [ ] staging 배포 후 `/dev/my-account` 시각 검증

## 중요 컨텍스트

- **계획 파일**: `/home/naru/.claude/plans/precious-napping-pearl.md` (v3, 4차 리뷰 PASS)
- **프로덕션 보호**: `/my-account`는 절대 수정 금지. `/dev/my-account`에서만 작업
- **Phase C CORS**: CDK `allowMethods` + Lambda `corsHeaders` 양쪽 모두 PATCH 추가 필수
- **Phase C 보안**: identityId는 JWT에서만 추출, body에서 받지 않음. 필드 allowlist 필수
- **API 패턴**: `import.meta.env.VITE_USER_PROFILE_API` 사용 (API_BASE 아님)
- **Vite 빌드**: Node.js 18에서 Vite 7의 `crypto.hash` 에러 발생 (기존 이슈, 코드 무관)

## 핵심 파일 경로

| 파일 | 목적 |
|------|------|
| `sections/myAccount/ProfileHeroCard.tsx` | 리팩토링 완료 (~75줄, 프로필 표시 전용) |
| `sections/myAccount/ConnectedAccountsCard.tsx` | 신규: Connected Accounts 카드 |
| `sections/myAccount/components/EvmWalletLink.tsx` | 신규: EVM 지갑 연결 컴포넌트 |
| `sections/myAccount/hooks/useProfileDisplay.ts` | 신규: 프로필 표시 훅 |
| `sections/myAccount/hooks/useNasunWalletState.ts` | 신규: 지갑 상태 훅 |
| `sections/myAccount/utils/identicon.ts` | 신규: identicon 생성 유틸 |
| `pages/dev/DevMyAccountPage.tsx` | 레이아웃 업데이트 |
| `cdk/lambda-src/get-user-profile/index.ts` | Phase C PATCH 핸들러 추가 대상 |
| `cdk/lib/common-stack.ts` | Phase C CORS PATCH 추가 대상 |

## 즉시 다음 단계

1. Phase A 변경사항 커밋
2. staging 배포 후 `/dev/my-account` 시각 검증 (계정 연결/해제, 프로필 표시, 레이아웃)
3. Phase C-1: CDK CORS에 PATCH 추가
4. Phase C-2~3: Lambda PATCH 핸들러
5. Phase C-4~6: useProfileDisplay 업데이트 + 편집 UI + API 클라이언트
