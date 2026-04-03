# Handoff: Governance를 Daily Mission으로 분리

**생성**: 2026-04-03 18:00
**브랜치**: main
**이전 핸드오프**: [2026-04-03-governance-scanner-issue.md](2026-04-03-governance-scanner-issue.md)

## 현재 상태 요약

Governance를 base score에서 분리하여 Daily Mission 체크리스트의 조건부 항목으로 변경하는 작업. 기존 카테고리 바에서 governance를 base 비율로 분리 표시하는 시도가 있었으나, base score 계산 방식(COUNT DISTINCT category/day)과 맞지 않아 정확한 분리가 어려움. 사용자가 governance를 base에서 완전히 제거하고 Daily Mission의 동적 항목으로 이동하기로 결정.

## 요구사항

1. **Daily Missions에서 governance 제거**: 기존 base score 계산에서 governance 카테고리 제외
2. **Base score에서 governance 제외**: matview `ecosystem_daily_scores`의 제외 목록에 governance 추가
3. **Daily Missions 체크리스트에 조건부 governance 항목 추가**:
   - active한 proposal이 있고, 사용자가 아직 투표하지 않았을 때에만 표시
   - 체크리스트 제일 마지막에 위치
   - 투표하면 체크마크 표시

## 미완료 작업

- [ ] matview `ecosystem_daily_scores` DDL에서 governance 카테고리 제외 추가
- [ ] matview 재생성 (postgres 유저로 CREATE, OWNER TO sui_indexer)
- [ ] 카테고리 바에서 governance 세그먼트 제거 (ProfileHeroCard.tsx)
- [ ] API에서 governanceDays 필드 제거 (ecosystem.ts)
- [ ] Daily Missions에 조건부 governance 항목 추가:
  - Active proposals API 확인 (governance-api)
  - 사용자 투표 여부 확인 로직
  - DailyMissionsCard.tsx에 동적 항목 추가
- [ ] Frontend 인터페이스에서 governanceDays 제거 (ecosystemScoreApi.ts)
- [ ] 프론트엔드 빌드 + 배포 (nvm use 22 필수)
- [ ] Explorer API 배포 (node-3 PM2)

## 중요 컨텍스트

### 결정사항

- **Governance는 base score에 포함하지 않음**: 투표는 상시 활동이 아니라 proposal이 있을 때만 가능하므로, base score(일상 활동 다양성)와 성격이 다름
- **조건부 표시**: active proposal이 없거나 이미 투표했으면 항목 자체가 보이지 않음
- **카테고리 바**: governance 제거 후 Base Score + Bonus 카테고리만 표시

### 주의사항

- **matview 재생성 시**: `ALTER MATERIALIZED VIEW ecosystem_daily_scores OWNER TO sui_indexer` 필수
- **거버넌스 스캐너 이슈**: 3/26 이후 governance 포인트가 스캔되지 않는 별도 이슈 존재 (governance-scanner-issue.md 참조). 이 문제를 먼저 해결해야 governance daily mission이 작동함
- **Node.js 버전**: Vite 7 빌드 시 `nvm use 22` 필수
- **linter 주의**: ecosystem.ts에 linter가 referral_bonus 컬럼 참조를 추가하는 경향 있음. DB에 해당 컬럼이 없으면 500 에러 발생

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/db/ecosystem-schema.sql` | matview DDL (governance 제외 추가) |
| `api-server/src/routes/ecosystem.ts` | governanceDays 쿼리 + API 응답 |
| `nasun-website/.../ProfileHeroCard.tsx` | 카테고리 바 UI |
| `nasun-website/.../ecosystemScoreApi.ts` | 프론트엔드 API 타입 |
| `nasun-website/.../DailyMissionsCard.tsx` | Daily Missions 체크리스트 |
| `nasun-website/cdk/lambda-src/governance-api/` | Governance API (active proposals) |

## 최근 변경 파일 (미커밋, 이 작업 관련)

```
M  apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx   # 카테고리 바 (base+governance+bonus)
M  apps/nasun-website/frontend/src/services/ecosystemScoreApi.ts            # governanceDays 타입
M  apps/network-explorer/api-server/src/routes/ecosystem.ts                 # governanceDays API
```

## 즉시 다음 단계

1. 거버넌스 스캐너 이슈 먼저 해결 (governance-scanner-issue.md)
2. matview DDL에서 governance 카테고리 제외
3. DailyMissionsCard에 조건부 governance 항목 추가
4. ProfileHeroCard에서 governance 세그먼트 제거
