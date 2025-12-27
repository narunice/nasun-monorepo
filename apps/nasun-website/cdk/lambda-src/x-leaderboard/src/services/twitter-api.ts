// V2 시스템용 Twitter API 서비스 (OAuth 1.0a + Bearer Token + OAuth 2.0 삼중 인증 지원)

import { TwitterApi } from 'twitter-api-v2';
import { EnvConfig, hasValidOAuthCredentials, hasValidOAuth2Credentials, hasValidOAuth2UserTokens, getAuthenticationStrategy } from '../utils/env';
import { refreshAccessToken, isTokenExpired, calculateTokenExpiry } from '../utils/oauth2-helper';
import { EngagementData } from '../types/cumulative';
import { SecureTwitterTokens } from './secure-token-manager';
import { RateLimitMonitor, rateLimitProtected } from '../utils/rate-limit-monitor';
import { rateLimitDashboard } from './rate-limit-dashboard';
import { ReplyCounterService } from './reply-counter-service';
import { MentionCounterService } from './mention-counter-service';
import { QuoteCounterService } from './quote-counter-service';
import { extractValidTargetMentions, evaluateMentionQuality, debugMentionAnalysis } from '../utils/mention-detector';
import { calculateMentionScore, calculateCooldownBonus, MENTION_RULES } from '../types/cumulative';
import { cloudWatchMetrics } from './cloudwatch-metrics';
import { ProfileValidators, EngagementProfileData } from '../types/profile';

export interface TwitterUser {
  id: string;
  username: string;
  name: string;
  profile_image_url?: string;
  public_metrics?: {
    followers_count?: number;
    following_count?: number;
    tweet_count?: number;
    listed_count?: number;
    like_count?: number;
  };
}

export interface TwitterTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at: string;
  conversation_id?: string;
  lang?: string; // X API lang 필드 (ISO 639-1: ko, ja, en 등)
  public_metrics?: {
    retweet_count?: number;
    like_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
  referenced_tweets?: Array<{
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
  }>;
  // 🆕 True Snapshot V3 필드 (2025-10-13)
  isReply?: boolean; // 타겟의 댓글인지 여부 (conversation_id !== tweet.id 시 true, self-thread는 false)
  collectionStrategies?: ('likes' | 'quotes' | 'retweets' | 'replies' | 'mentions')[]; // 이 트윗에 적용할 수집 전략
  author?: {
    id: string;
    username: string;
    name: string;
    profile_image_url?: string;
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
      like_count?: number;
    };
  };
}

// EngagementData는 ../types/cumulative에서 import



export class TwitterApiService {
  private client: TwitterApi; // Bearer Token 클라이언트
  private oauthClient?: TwitterApi; // OAuth 1.0a 클라이언트
  private oauth2Client?: TwitterApi; // OAuth 2.0 User Context 클라이언트
  private readonly config: EnvConfig;
  private readonly authStrategy: 'oauth' | 'bearer' | 'hybrid';
  
  // OAuth 2.0 토큰 관리
  private oauth2AccessToken?: string;
  private oauth2RefreshToken?: string;
  private oauth2TokenExpiry?: Date;

  /**
   * 🔧 Phase 1.2.2: X API 응답에서 프로필 정보 검증 및 후처리
   * null/undefined 값에 대한 기본값 설정 및 검증 실패 로깅
   */
  private validateEngagementProfile(rawData: any): EngagementProfileData {
    // 기본 구조 확인
    if (!rawData || typeof rawData !== 'object') {
      console.warn('⚠️ [TWITTER_API_VALIDATION] 잘못된 프로필 데이터 구조:', rawData);
      return {
        userId: rawData?.id || 'unknown',
        username: undefined,
        displayName: undefined,
        profileImageUrl: undefined,
        followersCount: undefined
      };
    }

    const validated: EngagementProfileData = {
      userId: rawData.id || 'unknown'
    };

    // 🔧 사용자명 검증 및 정제
    if (rawData.username !== null && rawData.username !== undefined) {
      const cleanUsername = typeof rawData.username === 'string' ? rawData.username.trim() : String(rawData.username);
      if (ProfileValidators.isValidUsername(cleanUsername)) {
        validated.username = cleanUsername;
      } else {
        console.warn(`⚠️ [TWITTER_API_VALIDATION] 무효한 사용자명 필터링: "${rawData.username}" → undefined (사용자ID: ${rawData.id})`);
      }
    } else if (rawData.username === null) {
      console.warn(`⚠️ [TWITTER_API_VALIDATION] API에서 null username 수신 - 사용자ID: ${rawData.id}`);
    }

    // 🔧 표시명 검증 및 정제  
    if (rawData.name !== null && rawData.name !== undefined) {
      const cleanDisplayName = typeof rawData.name === 'string' ? rawData.name.trim() : String(rawData.name);
      if (ProfileValidators.isValidDisplayName(cleanDisplayName)) {
        validated.displayName = cleanDisplayName;
      } else {
        console.warn(`⚠️ [TWITTER_API_VALIDATION] 무효한 표시명 필터링: "${rawData.name}" → undefined (사용자ID: ${rawData.id})`);
      }
    } else if (rawData.name === null) {
      console.warn(`⚠️ [TWITTER_API_VALIDATION] API에서 null display name 수신 - 사용자ID: ${rawData.id}`);
    }

    // 🔧 프로필 이미지 URL 검증 및 정제
    if (rawData.profile_image_url !== null && rawData.profile_image_url !== undefined) {
      const cleanImageUrl = typeof rawData.profile_image_url === 'string' ? rawData.profile_image_url.trim() : String(rawData.profile_image_url);
      if (ProfileValidators.isValidProfileImageUrl(cleanImageUrl)) {
        validated.profileImageUrl = cleanImageUrl;
      } else {
        console.warn(`⚠️ [TWITTER_API_VALIDATION] 무효한 프로필 이미지 URL 필터링: "${rawData.profile_image_url}" → undefined (사용자ID: ${rawData.id})`);
      }
    } else if (rawData.profile_image_url === null) {
      console.warn(`⚠️ [TWITTER_API_VALIDATION] API에서 null profile image URL 수신 - 사용자ID: ${rawData.id}`);
    }

    // 🔧 팔로워 수 검증 및 정제
    if (rawData.public_metrics?.followers_count !== null && rawData.public_metrics?.followers_count !== undefined) {
      const followersCount = Number(rawData.public_metrics.followers_count);
      if (ProfileValidators.isValidFollowersCount(followersCount)) {
        validated.followersCount = followersCount;
      } else {
        console.warn(`⚠️ [TWITTER_API_VALIDATION] 무효한 팔로워 수 필터링: "${rawData.public_metrics.followers_count}" → undefined (사용자ID: ${rawData.id})`);
      }
    } else if (rawData.public_metrics?.followers_count === null) {
      console.warn(`⚠️ [TWITTER_API_VALIDATION] API에서 null followers count 수신 - 사용자ID: ${rawData.id}`);
    }

    // 검증 결과 로깅 (낮은 완성도의 경우만)
    const validFields = Object.keys(validated).filter(key => validated[key as keyof EngagementProfileData] !== undefined);
    if (validFields.length < 3) { // userId 포함해서 3개 미만이면 경고
      const totalFields = ['userId', 'username', 'displayName', 'profileImageUrl', 'followersCount'];
      const completeness = ((validFields.length / totalFields.length) * 100).toFixed(1);
      console.warn(`⚠️ [TWITTER_API_VALIDATION] 낮은 프로필 완성도 (${completeness}%): ${rawData.id} - 유효 필드: [${validFields.join(', ')}]`);
    }

    return validated;
  }
  
  // Phase 3: Rate Limit 모니터링 시스템 통합
  private readonly rateLimitMonitor: RateLimitMonitor;
  
  // 다중 답글 3회 집계 서비스
  private replyCounterService?: ReplyCounterService;
  
  // 멘션 일일 3회 집계 서비스 (4시간 쿨다운)
  private mentionCounterService?: MentionCounterService;
  
  // 인용 일일 5회 집계 서비스 (2시간 쿨다운) 
  private quoteCounterService?: QuoteCounterService;
  
  private readonly RATE_LIMIT_DELAY = 5000; // 5000ms (기본 API 호출 간격 - X API Basic Plan 대응으로 1s → 5s로 증가)
  private readonly CONSERVATIVE_DELAY = 180000; // 180초 (중요한 API 호출용, 60s → 180s로 증가)
  private readonly ENGAGEMENT_COLLECTION_DELAY = 180000; // 180초 (각 engagement 타입 수집 후 추가 대기)
  private readonly RETRY_DELAY = 15 * 60 * 1000; // 15분 (429 응답 시)
  private readonly MAX_RETRIES = 3;
  
  // engagement_type 검증 통계
  private engagementValidationStats = {
    totalProcessed: 0,
    validTypes: 0,
    invalidTypes: 0,
    correctedTypes: 0,
    typeDistribution: new Map<string, number>()
  };
  
  // followers_count 수집 통계
  private followersCountStats = {
    totalProcessed: 0,
    withFollowersCount: 0,
    withoutFollowersCount: 0,
    averageFollowersCount: 0,
    maxFollowersCount: 0,
    minFollowersCount: Number.MAX_SAFE_INTEGER,
    followersCountDistribution: new Map<string, number>() // 범위별 분포
  };

  constructor(config: EnvConfig, secureTokens?: SecureTwitterTokens) {
    this.config = config;

    // Phase 3: Rate Limit 모니터링 시스템 초기화
    this.rateLimitMonitor = RateLimitMonitor.getInstance();
    console.log(`📊 [RATE_LIMIT] Rate Limit 모니터링 시스템 활성화`);

    // Phase 8 보안 강화: Secure Token Manager 우선 사용
    if (secureTokens) {
      console.log(`🔐 [SECURITY] Secure Token Manager를 사용하여 인증 설정 중...`);
      this.initializeWithSecureTokens(secureTokens);
      // secureTokens에는 모든 인증 정보가 포함되어 있으므로 hybrid 전략 사용
      this.authStrategy = 'hybrid';
    } else {
      console.log(`⚠️ [SECURITY] 환경변수 기반 토큰 사용 (Fallback 모드)`);
      // 환경변수를 사용하는 경우에만 authStrategy 검증
      this.authStrategy = getAuthenticationStrategy(config);
      this.initializeWithEnvironmentTokens(config);
    }

    console.log(`🚀 TwitterApiService 초기화 완료 - 인증 전략: ${this.authStrategy}`);
  }

