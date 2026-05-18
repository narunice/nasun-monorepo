# CLAUDE.md (apps/gostop)

> Last Updated: 2026-05-18
> 공통 규칙은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## 앱 목적

**gostop.app** — "Luxury onchain casino prototype". Nasun 에코시스템의 게임 허브.

- **7개 게임**: Lottery, Scratch, Number Match (Pado에서 이전), Crash, Plinko, Mines, Roulette, Wheel
- **간판 게임**: Crash (가장 시각적, 가장 많은 trading-style UX)
- **간판 외**: 사용자 다양성 확보용 lottery·scratch·numbermatch 유지 + RTP 다양화

DESIGN.md는 외관 방향성을 "Bellagio / Marina Bay Sands / Cartier" 톤으로 정의. crypto-bro neon 또는 pastel fintech 둘 다 회피. restrained·precious·inevitable 분위기.

> **Why gostop이 별도 앱 (Pado에서 분리)**: Pado는 DEX + Prediction 등 self-custodial finance에 집중. Lottery/Scratch/NumberMatch 같은 카지노형 게임은 finance와 카테고리가 다르고 (entertainment·house edge·확률 게임), 도메인·UX·법적 포지셔닝도 분리해야 community가 두 정체성을 혼동하지 않음. 별 도메인 gostop.app으로 분리하고 Crash 같은 신규 게임을 간판으로 출시.

> **Why 백엔드가 prod EC2가 아니라 node-3 colocation**: 게임 결과 indexing이 sui_indexer DB + fullnode RPC와 같은 host에서 돌면 latency가 사라지고 네트워크 비용도 0. prod EC2는 nasun.io + pado.finance + chat-server 트래픽을 이미 감당 중이라 신규 indexer 부하 추가에 부적합. 단, monorepo의 `ecosystem.config.cjs` + deploy script는 prod EC2 가정으로 작성되어 있어 drift 상태 — reconcile PR-C 전까지 별도 스크립트 실행 금지 (project_gostop_backend_node3_runtime.md).

> **Why CDK 사이트 스택은 us-east-1**: CloudFront 사용 도메인의 ACM 인증서는 us-east-1에서만 발급 가능하므로 같은 리전에 인프라를 두는 편이 단순. Nasun 대부분 리소스는 ap-northeast-2이므로 us-east-1에서 찾을 것 (reference_aws_region_split.md).

---

## 디렉토리 구조

```
apps/gostop/
├── DESIGN.md                   # 디자인 토큰, 톤, 컬러 시스템 (gold #d4af37, ink-950~500)
├── devnet-ids.json             # On-chain ID 중앙 관리 (network, tokens, bankrollPool, 게임별 packageId)
├── frontend/                   # @nasun/gostop — Vite + React SPA (port 5178)
│   ├── src/features/           # 게임별 폴더 (crash, lottery, mines, scratchcard, numbermatch, wheel, dashboard, game-history, replay, shared)
│   ├── src/pages/              # 라우트 (HomePage, CrashPage, LotteryPage, ..., LeaderboardPage, TransparencyPage, FloorPage)
│   ├── src/store/              # Zustand stores (Balance, Settings, Toast)
│   └── src/components/         # 공용 컴포넌트 + celebration/ + shared/ + ui/
├── backend/                    # @nasun/gostop-backend — Node.js API + Indexer (node-3:3202)
│   ├── src/api/
│   │   ├── routes/             # auth, leaderboard, round, streak, transparency, me/
│   │   └── lib/                # cache, identity-resolver, leaderboard-query, streak, visibility-{lookup,mask}
│   ├── src/db/
│   │   ├── client.ts           # PostgreSQL
│   │   ├── cursor.ts           # 커서 pagination
│   │   ├── migrations/         # 001, 002, 003 (lottery_round.draw_tx_digest 등)
│   │   └── schema-audit.test.ts # INSERT 컬럼 drift 가드 (vitest)
│   ├── src/indexer/
│   │   ├── index.ts            # Indexer 메인 루프
│   │   ├── matview-refresh.ts  # MV 자동 새로고침
│   │   ├── notify-feed.ts      # WebSocket NOTIFY/LISTEN (live feed)
│   │   └── streams/            # 게임별 event stream 핸들러
│   ├── src/env.ts / config/ / rpc.ts
│   └── package.json            # @nasun/gostop-backend (v0.1.0, private)
├── bots/
│   ├── ecosystem.config.cjs    # PM2
│   ├── lottery-keeper.ts       # Lottery round 종료 + 승자 settlement
│   ├── admin-finalize-stuck-crash-round.ts
│   ├── install-gamecap-*.ts    # GameCap 설치 (crash, lottery, mines, scratchcard, numbermatch, wheel, v3, v4)
│   └── seed-bankroll*.ts       # Bankroll pool 초기 시드 (v2 호환)
├── cdk/
│   ├── lib/gostop-site-stack.ts # 단일 Stack — S3(OAC) + CloudFront + Route53 + ACM
│   └── bin/cdk.ts              # us-east-1 (CloudFront), dev/prod 계정 매핑
├── contracts-bankroll-pool/    # Move: gostop_bankroll_pool (v0.0.2 published)
├── contracts-crash/            # Move: gostop_crash
├── contracts-lottery/          # Move: gostop_lottery
├── contracts-mines/            # Move: gostop_mines
├── contracts-numbermatch/      # Move: gostop_numbermatch
├── contracts-scratchcard/      # Move: gostop_scratchcard
├── contracts-wheel/            # Move: gostop_wheel
└── docs/
    ├── MANUAL_E2E_CHECKLIST.md
    └── game-result-schema.md
```

