# CLAUDE.md (apps/nasun-website)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

## 기본 규칙

- 문서로 저장해달라는 프롬프트를 받으면 별도의 주문이 없는 이상 항상 `doc/` 경로에 저장하세요.
- 변경 이력은 [doc/CHANGELOG.md](doc/CHANGELOG.md) 참조

---

## 프로젝트 개요

**NASUN Website (nasun.io)** 는 Web3 프로젝트 "NASUN"의 공식 플랫폼입니다.

- **Production**: https://nasun.io
- **Staging**: https://staging.nasun.io
- **인프라**: AWS 서버리스 스택 (Lambda, DynamoDB, API Gateway, Step Functions)
- **아키텍처**: V3 통합 파이프라인 기반
- **위치**: `<MONOREPO>/apps/nasun-website`
- **브랜치**: `main`

---

## 주요 기능

### 1. Community Leaderboard (V3)
- 관리자 큐레이션 기반 커뮤니티 참여 순위 시스템
- 시즌 기반 독립 리더보드
- Top Climbers Spotlight, Rank Change Indicators
- 라우트: `/wave1/leaderboard`

### 2. 다중 인증 시스템
- **Google OAuth 2.0** - Cognito Federated Identity
- **Twitter OAuth 2.0** - Developer Identity
- **MetaMask Web3** - Developer Identity
- **Telegram** - Login Widget + Channel Membership Verification

### 3. 계정 연결 (Account Linking)
- 여러 인증 방식을 하나의 계정으로 통합
- 양방향 연결 (Primary ↔ Secondary)
- Telegram 채널 멤버십 검증 (Connect/Disconnect)

### 4. Governance
- Proposal 생성 및 투표
- VotingPower Certificate (Ed25519 서명)
- Sponsored Transaction (Poll 유형)

### 5. Battalion NFT Event
- Wave 1 Battalion NFT Free Mint Allowlist 등록 이벤트
- 라우트: `/wave1/battalion-nft`
- X (Twitter) 연동 태스크 검증 (Follow, Like, Retweet)
- Allowlist 등록/철회 + 관리자 대시보드

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

## 참조 문서

| 문서 | 설명 |
|------|------|
| [doc/architecture.md](doc/architecture.md) | 기술 스택 + 프로젝트 구조 |
| [doc/deployment.md](doc/deployment.md) | 개발 워크플로우 + 배포 프로세스 + 트러블슈팅 |
| [doc/CHANGELOG.md](doc/CHANGELOG.md) | 변경 이력 |
