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
| `app` | O | `nasun-website`, `pado`, `baram` | 배포 대상 앱 |
| `env` | O | `dev`, `prod` | 배포 환경 (`dev` = development) |
| `stack` | X | 예: `LeaderboardV3Stack` | 특정 스택만 배포 (생략 시 `--all`) |
| `--check` | X | - | Pre-flight 검사만 실행 (배포 안 함) |

**검증 규칙:**

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
| baram | `apps/baram/cdk/.env` | `apps/baram/cdk/.env` |

**nasun-website 필수 변수:**

```
VITE_COGNITO_IDENTITY_POOL_ID
TWITTER_BEARER_TOKEN
AWS_ACCOUNT_ID
```

**검증 방법:** Grep으로 `.env` 파일에서 각 변수 키의 존재 여부 확인. 누락 시 에러 출력 후 중단.

**추가 검증 (nasun-website만):** CDK `bin/cdk.ts`에서 `process.env.`로 읽는 변수명을 Grep으로 추출하고, `.env` 파일에 해당 변수가 존재하는지 교차 확인. 불일치 발견 시 경고.

### 4.5단계: 배포된 Lambda 환경변수 드리프트 검사 (nasun-website만)

현재 배포된 Lambda 함수들의 `COGNITO_IDENTITY_POOL_ID` 값이 대상 환경의 올바른 값과 일치하는지 전수 확인합니다. `/deploy` 스킬 외부에서 수행된 배포(out-of-band deployment)로 인한 환경변수 오염을 사전에 감지합니다.

**대상 스택:** `AdminStack`, `AuthStack`, `CommonStack`, `LeaderboardV3Stack`

**환경별 올바른 값 (reference.md 참조):**

| 환경 | COGNITO_IDENTITY_POOL_ID |
| ---- | ------------------------ |
| dev  | `ap-northeast-2:cea43281-b7c1-4473-8cbf-cf5ccaa33c0a` |
| prod | `ap-northeast-2:312bb111-8de7-4a61-95db-9a3c3fab58df` |

**실행 절차:**

1. 대상 4개 스택 각각에 대해 Lambda 함수 목록을 조회합니다:

```bash
aws cloudformation list-stack-resources \
  --stack-name {STACK} ${PROFILE:+--profile $PROFILE} \
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
  --output text --region ap-northeast-2
```

스택이 존재하지 않으면 (아직 미배포) 해당 스택을 건너뜁니다.

2. 각 Lambda 함수의 `COGNITO_IDENTITY_POOL_ID` 환경변수를 조회합니다:

```bash
aws lambda get-function-configuration \
  --function-name {function-name} ${PROFILE:+--profile $PROFILE} \
  --query "Environment.Variables.COGNITO_IDENTITY_POOL_ID" \
  --output text --region ap-northeast-2
```

`None`을 반환하는 Lambda는 이 변수를 사용하지 않으므로 건너뜁니다.

3. 올바른 환경별 값과 비교합니다.

**검증 결과:**

- 모든 Lambda의 값이 올바르면: "환경변수 드리프트 없음 (N개 Lambda 확인)" 출력
- 불일치 발견 시 **blocking** 경고:

```
[CRITICAL] Lambda 환경변수 드리프트 감지

| Lambda 함수 | 스택 | 현재 값 | 올바른 값 |
| ----------- | ---- | ------- | --------- |
| AdminStack-AdminExportFunction... | AdminStack | cea43281 (dev) | 312bb111 (prod) |

이 Lambda들은 잘못된 COGNITO_IDENTITY_POOL_ID를 사용하고 있습니다.
해당 스택을 이번 배포에 포함하면 올바른 값으로 교정됩니다.
해당 스택이 배포 대상이 아닌 경우, 별도로 배포해야 합니다.
```

**`--check` 플래그:** 이 검사는 `--check` 모드에서도 실행됩니다.

