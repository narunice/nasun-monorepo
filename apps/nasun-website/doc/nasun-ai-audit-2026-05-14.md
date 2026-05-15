# Nasun AI 구현 정합성 감사 (2026-05-14)

> 빅 픽처: `~/.claude/plans/pick-an-executor-majestic-thacker.md` ("Baram Prototype Foundation v4")
> 감사 대상:
> - 프론트엔드: [apps/nasun-website/frontend/src/sections/uju/ai/](../../frontend/src/sections/uju/ai/)
> - 런타임: [apps/nasun-ai-runtime/src/](../../../nasun-ai-runtime/src/)
> - chat-server: [apps/nasun-website/chat-server/src/](../../chat-server/src/)

평가 표기: **잘됨** / **부분** / **미구현** / **깨짐**

> **2026-05-14 정정 (post Move 컨트랙트 확인)**: Capability struct가 [apps/baram/contracts-aer/sources/capability.move](../../../baram/contracts-aer/sources/capability.move)에 완전 구현되어 있음이 확인됨. Foundation 2/6 및 작업 3의 "깨짐" 판정은 **컨트랙트가 아닌 frontend wire-up 한정**이며, 후속 plan은 Move 변경 없이 진행 가능. 영향받은 셀에 정정 노트 인라인.

---

## 1. Foundation 결정 1~7 감사

### Foundation 1 — AER은 canonical execution ledger인가?

**평가: 잘됨 (런타임/AER) + 깨짐 (프론트 표시)**

런타임 측 envelope 빌더는 7개 필드 전부 채운다.

- [apps/nasun-ai-runtime/src/presets/trader-envelope.ts](../../../nasun-ai-runtime/src/presets/trader-envelope.ts) — `EnvelopeMeta` 구조:
  - `eventClass` (1=cognition, 2=execution)
  - `actionType` (`analysis.v1` 또는 `trade.swap.v1`)
  - `actionSchemaVersion = 1`
  - `payloadCodec = 'bcs'`
  - `payloadHash` = SHA256(action_type ‖ payload_bytes)
  - `payloadBytes` = BCS(`AnalysisV1`) — `decision_tag:u8` + `sizeQuoteRaw:u64 LE` + ULEB128 reason
  - `actionSummary` (≤280 chars 사람 가독)
  - `actionOutcome` (1=success, 2=hold-noop, 3=failure)
- 한 cycle = 정확히 한 AER ([trader-cycle.ts](../../../nasun-ai-runtime/src/presets/trader-cycle.ts) step 9~10).

**깨짐 — Activity row가 envelope의 `action_summary`가 아니라 legacy `purpose`를 표시한다.**

