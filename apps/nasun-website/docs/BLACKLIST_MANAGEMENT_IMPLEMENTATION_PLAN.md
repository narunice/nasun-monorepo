# 리더보드 V3 블랙리스트 관리 시스템 구현 계획서

## 0. 현재 상태 (Current Status)

**작성일**: 2026-01-24
**상태**: 🟡 구현 대기 (Ready for Implementation)

### 시스템 현황

| 항목 | V3 (leaderboard-v3) |
| :--- | :--- |
| **차단 방식** | ❌ **없음** |
| **필터링 로직** | `postCount > 0` 필터만 존재 |
| **데이터 저장소** | `leaderboard-v3-accounts` 테이블 |
| **관리 UI** | Placeholder만 존재 (`disabled: true`) |

### 구현 완료 항목

- [x] Admin Dashboard에 "Blacklist Management" 카드 placeholder (`adminConfig.ts`)
- [x] 라우트 경로 예약: `/admin/users`

### 미구현 항목

- [ ] Backend: Ban/Unban API 엔드포인트
- [ ] Backend: 공개 엔드포인트 필터링 로직
- [ ] Frontend: 관리 페이지 UI
- [ ] CDK: Lambda + API Gateway 리소스

---

## 1. 개요

### 1.1 목적

Leaderboard V3 시스템에서 어뷰징/스팸 계정을 Admin Dashboard UI를 통해 실시간으로 차단/해제할 수 있는 관리 시스템을 구현합니다.

### 1.2 범위

- **대상**: Leaderboard V3 시스템 전용
- **방식**: Soft Exclusion (데이터 보존, 표시 계층에서 필터링)
- **저장소**: `leaderboard-v3-accounts` DynamoDB 테이블에 ban 필드 직접 추가

### 1.3 핵심 설계 결정

| 결정 사항 | 선택 | 근거 |
| :--- | :--- | :--- |
| API 위치 | Leaderboard V3 API | 데이터 co-location, 기존 Bearer token 인증 활용 |
| 저장 방식 | Account 레코드에 필드 추가 | 별도 테이블 불필요, 쿼리 시 즉시 접근 가능 |
| GSI 추가 | 불필요 | 차단 계정 < 100건, Scan + FilterExpression 충분 |
| 인증 방식 | `LEADERBOARD_V3_ADMIN_PASSWORD` (Bearer token) | V3 admin 엔드포인트 기존 패턴 유지 |
| 필터링 전략 | In-memory filter (< 50ms 추가 지연) | 소량 데이터, ProjectionExpression으로 최소 전송 |

---

## 2. 아키텍처

### 2.1 데이터 모델 변경

`leaderboard-v3-accounts` 테이블의 `Account` 레코드에 다음 필드를 추가합니다:

| 필드명 | 타입 | 설명 | 기본값 |
| :--- | :--- | :--- | :--- |
| `isBanned` | Boolean | 차단 여부 | `undefined` (= 미차단) |
| `banReason` | String | 차단 사유 | - |
| `bannedAt` | String (ISO 8601) | 차단 일시 | - |
| `bannedBy` | String | 차단한 관리자 username | - |

> **설계 원칙**: `isBanned`가 `undefined` 또는 `false`이면 정상 계정으로 간주. 차단 해제 시 모든 ban 필드를 REMOVE하여 깔끔한 상태를 유지합니다.

### 2.2 API 엔드포인트

| Method | Path | 인증 | 설명 |
| :--- | :--- | :--- | :--- |
| `GET` | `/v3/admin/blacklist` | Bearer token | 차단된 계정 목록 조회 |
| `POST` | `/v3/admin/blacklist` | Bearer token | 계정 차단 |
| `DELETE` | `/v3/admin/blacklist/{accountId}` | Bearer token | 차단 해제 |

### 2.3 필터링 적용 대상

| Handler | 필터링 방식 | 설명 |
| :--- | :--- | :--- |
| `get-leaderboard.ts` | `getBannedAccountIds()` → Set 필터 | 누적/시즌 뷰 모두 적용 |
| `get-my-rank.ts` | Account의 `isBanned` 체크 | 차단 시 `not_ranked` 반환 |
| `search-accounts.ts` | `!account.isBanned` 필터 | 검색 결과에서 제외 |
| `get-featured-feed.ts` | 차단 계정의 포스트 제외 | 피드에서 숨김 |
| `get-top-climbers.ts` | 차단 계정 제외 | 클라이머 목록에서 숨김 |
| `create-post.ts` | 403 거부 | 차단 계정의 포스트 등록 차단 |

### 2.4 시스템 흐름도

```
Admin Dashboard (/admin/users)
    │
    ├─ [Search] GET /v3/accounts/search?q={username}
    │   └→ 결과에서 "Ban" 클릭
    │
    ├─ [Ban] POST /v3/admin/blacklist
    │   Body: { accountId, reason }
    │   Header: Authorization: Bearer <password>
    │   Header: X-Admin-Username: <admin>
    │   └→ DynamoDB UpdateCommand (isBanned=true, banReason, bannedAt, bannedBy)
    │
    ├─ [List] GET /v3/admin/blacklist
    │   └→ DynamoDB ScanCommand (FilterExpression: isBanned = true)
    │
    └─ [Unban] DELETE /v3/admin/blacklist/{accountId}
        └→ DynamoDB UpdateCommand (REMOVE isBanned, banReason, bannedAt, bannedBy)

Public Endpoints (get-leaderboard, get-my-rank, etc.)
    │
    ├─ getBannedAccountIds() → Set<string> (ProjectionExpression: accountId only)
    ├─ Main query/scan (기존 로직)
    └─ Filter: bannedIds.has(accountId) → exclude
```

---

## 3. 백엔드 구현 상세

### Phase 1: 타입 및 데이터 레이어

#### 3.1 타입 확장

**파일**: `cdk/lambda-src/leaderboard-v3/src/types/index.ts`

```typescript
// Account 인터페이스에 추가 (line ~109 이후)
export interface Account {
  // ... 기존 필드 ...

  // Ban status (soft exclusion)
  isBanned?: boolean;
  banReason?: string;
  bannedAt?: string;  // ISO 8601
  bannedBy?: string;  // Admin username
}

// 새로운 타입 추가
export interface BanAccountRequest {
  accountId: string;
  reason?: string;
}

export interface BannedAccountEntry {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: Platform;
  displayName?: string;
  profileImageUrl?: string;
  postCount: number;
  totalPostScore: number;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
}

export interface BannedAccountsResponse {
  success: true;
  accounts: BannedAccountEntry[];
  total: number;
}
```

#### 3.2 DynamoDB 오퍼레이션 추가

**파일**: `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts`

