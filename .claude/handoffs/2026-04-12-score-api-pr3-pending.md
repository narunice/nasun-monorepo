# Handoff: Score API PR#1/#2 배포 완료, PR#3 관찰 대기

**생성**: 2026-04-12 15:50 KST
**브랜치**: main
**이전 핸드오프**:
- [2026-04-11-unified-chat-phase2b-complete.md](2026-04-11-unified-chat-phase2b-complete.md) — Unified Chat hub 완성
- [2026-04-12-chat-server-role-clarification.md](2026-04-12-chat-server-role-clarification.md) — 역할 분석 보고서
- [2026-04-12-points-audit-followup.md](2026-04-12-points-audit-followup.md) — Ecosystem Points 후속

**관련 plan**: [/home/naru/.claude/plans/enumerated-conjuring-quokka.md](/home/naru/.claude/plans/enumerated-conjuring-quokka.md)
**롤백 tag**: `pre-score-api-refactor` (b54aebce)

## 현재 상태 요약

PR#1 (Score API + pado frontend) + PR#2 (settle-pado URL 전환) 프로덕션 배포 완료. PR#3 (points 엔드포인트 삭제 + pado-chat-server 폐기)은 staging `/api/leaderboard/points` hit=0 **2~3일 관찰** 후 진행 예정. 현재 시점에서 2026-04-14 이후 PR#3 merge 가능.

## 완료된 작업

### PR#1 — Score API additive (커밋 `85339be6` + fix `860aa523`)

