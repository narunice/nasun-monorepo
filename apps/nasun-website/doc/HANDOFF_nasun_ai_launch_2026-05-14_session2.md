# Handoff: Nasun AI 퍼블릭 런칭 — 세션 2 진입

> 작성일: 2026-05-14
> 직전 세션: 세션 1 (P0-1 Danger Zone + P1-4 카피 cleanup)
> 다음 세션 목표: **P1-1 Plan E2 — 3탭 IA 재편 (Overview / Activity / Settings)**

원본 마스터 핸드오프: [HANDOFF_nasun_ai_launch_2026-05-14.md](HANDOFF_nasun_ai_launch_2026-05-14.md)

---

## 1. 세션 1 산출물

### 완료

**P0-1 Danger Zone UI** — `useCapability` 4 mutation은 이미 wired였지만 호출 UI가 0건이었던 누락 closed.

- [useAgentProfiles.ts](../frontend/src/sections/uju/ai/hooks/useAgentProfiles.ts)
  - `AgentProfile`에 `capabilityId: string | null` 필드 추가
  - `parseOptionId` 헬퍼로 Move `Option<ID>` 파싱 (`{vec:[id]}` / `{vec:[]}` / 직접 string 모두 대응)

- [DashboardTab.tsx](../frontend/src/sections/uju/ai/pages/agent/DashboardTab.tsx) — DangerZoneCard 신설
  - **Wake mode 4-way radio**: mode 0 (Active), mode 1 (Reserved Plan E2, disabled), mode 2 (Pause all wakes), mode 3 (Reserved Plan E2, disabled). 현재 pauseMode highlight + signing 표시.
  - **Revoke**: 2-step confirm ("Revoke capability" → "Yes, revoke permanently" / "Cancel"). revoked=true 시 배지 + 액션 차단.
  - **Capability summary**: pauseMode / version / maxNotional / maxDailyLoss stat + allowed_actions 칩.
  - `capabilityId === null` (legacy agent) 분기 헬퍼 카드.
  - 토글 라벨 "Deactivate / Reactivate" → "Pause agent / Activate agent" (off-chain agent_profile 토글, capability pause와 별개).

**P1-4 카피 cleanup**
- "Trader Bot" / "the bot" (AI agent 의미) — uju/ai 트리에서 0건 (이미 정리됨).
- LinkTelegramModal "the bot will confirm" — Telegram 플랫폼 용어라 유지 (Telegram bot은 실제 Telegram 서비스 명칭).
- EscrowTab 헤더 "Escrow Budgets" → P1-1 (Settings 섹션화) 조건부라 세션 2에서 처리.

### 검증
- `pnpm -F @nasun/nasun-website build --mode staging` → TS 에러 0, 43.44s 통과.
- nasun-ai-runtime 영향 없음 (frontend-only 변경).

### 미수행 (세션 1 범위 밖)
- **P0-2 devnet manual e2e 9 시나리오** — 신규 지갑·트랜잭션·외부인 관찰 필요. 핸드오프 §3 권장 순서대로 세션 3 후반에 묶음 실행.

---

## 2. 세션 2 작업 — P1-1 Plan E2 3탭 IA 재편

### 기준 문서
[doc/nasun-ai-ux-redesign-2026-05-14.md §2](nasun-ai-ux-redesign-2026-05-14.md)

### 변경 요약

**현 5탭** → **신 3탭**

| 신 탭 | 구성 |
|---|---|
| **Overview** | Dashboard stats (상단 요약 카드) + Recent activity preview (최근 5건) + Chat input + Pause/Revoke 빠른 진입 |
| **Activity** | 현재 ActivityTab 그대로 (glyph row + drawer + filter) |
| **Settings** | Capability config (Allowed actions/assets/targets — Phase 2 readonly OK) + Strategy preset (TraderConfigForm 이동) + Risk limits + Telegram sessions + Escrow 섹션 + Danger zone |

### 변경 파일

| 파일 | 변경 |
|---|---|
| [AgentDetail.tsx](../frontend/src/sections/uju/ai/pages/AgentDetail.tsx) | 탭 정의 재구성 (5 → 3) |
| `pages/agent/OverviewTab.tsx` | 신규 — DashboardTab 상단 stats + ActivityTab 첫 5건 wrap + ChatTab input wrap |
| `pages/agent/SettingsTab.tsx` | 신규 — TraderConfigForm + EscrowTab + SessionsTab + DangerZoneCard wrap |
| `pages/agent/DashboardTab.tsx` | DangerZoneCard 컴포넌트는 분리해 재사용 (export). 본 파일은 deprecated 또는 OverviewTab 내부 부품으로 흡수. |
| `pages/agent/EscrowTab.tsx` | "Escrow Budgets" → "Budget" 헤더 변경 (P1-4 deferred 항목) |

