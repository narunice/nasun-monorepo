# Handoff: baram-executor Lambda — AER v2 envelope overhaul

> 작성일: 2026-05-15
> 작성 컨텍스트: Nasun AI 퍼블릭 런칭 S5+ 검증 중 staging 채팅 추론 100% 실패. 진단 결과 Lambda 코드가 contracts-aer v2 schema와 불일치.
> 후속: 본 문서로 새 세션 작업 시작 → `_kickoff prompt` 섹션을 그대로 복붙해서 사용.

---

## 0. 한 줄 요약

`baram-executor` Lambda의 `aer::create_report_with_receipt` 호출이 **20개 인자**로 굳어 있는데 v2 컨트랙트는 **39개**를 요구합니다 (`baram_registry` 객체 + envelope 17필드). 추가로 ungated path는 `event_class == EVENT_CLASS_SETTLEMENT` 만 허용하므로 user chat (cognition class)은 capability-gated path를 써야 합니다. Lambda 전면 개수 + 컨트랙트 호출 라우팅 결정 + 재배포 필요.

---

## 1. 현 상태 (2026-05-15 staging 검증 시점)

### 증상
- staging.nasun.io 우측 Chat 입력란에 질문 → "Request failed: Internal server error"
- CloudWatch logs `/aws/lambda/baram-executor`:
  ```
  [Execute] Request verified, executor: 0xa952b023c471...
  [AI] Completion finished in 1106ms
  [Sui] Submitting proof + AER for request 191
  ERROR [Execute] Proof submission failed:
    Incorrect number of arguments for
    0x646b4d020f4c0b7bd88e02b8f4c117ebd78ca617e5c510303bbe468df66ec9b5::aer::create_report_with_receipt
  ```
- 즉 AI inference 자체는 1.1초만에 성공, 그 다음 proof+AER 온체인 제출에서 Move runtime이 인자 수 불일치로 abort.

### 부가 이슈 (별개지만 같은 PR로 정리 권장)
- **ExecutorRegistry stale entry**: 활성 executor 3개 중 `0x286d7c779f8286df2b303be2dc0a56a6417cbde71b3b5b2780994f6b9dd49b78`는 endpoint=`http://localhost:3000` (dev 잔재). frontend weighted random이 이걸 고르면 "Executor mismatch: expected 0x286d... got 0xa952..." (Lambda는 `0xa952...` 키만 보유). AdminCap (`0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522`) 소유자는 `0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90` (TEE executor 주소와 동일).
- **`cancel_request` MoveAbort code 2**: executor 실패 후 auto-cancel 경로의 dry-run abort. AER v2 + 새 receipt 흐름과 연관 가능성. Lambda fix 후 동시 검증.

---

## 2. 핵심 파일 위치 (참고 좌표)

