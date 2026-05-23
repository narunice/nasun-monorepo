# HANDOFF — CloudFront Custom Error Response fix (nasun.io distribution)

**Created**: 2026-05-23
**Driver incident**: 2026-05-22 PR2 wake-mode chat staging debugging
**Status**: PR2 frontend는 별도 fix로 우회 완료. 이 작업은 시스템적 정리.
**Urgency**: Medium — 운영 중단 위험은 없지만, 향후 chat-server/API 디버깅이 또 어려워질 함정이 남아 있음.

---

## 한 줄 요약

nasun.io CloudFront distribution(`E362CCGDH7WA7C`)의 Custom Error Response가 `403/404 → /index.html (200)`로 swap하고 있어, chat-server (및 다른 `/api/*` upstream)의 정상 4xx JSON 응답이 SPA HTML로 변환되어 사용자에게 도달. 그 결과 (1) 브라우저는 응답을 CORS error로만 보고 진짜 reason 못 읽음, (2) 디버깅 시 root cause 추적이 매우 어려움. 두 4xx 매핑을 제거 (또는 ResponsePagePath 비움)해서 origin pass-through로 바꾸자.

---

## 배경 — 어떻게 노출됐는지

2026-05-22 PR2 staging에서 santa agent 와의 wake-mode chat이 동작 안 함. 사용자 console에 표시된 에러:

```
POST https://nasun.io/api/nasun-ai/chat/session net::ERR_FAILED 200 (OK)
Access to fetch at 'https://nasun.io/api/nasun-ai/chat/session' from origin 'https://staging.nasun.io'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

진단 과정에서 발견된 사실:
1. nginx access.log: `POST /api/nasun-ai/chat/session HTTP/1.1" 403 48` — chat-server가 정상 403 + 48-byte JSON 응답 emit
2. 그러나 사용자 응답: `content-type: text/html`, `etag: W/"6a103d7e-1448"`, `last-modified: ...`, `via: ... CloudFront` — SPA index.html
3. CloudFront `CustomErrorResponses`:
   ```
   ErrorCode: 403, ResponsePagePath: /index.html, ResponseCode: 200
   ErrorCode: 404, ResponsePagePath: /index.html, ResponseCode: 200
   ```

즉 chat-server의 403 응답을 CloudFront edge가 가로채서 `200 + /index.html`로 swap. CORS 헤더 다 사라짐. 브라우저는 응답을 받았지만 CORS reject + JSON 파싱 실패. 사용자도 개발자도 진짜 reason(`agent_capability_mismatch`)을 볼 수 없음.

진단에 5+ 시간이 소비됐고, 가설이 여러 번 뒤바뀜 (WAF SQL injection false positive → CloudFront cache hit → ServiceWorker 가로채기 → nginx upstream issue → chat-server crash). 진짜 원인은 CloudFront error mapping이라는 단순한 distribution 설정.

---

## 왜 이 매핑이 처음에 들어갔는지 (history)

[memory feedback_cf_error_caching_asymmetry.md](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_cf_error_caching_asymmetry.md) 참고:

2026-05-04 사고 후속 결론:
- **SPA-only distribution**: `ResponsePagePath=/index.html, ResponseCode=200` (nasun.io 패턴)
- **API/SPA 혼재 distribution**: `ResponsePagePath=빈 문자열` (origin pass-through) — pado, explorer

그 시점에 nasun.io는 SPA-only로 분류됨. 그러나 그 이후 PR1 chat-server가 `/api/nasun-ai/chat/*` 같은 새 API endpoint들을 nasun.io 위에 mount하면서 **distribution이 SPA-only가 아니라 API/SPA 혼재로 전환**. 이전 분류가 깨졌지만 CloudFront config은 갱신 안 됨.

---

## 현재 상태

### CloudFront distribution: `E362CCGDH7WA7C`
- Aliases: `www.nasun.io`, `nasun.io`, `uju.nasun.io`
- DefaultBehavior: HEAD/GET only, `nasun-ec2-origin`
- Behaviors: `/api/nasun-ai/*`, `/api/baram/*`, `/ws/chat*`, `/chat/*`, `/locales/*`, `/assets/*`, `/videos/*`, `/images/*` — 모두 `nasun-ec2-origin` (EC2 nginx)

### CustomErrorResponses (7 items)

| ErrorCode | ResponsePagePath | ResponseCode | TTL |
|---|---|---|---|
| 403 | `/index.html` | 200 | 0 |
| 404 | `/index.html` | 200 | 0 |
| 500 | (empty) | (empty) | 0 |
| 501 | (empty) | (empty) | 0 |
| 502 | (empty) | (empty) | 0 |
| 503 | (empty) | (empty) | 0 |
| 504 | (empty) | (empty) | 0 |

5xx는 이미 origin pass-through. 403/404만 SPA HTML로 swap 중.

### EC2 nginx (prod, `/etc/nginx/conf.d/nasun.conf`)

