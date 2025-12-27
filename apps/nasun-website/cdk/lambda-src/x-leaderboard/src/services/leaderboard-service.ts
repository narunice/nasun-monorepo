import { DynamoDBClient, QueryCommand, PutItemCommand, DeleteItemCommand, ScanCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { EnvConfigV2 } from "../utils/env";
import {
  LeaderboardEntry,
  LeaderboardPeriod,
  CumulativeLeaderboardData,
  LeaderboardMetadata,
  getEventPeriodConfigs,
  UserRankData,
  SearchMatch,
  SearchResultData,
  RankHistoryEntry
} from "../types/leaderboard";
import { LanguageCode } from "../types/community";
import { AccountFilterService } from "./account-filter-service";

export class LeaderboardService {
  private ddbClient: DynamoDBClient;
  private config: EnvConfigV2;
  private accountFilterService: AccountFilterService;

  constructor(ddbClient: DynamoDBClient, config: EnvConfigV2) {
    this.ddbClient = ddbClient;
    this.config = config;
    this.accountFilterService = new AccountFilterService();
  }

  async getLeaderboard(
    period: LeaderboardPeriod,
    page: number = 1,
    limit: number = 50,
    date?: string
  ): Promise<{ success: boolean; data?: CumulativeLeaderboardData; error?: string }> {
    console.log("리더보드 데이터 조회 시작", { period, page, limit, date });

    try {
      // pk 결정: 이벤트 종료 여부 확인
      let pk: string;
      if (date) {
        // 명시적 날짜가 제공된 경우
        pk = `LEADERBOARD#${period}#${date}`;
      } else if (this.isEventEnded(period)) {
        // 이벤트가 종료된 경우, 최신 스냅샷 날짜 조회
        const snapshotDate = await this.getLatestSnapshotDate(period);
        if (snapshotDate) {
          console.log(`📸 [getLeaderboard] 이벤트 종료됨, 스냅샷 사용: ${snapshotDate}`);
          pk = `LEADERBOARD#${period}#${snapshotDate}`;
        } else {
          console.log('⚠️ [getLeaderboard] 스냅샷을 찾을 수 없음, 현재 리더보드 사용');
          pk = `LEADERBOARD#${period}`;
        }
      } else {
        // 진행 중인 이벤트 또는 CUMULATIVE
        pk = `LEADERBOARD#${period}`;
      }

      // 1. 메타데이터 조회
      const metadataResult = await this.ddbClient.send(new GetItemCommand({
        TableName: this.config.cumulativeTableName,
        Key: {
          pk: { S: pk },
          sk: { S: "METADATA" },
        },
      }));

      // 🔧 [BUGFIX 2025-10-16] DB 메타데이터가 없어도 환경변수 기반으로 빈 데이터 생성
      // 이벤트가 아직 시작하지 않아 리더보드가 생성되지 않았어도 프론트엔드에 날짜 정보 제공
      if (!metadataResult.Item) {
        console.warn("메타데이터를 찾을 수 없습니다. 환경변수 기반 빈 메타데이터 생성", { pk, period });
        const eventPeriodConfigs = getEventPeriodConfigs();
        const periodConfig = eventPeriodConfigs[period];
        return { success: true, data: this.getEmptyLeaderboardDataWithDates(period, periodConfig) };
      }

      const metadata = unmarshall(metadataResult.Item) as LeaderboardMetadata;
      console.log('🔍 [DEBUG] Unmarshalled metadata:', JSON.stringify(metadata, null, 2));
      const totalEntries = metadata.totalEntries || 0;
      const totalPages = Math.ceil(totalEntries / limit);

      // 2. 리더보드 엔트리 조회 (페이지네이션)
      const entries = await this.getLeaderboardEntries(pk, page, limit);

      // 3. 사용자 정보 보강 (필요 시)
      const enrichedEntries = await this.enrichLeaderboardEntries(entries);

      // 4. 계정 필터링 적용
      const { filteredEntries, stats } = this.accountFilterService.filterV1LeaderboardEntries(enrichedEntries);
      console.log(`계정 필터링 결과: ${stats.excludedAccountsCount}개 계정 제외`);

      const eventPeriodConfigs = getEventPeriodConfigs();
      const periodConfig = eventPeriodConfigs[period as LeaderboardPeriod];

      const responseData: CumulativeLeaderboardData = {
        entries: filteredEntries as any[],
        pagination: {
          page,
          limit,
          total: totalEntries,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        metadata: {
          totalUsers: totalEntries,
          totalEntries: totalEntries,  // 🆕 totalEntries 필드 추가 (프론트엔드 호환성)
          systemVersion: "v2",
          dataStartDate: new Date().toISOString(),
          lastUpdated: metadata.lastUpdated || new Date().toISOString(),
          description: periodConfig?.description || metadata.description || "",
          period: metadata.period as any,
          // 🚨 [BUGFIX] 항상 최신 환경 변수 값을 사용하도록 날짜를 덮어씁니다.
          periodStartDate: periodConfig?.startDate,
          periodEndDate: periodConfig?.endDate,
        },
      };

      return { success: true, data: responseData };
    } catch (error) {
      console.error("리더보드 조회 실패:", error);
      return { success: false, error: "리더보드 데이터를 가져오는 데 실패했습니다." };
    }
  }

  private async getLeaderboardEntries(pk: string, page: number, limit: number): Promise<LeaderboardEntry[]> {
    const command = new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: pk },
        ":sk_prefix": { S: "RANK#" },
      },
      Limit: page * limit, // 페이지의 끝까지 모든 항목을 가져옴
      ScanIndexForward: true, // 랭킹 순으로 정렬
    });

    const result = await this.ddbClient.send(command);
    const items = result.Items ? result.Items.map(item => unmarshall(item)) : [];

    // 요청된 페이지에 해당하는 부분만 잘라냄
    const startIndex = (page - 1) * limit;
    const pageItems = items.slice(startIndex, startIndex + limit);

    // 마지막 항목과 동점자 처리
    if (pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      const lastScore = lastItem.totalScore;

      // 현재 페이지의 마지막 항목 점수와 같은 다음 항목들을 모두 가져옴
      for (let i = startIndex + limit; i < items.length; i++) {
        if (items[i].totalScore === lastScore) {
          pageItems.push(items[i]);
        } else {
          break;
        }
      }
    }
    
    return pageItems as LeaderboardEntry[];
  }

  private async enrichLeaderboardEntries(entries: LeaderboardEntry[]): Promise<any[]> {
    return entries.map(entry => {
      return {
        ...entry,
        language: (entry as any).dominantLanguage || 'unknown',
        totalScore: entry.totalScore || 0,
        totalActivities: (entry.totalLikes || 0) + (entry.totalReplies || 0) + (entry.totalReposts || 0) + (entry.totalQuotes || 0) + (entry.totalMentions || 0),
        breakdown: {
          totalLikes: entry.totalLikes || 0,
          totalReplies: entry.totalReplies || 0,
          totalReposts: entry.totalReposts || 0,
          totalQuotes: entry.totalQuotes || 0,
          totalMentions: entry.totalMentions || 0,
        },
        xUrl: `https://twitter.com/${entry.username}`,
      };
    });
  }

  private getEmptyLeaderboardData(period: LeaderboardPeriod): CumulativeLeaderboardData {
    return {
      entries: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      metadata: {
        totalUsers: 0,
        systemVersion: "v2",
        dataStartDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        description: "",
        period: period as any,
        periodStartDate: "",
        periodEndDate: "",
      },
    };
  }

  /**
   * 🆕 [BUGFIX 2025-10-16] DB 메타데이터가 없을 때 환경변수 기반으로 날짜 정보를 포함한 빈 리더보드 데이터 생성
   * 이벤트가 시작하지 않아 리더보드가 아직 생성되지 않았어도, 프론트엔드에서 이벤트 기간 날짜를 표시할 수 있도록 함
   *
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param periodConfig - 환경변수에서 가져온 이벤트 기간 설정 (null이면 CUMULATIVE)
   * @returns 날짜 정보가 포함된 빈 리더보드 데이터
   */
  private getEmptyLeaderboardDataWithDates(
    period: LeaderboardPeriod,
    periodConfig: { startDate: string; endDate: string; description: string } | null
  ): CumulativeLeaderboardData {
    return {
      entries: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      metadata: {
        totalUsers: 0,
        systemVersion: "v2",
        dataStartDate: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        description: periodConfig?.description || "누적 리더보드",
        period: period as any,
        // 🎯 핵심: 환경변수 기반 날짜 정보 주입
        periodStartDate: periodConfig?.startDate || "",
        periodEndDate: periodConfig?.endDate || "",
      },
    };
  }
  
  async getUserActivityDates(userId: string): Promise<string[]> {
    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `USER#${userId}` },
        ":sk_prefix": { S: "RECENT#" },
      },
      ProjectionExpression: "sk, tweet_created_at",
    }));

    if (!result.Items) {
      return [];
    }

    const dates = result.Items.map(item => {
      const activity = unmarshall(item);
      return new Date(activity.tweet_created_at).toISOString().split('T')[0];
    });

    return [...new Set(dates)];
  }

  async getUnprocessedEngagements(userId: string): Promise<any[]> {
    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
      FilterExpression: "attribute_not_exists(is_processed) OR is_processed = :false",
      ExpressionAttributeValues: {
        ":pk": { S: `USER#${userId}` },
        ":skPrefix": { S: "RECENT#" },
        ":false": { BOOL: false },
      },
      ProjectionExpression: "sk, tweet_id, engagement_type, engaging_user_id, engaging_username, tweet_created_at, added_at",
    }));

    return result.Items ? result.Items.map(item => unmarshall(item)) : [];
  }

  // 누락된 메서드들 추가
  async getEventPeriodLeaderboard(
    period: LeaderboardPeriod,
    page: number = 1,
    limit: number = 50
  ): Promise<{ success: boolean; data?: CumulativeLeaderboardData; error?: string }> {
    return await this.getLeaderboard(period, page, limit);
  }

  async getLeaderboardSnapshot(
    period: LeaderboardPeriod,
    date: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ success: boolean; data?: CumulativeLeaderboardData; error?: string }> {
    return await this.getLeaderboard(period, page, limit, date);
  }

  /**
   * 이벤트가 종료되었는지 확인
   * @param period 리더보드 기간
   * @returns 이벤트 종료 여부
   */
  isEventEnded(period: LeaderboardPeriod): boolean {
    if (period === LeaderboardPeriod.CUMULATIVE) {
      return false; // 누적 리더보드는 종료 없음
    }

    const endDate = this.getEventEndDate(period);
    if (!endDate) {
      return false;
    }

    const today = new Date().toISOString().split('T')[0];
    return today > endDate;
  }

  /**
   * 이벤트 종료일 조회
   * @param period 리더보드 기간
   * @returns 이벤트 종료일 (YYYY-MM-DD) 또는 null
   */
  getEventEndDate(period: LeaderboardPeriod): string | null {
    if (period === LeaderboardPeriod.EVENT1) {
      return this.config.event1EndDate;
    }
    if (period === LeaderboardPeriod.EVENT2) {
      return this.config.event2EndDate;
    }
    return null;
  }

  /**
   * 🆕 Phase 1 BUG FIX: 특정 기간의 최신 스냅샷 날짜 조회
   *
   * @description
   * 이벤트가 종료되어 현재 리더보드가 비어있을 때 최신 스냅샷 날짜를 찾습니다.
   * 스냅샷은 pk가 "LEADERBOARD#{PERIOD}#{DATE}" 형식으로 저장됩니다.
   *
   * @param period - 리더보드 기간
   * @returns 최신 스냅샷 날짜 (YYYY-MM-DD) 또는 null
   */
  private async getLatestSnapshotDate(period: LeaderboardPeriod): Promise<string | null> {
    try {
      // 환경 변수에서 이벤트 종료 날짜 가져오기 (이벤트가 종료된 경우)
      const eventEndDate = this.getEventEndDate(period);

      if (eventEndDate) {
        console.log(`🔍 [getLatestSnapshotDate] 환경 변수에서 이벤트 종료 날짜 발견: ${eventEndDate}, DynamoDB 검증 중...`);

        // 🆕 DynamoDB에서 스냅샷 존재 여부 검증
        const pk = `LEADERBOARD#${period}#${eventEndDate}`;
        const validationCommand = new GetItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: { S: pk },
            sk: { S: 'METADATA' }
          }
        });

        const validationResult = await this.ddbClient.send(validationCommand);
        if (validationResult.Item) {
          console.log(`✅ [getLatestSnapshotDate] 환경 변수 날짜의 스냅샷 존재 확인: ${eventEndDate}`);
          return eventEndDate;
        } else {
          console.log(`⚠️ [getLatestSnapshotDate] 환경 변수 날짜(${eventEndDate})의 스냅샷이 존재하지 않음, fallback으로 전환`);
          // fallback 로직으로 계속 진행
        }
      }

      // 환경 변수에 없으면 Scan으로 검색 (비효율적이지만 fallback)
      // 🆕 이벤트 시작일부터 오늘까지 역순으로 확인
      const today = new Date();

      // 이벤트 시작일 결정
      let startDate: Date;
      if (period === LeaderboardPeriod.EVENT1 && this.config.event1StartDate) {
        startDate = new Date(this.config.event1StartDate);
      } else if (period === LeaderboardPeriod.EVENT2 && this.config.event2StartDate) {
        startDate = new Date(this.config.event2StartDate);
      } else {
        // 기본값: 30일 전
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 30);
      }

      const daysDiff = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const maxDays = Math.min(daysDiff + 1, 90); // 최대 90일로 제한

      console.log(`🔍 [getLatestSnapshotDate] 스캔 범위: ${startDate.toISOString().split('T')[0]} ~ ${today.toISOString().split('T')[0]} (${maxDays}일)`);

      for (let i = 0; i < maxDays; i++) {
        const testDate = new Date(today);
        testDate.setDate(testDate.getDate() - i);
        const dateStr = testDate.toISOString().split('T')[0]; // YYYY-MM-DD

        // 시작일보다 이전이면 중단
        if (testDate < startDate) {
          console.log(`⚠️ [getLatestSnapshotDate] 시작일(${startDate.toISOString().split('T')[0]}) 도달, 스캔 중단`);
          break;
        }

        const pk = `LEADERBOARD#${period}#${dateStr}`;
        const command = new GetItemCommand({
          TableName: this.config.cumulativeTableName,
          Key: {
            pk: { S: pk },
            sk: { S: 'METADATA' }
          }
        });

        const result = await this.ddbClient.send(command);
        if (result.Item) {
          console.log(`✅ [getLatestSnapshotDate] 스냅샷 발견: ${dateStr}`);
          return dateStr;
        }
      }

      console.log('⚠️ [getLatestSnapshotDate] 최신 스냅샷을 찾을 수 없음');
      return null;
    } catch (error) {
      console.error('❌ [getLatestSnapshotDate] 에러:', error);
      return null;
    }
  }

  /**
   * 🆕 Phase 1: 특정 사용자의 랭킹 정보 조회
   *
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param username - 검색할 트위터 핸들 (대소문자 무관, @ 기호 자동 제거)
   * @param date - 옵션: 특정 날짜의 스냅샷 조회 (YYYY-MM-DD)
   * @param limit - 페이지당 항목 수 (기본값: 50)
   * @returns UserRankData 또는 null (사용자를 찾을 수 없는 경우)
   */
  async getUserRank(
    period: LeaderboardPeriod,
    username: string,
    date?: string,
    limit: number = 50
  ): Promise<UserRankData | null> {
    console.log('🔍 [getUserRank] 사용자 랭킹 조회 시작', { period, username, date });

    try {
      // 1. 사용자명 정규화 (@ 제거만, 대소문자 유지)
      const normalizedUsername = username.replace(/^@/, '');

      // 2. GSI를 사용하여 username으로 검색
      // Note: period는 항상 'CUMULATIVE', 'EVENT1', 'EVENT2' 값만 저장됨 (날짜 정보 없음)
      // 날짜별 구분은 pk 필터링으로 수행 (line 338-342)
      const command = new QueryCommand({
        TableName: this.config.cumulativeTableName,
        IndexName: 'username-period-index',
        KeyConditionExpression: 'username = :username AND period = :period',
        ExpressionAttributeValues: {
          ':username': { S: normalizedUsername },
          ':period': { S: period }  // 날짜 관계없이 항상 period만 사용
        }
      });

      const result = await this.ddbClient.send(command);

      if (!result.Items || result.Items.length === 0) {
        console.log('🚫 [getUserRank] 사용자를 찾을 수 없음', { normalizedUsername, period });
        return null;
      }

      // 3. 올바른 항목 찾기: pk가 LEADERBOARD#<period>인 항목 (스냅샷 제외)
      let targetPk: string;
      if (date) {
        // 명시적 날짜가 제공된 경우
        targetPk = `LEADERBOARD#${period}#${date}`;
      } else if (this.isEventEnded(period)) {
        // 이벤트가 종료된 경우, 최신 스냅샷 날짜 조회
        const snapshotDate = await this.getLatestSnapshotDate(period);
        if (snapshotDate) {
          console.log(`📸 [getUserRank] 이벤트 종료됨, 스냅샷 사용: ${snapshotDate}`);
          targetPk = `LEADERBOARD#${period}#${snapshotDate}`;
        } else {
          console.log('⚠️ [getUserRank] 스냅샷을 찾을 수 없음, 현재 리더보드 사용');
          targetPk = `LEADERBOARD#${period}`;
        }
      } else {
        // 진행 중인 이벤트 또는 CUMULATIVE
        targetPk = `LEADERBOARD#${period}`;
      }

      const validItems = result.Items.filter(item => {
        const pk = item.pk?.S || '';
        return pk === targetPk;
      });

      if (validItems.length === 0) {
        console.log('🚫 [getUserRank] 유효한 항목을 찾을 수 없음', { normalizedUsername, period, itemsCount: result.Items.length });
        return null;
      }

      // 첫 번째 유효한 항목을 사용자 엔트리로 변환
      const userEntry = unmarshall(validItems[0]) as LeaderboardEntry;
      console.log('✅ [getUserRank] 유효한 항목 발견', { username: userEntry.username, rank: userEntry.rank, pk: validItems[0].pk?.S, sk: validItems[0].sk?.S });

      // 4. 메타데이터 조회 (총 사용자 수)
      // targetPk를 재사용 (이미 이벤트 종료 여부에 따라 스냅샷 날짜가 반영됨)
      const metadataResult = await this.ddbClient.send(new GetItemCommand({
        TableName: this.config.cumulativeTableName,
        Key: {
          pk: { S: targetPk },
          sk: { S: 'METADATA' }
        }
      }));

      const metadata = metadataResult.Item ? unmarshall(metadataResult.Item) as LeaderboardMetadata : null;
      const totalUsers = metadata?.totalEntries || 0;

      // 5. 페이지 번호 계산 (rank 기반)
      const page = Math.ceil(userEntry.rank / limit);

      // 6. UserRankData 생성
      const userRankData: UserRankData = {
        username: userEntry.username,
        rank: userEntry.rank,
        totalScore: userEntry.totalScore,
        totalUsers,
        page,
        entry: userEntry
      };

      console.log('✅ [getUserRank] 사용자 랭킹 조회 성공', userRankData);
      return userRankData;

    } catch (error) {
      console.error('❌ [getUserRank] 사용자 랭킹 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 🆕 Phase 1: 사용자 검색 (하이브리드 검색: 정확히 일치 우선 → 부분 일치 폴백)
   *
   * @param period - 리더보드 기간
   * @param query - 검색 쿼리 (@ 기호 자동 제거, 대소문자 무관)
   * @param date - 옵션: 특정 날짜의 스냅샷 검색
   * @param maxResults - 최대 결과 수 (기본값: 10)
   * @returns SearchResultData (정확히 일치하는 항목 + 부분 일치 항목들)
   */
  async searchUsers(
    period: LeaderboardPeriod,
    query: string,
    date?: string,
    maxResults: number = 10
  ): Promise<SearchResultData> {
    console.log('🔍 [searchUsers] 사용자 검색 시작', { period, query, date, maxResults });

    try {
      // 1. 쿼리 정규화
      const normalizedQuery = query.replace(/^@/, '').toLowerCase().trim();

      if (normalizedQuery.length === 0) {
        return { matches: [], exactMatch: null, total: 0 };
      }

      // 2. 전체 리더보드 엔트리 조회 (정확히 일치 검색을 위해)
      let pk = date ? `LEADERBOARD#${period}#${date}` : `LEADERBOARD#${period}`;

      const command = new QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
        ExpressionAttributeValues: {
          ':pk': { S: pk },
          ':sk_prefix': { S: 'RANK#' }
        },
        ScanIndexForward: true // 랭킹 순으로 정렬
      });

      let result = await this.ddbClient.send(command);
      let allEntries = result.Items ? result.Items.map(item => unmarshall(item) as LeaderboardEntry) : [];

      // 🆕 Phase 1 BUG FIX: 현재 리더보드가 비어있으면 최신 스냅샷으로 폴백
      if (allEntries.length === 0 && !date) {
        console.log('⚠️ [searchUsers] 현재 리더보드가 비어있음 - 최신 스냅샷 검색 시도');
        const latestSnapshot = await this.getLatestSnapshotDate(period);

        if (latestSnapshot) {
          console.log(`✅ [searchUsers] 최신 스냅샷 발견: ${latestSnapshot}`);
          pk = `LEADERBOARD#${period}#${latestSnapshot}`;

          const snapshotCommand = new QueryCommand({
            TableName: this.config.cumulativeTableName,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
            ExpressionAttributeValues: {
              ':pk': { S: pk },
              ':sk_prefix': { S: 'RANK#' }
            },
            ScanIndexForward: true
          });

          result = await this.ddbClient.send(snapshotCommand);
          allEntries = result.Items ? result.Items.map(item => unmarshall(item) as LeaderboardEntry) : [];
        }
      }

      // 3. 정확히 일치하는 항목 찾기
      const exactMatch = allEntries.find(entry =>
        entry.username.toLowerCase() === normalizedQuery
      );

      // 4. 부분 일치 항목 찾기 (정확히 일치 제외)
      const partialMatches = allEntries.filter(entry => {
        const username = entry.username.toLowerCase();
        return username !== normalizedQuery && username.includes(normalizedQuery);
      });

      // 5. SearchMatch 형식으로 변환
      const toSearchMatch = (entry: LeaderboardEntry): SearchMatch => ({
        username: entry.username,
        rank: entry.rank,
        totalScore: entry.totalScore,
        displayName: entry.displayName,
        profileImageUrl: entry.profileImageUrl
      });

      // 6. 결과 조합 (정확히 일치 우선, 그 다음 부분 일치)
      const matches: SearchMatch[] = [];

      if (exactMatch) {
        matches.push(toSearchMatch(exactMatch));
      }

      // 부분 일치 항목 추가 (maxResults 제한)
      const remainingSlots = maxResults - matches.length;
      partialMatches.slice(0, remainingSlots).forEach(entry => {
        matches.push(toSearchMatch(entry));
      });

      const searchResult: SearchResultData = {
        matches,
        exactMatch: exactMatch ? toSearchMatch(exactMatch) : null,
        total: matches.length
      };

      console.log('✅ [searchUsers] 검색 완료', {
        query: normalizedQuery,
        exactMatch: !!exactMatch,
        partialMatches: partialMatches.length,
        totalResults: matches.length
      });

      return searchResult;

    } catch (error) {
      console.error('❌ [searchUsers] 검색 실패:', error);
      throw error;
    }
  }

  /**
   * 🆕 My Account Rank History: 특정 사용자의 랭킹 히스토리 조회
   *
   * @param userId - 사용자 ID
   * @param period - 리더보드 기간 (CUMULATIVE, EVENT1, EVENT2)
   * @param startDate - 시작 날짜 (YYYY-MM-DD)
   * @param endDate - 종료 날짜 (YYYY-MM-DD)
   * @returns RankHistoryEntry[] (날짜 오름차순 정렬)
   */
  async getUserRankHistory(
    userId: string,
    period: LeaderboardPeriod,
    startDate: string,
    endDate: string
  ): Promise<RankHistoryEntry[]> {
    console.log('📊 [getUserRankHistory] 랭킹 히스토리 조회 시작', { userId, period, startDate, endDate });

    try {
      // DynamoDB Query with BETWEEN
      const command = new QueryCommand({
        TableName: this.config.cumulativeTableName,
        KeyConditionExpression: 'pk = :pk AND sk BETWEEN :startSk AND :endSk',
        ExpressionAttributeValues: {
          ':pk': { S: `USER#${userId}` },
          ':startSk': { S: `RANK_HISTORY#${period}#${startDate}` },
          ':endSk': { S: `RANK_HISTORY#${period}#${endDate}` }
        },
        ScanIndexForward: true // 날짜 오름차순 정렬
      });

      const result = await this.ddbClient.send(command);

      if (!result.Items || result.Items.length === 0) {
        console.log('📭 [getUserRankHistory] 히스토리 데이터 없음', { userId, period });
        return [];
      }

      const history = result.Items.map(item => unmarshall(item) as RankHistoryEntry);

      console.log('✅ [getUserRankHistory] 히스토리 조회 완료', {
        userId,
        period,
        count: history.length,
        dateRange: `${history[0]?.date} ~ ${history[history.length - 1]?.date}`
      });

      return history;

    } catch (error) {
      console.error('❌ [getUserRankHistory] 히스토리 조회 실패:', error);
      throw error;
    }
  }
}
