# Handoff: 거버넌스 스캐너 포인트 미지급 + 카테고리 바 작업 정리

**생성**: 2026-04-03 17:00
**브랜치**: main

## 현재 상태 요약

거버넌스 투표가 ecosystem points에 반영되지 않는 문제 발견. 전체 시스템에서 최신 governance 기록이 3/26으로 멈춰있음. 카테고리 바를 ecosystem score 구성(base + governance + bonus)으로 변경하는 작업은 프로덕션 배포 완료.

## 완료된 작업

- [x] 리더보드 V3 displayName 파괴 버그 수정 (get-my-rank.ts 0x 가드)
- [x] displayName 복구 (3/29 스냅샷 기반, 997명 중 대부분 복구)
- [x] 카테고리 바를 ecosystem score 구성으로 변경 (base + governance + bonus)
- [x] Explorer API에 bonusCategories, governanceDays 필드 추가
- [x] ProfileHeroCard에서 레거시 getPointsUser 호출 제거
- [x] daily-nft-check.ts TypeScript 에러 수정 (.transactions 타입)
- [x] snapshot history 500 에러 수정 (referral_bonus 컬럼 부재)
- [x] Explorer API + 프론트엔드 프로덕션 배포 완료

## 미완료 작업

### 1. 거버넌스 포인트 스캐너 미작동 (중요)

**증상**: 3/26 이후 governance 카테고리의 activity_points가 전혀 삽입되지 않음.

**확인된 사실**:
- 사용자(@Fall2026)가 투표에 참여했고 Vote Proof NFT가 있음
- activity_points에 governance 기록: 3/5, 3/21만 존재 (최근 투표 없음)
- 전체 시스템 최신 governance 기록: 3/26

**추정 원인**: points-scanner가 이벤트를 정상적으로 스캔하지만, 거버넌스 패키지 ID가 변경되었거나 이벤트 구조가 달라진 경우 매칭 실패.

**조사 방향**:
1. `PKG.governance` 주소 확인: `3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3`
2. `PKG.governanceMultiChoice` 주소 확인: `a1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a`
3. 3/26 이후 실제 투표 TX의 이벤트 구조를 RPC로 확인하여 EVENT_MAP 매칭 여부 검증
4. `event_struct_name` 테이블에서 governance 패키지의 최근 이벤트 존재 여부 확인:
   ```sql
   SELECT * FROM event_struct_name
   WHERE encode(package, 'hex') = '3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3'
   ORDER BY tx_sequence_number DESC LIMIT 5;
   ```
5. 새 거버넌스 컨트랙트가 배포되었는지 확인 (패키지 주소 변경)

**핵심 파일**:
- `api-server/src/config/points.ts` (lines 82-87, 176-179): EVENT_MAP 거버넌스 매핑
- `api-server/src/scanner/points-scanner.ts` (line 346-372): fetchEventBatch SQL
- `packages/devnet-config/devnet-ids.json`: 배포된 컨트랙트 주소

### 2. 미커밋 변경사항

```
M  apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx   # 카테고리 바 변경
M  apps/nasun-website/frontend/src/services/ecosystemScoreApi.ts            # bonusCategories, governanceDays 타입
M  apps/network-explorer/api-server/src/routes/ecosystem.ts                 # bonusCategories, governanceDays API
M  apps/network-explorer/api-server/src/scanner/daily-nft-check.ts          # TS 에러 수정
M  .claude/settings.json                                                    # 커밋 불가 (비밀번호 포함)
```

linter가 ecosystem.ts에 referral 관련 필드를 추가함 (referralBonus, refTotal 등). 이 코드는 이번 세션에서 작성한 것이 아니며 별도 확인 필요.

### 3. 기타 알려진 이슈

- **Refresh 버튼 429**: sync 엔드포인트 rate limit. 정상 동작이지만 UX 개선 여지 (캐시 무효화 후 재조회)
- **Snapshot backfill 스크립트**: 아직 미작성
- **Pado 정산**: 퍼블릭 런칭 후 실행

## 중요 컨텍스트

### 결정사항

- **카테고리 바 구성**: Base Score + Governance + Bonus 카테고리별 (ecosystem score 실제 구성 반영)
- **governance 기여도**: 활동 일수(governanceDays)로 계산. base_score가 COUNT(DISTINCT category)/day이므로, governance 활동 1일 = 1점 기여
- **displayName 복구 방식**: 3/29 스냅샷 (가장 양호, 997명 good)에서 Account/SeasonAccount 테이블에 복원
- **displayName 파괴 근본 원인**: get-my-rank.ts가 UserProfile.username(0x 주소)을 가드 없이 displayName에 덮어씀

### 주의사항

- **Node.js 버전**: Vite 7은 Node 20+ 필요. 빌드 시 `nvm use 22` 필수
- **Explorer API는 단일 서버**: node-3 (54.180.61.196), dev/prod 구분 없음
- **linter가 referral 코드 추가**: ecosystem.ts에 referral_bonus 관련 코드가 linter에 의해 추가됨. snapshot history에서 referral_bonus 컬럼이 DB에 없어 500 에러 발생한 적 있음. 수동으로 제거했으나 linter가 다시 추가할 수 있음

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/config/points.ts` | EVENT_MAP, 거버넌스 패키지 주소 |
| `api-server/src/scanner/points-scanner.ts` | 메인 스캔 루프, fetchEventBatch |
| `api-server/src/routes/ecosystem.ts` | Score API (bonusCategories, governanceDays) |
| `nasun-website/.../ProfileHeroCard.tsx` | 카테고리 바 UI |
| `nasun-website/.../ecosystemScoreApi.ts` | 프론트엔드 API 타입 |

## 즉시 다음 단계

1. 거버넌스 스캐너 조사: event_struct_name에서 governance 패키지 이벤트 존재 확인
2. 패키지 주소 변경 여부 확인 (devnet-ids.json vs points.ts)
3. 미커밋 변경사항 커밋 + push
