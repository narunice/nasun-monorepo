import { DynamoDBClient, QueryCommand, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { EnvConfigV2 } from "../utils/env";
import { LeaderboardEntry, LeaderboardMetadata, LeaderboardPeriod } from "../types/leaderboard";
import { CumulativeLeaderboardEntry } from "../types/cumulative";
import { getAccountFilterService } from "./account-filter-service";
import { ExclusionScope } from "../types/excluded-accounts-types";

interface LeaderboardQuery {
  period: string;
  page: number;
  limit: number;
  date?: string;
}

interface LeaderboardResponse {
  entries: Array<{
    rank: number;
    userId: string;
    username: string;
    displayName?: string;
    profileImageUrl?: string;
    totalScore: number;
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes: number;
    lastUpdated: string;
    xUrl: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  metadata: {
    totalUsers: number;
    systemVersion: string;
    dataStartDate: string;
    lastUpdated: string;
    period: string;
    periodStartDate: string;
    periodEndDate: string;
    periodDescription?: string;
  };
}

interface UserProfile {
  pk: string;
  sk: string;
  userId: string;
  username: string;
  displayName: string;
  profileImageUrl: string;
  description?: string;
  lastUpdated: string;
}

export class CumulativeLeaderboardService {
  constructor(
    private ddbClient: DynamoDBClient,
    private config: EnvConfigV2
  ) {}

  async getLeaderboard(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const { period, page, limit, date } = query;
    
    console.log("🔍 리더보드 조회 시작:", query);

    // 1. 기간을 DynamoDB 파티션 키로 변환
    const periodKey = this.getPeriodKey(period);
    
    // 2. 메타데이터 조회
    const metadata = await this.getLeaderboardMetadata(periodKey);
    
    // 3. 페이지네이션 계산 (제외 계정으로 인한 필터링 고려)
    const offset = (page - 1) * limit;
    
    // 4. 리더보드 엔트리 조회 (더 많이 조회해서 필터링 후 페이지네이션)
    const extraBuffer = 50; // 제외 계정을 고려한 추가 버퍼
    const entries = await this.getLeaderboardEntries(periodKey, limit + extraBuffer, offset);
    
    // 5. 제외 계정 필터링 적용 (Phase 2 소프트 제외)
    const accountFilterService = getAccountFilterService();
    const { filteredEntries, stats } = accountFilterService.filterV2CumulativeEntries(
      entries as any, 
      ExclusionScope.DISPLAY
    );
    
    // 6. 필터링 후 정확한 페이지네이션 적용
    const finalEntries = filteredEntries.slice(0, limit);
    
    // 7. 사용자 프로필 정보 배치 조회
    const enrichedEntries = await this.enrichWithProfiles(finalEntries as any);
    
    // 8. 제외 계정 로그 출력
    if (stats.excludedAccountsCount > 0) {
      console.log(`🚫 리더보드에서 ${stats.excludedAccountsCount}개 계정 제외:`, 
        stats.excludedAccounts.map(acc => `@${acc.username} (${acc.reason})`));
    }
    
    // 9. 응답 구성 (제외 계정 필터링 반영)
    const adjustedTotal = metadata.totalEntries - stats.excludedAccountsCount;
    const response: LeaderboardResponse = {
      entries: enrichedEntries,
      pagination: {
        page,
        limit,
        total: adjustedTotal,
        hasNext: offset + limit < adjustedTotal,
        hasPrev: page > 1
      },
      metadata: {
        totalUsers: metadata.totalEntries,
        systemVersion: "v2",
        dataStartDate: metadata.periodStartDate || `${this.config.systemStartDate}T00:00:00.000Z`,
        lastUpdated: metadata.lastUpdated,
        period: period,
        periodStartDate: metadata.periodStartDate || `${this.config.systemStartDate}T00:00:00.000Z`,
        periodEndDate: metadata.periodEndDate || new Date().toISOString(),
        periodDescription: metadata.description
      }
    };

    console.log("✅ 리더보드 조회 완료:", {
      period,
      entriesReturned: enrichedEntries.length,
      totalUsers: metadata.totalEntries,
      page,
      hasNext: response.pagination.hasNext
    });

    return response;
  }

  private getPeriodKey(period: string): string {
    const periodMap: { [key: string]: string } = {
      "all_time": "ALL_TIME",
      "monthly": "MONTHLY", 
      "weekly": "WEEKLY",
      "event": "EVENT"
    };
    
    return `LEADERBOARD#${periodMap[period] || "ALL_TIME"}`;
  }

  private async getLeaderboardMetadata(periodKey: string): Promise<LeaderboardMetadata> {
    console.log("🔍 메타데이터 조회:", periodKey);
    
    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND sk = :sk",
      ExpressionAttributeValues: {
        ":pk": { S: periodKey },
        ":sk": { S: "METADATA" }
      }
    }));

    if (!result.Items || result.Items.length === 0) {
      throw new Error(`No metadata found for period: ${periodKey}`);
    }

    const metadata = unmarshall(result.Items[0]) as LeaderboardMetadata;
    console.log("✅ 메타데이터 조회 완료:", {
      totalEntries: metadata.totalEntries,
      lastUpdated: metadata.lastUpdated
    });

    return metadata;
  }

  private async getLeaderboardEntries(
    periodKey: string, 
    limit: number, 
    offset: number
  ): Promise<CumulativeLeaderboardEntry[]> {
    console.log("🔍 리더보드 엔트리 조회:", { periodKey, limit, offset });

    // 페이지네이션을 위해 offset만큼 건너뛰고 limit+1개 조회
    const result = await this.ddbClient.send(new QueryCommand({
      TableName: this.config.cumulativeTableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: periodKey },
        ":sk": { S: "RANK#" }
      },
      ScanIndexForward: true, // 순위 순으로 정렬 (ASC)
      Limit: limit + offset // offset + limit까지 조회한 후 필터링
    }));

    if (!result.Items) {
      return [];
    }

    // offset부터 limit개만 선택
    const allEntries = result.Items.map(item => unmarshall(item) as CumulativeLeaderboardEntry);
    const paginatedEntries = allEntries.slice(offset, offset + limit);

    console.log("✅ 리더보드 엔트리 조회 완료:", {
      totalFound: allEntries.length,
      returnedAfterPagination: paginatedEntries.length,
      offset,
      limit
    });

    return paginatedEntries;
  }

  private async enrichWithProfiles(entries: LeaderboardEntry[]): Promise<LeaderboardResponse["entries"]> {
    if (entries.length === 0) {
      return [];
    }

    console.log("🔍 사용자 프로필 배치 조회:", entries.map(e => e.userId));

    // 배치로 사용자 프로필 조회
    const profileKeys = entries.map(entry => ({
      pk: { S: `USER#${entry.userId}` },
      sk: { S: "PROFILE" }
    }));

    let profiles: UserProfile[] = [];
    
    // BatchGetItem은 100개 제한이 있으므로 청크로 나누어 처리
    const chunkSize = 100;
    for (let i = 0; i < profileKeys.length; i += chunkSize) {
      const chunk = profileKeys.slice(i, i + chunkSize);
      
      try {
        const result = await this.ddbClient.send(new BatchGetItemCommand({
          RequestItems: {
            [this.config.cumulativeTableName]: {
              Keys: chunk
            }
          }
        }));

        if (result.Responses?.[this.config.cumulativeTableName]) {
          const chunkProfiles = result.Responses[this.config.cumulativeTableName]
            .map(item => unmarshall(item) as UserProfile);
          profiles.push(...chunkProfiles);
        }
      } catch (error) {
        console.warn("⚠️ 프로필 배치 조회 실패:", error);
        // 프로필 조회 실패 시에도 계속 진행
      }
    }

    // 프로필 정보를 userId로 매핑
    const profileMap = new Map<string, UserProfile>();
    profiles.forEach(profile => {
      profileMap.set(profile.userId, profile);
    });

    console.log("✅ 프로필 정보 매핑 완료:", {
      entriesCount: entries.length,
      profilesFound: profiles.length,
      missingProfiles: entries.length - profiles.length
    });

    // 엔트리와 프로필 정보 결합
    return entries.map(entry => {
      const profile = profileMap.get(entry.userId);
      
      return {
        rank: entry.rank,
        userId: entry.userId,
        username: entry.username,
        displayName: profile?.displayName || entry.username,
        profileImageUrl: profile?.profileImageUrl || "",
        totalScore: entry.totalScore,
        totalLikes: entry.totalLikes,
        totalReplies: entry.totalReplies,
        totalReposts: entry.totalReposts,
        totalQuotes: entry.totalQuotes,
        lastUpdated: entry.lastUpdated,
        xUrl: `https://x.com/${entry.username}`
      };
    });
  }
}