# Nasun AI 탭 UX 재설계 제안 (2026-05-14)

> 동반 문서: [nasun-ai-audit-2026-05-14.md](nasun-ai-audit-2026-05-14.md)
> 범위: 외부 첫 공개를 앞두고 "복잡하고 혼란스럽다"는 사용자 피드백을 받은 현 [sections/uju/ai/](../../frontend/src/sections/uju/ai/) 흐름을 5분 first-time user journey 기준으로 재설계.

---

## 1. 현 마찰점 정리

### 1-1. 명명 inconsistency

| 위치 | 현 카피 | 문제 |
|---|---|---|
| TraderConfigForm 주석 + 11회 등장 | "Trader Bot's preset" | "bot" 금지 (memory). "AI agent" 통일. |
| DashboardTab L87 | "Deactivate / Reactivate" | Foundation 6의 multi-level `pause_mode` 표현이 boolean으로 무너짐. |
| ActivityTab | row가 모두 동일 모양 | cognition/execution/settlement 시각 구분 없음. |
| Capability vs Budget vs Escrow | 3개 단어 혼재 | 사용자가 같은 것인지 다른 것인지 모름. |

### 1-2. 정보 hierarchy 혼란

AgentDetail의 5개 탭(Dashboard / Activity / Chat / Escrow / Sessions) 중:

- **Dashboard와 Activity 중복** — Dashboard 상단 통계 4칸(EXECUTIONS / SPENT / LAST ACTIVE / CREATED)은 Activity의 집계 정보. 보통 Dashboard에서 가장 알고 싶은 "지금 무엇이 일어나고 있는가"는 Activity 탭에서만 볼 수 있음. 사용자 동선이 두 탭 사이를 핑퐁.
- **Escrow와 Budgets 분리** — 같은 객체(Budget)를 두 곳에서 본다. `/ai?view=budgets` (wallet-wide list) + `pages/agent/EscrowTab.tsx` (agent-filtered). 사용자 입장에서 차이가 없음.
- **Sessions가 별개 탭** — 사용자 onboarding 흐름에서 Telegram 연결은 후행 단계. 첫 화면에 차지할 자리 아님.
- **Chat 위치 모호** — 거래 결정 시 LLM에게 묻는 conversational surface인데, Dashboard에서 분리돼 있어 "에이전트와 대화한다"는 행위가 메인 화면 밖으로 밀림.

### 1-3. Quickstart 5-step 흐름 단절

- Step 4 "Write the policy" → Dashboard 탭의 TraderConfigForm으로 점프. 돌아오는 길은 사용자가 직접 Quickstart URL을 다시 입력해야 함.
- Step 5 "Start"는 사실 DashboardTab의 "Reactivate" 토글. Quickstart에선 "Go to agent" 버튼만 보이고 클릭하면 Dashboard로 가는데, 사용자는 거기서 어디를 눌러야 진짜 "Start"인지 명시되지 않음.
- Step 3 "Pick an executor"는 자동 완료지만, "왜 자동인지" 시각 cue 없음. "(prototype에서 Nasun 한 곳만 운영)"이라는 사실이 작은 회색 텍스트.

### 1-4. 차별화 축 부재

[TraderConfigForm.tsx](../../frontend/src/sections/uju/ai/components/forms/TraderConfigForm.tsx):
- 모델 선택 ✓
- Strategy preset 선택 ✗ (런타임에 `aggressive_scalper / conservative_dca / mean_reversion / trend_follower / hold_only` 정의는 있는데 form/runtime 모두 미사용)
- Risk limits ✗ (`max_slippage_bps / stop_loss_bps / take_profit_bps` 입력 0)

사용자가 "내 agent는 다른 사람의 agent와 어떻게 다른가"를 명세할 수단이 cadence + per-trade cap뿐.

### 1-5. 위급 통제 부재

- `set_pause_mode` 호출 진입점 0개. 사고 시 1-click pause 불가.
- Capability revoke 진입점 0개. Foundation 2의 always-revocable 원칙이 UI 약속으로 미반영.

---

## 2. 제안 IA — 5탭 → 3탭

```
변경 전 (AgentDetail)                 변경 후 (AgentDetail)
─────────────────────────             ─────────────────────────
Dashboard  Activity  Chat             Overview        Activity      Settings
Escrow     Sessions                   (= Dashboard +  (event_class  (Config +
                                       라이브 stream)  필터+drawer)  Escrow +
                                                                    Sessions +
                                                                    Danger Zone)
```

근거:

- **Overview** = 기존 Dashboard 상단 통계 + 최근 5건 Activity preview + Chat 인풋 (한 화면에서 "지금 상태 / 최근 행동 / 즉시 대화" 모두). 거래 결정의 대화는 위급 행위가 아니므로 메인에 둘 만하다.
- **Activity** = 풀 스트림 + event_class 필터(All / Cognition / Execution / Settlement) + row → drawer.
- **Settings** = 변경 빈도가 낮은 모든 것(Config form + Escrow + Telegram Sessions + Pause mode + Revoke). 진입은 드물지만 진입 시 모든 통제 한 곳.

탭 수가 줄면 모바일 헤더에도 들어간다. 5탭은 모바일에서 잘림.

---

## 3. 제안 Overview 화면 (와이어프레임)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to agents                                                            │
│                                                                             │
│ ⊙ Aria          0x3f8a…219b      [● Active]    [⏸ Pause]  [⟲ Revoke auth]  │
│ Conservative DCA · Llama 70B · 30 min cadence                               │
│                                                                             │
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐                  │
│ │ Budget      │ Spent today │ Last action │ Reports     │                  │
│ │ 47.20 NUSDC │  2.10 NUSDC │ 4 min ago   │ 138         │                  │
│ │ ────────░░  │   2/20 cap  │ HOLD        │ 12 today    │                  │
│ └─────────────┴─────────────┴─────────────┴─────────────┘                  │
│                                                                             │
│ ── Recent activity ──────────────────────────────── [view all →]            │
│ ◇ HOLD · spread too wide (38 bps)              Llama 70B · 4m ago    ●     │
│ ◆ SELL 2.5 NUSDC · downtrend confirmed         Llama 70B · 34m ago   ●     │
│ ◇ HOLD · waiting confirmation                  Llama 70B · 1h ago    ●     │
│                                                                             │
│ ── Ask Aria ─────────────────────────────────────────────────────           │
│ [ Why did you hold at 12:04?                                  ] [Send]      │
│   (each question costs ~0.01 NUSDC and creates an on-chain report)          │
└─────────────────────────────────────────────────────────────────────────────┘
```

핵심:

- 우상단 1-click **Pause** (multi-level dialog 진입) + **Revoke auth** (capability 회수, 확인 모달).
- Stats 4칸이 "최근 24h 의미 있는 숫자" 로만. CREATED/LAST ACTIVE 같은 정적 정보는 hover/tooltip으로 강등.
- Activity preview row가 cognition(◇) vs execution(◆)을 글리프로 구분. outcome dot(●/○/✕)로 success/hold-noop/failure 한눈에.
- Chat 인풋이 메인 화면. "AI agent와 대화 → 보고서 onchain" narrative가 첫 화면에 살아 있음.

---

## 4. 제안 Activity 화면

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Activity                                          [All ▾] [Cognition] [Exec]│
│                                                                             │
│ Today                                                                       │
│ ◇ 12:04  HOLD spread too wide (38 bps)        Llama 70B  heartbeat   0.01  │
│ ◆ 11:32  SELL 2.5 NUSDC downtrend confirmed   Llama 70B  heartbeat   0.01  │
│ ◇ 11:02  HOLD waiting confirmation            Llama 70B  heartbeat   0.01  │
│ ◇ 03:14  "Should I buy more NBTC?" HOLD       Llama 70B  message     0.02  │
│                                                                             │
│ Yesterday                                                                   │
│ ...                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

Row 1줄 = `action_summary` ([trader-envelope.ts](../../../nasun-ai-runtime/src/presets/trader-envelope.ts) 빌더 결과). Glyph는 `event_class`, 우측 wake icon은 `triggered_by_type`, 마지막 숫자는 settlement fee.

클릭 → 우측 drawer 슬라이드:

```
┌─ AER #138 ──────────────────────────────────────[×]
│ HOLD · spread too wide
│
│ Onchain
│   tx        0xa3b1…f912  ↗
│   report    0x77c0…1d4e
│   event     cognition (analysis.v1)
│   outcome   hold-noop
│
│ Intent lineage
│   intent      I:01HK…q9   (this report)
│   parent      I:01HJ…m2   ← user_message "Should I buy more?"
│   execution   1 of 1
│
│ Replay metadata
│   model            llama-3.3-70b-versatile
│   prompt hash      0x3a…d1
│   market hash      0x91…fe
│   strategy         conservative_dca
│
│ Decoded payload (analysis.v1)
│   decision   HOLD
│   size       0 NUSDC
│   reason     "Spread on NBTC/NUSDC pool is 38 bps, above the
│              30 bps tolerance defined in the policy. Waiting
│              for spread to normalize before re-evaluating."
│
│ [Copy raw bytes]  [View on explorer]
└─────────────────────────────────────────────────
```

이 drawer 한 곳에 빅픽처 작업 7의 모든 요구가 들어간다.

---

## 5. 제안 Settings 화면

좌우 2열, 좌측 = 사용자가 자주 보는 config, 우측 = 위험 영역.

```
┌─ Settings ─────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Strategy preset    [Conservative DCA              ▾]                       │
│                     Stable, low-risk dollar-cost averaging.                 │
│                                                                             │
│  Model              [Llama 3.3 70B                 ▾]                       │
│  Trading pair       [NBTC / NUSDC                  ▾]                       │
│  Cadence            [ 30 ] minutes                                          │
│                                                                             │
│  Per-trade cap      [   2 ] NUSDC                                           │
│  Daily cap          [  20 ] NUSDC                                           │
│  Max slippage       [  50 ] bps                                             │
│  Stop loss          [ 500 ] bps   (5% drawdown ends day)                    │
│  Take profit        [1000 ] bps                                             │
│                                                                             │
│  Custom prompt      [ … ]                                                   │
│  [Save changes]                                                             │
│                                                                             │
│ ── Telegram ─────────────────────────────────────────────────────           │
│ 1 active session · expires 2026-06-13                          [Manage]     │
│                                                                             │
│ ── Budget escrow ────────────────────────────────────────────────           │
│ 0x4ae9…b2 · 47.20 / 100 NUSDC  ────────────░░░░       [Deposit] [Withdraw] │
│                                                                             │
│ ── Danger zone ──────────────────────────────────────────────────           │
│ Pause mode      ◉ Active                                                    │
│                 ○ Pause execution only (cognition still allowed)            │
│                 ○ Pause all wakes  (recommended kill-switch)                │
│                 ○ Full suspend     (also blocks notifications)              │
│                                                                             │
│ [⟲ Revoke capability]                                                       │
│   This permanently disables the agent's authority on your wallet.           │
│   The agent address remains, but cannot execute or settle anything.         │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Strategy preset** drop-down — Plan C 작업 4의 누락된 차별화 축. 런타임 dead code(`strategies.ts`)와 form을 동시에 wire-up.
- **Pause mode 4-way radio** — Foundation 6 그대로. 1차에는 `wake_blocked`만 active, 나머지 두 mode는 보이되 disabled + tooltip("available in phase 2").
- **Revoke capability** — Foundation 2의 always-revocable 원칙. 별도 진입점.

