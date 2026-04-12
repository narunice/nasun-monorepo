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

---

## 추가 작업 (세션 말미, 03:40~04:00 UTC)

### 추가 검증: Indexer 전체 이벤트 타입 vs EVENT_MAP_ENTRIES 대조

**목적**: 과거 silent drop된 이벤트 타입이 있는지 확인 (매핑 누락 탐지).

**쿼리**: Last 30일 `events` 테이블의 distinct event type 22종 vs `EVENT_MAP_ENTRIES` 비교.

**결과**:

- ✅ 매핑되어 점수 반영 중 (8종, 43k+ 이벤트 볼륨 99%+)
- ✅ 의도적 제외 (9종): OrderInfo, EWMAUpdate, BalanceEvent, history::*, governance::TradeParamsUpdateEvent, validator epoch, system epoch — 모두 내부/시스템/동기화 이벤트
- ⚠️ 잠재 gap (5종):
  - `OrderFullyFilled` (1,259건) — `OrderFilled`와 같은 TX에 동반 emit, daily cap으로 중복 방지됨, 영향 없음
  - **`alliance_nft::AllianceMinted` (110건)** — **사용자 결정으로 점수 대상 아님 확정**
  - `unified_margin::AccountCreated` (7), `NusdcDeposited` (1), `smart_account::AccountCreated` (1) — 사용량 극소수, 현재 점수 대상 아님

### 결론

**사용자가 보는 all-time 포인트는 현재 누락 없이 반영 완료**:
- 4/1~4/13 backfill 5,554건 + snapshot 17,456건 보정 모두 API 응답에 반영됨
- Sample 검증 (thejediworld77): allTime ecosystemScore=151, 7개 UI mission 모두 체크 ✓
- alliance_nft mint는 의도적 제외로 확정

### Working tree 정리 (commit `ad7f902c`)

- `.claude/handoffs/2026-04-12-points-audit-followup.md` — 본 handoff 문서 commit
- `.gitignore`에 `.claude/scheduled_tasks.lock` 추가 (세션별 PID-bound lock, commit 금지)

### 남은 working tree (본 세션과 무관, 건드리지 않음)

다음 변경은 다른 작업 (Cross-app analytics + Creators Appreciation Bonus 기능)의 in-progress:

- nasun-website/frontend: App.tsx, analytics.ts, DevMyAccountPage, OneAccountSection, DailyMissionsCard, CreatorsAppreciationBonusCard (신규), useCreatorsAppreciationBonus (신규), creatorsAppreciationApi (신규), useCrossAppArrival (신규)
- pado/frontend: App.tsx, Footer.tsx, useCrossAppArrival (신규), analytics.ts (신규)
- api-server: package.json, src/index.ts, doc/api-server.md, src/auth/ (신규), src/data/ (신규), src/routes/creators-appreciation.ts (신규), src/scripts/grant-creators-appreciation-bonus.ts (신규)
- pnpm-lock.yaml

→ 원래 작업자가 해당 기능 완성 시 별도 commit할 것. 본 handoff 세션에서 commit 안 함.

### 최종 세션 commits (push 완료)

- `9c08825f` feat(explorer): add unmapped event WARN + audit/triage runbooks
- `ad7f902c` docs(handoff): add points audit follow-up + ignore claude lock file

브랜치 상태: `main` up to date with `origin/main`.

---

## 추가 세션 (2026-04-12 14:00 KST, 04:00 UTC~)

### Follow-up 2건 재조사 — 모두 사용자 영향 없음으로 확정

**조사 범위**: 핸드오프 L68-75의 "pado chat-server REST 빈 응답" + "nasun 4/10 retention 경계" 2건.

**확정된 사실**:

1. **pado-chat-server (port 3100)**: PM2 STOPPED (의도됨, Phase 2c 완료). Production EC2(43.200.67.52)에서 확인.
2. **nasun-chat-server (port 3101)**: 정상 서빙. node-3(54.180.61.196)에서 cross-host curl로 4/10, 4/11, 4/12 모두 participants 정상 반환 확인.
3. **DB는 여전히 독립**: 3101과 3100은 각자 별도 SQLite DB 사용 (`apps/nasun-website/chat-server/src/store.ts`, `apps/pado/chat-server/src/store.ts`). "unified"는 **프론트엔드 WS/HTTP endpoint 전환**만 의미하며, 과거 pado DB 데이터는 3100에 freeze. `apps/pado/.env.production:68-69`에서 `VITE_CHAT_WS_URL=wss://nasun.io/ws/chat` 확인됨.
4. **scanner는 today만 fetch** (`chat-scanner.ts:99`). 과거 날짜 REST 불일치는 포인트 지급에 영향 없음.
5. **chat-scanner는 Set union + lowercase 정규화**로 중복 방지 (`chat-scanner.ts:58`). 3100 dead entry는 매 scan마다 connection refused WARN만 발생, 기능 무해.

**핸드오프 L68-75 재평가**:

- "pado REST 빈 응답" → 3100 PM2 STOPPED에 따른 예상 동작. **사용자 영향 0**.
- "nasun 4/10 불일치" → migration 시점(4/10 21:34 KST) 이전 pado 몫이 pado DB에 freeze됨. 3101 단독 조회로는 영구적으로 당시 pado 참여자 조회 불가이나, **포인트 DB에는 이미 적재 완료**되어 사용자 영향 0.

### 수정 사항 (commit 대기)

1. **nasun chat-server `getChatParticipants` SQL 일관성 수정** — `AND sender != 'SYSTEM'` 가드 추가 (pado와 일치).
   - 파일: [apps/nasun-website/chat-server/src/store.ts:508-518](apps/nasun-website/chat-server/src/store.ts#L508)
   - 실영향 미미 (message_type='system' 필터로 이미 대부분 차단되나, 방어적 일관성 개선).

### 미해결 리스크 (별도 follow-up)

- **자정 경계 fail-open**: chat-scanner는 today만 1회 fetch, 실패 시 retry 없음. 3101이 단일 장애점이 된 지금 더 중요해짐. 핸드오프 L93에서 이미 인지된 약점. 향후 alert/retry 도입 검토.
- **CHAT_SERVER_URLS에서 3100 제거** (prod env 변경): ✅ 완료 (node-3 `.env` 수정 + PM2 restart, WARN 로그 0 확인).
- **pm2 delete pado-chat-server**: 보류 (retention 창 ~2026-05-10 이후 재평가). 현재 stopped 유지.
- **pado.finance.conf nginx cleanup**: 보류 (retention 창 이후).

---

## 추가 세션 (2026-04-12 15:00 KST~, 06:00 UTC~) — TPSL-keeper orphan 조사 및 수정

### 현상
prod pado bots 헬스체크 중 tpsl-keeper에서 1시간 983건, 하루 67,288건 실패 발견. 2026-04-11 05:30 UTC부터 시작된 `withdraw_with_proof` MoveAbort 3 (`EBalanceManagerBalanceTooLow`) 무한 retry 루프. 46개 주문이 stuck 상태.

### 원인

1. **코드 버그**: `MoveAbort balance_manager::withdraw_with_proof` 패턴이 permanent failure 분류에 없어 매 cycle 재시도 ([tpsl-keeper.ts:215-225](apps/pado/bots/tpsl-keeper.ts#L215))
2. **Orphan 생성 경로**: 사용자가 BalanceManager 잔액을 withdraw해도 TPSL 주문 자동 cancel 로직 없음. TradeCap revoke 경로만 cancel 수행 중 ([useTradeCap.ts:294-307](apps/pado/frontend/src/features/trading/hooks/useTradeCap.ts#L294)).
3. **스코프 확인**: tpsl-keeper는 DeepBook **spot** 전용 (perp 무관). 46 orphan은 19명 유저, NBTC/NETH/NSOL 분포.

### 수정 완료

**P1 (commit `a057ac25`, prod 배포 완료)**
- `isPermanentFailure()` 헬퍼 추출, 양쪽 경로(dry-run fail + catch) 일관 적용
- `balance_manager` + `withdraw_with_proof` 패턴을 permanent 분류에 추가
- 46개 stuck 주문을 `tpsl-orders.json`에서 `active` → `failed`로 전환 (backup: `tpsl-orders.json.bak.1775979197`)
- keeper restart 후 error log 0 bytes 유지 확인

**Option 8 — UI copy 개선 (local, commit 대기)**
- [BottomTabPanel.tsx:154-183](apps/pado/frontend/src/features/trading/components/BottomTabPanel.tsx#L154) — balance-depleted failures는 muted gray "Position closed"로 표시, 일반 실패는 red "Failed" 유지
- `title` attribute로 error detail hover tooltip
- UX 의미: TPSL이 "실패"가 아닌 "포지션 청산 후 자연 종료"임을 명시

### 폐기된 대안 (/review 만장일치 BLOCK)

**Option 2a (frontend withdraw auto-cancel)**
- ① `handleWithdraw:455` 타겟 잘못 (실제는 line 489/238)
- ② 판정 공식 오류 (coin unit/side/cumulative 미고려)
- ③ self-custodial 아키텍처와 충돌 (외부 지갑 withdraw 미커버)
- ④ 2-phase race window 새로 도입 (withdraw 성공 + cancel 실패 시 orphan 재발)

**Option 2b (liquidation-keeper auto-cancel)** — N/A
- tpsl-keeper는 spot 전용, liquidation-keeper는 perp 전용. 시스템 분리로 orphan 원인과 무관.

### 보류된 개선

**Option 3 (keeper server-side balance pre-check)**
- `checkAndExecuteOrders` trigger 직전 BalanceManager 잔액 조회 → 0이면 즉시 permanent
- frontend 변경 0, 모든 경로 커버
- 현 시점 P1만으로 bleeding 차단 완료이므로 log noise 재발 시 재평가
