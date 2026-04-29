# PR2 Handoff: GoStop mines/crash 통합 + 카테고리 product-neutral 리네임

**전제**: PR1 (`467ccab2 feat(nasun-website): user-selectable daily missions + dashboard cleanup`) 머지 완료. 이 PR1이 사용자 선택형 미션 인프라를 깔아둔 상태에서, PR2는 (a) 신규 게임 2개를 미션 시스템에 통합하고 (b) backend 카테고리 이름을 product-neutral로 정리한다.

**원본 spec**: `~/.claude/plans/ethereal-dancing-journal.md` v4.2 부록 섹션 ("PR2 Phase C+D"). 이 문서는 그 부록을 standalone 핸드오프로 풀어 옮긴 것 + impl 시 필요한 sanity check를 추가했다.

---

## 작업 범위

### Phase C: GoStop mines/crash 통합 (frontend + backend lockstep)

**현황**:
- `apps/gostop/contracts-mines/sources/mines.move` — `SessionFinished` 이벤트 emit
- `apps/gostop/contracts-crash/sources/crash.move` — `CashOutRecorded` 이벤트 emit
- 두 게임은 출시되어 mainnet에서 라이브이지만 ecosystem points 시스템 미통합

**목표**: 사용자가 mines/crash 플레이 → 1pt 적립 (`games` 카테고리, 1pt/day cap에 합산)

### Phase D: 카테고리 product-neutral 리네임 (forward-only)

