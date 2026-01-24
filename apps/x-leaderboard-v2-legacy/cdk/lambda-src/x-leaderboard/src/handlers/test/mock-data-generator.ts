/**
 * Mock Data Generator for V2 X Leaderboard System
 * 200명 이상의 테스트 사용자 데이터를 생성하고 DynamoDB에 저장
 */

import { APIGatewayProxyHandler, APIGatewayProxyEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getEnvConfigV2 } from "../../utils/env";
import { CumulativeScoreRecord, LeaderboardEntry, LeaderboardPeriod, RecentActivityRecord } from "../../types/leaderboard";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface MockDataGenerationRequest {
  userCount?: number;
  clearExisting?: boolean;
  generateRecentActivity?: boolean;
  scoreDistribution?: "normal" | "exponential" | "uniform";
}

interface MockDataGenerationResult {
  success: boolean;
  usersGenerated: number;
  activitiesGenerated: number;
  leaderboardEntriesGenerated: number;
  processingTimeMs: number;
  timestamp: string;
  error?: string;
}

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  const startTime = Date.now();
  
  // CORS 헤더 설정
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json"
  };

  // OPTIONS 요청 처리 (CORS preflight)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    };
  }

  try {
    const config = getEnvConfigV2();
    const tableName = config.cumulativeTableName;
    
    // 요청 파라미터 파싱
    let requestBody: MockDataGenerationRequest = {};
    if (event.body) {
      requestBody = JSON.parse(event.body);
    }
    
    const userCount = requestBody.userCount || 250; // 기본 250명
    const clearExisting = requestBody.clearExisting || false;
    const generateRecentActivity = requestBody.generateRecentActivity || true;
    const scoreDistribution = requestBody.scoreDistribution || "exponential";

    console.log("🎭 Mock 데이터 생성 시작:", {
      userCount,
      clearExisting,
      generateRecentActivity,
      scoreDistribution
    });

    // 1단계: Mock 사용자 데이터 생성
    const mockUsers = generateMockUsers(userCount, scoreDistribution);
    
    // 2단계: Recent Activity 데이터 생성
    let allActivities: RecentActivityRecord[] = [];
    if (generateRecentActivity) {
      allActivities = generateRecentActivities(mockUsers);
    }

    // 3단계: 리더보드 엔트리 생성
    const leaderboardEntries = generateLeaderboardEntries(mockUsers);

    // 4단계: DynamoDB에 배치로 저장
    const saveResults = await saveMockDataToDynamoDB(
      tableName,
      mockUsers,
      allActivities,
      leaderboardEntries,
      clearExisting
    );

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    const result: MockDataGenerationResult = {
      success: true,
      usersGenerated: mockUsers.length,
      activitiesGenerated: allActivities.length,
      leaderboardEntriesGenerated: leaderboardEntries.length,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString()
    };

    console.log("✅ Mock 데이터 생성 완료:", result);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result)
    };

  } catch (error) {
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    console.error("❌ Mock 데이터 생성 실패:", error);

    const errorResult: MockDataGenerationResult = {
      success: false,
      usersGenerated: 0,
      activitiesGenerated: 0,
      leaderboardEntriesGenerated: 0,
      processingTimeMs: processingTime,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error"
    };

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify(errorResult)
    };
  }
};

/**
 * Mock 사용자 데이터 생성
 */
