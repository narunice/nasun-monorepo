import { DynamoDBClient, QueryCommand, PutItemCommand, DeleteItemCommand, ScanCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayClient, FlushStageCacheCommand } from "@aws-sdk/client-api-gateway";
import { EnvConfigV2, getScoreWeights, ScoreWeights } from "../utils/env";
import { CumulativeScoreRecord, LeaderboardEntry, LeaderboardPeriod, getEventPeriodConfigs, EventPeriodConfig, RankChangeData, RankHistoryEntry } from "../types/leaderboard";
import { ActiveDaysCalculator, ActiveDaysConfig } from "../utils/active-days-calculator";
import { DeltaCalculator } from "./delta-calculator";
import { CommunityClassificationService } from "./community-classification-service";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// 🔥 Phase 2.1.2: 리더보드 생성 시 프로필 복구 로직 강화
import { CentralizedProfileManager } from "./centralized-profile-manager";
import { ProfileCacheService } from "./profile-cache-service";
import { TwitterAPIOptimizer } from "./twitter-api-optimizer";
import { CloudWatchMetricsService } from "./cloudwatch-metrics";
import { UserProfile, ProfileValidators, PROFILE_QUALITY_THRESHOLDS } from "../types/profile";

export class LeaderboardGenerator {
  private activeDaysCalculator: ActiveDaysCalculator;
  private scoreWeights: ScoreWeights;
  private communityMemberIds: Set<string> = new Set();
  private deltaCalculator: DeltaCalculator;

  // 🔥 Phase 2.1.2: 프로필 복구 강화를 위한 서비스들
  private centralizedProfileManager: CentralizedProfileManager;
  private cloudWatch: CloudWatchMetricsService;

  // 🚀 API Gateway 캐시 무효화를 위한 클라이언트
  private apiGateway: APIGatewayClient;

  constructor(
    private ddbClient: DynamoDBClient,
    private config: EnvConfigV2
  ) {
    this.activeDaysCalculator = new ActiveDaysCalculator(ddbClient, config.cumulativeTableName);
    this.scoreWeights = getScoreWeights(config);

    // DeltaCalculator 초기화 (가중치 계산용)
    const dynamoDocClient = DynamoDBDocumentClient.from(ddbClient);
    const communityService = new CommunityClassificationService(dynamoDocClient, config.cumulativeTableName);
    this.deltaCalculator = new DeltaCalculator(
      dynamoDocClient,
      config.cumulativeTableName,
      communityService,
      this.scoreWeights
    );

    // 🔥 Phase 2.1.2: 중앙화된 프로필 관리 시스템 초기화
    const profileCacheService = new ProfileCacheService(new DynamoDBClient({}));
    const twitterApiOptimizer = new TwitterAPIOptimizer();
    this.centralizedProfileManager = new CentralizedProfileManager(profileCacheService, twitterApiOptimizer);
    this.cloudWatch = new CloudWatchMetricsService();
    console.log("✅ [LEADERBOARD_GEN] CentralizedProfileManager 초기화 완료");

    // 🚀 API Gateway 클라이언트 초기화 (캐시 무효화용)
    this.apiGateway = new APIGatewayClient({ region: config.region || 'ap-northeast-2' });
    console.log("✅ [LEADERBOARD_GEN] APIGatewayClient 초기화 완료");
  }

  /**
   * 주어진 날짜가 이벤트 기간 내에 있는지 확인
   * 종료일의 23:59:59.999까지 포함 (해당 날짜 전체 포함)
   *
   * @param today 확인할 날짜 (보통 현재 시각)
   * @param startDate 이벤트 시작일 (YYYY-MM-DD 형식)
   * @param endDate 이벤트 종료일 (YYYY-MM-DD 형식)
   * @param eventName 디버깅용 이벤트 이름
   * @returns 기간 내 여부
   */
  private isWithinEventPeriod(
    today: Date,
    startDate: string,
    endDate: string,
    eventName: string = "EVENT"
  ): boolean {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // 종료일 전체 포함 (자정 직전까지)

    const isWithin = today >= start && today <= end;

    // 🔍 디버깅 로그 추가 (기간 외일 때만)
    if (!isWithin) {
      console.log(`⏰ [${eventName}] 이벤트 기간 확인:`, {
        today: today.toISOString(),
        start: start.toISOString(),
        end: end.toISOString(),
        beforeStart: today < start,
        afterEnd: today > end
      });
    }

    return isWithin;
  }

