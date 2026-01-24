// V2 누적 점수 시스템 - Delta 계산 서비스

import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { EngagementData, ScoreWeights } from "../types/cumulative";
import { CommunityClassificationService } from "./community-classification-service";
import {
  LanguageCode,
  WeightCalculationResult,
  DEFAULT_WEIGHT_CONFIG,
  EnvironmentConfig
} from "../types/community";

export interface UserDelta {
  userId: string;
  username?: string; // undefined 허용 (프로필 복구 대상)
  displayName?: string; // 사용자의 실제 표시 이름 (예: "Overclocked 🛸")
  followersCount?: number; // 팔로워 수 (🆕 추가)
  profileImageUrl?: string; // 프로필 이미지 URL (🆕 Phase 1.3.2에서 추가)
  scoreChange: number;
  likesChange: number;
  repliesChange: number;
  repostsChange: number;
  quotesChange: number;
  mentionsChange: number;
  // 타겟 보너스 변화량 필드
  targetBookmarkBonusChange?: number;  // 북마크 보너스 변화량
  targetRetweetBonusChange?: number;   // 리트윗 보너스 변화량
  // 타겟 보너스 카운트 변화량 필드
  targetBookmarksChange?: number;      // 북마크 개수 변화량
  targetRetweetsChange?: number;       // 리트윗 개수 변화량
  addedEngagements: EngagementData[];
  removedEngagements: EngagementData[];

  // 커뮤니티 가중치 관련 메타데이터
  communityWeight?: number;
  dominantLanguage?: LanguageCode; // 감지된 주요 언어 (예: 'ko', 'en', 'ja') - config 선택 기준
  logBase?: number;
  languageMultiplier?: number;
  followerWeight?: number;
  cappedAtMax?: boolean;
  originalScore?: number; // 가중치 적용 전 원본 점수
}

export interface DeltaCalculationResult {
  totalChangedUsers: number;
  totalScoreChanges: number;
  userDeltas: UserDelta[];
  summary: {
    added: { likes: number; replies: number; reposts: number; quotes: number; mentions: number; total: number };
    removed: { likes: number; replies: number; reposts: number; quotes: number; mentions: number; total: number };
  };
}

export class DeltaCalculator {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;
  private communityService?: CommunityClassificationService;
  private enableCommunityWeights: boolean;
  private scoreWeights: ScoreWeights; // 환경변수 기반 점수 가중치
  private unknownEngagementTypes: Map<string, number>; // 미분류 타입 통계
  private validationStats: {
    totalProcessed: number;
    validTypes: number;
    invalidTypes: number;
    correctedTypes: number;
  }; // 유효성 검증 통계

  constructor(
    dynamoClient: DynamoDBDocumentClient,
    tableName: string,
    communityService: CommunityClassificationService | undefined,
    scoreWeights: ScoreWeights
  ) {
    this.dynamoClient = dynamoClient;
    this.tableName = tableName;
    this.communityService = communityService;
    this.scoreWeights = scoreWeights;
    this.unknownEngagementTypes = new Map<string, number>();
    this.validationStats = {
      totalProcessed: 0,
      validTypes: 0,
      invalidTypes: 0,
      correctedTypes: 0
    };

    // 환경변수에서 커뮤니티 가중치 활성화 여부 확인
    this.enableCommunityWeights = process.env.COMMUNITY_WEIGHT_ENABLED === 'true';

    console.log(`🏗️ [DELTA_CALCULATOR] 초기화 완료`);
    console.log(`   - 커뮤니티 가중치: ${this.enableCommunityWeights ? '활성화' : '비활성화'}`);
    console.log(`   - 점수 가중치:`, this.scoreWeights);
  }

  /**
   * engagement_type 유효성 검증 및 자동 수정
   * @param engagement 검증할 인게이지먼트 데이터
   * @returns 검증/수정된 인게이지먼트 데이터
   */
  private validateAndCorrectEngagementType(engagement: EngagementData): EngagementData {
    this.validationStats.totalProcessed++;
    
    const validTypes = ['like', 'reply', 'repost', 'quote', 'mention'];
    const originalType = engagement.engagement_type;
    
    // 이미 유효한 타입인 경우
    if (validTypes.includes(originalType)) {
      this.validationStats.validTypes++;
      return engagement;
    }
    
    // 무효한 타입 감지
    this.validationStats.invalidTypes++;
    console.warn(`⚠️ [VALIDATION] 무효한 engagement_type 감지: "${originalType}" (사용자: ${engagement.engaging_user_id}, 트윗: ${engagement.tweet_id})`);
    
    // 자동 수정 시도
    const correctedType = this.inferEngagementType(engagement);
    if (correctedType !== originalType) {
      this.validationStats.correctedTypes++;
      console.log(`🔧 [VALIDATION] engagement_type 자동 수정: "${originalType}" → "${correctedType}"`);
      
      return {
        ...engagement,
        engagement_type: correctedType as "like" | "reply" | "repost" | "quote" | "mention"
      };
    }
    
    // 수정 불가능한 경우 기본값 사용
    console.error(`❌ [VALIDATION] engagement_type 자동 수정 실패, 기본값 'mention' 사용: "${originalType}"`);
    return {
      ...engagement,
      engagement_type: 'mention' // 기본값으로 mention 사용
    };
  }
  
  /**
   * 인게이지먼트 데이터의 패턴을 분석하여 올바른 타입 추론
   * @param engagement 분석할 인게이지먼트 데이터
   * @returns 추론된 engagement_type
   */
  private inferEngagementType(engagement: EngagementData): string {
    const type = engagement.engagement_type?.toLowerCase() || '';
    const tweetId = engagement.tweet_id || '';
    const engagingUserId = engagement.engaging_user_id || '';
    
    // 1. 직접 매핑 (오타 수정)
    const typeMapping: { [key: string]: string } = {
      'likes': 'like',
      'liked': 'like',
      'favorite': 'like',
      'favourited': 'like',
      'replies': 'reply',
      'replied': 'reply',
      'response': 'reply',
      'reposts': 'repost',
      'reposted': 'repost',
      'retweet': 'repost',
      'retweeted': 'repost',
      'quotes': 'quote',
      'quoted': 'quote',
      'quote_tweet': 'quote',
      'mentions': 'mention',
      'mentioned': 'mention',
      'mention_tweet': 'mention'
    };
    
    if (typeMapping[type]) {
      return typeMapping[type];
    }
    
    // 2. 부분 매칭
    if (type.includes('like') || type.includes('favorite')) return 'like';
    if (type.includes('reply') || type.includes('response')) return 'reply';
    if (type.includes('repost') || type.includes('retweet')) return 'repost';
    if (type.includes('quote')) return 'quote';
    if (type.includes('mention')) return 'mention';
    
    // 3. 패턴 분석 (추가 로직이 필요하면 여기에)
    // 예: 트윗 ID 패턴, 사용자 ID 패턴 등을 기반으로 추론
    
    // 4. 기본값
    return 'mention';
  }
  
