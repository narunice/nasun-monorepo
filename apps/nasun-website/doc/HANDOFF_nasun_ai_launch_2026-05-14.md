# Handoff: Nasun AI 퍼블릭 런칭 (Plan E1 후속)

> 작성일: 2026-05-14
> 직전 세션: Plan E1 (`~/.claude/plans/serialized-beaming-horizon.md`) 7 슬라이스 + Move 컨트랙트 v0.2 upgrade 완료
> 다음 세션 목표: 잔여 작업 P0 → P3 순으로 처리하여 **devnet 퍼블릭 출시**

---

## 1. 현재 상태 (직전 세션 산출물)

### 완료된 것

**Plan E1 (7 슬라이스)**
- ✅ Slice 1: 신규 agent 생성 = AgentProfile + Capability + AgentEscrow 단일 5-cmd PTB로 atomic 생성 ([useCreateAgent.ts](../frontend/src/sections/uju/ai/hooks/useCreateAgent.ts))
- ✅ Slice 2: Capability mutation PTB builder 6종 (`setPauseMode / updateRiskLimits / replaceAllowedActions / replaceAllowedAssets / replaceAllowedTargets / revoke`) — [transactionBuilder.ts](../frontend/src/sections/uju/ai/services/transactionBuilder.ts)
- ✅ Slice 3: `useCapability` hook (fetch + 4 mutation 노출) — [useCapability.ts](../frontend/src/sections/uju/ai/hooks/useCapability.ts)
- ✅ Slice 4: TraderConfigForm 확장 (strategy preset 5종 + risk limits bps 3종 + 검증) — [TraderConfigForm.tsx](../frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx)
- ✅ Slice 5: chat-server JSON round-trip 검증 (schema 변경 0)
- ✅ Slice 6: nasun-ai-runtime — `BrowserTraderConfig.strategyPresetId` 추가 + `effectiveStrategy` 해석 + `buildTraderPrompt` / `buildReplay` 전달 ([trader-cycle.ts](../../nasun-ai-runtime/src/presets/trader-cycle.ts))
- ✅ Slice 7: ActivityTab 재작성 (event_class glyph / outcome dot / wake icon / filter) + ResultViewerModal에 lineage + replay metadata 섹션 추가

**Move 컨트랙트**
- ✅ baram_agent v0.2 upgrade publish — `create_agent_with_capability(..., capability_id: ID, ...)` entry 추가
  - 새 packageId: `0x6e53972d4ebd922fed13cbe302be295e9d6fc000cc948992a9f87d708b954b5e`
  - 원 packageId 보존: `0x15b5ccf799312857d5a2f0320d4a7c3f3015eda4857ef9da3cb621e52ce53947` (devnet-ids.json `baram.agentOriginalPackageId`)
  - Publish tx digest: `76wK3w8PvZxubPZ2T6DBS3Gp1xjd27sxTCmgezHUMFmX`

**검증**
- ✅ nasun-website staging build (`pnpm -F @nasun/nasun-website build --mode staging`) — TS 에러 0
- ✅ nasun-ai-runtime: typecheck + 11 test files / 160 tests 모두 통과

### 주요 식별자

| 항목 | 값 |
|---|---|
| 새 baram_agent packageId | `0x6e53972d4ebd922fed13cbe302be295e9d6fc000cc948992a9f87d708b954b5e` |
| baram_aer packageId | `0x646b4d020f4c0b7bd88e02b8f4c117ebd78ca617e5c510303bbe468df66ec9b5` |
| capabilityRegistry | `0x893a15ed9d53375fc8690a6e5cfacc11a77e78988785cd265f81d49cb3699905` |
| agentProfileRegistry | `0x6ae144160e2266177268a166e08cd3ff35a7f2a31e8ab404687dacaa2581f000` |
| agentUpgradeCap | `0x0da893767245e3083a077e4abbd80100c3fa1c48dc07aec3e004b8c522457e5a` |
| Production frontend env flag | `VITE_NASUN_AI_ENABLED=false` (전환 필요) |
| Staging frontend env flag | `VITE_NASUN_AI_ENABLED=true` |

---

## 2. 잔여 작업 (P0 → P3)

### P0 — Must-ship (런칭 차단)

#### P0-1. DashboardTab "Danger zone" 카드 신설 — Pause / Revoke UI 진입점

**파일**: [apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/DashboardTab.tsx](../frontend/src/sections/uju/ai/pages/agent/DashboardTab.tsx)

