/**
 * Phase 4: 누락된 targetBookmarkCount 및 targetRetweetCount 복구
 *
 * 목적:
 * - 모든 사용자의 TARGET_BOOKMARK/RETWEET 레코드를 스캔하여 카운트 계산
 * - CUMULATIVE_SCORE에 targetBookmarkCount, targetRetweetCount 필드 추가
 *
 * 참고:
 * - targetBookmarkCount: 사용자가 타겟 트윗을 북마크한 횟수
 * - targetRetweetCount: 사용자가 타겟 트윗을 리트윗한 횟수
 */

import { DynamoDBClient, ScanCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import * as fs from 'fs';
import * as path from 'path';

const ddbClient = new DynamoDBClient({ region: "ap-northeast-2" });
const TABLE_NAME = "nasun-leaderboard-data";
const DRY_RUN = process.env.DRY_RUN === 'true';

interface TargetBookmark {
  pk: string;
  sk: string;
  userId: string;
  targetTweetId: string;
}

interface TargetRetweet {
  pk: string;
  sk: string;
  userId: string;
  targetTweetId: string;
}

async function getAllTargetBookmarks(): Promise<Map<string, number>> {
  console.log("📖 TARGET_BOOKMARK 데이터 수집 중...");

  const bookmarkCountByUser = new Map<string, number>();
  let lastEvaluatedKey: any = undefined;
  let totalBookmarks = 0;

  do {
    const result = await ddbClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":sk": { S: "TARGET_BOOKMARK#" }
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));

    if (result.Items) {
      result.Items.forEach(item => {
        const bookmark = unmarshall(item) as TargetBookmark;
        const userId = bookmark.pk.replace("USER#", "");

        bookmarkCountByUser.set(userId, (bookmarkCountByUser.get(userId) || 0) + 1);
        totalBookmarks++;
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ TARGET_BOOKMARK 수집 완료: ${totalBookmarks}개 레코드, ${bookmarkCountByUser.size}명의 사용자`);
  return bookmarkCountByUser;
}

async function getAllTargetRetweets(): Promise<Map<string, number>> {
  console.log("🔁 TARGET_RETWEET 데이터 수집 중...");

  const retweetCountByUser = new Map<string, number>();
  let lastEvaluatedKey: any = undefined;
  let totalRetweets = 0;

  do {
    const result = await ddbClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":sk": { S: "TARGET_RETWEET#" }
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));

    if (result.Items) {
      result.Items.forEach(item => {
        const retweet = unmarshall(item) as TargetRetweet;
        const userId = retweet.pk.replace("USER#", "");

        retweetCountByUser.set(userId, (retweetCountByUser.get(userId) || 0) + 1);
        totalRetweets++;
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ TARGET_RETWEET 수집 완료: ${totalRetweets}개 레코드, ${retweetCountByUser.size}명의 사용자`);
  return retweetCountByUser;
}

async function getAllCumulativeScoreUserIds(): Promise<string[]> {
  console.log("👥 CUMULATIVE_SCORE 사용자 목록 조회 중...");

  const userIds: string[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const result = await ddbClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "sk = :sk",
      ExpressionAttributeValues: {
        ":sk": { S: "CUMULATIVE_SCORE" }
      },
      ProjectionExpression: "userId",
      ExclusiveStartKey: lastEvaluatedKey
    }));

    if (result.Items) {
      result.Items.forEach(item => {
        const { userId } = unmarshall(item);
        userIds.push(userId);
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ CUMULATIVE_SCORE 사용자: ${userIds.length}명`);
  return userIds;
}

async function updateUserTargetCounts(
  userId: string,
  bookmarkCount: number,
  retweetCount: number
): Promise<void> {
  if (DRY_RUN) {
    return;
  }

  await ddbClient.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: {
      pk: { S: `USER#${userId}` },
      sk: { S: "CUMULATIVE_SCORE" }
    },
    UpdateExpression: "SET targetBookmarkCount = :bookmarkCount, targetRetweetCount = :retweetCount, lastUpdated = :lastUpdated",
    ExpressionAttributeValues: {
      ":bookmarkCount": { N: bookmarkCount.toString() },
      ":retweetCount": { N: retweetCount.toString() },
      ":lastUpdated": { S: new Date().toISOString() }
    }
  }));
}

