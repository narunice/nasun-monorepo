# Handoff: Ecosystem Penalty UX Bug

**생성**: 2026-04-11 21:50
**브랜치**: main
**이전 핸드오프**: 없음

## 현재 상태 요약

Bug report 시스템을 통해 사용자가 "my points go back to zero"를 신고했다. 조사 결과, Alliance penalty 기간에 daily/weekly/allTime ecosystemScore가 모두 0으로 표시되는 문제를 확인했다. today/weekly가 0인 건 `base * multiplier(0) = 0`으로 논리적으로 맞지만, all-time까지 0으로 보이는 것은 버그다. 과거에 확정된 스냅샷 포인트가 사라져 보이면 안 된다.

## 버그 상세

### 신고자 정보
- Identity: `ap-northeast-2:6cb1e654-ba71-c781-4943-efc4f7adffdf`
- Wallet: `0x8ad6a1443bd5cd10a80835e6b9591ed329eb00fee624b7f54ecd15ff00e435e7`
- Twitter: @sarwiendah41
- NFT: Alliance NFT x1 (multiplier: 1x, penalty 시 0x)

### 스냅샷 기록
```
2026-04-10  base:7  mult:0  eco:0   penalty:true   <-- 문제의 날
2026-04-09  base:6  mult:1  eco:6   penalty:false
2026-04-08  base:5  mult:1  eco:5   penalty:false
2026-04-07  base:4  mult:1  eco:4   penalty:false
2026-04-06  base:6  mult:1  eco:6   penalty:false
```

### 문제 1: daily/weekly ecosystemScore 계산

**파일**: `apps/network-explorer/api-server/src/routes/ecosystem.ts`

```typescript
// Line 322: daily
ecosystemScore: todayBaseScore * multiplier + bonusToday + govToday + refToday * sf

// Line 333: weekly
ecosystemScore: weeklyBaseScore * multiplier + bonusWeekly + govWeekly + refWeekly * sf
```

penalty 시 multiplier=0이므로 daily/weekly ecosystemScore가 0이 된다. 이건 공식상 맞지만, UI에서 "pts today = base x mult + bonus"로 표시할 때 base가 5인데 결과가 0이면 사용자가 혼란스러워한다. penalty 상태를 명시적으로 안내해야 한다.

### 문제 2: allTime ecosystemScore가 penalty 전 누적분까지 잃어버린 것처럼 보임

**파일**: `apps/network-explorer/api-server/src/routes/ecosystem.ts`

```typescript
// Line 248: today's contribution uses CURRENT multiplier
const todayBaseContribution = (todayBase + unsnapshottedBase) * multiplier;

// Line 249-251: allTime = past snapshots + today contribution + bonuses
const totalBasePoints = baseCumulative + todayBaseContribution;
const allTimeCumulative = totalBasePoints + bonusTotal + govTotal + refTotal * scalingFactor;
```

- `baseCumulative` = `SUM(base_score * multiplier)` from snapshots (line 92)
- 4/10 스냅샷: base=7, mult=0 -> 해당 날 기여분 = 0
- 4/6~4/9 합계: 6+4+5+6 = 21 (이건 보존됨)
- 하지만 penalty 당일에 접속하면 today 기여분도 0이라 총점이 낮게 보임

실제 allTime이 완전히 0은 아니지만 (baseCumulative 21은 남음), 사용자가 화면에서 본 시점에는 스냅샷이 아직 생성 전이었을 수 있어서 더 낮게 보였을 가능성이 있다.

### 문제 3: penalty 상태를 사용자에게 알리지 않음

현재 프론트엔드에서 `isPenalized: true`일 때 별도 안내가 없다. 사용자는 왜 점수가 0인지 이해할 수 없다.

## 수정 방안

### 1. UI에 penalty 상태 명시 (우선)
- `isPenalized: true`일 때 My Account의 Ecosystem Points 영역에 경고 배너 표시
- "Your ecosystem score multiplier is temporarily reduced to 0x due to low activity. Stay active for 2 consecutive days to lift the penalty."
- daily/weekly 공식 표시에서 `mult: 0x (penalized)` 표기

### 2. allTime 계산에서 penalty 영향 최소화 (검토 필요)
- 과거 스냅샷의 `SUM(base_score * multiplier)`는 이미 확정된 기록이므로 변경 불가 (immutable 원칙)
- 하지만 "오늘"의 base 기여분까지 현재 multiplier로 계산하는 건 맞는 동작
- 사용자가 혼란스러워하는 핵심은 "왜 0인지" 설명이 없는 것

### 3. penalty 시 disabled 플래그 동작 재검토
- 현재: `disabled = multiplier === 0` (line 297)
- `disabled: true`면 프론트엔드에서 전체 섹션이 비활성화될 수 있음
- penalty와 "NFT 미보유"는 다른 상태인데 동일하게 처리됨

## 핵심 파일

| 파일 | 역할 |
|------|------|
| `apps/network-explorer/api-server/src/routes/ecosystem.ts` | Score 계산 (line 222-350) |
| `apps/network-explorer/api-server/src/scanner/daily-nft-check.ts` | Alliance penalty 부과/해제 |
| `apps/network-explorer/api-server/src/scanner/daily-snapshot.ts` | 일일 스냅샷 생성 |
| `apps/network-explorer/api-server/src/config/ecosystem.ts` | Multiplier 계산 |
| `apps/nasun-website/frontend/src/hooks/useEcosystemScore.ts` | FE score fetch hook |
| `apps/nasun-website/frontend/src/sections/myAccount/ProfileHeroCard.tsx` | FE score display (line 334+) |

## 즉시 다음 단계

1. `ProfileHeroCard.tsx`에서 `isPenalized: true`일 때 경고 배너 추가
2. daily/weekly 공식 표시에 penalty 상태 반영 (`mult: 0x (penalty)`)
3. `disabled` 플래그를 penalty와 NFT 미보유로 분리할지 결정
4. bug report admin에서 이 사용자에게 admin note 남기기 (수동)