  /**
   * ReplyCounterService 초기화
   * @param tableName DynamoDB 테이블 이름
   */
  public initializeReplyCounter(tableName: string): void {
    this.replyCounterService = new ReplyCounterService(tableName);
    console.log(`🔢 [REPLY_COUNTER] ReplyCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  /**
   * MentionCounterService 초기화
   * @param tableName DynamoDB 테이블 이름
   */
  public initializeMentionCounter(tableName: string): void {
    this.mentionCounterService = new MentionCounterService(tableName);
    console.log(`🏷️ [MENTION_COUNTER] MentionCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  /**
   * QuoteCounterService 초기화
   * @param tableName DynamoDB 테이블 이름
   */
  public initializeQuoteCounter(tableName: string): void {
    this.quoteCounterService = new QuoteCounterService(tableName);
    console.log(`📝 [QUOTE_COUNTER] QuoteCounterService 초기화 완료 - 테이블: ${tableName}`);
  }

  // Phase 8: Secure Token Manager 기반 초기화
  private initializeWithSecureTokens(secureTokens: SecureTwitterTokens): void {
    console.log(`🔐 [SECURE_INIT] 보안 토큰을 사용하여 클라이언트 초기화 중...`);

    // Bearer Token 클라이언트 (기본)
    if (secureTokens.bearerToken) {
      this.client = new TwitterApi(secureTokens.bearerToken);
      console.log(`✅ [SECURE_INIT] Bearer Token 클라이언트 초기화됨`);
    }

    // OAuth 1.0a 클라이언트
    if (this.config.enableOAuthAuthentication && secureTokens.apiKey && secureTokens.apiSecret && secureTokens.accessToken && secureTokens.accessTokenSecret) {
      this.oauthClient = new TwitterApi({
        appKey: secureTokens.apiKey,
        appSecret: secureTokens.apiSecret,
        accessToken: secureTokens.accessToken,
        accessSecret: secureTokens.accessTokenSecret,
      });
      console.log(`✅ [SECURE_INIT] OAuth 1.0a 클라이언트 초기화됨`);
    }

    // OAuth 2.0 User-Context 클라이언트
    if (this.config.enableOAuth2Authentication && secureTokens.oauth2.userAccessToken) {
      this.oauth2Client = new TwitterApi(secureTokens.oauth2.userAccessToken);
      console.log(`✅ [SECURE_INIT] OAuth 2.0 User-Context 클라이언트 초기화됨`);
    }
  }

  // 기존 환경변수 기반 초기화 (Fallback)
  private initializeWithEnvironmentTokens(config: EnvConfig): void {
    console.log(`⚠️ [FALLBACK] 환경변수 기반 토큰으로 클라이언트 초기화 중...`);
    
    // Bearer Token 클라이언트 (기본)
    if (config.twitterBearerToken) {
      this.client = new TwitterApi(config.twitterBearerToken);
    }
    
    // OAuth 1.0a 클라이언트 (우선순위)
    if (config.enableOAuthAuthentication && hasValidOAuthCredentials(config)) {
      this.oauthClient = new TwitterApi({
        appKey: config.twitterApiKey,
        appSecret: config.twitterApiSecret,
        accessToken: config.twitterAccessToken,
        accessSecret: config.twitterAccessTokenSecret,
      });
      
      console.log(`🔐 OAuth 1.0a 클라이언트 초기화됨 (전략: ${this.authStrategy})`);
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  

  private async makeApiCall<T>(apiCall: () => Promise<T>, context: string): Promise<T> {
    let lastError: any;
    
    // Phase 3: Rate Limit 안전성 확인
    if (!this.rateLimitMonitor.canMakeCall(context)) {
      const waitTime = this.rateLimitMonitor.getRecommendedWaitTime();
      console.warn(`🚫 [RATE_LIMIT] ${context} 호출 차단 - ${Math.ceil(waitTime / 1000)}초 대기 필요`);
      throw new Error(`Rate limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds.`);
    }
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      // Phase 3.3: API 응답 시간 측정 시작
      const apiStartTime = Date.now();
      
      try {
        console.log(`[${context}] API 호출 시작 (attempt ${attempt}/${this.MAX_RETRIES})`);
        this.rateLimitMonitor.logStatus(); // 현재 Rate Limit 상태 로깅
        
        // Rate limit 최적화: 재시도 시에만 200ms 대기
        if (attempt > 1) {
          console.log(`[${context}] 재시도 전 ${this.RATE_LIMIT_DELAY}ms 대기...`);
          await this.sleep(this.RATE_LIMIT_DELAY);
        }
        
        const result = await apiCall();
        
        // Phase 3.3: API 응답 시간 계산 및 대시보드 전송
        const responseTime = Date.now() - apiStartTime;
        console.log(`[${context}] API 호출 성공 (응답시간: ${responseTime}ms)`);
        
        // Phase 3: API 호출 성공 기록
        this.rateLimitMonitor.recordCall(context, true);
        
        // Phase 3.3: 대시보드에 성공한 API 호출 메트릭 전송
        await rateLimitDashboard.collectAndSendDashboardMetrics(
          responseTime, // API 응답시간
          undefined,    // 배치 처리시간 (해당 없음)
          undefined,    // 배치 크기 (해당 없음)
          true          // API 성공
        );
        
        return result;
        
      } catch (error: any) {
        const responseTime = Date.now() - apiStartTime;
        console.error(`[${context}] API 호출 실패 (attempt ${attempt}, ${responseTime}ms):`, error.message);
        lastError = error;
        
        // Phase 3: Rate Limit 실패 기록
        if (error.code === 429 || error.status === 429) {
          this.rateLimitMonitor.recordCall(context, false);
        }
        
        // Phase 3.3: 실패한 API 호출도 대시보드에 기록 (최종 시도인 경우)
        if (attempt === this.MAX_RETRIES) {
          await rateLimitDashboard.collectAndSendDashboardMetrics(
            responseTime, // API 응답시간
            undefined,    // 배치 처리시간 (해당 없음)
            undefined,    // 배치 크기 (해당 없음)
            false         // API 실패
          );
        }
        
        // Rate limit (429) 응답 시 적응형 대기 시간 사용
        if (error.code === 429 || error.status === 429) {
          if (attempt < this.MAX_RETRIES) {
            const adaptiveWaitTime = this.rateLimitMonitor.getRecommendedWaitTime();
            console.log(`[${context}] Rate limit 감지. ${Math.ceil(adaptiveWaitTime / 1000)}초 후 재시도...`);
            await this.sleep(adaptiveWaitTime);
          }
        } else {
          // 다른 에러는 지수 백오프
          const delay = Math.pow(2, attempt) * 1000;
          if (attempt < this.MAX_RETRIES) {
            console.log(`[${context}] ${delay / 1000}초 후 재시도...`);
            await this.sleep(delay);
          }
        }
      }
    }
    
    throw new Error(`[${context}] ${this.MAX_RETRIES}회 재시도 실패: ${lastError.message}`);
  }

  async getUserByUsername(username: string): Promise<TwitterUser | null> {
    return this.makeApiCall(async () => {
      const user = await this.client.v2.userByUsername(username, {
        'user.fields': ['created_at', 'public_metrics', 'profile_image_url', 'description']
      });
      
      if (!user.data) {
        return null;
      }
      
      return {
        id: user.data.id,
        username: user.data.username,
        name: user.data.name,
        profile_image_url: user.data.profile_image_url,
        public_metrics: user.data.public_metrics,
      };
    }, `getUserByUsername(${username})`);
  }

  /**
   * 타겟 사용자의 원본 트윗(replies/retweets 제외) 조회
   *
   * @param userId 타겟 사용자의 **numeric User ID** (예: "1863020068785004544")
   *               ⚠️ X API v2는 username으로 직접 호출 불가!
   * @param startTime 시작 시각 (ISO 8601)
   * @param endTime 종료 시각 (ISO 8601)
   * @param maxResults 최대 결과 수 (기본 100)
   * @returns 원본 트윗 목록
   */
  async getUserTweets(userId: string, startTime: string, endTime: string, maxResults: number = 100): Promise<TwitterTweet[]> {
    return this.makeApiCall(async () => {
      // OAuth 2.0 User Context 우선 사용
      const authClient = this.oauth2Client || this.oauthClient;
      if (authClient) {
        const authType = this.oauth2Client ? 'OAuth 2.0' : 'OAuth 1.0a';
        console.log(`[${authType}] getUserTweets 호출: ${userId}`);
        const tweets = await authClient.v2.userTimeline(userId, {
          max_results: Math.min(maxResults, 100),
          start_time: startTime,
          end_time: endTime,
          exclude: ['retweets', 'replies'], // 원본 트윗만 수집
          'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'lang'],
        });

        return (tweets.data.data || []).map((tweet: any) => ({
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id,
          created_at: tweet.created_at || new Date().toISOString(),
          public_metrics: tweet.public_metrics,
          lang: tweet.lang,  // 언어 필드 추가
        }));
      }
      
      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getUserTweets 시도: ${userId}`);
        try {
          const tweets = await this.client.v2.userTimeline(userId, {
            max_results: Math.min(maxResults, 100),
            start_time: startTime,
            end_time: endTime,
            exclude: ['retweets', 'replies'], // 원본 트윗만 수집
            'tweet.fields': ['created_at', 'public_metrics', 'author_id'],
          });
          
          const tweetData = tweets.data.data || [];
          console.log(`✅ [Bearer Token] getUserTweets 성공: ${tweetData.length}개 트윗 조회`);
          
          return tweetData.map((tweet: any) => ({
            id: tweet.id,
            text: tweet.text,
            author_id: tweet.author_id,
            created_at: tweet.created_at || new Date().toISOString(),
            public_metrics: tweet.public_metrics,
          }));
        } catch (error: any) {
          console.error(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          // 🔧 조용한 실패 해결: 명시적 에러 발생 (Gemini & Claude 디버그 결과)
          throw new Error(`Bearer Token 인증 실패로 트윗 조회 불가: ${error.message} (status: ${error.status || 'unknown'})`);
        }
      }
      
      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getUserTweets`);
    }, `getUserTweets(${userId})`);
  }

  // 리트윗 포함 사용자 타임라인 수집 (리트윗 보너스용)
  async getUserTweetsWithRetweets(userId: string, startTime: string, endTime: string, maxResults: number = 100): Promise<TwitterTweet[]> {
    return this.makeApiCall(async () => {
      // OAuth 클라이언트 우선 사용 (User Context)
      if (this.oauthClient) {
        console.log(`[OAuth] getUserTweetsWithRetweets 호출: ${userId}`);
        const tweets = await this.oauthClient.v2.userTimeline(userId, {
          max_results: Math.min(maxResults, 100),
          start_time: startTime,
          end_time: endTime,
          exclude: ['replies'], // 답글만 제외, 리트윗 포함
          'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets'],
          expansions: ['referenced_tweets.id', 'referenced_tweets.id.author_id']
        });
        
        return (tweets.data.data || []).map((tweet: any) => ({
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id,
          created_at: tweet.created_at || new Date().toISOString(),
          public_metrics: tweet.public_metrics,
          referenced_tweets: tweet.referenced_tweets, // 리트윗 정보 포함
        }));
      }
      
      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getUserTweetsWithRetweets 시도: ${userId}`);
        try {
          const tweets = await this.client.v2.userTimeline(userId, {
            max_results: Math.min(maxResults, 100),
            start_time: startTime,
            end_time: endTime,
            exclude: ['replies'], // 답글만 제외, 리트윗 포함
            'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets'],
            expansions: ['referenced_tweets.id', 'referenced_tweets.id.author_id']
          });
          
          return (tweets.data.data || []).map((tweet: any) => ({
            id: tweet.id,
            text: tweet.text,
            author_id: tweet.author_id,
            created_at: tweet.created_at || new Date().toISOString(),
            public_metrics: tweet.public_metrics,
            referenced_tweets: tweet.referenced_tweets, // 리트윗 정보 포함
          }));
        } catch (error: any) {
          console.warn(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          return []; // 빈 배열 반환
        }
      }
      
      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getUserTweetsWithRetweets`);
    }, `getUserTweetsWithRetweets(${userId})`);
  }