  /**
   * 유효성 검증 통계 출력
   */
  private printValidationStats(): void {
    if (this.validationStats.totalProcessed === 0) return;
    
    const validPercentage = (this.validationStats.validTypes / this.validationStats.totalProcessed * 100).toFixed(1);
    const invalidPercentage = (this.validationStats.invalidTypes / this.validationStats.totalProcessed * 100).toFixed(1);
    const correctedPercentage = this.validationStats.invalidTypes > 0 
      ? (this.validationStats.correctedTypes / this.validationStats.invalidTypes * 100).toFixed(1)
      : '0.0';
    
    console.log(`📊 [VALIDATION] engagement_type 유효성 검증 통계:`);
    console.log(`   📈 총 처리: ${this.validationStats.totalProcessed}개`);
    console.log(`   ✅ 유효한 타입: ${this.validationStats.validTypes}개 (${validPercentage}%)`);
    console.log(`   ❌ 무효한 타입: ${this.validationStats.invalidTypes}개 (${invalidPercentage}%)`);
    if (this.validationStats.invalidTypes > 0) {
      console.log(`   🔧 자동 수정: ${this.validationStats.correctedTypes}개 (${correctedPercentage}%)`);
    }
  }
  
  /**
   * 미분류 engagement_type 통계 출력
   */
  private printUnknownEngagementStats(): void {
    if (this.unknownEngagementTypes.size === 0) {
      console.log(`📊 [UNKNOWN_TYPES] 미분류 engagement_type 없음 ✅`);
      return;
    }
    
    console.log(`📊 [UNKNOWN_TYPES] 미분류 engagement_type 통계:`);
    Array.from(this.unknownEngagementTypes.entries()).forEach(([type, count]) => {
      console.log(`   🔍 "${type}": ${count}개`);
    });
  }

  /**
   * 🆕 스냅샷 기반 점수 계산 (Delta 비교 없이 직접 계산)
   *
   * 스냅샷 수집 방식에서는 모든 인게이지먼트가 이미 "신규"이므로
   * 이전 데이터와 비교할 필요 없이 바로 점수 계산
   *
   * 🔒 멱등성 보장: 오늘 이미 처리된 활동은 필터링하여 중복 계산 방지
   *
   * @param snapshotEngagements 스냅샷으로 수집된 인게이지먼트 (모두 신규)
   * @param collectionDate 수집 날짜 (YYYY-MM-DD)
   * @returns 계산 결과
   */
  async calculateSnapshotScores(snapshotEngagements: EngagementData[], collectionDate: string): Promise<DeltaCalculationResult> {
    console.log(`📸 [SNAPSHOT_MODE] 스냅샷 점수 계산 시작 - 인게이지먼트: ${snapshotEngagements.length}개`);
    console.log(`   ℹ️ 스냅샷 모드: 이전 데이터 비교 없이 직접 점수 계산`);

    if (snapshotEngagements.length === 0) {
      console.log("⚠️ 스냅샷 인게이지먼트 없음 - 점수 변경 없음");
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }

    // 🆕 멱등성 보장: 오늘 이미 처리된 활동 필터링
    console.log(`🔍 [IDEMPOTENCY] 오늘(${collectionDate}) 이미 처리된 활동 조회 중...`);
    const processedToday = await this.getProcessedEngagementsForDate(collectionDate);
    console.log(`   ℹ️ [IDEMPOTENCY] 오늘 이미 처리된 활동: ${processedToday.size}개`);

    // 중복 필터링
    const newEngagements = snapshotEngagements.filter(engagement => {
      const key = this.makeEngagementKey(engagement);
      return !processedToday.has(key);
    });

    const duplicateCount = snapshotEngagements.length - newEngagements.length;
    if (duplicateCount > 0) {
      console.log(`🔍 [IDEMPOTENCY] 중복 필터링: ${snapshotEngagements.length} → ${newEngagements.length} (${duplicateCount}개 이미 처리됨)`);
    } else {
      console.log(`✅ [IDEMPOTENCY] 모든 활동이 신규입니다 (${newEngagements.length}개)`);
    }

    // 필터링 후 인게이지먼트가 없으면 조기 반환
    if (newEngagements.length === 0) {
      console.log("⏩ [IDEMPOTENCY] 신규 활동 없음 - 점수 변경 없음 (멱등성 보장)");
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }

    // engagement_type 유효성 검증
    console.log(`🔍 engagement_type 유효성 검증 시작...`);
    const validatedEngagements = newEngagements.map(engagement =>
      this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();

    // 모든 인게이지먼트를 "새로 추가된 것"으로 처리 (스냅샷이므로 이전 데이터 비교 불필요)
    const userDeltas = await this.calculateUserDeltas(validatedEngagements, []);
    const summary = this.generateSummary(validatedEngagements, []);

    const result: DeltaCalculationResult = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };

    console.log(`✅ [SNAPSHOT_MODE] 스냅샷 점수 계산 완료:`);
    console.log(`  - 사용자: ${result.totalChangedUsers}명`);
    console.log(`  - 총 점수: ${result.totalScoreChanges}`);
    console.log(`  - 처리된 인게이지먼트: ${summary.added.total}개`);

    this.printUnknownEngagementStats();

    return result;
  }

