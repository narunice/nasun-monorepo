# Wallet Registration Sync — Handoff

작성일: 2026-05-02
상태: 미착수 (별도 PR로 진행 예정)

## 배경

`pts today` (TODAY BREAKDOWN) 표시는 백엔드 points-scanner → `activity_points` DB → API의 파이프라인을 거친다. 핵심 지연 두 가지:

- **Wallet→identity 캐시**: `WALLET_CACHE_REFRESH_MS = 10분` ([points-scanner.ts:702](../../../network-explorer/api-server/src/scanner/points-scanner.ts))
- **Scanner cursor forward-only**: 캐시 miss 시 `if (!identityId) continue;` 후 cursor 진행 → 그 트랜잭션 영구 스킵 ([points-scanner.ts:639-642](../../../network-explorer/api-server/src/scanner/points-scanner.ts))

결과: **신규 등록한 추가 지갑에서 등록 직후 활동하면, 그 활동은 다음 UTC 자정 후 reconcile이 돌 때까지 pts today에 안 보임.** 점수는 결국 어제 날짜로 백필되지만 "오늘" 표시는 못 함.

실제 보고 사례 (2026-05-02):
- 사용자 hybrida@gmail.com (identityId `ap-northeast-2:6cb1e654-bafd-c120-66ca-e2fe5f23074e`)
- Primary `0x683aaf5d...` (2026-04-02 등록), Additional `0x05eef6d3...` (2026-05-02 10:07 UTC 등록)
- Active Engagement 5/6 ✓ vs pts today 2pt (faucet/wallet-transfer/scratchcard 누락)

상세 진단: 이번 세션 대화 또는 [feedback_daily_missions_immediate_reflection](../../../../home/naru/.claude/projects/-home-naru-my_apps-nasun-monorepo/memory/feedback_daily_missions_immediate_reflection.md) 참조.

## 목표

신규 등록 지갑의 활동도 ~10초 내에 `activity_points`에 반영되어 pts today UI가 즉시 갱신되도록 한다.

## 설계

**Option A (자동) + B (수동) 동시 채택.** 둘 다 같은 backend 함수 호출.

### Backend (apps/network-explorer/api-server)

신규 함수 시그니처:
```ts
// 호출 1: wallet 캐시 강제 새로고침
async function maybeRefreshWalletCache(force?: boolean): Promise<void>

// 호출 2: 한 사용자의 today 활동만 RPC reconcile
async function reconcileFromRpcForIdentity(
  targetDate: string,
  identityId: string,
  walletAddresses: string[],
): Promise<number>  // gaps filled
```

신규 endpoint:

```
POST /internal/wallet-registered
Header: X-Internal-Auth: <INTERNAL_INVALIDATE_TOKEN>
Body: { identityId, walletAddress }

동작:
  1. await maybeRefreshWalletCache(force=true)
  2. fire-and-forget: reconcileFromRpcForIdentity(today, identityId, [walletAddress])
  3. invalidateCache(`eco-score-${identityId}`)
  4. return { ok: true } 즉시
```

```
POST /v1/ecosystem/sync
Auth: Cognito identityId (요청자의 identityId만 sync 가능)
Rate limit: 1회 / 30s / identityId

동작:
  1. requesterIdentityId 추출 (existing IAM_AUTH 패턴 재사용)
  2. UserWallets 테이블에서 등록된 모든 wallet 조회
  3. await maybeRefreshWalletCache(force=true)
  4. await reconcileFromRpcForIdentity(today, identityId, allWallets)
  5. invalidateCache(`eco-score-${identityId}`)
  6. return { gapsFilled, syncedAt } (응답 후 frontend가 점수 refetch)
```

### Frontend

1. **registerWallet 성공 후 자동 트리거 불필요** — backend webhook으로 처리됨.
2. **TODAY BREAKDOWN 회전 아이콘 동작 확장**: 현재 client refetch만 → `POST /v1/ecosystem/sync` 호출 후 invalidateQueries 순서로 변경.
3. UJU와 MyAccount 양쪽 회전 아이콘 모두 동일 처리 ([UjuEcosystemPointsCard.tsx:1211 영역](../../frontend/src/sections/uju/activity/cards/UjuEcosystemPointsCard.tsx), [EcosystemPointsCard.tsx](../../frontend/src/sections/myAccount/EcosystemPointsCard.tsx)).

### Lambda (apps/nasun-website/cdk/lambda-src/wallet-api)

