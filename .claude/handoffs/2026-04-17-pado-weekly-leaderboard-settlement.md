# Handoff: Pado Score Leaderboard 주간 리셋 + Ecosystem Points 정산 파이프라인

**생성**: 2026-04-17 06:30
**브랜치**: main
**이전 핸드오프**: 없음 (신규 기능 구현)

## 현재 상태 요약

Pado Score Leaderboard를 All-time에서 주간 리셋 모델로 전환하고, 매주 월요일 00:10 UTC에 자동으로 Ecosystem Points를 정산하는 파이프라인을 구축했다. 모든 코드 변경 및 배포 완료. 커밋은 아직 하지 않은 상태.

## 완료된 작업

- [x] `identity-resolver.ts` 신규 생성 (wallet->identityId DynamoDB 캐시, 1h TTL, invalidate endpoint)
- [x] `pado-idea-api.ts` - resolveIdentityId를 identity-resolver로 위임
- [x] `store.ts` - `gp_checked_at` 컬럼 마이그레이션, Genesis Pass 24h TTL 캐시
- [x] `server.ts` - checkGenesisPass TTL 로직, `/api/internal/cache/invalidate` endpoint, INTERNAL_API_KEY static import 수정
- [x] `leaderboard-store.ts` - `trader_points_weekly` 테이블, ISO week 유틸, 주간 집계 함수들. `weekly_score_snapshots` SQLite 테이블 제거 (PG로 이전)
- [x] `leaderboard-types.ts` - POINTS 상수 변경 (PER_1K_PNL: 100, PER_10PCT_RETURN: 50, 감점 로직), ScoreScope 확장
- [x] `aggregator.ts` - `runWeeklyScoreAggregation()`, `checkWeeklySnapshot()` 제거 (API 기반 분리로 불필요)
- [x] `leaderboard-api.ts` - `GET /api/pado/internal/weekly-scores/:weekId` 내부 API 추가, score endpoint weekly 기반 전환
- [x] `settle-pado.ts` 완전 재작성 - SQLite 제거, chat-server API 호출, PG에 weekly_score_snapshots + activity_points 원자적 기록
- [x] 프론트엔드 - ScoreScope 타입 확장, useScoreLeaderboard 기본값 weekly, LeaderboardPage 리셋 공백 UI
- [x] network-explorer TS 에러 수정 (TransactionSql, @ts-expect-error, TS7022, tsconfig types:node)
- [x] prod chat-server 빌드 + 배포 + 재시작 (43.200.67.52)
- [x] node-3 explorer-api 빌드 + 배포 + 재시작 (54.180.61.196)
- [x] node-3 crontab 등록: 매주 월요일 00:10 UTC `settle-pado --week auto`
- [x] INTERNAL_API_KEY 양쪽 .env에 추가
- [x] 포인트 구간 확정: 1위=50, 2위=40, 3위=30, 4-50위=15, 51-100=10, 101-200=6, 201-300=5, 301-400=2, 401-500=1 (GP 2x)

## 미완료 작업

- [ ] **git commit** - 모든 변경사항 커밋 필요 (아직 unstaged 상태)
- [ ] **pado frontend 배포** - leaderboard types.ts, useLeaderboard.ts, LeaderboardPage.tsx 변경사항 프로덕션 반영 필요
- [ ] **staging 검증** - pado frontend를 스테이징에 먼저 배포하고 검증 후 프로덕션
- [ ] **워시 트레이딩 필터 미완성** - `sameIdentityPairs`가 `aggregator.ts`에서 로드되지만 `aggregateTraderVolume`에 아직 전달 안 됨 (주석 처리됨). 다음 iteration에서 구현 예정.

## 중요 컨텍스트

### 아키텍처 결정사항

- **weekly_score_snapshots 위치**: SQLite(chat-server)가 아닌 PostgreSQL(nasun_points DB, node-3)에 저장. chat-server가 API를 통해 주간 집계 데이터를 제공하고, settle-pado가 PostgreSQL에 정산 상태 기록.
- **분리 원칙**: chat-server는 "집계/랭킹 계산" 담당, settle-pado(node-3)는 "정산/포인트 지급" 담당. VPC 분리 환경에서 HTTP API로 통신.
- **GPT 2x 적용 시점**: 리더보드 순위에는 반영 안 함. settle-pado 정산 시점에만 적용.
- **감점 로직**: pnl_percent <= -20% 시 20pt 감점, floor 0. 주간 Pado Score 내부에서만 적용, Ecosystem Points에는 반영 안 됨.

### 인프라 현황

| 서버 | 역할 | 키 |
|------|------|-----|
| 43.200.67.52 (prod, nasun-prod 프로필) | chat-server (PM2), pado-bots | `~/.ssh/.awskey/nasun-prod-key` |
| 54.180.61.196 (node-3, nasun-dlt 프로필) | explorer-api (PM2), settle-pado | `~/.ssh/.awskey/nasun-devnet-key.pem` |
| 15.165.19.180 (staging, default 프로필) | staging chat-server | `~/.ssh/.awskey/naru_seoul.pem` |

