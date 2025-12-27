/**
 * 🚀 High Engagement Reply Collector Handler
 *
 * 높은 인게이지먼트 포스트의 답글을 심층 수집하는 Lambda 함수
 * Phase 3: 답글 심층 수집
 *
 * @author Claude Code Assistant
 * @date 2025-10-05
 * @version 1.0
 */

import { Handler } from 'aws-lambda';
import { TwitterApiService } from '../../services/twitter-api';
import { secureTokenManager } from '../../services/secure-token-manager';
import { getEnvConfigV2 } from '../../utils/env';

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

interface InputEvent {
  tweets: Tweet[];
  targetUser: TargetUser;
}

interface OutputEvent {
  success: boolean;
  repliesCollected: number;
  tweetsProcessed: number;
  highEngagementTweets: Array<{
    tweetId: string;
    likeCount: number;
    repliesFound: number;
  }>;
  processingDuration: number;
  timestamp: string;
}

/**
 * 🔧 High Engagement Reply Collector Handler
 *
 * 높은 인게이지먼트 포스트 필터링 및 답글 수집:
 * - 좋아요 100개 이상 포스트 자동 감지
 * - 최대 3개 포스트 선택
 * - 각 포스트의 답글 100개 수집
 *
 * Rate Limit:
 * - ReplyCounterService 활용 (기존 검증된 로직)
 * - 포스트당 답글 조회는 여유 있는 API 사용
 */
export const handler: Handler<InputEvent, OutputEvent> = async (event) => {
  const startTime = Date.now();

  console.log('💬 [COLLECT_HIGH_ENGAGEMENT_REPLIES] 시작:', JSON.stringify(event, null, 2));

  try {
    // 입력 검증
    if (!event.tweets || !Array.isArray(event.tweets)) {
      throw new Error('유효하지 않은 입력: tweets 배열이 필요합니다');
    }

    const { tweets, targetUser } = event;

    // 높은 인게이지먼트 포스트 필터링 (좋아요 100개 이상)
    const highEngagementTweets = tweets
      .filter(tweet => (tweet.public_metrics?.like_count || 0) >= 100)
      .sort((a, b) => (b.public_metrics?.like_count || 0) - (a.public_metrics?.like_count || 0))
      .slice(0, 3); // 최대 3개

    console.log(`📊 [FILTER] ${tweets.length}개 중 ${highEngagementTweets.length}개 높은 인게이지먼트 포스트 발견`);

    // 높은 인게이지먼트 포스트가 없는 경우
    if (highEngagementTweets.length === 0) {
      console.log('ℹ️ [NO_HIGH_ENGAGEMENT] 좋아요 100개 이상 포스트 없음');
      return {
        success: true,
        repliesCollected: 0,
        tweetsProcessed: 0,
        highEngagementTweets: [],
        processingDuration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }

    // Twitter API 서비스 초기화
    const secureTokens = await secureTokenManager.getTokens();
    const config = getEnvConfigV2();
    const twitterService = new TwitterApiService(config, secureTokens);

    const results: Array<{
      tweetId: string;
      likeCount: number;
      repliesFound: number;
    }> = [];

    let totalRepliesCollected = 0;

    const allReplies: EngagementData[] = [];

    // 각 높은 인게이지먼트 포스트의 답글 수집
    for (const tweet of highEngagementTweets) {
      try {
        const likeCount = tweet.public_metrics?.like_count || 0;
        console.log(`💬 [TWEET_${tweet.id}] 답글 수집 시작 (좋아요: ${likeCount}개)`);

        // 답글 100개 수집 (conversation_id 검색)
        // X API search endpoint: 60회/15분 여유 있음
        const searchQuery = `conversation_id:${tweet.id} -from:${targetUser.id}`;
        const replies = await twitterService.searchRecentTweets(searchQuery, 100);

        console.log(`✅ [TWEET_${tweet.id}] ${replies.length}개 답글 수집 완료`);

        // 답글 데이터를 EngagementData 형식으로 변환
        const replyEngagements: EngagementData[] = replies.map(reply => ({
          tweet_id: tweet.id, // 원본 트윗 ID
          engagement_type: 'reply',
          engaging_user_id: reply.author_id!,
          engaging_username: reply.author?.username || 'unknown',
          engaging_display_name: reply.author?.name || 'unknown',
          engaging_profile_image_url: reply.author?.profile_image_url || '',
          engaging_followers_count: reply.author?.public_metrics?.followers_count || 0,
          added_at: new Date().toISOString(),
          tweet_created_at: tweet.created_at,
          score_value: 2.0 // 답글 기본 점수
        }));

        allReplies.push(...replyEngagements);
        totalRepliesCollected += replies.length;
        results.push({
          tweetId: tweet.id,
          likeCount: likeCount,
          repliesFound: replies.length
        });

      } catch (error) {
        console.error(`❌ [TWEET_${tweet.id}] 답글 수집 실패:`, error);
        // 개별 포스트 실패는 계속 진행
        results.push({
          tweetId: tweet.id,
          likeCount: tweet.public_metrics?.like_count || 0,
          repliesFound: 0
        });
        continue;
      }
    }

    // 결과 준비
    const result: OutputEvent = {
      success: true,
      repliesCollected: totalRepliesCollected,
      repliesData: allReplies, // ⭐ 추가: 수집된 답글 데이터 반환
      tweetsProcessed: highEngagementTweets.length,
      highEngagementTweets: results,
      processingDuration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [COLLECT_HIGH_ENGAGEMENT_REPLIES] 완료: ${highEngagementTweets.length}개 포스트, ${totalRepliesCollected}개 답글 수집`);
    console.log('📋 [RESULT]:', JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    console.error('❌ [COLLECT_HIGH_ENGAGEMENT_REPLIES] 오류 발생:', error);
    throw error;
  }
};