function generateMockUsers(count: number, distribution: string): CumulativeScoreRecord[] {
  console.log(`👥 ${count}명의 Mock 사용자 생성 중 (분포: ${distribution})`);
  
  const users: CumulativeScoreRecord[] = [];
  const currentDate = new Date().toISOString();

  for (let i = 1; i <= count; i++) {
    const userId = `mock_user_${i.toString().padStart(4, '0')}`;
    const username = generateRandomUsername(i);
    
    // 점수 분포에 따른 engagement 메트릭 생성
    const engagement = generateEngagementMetrics(i, count, distribution);
    
    // 총점 계산 (V2 점수 공식 적용)
    const totalScore = calculateTotalScore(engagement);

    // 디버깅용 로그 추가
    if (i < 3) {
      console.log(`User ${i} engagement:`, engagement);
      console.log(`User ${i} mentions value:`, engagement.mentions);
    }

    // 이벤트 기간별 점수는 실제 날짜 기반으로 계산되므로 제거

    const mockUser: CumulativeScoreRecord = {
      pk: `USER#${userId}`,
      sk: "CUMULATIVE_SCORE",
      userId,
      username,
      totalScore,
      totalLikes: engagement.likes,
      totalReplies: engagement.replies,
      totalReposts: engagement.reposts,
      totalQuotes: engagement.quotes,
      totalMentions: engagement.mentions || 0,
      firstActivity: getRandomDate(-60, -1), // 최근 60일 내 첫 활동
      lastUpdated: currentDate,
      version: "v2"
    };

    // 디버깅용: 첫 번째 유저의 데이터 출력
    if (i === 0) {
      console.log("🔍 첫 번째 Mock 유저 데이터:", JSON.stringify(mockUser, null, 2));
    }

    users.push(mockUser);
  }

  // 점수 순으로 정렬 (높은 점수부터)
  users.sort((a, b) => b.totalScore - a.totalScore);

  console.log(`📊 생성된 사용자 점수 분포:`, {
    최고점: users[0]?.totalScore || 0,
    중간값: users[Math.floor(users.length / 2)]?.totalScore || 0,
    최저점: users[users.length - 1]?.totalScore || 0,
    평균점수: users.reduce((sum, user) => sum + user.totalScore, 0) / users.length
  });

  return users;
}

/**
 * 랜덤 사용자명 생성
 */
function generateRandomUsername(index: number): string {
  const prefixes = [
    "crypto", "nft", "web3", "blockchain", "defi", "dao", "metaverse", "gamefi",
    "tech", "dev", "code", "build", "create", "innovate", "future", "digital",
    "moon", "diamond", "rocket", "star", "cosmic", "galaxy", "nebula", "solar",
    "alpha", "beta", "sigma", "omega", "prime", "elite", "master", "legend"
  ];
  
  const suffixes = [
    "trader", "holder", "builder", "creator", "developer", "engineer", "wizard",
    "ninja", "samurai", "warrior", "champion", "hero", "legend", "master",
    "king", "queen", "prince", "duke", "lord", "sage", "guru", "expert",
    "hunter", "explorer", "pioneer", "innovator", "visionary", "dreamer"
  ];

  const numbers = Math.floor(Math.random() * 9999);
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  // 20% 확률로 숫자 추가
  const addNumbers = Math.random() < 0.2;
  return addNumbers ? `${prefix}_${suffix}${numbers}` : `${prefix}_${suffix}`;
}

/**
 * Engagement 메트릭 생성 (분포별)
 */
