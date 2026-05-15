# Handoff: AER v2 follow-ups (post chat path go-live)

> 작성일: 2026-05-16
> 선행 세션: [HANDOFF_aer_v2_lambda_overhaul_2026-05-15.md](HANDOFF_aer_v2_lambda_overhaul_2026-05-15.md) — Lambda + frontend을 v2 capability-gated AER 경로로 전환 완료. staging에서 chat→AER 생성→Activity 표시까지 E2E 통과 검증됨.
> 후속: 본 문서로 새 세션 작업 시작 → `_kickoff prompt` 섹션을 그대로 복붙해서 사용.

---

## 0. 한 줄 요약

전 세션에서 staging chat path가 살아났고 AER도 정상 생성되지만, 다음 세 가지가 남아있다: (1) stale executor `0x286d7c...`가 첫 시도 ~50% fail을 유발, (2) Activity 탭이 agent별로 정확히 분리되지 못해 user의 모든 AER이 한 agent 페이지에 섞여 표시됨, (3) api-server 인덱서가 v2 schema 미적용이라 RPC fallback에만 의존. (1)이 사용자 체감 가장 크고, (2)는 UX 문제, (3)은 성능/지표 문제.

---

## 1. 전 세션 결과 (배포된 변경 요약)

### Lambda (dev account `135808943968` / `baram-executor` 활성)
- [sui.ts](../cdk/lambda-src/executor/src/services/sui.ts) `submitProofWithAER` → v2 `aer::create_report_with_receipt_capability` 41-arg PTB.
  - `intent_id` = SHA256(request_id_be8).slice(0,16) (16 bytes, contract enforces INTENT_ID_LENGTH=16, 핸드오프 §3 32바이트 표기는 오류였음)
  - `payload_codec = "bcs"` (contract assert L668; "json"/"none"은 abort)
  - `payload_hash = SHA256(action_type_bytes ‖ payload_bytes)`
  - `action_summary` UTF-8 byte-safe truncate (240B cap, contract 280B)
  - `prompt_template_hash = ZERO_HASH_32`
- [types.ts](../cdk/lambda-src/executor/src/types.ts) `AerCapabilityFields` 인터페이스로 `/execute`, `/record` 둘 다 capability + envelope 필드 받음
- [index.ts](../cdk/lambda-src/executor/src/index.ts) `validateCapabilityFields()` + `modelVersionTag()` helper, /execute 기본 `cognition.chat.v1`/event_class=1/trigger=4, /record 기본 `trade.swap.v1`/event_class=2/trigger=1

