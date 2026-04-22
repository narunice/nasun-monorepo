---
title: Pado/공용 RPC 클라이언트 retry/backoff 구현 (502 대응)
created: 2026-04-22
source_session: nasun-devnet health-check
status: ready
---

# 작업 지시서: RPC 클라이언트 retry/backoff 구현

## 배경

Nasun Devnet RPC (`https://rpc.devnet.nasun.io`)는 Node 3 Fullnode의 단일 인스턴스를 nginx로 프록시합니다.
Fullnode는 메모리 누수 완화를 위해 **8시간 cron으로 자동 재시작**되며 (0/8/16 UTC), 재시작 시 RPC 포트 바인딩까지 **약 10~15초 다운타임**이 발생합니다.

이 구간에 nginx가 `127.0.0.1:9000`에 연결 실패 → 클라이언트에 **502 Bad Gateway**를 반환합니다.

### 측정된 502 발생 (2026-04-22 UTC)

| 시간 | 502 건수 | 원인 |
|------|---------|------|
| 08시 | 12,615 | 08:01 UTC 자동 재시작 (~15초 창) |
| 14시 | 5,589 | 14:53 UTC 수동 재시작 (~15초 창) |

nginx 에러 로그 샘플:
```
2026/04/22 14:53:44 [error] connect() failed (111: Connection refused)
  while connecting to upstream, upstream: "http://127.0.0.1:9000/"
  referrer: "https://pado.finance/markets/spot"
```

**주 피해 앱**: `pado.finance` (marketplaces, games) — 고빈도 polling으로 재시작 창에 수천~만 건 집중.

## 서버측 조치 (참고용, 별도 진행 중)

`nasun-devnet` 리포에서 Node 3 nginx에 `proxy_next_upstream` + `proxy_next_upstream_tries 5` + `proxy_next_upstream_timeout 15s` 추가 예정.
그러나 nginx upstream은 단일 `127.0.0.1:9000`뿐이라 **서버측만으로는 완전 커버 불가** — 클라이언트 retry가 핵심.

## 작업 목표 (D)

공용 SUI RPC 클라이언트에 **retry + exponential backoff**를 추가하여, Fullnode 재시작 구간(~15초)에 발생하는 5xx/네트워크 에러를 사용자에게 노출하지 않고 자동 복구.

## 조사 시작점

### 1단계: 공용 클라이언트 위치 파악

아래 후보 경로들을 먼저 확인하세요:

```
nasun-monorepo/packages/           # 공용 패키지 (우선순위 최상 — 여러 앱 일괄 적용)
nasun-monorepo/apps/pado/          # Pado 앱 (DEX, games)
nasun-monorepo/apps/nasun-website/ # Nasun 공식 사이트
nasun-monorepo/apps/network-explorer/
```

검색 키워드:
- `SuiClient` / `@mysten/sui` import
- `rpc.devnet.nasun.io`
- `getFullnodeUrl` / `new SuiClient`
- 공용 `createSuiClient` / `sui-client.ts` 류 헬퍼

**이상적 시나리오**: `packages/` 하위의 공용 클라이언트 1곳만 수정 → 모든 앱에 적용.
**차선**: Pado만 우선 수정 (502의 90%를 차지하는 앱).

### 2단계: @mysten/sui SDK 버전 확인

- SDK가 `SuiHTTPTransport` 커스텀을 지원하는지 확인 (`package.json`의 버전)
- 최신 SDK는 `fetch` 함수를 주입할 수 있어 retry wrapper 구현 용이

## 구현 스펙

### retry 전략

| 항목 | 값 | 근거 |
|------|-----|------|
| 재시도 대상 | HTTP 502, 503, 504, 네트워크 에러 (`TypeError: fetch failed`, timeout) | 재시작 외 정상 4xx/비즈니스 에러는 재시도 불가 |
| 재시도 대상 제외 | HTTP 4xx (400, 401, 403, 404 등), JSON-RPC 비즈니스 에러 | 재시도해도 무의미 |
| 최대 재시도 횟수 | **5회** | 재시작 창 ~15초 커버에 충분 |
| 초기 delay | **200ms** | 빠른 복구 대응 |
| backoff factor | 2배 (exponential) | 200 → 400 → 800 → 1600 → 3200 ms |
| jitter | ±20% | 동시 요청 thundering herd 방지 |
| 총 대기 상한 | 약 6.2초 + jitter | 15초 창을 중간에 커버, UI 타임아웃 전 완료 |
| write 요청 (signAndExecute 등) | **재시도 금지** | idempotency 보장 없음 |

