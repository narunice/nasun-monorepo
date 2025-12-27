/**
 * 언어 분석 서비스
 * 
 * Twitter API를 통해 사용자의 최근 트윗을 수집하고
 * 언어 패턴을 분석하여 커뮤니티 분류에 필요한 데이터를 제공합니다.
 */

import { 
  LanguageAnalysis, 
  ClassificationConfig, 
  DEFAULT_CONFIG, 
  LanguageCode,
  CommunityType 
} from '../types/community';
import { 
  analyzeMultipleTweets, 
  calculateFinalConfidence,
  analyzeTextDetailed 
} from '../utils/korean-text-detector';
import { TwitterApiService } from './twitter-api';

/**
 * 트윗 데이터 인터페이스 (Twitter API 응답 형태)
 */
interface TweetData {
  id: string;
  text: string;
  lang?: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    like_count: number;
    reply_count: number;
    quote_count: number;
  };
}

/**
 * 사용자 데이터 인터페이스 (Twitter API 응답 형태)
 */
interface UserData {
  id: string;
  username: string;
  name: string;
  description?: string;
  location?: string;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
  };
}

/**
 * 언어 분석 상세 결과
 */
export interface DetailedLanguageAnalysis extends LanguageAnalysis {
  tweetSamples: Array<{
    id: string;
    text: string;
    detectedLanguage: LanguageCode;
    confidence: number;
    twitterLang?: string;
  }>;
  userProfile: UserData;
  analysisMetadata: {
    totalTweetsRequested: number;
    actualTweetsAnalyzed: number;
    analysisDate: string;
    processingTimeMs: number;
  };
}

/**
 * 언어 분석 서비스 클래스
 */
export class LanguageAnalyzer {
  private twitterApi: TwitterApiService;
  private config: Required<ClassificationConfig>;

