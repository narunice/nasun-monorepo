/**
 * 🚀 V3 Collect Quotes Handler
 * 
 * X API Basic Plan Rate Limit를 준수하여 트윗의 인용 트윗을 수집하는 Lambda 함수
 * 5회/15분 제한을 안전하게 관리하며 Rate Limit 헤더를 모니터링합니다.
 * 
 * @author Claude Code Assistant
 * @date 2025-09-29
 * @version 3.0
 */

import { Handler } from 'aws-lambda';
import { TwitterApiService } from '../../services/twitter-api';
import { secureTokenManager } from '../../services/secure-token-manager';
import { getEnvConfigV2, SNAPSHOT_CONFIG } from '../../utils/env';
import { EngagementData } from '../../types/cumulative';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { SnapshotTracker } from '../../utils/snapshot-tracker';

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

interface TweetBatch {
  tweets: Tweet[];
  batchIndex: number;
  totalBatches: number;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  maxResults?: number;
  collectionStrategy?: 'FULL' | 'ENHANCED' | 'SAMPLING';
}

interface InputEvent {
  tweetBatch: TweetBatch;
  targetUser: TargetUser;
  dateRange: DateRange;
}

interface OutputEvent {
  success: boolean;
  batchIndex: number;
  quotesCollected: EngagementData[];
  totalQuotes: number;
  apiCallsUsed: number;
  processingDuration: number;
  timestamp: string;
}

/**
 * 🔧 Collect Quotes V3 Handler
 * 
 * 단일 트윗 배치의 인용 트윗을 수집합니다.
 * X API Basic Plan의 엄격한 Rate Limit를 준수하여 안전하게 동작합니다.
 * 
 * 핵심 기능:
 * - 배치 내 각 트윗의 인용 트윗 수집
 * - Rate Limit 헤더 실시간 모니터링
 * - DynamoDB에 인용 데이터 저장
 * - CloudWatch 메트릭으로 API 사용량 추적
 * 
 * Rate Limit 관리:
 * - API: /tweets/:id/quote_tweets (5회/15분)
 * - 헤더 모니터링: x-rate-limit-remaining, x-rate-limit-reset
 * - 제한 도달 시 NASUN.RateLimitError 발생
 */
