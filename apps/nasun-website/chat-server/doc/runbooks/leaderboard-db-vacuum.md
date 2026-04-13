# Runbook: leaderboard.db 위생 점검 (분기 1회)

> **상태**: 분기 위생 작업. 긴급도 P2.
>
> **2026-04-13 결정**: 42분 재시작의 사용자 영향이 P2(WebSocket 자동 재연결, 인덱서 cursor catch-up 빠름)로 판정되어 `max_memory_restart` 256M → 400M로 즉시 완화 (`apps/nasun-website/chat-server/ecosystem.config.cjs`). VACUUM/mmap 작업은 본 런북으로 분기 점검 시 처리.
>
> **실행 전 필독**: 본 문서는 v4 플랜을 런북으로 격하한 것. 실행 전 v4 리뷰의 Critical 4건을 반영해야 안전:
> - **C1**: heredoc PRAGMA 결과 자동 assertion (육안 검증 금지). `result=$(sqlite3 ... 'PRAGMA integrity_check;'); [ "$result" = "ok" ] || { mv "$BAK" "$DB_PATH"; exit 1; }` + `set -euo pipefail`
> - **C2**: 롤백 destination 절대경로화. `DB_PATH="/home/ec2-user/nasun-chat-server/data/leaderboard.db"` 변수 고정
> - **C3**: `export SQLITE_TMPDIR=/home/ec2-user/nasun-chat-server/data` 명시. `df -h`로 5GB 여유 assert를 본문 필수로 승격
> - **C4**: 사용자 영향 재확인. P2 유지면 본 런북, P0/P1로 변하면 별도 긴급 플랜

## 트리거 조건

다음 중 하나 이상 충족 시 본 런북 실행:
- `leaderboard.db` 파일 > 1GB **또는** freelist > 50%
- `nasun-chat-server` RSS가 400MB 임계 근접 (24h 이상 지속)
- 분기 정기 점검 (3개월마다)

## 배경

PM2 `max_memory_restart` 임계 히트 시 `nasun-chat-server` 자동 재시작. 부작용: WebSocket 클라이언트 드롭(자동 재연결), DeepBook 인덱서 catch-up, 로그 노이즈. 사용자 체감 작음.

## 진단 (2026-04-13, prod)

- `leaderboard.db` 2.5GB, freelist 533,104 / 639,928 pages (**83%**)
- 실사용 ~417MB (order_events 180MB + 인덱스 190MB + 집계 50MB)
- `PRAGMA auto_vacuum = 0` (코드는 INCREMENTAL 설정하지만 기존 DB엔 no-op)
- `PRAGMA mmap_size = 0` → 2.5GB 파일이 RSS에 그대로 매핑

### 근본 원인
1. `purgeOldOrderEvents`(매시간)가 DELETE만 하고 공간 회수 없음 → freelist 누적
2. `auto_vacuum` 모드는 VACUUM 시점에만 변경 가능, 기존 DB엔 pragma만 실행 시 no-op
3. mmap 미제한으로 파일 크기가 RSS에 직결

### FAQ
- **INCREMENTAL vs FULL**: FULL은 매 COMMIT마다 freelist 페이지 이동 → insert-heavy 인덱서 I/O 부담. INCREMENTAL은 호출 시점에만.
- **`auto_vacuum = INCREMENTAL` pragma 코드 유지 이유**: 기존 prod DB엔 no-op. **신규 DB(local dev, staging 재생성, DR)에선 필수** — 제거하면 NONE 모드로 태어나 이후 incremental_vacuum이 silent no-op.
- **`cache_size` 건드리지 않는 이유**: RSS 감소 목표와 모순. 기본 2MB가 hot path에 충분.
- **store.ts 제외 이유**: store.ts는 이미 WAL/synchronous 설정 중이며 chat.db는 12MB로 RSS 영향 미미. 범위 확대 회피.

## 계획 (2단계)

### Step 1 (P0): 오프라인 수동 VACUUM — 2.5GB → ~420MB

