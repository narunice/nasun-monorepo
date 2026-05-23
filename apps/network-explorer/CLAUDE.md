# CLAUDE.md (apps/network-explorer)

> Last Updated: 2026-05-18
> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## 앱의 두 얼굴

network-explorer는 **두 가지 역할**을 동시에 수행함:

1. **블록 탐색기 (frontend)**: Sui 호환 탐색기 UI (`/src/`). 트랜잭션/객체/주소/검증자/체크포인트/잔액 상위/Analytics 페이지.
2. **에코시스템 포인트/리더보드 백엔드 (api-server)**: `apps/network-explorer/api-server/`. node-3에 colocation 운영되는 **단일 진실 소스 backend** for activity points, daily snapshot, weekly settlement, ban management, repost-bonus, referral-bonus. `https://explorer.nasun.io/api/v1/*`.

> **Why colocate api-server with sui-indexer on node-3**: scanner들이 sui_indexer DB(PostgreSQL)와 fullnode RPC를 동시에 읽으므로 same-host colocation으로 latency가 사라지고 네트워크 비용도 0. prod EC2(__PROD_EC2_HOST__)는 nasun.io + pado.finance + chat-server 트래픽을 이미 감당 중이라 부적합. 자세한 인프라는 [../../docs/infrastructure.md](../../docs/infrastructure.md) 참조.

> **Why frontend explorer는 일부러 단순함**: 자체 운영 devnet의 fullnode 1개 + validator 2개 단계라서 explorer가 "분산 인덱싱 가시화"보다 "단일 노드 운영 가시화"에 집중. testnet/mainnet 출시 시점에 분산성 의존 기능을 확장할 예정 (project_devnet_validator_count.md).

## UI 컴포넌트 (nasun 브랜딩)

Explorer는 nasun-website의 디자인 시스템을 기반으로 일관된 UI를 제공합니다.

### 컬러 팔레트

| 이름 | 용도 |
|------|------|
| `nasun-c3` | 성공, 긍정 (청록) |
| `nasun-c4` | 기본 인터랙티브 (파랑) |
| `nasun-c5` | 보조 인터랙티브 (진파랑) |
| `nasun-c6` | 다크 컨테이너 (네이비) |

**사용 금지**: `nasun-scarlet`, `nasun-coral` (빨간색 - 오류처럼 보임)

### UI 컴포넌트

```
src/components/ui/
├── Card.tsx        # 카드 컨테이너
├── SectionBox.tsx  # 섹션 박스 (타이틀 + 구분선)
└── index.ts
```

### 스타일 가이드

상세 스타일링 규칙은 `doc/UI_STYLING_GUIDE.md` 참조

### NFT 표시 컴포넌트

| 컴포넌트 | 용도 |
|---------|------|
| `NFTMedia` | 이미지/비디오 렌더링 (IPFS 지원) |
| `NFTCard` | NFT 카드 미리보기 (Address 페이지 그리드) |

#### 미디어 유틸리티 (`src/lib/media.ts`)

| 함수 | 용도 |
|------|------|
| `resolveMediaUrl()` | IPFS URL -> HTTP 게이트웨이 변환 |
| `getMediaType()` | URL에서 미디어 타입 감지 (image/video) |
| `getDisplayMediaUrl()` | Display 객체에서 우선순위 기반 URL 선택 |
| `isNFTObject()` | NFT 여부 판단 (image_url/animation_url 존재 확인) |

## 프로젝트 구조