**현황**: Plan E1 "Critical Files" 표 마지막 줄에 `DashboardTab.tsx — (Danger zone 카드 추가)`라고 적혀 있지만 7개 슬라이스 어디에도 명시 안 돼서 누락. `useCapability` hook 4 mutation은 다 있지만 호출 UI가 없음 → **외부 사용자가 capability를 mutate할 방법이 0**.

**필요 변경**:
1. `agent.capability` (Option<ID>)를 읽어 capability_id를 뽑고 `useCapability(capabilityId)` hook 호출.
2. DashboardTab 하단에 "Authority / Danger zone" 카드 추가:
   - **Wake mode**: 4-way radio (mode 0 = Active, mode 1 = disabled + helper "Reserved (Plan E2)", mode 2 = Pause all wakes, mode 3 = disabled + helper "Reserved (Plan E2)"). 선택 시 `setPauseMode(mode)` 호출. ([Plan E1 §사용자 결정](../../../.claude/plans/serialized-beaming-horizon.md) 참조)
   - **Revoke capability**: 빨간 버튼 + 2-step confirm 모달. 호출 시 `revoke()`. 성공 후 "Revoked" 배지 노출.
   - **Capability summary** (read-only): allowed_actions 칩 리스트, max_notional / max_daily_loss, current pause_mode, version, revoked 플래그. `useCapability().data` 사용.
3. agent.capability가 None인 경우 (legacy agent): "Link capability" CTA 또는 helper text 노출.
4. 카피: "Deactivate / Reactivate" 토글은 그대로 두되 라벨을 "Pause agent (off-chain) / Activate agent" 로 명확화 (이건 capability pause와는 별개의 `agent_profile::deactivate/reactivate` 호출).

**LOC**: ~150
**세션 추정**: 0.5 세션

#### P0-2. Devnet manual e2e 검증

Plan E1 §"Manual end-to-end (devnet)" 9개 시나리오 실행:

1. 신규 지갑 → Register Agent → 단일 PTB로 AgentProfile + Capability + AgentEscrow 3 객체 생성 확인 + `profile.capability == Some(cap_id)` 확인.
2. AgentDetail → Dashboard Danger zone → "Pause all wakes" → wallet sig → `cap.pause_mode == 2` 확인 → 다음 heartbeat cycle skip 로그 확인.
3. "Active" 복귀 → 다음 cycle 정상 실행.
4. "Revoke capability" → confirm → `cap.revoked == true` 확인 → 다음 cycle `E_CAPABILITY_REVOKED` abort.
5. TraderConfigForm에서 strategy `aggressive_scalper` 변경 + save → SQLite row `config_json.strategyPresetId` 확인.
6. 다음 cycle 로그에서 "resolved strategy: aggressive_scalper" 확인 + prompt에 해당 fragment 포함.
7. AER `replay_extras.strategy_id == 'aggressive_scalper'` onchain 확인.
8. ActivityTab → cognition (◇) vs execution (◆) glyph 시각 구분 + 필터 동작 + drawer lineage 노출.
9. **외부인 1명에게 `/my-account` URL 전달 → 5분 안에 active agent + 첫 AER + Pause 토글 도달 가능 여부 관찰.**

**세션 추정**: 0.5 세션 (외부인 관찰 포함 시 1 세션)

#### P0-3. 프로덕션 배포 3종 + env 동기화

**A. chat-server 재배포** (prod EC2 `43.200.67.52`)
- 이유: `nasun_ai_trader_configs` 테이블 + `/api/nasun-ai/config*` 라우터가 prod에 아직 안 올라감.
- 방법: chat-server pm2 restart로 `CREATE TABLE IF NOT EXISTS` 자동 실행.
- env: `BARAM_CHAT_SERVER_HMAC_SECRET` 확인.
- 메모리: `project_unified_chat_server.md` (포트 3101).

**B. nasun-ai-runtime 재배포** (prod EC2)
- 이유: strategyPresetId wire-up + 새 baram_agent packageId 반영.
- 방법: build → `.deploy-stage` rsync → `pm2 startOrRestart ecosystem.config.cjs` (메모리 `feedback_pm2_env_management.md` 준수).
- env 확인:
  - `CHAT_SERVER_BASE_URL=https://nasun.io`
  - `BARAM_CHAT_SERVER_HMAC_SECRET` (chat-server와 동일)
  - `AGENT_PACKAGE_ID` 또는 devnet-ids.json import — **새 `0x6e53972d…`로 동기화 필수** (P0-4 참조)