```typescript
/**
 * Ban an account (soft exclusion)
 * Sets isBanned=true with metadata. Account data is preserved.
 */
export async function banAccount(params: {
  accountId: string;
  reason?: string;
  bannedBy: string;
}): Promise<Account> {
  const { accountId, reason, bannedBy } = params;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression:
        'SET isBanned = :banned, banReason = :reason, bannedAt = :at, bannedBy = :by',
      ExpressionAttributeValues: {
        ':banned': true,
        ':reason': reason || 'No reason provided',
        ':at': new Date().toISOString(),
        ':by': bannedBy,
      },
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Account;
}

/**
 * Unban an account
 * Removes all ban-related fields from the record.
 */
export async function unbanAccount(accountId: string): Promise<Account> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: 'REMOVE isBanned, banReason, bannedAt, bannedBy',
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Account;
}

/**
 * Get all banned accounts (full data for admin list view)
 */
export async function getBannedAccounts(): Promise<Account[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      FilterExpression: 'isBanned = :banned',
      ExpressionAttributeValues: { ':banned': true },
    })
  );

  return (result.Items || []) as Account[];
}

/**
 * Get banned account IDs only (lightweight, for filtering in public endpoints)
 * Uses ProjectionExpression to minimize data transfer.
 */
export async function getBannedAccountIds(): Promise<Set<string>> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      FilterExpression: 'isBanned = :banned',
      ExpressionAttributeValues: { ':banned': true },
      ProjectionExpression: 'accountId',
    })
  );

  const ids = new Set<string>();
  for (const item of result.Items || []) {
    ids.add((item as { accountId: string }).accountId);
  }
  return ids;
}

/**
 * Get a single account by ID
 */
export async function getAccountById(accountId: string): Promise<Account | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
    })
  );

  return (result.Item as Account) || null;
}
```

---

### Phase 2: Admin Blacklist Handler

#### 3.3 새 Lambda 핸들러 생성

**파일**: `cdk/lambda-src/leaderboard-v3/src/handlers/admin-blacklist.ts`

```typescript
/**
 * Admin Blacklist Management Endpoints
 *
 * GET    /v3/admin/blacklist              - List banned accounts
 * POST   /v3/admin/blacklist              - Ban an account
 * DELETE  /v3/admin/blacklist/{accountId}  - Unban an account
 *
 * Authentication: Bearer token (LEADERBOARD_V3_ADMIN_PASSWORD)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BanAccountRequest, BannedAccountEntry, BannedAccountsResponse } from '../types';
import { banAccount, unbanAccount, getBannedAccounts, getAccountById } from '../services/dynamodb-client';

const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Username',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function validateAuth(event: APIGatewayProxyEvent): boolean {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  if (!authHeader || !ADMIN_PASSWORD) return false;
  const parts = authHeader.split(' ');
  return parts[0] === 'Bearer' && parts[1] === ADMIN_PASSWORD;
}

function getAdminUsername(event: APIGatewayProxyEvent): string {
  return event.headers['X-Admin-Username'] || event.headers['x-admin-username'] || 'unknown';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  // Auth check
  if (!validateAuth(event)) {
    return createResponse(401, { success: false, error: 'Unauthorized' });
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return await handleList();
      case 'POST':
        return await handleBan(event);
      case 'DELETE':
        return await handleUnban(event);
      default:
        return createResponse(405, { success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin blacklist error:', error);
    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

async function handleList(): Promise<APIGatewayProxyResult> {
  const accounts = await getBannedAccounts();

  const entries: BannedAccountEntry[] = accounts.map((a) => ({
    accountId: a.accountId,
    username: a.username,
    originalUsername: a.originalUsername,
    platform: a.platform,
    displayName: a.displayName,
    profileImageUrl: a.profileImageUrl,
    postCount: a.postCount,
    totalPostScore: a.totalPostScore,
    banReason: a.banReason,
    bannedAt: a.bannedAt,
    bannedBy: a.bannedBy,
  }));

  const response: BannedAccountsResponse = {
    success: true,
    accounts: entries,
    total: entries.length,
  };

  return createResponse(200, response);
}

async function handleBan(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body: BanAccountRequest = JSON.parse(event.body || '{}');

  if (!body.accountId) {
    return createResponse(400, { success: false, error: 'accountId is required' });
  }

  // Verify account exists
  const account = await getAccountById(body.accountId);
  if (!account) {
    return createResponse(404, { success: false, error: 'Account not found' });
  }

  if (account.isBanned) {
    return createResponse(409, { success: false, error: 'Account is already banned' });
  }

  const adminUsername = getAdminUsername(event);
  const updated = await banAccount({
    accountId: body.accountId,
    reason: body.reason,
    bannedBy: adminUsername,
  });

  return createResponse(200, {
    success: true,
    account: {
      accountId: updated.accountId,
      username: updated.username,
      banReason: updated.banReason,
      bannedAt: updated.bannedAt,
      bannedBy: updated.bannedBy,
    },
  });
}

async function handleUnban(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const accountId = event.pathParameters?.accountId;

  if (!accountId) {
    return createResponse(400, { success: false, error: 'accountId is required' });
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return createResponse(404, { success: false, error: 'Account not found' });
  }

  if (!account.isBanned) {
    return createResponse(409, { success: false, error: 'Account is not banned' });
  }

  const updated = await unbanAccount(accountId);

  return createResponse(200, {
    success: true,
    account: {
      accountId: updated.accountId,
      username: updated.username,
    },
  });
}
```

---

### Phase 3: 공개 엔드포인트 필터링

#### 3.4 `get-leaderboard.ts` 수정

**위치**: 누적 뷰 (line ~390-413)

```typescript
// Before: 단순 postCount 필터
const computedScores = accounts
  .filter((account) => account.postCount > 0)
  .map((account) => calculateUserScore(account));

// After: banned 계정 제외
const bannedIds = await getBannedAccountIds();
const computedScores = accounts
  .filter((account) => account.postCount > 0 && !bannedIds.has(account.accountId))
  .map((account) => calculateUserScore(account));
```

**위치**: 시즌 뷰 (line ~487-505)

```typescript
// After: 시즌 스코어에서도 banned 제외
const bannedIds = await getBannedAccountIds();
const filteredScores = seasonScores
  .filter((score) => !bannedIds.has(score.accountId));
```

#### 3.5 `get-my-rank.ts` 수정

```typescript
// Account 조회 후 ban 체크 추가
const account = await getAccountByUsername(platform, normalizedUsername);
if (!account || account.isBanned) {
  return createResponse(200, {
    success: true,
    data: { status: 'not_ranked' },
    seasonId,
    calculatedAt: new Date().toISOString(),
  });
}
```

