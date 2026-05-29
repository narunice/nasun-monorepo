# CLAUDE.md (apps/nasun-website)

> Last Updated: 2026-05-18
> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## 기본 규칙

- 문서로 저장해달라는 프롬프트를 받으면 별도의 주문이 없는 이상 항상 `doc/` 경로에 저장하세요.
- 변경 이력은 [doc/CHANGELOG.md](doc/CHANGELOG.md) 참조
- **i18n 폐기**: runtime 다국어는 폐기됨. UI 텍스트는 영어 하드코딩이 원칙. `src/assets/locales/`는 잔존하나 `StaticTranslationProvider`로 빌드타임 정적 lookup만 수행 (key fallback). 다국어 추가 작업 금지.

---

## 프로젝트 개요

**NASUN Website (nasun.io)** 는 Nasun 에코시스템의 **identity / community / governance / NFT 이벤트 / Uju AI 허브** 입니다. 단순 사이트가 아니라 다른 모든 앱(Pado, Gostop, Network Explorer)이 의존하는 **인증·프로필·소셜·채팅 기반 레이어**.

- **Production**: https://nasun.io (CloudFront `__CLOUDFRONT_DIST__` → prod EC2)
- **Staging**: https://staging.nasun.io
- **인프라**: AWS 서버리스 (Lambda, DynamoDB, API Gateway, Step Functions, S3) + frontend(Vite/React) + chat-server(Hono/WS, port 3101) 멀티 컴포넌트
- **위치**: `<MONOREPO>/apps/nasun-website`
- **서브패키지**: `@nasun/nasun-website` (frontend), `@nasun/nasun-chat-server` (chat-server). 둘 다 같은 디렉토리 내 별도 deploy 사이클

> **Why this is the identity hub (not just a marketing site)**: 부트스트랩 자금 한계 + community-driven fundraising sequence(Vision → Prototype → Community → NFT → VC) 전략상, Nasun 사용자의 single source of truth(identity / linked accounts / NFT health / leaderboard rank / governance vote / agent vault)을 한 곳에 두는 게 비용·트러스트 양면에서 가장 효율적. Pado/Gostop은 nasun-website의 UserProfiles + chat-server identity-resolver에 의존.

---

## 주요 기능

### 1. Community Leaderboard (V3)
- 관리자 큐레이션 기반 커뮤니티 참여 순위
- 시즌 기반 독립 리더보드, Top Climbers Spotlight, Rank Change Indicators
- 라우트: `/community/creators-leaderboard` (구 `/wave1/leaderboard`는 redirect)

### 2. 다중 인증 시스템
- **Google OAuth 2.0** - Cognito Federated Identity
- **Twitter OAuth 2.0** - Developer Identity (현재는 my-account 별도 등록 전용. 레거시 로그인 흐름은 폐기, project_twitter_oauth_legacy.md)
- **MetaMask Web3** - Developer Identity (현재 실질 활용은 Genesis Pass NFT ownership 확인뿐. leaderboard/score/points 무관, reference_evm_link_scope.md)
- **Telegram** - Login Widget + Channel Membership Verification
- **Nasun 지갑 로그인** (primary)
- **Solana / SUI 추가 지갑 링킹** (2026-05 신규) — 외부 DeFi 포지션(Drift, Hyperliquid, Uniswap V3, Aave) 표시용. 읽기 전용 공시

### 3. 계정 연결 (Account Linking)
- 여러 인증 방식 + 외부 지갑(EVM/Solana/SUI)을 하나의 계정으로 통합
- 최소 1개의 인증 방법 유지 필요
- Telegram 채널 멤버십 검증 (Connect/Disconnect, 신호 토큰 GSI `telegramUserId-index` 활용)

### 4. Governance
- Proposal 생성 + 투표 + VotingPower Certificate (Ed25519 서명)
- Sponsored Transaction (Poll 유형)
- 라우트: `/community/governance`

