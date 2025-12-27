/**
 * 🚀 V3 Mention Collector Handler
 *
 * 타겟 계정을 멘션한 포스트를 검색하고 배치로 분할하는 Lambda 함수
 * Phase 2: 멘션 포스트 수집의 첫 단계
 *
 * 수집량: 환경 변수 MAX_MENTIONS_PER_DAY로 제어 (기본값: 1000개)
 * Pagination: X API next_token으로 다중 페이지 지원
 *
 * @author Claude Code Assistant
 * @date 2025-10-03
 * @updated 2025-10-28 (Pagination 구현)
 * @version 3.1
 */

import { Handler } from 'aws-lambda';
import { TwitterApiService } from '../../services/twitter-api';
import { secureTokenManager } from '../../services/secure-token-manager';
import { getEnvConfigV2 } from '../../utils/env';

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
  targetUser: TargetUser;
  dateRange: DateRange;
  collectionDate: string;
}

interface MentionBatch {
  tweets: Array<{
    id: string;
    text: string;
    created_at: string;
    author_id?: string;
    lang?: string;  // ✅ X API lang 필드 추가
    referenced_tweets?: Array<{  // ✅ 답글/멘션 구분용 referenced_tweets 추가
      type: string;
      id: string;
    }>;
  }>;
  batchIndex: number;
  totalBatches: number;
}

interface OutputEvent {
  success: boolean;
  mentionBatches: MentionBatch[];
  totalMentions: number;
  totalBatches: number;
  targetUser: TargetUser;
  searchQuery: string;
  timestamp: string;
}

/**
 * 🔧 Mention Collector V3 Handler
 *
 * 타겟 계정 멘션 포스트 검색 및 배치 분할:
 * - X API search endpoint로 최대 100개 멘션 검색
 * - 20개씩 배치로 분할 (Rate Limit 준수)
 * - MentionDetailsCollectorV3로 전달할 배치 생성
 *
 * Rate Limit:
 * - API: /tweets/search/recent (60회/15분 - 여유 있음)
 * - 배치 크기: 20개씩 (5개 배치)
 * - 각 배치는 15분 간격으로 처리
 */
export const handler: Handler<InputEvent, OutputEvent> = async (event) => {
  const startTime = Date.now();

  console.log('🔍 [COLLECT_MENTIONS_V3] 시작:', JSON.stringify(event, null, 2));

  try {
    // 입력 검증
    if (!event.targetUser || !event.targetUser.username) {
      throw new Error('유효하지 않은 입력: targetUser.username이 필요합니다');
    }

    const { targetUser, dateRange } = event;

    // Twitter API 서비스 초기화
    const secureTokens = await secureTokenManager.getTokens();
    const config = getEnvConfigV2();
    const twitterService = new TwitterApiService(config, secureTokens);

    // 멘션 검색 쿼리 구성
    const searchQuery = `@${targetUser.username} -is:retweet`;
    console.log(`🔍 [SEARCH] 검색 쿼리: "${searchQuery}"`);
    console.log(`📅 [SEARCH] 날짜 범위: ${dateRange.start} ~ ${dateRange.end}`);

    // ⭐ V3: 멘션 포스트 검색 (환경 변수로 제어, Pagination 지원, Active 인게이지먼트 1일 전 범위)
    console.log(`⚙️ [CONFIG] 최대 수집량: ${config.maxMentionsPerDay}개`);
    const mentionTweets = await twitterService.searchRecentTweets(searchQuery, config.maxMentionsPerDay, dateRange.start, dateRange.end);

    console.log(`📊 [SEARCH_RESULT] 총 ${mentionTweets.length}개 멘션 발견`);

    // 멘션이 없는 경우
    if (mentionTweets.length === 0) {
      console.log('ℹ️ [NO_MENTIONS] 멘션 포스트 없음');
      return {
        success: true,
        mentionBatches: [],
        totalMentions: 0,
        totalBatches: 0,
        targetUser: targetUser,
        searchQuery: searchQuery,
        timestamp: new Date().toISOString()
      };
    }

    // 20개씩 배치 분할
    const BATCH_SIZE = 20;
    const mentionBatches: MentionBatch[] = [];

    for (let i = 0; i < mentionTweets.length; i += BATCH_SIZE) {
      const batchTweets = mentionTweets.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE);

      mentionBatches.push({
        tweets: batchTweets.map(tweet => ({
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author_id: tweet.author_id,
          lang: tweet.lang,  // ✅ X API lang 필드 전달
          referenced_tweets: tweet.referenced_tweets  // ✅ 답글/멘션 구분용 전달
        })),
        batchIndex: batchIndex,
        totalBatches: Math.ceil(mentionTweets.length / BATCH_SIZE)
      });

      console.log(`📦 [BATCH_${batchIndex}] ${batchTweets.length}개 멘션 포함`);
    }

    // 결과 준비
    const result: OutputEvent = {
      success: true,
      mentionBatches: mentionBatches,
      totalMentions: mentionTweets.length,
      totalBatches: mentionBatches.length,
      targetUser: targetUser,
      searchQuery: searchQuery,
      timestamp: new Date().toISOString()
    };

    console.log(`✅ [COLLECT_MENTIONS_V3] 완료: ${mentionBatches.length}개 배치 생성 (${mentionTweets.length}개 멘션)`);
    console.log('📋 [RESULT]:', JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    console.error('❌ [COLLECT_MENTIONS_V3] 오류 발생:', error);
    throw error;
  }
};
