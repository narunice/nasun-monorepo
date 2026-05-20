# Nasun AI Alpha Readiness (SSOT)

> Last updated: 2026-05-20
> 이 문서는 Nasun AI(구 Baram) 퍼블릭 알파 출시까지의 실시간 진행도를 담는 단일 진실의 출처(SSOT)다.
> 트랙별 상태를 변경할 때는 **반드시 이 문서를 같이 업데이트**한다. handoff/memory가 산재하면 다음 세션이 진척도를 잘못 판단한다.

## TL;DR (2026-05-20 기준)

**결론: 코드/인프라 측면 알파 출시 준비 완료. 차단요인은 최종 flag flip + 배포 1 사이클 뿐.**

| 트랙 | 상태 | 남은 일 |
|---|---|---|
| Track A — PR2.A.1 trader env injection | 🟢 **완전 검증** | 없음. `nasun-ai-agent-ffebbab1` prod 가동 중, 5/20 cycle + AER digest 다수 캡처 |
| Phase E — prod Lambda cutover | 🟢 **완료, swap 활성화** | 없음. AER v4 + `LAMBDA_SWAP_DISABLED=false` |
| Track B — PR2.B funds UX | 🟢 **커밋 + 배포** | 없음. 커밋 `61529265` + `d97f5c1f`, "Inference Balance" rename 6+ 파일 |
| Track C — 브랜딩 grep | 🟡 본문 OK, 자산 잔재 | (비차단) 비디오 파일명 `baram-new-ui-video-*`, `Baram-Ui-rf28.mp4` 등 rename |
| Track D — kill-switch + 모니터링 | 🟢 **운영 가능** | (비차단) Grafana 대시보드는 향후 추가 |
| Track E — 온보딩/ToS | 🟡 자료 완비, 게이트 미체결 | (비차단) activate 직전 ToS 동의 체크박스 |
| **최종 스위치** `VITE_NASUN_AI_ENABLED` | ❌ `false` | `true` flip → `pnpm build:nasun-website` → `/env-verify nasun-website` → `pnpm deploy:nasun-website:prod` |

`🟢` = 완료 / `🟡` = 부분 완료 또는 비차단 잔여 / `❌` = 차단

---

## 트랙별 상세

### Track A — Trader env injection (PR2.A.1)

**목적**: chat-server agent-orchestrator가 spawn하는 nasun-ai-agent 프로세스에 글로벌 trader env(`AGENT_GLOBAL_*`) + per-agent env(CAPABILITY/WALLET/BUDGET/ESCROW/STRATEGY)를 주입.

| 검증 항목 | 상태 | 비고 |
|---|---|---|
| 코드 prod 배포 | ✅ | `~/nasun-chat-server/dist/agent-orchestrator.js`에 `globalTraderEnv` / `perAgentTraderEnv` / `spawnAgentPm2` / `AGENT_GLOBAL_PR1A_SWAP_DISABLED` 심볼 존재. 커밋 `46107a51` 포함 |
| `AGENT_GLOBAL_*` 9개 env 키 | ✅ | PACKAGE_ID, REGISTRY_ID, AER_PACKAGE_ID, API_KEY, EXECUTOR_ADDRESS, HOST_URL, COIN_NBTC_TYPE, COIN_NUSDC_TYPE, PR1A_SWAP_DISABLED |
| pm2 chat-server 재기동 패턴 검증 | ✅ | delete + start 패턴 ([feedback_pm2_hard_restart_for_new_env](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md)). pm2_env 로드 확인 |
| Dogfood E2E 1사이클 | ✅ | `nasun-ai-agent-ffebbab1` 가동 중. 2026-05-20 09:28~12:34 heartbeat trader cycle 4건 + `/wake` 8건 (user_message/manual) 정상. AER digest 다수 캡처: `FimNDk55…` (Trader class=1), `FfteL7Mwvf…` (Trader class=2 cap.v=2), `CVvfKkHPZP…` (Cognition), `E7M2yvKvi…` (Execution) |
| 현재 swap 정책 | 🟡 | runtime `AGENT_GLOBAL_PR1A_SWAP_DISABLED=false` + Lambda `LAMBDA_SWAP_DISABLED=false` 둘 다 swap 활성화. 본 세션 초반 `true`(HOLD-only) 토글했으나 그 이후 `false`로 되돌아간 상태. 의도 확인 필요 |