  constructor(
    twitterApi: TwitterApiService,
    config: Partial<ClassificationConfig> = {}
  ) {
    this.twitterApi = twitterApi;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 사용자의 언어 패턴을 분석
   * @param userId 분석할 사용자 ID
   * @returns 언어 분석 결과
   */
  async analyzeUserLanguage(userId: string): Promise<DetailedLanguageAnalysis> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 [LANGUAGE_ANALYZER] 사용자 ${userId} 언어 분석 시작`);

      // 1. 사용자 프로필 정보 가져오기
      const userProfile = await this.getUserProfile(userId);
      if (!userProfile) {
        throw new Error(`사용자 프로필을 찾을 수 없습니다: ${userId}`);
      }

      // 2. 사용자의 최근 트윗 수집
      const tweets = await this.getUserRecentTweets(userId);
      
      if (tweets.length < this.config.minimumTweets) {
        console.log(`⚠️ [LANGUAGE_ANALYZER] 트윗 수 부족 (${tweets.length}/${this.config.minimumTweets})`);
        
        // 트윗 수가 부족한 경우 기본값 반환
        return this.createMinimalAnalysis(userId, userProfile, tweets, startTime);
      }

      // 3. 트윗 언어 분석
      const tweetAnalysisData = tweets.map(tweet => ({
        text: tweet.text,
        lang: tweet.lang
      }));

      const languageAnalysis = analyzeMultipleTweets(tweetAnalysisData);

      // 4. 상세 분석 결과 생성
      const tweetSamples = tweets.map(tweet => {
        const detailed = analyzeTextDetailed(tweet.text, tweet.lang);
        return {
          id: tweet.id,
          text: tweet.text.substring(0, 200), // 처음 200자만
          detectedLanguage: detailed.detectedLanguage,
          confidence: detailed.confidence,
          twitterLang: tweet.lang
        };
      });

      const processingTime = Date.now() - startTime;

      console.log(`✅ [LANGUAGE_ANALYZER] 사용자 ${userId} 분석 완료: ` +
        `한국어 비율 ${(languageAnalysis.koreanRatio * 100).toFixed(1)}%, ` +
        `신뢰도 ${(languageAnalysis.confidence * 100).toFixed(1)}%`);

      return {
        ...languageAnalysis,
        tweetSamples,
        userProfile,
        analysisMetadata: {
          totalTweetsRequested: this.config.sampleTweetCount,
          actualTweetsAnalyzed: tweets.length,
          analysisDate: new Date().toISOString(),
          processingTimeMs: processingTime
        }
      };

    } catch (error) {
      console.error(`❌ [LANGUAGE_ANALYZER] 사용자 ${userId} 분석 실패:`, error);
      throw new Error(`언어 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 사용자 프로필 정보 가져오기
   * @param userId 사용자 ID
   * @returns 사용자 프로필
   */
  private async getUserProfile(userId: string): Promise<UserData | null> {
    try {
      // TwitterApiService의 getUsersByIds 메서드 사용 (단일 사용자 조회)
      const userResponseArray = await this.twitterApi.getUsersByIds([userId]);
      const userResponse = userResponseArray.length > 0 ? userResponseArray[0] : null;
      
      if (!userResponse) {
        return null;
      }

      return {
        id: userResponse.id,
        username: userResponse.username,
        name: userResponse.name,
        description: (userResponse as any).description,
        location: (userResponse as any).location,
        public_metrics: userResponse.public_metrics ? {
          followers_count: userResponse.public_metrics.followers_count || 0,
          following_count: userResponse.public_metrics.following_count || 0,
          tweet_count: userResponse.public_metrics.tweet_count || 0
        } : undefined
      };

    } catch (error) {
      console.error(`❌ [LANGUAGE_ANALYZER] 사용자 프로필 조회 실패 (${userId}):`, error);
      return null;
    }
  }

  /**
   * 사용자의 최근 트윗 수집
   * @param userId 사용자 ID
   * @returns 트윗 배열
   */
  private async getUserRecentTweets(userId: string): Promise<TweetData[]> {
    try {
      console.log(`📡 [LANGUAGE_ANALYZER] 사용자 ${userId}의 최근 트윗 ${this.config.sampleTweetCount}개 수집 중`);

      // TwitterApiService의 getUserTweets 메서드 사용 (startTime, endTime, maxResults 매개변수)
      const endTime = new Date().toISOString();
      const startTime = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString(); // 30일 전
      
      const tweetsResponse = await this.twitterApi.getUserTweets(
        userId, 
        startTime, 
        endTime, 
        this.config.sampleTweetCount
      );

      if (!tweetsResponse || tweetsResponse.length === 0) {
        console.log(`📭 [LANGUAGE_ANALYZER] 사용자 ${userId}의 트윗이 없습니다`);
        return [];
      }

      const tweets: TweetData[] = tweetsResponse.map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        lang: tweet.lang,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics
      }));

      // 텍스트가 너무 짧은 트윗 필터링 (URL만 있거나 너무 짧은 경우)
      const filteredTweets = tweets.filter(tweet => {
        const cleanText = tweet.text.replace(/https?:\/\/\S+/g, '').trim();
        return cleanText.length >= 10; // 최소 10자 이상
      });

      console.log(`📊 [LANGUAGE_ANALYZER] ${tweets.length}개 트윗 수집, ${filteredTweets.length}개 필터링 완료`);
      
