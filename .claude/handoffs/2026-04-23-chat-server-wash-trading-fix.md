# Handoff: chat-server wash-trading detection 복구

**생성**: 2026-04-23 22:05 KST
**브랜치**: main
**이전 핸드오프**: [2026-04-23-cloudfront-ws-chat-fix.md](2026-04-23-cloudfront-ws-chat-fix.md) (진단 오류 확인 후 종결, 그 과정에서 이 작업을 별건으로 분리)
**예상 소요**: 40분 (코드 20분 + staging 검증 10분 + prod 배포 5분)
**우선순위**: 낮음 (사용자 영향 미확인, 급하지 않음)

---

## 현재 상태 요약

Prod `nasun-chat-server`의 내부 Aggregator가 wash-trading detection을 위해 사용하는 wallet→identityId bulk 캐시가 **완전히 비어있다** (`[identity-resolver] Cache refreshed: 0 wallets`). 결과적으로 Pado 거래 리더보드에서 같은 사용자가 본인 지갑끼리 거래해 거래량/점수를 부풀리는 행위가 현재 차단되지 않는다. 환경변수(`WALLET_MAPPINGS_URL`, `WALLET_MAPPINGS_API_KEY`)는 prod EC2에 없고, 추가만 해봤을 때 chat-server의 `identity-resolver.ts`가 엔드포인트 응답(gzip/S3 presigned offload)을 파싱하지 못해 `Cache refresh failed: Unexpected token '�...' is not valid JSON` 에러가 발생하는 것을 2026-04-23 세션에서 확인하고 즉시 롤백함.

## 완료된 작업 (이 이슈의 전조 조사)

- [x] 진짜 원인 규명: env 누락만이 아니라 코드가 응답 포맷을 처리 못 함
- [x] 참조 구현 식별: [apps/network-explorer/api-server/src/scanner/fetch-with-offload.ts](../../apps/network-explorer/api-server/src/scanner/fetch-with-offload.ts) (69줄, gzip magic byte 감지 + gunzipSync + S3 presigned follow 구현 완비)
- [x] Prod 상태 보존: `.env` 롤백 완료, chat-server는 pre-task 동일 상태(silent empty cache)로 복구됨
- [x] Chat mission 파이프라인은 별개 이슈로 정상 작동 확인됨 (오늘 1813 참여자 → 1827 activity_points 행, ~100% 매칭). **이 작업은 미션 반영과 무관**

## 미완료 작업

- [ ] `apps/nasun-website/chat-server/src/identity-resolver.ts`의 `loadIdentityMap()`을 fetchWithOffload 패턴으로 재작성
- [ ] 로컬 빌드 + typecheck
- [ ] Staging에 rsync 배포 후 `[identity-resolver] Cache refreshed: N wallets` (N>0) 확인 → **반드시 staging 먼저** (memory: `feedback_staging_before_prod.md`)
- [ ] Prod EC2(43.200.67.52) `.env`에 `WALLET_MAPPINGS_URL`, `WALLET_MAPPINGS_API_KEY` 2줄 추가 (값은 node-3 `~/explorer-api/.env`와 동일)
- [ ] Prod rsync + `pm2 restart nasun-chat-server` + 캐시 refresh 로그에서 N>0 확인
- [ ] 소스 변경 커밋 (단일 커밋, Conventional Commits)

## 중요 컨텍스트

### 결정사항
- **gzip/offload 처리는 필수**: 엔드포인트가 6MB 초과 응답을 S3 presigned URL로 오프로드하고, S3 객체는 `ContentType: application/gzip` + `Content-Encoding` 헤더 없음으로 저장됨. Node fetch 자동 해제 안 되므로 magic byte(`0x1f 0x8b`) 감지 후 `gunzipSync` 필수.
- **Staging 우선**: chat-server는 `pm2 restart`가 모든 활성 WS 연결(~90+)을 끊기 때문에 prod 직배포 금지. Staging(15.165.19.180)에서 먼저 검증 (memory: `project_staging_chat_server_off.md`에서 staging chat-server는 일부러 꺼둔 상태지만, 이 작업을 위해서는 한시적으로 켜서 검증 후 다시 꺼야 함 — 사용자 명시 승인 필요).
- **Env 전달 방식**: chat-server는 `src/env.js` 로더가 `.env`를 읽어 `process.env[key]`가 없을 때만 set. Pm2 saved env에 해당 키가 없으므로 `.env` 추가 후 재시작이면 충분. `--update-env` 플래그 불필요.

### 주의사항
- **쓰기 경로 차이**: `.env`는 prod 위치(`/home/ec2-user/nasun-chat-server/.env`)에 직접 추가해야 하며, 레포의 `.env.example` 등은 영향 없음. README의 배포 명령은 `--exclude='.env'`로 덮어쓰지 않도록 되어 있음.
- **ecosystem.config.cjs에 env 블록 없음**: 하드코딩하지 말 것. `.env` 파일 경로만 사용.
- **Prod SSH 키 복습**: `~/.ssh/.awskey/nasun-prod-key` (prod EC2 43.200.67.52), `~/.ssh/.awskey/nasun-devnet-key.pem` (node-3 54.180.61.196, `ubuntu@`).
- **Pm2 restart 시 WS 연결 끊김**: ~30-60초 동안 재연결 시도 발생. 트래픽 낮은 시간대 권장 (KST 03-05시).
- **과거 wash-trading 결과는 되돌리지 못함**: memory `feedback_points_monotonic_increase.md` 원칙상 이미 찍힌 점수는 감소 불가. 이 수정은 앞으로의 farming만 차단.
- **사용자 리포트 없음**: 이 기능이 꺼져 있다는 증상은 bug-triage 리포트 중에 없었다. 배포 긴급성은 낮음.

