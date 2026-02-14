---
name: deploy
description: CDK 인프라를 안전하게 배포합니다. Stale 파일 정리, AWS 계정 검증, API URL 교차 확인 등 pre-flight 검사를 거쳐 배포합니다. "배포해줘", "CDK 올려줘", "deploy", "cdk deploy" 등의 요청에 사용합니다.
---

# Deploy: Nasun CDK 안전 배포

Nasun 모노레포의 CDK 인프라를 안전하게 배포합니다. Pre-flight 검사로 알려진 문제를 사전에 차단하고, 환경별 올바른 AWS 프로필을 자동 선택합니다.

환경/계정/스택 상세 정보는 [reference.md](reference.md) 참조.

## 실행 절차

### 1단계: 인자 파싱

`$ARGUMENTS`에서 앱, 환경, 스택, 플래그를 추출합니다.

**형식**: `<app> <env> [stack] [--flags]`

| 인자 | 필수 | 값 | 설명 |
| ---- | ---- | -- | ---- |
| `app` | O | `nasun-website`, `pado`, `baram-aer` | 배포 대상 앱 |
| `env` | O | `dev`, `prod` | 배포 환경 (`dev` = development) |
| `stack` | X | 예: `LeaderboardV3Stack` | 특정 스택만 배포 (생략 시 `--all`) |
| `--check` | X | - | Pre-flight 검사만 실행 (배포 안 함) |

**검증 규칙:**

- `baram` 감지 시: "apps/baram은 Legacy 코드입니다. apps/baram-aer을 사용하세요." 출력 후 중단
- 앱이 위 3개 중 하나가 아니면 에러
- `env`가 `dev` 또는 `prod`가 아니면 에러

**환경별 AWS 프로필 자동 매핑:**

```
dev  → 프로필: default,    계정: 135808943968, NODE_ENV: development
prod → 프로필: nasun-prod, 계정: 466841130170, NODE_ENV: production
```

### 2단계: Stale 컴파일 파일 정리

CDK 디렉토리에서 stale `.js`/`.d.ts` 파일을 탐지합니다. 이 파일들은 `ts-node --prefer-ts-exts`를 무시하고 TypeScript 소스를 가려서, `cdk diff`가 "no changes"를 오보하는 원인이 됩니다.

**탐지 대상:**

```
apps/{app}/cdk/lib/**/*.js
apps/{app}/cdk/lib/**/*.d.ts
apps/{app}/cdk/bin/**/*.js
apps/{app}/cdk/bin/**/*.d.ts
```

`node_modules/` 디렉토리는 제외합니다.

**실행:**

Glob 도구로 위 패턴을 검색합니다. 파일이 발견되면:

1. 발견된 파일 목록을 사용자에게 표시
2. AskUserQuestion으로 삭제 확인
3. 승인 시 Bash로 삭제 실행

**근거:** 2026-02-14 세션에서 `leaderboard-v3-stack.js` (Feb 12 컴파일)가 업데이트된 `.ts` 소스를 가려서 CDK 배포가 실패한 사례.

### 3단계: AWS 계정 검증

배포 대상 환경에 맞는 AWS 자격 증명이 올바른지 확인합니다.

**실행:**

```bash
# 프로필 결정
PROFILE=$([ "$ENV" = "prod" ] && echo "nasun-prod" || echo "")

# 계정 ID 조회
aws sts get-caller-identity ${PROFILE:+--profile $PROFILE} \
  --query Account --output text --region ap-northeast-2
```

**검증:**

| 환경 | 예상 계정 ID | 프로필 |
| ---- | ------------ | ------ |
| dev | 135808943968 | default |
| prod | 466841130170 | nasun-prod |

불일치 시:

- 에러 메시지 출력: "AWS 계정 불일치. {env} 환경은 계정 {expected}을 사용해야 합니다."
- 해결 방법 안내: `aws configure --profile {profile}`
- 배포 중단

### 4단계: CDK 환경변수 검증

CDK `.env` 파일의 존재 여부와 필수 변수를 확인합니다.

**환경 파일 경로:**

| 앱 | dev | prod |
| -- | --- | ---- |
| nasun-website | `apps/nasun-website/cdk/.env.development` | `apps/nasun-website/cdk/.env.production` |
| pado | `apps/pado/cdk/.env.development` | `apps/pado/cdk/.env.production` |
| baram-aer | `apps/baram-aer/cdk/.env` | `apps/baram-aer/cdk/.env` |