### 5. Battalion NFT Event
- Wave 1 Battalion NFT Free Mint Allowlist 등록 이벤트
- 라우트: `/wave1/battalion-nft`
- X 연동 태스크 검증 (Follow, Like, Retweet)
- 3-tier verification 아키텍처 (아래 별도 절)

### 6. Uju AI Tab (`/my-account/*`)
- Nasun AI agent(=Baram의 후신)의 사용자 노출 면. Agent 생성, 설정, 활동, 미션, dashboard, chat, profile, apps registry, agent vault
- 실제 agent 실행은 별도 앱 `apps/nasun-ai-runtime/`이 담당. 본 앱은 UI + chat-server orchestration만
- 향후 `apps/uju/`로 1급 앱 분리 예정 (project_uju_independent_app.md). 현재는 nasun-website 섹션
- v1은 **TEE 없이 일반 LLM** 으로 운영. TEE/Nitro Enclave는 장기 로드맵 (project_baram_no_tee_v1.md)
- 외부 narrative/UI에서 "Baram" 금지, "Nasun AI"로 통일 (feedback_no_baram_branding.md). "bot" 대신 "AI agent" (feedback_agent_not_bot.md)

### 7. Genesis Pass / NFT Event 잔여
- Genesis Pass Drop은 영구 종료. admin 페이지는 read-only로 축소 예정 (project_genesis_pass_decommission.md). register/check Lambda는 my-account/link-account 의존으로 유지
- April Airdrop 인프라는 2026-04-25 디커미션 (project_airdrop_decommission.md)

---

## Battalion NFT: 3-Tier X API Verification Architecture

### 배경

X API Basic Plan ($200/month) 에서 100명 이상의 참여자를 처리하기 위한 최적화 아키텍처.

**X API Rate Limit 제약:**

| Endpoint | Rate Limit | 특성 |
|----------|-----------|------|
| `GET /2/tweets/:id/liking_users` | 75 req/15min (App) | 100명 cap |
| `GET /2/tweets/:id/retweeted_by` | 75 req/15min (App) | 100명 cap |
| `GET /2/users/:id/liked_tweets` | 75 req/15min (User) | Per-user limit |
| `GET /2/users/:id/timelines` | 1500 req/15min (User) | Per-user limit |

**핵심 문제**: tweet-centric 엔드포인트는 최대 100명만 반환 → 101번째 사용자부터 검증 불가.

### 아키텍처 개요

```
사용자 Verify 클릭
    ↓
┌─ Tier 1: DynamoDB Task Cache (walletAddress 기준) ──────────────┐
│  taskTracker.getAllTasks(walletAddress)                          │
│  → completed=true이면 X API 호출 스킵 (0 API calls)            │
└──────────────────────────────────────────────────────────────────┘
    ↓ cache miss
┌─ Tier 2: Engagement Polling Cache (xUserId 기준) ───────────────┐
│  engagementCache.checkBoth(xUserId)                             │
│  → PK: __LIKE_CACHE__ / __RETWEET_CACHE__                      │
│  → Background Lambda가 5분마다 폴링한 결과 (0 API calls)       │
└──────────────────────────────────────────────────────────────────┘
    ↓ cache miss (100명 초과 시)
┌─ Tier 3: User Context OAuth Fallback ───────────────────────────┐
│  xApiClient.checkLikedUserContext(userId, xAccessToken)         │
│  xApiClient.checkRetweetedUserContext(userId, xAccessToken)     │
│  → 사용자별 rate limit 사용 (앱 rate limit 소비 0)             │
└──────────────────────────────────────────────────────────────────┘
```

### Lambda 구성

| Lambda | 트리거 | 역할 |
|--------|--------|------|
| `nasun-nft-verify-eligibility` | API Gateway | 3-tier 검증 실행 |

### DynamoDB 캐시 설계 (nasun-nft-event-tasks 테이블 재활용)