### 파일 위치
| 파일 | 역할 |
|---|---|
| [apps/nasun-website/chat-server/src/identity-resolver.ts](../../apps/nasun-website/chat-server/src/identity-resolver.ts) | 수정 대상. L57-91 `loadIdentityMap()` 재작성 |
| [apps/network-explorer/api-server/src/scanner/fetch-with-offload.ts](../../apps/network-explorer/api-server/src/scanner/fetch-with-offload.ts) | 레퍼런스 구현 (그대로 차용 가능, `zlib.gunzipSync` 사용) |
| [apps/nasun-website/chat-server/README.md](../../apps/nasun-website/chat-server/README.md) | 배포 명령 (staging → prod rsync + pm2 restart 예제) |
| Prod `.env` | `/home/ec2-user/nasun-chat-server/.env` (8 lines, WALLET_MAPPINGS_* 부재) |
| Node-3 `.env` | `ubuntu@54.180.61.196:~/explorer-api/.env` — `WALLET_MAPPINGS_URL`, `WALLET_MAPPINGS_API_KEY` 값 원천 |

### 레퍼런스 구현 요지 (fetch-with-offload.ts)
```typescript
const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
if (!res.ok) return null;
const body = await res.json();

// S3 offload path
if (body && typeof body === 'object' && 'url' in body && typeof body.url === 'string') {
  const s3Res = await fetch(body.url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!s3Res.ok) return null;
  const buffer = Buffer.from(await s3Res.arrayBuffer());
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const text = isGzip ? gunzipSync(buffer).toString('utf-8') : buffer.toString('utf-8');
  return JSON.parse(text) as T;
}

return body as T;
```

identity-resolver.ts의 `loadIdentityMap()`을 위 형태로 대체하고, 반환 타입 `{ wallets: Record<string, string>; genesisPass?: string[] }`에 맞춰 `wallets` 필드 추출 → `Map<string, string>` 빌드 로직만 유지.

## 최근 변경 파일

작업 대상 파일은 **현재 워킹 트리에 수정 없음** (clean). 이 작업 범위에서 수정할 파일은 위 "파일 위치" 표의 identity-resolver.ts 1개만.

## 즉시 다음 단계

1. **`apps/nasun-website/chat-server/src/identity-resolver.ts` 수정**
   - L11에 `import { gunzipSync } from 'node:zlib';` 추가
   - L57-91 `loadIdentityMap()` 본문을 fetch-with-offload.ts L32-68 패턴으로 재작성
   - 반환은 기존처럼 `Map<string, string>` (walletAddress lowercase → identityId)
2. **로컬 빌드 + typecheck**: `cd apps/nasun-website/chat-server && pnpm build`
3. **Staging 활성화 승인 요청 사용자에게**: memory 원칙상 staging chat-server는 꺼둬야 하므로, 한시 활성화 승인 필요 (검증 후 다시 stop)
4. **Staging 배포 + 검증**: rsync → staging `.env`에 WALLET_MAPPINGS_* 추가 → `pm2 start` (또는 restart) → `grep "Cache refreshed" ~/.pm2/logs/*.log`에서 `N > 0` 확인 → staging chat-server 다시 stop
5. **Prod 배포 승인 요청**: staging 결과 보고 후 사용자 명시 승인
6. **Prod 배포**: prod `.env`에 2줄 추가 (값 pipe로 node-3 → prod 전송, transcript 노출 회피) → rsync dist → `pm2 restart nasun-chat-server` → 캐시 refresh 로그 확인
7. **커밋**: `git add apps/nasun-website/chat-server/src/identity-resolver.ts && git commit -m "fix(chat-server): handle S3 gzip offload in identity-resolver"` (push는 사용자 명시 지시 시에만)

## 검증 기준

| 확인 항목 | 성공 기준 |
|---|---|
| Staging 로그 | `[identity-resolver] Cache refreshed: N wallets` where N = 오늘 기준 ≥ 수천 |
| Prod 로그 | 동일, 에러 0건 (`Cache refresh failed` 미출현) |
| WS 연결 수 복구 | restart 후 5분 이내 `Authenticated: 0x... (N users, M connections)` 로그가 restart 전 규모로 복원 |
| Aggregator 무결성 | 다음 `[Aggregator] Completed in Nms` 로그 정상 |

## 롤백 절차

1. Prod `.env.bak-*` 최신 백업 복원: `cp ~/nasun-chat-server/.env.bak-<timestamp> ~/nasun-chat-server/.env`
2. Dist 롤백: 이전 버전 `identity-resolver.js` 복원 또는 `git checkout HEAD~1 -- apps/nasun-website/chat-server/src/identity-resolver.ts && pnpm build` 후 rsync
3. `pm2 restart nasun-chat-server`
4. "Cache refreshed: 0 wallets" 로그로 복귀 확인 (pre-task 상태)
