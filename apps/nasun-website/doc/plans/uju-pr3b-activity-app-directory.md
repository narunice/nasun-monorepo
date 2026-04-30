# PR3b Handoff: Activity 탭 App Directory + Nasun Devnet + 7-max + Featured Preview

**전제**: PR3a (gostop 5게임 카테고리 분리 + matview v4 marker)가 머지/배포 완료. 24h(또는 12h) 안정화 검증 후 진행. backend 변경 0, frontend-only 변경.

원본 plan: `~/.claude/plans/pr2-stateful-avalanche.md` (PR3 v2 plan, PR3b 섹션).

---

## 작업 범위

mock-up 기준 dashboard와 Activity 탭 재구성:

1. **App Directory를 dashboard에서 Activity 탭으로 이동**:
   - dashboard `ActivatedAppsSection`에서 "Browse App Directory"/"Manage Apps" 버튼 + 모달 mount 제거
   - dashboard에는 read-only "Activated Apps" 섹션만 (이미 활성화된 앱 표시)
   - Activity 탭에 신규 `UjuAppDirectoryCard` (inline list, 모달 X)
   - footer "Manage in App Directory →" 링크

2. **BASE_MISSIONS 폐기 + Nasun Devnet 신설**:
   - 기존 BASE_MISSIONS (`faucet`/`wallet-transfer`/`chat`)는 항상 표시였음
   - **`chat` mission UI 완전 제거** (backend 적립 + ecosystem score 기여는 유지)
   - **`faucet`/`wallet-transfer`는 신규 `nasun-devnet` 앱 산하 missions으로 이동** (사용자가 명시 activate해야 dashboard 표시)

3. **Jupiter/Cetus/Uniswap directory entry 제거**: visit 0pt missions 풀에서 제외.

4. **Governance daily mission 제거**:
   - uju의 `UjuDailyMissionsCard`에서 `useGovernanceMission`/`makeGovernanceMission` 호출 삭제
   - `myAccount/DailyMissionsCard.tsx`의 useGovernanceMission은 **보존** (별개 surface)
   - backend `scanner/daily-mission.ts`의 MISSION_MAP `governance` entry는 protocol-level vote 적립용으로 **유지** (UI와 무관)

5. **사용자 max 7 mission 제약**: useAppDirectory hook에서 silent reject + counter "Y/7" 표시.

6. **localStorage v3 key migration**: 기존 `uju:app-directory:{id}` (v2) → 신규 `uju:app-directory:v3:{id}`. v2 키는 read-only migration. **race 처리**: v3 first write 시 v2 키 즉시 삭제 (구버전 탭이 stale 보지 않게).

7. **Stale missionId parser drop**: `chat`/`pado-games`/`pado-lottery`/`pado-scratchcard`/`jupiter-swap`/`cetus-trade`/`uniswap-swap`/`governance-vote` 자동 제거. one-time toast: "기존 미션이 정리되었습니다. Activity 탭에서 다시 선택해주세요."

8. **Featured Mission preview**: dashboard grid에 별도 sibling 카드 `UjuFeaturedMissionPreview`. (Coming Soon) 뱃지. presentational only.

9. **AppDirectoryModal.tsx 삭제**: dashboard 모달 mount 제거 후 단일 파일 삭제 (단일 importer 확인됨: `dashboard/ActivatedAppsSection.tsx:6`).

---

## Mission Catalog (PR3b 최종)

| 앱                      | Mission ID           | Label              | Backend Category     | Points |
| ----------------------- | -------------------- | ------------------ | -------------------- | ------ |
| **nasun-devnet** (신규) | `faucet`             | Claim Tokens       | `faucet`             | +1     |
|                         | `wallet-transfer`    | Send Tokens        | `wallet-transfer`    | +1     |
| **pado**                | `pado-dex`           | Spot Trade         | `pado-dex`           | +2     |
| **gostop**              | `gostop-crash`       | Play Crash         | `gostop-crash`       | +1     |
|                         | `gostop-mines`       | Play Mines         | `gostop-mines`       | +1     |
|                         | `gostop-lottery`     | Buy Lottery Ticket | `gostop-lottery`     | +1     |
|                         | `gostop-numbermatch` | Play Number Match  | `gostop-numbermatch` | +1     |
|                         | `gostop-scratchcard` | Play Scratch Card  | `gostop-scratchcard` | +1     |

**총 8 missions, max 7 선택**.

**제거**: `chat`, `governance-vote`, `jupiter-swap`, `cetus-trade`, `uniswap-swap`.

---

## 변경 사이트

### Frontend