**근거:** 2026-02-21 프로덕션 인시던트. AdminStack이 /deploy 스킬 없이 배포되어 3개 Lambda에 dev 환경의 `COGNITO_IDENTITY_POOL_ID`가 설정됨. 프로덕션 관리자 페이지에서 403 Forbidden 에러 발생.

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
- diff가 없으면 (exit code 0, 출력 없음): "CDK 변경사항이 없습니다." 출력 후 종료. nasun-website의 경우 프론트엔드 배포가 필요할 수 있음을 안내 (프론트엔드 배포는 이 스킬의 범위 밖 — 아래 "프론트엔드 배포" 섹션 참조)

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

**리소스 미존재 오류 복구 (`could not be found`):**

AWS 콘솔에서 CDK가 관리하는 리소스(Lambda 등)를 수동 삭제한 경우, 배포 시 "resource could not be found" 오류 발생. 복구 절차:

```bash
# 1. 롤백 해제 (UPDATE_ROLLBACK_FAILED 상태일 때)
aws cloudformation continue-update-rollback \
  --stack-name {stack} ${PROFILE:+--profile $PROFILE} \
  --resources-to-skip {logical-id} --region ap-northeast-2

# 2. 스택 삭제 (RETAIN 리소스는 보존됨)
NODE_ENV={node_env} npx cdk destroy {stack} --force ${PROFILE:+--profile $PROFILE}

# 3. RETAIN된 리소스(DynamoDB 등) import
#    - resource-mapping.json 생성: {"LogicalId": {"TableName": "실제테이블명"}}
#    - Logical ID는 `cdk synth {stack}` 출력에서 확인
NODE_ENV={node_env} npx cdk import {stack} \
  --resource-mapping resource-mapping.json ${PROFILE:+--profile $PROFILE}

# 4. 나머지 리소스 생성
NODE_ENV={node_env} npx cdk deploy {stack} \
  --require-approval never ${PROFILE:+--profile $PROFILE}

# 5. resource-mapping.json 삭제 (임시 파일)
```

**근거:** 2026-02-17 FollowerStack 배포에서 수동 삭제된 Lambda `nasun-collect-followers`로 인해 발생. DynamoDB `NasunTargetFollowers` 테이블은 `removalPolicy: RETAIN`으로 보존되어 `cdk import`로 복구.

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

배포된 스택의 **모든** Lambda 함수에서 `COGNITO_IDENTITY_POOL_ID`가 올바른 환경별 값으로 설정되었는지 전수 확인합니다. (4.5단계와 동일한 검증을 배포 후에 다시 수행)

**대상 스택:** 방금 배포한 스택이 `AdminStack`, `AuthStack`, `CommonStack`, `LeaderboardV3Stack` 중 하나이거나, `--all`로 전체 배포한 경우 4개 스택 모두.

**실행:**

1. 배포한 스택의 Lambda 함수 목록을 조회합니다:

```bash
aws cloudformation list-stack-resources \
  --stack-name {stack} ${PROFILE:+--profile $PROFILE} \
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
  --output text --region ap-northeast-2
```

2. 각 Lambda의 `COGNITO_IDENTITY_POOL_ID` 값을 확인합니다:

```bash
aws lambda get-function-configuration \
  --function-name {function-name} ${PROFILE:+--profile $PROFILE} \
  --query "Environment.Variables.COGNITO_IDENTITY_POOL_ID" \
  --output text --region ap-northeast-2
```

3. `None`이 아닌 값을 가진 Lambda만 필터링하여 환경별 올바른 값과 비교합니다.

**검증 결과:**

- 모든 값이 올바르면: "배포 후 환경변수 검증 통과 (N개 Lambda)" 출력
- 불일치 발견 시 **에러**: "배포가 완료되었지만 Lambda 환경변수가 잘못되었습니다. CDK .env 설정을 확인하세요."
  - 불일치 Lambda를 테이블로 표시 (함수명, 현재값, 기대값)

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

---

## $ARGUMENTS 처리

