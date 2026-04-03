# Handoff: Ecosystem Points V1 - Phase 1-6 완료

**생성**: 2026-04-03 06:40
**브랜치**: main
**이전 핸드오프**: [2026-04-02-ecosystem-points-v1.md](2026-04-02-ecosystem-points-v1.md)
**롤백포인트**: `e36e340b`

## 현재 상태 요약

Ecosystem Points V1 전체 6개 Phase 구현 완료 및 프로덕션 배포 완료. 27개 E2E 테스트 통과. 3건의 프로덕션 이슈 발견 즉시 수정 (matview 권한, .env 누락, INTERVAL SQL 문법). Pado chat-server limit 변경은 커밋만 완료 (Pado 배포 미실행).

## 완료된 작업

### Phase 1: 기반 통합
- [x] 1-1. PointsCard 제거, 단일 Ecosystem Points 표시
- [x] 1-2. Multiplier V1 재설계 (max base + battalion stack, cap 20x)
- [x] 1-3. Per-user sync (POST /ecosystem/sync/:identityId, admin-api 단일 조회, Refresh 버튼)
- [x] 1-4. daily-mission 비활성화, realtime 로직 제거, wallet-transfer RPC 감지

### Phase 2: Base Score 고도화
- [x] 2-1. 스테이킹 일일 점수 (suix_getStakes, 1pt/day)
- [x] 2-2. NumberMatch EVENT_MAP 추가

### Phase 3: Bonus Points 시스템
- [x] 3-1. Bonus Points 인프라 (matview NOT LIKE, Score/Leaderboard API bonus 합산)
- [x] 3-2. settle-pado.ts (주간/월간 정산, Top15+나머지 2-tier)
- [x] 3-3. settle-games.ts (USDC payout -> bonus, 600pt/7d cap)
- [x] 3-4. airdrop-bonus.ts (대량 에어드롭, Genesis tier)
- [x] 3-5. early-bird-bonus.ts (소급: active_days*10 + min(tx,500))

### Phase 4: Daily Snapshot
- [x] ecosystem_score_snapshots 테이블 (bonus_total 포함)
- [x] daily-snapshot.ts (UTC 00:05 자동, ON CONFLICT idempotent)
- [x] Scanner 통합 (matview refresh 후 스냅샷)
- [x] GET /snapshot/history/:identityId API

### Phase 5: Pado 프론트엔드
- [x] EcoPointsBadge 컴포넌트 (Header, wallet 기반)
- [x] GET /score/wallet/:address (wallet -> identityId redirect)
- [x] VITE_EXPLORER_API_URL env 추가

### Phase 6: 리더보드 재구성
- [x] Monthly 기간 추가 (API + 프론트엔드 3-tab)

### E2E 검증
- [x] 27개 테스트 케이스 통과
- [x] matview 권한 수정 (OWNER TO sui_indexer)
- [x] ECOSYSTEM_ACTIVATIONS_URL .env 추가 (node-3)
- [x] INTERVAL SQL 수정 (make_interval)

## 미완료 작업 (다음 세션)

- [ ] **Pado 프론트엔드 빌드 + 배포** (EcoPointsBadge 반영)
  - chat-server limit 100->1000 변경도 배포 필요
  - `pnpm build:pado` + rsync/S3
- [ ] **Early Bird 보너스 실행** (--dry-run 확인 후 실행)
  ```bash
  cd ~/explorer-api && set -a && source .env && set +a
  npx tsx src/scripts/early-bird-bonus.ts --dry-run
  npx tsx src/scripts/early-bird-bonus.ts
  ```
- [ ] **첫 Pado 정산 실행** (첫 스냅샷 저장)
  ```bash
  npx tsx src/scripts/settle-pado.ts --period weekly --dry-run
  ```
- [ ] **첫 Games USDC 정산** (payout이 있는 이벤트 확인)
  ```bash
  npx tsx src/scripts/settle-games.ts --dry-run
  ```
- [ ] **에어드롭 실행** (launch-v1 이벤트)
  ```bash
  npx tsx src/scripts/airdrop-bonus.ts --event-id launch-v1 --dry-run
  ```
- [ ] **Snapshot backfill 스크립트** 작성 + 실행 (과거 날짜 스냅샷 소급)
- [ ] **스냅샷 로컬 백업** 자동화 스크립트
- [ ] Phase 4-6 계획 문서 참조: `apps/nasun-website/docs/ECOSYSTEM_POINTS_V1_PLAN.md`

