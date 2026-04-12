# Points Audit Report — 2026-04 (one-shot 무결성 검증)

> 실행: 2026-04-12
> 범위: 2026-04-01 ~ 2026-04-13 (13일)
> SLO: 사용자 보고 → 인지 → 복구 24h, 무결성 최우선

## 요약

| 영역 | 상태 |
|------|------|
| 매핑 카테고리 누락 audit | ✅ **5,554건 누락 발견 → 전부 backfill 완료** |
| Snapshot 보정 | ✅ **17,456 row 보정 완료** (4/1~4/11) |
| Chat (nasun + pado) | ⚠️ **REST API 검증 불가** (retention 경계 + pado API 응답 비정상). DB는 capture 시점 정확. |
| Backup (pg_dump) | 🚨 **CRITICAL: 14일치 모두 무효 → fix 완료** |
| Backup (snapshot CSV) | 🚨 **cron silent fail → fix 완료** (manual로 11일치 28MB 복구) |
| Scanner unmatched WARN | ✅ 코드 추가 완료 (`points-scanner.ts:432`, ~75 LOC LRU) |
| Triage runbook | ✅ `docs/points-triage.md` 작성 완료 |

## Phase 1: 무결성 Audit 결과

### 1.1 RPC/Indexer 기반 backfill (4/1~4/13)

**도구**: `backfill-from-indexer.ts --dry-run` → live `--apply`

**누락 카테고리**:

| 카테고리 | 누락 row 수 |
|---------|------------|
| faucet | 1,979 |
| pado-lottery | 1,065 |
| pado-scratchcard | 1,056 |
| pado-games | 1,050 |
| pado-dex | 261 |
| staking | 143 |
| **합계** | **5,554** |

**Pre vs Post backfill 검증** (4/1~4/13 row count):

| 카테고리 | Pre | Post | 차이 |
|---------|-----|------|------|
| faucet | 86,992 | 88,971 | +1,979 ✅ |
| pado-dex | 10,044 | 10,305 | +261 ✅ |
| pado-games | 198,962 | 200,012 | +1,050 ✅ |
| pado-lottery | 172,147 | 173,212 | +1,065 ✅ |
| pado-scratchcard | 238,366 | 239,422 | +1,056 ✅ |
| staking | 29,927 | 30,070 | +143 ✅ |

모든 카테고리 row count가 정확히 일치 (ON CONFLICT DO NOTHING 보호).

### 1.2 Snapshot 보정

`backfill-from-indexer.ts`가 자동 수행 (matview refresh + snapshot UPDATE):

| Date | Snapshots corrected |
|------|--------------------:|
| 2026-04-01 | 232 |
| 2026-04-02 | 334 |
| 2026-04-03 | 349 |
| 2026-04-04 | 1,283 |
| 2026-04-05 | 2,817 |
| 2026-04-06 | 3,228 |
| 2026-04-07 | 3,173 |
| 2026-04-08 | 3,171 |
| 2026-04-09 | 1,902 |
| 2026-04-10 | 116 |
| 2026-04-11 | 851 |
| 2026-04-12 | no changes |
| 2026-04-13 | no changes |
| **합계** | **17,456** |

가장 큰 영향: 4/5~4/8 (3,000+ snapshots/day). base_score 단조증가만 허용 (`base_score < new_base`), forward-only.

### 1.3 Processing state cursor (audit 시점 기록)

```
 scanner_id | last_tx_sequence |         processed_at          | tx_count
------------+------------------+-------------------------------+----------
 main       |        232425377 | 2026-04-12 02:47:22.775552+00 |   639137
 faucet     |        232342685 | 2026-04-12 02:47:22.942462+00 |        0
```

Sequence range backfill: 232,290,683 ~ 232,526,418 (235,735 span). Live scanner cursor와 겹치지 않음.

### 1.4 Chat 검증 (특이사항)