**C. nasun-website prod 배포**
- `.env.production`: `VITE_NASUN_AI_ENABLED=false → true` 전환.
- 명령: `pnpm deploy:nasun-website:prod` (raw rsync 금지, 메모리 `feedback_no_raw_rsync_to_prod.md`).
- 배포 후 `/env-verify nasun-website`로 baked-in 확인.

**금지**: 스테이징 검증 없이 prod 직배 금지 (메모리 `feedback_staging_before_prod.md`). 반드시 staging 통과 후 사용자 명시적 승인.

**세션 추정**: 0.5 세션

#### P0-4. production env에 새 agentPackageId 반영

devnet-ids.json은 갱신됐지만 다음 환경변수 / 설정 파일 모두 동기화 확인 필요:

- `apps/nasun-ai-runtime/.env` (prod EC2): `AGENT_PACKAGE_ID` 또는 devnet-config import 경로.
- `apps/nasun-website/frontend/.env.production`: frontend가 devnet-config workspace import만 쓰면 자동.
- 다른 컨슈머: `executor-nitro/`, `api-server/` (baram archived지만 prod에서 돌고 있을 수 있음) — `grep -rn "agentPackageId\|AGENT_PACKAGE_ID" --include=".env*" --include="*.cjs"` 로 전수 확인.

**세션 추정**: 0.25 세션 (검증 위주)

---

### P1 — Strongly recommended (런칭 직전 권장)

#### P1-1. Plan E2 — 3탭 IA 재편

**기준 문서**: [doc/nasun-ai-ux-redesign-2026-05-14.md §2](nasun-ai-ux-redesign-2026-05-14.md)

**변경**:
- 현 5탭: `Dashboard / Activity / Chat / Escrow / Sessions`
- 신 3탭: `Overview / Activity / Settings`
  - **Overview** = Dashboard stats + Recent activity preview (최근 5건) + Chat input + Pause/Revoke 빠른 진입
  - **Activity** = (현재 그대로, glyph row + drawer)
  - **Settings** = Capability config (Allowed actions/assets/targets — Phase 2 readonly OK) + Strategy preset (TraderConfigForm 이동) + Risk limits + Telegram sessions + Escrow 섹션 + Danger zone

**파일**:
- `apps/nasun-website/frontend/src/sections/uju/ai/pages/AgentDetail.tsx` — 탭 정의 재구성
- 신규: `pages/agent/OverviewTab.tsx`, `pages/agent/SettingsTab.tsx`
- 기존 `DashboardTab / ChatTab / EscrowTab / SessionsTab.tsx`은 새 탭 내부 섹션 컴포넌트로 리팩터 (재작성보다 wrap 권장)

**LOC**: ~400 (대부분 이동/wrap)
**세션 추정**: 1 세션

#### P1-2. Quickstart breadcrumb 양방향 링크

**기준 문서**: [doc/nasun-ai-ux-redesign-2026-05-14.md §6](nasun-ai-ux-redesign-2026-05-14.md)

**현황**: `QuickstartView.tsx` 5-step 카드가 detail page로 점프하지만 breadcrumb 시각 cue 없음 → 사용자가 "어디로 갔는지" 인식 못 함.

**변경**:
- AgentDetail 상단에 "← Back to Quickstart" 링크 (Quickstart 진입자 한정 — `?from=quickstart` 쿼리 또는 history-state로 판별)
- Quickstart 각 step 완료 시 체크마크 + 색상 변경 (이미 일부 존재한다면 보강)
- Step 4 (Write policy) → Settings 탭 진입 후 다시 Quickstart 복귀 시 Step 5 cue 강조
- Step 5 (Start) = Overview의 "Activate" 명시적 버튼

**LOC**: ~100
**세션 추정**: 0.5 세션

#### P1-3. 인덱서 envelope 필드 노출 (backend)

**현황**: 현재 ActivityTab은 envelope 필드를 RPC fallback에서만 채움. 인덱서 API (`apps/baram/api-server/`)는 envelope 필드를 반환하지 않음 → 항상 느린 RPC 경로.

**변경 범위**:
- baram api-server `aer_records` 테이블 schema에 envelope 컬럼 17개 추가 (`event_class`, `action_type`, `action_summary`, `action_outcome`, `payload_codec`, `payload_hash`, `payload_bytes`, `intent_id`, `parent_intent_id`, `execution_id`, `triggered_by_type`, `triggered_by_ref`, `model_version`, `prompt_template_hash`, `market_snapshot_hash`, `replay_extras` JSON, `strategy_id`)
- RPC sync worker가 nested move struct 필드를 평탄화하여 저장
- `/api/v1/aer` 응답에 envelope 필드 포함
- nasun-website [useAerRecords.ts](../frontend/src/sections/uju/ai/hooks/useAerRecords.ts) `mapIndexerRecord` 함수가 자동 매핑 (이미 optional 필드라 backward compatible)

