# Handoff: Nasun AI 구현 정합성 감사 + UX 재설계

> 작성일: 2026-05-14
> 다음 세션 목표: **빅 픽처 플랜과 현재 구현의 정합성 평가** + **AI 탭 UX 재설계 제안**
> 빅 픽처 플랜: `~/.claude/plans/pick-an-executor-majestic-thacker.md` ("Baram Prototype Foundation v4")

---

## 컨텍스트

### 무엇이 끝났는가

직전 세션(S7 후속)에서 다음을 완료했다:

1. **Baram → Nasun AI 통합**: 구 `apps/baram/frontend`의 모든 페이지를 `apps/nasun-website/frontend/src/sections/uju/ai/`로 이식 완료. `apps/baram/`는 workspace에서 제외(archived). 런타임은 `apps/nasun-ai-runtime`(구 baram/agent-runner).
2. **Ecosystem 드롭다운 중복 제거**: `/ecosystem/nasun-ai` 항목 삭제, `/ecosystem/baram`만 남김(Move 모듈명 invariant).
3. **AI 탭 5-step Quickstart**: `QuickstartView.tsx` 신설(Register → Fund Budget → Pick Executor → Write Policy → Start).
4. **AgentDetail 5개 서브탭**: Dashboard / Activity / Chat / Escrow / Sessions.
5. **Budget v2 type 불일치 fix**: `budgetTypeOrigin` / `budgetV2TypeOrigin`를 현 `packageId`로 동기화(`packages/devnet-config/devnet-ids.json`).
6. **TraderConfig 런타임 싱크 파이프라인** (이 세션):
   - 브라우저 IndexedDB 저장 → `POST /api/nasun-ai/config` (no auth, devnet)
   - 런타임이 매 사이클 시작 시 HMAC으로 `GET /api/nasun-ai/config/:agentAddress` 조회
   - 적용 필드: `model`, `perTradeMaxQuoteRaw`, `dailyMaxQuoteRaw`, `promptTemplate`(→ `customSystemPrompt`)
   - 폴백: 조회 실패 시 `.env` 기본값
   - 신규/변경 파일:
     - `apps/nasun-website/chat-server/src/store.ts` — `nasun_ai_trader_configs` 테이블
     - `apps/nasun-website/chat-server/src/nasun-ai-config-routes.ts` (신규)
     - `apps/nasun-website/chat-server/src/server.ts` — 라우터 wire-up
     - `apps/nasun-website/frontend/src/sections/uju/ai/services/traderConfigStorage.ts` — fire-and-forget POST
     - `apps/nasun-ai-runtime/src/presets/trader-cycle.ts` — `fetchBrowserConfig()` + 적용
     - `apps/nasun-ai-runtime/src/presets/trader.ts` — `customSystemPrompt` 지원

### 인프라 제약 (중요)

- **chat-server는 프로덕션 한 대만 존재** (`https://nasun.io`, port 3101).
- **스테이징 프론트엔드도 프로덕션 chat-server를 공유**한다. 즉 `staging.nasun.io`의 `VITE_CHAT_SERVER_URL`은 `https://nasun.io`를 가리켜야 한다.
- 스테이징에 chat-server 인스턴스를 새로 띄우지 말 것 (memory: `project_staging_chat_server_off.md`).
- 결과적으로 `staging`과 `production` 프론트엔드는 **동일한 trader_configs SQLite 테이블**을 읽고 쓴다. agent address는 고유하므로 충돌 없음.

### 배포 필요 사항

이 세션이 만든 변경을 실제로 동작시키려면:

1. **Chat-server 재배포** (프로덕션 EC2 `43.200.67.52`):
   - `apps/nasun-website/chat-server/` 빌드 후 EC2에 배포
   - pm2 restart로 `nasun_ai_trader_configs` 테이블 자동 생성됨 (CREATE TABLE IF NOT EXISTS)
2. **nasun-ai-runtime 재배포** (프로덕션 EC2):
   - `apps/nasun-ai-runtime/` 빌드 후 EC2에 배포
   - `CHAT_SERVER_BASE_URL=https://nasun.io` env 확인
   - `BARAM_CHAT_SERVER_HMAC_SECRET` (chat-server와 동일) 확인
3. **Frontend (staging)**: `pnpm deploy:nasun-website:staging`
   - `VITE_CHAT_SERVER_URL=https://nasun.io` env 확인 후 빌드

위 배포는 아직 안 했다. 다음 세션에서 감사+재설계가 끝난 뒤 함께 처리.

---

## 다음 세션의 임무

빅 픽처 플랜과 현재 구현을 **총체적으로 재검토**하고, AI 탭의 UI/UX를 **easy-to-use하게 재설계 제안**한다.