#### 3.6 `search-accounts.ts` 수정

```typescript
// 검색 결과 필터링
const results = accounts
  .filter((a) => a.username.includes(query) && !a.isBanned)
  .slice(0, limit);
```

#### 3.7 `get-featured-feed.ts` 수정

```typescript
// 피드 생성 시 banned 계정의 포스트 제외
const bannedIds = await getBannedAccountIds();
const filteredPosts = posts.filter((post) => !bannedIds.has(post.accountId));
```

#### 3.8 `get-top-climbers.ts` 수정

```typescript
// 클라이머 목록에서 banned 제외
const bannedIds = await getBannedAccountIds();
const climbers = rankedEntries
  .filter((entry) => !bannedIds.has(entry.accountId));
```

#### 3.9 `create-post.ts` 수정

```typescript
// 포스트 등록 시 ban 체크 (403 거부)
const existingAccount = await getAccountByUsername(platform, username);
if (existingAccount?.isBanned) {
  return createResponse(403, {
    success: false,
    error: 'This account is banned and cannot register posts',
    username,
  });
}
```

---

### Phase 4: CDK 인프라

#### 3.10 `leaderboard-v3-stack.ts` 수정

**파일**: `cdk/lib/leaderboard-v3-stack.ts`

```typescript
// 1. 새 Lambda 함수 추가
const adminBlacklistLambda = new NodejsFunction(
  this,
  'LeaderboardV3AdminBlacklistFunction',
  {
    ...nodejsFunctionDefaults,
    functionName: `${envPrefix}nasun-leaderboard-v3-admin-blacklist`,
    entry: path.join(lambdaSrcPath, 'handlers', 'admin-blacklist.ts'),
    handler: 'handler',
    timeout: cdk.Duration.seconds(30),
    memorySize: 256,
    description: 'Leaderboard V3: Admin blacklist management (ban/unban/list)',
    environment: {
      ...commonEnvVars,
      // LEADERBOARD_V3_ADMIN_PASSWORD는 commonEnvVars에 이미 포함
    },
  }
);

// 2. DynamoDB 권한 부여
this.accountsTable.grantReadWriteData(adminBlacklistLambda);

// 3. API Gateway 라우트 추가
const adminBlacklistResource = adminResource.addResource('blacklist');
const adminBlacklistIntegration = new apigw.LambdaIntegration(adminBlacklistLambda);

adminBlacklistResource.addMethod('GET', adminBlacklistIntegration);   // List
adminBlacklistResource.addMethod('POST', adminBlacklistIntegration);  // Ban
adminBlacklistResource.addCorsPreflight({
  allowOrigins: apigw.Cors.ALL_ORIGINS,
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Username'],
});

const adminBlacklistIdResource = adminBlacklistResource.addResource('{accountId}');
adminBlacklistIdResource.addMethod('DELETE', adminBlacklistIntegration);  // Unban
adminBlacklistIdResource.addCorsPreflight({
  allowOrigins: apigw.Cors.ALL_ORIGINS,
  allowMethods: ['DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
});
```

---

## 4. 프론트엔드 구현 상세

### Phase 5: 타입 정의

#### 4.1 Blacklist 타입

**파일**: `frontend/src/features/admin/types/index.ts` (기존 파일에 추가)

```typescript
// Blacklist types
export interface BannedAccount {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: string;
  displayName?: string;
  profileImageUrl?: string;
  postCount: number;
  totalPostScore: number;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
}

export interface BannedAccountsResponse {
  success: boolean;
  accounts: BannedAccount[];
  total: number;
}

export interface BanAccountRequest {
  accountId: string;
  reason?: string;
}
```

---

### Phase 6: API 클라이언트

#### 4.2 API 함수 추가

**파일**: `frontend/src/features/admin/services/leaderboardV3Api.ts` (기존 파일에 추가)

```typescript
const V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

/**
 * Get list of banned accounts
 */
export async function getBannedAccounts(adminPassword: string): Promise<BannedAccountsResponse> {
  const response = await fetch(`${V3_API_URL}/v3/admin/blacklist`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch banned accounts: ${response.status}`);
  return response.json();
}

/**
 * Ban an account
 */
export async function banAccountApi(
  adminPassword: string,
  accountId: string,
  reason?: string,
  adminUsername?: string
): Promise<void> {
  const response = await fetch(`${V3_API_URL}/v3/admin/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
      ...(adminUsername && { 'X-Admin-Username': adminUsername }),
    },
    body: JSON.stringify({ accountId, reason }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Ban failed: ${response.status}`);
  }
}

/**
 * Unban an account
 */
export async function unbanAccountApi(
  adminPassword: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `${V3_API_URL}/v3/admin/blacklist/${encodeURIComponent(accountId)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Unban failed: ${response.status}`);
  }
}
```

---

### Phase 7: React Hook

#### 4.3 `useBlacklist` Hook

**파일**: `frontend/src/features/admin/hooks/useBlacklist.ts` (새 파일)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getBannedAccounts, banAccountApi, unbanAccountApi } from '../services/leaderboardV3Api';

export function useBlacklist(adminPassword: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'blacklist'],
    queryFn: () => getBannedAccounts(adminPassword),
    enabled: !!adminPassword,
    staleTime: 60_000, // 1 minute
  });

  const banMutation = useMutation({
    mutationFn: (params: { accountId: string; reason?: string; adminUsername?: string }) =>
      banAccountApi(adminPassword, params.accountId, params.reason, params.adminUsername),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (accountId: string) => unbanAccountApi(adminPassword, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  return {
    bannedAccounts: query.data?.accounts || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    ban: banMutation.mutateAsync,
    unban: unbanMutation.mutateAsync,
    isBanning: banMutation.isPending,
    isUnbanning: unbanMutation.isPending,
    refetch: query.refetch,
  };
}
```

---

### Phase 8: 관리 페이지

#### 4.4 `BlacklistManagement` 페이지

**파일**: `frontend/src/features/admin/pages/BlacklistManagement.tsx` (새 파일)

**UI 구성**:
```
BlacklistManagement
├── AdminLayout (기존 wrapper)
├── Header ("Blacklist Management" + 차단 계정 수 표시)
├── SearchSection
│   ├── Username 검색 Input (V3 account search API 활용)
│   └── SearchResults (목록 + "Ban" 버튼)
├── BannedAccountsTable
│   ├── Columns: Username, Display Name, Reason, Banned At, Banned By, Actions
│   ├── Row (프로필 이미지, username, 사유, 날짜, "Unban" 버튼)
│   └── EmptyState ("No banned accounts")
└── BanConfirmModal
    ├── Account 정보 표시
    ├── Reason textarea (필수 아님)
    └── Confirm / Cancel 버튼
```