nasun.io server block:
```
root /var/www/nasun/dist;
index index.html;
...
location / {
  ...
  try_files $uri /index.html;   # ← SPA fallback이 nginx layer에 이미 있음
}
```

즉 **SPA의 deep-link 새로고침 (예: `/my-account?tab=agents`) 은 nginx try_files가 처리**해서 200 + /index.html 반환. CloudFront의 403/404 mapping은 redundant.

---

## Fix plan

### Step 0 — Pre-flight (실행 전 확인)

1. **현재 distribution config 백업**:
   ```bash
   aws cloudfront get-distribution-config --id E362CCGDH7WA7C --profile nasun-prod \
     > /tmp/nasun-cf-config-backup-$(date +%Y%m%d-%H%M%S).json
   ```

2. **nginx SPA fallback 동작 확인** (사용자가 deep-link 새로고침 시 200 + HTML 정상 반환되는지):
   ```bash
   curl -sI -H "x-cloudfront-secret: nsn-cf-origin-2026" \
     "http://43.200.67.52/my-account?tab=agents&view=detail&agent=foo" \
     | head -10
   # 기대: HTTP/1.1 200 OK + Content-Type: text/html
   ```

3. **현재 fix 영향 받는 path 패턴 점검**:
   - SPA 라우트 (예: `/my-account/*`, `/community/*`, `/wave1/*`) → nginx try_files로 정상 처리, 영향 없음
   - API endpoints (`/api/*`, `/chat/*`, `/ws/chat*`) → upstream 응답을 그대로 받게 됨, 정상 동작
   - 잠재 위험: SPA가 새로고침 시 root `/` 가 아닌 path에서 진짜 404가 발생하면 사용자가 nginx default 404 페이지 본다 (드물고 큰 문제 아님)

### Step 1 — CloudFront Custom Error Response 수정

**옵션 A (권장)**: 403/404 매핑을 제거 (item 자체를 삭제, 5xx만 남김)
- API 응답이 origin pass-through됨
- SPA fallback은 nginx에서 처리

**옵션 B**: ResponsePagePath만 빈 문자열로, ResponseCode도 빈 문자열로 (pado/explorer 패턴과 같이)
- 동일 효과, 추후 ErrorCachingMinTTL 명시적 제어 가능

권장은 A. 실행:

```bash
# 1. 현재 config get
aws cloudfront get-distribution-config --id E362CCGDH7WA7C --profile nasun-prod \
  > /tmp/nasun-cf-current.json

# 2. ETag 추출 (update에 필요)
ETAG=$(jq -r '.ETag' /tmp/nasun-cf-current.json)

# 3. DistributionConfig 추출 + CustomErrorResponses에서 403/404 item 제거
jq '.DistributionConfig
    | .CustomErrorResponses.Items |= map(select(.ErrorCode != 403 and .ErrorCode != 404))
    | .CustomErrorResponses.Quantity = (.CustomErrorResponses.Items | length)' \
  /tmp/nasun-cf-current.json \
  > /tmp/nasun-cf-updated.json

# 4. update 적용
aws cloudfront update-distribution \
  --id E362CCGDH7WA7C \
  --profile nasun-prod \
  --if-match "$ETAG" \
  --distribution-config "file:///tmp/nasun-cf-updated.json"
```

distribution update 후 CloudFront edge propagation 5-15분 소요.

### Step 2 — Cache invalidation (선택)

기존 cache된 SPA HTML 응답 비우기:

```bash
aws cloudfront create-invalidation \
  --distribution-id E362CCGDH7WA7C \
  --profile nasun-prod \
  --paths "/api/*"
```

---

## Verification (fix 후 확인)

### 1. CloudFront config 확인

```bash
aws cloudfront get-distribution-config --id E362CCGDH7WA7C --profile nasun-prod \
  | jq '.DistributionConfig.CustomErrorResponses.Items[] | .ErrorCode'
# 기대: 500, 501, 502, 503, 504 만 (403, 404 없음)
```

### 2. End-to-end 검증 — chat-server 4xx 응답이 사용자에게 도달

```bash
# 빈 body로 POST → chat-server가 missing_fields 400 반환
curl -i -X POST https://nasun.io/api/nasun-ai/chat/session \
  -H "Origin: https://staging.nasun.io" \
  -H "Content-Type: application/json" \
  -d '{}'
```

기대:
```
HTTP/2 400
content-type: application/json
access-control-allow-origin: https://staging.nasun.io

{"error":"missing_fields"}
```

이미 403/404가 origin pass-through되니 chat-server 모든 reason code가 클라이언트에 정확히 도달. 향후 같은 증상의 디버깅 한 단계로 끝남.

### 3. SPA deep-link 정상 동작 확인

브라우저로 https://nasun.io/my-account?tab=agents 직접 새로고침 → 200 + SPA HTML.
nginx try_files 가 처리하므로 영향 없어야 함.

### 4. PR2 wake chat 재검증