| 패턴 | 동작 | 예시 |
| ---- | ---- | ---- |
| (없음) | 에러: 앱과 환경을 지정하세요 | `/deploy` |
| `<app> dev` | Dev 환경 CDK 배포 | `/deploy nasun-website dev` |
| `<app> prod` | Prod 환경 CDK 배포 | `/deploy baram prod` |
| `<app> <env> <stack>` | 특정 스택만 배포 | `/deploy nasun-website dev LeaderboardV3Stack` |
| `--check <app> <env>` | Pre-flight 검사만 (배포 안 함) | `/deploy --check nasun-website prod` |

## 프론트엔드 배포 (nasun-website)

nasun-website 프론트엔드는 이 스킬의 범위 밖입니다. 사용자가 직접 전용 스크립트를 실행합니다:

```bash
# Staging
bash scripts/deploy-nasun-website-staging.sh

# Production
bash scripts/deploy-nasun-website-production.sh
```

스크립트는 TypeScript 타입 체크, 빌드, 백업(prod), rsync, Nginx reload, 헬스 체크를 자동 수행합니다. CDK 배포 후 프론트엔드 변경이 있으면 사용자에게 스크립트 실행을 안내하세요.

## 안티 패턴

| 금지 | 이유 | 대신 |
| ---- | ---- | ---- |
| Stale `.js/.d.ts` 무시하고 배포 | TS 소스를 가려서 배포 실패 | 2단계에서 반드시 삭제 |
| `--profile` 없이 prod 배포 | 기본 계정(dev)에 배포됨 | 자동으로 `nasun-prod` 선택 |
| `cdk deploy --all` 무조건 실행 | 불필요한 스택까지 배포 | 가능하면 변경된 스택만 지정 |
| `baram-aer` 경로 참조 | 디렉토리가 `apps/baram`으로 변경됨 | `apps/baram` 사용 |
| Lambda 개별 업데이트 (`aws lambda update-function-code`) | CDK 상태와 불일치 | CDK로 배포 |
| 프론트엔드 .env URL 미확인 후 배포 | 배포된 스택의 API를 프론트엔드가 참조하지 않아 방치됨 | 8.3단계에서 반드시 동기화 확인 |
| dev/prod .env에서 다른 계정의 API 참조 | 환경 분리 무효화, 데이터 격리 실패 | 5단계 양방향 교차 검증으로 감지 |
| Lambda에 수동 `dist/` 빌드 | 모든 Lambda가 NodejsFunction(esbuild 자동 번들링)을 사용. 수동 빌드는 불필요하고 혼란만 유발 | CDK에 맡기기. `dist/`, `build.js` 파일이 있으면 삭제 |
| AWS 콘솔에서 CDK 리소스 수동 삭제 | CloudFormation 상태와 불일치 → 배포 실패 ("could not be found") | 반드시 CDK로 삭제 (`cdk destroy`). 이미 삭제된 경우 7단계 복구 절차 참조 |
| `NODE_ENV` 없이 `npx cdk deploy` 직접 실행 | `.env.development`가 로드되어 prod에 dev 환경변수(Identity Pool ID 등)가 설정됨 | 반드시 `NODE_ENV={node_env} npx cdk deploy` 사용. 4.5단계 드리프트 검사로 감지 |
| 한 스택만 배포 후 다른 스택 드리프트 무시 | 배포하지 않은 스택의 Lambda에 잘못된 값이 남아있을 수 있음 | 4.5단계에서 전체 스택의 Lambda 검사. 불일치 발견 시 추가 배포 안내 |

## 주의사항

- `.env`, 비밀키, 인증서 파일은 절대 커밋하지 않음
- Production 배포는 반드시 사용자 확인 후 진행
- 새 AWS 리소스 생성 시 비용 영향을 사용자에게 고지
- **모든 Lambda가 `NodejsFunction`(esbuild 자동 번들링)을 사용** — 수동 빌드, npm/pnpm 구분, `dist/` 관리 모두 불필요
- CDK 명령어는 반드시 `apps/{app}/cdk/` 디렉토리에서 실행
- nasun-website 프론트엔드 배포는 사용자가 직접 `scripts/deploy-nasun-website-*.sh` 스크립트를 실행