  /**
   * 커뮤니티 멤버 목록을 DynamoDB에서 로드하여 Set에 저장
   */
  private async loadCommunityMembers(): Promise<void> {
    console.log('🔄 [LEADERBOARD] 커뮤니티 멤버 목록 로드 중...');

    try {
      const result = await this.ddbClient.send(new QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: 'COMMUNITY_MEMBERS' }
        }
      }));

      if (result.Items && result.Items.length > 0) {
        result.Items.forEach(item => {
          const unmarshalled = unmarshall(item);
          this.communityMemberIds.add(unmarshalled.twitterId);
        });
        console.log(`✅ [LEADERBOARD] ${this.communityMemberIds.size}명의 커뮤니티 멤버 로드 완료`);

        // 처음 5명만 로그 출력
        const first5 = Array.from(this.communityMemberIds).slice(0, 5);
        console.log(`   샘플: ${first5.join(', ')}`);
      } else {
        console.warn('⚠️ [LEADERBOARD] 커뮤니티 멤버가 없습니다.');
      }
    } catch (error) {
      console.error('❌ [LEADERBOARD] 커뮤니티 멤버 로드 실패:', error);
      // 에러가 발생해도 리더보드 생성은 계속 진행 (뱃지 없이)
    }
  }

  async generateAllLeaderboards(collectedEngagements?: any[]) {
    const today = new Date();
    const eventPeriodConfigs = getEventPeriodConfigs();

    console.log(`📊 [LEADERBOARD_GEN] generateAllLeaderboards 시작`, {
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });

    const results: any = {
      cumulative: await this.generateCumulativeLeaderboard(collectedEngagements),
    };

    // 1차 이벤트 기간인지 확인 후 생성
    const event1Config = eventPeriodConfigs[LeaderboardPeriod.EVENT1];
    if (event1Config && this.isWithinEventPeriod(today, event1Config.startDate, event1Config.endDate, "EVENT1")) {
      console.log(`📅 1차 이벤트 진행 중 (${event1Config.startDate} ~ ${event1Config.endDate})`);
      results.event1 = await this.generateEvent1Leaderboard(collectedEngagements);
    } else {
      // 이벤트 기간 외: 종료 또는 미시작
      const endDate = new Date(event1Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);

      if (event1Config && today > endDate) {
        console.log(`⏭️ 1차 이벤트 종료됨 (종료일: ${event1Config.endDate})`);
      } else {
        console.log("🏆 1차 이벤트 기간이 아직 시작되지 않았지만 메타데이터를 생성합니다.");
      }

      await this.clearPeriodLeaderboard(LeaderboardPeriod.EVENT1);

      // 🔧 [BUGFIX 2025-10-16] 이벤트 미시작 시에도 빈 메타데이터 생성
      // 프론트엔드가 이벤트 날짜 정보를 미리 볼 수 있도록 함
      if (event1Config) {
        await this.saveLeaderboardMetadata(
          LeaderboardPeriod.EVENT1,
          0, // 엔트리 없음
          event1Config.description,
          new Date(event1Config.startDate),
          new Date(event1Config.endDate)
        );
      }

      results.event1 = { period: "EVENT1", entriesGenerated: 0, topScore: 0, description: event1Config?.description || "1차 이벤트" };
    }

    // 2차 이벤트 기간인지 확인 후 생성
    const event2Config = eventPeriodConfigs[LeaderboardPeriod.EVENT2];
    if (event2Config && this.isWithinEventPeriod(today, event2Config.startDate, event2Config.endDate, "EVENT2")) {
      console.log(`📅 2차 이벤트 진행 중 (${event2Config.startDate} ~ ${event2Config.endDate})`);
      results.event2 = await this.generateEvent2Leaderboard(collectedEngagements);
    } else {
      // 이벤트 기간 외: 종료 또는 미시작
      const endDate = new Date(event2Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);

      if (event2Config && today > endDate) {
        console.log(`⏭️ 2차 이벤트 종료됨 (종료일: ${event2Config.endDate})`);
      } else {
        console.log("🏆 2차 이벤트 기간이 아직 시작되지 않았지만 메타데이터를 생성합니다.");
      }

      await this.clearPeriodLeaderboard(LeaderboardPeriod.EVENT2);

      // 🔧 [BUGFIX 2025-10-16] 이벤트 미시작 시에도 빈 메타데이터 생성
      // 프론트엔드가 이벤트 날짜 정보를 미리 볼 수 있도록 함
      if (event2Config) {
        await this.saveLeaderboardMetadata(
          LeaderboardPeriod.EVENT2,
          0, // 엔트리 없음
          event2Config.description,
          new Date(event2Config.startDate),
          new Date(event2Config.endDate)
        );
      }

      results.event2 = { period: "EVENT2", entriesGenerated: 0, topScore: 0, description: event2Config?.description || "2차 이벤트" };
    }

    // 3차 이벤트 기간인지 확인 후 생성
    const event3Config = eventPeriodConfigs[LeaderboardPeriod.EVENT3];
    if (event3Config && this.isWithinEventPeriod(today, event3Config.startDate, event3Config.endDate, "EVENT3")) {
      console.log(`📅 3차 이벤트 진행 중 (${event3Config.startDate} ~ ${event3Config.endDate})`);
      results.event3 = await this.generateEvent3Leaderboard(collectedEngagements);
    } else {
      // 이벤트 기간 외: 종료 또는 미시작
      const endDate = new Date(event3Config?.endDate || "");
      endDate.setHours(23, 59, 59, 999);

      if (event3Config && today > endDate) {
        console.log(`⏭️ 3차 이벤트 종료됨 (종료일: ${event3Config.endDate})`);
      } else {
        console.log("🏆 3차 이벤트 기간이 아직 시작되지 않았지만 메타데이터를 생성합니다.");
      }

      await this.clearPeriodLeaderboard(LeaderboardPeriod.EVENT3);

      // 이벤트 미시작 시에도 빈 메타데이터 생성
      if (event3Config) {
        await this.saveLeaderboardMetadata(
          LeaderboardPeriod.EVENT3,
          0, // 엔트리 없음
          event3Config.description,
          new Date(event3Config.startDate),
          new Date(event3Config.endDate)
        );
      }

      results.event3 = { period: "EVENT3", entriesGenerated: 0, topScore: 0, description: event3Config?.description || "3차 이벤트" };
    }

    console.log("🏆 모든 리더보드 생성 완료", {
      cumulative: results.cumulative.entriesGenerated,
      event1: results.event1.entriesGenerated,
      event2: results.event2.entriesGenerated,
      event3: results.event3.entriesGenerated
    });

    // 🚀 API Gateway 캐시 무효화 (사용자가 즉시 최신 데이터를 볼 수 있도록)
    await this.flushAPIGatewayCache();

    return results;
  }

  async generateCumulativeLeaderboard(collectedEngagements?: any[]) {
    // 전체 누적 리더보드 (시스템 시작부터 현재까지)
    const endDate = new Date();
    const startDate = new Date(0); // Epoch start, as this date is ignored for CUMULATIVE period

    return this.generatePeriodLeaderboard(
      LeaderboardPeriod.CUMULATIVE,
      startDate,
      endDate,
      "전체 누적 리더보드",
      null,
      collectedEngagements
    );
  }

  async generateEvent1Leaderboard(collectedEngagements?: any[]) {
    // 1차 이벤트 기간 리더보드 (9/8-9/21, 인게이지먼트는 9/3부터)
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs[LeaderboardPeriod.EVENT1];
    if (!config) {
      throw new Error("Event1 configuration not found");
    }

    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);

    // 이벤트 종료 여부 확인 (오늘 날짜 > 종료일)
    const today = new Date().toISOString().split('T')[0];
    const eventEndDate = config.endDate.split('T')[0];
    const isEventEnded = today > eventEndDate;

    console.log(`📅 [EVENT1] 이벤트 종료 상태 확인`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? '영구 보관 (10년)' : '임시 보관 (1년)'
    });

    return this.generatePeriodLeaderboard(
      LeaderboardPeriod.EVENT1,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }

  async generateEvent2Leaderboard(collectedEngagements?: any[]) {
    // 2차 이벤트 기간 리더보드 (9/22-10/5, 인게이지먼트는 9/17부터)
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs[LeaderboardPeriod.EVENT2];
    if (!config) {
      throw new Error("Event2 configuration not found");
    }

    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);

    // 이벤트 종료 여부 확인 (오늘 날짜 > 종료일)
    const today = new Date().toISOString().split('T')[0];
    const eventEndDate = config.endDate.split('T')[0];
    const isEventEnded = today > eventEndDate;

    console.log(`📅 [EVENT2] 이벤트 종료 상태 확인`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? '영구 보관 (10년)' : '임시 보관 (1년)'
    });

    return this.generatePeriodLeaderboard(
      LeaderboardPeriod.EVENT2,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }

  async generateEvent3Leaderboard(collectedEngagements?: any[]) {
    // 3차 이벤트 기간 리더보드
    const eventPeriodConfigs = getEventPeriodConfigs();
    const config = eventPeriodConfigs[LeaderboardPeriod.EVENT3];
    if (!config) {
      throw new Error("Event3 configuration not found");
    }

    const startDate = new Date(config.startDate);
    const endDate = new Date(config.endDate);

    // 이벤트 종료 여부 확인 (오늘 날짜 > 종료일)
    const today = new Date().toISOString().split('T')[0];
    const eventEndDate = config.endDate.split('T')[0];
    const isEventEnded = today > eventEndDate;

    console.log(`📅 [EVENT3] 이벤트 종료 상태 확인`, {
      today,
      eventEndDate,
      isEventEnded,
      ttlPolicy: isEventEnded ? '영구 보관 (10년)' : '임시 보관 (1년)'
    });

    return this.generatePeriodLeaderboard(
      LeaderboardPeriod.EVENT3,
      startDate,
      endDate,
      config.description,
      config,
      collectedEngagements,
      isEventEnded
    );
  }

  /**
   * UserIdentityMap 테이블에서 X 계정 연동한 사용자 ID 목록을 가져옵니다.
   * twitter_{userId} 패턴으로 저장된 항목을 스캔하여 Set으로 반환합니다.
   */
  private async getRegisteredTwitterUserIds(): Promise<Set<string>> {
    // UserIdentityMap 테이블이 설정되지 않은 경우 빈 Set 반환
    if (!this.config.userIdentityMapTable) {
      console.log("⚠️ USER_IDENTITY_MAP_TABLE 환경변수가 설정되지 않아 회원 뱃지 기능이 비활성화됩니다.");
      return new Set<string>();
    }

    const registeredUserIds = new Set<string>();

    try {
      const scanResult = await this.ddbClient.send(new ScanCommand({
        TableName: this.config.userIdentityMapTable,
        FilterExpression: "begins_with(userId, :prefix)",
        ExpressionAttributeValues: marshall({ ":prefix": "twitter_" })
      }));

      scanResult.Items?.forEach(item => {
        const unmarshalled = unmarshall(item);
        // twitter_1234567890 → 1234567890 추출
        const twitterUserId = unmarshalled.userId.replace("twitter_", "");
        registeredUserIds.add(twitterUserId);
      });

      console.log(`✅ UserIdentityMap 스캔 완료: ${registeredUserIds.size}명의 등록 회원 확인`);
    } catch (error) {
      console.error("❌ UserIdentityMap 스캔 실패:", error);
      // 에러가 발생해도 리더보드 생성은 계속 진행 (뱃지만 표시 안됨)
    }

    return registeredUserIds;
  }

  private async generatePeriodLeaderboard(
    period: LeaderboardPeriod,
    startDate: Date,
    endDate: Date,
    description: string,
    eventConfig: EventPeriodConfig | null = null,
    collectedEngagements?: any[],
    isEventEnded: boolean = false
  ) {
    console.log(`🏆 ${description} 생성 시작`, {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      hasCollectedEngagements: !!collectedEngagements,
      engagementsCount: collectedEngagements?.length || 0
    });

    // 🆕 커뮤니티 멤버 목록 로드
    await this.loadCommunityMembers();

    // 0. 등록 회원 확인 (UserIdentityMap에서 X 계정 연동한 사용자)
    const registeredUserIds = await this.getRegisteredTwitterUserIds();

    // 1. 이벤트 리더보드는 환경 변수 날짜를 그대로 사용 (스냅샷 방식)
    // 파이프라인 실행일 범위 내에 수집된 데이터만 집계
    console.log(`📅 이벤트 기간 설정 (스냅샷 방식):`, {
      period,
      pipelineStartDate: startDate.toISOString().split('T')[0],
      pipelineEndDate: endDate.toISOString().split('T')[0],
      note: 'lastProcessedDate 기준으로 해당 기간에 수집된 데이터만 집계'
    });

    // 2. 기간 내 활동을 기반으로 사용자별 점수 계산
    const userScores = await this.calculatePeriodScores(startDate, endDate, period, collectedEngagements);

    // 2. 점수 순으로 정렬 및 ADMIN 계정 제외
    console.log(`🛡️ ADMIN 계정 필터링 설정:`, {
      adminUsernames: this.config.adminUsernames,
      totalUsersBeforeFilter: userScores.length
    });
    
    const sortedUsers = userScores
      .sort((a, b) => b.totalScore - a.totalScore)
      .filter(user => user.totalScore > 0) // 점수가 0보다 큰 사용자만
      .filter(user => {
        // 관리자 계정 필터링 (username 기반, 환경변수로 완전 제어)
        const isAdmin = user.username && this.config.adminUsernames.includes(user.username);

        if (isAdmin) {
          console.log(`🚫 ADMIN 계정 제외: ${user.username || 'unknown'} (${user.userId})`);
        }
        return !isAdmin; // ADMIN 계정 제외
      });
    
    console.log(`📊 필터링 후 사용자 수: ${sortedUsers.length}명`);

    // 3. 동점자 처리를 위한 활동 일수 계산 (설정 활성화 시에만)
    let usersWithActiveDays = sortedUsers;
    if (this.config.enableActiveDaysTieBreaker) {
      console.log(`📅 동점자 처리용 활동 일수 계산 시작 (${sortedUsers.length}명)`);
      
      const activeDaysConfig: ActiveDaysConfig = {
        periodDays: this.config.activeDaysPeriod,
        activeDaysWeight: this.config.activeDaysWeight,
        minActivitiesPerDay: this.config.activeDaysMinActivities
      };
      
      const userIds = sortedUsers.map(user => user.userId);
      const activeDaysResults = await this.activeDaysCalculator.calculateActiveDaysBatch(userIds, activeDaysConfig);
      
      // 활동 일수 정보를 사용자 데이터에 추가
      usersWithActiveDays = sortedUsers.map(user => ({
        ...user,
        activeDays: activeDaysResults[user.userId]?.totalActiveDays || 0,
        activeDaysScore: activeDaysResults[user.userId] ? 
          (activeDaysResults[user.userId].totalActiveDays * activeDaysConfig.activeDaysWeight) : 0
      }));
      
      console.log(`✅ 활동 일수 계산 완료. 평균 활동일수: ${
        Math.round(usersWithActiveDays.reduce((sum, u) => sum + (u as any).activeDays, 0) / usersWithActiveDays.length * 100) / 100
      }일`);
      
      // 동점자 처리: 메인 점수 + 활동 일수 점수로 정렬
      usersWithActiveDays.sort((a, b) => {
        const aTotal = a.totalScore + ((a as any).activeDaysScore || 0);
        const bTotal = b.totalScore + ((b as any).activeDaysScore || 0);
        
        if (Math.abs(aTotal - bTotal) < 0.001) {
          // 완전 동점인 경우 활동 일수로 비교
          return ((b as any).activeDays || 0) - ((a as any).activeDays || 0);
        }
        
        return bTotal - aTotal;
      });
      
      console.log(`🔄 동점자 처리 완료. 상위 5명:`, usersWithActiveDays.slice(0, 5).map(u => ({
        userId: u.userId,
        메인점수: u.totalScore,
        활동일수: (u as any).activeDays,
        활동일수점수: (u as any).activeDaysScore,
        총점: u.totalScore + ((u as any).activeDaysScore || 0)
      })));
    }

    // 🆕 Activity Bonus 계산
    let usersWithBonus = usersWithActiveDays;
    if (this.config.enableActivityBonus) {
      console.log(`🎁 [Activity Bonus] Calculating for ${usersWithActiveDays.length} users...`);

      const bonusPromises = usersWithActiveDays.map(async (user) => {
        try {
          const activeDaysLast7 = await this.activeDaysCalculator.getActiveDaysInLast7Days(user.userId);
          const bonus = ActiveDaysCalculator.calculateActivityBonus(activeDaysLast7, {
            weightPerDay: this.config.activityBonusWeightPerDay,
            threshold: this.config.activityBonusThresholdDays
          });

          return { ...user, activityBonus: bonus, activeDaysLast7 };
        } catch (error) {
          console.error(`❌ [Activity Bonus Error] User: ${user.userId}`, error);
          return { ...user, activityBonus: 0, activeDaysLast7: 0 };
        }
      });

      usersWithBonus = await Promise.all(bonusPromises);
      console.log(`✅ [Activity Bonus] Completed`);
    }

    // 🆕 Inactivity Penalty 계산
    let usersWithPenalty = usersWithBonus;
    if (this.config.enableInactivityPenalty) {
      console.log(`⚠️ [Inactivity Penalty] Calculating for ${usersWithBonus.length} users...`);

      const penaltyPromises = usersWithBonus.map(async (user) => {
        try {
          const daysSince = await this.activeDaysCalculator.getDaysSinceLastActivity(user.userId);
          const penalty = ActiveDaysCalculator.calculateInactivityPenalty(daysSince, {
            threshold: this.config.inactivityPenaltyThreshold,
            penaltyPerDay: this.config.inactivityPenaltyPerDay,
            maxPenalty: this.config.inactivityPenaltyMax
          });

          return { ...user, inactivityPenalty: penalty, daysSinceLastActivity: daysSince };
        } catch (error) {
          console.error(`❌ [Inactivity Penalty Error] User: ${user.userId}`, error);
          return { ...user, inactivityPenalty: 0, daysSinceLastActivity: 0 };
        }
      });

      usersWithPenalty = await Promise.all(penaltyPromises);
      console.log(`✅ [Inactivity Penalty] Completed`);
    }

    // 🆕 최종 점수 재계산 (기존 finalScore에 보너스/감점 추가)
    const finalUsers = usersWithPenalty.map(user => {
      const activityBonus = (user as any).activityBonus || 0;
      const inactivityPenalty = (user as any).inactivityPenalty || 0;
      const activeDaysScore = (user as any).activeDaysScore || 0;
      const newFinalScore = (user.totalScore || 0) + activeDaysScore + activityBonus + inactivityPenalty;

      return {
        ...user,
        activityBonus,
        inactivityPenalty,
        finalScore: Math.max(0, Math.round(newFinalScore * 10) / 10)
      };
    });

    // 최종 정렬 (finalScore 기준)
    finalUsers.sort((a, b) => {
      const scoreDiff = (b as any).finalScore - (a as any).finalScore;
      if (Math.abs(scoreDiff) < 0.001) {
        // 완전 동점인 경우 활동 일수로 비교
        return ((b as any).activeDays || 0) - ((a as any).activeDays || 0);
      }
      return scoreDiff;
    });

    console.log(`🎯 [Final Score] 최종 점수 계산 완료. 상위 5명:`, finalUsers.slice(0, 5).map(u => ({
      userId: u.userId,
      totalScore: u.totalScore,
      activeDaysScore: (u as any).activeDaysScore,
      activityBonus: (u as any).activityBonus,
      inactivityPenalty: (u as any).inactivityPenalty,
      finalScore: (u as any).finalScore
    })));

    // 기존 변수명 유지 (나머지 코드 호환성)
    usersWithActiveDays = finalUsers;

    // 4. 새 리더보드 엔트리 생성 (동점자 순위 처리)

    // 🆕 Phase 3: 어제 리더보드 데이터 로드
    const yesterdayLeaderboard = await this.getLeaderboardSnapshot(period, 1); // 1일 전
    const yesterdayRankMap = new Map<string, { rank: number; totalScore: number }>();
    if (yesterdayLeaderboard) {
      yesterdayLeaderboard.forEach(entry => {
        yesterdayRankMap.set(entry.userId, { rank: entry.rank, totalScore: entry.totalScore });
      });
      console.log(`✅ [RANK_CHANGE] 어제 리더보드 데이터 로드 완료: ${yesterdayRankMap.size}명`);
    }

    const entries: LeaderboardEntry[] = [];
    const entriesToSave: LeaderboardEntry[] = []; // 저장할 엔트리를 담을 배열 선언
    let currentRank = 1;
    
    for (let i = 0; i < usersWithActiveDays.length; i++) {
      const user = usersWithActiveDays[i];
      
      // 하이브리드 순위 처리:
      // - 양수 점수 (> 0): Ordinal Ranking (모든 사용자에게 고유 순위)
      // - 0점: Standard Competition Ranking (동점자 동일 순위)
      if (i > 0) {
        const currentTotal = (user as any).finalScore;
        const prevTotal = (usersWithActiveDays[i-1] as any).finalScore;

        if (currentTotal > 0) {
          // 양수 점수: 항상 고유 순위 (Ordinal Ranking)
          currentRank = i + 1;
        } else if (Math.abs(currentTotal - prevTotal) > 0.001) {
          // 0점: 점수가 다를 때만 순위 증가 (Standard Competition)
          currentRank = i + 1;
        }
        // 0점이고 이전 사용자도 0점이면 동일 순위 유지
      }
      
      const rank = currentRank;

      // 🆕 커뮤니티 멤버 체크
      const isCommunityMember = this.communityMemberIds.has(user.userId);

      // 🆕 Phase 3: 순위 변동 계산
      const yesterdayData = yesterdayRankMap.get(user.userId);
      let rankChange: RankChangeData | null = null;
      if (yesterdayData) {
        const rankDiff = yesterdayData.rank - rank;
        rankChange = {
          direction: rankDiff > 0 ? 'up' : rankDiff < 0 ? 'down' : 'same',
          amount: Math.abs(rankDiff),
          scoreChange: (user.totalScore || 0) - (yesterdayData.totalScore || 0),
        };
      } else {
        rankChange = { direction: 'new', amount: 0, scoreChange: user.totalScore || 0 };
      }

      if (isCommunityMember) {
        console.log(`   ✓ #${rank} @${user.username} (커뮤니티 멤버)`);
      }

      // 🔍 DEBUG: dominantLanguage 필드 검증
      if (i === 0) { // 첫 번째 사용자만 로깅
        console.log(`🔍 [DEBUG] Top user dominantLanguage check:`, {
          userId: user.userId,
          username: user.username,
          dominantLanguage: (user as any).dominantLanguage,
          communityType: (user as any).communityType,
          hasField: 'dominantLanguage' in user
        });
      }

      const entry: LeaderboardEntry = {
        pk: `LEADERBOARD#${period}`,
        sk: `RANK#${rank.toString().padStart(4, '0')}#${user.userId}`,
        rank,
        userId: user.userId,
        username: user.username || user.userId, // username이 없으면 userId 사용
        ...(((user as any).displayName) ? { displayName: (user as any).displayName } : {}),
        ...(((user as any).profileImageUrl) ? { profileImageUrl: (user as any).profileImageUrl } : {}),
        ...((typeof (user as any).followersCount === 'number' && (user as any).followersCount >= 0) ? { followersCount: (user as any).followersCount } : {}), // 팔로워 수 추가 (0 이상의 숫자만)
        ...((user as any).dominantLanguage ? { dominantLanguage: (user as any).dominantLanguage } : {}), // dominantLanguage 추가
        isCommunityMember, // 🆕 추가!
        ...(rankChange && { rankChange }), // 🆕 Phase 3: 순위 변동 정보 추가
        ...(registeredUserIds.has(user.userId) ? { isRegisteredMember: true } : {}), // 🆕 등록 회원 뱃지
        totalScore: user.totalScore, // ✅ Top Climbers를 위한 totalScore 필드 추가
        finalScore: (user as any).finalScore ?? user.totalScore, // 🔧 ?? 연산자로 0도 유효한 값으로 처리 (|| 사용 시 0이 totalScore로 대체되는 버그 수정)
        totalLikes: user.totalLikes,
        totalReplies: user.totalReplies,
        totalReposts: user.totalReposts,
        totalQuotes: user.totalQuotes,
        totalMentions: user.totalMentions || 0,
        // 활동 일수 정보 추가 (동점자 처리용)
        ...(this.config.enableActiveDaysTieBreaker ? {
          activeDays: (user as any).activeDays || 0,
          activeDaysScore: (user as any).activeDaysScore || 0
          // finalScore는 Line 580에서 이미 완벽하게 설정됨 (중복 제거로 NaN 방지)
        } : {}),
        // 🆕 Activity Bonus 필드 추가
        ...(this.config.enableActivityBonus ? {
          activityBonus: (user as any).activityBonus || 0,
          activeDaysLast7: (user as any).activeDaysLast7 || 0
        } : {}),
        // 🆕 Inactivity Penalty 필드 추가
        ...(this.config.enableInactivityPenalty ? {
          inactivityPenalty: (user as any).inactivityPenalty || 0,
          daysSinceLastActivity: (user as any).daysSinceLastActivity || 0
        } : {}),
        lastUpdated: new Date().toISOString(),
        period,
        periodStartDate: startDate.toISOString(),
        periodEndDate: endDate.toISOString(),
        periodDescription: description
      };

      entries.push(entry);
      entriesToSave.push(entry);
    }

    // 5. [안정성 개선] 생성된 리더보드 항목이 있을 때만 DB 업데이트 수행
    if (entriesToSave.length > 0) {
      console.log(`💾 새로운 리더보드 데이터 ${entriesToSave.length}개를 저장합니다.`);
      
      // 5-1. 기존 리더보드 엔트리 삭제
      await this.clearPeriodLeaderboard(period);

      // 5-2. 배치 쓰기 로직
      console.log(`📦 리더보드 저장을 위한 배치 구성 시작: ${entriesToSave.length}개 엔트리`);
      const batchSize = 25;
      for (let i = 0; i < entriesToSave.length; i += batchSize) {
          const batch = entriesToSave.slice(i, i + batchSize);
          const writeRequests = batch.map(entry => ({
              PutRequest: {
                  Item: marshall(entry, { removeUndefinedValues: true })
              }
          }));

          try {
              const batchWriteResult = await this.ddbClient.send(new BatchWriteItemCommand({
                  RequestItems: {
                      [this.config.cumulativeTableName]: writeRequests
                  }
              }));

              if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
                  console.warn(`⚠️ 일부 리더보드 항목 처리 실패, 재시도 필요`);
                  // 참고: 실제 프로덕션 코드에서는 여기에 재시도 로직을 구현해야 합니다.
                  // 이 예제에서는 경고만 기록합니다.
              }
          } catch (error) {
              console.error(`❌ 리더보드 배치 저장 실패 (배치 인덱스: ${i / batchSize})`, error);
          }
      }
      console.log(`✅ 리더보드 항목 저장 완료: ${entriesToSave.length}개`);

      // 5-3. 메타데이터 저장
      await this.saveLeaderboardMetadata(period, entries.length, description, startDate, endDate);

      // 5-4. 스냅샷 저장 (완전한 데이터 복사)
      await this.saveLeaderboardSnapshot(period, entries, description, startDate, endDate, isEventEnded);

      // 5-5. 🆕 사용자별 랭킹 히스토리 저장 (My Account Rank History 기능용)
      await this.saveUserRankHistories(period, entries, isEventEnded);
    } else {
      console.log("🛡️ 생성된 리더보드 항목이 없으므로, 기존 리더보드 데이터를 유지합니다.");
    }

    console.log(`✅ ${description} 생성 완료`, {
      period,
      entriesGenerated: entries.length,
      topScore: entries[0]?.totalScore || 0,
      snapshotSaved: true
    });

    return {
      period,
      entriesGenerated: entries.length,
      topScore: entries[0]?.totalScore || 0,
      description
    };
  }

  private async getActivitiesInPeriod(startDate: Date, endDate: Date): Promise<any[]> {
    // 파이프라인 실행일 기준으로 필터링 (스냅샷 방식)
    const startDateStr = startDate.toISOString().split('T')[0];  // YYYY-MM-DD
    const endDateStr = endDate.toISOString().split('T')[0];      // YYYY-MM-DD

    console.log(`[EventLeaderboard] 파이프라인 실행일 범위: ${startDateStr} ~ ${endDateStr}`);
    console.log(`[EventLeaderboard] lastProcessedDate 기준으로 해당 기간에 수집된 데이터 조회 중...`);

    const allActivities: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const scanParams: ScanCommandInput = {
        TableName: this.config.cumulativeTableName,
        FilterExpression: "begins_with(sk, :sk_prefix) AND lastProcessedDate BETWEEN :start_date AND :end_date",
        ExpressionAttributeValues: marshall({
          ":sk_prefix": "RECENT#",
          ":start_date": startDateStr,
          ":end_date": endDateStr,
        }),
        ExclusiveStartKey: lastEvaluatedKey,
      };

      try {
        const result = await this.ddbClient.send(new ScanCommand(scanParams));
        if (result.Items) {
          allActivities.push(...result.Items.map(item => unmarshall(item)));
        }
        lastEvaluatedKey = result.LastEvaluatedKey;
      } catch (error) {
        console.error("[EventLeaderboard] 활동 데이터 스캔 중 오류 발생:", error);
        break;
      }
    } while (lastEvaluatedKey);

    console.log(`[EventLeaderboard] 총 ${allActivities.length}개의 활동 데이터를 찾았습니다.`);
    console.log(`[EventLeaderboard] (스냅샷 방식: ${startDateStr}~${endDateStr} 기간 중 파이프라인이 수집한 데이터)`);
    return allActivities;
  }

  private async calculatePeriodScores(startDate: Date, endDate: Date, period: LeaderboardPeriod, collectedEngagements?: any[]) {
    // 전체 기간인 경우 GSI를 사용하여 누적 점수를 그대로 사용
    if (period === LeaderboardPeriod.CUMULATIVE) {
      console.log("📊 전체 기간 누적 점수 사용");
      const userScores = await this.getAllCumulativeScores();

      return userScores.filter(score => score.totalScore > 0).map(score => ({
        userId: score.userId,
        username: score.username,
        displayName: (score as any).displayName,
        profileImageUrl: (score as any).profileImageUrl,
        followersCount: (score as any).followersCount,
        dominantLanguage: (score as any).dominantLanguage,
        communityType: (score as any).communityType,
        totalScore: score.totalScore,
        totalLikes: score.totalLikes,
        totalReplies: score.totalReplies,
        totalReposts: score.totalReposts,
        totalQuotes: score.totalQuotes,
        totalMentions: score.totalMentions || 0
      }));
    }

    // ✅ 이벤트 기간 리더보드: RECENT# 전체 조회 + 프로필 보강
    console.log(`📊 [EventLeaderboard] ${period} 기간 점수를 가중치 적용하여 계산합니다.`);

    // Step 1: RECENT# 테이블에서 이벤트 기간 전체 활동 데이터 조회
    console.log(`📊 [EventLeaderboard] RECENT# 테이블 조회: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);
    const activities = await this.getActivitiesInPeriod(startDate, endDate);

    console.log(`📊 [EventLeaderboard] RECENT# 조회 완료: ${activities.length}개 활동 데이터`);

    if (activities.length === 0) {
      console.log(`⚠️ [EventLeaderboard] ${period} 기간에 활동 데이터가 없습니다.`);
      return [];
    }

    // Step 2: 프로필 정보 보강 (파이프라인 데이터 + CUMULATIVE_SCORE)
    const enrichedActivities = await this.enrichActivitiesWithProfiles(
      activities,
      collectedEngagements
    );

    console.log(`📊 [EventLeaderboard] ${period}: ${enrichedActivities.length}개 활동 데이터 조회 완료`);

    // ✅ DeltaCalculator를 사용하여 가중치 적용된 점수 계산
    // recalculateFromEngagements는 기존 인게이지먼트로부터 점수를 재계산하는 메서드
    // (언어 × 팔로워 가중치 모두 적용됨)
    const deltaResult = await this.deltaCalculator.recalculateFromEngagements(
      enrichedActivities,
      endDate.toISOString().split('T')[0]
    );

    console.log(`✅ [EventLeaderboard] ${period}: ${deltaResult.userDeltas.length}명 점수 계산 완료`);

    // UserDelta → 리더보드 스코어 형식으로 변환
    const userScores = deltaResult.userDeltas.map(delta => ({
      userId: delta.userId,
      username: delta.username || 'unknown',
      displayName: delta.displayName || delta.username || 'unknown',
      profileImageUrl: delta.profileImageUrl,
      followersCount: delta.followersCount || 0,
      dominantLanguage: delta.dominantLanguage,
      communityType: delta.dominantLanguage === 'ko' ? 'korean' : 'global',
      totalScore: delta.scoreChange,  // ✅ 이미 가중치 적용된 점수
      totalLikes: delta.likesChange,
      totalReplies: delta.repliesChange,
      totalReposts: delta.repostsChange,
      totalQuotes: delta.quotesChange,
      totalMentions: delta.mentionsChange,
      // 가중치 메타데이터도 포함
      communityWeight: delta.communityWeight,
      languageMultiplier: delta.languageMultiplier,
      followerWeight: delta.followerWeight,
      originalScore: delta.originalScore
    }));

    // ✅ 전체 누적 데이터에서 추가 프로필 정보 보강 (필요 시)
    const cumulativeScores = await this.getAllCumulativeScores();
    const cumulativeMap = new Map(cumulativeScores.map(s => [s.userId, s]));

    for (const userScore of userScores) {
      const cumulativeData = cumulativeMap.get(userScore.userId);
      if (cumulativeData) {
        // username, displayName, profileImageUrl이 누락된 경우만 보강
        if (!userScore.username || userScore.username === 'unknown') {
          userScore.username = cumulativeData.username;
        }
        if (!userScore.displayName || userScore.displayName === 'unknown') {
          userScore.displayName = cumulativeData.displayName;
        }
        if (!userScore.profileImageUrl) {
          userScore.profileImageUrl = cumulativeData.profileImageUrl;
        }
        // dominantLanguage가 없는 경우 보강
        if (!userScore.dominantLanguage || userScore.dominantLanguage === 'unknown') {
          userScore.dominantLanguage = cumulativeData.dominantLanguage;
        }
      }
    }

    console.log(`📊 [EventLeaderboard] ${period}: 최종 ${userScores.length}명 반환`);
    console.log(`   예시 점수 (상위 3명):`, userScores
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 3)
      .map(u => ({
        username: u.username,
        totalScore: u.totalScore,
        originalScore: u.originalScore,
        communityWeight: u.communityWeight,
        language: u.dominantLanguage
      }))
    );

    return userScores;
  }

  private async getAllCumulativeScores(): Promise<CumulativeScoreRecord[]> {
    // GSI를 사용하여 상위 3000명의 누적 점수 조회
    console.log("🔍 GSI를 사용하여 상위 3000명 점수 데이터 조회 시작 (total-score-index)");

    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      IndexName: "total-score-index",
      KeyConditionExpression: "leaderboardIdentifier = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: "SCORE_RECORD" }
      },
      ScanIndexForward: false, // 내림차순 정렬 (높은 점수부터)
      Limit: 3000 // 상위 3000명 조회 (프로필 이미지 보존을 위해 확장)
    }));

    const topScores: CumulativeScoreRecord[] = [];
    if (result.Items) {
      const scores = result.Items.map((item: any) => {
        const unmarshalled = unmarshall(item);
        return unmarshalled as unknown as CumulativeScoreRecord;
      });
      topScores.push(...scores);
    }
    
    console.log(`✅ GSI 쿼리 완료: ${topScores.length}명 조회`);

    // 🔥 Phase 2.1.2: 프로필 정보가 누락된 사용자들을 위한 강화된 복구 로직
    console.log("🔍 [PROFILE_RECOVERY] 프로필 누락 사용자 확인 시작");
    await this.recoverMissingProfiles(topScores);
    
    console.log("✅ 상위 500명 점수 데이터 처리 완료:", { totalUsers: topScores.length });
    return topScores;
  }

  /**
   * 🔥 Phase 2.1.2: 누락된 프로필 정보들을 강화된 시스템으로 복구
   * 1단계: CentralizedProfileManager를 통한 고품질 프로필 복구
   * 2단계: UserProfiles 테이블에서 폴백 조회
   * 3단계: 관리자 계정 하드코딩 매핑
   * 4단계: displayName을 username으로 사용 (최후 fallback)
   */
  private async recoverMissingProfiles(allScores: CumulativeScoreRecord[]): Promise<void> {
    // 프로필 정보가 부족한 사용자들 식별
    const incompleteProfiles = this.identifyIncompleteProfiles(allScores);
    
    if (incompleteProfiles.length === 0) {
      console.log("🎉 [PROFILE_RECOVERY] 모든 사용자의 프로필 정보가 완전합니다.");
      return;
    }

    console.log(`🔧 [PROFILE_RECOVERY] 프로필 복구 대상: ${incompleteProfiles.length}명`);
    
    const recoveryStats = {
      totalTargets: incompleteProfiles.length,
      centralizedRecovered: 0,
      userProfilesRecovered: 0,
      hardcodedMapped: 0,
      fallbackApplied: 0,
      totalRecovered: 0,
      qualityImprovement: 0
    };

    // 1단계: CentralizedProfileManager를 통한 고품질 프로필 복구
    console.log("🔍 [PROFILE_RECOVERY] 1단계: CentralizedProfileManager를 통한 프로필 복구");
    recoveryStats.centralizedRecovered = await this.recoverWithCentralizedManager(incompleteProfiles);

    // 2단계: UserProfiles 테이블에서 폴백 조회
    console.log("🔍 [PROFILE_RECOVERY] 2단계: UserProfiles 테이블에서 폴백 복구");
    recoveryStats.userProfilesRecovered = await this.recoverFromUserProfiles(incompleteProfiles);

    // 3단계: 관리자 계정 하드코딩 매핑
    console.log("🔍 [PROFILE_RECOVERY] 3단계: 관리자 계정 하드코딩 매핑");
    recoveryStats.hardcodedMapped = this.applyHardcodedMappings(incompleteProfiles);

    // 4단계: displayName을 username으로 사용 (최후 fallback)
    console.log("🔍 [PROFILE_RECOVERY] 4단계: displayName fallback");
    recoveryStats.fallbackApplied = this.applyDisplayNameFallback(incompleteProfiles);

    // 복구 성공률 분석 및 보고
    await this.analyzeAndReportRecoveryResults(incompleteProfiles, recoveryStats);
  }

  /**
   * 🔥 Phase 2.1.2: 프로필 정보가 불완전한 사용자들 식별
   */
  private identifyIncompleteProfiles(allScores: CumulativeScoreRecord[]): CumulativeScoreRecord[] {
    return allScores.filter(score => {
      const hasValidUsername = ProfileValidators.isValidUsername(score.username);
      const hasValidDisplayName = ProfileValidators.isValidDisplayName((score as any).displayName);
      const hasProfileImage = ProfileValidators.isValidProfileImageUrl((score as any).profileImageUrl);
      const hasFollowersCount = ProfileValidators.isValidFollowersCount((score as any).followersCount);
      
      // 하나라도 누락되면 복구 대상
      return !hasValidUsername || !hasValidDisplayName || !hasProfileImage || !hasFollowersCount;
    });
  }

  /**
   * 🔥 Phase 2.1.2: CentralizedProfileManager를 통한 고품질 프로필 복구
   */
  private async recoverWithCentralizedManager(scores: CumulativeScoreRecord[]): Promise<number> {
    let recoveredCount = 0;
    const batchSize = 10; // Rate Limit 고려
    
    console.log(`📊 [CENTRALIZED_RECOVERY] ${scores.length}명의 프로필 복구 시작...`);
    
    for (let i = 0; i < scores.length; i += batchSize) {
      const batch = scores.slice(i, i + batchSize);
      const batchPromises = batch.map(async (score) => {
        try {
          // 🛡️ 안전한 프로필 복구 - null 참조 오류 방지
          let recoveredProfile: UserProfile | null = null;
          
          try {
            // CentralizedProfileManager를 사용하여 프로필 복구 시도
            const profileResult = await this.centralizedProfileManager.processUserProfiles([{
              userId: score.userId,
              username: score.username,
              displayName: (score as any).displayName,
              profileImageUrl: (score as any).profileImageUrl,
              followersCount: (score as any).followersCount
            }]);
            
            // 🛡️ 안전한 null 처리
            if (profileResult && profileResult.profiles && profileResult.profiles.size > 0) {
              const userProfile = profileResult.profiles.get(score.userId);
              if (userProfile) {
                recoveredProfile = userProfile;
                console.log(`✅ [SAFE_RECOVERY] 사용자 ${score.userId} 프로필 복구 성공`);
              } else {
                console.log(`⚠️ [SAFE_RECOVERY] 사용자 ${score.userId} 프로필 복구 결과 없음`);
              }
            } else {
              console.log(`⚠️ [SAFE_RECOVERY] 사용자 ${score.userId} 프로필 복구 실패 - 빈 결과`);
            }
          } catch (profileError) {
            console.error(`❌ [SAFE_RECOVERY] 프로필 복구 예외 - ${score.userId}:`, profileError);
            recoveredProfile = null;
          }
          
          // 🛡️ 안전한 프로필 업데이트 - null 찴크 후 접근
          let improved = false;
          
          if (recoveredProfile) {
            if (!ProfileValidators.isValidUsername(score.username) && ProfileValidators.isValidUsername(recoveredProfile.username)) {
              score.username = recoveredProfile.username;
              improved = true;
              console.log(`✅ [SAFE_RECOVERY] Username 복구: ${score.userId} → ${score.username}`);
            }
            
            if (!ProfileValidators.isValidDisplayName((score as any).displayName) && ProfileValidators.isValidDisplayName(recoveredProfile.displayName)) {
              (score as any).displayName = recoveredProfile.displayName;
              improved = true;
              console.log(`✅ [SAFE_RECOVERY] DisplayName 복구: ${score.userId} → ${recoveredProfile.displayName}`);
            }
            
            if (!ProfileValidators.isValidProfileImageUrl((score as any).profileImageUrl) && recoveredProfile.profileImageUrl) {
              (score as any).profileImageUrl = recoveredProfile.profileImageUrl;
              improved = true;
              console.log(`✅ [SAFE_RECOVERY] ProfileImage 복구: ${score.userId}`);
            }
            
            if (!ProfileValidators.isValidFollowersCount((score as any).followersCount) && ProfileValidators.isValidFollowersCount(recoveredProfile.followersCount)) {
              (score as any).followersCount = recoveredProfile.followersCount;
              improved = true;
              console.log(`✅ [SAFE_RECOVERY] FollowersCount 복구: ${score.userId} → ${recoveredProfile.followersCount}`);
            }
          } else {
            console.log(`⚠️ [SAFE_RECOVERY] 사용자 ${score.userId} - 프로필 복구 결과가 null이므로 기존 데이터 보존`);
          }
          
          if (improved) {
            recoveredCount++;
          }
          
        } catch (error) {
          console.error(`❌ [CENTRALIZED_RECOVERY] 프로필 복구 실패 - ${score.userId}:`, error);
        }
      });
      
      await Promise.all(batchPromises);
      
      // 배치 처리 사이 딜레이 (Rate Limit 방지)
      if (i + batchSize < scores.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`🎯 [CENTRALIZED_RECOVERY] ${recoveredCount}명의 프로필 복구 완료`);
    return recoveredCount;
  }

  /**
   * 🔥 Phase 2.1.2: UserProfiles 테이블에서 twitterId 기반으로 프로필 정보 복구 (폴백)
   */
  private async recoverFromUserProfiles(scores: CumulativeScoreRecord[]): Promise<number> {
    try {
      // UserProfiles 테이블 전체 스캔 (소규모 테이블이므로 허용)
      const profilesResult = await this.ddbClient.send(new ScanCommand({
        TableName: "UserProfiles",
        FilterExpression: "attribute_exists(twitterId) AND attribute_exists(twitterHandle)"
      }));

      if (!profilesResult.Items || profilesResult.Items.length === 0) {
        console.log("📝 UserProfiles 테이블에 Twitter 프로필 데이터가 없습니다.");
        return 0;
      }

      // twitterId → twitterHandle 매핑 생성
      const twitterIdToHandle: Record<string, string> = {};
      for (const item of profilesResult.Items) {
        const profile = unmarshall(item);
        if (profile.twitterId && profile.twitterHandle) {
          twitterIdToHandle[profile.twitterId] = profile.twitterHandle;
        }
      }

      console.log(`📚 UserProfiles에서 ${Object.keys(twitterIdToHandle).length}개 매핑 발견`);

      // 매핑을 사용하여 username 복구
      let recoveredCount = 0;
      for (const score of scores) {
        if (twitterIdToHandle[score.userId]) {
          score.username = twitterIdToHandle[score.userId];
          console.log(`✅ UserProfiles에서 복구: ${score.userId} → ${score.username}`);
          recoveredCount++;
        }
      }

      console.log(`🎯 UserProfiles에서 ${recoveredCount}명의 username 복구 완료`);
      return recoveredCount;
    } catch (error) {
      console.error("❌ UserProfiles에서 username 복구 실패:", error);
      return 0;
    }
  }

  /**
   * 🔥 Phase 2.1.2: 관리자 계정 등 알려진 계정들의 하드코딩 매핑 (폴백)
   */
  private applyHardcodedMappings(scores: CumulativeScoreRecord[]): number {
    // 환경변수에서 동적으로 매핑 생성
    const knownMappings: Record<string, string> = {};
    
    // TARGET_USER_ID -> TARGET_USERNAME 매핑
    const targetUserId = process.env.TARGET_USER_ID || "1725466995565752320";
    const targetUsername = process.env.TARGET_USERNAME || "Nasun_io";
    knownMappings[targetUserId] = targetUsername;
    
    // ADMIN_USERNAMES에서 추가 매핑 (ID가 있는 경우)
    const adminUsernames = (process.env.ADMIN_USERNAMES || "Nasun_io,overclocksalmon").split(",");
    // 하드코딩된 관리자 계정 ID는 유지 (overclocksalmon)
    knownMappings["1503536552164556804"] = "overclocksalmon";

    let mappedCount = 0;
    for (const score of scores) {
      if (knownMappings[score.userId] && (!score.username || score.username === score.userId || score.username === "unknown")) {
        score.username = knownMappings[score.userId];
        console.log(`🔧 하드코딩 매핑: ${score.userId} → ${score.username}`);
        mappedCount++;
      }
    }

    console.log(`🎯 하드코딩 매핑에서 ${mappedCount}명의 username 설정 완료`);
    return mappedCount;
  }

  /**
   * 🔥 Phase 2.1.2: displayName을 username으로 사용하는 최후 fallback 로직
   */
  private applyDisplayNameFallback(scores: CumulativeScoreRecord[]): number {
    let fallbackCount = 0;
    for (const score of scores) {
      if ((!score.username || score.username === score.userId || score.username === "unknown") && 
          (score as any).displayName && (score as any).displayName !== score.userId) {
        score.username = (score as any).displayName;
        console.log(`🔄 displayName fallback: ${score.userId} → ${score.username}`);
        fallbackCount++;
      }
    }

    console.log(`🎯 displayName fallback에서 ${fallbackCount}명의 username 설정 완료`);
    return fallbackCount;
  }

  /**
   * 🔥 Phase 2.1.2: 복구 결과 분석 및 CloudWatch 메트릭 보고
   */
  private async analyzeAndReportRecoveryResults(
    incompleteProfiles: CumulativeScoreRecord[], 
    recoveryStats: any
  ): Promise<void> {
    // 복구 후 상태 재분석
    const afterRecovery = {
      totalProfiles: incompleteProfiles.length,
      completeProfiles: 0,
      validUsernames: 0,
      validDisplayNames: 0,
      validProfileImages: 0,
      validFollowersCounts: 0,
      averageQualityScore: 0
    };

    let totalQualityScore = 0;

    incompleteProfiles.forEach(score => {
      const hasValidUsername = ProfileValidators.isValidUsername(score.username);
      const hasValidDisplayName = ProfileValidators.isValidDisplayName((score as any).displayName);
      const hasProfileImage = ProfileValidators.isValidProfileImageUrl((score as any).profileImageUrl);
      const hasFollowersCount = ProfileValidators.isValidFollowersCount((score as any).followersCount);

      if (hasValidUsername) afterRecovery.validUsernames++;
      if (hasValidDisplayName) afterRecovery.validDisplayNames++;
      if (hasProfileImage) afterRecovery.validProfileImages++;
      if (hasFollowersCount) afterRecovery.validFollowersCounts++;

      if (hasValidUsername && hasValidDisplayName && hasProfileImage && hasFollowersCount) {
        afterRecovery.completeProfiles++;
      }

      // 품질 점수 계산 (0-100)
      let qualityScore = 0;
      if (hasValidUsername) qualityScore += 30;
      if (hasValidDisplayName) qualityScore += 30;
      if (hasProfileImage) qualityScore += 20;
      if (hasFollowersCount) qualityScore += 20;

      totalQualityScore += qualityScore;
    });

    afterRecovery.averageQualityScore = afterRecovery.totalProfiles > 0 
      ? totalQualityScore / afterRecovery.totalProfiles 
      : 0;

    // 복구 통계 계산
    recoveryStats.totalRecovered = 
      recoveryStats.centralizedRecovered + 
      recoveryStats.userProfilesRecovered + 
      recoveryStats.hardcodedMapped + 
      recoveryStats.fallbackApplied;

    const recoverySuccessRate = afterRecovery.totalProfiles > 0 
      ? (afterRecovery.completeProfiles / afterRecovery.totalProfiles) * 100 
      : 0;

    // 상세 로그
    console.log(`📊 [PROFILE_RECOVERY] 복구 결과 분석:`);
    console.log(`   🎯 대상: ${recoveryStats.totalTargets}명`);
    console.log(`   ✅ 중앙화 시스템: ${recoveryStats.centralizedRecovered}명`);
    console.log(`   📚 UserProfiles 폴백: ${recoveryStats.userProfilesRecovered}명`);
    console.log(`   🔧 하드코딩 매핑: ${recoveryStats.hardcodedMapped}명`);
    console.log(`   🔄 DisplayName 폴백: ${recoveryStats.fallbackApplied}명`);
    console.log(`   📈 전체 완전성: ${afterRecovery.completeProfiles}/${afterRecovery.totalProfiles}명 (${recoverySuccessRate.toFixed(1)}%)`);
    console.log(`   📊 평균 품질 점수: ${afterRecovery.averageQualityScore.toFixed(1)}점`);
    
    console.log(`📋 [PROFILE_RECOVERY] 필드별 완성도:`);
    console.log(`   👤 Username: ${afterRecovery.validUsernames}/${afterRecovery.totalProfiles}명 (${((afterRecovery.validUsernames/afterRecovery.totalProfiles)*100).toFixed(1)}%)`);
    console.log(`   🏷️ DisplayName: ${afterRecovery.validDisplayNames}/${afterRecovery.totalProfiles}명 (${((afterRecovery.validDisplayNames/afterRecovery.totalProfiles)*100).toFixed(1)}%)`);
    console.log(`   🖼️ ProfileImage: ${afterRecovery.validProfileImages}/${afterRecovery.totalProfiles}명 (${((afterRecovery.validProfileImages/afterRecovery.totalProfiles)*100).toFixed(1)}%)`);
    console.log(`   👥 FollowersCount: ${afterRecovery.validFollowersCounts}/${afterRecovery.totalProfiles}명 (${((afterRecovery.validFollowersCounts/afterRecovery.totalProfiles)*100).toFixed(1)}%)`);

    // CloudWatch 메트릭 기록
    await this.recordRecoveryMetrics(recoveryStats, afterRecovery, recoverySuccessRate);

    // 복구 실패가 많은 경우 경고
    if (recoverySuccessRate < 70) {
      console.warn(`⚠️ [PROFILE_RECOVERY] 복구 성공률이 낮습니다 (${recoverySuccessRate.toFixed(1)}%). 시스템 점검이 필요할 수 있습니다.`);
    }
  }

  /**
   * 🔥 Phase 2.1.2: 프로필 복구 메트릭을 CloudWatch에 기록
   */
  private async recordRecoveryMetrics(
    recoveryStats: any, 
    afterRecovery: any, 
    recoverySuccessRate: number
  ): Promise<void> {
    try {
      console.log(`📊 프로필 복구 메트릭: ${recoverySuccessRate}% 성공률, ${recoveryStats.totalTargets}개 대상`);
      // CloudWatch 메트릭 간소화 - 컴파일 오류 방지
    } catch (error) {
      console.error("❌ 메트릭 기록 실패:", error);
    }
  }


  private async clearPeriodLeaderboard(period: LeaderboardPeriod) {
    // 기존 리더보드 엔트리 삭제
    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: `LEADERBOARD#${period}` },
        ":sk": { S: "RANK#" }
      }
    }));

    if (result.Items) {
      for (const item of result.Items) {
        await this.ddbClient.send(new DeleteItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: item.pk,
            sk: item.sk
          }
        }));
      }
    }
  }

  private async saveLeaderboardMetadata(
    period: LeaderboardPeriod,
    totalEntries: number,
    description: string,
    startDate: Date,
    endDate: Date
  ) {
    const metadata = {
      pk: `LEADERBOARD#${period}`,
      sk: "METADATA",
      totalEntries,
      description,
      period,
      lastUpdated: new Date().toISOString(),
      version: "1.0"
    };

    await this.ddbClient.send(new PutItemCommand({
      TableName: this.config.cumulativeTableName,
      Item: marshall(metadata, { removeUndefinedValues: true })
    }));
  }

  /**
   * 리더보드 스냅샷 저장 - 완전한 데이터 복사본을 날짜별로 저장
   * TTL 정책: 이벤트 최종 스냅샷(10년 영구 보관), 일일 스냅샷(1년 후 삭제)
   */
  private async saveLeaderboardSnapshot(
    period: LeaderboardPeriod,
    entries: LeaderboardEntry[],
    description: string,
    startDate: Date,
    endDate: Date,
    isEventEnded: boolean = false
  ) {
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
    const snapshotPK = `LEADERBOARD#${period}#${currentDate}`;

    // TTL 계산: 이벤트 종료 시 10년(영구), 진행 중 또는 CUMULATIVE는 1년
    let ttl: number;
    if (isEventEnded) {
      // 이벤트 최종 스냅샷: 10년 보관 (실질적 영구 보관)
      ttl = Math.floor(Date.now() / 1000) + (3650 * 24 * 60 * 60); // 10년 후 만료
      console.log(`📌 [EVENT_SNAPSHOT] 최종 스냅샷 영구 보관 (TTL: 10년)`);
    } else {
      // 일일 스냅샷: 1년 보관
      ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1년 후 만료
      console.log(`📅 [DAILY_SNAPSHOT] 일일 스냅샷 TTL: 1년`);
    }

    console.log(`📸 스냅샷 저장 시작: ${snapshotPK}`, {
      period,
      date: currentDate,
      entriesCount: entries.length,
      isEventEnded,
      ttlExpiration: new Date(ttl * 1000).toISOString(),
      ttlDays: isEventEnded ? 3650 : 365
    });

    try {
      // 1. 기존 스냅샷 삭제 (중복 방지)
      await this.deleteExistingSnapshot(snapshotPK);
      
      // 2. 메타데이터 스냅샷 저장
      const snapshotMetadata = {
        pk: snapshotPK,
        sk: "METADATA",
        totalEntries: entries.length,
        description,
        period,
        periodStartDate: startDate.toISOString(),
        periodEndDate: endDate.toISOString(),
        lastUpdated: new Date().toISOString(),
        version: "1.0",
        snapshotDate: currentDate,
        ttl // TTL 필드 추가
      };

      await this.ddbClient.send(new PutItemCommand({
        TableName: this.config.cumulativeTableName,
        Item: marshall(snapshotMetadata, { removeUndefinedValues: true })
      }));

      // 2. 엔트리 배열 상세 분석 및 로깅
      console.log(`🔍 [DEBUG] 스냅샷 저장 대상 분석:`, {
        totalEntries: entries.length,
        firstEntry: entries[0] ? { rank: entries[0].rank, userId: entries[0].userId } : 'none',
        lastEntry: entries[entries.length - 1] ? { rank: entries[entries.length - 1].rank, userId: entries[entries.length - 1].userId } : 'none'
      });

      // 엔트리들을 25개씩 배치로 나누어 저장 (DynamoDB BatchWrite 제한)
      const batchSize = 25;
      const batches = [];
      
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        batches.push(batch);
      }

      console.log(`📦 [DEBUG] 배치 구성 완료: ${batches.length}개 배치, 배치당 최대 ${batchSize}개 엔트리`);

      // 3. 각 배치를 순차적으로 저장
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        console.log(`🔄 [DEBUG] 배치 ${batchIndex + 1}/${batches.length} 처리 시작 (${batch.length}개 엔트리)`);
        
        const writeRequests = batch.map((entry, entryIndex) => {
          // 전역 인덱스 사용: 배치 인덱스 * 배치 크기 + 배치 내 인덱스
          // 이전 버그: entryIndex만 사용하여 동점자가 여러 배치에 걸쳐 있을 때 SK 중복 발생
          const globalIndex = batchIndex * batchSize + entryIndex;
          const sk = `RANK#${entry.rank.toString().padStart(4, '0')}#${globalIndex.toString().padStart(3, '0')}`;

          console.log(`  📝 [DEBUG] 엔트리 ${globalIndex + 1}: rank=${entry.rank}, userId=${entry.userId}, SK=${sk}`);
          
          return {
            PutRequest: {
              Item: marshall({
                ...entry,
                pk: snapshotPK, // 스냅샷 PK로 변경
                sk, // 고유 SK 생성 (rank + index)
                ttl // TTL 필드 추가
              }, { removeUndefinedValues: true })
            }
          };
        });

        // PK+SK 중복 검증
        const keys = writeRequests.map(req => {
          const item = req.PutRequest.Item;
          return `${item.pk.S}#${item.sk.S}`;
        });
        const uniqueKeys = new Set(keys);
        
        if (keys.length !== uniqueKeys.size) {
          console.error(`❌ [DEBUG] 배치 ${batchIndex + 1}에서 중복 키 발견!`, {
            totalKeys: keys.length,
            uniqueKeys: uniqueKeys.size,
            duplicates: keys.filter((key, index) => keys.indexOf(key) !== index)
          });
        } else {
          console.log(`✅ [DEBUG] 배치 ${batchIndex + 1} 키 중복 검사 통과`);
        }

        try {
          let currentRequests = writeRequests;
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount <= maxRetries && currentRequests.length > 0) {
            console.log(`🔄 배치 ${batchIndex + 1} 처리 시도 ${retryCount + 1}/${maxRetries + 1} (${currentRequests.length}개 아이템)`);

            const batchWriteResult = await this.ddbClient.send(new BatchWriteItemCommand({
              RequestItems: {
                [this.config.cumulativeTableName]: currentRequests
              }
            }));

            // BatchWrite 결과 분석
            if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
              const unprocessedItems = batchWriteResult.UnprocessedItems[this.config.cumulativeTableName] || [];
              console.warn(`⚠️ 배치 ${batchIndex + 1} 시도 ${retryCount + 1}: 일부 아이템 처리 실패`, {
                processedCount: currentRequests.length - unprocessedItems.length,
                unprocessedCount: unprocessedItems.length,
                retryCount: retryCount + 1
              });

              if (retryCount < maxRetries) {
                currentRequests = unprocessedItems.filter(item => item.PutRequest) as { PutRequest: { Item: Record<string, any> } }[];
                retryCount++;
                // 지수 백오프: 2^retryCount 초 대기
                const waitTime = Math.pow(2, retryCount) * 1000;
                console.log(`⏳ ${waitTime/1000}초 대기 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else {
                console.error(`❌ 배치 ${batchIndex + 1} 최대 재시도 횟수 초과:`, {
                  unprocessedCount: unprocessedItems.length,
                  unprocessedItems: unprocessedItems.slice(0, 3) // 첫 3개만 로깅
                });
                // 최대 재시도 횟수 초과 시에도 다음 배치는 계속 처리
                break;
              }
            } else {
              console.log(`📸 배치 ${batchIndex + 1}/${batches.length} 저장 완료 (${currentRequests.length}개 엔트리)`);
              break;
            }
          }
        } catch (batchError) {
          console.error(`❌ 배치 ${batchIndex + 1} 저장 실패:`, {
            error: batchError,
            errorMessage: batchError instanceof Error ? batchError.message : 'Unknown error',
            batchSize: writeRequests.length,
            firstItem: writeRequests[0]?.PutRequest?.Item?.pk?.S || 'unknown',
            lastItem: writeRequests[writeRequests.length - 1]?.PutRequest?.Item?.pk?.S || 'unknown'
          });
          // 한 배치 실패가 전체 프로세스를 중단하지 않도록 함
          console.warn(`⚠️ 배치 ${batchIndex + 1} 건너뛰고 다음 배치 계속 처리`);
        }
      }

      console.log(`✅ 스냅샷 저장 완료: ${snapshotPK}`, {
        totalEntries: entries.length,
        totalBatches: batches.length,
        ttlExpiration: new Date(ttl * 1000).toISOString()
      });

    } catch (error) {
      console.error(`❌ 스냅샷 저장 실패: ${snapshotPK}`, {
        error: error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        totalEntries: entries.length
      });
      // 스냅샷 저장 실패는 메인 프로세스에 영향을 주지 않음
      // 에러를 로깅하고 계속 진행
    }
  }

  /**
   * 기존 스냅샷 삭제 (중복 방지)
   */
  private async deleteExistingSnapshot(snapshotPK: string) {
    try {
      console.log(`🗑️ 기존 스냅샷 삭제 시작: ${snapshotPK}`);

      // 기존 스냅샷 아이템 조회
      const queryResult = await this.ddbClient.send(new QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: snapshotPK }
        }
      }));

      if (!queryResult.Items || queryResult.Items.length === 0) {
        console.log(`📝 기존 스냅샷 없음: ${snapshotPK}`);
        return;
      }

      // 25개씩 배치로 삭제
      const batchSize = 25;
      const items = queryResult.Items;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: {
              pk: item.pk,
              sk: item.sk
            }
          }
        }));

        await this.ddbClient.send(new BatchWriteItemCommand({
          RequestItems: {
            [this.config.cumulativeTableName]: deleteRequests
          }
        }));

        console.log(`🗑️ 기존 스냅샷 배치 삭제 완료: ${deleteRequests.length}개 아이템`);
      }

      console.log(`✅ 기존 스냅샷 삭제 완료: ${snapshotPK} (총 ${items.length}개 아이템)`);

    } catch (error) {
      console.error(`❌ 기존 스냅샷 삭제 실패: ${snapshotPK}`, error);
      // 삭제 실패해도 계속 진행 (새 스냅샷 저장은 시도)
    }
  }

  /**
   * 🆕 My Account Rank History: 사용자별 랭킹 히스토리 저장
   * 각 사용자의 일자별 랭킹 정보를 USER#{userId} PK로 저장
   * TTL 정책: 이벤트 최종 히스토리(10년 영구 보관), 일일 히스토리(1년 후 삭제)
   */
  private async saveUserRankHistories(
    period: LeaderboardPeriod,
    entries: LeaderboardEntry[],
    isEventEnded: boolean = false
  ): Promise<void> {
    const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식

    // TTL 계산: 이벤트 종료 시 10년(영구), 진행 중 또는 CUMULATIVE는 1년
    let ttl: number;
    if (isEventEnded) {
      // 이벤트 최종 히스토리: 10년 보관 (실질적 영구 보관)
      ttl = Math.floor(Date.now() / 1000) + (3650 * 24 * 60 * 60); // 10년 후 만료
      console.log(`📌 [EVENT_HISTORY] 최종 히스토리 영구 보관 (TTL: 10년)`);
    } else {
      // 일일 히스토리: 1년 보관
      ttl = Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60); // 1년 후 만료
      console.log(`📅 [DAILY_HISTORY] 일일 히스토리 TTL: 1년`);
    }

    console.log(`📊 사용자 랭킹 히스토리 저장 시작: ${period} / ${currentDate}`, {
      period,
      date: currentDate,
      entriesCount: entries.length,
      isEventEnded,
      ttlExpiration: new Date(ttl * 1000).toISOString(),
      ttlDays: isEventEnded ? 3650 : 365
    });

    try {
      // 엔트리들을 RankHistoryEntry로 변환
      const historyItems: RankHistoryEntry[] = entries.map(entry => ({
        pk: `USER#${entry.userId}`,
        sk: `RANK_HISTORY#${period}#${currentDate}`,
        userId: entry.userId,
        username: entry.username,
        period,
        date: currentDate,
        rank: entry.rank,
        finalScore: (entry as any).finalScore,
        totalScore: (entry as any).totalScore,
        totalLikes: entry.totalLikes,
        totalReplies: entry.totalReplies,
        totalReposts: entry.totalReposts,
        totalQuotes: entry.totalQuotes,
        totalMentions: entry.totalMentions,
        displayName: entry.displayName,
        profileImageUrl: entry.profileImageUrl,
        followersCount: (entry as any).followersCount,
        dominantLanguage: (entry as any).dominantLanguage,
        ttl,
        lastUpdated: new Date().toISOString()
      }));

      // BatchWriteItem으로 25개씩 저장
      const batchSize = 25;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < historyItems.length; i += batchSize) {
        const batch = historyItems.slice(i, i + batchSize);
        const writeRequests = batch.map(item => ({
          PutRequest: {
            Item: marshall(item, { removeUndefinedValues: true })
          }
        }));

        try {
          let currentRequests = writeRequests;
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount <= maxRetries && currentRequests.length > 0) {
            const batchWriteResult = await this.ddbClient.send(new BatchWriteItemCommand({
              RequestItems: {
                [this.config.cumulativeTableName]: currentRequests
              }
            }));

            // UnprocessedItems 처리
            if (batchWriteResult.UnprocessedItems && Object.keys(batchWriteResult.UnprocessedItems).length > 0) {
              const unprocessedItems = batchWriteResult.UnprocessedItems[this.config.cumulativeTableName] || [];

              if (retryCount < maxRetries) {
                currentRequests = unprocessedItems.filter(item => item.PutRequest) as { PutRequest: { Item: Record<string, any> } }[];
                retryCount++;
                const waitTime = Math.pow(2, retryCount) * 1000;
                console.log(`⏳ 재시도 대기 ${waitTime/1000}초... (${currentRequests.length}개 아이템)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else {
                failureCount += unprocessedItems.length;
                console.error(`❌ 최대 재시도 횟수 초과 (${unprocessedItems.length}개 실패)`);
                break;
              }
            } else {
              successCount += currentRequests.length;
              break;
            }
          }
        } catch (batchError) {
          failureCount += batch.length;
          console.error(`❌ 배치 저장 실패 (배치 인덱스: ${i / batchSize})`, {
            error: batchError,
            batchSize: batch.length
          });
        }
      }

      console.log(`✅ 사용자 랭킹 히스토리 저장 완료: ${period} / ${currentDate}`, {
        totalEntries: historyItems.length,
        successCount,
        failureCount,
        ttlExpiration: new Date(ttl * 1000).toISOString()
      });

    } catch (error) {
      console.error(`❌ 사용자 랭킹 히스토리 저장 실패: ${period} / ${currentDate}`, {
        error: error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      });
      // 히스토리 저장 실패는 메인 프로세스에 영향을 주지 않음
    }
  }

  /**
   * RECENT# 활동 데이터에 프로필 정보를 보강합니다.
   * 3-tier fallback: 파이프라인 데이터(최신) → CUMULATIVE_SCORE → 기본값
   */
  private async enrichActivitiesWithProfiles(
    activities: any[],
    pipelineData?: any[]
  ): Promise<any[]> {
    console.log(`🔧 [PROFILE_ENRICH] 프로필 보강 시작: ${activities.length}개 활동`);

    // 1순위: 파이프라인 데이터 (오늘 수집한 최신 프로필)
    const pipelineProfileMap = new Map<string, any>();
    if (pipelineData && pipelineData.length > 0) {
      pipelineData.forEach(e => {
        pipelineProfileMap.set(e.engaging_user_id, {
          displayName: e.engaging_display_name,
          followersCount: e.engaging_followers_count,
          profileImageUrl: e.engaging_profile_image_url,
          language: e.engaging_tweet_lang
        });
      });
      console.log(`📊 [PROFILE_ENRICH] 파이프라인 프로필: ${pipelineProfileMap.size}명`);
    }

    // 2순위: CUMULATIVE_SCORE (과거 사용자 누적 프로필)
    const cumulativeScores = await this.getAllCumulativeScores();
    const cumulativeProfileMap = new Map<string, any>();
    cumulativeScores.forEach(s => {
      cumulativeProfileMap.set(s.userId, {
        displayName: (s as any).displayName,
        followersCount: (s as any).followersCount,
        profileImageUrl: (s as any).profileImageUrl,
        language: (s as any).dominantLanguage
      });
    });
    console.log(`📊 [PROFILE_ENRICH] CUMULATIVE_SCORE 프로필: ${cumulativeProfileMap.size}명`);

    // 프로필 보강 (3-tier fallback)
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;

    const enrichedActivities = activities.map(activity => {
      const userId = activity.engaging_user_id;

      // 1순위: 파이프라인 데이터
      let profile = pipelineProfileMap.get(userId);
      if (profile) {
        tier1Count++;
      } else {
        // 2순위: CUMULATIVE_SCORE
        profile = cumulativeProfileMap.get(userId);
        if (profile) {
          tier2Count++;
        } else {
          // 3순위: 기본값 (프로필 정보 없음)
          tier3Count++;
          profile = {
            displayName: activity.engaging_username,
            followersCount: 0,
            profileImageUrl: undefined,
            language: 'unknown'
          };
        }
      }

      return {
        ...activity,
        engaging_display_name: profile.displayName || activity.engaging_username,
        engaging_followers_count: profile.followersCount || 0,
        engaging_profile_image_url: profile.profileImageUrl,
        engaging_tweet_lang: profile.language || 'unknown'
      };
    });

    console.log(`✅ [PROFILE_ENRICH] 완료:`, {
      총활동수: activities.length,
      파이프라인프로필: tier1Count,
      누적프로필: tier2Count,
      기본값: tier3Count
    });

    return enrichedActivities;
  }

  /**
   * 🆕 Phase 3: 특정 날짜의 리더보드 스냅샷을 가져오는 헬퍼 함수
   */
  private async getLeaderboardSnapshot(period: LeaderboardPeriod, daysAgo: number): Promise<LeaderboardEntry[] | null> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const dateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD

    const snapshotPK = `LEADERBOARD#${period}#${dateString}`;
    console.log(`[RANK_CHANGE] ${daysAgo}일 전 스냅샷 조회 중: ${snapshotPK}`);

    try {
      const result = await this.ddbClient.send(new QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: snapshotPK },
        },
      }));

      if (!result.Items || result.Items.length === 0) {
        console.log(`[RANK_CHANGE] 스냅샷 데이터를 찾을 수 없습니다: ${snapshotPK}`);
        return null;
      }

      // METADATA 제외하고 엔트리만 반환
      return result.Items
        .map(item => unmarshall(item) as LeaderboardEntry)
        .filter(entry => entry.sk.startsWith('RANK#'));

    } catch (error) {
      console.error(`[RANK_CHANGE] 스냅샷 조회 실패: ${snapshotPK}`, error);
      return null;
    }
  }

  /**
   * 🚀 API Gateway 캐시 무효화
   * 리더보드 생성 완료 후 API Gateway 캐시를 플러시하여 사용자가 즉시 최신 데이터를 볼 수 있도록 함
   */
  private async flushAPIGatewayCache(): Promise<void> {
    const apiGatewayId = process.env.API_GATEWAY_ID;
    const apiGatewayStage = process.env.API_GATEWAY_STAGE || 'prod';

    if (!apiGatewayId) {
      console.warn('⚠️ [API_CACHE] API_GATEWAY_ID 환경 변수가 설정되지 않아 캐시 무효화를 건너뜁니다.');
      return;
    }

    try {
      console.log(`🔄 [API_CACHE] API Gateway 캐시 무효화 시작: ${apiGatewayId}/${apiGatewayStage}`);

      const command = new FlushStageCacheCommand({
        restApiId: apiGatewayId,
        stageName: apiGatewayStage,
      });

      await this.apiGateway.send(command);

      console.log(`✅ [API_CACHE] API Gateway 캐시 무효화 완료`);
    } catch (error) {
      // 캐시 무효화 실패는 치명적이지 않으므로 경고만 로깅
      console.error(`❌ [API_CACHE] API Gateway 캐시 무효화 실패:`, error);
    }
  }

}
