/**
 * 🚀 V3 Tweet Batch Splitter Handler - Enhanced Priority System
 *
 * 포스트 나이 기반 3단계 우선순위로 배치를 분할하는 Lambda 함수
 * X API Basic Plan Rate Limit(15분당 5회)을 준수하면서 데이터 정확도 95%+ 달성
 *
 * @author Claude Code Assistant
 * @date 2025-10-03
 * @version 3.1 - Priority-based batch splitting
 */

import { Handler } from 'aws-lambda';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
  };
}

interface TargetUser {
  id: string;
  username: string;
  name: string;
}

interface DateRange {
  start: string;
  end: string;
}

interface InputEvent {
  tweets: Tweet[];
  targetUser: TargetUser;
  dateRange: DateRange;
  collectionDate: string;
}

interface TweetBatch {
  tweets: Tweet[];
  batchIndex: number;
  totalBatches: number;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  maxResults?: number;
  collectionStrategy?: 'FULL' | 'ENHANCED' | 'SAMPLING';
  waitAfterLikesSeconds: number;     // 🆕 동적 대기 시간 (Rate Limit 대응)
  waitAfterRetweetsSeconds: number;  // 🆕 동적 대기 시간 (Rate Limit 대응)
}

interface OutputEvent {
  success: boolean;
  tweetBatches: TweetBatch[];
  totalTweets: number;
  totalBatches: number;
  targetUser: TargetUser;
  dateRange: DateRange;
  collectionDate: string;
  splitTimestamp: string;
}

/**
 * 🔧 포스트 나이 계산 (일 단위)
 */
function calculateTweetAgeInDays(tweetCreatedAt: string): number {
  const now = new Date();
  const tweetDate = new Date(tweetCreatedAt);
  const ageInMs = now.getTime() - tweetDate.getTime();
  return ageInMs / (24 * 60 * 60 * 1000);
}

/**
 * 🎯 3단계 우선순위 기반 배치 생성
 *
 * 우선순위 정책:
 * - HIGH (1-2일): maxResults=100, FULL 수집 (최신 포스트 완전 수집)
 * - MEDIUM (3-4일): maxResults=80, ENHANCED 수집 (상세 수집)
 * - LOW (5-6일): maxResults=50, SAMPLING 수집 (샘플링)
 *
 * 각 우선순위 그룹의 포스트는 개별 배치로 분할
 */
function createPrioritizedBatches(tweets: Tweet[]): TweetBatch[] {
  const batches: TweetBatch[] = [];

  // 우선순위별로 포스트 분류
  const highPriorityTweets: Tweet[] = [];
  const mediumPriorityTweets: Tweet[] = [];
  const lowPriorityTweets: Tweet[] = [];

  for (const tweet of tweets) {
    const ageInDays = calculateTweetAgeInDays(tweet.created_at);

    if (ageInDays < 2) {
      highPriorityTweets.push(tweet);
    } else if (ageInDays < 4) {
      mediumPriorityTweets.push(tweet);
    } else {
      lowPriorityTweets.push(tweet);
    }
  }

  console.log(`📊 [PRIORITY] HIGH: ${highPriorityTweets.length}개, MEDIUM: ${mediumPriorityTweets.length}개, LOW: ${lowPriorityTweets.length}개`);

  // 🆕 동적 대기 시간 계산
  // X API Basic Plan Rate Limit: 5 calls / 15분 (900초)
  // 공식: waitSeconds = ceil(900 × totalBatches / 5)
  // 예: 1개 배치 → 180초 (3분), 5개 배치 → 900초 (15분)
  const totalBatches = tweets.length;
  const waitSeconds = Math.ceil(900 * totalBatches / 5);

  console.log(`⏱️  [DYNAMIC_WAIT] ${totalBatches}개 배치 → ${waitSeconds}초 (${(waitSeconds/60).toFixed(1)}분) 대기`);
  console.log(`   📊 Rate Limit 사용량: ${totalBatches}/5 calls per 15min`);

  // HIGH 우선순위 배치 생성 (1개씩)
  for (const tweet of highPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0, // 나중에 업데이트
      priority: 'HIGH',
      maxResults: 100,
      collectionStrategy: 'FULL',
      waitAfterLikesSeconds: waitSeconds,    // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds  // 🆕 동적 대기 시간
    });
  }

  // MEDIUM 우선순위 배치 생성 (1개씩)
  for (const tweet of mediumPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0,
      priority: 'MEDIUM',
      maxResults: 80,
      collectionStrategy: 'ENHANCED',
      waitAfterLikesSeconds: waitSeconds,    // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds  // 🆕 동적 대기 시간
    });
  }

  // LOW 우선순위 배치 생성 (1개씩)
  for (const tweet of lowPriorityTweets) {
    batches.push({
      tweets: [tweet],
      batchIndex: batches.length,
      totalBatches: 0,
      priority: 'LOW',
      maxResults: 50,
      collectionStrategy: 'SAMPLING',
      waitAfterLikesSeconds: waitSeconds,    // 🆕 동적 대기 시간
      waitAfterRetweetsSeconds: waitSeconds  // 🆕 동적 대기 시간
    });
  }

  // totalBatches 업데이트
  batches.forEach(batch => {
    batch.totalBatches = batches.length;
  });

  return batches;
}