  /**
   * ⚠️ 레거시: 현재 수집된 인게이지먼트와 이전 데이터를 비교하여 Delta 계산
   *
   * 🔴 주의: 이 메서드는 6일 룩백 방식에서 사용되던 레거시 로직입니다.
   * 스냅샷 방식에서는 calculateSnapshotScores()를 사용하세요.
   *
   * @param currentEngagements 현재 수집된 인게이지먼트
   * @param collectionDate 수집 날짜 (YYYY-MM-DD)
   * @returns Delta 계산 결과
   * @deprecated 스냅샷 수집 방식에서는 calculateSnapshotScores() 사용 권장
   */
  async calculateDelta(currentEngagements: EngagementData[], collectionDate: string): Promise<DeltaCalculationResult> {
    console.log(`🧮 Delta 계산 시작 - 현재 인게이지먼트: ${currentEngagements.length}개`);

    // 🛡️ 긴급 패치: 신규 인게이지먼트가 없으면 재계산 모드 진입 차단
    // 문제: 재계산 모드가 기존 ENGAGEMENT 데이터를 "신규"로 재처리하여 점수 중복 누적
    // 해결: currentEngagements가 비어있으면 즉시 반환 (점수 변경 없음)
    if (currentEngagements.length === 0) {
      console.log("⚠️ [SAFETY_PATCH] 신규 인게이지먼트 없음 - 재계산 모드 진입 차단");
      console.log("📋 Delta 변경사항 없음으로 처리 (점수 중복 누적 방지)");
      console.log("🔒 이 패치는 의도하지 않은 점수 2배 중복 및 보너스 초기화를 방지합니다.");

      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }

    // 0. engagement_type 유효성 검증 및 자동 수정
    console.log(`🔍 engagement_type 유효성 검증 시작...`);
    const validatedCurrentEngagements = currentEngagements.map(engagement =>
      this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();

    // 1. 이전 수집 데이터 로드 (DynamoDB에서 RECENT# 레코드들 조회)
    console.log(`📂 이전 수집 데이터 로드 중...`);
    const previousEngagements = await this.loadPreviousEngagements();
    console.log(`📂 이전 데이터: ${previousEngagements.length}개`);

    // ❌ 재계산 모드 비활성화 (위험한 로직 - 긴급 패치로 차단됨)
    // 기존 재계산 모드는 점수 중복 누적 및 보너스 초기화 문제를 일으킴
    // 재계산이 필요한 경우 별도 스크립트를 사용하도록 변경
    if (validatedCurrentEngagements.length === 0 && previousEngagements.length > 0) {
      console.log(`🔄 재계산 모드 감지: DB에 있는 ${previousEngagements.length}개의 인게이지먼트를 신규로 처리합니다.`);

      // DB에서 읽은 데이터를 "추가된" 것으로 간주하여 점수를 계산
      const userDeltas = await this.calculateUserDeltas(previousEngagements, []);
      const summary = this.generateSummary(previousEngagements, []);

      const result: DeltaCalculationResult = {
        totalChangedUsers: userDeltas.length,
        totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
        userDeltas,
        summary
      };

      console.log(`🎉 재계산 모드 완료:`);
      console.log(`  - 신규 사용자: ${result.totalChangedUsers}명`);
      console.log(`  - 총 점수: ${result.totalScoreChanges}`);
      console.log(`  - 처리된 인게이지먼트: ${summary.added.total}개`);

      // 미분류 engagement 통계 출력
      this.printUnknownEngagementStats();

      return result;
    }

    // 2. 첫 번째 실행 또는 이전 데이터가 없는 경우 특별 처리
    if (previousEngagements.length === 0) {
      console.log(`🆕 첫 번째 실행 감지 - 모든 현재 인게이지먼트를 새로운 것으로 처리`);
      
      // 모든 현재 인게이지먼트를 "새로 추가된 것"으로 처리
      const userDeltas = await this.calculateUserDeltas(validatedCurrentEngagements, []);
      const summary = this.generateSummary(validatedCurrentEngagements, []);
      
      const result: DeltaCalculationResult = {
        totalChangedUsers: userDeltas.length,
        totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
        userDeltas,
        summary
      };

      console.log(`🎉 첫 실행 Delta 계산 완료:`);
      console.log(`  - 신규 사용자: ${result.totalChangedUsers}명`);
      console.log(`  - 총 점수: ${result.totalScoreChanges}`);
      console.log(`  - 처리된 인게이지먼트: ${summary.added.total}개`);
      
      // 미분류 engagement 통계 출력
      this.printUnknownEngagementStats();

      return result;
    }

    // 3. 변화 분석 (추가/삭제된 인게이지먼트 식별)
    console.log(`🔍 변화 분석 시작...`);
    const { addedEngagements, removedEngagements } = this.identifyChanges(validatedCurrentEngagements, previousEngagements);
    
    console.log(`✅ 새로 추가: ${addedEngagements.length}개`);
    console.log(`❌ 삭제됨: ${removedEngagements.length}개`);
    
    // 🔧 중요: 삭제된 인게이지먼트가 새로 추가된 것보다 많을 때 음수 점수 방지
    if (addedEngagements.length === 0 && removedEngagements.length > 0) {
      console.log(`⚠️ 새로운 추가 없이 기존 데이터만 삭제 - 음수 점수 방지를 위해 점수 변화 없음으로 처리`);
      console.log(`📋 점수 변경사항이 없으므로 계산 종료`);
      
      return {
        totalChangedUsers: 0,
        totalScoreChanges: 0,
        userDeltas: [],
        summary: {
          added: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 },
          removed: { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 }
        }
      };
    }

    // 4. 삭제된 인게이지먼트 필터링 (7일 이내 트윗만 점수 감소)
    const recentRemovedEngagements = this.filterRecentRemovedEngagements(removedEngagements);
    console.log(`⏰ 최근 7일 내 삭제 (점수 반영): ${recentRemovedEngagements.length}개`);
    console.log(`🗂️ 7일 이후 삭제 (점수 미반영): ${removedEngagements.length - recentRemovedEngagements.length}개`);

    // 4.5. 사용자별 Delta 계산
    const userDeltas = await this.calculateUserDeltas(addedEngagements, recentRemovedEngagements);
    console.log(`✅ 사용자 Delta 계산 완료: ${userDeltas.length}명`);

    // 5. 통계 생성
    const summary = this.generateSummary(addedEngagements, recentRemovedEngagements);

    const result: DeltaCalculationResult = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };

    console.log(`🎉 Delta 계산 완료:`);
    console.log(`  - 변경된 사용자: ${result.totalChangedUsers}명`);
    console.log(`  - 총 점수 변화량: ${result.totalScoreChanges}`);
    console.log(`  - 추가된 인게이지먼트: ${summary.added.total}개`);
    console.log(`  - 삭제된 인게이지먼트: ${summary.removed.total}개`);
    
    // 미분류 engagement 통계 출력
    this.printUnknownEngagementStats();