작업 두 갈래:

### Track A — 구현 정합성 감사

빅 픽처 플랜의 핵심 7개 Foundation 결정 + 8개 작업 vs 현재 코드 상태를 매핑하여 **"잘 구현됨" / "부분 구현" / "미구현" / "정합성 깨짐"** 으로 평가.

평가 축 (빅 픽처에서 그대로 인용):

1. **Foundation 1 — AER은 canonical execution ledger인가?**
   - envelope 7 필드 (event_class, action_type, action_schema_version, payload_codec, payload_hash, payload_bytes, action_summary, action_outcome) 모두 있는가?
   - 검증: `apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/ActivityTab.tsx`에서 어떤 필드를 표시하는가? row가 `action_summary` 기반인가, 아니면 옛 `purpose`인가?
2. **Foundation 2 — User-owned wallet + delegated capability**
   - Agent 등록 시 capability 객체가 생성되는가? `useCreateAgent.ts` 확인.
   - capability 회수 UI가 있는가? 어디에?
3. **Foundation 3 — Executor = capability-constrained execution runtime**
   - UI 카피가 "inference provider"가 아니라 "runs your agent's inference and signs the onchain settlement"로 되어 있는가? (`QuickstartView.tsx` Step 3)
4. **Foundation 4 — Event ledger + state projection 분리**
   - 프론트가 onchain object를 직접 fallback 조회 가능한가? indexer 의존만 있는가?
5. **Foundation 5 — Event class 분류 (cognition은 first-class)**
   - cognition AER이 trader 사이클에서 실제로 만들어지는가? `apps/nasun-ai-runtime/src/presets/trader-cycle.ts` 확인.
   - ActivityTab에서 cognition / execution / settlement가 시각적으로 구분되는가?
6. **Foundation 6 — Multi-level pause mode**
   - `set_pause_mode` 호출 UI가 있는가? DashboardTab의 "Deactivate/Reactivate" 토글이 이걸 가리키는가?
7. **Foundation 7 — Canonical event boundary**
   - host trace vs AER 구분이 명시되어 있는가? (현재는 모든 LLM 호출이 AER이 됨 — boundary guard 없음)

작업 1~8 vs 구현:

| Plan 작업 | 핵심 산출물 | 평가 |
|---|---|---|
| 1. AER 재설계 (envelope/lineage/wake/replay) | `create_report_with_receipt_v2` entry function | ? Move 컨트랙트 측 확인 필요 |
| 2. Atomic settlement + action PTB | host의 `/execute-capability` (host-client.ts에서 호출) | 단일 PTB 보장되는지 검증 |
| 3. Capability-scoped policy | capability struct + `risk_limits` | TraderConfigForm에 risk_limits 반영되는지 |
| 4. Agent 차별화 (model + strategy preset + risk) | strategy preset 모듈, model selector | ModelSelector.tsx 있음. strategy preset 4~6개 있는가? |
| 5. Telegram = transport adapter | `useNasunAiSessions.ts` (link/revoke session) | wallet sig flow 있음. UX 평가 필요 |
| 6. L3 Step 3 카피 | QuickstartView Step 3 | 직전 세션에서 빅픽처 카피 그대로 적용됨 ✓ |
| 7. Dashboard activity IA | ActivityTab row IA | row가 `action_summary` 기반인가? lineage drawer 있는가? |
| 8. L4 Architecture 문서 | `/docs/ai` 정적 page | 미확인 |

### Track B — UX 재설계

현재 AI 탭은 **복잡하고 혼란스럽다**는 사용자 피드백을 받았다. 직전 세션에서 잡은 마찰점들:

- "Trader Bot" 라벨, "the bot" 지칭 — agent 명명 규약 위반
- TraderConfigForm에 중복 "Agent Name" 필드
- "No Budget linked"로 설정 저장 차단 (이미 fix)
- Budget이 agent에 자동 연결 안 됨 (이미 fix)
- Step 2 완료 조건이 wallet-wide budget 합계로 잘못 측정 (이미 fix)
- Quickstart 5-step이 보이지만 Step 5("Start")가 실은 DashboardTab의 activate 토글 — 흐름이 끊김

재설계 평가 축:

1. **First-time user (Quickstart)**:
   - 5-step 카드가 진짜 5분 안에 완료되는가? 각 step에서 사용자가 다음 행동을 알 수 있는가?
   - "Use Nasun executor" Step 3가 자동 완료된다는 사실이 시각적으로 명확한가?
   - Step 4 "Write the policy"가 detail 페이지의 어디로 점프하는가? 돌아오는 길은?
   - Step 5 "Start"의 단일 클릭으로 정말 agent가 살아 움직이는가?
