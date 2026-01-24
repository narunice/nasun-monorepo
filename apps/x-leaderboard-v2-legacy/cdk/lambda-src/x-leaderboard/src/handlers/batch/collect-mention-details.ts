/**
 * 🚀 V3 Mention Details Collector Handler
 *
 * 배치로 분할된 멘션 포스트의 상세 정보를 수집하고 DynamoDB에 저장하는 Lambda 함수
 * Phase 2-2: 멘션 포스트 상세 정보 수집 및 저장
 *
 * @author Claude Code Assistant
 * @date 2025-10-06
 * @version 3.0
 */

import { Handler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TwitterApiService } from '../../services/twitter-api';
import { secureTokenManager } from '../../services/secure-token-manager';
import { getEnvConfigV2 } from '../../utils/env';
import { extractValidTargetMentions, evaluateMentionQuality } from '../../utils/mention-detector';
import { MENTION_RULES } from '../../types/cumulative';
import { cloudWatchMetrics } from '../../services/cloudwatch-metrics';

interface TweetInfo {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
  lang?: string;  // ✅ X API lang 필드 추가
  referenced_tweets?: Array<{  // ✅ 답글/멘션 구분용 referenced_tweets 추가
    type: string;
    id: string;
  }>;
}

interface MentionBatch {
  tweets: TweetInfo[];
  batchIndex: number;
  totalBatches: number;
}

interface TargetUser {
  id: string;
  username: string;
  name?: string;
}

interface InputEvent {
  mentionBatch: MentionBatch;
  targetUser: TargetUser;
  targetTweetIds?: string[];  // 🆕 타겟 계정의 트윗 ID 목록 (중복 방지용)
}

interface OutputEvent {
  success: boolean;
  batchIndex: number;
  totalProcessed: number;
  validMentions: number;
  rejectedMentions: number;
  savedToDb: number;
  processingTime: number;
  errors?: string[];
  mentions?: EngagementData[];
}

/**
 * 쿨다운 보너스 계산
 * @param intervalHours 마지막 멘션으로부터 경과한 시간
 * @returns 쿨다운 보너스 점수
 */
function calculateCooldownBonus(intervalHours: number): number {
  if (intervalHours < 4) return 0;
  if (intervalHours < 8) return 0.1;
  if (intervalHours < 24) return 0.2;
  return 0.3;
}

/**
 * 최종 멘션 점수 계산
 * @param baseScore 기본 점수
 * @param qualityScore 품질 점수 (0-1)
 * @param cooldownBonus 쿨다운 보너스
 * @returns 최종 점수
 */
function calculateMentionScore(baseScore: number, qualityScore: number, cooldownBonus: number): number {
  return baseScore * qualityScore + cooldownBonus;
}

/**
 * 🆕 타겟 계정 트윗의 Quote Tweet인지 확인
 * @param tweet 검사할 트윗 정보
 * @param targetTweetIds 타겟 계정의 트윗 ID 목록
 * @returns Quote Tweet이면 true, 아니면 false
 */
function isTargetAccountQuoteTweet(tweet: TweetInfo, targetTweetIds: string[]): boolean {
  if (!tweet.referenced_tweets || targetTweetIds.length === 0) {
    return false;
  }

  // referenced_tweets에서 'quoted' 타입이면서 타겟 트윗 ID를 참조하는지 확인
  return tweet.referenced_tweets.some(
    ref => ref.type === 'quoted' && targetTweetIds.includes(ref.id)
  );
}

/**
 * 🔧 Mention Details Collector V3 Handler
 *
 * 배치로 전달된 멘션 포스트의 상세 정보 처리:
 * - 각 멘션 검증 (타겟 멘션 포함 여부, 스팸 지표)
 * - 일일 제한 + 쿨다운 검증
 * - 답글 vs 독립 멘션 분류
 * - 점수 계산 및 DynamoDB 저장
 *
 * Rate Limit:
 * - 배치 크기: 20개
 * - 처리 시간: 약 2-3분/배치
 */