**nasun-website 필수 변수:**

```
VITE_COGNITO_IDENTITY_POOL_ID
TWITTER_BEARER_TOKEN
AWS_ACCOUNT_ID
```

**검증 방법:** Grep으로 `.env` 파일에서 각 변수 키의 존재 여부 확인. 누락 시 에러 출력 후 중단.

**추가 검증 (nasun-website만):** CDK `bin/cdk.ts`에서 `process.env.`로 읽는 변수명을 Grep으로 추출하고, `.env` 파일에 해당 변수가 존재하는지 교차 확인. 불일치 발견 시 경고.

### 5단계: API URL 교차 검증

프론트엔드 `.env` 파일의 API Gateway URL이 해당 환경의 AWS 계정에 실제로 존재하는지 **양방향**으로 확인합니다.

**실행:**

```bash
# 1. 양쪽 계정의 API Gateway 목록을 모두 조회
aws apigateway get-rest-apis --region ap-northeast-2 \
  --query "items[].{id:id,name:name}" --output json

aws apigateway get-rest-apis --profile nasun-prod --region ap-northeast-2 \
  --query "items[].{id:id,name:name}" --output json

# 2. 프론트엔드 .env에서 API URL 추출 (Grep 사용)
# 패턴: VITE_.*=https://([a-z0-9]+)\.execute-api
```

**검증 로직:**

1. 프론트엔드 `.env.{env}`에서 모든 API Gateway ID를 추출
2. 각 ID가 어느 계정에 속하는지 판별 (dev 계정 목록 vs prod 계정 목록)
3. 환경-계정 불일치 감지:
   - `dev`/`staging` 환경의 `.env`에 prod 계정 API가 있으면 경고
   - `production` 환경의 `.env`에 dev 계정 API가 있으면 경고
4. 불일치 발견 시 API 이름과 올바른 계정의 대응 API ID를 함께 표시

**근거:** 2026-02-14 감사에서 발견된 3건의 교차 참조 문제:
- Prod 프론트엔드가 Dev 계정의 Leaderboard V3 API(`ewjyu9feog`)를 사용
- Dev 프론트엔드가 Prod 계정의 Follower Count/Governance API를 사용

이 검사는 **blocking이 아닙니다** — 경고를 표시하고 사용자 판단에 맡깁니다. 단, 발견된 모든 불일치를 테이블로 명확히 보여줘야 합니다.

### 6단계: CDK Diff + 사용자 확인

변경사항을 미리 보여주고 배포 승인을 받습니다.

**실행:**

```bash
cd apps/{app}/cdk

# cdk diff 실행 (stderr도 포함)
NODE_ENV={node_env} npx cdk diff {stack_or_all} \
  ${PROFILE:+--profile $PROFILE} 2>&1
```

**분석:**

- diff 출력에서 `[+]` (추가), `[~]` (수정), `[-]` (삭제) 카운트
- `[+].*Lambda::Function` 또는 `[+].*DynamoDB::Table` 발견 시 비용 경고:
  "새 AWS 리소스가 생성됩니다. 비용이 발생할 수 있습니다."
- diff가 없으면 (exit code 0, 출력 없음): "변경사항이 없습니다." 출력 후 종료

**사용자 확인:**

- `--check` 플래그 시: 여기서 종료
- `dev` 환경: AskUserQuestion으로 "배포하시겠습니까?" 확인
- `prod` 환경: AskUserQuestion으로 "PRODUCTION 환경에 배포합니다. 계속하시겠습니까?" 확인 (선택지에 "배포" 와 "취소" 제공)

### 7단계: CDK Deploy

실제 배포를 실행합니다.

**실행:**

```bash
cd apps/{app}/cdk

NODE_ENV={node_env} npx cdk deploy {stack_or_all} \
  ${PROFILE:+--profile $PROFILE} \
  --require-approval never 2>&1
```

**timeout:** 600초 (10분)

**실패 처리:**

- Exit code != 0: "CDK 배포 실패" 에러 출력
- CloudFormation 롤백 발생 시: `aws cloudformation describe-stack-events`로 실패 원인 조회

### 8단계: Post-deployment 검증

배포가 완료된 후 결과를 확인합니다.

**8.1 CloudFormation 스택 상태 확인:**

```bash
aws cloudformation describe-stacks \
  --stack-name {stack} ${PROFILE:+--profile $PROFILE} \
  --query 'Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime}' \
  --output table --region ap-northeast-2
```