---

## 6. 5분 First-time User Journey (제안 흐름)

| 분 | 행위 | 화면 | UI feedback |
|---|---|---|---|
| 0:00 | 사용자가 `/my-account` → AI 탭 진입. agent 없음. | QuickstartView | Hero + 5 step cards. |
| 0:20 | "Register agent" 클릭 → 이름 + passphrase 입력 | CreateAgentModal | 키 생성 + 다운로드 recovery code. "agent address 0x… created". |
| 0:50 | 자동으로 Step 2 highlight. "Fund budget" 클릭 → 10 NUSDC 충전 | CreateBudgetModal | tx digest + balance gauge. |
| 1:30 | Step 3 자동 완료 표시 ("Nasun executor selected"). Step 4 highlight. | QuickstartView | 시각적 ✓. |
| 1:40 | "Write the policy" 클릭 → AgentDetail Settings 점프, 상단에 "Quickstart" breadcrumb | Settings | 카드 hover 시 "Default values are safe to start with". |
| 2:30 | Strategy preset, cadence, caps 조정 후 Save | Settings | "Saved · agent will start at next cadence" toast + Quickstart breadcrumb 클릭 |
| 3:00 | Quickstart Step 5 highlight. "Activate" 클릭 (boolean 토글이 아니라 명시적 액션) | Overview | Status badge: Inactive → Active. 첫 cycle 시작 카운트다운. |
| 3:30 | 첫 cycle 끝나면 Overview의 Recent activity에 ◇ HOLD row 등장 | Overview | row 클릭 → drawer → "Spread too wide" 사유 + lineage + replay metadata |
| 4:30 | Settings 진입해 Pause mode 시연(active → wake_blocked → active) | Settings → Danger | 다음 cycle skip 확인 → "No cycle ran at 12:34 (paused)" 표시 |
| 5:00 | Done. 외부 관찰자가 "이 사람 5분 안에 active agent 만들고 첫 보고서 봤음" 검증 가능 | — | — |

---

## 7. Before / After 흐름 다이어그램

### Before (현 상태)

