# CLAUDE.md (apps/nasun-website)

> 공통 규칙(언어 설정, UI 언어 규칙)은 루트 [CLAUDE.md](../../CLAUDE.md) 참조

**Last Updated**: 2026-01-31
**Version**: 2.21.0 (3-tier X API verification for 100+ participants)

## 기본 규칙

- 문서로 저장해달라는 프롬프트를 받으면 별도의 주문이 없는 이상 항상 `doc/` 경로에 저장하세요.

---

## 변경 이력

> 과거 업데이트 이력은 [doc/CHANGELOG.md](doc/CHANGELOG.md) 참조

---

## 프로젝트 개요

### 나선 프로젝트 전체 구성

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Nasun Project                                 │
├─────────────────────────────────────────────────────────────────────┤
│  nasun-website             nasun-devnet           network-explorer  │
│  ─────────────────        ─────────────────      ─────────────────  │
│  공식 웹사이트              블록체인 노드           블록 탐색기        │
│  • 리더보드 V3             • SUI 포크             • TX/Block 조회    │
│  • Governance              • 2노드 Validator      • 주소/객체 조회   │
│  • NFT 이벤트              • Faucet 서비스        • 네트워크 상태    │
│  • OAuth 인증              • 스마트 컨트랙트      • 검색 기능        │
└─────────────────────────────────────────────────────────────────────┘
```

**NASUN Website (nasun.io)**는 Web3 프로젝트 "NASUN"의 공식 플랫폼입니다.

### 현재 상태

- **Production**: https://nasun.io
- **Staging**: https://staging.nasun.io
- **인프라**: AWS 서버리스 스택 (Lambda, DynamoDB, API Gateway, Step Functions)
- **아키텍처**: V3 통합 파이프라인 기반

### 저장소

- **위치**: `<MONOREPO>/apps/nasun-website`
- **브랜치**: `main`

---

## 기술 스택

### 프론트엔드
- **Framework**: React 19 + Vite 7
- **Language**: TypeScript 5.9
- **UI**: Radix UI + Tailwind CSS 3.4
- **상태 관리**: Zustand
- **국제화**: i18next
- **Web3**: ethers.js 6.x

### 백엔드 (AWS CDK)
- **IaC**: AWS CDK (TypeScript)
- **Runtime**: Node.js 18.x
- **Lambda**: TypeScript + esbuild

### 인프라 (AWS)
- **Compute**: Lambda
- **Database**: DynamoDB
- **Auth**: Cognito
- **API**: API Gateway (REST)
- **Orchestration**: Step Functions

---

## 프로젝트 구조

```
nasun-website/
├── frontend/                      # React 프론트엔드
│   ├── src/
│   │   ├── components/           # React 컴포넌트
│   │   ├── services/             # API 클라이언트
│   │   ├── providers/            # Context Providers
│   │   ├── stores/               # Zustand 스토어
│   │   └── i18n/                 # 국제화 설정
│   ├── .env.development
│   ├── .env.production
│   └── vite.config.ts
│
├── cdk/                          # AWS CDK 인프라
│   ├── lib/                      # CDK 스택 정의
│   ├── lambda-src/               # Lambda 함수 소스
│   │   ├── auth-metamask/        # MetaMask 인증
│   │   ├── auth-twitter/         # Twitter OAuth
│   │   ├── link-account/         # 계정 연결
│   │   └── nft-event/            # Battalion NFT Event
│   │       ├── verify-eligibility/   # 3-Tier 검증
│   │       ├── poll-engagement/      # Engagement 폴링
│   │       ├── register-user/        # Allowlist 등록
│   │       ├── admin-users/          # 관리자 대시보드
│   │       ├── withdraw-user/        # 등록 철회
│   │       └── check-registration-status/  # 등록 상태 확인
│   └── .env
│
└── doc/                          # 프로젝트 문서
    └── CHANGELOG.md              # 과거 업데이트 이력
