# 작업 지시서 (Gemini 용): uju Activity/Profile 탭을 my-account 의존성에서 분리

## 배경

uju 대시보드(`/uju`)는 자체 디자인 시스템(UjuCard, UjuSectionHeader, uju-* 컬러 토큰, 청록/teal/lime/blue 액센트)을 가지고 있다. 그러나 Activity/Profile 탭은 현재 `@/sections/myAccount/*`의 카드 컴포넌트들을 그대로 임포트해서 쓰고 있어, my-account 페이지 전용 chrome(OuterBox, StatCard, `nasun-c*` 색상, `rounded-sm` 모서리)이 그대로 노출된다. 시각적 일관성이 깨진다.

## 목표

`apps/nasun-website/frontend/src/sections/uju/` 안에 uju-native 카드 컴포넌트를 새로 만들고, `ActivityTab.tsx`와 `ProfileTab.tsx`가 `@/sections/myAccount/*`를 더 이상 import하지 않게 한다.

**단 1줄도 my-account에서 import하지 않는 상태가 완성 조건이다.**

## 범위

### Activity 탭 (6개 카드)

| 기존 | 새 위치 | 라인 수 (참고) |
|---|---|---|
| `@/sections/myAccount/EcosystemPointsCard` | `sections/uju/activity/cards/UjuEcosystemPointsCard.tsx` | 627 |
| `@/sections/myAccount/RankHistoryCard` | `sections/uju/activity/cards/UjuRankHistoryCard.tsx` | 264 |
| `@/sections/myAccount/CreatorPostsCard` | `sections/uju/activity/cards/UjuCreatorPostsCard.tsx` | 255 |
| `@/sections/myAccount/GovernanceCard` | `sections/uju/activity/cards/UjuGovernanceCard.tsx` | 101 |
| `@/sections/myAccount/AssetsCard` | `sections/uju/activity/cards/UjuAssetsCard.tsx` | 151 |
| `@/sections/myAccount/BugReportsCard` | `sections/uju/activity/cards/UjuBugReportsCard.tsx` | 238 |

### Profile 탭 (2개 카드)

| 기존 | 새 위치 |
|---|---|
| `@/sections/myAccount/ConnectedAccountsCard` | `sections/uju/profile/cards/UjuConnectedAccountsCard.tsx` |
| `@/sections/myAccount/DangerZoneCard` | `sections/uju/profile/cards/UjuDangerZoneCard.tsx` |

`NotificationsPanel`은 이미 `sections/uju/profile/`에 있어 그대로 사용.

## 구현 규칙

### 1. 재사용 가능한 것 vs 재구현해야 할 것

**재사용 OK** (그대로 import해서 hook/data만 가져다 쓴다):
- `@/features/auth` (useAuth)
- `@/features/leaderboard-v3/hooks` (useRankHistory, useActiveSeason, useSeasons)
- `@/features/leaderboard-v3/components/RankHistoryChartV3`
- `@/features/bug-report/*` (types + 데이터 fetching)
- `@/features/governance/hooks/*` (useVoteHistory, useVotingPower)
- `@/features/wallet` (useMultiChainNFTs)
- `@/features/admin/hooks/useNftCollections` (useEnabledNftCollections)
- `@/hooks/useEcosystemScore`, `@/hooks/useSnapshotHistory`, `@/hooks/useNftDrop`, `@/hooks/useGenesisPassOwnership`, `@/hooks/useAllianceMintStatus`
- `@/store/userStore`
- `@/utils/getTwitterHandle`
- `@nasun/wallet`, `@nasun/wallet-ui`
- `@/constants/nft-drop`, `@/constants/alliance`
- React Query, react-router-dom, react-i18next 그대로 OK

**재구현 필요** (chrome / 시각 요소 — uju-native로 대체):
- `@/components/ui/OuterBox` → `UjuCard` ([sections/uju/shared/UjuCard.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuCard.tsx))로 대체
- `@/components/ui/StatCard` → `UjuStat` ([sections/uju/shared/UjuStat.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuStat.tsx))로 대체
- `@/components/ui/Spinner` → 그대로 사용 가능 (chrome 아님)
- `@/components/ui/button`의 `Button` → `UjuButton` ([sections/uju/shared/UjuButton.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuButton.tsx))로 대체. variant 매핑은 직관적으로 가까운 것 사용.
- `nasun-c1` ~ `nasun-c6`, `nasun-white`, `nasun-coral`, `pado-violet`, `pado-lavender`, `pado-3 (cyan)` 색상 토큰 → `uju-bg`, `uju-card`, `uju-border`, `uju-primary`, `uju-secondary`, `pado-1 (deep teal)`, `pado-2 (teal)`, `pado-4 (mint)`, `pado-5 (lime)`, `blue-300/400/500` 등으로 매핑.
- `rounded-sm`, `rounded-md` chrome → `rounded-2xl` (UjuCard 표준), 내부 보조 박스는 `rounded-xl` 사용
- `@/sections/myAccount/components/*` 의존 (예: `ScoreUnavailableFallback`, `FeaturedNftSection`, `OwnedObjects`, `NasunVoteNfts` 등) → 필요한 것만 `sections/uju/activity/internal/`에 uju-native로 옮겨 만든다. 데이터는 동일 hook 재사용.