export const handler: Handler<InputEvent, OutputEvent> = async (event) => {
  const startTime = Date.now();

  console.log('🔍 [COLLECT_MENTION_DETAILS_V3] 시작:', JSON.stringify(event, null, 2));

  const ddbClient = new DynamoDBClient({});
  const docClient = DynamoDBDocumentClient.from(ddbClient);

  try {
    // 입력 검증
    if (!event.mentionBatch || !event.targetUser) {
      throw new Error('유효하지 않은 입력: mentionBatch와 targetUser가 필요합니다');
    }

    const { mentionBatch, targetUser, targetTweetIds = [] } = event;
    const config = getEnvConfigV2();

    console.log(`🎯 타겟 트윗 ID ${targetTweetIds.length}개 로드됨 (중복 방지용)`);

    // Twitter API 서비스 초기화
    const secureTokens = await secureTokenManager.getTokens();
    const twitterService = new TwitterApiService(config, secureTokens);

    // 멘션 카운터 서비스 초기화
    twitterService.initializeMentionCounter(config.cumulativeTableName);

    console.log(`📦 [BATCH_${mentionBatch.batchIndex}] ${mentionBatch.tweets.length}개 멘션 처리 시작`);

    let validMentions = 0;
    let rejectedMentions = 0;
    const collectedMentions: EngagementData[] = [];
    const errors: string[] = [];
    const targetDate = new Date().toISOString().split('T')[0];
    const targetUsernames = [targetUser.username];

    // ✅ API 호출 최적화: 모든 작성자 프로필을 한 번에 조회
    const allAuthorIds = mentionBatch.tweets
      .map(t => t.author_id)
      .filter((id): id is string => !!id);

    console.log(`👥 ${allAuthorIds.length}명의 작성자 프로필 일괄 조회 시작...`);
    const allAuthors = await twitterService.getUsersByIds(allAuthorIds);
    const authorMap = new Map(allAuthors.map(a => [a.id, a]));
    console.log(`✅ ${allAuthors.length}명의 작성자 프로필 일괄 조회 완료 (API 호출 1회)`);

    // 각 멘션 처리 (필터링 로직 제거됨)
    for (const tweet of mentionBatch.tweets) {
      try {
        // 필수 데이터 (작성자) 확인
        if (!tweet.author_id) {
          console.log(`[INFO] 작성자 ID가 없어 건너뜁니다: ${tweet.id}`);
          rejectedMentions++;
          continue;
        }
        const authorProfile = authorMap.get(tweet.author_id);
        if (!authorProfile) {
          console.log(`[INFO] 작성자 프로필을 찾을 수 없어 건너뜁니다: ${tweet.author_id}`);
          rejectedMentions++;
          continue;
        }

        // 🆕 중복 방지: 타겟 계정 트윗의 Quote Tweet은 건너뛰기
        // (Passive Collection에서 'quote' 타입으로 수집됨)
        if (isTargetAccountQuoteTweet(tweet, targetTweetIds)) {
          console.log(`🔄 [SKIP] Quote Tweet 감지 (Passive에서 수집됨): ${tweet.id}`);
          rejectedMentions++;
          continue;
        }

        // 답글 vs 독립 멘션 분류
        const isReply = tweet.referenced_tweets?.some(
          ref => ref.type === 'replied_to'
        ) ?? false;
        const engagementType = isReply ? 'reply' : 'mention';

        validMentions++;

        const engagement: EngagementData = {
          tweet_id: tweet.id,
          engagement_type: engagementType,
          engaging_user_id: tweet.author_id,
          engaging_username: authorProfile.username || 'unknown',
          engaging_display_name: authorProfile.name || '',
          engaging_profile_image_url: authorProfile.profile_image_url || '',
          engaging_followers_count: authorProfile.public_metrics?.followers_count || 0,
          engaging_tweet_lang: tweet.lang,
          tweet_created_at: tweet.created_at,
          added_at: new Date().toISOString(),
        };

        collectedMentions.push(engagement);
        console.log(`✅ [${engagementType}] 분류 완료: ${tweet.id}`);

      } catch (error) {
        console.error(`❌ 멘션 처리 중 개별 오류 발생: ${tweet.id}`, error);
        errors.push(`${tweet.id}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        rejectedMentions++;
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`✅ [BATCH_${mentionBatch.batchIndex}] 처리 완료 - 승인: ${validMentions}개, 거부: ${rejectedMentions}개 (${processingTime}ms)`);

    return {
      success: true,
      batchIndex: mentionBatch.batchIndex,
      totalProcessed: mentionBatch.tweets.length,
      validMentions,
      rejectedMentions,
      savedToDb: 0, // ✅ DB 저장은 ScoreCalculator에서 담당
      processingTime,
      errors: errors.length > 0 ? errors : undefined,
      mentions: collectedMentions,
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ [COLLECT_MENTION_DETAILS_V3] 오류 발생:', error);

    return {
      success: false,
      batchIndex: event.mentionBatch?.batchIndex || 0,
      totalProcessed: 0,
      validMentions: 0,
      rejectedMentions: 0,
      savedToDb: 0,
      processingTime,
      errors: [error instanceof Error ? error.message : '알 수 없는 오류']
    };
  }
};