function generateEngagementMetrics(userIndex: number, totalUsers: number, distribution: string) {
  let baseLikes: number;
  let baseReplies: number;
  let baseReposts: number;
  let baseQuotes: number;
  let baseMentions: number;

  switch (distribution) {
    case "exponential":
      // 상위 20% 사용자가 80%의 활동을 담당하는 파레토 분포
      const rank = userIndex / totalUsers;
      const exponentialFactor = Math.pow(1 - rank, 3); // 지수적 감소
      
      baseLikes = Math.floor(exponentialFactor * 500 + Math.random() * 100);
      baseReplies = Math.floor(exponentialFactor * 200 + Math.random() * 50);
      baseReposts = Math.floor(exponentialFactor * 150 + Math.random() * 30);
      baseQuotes = Math.floor(exponentialFactor * 100 + Math.random() * 25);
      baseMentions = Math.floor(exponentialFactor * 80 + Math.random() * 20);
      break;
      
    case "normal":
      // 정규분포 (평균 중심)
      const normalLikes = gaussianRandom(150, 75);
      const normalReplies = gaussianRandom(50, 25);
      const normalReposts = gaussianRandom(40, 20);
      const normalQuotes = gaussianRandom(25, 15);
      const normalMentions = gaussianRandom(20, 12);
      
      baseLikes = Math.max(0, Math.floor(normalLikes));
      baseReplies = Math.max(0, Math.floor(normalReplies));
      baseReposts = Math.max(0, Math.floor(normalReposts));
      baseQuotes = Math.max(0, Math.floor(normalQuotes));
      baseMentions = Math.max(0, Math.floor(normalMentions));
      break;
      
    case "uniform":
    default:
      // 균등분포
      baseLikes = Math.floor(Math.random() * 300 + 10);
      baseReplies = Math.floor(Math.random() * 100 + 5);
      baseReposts = Math.floor(Math.random() * 80 + 3);
      baseQuotes = Math.floor(Math.random() * 50 + 2);
      baseMentions = Math.floor(Math.random() * 40 + 1);
      break;
  }

  return {
    likes: baseLikes,
    replies: baseReplies,
    reposts: baseReposts,
    quotes: baseQuotes,
    mentions: baseMentions
  };
}

/**
 * 가우시안 랜덤 숫자 생성 (Box-Muller 변환)
 */
function gaussianRandom(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // 0 방지
  while(v === 0) v = Math.random();
  
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return z * stdDev + mean;
}

/**
 * V2 점수 계산 공식
 */
function calculateTotalScore(engagement: {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  mentions: number;
}): number {
  // V2 점수 계산 공식 (실제 시스템과 동일)
  const weights = {
    likes: 0.8,
    replies: 2.2,
    reposts: 2.0,
    quotes: 3.0,
    mentions: 2.3,
  };

  const score = 
    engagement.likes * weights.likes +
    engagement.replies * weights.replies +
    engagement.reposts * weights.reposts +
    engagement.quotes * weights.quotes +
    engagement.mentions * weights.mentions;

  return Math.round(score * 10) / 10; // 소수점 1자리까지
}

/**
 * Recent Activity 데이터 생성
 */
function generateRecentActivities(users: CumulativeScoreRecord[]): RecentActivityRecord[] {
  console.log("📝 Recent Activity 데이터 생성 중...");
  
  const activities: RecentActivityRecord[] = [];
  const engagementTypes: ("like" | "reply" | "repost" | "quote" | "mention")[] = 
    ["like", "reply", "repost", "quote", "mention"];

  for (let userIndex = 0; userIndex < users.length; userIndex++) {
    const user = users[userIndex];
    // 사용자별 활동량은 총점에 비례하여 생성
    const activityCount = Math.floor(user.totalScore / 5) + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < activityCount; i++) {
      const engagementType = engagementTypes[Math.floor(Math.random() * engagementTypes.length)];
      const tweetId = `tweet_${userIndex}_${i}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const addedAt = getRandomEventDate(); // 이벤트 기간 내 활동 (환경변수 기반)
      
      const activity: RecentActivityRecord = {
        pk: user.pk,
        sk: `RECENT#${tweetId}#${engagementType}`,
        userId: user.userId,
        tweetId,
        engagementType,
        addedAt,
        tweetCreatedAt: getRandomEventDate(), // 트윗도 이벤트 기간 내 생성
        scoreValue: undefined
      };

      activities.push(activity);
    }
  }

  console.log(`📊 총 ${activities.length}개의 Recent Activity 생성 완료`);
  return activities;
}

/**
 * 리더보드 엔트리 생성
 */