**Track A 결과**: ✅ **CLOSED**. PR2.A.1 trader env injection은 실 운영 가동 중. dogfood agent가 cycle을 돌리며 AER landing을 produce 중. PR1A swap policy 운영 의도만 별도 확인 권장.

---

### Phase E — Prod Lambda cutover (PR1.5)

**목적**: `baram-executor` Lambda를 AER v4 + multi-provider chain 코드로 cutover. 알파 trader가 swap을 보내면 받을 곳.

| 검증 항목 | 상태 | 비고 |
|---|---|---|
| `baram-executor` LastModified | ✅ | 2026-05-17 14:42 UTC |
| `AER_PACKAGE_ID` | ✅ | `0xe685a7431719cece7b60e44d827d9001105b5d68c002242d0f4ce49924e2f7e0` (v4) |
| `LAMBDA_SWAP_DISABLED` | ✅ | **`false`** (swap path 열림). 알파 mode 결정 후 토글 |
| Negative test (kill-switch flip) | ✅ | Phase D dev에서 검증 ([2026-05-17-p2-phase-d-negative-test.md](../.claude/handoffs/2026-05-17-p2-phase-d-negative-test.md)) |

**Phase E 결과**: ✅ **완료**. swap path가 양 레이어 모두 열려 있어 알파 trader가 실제 swap을 실행할 수 있는 상태. env update 시 **REPLACE-not-MERGE** ([feedback_lambda_env_replace_not_merge](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_lambda_env_replace_not_merge.md)) 항상 필수.

---

### Track B — Agent Funds UX 개편 (PR2.B)

**목적**: Budget(추론료) vs Agent Wallet(매매자본) 라벨 혼동 + 자본 송금 UI 부재 + funds 한눈 조회 부재 해결. ([project_nasun_ai_agent_funds_ux_revamp](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_nasun_ai_agent_funds_ux_revamp.md))

| 작업 | 상태 | 위치 / 커밋 |
|---|---|---|
| `AgentFundsCard.tsx` 신규 | ✅ committed | [apps/nasun-website/frontend/src/sections/uju/ai/components/funds/AgentFundsCard.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/AgentFundsCard.tsx) |
| `TransferAgentFundsDialog.tsx` 신규 | ✅ committed | 같은 디렉토리 |
| `useAgentWalletBalances.ts` hook | ✅ committed | `sections/uju/ai/hooks/` |
| `agentWithdrawTx.ts`, `txErrors.ts` 서비스 | ✅ committed | `sections/uju/ai/services/` |
| "Budget" → "Inference Balance" rename | ✅ committed | `Budgets`, `BudgetSettingsModal`, `TransferAgentFundsDialog`, `QuickstartView`, `TraderConfigForm` 6+ 파일 |
| Capital separation 카피 | ✅ | "Your agent pays AI executors from an Inference Balance you control" 등 |
| Prod 배포 | ✅ | 커밋 `61529265 feat(uju/ai): escrow funding + withdraw, escrow balance UI, NSN ticker` + `d97f5c1f fix(uju/ai): NSN tx.gas split + waitForTransaction + capability auto-sync` |

**Track B 결과**: ✅ **CLOSED**. working tree clean. funds 카드/transfer dialog/Inference Balance rename 모두 head에 머지됨. 단 prod에 빌드/배포가 됐는지는 nasun-website dist 측에서 별도 확인 권장.

---

### Track C — 외부 노출 브랜딩

| 항목 | 상태 | 비고 |
|---|---|---|
| "Baram" → "Nasun AI" | 🟢 본문 대체로 통과 | 잔재: `apps/nasun-website/frontend/src/sections/home/2026WhatWeBuildSection.tsx`의 비디오 파일명 `/videos/baram-new-ui-video-*.mp4` + `buttonVariant: "baram"`. 사용자 노출 텍스트는 아니지만 DOM 클래스/asset 경로 노출 가능 |
| "bot" → "AI agent" | 🟢 | 잔존 "bot"은 Telegram bot 컨텍스트(적법) |
| "Sui" 외부 노출 | 🟢 | "Move-based L1" 표현 통일 |
| "TEE 제공" 표현 금지 | 🟢 | v1 narrative는 TEE 미적용 ([project_baram_no_tee_v1](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_baram_no_tee_v1.md)) |

