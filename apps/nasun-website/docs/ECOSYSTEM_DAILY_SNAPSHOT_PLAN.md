# Plan: Daily Ecosystem Score Snapshot

## Context

현재 ecosystem score는 materialized view 기반 실시간 집계만 존재한다. devnet 리셋이나 multiplier 공식 변경 시 과거 점수 복원이 불가능하고, 토큰 할당 근거 데이터가 없다. 매일 UTC 자정에 모든 등록 사용자의 ecosystem score를 immutable 테이블에 확정 기록하고, 서버 + 로컬 백업을 구성한다.

## 설계 결정

- **스냅샷 시점**: UTC 날짜 변경 + 5분 grace period 후, 전날(yesterday) 스코어를 스냅샷
- **트리거**: Scanner scanLoop() 내 date check (daily-nft-check.ts와 동일 패턴)
- **호출 위치**: matview refresh 블록(L173) 이후 (전날 마지막 activity가 matview에 반영된 후)
- **Rank 계산**: App에서 sort 후 rank 포함하여 INSERT (UPDATE 불필요)
- **Idempotency**: `ON CONFLICT (identity_id, snapshot_date) DO NOTHING`
- **Advisory lock 없음**: PM2 fork mode, instances=1이므로 불필요. `isScanning` 플래그 + date 비교로 1회 실행 보장
- **Immutability trigger 없음**: ON CONFLICT DO NOTHING + 운영 규율로 충분. 테이블 COMMENT로 immutable 의도 명시
- **Cumulative 미저장**: `SUM(base_score)`, `SUM(ecosystem_score)` 쿼리로 계산 (141명 x 365행 < 1ms)
- **Backfill**: 현재 multiplier로 best-effort 기록, `is_backfilled=TRUE`로 표시

## 구현 단계

### Step 1: Schema DDL

**새 파일**: `apps/network-explorer/api-server/src/db/snapshot-schema.sql`

```sql
CREATE TABLE IF NOT EXISTS ecosystem_score_snapshots (
  identity_id     TEXT NOT NULL,
  snapshot_date   DATE NOT NULL,
  base_score      INT NOT NULL DEFAULT 0,
  multiplier      NUMERIC(5,2) NOT NULL DEFAULT 0,
  ecosystem_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_penalized    BOOLEAN NOT NULL DEFAULT FALSE,
  rank            INT,                    -- NULL = disabled (multiplier=0)
  is_backfilled   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (identity_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_date_rank
  ON ecosystem_score_snapshots(snapshot_date, rank);

CREATE INDEX IF NOT EXISTS idx_snapshot_identity_date
  ON ecosystem_score_snapshots(identity_id, snapshot_date DESC);

COMMENT ON TABLE ecosystem_score_snapshots IS
  'Immutable daily snapshots. Rows must never be UPDATEd or DELETEd. Token allocation basis.';
```

기존 대비 변경:
- `activations_json` 제거 (NFT 상태는 DynamoDB에서 이미 추적)
- `cumulative_base`, `cumulative_eco` 제거 (SUM() 쿼리로 계산)
- Immutability trigger 제거 (ON CONFLICT DO NOTHING + COMMENT으로 충분)
- `is_backfilled` 추가 (backfill 데이터 식별)
- Index DDL 완전 명시

### Step 2: Scanner Module

**새 파일**: `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts`

`takeDailySnapshot(yesterdayStr, activationsCache)`:

1. 이미 스냅샷 존재 확인 (`SELECT 1 FROM ... WHERE snapshot_date = $1 LIMIT 1`) -> skip if exists
2. 전날 base_score 조회 (matview WHERE day = yesterday)
3. Alliance penalty 일괄 조회 (`SELECT identity_id FROM alliance_penalties WHERE identity_id = ANY($1)` -- 기존 leaderboard 패턴 재사용)
4. 각 사용자별:
   - activations에서 penalty 반영 후 `calculateMultiplier()` 호출
   - ecosystem_score = base_score * multiplier
5. ecosystem_score DESC 정렬, multiplier > 0인 사용자만 rank 부여
6. Batch INSERT with ON CONFLICT DO NOTHING
7. 로그: `[Snapshot] {count} users snapshotted for {yesterdayStr}`

**재사용 함수**:
- `calculateMultiplier()` from `apps/network-explorer/api-server/src/config/ecosystem.ts`
- `getActivationsCacheMap()` from `apps/network-explorer/api-server/src/scanner/ecosystem-cache.ts`
- `maybeRefreshMatview()` -- 호출하지 않음 (scanLoop에서 이미 refresh 완료 후 호출되므로)

**스냅샷 대상**: activationsCache에 등록된 모든 사용자 + matview에 전날 activity가 있는 사용자 (합집합)

### Step 3: Scanner 통합

**수정 파일**: `apps/network-explorer/api-server/src/scanner/points-scanner.ts`

- 새 변수: `let lastSnapshotDate = '';`
- **호출 위치**: matview refresh 블록(L173) 이후, `} catch` 직전
- 5분 grace period: UTC 자정 후 5분 이상 경과 시에만 실행

```typescript
// Daily ecosystem snapshot (after matview is fresh, with 5min grace)
const utcMinutes = new Date().getUTCMinutes();
if (todayStr !== lastSnapshotDate && utcMinutes >= 5) {
  try {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await takeDailySnapshot(
      yesterday.toISOString().slice(0, 10),
      getActivationsCacheMap(),
    );
    lastSnapshotDate = todayStr;
  } catch (err) {
    console.error('[Snapshot] Error (non-fatal):', (err as Error).message);
    // lastSnapshotDate not updated -> retry next loop
  }
}
```