**주요 기능**:
1. **검색**: 기존 `/v3/accounts/search?q=` API 활용하여 계정 검색
2. **차단**: 검색 결과에서 "Ban" 클릭 → 사유 입력 모달 → 확인 → API 호출
3. **목록**: 차단된 계정 테이블 (정렬: 최신 차단순)
4. **해제**: "Unban" 버튼 → 확인 대화상자 → API 호출

---

### Phase 9: 라우팅 및 설정

#### 4.5 `adminConfig.ts` 수정

```typescript
// ADMIN_NAV_ITEMS에 추가
{ path: '/admin/users', label: 'Blacklist', icon: '🚫' },

// ADMIN_DASHBOARD_FEATURES에서 disabled 제거
{
  title: 'Blacklist Management',
  description: 'Manage user bans and restrictions for the leaderboard.',
  icon: '🚫',
  link: '/admin/users',
  linkText: 'Manage Users',
  // disabled: true  ← 삭제
},
```

#### 4.6 `AppRoutes.tsx` 수정

```typescript
const BlacklistManagement = lazy(() =>
  import("../features/admin/pages/BlacklistManagement").then(m => ({ default: m.BlacklistManagement }))
);

// Admin routes section에 추가
<Route
  path="/admin/users"
  element={
    <AdminRoute>
      <Suspense fallback={<SectionLoading />}>
        <BlacklistManagement />
      </Suspense>
    </AdminRoute>
  }
/>
```

---

## 5. 보안 고려사항

| 항목 | 대응 |
| :--- | :--- |
| **인증 우회** | Bearer token 필수, 토큰 불일치 시 401 반환 |
| **IDOR (accountId 조작)** | accountId는 UUID, 존재 여부 확인 후 작업 |
| **Race Condition** | Ban 중 포스트 등록 시 매우 작은 시간 창. 운영 특성상 수용 가능 |
| **XSS (banReason)** | 프론트엔드에서 textContent로 렌더링, HTML 미사용 |
| **데이터 무결성** | Soft exclusion - 데이터 삭제 없음, 완전 복구 가능 |
| **감사 추적** | `bannedBy`, `bannedAt` 필드로 누가 언제 차단했는지 기록 |

---

## 6. 성능 영향 분석

| 항목 | 영향 | 비고 |
| :--- | :--- | :--- |
| `getBannedAccountIds()` 호출 | +30~50ms/요청 | ProjectionExpression으로 최소 데이터 전송 |
| 차단 계정 100개 기준 | < 1KB 전송량 | accountId (UUID) × 100 |
| In-memory Set.has() | O(1) per entry | 무시 가능 수준 |

**향후 최적화 (필요 시)**:
- Lambda 메모리 캐시 (5분 TTL) 도입하여 DynamoDB 호출 횟수 감소
- 현재 트래픽 수준에서는 불필요

---

## 7. 스냅샷 및 히스토리 영향

| 항목 | 동작 |
| :--- | :--- |
| **과거 스냅샷** | 차단 이전에 생성된 스냅샷에는 해당 계정이 포함됨 (의도된 동작) |
| **새 스냅샷** | `generate-snapshot.ts`에서 `getBannedAccountIds()` 필터 적용 필요 |
| **차단 해제 후** | 다음 스냅샷부터 다시 포함, 과거 부재 기간은 유지 |

---

## 8. 구현 순서 및 의존성

```
Phase 1 (Types + DB) ─────────┐
                               ├─→ Phase 2 (Handler) ─→ Phase 4 (CDK)
Phase 5 (Frontend Types) ──┐  │
                            ├──┼─→ Phase 3 (Public Endpoint Filters)
Phase 6 (API Client) ──────┤  │
                            │  │
Phase 7 (Hook) ─────────────┤  │
                            │  │
Phase 8 (Page) ─────────────┘  │
                               │
Phase 9 (Routing/Config) ──────┘
```

**병렬 가능**:
- Backend (Phase 1-4) + Frontend (Phase 5-9) 동시 진행 가능
- Phase 1은 모든 것의 선행 조건

---

## 9. 테스트 검증

### 9.1 Backend 검증

```bash
# 1. Lambda 빌드 확인
cd apps/nasun-website/cdk/lambda-src/leaderboard-v3
npx tsc --noEmit

# 2. CDK 합성 확인
cd apps/nasun-website/cdk
npx cdk synth

# 3. 배포 후 API 테스트
# Ban
curl -X POST https://<api-id>.execute-api.ap-northeast-2.amazonaws.com/prod/v3/admin/blacklist \
  -H "Authorization: Bearer <password>" \
  -H "X-Admin-Username: Naru010110" \
  -H "Content-Type: application/json" \
  -d '{"accountId": "<target-id>", "reason": "Spam activity"}'

# List
curl https://<api-id>.execute-api.ap-northeast-2.amazonaws.com/prod/v3/admin/blacklist \
  -H "Authorization: Bearer <password>"

# Unban
curl -X DELETE https://<api-id>.execute-api.ap-northeast-2.amazonaws.com/prod/v3/admin/blacklist/<target-id> \
  -H "Authorization: Bearer <password>"

# Verify filtering (banned account should not appear)
curl https://<api-id>.execute-api.ap-northeast-2.amazonaws.com/prod/v3/leaderboard?seasonId=<season-id>
```

### 9.2 Frontend 검증

```bash
# 빌드 확인
cd apps/nasun-website/frontend
pnpm build

# 개발 서버에서 확인
pnpm dev
# 1. /admin 접속 → Blacklist Management 카드 활성화 확인
# 2. /admin/users 접속 → 페이지 로드 확인
# 3. 계정 검색 → Ban 수행 → 목록에 표시 확인
# 4. Unban 수행 → 목록에서 제거 확인
```

---

## 10. 수정 대상 파일 요약

### 백엔드 (신규)
| 파일 | 설명 |
| :--- | :--- |
| `cdk/lambda-src/leaderboard-v3/src/handlers/admin-blacklist.ts` | Admin blacklist CRUD 핸들러 |