      return filteredTweets;

    } catch (error) {
      console.error(`❌ [LANGUAGE_ANALYZER] 트윗 수집 실패 (${userId}):`, error);
      return [];
    }
  }

  /**
   * 트윗 수가 부족한 경우 최소 분석 결과 생성
   * @param userId 사용자 ID
   * @param userProfile 사용자 프로필
   * @param tweets 수집된 트윗
   * @param startTime 시작 시간
   * @returns 최소 분석 결과
   */
  private createMinimalAnalysis(
    userId: string,
    userProfile: UserData,
    tweets: TweetData[],
    startTime: number
  ): DetailedLanguageAnalysis {
    console.log(`⚠️ [LANGUAGE_ANALYZER] 트윗 부족으로 최소 분석 수행 (${userId})`);

    return {
      koreanRatio: 0,
      totalTweets: tweets.length,
      confidence: 0.1, // 매우 낮은 신뢰도
      languageDistribution: {
        ko: 0,
        en: 0.5,
        ja: 0,
        zh: 0,
        unknown: 0.5
      },
      dominantLanguage: 'unknown',
      tweetSamples: tweets.map(tweet => ({
        id: tweet.id,
        text: tweet.text.substring(0, 200),
        detectedLanguage: 'unknown' as LanguageCode,
        confidence: 0.1,
        twitterLang: tweet.lang
      })),
      userProfile,
      analysisMetadata: {
        totalTweetsRequested: this.config.sampleTweetCount,
        actualTweetsAnalyzed: tweets.length,
        analysisDate: new Date().toISOString(),
        processingTimeMs: Date.now() - startTime
      }
    };
  }

  /**
   * 언어 분석 결과를 바탕으로 커뮤니티 타입 추천
   * @param analysis 언어 분석 결과
   * @param profileScore 프로필 키워드 점수 (선택사항)
   * @returns 커뮤니티 타입과 신뢰도
   */
  static recommendCommunityType(
    analysis: LanguageAnalysis,
    profileScore?: number
  ): { type: CommunityType; confidence: number; reason: string } {
    const finalConfidence = calculateFinalConfidence(analysis, profileScore);
    
    // 한국 커뮤니티 판정 로직
    if (analysis.koreanRatio >= 0.6 && finalConfidence >= 0.7) {
      return {
        type: 'korean',
        confidence: finalConfidence,
        reason: `한국어 트윗 비율 ${(analysis.koreanRatio * 100).toFixed(1)}%, 높은 신뢰도`
      };
    } else if (analysis.koreanRatio >= 0.4 && finalConfidence >= 0.6) {
      return {
        type: 'korean',
        confidence: finalConfidence,
        reason: `한국어 트윗 비율 ${(analysis.koreanRatio * 100).toFixed(1)}%, 중간 신뢰도`
      };
    } else if (analysis.koreanRatio >= 0.3 && profileScore && profileScore >= 0.5) {
      return {
        type: 'korean',
        confidence: finalConfidence,
        reason: '언어 + 프로필 키워드 조합으로 한국 커뮤니티 판정'
      };
    } else {
      return {
        type: 'global',
        confidence: Math.max(1.0 - finalConfidence, 0.5),
        reason: `한국어 신호 부족 (비율: ${(analysis.koreanRatio * 100).toFixed(1)}%)`
      };
    }
  }

  /**
   * 배치 언어 분석 (여러 사용자 동시 처리)
   * @param userIds 사용자 ID 배열
   * @returns 분석 결과 배열
   */
  async analyzeBatchUsers(
    userIds: string[]
  ): Promise<Array<{ userId: string; analysis?: DetailedLanguageAnalysis; error?: string }>> {
    console.log(`🔄 [LANGUAGE_ANALYZER] 배치 분석 시작: ${userIds.length}명`);
    
    const results: Array<{ userId: string; analysis?: DetailedLanguageAnalysis; error?: string }> = [];
    
    // 동시 처리 제한 (Twitter API Rate Limit 고려)
    const batchSize = 5;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (userId) => {
        try {
          const analysis = await this.analyzeUserLanguage(userId);
          return { userId, analysis };
        } catch (error) {
          console.error(`❌ [LANGUAGE_ANALYZER] 배치 분석 실패 (${userId}):`, error);
          return { 
            userId, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate Limit 방지를 위한 지연 (필요시)
      if (i + batchSize < userIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 대기
      }
    }
    
    console.log(`✅ [LANGUAGE_ANALYZER] 배치 분석 완료: ${results.length}개 결과`);
    return results;
  }

  /**
   * 설정 업데이트
   * @param newConfig 새로운 설정
   */
  updateConfig(newConfig: Partial<ClassificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log(`🔧 [LANGUAGE_ANALYZER] 설정 업데이트:`, newConfig);
  }

  /**
   * 현재 설정 조회
   * @returns 현재 설정
   */
  getConfig(): Required<ClassificationConfig> {
    return { ...this.config };
  }
}