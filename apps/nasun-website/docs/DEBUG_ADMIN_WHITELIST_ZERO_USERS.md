# Admin Whitelist Export: 0 Active Users 디버깅 분석

> **작성일**: 2026-02-14
> **상태**: 미해결
> **증상**: Admin 페이지(`/admin/whitelist`)에서 Battalion/Genesis 모두 "0 Active Users" 표시
> **모순**: My Account 페이지에서는 동일 사용자가 "Registered" 상태로 정상 표시

---

## 1. 증상 요약

| 페이지 | 경로 | 결과 |
|--------|------|------|
| My Account | `/my-account` | Battalion NFT: **Registered**, Genesis NFT: **Registered** |
| Admin Whitelist Export | `/admin/whitelist` | Battalion: **0 Active Users**, Genesis: **0 Active Users** |

Admin 페이지는 에러 메시지 없이 정상적으로 0을 표시함 (API 호출 성공, 인증 성공).

---

## 2. 데이터 흐름 분석

### 2.1 My Account 페이지 (정상 동작)

```
[My Account 페이지]
  → useBattalionNftStatus hook
    → GET ${VITE_BATTALION_NFT_API}/event/status?walletAddress=0x...
      → Lambda: nasun-nft-check-status (NftEventStack)
        → DynamoDBDocumentClient.GetCommand
          → Table: nasun-nft-whitelist
            → 결과: FOUND ✅
```

**파일 경로**:
- Hook: `frontend/src/hooks/useBattalionNftStatus.ts`
- API Client: `frontend/src/services/battalionNftApi.ts:155-195`
- Lambda: `cdk/lambda-src/nft-event/check-registration-status/src/services/whitelistService.ts`
- CDK: `cdk/lib/nft-event-stack.ts:254-268`

### 2.2 Admin Whitelist Export 페이지 (0 반환)

```
[Admin Whitelist Export 페이지]
  → useWhitelistStats hook
    → GET ${VITE_ADMIN_API_URL}/export/stats
      → Token Authorizer (JWT 검증)
        → Lambda: AdminStack-AdminExportFunction (AdminStack)
          → verifyAdminRole(identityId) → ADMIN 확인
            → DynamoDBClient.ScanCommand (low-level)
              → Table: nasun-nft-whitelist → 0 items
              → Table: GenesisNftWhitelist → 0 items
                → 결과: { battalion: { active: 0 }, genesis: { active: 0 } }
```

**파일 경로**:
- Hook: `frontend/src/features/admin/hooks/useWhitelistStats.ts`
- API Client: `frontend/src/features/admin/services/adminApi.ts:62-76`
- Lambda: `cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts:367-402`
- Auth: `cdk/lambda-src/admin-api/src/utils/auth.ts`
- CDK: `cdk/lib/admin-stack.ts:70-108`

### 2.3 핵심 차이점

| 항목 | My Account (NftEventStack) | Admin (AdminStack) |
|------|--------------------------|-------------------|
| DynamoDB Client | `DynamoDBDocumentClient` (lib-dynamodb) | `DynamoDBClient` (client-dynamodb) |
| 작업 | `GetCommand` (단일 항목 조회) | `ScanCommand` (전체 테이블 스캔) |
| 인증 | 없음 (public endpoint) | Cognito Token Authorizer + ADMIN role |
| Lambda 배포 | `lambda.Function` (pre-built dist/) | `NodejsFunction` (CDK synth 시 esbuild 번들링) |
| API URL | `VITE_BATTALION_NFT_API` | `VITE_ADMIN_API_URL` |

---

## 3. 코드 검증 결과

### 3.1 테이블명 일치 확인

모든 경로에서 동일한 테이블명 사용 확인:

| 테이블 | NftEventStack | CommonStack | AdminStack |
|--------|--------------|-------------|------------|
| Battalion | `nasun-nft-whitelist` | - | `nasun-nft-whitelist` |
| Genesis | - | `GenesisNftWhitelist` | `GenesisNftWhitelist` |