| walletAddress (PK) | taskType (SK) | 용도 |
|---|---|---|
| `__LIKE_CACHE__` | `{xUserId}` | Engagement polling: Like 캐시 |
| `__RETWEET_CACHE__` | `{xUserId}` | Engagement polling: Retweet 캐시 |
| `0x1234...` / `{xUserId}` | `LIKE` | Tier 1: 사용자별 검증 결과 |
| `0x1234...` / `{xUserId}` | `RETWEET` | Tier 1: 사용자별 검증 결과 |

### X API 인증 방식

| Lambda | 인증 방식 | 이유 |
|--------|----------|------|
| `verify-eligibility` Tier 3 | OAuth 2.0 User Context (xAccessToken) | 사용자별 rate limit 활용, 앱 rate limit 소비 안 함 |

### MetaMask 미연결 시 동작

- **Step 3 (검증)**: `walletAddress || xUserId` 폴백 → MetaMask 없이도 검증 가능
- **Step 5 (등록)**: MetaMask 지갑 주소 필수
- **Tier 1 캐시 키 불일치**: xUserId로 저장 후 MetaMask 주소로 조회 시 miss → Tier 2에서 커버

### 관련 파일

```
cdk/lambda-src/nft-event/
└── verify-eligibility/                 # 3-Tier Verification Lambda
    └── src/services/
        ├── verificationService.ts      # 3-tier orchestration logic
        ├── engagementCache.ts          # Tier 2 cache lookup (graceful miss → Tier 3)
        ├── xApiClient.ts              # X API calls (App-Only + User Context)
        └── taskTracker.ts             # Tier 1 DynamoDB task cache

cdk/lib/nft-event-stack.ts             # CDK: NFT Event 인프라
```

---

## Telegram Channel Verification

### 배경

커뮤니티 참여도를 높이기 위해 Telegram 채널 멤버십 검증을 도입. 사용자가 Telegram 계정을 연결하고 공식 채널에 가입했는지 확인하여 리더보드에 체크마크(하늘색 배지)를 표시합니다.

### 아키텍처

```
사용자 "Connect" 클릭 (My Account)
    ↓
┌─ Step 1: Telegram Login Widget ───────────────────────────────┐
│  공식 Telegram Login Widget (popup 방식)                       │
│  → 인증 성공 시 auth_date, hash, id, username 반환            │
└───────────────────────────────────────────────────────────────┘
    ↓
┌─ Step 2: Backend Verification (verify-telegram Lambda) ───────┐
│  1. JWT → identityId 추출                                      │
│  2. HMAC-SHA256 해시 검증 (Bot Token 기반)                     │
│  3. auth_date 유효성 검증 (5분 이내)                           │
│  4. Telegram Bot API → getChatMember 채널 멤버십 확인          │
│  5. UserProfiles 중복 검사 (telegramUserId-index GSI Query)   │
│  6. UserProfiles 업데이트 (isTelegramMember, telegramUserId)  │
│  7. Accounts/SeasonAccounts 동기화 (twitterHandle 존재 시)    │
└───────────────────────────────────────────────────────────────┘
```

### Lambda 구성

| Lambda | 메서드 | 엔드포인트 | 역할 |
|--------|--------|-----------|------|
| `verify-telegram` | POST | `/v3/leaderboard/verify-telegram` | 인증 + 채널 검증 + DB 업데이트 |
| `telegram-status` | GET | `/v3/leaderboard/telegram-status` | 연결 상태 조회 |
| `disconnect-telegram` | POST | `/v3/leaderboard/disconnect-telegram` | 연결 해제 |

### DynamoDB 설계

**UserProfiles 테이블 (기존 테이블에 필드 추가):**

| 필드 | 타입 | 설명 |
|------|------|------|
| `isTelegramMember` | Boolean | 채널 멤버십 상태 |
| `telegramUserId` | String | Telegram User ID |
| `telegramUsername` | String | Telegram @username |