```
apps/network-explorer/
├── src/
│   ├── main.tsx              # 엔트리 포인트
│   ├── App.tsx               # 라우터 설정
│   ├── pages/
│   │   ├── Home.tsx          # 홈 (네트워크 상태, 실시간 갱신)
│   │   ├── Transactions.tsx  # 트랜잭션 목록 (페이지네이션)
│   │   ├── Transaction.tsx   # 트랜잭션 상세
│   │   ├── Object.tsx        # 객체 상세
│   │   ├── Address.tsx       # 주소 상세 (TX 히스토리 포함)
│   │   ├── Validators.tsx    # 검증자 목록 (스테이킹 정보)
│   │   ├── Validator.tsx     # 검증자 상세
│   │   ├── Checkpoints.tsx   # 체크포인트 목록 (페이지네이션)
│   │   ├── Checkpoint.tsx    # 체크포인트 상세
│   │   ├── TopAccounts.tsx   # 잔액 상위 주소 (인덱서 API)
│   │   └── Analytics.tsx     # 네트워크 통계 + 인덱서 메트릭스
│   ├── components/
│   │   ├── ui/               # nasun 브랜딩 UI 컴포넌트
│   │   ├── analytics/        # 인덱서 차트 컴포넌트
│   │   ├── Header.tsx
│   │   ├── InfoRow.tsx
│   │   ├── NFTMedia.tsx      # NFT 미디어 렌더링
│   │   └── NFTCard.tsx       # NFT 카드 (Address 페이지)
│   └── lib/
│       ├── sui-client.ts     # SUI RPC 클라이언트
│       ├── explorer-api.ts   # 인덱서 API 클라이언트
│       ├── format.ts         # 포맷 유틸리티
│       └── media.ts          # NFT 미디어 유틸리티
├── api-server/               # Explorer API (Hono REST, 인덱서 데이터 조회)
├── doc/
│   └── UI_STYLING_GUIDE.md   # UI 스타일링 가이드
├── .env                      # 환경변수 (RPC URL)
└── index.html
```

## 개발 명령어

```bash
# 모노레포 루트에서
pnpm dev:network-explorer     # 개발 서버 시작
pnpm build:network-explorer   # 프로덕션 빌드

# 또는 이 폴더에서
pnpm dev
pnpm build
```

## 환경변수

```env
VITE_SUI_RPC_URL=https://rpc.devnet.nasun.io
VITE_NETWORK_NAME=Nasun Devnet
VITE_CHAIN_ID=272218f1
VITE_FAUCET_URL=https://faucet.devnet.nasun.io
```

## 주요 기능

1. **홈페이지**: 네트워크 상태 (5초 자동 갱신), 최근 TX (10초 자동 갱신)
2. **트랜잭션 목록**: `/transactions` 페이지 (cursor 기반 페이지네이션)
3. **트랜잭션 조회**: TX Digest로 상세 정보 조회
4. **객체 조회**: Object ID로 상세 정보 조회
5. **주소 조회**: 잔액, 소유 객체, **트랜잭션 히스토리** (최근 20개)
6. **검색 기능**: TX, Object, Address 통합 검색
7. **지갑 기능**: 내장 지갑 (생성/백업/복구/전송/Faucet)
8. **검증자 페이지**: 네트워크 스테이킹 요약, 검증자 목록 (APY, Commission, Stake)
9. **체크포인트 페이지**: 체크포인트 목록, 상세 정보 (TX 포함, 가스 비용)

### 라우트 구조

| 경로 | 설명 |
|------|------|
| `/` | 홈 (네트워크 상태, 최근 TX) |
| `/transactions` | TX 목록 (페이지네이션) |
| `/tx/:digest` | TX 상세 |
| `/object/:id` | 객체 상세 |
| `/address/:addr` | 주소 상세 (잔액, 객체, TX 히스토리) |
| `/validators` | 검증자 목록 (스테이킹 요약) |
| `/validator/:address` | 검증자 상세 |
| `/checkpoints` | 체크포인트 목록 (페이지네이션) |
| `/checkpoint/:sequence` | 체크포인트 상세 |
| `/top-accounts` | 잔액 상위 주소 (인덱서 API) |
| `/analytics` | 네트워크 통계 + 인덱서 메트릭스 |

> 컨트랙트 주소: `packages/devnet-config/devnet-ids.json` 참조

---

## api-server 핵심 모듈 (운영 critical)