2. **Returning user (Dashboard)**:
   - 여러 agent가 있을 때 한 화면에서 health/balance/last action을 볼 수 있는가? (현재는 agent별 detail 진입 필요)
   - "지금 무엇이 일어나고 있는가" (live activity stream) 표시가 있는가?
   - 비상시 pause를 어디서 누르는가? 1-click 도달 가능한가?
3. **Activity 가독성**:
   - ActivityTab row에서 cognition vs execution vs settlement이 한눈에 구분되는가?
   - intent lineage (parent-child)가 시각적으로 보이는가?
   - replay metadata (model_version, prompt_template_hash, market_snapshot_hash)가 드로어에 노출되는가?
4. **정보 hierarchy**:
   - `pages/agent/` 5개 탭이 정말 5개여야 하는가? Dashboard와 Activity는 합칠 수 있는가? Sessions는 Settings 안으로?
   - Escrow vs Budget이 두 곳에 있다(Budgets 페이지 + EscrowTab) — 사용자 입장에서 같은 것인가 다른 것인가?
5. **상태 표현**:
   - agent status enum (active / paused-execution / paused-wake / suspended / inactive)을 한 곳에 통일된 표기로 보여주는가?
   - 현재는 `isActive` boolean만 표현 — Foundation 6의 multi-level pause와 불일치.

---

## 작업 절차 권장

1. **읽기 단계 (subagent 사용 권장)**:
   - 빅 픽처 플랜 전체 읽기 (`~/.claude/plans/pick-an-executor-majestic-thacker.md`)
   - Explore agent로 `apps/nasun-website/frontend/src/sections/uju/ai/` 전체 구조 매핑
   - `apps/nasun-ai-runtime/src/presets/` 의 trader 사이클 흐름 매핑
   - Move 측 envelope schema 확인: `apps/baram/contracts*/` (archived지만 source는 남아 있음) 또는 nasun-devnet 측 contracts
2. **감사 매트릭스 작성**:
   - Foundation 1-7 × {잘됨 / 부분 / 미구현 / 깨짐} 표
   - 작업 1-8 × 같은 표
   - 각 셀에 파일 경로 + 라인 인용
3. **UX 재설계 제안**:
   - 와이어프레임은 글로 묘사 (ASCII 또는 step-by-step description)
   - "현재 UI 흐름" → "제안 UI 흐름" before/after 다이어그램
   - 5분 user journey 시나리오 (외부인이 처음 들어와서 active agent를 만들 때까지)
4. **결과물**:
   - `apps/nasun-website/doc/nasun-ai-audit-2026-05-14.md` (감사 결과)
   - `apps/nasun-website/doc/nasun-ai-ux-redesign-2026-05-14.md` (재설계 제안)
   - 이 두 문서는 사용자가 검토한 뒤 실제 plan(EnterPlanMode)으로 변환할 후보

## 절대 잊지 말아야 할 제약

- **사용자 노출 텍스트에서 "Baram", "Sui", "bot" 금지** — memory: `feedback_no_baram_branding.md`, `feedback_no_sui_branding.md`, `feedback_agent_not_bot.md`
- **em dash 금지** — memory: 사용자 선호
- **emoji 금지** — 사용자가 명시적으로 요청하지 않는 한
- **chat-server는 프로덕션 한 대만** — 스테이징도 프로덕션 공유
- **devnet 한정** — 모든 작업은 devnet 프로토타입 출시 준비용
- **TEE 없이 출시** — memory: `project_baram_no_tee_v1.md`. tee_verified=false가 v1 정상 상태
- **`apps/baram/`는 archived** — workspace 제외. 참고용 소스만 남음. 새 코드에서 import 금지
- **Move 모듈명 `baram::*`은 invariant** — onchain 식별자 유지. UI/외부 텍스트만 "Nasun AI"

## 빠른 시작 명령어

```bash
# 빅 픽처 플랜
cat ~/.claude/plans/pick-an-executor-majestic-thacker.md

# 현재 AI 탭 구조
ls /home/naru/my_apps/nasun-monorepo/apps/nasun-website/frontend/src/sections/uju/ai/

# 런타임 trader 사이클
cat /home/naru/my_apps/nasun-monorepo/apps/nasun-ai-runtime/src/presets/trader-cycle.ts

# 이 세션의 TraderConfig 싱크 변경 검증
grep -rn "fetchBrowserConfig\|nasun_ai_trader_configs" /home/naru/my_apps/nasun-monorepo/apps/nasun-website/chat-server/src/ /home/naru/my_apps/nasun-monorepo/apps/nasun-ai-runtime/src/
```