## 개발/빌드/배포

```bash
# 로컬 개발
pnpm dev:gostop                         # frontend (port 5178)
pnpm --filter @nasun/gostop-backend dev:api
pnpm --filter @nasun/gostop-backend dev:indexer

# Build
pnpm build:gostop                       # frontend
pnpm --filter @nasun/gostop-backend build

# Prod 배포 (monorepo root)
pnpm deploy:gostop:prod                 # frontend → gostop.app (CloudFront us-east-1)
pnpm deploy:gostop-backend:prod         # backend → node-3:3202
pnpm deploy:gostop:bots:prod            # bots → EC2 pm2
pnpm deploy:gostop:staging              # staging.gostop.app (basic auth)

# CDK
cd apps/gostop/cdk
NODE_ENV=production npx cdk deploy
```

## 운영 환경

- **Frontend**: CloudFront `gostop.app` (prod, no basic auth) + `staging.gostop.app` (basic auth tokens). us-east-1 ACM/CF 리전, 계정 dev(135808943968) / prod(466841130170)
- **Backend**: **node-3 (54.180.61.196):3202** → nginx 프록시 → `https://api.gostop.app` (reference_gostop_backend_endpoints.md)
- **DB**: node-3 PostgreSQL (sui_indexer / nasun_points 와 동일 인스턴스, 별도 DB)
- **Bots (pm2)**: `lottery-keeper` 등. PM2 ecosystem은 별도 (`apps/gostop/bots/ecosystem.config.cjs`)
- **App-id marker**: `frontend/public/.app-id` → build → `dist/.app-id`. deploy 스크립트가 remote의 `<root>/.app-id`와 비교해 cross-app 덮어쓰기 차단

## 게임 카탈로그 (devnet-ids.json 기준)

| 게임 | gameId | 버전 | 특이사항 |
|------|--------|------|---------|
| Lottery | (자체) | v4 fresh-published | 5-of-25, 주간 사이클, lottery-keeper bot이 종료 정산 |
| Scratchcard | 2 | v0.0.1 | bulk 구매 지원 (max 10) |
| NumberMatch | 3 | v0.0.1 | 3개 숫자 매칭 (1-5), max 3 picks |
| Crash | 4 | v5 (halved ramp) | multiplier ramp 게임, 간판 |
| Mines | 5 | v4 | 25-cell grid, 1-24 mine range |
| Wheel | 6 | v0.0.1 | 20 segment, RTP 97.5%, max payout 설정 |