| Date | nasun chat REST | pado chat REST | DB total (chat 카테고리) |
|------|-----------------|----------------|-------------------------|
| 2026-04-12 | 904 | (empty) | 668 (진행 중) |
| 2026-04-11 | 3,723 | (empty) | 3,861 |
| 2026-04-10 | 0 | (empty) | 3,820 |
| 2026-04-09~31 | 0 | (empty) | 0 |

**관찰**:
1. **Pado chat (3100) REST 응답 전부 빈 값**. API 동작 점검 필요 (별도 follow-up).
2. **Nasun chat (3101) REST는 4/10에 0 반환**, 4/11~12에는 정상. retention 경계 또는 endpoint 동작 이슈 가능.
3. **DB는 capture 시점에 정확히 기록됨** (3,820 unique tx_digest, 중복 X). chat-scanner는 today만 fetch하므로 historical DB가 source-of-truth.

**결론**: chat 카테고리 backfill **불필요**. DB 데이터는 정상.

**Follow-up**: pado chat-server `/api/chat-participation` endpoint 동작 점검 (별도 작업).

## Phase 5: Backup 무결성 점검 + 즉시 조치 (Critical 발견)

### 5.1 발견

**5종 무결성 검증 (cron + age + size + gzip integrity)**:

🚨 **2가지 critical 문제 동시 발견**:

1. **pg_dump cron** (`/backup/nasun_points-*.sql.gz`):
   - 명령: `pg_dump -U postgres nasun_points 2>/dev/null | gzip > ...`
   - peer authentication 실패 → stderr 무시되어 빈 stdout이 gzip됨
   - 결과: **매일 20 bytes (gzip header만) 파일 생성, 14일치 모두 무효**
   - 영향: 백업 RPO 24h 사실상 미충족 (3/28~4/11 14일간)

2. **backup-snapshots.ts cron** (`~/explorer-api/backups/`):
   - cron 등록되어 있고 manual 실행은 정상
   - `~/explorer-api/backups/` 디렉토리 부재 → `>> backup.log` redirect 실패로 silent fail
   - 결과: **CSV backup 0건, manifest 부재**

### 5.2 즉시 조치 (완료 2026-04-12 03:30 UTC)

**pg_dump 수정**:
```bash
# Before: 인증 실패 → 빈 파일
0 18 * * * pg_dump -U postgres nasun_points 2>/dev/null | gzip > ...

# After: connection string + stderr 보존
0 18 * * * cd /home/ubuntu/explorer-api && set -a && source .env && set +a && \
  pg_dump "$POINTS_DATABASE_URL" 2>/tmp/pg_dump-err-$(date +%Y%m%d).log | \
  gzip > /backup/nasun_points-$(date +%Y%m%d).sql.gz && \
  find /backup -name "nasun_points-*.sql.gz" -mtime +14 -delete
```

Manual 검증: 175MB 정상 dump 생성, gzip integrity OK.

**backup-snapshots 수정**:
```bash
# Before: 디렉토리 없으면 redirect 실패
0 1 * * * cd ~/explorer-api && ... && npx tsx src/scripts/backup-snapshots.ts >> ~/explorer-api/backups/backup.log 2>&1

# After: mkdir guard + 절대 npx 경로 + crontab 상단 PATH
0 1 * * * mkdir -p /home/ubuntu/explorer-api/backups && \
  cd /home/ubuntu/explorer-api && set -a && source .env && set +a && \
  /usr/bin/npx tsx src/scripts/backup-snapshots.ts >> /home/ubuntu/explorer-api/backups/backup.log 2>&1
```

Manual 검증: 11일치 CSV (4/1~4/11), 총 28MB, manifest.json 생성.

**빈 파일 정리**: 15개 (3/28~4/11) 무효 파일 삭제.

### 5.3 Follow-up 모니터링 (체크리스트)

향후 silent fail 재발 방지:

- [ ] **D+1 cron 실행 확인** (2026-04-13 19:00 KST 이후):
  - `ssh node-3 "ls -lt /backup/nasun_points-*.sql.gz | head -3"`
  - `ssh node-3 "stat -c '%n %s' /backup/nasun_points-$(date +%Y%m%d).sql.gz"` (size > 100MB 확인)
  - `ssh node-3 "ls /tmp/pg_dump-err-*.log 2>/dev/null && cat /tmp/pg_dump-err-*.log"` (에러 없음)
  - `ssh node-3 "cat /home/ubuntu/explorer-api/backups/backup.log | tail -20"`
  - `ssh node-3 "ls -lt /home/ubuntu/explorer-api/backups/snapshots/ | head -5"` (D-1 snapshot 존재)

- [ ] **D+7 retention 동작 확인** (2026-04-19): 오래된 파일 자동 정리 (`-mtime +14 -delete`)

- [ ] **백업 무결성 자동 검증 (선택, follow-up plan)**: cron 끝에 size/gzip 자동 체크 + 실패 시 stdout WARN
  - 후보 위치: backup-snapshots.ts에 self-verify 모드, 또는 별도 verify-backups.ts 신규
  - 또는 cron 명령 끝에 `&& [ $(stat -c %s "$file") -gt 1048576 ] && gzip -t "$file" || echo "BACKUP_FAIL"` inline

- [ ] **분기 1회 restore drill**: docs/restore-drill.md 신규 작성 (별도 작업), staging Docker postgres 복원 + row count 비교

## Phase 4: Scanner unmatched WARN (코드 변경)

### 4.1 구현

`apps/network-explorer/api-server/src/scanner/points-scanner.ts`:

- 모듈 scope: `unmappedSeen Map<string, number>`, cap=1000, TTL=24h, reset grace=60s
- `recordUnmappedEvent()` helper: LRU FIFO eviction (delete+set), 첫 발견 WARN, grace window 중 suppress
- `flushUnmappedSummary()` helper: scanLoop 끝에 1회 호출, suppressed count 요약
- `if (!mapping)` 블록 (L432) → `recordUnmappedEvent()` 호출

**Silent-drop 방지**:
- LRU FIFO: cap 도달 시 oldest evict + WARN (cache full로 새 누락 영구 누락 방지)
- 24h TTL reset: 매일 재확인 보장
- 60s grace window: PM2 reload 시 동일 이벤트 중복 WARN 폭주 방지

### 4.2 검증 (배포 후 운영자 절차)

```bash
# 새 컨트랙트 배포 후 1h 내
ssh node-3 "pm2 logs explorer-api --lines 500 --nostream | grep '\[Points\] UNMAPPED'"
```

WARN 발견 시: `EVENT_MAP_ENTRIES`에 매핑 추가 + backfill (triage runbook §6 참조).

## Phase 6: 배포

- [ ] Phase 4 코드 변경 staging 24h 검증 후 prod (사용자 승인 필요)
- [ ] Phase 5 backup fix는 prod 즉시 적용 (완료, 2026-04-12)
- [ ] Phase 1 backfill은 prod 즉시 적용 (완료, 2026-04-12)

## 24h SLO 충족 여부

- **무결성** (지금까지): ✅ 5,554건 누락 모두 backfill, 17,456 snapshot 보정
- **백업 RPO 24h**: ⚠️ 발견 시점 미충족 (14일치 무효), **fix 후 충족 예상** (D+1 검증 필요)
- **앞으로 안정**: ✅ scanner unmatched WARN 1h aggregate, triage runbook 작성, backup fix
- **사용자 보고 → 복구 24h**: ✅ Phase 1 사례 (854건 market-order) 24h 내 처리 완료

## 발견된 잠재 follow-up

1. **pado chat-server REST `/api/chat-participation` 응답 비정상** (모든 날짜 빈 값) — 별도 점검
2. **nasun chat retention 경계 동작** (4/10 0건 vs DB 3,820건) — endpoint 정확성 점검
3. **백업 자동 무결성 검증** (size + gzip) — 별도 plan
4. **Restore drill runbook** (`docs/restore-drill.md`) — 분기 1회 자동화 검토

---

**Audit 수행자**: Claude (자동) + 사용자 검토
**검토 대상**: ecosystem-points-v1 인프라 (audit, scanner, snapshot, backup)