### 백엔드 (수정)
| 파일 | 변경 내용 |
| :--- | :--- |
| `cdk/lambda-src/leaderboard-v3/src/types/index.ts` | Account 인터페이스 + Blacklist 타입 추가 |
| `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts` | ban/unban/getBanned DB 오퍼레이션 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/get-leaderboard.ts` | banned 필터링 추가 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/get-my-rank.ts` | ban 체크 추가 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/search-accounts.ts` | banned 제외 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts` | banned 포스트 제외 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/get-top-climbers.ts` | banned 제외 |
| `cdk/lambda-src/leaderboard-v3/src/handlers/create-post.ts` | banned 계정 등록 거부 |
| `cdk/lib/leaderboard-v3-stack.ts` | Lambda + API Gateway 리소스 추가 |

### 프론트엔드 (신규)
| 파일 | 설명 |
| :--- | :--- |
| `frontend/src/features/admin/pages/BlacklistManagement.tsx` | 관리 페이지 |
| `frontend/src/features/admin/hooks/useBlacklist.ts` | TanStack Query hook |

### 프론트엔드 (수정)
| 파일 | 변경 내용 |
| :--- | :--- |
| `frontend/src/features/admin/types/index.ts` | Blacklist 타입 추가 |
| `frontend/src/features/admin/services/leaderboardV3Api.ts` | API 함수 추가 |
| `frontend/src/features/admin/config/adminConfig.ts` | Nav item + Feature card 활성화 |
| `frontend/src/routes/AppRoutes.tsx` | `/admin/users` 라우트 추가 |

---

## Appendix A: 정확한 코드 수정 지점 (Before/After)

> 아래는 각 핸들러에서 정확히 어떤 코드를 찾아 수정해야 하는지를 보여줍니다.
> "FIND" 블록을 찾아서 "REPLACE" 블록으로 교체하세요.

### A.1 `get-leaderboard.ts` - import 추가

**파일**: `cdk/lambda-src/leaderboard-v3/src/handlers/get-leaderboard.ts`

**FIND** (line 43-49):
```typescript
import {
  getAllAccounts,
  getActiveSeason,
  getSeasonById,
  getSeasonAccountScores,
} from '../services/dynamodb-client';
import { calculateUserScore, compareScores } from '../services/score-calculator';
```

**REPLACE**:
```typescript
import {
  getAllAccounts,
  getActiveSeason,
  getSeasonById,
  getSeasonAccountScores,
  getBannedAccountIds,
} from '../services/dynamodb-client';
import { calculateUserScore, compareScores } from '../services/score-calculator';
```

### A.2 `get-leaderboard.ts` - 누적 뷰 필터링

**FIND** (line 391-395):
```typescript
      // Get all accounts and calculate real-time scores
      const accounts = await getAllAccounts();
      const computedScores: ComputedUserScore[] = accounts
        .filter((account) => account.postCount > 0)
        .map((account) => calculateUserScore(account));
```

**REPLACE**:
```typescript
      // Get all accounts and calculate real-time scores
      const accounts = await getAllAccounts();
      const bannedIds = await getBannedAccountIds();
      const computedScores: ComputedUserScore[] = accounts
        .filter((account) => account.postCount > 0 && !bannedIds.has(account.accountId))
        .map((account) => calculateUserScore(account));
```

### A.3 `get-leaderboard.ts` - 시즌 뷰 필터링

**FIND** (line 486-492):
```typescript
    // Recalculate scores with current timestamp and sort
    const recalculatedScores = seasonScores
      .map((score) => ({
        ...score,
        ...recalculateSeasonScore(score),
      }))
      .sort((a, b) => b.userScore - a.userScore);
```

**REPLACE**:
```typescript
    // Filter banned accounts and recalculate scores
    const bannedIds = await getBannedAccountIds();
    const recalculatedScores = seasonScores
      .filter((score) => !bannedIds.has(score.accountId))
      .map((score) => ({
        ...score,
        ...recalculateSeasonScore(score),
      }))
      .sort((a, b) => b.userScore - a.userScore);
```

### A.4 `get-my-rank.ts` - ban 체크 추가

**FIND** (line 277-288):
```typescript
    // Get account by username
    const account = await getAccountByUsername(username);
    if (!account) {
      // User not found in leaderboard
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: { status: 'not_ranked' },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, notRankedResponse);
    }
```

**REPLACE**:
```typescript
    // Get account by username
    const account = await getAccountByUsername(username);
    if (!account || account.isBanned) {
      // User not found or banned
      const notRankedResponse: MyRankResponse = {
        success: true,
        data: { status: 'not_ranked' },
        seasonId,
        calculatedAt: new Date().toISOString(),
      };
      return createResponse(200, notRankedResponse);
    }
```

> **참고**: `get-my-rank.ts`는 자체 `getAccountByUsername` 함수를 내부에 정의하고 있음 (line 113). import 변경 불필요.

### A.5 `search-accounts.ts` - 검색 결과 필터링

**FIND** (line 92-104):
```typescript
  const accounts = (result.Items || []) as Account[];

  // Filter and sort: exact matches first, then substring matches
  return accounts
    .filter((a) => a.username.includes(normalizedQuery))
    .sort((a, b) => {
      // Exact match first
      if (a.username === normalizedQuery && b.username !== normalizedQuery) return -1;
      if (b.username === normalizedQuery && a.username !== normalizedQuery) return 1;
      // Then by post count (more active accounts first)
      return (b.postCount || 0) - (a.postCount || 0);
    })
    .slice(0, limit);
```

**REPLACE**:
```typescript
  const accounts = (result.Items || []) as Account[];

  // Filter banned accounts, then sort: exact matches first, then substring matches
  return accounts
    .filter((a) => a.username.includes(normalizedQuery) && !a.isBanned)
    .sort((a, b) => {
      // Exact match first
      if (a.username === normalizedQuery && b.username !== normalizedQuery) return -1;
      if (b.username === normalizedQuery && a.username !== normalizedQuery) return 1;
      // Then by post count (more active accounts first)
      return (b.postCount || 0) - (a.postCount || 0);
    })
    .slice(0, limit);
```

### A.6 `get-featured-feed.ts` - Rankers 필터링

**FIND** (line 213-216):
```typescript
    const allScores = await getSeasonAccountScores(seasonId);
    const topRankers = allScores
      .sort((a, b) => b.userScore - a.userScore)
      .slice(0, 3);
```

**REPLACE**:
```typescript
    const allScores = await getSeasonAccountScores(seasonId);
    const bannedIds = await getBannedAccountIds();
    const topRankers = allScores
      .filter((score) => !bannedIds.has(score.accountId))
      .sort((a, b) => b.userScore - a.userScore)
      .slice(0, 3);
```

**추가 import** (line 24-28 근처):
```typescript
import {
  getActiveSeason,
  getSeasonById,
  getSeasonAccountScores,
  getBannedAccountIds,  // 추가
} from '../services/dynamodb-client';
```

### A.7 `get-featured-feed.ts` - Climbers 필터링

Climbers는 `calculateTopClimbers` 함수 결과에서 필터링합니다.

**FIND** (line 242):
```typescript
    const topClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, 3);
```

**REPLACE**:
```typescript
    const topClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, 3)
      .filter((climber) => !bannedIds.has(climber.accountId));