| 파일                                                                                                                                 | 변경                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [missions/missionRegistry.ts](apps/nasun-website/frontend/src/sections/uju/missions/missionRegistry.ts)                              | (1) `BASE_MISSIONS` export 제거. (2) `makeGovernanceMission` 함수 제거. (3) `APP_MISSION_MAP.jupiter`/`cetus`/`uniswap` 제거. (4) 신규 `APP_MISSION_MAP['nasun-devnet']` (faucet, wallet-transfer 2 missions). (5) `APP_BADGE_STYLE`에 `nasun-devnet` 추가, jupiter/cetus/uniswap 제거. (6) `MAX_DAILY_MISSIONS = 7` 신규 export                                                                                                                                           |
| [apps/appRegistry.ts](apps/nasun-website/frontend/src/sections/uju/apps/appRegistry.ts)                                              | 신규 `nasun-devnet` entry (`isNative: true`, `chain: 'nasun'`, `category: 'utility'` 또는 'staking'). jupiter/cetus/uniswap entry 제거. CHAIN_BADGE_CLASS 갱신                                                                                                                                                                                                                                                                                                             |
| [hooks/useDailyMissions.ts](apps/nasun-website/frontend/src/hooks/useDailyMissions.ts)                                               | `MissionId`에서 `chat` 제거. `ALL_MISSION_IDS` 갱신. chat detection 블록 (explorer-api fetch) 제거                                                                                                                                                                                                                                                                                                                                                                         |
| [apps/useAppDirectory.ts](apps/nasun-website/frontend/src/sections/uju/apps/useAppDirectory.ts)                                      | (1) **localStorage key v3**: 기존 `uju:app-directory:{id}` (v2) → 신규 `uju:app-directory:v3:{id}`. v3 first write 시 v2 키 삭제 (race 격리). (2) `parseDirectoryState` stale id drop list: `chat`/`pado-games`/`pado-lottery`/`pado-scratchcard`/`jupiter-swap`/`cetus-trade`/`uniswap-swap`/`governance-vote`. (3) `toggleMission`/`setMissions` 7-max enforcement (silent reject). (4) `MAX_DAILY_MISSIONS` re-export. (5) one-time migration toast (localStorage flag) |
| [apps/AppDirectoryModal.tsx](apps/nasun-website/frontend/src/sections/uju/apps/AppDirectoryModal.tsx)                                | **삭제**. dashboard에서 모달 호출 없음                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 신규 [activity/cards/UjuAppDirectoryCard.tsx](apps/nasun-website/frontend/src/sections/uju/activity/cards/UjuAppDirectoryCard.tsx)   | inline list 카드. APP_REGISTRY iterate + 각 앱 row (앱 헤더 + Activate 토글 + mission checkbox 인라인). 7-max counter "Y/7 missions selected" footer. AppDirectoryRow 추출 안 함 (카드 내부 inline)                                                                                                                                                                                                                                                                        |
| [activity/ActivityTab.tsx](apps/nasun-website/frontend/src/sections/uju/activity/ActivityTab.tsx)                                    | UjuAppDirectoryCard mount (Governance와 Assets 사이)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [dashboard/ActivatedAppsSection.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/ActivatedAppsSection.tsx)                | "Browse App Directory"/"Manage Apps" 버튼 + AppDirectoryModal mount + import 제거. footer "Manage in App Directory →" 링크                                                                                                                                                                                                                                                                                                                                                 |
| [dashboard/UjuDailyMissionsCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/UjuDailyMissionsCard.tsx)                | `useGovernanceMission`/`makeGovernanceMission` import + 호출 제거. `BASE_MISSIONS` 의존 제거. empty state CTA "Activate apps in Activity tab →"                                                                                                                                                                                                                                                                                                                            |
| 신규 [dashboard/UjuFeaturedMissionPreview.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/UjuFeaturedMissionPreview.tsx) | 별도 sibling 카드. "Featured Mission for Bonus Points" + (Coming Soon) 뱃지                                                                                                                                                                                                                                                                                                                                                                                                |
| [pages/uju/UjuPage.tsx](apps/nasun-website/frontend/src/pages/uju/UjuPage.tsx)                                                       | DashboardTab에 UjuFeaturedMissionPreview 추가                                                                                                                                                                                                                                                                                                                                                                                                                              |

### Tests

| 파일                                                         | 변경                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `missions/__tests__/missionRegistry.test.ts`                 | BASE_MISSIONS/governance/chat/jupiter/cetus/uniswap 케이스 제거. nasun-devnet 2 missions, MAX_DAILY_MISSIONS=7 검증. APP_BADGE_STYLE.nasun-devnet 검증 |
| `hooks/__tests__/useDailyMissions.test.ts`                   | chat fetch 테스트 제거                                                                                                                                 |
| `dashboard/__tests__/UjuDailyMissionsCard.test.tsx`          | governance/chat assertion 제거. fresh user 빈 mission pool 검증. empty state CTA 표시                                                                  |
| 신규 `apps/__tests__/useAppDirectory.test.ts`                | (1) v3 key migration (v2 → v3 read-only + v3 write 시 v2 삭제), (2) parser drop stale ids, (3) 7-max cap (8th silent reject), (4) one-time toast flag  |
| 신규 `activity/cards/__tests__/UjuAppDirectoryCard.test.tsx` | inline row render, activate/deactivate, mission toggle, 7-max counter, jupiter/cetus/uniswap directory에서 사라짐                                      |

---

## Cutover (PR3b)

frontend-only. backend 변경 0.