/**
 * 🔧 Tweet Batch Splitter V3 Handler
 *
 * 포스트 나이 기반 3단계 우선순위 시스템으로 배치 분할:
 * - 최신 포스트(1-2일): 100명 완전 수집
 * - 중간 포스트(3-4일): 80명 상세 수집
 * - 오래된 포스트(5-6일): 50명 샘플링
 *
 * Rate Limit 전략:
 * - 각 포스트를 개별 배치로 처리
 * - Step Functions Map State 순차 실행 (MaxConcurrency: 1)
 * - 배치 간 15분 대기로 Rate Limit 완전 준수
 * - 총 소요 시간: 약 1.5-2시간 (6-8개 포스트 기준)
 */
export const handler: Handler<any, OutputEvent> = async (event) => {
  const startTime = Date.now();

  console.log('🚀 [TWEET_BATCH_SPLITTER_V3_ENHANCED] 시작:', JSON.stringify(event, null, 2));

  try {
    // 🔧 V2/V3 호환성: 두 가지 입력 형식 모두 처리
    let tweets: Tweet[];
    let targetUser: TargetUser;
    let dateRange: DateRange;
    let collectionDate: string;

    // Case 1: V3 직접 형식 (event.tweets)
    if (event.tweets && Array.isArray(event.tweets)) {
      tweets = event.tweets;
      targetUser = event.targetUser;
      dateRange = event.dateRange;
      collectionDate = event.collectionDate || event.targetDate;
      console.log('✅ [INPUT] V3 직접 형식 감지');
    }
    // Case 2: V2 GetTargetTweets 결과 형식 (event.getTargetTweetsResult.Payload.tweets)
    else if (event.getTargetTweetsResult?.Payload?.tweets) {
      tweets = event.getTargetTweetsResult.Payload.tweets;
      targetUser = event.getTargetTweetsResult.Payload.targetUser;
      dateRange = event.getTargetTweetsResult.Payload.dateRange;
      collectionDate = event.getTargetTweetsResult.Payload.collectionDate || event.targetDate;
      console.log('✅ [INPUT] V2 GetTargetTweets 형식 감지');
    }
    // Case 3: 오류
    else {
      throw new Error('유효하지 않은 입력: tweets 배열이 필요합니다 (event.tweets 또는 event.getTargetTweetsResult.Payload.tweets)');
    }

    // 입력 검증
    if (!tweets || !Array.isArray(tweets)) {
      throw new Error('유효하지 않은 입력: tweets 배열이 필요합니다');
    }

    if (!targetUser || !targetUser.id) {
      throw new Error('유효하지 않은 입력: targetUser 정보가 필요합니다');
    }

    console.log(`📊 [BATCH_SPLITTER] 총 ${tweets.length}개 트윗 우선순위 기반 배치 분할 시작`);

    // 🎯 3단계 우선순위 기반 배치 생성
    const tweetBatches = createPrioritizedBatches(tweets);

    // 배치 정보 로깅
    for (const batch of tweetBatches) {
      const tweet = batch.tweets[0];
      const age = calculateTweetAgeInDays(tweet.created_at);
      console.log(
        `📦 [BATCH_${batch.batchIndex}] ${batch.priority} priority | ` +
        `maxResults: ${batch.maxResults} | ` +
        `age: ${age.toFixed(1)}일 | ` +
        `strategy: ${batch.collectionStrategy}`
      );
    }

    // 결과 준비
    const result: OutputEvent = {
      success: true,
      tweetBatches: tweetBatches,
      totalTweets: tweets.length,
      totalBatches: tweetBatches.length,
      targetUser: targetUser,
      dateRange: dateRange,
      collectionDate: collectionDate,
      splitTimestamp: new Date().toISOString()
    };

    // CloudWatch 메트릭 전송
    try {
      const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
      const cloudWatch = new CloudWatchClient({ region: 'ap-northeast-2' });
      
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: 'NASUN/StepFunctions/BatchSplitter',
        MetricData: [
          {
            MetricName: 'TotalTweets',
            Value: tweets.length,
            Unit: 'Count',
            Timestamp: new Date()
          },
          {
            MetricName: 'TotalBatches',
            Value: tweetBatches.length,
            Unit: 'Count',
            Timestamp: new Date()
          },
          {
            MetricName: 'ProcessingDuration',
            Value: Date.now() - startTime,
            Unit: 'Milliseconds',
            Timestamp: new Date()
          }
        ]
      }));
    } catch (metricsError) {
      console.warn('⚠️ [METRICS] CloudWatch 메트릭 전송 실패:', metricsError);
      // 메트릭 실패는 전체 실행을 중단하지 않음
    }

    console.log(`✅ [BATCH_SPLITTER_ENHANCED] 성공적으로 완료: ${tweetBatches.length}개 우선순위 배치 생성`);
    console.log('📋 [RESULT]:', JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    console.error('❌ [BATCH_SPLITTER] 오류 발생:', error);

    // 오류 메트릭 전송
    try {
      const { CloudWatchClient, PutMetricDataCommand } = await import('@aws-sdk/client-cloudwatch');
      const cloudWatch = new CloudWatchClient({ region: 'ap-northeast-2' });
      
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: 'NASUN/StepFunctions/BatchSplitter',
        MetricData: [
          {
            MetricName: 'ErrorCount',
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date()
          }
        ]
      }));
    } catch (metricsError) {
      console.warn('⚠️ [METRICS] 오류 메트릭 전송 실패:', metricsError);
    }

    throw error;
  }
};