  /**
   * 🆕 True Snapshot V3: 타겟 계정의 답글(comments) 포함 타임라인 수집
   *
   * **핵심 차이점**:
   * - getUserTweets(): exclude: ['retweets', 'replies'] → 원본 포스트만
   * - getUserTweetsWithReplies(): exclude: ['retweets'] → 원본 + 답글(comments) 모두
   *
   * **사용 목적**:
   * - 타겟 계정이 다른 사람 포스트에 단 댓글 수집
   * - 그 댓글에 달린 인게이지먼트(likes/replies/retweets/quotes) 수집
   *
   * **데이터 예시**:
   * - 타겟 원본 포스트: https://x.com/Naru010110/status/1976194953291452749
   * - 타겟 댓글: https://x.com/Naru010110/status/1977255356427600360
   * - 타겟 댓글에 달린 답글: https://x.com/Keymong368774/status/1977259878193545304
   *   → 이제 수집됨! ✅
   *
   * @param userId 타겟 사용자의 **numeric User ID** (예: "1863020068785004544")
   *                ⚠️ X API v2는 username("Naru010110")으로 직접 호출 불가!
   *                TARGET_USER_ID 환경변수에서 가져와야 함
   * @param startTime 시작 시각 (ISO 8601)
   * @param endTime 종료 시각 (ISO 8601)
   * @param maxResults 최대 결과 수 (기본 100)
   * @returns 원본 포스트 + 답글 목록, isReply 필드 포함
   */
  async getUserTweetsWithReplies(userId: string, startTime: string, endTime: string, maxResults: number = 100): Promise<TwitterTweet[]> {
    return this.makeApiCall(async () => {
      // OAuth 2.0 User Context 우선 사용
      const authClient = this.oauth2Client || this.oauthClient;
      if (authClient) {
        const authType = this.oauth2Client ? 'OAuth 2.0' : 'OAuth 1.0a';
        console.log(`[${authType}] getUserTweetsWithReplies 호출: ${userId} (max: ${maxResults})`);

        // 🆕 Pagination support
        const allTweets: any[] = [];
        let nextToken: string | undefined = undefined;
        let pageCount = 0;

        do {
          pageCount++;
          const remainingCount = maxResults - allTweets.length;
          const pageSize = Math.min(remainingCount, 100); // X API max per page

          console.log(`📄 [Page ${pageCount}] Fetching ${pageSize} tweets${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

          const tweets = await authClient.v2.userTimeline(userId, {
            max_results: pageSize,
            start_time: startTime,
            end_time: endTime,
            exclude: ['retweets'], // ✅ 리트윗만 제외, 답글 포함!
            'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'lang', 'referenced_tweets', 'conversation_id'],
            expansions: ['referenced_tweets.id'],
            pagination_token: nextToken
          });

          console.log(`[DEBUG] X API Response Meta: ${JSON.stringify(tweets.data.meta)}`);

          const pageTweets = tweets.data.data || [];
          allTweets.push(...pageTweets);
          nextToken = tweets.data.meta?.next_token;

          console.log(`✅ [Page ${pageCount}] ${pageTweets.length}개 조회 (누적: ${allTweets.length}/${maxResults})`);

          // Rate limit protection between pages
          if (nextToken && allTweets.length < maxResults) {
            console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
            await this.sleep(200);
          }

        } while (nextToken && allTweets.length < maxResults);

        console.log(`🎯 [${authType}] 총 ${allTweets.length}개 트윗 조회 완료 (${pageCount} 페이지)`);

        return allTweets.map((tweet: any) => {
          /**
           * 트윗 분류 로직 (2025-10-28 수정):
           *
           * 1. Pure Quote Tweet:
           *    - conversation_id = tweet.id
           *    - referenced_tweets = ['quoted']
           *    - isReply = false (새 conversation 시작)
           *
           * 2. Quote Reply:
           *    - conversation_id ≠ tweet.id
           *    - referenced_tweets = ['quoted']
           *    - isReply = false (Quote Tweet은 답글이 아님)
           *
           * 3. Pure Reply:
           *    - conversation_id ≠ tweet.id
           *    - referenced_tweets = ['replied_to']
           *    - isReply = true (단순 답글)
           *
           * 4. Original Post:
           *    - conversation_id = tweet.id
           *    - referenced_tweets = null
           *    - isReply = false
           */

          // 🔧 Fix: Quote Reply 지원 (referenced_tweets.type 확인)
          // Quote Tweet (Pure Quote + Quote Reply)은 답글이 아님
          const isQuoteTweet = tweet.referenced_tweets?.some(
            (ref: any) => ref.type === 'quoted'
          ) || false;

          const isReply = !isQuoteTweet &&
                          !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);

          return {
            id: tweet.id,
            text: tweet.text,
            author_id: tweet.author_id,
            created_at: tweet.created_at || new Date().toISOString(),
            public_metrics: tweet.public_metrics,
            lang: tweet.lang,  // 언어 필드 추가 (언어 감지 필수)
            referenced_tweets: tweet.referenced_tweets,
            conversation_id: tweet.conversation_id, // 🆕 conversation_id 추가
            isReply, // 🆕 답글 여부
          };
        });
      }

      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getUserTweetsWithReplies 시도: ${userId} (max: ${maxResults})`);
        try {
          // 🆕 Pagination support
          const allTweets: any[] = [];
          let nextToken: string | undefined = undefined;
          let pageCount = 0;

          do {
            pageCount++;
            const remainingCount = maxResults - allTweets.length;
            const pageSize = Math.min(remainingCount, 100);

            console.log(`📄 [Bearer Token Page ${pageCount}] Fetching ${pageSize} tweets${nextToken ? ' (with pagination)' : ''}`);

            const tweets = await this.client.v2.userTimeline(userId, {
              max_results: pageSize,
              start_time: startTime,
              end_time: endTime,
              exclude: ['retweets'], // 리트윗만 제외
              'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'lang', 'referenced_tweets', 'conversation_id'],
              expansions: ['referenced_tweets.id'],
              pagination_token: nextToken
            });

            const pageTweets = tweets.data.data || [];
            allTweets.push(...pageTweets);
            nextToken = tweets.data.meta?.next_token;

            console.log(`✅ [Bearer Token Page ${pageCount}] ${pageTweets.length}개 조회 (누적: ${allTweets.length}/${maxResults})`);

            // Rate limit protection
            if (nextToken && allTweets.length < maxResults) {
              console.log(`⏰ 페이지 간 대기 (200ms)`);
              await this.sleep(200);
            }

          } while (nextToken && allTweets.length < maxResults);

          console.log(`🎯 [Bearer Token] 총 ${allTweets.length}개 트윗 조회 완료 (${pageCount} 페이지)`);

          return allTweets.map((tweet: any) => {
            // 🔧 Fix: Quote Reply 지원 (referenced_tweets.type 확인)
            // Quote Tweet (Pure Quote + Quote Reply)은 답글이 아님
            const isQuoteTweet = tweet.referenced_tweets?.some(
              (ref: any) => ref.type === 'quoted'
            ) || false;

            const isReply = !isQuoteTweet &&
                            !!(tweet.conversation_id && tweet.conversation_id !== tweet.id);

            return {
              id: tweet.id,
              text: tweet.text,
              author_id: tweet.author_id,
              created_at: tweet.created_at || new Date().toISOString(),
              public_metrics: tweet.public_metrics,
              lang: tweet.lang,
              referenced_tweets: tweet.referenced_tweets,
              conversation_id: tweet.conversation_id, // 🆕 conversation_id 추가
              isReply,
            };
          });
        } catch (error: any) {
          console.error(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          // 🔧 명시적 에러 발생
          throw new Error(`Bearer Token 인증 실패로 트윗 조회 불가: ${error.message} (status: ${error.status || 'unknown'})`);
        }
      }

      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getUserTweetsWithReplies`);
    }, `getUserTweetsWithReplies(${userId})`);
  }

  // 트윗 조회 (멘션 entities 포함)
  async getTweetWithMentions(tweetId: string): Promise<any> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);
    
    return this.makeApiCall(async () => {
      // OAuth 클라이언트 우선 사용 (User Context)
      if (this.oauthClient) {
        console.log(`[OAuth] getTweetWithMentions 호출: ${tweetId}`);
        const tweet = await this.oauthClient.v2.singleTweet(tweetId, {
          'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'entities'],
          expansions: ['author_id'],
          'user.fields': ['username', 'name']
        });
        
        if (!tweet.data) {
          return null;
        }
        
        // 응답에서 작성자 정보 추출
        const author = tweet.includes?.users?.[0];
        
        return {
          id: tweet.data.id,
          text: tweet.data.text,
          author_id: tweet.data.author_id,
          created_at: tweet.data.created_at || new Date().toISOString(),
          public_metrics: tweet.data.public_metrics,
          entities: tweet.data.entities, // 멘션 정보 포함
          author: author ? {
            id: author.id,
            username: author.username,
            name: author.name
          } : undefined
        };
      }
      
      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getTweetWithMentions 시도: ${tweetId}`);
        try {
          const tweet = await this.client.v2.singleTweet(tweetId, {
            'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'entities'],
            expansions: ['author_id'],
            'user.fields': ['username', 'name']
          });
          
          if (!tweet.data) {
            return null;
          }
          
          // 응답에서 작성자 정보 추출
          const author = tweet.includes?.users?.[0];
          
          return {
            id: tweet.data.id,
            text: tweet.data.text,
            author_id: tweet.data.author_id,
            created_at: tweet.data.created_at || new Date().toISOString(),
            public_metrics: tweet.data.public_metrics,
            entities: tweet.data.entities, // 멘션 정보 포함
            author: author ? {
              id: author.id,
              username: author.username,
              name: author.name
            } : undefined
          };
        } catch (error: any) {
          console.warn(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          return null;
        }
      }
      
      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getTweetWithMentions`);
    }, `getTweetWithMentions(${tweetId})`);
  }

  async getTweetLikingUsers(tweetId: string, maxResults: number = 100): Promise<TwitterUser[]> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);

    return this.makeApiCall(async () => {
      // 🔧 OAuth 2.0 User Context 우선 사용 (Twitter API v2 권장)
      if (this.oauth2Client) {
        console.log(`[OAuth 2.0 User Context] getTweetLikingUsers 호출: ${tweetId} (max: ${maxResults})`);
        try {
          // 🆕 Pagination support (2025-10-28)
          const allUsers: any[] = [];
          let nextToken: string | undefined = undefined;
          let pageCount = 0;

          console.log(`🔍 [getTweetLikingUsers] 수집 시작 (max: ${maxResults})`);

          do {
            pageCount++;
            const remainingCount = maxResults - allUsers.length;
            const pageSize = Math.min(remainingCount, 100); // X API max per page

            console.log(`📄 [Page ${pageCount}] ${pageSize}명 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

            const params: any = {
              max_results: pageSize,
              'user.fields': ['username', 'name', 'profile_image_url', 'created_at', 'public_metrics']
            };
            if (nextToken) params.pagination_token = nextToken;

            const likes: any = await this.oauth2Client.v2.tweetLikedBy(tweetId, params);

            // 🐛 DEBUG: Full API response
            console.log(`[DEBUG] OAuth 2.0 Full API Response:`, JSON.stringify({
              data_length: likes.data?.length || 0,
              meta: likes.meta,
              errors: likes.errors,
              includes: likes.includes
            }, null, 2));

            const pageUsers = likes.data || [];
            allUsers.push(...pageUsers);
            nextToken = likes.meta?.next_token;

            console.log(`✅ [Page ${pageCount}] ${pageUsers.length}명 조회 (누적: ${allUsers.length}/${maxResults})`);

            // Rate limit protection between pages
            if (nextToken && allUsers.length < maxResults) {
              console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
              await this.sleep(200);
            }

          } while (nextToken && allUsers.length < maxResults);

          console.log(`🎯 [getTweetLikingUsers] OAuth 2.0: 총 ${allUsers.length}명 조회 완료 (${pageCount} 페이지)`);

          if (allUsers.length > 0) {
            return allUsers.map((user: any) => ({
              id: user.id,
              username: user.username,
              name: user.name,
              profile_image_url: user.profile_image_url,
              public_metrics: user.public_metrics,
            }));
          }

          console.log(`ℹ️ [OAuth 2.0] getTweetLikingUsers 결과 없음 (빈 배열)`);
        } catch (error: any) {
          console.warn(`⚠️ OAuth 2.0 실패, OAuth 1.0a로 fallback 시도: ${error.message}`);
        }
      }

      // 🔧 OAuth 1.0a fallback
      if (this.oauthClient) {
        console.log(`[OAuth 1.0a Fallback] getTweetLikingUsers 호출: ${tweetId} (max: ${maxResults})`);

        // 🆕 Pagination support (2025-10-28)
        const allUsers: any[] = [];
        let nextToken: string | undefined = undefined;
        let pageCount = 0;

        console.log(`🔍 [getTweetLikingUsers] OAuth 1.0a 수집 시작 (max: ${maxResults})`);

        do {
          pageCount++;
          const remainingCount = maxResults - allUsers.length;
          const pageSize = Math.min(remainingCount, 100); // X API max per page

          console.log(`📄 [Page ${pageCount}] ${pageSize}명 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

          const params: any = {
            max_results: pageSize,
            'user.fields': ['username', 'name', 'profile_image_url', 'created_at', 'public_metrics']
          };
          if (nextToken) params.pagination_token = nextToken;

          const likes: any = await this.oauthClient.v2.tweetLikedBy(tweetId, params);

          // 🐛 DEBUG: Full API response
          console.log(`[DEBUG] OAuth 1.0a Full API Response:`, JSON.stringify({
            data_length: likes.data?.length || 0,
            meta: likes.meta,
            errors: likes.errors,
            includes: likes.includes
          }, null, 2));

          const pageUsers = likes.data || [];
          allUsers.push(...pageUsers);
          nextToken = likes.meta?.next_token;

          console.log(`✅ [Page ${pageCount}] ${pageUsers.length}명 조회 (누적: ${allUsers.length}/${maxResults})`);

          // Rate limit protection between pages
          if (nextToken && allUsers.length < maxResults) {
            console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
            await this.sleep(200);
          }

        } while (nextToken && allUsers.length < maxResults);

        console.log(`🎯 [getTweetLikingUsers] OAuth 1.0a: 총 ${allUsers.length}명 조회 완료 (${pageCount} 페이지)`);

        return allUsers.map((user: any) => ({
          id: user.id,
          username: user.username,
          name: user.name,
          profile_image_url: user.profile_image_url,
          public_metrics: user.public_metrics,
        }));
      }

      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getTweetLikingUsers 시도: ${tweetId} (max: ${maxResults})`);
        try {
          // 🆕 Pagination support (2025-10-28)
          const allUsers: any[] = [];
          let nextToken: string | undefined = undefined;
          let pageCount = 0;

          console.log(`🔍 [getTweetLikingUsers] Bearer Token 수집 시작 (max: ${maxResults})`);

          do {
            pageCount++;
            const remainingCount = maxResults - allUsers.length;
            const pageSize = Math.min(remainingCount, 100); // X API max per page

            console.log(`📄 [Page ${pageCount}] ${pageSize}명 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

            const params: any = {
              max_results: pageSize,
              'user.fields': ['username', 'name', 'profile_image_url', 'created_at', 'public_metrics']
            };
            if (nextToken) params.pagination_token = nextToken;

            const likes: any = await this.client.v2.tweetLikedBy(tweetId, params);

            // 🐛 DEBUG: Full API response
            console.log(`[DEBUG] Bearer Token Full API Response:`, JSON.stringify({
              data_length: likes.data?.length || 0,
              meta: likes.meta,
              errors: likes.errors,
              includes: likes.includes
            }, null, 2));

            const pageUsers = likes.data || [];
            allUsers.push(...pageUsers);
            nextToken = likes.meta?.next_token;

            console.log(`✅ [Page ${pageCount}] ${pageUsers.length}명 조회 (누적: ${allUsers.length}/${maxResults})`);

            // Rate limit protection between pages
            if (nextToken && allUsers.length < maxResults) {
              console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
              await this.sleep(200);
            }

          } while (nextToken && allUsers.length < maxResults);

          console.log(`🎯 [getTweetLikingUsers] Bearer Token: 총 ${allUsers.length}명 조회 완료 (${pageCount} 페이지)`);

          return allUsers.map((user: any) => ({
            id: user.id,
            username: user.username,
            name: user.name,
            profile_image_url: user.profile_image_url,
            public_metrics: user.public_metrics,
          }));
        } catch (error: any) {
          console.warn(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          return []; // 빈 배열 반환
        }
      }

      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getTweetLikingUsers`);
    }, `getTweetLikingUsers(${tweetId})`);
  }

  async getTweetRepostedByUsers(tweetId: string, maxResults: number = 100): Promise<TwitterUser[]> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);

    return this.makeApiCall(async () => {
      // OAuth 클라이언트 우선 사용 (User Context)
      if (this.oauthClient) {
        console.log(`[OAuth 1.0a] getTweetRepostedByUsers 호출: ${tweetId} (max: ${maxResults})`);

        // 🆕 Pagination support (2025-10-28)
        const allUsers: any[] = [];
        let nextToken: string | undefined = undefined;
        let pageCount = 0;

        console.log(`🔍 [getTweetRepostedByUsers] OAuth 1.0a 수집 시작 (max: ${maxResults})`);

        do {
          pageCount++;
          const remainingCount = maxResults - allUsers.length;
          const pageSize = Math.min(remainingCount, 100); // X API max per page

          console.log(`📄 [Page ${pageCount}] ${pageSize}명 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

          const params: any = {
            max_results: pageSize,
            'user.fields': ['username', 'name', 'profile_image_url', 'created_at', 'public_metrics']
          };
          if (nextToken) params.pagination_token = nextToken;

          const retweets: any = await this.oauthClient.v2.tweetRetweetedBy(tweetId, params);

          const pageUsers = retweets.data || [];
          allUsers.push(...pageUsers);
          nextToken = retweets.meta?.next_token;

          console.log(`✅ [Page ${pageCount}] ${pageUsers.length}명 조회 (누적: ${allUsers.length}/${maxResults})`);

          // Rate limit protection between pages
          if (nextToken && allUsers.length < maxResults) {
            console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
            await this.sleep(200);
          }

        } while (nextToken && allUsers.length < maxResults);

        console.log(`🎯 [getTweetRepostedByUsers] OAuth 1.0a: 총 ${allUsers.length}명 조회 완료 (${pageCount} 페이지)`);

        return allUsers.map((user: any) => ({
          id: user.id,
          username: user.username,
          name: user.name,
          profile_image_url: user.profile_image_url,
          public_metrics: user.public_metrics,
        }));
      }
      
      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getTweetRepostedByUsers 시도: ${tweetId} (max: ${maxResults})`);
        try {
          // 🆕 Pagination support (2025-10-28)
          const allUsers: any[] = [];
          let nextToken: string | undefined = undefined;
          let pageCount = 0;

          console.log(`🔍 [getTweetRepostedByUsers] Bearer Token 수집 시작 (max: ${maxResults})`);

          do {
            pageCount++;
            const remainingCount = maxResults - allUsers.length;
            const pageSize = Math.min(remainingCount, 100); // X API max per page

            console.log(`📄 [Page ${pageCount}] ${pageSize}명 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

            const params: any = {
              max_results: pageSize,
              'user.fields': ['username', 'name', 'profile_image_url', 'created_at', 'public_metrics']
            };
            if (nextToken) params.pagination_token = nextToken;

            const retweets: any = await this.client.v2.tweetRetweetedBy(tweetId, params);

            const pageUsers = retweets.data || [];
            allUsers.push(...pageUsers);
            nextToken = retweets.meta?.next_token;

            console.log(`✅ [Page ${pageCount}] ${pageUsers.length}명 조회 (누적: ${allUsers.length}/${maxResults})`);

            // Rate limit protection between pages
            if (nextToken && allUsers.length < maxResults) {
              console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
              await this.sleep(200);
            }

          } while (nextToken && allUsers.length < maxResults);

          console.log(`🎯 [getTweetRepostedByUsers] Bearer Token: 총 ${allUsers.length}명 조회 완료 (${pageCount} 페이지)`);

          return allUsers.map((user: any) => ({
            id: user.id,
            username: user.username,
            name: user.name,
            profile_image_url: user.profile_image_url,
            public_metrics: user.public_metrics,
          }));
        } catch (error: any) {
          console.warn(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          return []; // 빈 배열 반환
        }
      }
      
      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getTweetRepostedByUsers`);
    }, `getTweetRepostedByUsers(${tweetId})`);
  }

  async getTweetQuotes(tweetId: string, maxResults: number = 100): Promise<TwitterTweet[]> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);
    
    return this.makeApiCall(async () => {
      const quotes = await this.client.v2.quotes(tweetId, {
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'lang'], // 언어 감지: lang 추가
        expansions: ['author_id'],
        'user.fields': ['username', 'name', 'profile_image_url', 'public_metrics'] // 🔧 Phase B.2.3: public_metrics 추가로 followers_count 확보
      });
      
      // 사용자 정보를 ID로 매핑
      const userMap = new Map();
      (quotes.includes?.users || []).forEach((user: any) => {
        userMap.set(user.id, user);
      });

      return (quotes.data.data || []).map((tweet: any) => {
        const author = userMap.get(tweet.author_id);
        return {
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id,
          created_at: tweet.created_at || new Date().toISOString(),
          public_metrics: tweet.public_metrics,
          lang: tweet.lang, // 언어 감지: lang 필드 포함
          author: author ? {
            id: author.id,
            username: author.username,
            name: author.name,
            profile_image_url: author.profile_image_url,
            public_metrics: author.public_metrics // 🔧 Phase B.2.3: public_metrics 포함
          } : undefined
        };
      });
    }, `getTweetQuotes(${tweetId})`);
  }

  async searchRecentTweets(query: string, maxResults: number = 100, startTime?: string, endTime?: string): Promise<TwitterTweet[]> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);

