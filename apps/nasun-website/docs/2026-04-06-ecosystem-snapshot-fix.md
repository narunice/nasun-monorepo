# Handoff: Ecosystem Points 복리 제거 + 카테고리 스냅샷 + 레거시 정리

**생성**: 2026-04-06 18:30
**브랜치**: main
**이전 핸드오프**: [2026-04-03-governance-ecosystem-points.md](../../.claude/handoffs/2026-04-03-governance-ecosystem-points.md)

## 현재 상태 요약

Ecosystem Points의 스냅샷 복리 버그 수정, 역산 방식 제거, governance 통합, 코드 리뷰 대응, base 카테고리 레거시 포인트 정리까지 모두 완료. API + Frontend 프로덕션 배포 완료. thejediworld77(GoSun) 사용자의 multi-wallet identity 병합도 완료.

## 완료된 작업

- [x] 복리 버그 수정: daily-snapshot.ts의 bonus/referral 쿼리에 날짜 필터 추가
- [x] governance 쿼리를 daily-snapshot.ts에 추가 (당일 delta만)
- [x] API allTime 계산식 변경: SUM(ecosystem_score) -> SUM(base_score * multiplier) + activity_points 직접 합산
- [x] scoreBreakdown API 필드 추가 (base 포함, 역산 불필요)
- [x] ProfileHeroCard.tsx 역산 로직 제거, scoreBreakdown 직접 사용
- [x] ecosystemScoreApi.ts 타입에 scoreBreakdown 추가
- [x] 코드 리뷰 대응 (4건)
  - governance_bonus 컬럼 추가 (DB ALTER + 스키마 + INSERT)
  - 서버 캐시 TTL 5min -> 30s (HTTP max-age와 정렬)
  - DailyMissionsCard completedCount useMemo 래핑
  - weekly multiplier 근사치 제한사항 코멘트
- [x] base 카테고리 레거시 final_points 제거
  - BASE_POINTS 값 통일 (모든 base 카테고리 -> 1)
  - SCORE_CATEGORIES set 추가 (governance, daily-mission, referral-bonus, ecosystem-passive)
  - points-scanner.ts: base 카테고리에 대해 genesis_multiplier 건너뛰고 final_points='1.00' 고정
  - faucet-scanner.ts: 동일 처리
- [x] thejediworld77(GoSun) 사용자 multi-wallet identity 병합
  - UserWallets DynamoDB 매핑 변경 (0x7210... -> Primary identity)
  - activity_points 32건 identity_id 재매핑
  - ecosystem_score_snapshots 병합 (4/2 중복 날짜 합산)
  - matview 새로고침
- [x] 프로덕션 DB에 governance_bonus 컬럼 추가 (ALTER TABLE)
- [x] Explorer API (node-3) 배포 완료 (PM2 재시작)
- [x] Frontend 스테이징 + 프로덕션 배포 완료

## 미완료 작업

- [ ] 미커밋 변경사항 커밋 + push (points.ts, points-scanner.ts, faucet-scanner.ts 레거시 정리분)
- [ ] referral-bonus 활성화 시 보너스 계산 재설계 필요 (현재 base_points=1 참조하므로 보너스 미미)
- [ ] snapshot history API에 governance_bonus 컬럼 반영 (현재 SELECT에 미포함)
- [ ] 기존 activity_points의 레거시 final_points 값 정리 (과거 데이터는 old값 유지 중)

## 중요 컨텍스트

### 결정사항

- **새 테이블 0개**: 원래 2-table 설계를 검토했으나, 기존 스냅샷의 base_score*multiplier가 정확하므로 API 계산식만 변경하는 것이 최적으로 판단
- **allTime 공식**: `SUM(base_score * multiplier) from snapshots + bonusTotal + govTotal + refTotal*sf + todayBase*mult`
- **복리 효과**: 스냅샷 2일치뿐이라 old/new 차이 0. 복리가 누적되기 전에 수정한 최적 타이밍
- **scoreBreakdown vs bonusCategories**: scoreBreakdown은 base 포함 전체 카테고리, bonusCategories는 기존 호환용으로 유지
- **base 카테고리 포인트**: final_points는 existence marker(1)로 통일. 점수 계산에 사용되지 않음
- **referral-bonus 참조 이슈**: referral-bonus.ts line 235에서 insert.base_points를 참조하나, 현재 referral 0건이므로 영향 없음. 활성화 시 재설계 필요

### 주의사항

- **weekly score 근사치**: 현재 multiplier를 7일 전체에 적용 (mid-week 변경 미반영). 코멘트로 문서화됨
- **snapshot immutability**: ecosystem_score_snapshots 테이블은 token allocation basis. 기존 행의 ecosystem_score는 compounded 값이지만, API에서 해당 컬럼을 더 이상 사용하지 않음 (base_score*multiplier만 사용)
- **thejediworld77 병합**: WALLET_OWNER sentinel + identity 행 + activity_points + snapshots 모두 수정됨. 기존 identity ba96-c3dc는 orphaned 상태

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/config/points.ts` | BASE_POINTS 설정, SCORE_CATEGORIES 정의 |
| `api-server/src/scanner/points-scanner.ts` | 온체인 이벤트 감지 + 포인트 기록, SCORE_CATEGORIES 분기 |
| `api-server/src/scanner/daily-snapshot.ts` | 일일 스냅샷 생성 (날짜 필터 + governance 포함) |
| `api-server/src/routes/ecosystem.ts` | Ecosystem Score API (allTime 공식, scoreBreakdown) |
| `api-server/src/scanner/faucet-scanner.ts` | 파우셋 활동 감지 (base 카테고리, final_points=1) |
| `api-server/src/db/snapshot-schema.sql` | 스냅샷 DDL (governance_bonus 컬럼 추가됨) |
| `nasun-website/.../ProfileHeroCard.tsx` | 카테고리 바 UI (scoreBreakdown 직접 사용) |
| `nasun-website/.../ecosystemScoreApi.ts` | Frontend API 타입 (scoreBreakdown 타입) |

## 최근 변경 파일 (미커밋)

```
M  apps/network-explorer/api-server/src/config/points.ts          # BASE_POINTS 통일 + SCORE_CATEGORIES
M  apps/network-explorer/api-server/src/scanner/points-scanner.ts  # base 카테고리 final_points=1 고정
M  apps/network-explorer/api-server/src/scanner/faucet-scanner.ts  # 동일
```

## 즉시 다음 단계

1. 미커밋 3개 파일 커밋 + push
2. referral-bonus 활성화 전에 보너스 계산 방식 재설계 (base_points 의존 제거)
3. snapshot history API에 governance_bonus 반영