**GSI: `telegramUserId-index`** (2026-02-24 추가):
- Partition Key: `telegramUserId`
- Projection: KEYS_ONLY
- 용도: 중복 검사 시 O(1) Query (기존 Scan → Query 최적화)

### 환경 변수

| 변수명 | 설명 | 저장 위치 |
|--------|------|----------|
| `TELEGRAM_BOT_TOKEN_SECRET_NAME` | Secrets Manager 시크릿 이름 | CDK .env |
| `TELEGRAM_CHANNEL_USERNAME` | 검증 대상 채널 (예: `@nasun_io`) | CDK .env |
| `VITE_TELEGRAM_BOT_ID` | Login Widget용 Bot ID | Frontend .env |

### 프론트엔드 구성

| 파일 | 역할 |
|------|------|
| `sections/myAccount/hooks/useTelegramVerify.tsx` | Telegram 연결/해제 로직 |
| `sections/myAccount/ProfileHeroCard.tsx` | AccountItem에 Telegram 행 추가 |
| `sections/myAccount/components/AccountItem.tsx` | "telegram" provider 지원 |
| `sections/myAccount/components/AccountIcons.tsx` | Telegram 아이콘 |
| `sections/myAccount/components/StatusBadges.tsx` | Telegram 상태 배지 |

### 보안

- HMAC-SHA256 해시 검증: Telegram Login Widget 데이터의 무결성 확인 (Bot Token 기반)
- auth_date 유효성: 5분 이내의 인증 데이터만 수락 (replay attack 방지)
- Bot Token: AWS Secrets Manager에 저장 (환경 변수에 직접 노출하지 않음)
- 중복 방지: telegramUserId-index GSI로 1개 Telegram 계정 = 1개 Nasun 계정 보장

---

## 인증 시스템 아키텍처

```
[클라이언트]
    ↓
[인증 방식 선택]
    ├── Google OAuth → [Cognito Federated Identity]
    ├── Twitter OAuth → [Lambda] → [Cognito Developer Identity]
    ├── MetaMask → [Lambda] → [Cognito Developer Identity]
    └── Telegram → [Login Widget] → [Lambda: verify-telegram] → [UserProfiles 업데이트]
    ↓
[Cognito Identity Pool]
    ↓
[AWS Credentials + Identity ID]
    ↓
[UserProfiles DynamoDB Table]
```

**Note**: Telegram은 Cognito Identity를 생성하지 않음. 기존 Cognito 인증 사용자가 Telegram 계정을 **연결(Link)**하는 방식.

### MetaMask 인증 플로우

```typescript
// 1. Challenge 요청
POST /auth/metamask/challenge
Body: { "walletAddress": "0x..." }
Response: { "nonce": "abc123...", "message": "Sign this message..." }

// 2. Verify 요청
POST /auth/metamask/verify
Body: { "walletAddress": "0x...", "signature": "0x...", "nonce": "abc123..." }
Response: { "identityId": "...", "token": "..." }
```

**보안**:
- Nonce는 5분 TTL (DynamoDB)
- 서명 검증 후 nonce 즉시 삭제
- Ethereum 주소는 소문자로 정규화

---

## 주요 고려사항

### MetaMask 인증
- Development: Sepolia Testnet (Chain ID: 11155111)
- Production: Ethereum Mainnet (Chain ID: 1)
- Nonce 5분 TTL, 서명 검증 후 즉시 삭제

### 계정 연결
- 최소 1개의 인증 방법 유지 필요
- 양방향 연결 정보 동기화 중요

### Lambda 배포
- auth-twitter: 반드시 npm 사용 (pnpm 금지)
- node_modules 포함 확인 필수

### 환경 변수
- Vite: `VITE_` 프리픽스 필수
- 민감 정보: AWS Secrets Manager 사용

---

## chat-server (apps/nasun-website/chat-server)

