# Featured Feed: 리더보드 테이블 높이까지 피드 채우기

## 배경

리더보드 테이블 우측 피드 공간이 비어있는 문제.
현재 rankers 1-3 + climbers 1-3 = 최대 6개인데, reply-only 유저 제외 시 3개 이하로 줄어듦.

## 변경 파일: 4개

| 파일 | 변경 내용 |
|------|----------|
| `cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts` | 피드 구성 로직 확장 |
| `cdk/lambda-src/leaderboard-v3/src/types/index.ts` | BadgeType에 `'ranker'` 추가 |
| `frontend/src/features/leaderboard-v3/types/index.ts` | BadgeType에 `'ranker'` 추가 (미러) |
| `frontend/src/features/leaderboard-v3/components/FeedPostCard.tsx` | defensive guard + BADGE_CONFIG에 `'ranker'` 항목 추가 |

## 배포 전략: 3-Phase

백엔드(CDK Lambda)와 프론트엔드(rsync)가 독립 배포이므로, 배포 순서에 따른 런타임 크래시를 방지하기 위해 3단계로 나눈다.

### Phase 0: Defensive Guard (프론트엔드만)

FeedPostCard에 unknown badge fallback guard 추가. **타입 변경 없음, 백엔드 변경 없음.**
이것만 단독 배포하면 현재 6개 피드는 그대로 동작하면서, 향후 어떤 badge가 와도 크래시하지 않는다.

```typescript
// FeedPostCard.tsx line 81 직후
const badgeConfig = BADGE_CONFIG[primaryBadgeType];
if (!badgeConfig) return null;  // [NEW] unknown badge guard
```

배포: `bash scripts/deploy-nasun-website-production.sh`

### Phase 1: BadgeType 확장 (프론트엔드만)

Phase 0이 이미 배포되어 있으므로 백엔드가 아직 옛 코드여도 안전.

**Backend `types/index.ts` (line 543)**:
```typescript
export type BadgeType = 'rank-1' | 'rank-2' | 'rank-3' | 'ranker' | 'climber-1' | 'climber-2' | 'climber-3';
```

**Frontend `types/index.ts` (line 136)**: 동일하게 `'ranker'` 추가.

**Frontend `FeedPostCard.tsx` BADGE_CONFIG에 추가**:
```typescript
ranker: {
  icon: "🏅",
  label: "ranker",
  color: "text-nasun-white/60",
  bgColor: "bg-nasun-white/5",
  borderColor: "border-nasun-white/10",
},
```

배포: `bash scripts/deploy-nasun-website-production.sh`

### Phase 2: 백엔드 로직 확장 (CDK 배포)

Phase 0+1이 이미 프론트엔드에 있으므로 `'ranker'` badge가 즉시 렌더링된다.

#### 2-1. allRankedUsers 추출

기존 `topRankers` 생성 로직을 확장:

```typescript
// 정렬된 전체 랭커 (상한 18명: 3 top + 15 remaining, MAX_FEED_ITEMS 이상 조회할 필요 없음)
const allRankedUsers = Array.from(currentSnapshot.values())
  .filter(s => !bannedIds.has(s.accountId))
  .sort((a, b) => a.rank - b.rank)
  .slice(0, 18);

// 기존 로직 유지
const topRankers = allRankedUsers.slice(0, 3);

// 나머지 랭커 (4위~18위)
const remainingRankers = allRankedUsers.slice(3);
```

#### 2-2. userMap에 remaining rankers 추가

**순서 중요**: remaining rankers는 반드시 climbers 추가 직후, `fetchPromises` 생성 이전에 `userMap`에 추가해야 함.

```typescript
// Add Rankers 1-3 (기존)
topRankers.forEach((ranker, index) => {
  const badge = `rank-${index + 1}` as BadgeType;
  userMap.set(ranker.accountId, { account: ranker, badges: [badge] });
});

// Add Climbers 1-3 (기존)
topClimbers.forEach((climber, index) => {
  const badge = `climber-${index + 1}` as BadgeType;
  if (userMap.has(climber.accountId)) {
    userMap.get(climber.accountId)!.badges.push(badge);
  } else {
    userMap.set(climber.accountId, { account: climber, badges: [badge] });
  }
});

// [NEW] Add Remaining Rankers 4+ (generic 'ranker' badge)
remainingRankers.forEach((ranker) => {
  if (!userMap.has(ranker.accountId)) {
    userMap.set(ranker.accountId, { account: ranker, badges: ['ranker'] });
  }
});

// fetchPromises (이 아래는 기존과 동일)
```

