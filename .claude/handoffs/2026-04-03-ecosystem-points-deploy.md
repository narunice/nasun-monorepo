# Handoff: Ecosystem Points V1 배포 + Points History UI

**생성**: 2026-04-03 22:30
**브랜치**: main
**이전 핸드오프**: [2026-04-03-ecosystem-points-v1-complete.md](2026-04-03-ecosystem-points-v1-complete.md)

## 현재 상태 요약

Ecosystem Points V1 프로덕션 배포 완료. EcoPointsBadge(Pado), EcosystemPointsCard(nasun.io my-account), 리더보드 fetchLimit 수정, 보너스 스크립트 실행(Early Bird + Games USDC), 일별 bonus breakdown API 구현. nasun-website 프로덕션 배포는 아직 미완료 (스테이징 검증 중). 리더보드 V3 디스플레이 네임 소실 문제 발견.

## 완료된 작업

- [x] Pado CSP 수정 + EcoPointsBadge 프로덕션 배포
- [x] Explorer API CORS에 pado.finance 추가
- [x] EcoPointsBadge penalty 상태 표시 + tooltip
- [x] Leaderboard fetchLimit 제거 (activationsCache 기반 필터링) - daily 182->517
- [x] Early Bird 보너스 공식 변경: floor(days * min(tx/days, 20))
- [x] Early Bird 실행 완료 (1,609명, 11,369 pts)
- [x] Games USDC hex->base58 수정 + 실행 완료 (512건)
- [x] settle-pado.ts 풀 사이즈 조정 (50K->5K, top100/rest200)
- [x] EcosystemPointsCard 구현 (score trend, rank chart, daily log)
- [x] bonus-history API 구현
- [x] Score API에 daily/weekly bonus 추가
- [x] allTime을 스냅샷 합산 방식으로 변경 (소급 적용 제거)
- [x] matview에서 wallet-transfer 제외 제거
- [x] wallet-transfer 감지: .commands -> .transactions (Nasun RPC), daysAgo=0
- [x] 카테고리 색상/라벨 추가 (early-bird, games, staking-daily 등)
- [x] my-account 레이아웃 재배치 (Ecosystem Points + Governance 같은 행)
- [x] Refresh 버튼으로 Daily Missions도 갱신 (ecosystem:refresh 이벤트)
- [x] chat-server limit 100->1000 프로덕션 배포
- [x] node-3 crontab 스냅샷 백업 등록
- [x] 11개 커밋 push 완료

## 미완료 작업

- [ ] **nasun-website 프로덕션 배포** (스테이징 검증 완료, 배포만 하면 됨)
- [ ] **미커밋 변경사항 커밋 + push**:
  - `useEcosystemScore.ts` - ecosystem:refresh 이벤트 dispatch
  - `useDailyMissions.ts` - ecosystem:refresh 이벤트 수신
- [ ] **리더보드 V3 디스플레이 네임 소실 문제**
  - X 핸들(GoSun)이 디스플레이 네임(Go Sun) 대신 표시됨
  - generate-snapshot의 stale 감지가 `0x` prefix만 체크하여 핸들 대체를 감지 못함
  - lookupUserProfile 또는 X API에서 displayName이 핸들로 덮어쓰여진 것으로 추정
  - UserProfiles 테이블의 username 필드 확인 필요
- [ ] **Pado 정산**: 퍼블릭 런칭 후 실행
- [ ] **에어드롭**: Genesis 드롭 후 4/16 경 실행
- [ ] **Snapshot backfill 스크립트** 작성 (과거 날짜 스냅샷 소급)
- [ ] **leaderboard-v3-snapshot-schedule** EventBridge 재활성화 완료 (ENABLED)

## 중요 컨텍스트

### 결정사항

- **allTime = 스냅샷 합산**: 현재 multiplier 소급 적용이 아닌, 매일 실제 받은 점수의 합산
- **Early Bird 공식**: `floor(activeDays * min(txCount/activeDays, 20))` - 일평균 TX에 캡 20
- **Pado 정산 보류**: 퍼블릭 런칭 전 테스터만 보상하는 것은 불공평
- **Activity Points 레거시**: 프론트엔드에서 PointsCard 제거, ecosystem points로 일원화
- **wallet-transfer matview 포함**: 하루 1회 감지, 스팸 걱정 불필요 (카테고리당 1점)

### 주의사항

- **Nasun RPC**: `transaction.data.transaction.transactions` (Sui 원본: `.commands`)
- **matview 재생성 시**: postgres 유저로 CREATE 후 `ALTER ... OWNER TO sui_indexer` 필수
- **daily-nft-check**: PM2 restart 시 `lastDailyNftCheckDate` 초기화되어 재실행됨
- **스테이징 Basic Auth**: naru / narunice0000!! (staging.pado.finance)
- **leaderboard-v3-snapshot-schedule**: 방금 ENABLED로 변경함. 원래 DISABLED이었던 이유 확인 필요

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/routes/ecosystem.ts` | Score/Leaderboard/Bonus-history API |
| `api-server/src/scanner/daily-nft-check.ts` | wallet-transfer 감지, alliance penalty, genesis passive |
| `api-server/src/scripts/early-bird-bonus.ts` | Early Bird 소급 보너스 |
| `api-server/src/scripts/settle-pado.ts` | Pado 리더보드 정산 (5K/10K pool) |
| `api-server/src/scripts/settle-games.ts` | Games USDC -> bonus points |
| `api-server/src/db/ecosystem-schema.sql` | matview DDL (wallet-transfer 포함) |
| `nasun-website/.../EcosystemPointsCard.tsx` | my-account 포인트 히스토리 카드 |
| `nasun-website/.../ProfileHeroCard.tsx` | 포인트 공식 표시, 카테고리 색상 |
| `nasun-website/.../DevMyAccountPage.tsx` | 실제 사용되는 my-account 페이지 (MyAccountPage.tsx 아님!) |
| `pado/.../EcoPointsBadge.tsx` | Pado Header 뱃지 |

## 최근 변경 파일 (미커밋)

```
M  apps/nasun-website/frontend/src/hooks/useEcosystemScore.ts  # ecosystem:refresh dispatch
M  apps/nasun-website/frontend/src/hooks/useDailyMissions.ts   # ecosystem:refresh listen
M  apps/nasun-website/frontend/src/features/admin/pages/WhitelistManagement.tsx  # 이전 세션
M  apps/nasun-website/frontend/src/routes/AppRoutes.tsx  # 이전 세션
```

## 즉시 다음 단계

1. 미커밋 변경 커밋 (useEcosystemScore + useDailyMissions refresh 연동)
2. nasun-website 프로덕션 배포
3. 리더보드 V3 디스플레이 네임 문제 조사:
   - UserProfiles 테이블에서 username vs displayName 필드 확인
   - lookupUserProfile 함수가 핸들을 displayName으로 잘못 반환하는지 확인
   - 해결 후 스냅샷 재생성으로 일괄 복구