| 경로 | 책임 |
|------|------|
| `api-server/src/index.ts` | Hono REST 진입점, `:3200` |
| `api-server/src/routes/ecosystem.ts` | `/score/:identityId`, `/snapshot/history`, PUT `/active-missions` |
| `api-server/src/routes/points.ts` | 포인트 부여 API (`/v3/leaderboard/points/*`, bug-report-reward, onboarding-bonus) |
| `api-server/src/routes/stats.ts` | 네트워크 통계 (top-accounts, tokens, daily-tx, daily-gas, active-addresses) |
| `api-server/src/routes/nasun-metrics.ts` | DAU/traders/gamers/verified 일일 메트릭 |
| `api-server/src/routes/ecosystem-ban.ts` | 사용자 ban/unban (forward-only or retroactive) |
| `api-server/src/scanner/points-scanner.ts` | 60s 폴링 + 일 1회 snapshot/reconcile 트리거 |
| `api-server/src/scanner/daily-snapshot.ts` | UTC 00:05 일일 ecosystem score 확정 (mission-aware) |
| `api-server/src/scanner/daily-referral-bonus.ts` | UTC 자정 후 referrer/referee 10% bonus 배치 |
| `api-server/src/scanner/daily-nft-check.ts` | staking V2 + Genesis passive (RPC_CONCURRENCY 20) |
| `api-server/src/scanner/health-update.ts` | NFT health 일일 갱신 (Alliance/Genesis multiplier) |
| `api-server/src/scanner/rpc-reconcile.ts` | RPC 야간 정합성 + snapshot 보정 (idempotent forward-only) |
| `api-server/src/scanner/invariant-audit.ts` | 1일 1회 chain consistency 감시 (anchor/sum/monotonic) |
| `api-server/src/workers/tier-worker.ts` | (2026-05-22 신규) NSI 별도 pm2 fork — 3 hourly cron 격리 가동, `daily-nft-check.ts`/`points-scanner.ts` 미접촉 |
| `api-server/src/scanner/staking-principal-sync.ts` | (2026-05-22 NSI) hourly `suix_getStakes` → `user_staking_daily_snapshots` (30일 sliding window) |
| `api-server/src/scanner/lp-position-sync.ts` | (2026-05-22 NSI) hourly cross-schema aggregate of `gostop.bankroll_event` → `user_lp_daily_snapshots` |
| `api-server/src/scanner/nsi-compute.ts` | (2026-05-22 NSI) hourly 5-stage join → `user_nsi`, monotone-up env-driven, bootstrap/stale guard |
| `api-server/src/routes/standing.ts` | (2026-05-22 NSI) `/api/v1/standing/by-address`, `/_/health`, `/_/distribution` |
| `api-server/src/rpc.ts` | 중앙 retry+backoff (5xx/timeout, 3회, jitter, Retry-After 존중) |
| `api-server/src/scripts/settle-pado.ts` | Pado 주간 정산 (Mon 00:15 UTC) |
| `api-server/src/scripts/settle-ecosystem.ts` | Ecosystem 주간 정산 (Mon 00:20 UTC) |
| `api-server/src/scripts/backfill-referral-bonus-day.ts` | (2026-05-18 신규) 누락된 일자의 referral batch 독립 재실행 |
| `api-server/src/scripts/repair-referral-aggregate-bug.ts` | (2026-05-18 신규) 5/11~17 silent dedup 복구 |
| `api-server/src/scripts/ban-users.ts` | 사용자 차단 (--identity-ids 옵션 지원) |
| `api-server/src/scripts/grant-repost-bonus.ts` | X 리포스트 사용자에게 3pt 일괄 부여 |

## Operational Invariants (자주 까먹는 것)