[registerWallet.ts](../../cdk/lambda-src/wallet-api/src/handlers/registerWallet.ts) 성공 직후:
```ts
// fire-and-forget — webhook 실패해도 등록 자체는 성공.
// 10분 타이머 fallback이 결국 캐시를 따라잡음.
fetch(`${EXPLORER_API_URL}/internal/wallet-registered`, {
  method: 'POST',
  headers: { 'X-Internal-Auth': process.env.INTERNAL_INVALIDATE_TOKEN, ... },
  body: JSON.stringify({ identityId, walletAddress }),
}).catch(err => console.warn('[registerWallet] sync webhook failed:', err));
```

환경 변수 추가:
- Lambda: `EXPLORER_API_URL`, `INTERNAL_INVALIDATE_TOKEN` (Secrets Manager)
- API server: 기존 `INTERNAL_INVALIDATE_TOKEN` 재사용

## 비범위

- `WALLET_CACHE_REFRESH_MS` 단축 (10분 → N분): UserWallets 테이블이 ~14만 행이라 폴링 비용 비례 증가. 채택 안 함. webhook이 정공법.
- 다른 사용자의 sync trigger: Option B는 본인만 가능. admin 우회 endpoint는 필요 시 별도.
- Snapshot/matview 강제 refresh: 본 작업 범위 아님. pts today는 matview 의존 안 함 (`activity_points` 직접 조회).

## 작업 단계 + 공수

| Phase | 작업 | 시간 |
|---|---|---|
| 1 | `maybeRefreshWalletCache(force?)` 시그니처 + 내부 호출부 정리 | 15분 |
| 2 | `reconcileFromRpcForIdentity` 추출 (기존 `reconcileFromRpc`의 좁힌 버전) | 1시간 |
| 3 | `/internal/wallet-registered` endpoint + auth | 30분 |
| 4 | `/v1/ecosystem/sync` endpoint + Cognito IAM auth + rate limit | 1시간 |
| 5 | `registerWallet.ts` Lambda webhook 호출 + env 추가 + CDK 변경 | 1시간 |
| 6 | Frontend 회전 아이콘 → sync API 트리거 (UJU + MyAccount) | 30분 |
| 7 | Staging e2e: 새 지갑 등록 → 즉시 활동 → 90초 내 pts today 반영 확인 | 1시간 |
| **합계** | | **~5시간** |

## 검증 시나리오 (Staging)

1. 테스트 계정에 추가 지갑 등록.
2. 등록 직후 (10분 미만) 그 지갑으로 faucet claim + spot trade + lottery ticket 구매.
3. **기대**: 활동 후 ~60초 내 pts today 반영. 새로고침 버튼 클릭 시 즉시 반영.
4. **회귀 확인**: 기존 단일 지갑 사용자도 정상 동작. webhook 실패 시뮬레이션 (잘못된 토큰)에서도 등록 자체는 성공.

## 참고 파일

| 항목 | 위치 |
|---|---|
| Scanner 캐시 관리 | [apps/network-explorer/api-server/src/scanner/points-scanner.ts](../../../network-explorer/api-server/src/scanner/points-scanner.ts) `maybeRefreshWalletCache` |
| RPC reconcile | [apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts](../../../network-explorer/api-server/src/scanner/rpc-reconcile.ts) `reconcileFromRpc` |
| Cache invalidation | [apps/network-explorer/api-server/src/cache.ts](../../../network-explorer/api-server/src/cache.ts) `invalidate` |
| Existing internal endpoint | [apps/network-explorer/api-server/src/routes/internal-invalidate.ts](../../../network-explorer/api-server/src/routes/internal-invalidate.ts) |
| Wallet 등록 Lambda | [apps/nasun-website/cdk/lambda-src/wallet-api/src/handlers/registerWallet.ts](../../cdk/lambda-src/wallet-api/src/handlers/registerWallet.ts) |
| Frontend 새로고침 아이콘 위치 | UjuEcosystemPointsCard.tsx, EcosystemPointsCard.tsx 내 회전 SVG |

## 메모리 연관

- [feedback_daily_missions_immediate_reflection](../../../../home/naru/.claude/projects/-home-naru-my_apps-nasun-monorepo/memory/feedback_daily_missions_immediate_reflection.md) — "matview 5-15분 REFRESH 지연에 의존 금지" 원칙. 본 작업이 그 원칙을 강화.
