# Deploy Skill Reference

## AWS 계정 구조

| 환경 | Profile | Account ID | 리전 | 용도 |
| ---- | ------- | ---------- | ---- | ---- |
| dev | `default` | 135808943968 | ap-northeast-2 | Dev/Staging |
| prod | `nasun-prod` | 466841130170 | ap-northeast-2 | Production |
| - | `nasun-dlt` | 150674276464 | ap-northeast-2 | Devnet 운영 (CDK 배포 대상 아님) |

## 앱별 CDK 구성

### nasun-website

| 항목 | 값 |
| ---- | -- |
| CDK 경로 | `apps/nasun-website/cdk/` |
| Entry | `bin/cdk.ts` |
| NODE_ENV 매핑 | dev → `development`, prod → `production` |

**스택:**

| 스택 | 의존성 | 설명 |
| ---- | ------ | ---- |
| CommonStack | 없음 | NFT, User Profile, Price API, AWS Credentials |
| AuthStack | CommonStack | 인증 (Cognito, Twitter OAuth) |
| MonitoringStack | CommonStack | Price API 모니터링 |
| NftEventStack | 없음 | Frontiers Event (Wave 1 Battalion Free Mint) |
| AdminStack | 없음 | Whitelist Export, Governance Management |
| FollowerStack | 없음 | X API daily follower tracking |
| LeaderboardV3Stack | 없음 | Leaderboard V3 (manual curation system) |

**환경 파일:**

| 환경 | 파일 경로 |
| ---- | -------- |
| dev | `apps/nasun-website/cdk/.env.development` |
| prod | `apps/nasun-website/cdk/.env.production` |

**CDK `bin/cdk.ts`가 읽는 필수 환경변수:**

| 변수명 | 사용처 | 비고 |
| ------ | ------ | ---- |
| `VITE_COGNITO_IDENTITY_POOL_ID` | LeaderboardV3Stack | 누락 시 throw Error |
| `TWITTER_BEARER_TOKEN` | FollowerStack | 누락 시 빈 문자열 |
| `TARGET_ACCOUNTS` | FollowerStack | JSON array 형태 |

**기타 .env 변수 (스택에서 참조):**

| 변수명 | 용도 |
| ------ | ---- |
| `AWS_ACCOUNT_ID` | 스택 env 설정 |
| `TWITTER_TOKENS_SECRET_NAME` | Secrets Manager 이름 |
| `TWITTER_CLIENT_ID` | Twitter OAuth |
| `TWITTER_CLIENT_SECRET` | Twitter OAuth |
| `TWITTER_API_KEY` | Twitter API |
| `TWITTER_API_SECRET` | Twitter API |
| `TWITTER_ACCESS_TOKEN` | Twitter API |
| `TWITTER_ACCESS_TOKEN_SECRET` | Twitter API |

**Lambda 빌드 주의사항:**

| Lambda | 패키지 매니저 | 이유 |
| ------ | ------------ | ---- |
| auth-twitter | **npm** | pnpm symlink 비호환 |
| wallet-api | pnpm | - |
| PriceAPI | pnpm | - |
| leaderboard-v3 | pnpm | - |

---

### pado

| 항목 | 값 |
| ---- | -- |
| CDK 경로 | `apps/pado/cdk/` |
| Entry | `bin/cdk.ts` |
| NODE_ENV 매핑 | dev → `development`, prod → `production` |

**스택:**

| 스택 | 의존성 | 설명 |
| ---- | ------ | ---- |
| PadoOracleStack | 없음 | Oracle price updater Lambda |
| PadoNewsStack | 없음 | News feed Lambda |

**환경 파일:**

| 환경 | 파일 경로 |
| ---- | -------- |
| dev | `apps/pado/cdk/.env.development` |
| prod | `apps/pado/cdk/.env.production` |

**CDK `bin/cdk.ts`가 읽는 필수 환경변수:**

| 변수명 | 사용처 | 비고 |
| ------ | ------ | ---- |
| `ORACLE_PACKAGE_ID` | PadoOracleStack | 누락 시 process.exit(1) |
| `ORACLE_REGISTRY_ID` | PadoOracleStack | 누락 시 process.exit(1) |
| `ADMIN_CAP_ID` | PadoOracleStack | 누락 시 process.exit(1) |
| `SUI_RPC_URL` | PadoOracleStack | 기본값: `https://rpc.devnet.nasun.io` |