- `UPDATE_COMPLETE` 또는 `CREATE_COMPLETE`: 성공
- `ROLLBACK_*`: 실패 (이벤트 조회로 원인 파악)

**8.2 Lambda 환경변수 검증 (nasun-website만):**

배포된 스택에 속하는 Lambda 함수 1개를 샘플로 확인:

```bash
aws lambda get-function-configuration \
  --function-name {sample-function} ${PROFILE:+--profile $PROFILE} \
  --query "Environment.Variables" --output json --region ap-northeast-2
```

`COGNITO_IDENTITY_POOL_ID`, `USER_PROFILES_TABLE` 등 필수 변수가 설정되었는지 확인.

**8.3 프론트엔드 .env 동기화 확인 (nasun-website만):**

배포된 스택의 API Gateway URL이 프론트엔드 `.env.{env}` 파일에 올바르게 반영되어 있는지 확인합니다.

```bash
# CDK deploy 출력에서 API URL 추출
# 예: LeaderboardV3Stack.LeaderboardV3ApiUrl = https://auzo707xql.execute-api.../prod/

# 프론트엔드 .env에서 해당 URL 변수 확인
# 예: VITE_LEADERBOARD_V3_API_URL의 API Gateway ID가 배포된 스택의 ID와 일치하는지
```

불일치 발견 시:
- 경고: "프론트엔드 .env.{env}의 {변수명}이 방금 배포된 API가 아닌 다른 API를 참조합니다"
- 올바른 URL 제시 후 업데이트 여부를 사용자에게 확인

**근거:** 2026-02-14 감사에서 prod에 LeaderboardV3Stack이 배포되어 있었으나(`auzo707xql`), 프론트엔드가 dev 계정의 API(`ewjyu9feog`)를 사용하고 있어 prod Lambda가 방치된 사례.

**8.4 배포 결과 요약:**

배포 환경, 계정, 스택, 상태를 테이블로 출력합니다.

## $ARGUMENTS 처리

| 패턴 | 동작 | 예시 |
| ---- | ---- | ---- |
| (없음) | 에러: 앱과 환경을 지정하세요 | `/deploy` |
| `<app> dev` | Dev 환경 전체 스택 배포 | `/deploy nasun-website dev` |
| `<app> prod` | Prod 환경 전체 스택 배포 | `/deploy nasun-website prod` |
| `<app> <env> <stack>` | 특정 스택만 배포 | `/deploy nasun-website dev LeaderboardV3Stack` |
| `--check <app> <env>` | Pre-flight 검사만 (배포 안 함) | `/deploy --check nasun-website prod` |

## 안티 패턴

| 금지 | 이유 | 대신 |
| ---- | ---- | ---- |
| Stale `.js/.d.ts` 무시하고 배포 | TS 소스를 가려서 배포 실패 | 2단계에서 반드시 삭제 |
| `--profile` 없이 prod 배포 | 기본 계정(dev)에 배포됨 | 자동으로 `nasun-prod` 선택 |
| `cdk deploy --all` 무조건 실행 | 불필요한 스택까지 배포 | 가능하면 변경된 스택만 지정 |
| baram 앱에 배포 시도 | Legacy 코드, 절대 수정 금지 | baram-aer 사용 |
| 기존 deploy-safe-env.sh 직접 실행 | interactive prompt 지원 안 됨 | 이 스킬의 단계별 실행 사용 |
| Lambda 개별 업데이트 (`aws lambda update-function-code`) | CDK 상태와 불일치 | CDK로 배포 |
| 프론트엔드 .env URL 미확인 후 배포 | 배포된 스택의 API를 프론트엔드가 참조하지 않아 방치됨 | 8.3단계에서 반드시 동기화 확인 |
| dev/prod .env에서 다른 계정의 API 참조 | 환경 분리 무효화, 데이터 격리 실패 | 5단계 양방향 교차 검증으로 감지 |

## 주의사항

- `.env`, 비밀키, 인증서 파일은 절대 커밋하지 않음
- Production 배포는 반드시 사용자 확인 후 진행
- 새 AWS 리소스 생성 시 비용 영향을 사용자에게 고지
- nasun-website의 auth-twitter Lambda는 반드시 **npm**으로 빌드 (pnpm symlink 비호환)
- CDK 명령어는 반드시 `apps/{app}/cdk/` 디렉토리에서 실행