    return result;
  }


  /**
   * ✅ 기존 인게이지먼트 데이터로부터 점수 재계산 (가중치 적용 포함)
   * recalculateExistingUserScores에서 호출되어 가중치를 적용합니다.
   */
  async recalculateFromEngagements(engagements: EngagementData[], collectionDate: string): Promise<DeltaCalculationResult> {
    console.log(`🔄 기존 인게이지먼트로부터 점수 재계산 시작: ${engagements.length}개`);

    // engagement_type 유효성 검증
    const validatedEngagements = engagements.map(engagement =>
      this.validateAndCorrectEngagementType(engagement)
    );
    this.printValidationStats();

    // 모든 인게이지먼트를 "새로 추가된 것"으로 처리하여 점수 계산
    const userDeltas = await this.calculateUserDeltas(validatedEngagements, []);
    const summary = this.generateSummary(validatedEngagements, []);

    const result: DeltaCalculationResult = {
      totalChangedUsers: userDeltas.length,
      totalScoreChanges: userDeltas.reduce((sum, delta) => sum + Math.abs(delta.scoreChange), 0),
      userDeltas,
      summary
    };

    console.log(`✅ 재계산 완료: ${result.totalChangedUsers}명, 총 점수: ${result.totalScoreChanges}`);
    this.printUnknownEngagementStats();

    return result;
  }

  /**
   * DynamoDB에서 이전에 저장된 RECENT# 및 REPLY# 인게이지먼트 로드
   * 하이브리드 시스템: 레거시 RECENT# 데이터와 새로운 REPLY# 데이터 모두 지원
   */
  private async loadPreviousEngagements(): Promise<EngagementData[]> {
    const previousEngagements: EngagementData[] = [];
    
    try {
      console.log(`📂 [DELTA] 하이브리드 시스템 - 레거시 및 신규 인게이지먼트 데이터 로드 중...`);
      
      // 1. 레거시 RECENT# 인게이지먼트 로드
      const recentEngagements = await this.loadLegacyRecentEngagements();
      console.log(`📂 [DELTA] 레거시 RECENT# 데이터: ${recentEngagements.length}개`);
      
      // 2. 새로운 REPLY# 인게이지먼트 로드 (3회 제한 시스템)
      const replyEngagements = await this.loadNewReplyEngagements();
      console.log(`📂 [DELTA] 신규 REPLY# 데이터: ${replyEngagements.length}개`);
      
      // 3. 데이터 통합 및 중복 제거
      previousEngagements.push(...recentEngagements);
      previousEngagements.push(...replyEngagements);
      
      // 중복 제거 (동일한 tweet_id + user_id + engagement_type 조합)
      const uniqueEngagements = this.deduplicateEngagements(previousEngagements);
      console.log(`📂 [DELTA] 중복 제거 후 최종 데이터: ${uniqueEngagements.length}개 (제거된 중복: ${previousEngagements.length - uniqueEngagements.length}개)`);
      
      return uniqueEngagements;

    } catch (error) {
      console.error("❌ 이전 인게이지먼트 로드 실패:", error);
      return []; // 실패 시 빈 배열 반환 (첫 번째 실행으로 처리)
    }
  }

  /**
   * 레거시 RECENT# 인게이지먼트 로드
   */
  private async loadLegacyRecentEngagements(): Promise<EngagementData[]> {
    const engagements: EngagementData[] = [];
    let lastEvaluatedKey: any = undefined;

    try {
      do {
        const scanParams = {
          TableName: this.tableName,
          FilterExpression: "begins_with(sk, :sk_prefix)",
          ExpressionAttributeValues: {
            ":sk_prefix": "RECENT#"
          },
          ExclusiveStartKey: lastEvaluatedKey
        };

        const result = await this.dynamoClient.send(new ScanCommand(scanParams));
        
        if (result.Items) {
          engagements.push(...result.Items.map(item => ({
            tweet_id: item.tweetId || item.tweet_id,
            engagement_type: item.engagementType || item.engagement_type,
            engaging_user_id: item.engaging_user_id || item.userId || item.user_id,
            engaging_username: item.engaging_username || item.username,
            engaging_display_name: item.engaging_display_name || item.displayName || item.display_name,
            engaging_profile_image_url: item.engaging_profile_image_url || item.profileImageUrl || item.profile_image_url,
            engaging_followers_count: item.engaging_followers_count || item.followersCount || item.followers_count,
            tweet_created_at: item.tweetCreatedAt || item.tweet_created_at,
            added_at: item.addedAt || item.added_at
          })));
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return engagements;
    } catch (error) {
      console.error("❌ RECENT# 데이터 로드 실패:", error);
      return [];
    }
  }

  /**
   * 새로운 REPLY# 인게이지먼트 로드 (3회 제한 시스템)
   */
  private async loadNewReplyEngagements(): Promise<EngagementData[]> {
    const engagements: EngagementData[] = [];
    let lastEvaluatedKey: any = undefined;

    try {
      do {
        const scanParams = {
          TableName: this.tableName,
          FilterExpression: "begins_with(sk, :sk_prefix) AND shouldCount = :should_count",
          ExpressionAttributeValues: {
            ":sk_prefix": "REPLY#",
            ":should_count": true
          },
          ExclusiveStartKey: lastEvaluatedKey
        };

        const result = await this.dynamoClient.send(new ScanCommand(scanParams));
        
        if (result.Items) {
          engagements.push(...result.Items.map(item => ({
            tweet_id: item.targetTweetId,
            engagement_type: 'reply' as const,
            engaging_user_id: item.userId,
            engaging_username: item.username,
            tweet_created_at: item.addedAt, // 답글 추가 시간 사용
            added_at: item.addedAt
          })));
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      return engagements;
    } catch (error) {
      console.error("❌ 신규 REPLY# 데이터 로드 실패:", error);
      return [];
    }
  }

  /**
   * 인게이지먼트 데이터 중복 제거
   * 동일한 tweet_id + user_id + engagement_type 조합은 하나만 유지
   */
  private deduplicateEngagements(engagements: EngagementData[]): EngagementData[] {
    const seen = new Set<string>();
    const unique: EngagementData[] = [];

    for (const engagement of engagements) {
      const key = `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(engagement);
      }
    }

    return unique;
  }

  /**
   * 현재와 이전 인게이지먼트를 비교하여 추가/삭제 항목 식별
   */
  private identifyChanges(current: EngagementData[], previous: EngagementData[]): {
    addedEngagements: EngagementData[];
    removedEngagements: EngagementData[];
  } {
    // 유니크 키 생성 함수 (같은 인게이지먼트 식별용)
    const createKey = (engagement: EngagementData) => 
      `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;

    // 이전 데이터를 Set으로 변환 (빠른 검색)
    const previousSet = new Set(previous.map(createKey));
    const previousMap = new Map(previous.map(e => [createKey(e), e]));

    // 현재 데이터를 Set으로 변환
    const currentSet = new Set(current.map(createKey));
    const currentMap = new Map(current.map(e => [createKey(e), e]));

    // 새로 추가된 인게이지먼트 (현재에는 있지만 이전에는 없음)
    const addedEngagements: EngagementData[] = [];
    for (const engagement of current) {
      const key = createKey(engagement);
      if (!previousSet.has(key)) {
        addedEngagements.push(engagement);
      }
    }

    // 삭제된 인게이지먼트 (이전에는 있었지만 현재에는 없음)
    const removedEngagements: EngagementData[] = [];
    for (const engagement of previous) {
      const key = createKey(engagement);
      if (!currentSet.has(key)) {
        removedEngagements.push(engagement);
      }
    }

    return { addedEngagements, removedEngagements };
  }

  /**
   * 삭제된 인게이지먼트 중 최근 7일 이내 트윗만 필터링
   */
  private filterRecentRemovedEngagements(removedEngagements: EngagementData[]): EngagementData[] {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return removedEngagements.filter(engagement => {
      try {
        const tweetDate = new Date(engagement.tweet_created_at);
        return tweetDate > sevenDaysAgo;
      } catch (error) {
        console.warn(`⚠️ 날짜 파싱 실패: ${engagement.tweet_created_at}`);
        return false; // 파싱 실패 시 제외
      }
    });
  }

  /**
   * 인용 인게이지먼트의 실제 계산된 점수를 조회
   * QuoteCounterService에서 저장한 finalScore 사용
   */
  private async getQuoteScore(userId: string, tweetId: string, targetDate: string): Promise<number> {
    try {
      const queryResult = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk_prefix': `QUOTE#${tweetId}#`
        },
        ScanIndexForward: false, // 최신 순서로 정렬
        Limit: 1 // 가장 최근 인용만 조회
      }));

      if (queryResult.Items && queryResult.Items.length > 0) {
        const quoteItem = queryResult.Items[0];
        const finalScore = quoteItem.finalScore;
        
        if (typeof finalScore === 'number' && finalScore > 0) {
          console.log(`📝 [QUOTE_SCORE] 사용자 ${userId}의 인용 ${tweetId}: ${finalScore}점 (품질평가 적용)`);
          return finalScore;
        }
      }
      
      // QuoteCounterService 데이터가 없으면 기본 점수 사용
      console.log(`📝 [QUOTE_SCORE] 사용자 ${userId}의 인용 ${tweetId}: 기본 점수 ${this.scoreWeights.quotes}점 사용`);
      return this.scoreWeights.quotes;

    } catch (error) {
      console.error(`❌ 인용 점수 조회 실패 (${userId}, ${tweetId}):`, error);
      return this.scoreWeights.quotes; // 오류 시 기본 점수 사용
    }
  }

  /**
   * 사용자별로 점수 변화 계산 (커뮤니티 가중치 적용)
   */
  private async calculateUserDeltas(addedEngagements: EngagementData[], removedEngagements: EngagementData[]): Promise<UserDelta[]> {
    const userDeltaMap = new Map<string, UserDelta>();

    // 🆕 [LANGUAGE_PRESERVATION] 기존 사용자 프로필 캐시 (dominantLanguage 보존용)
    const userProfileCache = new Map<string, { dominantLanguage?: LanguageCode }>();

    // 추가된 인게이지먼트 처리 (점수 증가)
    for (const engagement of addedEngagements) {
      const userId = engagement.engaging_user_id;

      if (!userDeltaMap.has(userId)) {
        // ✅ [BUGFIX] 기존 CUMULATIVE_SCORE에서 dominantLanguage 조회 및 보존
        let existingDominantLanguage: LanguageCode | undefined = undefined;

        if (!userProfileCache.has(userId)) {
          try {
            const existingProfile = await this.getUserProfile(userId);
            if (existingProfile && existingProfile.dominantLanguage && existingProfile.dominantLanguage !== 'unknown') {
              existingDominantLanguage = existingProfile.dominantLanguage;
              userProfileCache.set(userId, { dominantLanguage: existingDominantLanguage });
              console.log(`🔄 [LANGUAGE_PRESERVATION] ${userId}의 기존 언어 보존: ${existingDominantLanguage}`);
            } else {
              userProfileCache.set(userId, {});
            }
          } catch (error) {
            console.warn(`⚠️ [LANGUAGE_PRESERVATION] 기존 언어 정보 조회 실패: ${userId}`, error);
            userProfileCache.set(userId, {});
          }
        } else {
          const cached = userProfileCache.get(userId);
          existingDominantLanguage = cached?.dominantLanguage;
        }

        userDeltaMap.set(userId, {
          userId,
          username: engagement.engaging_username || undefined,
          displayName: engagement.engaging_display_name,
          profileImageUrl: engagement.engaging_profile_image_url || (engagement as any).profile_image_url,
          followersCount: engagement.engaging_followers_count || (engagement as any).followers_count,
          dominantLanguage: existingDominantLanguage, // ✅ 기존 언어 값 보존
          scoreChange: 0,
          likesChange: 0,
          repliesChange: 0,
          repostsChange: 0,
          quotesChange: 0,
          mentionsChange: 0,
          addedEngagements: [],
          removedEngagements: []
        });
      }

      const delta = userDeltaMap.get(userId)!;
      
      // 인용인 경우 품질평가가 적용된 실제 점수 사용, 그 외는 기본 가중치 사용
      let scoreWeight: number;
      if (engagement.engagement_type === 'quote') {
        const targetDate = new Date().toISOString().split('T')[0];
        scoreWeight = await this.getQuoteScore(userId, engagement.tweet_id, targetDate);
      } else {
        const engagementKey = engagement.engagement_type === 'like' ? 'likes' :
                             engagement.engagement_type === 'reply' ? 'replies' :
                             engagement.engagement_type === 'repost' ? 'reposts' :
                             engagement.engagement_type === 'mention' ? 'mentions' : null;
        
        if (engagementKey === null) {
          console.warn(`⚠️ [DELTA_CALC] Unknown engagement_type for scoring: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          scoreWeight = 0; // 미분류 타입은 0점
        } else {
          scoreWeight = this.scoreWeights[engagementKey as keyof ScoreWeights];
        }
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
        default: 
          console.warn(`⚠️ [DELTA_CALC] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          // 미분류 타입 통계 수집
          const currentCount = this.unknownEngagementTypes.get(engagement.engagement_type) || 0;
          this.unknownEngagementTypes.set(engagement.engagement_type, currentCount + 1);
          // 미분류 타입은 카운트하지 않음
          break;
      }
    }

    // 삭제된 인게이지먼트 처리 (점수 감소)
    for (const engagement of removedEngagements) {
      const userId = engagement.engaging_user_id;

      if (!userDeltaMap.has(userId)) {
        // ✅ [BUGFIX] 기존 CUMULATIVE_SCORE에서 dominantLanguage 조회 및 보존
        let existingDominantLanguage: LanguageCode | undefined = undefined;

        if (!userProfileCache.has(userId)) {
          try {
            const existingProfile = await this.getUserProfile(userId);
            if (existingProfile && existingProfile.dominantLanguage && existingProfile.dominantLanguage !== 'unknown') {
              existingDominantLanguage = existingProfile.dominantLanguage;
              userProfileCache.set(userId, { dominantLanguage: existingDominantLanguage });
              console.log(`🔄 [LANGUAGE_PRESERVATION] ${userId}의 기존 언어 보존: ${existingDominantLanguage}`);
            } else {
              userProfileCache.set(userId, {});
            }
          } catch (error) {
            console.warn(`⚠️ [LANGUAGE_PRESERVATION] 기존 언어 정보 조회 실패: ${userId}`, error);
            userProfileCache.set(userId, {});
          }
        } else {
          const cached = userProfileCache.get(userId);
          existingDominantLanguage = cached?.dominantLanguage;
        }

        userDeltaMap.set(userId, {
          userId,
          username: engagement.engaging_username || undefined,
          displayName: engagement.engaging_display_name,
          profileImageUrl: engagement.engaging_profile_image_url || (engagement as any).profile_image_url,
          followersCount: engagement.engaging_followers_count || (engagement as any).followers_count,
          dominantLanguage: existingDominantLanguage, // ✅ 기존 언어 값 보존
          scoreChange: 0,
          likesChange: 0,
          repliesChange: 0,
          repostsChange: 0,
          quotesChange: 0,
          mentionsChange: 0,
          addedEngagements: [],
          removedEngagements: []
        });
      }

      const delta = userDeltaMap.get(userId)!;
      
      // 인용인 경우 품질평가가 적용된 실제 점수 사용, 그 외는 기본 가중치 사용
      let scoreWeight: number;
      if (engagement.engagement_type === 'quote') {
        const targetDate = new Date().toISOString().split('T')[0];
        scoreWeight = await this.getQuoteScore(userId, engagement.tweet_id, targetDate);
      } else {
        const engagementKey = engagement.engagement_type === 'like' ? 'likes' :
                             engagement.engagement_type === 'reply' ? 'replies' :
                             engagement.engagement_type === 'repost' ? 'reposts' :
                             engagement.engagement_type === 'mention' ? 'mentions' : null;
        
        if (engagementKey === null) {
          console.warn(`⚠️ [DELTA_CALC] Unknown engagement_type for scoring: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          scoreWeight = 0; // 미분류 타입은 0점
        } else {
          scoreWeight = this.scoreWeights[engagementKey as keyof ScoreWeights];
        }
      }
      
      delta.scoreChange -= scoreWeight;
      delta.removedEngagements.push(engagement);
      
      // 타입별 카운트 감소
      switch (engagement.engagement_type) {
        case 'like': delta.likesChange--; break;
        case 'reply': delta.repliesChange--; break;
        case 'repost': delta.repostsChange--; break;
        case 'quote': delta.quotesChange--; break;
        case 'mention': delta.mentionsChange--; break;
        default: 
          console.warn(`⚠️ [DELTA_CALC] Unknown engagement_type: "${engagement.engagement_type}" for user ${engagement.engaging_user_id}`);
          // 미분류 타입 통계 수집
          const currentCount = this.unknownEngagementTypes.get(engagement.engagement_type) || 0;
          this.unknownEngagementTypes.set(engagement.engagement_type, currentCount + 1);
          // 미분류 타입은 카운트하지 않음
          break;
      }
    }

    const userDeltas = Array.from(userDeltaMap.values()).filter(delta => delta.scoreChange !== 0);

    // 🆕 Phase 1.2: 프로필 데이터 복구 로직
    console.log(`🔍 [PROFILE_RECOVERY] 프로필 검증 시작: ${userDeltas.length}명`);
    let recoveredCount = 0;

    for (const delta of userDeltas) {
      // username이 없거나 userId와 같으면 복구 시도
      const needsRecovery = !delta.username ||
                           delta.username === delta.userId ||
                           delta.username === 'unknown';

      if (needsRecovery) {
        console.log(`⚠️ [PROFILE_RECOVERY] 불완전한 프로필 감지: ${delta.userId} (username: ${delta.username})`);

        // CUMULATIVE_SCORE에서 프로필 조회
        const existingProfile = await this.getUserProfile(delta.userId);

        if (existingProfile) {
          let recovered = false;

          if (existingProfile.username && existingProfile.username !== delta.userId) {
            delta.username = existingProfile.username;
            recovered = true;
          }

          if (existingProfile.displayName && !delta.displayName) {
            delta.displayName = existingProfile.displayName;
            recovered = true;
          }

          if (existingProfile.profileImageUrl && !delta.profileImageUrl) {
            delta.profileImageUrl = existingProfile.profileImageUrl;
            recovered = true;
          }

          if (existingProfile.followersCount && (!delta.followersCount || delta.followersCount === 0)) {
            delta.followersCount = existingProfile.followersCount;
            recovered = true;
          }

          if (recovered) {
            recoveredCount++;
            console.log(`✅ [PROFILE_RECOVERY] 프로필 복구 성공: ${delta.userId} → ${delta.username}`);
          } else {
            console.log(`⚠️ [PROFILE_RECOVERY] 기존 데이터도 불완전: ${delta.userId}`);
          }
        }
      }
    }

    if (recoveredCount > 0) {
      console.log(`✅ [PROFILE_RECOVERY] 총 ${recoveredCount}명 프로필 복구 완료`);
    }

    // 커뮤니티 가중치 적용 (활성화된 경우에만)
    if (this.enableCommunityWeights) {
      if (this.communityService) {
      console.log(`⚖️ [DELTA_CALCULATOR] 커뮤니티 가중치 적용 시작: ${userDeltas.length}명`);
      
      for (const delta of userDeltas) {
        try {
          // 원본 점수 저장
          delta.originalScore = delta.scoreChange;
          
          // 🔧 BUGFIX: 신규 사용자 followersCount 조회 오류 수정
          // 문제: CUMULATIVE_SCORE 없는 신규 사용자는 getUserProfile()이 0 반환
          // 해결: delta 객체의 engagement 데이터에서 가져온 값 우선 사용
          let followersCount = delta.followersCount || 0;

          if (followersCount === 0) {
            // 인게이지먼트 데이터에 팔로워 수 없는 경우만 DB 조회
            // (기존 사용자는 CUMULATIVE_SCORE에서 최신 값 가져옴)
            const userProfile = await this.getUserProfile(delta.userId);
            followersCount = userProfile?.followersCount || 0;

            if (followersCount === 0) {
              console.warn(`⚠️ [DELTA_CALCULATOR] 팔로워 수 정보 없음: ${delta.userId} (${delta.username})`);
            }
          }
          
          // 사용자의 인게이지먼트에서 X API lang 필드 수집 (Replies/Quotes/Mentions)
          let engagementLangs = delta.addedEngagements
            .filter(e => (e.engagement_type === 'reply' || e.engagement_type === 'quote' || e.engagement_type === 'mention') && e.engaging_tweet_lang)
            .map(e => e.engaging_tweet_lang!);

          // forceRecalculation 모드에서 addedEngagements가 비어있으면 RECENT 활동에서 언어 수집
          if (engagementLangs.length === 0) {
            try {
              const recentActivities = await this.dynamoClient.send(new QueryCommand({
                TableName: this.tableName,
                KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
                ExpressionAttributeValues: {
                  ':pk': `USER#${delta.userId}`,
                  ':sk': 'RECENT#'
                },
                ProjectionExpression: 'engagement_type, engaging_tweet_lang'
              }));

              if (recentActivities.Items && recentActivities.Items.length > 0) {
                engagementLangs = recentActivities.Items
                  .filter(item =>
                    (item.engagement_type === 'reply' || item.engagement_type === 'quote' || item.engagement_type === 'mention') &&
                    item.engaging_tweet_lang
                  )
                  .map(item => item.engaging_tweet_lang as string);

                if (engagementLangs.length > 0) {
                  console.log(`🔄 [DELTA_CALCULATOR] ${delta.userId}: RECENT 활동에서 ${engagementLangs.length}개 언어 수집 (${engagementLangs.join(', ')})`);
                }
              }
            } catch (error) {
              console.warn(`⚠️ [DELTA_CALCULATOR] RECENT 활동 조회 실패 (${delta.userId}):`, error);
            }
          }

          // 커뮤니티 가중치 계산 (username, displayName, engagementLangs 전달)
          const weightResult = await this.communityService.calculateCommunityWeight(
            delta.userId,
            followersCount,
            1.0, // 기본점수
            delta.username, // 언어 추론을 위한 username 전달
            delta.displayName, // displayName에 한글/일본어/중국어 포함
            engagementLangs // X API lang 필드 배열 (최우선 언어 감지)
          );

          // 족적 추적 4단계: 가중치 계산 직전, 최종 lang 배열 확인
          if (delta.userId === '701404304683339776') {
            console.log('[족적-qpzmzm] 4. delta-calculator: 가중치 계산 직전 engagementLangs:', JSON.stringify(engagementLangs, null, 2));
          }
          
          // 가중치를 기존 점수에 적용
          delta.scoreChange = Math.round(delta.scoreChange * weightResult.finalWeight * 100) / 100;

          // 메타데이터 추가
          delta.communityWeight = weightResult.finalWeight;

          // ✅ [BUGFIX] dominantLanguage 덮어쓰기 방지: 새 언어가 'unknown'이고 기존 언어가 유효하면 보존
          if (weightResult.dominantLanguage === 'unknown' && delta.dominantLanguage && delta.dominantLanguage !== 'unknown') {
            console.log(`🔒 [LANGUAGE_PRESERVATION] ${delta.userId}의 기존 언어 유지: ${delta.dominantLanguage} (새 언어 'unknown' 무시)`);
            // delta.dominantLanguage는 그대로 유지 (이미 초기화 시 설정됨)
          } else if (weightResult.dominantLanguage !== 'unknown') {
            // 새로운 언어 정보가 유효한 경우에만 업데이트
            delta.dominantLanguage = weightResult.dominantLanguage;
          }
          // else: 둘 다 'unknown'이면 'unknown' 유지

          delta.logBase = weightResult.logBase;
          delta.languageMultiplier = weightResult.languageMultiplier;
          delta.followerWeight = weightResult.followerWeight;
          delta.cappedAtMax = weightResult.cappedAtMax;

          // CloudWatch 메트릭
          this.recordCommunityWeightMetrics(weightResult);

        } catch (error) {
          console.error(`❌ [DELTA_CALCULATOR] 커뮤니티 가중치 적용 실패 (${delta.userId}):`, error);

          // 오류 시 원본 점수 유지 및 기본값 설정
          delta.communityWeight = 1.0;
          delta.dominantLanguage = undefined; // ✅ undefined로 설정하여 기존 값 보존
          delta.logBase = 30;
          delta.languageMultiplier = 1.0;
          delta.followerWeight = 1.0;
          delta.cappedAtMax = false;

          // 오류 메트릭 기록
          this.recordErrorMetrics('COMMUNITY_WEIGHT_ERROR');
        }
      }
      
      console.log(`✅ [DELTA_CALCULATOR] 커뮤니티 가중치 적용 완료`);
      } else {
        // 🔧 BUGFIX: CommunityService 없어도 fallback 언어 분류 수행
        console.log(`⚠️ [DELTA_CALCULATOR] CommunityService 없음 - Fallback 언어 분류 수행: ${userDeltas.length}명`);

        for (const delta of userDeltas) {
          delta.originalScore = delta.scoreChange;
          // 가중치 적용 없이 기본 메타데이터 설정
          delta.communityWeight = 1.0;
          delta.logBase = 30;
          delta.languageMultiplier = 1.0;
          delta.followerWeight = 1.0;
          delta.cappedAtMax = false;

          // 🆕 Fallback 언어 분류: username 패턴 또는 userId 기반 휴리스틱
          const inferredLanguage = DeltaCalculator.inferDominantLanguageFromUsername(delta.username, delta.userId);
          delta.dominantLanguage = inferredLanguage;

          console.log(`  👤 ${delta.username} (${delta.userId}): ${inferredLanguage}`);
        }

        console.log(`✅ [DELTA_CALCULATOR] Fallback 언어 분류 완료`);
      }
    } else {
      console.log(`⏭️ [DELTA_CALCULATOR] 커뮤니티 가중치 비활성화 - 기본 점수 사용`);
    }
    
    // 미분류 타입 통계 로깅
    if (this.unknownEngagementTypes.size > 0) {
      console.warn(`⚠️ [DELTA_CALC] 미분류 engagement_type 통계:`);
      Array.from(this.unknownEngagementTypes.entries()).forEach(([type, count]) => {
        console.warn(`  - "${type}": ${count}개`);
      });
      // 다음 실행을 위해 통계 초기화
      this.unknownEngagementTypes.clear();
    }
    
    return userDeltas;
  }

  /**
   * 사용자 프로필 조회 (팔로워 수 포함)
   * @param userId 사용자 ID
   * @returns 사용자 프로필 정보
   */
  /**
   * 🆕 Phase 1.2: 사용자 프로필 정보 조회 (확장)
   * CUMULATIVE_SCORE에서 모든 프로필 정보 반환
   */
  private async getUserProfile(userId: string): Promise<{
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
    followersCount: number;
    dominantLanguage?: LanguageCode; // ✅ dominantLanguage 필드 추가
  } | null> {
    try {
      // CUMULATIVE_SCORE 레코드에서 프로필 정보 조회
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'CUMULATIVE_SCORE'
        }
      }));

      if (result.Items && result.Items.length > 0) {
        const item = result.Items[0];
        return {
          username: item.username || undefined,
          displayName: item.displayName || undefined,
          profileImageUrl: item.profileImageUrl || undefined,
          followersCount: item.followersCount || 0,
          dominantLanguage: item.dominantLanguage || undefined // ✅ dominantLanguage 반환
        };
      }

      return { followersCount: 0 };
    } catch (error) {
      console.error(`❌ [DELTA_CALCULATOR] 사용자 프로필 조회 실패 (${userId}):`, error);
      return { followersCount: 0 };
    }
  }

  /**
   * CloudWatch 커뮤니티 가중치 메트릭 기록
   * @param weightResult 가중치 계산 결과
   */
  private recordCommunityWeightMetrics(weightResult: WeightCalculationResult): void {
    try {
      // 실제 환경에서는 CloudWatch SDK 사용
      console.log(`📊 [METRIC] NASUN/Community/WeightApplied: ${weightResult.finalWeight} (${weightResult.dominantLanguage})`);

      if (weightResult.dominantLanguage === 'ko') {
        console.log(`📊 [METRIC] NASUN/Community/KoreanWeightCount: 1`);
      } else {
        console.log(`📊 [METRIC] NASUN/Community/GlobalWeightCount: 1`);
      }

      if (weightResult.cappedAtMax) {
        console.log(`📊 [METRIC] NASUN/Community/CappedCount: 1`);
      }

    } catch (error) {
      console.error(`❌ [DELTA_CALCULATOR] 메트릭 기록 실패:`, error);
    }
  }

  /**
   * 오류 메트릭 기록
   * @param errorType 오류 타입
   */
  private recordErrorMetrics(errorType: string): void {
    try {
      console.log(`📊 [METRIC] NASUN/Community/Error: 1 (${errorType})`);
    } catch (error) {
      console.error(`❌ [DELTA_CALCULATOR] 오류 메트릭 기록 실패:`, error);
    }
  }

  /**
   * 커뮤니티 분류 서비스 설정
   * @param communityService 커뮤니티 분류 서비스 인스턴스
   */
  setCommunityService(communityService: CommunityClassificationService): void {
    this.communityService = communityService;
    console.log(`🔧 [DELTA_CALCULATOR] 커뮤니티 서비스 설정 완료`);
  }

  /**
   * 커뮤니티 가중치 활성화/비활성화 설정
   * @param enabled 활성화 여부
   */
  setCommunityWeightsEnabled(enabled: boolean): void {
    this.enableCommunityWeights = enabled;
    console.log(`🔧 [DELTA_CALCULATOR] 커뮤니티 가중치: ${enabled ? '활성화' : '비활성화'}`);
  }

  /**
   * 🆕 Fallback 언어 분류: username 패턴 기반 휴리스틱
   * CommunityService 없을 때 사용하는 간단한 언어 추론 로직
   *
   * ⚠️ PUBLIC STATIC: recalculateExistingUserScores()에서도 사용 가능하도록 공개
   *
   * @param username 사용자명
   * @param userId 사용자 ID
   * @returns 추론된 dominantLanguage (ISO 639-1 코드: ko, en, ja, zh, unknown)
   */
  public static inferDominantLanguageFromUsername(username: string | undefined, userId: string, displayName?: string): LanguageCode {
    // 🆕 0. displayName 우선 검사 (한글/일본어/중국어가 여기에 있음)
    if (displayName && displayName !== userId && displayName !== 'unknown') {
      const koreanPattern = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
      if (koreanPattern.test(displayName)) {
        return 'ko';
      }

      const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF]/; // 히라가나, 가타카나
      if (japanesePattern.test(displayName)) {
        return 'ja';
      }

      // 한자는 일본어/중국어 모두 사용하므로 displayName의 다른 패턴도 확인
      const chinesePattern = /[\u4E00-\u9FFF]/;
      if (chinesePattern.test(displayName)) {
        return 'zh';
      }
    }

    // 1. username이 없거나 userId인 경우 unknown 반환
    if (!username || username === userId || /^\d+$/.test(username)) {
      return 'unknown';
    }

    const lowerUsername = username.toLowerCase();

    // 2. 한글이 포함된 경우 한국어로 분류 (username에는 거의 없지만 체크)
    const koreanPattern = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    if (koreanPattern.test(username)) {
      return 'ko';
    }

    // 3. 일본어 문자 (히라가나, 가타카나, 한자)
    const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    if (japanesePattern.test(username)) {
      return 'ja';
    }

    // 4. 중국어 간체자 추론 (완벽하지 않지만 기본적인 패턴)
    const chinesePattern = /[\u4E00-\u9FFF]/;
    if (chinesePattern.test(username)) {
      // 일본어와 겹칠 수 있으므로 추가 휴리스틱 필요
      // 간단하게 중국어로 분류
      return 'zh';
    }

    // 5. 한국 관련 키워드 (영문)
    const koreanKeywords = ['korea', 'korean', 'seoul', 'busan', 'kr', 'hangul'];
    if (koreanKeywords.some(keyword => lowerUsername.includes(keyword))) {
      return 'ko';
    }

    // 6. 일본 관련 키워드
    const japaneseKeywords = ['japan', 'japanese', 'tokyo', 'osaka', 'jp'];
    if (japaneseKeywords.some(keyword => lowerUsername.includes(keyword))) {
      return 'ja';
    }

    // 7. 중국 관련 키워드
    const chineseKeywords = ['china', 'chinese', 'beijing', 'shanghai', 'cn'];
    if (chineseKeywords.some(keyword => lowerUsername.includes(keyword))) {
      return 'zh';
    }

    // 8. 기본값: unknown (확실하지 않은 경우)
    return 'unknown';
  }

  /**
   * engagement 데이터의 tweet_lang 필드를 우선 사용하여 언어 감지
   *
   * 우선순위:
   * 1. engagement의 engaging_tweet_lang 또는 tweet_lang 필드 (X API 제공)
   * 2. 무효한 언어 코드 필터링 (qme, und, zxx 등)
   * 3. Fallback: inferDominantLanguageFromUsername() 사용
   *
   * @param engagements 사용자의 engagement 데이터 배열
   * @param username 사용자명
   * @param displayName 표시 이름 (선택)
   * @param userId 사용자 ID (선택)
   * @returns 감지된 언어 코드
   */
  public static inferLanguageFromEngagements(
    engagements: EngagementData[],
    username: string,
    displayName?: string,
    userId?: string
  ): LanguageCode {
    // 무시할 특수 언어 코드 (X API 특수 코드)
    const INVALID_CODES = [
      'qme',  // Quote Me (텍스트 없는 인용)
      'und',  // Undefined
      'zxx',  // No linguistic content
      'qht',  // Hyperlink Only Tweet
      'qst',  // Retweet
      'art'   // Artificial (bot-generated)
    ];

    console.log(`  🔍 [LANG] ${username}: ${engagements.length}개 engagement 언어 분석 시작`);

    // 1단계: engagement의 tweet_lang 우선 사용
    for (const eng of engagements) {
      const lang = eng.engaging_tweet_lang || (eng as any).tweet_lang;

      if (lang && !INVALID_CODES.includes(lang.toLowerCase())) {
        console.log(`  🎯 [LANG] ${username}: tweet_lang 사용 = ${lang} (트윗: ${eng.tweet_id})`);
        return lang as LanguageCode;
      }
    }

    // 2단계: Fallback - 기존 username/displayName 분석
    console.log(`  ⚠️ [LANG] ${username}: 유효한 tweet_lang 없음, fallback 사용`);
    return DeltaCalculator.inferDominantLanguageFromUsername(
      username,
      userId || '',
      displayName
    );
  }

  /**
   * 🆕 멱등성: 인게이지먼트의 고유 키 생성
   * @param engagement 인게이지먼트 데이터
   * @returns 고유 키 문자열
   */
  private makeEngagementKey(engagement: EngagementData): string {
    return `${engagement.tweet_id}#${engagement.engaging_user_id}#${engagement.engagement_type}`;
  }

  /**
   * 🆕 멱등성: 특정 날짜에 이미 처리된 인게이지먼트 조회
   * @param collectionDate 조회할 날짜 (YYYY-MM-DD)
   * @returns 처리된 인게이지먼트 키 Set
   */
  private async getProcessedEngagementsForDate(collectionDate: string): Promise<Set<string>> {
    console.log(`🔍 [IDEMPOTENCY_CHECK] ${collectionDate}에 처리된 RECENT# 레코드 조회 중...`);

    const processed = new Set<string>();

    try {
      // DynamoDB Scan: RECENT# 레코드 중 lastProcessedDate === collectionDate인 것 조회
      const scanCommand = new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "begins_with(sk, :recent) AND lastProcessedDate = :date",
        ExpressionAttributeValues: {
          ":recent": "RECENT#",
          ":date": collectionDate
        },
        ProjectionExpression: "tweet_id, engaging_user_id, engagement_type"
      });

      const result = await this.dynamoClient.send(scanCommand);

      if (result.Items && result.Items.length > 0) {
        for (const item of result.Items) {
          const key = `${item.tweet_id}#${item.engaging_user_id}#${item.engagement_type}`;
          processed.add(key);
        }

        console.log(`✅ [IDEMPOTENCY_CHECK] ${result.Items.length}개 처리 완료된 활동 발견`);
      } else {
        console.log(`ℹ️ [IDEMPOTENCY_CHECK] ${collectionDate}에 처리된 활동 없음 (첫 실행)`);
      }

      return processed;

    } catch (error) {
      console.error(`❌ [IDEMPOTENCY_CHECK] 처리 이력 조회 실패:`, error);
      console.warn(`⚠️ [IDEMPOTENCY_CHECK] 안전을 위해 빈 Set 반환 (모든 활동을 신규로 처리)`);
      // 오류 시 빈 Set 반환 → 모든 활동을 신규로 처리 (안전한 fallback)
      return new Set<string>();
    }
  }

  /**
   * 특정 날짜의 타겟 북마크 보너스 데이터 조회
   * @param collectionDate YYYY-MM-DD 형식
   * @returns 북마크 보너스 레코드 배열
   */
  private generateSummary(addedEngagements: EngagementData[], removedEngagements: EngagementData[]) {
    const countByType = (engagements: EngagementData[]) => {
      const counts = { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 };
      for (const engagement of engagements) {
        counts.total++;
        switch (engagement.engagement_type) {
          case 'like': counts.likes++; break;
          case 'reply': counts.replies++; break;
          case 'repost': counts.reposts++; break;
          case 'quote': counts.quotes++; break;
          case 'mention': counts.mentions++; break;
        }
      }
      return counts;
    };

    return {
      added: countByType(addedEngagements),
      removed: countByType(removedEngagements)
    };
  }
}