### 메서드별 재시도 가능 여부

| 메서드 패턴 | 재시도 | 사유 |
|------------|-------|------|
| `sui_get*`, `suix_*`, `sui_getChainIdentifier` 등 읽기 | ✅ | Idempotent |
| `sui_executeTransactionBlock` | ❌ | Double-spend 위험 |
| `sui_dryRunTransactionBlock` | ✅ | Idempotent |
| `sui_devInspectTransactionBlock` | ✅ | Idempotent |

### 구현 예시 (TypeScript, SuiHTTPTransport 커스텀 fetch)

```ts
// packages/sui-client/src/retry-fetch.ts (예시)
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRIABLE_METHODS_REGEX = /^sui[x]?_(get|multi|query|dryRun|devInspect|tryMulti)/;

async function retryFetch(url: string, init: RequestInit): Promise<Response> {
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const rpcMethod: string | undefined = body?.method;
  const canRetry = rpcMethod ? RETRIABLE_METHODS_REGEX.test(rpcMethod) : false;

  const maxAttempts = canRetry ? 5 : 1;
  let delay = 200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      if (!RETRY_STATUSES.has(res.status) || attempt === maxAttempts) return res;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
    }
    const jitter = delay * (0.8 + Math.random() * 0.4);
    await new Promise(r => setTimeout(r, jitter));
    delay *= 2;
  }
  throw new Error('unreachable');
}

// 사용처
import { SuiClient, SuiHTTPTransport } from '@mysten/sui/client';

export const suiClient = new SuiClient({
  transport: new SuiHTTPTransport({
    url: 'https://rpc.devnet.nasun.io',
    fetch: retryFetch,
  }),
});
```

**주의**: `@mysten/sui` 버전에 따라 `SuiHTTPTransport` API가 다를 수 있음. 실제 타입 시그니처 확인 후 맞춤.

## 관측/검증

### 재현 시나리오

1. 로컬 Pado dev 서버 실행
2. 브라우저 devtools Network 탭 열기
3. Node 3 Fullnode를 수동 재시작 (별도 세션에서):
   ```
   ssh -i ~/.ssh/.awskey/nasun-devnet-key.pem ubuntu@54.180.61.196 "sudo systemctl restart nasun-fullnode"
   ```
4. Pado 페이지 확인 — 기존: 502 에러로 UI 깨짐. 수정 후: 1~2초 지연 후 자동 복구.

### 로깅

retry 발생 시 `console.warn` (개발환경) 또는 Sentry breadcrumb로 기록 → 재시작 창 밖에서도 502가 빈번하면 인프라 이슈 경보.

```ts
if (attempt > 1) {
  console.warn(`[RPC retry] ${rpcMethod} attempt=${attempt} after ${delay}ms`);
}
```

## 참고 링크 (nasun-devnet 쪽)

- 원인 분석 전체: nasun-devnet 세션의 health-check 조사 결과 (대화 히스토리)
- Node 3 nginx config: `/etc/nginx/sites-enabled/nasun-devnet` (54.180.61.196)
- Fullnode restart cron: `0 */8 * * * /home/ubuntu/fullnode-restart.sh` (Node 3)
- nasun-devnet 리포의 CLAUDE.md "nginx 설정" 섹션

## 완료 기준

- [ ] 공용 클라이언트 1곳(또는 주요 앱들) 수정 완료
- [ ] 로컬에서 Fullnode 재시작 재현 시 UI 무중단 동작 확인
- [ ] retry 로그가 개발환경에서 출력됨
- [ ] write 트랜잭션은 재시도되지 않음을 코드 레벨에서 확인 (regex 또는 method 체크)
- [ ] 배포 후 nginx access.log의 502 건수가 감소 (측정: 다음 08:00 UTC 재시작 전후)

## 비범위 (하지 않을 것)

- 서버측 nginx 변경 (별도 nasun-devnet 세션에서 진행 중)
- 새 Fullnode 인스턴스 추가 (비용 이슈)
- SUI SDK 자체 포크/수정
