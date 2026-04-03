# Handoff: Governance를 Ecosystem Points에 통합

**생성**: 2026-04-03 23:30
**브랜치**: main
**이전 핸드오프**: [2026-04-03-governance-daily-mission.md](2026-04-03-governance-daily-mission.md)

## 현재 상태 요약

Governance를 base score(matview)에서 분리하여 ecosystem points의 독립 카테고리로 통합 완료. DB 포인트 보정, API 수정, 프론트엔드 카테고리 바 수정, Daily Mission 조건부 항목 추가까지 모두 프로덕션 배포 완료.

## 완료된 작업

- [x] matview `ecosystem_daily_scores`에서 governance 카테고리 제외 (재생성 완료)
- [x] DB governance vote 포인트 보정 (base_points=10, genesis_multiplier=1, final_points=10, 752건)
- [x] API: governance 포인트를 ecosystem points에 별도 합산 (allTime/today/weekly)
- [x] API: bonusCategories 쿼리를 확장하여 governance, referral-bonus 포함
- [x] API: governanceDays 제거, daily/weekly/allTime score 계산에 governance 추가
- [x] Frontend: 카테고리 바를 비율 기반으로 변경 (base = allTimePoints - nonBaseTotal)
- [x] Frontend: CATEGORY_COLORS/LABELS에 governance, referral-bonus 추가
- [x] Frontend: DailyMissionsCard에 조건부 governance 투표 항목 추가 (useGovernanceMission 훅)
- [x] Frontend: ecosystemScoreApi.ts에서 governanceDays 타입 제거
- [x] Explorer API 배포 (node-3 PM2)
- [x] 프론트엔드 스테이징 + 프로덕션 배포
- [x] CloudFront 캐시 무효화
- [x] Multi-wallet 합산 검증 (코드 변경 불필요, identity 기준으로 이미 구현됨)

## 미완료 작업

- [ ] 스냅샷 시스템 리팩토링: 카테고리별 일일 스냅샷으로 전환
- [ ] 미커밋 변경사항 커밋 + push
- [ ] 거버넌스 스캐너 이슈 해결 확인 (별도 세션에서 진행 중)

## 중요 컨텍스트

### 결정사항

- **Governance는 base score가 아닌 독립 포인트**: base score는 일상 활동 다양성(COUNT DISTINCT category/day)을 측정. governance는 비정기 활동이므로 별도로 합산
- **Ecosystem Points 공식**: `base_score * multiplier + bonus_total + governance_total + referral * scaling`
- **카테고리 바**: all time points에서 각 카테고리가 차지하는 비율. base = 총점 - 비-base 카테고리 합 (역산)
- **Governance 배점**: vote = 10점/회. genesis_multiplier는 Genesis Pass 드롭 전이므로 1로 고정
- **Multi-wallet**: identity 기준으로 이미 올바르게 구현. 같은 카테고리는 하루 1회만 카운트

### 향후 개선: 스냅샷 카테고리화

현재 역산 방식(총점 - 개별 카테고리 합 = base) 대신, 일일 스냅샷에 카테고리별 포인트를 기록하면 단순 합산으로 가능:
```
snapshot_date | category | points
2026-04-03   | base     | 5
2026-04-03   | governance | 0
```
all-time = SUM(points) GROUP BY category. 역산 불필요, 확장성 우수. 런칭 이후 개선 과제.

### 주의사항

- **linter 주의**: ecosystem.ts에 linter가 referral_bonus 컬럼 참조를 추가하는 경향. DB에 해당 컬럼이 없으면 500 에러
- **Node.js 버전**: Vite 7 빌드 시 `nvm use 22` 필수
- **과거 스냅샷**: matview 재생성 전의 스냅샷에 governance가 base 일부로 포함. 오늘 런칭이므로 오늘부터의 스냅샷이 기준

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/routes/ecosystem.ts` | Ecosystem Points API (score 계산, bonusCategories) |
| `api-server/src/db/ecosystem-schema.sql` | matview DDL (governance 제외) |
| `api-server/src/config/points.ts` | governance vote 배점 (10점) |
| `nasun-website/.../ProfileHeroCard.tsx` | 카테고리 바 UI |
| `nasun-website/.../DailyMissionsCard.tsx` | Daily Missions 체크리스트 |
| `nasun-website/.../useGovernanceMission.ts` | 조건부 governance 미션 훅 (신규) |
| `nasun-website/.../ecosystemScoreApi.ts` | Frontend API 타입 |

## 최근 변경 파일 (미커밋)

```
M  apps/network-explorer/api-server/src/routes/ecosystem.ts        # governance points 통합
M  apps/network-explorer/api-server/src/db/ecosystem-schema.sql    # matview governance 제외
M  apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx  # 카테고리 바 비율 기반
M  apps/nasun-website/frontend/src/sections/myAccount/DailyMissionsCard.tsx  # 조건부 governance
M  apps/nasun-website/frontend/src/services/ecosystemScoreApi.ts   # governanceDays 제거
?? apps/nasun-website/frontend/src/hooks/useGovernanceMission.ts   # 신규 훅
```

## 즉시 다음 단계

1. 미커밋 변경사항 커밋 + push
2. 스냅샷 시스템 리팩토링 계획 수립 (카테고리별 일일 스냅샷)
3. 거버넌스 스캐너 이슈 해결 확인