### 2. 색상/스타일 정책 (uju-native)

uju 디자인 토큰 (이미 정의됨, 변경 금지):

```
uju.bg        #0E1C24   페이지 배경
uju.card      #1B3742   카드 배경
uju.border    #4A7282   보더
uju.primary   #EEF6F8   주요 텍스트
uju.secondary #B0C8D2   보조 텍스트
```

액센트 컬러 분산 (cyan 단색 사용 금지, 다음 팔레트에서 골고루 사용):

- **deep teal**: `pado-1` (#1a8cbc)
- **teal**: `pado-2` (#3bb9d8) — 가장 자주 쓰는 primary 액센트
- **mint**: `pado-4` (#86f3b7) — success/visited/active 표시
- **lime**: `pado-5` (#d2f6a2) — 강조 / multiplier 등
- **blue**: `blue-300` ~ `blue-500` (Tailwind 기본)

피해야 할 것:
- `pado-3` (cyan #5ee1e4) 다용 → 이미 모니터 hue 고장난 듯 보인다는 피드백 받음. 정말 필요하면 1~2곳만.
- `pado-violet`, `pado-lavender` (보라) → 사용 금지
- `nasun-c*`, `pd*` → 사용 금지 (uju 컨텍스트)

### 3. 카드 chrome 표준 패턴

```tsx
import { UjuCard, UjuSectionHeader, UjuButton, UjuBadge } from "../../shared";

export function UjuXxxCard() {
  return (
    <UjuCard>
      <UjuSectionHeader
        accent
        title="Section Title"
        subtitle="One-line description"   // 옵션
        trailing={...}                    // 옵션 (필터, 토글 등)
      />
      {/* 콘텐츠 */}
    </UjuCard>
  );
}
```

큰 강조가 필요한 카드(예: EcosystemPoints의 "All-time total")는 `<UjuCard variant="accent">` 사용.

### 4. 데이터 fetching 변경 금지

각 카드의 비즈니스 로직(어떤 hook을 어떤 인자로 호출, 어떤 분기 처리, 어떤 에러 상태) 은 **있는 그대로 옮긴다**. 색상/박스/폰트 사이즈만 uju-native로 교체. 기능 회귀 0건이 목표.

### 5. 파일 구조

```
sections/uju/
├── activity/
│   ├── ActivityTab.tsx                  ← 신규 카드 import로 전환
│   └── cards/
│       ├── UjuEcosystemPointsCard.tsx
│       ├── UjuRankHistoryCard.tsx
│       ├── UjuCreatorPostsCard.tsx
│       ├── UjuGovernanceCard.tsx
│       ├── UjuAssetsCard.tsx
│       ├── UjuBugReportsCard.tsx
│       └── internal/                    ← myAccount에서 옮겨오는 보조 컴포넌트
│           ├── UjuFeaturedNftSection.tsx
│           ├── UjuOwnedObjects.tsx
│           └── ...
├── profile/
│   ├── ProfileTab.tsx                   ← 신규 카드 import로 전환
│   ├── NotificationsPanel.tsx           ← 변경 없음
│   └── cards/
│       ├── UjuConnectedAccountsCard.tsx
│       └── UjuDangerZoneCard.tsx
```

### 6. 검증 (작업 완료 후 반드시 수행)

1. `cd apps/nasun-website/frontend && npx tsc --noEmit` → 에러 0건
2. `pnpm --filter @nasun/nasun-website test` → 기존 테스트 깨짐 없음
3. 다음 grep이 **빈 결과**여야 한다 (uju가 my-account를 더 이상 임포트하지 않음):
   ```bash
   grep -rn "from\s*['\"]@/sections/myAccount" apps/nasun-website/frontend/src/sections/uju/
   grep -rn "from\s*['\"]@/components/ui/OuterBox" apps/nasun-website/frontend/src/sections/uju/
   grep -rn "from\s*['\"]@/components/ui/StatCard" apps/nasun-website/frontend/src/sections/uju/
   ```
4. dev 서버 (`pnpm dev:nasun-website`) 띄워서 `/dev/uju?tab=activity`, `/dev/uju?tab=profile` 시각 확인:
   - 모든 카드 모서리가 `rounded-2xl` (둥글둥글)
   - 모든 카드 배경이 `uju-card` 톤 (deep teal-navy `#1B3742`)
   - 보라/cyan 단색 없음, teal+mint+lime+blue 분산
   - 기능 회귀 없음 (랭크 차트 그려짐, 투표 기록 보임, NFT 목록 표시됨, bug report 제출 가능, 계정 연결/해제 동작, danger zone 동작)

### 7. ActivityTab/ProfileTab 최종 형태

import 경로만 바뀐다. 현재 `Section` 래퍼 패턴은 유지:

```tsx
// ActivityTab.tsx
import { UjuEcosystemPointsCard } from "./cards/UjuEcosystemPointsCard";
import { UjuRankHistoryCard } from "./cards/UjuRankHistoryCard";
// ... etc
import { UjuSectionHeader } from "../shared";

export function ActivityTab() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <Section title="Ecosystem Points" subtitle="...">
        <UjuEcosystemPointsCard />
      </Section>
      {/* ... */}
    </div>
  );
}
```

**중요**: 새 카드들이 자기 안에서 이미 `<UjuCard>`+`<UjuSectionHeader>`를 렌더하면, ActivityTab의 `<Section>` 래퍼와 중복 헤더가 생긴다. 둘 중 하나로 통일:
- (권장) 새 카드는 자체 헤더 없이 `<UjuCard>` 안의 콘텐츠만 렌더 → ActivityTab의 `<Section>`이 헤더 담당.
- 또는 새 카드가 자체 `<UjuCard><UjuSectionHeader>`를 렌더 → ActivityTab의 `<Section>` 래퍼는 제거하고 그냥 `<UjuXxxCard />`만 나열.

선택은 자유지만, 현재 Dashboard 패턴(예: `<TotalPointsCard>`는 자체 `<UjuCard>+<UjuSectionHeader>`를 렌더, 부모는 그냥 컴포넌트만 호출)과 일관되게 **카드가 자체 헤더 포함 → ActivityTab의 `<Section>` 래퍼 제거**가 더 깔끔하다.

## 우선순위 (토큰 절약 위해)

작은 카드부터 → 큰 카드 순으로 진행해 점진적 검증:

1. UjuGovernanceCard (101 lines)
2. UjuAssetsCard (151 lines)
3. UjuBugReportsCard (238 lines)
4. UjuDangerZoneCard (272 lines)
5. UjuCreatorPostsCard (255 lines)
6. UjuRankHistoryCard (264 lines)
7. UjuConnectedAccountsCard (443 lines)
8. UjuEcosystemPointsCard (627 lines) — 가장 마지막. fallback 컴포넌트(`ScoreUnavailableFallback`)도 같이 옮겨야 함.

각 카드 작업 후 tsc 통과 확인하고 다음으로 진행.

## 참고 파일 (uju 디자인 시스템)

- [sections/uju/shared/UjuCard.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuCard.tsx)
- [sections/uju/shared/UjuSectionHeader.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuSectionHeader.tsx)
- [sections/uju/shared/UjuButton.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuButton.tsx)
- [sections/uju/shared/UjuBadge.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuBadge.tsx)
- [sections/uju/shared/UjuStat.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuStat.tsx)
- [sections/uju/shared/UjuAccentBar.tsx](apps/nasun-website/frontend/src/sections/uju/shared/UjuAccentBar.tsx)
- [sections/uju/dashboard/TotalPointsCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/TotalPointsCard.tsx) — 가장 좋은 카드 패턴 참고 예시 (UjuCard variant="accent" + UjuSectionHeader trailing + 그라데이션 큰 숫자 + 보조 stat 그리드)
- [sections/uju/dashboard/UjuDailyMissionsCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/UjuDailyMissionsCard.tsx) — list/progress UI 패턴 참고
- [sections/uju/dashboard/StakingCard.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/StakingCard.tsx) — row + trailing CTA 패턴 참고
- [packages/tailwind-config/colors.js](packages/tailwind-config/colors.js) — uju + pado 컬러 토큰 정의

## my-account 카드 원본 (참고용, 옮기는 대상)

- [sections/myAccount/EcosystemPointsCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/EcosystemPointsCard.tsx)
- [sections/myAccount/RankHistoryCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/RankHistoryCard.tsx)
- [sections/myAccount/CreatorPostsCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/CreatorPostsCard.tsx)
- [sections/myAccount/GovernanceCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/GovernanceCard.tsx)
- [sections/myAccount/AssetsCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/AssetsCard.tsx)
- [sections/myAccount/BugReportsCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/BugReportsCard.tsx)
- [sections/myAccount/ConnectedAccountsCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/ConnectedAccountsCard.tsx)
- [sections/myAccount/DangerZoneCard.tsx](apps/nasun-website/frontend/src/sections/myAccount/DangerZoneCard.tsx)
- [sections/myAccount/components/](apps/nasun-website/frontend/src/sections/myAccount/components/) — 카드들이 사용하는 보조 컴포넌트

원본은 my-account 페이지(`/my-account`)에서 계속 사용 중이므로 **삭제하지 말고 그대로 둔다**. 이번 작업은 uju 폴더 안에 새 버전을 추가할 뿐이다.

## 완료 정의

- [ ] 8개 새 카드 파일 + 필요한 internal 보조 컴포넌트 생성
- [ ] `ActivityTab.tsx`, `ProfileTab.tsx`가 `@/sections/myAccount/*`를 import하지 않음
- [ ] 검증 grep 3개 모두 빈 결과
- [ ] `tsc --noEmit` 0건
- [ ] 시각 확인: 모든 카드가 `rounded-2xl` + uju-card 배경 + teal/mint/lime/blue 분산
- [ ] 기능 회귀 없음