export const handler: Handler<InputEvent, OutputEvent> = async (event) => {
  const startTime = Date.now();
  
  console.log('💬 [COLLECT_QUOTES_V3] 시작:', JSON.stringify(event, null, 2));

  try {
    // 입력 검증
    if (!event.tweetBatch || !Array.isArray(event.tweetBatch.tweets)) {
      throw new Error('유효하지 않은 입력: tweetBatch.tweets 배열이 필요합니다');
    }

    const { tweets, batchIndex, priority, maxResults, collectionStrategy } = event.tweetBatch;
    const quotesCollected: EngagementData[] = [];
    let apiCallsUsed = 0;

    // 동적 maxResults 설정 (우선순위 기반)
    const effectiveMaxResults = maxResults || 100;

    console.log(`📊 [BATCH_${batchIndex}] ${tweets.length}개 트윗의 인용 수집 시작`);
    if (priority) {
      console.log(`   🎯 우선순위: ${priority} | maxResults: ${effectiveMaxResults} | 전략: ${collectionStrategy}`);
    }

    // Twitter API 서비스 초기화
    const secureTokens = await secureTokenManager.getTokens();
    const config = getEnvConfigV2();
    const twitterService = new TwitterApiService(config, secureTokens);
    
    // DynamoDB 클라이언트 초기화
    const tableName = process.env.CUMULATIVE_TABLE_NAME;
    if (!tableName) {
      throw new Error('CUMULATIVE_TABLE_NAME 환경변수가 설정되지 않았습니다');
    }

    const dynamoClient = new DynamoDBClient({ region: 'ap-northeast-2' });
    const docClient = DynamoDBDocumentClient.from(dynamoClient);

    // ⭐ V3: SnapshotTracker 초기화 (수집 완료 마킹용)
    const snapshotTracker = new SnapshotTracker(tableName);

    // 각 트윗의 인용 수집
    for (const tweet of tweets) {
      try {
        console.log(`💬 [TWEET_${tweet.id}] 인용 수집 시작`);


        // 인용 트윗 수집 (동적 maxResults 적용)
        const quoteTweets = await twitterService.getTweetQuotes(tweet.id, effectiveMaxResults);
        apiCallsUsed++;

        console.log(`📊 [API_CALL] ${apiCallsUsed}번째 호출 완료`);

        // 인용 데이터 처리
        if (quoteTweets && quoteTweets.length > 0) {
          for (const quoteTweet of quoteTweets) {
            let quotingUsername = 'unknown';
            let quotingDisplayName = 'unknown';
            let quotingProfileImageUrl: string | undefined;
            let quotingFollowersCount: number | undefined;

            // 인용 사용자 정보는 quoteTweet.author에서 추출
            if (quoteTweet.author) {
              quotingUsername = quoteTweet.author.username;
              quotingDisplayName = quoteTweet.author.name || quoteTweet.author.username;
              quotingProfileImageUrl = quoteTweet.author.profile_image_url;
              quotingFollowersCount = quoteTweet.author.public_metrics?.followers_count;
            }

            const quoteEngagement: EngagementData = {
              tweet_id: tweet.id,
              engagement_type: 'quote',
              engaging_user_id: quoteTweet.author_id || 'unknown',
              engaging_username: quotingUsername,
              engaging_display_name: quotingDisplayName,
              engaging_profile_image_url: quotingProfileImageUrl,
              engaging_followers_count: quotingFollowersCount,
              engaging_tweet_lang: quoteTweet.lang,  // ✅ X API lang 필드 추가 (언어 감지용)
              tweet_created_at: tweet.created_at,
              added_at: new Date().toISOString()
            };

            quotesCollected.push(quoteEngagement);
            // ✅ DB 저장 제거: 데이터는 수집만 하고 ScoreCalculator에서 저장
          }

          console.log(`✅ [TWEET_${tweet.id}] ${quoteTweets.length}개 인용 수집 완료`);

          // ⭐ V3: 수집 완료 마킹 (멱등성 보장)
          await snapshotTracker.markAsCollected(tweet.id, 'quotes', {
            tweetCreatedAt: tweet.created_at,
            collectedAt: new Date().toISOString(),
            daysElapsed: SNAPSHOT_CONFIG.passive.daysAgo,
            engagementCount: quoteTweets.length,
            collectionDate: new Date().toISOString().split('T')[0]
          });
          console.log(`🔒 [TWEET_${tweet.id}] 수집 완료 마킹 (Passive - Quotes)`);

        } else {
          // 🔍 Validation: public_metrics와 API 응답 불일치 감지
          const expectedQuoteCount = tweet.public_metrics?.quote_count || 0;

          if (expectedQuoteCount > 0) {
            console.error(`⚠️ [VALIDATION_ERROR] [TWEET_${tweet.id}] Data mismatch detected!`);
            console.error(`   Expected quotes (public_metrics): ${expectedQuoteCount}`);
            console.error(`   Actual quotes (API response): 0`);
            console.error(`   ⚠️ Possible causes: OAuth permission issue, API error, or rate limit`);
            console.error(`   🚫 NOT marking as collected to allow retry`);

            throw new Error(`Data validation failed: public_metrics.quote_count=${expectedQuoteCount} but API returned 0 quotes. Possible OAuth permission or API error.`);
          }

          // 정말 0개인 경우만 마킹
          console.log(`ℹ️ [TWEET_${tweet.id}] 인용 없음 (public_metrics도 0개로 확인)`);

          await snapshotTracker.markAsCollected(tweet.id, 'quotes', {
            tweetCreatedAt: tweet.created_at,
            collectedAt: new Date().toISOString(),
            daysElapsed: SNAPSHOT_CONFIG.passive.daysAgo,
            engagementCount: 0,
            collectionDate: new Date().toISOString().split('T')[0]
          });
          console.log(`🔒 [TWEET_${tweet.id}] 수집 완료 마킹 (Passive - Quotes, 0개)`);
        }

      } catch (error) {
        console.error(`❌ [TWEET_${tweet.id}] 인용 수집 실패:`, error);

        // Rate Limit 오류인 경우 재발생
        if (error instanceof Error && error.name === 'NASUN.RateLimitError') {
          throw error;
        }

        // 개별 트윗 실패는 계속 진행
        continue;
      }
    }

    // 결과 준비
    const result: OutputEvent = {
      success: true,
      batchIndex: batchIndex,
      quotesCollected: quotesCollected,
      totalQuotes: quotesCollected.length,
      apiCallsUsed: apiCallsUsed,
      processingDuration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    // CloudWatch 메트릭 전송
    try {
      const cloudWatch = new CloudWatchClient({ region: 'ap-northeast-2' });
      
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: 'NASUN/StepFunctions/CollectQuotes',
        MetricData: [
          {
            MetricName: 'QuotesCollected',
            Value: quotesCollected.length,
            Unit: 'Count',
            Timestamp: new Date()
          },
          {
            MetricName: 'APICallsUsed',
            Value: apiCallsUsed,
            Unit: 'Count',
            Timestamp: new Date()
          },
          {
            MetricName: 'ProcessingDuration',
            Value: result.processingDuration,
            Unit: 'Milliseconds',
            Timestamp: new Date()
          }
        ]
      }));
    } catch (metricsError) {
      console.warn('⚠️ [METRICS] CloudWatch 메트릭 전송 실패:', metricsError);
    }

    console.log(`✅ [COLLECT_QUOTES_V3] 배치 ${batchIndex} 완료: ${quotesCollected.length}개 인용 수집`);
    console.log('📋 [RESULT]:', JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    console.error('❌ [COLLECT_QUOTES_V3] 오류 발생:', error);

    // 오류 메트릭 전송
    try {
      const cloudWatch = new CloudWatchClient({ region: 'ap-northeast-2' });
      
      await cloudWatch.send(new PutMetricDataCommand({
        Namespace: 'NASUN/StepFunctions/CollectQuotes',
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