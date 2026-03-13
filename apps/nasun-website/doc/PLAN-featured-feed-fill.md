# Featured Feed: 리더보드 테이블 높이까지 피드 채우기

## 배경

리더보드 테이블 우측 피드 공간이 비어있는 문제.
현재 rankers 1-3 + climbers 1-3 = 최대 6개인데, reply-only 유저 제외 시 3개 이하로 줄어듦.

## 변경 파일: 1개

`cdk/lambda-src/leaderboard-v3/src/handlers/get-featured-feed.ts`

## 변경 내용

현재: rankers 1-3 + climbers 1-3 = 최대 6개
변경: rankers 1-3 -> climbers 1-3 -> rankers 4+ 순서로 최대 15개

### 구체적 변경

1. `topRankers`를 `slice(0, 3)` 대신 더 많이 가져오기 (예: 20명)
   - `const allRankedUsers = Array.from(currentSnapshot.values()).filter(s => !bannedIds.has(s.accountId)).sort((a, b) => a.rank - b.rank)`
   - `const topRankers = allRankedUsers.slice(0, 3)` (기존 로직 유지)

2. 피드 구성 섹션(line ~296-300) 확장:
   ```
   // 기존: rankers 1-3 -> climbers 1-3
   topRankers.forEach(r => addFeedItem(r.accountId))
   topClimbers.forEach(c => addFeedItem(c.accountId))

   // 추가: rankers 4+ (climbers와 중복 아닌 유저만)
   const MAX_FEED_ITEMS = 15
   const remainingRankers = allRankedUsers.slice(3)
   // remaining rankers도 posts 조회 필요 -> fetchPromises에 포함
   ```

3. `getBestRecentPost` 호출 범위 확장:
   - 현재: `userMap`에 있는 유저만 포스트 조회 (최대 6명)
   - 변경: rankers 4+도 포스트 조회 대상에 포함
   - remaining rankers를 `userMap`에 추가 (badge 없이)
   - `fetchPromises`에서 모든 대상 유저의 포스트를 병렬 조회

4. `addFeedItem` 호출 순서:
   ```typescript
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

## 프론트엔드 변경: 불필요

- 사이드바가 이미 `overflow-hidden` + gradient fade로 리더보드 높이에 맞춰 클리핑
- API가 더 많은 아이템을 반환하면 자동으로 빈 공간이 채워짐
- `useFeedRotation`이 모든 아이템을 20초 간격으로 순환

## 검증

`/deploy nasun-website prod LeaderboardV3Stack` 후 `GET /v3/feed/featured`에서 items 개수 확인