| 항목 | 경로 |
|---|---|
| Lambda 소스 (수정 대상) | [apps/baram/cdk/lambda-src/executor/src/services/sui.ts](../cdk/lambda-src/executor/src/services/sui.ts#L260-L352) |
| Lambda PTB build 함수 | `buildProofWithReceiptAndAERTransaction` (라인 ~262-334) |
| Move 시그니처 (ungated) | [contracts-aer/sources/aer.move:320-371](../contracts-aer/sources/aer.move#L320-L371) `create_report_with_receipt` |
| Move 시그니처 (gated) | [contracts-aer/sources/aer.move:429-482](../contracts-aer/sources/aer.move#L429-L482) `create_report_with_receipt_capability` |
| ungated assert | [aer.move:377](../contracts-aer/sources/aer.move#L377) `E_UNGATED_REQUIRES_SETTLEMENT_CLASS` |
| gated assert | [aer.move:487-490](../contracts-aer/sources/aer.move#L487-L490) `E_GATED_REQUIRES_NON_SETTLEMENT_CLASS` |
| event_class 상수 | aer.move L70-72: COGNITION=1, EXECUTION=2, SETTLEMENT=3 |
| Lambda CDK stack | [apps/baram/cdk/lib/baram-stack.ts](../cdk/lib/baram-stack.ts) |
| Frontend chat 진입 | [apps/nasun-website/frontend/src/sections/uju/ai/hooks/request/useCreateRequest.ts](../../nasun-website/frontend/src/sections/uju/ai/hooks/request/useCreateRequest.ts) |
| Frontend chat surface | [apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/ChatTab.tsx](../../nasun-website/frontend/src/sections/uju/ai/pages/agent/ChatTab.tsx) |

---

## 3. 인자 mismatch 상세 (Lambda → Move)

현재 Lambda가 보내는 args (20개, 순서대로):
1. AER_REGISTRY_ID (object)
2. receipt (전 PTB cmd 결과, hot-potato)
3. initiator (address)
4. delegation_path (vector<address>)
5. executor_principal (Option<address>)
6. fee_detail (Option<String>)
7. budget_id (Option<address>)
8. budget_remaining (Option<u64>)
9. model_metadata (Option<String>)
10. input_hash (vector<u8>)
11. purpose (Option<String>)
12. constraints (Option<String>)
13. executor_tier (u8)
14. executor_reputation (u64)
15. executor_stake_amount (u64)
16. tee_verified (bool)
17. tee_attestation_hash (Option<vector<u8>>)
18. requested_at (u64) ← `request.createdAt`
19. triggered_by (Option<address>) — Move는 `Option<ID>`
20. triggered_action (Option<address>) — Move는 `Option<ID>`

Move ungated가 요구하는 args (총 39개): 위 1-20에 **`baram_registry`를 2번째 위치**에 추가하고, 끝에 envelope 그룹 18개 추가.

추가해야 할 envelope 필드 (gated/ungated 공통):
| 위치 | 이름 | 타입 | 의미 / 권장 default |
|---|---|---|---|
| 22 | intent_id | vector<u8> | sha256(request_id). 32 bytes. |
| 23 | parent_intent_id | Option<vector<u8>> | None for top-level. |
| 24 | execution_id | u32 | request_id를 그대로 캐스팅 가능. |
| 25 | event_class | u8 | **chat = 1 (COGNITION)** |
| 26 | action_type | String | `cognition.chat.v1` (스키마 컨벤션 새로 정의 필요) |
| 27 | action_schema_version | u16 | 1 |
| 28 | payload_codec | String | `json` 또는 `none` |
| 29 | payload_hash | vector<u8> | sha256(payload_bytes). 빈 payload면 sha256("") |
| 30 | payload_bytes | vector<u8> | 빈 vec 또는 reasoning summary JSON |
| 31 | action_summary | String | 첫 80자 truncated reply |
| 32 | action_outcome | u8 | 1=success / 2=hold / 3=failure |
| 33 | triggered_by_type | u8 | 1=heartbeat, 4=session(messsage). user chat = **4** |
| 34 | triggered_by_ref | Option<String> | telegram session id or null |
| 35 | model_version | String | `llama-3.3-70b-versatile@2025-01-08` 같이 명시적 |
| 36 | prompt_template_hash | vector<u8> | sha256(prompt template). 없으면 32 byte 0. |
| 37 | market_snapshot_hash | Option<vector<u8>> | trader가 아니므로 None |
| 38 | replay_extras_keys | vector<String> | [] |
| 39 | replay_extras_vals | vector<vector<u8>> | [] |

ctx는 마지막. Lambda는 PTB framework가 자동 채워줌.

---

## 4. 라우팅 결정 (★ 작업 시작 전 확정 필요)

User chat은 `event_class=COGNITION` (1)이라 ungated path 진입 불가 (assert 377). 두 가지 갈래:

### Option A: Lambda를 gated path로 라우팅
- 사용자 chat 요청 시 frontend가 함께 보내는 **Capability id** + **expected_capability_version** 을 Lambda에 전달
- Lambda가 `create_report_with_receipt_capability` 호출 (인자 41개)
- Capability.owner == initiator 가 강제됨 ([capability::assert_can_execute](../contracts-aer/sources/capability.move) — owner check 포함)
- **제약**: user chat은 agent가 없는데 capability는 agent profile에 묶여 있음. 즉 사용자가 본인 명의의 capability를 가지고 있어야 함 → **사용자 모두에게 "personal capability" 발급 필요** (별도 시나리오, Plan B에서 명시 안 됨)
- 또는: agent가 있을 때만 chat 허용 (Overview 탭의 chat은 agent context에 묶여 있으므로 그 agent의 capability를 쓸 수 있음). 현재 frontend는 이미 `agentId` 컨텍스트에서 chat을 띄움 ([ChatTab.tsx](../../nasun-website/frontend/src/sections/uju/ai/pages/agent/ChatTab.tsx)) — 즉 `agent.capabilityId`를 chat 요청 페이로드에 포함시키면 됨.

### Option B: ungated assert 완화
- aer.move L377의 assert를 `event_class IN (SETTLEMENT, COGNITION_USER)` 같이 새 enum value를 도입해 풀어줌
- 새 EVENT_CLASS_USER_COGNITION = 4 추가 + 가드 변경
- **제약**: 컨트랙트 업그레이드 필요 (UpgradeCap 사용). 보안 영향 검토 (capability 우회 가능성). Plan B §1.7의 의도는 user chat을 명시적으로 capability-gated로 두려는 것이므로 이 방향은 spec와 어긋남.

### Option C (★ 권장): Agent context 강제 + gated path
- frontend ChatTab은 이미 agent 안에서 동작 → `agent.capabilityId`가 항상 존재 (legacy agent 제외)
- Lambda `/execute` 요청 페이로드에 `capabilityId` + `expectedCapabilityVersion` 추가
- Lambda가 gated path로 라우팅. `event_class=COGNITION`, `triggered_by_type=4(session/message)`.
- legacy agent (capabilityId==null) 사용자는 chat 불가 → UI에서 "Legacy agent — re-register to chat" 안내 (이미 SessionsTab에 유사 카피 있음)
- 컨트랙트 변경 없음, frontend + Lambda만 수정
- **이 방향으로 작업 진행 권장**

---

## 5. 작업 분해 (예상: 1~1.5 세션)

### S1. Frontend payload 확장 (~30분)
1. `useCreateRequest.ts`에서 `/execute` POST body에 다음 추가:
   - `capabilityId: agent.capabilityId` (chat이 agent 컨텍스트에 있어야 호출됨)
   - `expectedCapabilityVersion: capability.version` (chain에서 읽어와 동봉)
   - `agentId: agent.id`
   - envelope hints: `actionType: 'cognition.chat.v1'`, `eventClass: 1`, `triggeredByType: 4`, `triggeredByRef: sessionId|null`
2. Legacy agent(capabilityId==null)면 chat 입력 disable + 카피 노출
3. typecheck + build --mode staging

### S2. Lambda PTB rewrite (~60-90분)
1. `sui.ts` `buildProofWithReceiptAndAERTransaction` 함수에:
   - Capability shared object를 PTB args에 추가 (mutable=false, initialSharedVersion 가져와야 함 — `getObject` 한 번 더)
   - `target`을 `aer::create_report_with_receipt_capability`로 교체
   - 인자 41개 채우기 (위 §3 표 참조)
   - envelope 필드 계산 로직 추가:
     - `intent_id = sha256(request_id_be8)` (helper bcs encoded)
     - `payload_hash = sha256(payload_bytes)`
     - `action_summary = result.slice(0, 80)` (UTF-8 safe truncate)
     - `model_version = `${model_name}@${MODEL_RELEASE_DATE}`` (상수 테이블 추가)
2. `index.ts`의 request body validation: 새 필드 (`capabilityId` 등) 받기 + 누락 시 400
3. `executeWithRetry` 등 wrapper도 신호 수정
4. Lambda 빌드 (`pnpm --filter @baram/executor-lambda build`) + dist 검증

### S3. CDK deploy (~5분)
- `cd apps/baram/cdk && AWS_PROFILE=nasun-dev pnpm deploy`
- Lambda env에 추가 IDs 필요 시 (capabilityRegistry id 등) [baram-stack.ts](../cdk/lib/baram-stack.ts) 확장

### S4. Stale executor 정리 (~10분, 별도 admin tx)
- AdminCap 소유자(`0xe1c4c90b...`)로 sign
- Move call: `executor::deactivate_executor(admin_cap, registry, 0x286d7c779f..., "stale dev entry pointing at localhost")`
- `aws cloudfront create-invalidation` 불필요 (frontend executor 리스트는 RPC 직접 조회, 캐시 없음)
- 검증: `useExecutors` hook이 active=2 (0xa952 cloud + 0xe1c4 tee) 반환

### S5. E2E 검증 (~30분)
- staging.nasun.io → zkLogin 로그인 → v2 agent 선택 → Overview Chat에 질문 입력
- 성공 시 Activity 탭에 `cognition.chat.v1` action_type + `◇` glyph + `●` success outcome 행 추가
- AER 객체 onchain 검증: `sui_getObject` for the new AIExecutionReport
- 실패 시 CloudWatch 로그로 분기별 디버그

---

## 6. 위험 / 보안 검토 포인트

| 위험 | 완화 |
|---|---|
| capability::assert_can_execute가 owner check를 강제 → user(initiator) ≠ capability.owner 면 abort | useCreateRequest는 wallet user가 initiator. 따라서 capability.owner도 같은 wallet이어야 함. agent_profile::create_agent_with_capability는 sender를 owner로 설정하므로 정상 흐름에서는 일치 |
| capability가 pause/revoke 상태면 chat 불가 | UX로 노출 (Authority/Danger zone 카드가 이미 보여줌). retry 안 함 |
| capability_version stale read → assert mismatch | frontend가 chat 직전에 RPC로 fresh version 조회 후 동봉. Lambda는 받은 값 그대로 PTB에 넣음 |
| Lambda IAM이 budget owner key + groq secret 둘 다 필요했는데 추가 권한 필요한가? | capability는 shared object이므로 read-only ref 충분. signer 추가 필요 없음 |
| 부분 배포 시 frontend가 새 payload 보내지만 Lambda는 옛 코드 → 400 | 같은 PR/세션에 동시 배포. staging 검증 통과 후 prod (현재 prod는 `VITE_NASUN_AI_ENABLED=false`라 사용자 노출 없음) |
| trader-cycle (nasun-ai-runtime) preset도 같은 Lambda를 호출? | nasun-ai-runtime은 자체 PTB 빌더가 있는지 별도 확인 ([apps/nasun-ai-runtime/](../../nasun-ai-runtime/)). 같은 Lambda 경유면 envelope 동일하게 채워야 함 (action_type='trade.swap.v1' 등) |

---

## 7. 컨트랙트 식별자 (변경 없음)

| 항목 | 값 |
|---|---|
| baram package | `0x734c42b8e8fbca26f1961766176a509a49c8dd44368d80cdc035439809ff1aee` |
| baram_aer package | `0x646b4d020f4c0b7bd88e02b8f4c117ebd78ca617e5c510303bbe468df66ec9b5` |
| baram_aer typeOrigin (struct tag) | `0xdb118fd931572cf42af8613dce1cc18471419d1ba937b63c832d4361aad5b8e5` |
| AER registry | `0xd011a3d53d65db1315b4f13ba3897b580640054e4e28055d337a7e1029a175e2` |
| Baram registry (필요!) | `0x1645502e401e5f9bafe31dfc399bb818eb85f05415b1649b3c2a5d011a24fc02` |
| Capability registry | `0x893a15ed9d53375fc8690a6e5cfacc11a77e78988785cd265f81d49cb3699905` |
| Agent package (v0.2) | `0x6e53972d4ebd922fed13cbe302be295e9d6fc000cc948992a9f87d708b954b5e` |
| Agent original package (struct tag) | `0x15b5ccf799312857d5a2f0320d4a7c3f3015eda4857ef9da3cb621e52ce53947` |
| Executor registry | `0xb5212e4c780544d6bf576e3db7b35118f0380763665bb074229f48d90a7d8656` |
| Executor admin cap | `0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522` (owner: `0xe1c4c90b...`) |
| Lambda function | `baram-executor` (AWS account 135808943968 / nasun-dev / ap-northeast-2) |
| API Gateway | `https://ncn10xkbfh.execute-api.ap-northeast-2.amazonaws.com/prod` |
| API key (frontend) | `VITE_BARAM_API_KEY=r2yZ3YOvpHERmVirpS1E5YOOEIBkhxv8vVDZ05s5` |

---

## 8. 제약 (memory / CLAUDE.md)

- "Baram" / "Sui" / "bot"(AI agent 의미) 외부 노출 금지
- em dash 금지 / emoji 금지
- prod 프론트엔드 raw rsync 금지 → `pnpm deploy:nasun-website:staging|prod`
- staging 검증 후 prod, 사용자 명시적 승인 필수
- pm2 새 env 도입 시 startOrRestart, kill 후 재시작 금지
- AWS 신규 리소스 생성 금지 (Lambda env update / CDK update는 OK)
- 본 작업은 dev 계정(135808943968) Lambda + dev 계정 API Gateway만 건드림. prod 계정(466841130170) 무관

---

## 9. 검증 체크리스트 (작업 완료 기준)

- [ ] `pnpm exec tsc --noEmit` (wallet, chat-server, frontend, baram lambda) 무에러
- [ ] `pnpm build --mode staging` (nasun-website) 통과
- [ ] `pnpm --filter @baram/executor-lambda build` 통과
- [ ] `cdk deploy BaramStack` 성공 (dev 계정)
- [ ] staging.nasun.io에서 v2 agent 등록 → chat 1회 성공 → Activity 탭에 새 AER 행
- [ ] CloudWatch logs `/aws/lambda/baram-executor` 에 `[Sui] Proof + AER submitted: <digest>` 출력 + ERROR 없음
- [ ] AER 객체 onchain 확인: `event_class=1`, `action_type='cognition.chat.v1'`, `triggered_by_type=4`, `action_outcome=1`
- [ ] Stale executor `0x286d7c779f...` `is_active=false` 확인 (별도 admin tx 완료 후)
- [ ] auto-cancel 경로 검증 (의도적으로 Lambda fail 시 cancel_request도 동작?) — 별도 todo로 분리 가능

---

## 10. 후속 작업 (다음 세션의 다음 세션)

본 세션 완료 후에도 남는 큰 항목:
- Trader heartbeat (nasun-ai-runtime)에서 발행하는 AER도 v2 envelope으로 검증. 아마 이미 작동 중일 가능성 있음 (별도 PTB 빌더 사용 시) — 확인 필요
- prod `.env.production`에 `VITE_BACKEND_URL` + `VITE_BARAM_API_KEY` 추가 (staging .env에는 추가 완료)
- `VITE_NASUN_AI_ENABLED=true`로 prod 플립 (외부 출시 결정 후)
- baram-executor Lambda를 monorepo workspace 패키지로 정식 편입 + 빌드 스크립트 일원화

---

## 11. 이번 세션에서 결정 보류한 것

- ★ **§4 Option C (gated path + agent context 강제)** 진행 권장. 다른 옵션이 선호되면 변경.
- chat을 agent에 묶을지 (Option C) vs 사용자 본인 personal capability 발급 (Option A 변형) — 후자는 전체 가입자에게 1개씩 발급해야 해서 부담 큼. Option C가 단순.

---

# _kickoff prompt (새 세션 복붙용)

```
context: nasun-monorepo. Nasun AI 퍼블릭 런칭(S5+) 준비 중 staging
chat 추론 100% 실패 — `baram-executor` Lambda의
`aer::create_report_with_receipt` PTB 호출이 인자 20개로 굳어 있고
contracts-aer v2는 39개를 요구. user chat은 cognition class라
ungated path도 못 씀.

handoff 문서를 먼저 읽어:
apps/baram/doc/HANDOFF_aer_v2_lambda_overhaul_2026-05-15.md

특히 다음 섹션을 정확히 따라:
- §4 라우팅 결정: Option C (agent capability 강제 + gated path)
- §5 작업 분해 S1→S5
- §7 식별자 표
- §9 검증 체크리스트

목표 (이 세션 완료 기준):
1. apps/baram/cdk/lambda-src/executor/src/services/sui.ts의
   `buildProofWithReceiptAndAERTransaction` 함수를 v2 capability-gated
   호출로 재작성. envelope 17필드 + BaramRegistry shared object 인자
   추가. action_type='cognition.chat.v1', event_class=1(COGNITION),
   triggered_by_type=4(session).
2. apps/nasun-website/frontend/src/sections/uju/ai/hooks/request/
   useCreateRequest.ts에서 /execute POST body에 capabilityId +
   expectedCapabilityVersion + envelope hints 추가. legacy agent
   (capabilityId==null)는 chat 입력 disable + 안내 카피.
3. 빌드 + cdk deploy BaramStack (AWS_PROFILE=nasun-dev) + nasun-website
   staging 재배포.
4. staging.nasun.io에서 zkLogin 로그인 → 새 v2 agent의 Overview Chat에
   질문 입력 → Activity 탭에 새 AER 행 + CloudWatch logs에 success.

부가 작업 (별도 admin tx, 사용자 승인 필요):
- ExecutorRegistry에서 stale entry `0x286d7c779f8286df2b303be2dc0a56a64
17cbde71b3b5b2780994f6b9dd49b78`를 admin이 `executor::deactivate_executor`로
비활성화. AdminCap owner는 `0xe1c4c90b...`. 사용자가 별도 sign 필요.

제약:
- "Baram"/"Sui"/"bot" 외부 노출 금지, em dash·emoji 금지
- prod 무관 (dev 계정 135808943968 Lambda + nasun-website staging만)
- 사용자 명시적 승인 없이 prod 배포 금지
- AWS 신규 리소스 생성 금지 (Lambda env/CDK update는 OK)

작업 시작 전에 handoff §4의 Option C 라우팅 방향이 맞는지
한 번 더 확인하고 진행해.
```