**소스**:
- `cdk/lib/nft-event-stack.ts:36` → `tableName: "nasun-nft-whitelist"`
- `cdk/lib/common-stack.ts:682` → `tableName: "GenesisNftWhitelist"`
- `cdk/bin/cdk.ts:50-52` → AdminStack props에 동일한 이름 전달
- `cdk/lib/admin-stack.ts:28-29` → props에서 받아 환경변수로 전달

### 3.2 IAM 권한 확인 (CDK 코드상)

```typescript
// admin-stack.ts:94-108
genesisTable.grantReadData(this.exportFunction);      // Scan 권한
battalionTable.grantReadData(this.exportFunction);     // Scan 권한
// GSI 쿼리 추가 권한
this.exportFunction.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ["dynamodb:Query"],
    resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/${battalionTableName}/index/*`],
  })
);
```

CDK 코드상 권한은 올바르게 설정됨. 단, **실제 배포된 IAM 역할이 최신인지는 확인 필요**.

### 3.3 Marshalling 호환성 확인

- 데이터 쓰기: `DynamoDBDocumentClient` → 자동 마샬링 → DynamoDB 네이티브 형식 저장
- Admin 읽기: Low-level `ScanCommand` → 네이티브 형식 반환 → `item.walletAddress?.S` 접근

```typescript
// export-whitelist.ts:215-224 — 올바른 언마샬링
items.push({
  walletAddress: item.walletAddress?.S || "",
  verifiedAt: item.verifiedAt?.S || item.timestamp?.S || "",
  status: item.status?.S || "ACTIVE",
});
```

마샬링 불일치 문제 없음.

### 3.4 인증 플로우 확인

- Token Authorizer가 JWT 검증 실패 → 403 반환 → 프론트엔드에 에러 표시
- `verifyAdminRole()` 실패 → 401 반환 → 프론트엔드에 에러 표시
- **사용자에게 에러가 아닌 0이 표시되므로 인증은 성공한 것으로 판단**

### 3.5 프론트엔드 로직 확인

```tsx
// WhitelistManagement.tsx:87-132
{isLoadingStats ? (
  <div>...loading skeleton...</div>
) : stats ? (
  <div>...stats cards with values...</div>  // ← 0 표시됨 = stats 정의됨
) : null}

{statsError && (
  <div>Failed to load stats: {statsError.message}</div>  // ← 표시 안됨
)}
```

- `stats`가 정의됨 → API 200 응답 성공
- `statsError` 없음 → 에러 아님
- 결론: Lambda가 정상 실행되었으나 테이블에서 0건 반환

---

## 4. 가능한 원인 (우선순위순)

### 4.1 [가장 유력] AdminStack 미배포 또는 구버전 배포

**근거**:
- 이전 세션에서 `admin-stack.ts`에 TypeScript 에러 발견 (line 109 → line 67로 이동하여 수정)
  - `const cognitoIdentityPoolId` 선언이 line 82에서 사용되기 전인 line 109에 있었음
  - `TS2448: Block-scoped variable used before its declaration`
- CDK synthesis 시 모든 스택이 함께 컴파일되므로, 이 에러가 있으면 **어떤 스택도 배포 불가**
- 에러 도입 시점 이후 AdminStack이 재배포되지 않았을 가능성

**결과**: 배포된 Lambda가 구버전이라 현재 테이블 구조/데이터와 맞지 않을 수 있음.

### 4.2 Lambda 환경변수 불일치

배포된 Lambda의 `GENESIS_TABLE` / `BATTALION_TABLE` 환경변수가 현재 테이블명과 다를 수 있음.

### 4.3 IAM 권한 미적용

CDK 코드에 `grantReadData`가 있지만, 마지막 성공 배포 시점에는 해당 코드가 없었을 수 있음.

### 4.4 DynamoDB 테이블 비어있음 (가능성 낮음)

My Account에서 "Registered" 표시되므로 데이터는 존재. 단, 같은 AWS 계정의 테이블인지 확인 필요.

---

## 5. 디버깅 절차

### Step 1: DynamoDB 테이블 데이터 확인

```bash
# Battalion NFT 테이블 데이터 확인
aws dynamodb scan \
  --table-name nasun-nft-whitelist \
  --max-items 3 \
  --region ap-northeast-2