```
QuickstartView (5 step)
  ├─ Step 1 → CreateAgentModal
  ├─ Step 2 → /ai?view=budgets (Budgets page)        ← 컨텍스트 이탈
  ├─ Step 3 → 자동 (시각적 cue 약함)
  ├─ Step 4 → AgentDetail / Dashboard / TraderConfigForm  ← 5탭 중 하나
  └─ Step 5 → Go to agent → 어디를 눌러야 시작인지 불명

AgentDetail
  Dashboard / Activity / Chat / Escrow / Sessions          ← 5탭 핑퐁
  Activity row: legacy `purpose`만 표시, 클릭→stored result text  ← drawer 부재
  Danger zone 없음                                                ← pause/revoke 진입 0
```

### After (제안)

```
QuickstartView (5 step, 변경 없음 — 카피만 명료화)
  └─ 각 step 완료 시 breadcrumb 유지 → 돌아오는 길 시각 cue
       Step 4 → AgentDetail Settings (form + breadcrumb)
       Step 5 → Overview의 "Activate" 명시적 버튼

AgentDetail (3탭)
  Overview / Activity / Settings
  Overview = Stats + Recent activity preview + Chat input + Pause/Revoke
  Activity = event_class 필터 + glyph row + drawer (lineage / decoded / replay)
  Settings = Config + Strategy preset + Risk limits + Telegram + Escrow + Danger zone
```

---

## 8. 카피 cleanup 체크리스트

| 위치 | 변경 전 | 변경 후 |
|---|---|---|
| TraderConfigForm.tsx 주석 + 11회 | "Trader Bot", "the bot" | "AI agent" |
| DashboardTab.tsx#L87 | "Deactivate / Reactivate" | "Pause / Activate" (Pause는 Danger zone 모달 진입) |
| EscrowTab.tsx 헤더 | "Escrow Budgets" | "Budget" (Settings 내부 섹션, 별도 탭 아님) |
| Settings 안 capability 카드 | (없음) | "Authority" 카드. Allowed actions / assets / targets 표시. Revoke 버튼. |
| Activity row | "purpose" 텍스트 | `action_summary` + event_class glyph + outcome dot |

전 텍스트에서 금지어 0건 유지: Baram, Sui, bot. em dash 0건. emoji 0건.

---

## 9. 구현 우선순위 (다음 plan으로 변환 시)

1. **P0 — ActivityTab 재작성** (감사 §4-1, §4 우선순위 1): row IA + drawer. 1-2 세션.
2. **P0 — Pause mode + Revoke 진입점** (감사 §4-4, §4-5): Settings Danger zone 신설 + `set_pause_mode` wire-up. 0.5 세션.
3. **P1 — 3탭 IA 재정렬** (이 문서 §2): Dashboard+Chat → Overview, Escrow+Sessions → Settings. 1 세션.
4. **P1 — Strategy preset + Risk limits** (감사 §4-2, §4-3): form 필드 + chat-server schema + runtime wire-up. 1 세션.
5. **P2 — Quickstart breadcrumb** (이 문서 §6 흐름): 5 step과 detail page 양방향 link. 0.5 세션.
6. **P2 — 카피 cleanup** (§8): Trader Bot → AI agent, Deactivate → Pause/Activate. 0.5 세션.
7. **P3 — `/docs/ai` 정적 page** (감사 작업 8): Plan F 범위. 별도 세션.

P0+P1 4건이 완료되면 Foundation 성공 기준 시나리오(빅픽처 L462-466)를 외부 관찰자가 5분 안에 재현·검증 가능.

---

## 10. 미해결 질문 (사용자 검토 필요)

이 두 문서를 Plan으로 변환하기 전 결정 필요한 항목:

1. **Capability struct가 실제 onchain에 존재하나?** 감사에서 Move 컨트랙트(`apps/baram/contracts*` archived, nasun-devnet 측 contracts) 확인 안 함. `allowed_actions / risk_limits / pause_mode` 필드가 이미 onchain에 있다면 frontend wire-up만, 없으면 Plan B(컨트랙트) 선행.
2. **Strategy preset wire-up 범위**: form에 `strategyPresetId` 컬럼 추가 + chat-server `nasun_ai_trader_configs` schema migration + runtime `fetchBrowserConfig` 응답 + `trader-cycle.ts`가 `resolveStrategyPreset(strategyId)` 호출. 4-layer 변경. 한 plan에 묶을 것인가 분할할 것인가.
3. **3탭 IA 변경의 timing**: 외부 첫 공개 *전*인가 *후*인가. 변경 전이면 user feedback 0건이지만 안정성이 떨어지고, 변경 후면 사용자가 둘 다 본다.
4. **Pause mode 1차 active 범위**: 빅픽처는 `wake_blocked`만. UI에서 4-way radio를 보이고 3개 disable할 것인가, 단일 "Pause / Active" 토글로 시작할 것인가.

위 4건 답을 받은 뒤 EnterPlanMode로 실제 구현 plan 진입 권장.