1. **포인트 단조 증가**: 모든 INSERT는 `ON CONFLICT DO NOTHING` + idempotent tx_digest. 사용자 ecosystem points는 절대 감소 불가 (feedback_points_monotonic_increase.md).
2. **`activity_points` TRUNCATE 금지**: `points-integrity-guard.sql`이 trigger로 차단. 우회 시 데이터 영구 손실.
3. **ban 진단은 DDB + PG 양쪽**: UserProfiles(DDB)와 banned_users + activity_points.flagged(PG)가 비동기화될 수 있음 (5/17 사고). 한 쪽만 보면 silent degrade (project_2026_05_17_ddb_pg_ban_async_recurrence.md).
4. **scanner partial-failure → daily-gate 유지**: RPC 503 등으로 staking-* 실패 시 daily gate를 닫지 않고 다음 cycle에서 재시도. 5/8 staking-daily 14k 미적립 사고에서 학습.
5. **snapshot fail-safe abort + lastSnapshotDate 동시 set 금지**: mid-day NFT activation 등으로 holder count 갑작스런 증가 시 abort 후 영구 lock된 5/18 사고. self-heal 로직 도입됨 (project_2026_05_18_referral_snapshot_lockout.md).
6. **Lambda env update는 REPLACE**: 일부 키만 보내면 나머지 env 전부 삭제. baram-executor 5/17 drift 사고. 항상 get-config 후 전체 set 푸시 또는 CDK deploy (feedback_lambda_env_replace_not_merge.md).
7. **WAF/CloudFront 변경 시 OPTIONS preflight 제외**: scopeDownStatement에 `NOT(method=OPTIONS)` 필수. 누락 시 admin/SPA 페이지가 차단 (feedback_waf_exclude_options_preflight.md).
8. **Snapshot은 절대 수정/재생성 금지**: 이미 생성된 리더보드 스냅샷 데이터는 공식 변경 불가 (feedback_no_modify_snapshots.md).

## 최근 30일 주요 변경 (요약)

- **Daily referral bonus 도입** (5/11): 전일 일일 포인트의 10% × 2/3 weight로 referrer에게 자동 배치
- **Repost bonus X API 자동화**: X API로 reposter 자동 fetch, batch 부여
- **RPC retry 중앙화** (rpc.ts): 5xx/timeout/AbortError 3회 backoff. daily-nft-check ad-hoc retry 제거 → 모든 caller 보호
- **daily-mission scanner 폐기** (5/11): dead code 제거. SCORE_CATEGORIES enum 항목은 historical row 보호 위해 유지
- **Ban 관리 고도화**: rank cap 1000, 2단계 unban flow (retroactive/forward-only), `--identity-ids` 옵션
- **Snapshot 안정화**: fail-safe self-heal, fetch retry, Telegram alert, dead-man-switch cron
- **Repair scripts 추가** (5/18): backfill-referral-bonus-day, repair-referral-aggregate-bug

---

## 참조 문서

| 문서 | 설명 |
|------|------|
| [doc/api-server.md](doc/api-server.md) | Explorer API Server (Hono REST, 엔드포인트, 배포) |
| [doc/deployment.md](doc/deployment.md) | 프론트엔드/API 배포 정보, RPC 테스트 명령어 |
| [docs/UI_STYLING_GUIDE.md](docs/UI_STYLING_GUIDE.md) | UI 스타일링 상세 가이드 |
| [docs/EXPLORER_ROADMAP.md](docs/EXPLORER_ROADMAP.md) | 로드맵 및 버전 히스토리 |
| [../../docs/ecosystem-points-system.md](../../docs/ecosystem-points-system.md) | 포인트 시스템 (단조 증가 불변식, 인시던트 학습) |
| [../../docs/pado-score-leaderboard.md](../../docs/pado-score-leaderboard.md) | Pado Score 리더보드 |
| [../../docs/infrastructure.md](../../docs/infrastructure.md) | node-3 인프라, DB 리셋, CloudFront/WAF |
| [../../docs/nsi-phase1-runbook.md](../../docs/nsi-phase1-runbook.md) | NSI (Nasun Standing Index) Phase 1 — tier-worker 배포·튜닝·롤백 (2026-05-22 신규) |