async function main() {
  console.log("🎯 Phase 4: targetBookmarkCount/targetRetweetCount 복구");
  console.log("=" .repeat(60));
  console.log(`모드: ${DRY_RUN ? '🔍 DRY RUN (시뮬레이션)' : '⚠️  LIVE (실제 수정)'}`);
  console.log("=".repeat(60));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(__dirname, '../backups');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 1. 모든 TARGET_BOOKMARK 및 TARGET_RETWEET 데이터 수집
    const [bookmarkCounts, retweetCounts] = await Promise.all([
      getAllTargetBookmarks(),
      getAllTargetRetweets()
    ]);

    // 2. 모든 CUMULATIVE_SCORE 사용자 조회
    const allUserIds = await getAllCumulativeScoreUserIds();

    // 3. 각 사용자별 카운트 계산 및 업데이트
    console.log("\n📝 사용자별 카운트 업데이트 중...");

    const updateResults: Array<{
      userId: string;
      bookmarkCount: number;
      retweetCount: number;
    }> = [];

    let updatedCount = 0;
    for (const userId of allUserIds) {
      const bookmarkCount = bookmarkCounts.get(userId) || 0;
      const retweetCount = retweetCounts.get(userId) || 0;

      updateResults.push({
        userId,
        bookmarkCount,
        retweetCount
      });

      if (!DRY_RUN) {
        await updateUserTargetCounts(userId, bookmarkCount, retweetCount);
      }

      updatedCount++;
      if (updatedCount % 10 === 0) {
        console.log(`  진행: ${updatedCount}/${allUserIds.length} (${((updatedCount / allUserIds.length) * 100).toFixed(1)}%)`);
      }
    }

    console.log(`  진행: ${updatedCount}/${allUserIds.length} (100.0%)`);

    // 4. 통계
    const usersWithBookmarks = updateResults.filter(r => r.bookmarkCount > 0).length;
    const usersWithRetweets = updateResults.filter(r => r.retweetCount > 0).length;
    const totalBookmarks = updateResults.reduce((sum, r) => sum + r.bookmarkCount, 0);
    const totalRetweets = updateResults.reduce((sum, r) => sum + r.retweetCount, 0);

    console.log("\n📊 복구 통계:");
    console.log(`  총 사용자: ${updateResults.length}명`);
    console.log(`  북마크 있는 사용자: ${usersWithBookmarks}명`);
    console.log(`  리트윗 있는 사용자: ${usersWithRetweets}명`);
    console.log(`  총 북마크: ${totalBookmarks}개`);
    console.log(`  총 리트윗: ${totalRetweets}개`);

    // 5. 상위 사용자 샘플
    const sortedByBookmarks = updateResults.sort((a, b) => b.bookmarkCount - a.bookmarkCount);
    console.log("\n📋 북마크 상위 5명:");
    sortedByBookmarks.slice(0, 5).forEach((result, idx) => {
      console.log(`  ${idx + 1}. ${result.userId}: ${result.bookmarkCount}개 북마크, ${result.retweetCount}개 리트윗`);
    });

    // 6. 결과 저장
    const resultPath = path.join(outputDir, `target-counts-recovery-${timestamp}.json`);
    fs.writeFileSync(resultPath, JSON.stringify({
      mode: DRY_RUN ? 'DRY_RUN' : 'LIVE',
      timestamp: new Date().toISOString(),
      totalUsers: updateResults.length,
      usersWithBookmarks,
      usersWithRetweets,
      totalBookmarks,
      totalRetweets,
      updateResults
    }, null, 2));
    console.log(`\n💾 결과 저장: ${resultPath}`);

    console.log("\n" + "=".repeat(60));
    if (DRY_RUN) {
      console.log("✅ Phase 4 시뮬레이션 완료!");
      console.log("\n실제 수정을 실행하려면:");
      console.log("  DRY_RUN=false npx tsx scripts/recover-target-counts.ts");
    } else {
      console.log("✅ Phase 4 완료! targetBookmarkCount/targetRetweetCount 복구 성공!");
    }

  } catch (error) {
    console.error("❌ 복구 실패:", error);
    throw error;
  }
}

// 실행
if (require.main === module) {
  main().catch(error => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { main as recoverTargetCounts };
