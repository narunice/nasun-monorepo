# Nasun AI Alpha Readiness (SSOT)

> Last updated: 2026-05-19
> 이 문서는 Nasun AI(구 Baram) 퍼블릭 알파 출시까지의 실시간 진행도를 담는 단일 진실의 출처(SSOT)다.
> 트랙별 상태를 변경할 때는 **반드시 이 문서를 같이 업데이트**한다. handoff/memory가 산재하면 다음 세션이 진척도를 잘못 판단한다.

## TL;DR (2026-05-19 13:00 KST)

| 트랙 | 상태 | 남은 일 |
|---|---|---|
| Track A — PR2.A.1 trader env injection | 🟢 prod 배포 + 알파 모드 적용, dogfood 시도 흔적 있음 | dogfood 1사이클 결과 기록 + Track A close 선언 |
| Phase E — prod Lambda cutover | 🟢 완료 (`baram-executor` AER v4, `LAMBDA_SWAP_DISABLED=true`) | 알파 오픈 직전 `false` 토글 여부 결정 |
| Track B — PR2.B funds UX | 🟡 코드 완성, **미커밋** | 13 modified + 5 untracked 커밋 → `/code-review` → staging 검증 → prod 배포 |
| Track C — 브랜딩 grep | 🟢 대체로 통과 | 비디오 파일명 잔재(`baram-new-ui-video-*`) 외부 노출 여부 한 번 더 점검 |
| Track D — kill-switch + 모니터링 | 🟡 runbook 작성됨, alert 미설정 | Telegram alert 채널 + Grafana dashboard |
| Track E — 온보딩/ToS | 🟢 ToS 페이지 머지됨 | First-run 가이드 모달, capability revoke UI 노출 검증 |
| **최종 스위치** `VITE_NASUN_AI_ENABLED` | ❌ `false` | Track B 머지 후 `true` → 빌드 → `/env-verify nasun-website` → `pnpm deploy:nasun-website:prod` |

`🟢` = 완료 / `🟡` = 부분 완료 또는 검증 대기 / `❌` = 미착수 또는 차단

---

## 트랙별 상세

### Track A — Trader env injection (PR2.A.1)

**목적**: chat-server agent-orchestrator가 spawn하는 nasun-ai-agent 프로세스에 글로벌 trader env(`AGENT_GLOBAL_*`) + per-agent env(CAPABILITY/WALLET/BUDGET/ESCROW/STRATEGY)를 주입.

| 검증 항목 | 상태 | 비고 |
|---|---|---|
| 코드 prod 배포 | ✅ | `~/nasun-chat-server/dist/agent-orchestrator.js`에 `globalTraderEnv` / `perAgentTraderEnv` / `spawnAgentPm2` / `AGENT_GLOBAL_PR1A_SWAP_DISABLED` 심볼 존재. 커밋 `46107a51` 포함 |
| `AGENT_GLOBAL_*` 9개 env 키 | ✅ | PACKAGE_ID, REGISTRY_ID, AER_PACKAGE_ID, API_KEY, EXECUTOR_ADDRESS, HOST_URL, COIN_NBTC_TYPE, COIN_NUSDC_TYPE, PR1A_SWAP_DISABLED |
| 알파 HOLD-only 모드 | ✅ | `AGENT_GLOBAL_PR1A_SWAP_DISABLED=true` (2026-05-17 본 세션에서 토글). 백업 `~/nasun-chat-server/.env.bak.20260517_033542` |
| pm2 chat-server 재기동 패턴 검증 | ✅ | delete + start 패턴 사용 ([feedback_pm2_hard_restart_for_new_env](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pm2_hard_restart_for_new_env.md)). pm2_env에 키 로드 확인 |
| Dogfood E2E 1사이클 | 🟡 | prod에 `nasun-ai-agent-94d10ee5` spawned 흔적 있음(`pm2_env.AGENT_GLOBAL_PR1A_SWAP_DISABLED=false`로 임시 flip 후 spawn한 정황). AER digest 결과 기록 필요 |

**다음 액션**: dogfood agent의 AER landing digest + 첫 cycle 로그를 capture해서 본 §결과에 append. 그 후 Track A close.

---

### Phase E — Prod Lambda cutover (PR1.5)

**목적**: `baram-executor` Lambda를 AER v4 + multi-provider chain 코드로 cutover. 알파 trader가 swap을 보내면 받을 곳.

| 검증 항목 | 상태 | 비고 |
|---|---|---|
| `baram-executor` LastModified | ✅ | 2026-05-17 06:22 UTC |
| `AER_PACKAGE_ID` | ✅ | `0xe685a7431719cece7b60e44d827d9001105b5d68c002242d0f4ce49924e2f7e0` (v4) |
| `LAMBDA_SWAP_DISABLED` | ✅ | `true` (알파 게이트, 알파 오픈 시점에 결정) |
| Negative test (kill-switch flip) | ✅ | Phase D dev에서 검증 ([2026-05-17-p2-phase-d-negative-test.md](../.claude/handoffs/2026-05-17-p2-phase-d-negative-test.md)) |