### Frontend (staging.nasun.io 라이브)
- [useCreateRequest.ts](../../nasun-website/frontend/src/sections/uju/ai/hooks/request/useCreateRequest.ts) `CreateRequestCapability` 필수, /execute body에 capability + envelope hints
- [useRequestWithRetry.ts](../../nasun-website/frontend/src/sections/uju/ai/hooks/request/useRequestWithRetry.ts) `options.capability` 받음, null이면 차단
- [ChatTab.tsx](../../nasun-website/frontend/src/sections/uju/ai/pages/agent/ChatTab.tsx) `useCapability`로 live `version` 조회 후 forward, legacy(capabilityId==null)는 입력 disable
- [OverviewTab.tsx](../../nasun-website/frontend/src/sections/uju/ai/pages/agent/OverviewTab.tsx) ChatTab에 `capabilityId={agent.capabilityId}` 전달
- [useCreateAgent.ts:35](../../nasun-website/frontend/src/sections/uju/ai/hooks/useCreateAgent.ts#L35) `DEFAULT_ALLOWED_ACTIONS`에 `cognition.chat.v1` 추가
- [useAerRecords.ts](../../nasun-website/frontend/src/sections/uju/ai/hooks/useAerRecords.ts) `parseAERRecord`가 v2 sub-struct(`requester`/`executor`/`payment`/`inference`/`why`/`trust`/`time`) 자동 해제하도록 `pick()` 헬퍼 도입 (v1 flat 폴백 유지)
- [ActivityTab.tsx](../../nasun-website/frontend/src/sections/uju/ai/pages/agent/ActivityTab.tsx) 필터 스코프를 `walletAddress` 기준으로 변경 (legacy `agentAddress` 폴백 유지) + non-string 방어

### 검증된 E2E 흐름
- tx digest 예: `BoT3ZeoZqYvB3tiyHgY2zLy3FktqiewUnM9PZt6JEdjd`
- AER object: `0x67a2f5cd0c83b1f4b54ec6728eaf0cc1850b5db126203a795e39926bb127b2bf`
- AER fields: `action_type=cognition.chat.v1`, `event_class=1`, `action_outcome=1`, `why.capability_version=1`, `requester.authorizer=0x683aaf...`(user wallet), `executor.executor=0xa952...`

---

## 2. 남은 후속 (우선순위 순)

### F1. Stale executor `0x286d7c779f...` 비활성화 (★ 최우선, admin tx)

**증상**: frontend weighted-random이 stale dev entry를 ~50% 확률로 픽 → Lambda가 키 미보유로 `Executor mismatch: expected 0x286d... got 0xa952...` 반환 → 첫 시도 fail → useRequestWithRetry가 재시도. 사용자는 "가끔 처음에 실패한 뒤 다시 됨"으로 체감.

**Stale entry**: `0x286d7c779f8286df2b303be2dc0a56a6417cbde71b3b5b2780994f6b9dd49b78` (endpoint `http://localhost:3000`, dev 잔재)

**조치**: AdminCap 소유자(`0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90`, executor-nitro TEE owner와 동일 wallet)로 `executor::deactivate_executor` 호출.

```bash
# 의사 PTB. 실제 호출은 frontend의 useExecutors mutation 추가 또는 CLI script.
nasun client call \
  --package <EXECUTOR_PACKAGE_ID_FROM_devnet-ids.json> \
  --module executor \
  --function deactivate_executor \
  --args <ADMIN_CAP_ID_0x5e3dca93...> <EXECUTOR_REGISTRY_0xb5212e4c...> 0x286d7c779f8286df2b303be2dc0a56a6417cbde71b3b5b2780994f6b9dd49b78 "stale dev entry pointing at localhost"
```

옵션:
- A. CLI 한 번 sign (가장 빠름, 사용자가 직접 또는 다음 세션에서)
- B. `apps/baram/scripts/executor-admin.ts` 스크립트로 자동화 (재사용성 ↑)
- C. frontend admin 페이지에 버튼 추가 (재사용성 가장 ↑, 시간 ↑)

**권장**: 옵션 B. AdminCap 보유자가 dev key를 가지고 있어야 함.

**검증**:
```
nasun client object 0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656
# executors table에서 0x286d... 의 is_active=false 확인
```
+ frontend에서 `useExecutors` 호출 후 active cloud executor가 1개(`0xa952...`)만 남는지.

### F2. Activity 탭 agent별 분리 (★ UX, AER schema 보강 필요)

**증상**: 현재 user가 agent A의 Activity 탭을 봐도 agent B로 한 chat까지 다 노출. v2 chat AER은 `requester=user_wallet`, `executor=Lambda`만 기록하고 agent 식별자가 없기 때문 (capability id는 PTB 인자였지만 AER에 snapshot되지 않음).

**해결 옵션** (트레이드오프):

| 옵션 | 컨트랙트 변경 | 작업량 | 평가 |
|---|---|---|---|
| **A. `replay_extras`에 `capability_id` 키 삽입** | ❌ 불필요 | Lambda 1줄 + parser 1줄 | ★ 권장 — 컨트랙트 안 건드림, 즉시 가능 |
| B. `WhyContext`에 `capability_id` 필드 추가 | ✅ upgrade 필요 | 컨트랙트 + Lambda + parser + 인덱서 | A로 충분하면 불필요 |
| C. event 부수 emit (ExecutionReportCreated에 cap_id 추가) | ✅ upgrade 필요 | indexer에서 collect | indexer 의존 |

**옵션 A 상세** (권장):

Lambda [sui.ts](../cdk/lambda-src/executor/src/services/sui.ts) `submitProofWithAER`에서:
```ts
// before tx.moveCall args 40-41
tx.pure.vector('string', ['capability_id']),                    // 40
tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([
  Array.from(Buffer.from(aer.capabilityId.replace(/^0x/, ''), 'hex'))
])),                                                            // 41
```

Contract validation: `replay_extras_keys`와 `replay_extras_vals` 길이 일치, 키 UTF-8 byte-asc 순서, 각 ≤16개 + 키 ≤64B / 값 ≤4096B ([aer.move:680-697](../contracts-aer/sources/aer.move#L680-L697)) → 1개 entry라 trivially OK.

Parser [useAerRecords.ts:202](../../nasun-website/frontend/src/sections/uju/ai/hooks/useAerRecords.ts#L202) 영역에 `strategy_id` 추출하는 부분 옆에 `capability_id` 추출 추가 후 `AERRecord`에 `capabilityId?: string` 필드 추가.

ActivityTab 필터:
```ts
const scoped = data.filter(r =>
  r.capabilityId?.toLowerCase() === agent.capabilityId?.toLowerCase()
);
```

**위험**: replay_extras VecMap은 strict ascending UTF-8 byte order 키 요구. 단일 key만 넣을 거면 정렬 신경 안 써도 OK. trader-cycle path(`/record`)도 이미 `strategy_id`를 쓰고 있으니 그 옆에 `capability_id`도 같이 추가하면 두 key 정렬해서 넣어야 함 (`capability_id` < `strategy_id` byte-asc).

### F3. api-server 인덱서 v2 schema 적용 (성능, 후순위)

**증상**: 현재 `VITE_AER_INDEXER_API_URL` 미설정 → RPC fallback. `getOwnedObjects` per-user RPC는 user당 0.5~1s 추가. agent 페이지마다 호출되니 다중 agent 사용자에서 누적 지연.

**위치**: [apps/baram/api-server/](../api-server/) — Hono.js + PostgreSQL, 30s 간격 RPC sync worker가 `aer_records` 테이블 갱신.

**작업**:
1. RPC sync worker가 v2 nested struct를 평면화해 PG 저장하도록 schema 마이그레이션
2. `/api/v1/aer` 응답에 envelope/chain/wake/replay 필드 노출
3. (F2-A 완료 후) `capability_id` 컬럼 + `?capabilityId=` 쿼리 파라미터 추가
4. Frontend `.env.staging`에 `VITE_AER_INDEXER_API_URL` 추가 + staging 배포

**우선순위**: F1, F2 후. 인덱서 없이도 동작은 함.

### F4. prod 플립 (별도, 사용자 결정)

- 현재 prod는 `VITE_NASUN_AI_ENABLED=false`라 외부 비노출.
- prod `.env.production`에 `VITE_BACKEND_URL` + `VITE_BARAM_API_KEY` 추가 (staging만 있음).
- F1~F3 완료 + staging soak 후 사용자 명시적 승인 받고 flip.

### F5. trader-cycle (nasun-ai-runtime) 영향 확인

전 세션 분석: nasun-ai-runtime은 별도 host `/execute-capability` 사용, 본 Lambda `/record` 미경유. 따라서 Lambda 변경에 영향 없음. 하지만:
- nasun-ai-runtime의 host server가 같은 컨트랙트 v2 호출을 정확히 하고 있는지 1회 확인 필요. [presets/trader-envelope.ts](../../nasun-ai-runtime/src/presets/trader-envelope.ts) + host-client.ts 코드 검증.
- 만약 prod nasun-ai-runtime이 v1 schema로 호출 중이면 trader heartbeat AER도 abort 중일 가능성. CloudWatch가 아니라 host pm2 log 확인 필요.

---

## 3. 컨트랙트 식별자 (변경 없음, 참조용)

| 항목 | 값 |
|---|---|
| baram package | `0x734c42b8e8fbca26f1961766176a509a49c8dd44368d80cdc035439809ff1aee` |
| baram_aer package | `0x646b4d020f4c0b7bd88e02b8f4c117ebd78ca617e5c510303bbe468df66ec9b5` |
| baram_aer typeOrigin | `0xdb118fd931572cf42af8613dce1cc18471419d1ba937b63c832d4361aad5b8e5` |
| AER registry | `0xd011a3d53d65db1315b4f13ba3897b580640054e4e28055d337a7e1029a175e2` |
| Baram registry | `0x1645502e401e5f9bafe31dfc399bb818eb85f05415b1649b3c2a5d011a24fc02` |
| Capability registry | `0x893a15ed9d53375fc8690a6e5cfacc11a77e78988785cd265f81d49cb3699905` |
| Executor registry | `0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656` |
| Executor admin cap | `0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522` (owner: `0xe1c4c90b...`) |
| Stale executor (F1 deactivate 대상) | `0x286d7c779f8286df2b303be2dc0a56a6417cbde71b3b5b2780994f6b9dd49b78` |
| Active cloud executor | `0xa952b023c471e51457eb71b5c9e7424f0799103fc2336d79c0ffc2164c5ca854` |
| Lambda function | `baram-executor` (account 135808943968, ap-northeast-2) |
| API Gateway | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod` |

---

## 4. 제약 / 규칙 (memory + CLAUDE.md 발췌)

- "Baram" / "Sui" / "bot"(AI agent 의미) 외부 노출 금지
- em dash 금지 / emoji 금지
- prod 프론트엔드 raw rsync 금지 → `pnpm deploy:nasun-website:staging|prod`
- staging 검증 후 prod, 사용자 명시적 승인 필수
- AWS 신규 리소스 생성 금지 (Lambda env/CDK update는 OK)
- 본 작업은 dev 계정(135808943968) Lambda + dev 계정 API Gateway만 건드림. prod 계정(466841130170) 무관 (F4 제외)

---

## 5. 검증 체크리스트 (작업 완료 기준)

### F1 완료 기준
- [ ] `nasun client object <EXECUTOR_REGISTRY>` 결과에서 `0x286d...`의 `is_active=false`
- [ ] staging frontend에서 chat 5회 연속 시도, executor mismatch 0회

### F2 완료 기준
- [ ] 새 chat AER의 `replay.replay_extras`에 `capability_id` key 존재 (RPC 조회 또는 explorer 확인)
- [ ] staging Activity 탭에서 agent A 페이지 → agent A로 한 chat만 노출, agent B 것 안 보임
- [ ] Lambda + parser 양쪽 tsc 통과

### F3 완료 기준
- [ ] `/api/v1/aer?walletAddress=<user>&capabilityId=<cap>` 정확한 결과 반환
- [ ] frontend가 indexer 우선 사용하고 RPC fallback 진입 안 함 (network tab 관찰)
- [ ] indexer sync 누락 0건 (PG row count == RPC owned count)

---

## 6. 후속의 후속 (이 세션 다음의 다음)

- F2-A 채택 시: 향후 컨트랙트 v3에서 정식 `capability_id` 필드 도입 검토 (`replay_extras` 우회의 영속화 vs 정규화)
- AER 모달에 capability_version + action_type 명시적 표시 (현재 actionSummary만 노출)
- chat session id를 `triggered_by_ref`로 흘려서 멀티턴 추적 (현재 null)

---

# _kickoff prompt (새 세션 복붙용)

```
context: nasun-monorepo. Nasun AI chat path는 staging에서 살아있다.
v2 capability-gated AER 경로 통과 + Activity 표시까지 E2E 검증됨
(2026-05-15 세션). 다만 후속 3건이 남아있다:

1. stale executor 0x286d7c779f8286df2b303be2dc0a56a6417cbde71b3b5b27
   80994f6b9dd49b78 가 50% 첫 시도 fail을 유발 → admin tx로 비활성화
2. Activity 탭이 agent별 분리 안 됨 (AER에 agent/capability 식별자
   없음) → replay_extras에 capability_id 삽입 + parser/filter 갱신
3. api-server 인덱서 v2 schema 미적용 → 현재 RPC fallback only

handoff 문서를 먼저 읽어:
apps/baram/doc/HANDOFF_aer_v2_followups_2026-05-16.md

목표 (이 세션 완료 기준):
- F1: AdminCap 소유자(0xe1c4c90b...)로 executor::deactivate_executor
  호출. 옵션 B 권장 = apps/baram/scripts/executor-admin.ts
  스크립트 작성. dev key 위치는 사용자에게 확인.
- F2-A: Lambda submitProofWithAER에서 replay_extras에
  capability_id 단일 key 삽입. parseAERRecord에 capability_id
  추출 추가. ActivityTab 필터를 agent.capabilityId 기준으로 교체.
  legacy 폴백(walletAddress/agentAddress) 유지.
- (선택) F5: nasun-ai-runtime host-client + trader-envelope이
  v2 컨트랙트와 호환되는지 코드 정독으로 확인. abort 가능성 있으면
  별도 항목으로 분리해서 보고만.

부가:
- handoff §3 식별자 표 참조
- F3 (인덱서)은 이번 세션 범위 외 — F1+F2만 처리

제약:
- "Baram"/"Sui"/"bot" 외부 노출 금지, em dash·emoji 금지
- dev 계정 135808943968만 건드림. prod 무관
- AWS 신규 리소스 생성 금지

작업 시작 전에 handoff §2의 F1/F2 우선순위와 옵션 A 채택 방향이
맞는지 한 번 더 확인하고 진행해.
```