| Step | 작업                                                                          | 검증                                                                         |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- |
| 0    | `git status` 클린, `pnpm tsc --noEmit` 0건, `pnpm test` 우리 변경 영향 0 fail | —                                                                            |
| 1    | Frontend prod 빌드                                                            | bundle에 `nasun-devnet`/`UjuAppDirectoryCard`/`MAX_DAILY_MISSIONS` 포함 검증 |
| 2    | rsync to prod                                                                 | `curl https://nasun.io/?ts=$(date +%s)                                       | grep nasun-devnet` 확인 |
| 3    | 사용자 시나리오 검증                                                          | 아래 동적 검증                                                               |

**Race**: 두 탭 (구 v2 + 신 v3) 동시 사용 시 v3 write가 v2 키 삭제로 격리. 데이터 충돌 0.

---

## 동적 검증 (사용자 시나리오)

- **Activity 탭 진입**: 새 "Apps, Services, and AI Directory" 섹션 노출. APP_REGISTRY 모든 앱 (nasun-devnet/pado/baram/gostop/spectra) 표시. **jupiter/cetus/uniswap directory에 없음**.
- **Nasun Devnet activate**: Activity 탭에서 nasun-devnet Activate → faucet/wallet-transfer 미션 dashboard 표시.
- **GoStop 5 missions individual select**: gostop activate 후 5개 미션 중 일부만 선택 가능. 각 daily 1pt.
- **5게임 모두 같은 날** → 5pt 적립 (cap 분리, PR3a에서 검증).
- **7-max**: 7개 mission 선택 후 8번째 시도 → silent reject (checkbox unchecked 유지) + counter "7/7" 표시.
- **stale state migration**: 기존 `pado-games`/`chat`/`jupiter-swap` 선택했던 사용자 첫 로그인 → parser drop + one-time toast.
- **Dashboard**: nasun-devnet 미활성 신규 사용자 → daily missions 0개 + empty state CTA "Activate apps in Activity tab →" 표시. UjuFeaturedMissionPreview 카드 별도 표시.
- **chat 적립 유지**: 채팅 → ecosystem score +1pt (frontend mission UI에는 chat 없음. leaderboard에 점수만 보임).
- **DEX trade**: pado-dex +2pt 정상.

---

## Risks / Notes

- **chat hidden contributor UX**: ecosystem score 기여는 유지하지만 daily mission UI에 안 보임. 사용자 leaderboard에서 의문 가능. PR3b 후 별도 PR로 leaderboard breakdown tooltip 검토.
- **devnet 5pt cap mainnet 영향**: PR3a Risks 섹션 그대로. 누적 score는 mainnet 마이그레이션 시 reset/scaling 결정 필요.
- **Empty state onboarding**: 신규 사용자 nasun-devnet 미활성 시 dashboard 0 missions. CTA만으로 부족하면 dismissible callout 또는 onboarding wizard 별도 PR.
- **AppDirectoryRow 추출 폐기**: UjuAppDirectoryCard 내부 inline 50줄 중복 수용. third consumer 등장 시 추출 검토.

---

## 새 세션 시작 시 입력할 프롬프트

```
PR3b 시작합니다. 핸드오프 문서:
apps/nasun-website/doc/plans/uju-pr3b-activity-app-directory.md

이 문서를 읽고 plan mode로 진입하여 v1 plan을 작성해주세요.
PR3a (gostop 카테고리 분리 + matview v4 marker)는 머지/배포 완료,
24h(또는 12h) 안정화 검증 완료 상태. PR3b는 frontend-only 변경
(BASE_MISSIONS 폐기, Nasun Devnet 신설, Activity 탭 App Directory 이동,
7-max, featured preview, jupiter/cetus/uniswap directory entry 제거,
chat UI 제거, governance UI 제거, useGovernanceMission myAccount 보존,
MISSION_MAP backend governance entry 보존).

localStorage v3 key migration 포함 — race 격리 위해 v3 first write 시
v2 키 삭제 디테일 명시 필수.
```

---

## Implementation 시작 시 즉시 확인할 것

1. `grep -rn "useGovernanceMission\|makeGovernanceMission\|BASE_MISSIONS\|AppDirectoryModal" apps/nasun-website/frontend/src/` → 사용처 모두 식별. myAccount/DailyMissionsCard.tsx의 useGovernanceMission만 보존.
2. PR3a 안정화 메트릭 확인:
   - `[Points] Unmatched event` 0건
   - 5 신규 카테고리 일별 적립 wallets ≥ baseline 80%
   - matview v4 marker (또는 v3 + warning. v3에서도 forward-only 정상 동작)
   - top 100 leaderboard rank shift < 5%
3. `apps/nasun-website/frontend/src/sections/uju/apps/useAppDirectory.ts` 현재 localStorage key prefix 확인 (`uju:app-directory:` v2 implicit).
4. `apps/nasun-website/frontend/src/sections/uju/activity/ActivityTab.tsx` 현재 mount된 카드 순서 확인 → UjuAppDirectoryCard 삽입 위치 결정.