**현황**: gostop 컨트랙트들이 이미 `pado-lottery / pado-scratchcard / pado-games`에 적립 중 ([config/points.ts:273-293](apps/network-explorer/api-server/src/config/points.ts#L273-L293) + 명시 코멘트 L151-152). pado frontend에서 게임 메뉴 제거됨 → pado-side 트래픽 0. 이름이 부정확.

**목표**: `pado-` prefix 제거 (`pado-dex`만 유지). cap 정책 미변경. forward-only + 00:00 UTC scanner cutover + dual-name SQL.

---

## 매핑 테이블 (확정)

| 기존 카테고리 | 신규 카테고리 | 비고 |
|---|---|---|
| `pado-dex` | `pado-dex` (유지) | DEX는 pado 고유 |
| `pado-lottery` | `lottery` | gostop 통합 게임 |
| `pado-scratchcard` | `scratchcard` | gostop 통합 게임 |
| `pado-games` | `games` | numbermatch + (신규) mines + crash |

신규 카테고리 (`gostop-mines`, `gostop-crash`) **만들지 않음** — 카테고리별 cap이라 게임마다 분리하면 1pt/일 invariant 깨짐.

---

## Critical fix (review 발견사항 미리 반영)

1. **Move 이벤트 이름**: 추정이 아닌 실제 소스 검증된 이름 사용
   - mines: `::mines::SessionFinished` (not `MinesPlayed`)
   - crash: `::crash::CashOutRecorded` (not `CashedOut`)

2. **mines completion 의도**: `SessionFinished`는 win/bust 둘 다 emit. mission description은 "Play Mines" (모든 세션 완료 = 1pt). win-only 의도면 별도 이벤트 필터 필요 — 결정 후 진행.

3. **matview cutover** (`ecosystem_daily_scores`):
   - `distinct_cats` CTE **내부**에 `CASE WHEN category IN ('pado-lottery', 'pado-scratchcard', 'pado-games') THEN substring(category from 6) ELSE category END AS category` 추가 (DISTINCT가 정규화된 카테고리로 동작)
   - `MATVIEW_VERSION` 3 → 4 bump (없으면 기존 view 그대로 유지)
   - `rebuildEcosystemMatview()` 슈퍼유저 스크립트 cutover에 실행

4. **scanner cutover 타이밍**: 다음 00:00 UTC 직후 재배포. same-day overlap (legacy + new 양쪽 row 동시 발생) 방지. pado-side 트래픽 0이라 race 위험 매우 낮지만 안전 확보.

---

## 변경 사이트 (enumerated)

### Frontend

| 파일 | 변경 |
|---|---|
| [hooks/useDailyMissions.ts](apps/nasun-website/frontend/src/hooks/useDailyMissions.ts) | `MissionId` union: `pado-lottery/scratchcard/games` → `lottery/scratchcard/games`, 신규 `mines`/`crash` 추가. `EVENT_MISSION_MAP`에 mines/crash entry 2개 추가 (suffix는 그대로, missionId만 매핑) |
| [missions/missionRegistry.ts](apps/nasun-website/frontend/src/sections/uju/missions/missionRegistry.ts) | mission id 새 이름. `appId: 'pado'` → `appId: 'gostop'` (lottery/scratchcard/games는 gostop 카드 아래로). pado 카드에는 `pado-dex`만 남김. 신규 mines/crash entry (gostop). `APP_BADGE_STYLE.gostop` 추가 |
| [apps/appRegistry.ts](apps/nasun-website/frontend/src/sections/uju/apps/appRegistry.ts) | gostop status `coming-soon` → `live`, url `'#'` → `'https://gostop.app'` |
| [hooks/__tests__/useDailyMissions.test.ts](apps/nasun-website/frontend/src/hooks/__tests__/useDailyMissions.test.ts) | hard-coded category 문자열 ~20곳 일괄 교체. 신규 mines/crash 매칭 케이스 추가 |
| [missions/__tests__/missionRegistry.test.ts](apps/nasun-website/frontend/src/sections/uju/missions/__tests__/missionRegistry.test.ts) | L92 sync guard, L147-149 gostop undefined 검증, L280 coming-soon 그룹 분리 |
| [dashboard/__tests__/UjuDailyMissionsCard.test.tsx](apps/nasun-website/frontend/src/sections/uju/dashboard/__tests__/UjuDailyMissionsCard.test.tsx):351 | hard-coded category 문자열 |
| myAccount: PointsCard.tsx, DailyMissionsCard.tsx | 카테고리 라벨 dual-name |

### Backend

| 파일 | 변경 |
|---|---|
| [config/points.ts](apps/network-explorer/api-server/src/config/points.ts) | `EVENT_MAP_ENTRIES` 카테고리 매핑 교체 (`pado-` → product-neutral). mines/crash entry 2개 추가 → `games` |
| [db/ecosystem-matview-migration.ts](apps/network-explorer/api-server/src/db/ecosystem-matview-migration.ts) | distinct_cats CTE에 CASE WHEN dedup. MATVIEW_VERSION 4 bump |
| [routes/ecosystem.ts](apps/network-explorer/api-server/src/routes/ecosystem.ts) | volume_bonus IN list + 제외 룰 dual-name (4 occurrences L769-1057) |
| [scripts/settle-ecosystem.ts](apps/network-explorer/api-server/src/scripts/settle-ecosystem.ts):386 | volume_count IN list dual-name |
| [scripts/settle-games.ts](apps/network-explorer/api-server/src/scripts/settle-games.ts):26 | GAME_CATEGORIES 배열에 신규 추가 |
| [routes/nasun-metrics.ts](apps/network-explorer/api-server/src/routes/nasun-metrics.ts):31-39 | OFFCHAIN + GAMES_CATEGORIES dual-name |
| [scripts/backfill-points.ts](apps/network-explorer/api-server/src/scripts/backfill-points.ts):155-200 | dual-name |
| [scripts/export-activity-stats.ts](apps/network-explorer/api-server/src/scripts/export-activity-stats.ts):9 | category 리스트 dual-name |
| [scanner/daily-mission.ts](apps/network-explorer/api-server/src/scanner/daily-mission.ts):23-26 | 카테고리 매핑 |
| [scanner/rpc-reconcile.ts](apps/network-explorer/api-server/src/scanner/rpc-reconcile.ts):78-93 | 카테고리 매핑 |
| `cdk/lambda-src/user-analytics-collector/src/nasun-stats.ts`:79-82 | 카테고리 리스트 |

### Helper

신규: `isGameCategory(cat)` 또는 `GAME_CATEGORIES` const export
- 위치: `apps/network-explorer/api-server/src/config/categories.ts` (신규) 또는 기존 points.ts에 추가
- 모든 SQL site에서 raw IN list 대신 const import. 새 작성자가 dual-name 누락하지 않도록 보장
- TS 타입으로 노출하면 frontend도 같은 const 참조 가능

### 문서

| 파일 | 변경 |
|---|---|
| [docs/ecosystem-points-system.md](docs/ecosystem-points-system.md) §4.2 | 카테고리 표 갱신 (legacy/new 명시). "pado games migrated to gostop" 컨텍스트 추가 |
| [apps/nasun-website/doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md](apps/nasun-website/doc/ECOSYSTEM_LEADERBOARD_IMPLEMENTATION.md) | Score Formula dual-name 명시, volume_bonus 카테고리 리스트 갱신 |

### localStorage 마이그레이션 (frontend)

PR1에서 `uju:app-directory:{id}` 도입. PR2의 missionId rename으로 사용자가 저장한 `missions[appId]`의 ID가 stale됨. parser가 unknown ID drop하지만 UX 일관성 위해:

- 신규 키 prefix: `uju:app-directory:v2:{id}` (PR2 deploy 시점에 v1→v2 마이그레이션)
- RENAME_MAP:
  ```ts
  const MISSION_ID_RENAME: Record<string, string> = {
    'pado-lottery': 'lottery',
    'pado-scratchcard': 'scratchcard',
    'pado-games': 'games',
  };
  ```
- `loadFromStorage` 내 v1 → v2 변환: missions의 모든 missionId에 RENAME_MAP 적용 + appId가 `pado`였던 lottery/scratchcard/games는 `gostop`으로 키 옮김
- v1 키 보존 (롤백 안전)

---

## PR 분할 옵션 (impl 전 결정)

### Option A: 단일 PR2 (Phase C + D 함께)

장점: 한 cutover window. 카테고리 일관성 (mines/crash 시작부터 신규 namespace).
단점: blast radius 큼. cutover 실패 시 mines/crash 출시도 같이 미뤄짐.

### Option B: PR2a (Phase C만, 기존 `pado-games` 사용) + PR2b (Phase D rename)

PR2a: mines/crash entry 추가, backend EVENT_MAP_ENTRIES에 `pado-games` 매핑 추가, flag false default. user-facing 영향 0이라 안전 머지.
PR2b: rename + matview cutover + 모든 SQL site dual-name + 문서.

장점: 각 PR이 독립적 boundary, rollback 명확.
단점: PR2a → PR2b 사이에 mines/crash가 `pado-games` 카테고리로 한동안 적립됨 (의미적으로 부정확하지만 데이터는 정상).

**권장**: B (review가 권고). 단, A로 가도 된다면 cutover window 확보 후 한 번에 끝낼 수 있음.

---

## 검증 (PR2)

### 정적
1. `pnpm --filter @nasun/nasun-website exec tsc --noEmit` → 0건
2. backend `cd apps/network-explorer/api-server && npm run build` → 0건
3. `pnpm --filter @nasun/nasun-website test` → 모두 통과 (사이트별 카테고리 테스트 갱신 포함)
4. `grep -rn "'pado-lottery'\|'pado-scratchcard'\|'pado-games'" apps/ --include='*.ts' --include='*.tsx'` → helper 사용처 + legacy comment 외 빈 결과

### Cutover 절차

1. **이전 검증 (00:00 UTC 직전)**: pado-side 게임 컨트랙트 트래픽 0 재확인. `SELECT category, count(*) FROM activity_points WHERE tx_timestamp > now() - interval '7 days' AND category LIKE 'pado-%' AND category != 'pado-dex' GROUP BY category;` → 0이거나 근접해야 안전.
2. **00:00 UTC**: scanner 재배포 (`pm2 restart explorer-api`). 새 카테고리로 emit 시작.
3. **matview rebuild**: `npx tsx src/scripts/rebuild-matview.ts` 실행. MATVIEW_VERSION 4로 재생성.
4. **frontend 재배포**: rsync (staging 먼저, 검증 후 prod).
5. **검증**: 새 row가 정확한 카테고리로 들어가는지 PG 직접 쿼리 + 사용자 시나리오 (mines/crash 플레이 → 1pt 적립 + `category='games'` row 확인).

### 시나리오 (PR2 머지 후)

- mines 1게임 플레이 → 1pt 적립, frontend Daily Missions 체크 ~60s 내
- 같은 날 crash 1게임 추가 → 0pt 추가 (이미 cap, 둘 다 `games` 카테고리)
- 같은 날 numbermatch 1게임 추가 → 0pt 추가
- DEX trade → 2pt 적립 (`pado-dex` 그대로)
- legacy `pado-games` row 사용자: my-account 누적 점수 변화 0 (matview dedup으로 정상)

---

## 새 세션 시작 시 입력할 프롬프트

새 Claude Code 세션을 열고 다음을 그대로 붙여넣으세요:

```
PR2 시작합니다. 핸드오프 문서:
apps/nasun-website/doc/plans/uju-pr2-mines-crash-and-category-rename.md

이 문서를 읽고 plan mode로 진입해서 v1 plan을 작성해주세요. PR1
(467ccab2)는 이미 머지됨. 이번 PR은 backend 변경이 큰 만큼
PR2a (mines/crash, flag false default) + PR2b (카테고리 rename
+ matview cutover) 분할 진행 권장. 분할 여부는 plan에 옵션으로
정리한 뒤 사용자 결정 받기.
```

(또는 분할 결정을 미리 한 경우 "PR2a 먼저 진행" / "PR2 단일로 진행"으로 시작 명시)