같은 앱 디렉토리 하위에 별도 서브패키지(`@nasun/nasun-chat-server`)로 존재. **nasun + pado + (필요 시) gostop 공용** unified chat server. port 3101. systemd 또는 pm2로 prod EC2(__PROD_EC2_HOST__) 단일 인스턴스 운영. staging은 의도적 off (project_staging_chat_server_off.md).

| 책임 | 모듈 |
|------|------|
| Entry + Hono mount | `server.ts` |
| 메시지/룸 | `rooms.ts`, `store.ts` (SQLite WAL) |
| 인증/봇 차단 | `auth.ts`, `banned-loader.ts`, `admin-loader.ts` |
| Aggregator (worker_threads 분리) | `aggregator.ts` (main), `aggregator-worker.ts` (worker) |
| Identity ↔ wallet 매핑 | `identity-resolver.ts` (WALLET_MAPPINGS_URL fetch + S3 presigned offload + gzip 감지) |
| AI chatbot | `ai-chatbot.ts`, `market-narrator.ts` |
| Uju AI agent | `agent-orchestrator.ts`, `agent-vault-routes.ts`, `agent-vault-killswitch.ts`, `nasun-ai-config-routes.ts` |
| Baram (legacy alias) | `baram-session.ts`, `baram-intent-classifier.ts`, `baram-agent-registry.ts`, `baram-message-caps.ts`, `baram-proposals.ts`, `baram-telegram.ts`, `baram-telegram-routes.ts` |
| Leaderboard API | `leaderboard-api.ts`, `leaderboard-store.ts`, `leaderboard-mapper.ts`, `leaderboard-types.ts` |
| Pado 전용 | `pado-idea-api.ts`, `/api/pado/*` 라우트 |
| 가격 | `price-tracker.ts` |
| Crash 게임 (운영 중단) | `crash/` (CRASH_ENABLED=false 영구 유지, project_crash_game_indefinite_shutdown.md) |
| Sanitization | `sanitize.ts` |
| SUI capability | `sui-capability-utils.ts` |

> **Why crash 게임 무기한 중단**: race condition fix가 negative ROI라 우선순위 0. CRASH_ENABLED=false 영구 유지 (.env + ecosystem.cjs). 재개 결정 시 fix 선행 필수 (project_crash_game_indefinite_shutdown.md).

> **Why WALLET_MAPPINGS 빈 캐시는 warn 이상 로깅**: 5/4 W19 weekly DeFi 리더보드가 비어 있던 사고가 새 env var 의존 + S3 gzip 미해제 + 빈 캐시 info 로그 조합으로 silent하게 발생. 외부 fetch로 로드하는 critical 캐시가 0건이면 warn 이상으로 로깅 (feedback_warn_on_empty_critical_cache.md).

## CDK 스택 (apps/nasun-website/cdk/lib)

| 스택 | 역할 |
|------|------|
| `common-stack.ts` | VPC, 보안, 기본 |
| `auth-stack.ts` | Cognito + Google/Twitter/MetaMask/Telegram Lambda |
| `leaderboard-v3-stack.ts` | 리더보드 V3 DynamoDB/Lambda/API GW |
| `nft-event-stack.ts` | Battalion NFT 3-tier verification |
| `nft-snapshot-stack.ts` | NFT 스냅샷 스케줄러 |
| `governance-stack.ts` | 거버넌스 (제안/투표/VotingPower) |
| `admin-stack.ts` | 관리자 (whitelist export, user mgmt) |
| `referral-stack.ts` | 리퍼럴 |
| `bug-report-stack.ts` | 버그 리포트 수집/관리 (Pado feedback도 같은 테이블 공유) |
| `ecosystem-stack.ts` | 에코시스템 |
| `devnet-metrics-stack.ts` | Devnet 메트릭 대시보드 |
| `genesis-pass-stack.ts` | Genesis Pass (디커미션 진행 중) |
| `agent-vault-stack.ts` | Uju AI agent 자산 보관 |
| `monitoring-stack.ts` | CloudWatch + 알림 |
| `shared-waf-stack.ts` | CloudFront WAF (3-rule, 8000/5min cap, OPTIONS 제외, KP/CU/SY blacklist) |