```

### A.8 `get-top-climbers.ts` - Climbers 필터링

**FIND** (line 255-256):
```typescript
    // Calculate top climbers
    const climbers = calculateTopClimbers(currentSnapshot, previousSnapshot, limit);
```

**REPLACE**:
```typescript
    // Calculate top climbers (filter banned accounts)
    const { getBannedAccountIds } = await import('../services/dynamodb-client');
    const bannedIds = await getBannedAccountIds();
    const allClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, limit + 20);
    const climbers = allClimbers
      .filter((climber) => !bannedIds.has(climber.accountId))
      .slice(0, limit);
```

> **참고**: `get-top-climbers.ts`는 `dynamodb-client`를 import하지 않으므로 dynamic import 사용.
> 또는 파일 상단에 static import를 추가해도 됩니다:
> ```typescript
> import { getActiveSeason, getSeasonById, getBannedAccountIds } from '../services/dynamodb-client';
> ```

### A.9 `create-post.ts` - Ban 체크 (포스트 등록 거부)

**추가 import** (line 16):
```typescript
import { normalizeUrl } from '../utils/url-normalizer';
import { createPost, getPostByUrl, getAccountByUsername } from '../services/dynamodb-client';
```
> `getAccountByUsername`를 추가 import

**FIND** (line 180-190):
```typescript
    // Check for duplicate
    const existingPost = await getPostByUrl(normalized.normalizedUrl);
    if (existingPost) {
      return createResponse(409, {
        success: false,
        error: 'This post has already been registered',
        isDuplicate: true,
        post: existingPost,
      });
    }
```

**REPLACE**:
```typescript
    // Check if account is banned
    const existingAccount = await getAccountByUsername(normalized.platform, normalized.username);
    if (existingAccount?.isBanned) {
      return createResponse(403, {
        success: false,
        error: 'This account is banned and cannot register posts',
        username: normalized.username,
      });
    }

    // Check for duplicate
    const existingPost = await getPostByUrl(normalized.normalizedUrl);
    if (existingPost) {
      return createResponse(409, {
        success: false,
        error: 'This post has already been registered',
        isDuplicate: true,
        post: existingPost,
      });
    }
```

---

## Appendix B: CDK 스택 정확한 삽입 위치

**파일**: `cdk/lib/leaderboard-v3-stack.ts`

### B.1 기존 변수 참조 (이미 정의됨, 새로 만들지 마세요)

| 변수 | 정의 위치 | 설명 |
| :--- | :--- | :--- |
| `nodejsFunctionDefaults` | line 209-215 | Lambda 공통 옵션 (runtime, environment, logRetention, bundling) |
| `lambdaEnvironment` | line 180-188 | 모든 테이블명 + ADMIN_PASSWORD 환경변수 |
| `lambdaSrcPath` | line 195 | `path.join(__dirname, '..', 'lambda-src', 'leaderboard-v3', 'src')` |
| `envPrefix` | line 48 | `environmentName === 'prod' ? '' : '${environmentName}-'` |
| `adminResource` | line 507 | `v3Resource.addResource('admin')` — 이미 존재하는 `/v3/admin` 리소스 |
| `this.accountsTable` | line 99 | `leaderboard-v3-accounts` DynamoDB Table |

### B.2 Lambda 함수 추가 (line 377 이후, searchAccountsLambda 정의 뒤에 삽입)

**FIND** (line 377-378):
```typescript
    );

    // Grant DynamoDB permissions
```

**INSERT BEFORE** `// Grant DynamoDB permissions`:
```typescript
    // Admin Blacklist Lambda
    const adminBlacklistLambda = new NodejsFunction(
      this,
      'LeaderboardV3AdminBlacklistFunction',
      {
        ...nodejsFunctionDefaults,
        functionName: `${envPrefix}nasun-leaderboard-v3-admin-blacklist`,
        entry: path.join(lambdaSrcPath, 'handlers', 'admin-blacklist.ts'),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        description: 'Leaderboard V3: Admin blacklist management (ban/unban/list)',
      }
    );

```

### B.3 DynamoDB 권한 추가 (line 410 이후, 기존 permissions 블록 끝에)

**FIND** (line 408-410):
```typescript
    // Search Accounts permissions (Phase 8)
    this.accountsTable.grantReadData(searchAccountsLambda);
    this.seasonAccountsTable.grantReadData(searchAccountsLambda);
```

**INSERT AFTER**:
```typescript

    // Admin Blacklist permissions
    this.accountsTable.grantReadWriteData(adminBlacklistLambda);
```

### B.4 API Gateway 라우트 추가 (line 532 이후, adminStatsResource 뒤에)

**FIND** (line 530-532):
```typescript
    // GET /v3/admin/stats - Dashboard statistics (Phase 7)
    const adminStatsResource = adminResource.addResource('stats');
    adminStatsResource.addMethod('GET', new apigw.LambdaIntegration(adminStatsLambda));
```

**INSERT AFTER**:
```typescript

    // Admin Blacklist routes
    // POST /v3/admin/blacklist - Ban account
    // GET /v3/admin/blacklist - List banned accounts
    const adminBlacklistResource = adminResource.addResource('blacklist');
    const adminBlacklistIntegration = new apigw.LambdaIntegration(adminBlacklistLambda);
    adminBlacklistResource.addMethod('POST', adminBlacklistIntegration);
    adminBlacklistResource.addMethod('GET', adminBlacklistIntegration);

    // DELETE /v3/admin/blacklist/{accountId} - Unban account
    const adminBlacklistIdResource = adminBlacklistResource.addResource('{accountId}');
    adminBlacklistIdResource.addMethod('DELETE', adminBlacklistIntegration);
```

---

## Appendix C: `dynamodb-client.ts` 수정 사항

**파일**: `cdk/lambda-src/leaderboard-v3/src/services/dynamodb-client.ts`

### C.1 중요: `getAccountById`는 이미 존재 (line 280)

**재구현 금지**. 이미 다음과 같이 정의되어 있습니다:
```typescript
export async function getAccountById(accountId: string): Promise<Account | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
    })
  );
  return (result.Item as Account) || null;
}
```

### C.2 새 함수 삽입 위치: line 289 이후 (`getAccountById` 함수 끝 뒤)

**FIND** (line 288-295):
```typescript
  return (result.Item as Account) || null;
}

/**
 * Lookup user profile from UserProfiles table using twitterHandle-index GSI
 * Returns profile data if the user has logged in to Nasun website
 */
export async function lookupUserProfile(twitterHandle: string): Promise<{
```