---

### baram-aer

| 항목 | 값 |
| ---- | -- |
| CDK 경로 | `apps/baram-aer/cdk/` |
| Entry | `bin/cdk.ts` |
| NODE_ENV 매핑 | 환경 분리 없음 (단일 `.env`) |

**스택:**

| 스택 | 의존성 | 설명 |
| ---- | ------ | ---- |
| BaramStack | 없음 | Baram AER API (settlement, executor, attestation) |

**환경 파일:**

| 환경 | 파일 경로 |
| ---- | -------- |
| 공통 | `apps/baram-aer/.env` |

> Note: baram-aer의 dotenv는 `apps/baram-aer/.env`를 직접 참조합니다 (`cdk/` 디렉토리가 아님).

**CDK `bin/cdk.ts`가 읽는 필수 환경변수:**

| 변수명 | 사용처 | 비고 |
| ------ | ------ | ---- |
| `VITE_BARAM_PACKAGE_ID` or `BARAM_PACKAGE_ID` | BaramStack | 누락 시 process.exit(1) |
| `VITE_BARAM_REGISTRY_ID` or `BARAM_REGISTRY_ID` | BaramStack | 누락 시 process.exit(1) |
| `AER_PACKAGE_ID` | BaramStack | 선택 (없으면 AER 비활성) |
| `AER_REGISTRY_ID` | BaramStack | 선택 |
| `EXECUTOR_REGISTRY_ID` | BaramStack | 선택 |
| `SUI_RPC_URL` | BaramStack | 기본값: `https://rpc.devnet.nasun.io` |

---

## 프론트엔드 환경 파일 위치

API URL 교차 검증(5단계)에서 참조합니다.

| 앱 | dev | prod |
| -- | --- | ---- |
| nasun-website | `apps/nasun-website/frontend/.env.development` | `apps/nasun-website/frontend/.env.production` |
| pado | `apps/pado/frontend/.env.development` | `apps/pado/frontend/.env.production` |
| baram-aer | `apps/baram-aer/.env` | `apps/baram-aer/.env` |

## 알려진 이슈

### Stale 컴파일 파일 문제 (2026-02-14 발견)

`ts-node --prefer-ts-exts`가 설정되어 있어도, `cdk/lib/`이나 `cdk/bin/`에 이전에 컴파일된 `.js` 파일이 남아 있으면 TypeScript 소스를 가립니다. 결과적으로 `cdk diff`가 "no changes"를 보고하고, 새로운 코드가 배포되지 않습니다.

**증상:** CDK 코드를 수정했는데 `cdk diff`에 변경사항이 나타나지 않음

**원인:** `npx tsc` 등으로 한번이라도 컴파일하면 `.js`/`.d.ts` 파일이 생성되고, 이후 TypeScript 소스를 수정해도 stale `.js`가 우선 로드됨

**해결:** 배포 전 `cdk/lib/` 및 `cdk/bin/`의 `.js`, `.d.ts` 파일을 삭제 (SKILL.md 2단계)

### API URL 계정 간 교차 참조 (2026-02-14 수정 완료)

수정 전: 3개 API가 환경 간 교차 참조되어 있었음:
- Prod 프론트엔드 → Dev 계정 Leaderboard V3 API (`ewjyu9feog`)
- Dev/Staging 프론트엔드 → Prod 계정 Follower Count API (`as05kvrlii`)
- Dev/Staging 프론트엔드 → Prod 계정 Governance API (`4xf3e5t8zc`)

수정 후: 환경별 올바른 계정의 API Gateway 사용:

| API | Dev 계정 ID | Prod 계정 ID |
| --- | ---------- | ----------- |
| Leaderboard V3 | `ewjyu9feog` | `auzo707xql` |
| Follower Count (CommonStack) | `331h8k7x0g` | `as05kvrlii` |
| Governance (CommonStack) | `3n52syk380` | `4xf3e5t8zc` |