    return this.makeApiCall(async () => {
      // 🆕 Pagination support (2025-10-28)
      const allTweets: any[] = [];
      const allUsers: Map<string, any> = new Map();
      let nextToken: string | undefined = undefined;
      let pageCount = 0;

      console.log(`🔍 [searchRecentTweets] 검색 시작: "${query}" (max: ${maxResults}, 기간: ${startTime} ~ ${endTime})`);

      do {
        pageCount++;
        const remainingCount = maxResults - allTweets.length;
        const pageSize = Math.min(remainingCount, 100); // X API max per page

        console.log(`📄 [Page ${pageCount}] ${pageSize}개 조회 중${nextToken ? ' (pagination_token: ' + nextToken.substring(0, 20) + '...)' : ''}`);

        const searchParams: any = {
          max_results: pageSize,
          'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'lang'], // 언어 감지: lang 추가
          expansions: ['author_id'],
          'user.fields': ['username', 'name', 'profile_image_url', 'public_metrics'], // 🔧 Phase B.2.3: public_metrics 추가로 followers_count 확보
          next_token: nextToken // 🆕 페이지네이션 토큰
        };

        // ⭐ V3: 날짜 범위 필터 추가 (Active 인게이지먼트 수집 시 1일 전으로 제한)
        if (startTime) {
          searchParams.start_time = startTime;
        }
        if (endTime) {
          searchParams.end_time = endTime;
        }

        const search = await this.client.v2.search(query, searchParams);

        // 사용자 정보를 ID로 매핑 (페이지별 누적)
        (search.includes?.users || []).forEach((user: any) => {
          allUsers.set(user.id, user);
        });

        const pageTweets = search.data.data || [];
        allTweets.push(...pageTweets);
        nextToken = search.data.meta?.next_token;

        console.log(`✅ [Page ${pageCount}] ${pageTweets.length}개 조회 (누적: ${allTweets.length}/${maxResults})`);

        // Rate limit protection between pages
        if (nextToken && allTweets.length < maxResults) {
          console.log(`⏰ 페이지 간 대기 (200ms) - Rate Limit 보호`);
          await this.sleep(200);
        }

      } while (nextToken && allTweets.length < maxResults);

      console.log(`🎯 [searchRecentTweets] 총 ${allTweets.length}개 트윗 조회 완료 (${pageCount} 페이지)`);

      // 모든 트윗 매핑
      return allTweets.map((tweet: any) => {
        const author = allUsers.get(tweet.author_id);
        return {
          id: tweet.id,
          text: tweet.text,
          author_id: tweet.author_id,
          created_at: tweet.created_at || new Date().toISOString(),
          public_metrics: tweet.public_metrics,
          lang: tweet.lang, // 언어 감지: lang 필드 포함
          referenced_tweets: tweet.referenced_tweets, // 🔧 답글/멘션 구분: referenced_tweets 포함
          author: author ? {
            id: author.id,
            username: author.username,
            name: author.name,
            profile_image_url: author.profile_image_url,
            public_metrics: author.public_metrics // 🔧 Phase B.2.3: public_metrics 포함
          } : undefined
        };
      });
    }, `searchRecentTweets(${query})`);
  }

  /**
   * 타겟 사용자를 멘션한 트윗 목록 조회
   *
   * @param userId 타겟 사용자의 **numeric User ID** (예: "1863020068785004544")
   *               ⚠️ X API v2는 username("Naru010110")으로 직접 호출 불가!
   *               TARGET_USER_ID 환경변수에서 가져와야 함
   * @param startTime 시작 시각 (ISO 8601)
   * @param endTime 종료 시각 (ISO 8601)
   * @param maxResults 최대 결과 수 (기본 100)
   * @returns 멘션 트윗 목록
   */
  async getUserMentions(userId: string, startTime: string, endTime: string, maxResults: number = 100): Promise<TwitterTweet[]> {
    // Rate Limit 최적화: 기본 200ms 대기
    await this.sleep(this.RATE_LIMIT_DELAY);
    
    return this.makeApiCall(async () => {
      // OAuth 클라이언트 우선 사용 (User Context)
      if (this.oauthClient) {
        console.log(`[OAuth] getUserMentions 호출: ${userId}`);
        const mentions = await this.oauthClient.v2.userMentionTimeline(userId, {
          max_results: Math.min(maxResults, 100),
          start_time: startTime,
          end_time: endTime,
          'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'lang'], // 언어 감지: lang 추가
          expansions: ['author_id'],
          'user.fields': ['username', 'name', 'profile_image_url', 'public_metrics'] // 🔧 Phase B.2.3: public_metrics 추가
        });
        
        // 사용자 정보를 ID로 매핑
        const userMap = new Map();
        (mentions.includes?.users || []).forEach((user: any) => {
          userMap.set(user.id, user);
        });

        return (mentions.data.data || []).map((tweet: any) => {
          const author = userMap.get(tweet.author_id);
          return {
            id: tweet.id,
            text: tweet.text,
            author_id: tweet.author_id,
            created_at: tweet.created_at || new Date().toISOString(),
            public_metrics: tweet.public_metrics,
            lang: tweet.lang, // 언어 감지: lang 필드 포함
            referenced_tweets: tweet.referenced_tweets, // 🔧 답글/멘션 구분: referenced_tweets 포함
            author: author ? {
              id: author.id,
              username: author.username,
              name: author.name,
              profile_image_url: author.profile_image_url,
              public_metrics: author.public_metrics // 🔧 Phase B.2.3: public_metrics 포함
            } : undefined
          };
        });
      }
      
      // 폴백: Bearer Token (제한된 데이터)
      if (this.config.fallbackToBearerToken && this.client) {
        console.warn(`[Fallback] Bearer Token으로 getUserMentions 시도: ${userId}`);
        try {
          const mentions = await this.client.v2.userMentionTimeline(userId, {
            max_results: Math.min(maxResults, 100),
            start_time: startTime,
            end_time: endTime,
            'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'referenced_tweets', 'lang'], // 언어 감지: lang 추가
            expansions: ['author_id'],
            'user.fields': ['username', 'name', 'profile_image_url']
          });
          
          // 사용자 정보를 ID로 매핑
          const userMap = new Map();
          (mentions.includes?.users || []).forEach((user: any) => {
            userMap.set(user.id, user);
          });

          return (mentions.data.data || []).map((tweet: any) => {
            const author = userMap.get(tweet.author_id);
            return {
              id: tweet.id,
              text: tweet.text,
              author_id: tweet.author_id,
              created_at: tweet.created_at || new Date().toISOString(),
              public_metrics: tweet.public_metrics,
              lang: tweet.lang, // 언어 감지: lang 필드 포함
              referenced_tweets: tweet.referenced_tweets, // 🔧 답글/멘션 구분: referenced_tweets 포함
              author: author ? {
                id: author.id,
                username: author.username,
                name: author.name,
                profile_image_url: author.profile_image_url
              } : undefined
            };
          });
        } catch (error: any) {
          console.warn(`[Fallback Failed] Bearer Token으로 접근 불가: ${error.message}`);
          return []; // 빈 배열 반환
        }
      }
      
      throw new Error(`OAuth 인증이 필요한 엔드포인트입니다: getUserMentions`);
    }, `getUserMentions(${userId})`);
  }

  // 트윗별 모든 인게이지먼트 수집 (통합 함수)
  async collectTweetEngagements(tweetId: string, tweetCreatedAt: string, targetUserId: string): Promise<EngagementData[]> {
    console.log(`🔄 트윗 ${tweetId}의 모든 인게이지먼트 수집 시작... (인증 전략: ${this.authStrategy})`);
    
    // OAuth 사용 현황 로깅
    if (this.oauthClient) {
      console.log(`🔐 OAuth 1.0a 클라이언트 활성화 - 완전한 데이터 수집 가능`);
    } else {
      console.warn(`⚠️ OAuth 클라이언트 없음 - Bearer Token으로 제한된 수집`);
    }
    
    const engagements: EngagementData[] = [];
    let oauthSuccessCount = 0;
    let fallbackCount = 0;
    let errorCount = 0;
    
    try {
      // 1. 좋아요 수집
      console.log(`  📍 좋아요 수집 중...`);
      const likingUsers = await this.getTweetLikingUsers(tweetId);
      const likeEngagements = likingUsers.map(user => {
        // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
        const validatedProfile = this.validateEngagementProfile(user);
        return this.validateEngagementTypeAtSource({
          tweet_id: tweetId,
          engagement_type: 'like' as const,
          engaging_user_id: validatedProfile.userId,
          engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 빈 문자열 폴백 제거
          engaging_display_name: validatedProfile.displayName,
          engaging_profile_image_url: validatedProfile.profileImageUrl,
          engaging_followers_count: validatedProfile.followersCount, // 🔧 Phase B.2.1: 0 폴백 제거
          tweet_created_at: tweetCreatedAt,
          added_at: new Date().toISOString()
        }, 'getTweetLikingUsers');
      });
      engagements.push(...likeEngagements);
      console.log(`  ✅ 좋아요 ${likingUsers.length}개 수집완료`);
      
      // Rate Limit 방지를 위한 대기
      await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
      console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (좋아요 수집 후)`);

      // 2. 리포스트(리트윗) 수집
      console.log(`  📍 리포스트 수집 중...`);
      const repostedUsers = await this.getTweetRepostedByUsers(tweetId);
      const repostEngagements = repostedUsers.map(user => {
        // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
        const validatedProfile = this.validateEngagementProfile(user);
        return this.validateEngagementTypeAtSource({
          tweet_id: tweetId,
          engagement_type: 'repost' as const,
          engaging_user_id: validatedProfile.userId,
          engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 빈 문자열 폴백 제거
          engaging_display_name: validatedProfile.displayName,
          engaging_profile_image_url: validatedProfile.profileImageUrl,
          engaging_followers_count: validatedProfile.followersCount, // 🔧 Phase B.2.1: 0 폴백 제거
          tweet_created_at: tweetCreatedAt,
          added_at: new Date().toISOString()
        }, 'getTweetRepostedByUsers');
      });
      engagements.push(...repostEngagements);
      console.log(`  ✅ 리포스트 ${repostedUsers.length}개 수집완료`);
      
      // Rate Limit 방지를 위한 대기
      await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
      console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (리포스트 수집 후)`);

      // 3. 인용 트윗 수집 - 일일 5회 제한 및 품질 평가 적용
      console.log(`  📍 인용 트윗 수집 중... (일일 5회 제한 품질 평가 시스템)`);
      const quoteTweets = await this.getTweetQuotes(tweetId);
      
      if (this.quoteCounterService) {
        // 하이브리드 시스템: QuoteCounterService로 5회 제한 및 품질 평가 적용
        console.log(`  📝 [QUOTE_COUNTER] 5회 제한 품질 평가 시스템 활성화`);
        
        let validQuotes = 0;
        let rejectedQuotes = 0;
        const targetDate = new Date().toISOString().split('T')[0];
        
        for (const quote of quoteTweets) {
          try {
            // QuoteCounterService로 인용 등록 시도 (품질 평가 포함)
            const counterResult = await this.quoteCounterService.incrementQuoteCount(
              quote.author_id!,
              quote.author?.username || 'unknown',
              quote.id,
              quote.text || '',
              tweetId,
              '', // 원본 트윗 텍스트는 별도 조회 필요 시 추가
              targetDate
            );
            
            if (counterResult.success && counterResult.shouldCount) {
              // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
              const validatedProfile = this.validateEngagementProfile(quote.author || {});
              
              // 5회 제한 내의 고품질 인용만 인게이지먼트에 추가
              const quoteEngagement = this.validateEngagementTypeAtSource({
                tweet_id: tweetId,
                engagement_type: 'quote' as const,
                engaging_user_id: quote.author_id!,
                engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거 - undefined 유지하여 복구 가능성 보존
                engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
                engaging_profile_image_url: validatedProfile.profileImageUrl,
                engaging_followers_count: validatedProfile.followersCount,
                engaging_tweet_lang: quote.lang, // 언어 감지: X API lang 필드
                tweet_created_at: tweetCreatedAt,
                added_at: new Date().toISOString()
              }, 'getTweetQuotes');
              engagements.push(quoteEngagement);
              validQuotes++;
              console.log(`    ✅ 인용 승인: ${quote.id} (순번: ${counterResult.sequence}, 점수: ${counterResult.finalScore?.toFixed(2)})`);
            } else {
              rejectedQuotes++;
              console.log(`    🚫 인용 거부: ${quote.id} (${counterResult.message})`);
            }
          } catch (error) {
            console.error(`    ❌ 인용 처리 실패: ${quote.id}`, error);
            rejectedQuotes++;
          }
        }
        
        console.log(`  ✅ 인용 수집완료 - 승인: ${validQuotes}개, 거부: ${rejectedQuotes}개 (총 ${quoteTweets.length}개)`);
        
        // Rate Limit 방지를 위한 대기
        await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
        console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (인용 수집 후)`);
        
      } else {
        // 레거시 시스템: 기존 방식 (모든 인용 수집, 품질 평가 없음)
        console.log(`  ⚠️ [LEGACY] QuoteCounterService 미활성화 - 기존 방식으로 전체 인용 수집`);
        const legacyQuoteEngagements = quoteTweets.map(tweet => {
          const validatedProfile = this.validateEngagementProfile(tweet.author || {});
          return this.validateEngagementTypeAtSource({
            tweet_id: tweetId,
            engagement_type: 'quote' as const,
            engaging_user_id: tweet.author_id!,
            engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_profile_image_url: validatedProfile.profileImageUrl,
            engaging_followers_count: validatedProfile.followersCount,
            engaging_tweet_lang: tweet.lang, // 언어 감지: X API lang 필드
            tweet_created_at: tweetCreatedAt,
            added_at: new Date().toISOString()
          }, 'getTweetQuotes_legacy');
        });
        engagements.push(...legacyQuoteEngagements);
        console.log(`  ✅ 인용 트윗 ${quoteTweets.length}개 수집완료 (제한 및 품질평가 없음)`);
        
        // Rate Limit 방지를 위한 대기
        await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
        console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (레거시 인용 수집 후)`);
      }

      // 4. 답글 수집 (타겟 사용자 제외) - 다중 답글 3회 집계 적용
      console.log(`  📍 답글 수집 중... (다중 답글 3회 집계 시스템)`);
      const replies = await this.searchRecentTweets(`conversation_id:${tweetId} -from:${targetUserId}`);
      
      if (this.replyCounterService) {
        // 하이브리드 시스템: ReplyCounterService로 3회 제한 적용
        console.log(`  🔢 [REPLY_COUNTER] 3회 제한 집계 시스템 활성화`);
        
        let validReplies = 0;
        let rejectedReplies = 0;
        const targetDate = new Date().toISOString().split('T')[0];
        
        for (const reply of replies) {
          try {
            // ReplyCounterService로 답글 등록 시도
            const counterResult = await this.replyCounterService.incrementReplyCount(
              tweetId,
              reply.author_id!,
              'unknown', // Phase 1.2에서 업데이트됨
              reply.id,
              reply.text || '',
              reply.conversation_id || tweetId,
              targetDate
            );
            
            if (counterResult.success && counterResult.shouldCount) {
              // 3회 제한 내의 답글만 인게이지먼트에 추가
              const validatedProfile = this.validateEngagementProfile(reply.author || {});
              const replyEngagement = this.validateEngagementTypeAtSource({
                tweet_id: tweetId,
                engagement_type: 'reply' as const,
                engaging_user_id: reply.author_id!,
                engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
                engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
                engaging_profile_image_url: validatedProfile.profileImageUrl,
                engaging_followers_count: validatedProfile.followersCount,
                tweet_created_at: tweetCreatedAt,
                added_at: new Date().toISOString()
              }, 'searchRecentTweets_replies');
              engagements.push(replyEngagement);
              validReplies++;
              console.log(`    ✅ 답글 승인: ${reply.id} (순번: ${counterResult.sequence})`);
            } else {
              rejectedReplies++;
              console.log(`    🚫 답글 거부: ${reply.id} (${counterResult.message})`);
            }
          } catch (error) {
            console.error(`    ❌ 답글 처리 실패: ${reply.id}`, error);
            rejectedReplies++;
          }
        }
        
        console.log(`  ✅ 답글 수집완료 - 승인: ${validReplies}개, 거부: ${rejectedReplies}개 (총 ${replies.length}개)`);
        
        // Rate Limit 방지를 위한 대기
        await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
        console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (답글 수집 후)`);
        
      } else {
        // 레거시 시스템: 기존 방식 (모든 답글 수집)
        console.log(`  ⚠️ [LEGACY] ReplyCounterService 미활성화 - 기존 방식으로 전체 답글 수집`);
        const legacyReplyEngagements = replies.map(tweet => {
          // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
          const validatedProfile = this.validateEngagementProfile(tweet.author || {});
          return this.validateEngagementTypeAtSource({
            tweet_id: tweetId,
            engagement_type: 'reply' as const,
            engaging_user_id: tweet.author_id!,
            engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_profile_image_url: validatedProfile.profileImageUrl,
            engaging_followers_count: validatedProfile.followersCount, // 🔧 Phase B.2.1: 0 폴백 제거
            tweet_created_at: tweetCreatedAt,
            added_at: new Date().toISOString()
          }, 'searchRecentTweets_replies_legacy');
        });
        engagements.push(...legacyReplyEngagements);
        console.log(`  ✅ 답글 ${replies.length}개 수집완료 (제한 없음)`);
        
        // Rate Limit 방지를 위한 대기
        await this.sleep(this.ENGAGEMENT_COLLECTION_DELAY);
        console.log(`⏰ Rate Limit 방지를 위해 ${this.ENGAGEMENT_COLLECTION_DELAY/1000}초 대기 완료 (레거시 답글 수집 후)`);
      }

      // Phase 1.2: Unknown 사용자명 실시간 업데이트 (디버그 핵심 기능)
      console.log(`  🔄 Unknown 사용자명 업데이트 중...`);
      const updatedEngagements = await this.updateEngagementUsernames(engagements);
      
      // 업데이트 통계 로깅
      const unknownBefore = engagements.filter(e => e.engaging_username === 'unknown').length;
      const unknownAfter = updatedEngagements.filter(e => e.engaging_username === 'unknown').length;
      const resolvedCount = unknownBefore - unknownAfter;
      
      console.log(`  ✅ 사용자명 업데이트 완료: ${resolvedCount}/${unknownBefore}개 해결 (해결률: ${unknownBefore > 0 ? ((resolvedCount/unknownBefore)*100).toFixed(1) : 0}%)`);
      
      if (unknownAfter > 0) {
        console.warn(`  ⚠️ 남은 Unknown 사용자: ${unknownAfter}개 (삭제된 계정 또는 API 제한으로 추정)`);
      }

      // 수집 통계 및 인증 전략 요약
      console.log(`🎉 트윗 ${tweetId} 인게이지먼트 수집완료: 총 ${updatedEngagements.length}개`);
      console.log(`📊 인증 전략: ${this.authStrategy} | OAuth 활성: ${!!this.oauthClient}`);
      
      if (this.authStrategy === 'hybrid') {
        console.log(`📈 데이터 품질: OAuth를 통한 완전한 수집으로 높은 정확도 달성`);
      } else if (this.authStrategy === 'bearer') {
        console.warn(`⚠️ 데이터 품질: Bearer Token 전용으로 일부 데이터 누락 가능성`);
      }
      
      // 수집 완료 후 검증 통계 출력
      console.log(`📊 트윗 ${tweetId} 수집 완료 - 통계 요약:`);
      this.printEngagementValidationStats();
      this.printFollowersCountStats();
      
      return updatedEngagements;

    } catch (error) {
      console.error(`❌ 트윗 ${tweetId} 인게이지먼트 수집 실패:`, error);
      // 에러 발생 시에도 통계 출력
      this.printEngagementValidationStats();
      this.printFollowersCountStats();
      throw error;
    }
  }

  // Phase 1.1: 사용자 ID 배치 조회 (Unknown Username 디버그 - 핵심 기능)
  async getUsersByIds(userIds: string[]): Promise<TwitterUser[]> {
    // 빈 배열 체크
    if (!userIds || userIds.length === 0) {
      return [];
    }

    // Twitter API 제한에 따라 최대 100개씩 배치 처리
    const batchSize = 100;
    const allUsers: TwitterUser[] = [];
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      try {
        console.log(`📋 [getUsersByIds] 배치 ${Math.floor(i/batchSize) + 1}: ${batch.length}개 사용자 조회 중...`);
        
        const batchUsers = await this.makeApiCall(async () => {
          // ✅ Bearer Token 클라이언트 우선 사용 (OAuth 토큰 만료 무관)
          // Twitter 표준 방법론: 공개 데이터(username, followers_count)만으로 언어 분류 가능
          if (this.client) {
            const users = await this.client.v2.users(batch, {
              'user.fields': ['created_at', 'public_metrics', 'profile_image_url']
            });

            return (users.data || []).map((user: any) => ({
              id: user.id,
              username: user.username,
              name: user.name,
              profile_image_url: user.profile_image_url,
              public_metrics: user.public_metrics,
            }));
          }

          // OAuth 클라이언트는 상세 정보(description, location) 필요 시에만
          if (this.oauthClient) {
            const users = await this.oauthClient.v2.users(batch, {
              'user.fields': ['created_at', 'public_metrics', 'profile_image_url', 'description']
            });

            return (users.data || []).map((user: any) => ({
              id: user.id,
              username: user.username,
              name: user.name,
              profile_image_url: user.profile_image_url,
              public_metrics: user.public_metrics,
            }));
          }

          throw new Error(`사용자 조회를 위한 인증이 필요합니다`);
        }, `getUsersByIds(batch:${batch.length})`);
        
        allUsers.push(...batchUsers);
        console.log(`✅ [getUsersByIds] 배치 완료: ${batchUsers.length}개 사용자 조회됨`);
        
        // Rate Limit 방지를 위한 배치 간 대기
        if (i + batchSize < userIds.length) {
          await this.sleep(this.RATE_LIMIT_DELAY);
        }
        
      } catch (error: any) {
        console.error(`❌ [getUsersByIds] 배치 ${Math.floor(i/batchSize) + 1} 실패:`, error.message);
        // 배치 실패 시에도 다음 배치 계속 처리
      }
    }
    
    console.log(`🎉 [getUsersByIds] 전체 완료: ${allUsers.length}/${userIds.length}개 사용자 ���회됨`);
    return allUsers;
  }

  // Phase 1.1: 인게이지먼트 데이터의 사용자명 업데이트 (Unknown Username 해결)
  async updateEngagementUsernames(engagements: EngagementData[]): Promise<EngagementData[]> {
    // Unknown 사용자만 필터링
    const unknownEngagements = engagements.filter(e => 
      e.engaging_username === 'unknown' && e.engaging_user_id
    );
    
    if (unknownEngagements.length === 0) {
      console.log(`✅ [updateEngagementUsernames] Unknown 사용자 없음 - 업데이트 불필요`);
      return engagements;
    }
    
    console.log(`🔄 [updateEngagementUsernames] Unknown 사용자 ${unknownEngagements.length}개 업데이트 시작...`);
    
    // 유니크한 사용자 ID 추출
    const uniqueUserIds = Array.from(new Set(unknownEngagements.map(e => e.engaging_user_id!)));
    console.log(`📊 [updateEngagementUsernames] 유니크 사용자 ID: ${uniqueUserIds.length}개`);
    
    try {
      // 배치로 사용자 정보 조회
      const users = await this.getUsersByIds(uniqueUserIds);
      
      // 사용자 ID -> 사용자 정보 매핑 생성
      const userMap = new Map<string, TwitterUser>();
      users.forEach(user => userMap.set(user.id, user));
      
      // 인게이지먼트 데이터 업데이트
      const updatedEngagements = engagements.map(engagement => {
        if (engagement.engaging_username === 'unknown' && engagement.engaging_user_id) {
          const user = userMap.get(engagement.engaging_user_id);
          if (user) {
            return {
              ...engagement,
              engaging_username: user.username,
              engaging_display_name: user.name,
            };
          }
        }
        return engagement;
      });
      
      // 통계 로깅
      const updatedCount = updatedEngagements.filter(e => e.engaging_username !== 'unknown').length - 
                          engagements.filter(e => e.engaging_username !== 'unknown').length;
      
      console.log(`✅ [updateEngagementUsernames] 완료: ${updatedCount}개 사용자명 업데이트됨`);
      console.log(`📈 [updateEngagementUsernames] 성공률: ${((updatedCount / unknownEngagements.length) * 100).toFixed(1)}%`);
      
      return updatedEngagements;
      
    } catch (error: any) {
      console.error(`❌ [updateEngagementUsernames] 실패:`, error.message);
      // 실패 시 원본 데이터 반환
      return engagements;
    }
  }

  // 사용자 ID 일괄 변환 (V1에서 이미 검증된 로직)
  async convertUsernamesToIds(usernames: string[]): Promise<Set<string>> {
    const userIds = new Set<string>();
    
    for (const username of usernames) {
      try {
        console.log(`Converting username @${username} to user ID...`);
        const user = await this.getUserByUsername(username);
        
        if (user?.id) {
          userIds.add(user.id);
          console.log(`✓ @${username} → ${user.id}`);
        } else {
          console.warn(`❌ User not found: @${username}`);
        }
      } catch (error) {
        console.error(`❌ Failed to get user ID for @${username}:`, error);
      }
    }
    
    return userIds;
  }

  // 타겟 계정 북마크 수집 (OAuth 2.0 User Context 필수)
  async getTargetUserBookmarks(userId: string, maxResults: number = 100): Promise<any[]> {
    console.log(`🔖 타겟 계정 북마크 수집 시작: ${userId} (최대 ${maxResults}개)`);
    
    // Rate Limit 최적화: 북마크 API는 중요한 데이터이므로 보수적 대기
    await this.sleep(this.CONSERVATIVE_DELAY);
    
    return this.makeApiCall(async () => {
      // OAuth 2.0 클라이언트 필수 (북마크 API는 User Context만 지원)
      if (!this.oauth2Client) {
        if (this.oauthClient) {
          console.log(`🔄 OAuth 1.0a 클라이언트로 북마크 조회 시도: ${userId}`);
          // OAuth 1.0a로 시도해보지만 북마크는 지원하지 않을 가능성 높음
          try {
            const bookmarks = await this.oauthClient.v2.bookmarks({
              max_results: Math.min(maxResults, 100),
              'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'entities'],
              'user.fields': ['username', 'name'],
              expansions: ['author_id']
            });
            
            const bookmarkTweets = (bookmarks.data?.data || []).map((tweet: any) => ({
              id: tweet.id,
              text: tweet.text,
              author_id: tweet.author_id,
              created_at: tweet.created_at,
              entities: tweet.entities,
              public_metrics: tweet.public_metrics
            }));
            
            console.log(`✅ [OAuth 1.0a] 북마크 수집 완료: ${bookmarkTweets.length}개`);
            return bookmarkTweets;
          } catch (error: any) {
            console.warn(`⚠️ [OAuth 1.0a] 북마크 조회 실패, OAuth 2.0 필요: ${error.message}`);
          }
        }
        
        throw new Error(`OAuth 2.0 authentication is required for bookmarks API. Current auth: ${this.authStrategy}`);
      }
      
      console.log(`🔐 [OAuth 2.0] 북마크 API 호출: ${userId}`);
      
      // OAuth 2.0 User Context로 북마크 조회
      const bookmarks = await this.oauth2Client.v2.bookmarks({
        max_results: Math.min(maxResults, 100),
        'tweet.fields': ['created_at', 'public_metrics', 'author_id', 'entities'],
        'user.fields': ['username', 'name'],
        expansions: ['author_id']
      });
      
      // 응답 데이터 정규화
      const bookmarkTweets = (bookmarks.data?.data || []).map((tweet: any) => ({
        id: tweet.id,
        text: tweet.text,
        author_id: tweet.author_id,
        created_at: tweet.created_at || new Date().toISOString(),
        entities: tweet.entities || {},
        public_metrics: tweet.public_metrics || {},
        // 북마크 관련 메타데이터 추가
        bookmarked_at: new Date().toISOString() // 실제 북마크 시간은 API에서 제공하지 않음
      }));
      
      console.log(`✅ [OAuth 2.0] 타겟 계정 북마크 수집 완료: ${bookmarkTweets.length}개`);
      return bookmarkTweets;
      
    }, `getTargetUserBookmarks(${userId})`);
  }

  // 북마크된 트윗의 타겟 멘션 검증
  async validateTargetMentionsInBookmark(bookmarkedTweet: any, targetUsernames: string[] = [process.env.TARGET_USERNAME || 'Naru010110']): Promise<{
    isValid: boolean;
    mentionedTargetUsernames: string[];
    validationDetails: any;
  }> {
    console.log(`🔍 북마크 트윗 멘션 검증 시작: ${bookmarkedTweet.id}`);
    
    const mentionedTargetUsernames: string[] = [];
    
    // entities에서 멘션 추출
    const mentions = bookmarkedTweet.entities?.mentions || [];
    
    // 타겟 사용자명과 비교
    for (const mention of mentions) {
      if (targetUsernames.includes(mention.username)) {
        mentionedTargetUsernames.push(mention.username);
      }
    }
    
    const isValid = mentionedTargetUsernames.length > 0;
    
    const validationDetails = {
      totalMentions: mentions.length,
      targetMentions: mentionedTargetUsernames.length,
      checkedTargetUsernames: targetUsernames,
      allMentionUsernames: mentions.map((m: any) => m.username)
    };

    console.log(`🔍 [DEBUG] 멘션 검증 상세:`, JSON.stringify({
      tweetId: bookmarkedTweet.id,
      hasEntities: !!bookmarkedTweet.entities,
      mentions: mentions,
      targetUsernames: targetUsernames,
      mentionedTargetUsernames: mentionedTargetUsernames,
      validationDetails
    }, null, 2));

    console.log(`${isValid ? '✅' : '⏭️'} 북마크 트윗 멘션 검증 완료: ${bookmarkedTweet.id} (타겟 멘션: ${mentionedTargetUsernames.length}개)`);
    
    return {
      isValid,
      mentionedTargetUsernames,
      validationDetails
    };
  }

  // 멘션 수집 (별도 함수 - 타겟 사용자별로 수집) - 고도화된 멘션 점수 시스템 적용
  async collectUserMentions(targetUserId: string, startTime: string, endTime: string): Promise<EngagementData[]> {
    console.log(`🔄 사용자 ${targetUserId}의 멘션 수집 시작... (${startTime} ~ ${endTime})`);
    
    try {
      const mentions = await this.getUserMentions(targetUserId, startTime, endTime);
      console.log(`📨 원본 멘션 ${mentions.length}개 수집`);
      
      if (this.mentionCounterService) {
        // 고도화된 시스템: MentionCounterService로 일일 3회 제한 + 4시간 쿨다운 적용
        console.log(`🏷️ [MENTION_COUNTER] 고도화된 멘션 점수 시스템 활성화`);
        
        let validMentions = 0;
        let rejectedMentions = 0;
        const processedEngagements: EngagementData[] = [];
        const targetDate = new Date().toISOString().split('T')[0];
        
        // 타겟 사용자명 획득 (환경변수 기반)
        const targetUsernames = [this.config.targetUsername]; // TARGET_USERNAME 환경변수 사용
        
        for (const mention of mentions) {
          try {
            // 1. 멘션 내용 검증 (타겟 멘션 포함 여부, 최소 길이, 스팸 지표)
            const validTargetMentions = extractValidTargetMentions(mention.text || '', targetUsernames);
            
            if (validTargetMentions.length === 0) {
              console.log(`🔍 멘션 내용 검증 실패: ${mention.id} - 유효한 타겟 멘션 없음`);
              
              // CloudWatch 메트릭 기록 (콘텐츠 품질 실패)
              await cloudWatchMetrics.recordMentionContentQualityFailure('유효한 타겟 멘션 없음');
              
              rejectedMentions++;
              continue;
            }
            
            // 2. MentionCounterService로 일일 제한 + 쿨다운 검증
            const counterResult = await this.mentionCounterService.incrementMentionCount(
              mention.author_id!,
              'unknown', // Phase 1.2에서 업데이트됨
              mention.id,
              mention.text || '',
              targetUserId,
              targetUsernames[0], // 첫 번째 타겟 사용자명 사용
              targetDate
            );
            
            if (counterResult.success && counterResult.shouldCount) {
              // 3. 답글 vs 독립 멘션 구분
              const isReply = mention.referenced_tweets?.some(ref => ref.type === 'replied_to') || false;
              const engagementType = isReply ? 'reply' : 'mention';
              console.log(`🔍 [CLASSIFICATION] 트윗 ${mention.id}: referenced_tweets=${JSON.stringify(mention.referenced_tweets)}, isReply=${isReply}, engagementType=${engagementType}`);

              // 4. 점수 계산 (품질 + 쿨다운 보너스)
              const qualityScore = evaluateMentionQuality(mention.text || '', validTargetMentions[0]);
              const cooldownBonus = calculateCooldownBonus(counterResult.intervalHours);
              const finalScore = calculateMentionScore(MENTION_RULES.baseScore, qualityScore, cooldownBonus);

              // 5. 인게이지먼트에 추가 (고도화된 점수 반영)
              // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
              const validatedProfile = this.validateEngagementProfile(mention.author || {});
              const mentionEngagement = this.validateEngagementTypeAtSource({
                tweet_id: mention.id,
                engagement_type: engagementType as 'reply' | 'mention',
                engaging_user_id: mention.author_id!,
                engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
                engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
                engaging_profile_image_url: validatedProfile.profileImageUrl,
                engaging_followers_count: validatedProfile.followersCount, // 🔧 Phase B.2.1: 0 폴백 제거
                engaging_tweet_lang: mention.lang, // 언어 감지: X API lang 필드
                tweet_created_at: mention.created_at,
                added_at: new Date().toISOString(),
                score_value: finalScore // 고도화된 점수 저장
              }, 'searchRecentTweets_mentions');
              processedEngagements.push(mentionEngagement);
              
              validMentions++;
              // CloudWatch 메트릭 기록 (성공)
              await cloudWatchMetrics.recordMentionProcessingSuccess(
                finalScore, 
                qualityScore, 
                cooldownBonus, 
                mention.text?.length || 0
              );
              
              console.log(`✅ ${isReply ? '답글' : '독립 멘션'} 승인: ${mention.id} (타입: ${engagementType}, 순번: ${counterResult.sequence}, 점수: ${finalScore}, 품질: ${(qualityScore * 100).toFixed(0)}%, 쿨다운: ${counterResult.intervalHours}h)`);
              
            } else {
              rejectedMentions++;
              const reason = counterResult.maxReached ? '일일 제한 초과' : 
                           counterResult.cooldownViolated ? `쿨다운 위반 (${counterResult.intervalHours}h)` : 
                           '기타 검증 실패';
              
              // CloudWatch 메트릭 기록 (실패)
              if (counterResult.maxReached) {
                await cloudWatchMetrics.recordMentionDailyLimitReached(mention.author_id!);
              } else if (counterResult.cooldownViolated) {
                await cloudWatchMetrics.recordMentionCooldownViolation(counterResult.intervalHours);
              }
              
              console.log(`🚫 멘션 거부: ${mention.id} (${reason})`);
            }
            
          } catch (error) {
            console.error(`❌ 멘션 처리 실패: ${mention.id}`, error);
            
            // CloudWatch 메트릭 기록 (처리 실패)
            await cloudWatchMetrics.recordMentionProcessingFailure(error instanceof Error ? error.message : '알 수 없는 오류');
            
            rejectedMentions++;
          }
        }
        
        console.log(`📊 멘션 처리 완료 - 승인: ${validMentions}개, 거부: ${rejectedMentions}개 (총 ${mentions.length}개)`);
        
        // Phase 1.2: 승인된 멘션의 사용자명 업데이트
        if (processedEngagements.length > 0) {
          console.log(`🔄 승인된 멘션 사용자명 업데이트 중...`);
          const updatedEngagements = await this.updateEngagementUsernames(processedEngagements);
          
          const unknownBefore = processedEngagements.filter(e => e.engaging_username === 'unknown').length;
          const unknownAfter = updatedEngagements.filter(e => e.engaging_username === 'unknown').length;
          const resolvedCount = unknownBefore - unknownAfter;
          
          console.log(`🎉 고도화된 멘션 수집완료: ${updatedEngagements.length}개 (사용자명 해결: ${resolvedCount}/${unknownBefore}개)`);
          
          return updatedEngagements;
        }
        
        return processedEngagements;
        
      } else {
        // 레거시 시스템: 기존 방식 (모든 멘션 수집)
        console.log(`⚠️ [MENTION_LEGACY] MentionCounterService 미활성화 - 기존 방식 사용`);
        
        const engagements: EngagementData[] = mentions.map(mention => {
          // 🔧 Phase 1.2.2: API 응답 데이터 검증 및 후처리
          const validatedProfile = this.validateEngagementProfile(mention.author || {});
          return this.validateEngagementTypeAtSource({
            tweet_id: mention.id,
            engagement_type: 'mention' as const,
            engaging_user_id: mention.author_id!,
            engaging_username: validatedProfile.username, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_display_name: validatedProfile.displayName, // 🔧 Phase B.2.1: 'unknown' 폴백 제거
            engaging_profile_image_url: validatedProfile.profileImageUrl,
            engaging_followers_count: validatedProfile.followersCount, // 🔧 Phase B.2.1: 0 폴백 제거
            tweet_created_at: mention.created_at,
            added_at: new Date().toISOString()
          }, 'searchRecentTweets_mentions_legacy');
        });

        // Phase 1.2: Unknown 사용자명 실시간 업데이트
        console.log(`🔄 멘션 사용자명 업데이트 중...`);
        const updatedEngagements = await this.updateEngagementUsernames(engagements);
        
        const unknownBefore = engagements.filter(e => e.engaging_username === 'unknown').length;
        const unknownAfter = updatedEngagements.filter(e => e.engaging_username === 'unknown').length;
        const resolvedCount = unknownBefore - unknownAfter;
        
        console.log(`🎉 레거시 멘션 수집완료: ${updatedEngagements.length}개 (사용자명 해결: ${resolvedCount}/${unknownBefore}개)`);
        
        return updatedEngagements;
      }
      
    } catch (error) {
      console.error(`❌ 멘션 수집 실패:`, error);
      throw error;
    }
  }

  

  // Phase 3: Rate Limit 관련 유틸리티 메서드들
  
  /**
   * Rate Limit 현재 상태 조회
   */
  public getRateLimitStatus() {
    return this.rateLimitMonitor.getMetrics();
  }

  /**
   * Rate Limit CloudWatch 메트릭 전송
   */
  public async sendRateLimitMetrics(): Promise<void> {
    try {
      await this.rateLimitMonitor.sendMetricsToCloudWatch();
      console.log(`📈 [RATE_LIMIT] CloudWatch 메트릭 전송 완료`);
    } catch (error: any) {
      console.error(`❌ [RATE_LIMIT] CloudWatch 메트릭 전송 실패:`, error.message);
    }
  }

  /**
   * 배치 처리 전 안전성 검증
   */
  public async validateBatchSafety(plannedCalls: number): Promise<{ safe: boolean; waitTime: number; recommendation: string }> {
    const metrics = this.rateLimitMonitor.getMetrics();
    const riskLevel = this.rateLimitMonitor.getRiskLevel();
    
    if (metrics.remainingCalls >= plannedCalls && riskLevel !== 'CRITICAL') {
      return {
        safe: true,
        waitTime: 0,
        recommendation: `배치 처리 안전: ${plannedCalls}개 호출 가능 (남은 호출: ${metrics.remainingCalls}개)`
      };
    }
    
    const waitTime = this.rateLimitMonitor.calculateBatchWaitTime(plannedCalls);
    return {
      safe: false,
      waitTime,
      recommendation: `배치 처리 위험: ${Math.ceil(waitTime / 60000)}분 대기 후 실행 권장 (위험도: ${riskLevel})`
    };
  }

  /**
   * 긴급 상황 감지 및 알림
   */
  public checkEmergencyState(): { isEmergency: boolean; action: string } {
    const isEmergency = this.rateLimitMonitor.isEmergencyState();
    
    if (isEmergency) {
      console.error(`🚨 [RATE_LIMIT] 긴급 상황 감지: 연속적인 Rate Limit Hit`);
      return {
        isEmergency: true,
        action: '즉시 API 호출 중단 및 시스템 관리자 알림 필요'
      };
    }
    
    return {
      isEmergency: false,
      action: '정상 작동 중'
    };
  }

  // ===== engagement_type 검증 메서드들 =====

  /**
   * engagement_type 검증 및 통계 업데이트
   * @param engagement 검증할 인게이지먼트 데이터
   * @param sourceContext 데이터 출처 컨텍스트 (어떤 API에서 가져온 데이터인지)
   * @returns 검증된 인게이지먼트 데이터
   */
  private validateEngagementTypeAtSource(engagement: EngagementData, sourceContext: string): EngagementData {
    this.engagementValidationStats.totalProcessed++;
    
    const validTypes = ['like', 'reply', 'repost', 'quote', 'mention'];
    const currentType = engagement.engagement_type;
    
    // 타입 분포 통계 업데이트
    const currentCount = this.engagementValidationStats.typeDistribution.get(currentType) || 0;
    this.engagementValidationStats.typeDistribution.set(currentType, currentCount + 1);
    
    // followers_count 통계 업데이트
    this.updateFollowersCountStats(engagement);
    
    // 타입 검증
    if (validTypes.includes(currentType)) {
      this.engagementValidationStats.validTypes++;
      console.log(`✅ [TWITTER_API] 유효한 engagement_type 확인: "${currentType}" (출처: ${sourceContext}, 사용자: ${engagement.engaging_user_id})`);
      return engagement;
    }
    
    // 무효한 타입 감지
    this.engagementValidationStats.invalidTypes++;
    console.error(`❌ [TWITTER_API] 무효한 engagement_type 감지: "${currentType}" (출처: ${sourceContext}, 사용자: ${engagement.engaging_user_id})`);
    
    // 소스 컨텍스트를 기반으로 올바른 타입 추론
    const correctedType = this.inferCorrectTypeFromSource(currentType, sourceContext);
    
    if (correctedType !== currentType) {
      this.engagementValidationStats.correctedTypes++;
      console.warn(`🔧 [TWITTER_API] engagement_type 자동 수정: "${currentType}" → "${correctedType}" (출처: ${sourceContext})`);
      
      return {
        ...engagement,
        engagement_type: correctedType as "like" | "reply" | "repost" | "quote" | "mention"
      };
    }
    
    // 수정 불가능한 경우 오류 로그
    console.error(`❌ [TWITTER_API] engagement_type 자동 수정 실패: "${currentType}" (출처: ${sourceContext})`);
    return engagement;
  }
  
  /**
   * 소스 컨텍스트를 기반으로 올바른 engagement_type 추론
   * @param currentType 현재 잘못된 타입
   * @param sourceContext 데이터 출처 (getTweetLikingUsers, getTweetRepostedByUsers 등)
   * @returns 추론된 올바른 타입
   */
  private inferCorrectTypeFromSource(currentType: string, sourceContext: string): string {
    // 1. 소스 컨텍스트 기반 매핑
    const sourceMapping: { [key: string]: string } = {
      'getTweetLikingUsers': 'like',
      'getTweetRepostedByUsers': 'repost',
      'getQuoteTweets': 'quote',
      'getReplies': 'reply',
      'getMentions': 'mention'
    };
    
    // 소스에서 직접 매핑
    for (const [source, correctType] of Object.entries(sourceMapping)) {
      if (sourceContext.includes(source)) {
        return correctType;
      }
    }
    
    // 2. 타입 이름 기반 추론 (기존 로직 재활용)
    const type = currentType.toLowerCase();
    if (type.includes('like') || type.includes('favorite')) return 'like';
    if (type.includes('repost') || type.includes('retweet')) return 'repost';
    if (type.includes('quote')) return 'quote';
    if (type.includes('reply') || type.includes('response')) return 'reply';
    if (type.includes('mention')) return 'mention';
    
    // 3. 기본값
    return 'mention';
  }
  
  /**
   * engagement_type 검증 통계 출력
   */
  public printEngagementValidationStats(): void {
    if (this.engagementValidationStats.totalProcessed === 0) {
      console.log(`📊 [TWITTER_API] engagement_type 검증 통계: 처리된 데이터 없음`);
      return;
    }
    
    const validPercentage = (this.engagementValidationStats.validTypes / this.engagementValidationStats.totalProcessed * 100).toFixed(1);
    const invalidPercentage = (this.engagementValidationStats.invalidTypes / this.engagementValidationStats.totalProcessed * 100).toFixed(1);
    const correctedPercentage = this.engagementValidationStats.invalidTypes > 0 
      ? (this.engagementValidationStats.correctedTypes / this.engagementValidationStats.invalidTypes * 100).toFixed(1)
      : '0.0';
    
    console.log(`📊 [TWITTER_API] engagement_type 수집 단계 검증 통계:`);
    console.log(`   📈 총 처리: ${this.engagementValidationStats.totalProcessed}개`);
    console.log(`   ✅ 유효한 타입: ${this.engagementValidationStats.validTypes}개 (${validPercentage}%)`);
    console.log(`   ❌ 무효한 타입: ${this.engagementValidationStats.invalidTypes}개 (${invalidPercentage}%)`);
    if (this.engagementValidationStats.invalidTypes > 0) {
      console.log(`   🔧 자동 수정: ${this.engagementValidationStats.correctedTypes}개 (${correctedPercentage}%)`);
    }
    
    // 타입 분포 출력
    console.log(`   📊 타입 분포:`);
    Array.from(this.engagementValidationStats.typeDistribution.entries())
      .sort(([,a], [,b]) => b - a)
      .forEach(([type, count]) => {
        const percentage = (count / this.engagementValidationStats.totalProcessed * 100).toFixed(1);
        console.log(`      "${type}": ${count}개 (${percentage}%)`);
      });
  }
  
  /**
   * engagement_type 검증 통계 초기화
   */
  public resetEngagementValidationStats(): void {
    this.engagementValidationStats = {
      totalProcessed: 0,
      validTypes: 0,
      invalidTypes: 0,
      correctedTypes: 0,
      typeDistribution: new Map<string, number>()
    };
    console.log(`🔄 [TWITTER_API] engagement_type 검증 통계 초기화 완료`);
  }
  
  // ===== followers_count 수집 관련 메서드들 =====
  
  /**
   * followers_count 통계 업데이트
   * @param engagement 인게이지먼트 데이터
   */
  private updateFollowersCountStats(engagement: EngagementData): void {
    this.followersCountStats.totalProcessed++;
    
    const followersCount = engagement.engaging_followers_count || 0;
    
    if (followersCount > 0) {
      this.followersCountStats.withFollowersCount++;
      
      // 최대/최소값 업데이트
      this.followersCountStats.maxFollowersCount = Math.max(this.followersCountStats.maxFollowersCount, followersCount);
      this.followersCountStats.minFollowersCount = Math.min(this.followersCountStats.minFollowersCount, followersCount);
      
      // 범위별 분포 업데이트
      const range = this.categorizeFollowersCount(followersCount);
      const currentCount = this.followersCountStats.followersCountDistribution.get(range) || 0;
      this.followersCountStats.followersCountDistribution.set(range, currentCount + 1);
    } else {
      this.followersCountStats.withoutFollowersCount++;
      console.warn(`⚠️ [FOLLOWERS] 팔로워 수 없음: 사용자 ${engagement.engaging_user_id} (${engagement.engaging_username})`);
    }
  }
  
  /**
   * 팔로워 수를 범위별로 분류
   * @param followersCount 팔로워 수
   * @returns 범위 카테고리
   */
  private categorizeFollowersCount(followersCount: number): string {
    if (followersCount === 0) return '0';
    if (followersCount <= 10) return '1-10';
    if (followersCount <= 50) return '11-50';
    if (followersCount <= 100) return '51-100';
    if (followersCount <= 500) return '101-500';
    if (followersCount <= 1000) return '501-1K';
    if (followersCount <= 5000) return '1K-5K';
    if (followersCount <= 10000) return '5K-10K';
    if (followersCount <= 50000) return '10K-50K';
    if (followersCount <= 100000) return '50K-100K';
    if (followersCount <= 500000) return '100K-500K';
    if (followersCount <= 1000000) return '500K-1M';
    return '1M+';
  }
  
  /**
   * followers_count 수집 통계 출력
   */
  public printFollowersCountStats(): void {
    if (this.followersCountStats.totalProcessed === 0) {
      console.log(`📊 [FOLLOWERS] 팔로워 수 수집 통계: 처리된 데이터 없음`);
      return;
    }
    
    const withFollowersPercentage = (this.followersCountStats.withFollowersCount / this.followersCountStats.totalProcessed * 100).toFixed(1);
    const withoutFollowersPercentage = (this.followersCountStats.withoutFollowersCount / this.followersCountStats.totalProcessed * 100).toFixed(1);
    
    // 평균값 계산
    if (this.followersCountStats.withFollowersCount > 0) {
      let totalFollowers = 0;
      Array.from(this.followersCountStats.followersCountDistribution.entries()).forEach(([range, count]) => {
        const avgForRange = this.getAverageForRange(range);
        totalFollowers += avgForRange * count;
      });
      this.followersCountStats.averageFollowersCount = totalFollowers / this.followersCountStats.withFollowersCount;
    }
    
    console.log(`📊 [FOLLOWERS] 팔로워 수 수집 통계:`);
    console.log(`   📈 총 처리: ${this.followersCountStats.totalProcessed}개`);
    console.log(`   ✅ 팔로워 수 있음: ${this.followersCountStats.withFollowersCount}개 (${withFollowersPercentage}%)`);
    console.log(`   ❌ 팔로워 수 없음: ${this.followersCountStats.withoutFollowersCount}개 (${withoutFollowersPercentage}%)`);
    
    if (this.followersCountStats.withFollowersCount > 0) {
      console.log(`   📊 통계 정보:`);
      console.log(`      평균: ${this.followersCountStats.averageFollowersCount.toFixed(0)}명`);
      console.log(`      최대: ${this.followersCountStats.maxFollowersCount.toLocaleString()}명`);
      console.log(`      최소: ${this.followersCountStats.minFollowersCount.toLocaleString()}명`);
      
      // 분포 출력 (상위 5개)
      console.log(`   📊 팔로워 수 분포 (상위 5개):`);
      Array.from(this.followersCountStats.followersCountDistribution.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([range, count]) => {
          const percentage = (count / this.followersCountStats.totalProcessed * 100).toFixed(1);
          console.log(`      ${range}: ${count}개 (${percentage}%)`);
        });
    }
  }
  
  /**
   * 범위별 평균값 추정
   * @param range 범위 문자열
   * @returns 추정 평균값
   */
  private getAverageForRange(range: string): number {
    const rangeMap: { [key: string]: number } = {
      '0': 0,
      '1-10': 5,
      '11-50': 30,
      '51-100': 75,
      '101-500': 300,
      '501-1K': 750,
      '1K-5K': 3000,
      '5K-10K': 7500,
      '10K-50K': 30000,
      '50K-100K': 75000,
      '100K-500K': 300000,
      '500K-1M': 750000,
      '1M+': 1500000
    };
    return rangeMap[range] || 0;
  }
  
  /**
   * followers_count 수집 통계 초기화
   */
  public resetFollowersCountStats(): void {
    this.followersCountStats = {
      totalProcessed: 0,
      withFollowersCount: 0,
      withoutFollowersCount: 0,
      averageFollowersCount: 0,
      maxFollowersCount: 0,
      minFollowersCount: Number.MAX_SAFE_INTEGER,
      followersCountDistribution: new Map<string, number>()
    };
    console.log(`🔄 [TWITTER_API] followers_count 수집 통계 초기화 완료`);
  }
}