- [x] `/api/pado/leaderboard/score` (alltime만) + `/api/pado/leaderboard/trader/:addr/score`
- [x] `indexer_state.pado_aggregator_last_run_ms` cycle-level timestamp (String 캐스팅)
- [x] `mapRowToListItem` pure function → `leaderboard-mapper.ts` 추출 (향후 packages/ lift 준비)
- [x] Sui address regex `/^0x[0-9a-f]{64}$/` pre-validate (기존 라우터 regex 재사용)
- [x] `scope=weekly` → 400 + self-documenting error body
- [x] 응답 `Cache-Control: public, max-age=30, stale-while-revalidate=60` (CloudFront bypass, 브라우저 30초 캐시)
- [x] Legacy `/api/leaderboard/points` + `/trader/:addr/points` **유지** (PR#3에서 삭제)
- [x] pado frontend: `ScoreScope` 리터럴 `'weekly'` 제거 (TS compile-time 강제), hook default `'alltime'`, URL `/api/pado/` prefix, `LeaderboardPage.tsx:23` useState 수정
- [x] nasun-chat-server `README.md` 최상단 역할 박스 + baseline 표 (trader_points 500 rows, 2.5GB)
- [x] Staging + prod 배포 완료, Score 탭 정상

**버그 수정** (staging 검증 중 발견): `handleLeaderboardRequest`의 path prefix guard에 `/api/pado/` 추가 필요했음 (초기 라우트 추가만 하면 상위 filter에서 차단됨).

### PR#2 — settle-pado + CHAT_SERVER_URLS (커밋 `6934164c`)

- [x] settle-pado.ts default URL: `https://nasun.io/chat/api/pado/leaderboard/score`
- [x] env fallback: `PADO_SCORE_URL ?? PADO_POINTS_URL ?? default`
- [x] Staleness guard: `updatedAt === 0 || now - updatedAt > 5분` → `process.exit(1)`
- [x] `totalScore` / `totalPoints` 양쪽 지원 (`traderScore()` helper)
- [x] chat-scanner.ts: `CHAT_SERVER_URLS` 배열 parser 유지 policy comment (확장 여지)
- [x] node-3 배포 완료 (설정: `CHAT_SERVER_URLS=http://43.200.67.52:3101` 단일, `PADO_POINTS_URL` env override 없음 — 코드 default 사용)
- [x] Dry-run 검증: 500 traders, staleness 통과, `updatedAt` 정상

## 미완료 작업

### PR#3 — Points 삭제 + pado-chat-server 폐기 (관찰 후)

사전 조건 충족 후 진행:
- [ ] Staging points hit count 2~3일 0 유지 (2026-04-14 이후)
- [ ] Prod settle-pado cron 1회 이상 성공 (crontab 미설정이라 cron 주체 확인 필요)
- [ ] pado.finance `/chat/*` `/ws` 외부 caller 0 확인

실행 내용 (plan의 PR#3 섹션 참조):
- [ ] nasun `handlePointsLeaderboard`, `handleTraderPoints` + store 함수 삭제
- [ ] `apps/pado/chat-server/` → `apps/_archive/pado-chat-server/` `git mv`
- [ ] `apps/pado/data-server/` stub (README + package.json private stub + .gitkeep)
- [ ] `pnpm-workspace.yaml`에 `!apps/_archive/**` negation
- [ ] pnpm install → lockfile regenerate → 별도 커밋 → `--frozen-lockfile` 검증
- [ ] CI assertion `pnpm m ls --json | jq -e '[.[] | select(.path | test("_archive"))] | length == 0'`
- [ ] nginx `/chat/` → `return 410; add_header Link "<https://nasun.io/chat>; rel=\"canonical\""`, `/ws` → `return 410` (블록 제거 금지 — SPA fallthrough 위험)
- [ ] EC2: nginx reload → pm2 delete → mv archive → `ecosystem.config.cjs.disabled` rename
- [ ] `package.json` root scripts 삭제, health-check SKILL.md 정리, CLAUDE.md 업데이트
- [ ] Root CLAUDE.md에 "프로젝트 개요"에 3줄 추가 (nasun-chat-server 역할 / app prefix 규칙 / additive-first pattern)

### Follow-up (별도 작업)

- [ ] **Observability baseline metric** (CloudWatch custom: writes/sec, db size, aggregator CPU peak) — 즉시 우선순위
- [ ] **Observability operational health** (aggregator 실패율, WS conn, chat msg rate, settle-pado success rate) — Q3
- [ ] **DB rename** `trader_points` → `pado_trader_scores`, `points_snapshots` → `pado_score_snapshots`, SQL 주석 제거 — Q3
- [ ] `PADO_POINTS_URL` env → `PADO_SCORE_URL` rename — 다음 explorer-api 배포
- [ ] 기존 엔드포인트 app prefix 일괄 전환 (`/api/trades`, `/api/orders` 등) — baram plan 착수 시
- [ ] src 서브디렉토리 분리 (`src/chat/`, `src/pado/`) — baram 착수 or pado endpoint +5
- [ ] **Score weekly scope 정식 구현** (aggregator weekly window) — Q3~Q4

## ⚠️ 이틀 후 (2026-04-14) 점검 체크리스트

PR#3 진행 결정 전 **반드시 확인**:

### 1. Staging points endpoint hit count (blocking)

```bash
ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180 \
  "sudo zgrep -c 'GET /chat/api/leaderboard/points' /var/log/nginx/staging.nasun.io.access.log*"
# → 0이어야 PR#3 진행
# → >0이면 caller IP 식별:
#   sudo zgrep 'GET /chat/api/leaderboard/points' /var/log/nginx/staging.nasun.io.access.log* | awk '{print $1}' | sort -u
```

### 2. Prod settle-pado 실제 실행 확인 (blocking)

**주의**: node-3 crontab에 settle-pado 등록 없음 — cron 주체 확인 필요.
- 가능성: systemd timer / 다른 서버의 cron / EventBridge / 수동 실행만
- 확인 명령:
  ```bash
  ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 "
    ls -la ~/explorer-api/data/pado-snapshots/ 2>/dev/null | head -5 &&
    echo '---' &&
    systemctl list-timers 2>/dev/null | grep -i pado &&
    echo '---' &&
    crontab -l 2>/dev/null
  "
  ```
- 2026-04-13 또는 14에 새 snapshot 파일이 생성되었으면 cron이 돌고 있다는 증거
- 실행 안 됐으면 수동 실행 1회 검증:
  ```bash
  ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 "
    cd ~/explorer-api &&
    set -a && source .env && set +a &&
    npx tsx src/scripts/settle-pado.ts --period weekly --dry-run
  "
  # → '500 traders found' + staleness 통과 확인
  ```

### 3. nasun-chat-server 안정성

```bash
# Prod
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  "pm2 describe nasun-chat-server | grep -E 'status|uptime|restarts'"
# → status: online, restarts 증가 없음 (현재 18 유지), uptime 이틀

# Staging
ssh -i ~/.ssh/.awskey/naru_seoul.pem ubuntu@15.165.19.180 \
  "pm2 describe nasun-chat-server | grep -E 'status|uptime|restarts'"
# → status: online, restarts 현재 36 유지
```

### 4. updatedAt freshness (aggregator cycle 동작)

```bash
curl -sS "https://nasun.io/chat/api/pado/leaderboard/score?limit=1" | jq '.updatedAt, (now * 1000 - .updatedAt) / 1000'
# → 둘째 값이 120(초) 이하여야 aggregator 정상 (cycle 60s x 2 슬랙)
```

### 5. pado.finance `/chat/*` `/ws` 외부 caller 확인

```bash
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  "sudo zgrep -hE '(/chat/|/ws)' /var/log/nginx/pado.finance.access.log* | awk '{print \$1}' | sort -u | head -20"
# → private CIDR (10.x, 127.x, 172.16-31, 192.168) + NAT EIP 제외 후 외부 IP 0건 확인
```

### 6. Score 탭 사용자 에러 로그

```bash
# Sentry/CloudWatch에서 지난 48시간 "score" 관련 에러 조회
# 현재 모니터링 파이프라인 미설정 → Observability follow-up 전까진 수동
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  "pm2 logs nasun-chat-server --lines 500 --nostream 2>&1 | grep -iE 'score|error' | tail -30"
```

### 판정

- 1, 2, 5 모두 통과 → PR#3 진행
- 1 실패 (hit > 0) → caller 식별 후 연락/차단 검토, PR#3 연기
- 2 실패 (cron 미실행) → 수동 dry-run 1회 성공 확인 후 진행
- 3, 4 이상 → 별도 디버깅 우선

## 중요 컨텍스트

### 결정사항
- **Option A' 채택** (Unified Chat 수용 + reversibility 장치 3종). 옵션 B/C/D는 Follow-up으로 이동
- **Additive-first rename pattern** 정립 (keep → add → cutover → remove). 향후 DB/env/endpoint rename에 재사용
- **DB 테이블명 `trader_points` 유지**: rename은 Q3 follow-up. SQL 주석 + API 레벨 `score` 통일
- **CHAT_SERVER_URLS 배열 parser 유지**: 값은 단일 URL이지만 확장 여지. 정책 comment를 chat-scanner.ts에 박음

### 주의사항
- **롤백 시 PM2 재기동 금지**: archive DB는 stale copy. nasun과 이중 쓰기 hazard. 코드/nginx만 원복
- **path prefix guard 함정**: nasun-chat-server `leaderboard-api.ts`에 `/api/*` 경로 whitelist가 있음 (L164-171). 새 prefix 추가 시 필수 업데이트
- **Lambda 아님**: settle-pado는 node-3 스크립트로 실행. CloudWatch 알람 계획(plan C-3)은 Lambda 가정이었음 → follow-up에서 재설계 필요
- **staging.pado.finance 401**: 정상 (Basic Auth). health check 도구에 false positive 주의

### 파일 위치

**PR#1/#2 핵심 파일**:
- `apps/nasun-website/chat-server/src/leaderboard-api.ts` — Score 핸들러, path prefix guard
- `apps/nasun-website/chat-server/src/leaderboard-store.ts` — getScoreLeaderboard 등
- `apps/nasun-website/chat-server/src/aggregator.ts` — `pado_aggregator_last_run_ms` upsert
- `apps/nasun-website/chat-server/src/leaderboard-mapper.ts` — (신규) pure function
- `apps/nasun-website/chat-server/README.md` — (신규) 역할 박스 + baseline 표
- `apps/pado/frontend/src/features/leaderboard/` — types, hooks, ScopeSelector, LeaderboardPage
- `apps/network-explorer/api-server/src/scripts/settle-pado.ts` — URL/fallback/staleness
- `apps/network-explorer/api-server/src/scanner/chat-scanner.ts` — CHAT_SERVER_URLS policy comment

**EC2**:
- Prod nasun-chat-server: `ec2-user@43.200.67.52:/home/ec2-user/nasun-chat-server/` (PM2 id 29)
- Staging nasun-chat-server: `ubuntu@15.165.19.180:~/nasun-chat-server/` (PM2 id 10)
- Node-3 explorer-api: `ubuntu@54.180.61.196:~/explorer-api/` (PM2 id 4)

**Plan + handoff**:
- Plan: `/home/naru/.claude/plans/enumerated-conjuring-quokka.md`
- 선행 handoff: `.claude/handoffs/2026-04-11-unified-chat-phase2b-complete.md`
- 역할 분석: `.claude/handoffs/2026-04-12-chat-server-role-clarification.md`

### 롤백 경로

**개별 PR revert** (안전):
- PR#1 revert: `git revert 85339be6 860aa523` + staging/prod 재배포 (DB 변경 없음, 안전)
- PR#2 revert: `git revert 6934164c` + node-3 재배포 + `pm2 restart explorer-api`

**전체 롤백** (최후수단):
```bash
git reset --hard pre-score-api-refactor  # b54aebce
# + 각 서버 재배포 (주의: 다른 작업자의 working tree 변경도 함께 되돌림)
```

## 최근 변경 파일 (PR#1 + PR#2)

- `apps/nasun-website/chat-server/src/leaderboard-api.ts` — Score 핸들러 추가, prefix guard 수정
- `apps/nasun-website/chat-server/src/leaderboard-store.ts` — Score 함수, SQL 주석
- `apps/nasun-website/chat-server/src/leaderboard-types.ts` — Score 타입 3개
- `apps/nasun-website/chat-server/src/leaderboard-mapper.ts` — 신규
- `apps/nasun-website/chat-server/src/aggregator.ts` — setIndexerState 1줄
- `apps/nasun-website/chat-server/README.md` — 신규
- `apps/pado/frontend/src/features/leaderboard/types.ts` — ScoreScope narrowed
- `apps/pado/frontend/src/features/leaderboard/hooks/useLeaderboard.ts` — default/URL
- `apps/pado/frontend/src/features/leaderboard/components/ScopeSelector.tsx` — weekly 제거
- `apps/pado/frontend/src/pages/LeaderboardPage.tsx` — useState alltime
- `apps/network-explorer/api-server/src/scripts/settle-pado.ts` — URL/fallback/staleness
- `apps/network-explorer/api-server/src/scanner/chat-scanner.ts` — policy comment

**Working tree에 남은 무관 변경** (다른 작업자 in-progress, 건드리지 않음):
- nasun-website/frontend: Cross-App Arrival, Creators Appreciation Bonus
- pado/frontend: App.tsx, Footer.tsx, analytics (Cross-App Arrival 연계)
- network-explorer/api-server: auth/, data/, routes/creators-appreciation
- `.claude/handoffs/2026-04-12-points-audit-followup.md` 로컬 수정

## 즉시 다음 단계 (이틀 후 세션)

1. **점검 체크리스트 섹션 1~6 순차 실행** (위 ⚠️ 섹션)
2. 모든 조건 통과 시 **PR#3 착수** — plan의 PR#3 섹션 그대로 진행:
   - `apps/pado/chat-server/` → `apps/_archive/pado-chat-server/` `git mv`
   - `apps/pado/data-server/` stub 생성 (README 5줄 가이드 포함)
   - `pnpm-workspace.yaml` negation 패턴
   - `pnpm install` (frozen 아님) → lockfile commit 먼저
   - nginx `/chat/` `/ws` → `return 410`
   - EC2 nginx reload → pm2 delete → mv archive
3. PR#3 merge 후 **follow-up GitHub issue 9건 생성** (plan Follow-up 표 기반, owner 지정)
4. 핸드오프 이 문서 끝에 "PR#3 완료 (commit sha: <TBD>)" 추가
5. `.claude/handoffs/2026-04-12-chat-server-role-clarification.md`에 제거 commit sha 기록