#### 본문 (4단계)

```bash
# (1) 사용자 공지 — Discord/Telegram "2~5분 점검 시작" + 프론트 토스트
# (2) 백업 (WAL 포함 단일 파일)
BAK="/home/ec2-user/nasun-chat-server/data/leaderboard.db.bak-$(date +%Y%m%d-%H%M%S)"
[ -e "$BAK" ] && { echo "ABORT: backup exists"; exit 1; }
pm2 stop nasun-chat-server
sqlite3 /home/ec2-user/nasun-chat-server/data/leaderboard.db ".backup '$BAK'"
sqlite3 "$BAK" "PRAGMA integrity_check;"   # ok 확인

# (3) VACUUM + 검증
sqlite3 /home/ec2-user/nasun-chat-server/data/leaderboard.db <<'SQL'
PRAGMA wal_checkpoint(TRUNCATE);
PRAGMA auto_vacuum=INCREMENTAL;
VACUUM;
PRAGMA integrity_check;   -- ok
PRAGMA auto_vacuum;       -- 2
PRAGMA journal_mode;      -- wal (자동 복원)
SQL
ls -lh /home/ec2-user/nasun-chat-server/data/leaderboard.db   # ~420MB 확인

# (4) 기동 + baseline 캡처 (hot rollback 비교용)
pm2 start nasun-chat-server
pm2 logs nasun-chat-server --lines 30 --nostream
BASELINE_RESTART=$(pm2 jlist | jq '.[] | select(.name=="nasun-chat-server") | .pm2_env.restart_time')
echo "Baseline restart_time: $BASELINE_RESTART"
```

#### Hot rollback 판정 (15분 윈도, 2지표)
- `PRAGMA integrity_check` 실패 (즉시)
- `(pm2 jlist | jq ...restart_time) > $BASELINE_RESTART` (15분 내 증가)

→ 1개라도 발동 시 **롤백 절차** 실행. RSS/latency 등 간접 지표는 48h 관찰로 이관 (Step 2 관찰).

#### 롤백 절차
```bash
pm2 stop nasun-chat-server
cd /home/ec2-user/nasun-chat-server/data
rm -f leaderboard.db-wal leaderboard.db-shm leaderboard.db   # WAL/SHM 고아 파일 먼저 제거
mv "$BAK" leaderboard.db
sqlite3 leaderboard.db "PRAGMA integrity_check;"
sqlite3 leaderboard.db "SELECT COUNT(*) FROM order_events;"   # 스모크
pm2 start nasun-chat-server
# 이후 /chat/api/leaderboard curl 실패 = P0 incident (Discord/Telegram 알림, 재롤백 무의미)
```

#### 부록: 선택적 안전장치
- **lsof 재시도 루프** (pm2 stop 후 fd 해제 race 방어):
  ```bash
  for i in $(seq 1 10); do
    OPEN=$(lsof /home/ec2-user/nasun-chat-server/data/leaderboard.db* 2>/dev/null)
    [ -z "$OPEN" ] && break
    sleep 1
  done
  [ -n "$OPEN" ] && { echo "ABORT: fd still open"; exit 1; }
  ```
- **사전 환경 확인**: `df -h` (5GB 피크 여유), `command -v sqlite3 || sudo dnf install -y sqlite`
- **local 리허설**: prod `.backup` → scp → `time sqlite3 lb.db "PRAGMA auto_vacuum=INCREMENTAL; VACUUM;"` 로 다운타임 실측

### Step 2 (P0): 코드 — mmap 제한 1줄