## Operational Invariants (자주 까먹는 것)

1. **Prod 배포는 항상 pnpm 스크립트**: `pnpm deploy:nasun-website:prod`. raw rsync 금지 (같은 EC2에 pado/gostop 공존, app-id marker로 cross-app 덮어쓰기 차단). 5/3 사고 후 강제 (feedback_no_raw_rsync_to_prod.md).
2. **빌드 후 env-verify 필수**: `/env-verify nasun-website`로 `dist/assets/*.js`에 `VITE_*` 값이 embed되었는지 검증. 누락/stale 시 재빌드.
3. **chat-server prod 재시작은 delete+start**: 새 env 키 도입 시 `pm2 startOrRestart` 부족, delete+start 필요 (feedback_pm2_hard_restart_for_new_env.md, feedback_pm2_daemon_env_resolution.md).
4. **Stateless i18n**: `useStaticTranslation()` hook은 빌드타임에 fix. 새 key는 `src/assets/locales/en/`에 추가하지만 runtime 언어 전환 코드 추가 금지.
5. **외부 지갑 (MetaMask/Solana) 링킹은 읽기 전용 공시**: 트랜잭션 권한 없음. Genesis Pass NFT 확인 + 외부 DeFi 포지션 표시용. 보안 논의는 이 좁은 범위로 (reference_evm_link_scope.md).
6. **Twitter OAuth Lambda 빌드는 반드시 npm 사용** (pnpm 금지): `auth-twitter` Lambda는 node_modules 포함 zip이어야 정상 동작.
7. **버그 리포트 답장 정책**: declined/wont-fix는 0pt, positive-feedback은 accepted/2pt, Pado feedback은 후한 3-5pt. 답장 본문에 포인트 언급 금지. 자세한 규칙은 [docs/bug-report-system.md](docs/bug-report-system.md) §6 운영 invariants.
8. **알파 kill-recovery 24h grace** (2026-05-25): `handleVaultDelete`가 `grantKillRecoveryInvite()`를 호출하여 kill한 wallet에 24h `invited` 슬롯 재발급. 미적용 시 kill한 사용자가 60명 대기열 뒤로 밀려 silent disenfranchisement. `phaseInvite.countActiveAndPending`이 `invited`를 카운트하여 cap 보존. tunable `NASUN_AI_ALPHA_KILL_GRACE_MS`. 자세한 사항: 메모리 [project_2026_05_25_alpha_kill_disenfranchisement.md](../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_25_alpha_kill_disenfranchisement.md).
9. **baram-executor Lambda는 single-signer** (2026-05-25): `baram/executor` Secrets Manager에 1개 private key만 보유 → 모든 agent traffic이 단일 executor address로 routing됨. chain에 4개 executor가 등록돼 있어도 Lambda는 그 중 1개만 sign 가능. `chat-server agent-orchestrator.pickExecutorAddress()`가 comma-list 지원하지만 prod는 단일 값 유지 필수 — multi-list로 바꾸면 `/infer preflight denied: executor_mismatch` 발생. Lambda multi-signer 구현 후에만 .env를 comma-list로 flip. 메모리 [project_2026_05_25_baram_executor_single_signer.md](../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_25_baram_executor_single_signer.md).
10. **baram-executor gas는 keeper-gas-watchdog가 자동 refill** (2026-05-25): 4개 executor 중 3개 (`baram-exec-1/2/3`)가 `pado-bots/.env`의 `KEEPER_GAS_TARGETS`에 등록됨. 1h cycle, 1000 NSN 미만 시 100k NSN으로 충전. 4번째 `0xe1c4` (treasury 겸용)은 동일 watchdog의 `price-updater` entry로 이미 모니터링. memory [project_keeper_gas_watchdog.md](../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_keeper_gas_watchdog.md).
11. **홈페이지 anchor (이 세션의 시간 낭비 사고 재발 방지)**: prod route `/`이 마운트하는 컴포넌트는 [src/pages/dev/DevHomePage.tsx](frontend/src/pages/dev/DevHomePage.tsx) → [src/sections/dev/home/DevHomeHeroSection.tsx](frontend/src/sections/dev/home/DevHomeHeroSection.tsx). 폴더명 `dev/`는 misnomer — 실제 prod. 자산: `/videos/Triangle-B&W-Light-Fixed-web.mp4`, `/images/posters/Triangle-BW-Light-Fixed-poster.webp`. **아래는 archive이며 prod 영향 없음**: `src/pages/legacy/Home2026MayPage.tsx`(`/archive/home-may2026`), `src/sections/home/legacy/may2026/*`, `src/pages/legacy/Home2026AprilPage.tsx`(`/legacy/home2026april`), `src/sections/home/legacy/*`. 또한 `src/sections/dev/home/{ChSection,FadeInUp,dev-home.css}` 및 `src/sections/dev/_shared/*`는 pado/about와 **공유되는 primitive**이므로 단순 rename/move 금지 (cross-app 회귀). 홈/about/pado 자산을 수정하기 전 이 anchor를 먼저 확인할 것.