# Genesis NFT 테이블 데이터 확인
aws dynamodb scan \
  --table-name GenesisNftWhitelist \
  --max-items 3 \
  --region ap-northeast-2
```

**기대 결과**: 등록된 사용자 데이터가 존재해야 함. 0건이면 테이블이 비어있는 것이 원인.

### Step 2: AdminStack CloudFormation 상태 확인

```bash
aws cloudformation describe-stacks \
  --stack-name AdminStack \
  --region ap-northeast-2 \
  --query 'Stacks[0].{Status:StackStatus,LastUpdated:LastUpdatedTime}'
```

**확인 사항**: 스택이 존재하는지, 마지막 업데이트 시점이 언제인지.

### Step 3: Admin Lambda 함수 설정 확인

```bash
# Lambda 함수명 확인
aws lambda list-functions \
  --region ap-northeast-2 \
  --query 'Functions[?contains(FunctionName, `AdminExport`)].FunctionName'

# 환경변수 확인
aws lambda get-function-configuration \
  --function-name <위에서 확인한 함수명> \
  --region ap-northeast-2 \
  --query 'Environment.Variables'
```

**확인 사항**: `GENESIS_TABLE`, `BATTALION_TABLE` 값이 올바른지.

### Step 4: CloudWatch 로그 확인

```bash
# Lambda 로그 그룹 찾기
aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/AdminStack" \
  --region ap-northeast-2

# 최근 로그 이벤트 확인
aws logs filter-log-events \
  --log-group-name "<위에서 확인한 로그 그룹>" \
  --start-time $(date -d '2 hours ago' +%s)000 \
  --region ap-northeast-2 \
  --limit 20
```

**확인 사항**: Lambda가 정상 호출되는지, scan 결과가 0인지, 에러가 있는지.

### Step 5: AdminStack 재배포

```bash
cd /home/naru/my_apps/nasun-monorepo/apps/nasun-website/cdk
npx aws-cdk deploy AdminStack --require-approval never
```

`NodejsFunction`이므로 배포 시 최신 TypeScript 코드가 esbuild로 번들링되어 Lambda에 업로드됨.

### Step 6: 검증

1. Admin 페이지(`localhost:5174/admin/whitelist`) 새로고침
2. Battalion/Genesis Active Users 수가 0이 아닌지 확인
3. CSV 다운로드 테스트
4. CloudWatch 로그에서 scan 결과 확인

---

## 6. 관련 파일 목록

| 역할 | 파일 경로 |
|------|-----------|
| Admin 페이지 | `frontend/src/features/admin/pages/WhitelistManagement.tsx` |
| Stats Hook | `frontend/src/features/admin/hooks/useWhitelistStats.ts` |
| API Client | `frontend/src/features/admin/services/adminApi.ts` |
| Auth Headers | `frontend/src/features/admin/utils/index.ts` |
| Admin Lambda | `cdk/lambda-src/admin-api/src/handlers/export-whitelist.ts` |
| Admin Auth | `cdk/lambda-src/admin-api/src/utils/auth.ts` |
| Token Authorizer | `cdk/lambda-src/admin-api/src/authorizer/tokenAuthorizer.ts` |
| Admin CDK Stack | `cdk/lib/admin-stack.ts` |
| NFT Event CDK Stack | `cdk/lib/nft-event-stack.ts` |
| CDK App Entry | `cdk/bin/cdk.ts` |
| CDK .env (dev) | `cdk/.env` |
| CDK .env (prod) | `cdk/.env.production` |
| Frontend .env (dev) | `frontend/.env.development` |

---

## 7. 예방 조치

이 문제의 근본 원인이 CDK synthesis 에러로 인한 배포 실패라면:

1. **CDK synth 검증 자동화**: 배포 전 `npx aws-cdk synth` 를 CI에서 실행하여 컴파일 에러 조기 감지
2. **스택별 독립 배포 확인**: 하나의 스택 에러가 다른 스택 배포를 차단하지 않도록 모니터링
3. **admin-stack.ts의 cognitoIdentityPoolId 에러**: 이미 수정 완료 (line 109 → line 67)