**INSERT BETWEEN** (`getAccountById` 뒤, `lookupUserProfile` 앞):
```typescript
  return (result.Item as Account) || null;
}

/**
 * Ban an account (soft exclusion)
 */
export async function banAccount(params: {
  accountId: string;
  reason?: string;
  bannedBy: string;
}): Promise<Account> {
  const { accountId, reason, bannedBy } = params;
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression:
        'SET isBanned = :banned, banReason = :reason, bannedAt = :at, bannedBy = :by',
      ExpressionAttributeValues: {
        ':banned': true,
        ':reason': reason || 'No reason provided',
        ':at': new Date().toISOString(),
        ':by': bannedBy,
      },
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes as Account;
}

/**
 * Unban an account
 */
export async function unbanAccount(accountId: string): Promise<Account> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: 'REMOVE isBanned, banReason, bannedAt, bannedBy',
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes as Account;
}

/**
 * Get all banned accounts (full data)
 */
export async function getBannedAccounts(): Promise<Account[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      FilterExpression: 'isBanned = :banned',
      ExpressionAttributeValues: { ':banned': true },
    })
  );
  return (result.Items || []) as Account[];
}

/**
 * Get banned account IDs only (lightweight, for public endpoint filtering)
 */
export async function getBannedAccountIds(): Promise<Set<string>> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      FilterExpression: 'isBanned = :banned',
      ExpressionAttributeValues: { ':banned': true },
      ProjectionExpression: 'accountId',
    })
  );
  const ids = new Set<string>();
  for (const item of result.Items || []) {
    ids.add((item as { accountId: string }).accountId);
  }
  return ids;
}

/**
 * Lookup user profile from UserProfiles table using twitterHandle-index GSI
 * Returns profile data if the user has logged in to Nasun website
 */
export async function lookupUserProfile(twitterHandle: string): Promise<{
```

> **참고**: `UpdateCommand`가 이미 import 되어 있는지 확인하세요 (line 14 `import { ... UpdateCommand ... }` 에 이미 포함되어 있음).

---

## Appendix D: 프론트엔드 완전한 구현 코드

### D.1 `BlacklistManagement.tsx` (전체 코드)

**파일**: `frontend/src/features/admin/pages/BlacklistManagement.tsx`

```typescript
import { useState } from 'react';
import { AdminLayout } from '../components/AdminLayout';
import { SectionLayout } from '@/components/layout/SectionLayout';
import { Button } from '@/components/ui/button';
import { PageTitle } from '@/components/ui/PageTitle';
import { useBlacklist } from '../hooks/useBlacklist';
import type { BannedAccount } from '../types/index';

const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;
const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

interface SearchResult {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: string;
  displayName?: string;
  profileImageUrl?: string;
  userScore?: number;
  rank?: number;
}

export function BlacklistManagement() {
  const {
    bannedAccounts,
    total,
    isLoading,
    ban,
    unban,
    isBanning,
    isUnbanning,
  } = useBlacklist(ADMIN_PASSWORD);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Ban confirmation state
  const [banTarget, setBanTarget] = useState<SearchResult | null>(null);
  const [banReason, setBanReason] = useState('');

  // Unban confirmation state
  const [unbanTarget, setUnbanTarget] = useState<BannedAccount | null>(null);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    setIsSearching(true);
    try {
      const response = await fetch(
        `${LEADERBOARD_V3_API_URL}/v3/accounts/search?q=${encodeURIComponent(searchQuery)}&limit=10`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.accounts || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleBanConfirm = async () => {
    if (!banTarget) return;
    try {
      await ban({ accountId: banTarget.accountId, reason: banReason || undefined });
      setBanTarget(null);
      setBanReason('');
      setSearchResults((prev) => prev.filter((r) => r.accountId !== banTarget.accountId));
    } catch (error) {
      console.error('Ban failed:', error);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!unbanTarget) return;
    try {
      await unban(unbanTarget.accountId);
      setUnbanTarget(null);
    } catch (error) {
      console.error('Unban failed:', error);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="bg-nasun-black min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c4 border-t-transparent" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="bg-nasun-black min-h-screen">
        <SectionLayout className="!max-w-6xl !pt-12">
          {/* Header */}
          <div className="mb-10">
            <PageTitle as="h2" align="left" className="!mb-4">
              Blacklist Management
            </PageTitle>
            <p className="text-nasun-white/60 text-lg font-light max-w-2xl leading-relaxed">
              Manage banned accounts on the leaderboard. Banned accounts are hidden from rankings
              and cannot register new posts.
            </p>
          </div>

          <div className="flex flex-col gap-8 w-full">
            {/* Search Section */}
            <div className="bg-nasun-c6/30 border border-white/10 rounded-lg p-6">
              <h3 className="text-nasun-white font-semibold text-lg mb-4">Search Account</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter username to search..."
                  className="flex-1 bg-nasun-black/50 border border-white/20 rounded-md px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4"
                />
                <Button
                  variant="c4"
                  onClick={handleSearch}
                  disabled={isSearching || searchQuery.trim().length < 2}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((result) => (
                    <div
                      key={result.accountId}
                      className="flex items-center justify-between bg-nasun-black/30 border border-white/5 rounded-md px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {result.profileImageUrl && (
                          <img
                            src={result.profileImageUrl}
                            alt={result.username}
                            className="w-8 h-8 rounded-full"
                          />
                        )}
                        <div>
                          <span className="text-nasun-white text-sm font-medium">
                            @{result.originalUsername || result.username}
                          </span>
                          {result.displayName && (
                            <span className="text-nasun-white/40 text-xs ml-2">
                              {result.displayName}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outlineC1"
                        size="sm"
                        onClick={() => setBanTarget(result)}
                        className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                      >
                        Ban
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Banned Accounts Table */}
            <div className="bg-nasun-c6/30 border border-white/10 rounded-lg p-6">
              <h3 className="text-nasun-white font-semibold text-lg mb-4">
                Banned Accounts ({total})
              </h3>

              {bannedAccounts.length === 0 ? (
                <p className="text-nasun-white/40 text-center py-8">No banned accounts</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-nasun-white/60">
                        <th className="text-left py-3 px-2">Username</th>
                        <th className="text-left py-3 px-2">Reason</th>
                        <th className="text-left py-3 px-2">Banned At</th>
                        <th className="text-left py-3 px-2">Banned By</th>
                        <th className="text-right py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bannedAccounts.map((account) => (
                        <tr key={account.accountId} className="border-b border-white/5">
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              {account.profileImageUrl && (
                                <img
                                  src={account.profileImageUrl}
                                  alt={account.username}
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                              <span className="text-nasun-white">
                                @{account.originalUsername || account.username}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-nasun-white/60 max-w-[200px] truncate">
                            {account.banReason || '-'}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40">
                            {account.bannedAt
                              ? new Date(account.bannedAt).toLocaleString('en-US')
                              : '-'}
                          </td>
                          <td className="py-3 px-2 text-nasun-white/40">
                            {account.bannedBy || '-'}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <Button
                              variant="outlineC1"
                              size="sm"
                              onClick={() => setUnbanTarget(account)}
                              disabled={isUnbanning}
                            >
                              Unban
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Ban Confirmation Modal */}
          {banTarget && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-nasun-c6 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-nasun-white font-semibold text-lg mb-4">Confirm Ban</h3>
                <p className="text-nasun-white/70 mb-4">
                  Ban <strong className="text-nasun-white">@{banTarget.originalUsername || banTarget.username}</strong> from the leaderboard?
                </p>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Reason for ban (optional)"
                  className="w-full bg-nasun-black/50 border border-white/20 rounded-md px-4 py-2.5 text-nasun-white placeholder:text-nasun-white/30 focus:outline-none focus:border-nasun-c4 mb-4 h-20 resize-none"
                />
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outlineC1"
                    onClick={() => { setBanTarget(null); setBanReason(''); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="c4"
                    onClick={handleBanConfirm}
                    disabled={isBanning}
                    className="bg-red-500 hover:bg-red-600"
                  >
                    {isBanning ? 'Banning...' : 'Confirm Ban'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Unban Confirmation Modal */}
          {unbanTarget && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-nasun-c6 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-nasun-white font-semibold text-lg mb-4">Confirm Unban</h3>
                <p className="text-nasun-white/70 mb-4">
                  Unban <strong className="text-nasun-white">@{unbanTarget.originalUsername || unbanTarget.username}</strong>?
                  They will reappear on the leaderboard.
                </p>
                <div className="flex justify-end gap-3">
                  <Button variant="outlineC1" onClick={() => setUnbanTarget(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="c4"
                    onClick={handleUnbanConfirm}
                    disabled={isUnbanning}
                  >
                    {isUnbanning ? 'Unbanning...' : 'Confirm Unban'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SectionLayout>
      </div>
    </AdminLayout>
  );
}
```