function generateLeaderboardEntries(users: CumulativeScoreRecord[]): LeaderboardEntry[] {
  console.log("🏆 리더보드 엔트리 생성 중...");
  
  const entries: LeaderboardEntry[] = [];
  const timestamp = new Date().toISOString();
  
  // CUMULATIVE 리더보드 엔트리 생성
  users.forEach((user, index) => {
    const rank = index + 1;
    const uniqueTimestamp = `${timestamp}_${rank}`;
    
    const entry: LeaderboardEntry = {
      pk: `LEADERBOARD#${LeaderboardPeriod.CUMULATIVE}`,
      sk: `RANK#${rank.toString().padStart(4, '0')}#${uniqueTimestamp}`,
      rank,
      userId: user.userId,
      username: user.username,
      totalScore: user.totalScore,
      totalLikes: user.totalLikes,
      totalReplies: user.totalReplies,
      totalReposts: user.totalReposts,
      totalQuotes: user.totalQuotes,
      totalMentions: user.totalMentions,
      lastUpdated: timestamp,
      period: LeaderboardPeriod.CUMULATIVE,
      periodStartDate: "2025-08-01",
      periodEndDate: "2025-12-31",
      periodDescription: "전체 기간 누적 리더보드"
    };

    entries.push(entry);
  });

  console.log(`🏆 ${entries.length}개의 리더보드 엔트리 생성 완료`);
  return entries;
}

/**
 * 랜덤 날짜 생성 (현재 기준 relative days)
 */
function getRandomDate(minDaysAgo: number, maxDaysAgo: number): string {
  const now = new Date();
  const randomDays = Math.floor(Math.random() * (maxDaysAgo - minDaysAgo + 1)) + minDaysAgo;
  const randomDate = new Date(now.getTime() + randomDays * 24 * 60 * 60 * 1000);
  return randomDate.toISOString();
}

/**
 * 이벤트 기간 내 랜덤 날짜 생성 (환경변수 기반)
 */
function getRandomEventDate(): string {
  const config = getEnvConfigV2();
  // 시스템 시작일
  const startDate = new Date(`${config.systemStartDate}T00:00:00.000Z`);
  // 2025년 10월 5일 23:59:59 UTC  
  const endDate = new Date('2025-10-05T23:59:59.999Z');
  
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const randomTime = startTime + Math.random() * (endTime - startTime);
  
  return new Date(randomTime).toISOString();
}

/**
 * DynamoDB에 Mock 데이터 저장
 */
async function saveMockDataToDynamoDB(
  tableName: string,
  users: CumulativeScoreRecord[],
  activities: RecentActivityRecord[],
  leaderboardEntries: LeaderboardEntry[],
  clearExisting: boolean
): Promise<void> {
  console.log("💾 DynamoDB에 Mock 데이터 저장 중...");

  // 모든 아이템을 배치로 저장 (DynamoDB 배치 제한 25개씩)
  const allItems = [
    ...users,
    ...activities,
    ...leaderboardEntries
  ];

  console.log(`📦 총 ${allItems.length}개 아이템을 배치로 저장 시작`);

  const batchSize = 25;
  const batches = [];
  
  for (let i = 0; i < allItems.length; i += batchSize) {
    const batch = allItems.slice(i, i + batchSize);
    batches.push(batch);
  }

  console.log(`📦 ${batches.length}개 배치로 분할하여 저장`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    // 첫 번째 배치에서 Recent Activity 샘플 확인
    if (i === 0) {
      const firstActivity = batch.find(item => item.sk?.startsWith('RECENT#'));
      if (firstActivity) {
        console.log("🔍 첫 번째 Recent Activity 샘플:", JSON.stringify(firstActivity, null, 2));
      }
    }
    
    const putRequests = batch.map(item => ({
      PutRequest: {
        Item: item
      }
    }));

    try {
      await docClient.send(new BatchWriteCommand({
        RequestItems: {
          [tableName]: putRequests
        }
      }));

      console.log(`  ✅ 배치 ${i + 1}/${batches.length} 저장 완료 (${batch.length}개 아이템)`);
    } catch (error) {
      console.error(`  ❌ 배치 ${i + 1} 저장 실패:`, error);
      throw error;
    }
  }

  console.log("💾 모든 Mock 데이터 저장 완료");
}