- PM2 재시작 시 불필요한 재실행 방지: `takeDailySnapshot` 내부의 존재 확인으로 처리 (startup DB check 대신 단순성 우선)

### Step 4: API Endpoints

**수정 파일**: `apps/network-explorer/api-server/src/routes/ecosystem.ts`

3개 엔드포인트 추가 (등록 순서 주의: static path 먼저):

```
GET /snapshot/leaderboard?date=YYYY-MM-DD&limit=50&offset=0
GET /snapshot/history/:identityId?days=30
GET /snapshot/user/:identityId?date=YYYY-MM-DD
```

- Route 충돌 방지: `/snapshot/user/:identityId` 사용 (`/snapshot/:identityId` 대신)
- Date 파라미터 검증: `/^\d{4}-\d{2}-\d{2}$/` regex + 미래 날짜 거부 + 합리적 시작일 제한
- Days 파라미터 검증: `Math.min(Math.max(1, parseInt(days)), 90)` (기존 parseLimit 패턴)
- 캐시: 5분 TTL (immutable 데이터이므로 더 긴 TTL도 가능하지만 기존 패턴 유지)
- Cumulative 응답: `SUM(base_score)`, `SUM(ecosystem_score)` 쿼리로 계산하여 반환

### Step 5: Backfill Script

**새 파일**: `apps/network-explorer/api-server/src/scripts/backfill-snapshots.ts`

- matview에서 전체 데이터 조회: `SELECT identity_id, day, base_score FROM ecosystem_daily_scores ORDER BY day ASC`
- 각 날짜별로 현재 activationsCache의 multiplier 적용 (best-effort)
- `is_backfilled = TRUE`로 INSERT
- API에서 backfilled 데이터는 leaderboard 제외 가능
- 실행: `cd ~/explorer-api && npx tsx src/scripts/backfill-snapshots.ts`

### Step 6: Local Backup Script

**새 파일**: `apps/network-explorer/api-server/scripts/backup-snapshots.sh`

```bash
#!/bin/bash
set -euo pipefail

# Config from environment or defaults
: "${NASUN_NODE3_KEY:=$HOME/.ssh/.awskey/nasun-devnet-key.pem}"
: "${NASUN_NODE3_HOST:=ubuntu@54.180.61.196}"
: "${BACKUP_DIR:=$HOME/nasun-backups/snapshots}"

DATE=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "Backing up ecosystem_score_snapshots..."
ssh -i "$NASUN_NODE3_KEY" "$NASUN_NODE3_HOST" \
  "pg_dump -U postgres -d nasun_points -t ecosystem_score_snapshots | gzip" \
  > "$BACKUP_DIR/snapshots-${DATE}.sql.gz"

SIZE=$(du -h "$BACKUP_DIR/snapshots-${DATE}.sql.gz" | cut -f1)
echo "Saved: $BACKUP_DIR/snapshots-${DATE}.sql.gz ($SIZE)"

# Keep last 30 backups
ls -1t "$BACKUP_DIR"/snapshots-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm
echo "Done. $(ls "$BACKUP_DIR"/snapshots-*.sql.gz 2>/dev/null | wc -l) backups retained."
```

- 환경변수로 SSH 키/호스트 관리 (하드코딩 방지)
- `scripts/` 디렉토리를 `.gitignore`에 추가

## 핵심 수정 파일

| 파일 | 작업 |
|------|------|
| `api-server/src/db/snapshot-schema.sql` | CREATE -- 테이블 DDL |
| `api-server/src/scanner/daily-snapshot.ts` | CREATE -- 스냅샷 로직 (~80줄) |
| `api-server/src/scanner/points-scanner.ts` | MODIFY -- import + ~10줄 추가 |
| `api-server/src/routes/ecosystem.ts` | MODIFY -- 3개 엔드포인트 + date 검증 |
| `api-server/src/scripts/backfill-snapshots.ts` | CREATE -- 1회성 backfill |
| `api-server/scripts/backup-snapshots.sh` | CREATE -- 로컬 백업 |

## 배포 순서

1. 코드 작성 (Step 1-6)
2. node-3에서 `psql -U postgres -d nasun_points -f snapshot-schema.sql` 실행
3. Explorer API rsync + PM2 restart
4. Backfill 스크립트 실행 (과거 데이터 best-effort 채우기)
5. Local backup 스크립트 테스트 실행
6. 초기 로컬 백업 1회 수행

## 검증

1. DDL 적용 확인: `\d ecosystem_score_snapshots` (node-3 psql)
2. Backfill 확인: `SELECT COUNT(*), snapshot_date FROM ecosystem_score_snapshots GROUP BY snapshot_date ORDER BY snapshot_date DESC LIMIT 5;`
3. PM2 로그에서 `[Snapshot]` 로그 확인 (다음 UTC 자정 + 5분 후)
4. API 테스트:
   - `curl .../ecosystem/snapshot/leaderboard?date=YYYY-MM-DD`
   - `curl .../ecosystem/snapshot/user/{identityId}`
   - `curl .../ecosystem/snapshot/history/{identityId}?days=30`
5. Local backup 파일 생성 + 크기 확인