> **Plinko / Roulette**: contracts 아직 없음. 출시 순서는 Crash → Plinko → Mines → Roulette → Wheel (project_gostop_app_migration.md). devnet-ids.json 기준 Mines·Wheel은 배포 완료, Plinko/Roulette는 미배포.

## Operational Invariants (자주 까먹는 것)

1. **백엔드 위치는 node-3** (CRITICAL): `apps/gostop/bots/ecosystem.config.cjs` 와 일부 deploy script가 prod EC2 가정 — reconcile 전까지 임의 실행 금지. backend deploy는 `pnpm deploy:gostop-backend:prod`만 사용 (project_gostop_backend_node3_runtime.md).
2. **CloudFront us-east-1 스택**: console에서 ap-northeast-2를 보고 "없네?"라고 오해 금지. `cdk/bin/cdk.ts`에 region 하드코딩됨.
3. **app-id marker 검증 강제**: `public/.app-id`가 `gostop-frontend`. nasun.io/pado.finance와 같은 EC2가 아니더라도 향후 colocation 가능성 대비 marker 유지. deploy script 우회 금지.
4. **schema-audit test**: `backend/src/db/schema-audit.test.ts`가 INSERT 컬럼 drift를 막음. 마이그레이션 시 가드 통과 확인 후 머지.
5. **Migration 003 first-deploy checklist**: `lottery_round.draw_tx_digest` 컬럼 추가. 처음 prod에 올릴 때 누락 시 lottery-keeper crash. `chore(gostop/backend): wire migration 003 into first-deploy checklist` 커밋 참조.
6. **banned_users filter 일관**: leaderboard 응답은 `public.banned_users` (unbanned_at IS NULL) 자동 제외. 500-row cap. visibility opt-out도 동일하게 SQL 수준 필터.
7. **visibility cache는 replica-coherent**: 사용자 visibility 변경 즉시 read replica에 반영 보장 (PR-0 follow-up).
8. **LockConflict/ObjectVersionMismatch handling**: 다중 사용자가 동시에 같은 게임 round에 진입하면 owned object 경쟁 발생. retry 또는 명확한 user-facing error로 처리 (gostop/pado 공통 패턴).
9. **Crash race condition fix는 negative ROI 평가됨**: nasun-website 측 crash와는 다른 코드베이스. gostop 측 crash는 운영 상태 — 단, 사고 발생 시 [admin-finalize-stuck-crash-round.ts](bots/admin-finalize-stuck-crash-round.ts)로 수동 복구.

## 최근 30일 주요 변경 (요약)

- **Leaderboard + transparency UX overhaul**: home/transparency UX, nav reorder, mobile fix, 색상 플래그 (Green/Orange/Yellow), pagination
- **Transparency total_bet/total_payout 노출**: `/transparency` API
- **Banned filter + 500-row leaderboard cap**: SQL 수준 일관 적용
- **Streak: delayed wallets 거부** (PR-0 Low #1): 잠재적 race 방지
- **Schema audit vitest 가드**: INSERT 컬럼 drift 사전 차단
- **Migration 003**: `lottery_round.draw_tx_digest` 추가
- **App-id marker first-deploy script** (tier 0)
- **PlayerIdentity / Pagination 공유 컴포넌트** (frontend shared/)
- **`chore(gostop/backend): reconcile monorepo with node-3 runtime`**: monorepo↔node-3 drift 일부 reconcile

## 참조 문서

- [DESIGN.md](DESIGN.md) — 디자인 토큰·톤·color system
- [docs/MANUAL_E2E_CHECKLIST.md](docs/MANUAL_E2E_CHECKLIST.md) — 수동 E2E 체크리스트
- [docs/game-result-schema.md](docs/game-result-schema.md) — 게임 결과 스키마
- [../../docs/infrastructure.md](../../docs/infrastructure.md) — node-3 colocation, CloudFront, WAF, PM2
- [../../docs/smart-contracts.md](../../docs/smart-contracts.md) — Move CLI, contracts-* 빌드/배포
- [../../docs/ecosystem-points-system.md](../../docs/ecosystem-points-system.md) — gostop-* 카테고리가 ecosystem points에 어떻게 흡수되는지