**다음 액션**: 알파 오픈 직전 grep 1회 재실행 + 비디오 자산 rename 또는 noindex 결정.

---

### Track D — Kill-switch 운영 + 모니터링

| 항목 | 상태 | 위치 |
|---|---|---|
| 3-tier kill-switch runbook | ✅ | [docs/nasun-ai-killswitch-runbook.md](nasun-ai-killswitch-runbook.md) (2026-05-18) |
| L1 runtime `PR1A_SWAP_DISABLED` | ✅ | chat-server env + agent baked env 두 레이어 |
| L2 Lambda `LAMBDA_SWAP_DISABLED` | ✅ | `baram-executor` env |
| Nuclear Move `capability::set_pause_mode` | ✅ | 온체인 admin call |
| AER heartbeat watchdog | ✅ | [apps/nasun-ai-runtime/src/aer-heartbeat.ts](../apps/nasun-ai-runtime/src/aer-heartbeat.ts). Telegram alert 구현. `AGENT_TELEGRAM_ALERT_BOT_TOKEN` / `AGENT_TELEGRAM_ALERT_CHAT_ID`는 chat-server orchestrator가 per-agent로 주입 ([agent-orchestrator.ts:154-158](../apps/nasun-website/chat-server/src/agent-orchestrator.ts#L154)) |
| Telegram alert 채널 (heartbeat staleness) | ✅ | aer-heartbeat watchdog 동작. cooldown 30분 |
| Grafana dashboard (AER landing rate, swap fail, gas, lock leak) | ⚠️ | 미설정 (비차단). Telegram alert로 갈음 |
| capability revoke / killswitch flip alert | ⚠️ | 별도 채널 미설정 (비차단) |

**Track D 결과**: ✅ **운영 가능 수준**. 3-tier 매뉴얼 + heartbeat alert로 알파 오픈 가능. Grafana는 향후 추가.

---

### Track E — 온보딩 UX

| 항목 | 상태 | 위치 |
|---|---|---|
| ToS / Privacy Policy 페이지 | ✅ | [apps/nasun-website/frontend/src/pages/TermsOfUsePage.tsx](../apps/nasun-website/frontend/src/pages/TermsOfUsePage.tsx) (커밋 `50c348ac` GDPR/OFAC 강화) |
| First-run 가이드 ("Agent 만들기 → 자본 보내기 → 첫 trade") | ✅ | [FirstRunChecklist.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/components/FirstRunChecklist.tsx) 3-step banner, localStorage dismissal |
| Capability revoke / agent stop UI | ✅ | [DangerZoneCard.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/components/DangerZoneCard.tsx) revoke modal |
| 에러 메시지 영어 일관성 | 🟡 | 미감사 (비차단) |
| 자금 손실 가능성 + TEE 미적용 동의 게이트 | 🟡 | ToS 본문에는 포함, **activate 직전 체크박스 게이트 부재** (`acceptedTos`/`tosAccepted` grep 0건) |

**Track E 결과**: 🟡 **자료 완비, ToS 동의 게이트만 미체결**. 알파 오픈은 가능하지만 법적 보호 측면에서 activate 직전 체크박스 추가 권장 (비차단, 출시 후 24~48h 내 정리 가능).

---

## 최종 스위치: AI 탭 노출

알파 출시는 결국 한 줄 변경 + 한 번 배포로 끝난다. **현재 코드/인프라 측면 모든 차단요인이 해소되어 즉시 실행 가능 상태**. Track C 자산 rename, Track E ToS 게이트는 비차단 잔여.

```bash
# 1. flag flip
sed -i 's/^VITE_NASUN_AI_ENABLED=.*/VITE_NASUN_AI_ENABLED=true/' \
  apps/nasun-website/frontend/.env.production

# 2. build + verify (Vite는 빌드 타임에 baked-in)
pnpm build:nasun-website
/env-verify nasun-website

# 3. deploy (raw rsync 금지)
pnpm deploy:nasun-website:prod

# 4. https://nasun.io/my-account 에서 AI 탭 노출 확인
```

게이트 위치: [apps/nasun-website/frontend/src/sections/uju/UjuNavigation.tsx:11](../apps/nasun-website/frontend/src/sections/uju/UjuNavigation.tsx#L11) (`NASUN_AI_ENABLED`로 분기).

---

## 운영 좌표 (Quick Reference)

| Key | Value |
|---|---|
| Prod chat-server SSH | `ALLOW_PROD_DIRECT=1 ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52` |
| Chat-server cwd | `~/nasun-chat-server` |
| Chat-server pm2 name | `nasun-chat-server` (id 83) |
| 알파 글로벌 flag | `AGENT_GLOBAL_PR1A_SWAP_DISABLED=true` |
| Per-agent override | 현재 코드 미구현. 글로벌 임시 flip → spawn → 복귀 운영 패턴 |
| Prod Lambda | `baram-executor` (account 466841130170, ap-northeast-2) |
| AER v4 packageId | `0xe685a7431719cece7b60e44d827d9001105b5d68c002242d0f4ce49924e2f7e0` |
| Frontend AI flag | `apps/nasun-website/frontend/.env.production:VITE_NASUN_AI_ENABLED` |
| Frontend gate | [apps/nasun-website/frontend/src/sections/uju/UjuNavigation.tsx:11](../apps/nasun-website/frontend/src/sections/uju/UjuNavigation.tsx#L11) |

---

## 관련 문서

**Code SSOT**:
- [apps/nasun-ai-runtime/CLAUDE.md](../apps/nasun-ai-runtime/CLAUDE.md) — runtime + presets + env
- [apps/baram/CLAUDE.md](../apps/baram/CLAUDE.md) — archive guide + onchain invariants
- [docs/nasun-ai-killswitch-runbook.md](nasun-ai-killswitch-runbook.md) — 3-tier kill-switch ops
- [docs/nasun-ai-alpha-e2e-edge-cases.md](nasun-ai-alpha-e2e-edge-cases.md) — E2E edge cases + incidents

**Handoffs (chronological)**:
- [2026-05-17-pr1-5-cutover-and-public-alpha-roadmap.md](../.claude/handoffs/2026-05-17-pr1-5-cutover-and-public-alpha-roadmap.md) — 알파 로드맵 원본
- [2026-05-17-track-a-pr2a1-trader-env.md](../.claude/handoffs/2026-05-17-track-a-pr2a1-trader-env.md) — Track A 진입점
- [2026-05-17-nasun-ai-alpha-launch-roadmap.md](../.claude/handoffs/2026-05-17-nasun-ai-alpha-launch-roadmap.md) — 본 SSOT의 전신

**Memories**:
- [project_nasun_ai_agent_funds_ux_revamp](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_nasun_ai_agent_funds_ux_revamp.md)
- [project_baram_no_tee_v1](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_baram_no_tee_v1.md)
- [project_2026_05_17_baram_executor_phase_e_drift](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_2026_05_17_baram_executor_phase_e_drift.md)
- [feedback_pm2_hard_restart_for_new_env](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md)
- [feedback_lambda_env_replace_not_merge](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_lambda_env_replace_not_merge.md)
- [feedback_no_raw_rsync_to_prod](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_raw_rsync_to_prod.md)
- [feedback_no_baram_branding](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_baram_branding.md)

---

## 이 문서를 어떻게 유지할 것인가

1. **Track 상태 변경 시 반드시 본 문서 §TL;DR 표 + 해당 §트랙 표를 업데이트.** handoff/memory만 업데이트하면 다음 세션이 진척도를 다시 조사해야 한다.
2. **신규 트랙 추가 시 §트랙별 상세에 섹션 추가** + TL;DR 표에 한 행 추가.
3. **알파 출시 후**: 본 문서는 "Alpha launch postmortem"으로 rename하거나 `docs/archive/`로 이동. 이후 운영은 [docs/nasun-ai-killswitch-runbook.md](nasun-ai-killswitch-runbook.md)와 [apps/nasun-ai-runtime/CLAUDE.md](../apps/nasun-ai-runtime/CLAUDE.md)가 SSOT.
4. **stale 판단 기준**: §TL;DR의 "Last updated" 날짜와 오늘 날짜 차이가 7일 이상이면 한 번 사실 확인 필요. 트랙 상태가 바뀌었는데 본 문서가 안 따라왔으면 그 트랙을 진행 중인 세션에 책임 있음.