**prod chat-server 배포 방법**:
```bash
# 소스 파일 rsync
rsync -avz -e "ssh -i ~/.ssh/.awskey/nasun-prod-key" apps/nasun-website/chat-server/src/ ec2-user@43.200.67.52:~/nasun-chat-server/src/
# 원격 빌드
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 "cd ~/nasun-chat-server && npm run build"
# 재시작
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 "pm2 restart nasun-chat-server --update-env"
```

**node-3 explorer-api 배포 방법**:
```bash
rsync -avz -e "ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem" apps/network-explorer/api-server/src/ ubuntu@54.180.61.196:~/explorer-api/src/
ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 "cd ~/explorer-api && ./node_modules/.bin/tsc && pm2 restart explorer-api --update-env"
```

### 주의사항

- **prod chat-server build**: `npm run build`는 `tsc` 직접 호출. node-3은 `./node_modules/.bin/tsc` 사용해야 함 (`tsc` PATH에 없음).
- **weekly_score_snapshots DDL**: settle-pado.ts 내에 `CREATE TABLE IF NOT EXISTS` 포함. 최초 실행 시 자동 생성.
- **settle-pado 최초 실행**: 2026-W16 종료(일요일 23:59) 후 월요일 00:10 UTC cron 자동 실행. 그 전에는 `trader_points_weekly`에 해당 주 데이터가 없어 0 traders 반환.
- **INTERNAL_API_KEY**: prod `.env`와 node-3 `.env` 양쪽에 동일한 값 설정 완료. 키 값은 환경변수로 관리, 여기에 기록 안 함.
- **현재 주 (2026-W16) 요청 차단**: chat-server internal API는 현재 진행 중인 주(`currentWeekId`) 요청 시 403 반환.

### 핵심 파일 위치

| 파일 | 역할 |
|------|------|
| `apps/nasun-website/chat-server/src/identity-resolver.ts` | 신규: wallet->identityId 캐시 |
| `apps/nasun-website/chat-server/src/leaderboard-store.ts` | trader_points_weekly 테이블, ISO week 유틸 |
| `apps/nasun-website/chat-server/src/aggregator.ts` | runWeeklyScoreAggregation |
| `apps/nasun-website/chat-server/src/leaderboard-api.ts` | /api/pado/internal/weekly-scores/:weekId |
| `apps/network-explorer/api-server/src/scripts/settle-pado.ts` | 정산 스크립트 (node-3) |
| `apps/pado/frontend/src/pages/LeaderboardPage.tsx` | 리셋 공백 UI 처리 |

## 최근 변경 파일

```
modified:   apps/nasun-website/chat-server/src/aggregator.ts
modified:   apps/nasun-website/chat-server/src/leaderboard-api.ts
modified:   apps/nasun-website/chat-server/src/leaderboard-store.ts
modified:   apps/nasun-website/chat-server/src/leaderboard-types.ts
modified:   apps/nasun-website/chat-server/src/pado-idea-api.ts
modified:   apps/nasun-website/chat-server/src/server.ts
modified:   apps/nasun-website/chat-server/src/store.ts
modified:   apps/network-explorer/api-server/src/db/ecosystem-matview-migration.ts
modified:   apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts
modified:   apps/network-explorer/api-server/src/scripts/backfill-dex.ts
modified:   apps/network-explorer/api-server/src/scripts/settle-pado.ts
modified:   apps/network-explorer/api-server/tsconfig.json
modified:   apps/pado/frontend/src/features/leaderboard/hooks/useLeaderboard.ts
modified:   apps/pado/frontend/src/features/leaderboard/types.ts
modified:   apps/pado/frontend/src/pages/LeaderboardPage.tsx
untracked:  apps/nasun-website/chat-server/src/identity-resolver.ts
```

## 즉시 다음 단계

1. **git commit** - 모든 변경사항을 하나의 커밋으로:
   ```bash
   git add apps/nasun-website/chat-server/src/ apps/network-explorer/api-server/ apps/pado/frontend/src/features/leaderboard/ apps/pado/frontend/src/pages/LeaderboardPage.tsx
   git commit -m "feat(pado): implement weekly score leaderboard reset and ecosystem points settlement pipeline"
   ```

2. **pado frontend 스테이징 배포** 및 검증:
   - leaderboard score 탭이 'weekly' 기본값으로 표시되는지 확인
   - 주간 리셋 공백 메시지 ("Week just started - check back soon") 동작 확인

3. **pado frontend 프로덕션 배포** (스테이징 검증 후)

4. **워시 트레이딩 필터 구현** - `aggregator.ts`의 `runWeeklyScoreAggregation()`에서 `sameIdentityPairs`를 `aggregateTraderVolume`에 전달하는 로직 완성