#### 2-3. addFeedItem 호출 순서 + MAX_FEED_ITEMS

```typescript
const MAX_FEED_ITEMS = 15;

// Priority 1: Rankers 1-3
topRankers.forEach(r => addFeedItem(r.accountId));
// Priority 2: Climbers 1-3
topClimbers.forEach(c => addFeedItem(c.accountId));
// Priority 3: Rankers 4+ (fill remaining space)
for (const ranker of remainingRankers) {
  if (feedItems.length >= MAX_FEED_ITEMS) break;
  addFeedItem(ranker.accountId);
}
```

> `addFeedItem`은 `addedAccountIds` Set으로 중복 방지. Climber이면서 ranker 4+인 유저는 climber로 이미 추가됨.

배포: `/deploy nasun-website prod LeaderboardV3Stack`

## 프론트엔드 레이아웃: 변경 불필요

- 사이드바가 이미 `md:absolute md:inset-0 md:overflow-hidden` + gradient fade로 리더보드 높이에 맞춰 클리핑 (`LeaderboardSidebar.tsx:21`)
- API가 더 많은 아이템을 반환하면 자동으로 빈 공간이 채워짐
- `useFeedRotation`이 모든 아이템을 20초 간격으로 순환 (순환 주기: 120초 -> 300초)

## 롤백 절차

### 배포 전 준비

```bash
# 프로덕션 dist 백업 (rsync 배포는 구 버전을 자동 보존하지 않음)
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  'cp -r /var/www/nasun/dist /var/www/nasun/dist-backup-$(date +%Y%m%d-%H%M)'
```

### 문제 발생 시 롤백

**백엔드만 롤백 (피드 아이템 수만 줄어듦, 프론트엔드는 안전):**
```bash
# feat/featured-feed-fill 브랜치 이전 커밋으로 돌아가서 재배포
git checkout main
cd apps/nasun-website/cdk
NODE_ENV=production npx cdk deploy LeaderboardV3Stack --profile nasun-prod --require-approval never
```

**프론트엔드만 롤백:**
```bash
# Phase 0 guard 덕분에 백엔드가 'ranker' badge를 보내도 크래시하지 않음
# 하지만 구 프론트엔드로 완전 복원이 필요하면:
ssh -i ~/.ssh/.awskey/nasun-prod-key ec2-user@43.200.67.52 \
  'mv /var/www/nasun/dist /var/www/nasun/dist-broken && mv /var/www/nasun/dist-backup-YYYYMMDD-HHMM /var/www/nasun/dist'
```

**전체 롤백 (백엔드 + 프론트엔드):**
1. 백엔드 먼저 롤백 (구 코드 재배포)
2. 프론트엔드 백업 복원
3. 순서: 백엔드 -> 프론트엔드 (백엔드가 `'ranker'`를 안 보내면 프론트엔드 버전 무관)

## 검증

1. Phase 0 배포 후: 기존 피드가 정상 동작하는지 확인
2. Phase 2 배포 후: `GET /v3/feed/featured`에서 items 개수 확인 (6개 이상)
3. 프론트엔드 배포 후: 브라우저에서 ranker 4+ 카드의 badge 렌더링 확인
4. CloudWatch에서 Lambda duration 확인 (기존 대비 DynamoDB Query 약 3x 증가, 병렬이므로 소폭 증가 예상)

## 주의사항

- `'ranker'.startsWith('rank')` = true: FeedPostCard line 80의 badge 선택 로직에서 `'ranker'`가 rank 계열로 매치됨. 이것은 의도된 동작 (ranker badge가 rank 우선순위로 표시)
- reply-only 유저가 많으면 15개를 못 채울 수 있음. 기존(3-6개)보다는 나아지므로 허용
- react-tweet 15개 동시 마운트: `overflow-hidden`으로 보이지 않는 카드도 DOM에 존재. 저사양 기기에서 퍼포먼스 저하 가능성 있으나, 후속 최적화로 분리