### D.2 `useBlacklist.ts` (전체 코드)

**파일**: `frontend/src/features/admin/hooks/useBlacklist.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BannedAccountsResponse } from '../types/index';

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

async function fetchBannedAccounts(adminPassword: string): Promise<BannedAccountsResponse> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch: ${response.status}`);
  }
  return response.json();
}

async function banAccountApi(
  adminPassword: string,
  params: { accountId: string; reason?: string }
): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Ban failed: ${response.status}`);
  }
}

async function unbanAccountApi(
  adminPassword: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/blacklist/${encodeURIComponent(accountId)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Unban failed: ${response.status}`);
  }
}

export function useBlacklist(adminPassword: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['admin', 'blacklist'],
    queryFn: () => fetchBannedAccounts(adminPassword),
    enabled: !!adminPassword,
    staleTime: 60_000,
  });

  const banMutation = useMutation({
    mutationFn: (params: { accountId: string; reason?: string }) =>
      banAccountApi(adminPassword, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  const unbanMutation = useMutation({
    mutationFn: (accountId: string) => unbanAccountApi(adminPassword, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  return {
    bannedAccounts: query.data?.accounts || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    error: query.error,
    ban: banMutation.mutateAsync,
    unban: unbanMutation.mutateAsync,
    isBanning: banMutation.isPending,
    isUnbanning: unbanMutation.isPending,
    refetch: query.refetch,
  };
}
```

### D.3 `adminConfig.ts` 수정 (정확한 Before/After)

**FIND**:
```typescript
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: '📊' },
  { path: '/admin/whitelist', label: 'Whitelist Export', icon: '📋' },
  { path: '/admin/governance', label: 'Governance', icon: '🗳️' },
  { path: '/admin/leaderboard-v3', label: 'Leaderboard V3', icon: '🏆' },
];
```

**REPLACE**:
```typescript
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { path: '/admin', label: 'Dashboard', icon: '📊' },
  { path: '/admin/whitelist', label: 'Whitelist Export', icon: '📋' },
  { path: '/admin/governance', label: 'Governance', icon: '🗳️' },
  { path: '/admin/leaderboard-v3', label: 'Leaderboard V3', icon: '🏆' },
  { path: '/admin/users', label: 'Blacklist', icon: '🚫' },
];
```

**FIND**:
```typescript
  {
    title: 'Blacklist Management',
    description: 'Manage user bans and restrictions. (Feature currently in planning phase)',
    icon: '🚫',
    link: '/admin/users',
    linkText: 'Manage Users',
    disabled: true,
  },
```

**REPLACE**:
```typescript
  {
    title: 'Blacklist Management',
    description: 'Manage user bans and restrictions for the leaderboard.',
    icon: '🚫',
    link: '/admin/users',
    linkText: 'Manage Users',
  },
```

### D.4 `types/index.ts` 추가 타입

**파일**: `frontend/src/features/admin/types/index.ts`

파일 끝에 추가:
```typescript

// Blacklist types
export interface BannedAccount {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: string;
  displayName?: string;
  profileImageUrl?: string;
  postCount: number;
  totalPostScore: number;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
}

export interface BannedAccountsResponse {
  success: boolean;
  accounts: BannedAccount[];
  total: number;
}
```

### D.5 `AppRoutes.tsx` 라우트 추가

기존 admin route 정의 패턴을 따릅니다. `/admin/leaderboard-v3` 라우트 뒤에 추가:

```typescript
const BlacklistManagement = lazy(() =>
  import("../features/admin/pages/BlacklistManagement").then(m => ({ default: m.BlacklistManagement }))
);

// Route 정의 (기존 admin routes 블록 내):
<Route
  path="/admin/users"
  element={
    <AdminRoute>
      <Suspense fallback={<SectionLoading />}>
        <BlacklistManagement />
      </Suspense>
    </AdminRoute>
  }
/>
```

---

## Appendix E: 환경변수 확인사항

| 환경변수 | 사용처 | 비고 |
| :--- | :--- | :--- |
| `VITE_LEADERBOARD_V3_API_URL` | Frontend (API calls) | 이미 `.env`에 정의됨 |
| `VITE_LEADERBOARD_V3_ADMIN_PASSWORD` | Frontend (Bearer token) | 이미 `.env`에 정의됨 (`useAdminSeasons.ts`에서 사용 중) |
| `LEADERBOARD_V3_ADMIN_PASSWORD` | Backend Lambda | CDK `lambdaEnvironment` (line 186)에 이미 포함 |

> 새로운 환경변수 추가 불필요. 기존 변수를 그대로 사용합니다.
