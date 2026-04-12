# Handoff: Ecosystem Points 무결성 Audit + 안정화 — Follow-up

**생성**: 2026-04-12 12:40 KST (03:40 UTC)
**브랜치**: main
**이전 핸드오프**: [2026-04-12-pado-dex-market-order-backfill.md](.claude/handoffs/2026-04-12-pado-dex-market-order-backfill.md)
**관련 plan**: [/home/naru/.claude/plans/swift-hatching-platypus.md](/home/naru/.claude/plans/swift-hatching-platypus.md)

## 현재 상태 요약

Ecosystem points 시스템 무결성 audit + 안정화 작업 완료. 2026-04-01~04-13 기간 5,554건 누락 backfill, 17,456 snapshot 보정, scanner unmatched WARN 코드 배포, backup cron 2개 critical fix 완료. 본 plan의 핵심 작업은 모두 끝났고, 남은 follow-up은 D+1 백업 검증 및 별도 작업으로 분리된 4건이다.

## 완료된 작업

- [x] Phase 0: 사실 확인 (wallet-transfer source, chat retention, --dry-run flag, daily-nft-check digest, points-scanner L432, PM2 fork mode 등)
- [x] Phase 1: backfill-from-indexer.ts --dry-run audit (4/1~4/13)
- [x] Phase 2: live backfill (5,554건 INSERT + 17,456 snapshot 보정)
  - faucet 1979, pado-lottery 1065, pado-scratchcard 1056, pado-games 1050, pado-dex 261, staking 143