## 중요 컨텍스트

### 프로덕션 인프라 상태

| 리소스 | 상태 | 비고 |
|--------|------|------|
| Explorer API (node-3, 54.180.61.196) | 정상 운영 | PM2, stale=false, 929 activations |
| matview (ecosystem_daily_scores) | OWNER=sui_indexer | 이전에 postgres 소유, 변경 완료 |
| ecosystem_score_snapshots 테이블 | 생성됨 | 1156 rows (2026-04-01) |
| nasun-website staging | 최신 | 배포 완료 |
| nasun-website production | 최신 | 배포 완료 |
| CDK AdminStack dev/prod | 최신 | 변경 없음 (이전 배포) |

### DB 권한 수정 (수동)

matview 재생성 시 반드시 실행해야 하는 명령:
```sql
ALTER MATERIALIZED VIEW ecosystem_daily_scores OWNER TO sui_indexer;
GRANT SELECT, INSERT ON ecosystem_score_snapshots TO sui_indexer;
```

### node-3 .env 추가 항목 (커밋에 포함되지 않음)

```
ECOSYSTEM_ACTIVATIONS_URL=https://doetwxms5a.execute-api.ap-northeast-2.amazonaws.com/prod/internal/ecosystem-activations
ECOSYSTEM_ACTIVATIONS_API_KEY=4e09b56da946337507b62ec620353638facbe3e40c062d4520314b2e87d433f7
```

### 주의사항

- **postgres.js INTERVAL**: parameterized query에서 `INTERVAL ${var}` 사용 불가. `make_interval(days => N)` 패턴 사용
- **matview REFRESH 권한**: matview OWNER만 REFRESH 가능. `ALTER ... OWNER TO sui_indexer` 필수
- **스냅샷 첫 실행**: 캐시 미로드 상태에서 스냅샷 실행 시 multiplier=0 기록될 수 있음. 캐시 로드 후 실행 보장 (scanLoop 내 순서로 해결됨)
- **weekly > monthly**: 캐시 시점 차이로 일시적 역전 가능. 정상

### 핵심 파일

| 파일 | 역할 |
|------|------|
| `api-server/src/config/ecosystem.ts` | Multiplier V1 공식 |
| `api-server/src/config/points.ts` | staking-daily, numbermatch, BASE_POINTS |
| `api-server/src/routes/ecosystem.ts` | Score/Leaderboard/Sync/Wallet/Snapshot API |
| `api-server/src/scanner/ecosystem-cache.ts` | 12h 캐시 + per-user sync |
| `api-server/src/scanner/daily-nft-check.ts` | Alliance penalty + Genesis passive + Staking daily + Wallet transfer |
| `api-server/src/scanner/daily-snapshot.ts` | 자동 일일 스냅샷 |
| `api-server/src/scanner/points-scanner.ts` | scanLoop 통합 (스냅샷 호출 포함) |
| `api-server/src/scripts/settle-pado.ts` | Pado 리더보드 정산 |
| `api-server/src/scripts/settle-games.ts` | Games USDC 정산 |
| `api-server/src/scripts/airdrop-bonus.ts` | 에어드롭 스크립트 |
| `api-server/src/scripts/early-bird-bonus.ts` | Early Bird 소급 |
| `api-server/src/db/ecosystem-schema.sql` | matview DDL |
| `api-server/src/db/snapshot-schema.sql` | snapshot 테이블 DDL |
| `pado/frontend/src/components/layout/EcoPointsBadge.tsx` | Pado Header 위젯 |
| `nasun-website/frontend/src/hooks/useEcosystemScore.ts` | Score hook (refresh 포함) |
| `nasun-website/frontend/src/hooks/useEcosystemStatus.ts` | Activation hook (sync 연동) |

## 즉시 다음 단계

1. Pado 프론트엔드 빌드 + 배포 (EcoPointsBadge + chat-server limit 반영)
2. Early Bird 보너스 --dry-run 실행
3. 에어드롭 --dry-run 확인 후 실행 여부 결정
4. Snapshot backfill 스크립트 작성 (과거 matview 데이터 기반)
5. 주간 정산 자동화 검토 (cron 또는 EventBridge)
