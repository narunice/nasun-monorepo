# Architecture (nasun-website)

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
│   │   ├── leaderboard-v3/       # Leaderboard V3 + Telegram
│   │   │   └── src/handlers/
│   │   │       ├── verify-telegram.ts      # Telegram 인증 + 채널 검증
│   │   │       ├── disconnect-telegram.ts  # Telegram 연결 해제
│   │   │       ├── telegram-status.ts      # Telegram 연결 상태 조회
│   │   │       ├── get-leaderboard.ts      # 리더보드 조회
│   │   │       ├── create-post.ts          # 포스트 등록
│   │   │       ├── generate-snapshot.ts    # 일일 스냅샷
│   │   │       └── ...                     # 기타 핸들러
│   │   └── nft-event/            # Battalion NFT Event
│   │       ├── verify-eligibility/   # 3-Tier 검증
│   │       ├── register-user/        # Allowlist 등록
│   │       ├── admin-users/          # 관리자 대시보드
│   │       ├── withdraw-user/        # 등록 철회
│   │       └── check-registration-status/  # 등록 상태 확인
│   └── .env
│
└── doc/                          # 프로젝트 문서
    └── CHANGELOG.md              # 과거 업데이트 이력
```