**주의**: baram archived이지만 api-server는 prod에서 동작 중 (메모리 `project_unified_chat_server.md` 와는 다른 인스턴스). Postgres 마이그레이션 + Lambda re-deploy 필요할 수 있음.

**LOC**: ~200 (Postgres migration + 매핑 코드)
**세션 추정**: 1 세션 (또는 별도 backend 세션)

#### P1-4. 카피 cleanup

**기준 문서**: [doc/nasun-ai-ux-redesign-2026-05-14.md §8](nasun-ai-ux-redesign-2026-05-14.md)

| 위치 | Before | After |
|---|---|---|
| `DashboardTab.tsx` 토글 | "Deactivate / Reactivate" | "Pause agent / Activate agent" |
| `EscrowTab.tsx` 헤더 | "Escrow Budgets" | "Budget" (Settings 내부 섹션화 시) |
| 전 텍스트 | "Trader Bot" 또는 "bot" | "AI agent" |

전 검색: `grep -rni "deactivate\|trader bot\|the bot\|escrow budget" apps/nasun-website/frontend/src/sections/uju/ai`

**LOC**: ~30
**세션 추정**: 0.25 세션

---

### P2 — Post-launch OK

#### P2-1. `/docs/ai` 정적 page (Plan F)

**기준 문서**: 빅 픽처 작업 8 (`~/.claude/plans/pick-an-executor-majestic-thacker.md`)

**내용**:
- L1: "What is Nasun AI" (1-paragraph)
- L2: Foundation 결정 7개 짧은 설명 (AER ledger / user wallet + capability / executor 역할 / event class / pause / boundary)
- L3: 5-min Quickstart 텍스트 가이드
- L4: 아키텍처 다이어그램 (mermaid) — wallet ↔ runtime ↔ executor ↔ AER

**파일**: 신규 `apps/nasun-website/frontend/src/pages/docs/ai/index.tsx`

**LOC**: ~250
**세션 추정**: 0.5 세션

#### P2-2. TraderConfigForm risk limits → capability 자동 sync 버튼

**현황**: 폼의 risk_limits는 prompt hint, capability `risk_limits`는 onchain hard rail — 둘이 별개. 사용자 입장에서 confusion 여지.

**변경**: 폼 저장 후 "Also enforce onchain" 토글 → 활성 시 `updateRiskLimits` 자동 호출 (wallet sig 추가).

**LOC**: ~80
**세션 추정**: 0.25 세션

#### P2-3. BCS payload decoder (analysis.v1)