- [pages/agent/ActivityTab.tsx#L86-L87](../../frontend/src/sections/uju/ai/pages/agent/ActivityTab.tsx#L86-L87):
  ```tsx
  {r.purpose && (
    <p className="text-sm text-uju-secondary/70 mt-0.5 truncate">{r.purpose}</p>
  )}
  ```
- 작업 7의 "Activity row 메인 = `action_summary`" 요구 미충족. envelope 필드가 onchain에 있는데 UI는 v1 필드만 본다.
- `event_class`, `action_type`, `action_outcome` 모두 화면 비노출. cognition/execution 시각 구분 없음.

### Foundation 2 — User-owned wallet + delegated capability

**평가: 부분 (컨트랙트 완비, frontend wire-up 누락)**

- **컨트랙트 측 완비**: [capability.move `revoke`](../../../baram/contracts-aer/sources/capability.move#L420) wallet-sig only, terminal state, 객체 보존 + `CapabilityRevoked` event. AgentProfile linkage는 [agent_profile.move `link_capability` / `unlink_capability` / `get_capability`](../../../baram/contracts-agent/sources/agent_profile.move) (L225-L306). SDK 헬퍼 [packages/baram-sdk/src/capability/summarize.ts](../../../../packages/baram-sdk/src/capability/summarize.ts)에 mutation type 완비.
- **Frontend wire-up 누락**: [services/transactionBuilder.ts](../../frontend/src/sections/uju/ai/services/transactionBuilder.ts)는 `buildDeactivateAgentTransaction` / `buildReactivateAgentTransaction`만 노출 (agent_profile `is_active` boolean 토글이지 `capability::revoke` 아님). Capability revoke PTB 빌더 0건.
- [SessionsTab.tsx](../../frontend/src/sections/uju/ai/pages/agent/SessionsTab.tsx)는 Telegram session revoke만 처리 (다른 layer의 위임). On-chain capability revoke와 무관.
- "자산 소유권은 사용자, agent는 delegatee" narrative는 [QuickstartView.tsx](../../frontend/src/sections/uju/ai/pages/QuickstartView.tsx) 카피에는 있으나 Dashboard에서 capability 객체 자체를 보거나 회수하는 1-click 경로 없음.

### Foundation 3 — Executor = capability-constrained execution runtime

**평가: 잘됨 (카피) + 부분 (UI semantics)**

- QuickstartView Step 3 카피 ([QuickstartView.tsx#L210-L211](../../frontend/src/sections/uju/ai/pages/QuickstartView.tsx#L210-L211)) 빅픽처 그대로:
  > "The executor runs your agent's inference and signs the onchain settlement. For the prototype, Nasun operates a single shared executor. (Coming later: a marketplace of competing executors, bring-your-own AI API key, and self-hosted inference with locally-served models.)"
- TraderConfigForm 안 executor 셀렉터는 여전히 inference provider 느낌의 표기(tier/endpoint URL/operator address)만 보여줌. "settlement signer" 역할은 표현 안 됨.

### Foundation 4 — Event ledger + state projection 분리

**평가: 잘됨**

- 인덱서 다운 시 fallback: [hooks/useAerRecords.ts](../../frontend/src/sections/uju/ai/hooks/useAerRecords.ts)가 indexer API 우선 + RPC `getOwnedObjects` fallback (services/aerService.ts).
- 사용자가 onchain object 직접 조회로 truth 회복 가능. Projection 깨져도 데이터 불멸.

### Foundation 5 — Event class 분류 (cognition first-class)

**평가: 부분 (런타임) + 깨짐 (UI)**

- 런타임: cognition AER 생성됨 — `parseTradeDecision`이 HOLD 반환 시 [trader-envelope.ts `buildAnalysisEnvelope`](../../../nasun-ai-runtime/src/presets/trader-envelope.ts) 호출 (eventClass=1). BUY/SELL은 `buildTradeSwapEnvelope` (eventClass=2). 두 case 모두 PTB 단일 settlement.
- UI: ActivityTab은 row를 모두 동일 모양으로 그림. cognition/execution/settlement 시각 구분 0. 색·아이콘·필터 모두 부재.
- 작업 7의 "outcome icon (●/○/✕)", "triggered_by_type icon (heartbeat/message/alert)" 미구현.

### Foundation 6 — Multi-level pause mode

**평가: 깨짐 (frontend 한정. 컨트랙트는 빅픽처 의도 그대로 완비)**

- **컨트랙트 측 완비**: [capability.move#L64-L66](../../../baram/contracts-aer/sources/capability.move#L64-L66)에 `PAUSE_ACTIVE=0`, `PAUSE_WAKE_BLOCKED=2`, `PAUSE_MAX_VALID_ENUM=3` 정의. [`set_pause_mode`](../../../baram/contracts-aer/sources/capability.move#L350)는 phase 1에서 `{0, 2}`만 honor, 1·3은 `E_PAUSE_MODE_NOT_SUPPORTED`로 abort (빅픽처 Foundation 6 의도 그대로). [`assert_can_execute`](../../../baram/contracts-aer/sources/capability.move#L576)가 AER 생성 경로 hard-rail.
- **Frontend 호출 0건**: `set_pause_mode` / `setPauseMode` / `pauseMode` 식별자 grep zero hits in `sections/uju/ai/`. transactionBuilder에 PTB 빌더 없음.
- DashboardTab의 "Deactivate / Reactivate"는 `buildDeactivateAgentTransaction` ([transactionBuilder.ts#L45](../../frontend/src/sections/uju/ai/services/transactionBuilder.ts#L45))을 통해 agent_profile.is_active boolean을 토글 — capability.pause_mode와 별개 layer. 사용자에게 둘이 같은 것처럼 보이는 상태가 안티패턴.
- Foundation 성공 기준 시나리오의 `set_pause_mode(wake_blocked)`를 UI로 재현 불가, **단 컨트랙트는 즉시 호출 가능**.

### Foundation 7 — Canonical event boundary (host trace vs AER)

**평가: 미구현**

- 빅픽처: "Internal chain-of-thought, 중간 planning step, tool retry, memory ranking, speculative plans"은 AER 생성 금지. Host의 AER creation guard에서 enforce.
- 현 trader-cycle은 모든 LLM 호출이 AER을 만든다. `parseTradeDecision`이 어떤 결과를 내든 cognition AER 1건이 무조건 발생. Internal step 식별 / 스킵 로직 없음.
- 1차 단순 rule("LLM이 최종 응답을 emit한 시점만")조차 미구현. Trader 사이클은 응답 단일 step이므로 사실상 정상이지만, 향후 multi-step planner/tool-use가 추가되면 즉시 boundary 위반 위험. **현재는 trader 한정에서만 우발적으로 OK.**

---

## 2. 작업 1~8 vs 구현 매트릭스

| # | 빅픽처 작업 | 핵심 산출물 | 평가 | 인용 |
|---|---|---|---|---|
| 1 | AER 재설계 (envelope 7 + lineage 3 + wake 2 + replay 3~4) | `create_report_with_receipt_v2` + canonical BCS | **잘됨** (런타임 측) | [trader-envelope.ts](../../../nasun-ai-runtime/src/presets/trader-envelope.ts) — Envelope/Lineage/Wake/Replay 4 블록 빌더 존재. SDK `aerSdk.generateIntentId()` UUIDv7 chain. |
| 2 | Atomic settlement + action PTB | host `/execute-capability`가 settlement + action 단일 PTB | **부분** (검증 미진) | [trader-cycle.ts](../../../nasun-ai-runtime/src/presets/trader-cycle.ts) step 10이 단일 호출. 그러나 frontend chat 경로는 별도 `/execute-capability` + agent-signed swap PTB가 분리. Trader 사이클은 OK, chat 경로는 atomic 보장 미검증. |
| 3 | Capability-scoped policy (allowed_actions/assets/targets/risk_limits) | capability struct + `risk_limits` 필드 | **깨짐 (frontend 한정)** | **컨트랙트 완비**: [capability.move#L86-L111 `Capability` + `RiskLimits`](../../../baram/contracts-aer/sources/capability.move#L86-L111). `update_risk_limits` / `replace_allowed_actions` / `replace_allowed_assets` / `replace_allowed_targets` entries 존재. SDK type도 완비. **Frontend 입력 0건**: TraderConfigForm은 `perTradeMaxQuoteRaw`, `dailyMaxQuoteRaw`, `intervalMinutes`만 받음 ([TraderConfigForm.tsx](../../frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx)). `max_slippage_bps`, `stop_loss_bps`, `take_profit_bps`, `allowed_actions/assets/targets` 입력·PTB 0건. |
| 4 | Agent 차별화 (model + strategy preset + risk) | 4~6 strategy preset, model selector | **부분 → 깨짐** | 런타임에 strategy preset 정의 존재 ([strategies.ts](../../../nasun-ai-runtime/src/presets/strategies.ts) — `aggressive_scalper / conservative_dca / mean_reversion / trend_follower / hold_only`). 하지만 **프론트 TraderConfigForm에 strategy 셀렉터 없음**. 런타임 `trader-cycle.ts`도 `resolveStrategyPreset` 호출 0회 — preset 모듈이 dead code. ModelSelector는 정상. |
| 5 | Telegram = transport adapter (canonical = wallet) | wallet-signed session token + Dashboard로 capability deep link | **부분** | [SessionsTab.tsx](../../frontend/src/sections/uju/ai/pages/agent/SessionsTab.tsx) wallet sig flow + 만료/revoke 존재. 단 사용자가 Capability ID를 수동 paste해야 link 가능 — UX 거친 손맛. Daily message cap, parent_intent_id chain (analytical → trade) 미검증. |
| 6 | L3 Step 3 카피 | QuickstartView Step 3 | **잘됨** | [QuickstartView.tsx#L210-L211](../../frontend/src/sections/uju/ai/pages/QuickstartView.tsx#L210-L211). |
| 7 | Dashboard activity IA | `action_summary` row + lineage drawer + replay metadata | **깨짐** | ActivityTab은 legacy `purpose` 표시 ([ActivityTab.tsx#L86-L87](../../frontend/src/sections/uju/ai/pages/agent/ActivityTab.tsx#L86-L87)). intent_id / parent_intent_id grep zero hits in sections. Lineage drawer 없음. ResultViewerModal은 stored result text만 보여줌 — `payload_bytes` decoded view, `model_version`/`prompt_template_hash`/`market_snapshot_hash` 노출 미구현. |
| 8 | L4 Architecture 문서 (`/docs/ai`) | 정적 page | **미구현** | `apps/nasun-website/frontend/src/pages/` 아래 `docs/ai` 경로 없음 (find/ls zero hits). |

---

## 3. 부수 발견 (memory/policy 위반)

### 3-1. "Trader Bot" 단어 코드 잔존

- [TraderConfigForm.tsx#L2](../../frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx#L2): 주석 `"TraderConfigForm — define/edit a Trader Bot's preset."`. 코드 주석은 사용자 노출 아니지만 11회 "Trader/Bot" 등장 — 향후 UI 카피 새로 쓸 때 "AI agent"로 통일 필요. memory: `feedback_agent_not_bot.md`.
- "Sui", "Baram"은 외부 노출 텍스트 grep zero. dev 식별자만 잔존 (OK).

### 3-2. TraderConfigForm 중복 "agentAddress" key

Explore 결과의 spec 객체에 `agentAddress`가 두 번 포함 — TypeScript에서 마지막 값만 유효해 런타임 문제는 없으나 cleanup 대상. 위치: [TraderConfigForm.tsx](../../frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx).

### 3-3. Strategy preset 모듈 dead code

[strategies.ts](../../../nasun-ai-runtime/src/presets/strategies.ts)에 `listStrategyPresets / resolveStrategyPreset / 5 presets` 정의·test 있는데 **trader-cycle.ts에서 import 0건**. Plan C §"작업 4"의 핵심 차별화 축이 런타임에 연결되지 않은 상태. 사용자가 어떤 preset도 고를 수 없고, 고른다 해도 cycle이 무시한다.

### 3-4. Replay extras 빈 사용

`replay_extras` map (1-D)에 `strategy_id`, `cycle_at_ms`는 채워지지만 `tokenizer_version`, `inference_params`, `memory_snapshot_hash`는 0. Phase 2 OK이나 `strategy_id`가 항상 default("conservative_dca")로 박힐 가능성 — strategy preset 미연결의 직접 결과.

### 3-5. Foundation 성공 기준 시나리오 재현성

빅픽처 마지막 단락(L462-466)의 5단계 시나리오를 현 UI/런타임으로 시뮬레이션:

| 단계 | 현 상태 |
|---|---|
| Agent 생성 (preset/model/risk_limits 명세) | preset/risk_limits 입력 불가 → **깨짐** (컨트랙트는 받을 준비 완료) |
| Telegram에서 새벽 3시 질문 → user_message wake → cognition AER (parent=null) | wake type 빌더에 `user_message` 코드 있으나 chat→Telegram→host→runtime user_message wake path 종단 검증 미확인 → **부분** |
| 다음 heartbeat에 trade AER (parent_intent_id = analytical AER) | runtime는 lineage chain 지원, 그러나 cognition AER의 intent_id를 trade AER이 부모로 가리키는 cross-cycle chain은 1 cycle = 1 AER 모델에선 자연스럽지 않다. cycle 간 chain 보존은 `lastIntentIdHex` 활용한 자동 chain만 존재 — 빅픽처가 그리는 "user 질문 → confirm → 거래"의 의미적 parent 관계 미구현 → **부분** |
| `set_pause_mode(wake_blocked)` wallet sig | 호출 UI 0 → **깨짐** (컨트랙트 entry + SDK type 완비) |
| 외부 관찰자가 인덱서 + onchain만으로 재현 | replay metadata는 onchain에 박혀 있으므로 이론적으로 가능. 단 frontend가 decoded view 미제공 → 인덱서 측에서 별도 도구 필요 → **부분** |

---

## 4. 우선순위 권고 (감사 결론)

빅픽처와 가장 큰 간극, 즉 다음 세션에서 1순위로 다뤄야 할 깨짐:

1. **ActivityTab 재작성** — `action_summary` + event_class 시각 구분 + outcome icon + lineage drawer + decoded payload + replay metadata. Foundation 1의 product 약속(canonical ledger를 외부 관찰자가 본다)을 UI가 부정하는 상태.
2. **Strategy preset 셀렉터 + 런타임 wire-up** — Plan C 작업 4의 핵심. Form 필드 추가 + chat-server `nasun-ai-trader-configs`에 `strategyPresetId` 컬럼 + `trader-cycle.ts`가 `resolveStrategyPreset` 호출하도록 변경.
3. **Risk limits 입력** — `max_slippage_bps`, `stop_loss_bps`, `take_profit_bps`. capability 객체와 동기화하는 onchain 호출 정의 필요 (Plan B 범위지만 UI는 지금 추가 가능).
4. **`set_pause_mode` UI** — DashboardTab 상단에 3-level radio (active / execution_only / wake_blocked / full_suspend). 1차 active mode = wake_blocked만, 나머지는 disabled.
5. **Capability revoke 1-click 진입점** — DashboardTab 위험 영역(Danger Zone) 추가. memory: Foundation 2의 always-revocable 원칙.

위 5건이 끝나면 빅픽처 Foundation 성공 기준 시나리오의 70% 이상이 UI로 재현 가능.

**중요: 위 1~5 작업 모두 Move 컨트랙트 변경 0건.** Capability struct·entry functions·SDK types가 이미 존재. 다음 plan(E1)은 frontend `transactionBuilder` PTB 빌더 추가 + Settings UI + chat-server JSON 확장 + nasun-ai-runtime preset wire-up 만으로 완료 가능.

부수 cleanup (낮은 우선순위):

- TraderConfigForm 주석/식별자에서 "Trader Bot" 제거 → "AI agent"
- 중복 agentAddress key 제거
- `/docs/ai` 정적 page 신설 (Plan F 범위)