[leaderboard-store.ts:27-30](apps/nasun-website/chat-server/src/leaderboard-store.ts#L27-L30) 기존 블록에:

```typescript
db = new Database(config.leaderboardDbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('auto_vacuum = INCREMENTAL');   // 유지 (no-op on existing, required for fresh DB)
db.pragma('mmap_size = 67108864');        // 추가: 64MB cap
```

#### 스모크 테스트 추가
`__tests__/leaderboard-store.test.ts` 신규 (15줄):
```typescript
import Database from 'better-sqlite3';
import { initLeaderboardStore } from '../leaderboard-store.js';
// tmpdir에 새 DB 생성 → init 호출 → PRAGMA 3개 assert
// auto_vacuum == 2, mmap_size >= 67108864, journal_mode == 'wal'
```

#### 에스컬레이션 경로 (24h 내 restart_time 증가 시)

| 단계 | 조치 |
|------|------|
| 1차 | `mmap_size = 33554432` (32MB) 하향 |
| 2차 | `mmap_size = 134217728` (128MB) 상향 (hot data 커버) |
| 3차 | PM2 `max_memory_restart = 400M` 상향 (근본 치료 아님, 안전장치) |

문서화만. 실제 구현은 관찰 후 결정.

## 롤아웃

1. **Local 리허설** — prod DB `.backup` 복사본으로 Step 1 전체 실행, 다운타임 실측
2. **Staging 드라이런** — staging DB에 Step 1 스크립트 전체 실행(작은 DB지만 경로 검증) + Step 2 코드 배포 → `/chat/api/leaderboard` smoke test
3. **Prod 야간 점검창** (KST 새벽) — 공지 → Step 1 → 15분 hot rollback 윈도 → Step 2 코드 배포

## 관찰 (7일)

주간 트래픽 편차(금토일 피크) 포함 위해 7일로 설정. 24h / 72h / 7d 3회 체크포인트.

```bash
# RSS 측정 — pgrep 대신 pm2 jlist 사용 (God daemon 매치 회피)
pm2 jlist | jq '.[] | select(.name=="nasun-chat-server") | {pid, mem: .monit.memory, restart: .pm2_env.restart_time}'
# /proc/$PID/status에서 VmRSS/RssFile/RssAnon 구분 (RssAnon 증가만 heap 누수)
cat /proc/$PID/status | grep -E 'VmRSS|RssFile|RssAnon'
# freelist 추세
sqlite3 leaderboard.db "PRAGMA freelist_count; PRAGMA page_count;"
```

## 성공 기준 (1개)

- [ ] **PM2 `restart_time`이 7일 동안 0 증가** (baseline 대비)

보조 지표 (Step 1 완료 게이트): `PRAGMA integrity_check = ok`, `PRAGMA auto_vacuum = 2`, 파일 ~420MB.

## 영향 범위

| 파일 | 변경 |
|------|------|
| [leaderboard-store.ts](apps/nasun-website/chat-server/src/leaderboard-store.ts) | `mmap_size = 67108864` **1줄 추가** |
| `__tests__/leaderboard-store.test.ts` | 신규 스모크 테스트 (15줄) |
| prod DB 파일 | Step 1 오프라인 VACUUM (파일 크기 축소 + auto_vacuum 모드 전환) |
| store.ts / cron / 앱 로직 | **변경 없음** |

## 검토한 대안 (미채택)

| 대안 | 기각 이유 |
|------|-----------|
| Method B (시작 시 자동 VACUUM) | 기동 블로킹, PM2 재시작 루프 유발 |
| `/chat/health` DB 메트릭 | LB 고빈도 히트에 PRAGMA 오버헤드 |
| `cache_size` 상향 | RSS 목표와 모순 |
| `auto_vacuum` pragma 코드 제거 | 신규 DB에서 NONE 모드 태어남 |
| retention 3→2일 단축 | 실데이터 180MB로 이득 작음 |
| `idx_order_events_ts` 인덱스 제거 | 후속 과제 (쿼리 전수조사 필요) |
| `auto_vacuum = FULL` | insert-heavy OLTP 부적합 |
| DuckDB/PostgreSQL 이관 | 오버엔지니어링 |
| store.ts 동시 수정 | 범위 확대, 후속 리팩토링 |
| Nightly cron `incremental_vacuum` | freelist 알람 연동 설계 부재 시 잊혀질 가능성. 필요 시 별도 런북 |
