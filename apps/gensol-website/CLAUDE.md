# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Always answer in Korean.**

## Project Overview

GEN SOL은 Nasun Network 위에 런칭하는 **Sci-Fi 유니버스 creative IP** 프로젝트입니다. Films, Games, News 섹션을 가진 미디어/엔터테인먼트 dApp으로, Sui 블록체인에서 NFT 및 거버넌스 기능을 제공하고 AWS Cognito로 사용자 인증을 처리합니다.

### Nasun Network와의 관계

- **Nasun Network** (`<MONOREPO>/nasun-website`): X(Twitter) 커뮤니티 관리 및 리더보드 인프라를 제공하는 상위 플랫폼
- **Gen Sol**: Nasun Network 위에서 운영되는 Sci-Fi 유니버스 IP
- 백엔드 API는 nasun-website/cdk에서 배포되는 AWS 인프라를 공유

## Development Commands

All commands run from the `frontend/` directory using pnpm:

```bash
pnpm install          # Install dependencies
pnpm dev              # Development server (localhost:5173)
pnpm build            # Type-check and production build
pnpm lint             # Run ESLint
pnpm format           # Format code with Prettier
pnpm test             # Run tests with Vitest
pnpm test:ui          # Run tests with Vitest UI
```

Environment-specific builds:
```bash
pnpm dev:test         # Dev server with test mode
pnpm dev:local        # Dev server with localnet
```

## Architecture

### Tech Stack
- **React 18 + TypeScript** with Vite for build tooling
- **Sui Blockchain** integration via `@mysten/dapp-kit` and `@mysten/sui`
- **AWS Amplify** for authentication (Cognito)
- **TanStack Query** for data fetching
- **Tailwind CSS** + Radix UI for styling/components

### Key Directories
- `src/pages/` - Top-level page components (HomePage, FilmsPage, GamesPage, etc.)
- `src/app/` - Feature-specific section components organized by domain (films/, games/, home/)
- `src/components/` - Reusable components (common/, features/, mypage/, ui/)
- `src/config/` - Configuration files (AWS, network, routes)
- `src/constants/` - Static data and blockchain package IDs
- `src/hooks/` - Custom React hooks
- `src/routes/` - Route components including PrivateRoute for auth-protected pages

### Routing
Routes are centralized in `src/config/routesConfig.ts` using `React.lazy` for code-splitting. Protected routes use `isProtected: true` flag and are wrapped with `PrivateRoute`.

### Blockchain Configuration
Network config is in `src/config/networkConfig.ts`. Package IDs for each network (localnet, devnet, testnet, mainnet) are defined in `src/constants/packageConstants.ts`. The active network is set via `VITE_NETWORK` environment variable.

### Path Aliases
- `@` maps to `src/`
- `@assets` maps to `src/assets/`

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `VITE_NETWORK` - Blockchain network (mainnet, testnet, devnet, localnet)
- `VITE_AWS_*` / `VITE_COGNITO_*` - AWS Cognito authentication settings
- `VITE_*_API_ENDPOINT` - Backend API endpoints (synced from nasun-website CDK deployment)

### API Endpoint Sync
When the backend (nasun-website/cdk) is redeployed, API Gateway URLs may change. Sync endpoints using:
```bash
cd <MONOREPO>
./scripts/sync-api-endpoints.sh
```

## Authentication System

Gen Sol은 Nasun Network와 동일한 AWS Cognito 인프라를 공유합니다.

### 지원하는 로그인 방식
1. **Google OAuth**: Cognito Identity Pool (Federated Identity)
2. **X(Twitter) OAuth 2.0**: nasun-website Lambda API (Developer Identity)
3. **MetaMask Web3**: nasun-website Lambda API (Developer Identity)

### 인증 관련 환경 변수
- `VITE_COGNITO_IDENTITY_POOL_ID`: Cognito Identity Pool ID (nasun과 공유)
- `VITE_GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `VITE_TWITTER_AUTH_API`: Twitter 인증 API 엔드포인트
- `VITE_METAMASK_AUTH_API`: MetaMask 인증 API 엔드포인트
- `VITE_USER_PROFILE_API`: 사용자 프로필 API 엔드포인트
- `VITE_LINK_ACCOUNT_API`: 계정 연동 API 엔드포인트

### 인증 관련 파일
- `src/providers/auth/AuthContext.tsx`: 인증 Provider (Google, Twitter, MetaMask 로그인)
- `src/stores/userStore.ts`: Zustand 사용자 상태 관리
- `src/components/auth/`: 로그인 UI 컴포넌트 (LoginModal, GoogleLoginButton, TwitterLoginButton, MetaMaskLoginButton)
- `src/utils/authUtils.ts`: 인증 유틸리티 함수
- `src/utils/metamaskUtils.ts`: MetaMask 지갑 유틸리티
- `src/services/metamaskApi.ts`: MetaMask 인증 API 클라이언트

### 백엔드 CDK 환경별 설정 (2025-12-16)

nasun-website CDK는 `NODE_ENV`에 따라 환경별 .env 파일을 로드합니다:

| NODE_ENV | 로드 파일 | 용도 |
|----------|-----------|------|
| `development` | `.env.development` | 로컬 개발 (localhost:5173, 개발용 Twitter 앱) |
| `production` (기본값) | `.env.production` | 프로덕션 배포 |

**배포 명령어**:
```bash
cd <MONOREPO>/nasun-website/cdk

# 개발 환경 배포 (localhost 테스트용)
NODE_ENV=development pnpm cdk deploy AuthStack

# 프로덕션 환경 배포
NODE_ENV=production pnpm cdk deploy AuthStack
# 또는 (기본값이 production)
pnpm cdk deploy AuthStack
```

**주요 차이점**:
- **Twitter OAuth**: 개발 앱 vs 프로덕션 앱 (redirect URI가 다름)
- **개발 앱**: `localhost:5173/callback`, `localhost:5174/callback` 지원
- **프로덕션 앱**: `nasun.io`, `gensol.io`, `staging.*` 도메인만 지원

**관련 파일**: `<MONOREPO>/nasun-website/cdk/bin/cdk.ts`

### 인증 플로우
```
[Sign In 버튼 클릭]
      ↓
[로그인 모달 표시]
  ├── Google → accounts.google.com → ID Token → Cognito Identity Pool → Identity ID
  ├── Twitter → nasun Lambda API → Twitter OAuth → Developer Identity → Identity ID
  └── MetaMask → Challenge → 서명 → Verify → Developer Identity → Identity ID
```

## WordPress Integration

The app fetches content from a WordPress backend. The dev server proxies `/wp-api` to `https://staging.gensol.io/content/wp-json`.

## Related Documentation

Nasun Network의 상세 문서는 `<MONOREPO>/nasun-website/CLAUDE.md` 참조:
- 인증 시스템 (Google OAuth, Twitter OAuth, MetaMask)
- X(Twitter) 리더보드 시스템
- AWS CDK 인프라 구조
- 배포 프로세스 및 트러블슈팅