**기준 문서**: [Plan E1 §Slice 7d](../../../.claude/plans/serialized-beaming-horizon.md#L177-L182)

**변경**: ResultViewerModal drawer에 `analysis.v1` decoded view 섹션 신설.
- BCS 역연산: `decision_tag (u8) || sizeQuoteRaw (u64 LE) || reason (ULEB128 string)`
- Source: [trader-envelope.ts `encodeAnalysisV1`](../../nasun-ai-runtime/src/presets/trader-envelope.ts) 의 역연산

**LOC**: ~120
**세션 추정**: 0.5 세션

---

### P3 — Long-term (잘하면 좋음)

- **P3-1. Capability `replace_allowed_*` 편집 UI** — actions / assets / targets 편집. Plan E1 §Out of Scope 명시 "Editable in Phase 2 helper text만 표시". 빌더는 다 있음, UI만.
- **P3-2. trader-cycle.test.ts에 strategyPresetId 시나리오** — Plan E1 §Verification 권장 testimony.
- **P3-3. Foundation 7 — host trace vs AER boundary guard** — multi-step planner 도입 시 즉시 위험. 현재 trader 한정에서만 우발적 OK (audit §Foundation 7 "미구현").
- **P3-4. Cross-cycle parent_intent_id lineage** — 현재 1 cycle = 1 AER 안에서만 chain. user-question → confirm → trade의 의미적 부모 관계 미구현 (audit §성공 시나리오 미스 §3).

---

## 3. 권장 진행 순서

```
세션 1 (반나절):  P0-1 Danger Zone UI + P1-4 카피 cleanup + P0-2 devnet e2e 일부
세션 2 (1일):     P1-1 Plan E2 3탭 IA 재편
세션 3 (반나절):  P1-2 Quickstart breadcrumb + P0-2 devnet e2e 완료
세션 4 (반나절):  P0-3 production deploy 3종 + P0-4 env 동기화 → 외부 출시
세션 5 (병렬):    P1-3 인덱서 envelope (backend, 별도 세션)
이후:            P2 / P3 항목 사용자 피드백 따라 우선순위 조정
```

총 추정: **3-4 세션** + 인덱서 backend 1 세션. **외부 첫 노출은 세션 4 종료 시점.**

---

## 4. 절대 잊지 말아야 할 제약

루트 [CLAUDE.md](../../../CLAUDE.md) + 메모리에서 자주 위반되는 항목:

- **사용자 노출 텍스트**: "Baram" / "Sui" / "bot" 금지 (`feedback_no_baram_branding.md`, `feedback_no_sui_branding.md`, `feedback_agent_not_bot.md`)
- **em dash (—) 금지** — 사용자 선호. 쉼표/마침표/괄호/하이픈으로 대체.
- **emoji 금지** — 명시적 요청 없으면 사용 금지.
- **chat-server는 prod 1대만** — staging도 prod 공유 (`project_staging_chat_server_off.md`).
- **prod 프론트엔드 raw rsync 금지** — 반드시 `pnpm deploy:nasun-website:prod` (`feedback_no_raw_rsync_to_prod.md`).
- **staging 검증 후 prod** — 사용자 명시적 승인 필수 (`feedback_staging_before_prod.md`).
- **pm2 새 env 도입 시 startOrRestart, kill 후 재시작 금지** — `feedback_pm2_env_management.md`.
- **TEE 없이 출시** — `tee_verified=false`가 v1 정상 상태 (`project_baram_no_tee_v1.md`).
- **Move 모듈명 `baram::*` invariant** — onchain 식별자 유지, UI/외부 텍스트만 "Nasun AI".
- **devnet 한정** — mainnet 배포 검토 금지, 모두 devnet 프로토타입.
- **비용**: AWS 신규 리소스 생성 금지 (루트 CLAUDE.md Cost Management).

---

## 5. 빠른 시작 명령어

```bash
# 빅 픽처 + 직전 E1 plan
cat ~/.claude/plans/pick-an-executor-majestic-thacker.md
cat ~/.claude/plans/serialized-beaming-horizon.md

# audit / redesign 문서
cat apps/nasun-website/doc/nasun-ai-audit-2026-05-14.md
cat apps/nasun-website/doc/nasun-ai-ux-redesign-2026-05-14.md

# Slice 1-7 산출 파일 확인
ls apps/nasun-website/frontend/src/sections/uju/ai/hooks/useCapability.ts
ls apps/nasun-website/frontend/src/sections/uju/ai/services/transactionBuilder.ts
ls apps/nasun-website/frontend/src/sections/uju/ai/pages/agent/ActivityTab.tsx

# 현재 capability mutation 진입점 누락 확인
grep -rn "useCapability\b" apps/nasun-website/frontend/src/sections/uju/ai
# → useCapability.ts 자체만 hit. 호출 site 0건. P0-1이 이걸 채움.

# devnet manual e2e용 신규 지갑 생성
nasun client new-address ed25519
nasun client faucet
```

## 6. 인계 핵심 메시지

1. **Plan E1 7 슬라이스는 완료지만 "Danger zone 카드"가 누락**됐다 — `useCapability` + 6 builder는 모두 wired이지만 호출 UI가 0. P0-1이 이걸 닫는다.
2. **Move 컨트랙트는 이미 publish됐다** — baram_agent v0.2 (`0x6e53972d…`). 롤백 불필요, 다른 컨슈머가 새 packageId를 쓰는지 P0-4에서 검증만.
3. **인덱서가 envelope 필드를 노출 안 함** — ActivityTab은 현재 RPC fallback에 의존. 출시는 가능하지만 1 agent당 200건 이상 시 체감 느려짐. P1-3을 backend 세션으로 병행 권장.
4. **production 배포 3종이 묶음** — chat-server / runtime / frontend 셋 다 prod에서 안 돌고 있다. 순서: chat-server (테이블 생성 선행) → runtime (env 새 packageId) → frontend (env_flag 전환).
5. **외부인 5분 시나리오가 출시 기준** — P0-2 §9. 이 한 명이 5분 안에 active agent + 첫 AER + Pause까지 도달 못 하면 추가 마찰점 해결 후 다음 외부인.

문서 검토 + 첫 세션 진입할 때 다음 프롬프트를 그대로 붙여넣을 것 권장 (별첨).