### 권장 접근 (리팩터보다 wrap)

1. **DangerZoneCard 분리**: 현재 DashboardTab 내부 `DangerZoneCard` 컴포넌트를 별도 파일(`pages/agent/components/DangerZoneCard.tsx` 또는 `components/DangerZoneCard.tsx`)로 추출해 Settings에서도 재사용.
2. **OverviewTab 신규**: stats grid + ActivityTab `<limit=5>` 모드 + Chat input 컴포넌트 임포트.
3. **SettingsTab 신규**: 기존 4개 탭 컴포넌트(`TraderConfigForm` / `EscrowTab` / `SessionsTab` / `DangerZoneCard`)를 섹션으로 stack. 각 섹션은 collapsible accordion보다 평면 스택 권장 (사용자 첫 노출에서 인지 부담 적음).
4. **AgentDetail 탭 정의 갱신**: TabItem 5개 → 3개. 라우팅 쿼리/state 유지 (이전 `?tab=dashboard` 진입자 fallback → Overview).
5. **삭제 금지**: DashboardTab / ChatTab / EscrowTab / SessionsTab 컴포넌트는 wrap된 후 직접 사용 안 되지만, 일단 한 세션 동안 보존 (P0-2 e2e 후 dead code로 확정되면 제거).

### LOC / 추정
~400 LOC (대부분 이동/wrap), 1 세션.

### 검증 체크리스트
- [ ] `pnpm -F @nasun/nasun-website typecheck` 통과
- [ ] `pnpm -F @nasun/nasun-website build --mode staging` 통과
- [ ] 신규 지갑이 없어도 mock data로 3탭 모두 렌더 확인
- [ ] Quickstart에서 detail 진입 시 default tab = Overview
- [ ] 이전 URL `?tab=chat / ?tab=escrow / ?tab=sessions / ?tab=dashboard` 진입 시 안전 fallback

---

## 3. 절대 잊지 말아야 할 제약

루트 [CLAUDE.md](../../../CLAUDE.md) + 메모리 위반 빈번 항목 (마스터 핸드오프 §4 그대로):

- "Baram" / "Sui" / "bot"(AI agent 의미) 외부 노출 금지
- em dash (—) 사용 금지
- emoji 금지
- chat-server는 prod 1대만 (staging도 prod 공유)
- prod 프론트엔드 raw rsync 금지 → `pnpm deploy:nasun-website:prod`
- staging 검증 후 prod, 사용자 명시적 승인 필수
- pm2 새 env 도입 시 startOrRestart, kill 후 재시작 금지
- TEE 없이 출시 (v1)
- Move 모듈명 `baram::*` invariant (onchain 식별자 유지)
- devnet 한정
- AWS 신규 리소스 생성 금지

---

## 4. 세션 2 → 세션 3+ 진행 순서

```
세션 2 (지금): P1-1 Plan E2 3탭 IA 재편
세션 3:        P1-2 Quickstart breadcrumb + P0-2 devnet e2e
세션 4:        P0-3 production 배포 3종 + P0-4 env 동기화 → 외부 출시
이후:          P1-3 인덱서 envelope (backend) → P2 → P3
```

---

## 5. 주요 식별자 (변경 없음)

| 항목 | 값 |
|---|---|
| baram_agent packageId (v0.2) | `0x6e53972d4ebd922fed13cbe302be295e9d6fc000cc948992a9f87d708b954b5e` |
| baram_aer packageId | `0x646b4d020f4c0b7bd88e02b8f4c117ebd78ca617e5c510303bbe468df66ec9b5` |
| capabilityRegistry | `0x893a15ed9d53375fc8690a6e5cfacc11a77e78988785cd265f81d49cb3699905` |
| agentProfileRegistry | `0x6ae144160e2266177268a166e08cd3ff35a7f2a31e8ab404687dacaa2581f000` |
| Production env flag | `VITE_NASUN_AI_ENABLED=false` (세션 4에서 전환) |
| Staging env flag | `VITE_NASUN_AI_ENABLED=true` |