staging 사이트에서 santa wake 메시지 전송 → 정상 동작 (PR2 frontend fix가 이미 적용됐으면).

---

## Rollback

5분 안에 원상 복귀 가능:

```bash
# 백업 config에서 ETag 재추출
BACKUP=/tmp/nasun-cf-config-backup-<timestamp>.json
ETAG=$(aws cloudfront get-distribution-config --id E362CCGDH7WA7C --profile nasun-prod | jq -r '.ETag')

# 백업 config 복원
jq '.DistributionConfig' $BACKUP > /tmp/nasun-cf-restore.json
aws cloudfront update-distribution \
  --id E362CCGDH7WA7C \
  --profile nasun-prod \
  --if-match "$ETAG" \
  --distribution-config "file:///tmp/nasun-cf-restore.json"
```

---

## 영향 범위 정리

| 영역 | 변경 후 동작 | 위험 |
|---|---|---|
| chat-server 4xx 응답 (`/api/nasun-ai/*`, `/api/baram/*`) | JSON + CORS 헤더 그대로 도달 | 없음 (이 fix의 목적) |
| chat REST (`/chat/api/*`) | JSON + CORS 헤더 그대로 도달 | 없음 |
| WebSocket (`/ws/chat*`) | upgrade 응답 그대로 | 없음 (4xx 아닌 101) |
| SPA 라우트 deep-link 새로고침 | nginx try_files → 200 /index.html | 없음 |
| 진짜로 존재하지 않는 path (nginx도 404) | 사용자가 nginx default 404 본다 | 매우 드문 케이스, 큰 문제 아님 |
| Asset 404 (`/assets/xxx-stale.js`) | 진짜 404 — SPA가 stale chunk 로드 시 사용자에게 404 노출 | 빈도 낮음. version.json polling으로 새 deploy 감지 시 자동 reload 흐름 있음 |

마지막 항목 (`stale asset 404`)이 약한 우려. 현재 mapping은 stale asset 요청을 SPA HTML로 swap해서 사용자가 깨진 페이지 본다 (HTML이 JS 자리에 들어가니 동일하게 깨짐). 즉 현 상황도 별로 안전하지 않음. fix 후엔 명시적 404가 떨어져 dev tools/sentry에서 더 잘 캐치됨.

---

## 후속 작업 제안

이 fix와 별도로 검토할 것:

1. **memory 갱신**: `feedback_cf_error_caching_asymmetry.md` 의 "SPA-only distribution: nasun.io 패턴" 부분이 더 이상 유효하지 않음 (nasun.io도 API 혼재로 전환). memory 업데이트 또는 deprecated 표시.

2. **pado.finance / explorer.nasun.io distribution과 일관성 점검**: 두 distribution이 이미 origin pass-through 패턴인지 다시 확인. 만약 어떤 distribution이 여전히 mapping을 갖고 있다면 함께 정리.

3. **PR2 wake chat의 실제 chat-server reason 검증**: fix 후 staging에서 wake 시도 시 chat-server가 정확히 어떤 reason 반환하는지 확인. agent_capability_mismatch 외 다른 reason도 명시적으로 보이게 됨 (alpha gate, capability owner 등).

---

## 관련 파일 / 메모

- [feedback_cf_error_caching_asymmetry.md](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_cf_error_caching_asymmetry.md) — 5/4 사고 후 결론 (이 fix로 일부 갱신 필요)
- [project_2026_05_04_outage_postmortem.md](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_04_outage_postmortem.md) — 5/4 사고 전체 post-mortem
- [feedback_no_raw_scp_nginx_conf.md](../../../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_raw_scp_nginx_conf.md) — nginx config 운영 invariants
- prod nginx config: `/etc/nginx/conf.d/nasun.conf` (EC2 43.200.67.52)
- chat-wake handler: [chat-wake.ts](../chat-server/src/chat-wake.ts) — 4xx 응답 발급 위치들 (`writeJson(res, 403, corsHeaders, {error:...})` 등)
- chatWakeReasons map: [chatWakeReasons.ts](../frontend/src/sections/uju/ai/services/chatWakeReasons.ts) — 클라이언트가 인식하는 reason whitelist
- PR2 frontend fix (2026-05-22, agent_id vs agent_address): [useChatWake.ts](../frontend/src/sections/uju/ai/hooks/useChatWake.ts), [useChatTokenLease.ts](../frontend/src/sections/uju/ai/hooks/useChatTokenLease.ts), [AgentChat.tsx](../frontend/src/sections/uju/ai/pages/agent/AgentChat.tsx)

---

## 새 세션에서 시작할 때

1. 이 핸드오프 파일을 그대로 읽고 시작
2. Step 0 pre-flight 먼저 (백업 + nginx try_files 동작 확인)
3. Step 1 update 실행 + edge propagation 대기
4. Verification 4단계 모두 확인
5. (선택) 후속 작업 — memory 갱신, 다른 distribution 일관성 점검

전체 작업 30분-1시간 예상 (대부분 edge propagation 대기).
