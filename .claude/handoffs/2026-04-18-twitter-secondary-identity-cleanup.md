# Handoff: Twitter Secondary Identity 부산물 제거

**생성**: 2026-04-18
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

Alliance penalty grace period 버그를 수정하고(배포 완료), 레거시 Twitter identity 정리를 조사하는 과정에서 근본적인 설계 결함을 발견했다. Wallet 사용자가 my-account에서 X 계정을 연결할 때마다 `AuthProvider.tsx`의 `ensureUserProfile(secondaryUserData)` 호출로 인해 불필요한 `provider: "Twitter"` identity row가 DynamoDB에 부산물로 생성되고 있다. 현재 DB에 이 방식으로 누적된 secondary row가 8,727개 이상이다.

## 완료된 작업

- [x] Alliance penalty 시스템 버그 수정 (first_seen 컬럼 없음 → INSERT 실패)
- [x] `alliance_first_seen` 테이블 신설 및 backfill (40,533명, node-3 배포 완료)
- [x] grace period 기준을 "penalty 최초 발생일" → "NFT 최초 activate 인식일"로 변경
- [x] leaderboard batch penalty 쿼리도 동일하게 수정
- [x] PENALTY_ENFORCEMENT_START dead code 제거
- [x] DynamoDB 레거시 Twitter identity 8,912개 전수 조사 완료

## 미완료 작업

- [ ] `AuthProvider.tsx`에서 `ensureUserProfile(secondaryUserData)` 호출 제거 (부산물 생성 근본 원인)
- [ ] 기존 8,727개 안전 삭제 대상 DynamoDB에서 일괄 삭제
- [ ] 73개 "진짜 고아" 레거시 처리 방침 결정 후 삭제
- [ ] explorer-api server 변경사항 커밋 (`ecosystem-schema.sql`, `ecosystem.ts`, `daily-nft-check.ts`)

## 중요 컨텍스트

### 부산물 생성 근본 원인

**파일**: `apps/nasun-website/frontend/src/features/auth/providers/AuthProvider.tsx` line 240

```typescript
// X 연결(linking) 플로우 내부
await ensureUserProfile(secondaryUserData).catch(() => { /* best-effort */ });
// ↑ 이 줄이 provider: "Twitter" identity row를 생성함 (불필요)

await linkAccounts(primaryIdentityId, identityId, ...);
// ↑ linkAccounts가 이미 secondary 정보를 Wallet identity에 반영함
```

`linkAccounts`가 이미 Wallet identity에 twitterHandle, twitterId 등을 기록하므로, `ensureUserProfile` 호출은 중복이자 부산물 생성원. 제거해도 X 연결 기능에 영향 없음.

### DynamoDB 레거시 분류 (8,912개)

| 분류 | 수 | 판정 |
|------|---:|------|
| X 연결 secondary (handle 있음, linkedToPrimaryId 있음) | 6,845 | 안전 삭제 |
| X 연결 secondary (handle 없음, 실패 케이스, linkedToPrimaryId 있음) | 1,882 | 안전 삭제 |
| linkedToPrimaryId 없고 handle도 없는 빈 껍데기 | 18 | 안전 삭제 |
| 진짜 고아 (어떤 Wallet과도 연결 안 됨) | 73 | 별도 판단 필요 |
| twitterId로만 Wallet 매핑 가능 | 77 | 별도 판단 필요 |
| linkedToPrimaryId 있으나 Wallet handle과 다름 | 17 | 안전 삭제 |

**DB 검증 완료**: activity_points, alliance_penalties, alliance_first_seen 어디에도 레거시 identity_id 참조 없음.

### 73개 진짜 고아의 특성

- Twitter OAuth 로그인(현재 차단됨)으로만 가입한 사용자
- Wallet identity 없음, 어떤 연결도 없음
- 로그인 자체가 불가능하므로 사실상 dead
- 삭제 시 twitterHandle 정보 영구 소실 (하지만 서비스 접근 불가)
- createdAt: 대부분 2026-04-05 전후 집중

### Alliance Penalty 수정 배포 현황

- node-3 (54.180.61.196) explorer-api PM2 재시작 완료
- 36,630명이 즉시 Weakened 전환 대상 (기존에 Healthy로 잘못 표시되던 사용자)
- `alliance_first_seen` 테이블: 40,533명 backfill 완료 (최초 활동일 기준)

## 최근 변경 파일

```
apps/network-explorer/api-server/src/db/ecosystem-schema.sql   — alliance_first_seen 테이블 추가
apps/network-explorer/api-server/src/routes/ecosystem.ts        — grace period JOIN 쿼리 변경
apps/network-explorer/api-server/src/scanner/daily-nft-check.ts — upsert 추가, dead code 제거
```

미수정 (이번 세션과 무관):
```
apps/nasun-website/frontend/src/routes/AppRoutes.tsx
apps/pado/frontend/src/pages/LeaderboardPage.tsx
```

## 즉시 다음 단계

1. **`AuthProvider.tsx` line 240 수정**: `ensureUserProfile(secondaryUserData)` 호출 제거
   - 파일: `apps/nasun-website/frontend/src/features/auth/providers/AuthProvider.tsx`
   - 수정 후 X 연결 플로우 실제 테스트 필요 (staging에서 X 계정 연결 시 Twitter identity row 미생성 확인)

2. **안전 삭제 대상 8,727개 DynamoDB 일괄 삭제**
   - linkedToPrimaryId 있는 것 (6,845 + 1,882 + 17) + handle/linkedToPrimaryId 없는 18개
   - Python batch-write-item 스크립트 이미 작성 완료 (이전 세션에서 준비)

3. **73개 + 77개 고아 레거시 처리 결정**
   - 삭제해도 서비스 기능에 영향 없음
   - 단, 이 사람들이 나중에 Wallet으로 가입하면 X 연결 이력이 없어짐

4. **explorer-api 변경사항 커밋** (`/ship` 실행)