```

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

### 3. 계정 연결 (Account Linking)
- 여러 인증 방식을 하나의 계정으로 통합
- 양방향 연결 (Primary ↔ Secondary)

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
| `nasun-nft-poll-engagement` | EventBridge (5분) | liking_users + retweeted_by 폴링 → DynamoDB 캐시 |

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
| `poll-engagement` | OAuth 1.0a (API Key + Access Token) | X API Basic Plan에서 tweet-centric 엔드포인트는 User Context 필수 |
| `verify-eligibility` Tier 3 | OAuth 2.0 User Context (xAccessToken) | 사용자별 rate limit 활용, 앱 rate limit 소비 안 함 |

### MetaMask 미연결 시 동작

- **Step 3 (검증)**: `walletAddress || xUserId` 폴백 → MetaMask 없이도 검증 가능
- **Step 5 (등록)**: MetaMask 지갑 주소 필수
- **Tier 1 캐시 키 불일치**: xUserId로 저장 후 MetaMask 주소로 조회 시 miss → Tier 2에서 커버

### 관련 파일

```
cdk/lambda-src/nft-event/
├── poll-engagement/                    # Tier 2 Background Polling Lambda
│   ├── src/index.ts                   # EventBridge handler (OAuth 1.0a)
│   └── src/services/engagementPoller.ts  # X API polling + DynamoDB cache
│
└── verify-eligibility/                 # 3-Tier Verification Lambda
    └── src/services/
        ├── verificationService.ts      # 3-tier orchestration logic
        ├── engagementCache.ts          # Tier 2 cache lookup
        ├── xApiClient.ts              # X API calls (App-Only + User Context)
        └── taskTracker.ts             # Tier 1 DynamoDB task cache

cdk/lib/nft-event-stack.ts             # CDK: Lambda 6 + EventBridge Rule
```

---

## 인증 시스템

### 인증 아키텍처

```
[클라이언트]
    ↓
[인증 방식 선택]
    ├── Google OAuth → [Cognito Federated Identity]
    ├── Twitter OAuth → [Lambda] → [Cognito Developer Identity]
    └── MetaMask → [Lambda] → [Cognito Developer Identity]
    ↓
[Cognito Identity Pool]
    ↓
[AWS Credentials + Identity ID]
    ↓
[UserProfiles DynamoDB Table]
```

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

## 개발 워크플로우

### 로컬 개발

```bash
# 프론트엔드 개발 서버
cd frontend && pnpm dev
# http://localhost:5174

# Lambda 빌드
cd cdk/lambda-src/auth-metamask && npm run build
```

### CDK 배포

```bash
cd cdk

# 개발 환경 배포
pnpm deploy:dev

# 프로덕션 환경 배포
pnpm deploy:prod
```

**배포 스크립트가 자동 처리하는 작업:**
- Lambda 빌드 및 검증
- 환경별 .env 파일 전환
- AWS 자격 증명 검증
- CDK synth/diff

---

## 배포 프로세스

### 프론트엔드 배포

```bash
cd frontend
npm run build
# dist/ 폴더를 EC2로 배포
```

### 백엔드 배포

```bash
cd cdk
pnpm deploy:prod  # 프로덕션
pnpm deploy:dev   # 개발
```

### 배포 후 검증

```bash
# Lambda 로그 확인
aws logs tail /aws/lambda/nasun-auth-metamask --follow

# API 테스트
curl -X POST https://API_URL/prod/auth/metamask/challenge \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "0x..."}'
```

---

## 트러블슈팅

### Lambda "Cannot find module" 에러

```typescript
// CDK에서 전체 디렉토리 배포
code: lambda.Code.fromAsset('lambda-src/auth-metamask'),
handler: 'dist/index.handler',
```

### Twitter 로그인 502 에러

```bash
cd cdk/lambda-src/auth-twitter
rm -rf node_modules package-lock.json
npm install && npm run build
cd ../../ && pnpm cdk deploy AuthStack
```

### Nonce expired 에러

- Nonce는 5분 후 자동 만료
- 로그인 프로세스를 처음부터 재시작

---

## 문서 참조

### 프로젝트 문서 (doc/)
- [CHANGELOG.md](doc/CHANGELOG.md) - 과거 업데이트 이력
- [METAMASK_IMPLEMENTATION_PLAN.md](doc/METAMASK_IMPLEMENTATION_PLAN.md) - MetaMask 구현 계획
- [LEADERBOARD_MECHANISM_GUIDE.md](doc/LEADERBOARD_MECHANISM_GUIDE.md) - 리더보드 메커니즘
- [BUILD_CONFIGURATION_GUIDE.md](doc/BUILD_CONFIGURATION_GUIDE.md) - 빌드 설정 가이드
- [LAMBDA_CREATION_GUIDE.md](doc/LAMBDA_CREATION_GUIDE.md) - Lambda 생성 가이드

### CDK 문서
- [cdk/README.md](cdk/README.md) - CDK 상세 가이드
- [cdk/DEPLOYMENT_CHECKLIST.md](cdk/DEPLOYMENT_CHECKLIST.md) - 배포 체크리스트

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

**문서 버전**: 2.21.0
**마지막 업데이트**: 2026-01-31