**다음 액션**: 알파 trading 오픈 직전 `LAMBDA_SWAP_DISABLED=true → false` 토글 여부 + per-agent allowlist 운영 패턴 결정. **REPLACE-not-MERGE** ([feedback_lambda_env_replace_not_merge](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_lambda_env_replace_not_merge.md)) 필수.

---

### Track B — Agent Funds UX 개편 (PR2.B)

**목적**: Budget(추론료) vs Agent Wallet(매매자본) 라벨 혼동 + 자본 송금 UI 부재 + funds 한눈 조회 부재 해결. ([project_nasun_ai_agent_funds_ux_revamp](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/project_nasun_ai_agent_funds_ux_revamp.md))

| 작업 | 상태 | 위치 |
|---|---|---|
| `AgentFundsCard.tsx` 신규 | 🟡 working tree | [apps/nasun-website/frontend/src/sections/uju/ai/components/funds/AgentFundsCard.tsx](../apps/nasun-website/frontend/src/sections/uju/ai/components/funds/AgentFundsCard.tsx) |
| `TransferAgentFundsDialog.tsx` 신규 | 🟡 working tree | 같은 디렉토리 |
| `useAgentWalletBalances.ts` hook | 🟡 working tree | `sections/uju/ai/hooks/` |
| `agentWithdrawTx.ts`, `txErrors.ts` 서비스 | 🟡 working tree | `sections/uju/ai/services/` |
| "Budget" → "Inference Balance" rename | 🟡 working tree | `BudgetSettingsModal`, `CreateBudgetModal`, `QuickstartView`, `OverviewTab`, `TraderConfigForm` 등 다수 |
| Capital separation 카피 | 🟡 부분 | "Your agent pays AI executors from an Inference Balance" 등 일부 적용 |
| 스테이징 검증 | ❌ | 미진행 |
| Prod 배포 | ❌ | 미진행 |

**현재 working tree 상태** (`git status apps/nasun-website/`): 22개 modified + 5개 untracked. 미커밋.

**다음 액션**:
1. `/code-review` (보안 + 코드 품질)
2. Conventional commit으로 분할 커밋 (Funds 카드 / Deposit dialog / Inference Balance rename 등)
3. `pnpm deploy:nasun-website:staging` → 스테이징 검증
4. `pnpm deploy:nasun-website:prod` (raw rsync 금지, [feedback_no_raw_rsync_to_prod](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_no_raw_rsync_to_prod.md))

⚠️ `pnpm deploy:pado:prod`는 사용자 전담이지만 nasun-website는 AI 실행 가능 ([feedback_pado_prod_website_deploy_user_only](../.claude/projects/-home-naru-my-apps-nasun-monorepo/memory/feedback_pado_prod_website_deploy_user_only.md)).

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
| AER heartbeat watchdog | ✅ | nasun-ai-runtime에 구현, Telegram fallback (커밋 `de457a71`) |
| Grafana dashboard (AER landing rate, swap fail, gas, lock leak) | ❌ | 미설정 |
| Telegram alert 채널 (capability revoke / killswitch flip / large PnL drift) | ❌ | 미설정 (heartbeat alert만 존재) |

**다음 액션**: 알파 오픈 전 최소 1개 alert 채널 활성 + 운영자 phone-on-call 절차 합의.

---

### Track E — 온보딩 UX

| 항목 | 상태 | 위치 |
|---|---|---|
| ToS / Privacy Policy 페이지 | ✅ | [apps/nasun-website/frontend/src/pages/TermsOfUsePage.tsx](../apps/nasun-website/frontend/src/pages/TermsOfUsePage.tsx) (커밋 `50c348ac` GDPR/OFAC 강화) |
| First-run 가이드 모달 ("Agent 만들기 → 자본 보내기 → 첫 trade") | ❌ | Track B와 연동 권장 |
| 에러 메시지 영어 일관성 | 🟡 | 미감사 |
| Capability revoke / agent stop UI 노출 명확화 | 🟡 | 현재 위치 검증 필요 |
| 자금 손실 가능성 + TEE 미적용 동의 게이트 | 🟡 | ToS 본문에는 포함, 활성화 시 체크박스 게이트 부재 |

**다음 액션**: ToS 동의 게이트(activate 직전 체크박스) + first-run 모달 한 세션.

---

## 최종 스위치: AI 탭 노출

알파 출시는 결국 한 줄 변경 + 한 번 배포로 끝난다. 위 5종 모두 🟢이 된 후에만 실행.

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