- [x] Phase 3: chat 4/10 불일치 조사 → DB가 source-of-truth, REST API retention/응답 이슈로 비신뢰
- [x] Phase 4: scanner unmatched WARN ~75 LOC 추가 ([points-scanner.ts:432](apps/network-explorer/api-server/src/scanner/points-scanner.ts#L432))
  - LRU Map (delete+set) + cap 1000 + 24h TTL + 60s reset grace window
  - FIFO eviction WARN, trailing summary
- [x] Phase 4.1: docs/points-triage.md 작성 (보고 처리 runbook, 8 sections)
- [x] Phase 5: backup 무결성 점검 → **2가지 critical 발견 + 즉시 fix**
  - pg_dump cron: peer auth 실패로 14일치 모두 빈 gzip → connection string 변경, 175MB 정상 dump
  - backup-snapshots cron: silent fail → mkdir -p guard + 절대 npx 경로, 11일치 28MB 복구
  - 빈 파일 15개 정리, 새 crontab 설치 완료
- [x] Phase 3: docs/points-audit-2026-04.md 작성 (audit 결과 + backup fix + chat 특이사항)
- [x] Phase 6: prod 배포 (commit `9c08825f` push + node-3 rsync + PM2 restart, health check OK)

## 미완료 작업 (Follow-up)

### D+1 백업 검증 (2026-04-13 19:00 KST 이후)

- [ ] **pg_dump 18:00 UTC 정상 실행 확인**
  ```bash
  ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
    "stat -c '%n %s' /backup/nasun_points-$(date +%Y%m%d).sql.gz; \
     ls -lt /backup/nasun_points-*.sql.gz | head -3"
  ```
  기대: size > 100MB (이전 빈 파일은 20 bytes)

- [ ] **snapshot backup 01:00 UTC 정상 실행 확인**
  ```bash
  ssh ... "ls -lt /home/ubuntu/explorer-api/backups/snapshots/snapshot_*.csv | head -5; \
           tail -20 /home/ubuntu/explorer-api/backups/backup.log"
  ```
  기대: 신규 CSV 파일 + manifest.json 갱신

- [ ] **pg_dump 에러 로그 확인**
  ```bash
  ssh ... "ls /tmp/pg_dump-err-*.log 2>/dev/null && cat /tmp/pg_dump-err-*.log"
  ```
  기대: 에러 없음 (인증 정상)

### Scanner 동작 검증 (배포 후 24h)

- [ ] **UNMAPPED 로그 확인** (예상: 매핑 누락 없으므로 출력 0건)
  ```bash
  ssh ... "pm2 logs explorer-api --lines 500 --nostream | grep '\[Points\] UNMAPPED'"
  ```
- [ ] **Scan complete throughput 회귀 없음** (60s 간격 유지)
  ```bash
  ssh ... "pm2 logs explorer-api --lines 200 --nostream | grep 'Scan complete'"
  ```

### 별도 작업으로 분리된 follow-up (선택)

- [ ] **pado chat-server REST 응답 비정상 점검** — `/api/chat-participation` 모든 날짜 빈 응답
  - 위치: `apps/pado/chat-server/src/server.ts:717`
  - 증상: 4/8~4/12 모두 `participants: []` 반환
  - 영향: chat-scanner는 today만 fetch하므로 오늘 pado chat 사용자 누락 가능

- [ ] **nasun chat retention 경계 endpoint 동작 점검**
  - 4/10: REST 0건 vs DB 3,820건. 3일 전인데 30일 retention 안에 있어야 함
  - participants endpoint 로직 점검 필요 (purgeOldMessages 영향?)

- [ ] **백업 자동 무결성 검증 cron 추가** (별도 plan)
  - cron 끝에 size + gzip 자동 체크, 실패 시 stdout WARN
  - 후보: `&& [ $(stat -c %s "$file") -gt 1048576 ] && gzip -t "$file" || echo "BACKUP_FAIL"` inline
  - 또는 backup-snapshots.ts에 self-verify 모드

- [ ] **Restore drill runbook 작성** (`docs/restore-drill.md`)
  - 분기 1회 manual 절차 (Docker postgres 임시 컨테이너에 복원 + row count 비교)
  - 자동화는 v6.1로 보류

## 중요 컨텍스트

### 결정사항

- **SLO 완화 (보고 0건 → 보고 24h 내 인지+복구)**: "보고 0건"은 비현실적, 현실적 SLO는 24h. 사용자가 명시적으로 동의 (handoff 작성 시점 plan 기준).
- **신규 인프라 0개 원칙**: 부트스트랩 정신 — trigger/WAL/audit cron 등 가설적 위험 대응은 v6.1 이후 데이터 기반 결정.
- **Backfill 도구는 기존 재사용**: backfill-from-indexer.ts (--dry-run flag 이미 존재), backfill-dex.ts. 신규 audit.ts 파일 X.
- **Chat은 DB가 source-of-truth**: REST API는 retention 경계로 비신뢰. chat-scanner.ts가 capture 시점에 정확.

### 주의사항

- **Working tree에 무관한 변경 다수**: nasun-website/frontend, pado/frontend, package.json, pnpm-lock.yaml 등은 본 plan과 무관 (사용자가 직접 commit 결정 필요)
- **Untracked**: `apps/network-explorer/api-server/src/scripts/grant-creators-appreciation-bonus.ts` — 다른 작업, 본 plan 외
- **Scanner restart 직후 chain reset detected**: 정상. indexer fast-forward이며 cursor 자동 catch-up
- **PM2 fork mode 의존**: scanner unmatched WARN은 single-instance 가정. cluster mode 도입 시 워커별 격리 → 운영자 인지하고 대응
- **Backup retention 7일 미적용**: 현재 pg_dump cron retention은 14일, snapshot은 영구. plan v7의 7일은 대안일 뿐, 현 운영은 14일 유지
- **Plan 7회 개정**: v1~v8까지 누적된 의도/대안 모두 plan 파일 내부에 기록됨 (참조 시 활용)

### 파일 위치

**신규 docs**:
- [docs/points-audit-2026-04.md](apps/network-explorer/api-server/docs/points-audit-2026-04.md) — audit 전체 결과
- [docs/points-triage.md](apps/network-explorer/api-server/docs/points-triage.md) — 보고 처리 runbook

**수정 코드**:
- [points-scanner.ts:48-95](apps/network-explorer/api-server/src/scanner/points-scanner.ts#L48) — unmappedSeen Map + helper functions
- [points-scanner.ts:432](apps/network-explorer/api-server/src/scanner/points-scanner.ts#L432) — recordUnmappedEvent 호출

**기존 도구 (향후 보고 처리)**:
- [backfill-from-indexer.ts](apps/network-explorer/api-server/src/scripts/backfill-from-indexer.ts) — 대부분 카테고리 backfill (--dry-run, --start, --end)
- [backfill-dex.ts](apps/network-explorer/api-server/src/scripts/backfill-dex.ts) — pado-dex 전용
- [backup-snapshots.ts](apps/network-explorer/api-server/src/scripts/backup-snapshots.ts) — snapshot CSV 백업 (정상 작동 중)

**운영 위치 (node-3, 54.180.61.196, ubuntu user)**:
- backup snapshots: `/home/ubuntu/explorer-api/backups/snapshots/`
- backup pg_dump: `/backup/nasun_points-YYYYMMDD.sql.gz`
- backup error log: `/tmp/pg_dump-err-YYYYMMDD.log`
- backup-snapshots cron log: `/home/ubuntu/explorer-api/backups/backup.log`
- crontab: `crontab -l` (사용자 ubuntu)

### 핵심 commit

- `9c08825f` feat(explorer): add unmapped event WARN + audit/triage runbooks
- `aa3e7a7b` feat(explorer): add market order (OrderFilled) to pado-dex points tracking (이전 작업)

## 최근 변경 파일

**이번 plan으로 commit됨** (commit `9c08825f`):
- `apps/network-explorer/api-server/src/scanner/points-scanner.ts` (+77 LOC)
- `apps/network-explorer/api-server/docs/points-audit-2026-04.md` (신규)
- `apps/network-explorer/api-server/docs/points-triage.md` (신규)

**Working tree에 남은 변경 (본 plan과 무관, 사용자 결정 필요)**:
- `apps/nasun-website/frontend/src/{App.tsx, lib/analytics.ts, sections/ecosystem/finance/OneAccountSection.tsx, sections/myAccount/DailyMissionsCard.tsx}`
- `apps/pado/frontend/src/{App.tsx, components/layout/Footer.tsx}`
- `apps/network-explorer/api-server/package.json`, `pnpm-lock.yaml`
- Untracked: `apps/{nasun-website,pado}/frontend/src/{hooks/useCrossAppArrival.ts,lib/analytics.ts}`, `apps/network-explorer/api-server/src/scripts/grant-creators-appreciation-bonus.ts`

**운영 변경 (코드 X, node-3 crontab)**:
- pg_dump cron 명령 수정 (connection string)
- backup-snapshots cron 명령 수정 (mkdir -p)
- 빈 백업 파일 15개 삭제

## 즉시 다음 단계

1. **2026-04-13 19:00 KST 이후 D+1 백업 검증** ([docs/points-audit-2026-04.md §5.3](apps/network-explorer/api-server/docs/points-audit-2026-04.md))
   ```bash
   ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 \
     "stat -c '%n %s' /backup/nasun_points-$(date +%Y%m%d).sql.gz; \
      ls -lt /home/ubuntu/explorer-api/backups/snapshots/ | head -5; \
      cat /home/ubuntu/explorer-api/backups/backup.log | tail -10; \
      ls /tmp/pg_dump-err-*.log 2>/dev/null && cat /tmp/pg_dump-err-*.log"
   ```

2. **Scanner 24h UNMAPPED 로그 모니터링**
   ```bash
   ssh ... "pm2 logs explorer-api --lines 500 --nostream | grep '\[Points\] UNMAPPED'"
   ```
   기대: 출력 없음 (현재 매핑 누락 없음). 출력 시 `EVENT_MAP_ENTRIES`에 매핑 추가 + backfill.

3. **Pado chat-server REST 응답 점검** (별도 작업)
   - `apps/pado/chat-server/src/server.ts:717` `/api/chat-participation` endpoint 동작 확인
   - 모든 날짜 빈 응답 원인 파악 (purgeOldMessages? participants 계산 로직?)

4. **백업 자동 무결성 검증 cron 추가 검토** (선택)
   - 후보: cron 끝에 size + gzip 인라인 체크, 또는 별도 verify-backups.ts 신규