## 최근 30일 주요 변경 (요약)

- **Solana / SUI 추가 지갑 링킹**: signature-verified linking + Connected Wallets card (외부 DeFi 포지션 표시용)
- **Drift / Hyperliquid / Uniswap V3 / Aave 포지션 카드**: Uju dashboard에 통합
- **Uju AI dogfood UX 개선**: trader config 동기화, Quickstart-aware UX, PR1A_SWAP_DISABLED 전파
- **Nasun AI route 추가**: `/ecosystem/nasun-ai`, Baram 소프트 리다이렉트, VITE_NASUN_AI_ENABLED feature flag
- **chat-server CORS 확장**: nasun/pado/gostop 스테이징 origin 허용
- **Turnstile 완전 제거** (2026-05-16): chat + pado + nasun
- **Per-app 지갑 binding**: external wallet → per-app scope (security boundary)
- **Alpha kill-recovery + executor 안정화** (2026-05-25): kill한 사용자가 잃은 슬롯 복구하는 `grantKillRecoveryInvite` (24h grace) + killed-state UI gate-aware CTA + baram-executor pool gas-watchdog 등록 + multi-executor round-robin scaffold (Lambda single-signer 한계로 inert)

---

## 참조 문서

| 문서 | 설명 |
|------|------|
| [doc/architecture.md](doc/architecture.md) | 기술 스택 + 프로젝트 구조 |
| [doc/deployment.md](doc/deployment.md) | 개발 워크플로우 + 배포 프로세스 + 트러블슈팅 |
| [doc/CHANGELOG.md](doc/CHANGELOG.md) | 변경 이력 |
| [docs/bug-report-system.md](docs/bug-report-system.md) | 버그/피드백 시스템 (Pado feedback 공유 포함) |
| [doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md](doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md) | Ecosystem 리더보드 구현 (점수 공식, 주간 정산, 인시던트 학습) |
| [../../docs/ecosystem-points-system.md](../../docs/ecosystem-points-system.md) | 포인트 시스템 전반 (단조 증가 불변식, 인시던트 학습) |
| [../../docs/pado-score-leaderboard.md](../../docs/pado-score-leaderboard.md) | Pado Score 리더보드 (chat-server 통합) |
| [../../docs/infrastructure.md](../../docs/infrastructure.md) | 인프라 (EC2, CloudFront, WAF, chat-server, PM2) |
