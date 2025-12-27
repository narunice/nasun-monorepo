# NASUN 리더보드 시스템: 데이터 수집 및 점수 계산 종합 가이드

**작성일**: 2025-10-28
**최종 업데이트**: 2025-12-01
**버전**: 1.1.0
**작성자**: Claude Code

---

## 📋 목차

1. [시스템 개요](#시스템-개요)
2. [파이프라인 전체 작동 순서](#파이프라인-전체-작동-순서)
3. [Phase별 상세 설명](#phase별-상세-설명)
4. [점수 계산 공식 완전 가이드](#점수-계산-공식-완전-가이드)
5. [데이터 흐름 및 DynamoDB 스키마](#데이터-흐름-및-dynamodb-스키마)
6. [환경 변수 설정](#환경-변수-설정)
7. [멱등성 보장 메커니즘](#멱등성-보장-메커니즘)

---

## 시스템 개요

NASUN 리더보드 시스템은 **AWS Step Functions 기반 파이프라인**을 통해 X(Twitter) 인게이지먼트 데이터를 수집하고, 누적 점수를 계산하여 리더보드를 생성하는 완전 자동화된 서버리스 시스템입니다.

### 핵심 특징

- **일일 자동 실행**: 매일 오전 09:10 KST에 EventBridge가 파이프라인 트리거
- **병렬 데이터 수집**: Passive(3일 전 트윗)와 Active(1일 전 트윗) 인게이지먼트 독립 수집
- **멱등성 보장**: 같은 날짜에 여러 번 실행해도 중복 계산 방지
- **커뮤니티 가중치**: 한국/글로벌 커뮤니티 구분 및 팔로워 수 기반 가중치 적용
- **활동 보너스/패널티**: 최근 7일 활동 패턴에 따른 점수 조정

---

## 파이프라인 전체 작동 순서

### Step Functions State Machine: `nasun-leaderboard-pipeline`

```
[EventBridge Scheduler - 매일 09:10 KST]
    ↓
Phase 0: RefreshTokenIfNeeded
    └→ OAuth 2.0 토큰 만료 체크 및 자동 갱신
    ↓
Phase 1: GetTargetTweetsTask
    └→ 타겟 계정 타임라인 기반 트윗 목록 조회 (3일 전, Passive 인게이지먼트 대상)
    ↓
Phase 2: TweetBatchSplitterTask
    └→ 트윗 목록을 5개 단위 배치로 분할 (Rate Limit 준수)
    ↓
Phase 3: IndependentDataCollection (병렬 실행)
    ├─ Branch A (Passive): ProcessTweetBatches
    │   └→ Map State (배치당 순차 실행)
    │       ├─ CollectLikesTask (좋아요 수집)
    │       ├─ WaitState (15분 대기 - Rate Limit)
    │       ├─ CollectRetweetsTask (리트윗 수집)
    │       ├─ WaitState (15분 대기)
    │       └─ CollectQuotesTask (인용 트윗 수집)
    │
    └─ Branch B (Active): CollectMentionsTask
        └→ 멘션 검색 (1일 전, 최대 100개)
    ↓
Phase 4: CheckMentionsFound (Choice State)
    ├─ (멘션 발견 시)
    │   └→ MentionBatchesMap
    │       └→ CollectMentionDetailsTask (20개 단위 배치 처리)
    └─ (멘션 미발견 시)
        └→ NoMentionsFound (Pass State)
    ↓
Phase 5: WaitAfterMentionDetails (15분 대기)
    ↓
Phase 6: AggregateResults
    └→ 모든 인게이지먼트 데이터를 단일 배열로 집계
    ↓
Phase 7: PrepareScoreCalculatorInput (Pass State)
    └→ 점수 계산기 입력 형식으로 변환
    ↓
Phase 8: ScoreCalculatorTask
    └→ 누적 점수 계산 및 업데이트
    ↓
Phase 9: WaitForGsiUpdate (10초 대기)
    └→ DynamoDB GSI eventual consistency 대기
    ↓
Phase 10: LeaderboardGeneratorTask
    └→ 최종 리더보드 생성 및 순위 결정
    ↓
✅ 완료
```

---

## Phase별 상세 설명

### Phase 0: RefreshTokenIfNeeded

**Lambda**: `nasun-refresh-oauth-token`

**목적**: OAuth 2.0 토큰 만료 체크 및 자동 갱신

**동작**:
1. AWS Secrets Manager에서 현재 토큰 조회
2. 만료 여부 확인 (`expires_at` 필드)
3. 만료된 경우 `refresh_token`으로 새 토큰 발급
4. 새 토큰을 Secrets Manager에 저장

**재시도 정책**: 최대 2회, 10초 간격

---

### Phase 1: GetTargetTweetsTask

**Lambda**: `nasun-get-target-tweets`

**목적**: 타겟 계정 타임라인에서 트윗 목록 조회

**데이터 수집 범위**:
- **Passive 인게이지먼트 대상**: 3일 전 트윗 (Likes, Retweets, Quotes)
- **날짜 계산**: `collectionDate - 3일`

**동작**:
1. 환경 변수에서 `targetUserId`, `targetUsername` 로드
2. X API `GET /2/users/{id}/tweets` (userTimeline) 호출
   - `start_time`, `end_time`: 3일 전 00:00:00 ~ 23:59:59
   - `exclude: ['retweets']`: 리트윗 제외, 원본 포스트 + 답글(replies) 포함
   - `max_results: 100`: 최대 100개 조회 (Pagination 지원)
3. SnapshotTracker를 통한 중복 수집 방지 필터링
4. 원본 포스트만 필터링 (답글 제외, `isReply: false`)
5. 필터링된 트윗 목록 반환

**출력 데이터 구조**:
```json
{
  "tweets": [
    {
      "id": "1234567890",
      "text": "트윗 내용",
      "created_at": "2025-10-25T12:00:00.000Z",
      "author_id": "9876543210"
    }
  ],
  "targetUser": {
    "userId": "1863020068785004544",
    "username": "Naru010110"
  },
  "targetTweetIds": ["1234567890", "..."],
  "collectionDate": "2025-10-28",
  "dateRange": {
    "from": "2025-10-25",
    "to": "2025-10-28"
  },
  "snapshotStrategy": {
    "passive": {
      "from": "2025-10-25",
      "to": "2025-10-28",
      "daysBack": 3
    },
    "active": {
      "from": "2025-10-27",
      "to": "2025-10-28",
      "daysBack": 1
    }
  }
}
```

**재시도 정책**: 최대 2회, 30초 간격

---

### Phase 2: TweetBatchSplitterTask

**Lambda**: `nasun-tweet-batch-splitter`

**목적**: Rate Limit 준수를 위한 배치 분할

**동작**:
1. Phase 1에서 받은 트윗 목록을 5개 단위로 분할
2. 각 배치에 `targetUser`, `dateRange` 정보 추가

**예시**:
```json
{
  "tweetBatches": [
    {
      "batchIndex": 0,
      "tweets": ["id1", "id2", "id3", "id4", "id5"]
    },
    {
      "batchIndex": 1,
      "tweets": ["id6", "id7", "id8"]
    }
  ]
}
```

---

### Phase 3: IndependentDataCollection (병렬 실행)

#### Branch A: ProcessTweetBatches (Passive 인게이지먼트)

**Map State 설정**:
- `maxConcurrency: 1` (순차 처리)
- 각 배치마다 15분 대기 (Rate Limit 준수)

**Lambda 함수들**:

##### 1. CollectLikesTask (`nasun-collect-likes`)

**X API**: `GET /2/tweets/{id}/liking_users`

**동작**:
1. 배치 내 각 트윗의 좋아요 사용자 목록 조회
2. 사용자 프로필 정보 수집 (username, displayName, profileImageUrl, followersCount)
3. DynamoDB에 저장

**저장 스키마**:
```json
{
  "pk": "RECENT#{tweetId}#{userId}",
  "sk": "RECENT#{tweetId}#{userId}",
  "tweet_id": "1234567890",
  "engagement_type": "like",
  "engaging_user_id": "user123",
  "engaging_username": "johndoe",
  "engaging_display_name": "John Doe",
  "engaging_profile_image_url": "https://...",
  "engaging_followers_count": 1500,
  "tweet_created_at": "2025-10-25T12:00:00.000Z",
  "added_at": "2025-10-28T00:10:05.123Z",
  "lastProcessedDate": "2025-10-28",
  "ttl": 1730678405
}
```

**Rate Limit**: 5 requests / 15분

**재시도 정책**:
- Rate Limit Error: 최대 2회, 15분 간격
- 기타 에러: 즉시 실패

##### 2. CollectRetweetsTask (`nasun-collect-retweets`)

**X API**: `GET /2/tweets/{id}/retweeted_by`

**동작**: CollectLikes와 동일하지만 `engagement_type: "repost"`

**Rate Limit**: 5 requests / 15분

##### 3. CollectQuotesTask (`nasun-collect-quotes`)

**X API**: `GET /2/tweets/{id}/quote_tweets`

**동작**: CollectLikes와 동일하지만 `engagement_type: "quote"`

**Rate Limit**: 5 requests / 15분

#### Branch B: CollectMentionsTask (Active 인게이지먼트)

**Lambda**: `nasun-collect-mentions-search`

**X API**: `GET /2/tweets/search/recent`

**동작**:
1. 쿼리: `@{targetUsername} -is:retweet` (리트윗 제외)
2. 시간 범위: 1일 전 (`collectionDate - 1일`)
3. 최대 1000개 멘션 수집 ✅ **Pagination 구현됨 (2025-10-28)** - 환경 변수로 제어 가능
4. 20개 단위로 배치 분할

**출력 데이터 구조**:
```json
{
  "mentionBatches": [
    {
      "batchIndex": 0,
      "mentions": [
        {
          "tweet_id": "mention123",
          "user_id": "user456",
          "username": "alice",
          "text": "멘션 내용..."
        }
      ]
    }
  ]
}
```

**Rate Limit**: 60 requests / 15분

**재시도 정책**: 최대 3회, 15분 간격

---

### Phase 4: CheckMentionsFound & MentionBatchesMap

**Lambda**: `nasun-collect-mention-details`

**목적**: 멘션 상세 정보 수집 및 답글 처리

**동작**:
1. 각 멘션이 타겟 트윗에 대한 답글인지 확인
2. **Quote 중복 방지**: `targetTweetIds`에 포함된 트윗의 Quote는 건너뛰기 (Passive에서 이미 수집)
3. 답글인 경우 Reply Counter 업데이트 (3회 제한 시스템)
4. DynamoDB에 저장

**Reply Counter 스키마**:
```json
{
  "pk": "REPLY#{targetTweetId}#{userId}",
  "sk": "REPLY#{targetTweetId}#{userId}",
  "targetTweetId": "1234567890",
  "userId": "user123",
  "username": "johndoe",
  "replyCount": 2,
  "shouldCount": true,
  "addedAt": "2025-10-28T00:10:05.123Z",
  "ttl": 1730678405
}
```

**3회 제한 시스템**:
- 1-3회 답글: `shouldCount: true` (점수 계산 포함)
- 4회 이상: `shouldCount: false` (점수 계산 제외, 스팸 방지)

**Rate Limit**: 300 requests / 15분

---

### Phase 6: AggregateResults

**Lambda**: `nasun-aggregate-results`

**목적**: 병렬 수집된 모든 인게이지먼트 데이터를 단일 배열로 집계

**입력**:
```json
{
  "parallelResults": [
    {
      "batchProcessingResult": { /* Passive 인게이지먼트 */ }
    },
    {
      "mentionCollectorResult": { /* Active 인게이지먼트 */ }
    }
  ]
}
```

**출력**:
```json
{
  "collectedEngagements": [
    {
      "tweet_id": "123",
      "engagement_type": "like",
      "engaging_user_id": "user1",
      "engaging_username": "alice",
      "engaging_followers_count": 1500,
      ...
    },
    ...
  ],
  "collectionDate": "2025-10-28",
  "statistics": {
    "totalEngagements": 150,
    "likes": 50,
    "replies": 20,
    "reposts": 30,
    "quotes": 25,
    "mentions": 25
  }
}
```

---

### Phase 8: ScoreCalculatorTask

**Lambda**: `nasun-score-calculator`

**파일**: `cdk/lambda-src/x-leaderboard/src/services/delta-calculator.ts`

**목적**: 인게이지먼트 데이터를 점수로 변환하고 누적 점수 업데이트

#### 8-1. 멱등성 필터링 (중복 방지)

**동작**:
1. DynamoDB에서 `RECENT#` 레코드 조회 (오늘 이미 처리된 활동)
2. 새로 수집된 데이터와 비교
3. **순수 신규 활동만 필터링**

**코드 참조**: `delta-calculator.ts:408-429`

```typescript
// 변화 분석 (추가/삭제된 인게이지먼트 식별)
const { addedEngagements, removedEngagements } = this.identifyChanges(
  validatedCurrentEngagements,
  previousEngagements
);

// 새로운 추가 없이 기존 데이터만 삭제 - 음수 점수 방지
if (addedEngagements.length === 0 && removedEngagements.length > 0) {
  console.log(`⚠️ 새로운 추가 없이 기존 데이터만 삭제 - 음수 점수 방지를 위해 점수 변화 없음으로 처리`);
  return {
    totalChangedUsers: 0,
    totalScoreChanges: 0,
    userDeltas: [],
    summary: { added: {}, removed: {} }
  };
}
```

#### 8-2. 사용자별 Delta 계산

**동작**:
1. 인게이지먼트를 사용자별로 그룹화
2. 각 인게이지먼트 타입별로 점수 계산
3. Quote의 경우 품질 평가 적용 (별도 로직)

**기본 점수 가중치** (환경 변수):
```typescript
scoreWeights = {
  likes: 0.2,      // SCORE_WEIGHT_LIKES
  replies: 0.4,    // SCORE_WEIGHT_REPLIES
  reposts: 0.4,    // SCORE_WEIGHT_REPOSTS
  quotes: 0.6,     // SCORE_WEIGHT_QUOTES
  mentions: 0.5    // SCORE_WEIGHT_MENTIONS
}
```

**코드 참조**: `delta-calculator.ts:785-820`

```typescript
// 인용인 경우 품질평가가 적용된 실제 점수 사용
if (engagement.engagement_type === 'quote') {
  scoreWeight = await this.getQuoteScore(userId, engagement.tweet_id, targetDate);
} else {
  const engagementKey = engagement.engagement_type === 'like' ? 'likes' :
                       engagement.engagement_type === 'reply' ? 'replies' :
                       engagement.engagement_type === 'repost' ? 'reposts' :
                       engagement.engagement_type === 'mention' ? 'mentions' : null;

  scoreWeight = this.scoreWeights[engagementKey];
}

delta.scoreChange += scoreWeight;
delta.addedEngagements.push(engagement);

// 타입별 카운트 증가
switch (engagement.engagement_type) {
  case 'like': delta.likesChange++; break;
  case 'reply': delta.repliesChange++; break;
  case 'repost': delta.repostsChange++; break;
  case 'quote': delta.quotesChange++; break;
  case 'mention': delta.mentionsChange++; break;
}
```

#### 8-3. 커뮤니티 가중치 적용

**파일**: `community-classification-service.ts`

**동작**:
1. 사용자의 언어 감지 (dominantLanguage)
2. 팔로워 수 기반 가중치 계산
3. 최종 점수 = 기본 점수 × 커뮤니티 가중치

**언어 감지 우선순위**:
1. 기존 CUMULATIVE_SCORE에 저장된 `dominantLanguage` (보존)
2. 인게이지먼트 데이터의 `engaging_tweet_lang`
3. Username 패턴 분석

**가중치 계산 공식**:

```typescript
// 1단계: 팔로워 수 기반 가중치
const followerWeight = Math.min(
  Math.log(followers + 1) / Math.log(config.logBase),
  config.maxCap
);

// 2단계: 언어 배수 적용
const finalWeight = followerWeight * config.languageMultiplier;

// 3단계: 최종 점수
const finalScore = userActivityScore * finalWeight;
```

**커뮤니티 설정**:

```typescript
// 한국 커뮤니티
KOREAN_CONFIG = {
  logBase: 8,         // 낮은 로그 베이스 (빠른 상승)
  multiplier: 1.02,   // 2% 추가
  maxCap: 5.0         // 최대 5배
}

// 글로벌 커뮤니티
GLOBAL_CONFIG = {
  logBase: 30,        // 높은 로그 베이스 (완만한 상승)
  multiplier: 1.0,    // 기본값
  maxCap: 4.0         // 최대 4배
}
```

**예시** (팔로워 10,000명):
- 한국: `log(10001) / log(8) * 1.02 = 4.52배`
- 글로벌: `log(10001) / log(30) * 1.0 = 2.71배`

**코드 참조**: `delta-calculator.ts:965-1040`

```typescript
if (this.enableCommunityWeights) {
  for (const delta of userDeltas) {
    // 원본 점수 저장
    delta.originalScore = delta.scoreChange;

    // 팔로워 수 조회
    let followersCount = delta.followersCount || 0;

    // 언어 감지 및 가중치 계산
    const weightResult = await this.communityService.calculateCommunityWeight(
      delta.userId,
      delta.dominantLanguage,
      followersCount,
      delta.addedEngagements
    );

    // 최종 점수 적용
    delta.scoreChange = delta.originalScore * weightResult.weight;
    delta.communityWeight = weightResult.weight;
    delta.dominantLanguage = weightResult.language;
    delta.logBase = weightResult.logBase;
    delta.languageMultiplier = weightResult.languageMultiplier;
    delta.followerWeight = weightResult.followerWeight;
    delta.cappedAtMax = weightResult.cappedAtMax;
  }
}
```

#### 8-4. 누적 점수 업데이트

**파일**: `cumulative-score-manager.ts`

**DynamoDB 저장 스키마**:
```json
{
  "pk": "USER#{userId}",
  "sk": "CUMULATIVE_SCORE",
  "userId": "1234567890",
  "username": "johndoe",
  "displayName": "John Doe",
  "profileImageUrl": "https://...",
  "followersCount": 1500,
  "dominantLanguage": "ko",
  "totalScore": 125.8,
  "totalLikes": 50,
  "totalReplies": 20,
  "totalReposts": 30,
  "totalQuotes": 25,
  "totalMentions": 25,
  "firstActivity": "2025-10-01",
  "lastUpdated": "2025-10-28T00:10:05.123Z",
  "version": "v2"
}
```

**동작 모드**:

1. **일반 모드** (`forceRecalculation: false`):
   - 기존 점수에 Delta 누적
   - `totalScore += delta.scoreChange`

2. **재계산 모드** (`forceRecalculation: true`):
   - 기존 점수 무시, 새로 계산된 값으로 덮어쓰기
   - `totalScore = delta.scoreChange`
   - 중복 계산 방지용 (복구 시 사용)

**코드 참조**: `cumulative-score-manager.ts:176-194`

```typescript
if (forceRecalculation) {
  // 🔥 재계산 모드: 덮어쓰기
  currentScore.totalScore = userDelta.scoreChange;
  currentScore.totalLikes = userDelta.likesChange;
  currentScore.totalReplies = userDelta.repliesChange;
  currentScore.totalReposts = userDelta.repostsChange;
  currentScore.totalQuotes = userDelta.quotesChange;
  currentScore.totalMentions = userDelta.mentionsChange;
} else {
  // ✅ 일반 모드: 누적
  currentScore.totalScore += userDelta.scoreChange;
  currentScore.totalLikes += userDelta.likesChange;
  currentScore.totalReplies += userDelta.repliesChange;
  currentScore.totalReposts += userDelta.repostsChange;
  currentScore.totalQuotes += userDelta.quotesChange;
  currentScore.totalMentions += userDelta.mentionsChange;
}
```

---

### Phase 10: LeaderboardGeneratorTask

**Lambda**: `nasun-leaderboard-generator`

**파일**: `cdk/lambda-src/x-leaderboard/src/services/leaderboard-generator.ts`

**목적**: 최종 점수 집계 및 리더보드 생성

#### 10-1. 동점자 처리 - Active Days Tie-Breaker

**동작**:
1. 최근 60일 내 활동 일수 계산
2. 동점자의 경우 활동 일수가 많은 사용자를 상위 순위로 배치
3. 활동 일수 점수: `activeDays * 0.1` (최대 6.0점)

**필터링 조건**:
- `added_at >= 60일 전`
- DynamoDB FilterExpression 사용

**코드 참조**: `active-days-calculator.ts:115-158`

```typescript
async getActiveDaysInLast60Days(userId: string): Promise<number> {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoffDate = sixtyDaysAgo.toISOString();

  const command = new QueryCommand({
    TableName: this.tableName,
    KeyConditionExpression: 'pk = :pk',
    FilterExpression: 'added_at >= :cutoffDate',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':cutoffDate': cutoffDate
    }
  });

  const result = await this.dynamoClient.send(command);

  // 날짜별 고유 활동일 계산
  const uniqueDates = new Set<string>();
  result.Items?.forEach(item => {
    const date = item.added_at.split('T')[0];
    uniqueDates.add(date);
  });

  return uniqueDates.size;
}
```

**최종 점수**:
```typescript
const activeDaysScore = activeDays * 0.1; // 최대 6.0점
user.activeDaysScore = activeDaysScore;
```

#### 10-2. Activity Bonus/Penalty System (2025-10-27 추가)

**파일**: `active-days-calculator.ts`

**목적**: 최근 7일 활동 패턴 기반 점수 조정

##### Activity Bonus (활동 보너스)

**조건**: 최근 7일 중 3일 이상 활동

**공식**:
```typescript
const eligibleDays = activeDays - threshold + 1; // (activeDays - 3 + 1)
const bonus = eligibleDays * weightPerDay;       // eligibleDays * 0.28
```

**보너스 테이블**:
| 활동 일수 | 계산 | 보너스 점수 |
|----------|------|-----------|
| 0-2일 | N/A | 0.0 |
| 3일 | (3-3+1) * 0.28 | +0.3 |
| 4일 | (4-3+1) * 0.28 | +0.6 |
| 5일 | (5-3+1) * 0.28 | +0.8 |
| 6일 | (6-3+1) * 0.28 | +1.1 |
| 7일 | (7-3+1) * 0.28 | +1.4 (최대) |

**코드 참조**: `active-days-calculator.ts:37-78`

```typescript
async calculateActivityBonus(userId: string): Promise<number> {
  const activeDays = await this.getActiveDaysInLast7Days(userId);
  const threshold = this.config.activityBonusThresholdDays; // 3
  const weightPerDay = this.config.activityBonusWeightPerDay; // 0.28

  if (activeDays < threshold) {
    return 0;
  }

  const eligibleDays = activeDays - threshold + 1;
  const bonus = eligibleDays * weightPerDay;

  console.log(`🎁 [Activity Bonus] ${userId}: ${activeDays}일 활동 → +${bonus.toFixed(1)}점`);

  return bonus;
}
```

##### Inactivity Penalty (비활동 패널티)

**조건**: 3일 이상 비활동

**공식**:
```typescript
const daysSince = (today - lastActivityDate) / (1000 * 60 * 60 * 24);
if (daysSince < threshold) return 0;

const penalty = -(daysSince - threshold + 1) * penaltyPerDay;
return Math.max(penalty, -maxPenalty); // 최대 -5.0점 제한
```

**감점 테이블**:
| 비활동 일수 | 계산 | 감점 |
|-----------|------|------|
| 0-2일 | N/A | 0.0 |
| 3일 | (3-2) * -0.3 | -0.3 |
| 7일 | (7-2) * -0.3 | -1.5 |
| 20일+ | (20-2) * -0.3 → cap | -5.0 (최대) |

**코드 참조**: `active-days-calculator.ts:86-138`

```typescript
async calculateInactivityPenalty(userId: string): Promise<number> {
  const lastActivityDate = await this.getLastActivityDate(userId);
  if (!lastActivityDate) return 0;

  const threshold = this.config.inactivityPenaltyThreshold; // 3
  const penaltyPerDay = this.config.inactivityPenaltyPerDay; // 0.3
  const maxPenalty = this.config.inactivityPenaltyMax; // 5.0

  const daysSince = Math.floor(
    (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince < threshold) {
    return 0;
  }

  const penalty = -(daysSince - threshold + 1) * penaltyPerDay;
  const cappedPenalty = Math.max(penalty, -maxPenalty);

  console.log(`📉 [Inactivity Penalty] ${userId}: ${daysSince}일 비활동 → ${cappedPenalty.toFixed(1)}점`);

  return cappedPenalty;
}
```

#### 10-3. 최종 점수 계산 및 순위 결정

**최종 점수 공식**:
```typescript
finalScore = (기본 점수 × 커뮤니티 가중치) + activeDaysScore + activityBonus + inactivityPenalty
```

**코드 참조**: `leaderboard-generator.ts:410-476`

```typescript
// 1. 기본 점수 (커뮤니티 가중치 적용됨)
const baseScore = user.totalScore;

// 2. 동점자 점수 (Active Days)
const activeDaysScore = user.activeDays * 0.1;

// 3. Activity Bonus (최근 7일 활동)
const activityBonus = await this.activeDaysCalculator.calculateActivityBonus(user.userId);

// 4. Inactivity Penalty (비활동 기간)
const inactivityPenalty = await this.activeDaysCalculator.calculateInactivityPenalty(user.userId);

// 5. 최종 점수 (🆕 최솟값 0 제한 - 2025-11-26)
const rawFinalScore = baseScore + activeDaysScore + activityBonus + inactivityPenalty;
user.finalScore = Math.max(0, Math.round(rawFinalScore * 10) / 10);

console.log(`[Final Score] ${user.username}:
  base: ${baseScore.toFixed(1)},
  activeDays: ${activeDaysScore.toFixed(1)},
  bonus: ${activityBonus.toFixed(1)},
  penalty: ${inactivityPenalty.toFixed(1)},
  final: ${user.finalScore.toFixed(1)}`
);
```

**🆕 finalScore 최솟값 0 제한** (2025-11-26 추가):
- 장기 비활동 사용자의 점수가 음수가 되는 것을 방지
- 복귀 사용자가 첫 활동에서 즉시 양수 점수 획득 가능
- 리더보드에 음수 점수 표시 방지로 사용자 경험 개선

**순위 결정 로직**:
1. `finalScore` 내림차순 정렬 (높은 점수 = 높은 순위)
2. 동점자의 경우 `activeDays` 내림차순 (많은 활동일 = 높은 순위)
3. 여전히 동점이면 `userId` 오름차순 (일관성 보장)

**🆕 하이브리드 순위 시스템** (2025-11-29 추가):
- **양수 점수 (> 0)**: Ordinal Ranking (모든 사용자에게 고유 순위)
- **0점**: Standard Competition Ranking (동점자 동일 순위)

```typescript
users.sort((a, b) => {
  // 1순위: finalScore
  if (b.finalScore !== a.finalScore) {
    return b.finalScore - a.finalScore;
  }

  // 2순위: activeDays (동점자 처리)
  if (b.activeDays !== a.activeDays) {
    return b.activeDays - a.activeDays;
  }

  // 3순위: userId (일관성 보장)
  return a.userId.localeCompare(b.userId);
});

// 🆕 하이브리드 순위 할당 (2025-11-29)
let currentRank = 1;
for (let i = 0; i < users.length; i++) {
  if (i > 0) {
    const currentScore = users[i].finalScore;
    const prevScore = users[i-1].finalScore;

    if (currentScore > 0) {
      // 양수 점수: 항상 고유 순위 (Ordinal Ranking)
      currentRank = i + 1;
    } else if (Math.abs(currentScore - prevScore) > 0.001) {
      // 0점: 점수가 다를 때만 순위 증가 (Standard Competition)
      currentRank = i + 1;
    }
    // 0점이고 이전 사용자도 0점이면 동일 순위 유지
  }
  users[i].rank = currentRank;
}
```

#### 10-4. Verified Community Member 플래그

**동작**:
1. DynamoDB에서 `COMMUNITY_MEMBERS` 목록 조회
2. 각 사용자의 `twitterId`가 목록에 있는지 확인
3. `isCommunityMember: true/false` 플래그 추가

**목록 생성**: `nasun-sync-community-members` Lambda (매일 00:00 KST 실행)
- `UserProfiles` 테이블 스캔
- `twitterId` 있는 사용자 추출
- `nasun-leaderboard-data` 테이블에 저장

**프론트엔드 표시**: ✓ 뱃지

#### 10-5. 리더보드 저장

**DynamoDB 스키마**:
```json
{
  "pk": "LEADERBOARD#CUMULATIVE#2025-10-28",
  "sk": "RANK#0001",
  "userId": "1234567890",
  "username": "johndoe",
  "displayName": "John Doe",
  "profileImageUrl": "https://...",
  "followersCount": 1500,
  "dominantLanguage": "ko",
  "rank": 1,
  "finalScore": 132.5,
  "totalScore": 125.8,
  "totalLikes": 50,
  "totalReplies": 20,
  "totalReposts": 30,
  "totalQuotes": 25,
  "totalMentions": 25,
  "activeDays": 45,
  "activeDaysScore": 4.5,
  "activeDaysLast7": 6,
  "activityBonus": 1.1,
  "daysSinceLastActivity": 0,
  "inactivityPenalty": 0.0,
  "communityWeight": 4.52,
  "isCommunityMember": true,
  "lastUpdated": "2025-10-28T00:10:05.123Z",
  "version": "v2"
}
```

**이벤트 리더보드**: `pk: "LEADERBOARD#EVENT1#2025-10-28"` (기간 필터 적용)

---

## 점수 계산 공식 완전 가이드

### 1. 기본 인게이지먼트 점수

각 인게이지먼트 타입별로 기본 점수가 설정되어 있습니다.

```typescript
likes: 0.2      // 좋아요
replies: 0.4    // 답글
reposts: 0.4    // 리트윗
quotes: 0.6     // 인용 트윗
mentions: 0.5   // 멘션
```

**예시**:
- 사용자가 50개 좋아요, 20개 답글, 10개 리트윗을 받음
- 기본 점수 = (50 × 0.2) + (20 × 0.4) + (10 × 0.4) = 10 + 8 + 4 = 22점

### 2. 커뮤니티 가중치 적용

**한국 커뮤니티** (팔로워 10,000명 가정):
```
followerWeight = log(10001) / log(8) = 4.43
finalWeight = 4.43 × 1.02 = 4.52
가중치 적용 점수 = 22 × 4.52 = 99.4점
```

**글로벌 커뮤니티** (팔로워 10,000명 가정):
```
followerWeight = log(10001) / log(30) = 2.71
finalWeight = 2.71 × 1.0 = 2.71
가중치 적용 점수 = 22 × 2.71 = 59.6점
```

### 3. Active Days 점수 추가

최근 60일 중 45일 활동한 경우:
```
activeDaysScore = 45 × 0.1 = 4.5점
```

### 4. Activity Bonus 추가

최근 7일 중 6일 활동한 경우:
```
activityBonus = (6 - 3 + 1) × 0.28 = 4 × 0.28 = 1.1점
```

### 5. Inactivity Penalty 없음

마지막 활동이 오늘인 경우:
```
inactivityPenalty = 0.0점
```

### 6. 최종 점수

```
finalScore = 99.4 + 4.5 + 1.1 + 0.0 = 105.0점
```

**종합 예시 (한국 커뮤니티, 팔로워 10,000명)**:
```
[1] 기본 인게이지먼트 점수: 22점
    - 좋아요 50개: 10점
    - 답글 20개: 8점
    - 리트윗 10개: 4점

[2] 커뮤니티 가중치 적용: 22 × 4.52 = 99.4점

[3] Active Days 점수: 45일 × 0.1 = 4.5점

[4] Activity Bonus: 6일 활동 → +1.1점

[5] Inactivity Penalty: 0일 비활동 → 0.0점

===========================================
최종 점수: 105.0점
순위 결정 기준: finalScore (105.0) → activeDays (45) → userId
```

---

## 데이터 흐름 및 DynamoDB 스키마

### 주요 테이블: `nasun-leaderboard-data`

#### 1. 인게이지먼트 데이터 (RECENT#)

```json
{
  "pk": "RECENT#{tweetId}#{userId}",
  "sk": "RECENT#{tweetId}#{userId}",
  "tweet_id": "1234567890",
  "engagement_type": "like|reply|repost|quote|mention",
  "engaging_user_id": "user123",
  "engaging_username": "johndoe",
  "engaging_display_name": "John Doe",
  "engaging_profile_image_url": "https://...",
  "engaging_followers_count": 1500,
  "tweet_created_at": "2025-10-25T12:00:00.000Z",
  "added_at": "2025-10-28T00:10:05.123Z",
  "lastProcessedDate": "2025-10-28",
  "ttl": 1730678405
}
```

**TTL**: 7일 자동 삭제

#### 2. 답글 카운터 (REPLY#)

```json
{
  "pk": "REPLY#{targetTweetId}#{userId}",
  "sk": "REPLY#{targetTweetId}#{userId}",
  "targetTweetId": "1234567890",
  "userId": "user123",
  "username": "johndoe",
  "replyCount": 2,
  "shouldCount": true,
  "addedAt": "2025-10-28T00:10:05.123Z",
  "ttl": 1730678405
}
```

**TTL**: 365일

#### 3. 누적 점수 (CUMULATIVE_SCORE)

```json
{
  "pk": "USER#{userId}",
  "sk": "CUMULATIVE_SCORE",
  "userId": "1234567890",
  "username": "johndoe",
  "displayName": "John Doe",
  "profileImageUrl": "https://...",
  "followersCount": 1500,
  "dominantLanguage": "ko",
  "totalScore": 125.8,
  "totalLikes": 50,
  "totalReplies": 20,
  "totalReposts": 30,
  "totalQuotes": 25,
  "totalMentions": 25,
  "activeDays": 45,
  "firstActivity": "2025-10-01",
  "lastUpdated": "2025-10-28T00:10:05.123Z",
  "version": "v2"
}
```

#### 4. 리더보드 (LEADERBOARD#)

```json
{
  "pk": "LEADERBOARD#CUMULATIVE#2025-10-28",
  "sk": "RANK#0001",
  "userId": "1234567890",
  "username": "johndoe",
  "displayName": "John Doe",
  "profileImageUrl": "https://...",
  "followersCount": 1500,
  "dominantLanguage": "ko",
  "rank": 1,
  "finalScore": 132.5,
  "totalScore": 125.8,
  "totalLikes": 50,
  "totalReplies": 20,
  "totalReposts": 30,
  "totalQuotes": 25,
  "totalMentions": 25,
  "activeDays": 45,
  "activeDaysScore": 4.5,
  "activeDaysLast7": 6,
  "activityBonus": 1.1,
  "daysSinceLastActivity": 0,
  "inactivityPenalty": 0.0,
  "communityWeight": 4.52,
  "isCommunityMember": true,
  "lastUpdated": "2025-10-28T00:10:05.123Z",
  "version": "v2"
}
```

**TTL**: 365일

#### 5. 인증된 멤버 목록 (COMMUNITY_MEMBERS)

```json
{
  "pk": "COMMUNITY_MEMBERS",
  "sk": "MEMBER#{twitterId}",
  "twitterId": "1234567890",
  "identityId": "ap-northeast-2:...",
  "username": "johndoe",
  "displayName": "John Doe",
  "lastUpdated": "2025-10-28T00:00:05.123Z"
}
```

#### 6. 랭킹 히스토리 (RANK_HISTORY#)

```json
{
  "pk": "USER#{userId}",
  "sk": "RANK_HISTORY#CUMULATIVE#2025-10-28",
  "userId": "1234567890",
  "username": "johndoe",
  "period": "CUMULATIVE",
  "date": "2025-10-28",
  "rank": 1,
  "finalScore": 132.5,
  "totalLikes": 50,
  "totalReplies": 20,
  "totalReposts": 30,
  "totalQuotes": 25,
  "totalMentions": 25,
  "displayName": "John Doe",
  "profileImageUrl": "https://...",
  "followersCount": 1500,
  "dominantLanguage": "ko",
  "ttl": 1730678405,
  "lastUpdated": "2025-10-28T00:10:05.123Z"
}
```

**TTL**: 90일

---

## 환경 변수 설정

> **참고**: 아래 환경 변수들은 `cdk/.env` 파일에 명시적으로 설정하지 않아도 됩니다.
> `cdk/lambda-src/x-leaderboard/src/utils/env.ts`에서 기본값이 정의되어 있어 자동 적용됩니다.
> 값을 변경하려면 `cdk/.env`에 추가하면 됩니다.

### 점수 가중치

```bash
SCORE_WEIGHT_LIKES=0.2
SCORE_WEIGHT_REPLIES=0.4
SCORE_WEIGHT_REPOSTS=0.4
SCORE_WEIGHT_QUOTES=0.6
SCORE_WEIGHT_MENTIONS=0.5
```

### 커뮤니티 가중치

```bash
COMMUNITY_WEIGHT_ENABLED=true

# 한국 커뮤니티
KOREAN_LOG_BASE=8
KOREAN_LANGUAGE_MULTIPLIER=1.02
KOREAN_MAX_CAP=5.0

# 글로벌 커뮤니티
GLOBAL_LOG_BASE=30
GLOBAL_LANGUAGE_MULTIPLIER=1.0
GLOBAL_MAX_CAP=4.0
```

### Active Days Tie-Breaker

```bash
ENABLE_ACTIVE_DAYS_TIE_BREAKER=true
ACTIVE_DAYS_PERIOD=60
ACTIVE_DAYS_WEIGHT=0.1
ACTIVE_DAYS_MIN_ACTIVITIES=1
```

### Activity Bonus/Penalty System

```bash
ACTIVITY_BONUS_ENABLED=true
ACTIVITY_BONUS_WEIGHT_PER_DAY=0.28
ACTIVITY_BONUS_THRESHOLD_DAYS=3
ACTIVITY_BONUS_PERIOD_DAYS=7

INACTIVITY_PENALTY_ENABLED=true
INACTIVITY_PENALTY_THRESHOLD=3
INACTIVITY_PENALTY_PER_DAY=0.3
INACTIVITY_PENALTY_MAX=5.0
```

### 이벤트 기간

```bash
EVENT1_START_DATE=2025-10-19
EVENT1_END_DATE=2025-11-18
EVENT2_START_DATE=2025-11-19
EVENT2_END_DATE=2025-12-10
```

### TTL 설정

```bash
RECENT_ACTIVITY_TTL_DAYS=7        # RECENT# 레코드
DAILY_SNAPSHOT_TTL_DAYS=365       # LEADERBOARD# 레코드
REPLY_COUNTER_TTL_DAYS=365        # REPLY# 레코드
MENTION_TTL_DAYS=365              # 멘션 관련
PROFILE_CACHE_TTL_DAYS=7          # 프로필 캐시
```

---

## 멱등성 보장 메커니즘

### 핵심 개념: targetDate vs added_at

| 항목 | `targetDate` / `lastProcessedDate` | `added_at` |
|------|-----------------------------------|------------|
| 의미 | 논리적 날짜 (언제 수집했어야 했는가) | 물리적 시각 (실제로 언제 수집했는가) |
| 형식 | YYYY-MM-DD | ISO 8601 |
| 용도 | **리더보드 집계** | 디버깅, 감사 |
| 설정 방법 | 파이프라인 입력 파라미터 | 자동 생성 (현재 시각) |
| 변경 가능 | ✅ 복구 시 과거 날짜 지정 가능 | ❌ 자동 생성 (변경 불가) |

### 중복 방지 로직

**파일**: `delta-calculator.ts:408-429`

```typescript
// 1. 오늘 이미 처리된 활동 조회
const previousEngagements = await this.loadPreviousEngagements();

// 2. 새로 수집된 데이터와 비교
const { addedEngagements, removedEngagements } = this.identifyChanges(
  currentEngagements,
  previousEngagements
);

// 3. 순수 신규 활동만 점수 계산
const userDeltas = await this.calculateUserDeltas(
  addedEngagements,
  recentRemovedEngagements
);

// 4. 점수 계산 완료 후 활동 기록 저장
await this.saveProcessedEngagements(addedEngagements, collectionDate);
```

### 복구 시나리오

**정상 실행**:
```json
{
  "targetDate": "2025-10-21"
}
```
→ `lastProcessedDate: "2025-10-21"` 저장

**장애 복구** (2025-10-23 09:30에 10-21 데이터 복구):
```json
{
  "targetDate": "2025-10-21"
}
```
→ `lastProcessedDate: "2025-10-21"` 저장
→ `added_at: "2025-10-23T09:30:00Z"` (디버깅용)

**결과**: 복구 시점과 관계없이 일관된 이벤트 리더보드에 포함 ✅

---

## ⚠️ 제한사항 및 알려진 이슈

### 1. 데이터 수집 제한사항

#### 멘션, 좋아요, 리트윗 수집
- **페이지네이션 구현 ✅**: Mentions, Likes, Retweets 수집 기능에 페이지네이션이 구현되어, 환경 변수에 설정된 값(기본 1,000개)까지 데이터를 수집할 수 있습니다.

#### 인용(Quote) 수집
- **페이지네이션 미구현 ⚠️**: 인용 트윗(`quotes`)을 수집하는 기능은 아직 페이지네이션이 구현되지 않아, **트윗당 최신 100개**까지만 수집되는 제한이 남아있습니다.

---

### 2. X API Rate Limit 제약

**Basic Plan 제한**:
- Likes/Retweets/Quotes: **5 requests / 15분**
- Tweet Search: **60 requests / 15분**
- User Timeline: **15 requests / 15분**

**영향**:
- 트윗 배치 크기: 최대 5개로 제한
- 15분 대기 시간 필수
- 전체 파이프라인 실행: 약 15-20분 소요

**대응**:
- 적응형 대기 시간 (1개 트윗: 45분, 20개+: 15분)
- Phase 3 병렬 실행 (Passive/Active 브랜치)
- Rate Limit 헤더 모니터링

---

## 참고 문서

- **점수 메트릭**: [LEADERBOARD_SCORING-METRICS_v2.3.md](LEADERBOARD_SCORING-METRICS_v2.3.md)
- **리더보드 메커니즘**: [LEADERBOARD_MECHANISM_GUIDE.md](LEADERBOARD_MECHANISM_GUIDE.md)
- **시스템 종합**: [LEADERBOARD_SYSTEM_COMPREHENSIVE.md](LEADERBOARD_SYSTEM_COMPREHENSIVE.md)
- **Activity Bonus/Penalty**: [ACTIVITY_BONUS_PENALTY_IMPLEMENTATION_PLAN.md](ACTIVITY_BONUS_PENALTY_IMPLEMENTATION_PLAN.md)

---

**문서 종료**
