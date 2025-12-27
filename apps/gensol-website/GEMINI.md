---
Always answer in Korean.
---

## Project Overview

This project is a decentralized application (dApp) built with a modern web stack. The frontend is developed using **React** and **TypeScript**, with **Vite** for fast build tooling and **Tailwind CSS** for styling. The application is designed to interact with various blockchain technologies, as indicated by the presence of libraries like `@iota/dapp-kit` and `@mysten/dapp-kit`, and it also integrates with AWS services through `@aws-amplify`.

The project structure is well-organized, with a clear separation of concerns. The `frontend` directory contains all the source code, including components, pages, routes, and configuration files. The routing is centralized in `src/config/routesConfig.ts`, which uses `React.lazy` for efficient code-splitting. The application also seems to fetch data from a WordPress backend, as suggested by the proxy configuration in `vite.config.ts`.

## Building and Running

To get the project up and running, follow these steps:

1.  **Install Dependencies:**
    The project uses `pnpm` for package management. To install the necessary dependencies, run the following command in the `frontend` directory:
    ```bash
    pnpm install
    ```

2.  **Run in Development Mode:**
    To start the development server, use the following command:
    ```bash
    pnpm dev
    ```
    This will start the application in development mode, and you can view it in your browser at `http://localhost:5173`.

3.  **Build for Production:**
    To create a production build of the application, run:
    ```bash
    pnpm build
    ```
    This will generate a `dist` directory with the optimized and minified files ready for deployment.

## Development Conventions

*   **Package Manager:** The project uses `pnpm` as its package manager.
*   **Styling:** Styling is done using **Tailwind CSS**.
*   **Type Checking:** **TypeScript** is used for static type checking.
*   **Linting:** **ESLint** is set up for code linting. You can run the linter with `pnpm lint`.
*   **Routing:** Routing is handled by `react-router-dom`, with a centralized configuration in `src/config/routesConfig.ts`.
*   **Code Splitting:** The project uses `React.lazy` for code splitting, which helps to improve the application's performance.
*   **Aliases:** The project uses aliases for easier imports. For example, `@` is an alias for the `src` directory.

## Backend API Integration

### ⚠️ 백엔드 배포 후 환경변수 동기화 필수!

이 프로젝트는 `nasun-website/cdk`에서 배포되는 AWS API Gateway 엔드포인트를 사용합니다. 백엔드를 재배포하면 API Gateway URL이 변경될 수 있으므로, 반드시 프론트엔드 환경변수를 동기화해야 합니다.

#### 배포 후 자동 동기화 워크플로우

```bash
# 1. 백엔드 배포 (nasun-website CDK)
cd <MONOREPO>/nasun-website/cdk
pnpm cdk deploy CdkStack --require-approval never

# 2. API 엔드포인트 자동 동기화 (필수!)
cd <MONOREPO>
./scripts/sync-api-endpoints.sh

# 3. 프론트엔드 재빌드
cd gensol-website/frontend
npm run build:staging      # Staging 환경
npm run build:production   # Production 환경
```

#### 변경사항 미리보기

실제 파일을 수정하지 않고 어떤 값이 업데이트되는지 확인:

```bash
cd <MONOREPO>
./scripts/sync-api-endpoints.sh --dry-run
```

#### 특정 환경만 업데이트

```bash
# Staging만
./scripts/sync-api-endpoints.sh --env staging

# Production만
./scripts/sync-api-endpoints.sh --env production
```

#### 관리되는 API 엔드포인트

다음 환경변수들이 자동으로 동기화됩니다:

- `VITE_RANDOM_IMAGE_API_ENDPOINT` - NFT 랜덤 이미지 API
- `VITE_SUPPLY_COUNT_API_ENDPOINT` - NFT 발행 수량 조회 API
- `VITE_WALLET_API_ENDPOINT` - 지갑 주소 업데이트 API
- `VITE_PRICE_API_ENDPOINT` - 토큰 가격 조회 API
- `VITE_BACKUP_API_ENDPOINT` - 백업 가격 API

#### 상세 문서

자세한 사용법과 트러블슈팅은 다음 문서를 참고하세요:

- 📄 [프론트엔드 환경변수 자동 동기화 가이드](../doc/FRONTEND_ENV_SYNC_GUIDE.md)
- 📄 [스크립트 사용법](../scripts/README.md)