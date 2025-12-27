/**
 * 10월 9일 스냅샷으로 CUMULATIVE_SCORE 복원
 *
 * 목적: 10월 10일 2배 중복 누적된 점수를 10월 9일 정상 상태로 되돌림
 */

import { DynamoDBClient, QueryCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { getEnvConfigV2 } from "../src/utils/env";

const DRY_RUN = process.env.DRY_RUN === 'true';
const ddbClient = new DynamoDBClient({});
const config = getEnvConfigV2();

interface LeaderboardSnapshot {
  pk: string;
  sk: string;
  userId: string;
  username: string;
  totalScore: number;
  totalLikes: number;
  totalReplies: number;
  totalReposts: number;
  totalQuotes: number;
  totalMentions: number;
  totalTargetBookmarkBonus?: number;
  [key: string]: any;
}

async function getOct9Snapshot(): Promise<LeaderboardSnapshot[]> {
  console.log('📸 10월 9일 스냅샷 조회 중...');

  const snapshotPK = 'LEADERBOARD#CUMULATIVE#2025-10-09';
  const items: LeaderboardSnapshot[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const command = new QueryCommand({
      TableName: config.cumulativeTableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk_prefix)',
      ExpressionAttributeValues: marshall({
        ':pk': snapshotPK,
        ':sk_prefix': 'RANK#'
      }),
      ExclusiveStartKey: lastEvaluatedKey
    });

    const result = await ddbClient.send(command);

    if (result.Items) {
      const unmarshalled = result.Items.map(item => unmarshall(item) as LeaderboardSnapshot);
      items.push(...unmarshalled);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ 10월 9일 스냅샷 조회 완료: ${items.length}명`);
  return items;
}

async function restoreCumulativeScores(snapshots: LeaderboardSnapshot[]) {
  console.log(`📝 CUMULATIVE_SCORE 복원 시작: ${snapshots.length}명`);

  if (DRY_RUN) {
    console.log('🔍 DRY_RUN 모드: 실제 DB 쓰기 건너뜀');
    console.log('복원 미리보기 (상위 5명):');
    snapshots.slice(0, 5).forEach(user => {
      console.log(`  - ${user.username} (${user.userId}): ${user.totalScore} 점`);
    });
    return;
  }

  // BatchWriteItem은 25개씩 처리
  const batchSize = 25;
  for (let i = 0; i < snapshots.length; i += batchSize) {
    const batch = snapshots.slice(i, i + batchSize);

    const writeRequests = batch.map(user => ({
      PutRequest: {
        Item: marshall({
          pk: `USER#${user.userId}`,
          sk: 'CUMULATIVE_SCORE',
          userId: user.userId,
          username: user.username,
          totalScore: user.totalScore,
          totalLikes: user.totalLikes,
          totalReplies: user.totalReplies,
          totalReposts: user.totalReposts,
          totalQuotes: user.totalQuotes,
          totalMentions: user.totalMentions || 0,
          totalTargetBookmarkBonus: user.totalTargetBookmarkBonus || 0,
          // 추가 필드 복사
          ...(user.displayName ? { displayName: user.displayName } : {}),
          ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}),
          ...(user.followersCount !== undefined ? { followersCount: user.followersCount } : {}),
          ...(user.dominantLanguage ? { dominantLanguage: user.dominantLanguage } : {}),
          ...(user.communityType ? { communityType: user.communityType } : {}),
          updated_at: new Date().toISOString(),
          version: '1.0',
          restoredFrom: '2025-10-09-snapshot',
          restoredAt: new Date().toISOString()
        }, { removeUndefinedValues: true })
      }
    }));

    const command = new BatchWriteItemCommand({
      RequestItems: {
        [config.cumulativeTableName]: writeRequests
      }
    });

    await ddbClient.send(command);
    console.log(`  ✅ 배치 ${Math.floor(i / batchSize) + 1}/${Math.ceil(snapshots.length / batchSize)} 완료 (${batch.length}명)`);
  }

  console.log(`✅ CUMULATIVE_SCORE 복원 완료: ${snapshots.length}명`);
}

async function main() {
  console.log('🔄 10월 9일 스냅샷 복원 시작');
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log('---');

  try {
    // Step 1: 10월 9일 스냅샷 조회
    const snapshots = await getOct9Snapshot();

    if (snapshots.length === 0) {
      console.error('❌ 10월 9일 스냅샷이 없습니다!');
      process.exit(1);
    }

    // Step 2: CUMULATIVE_SCORE 복원
    await restoreCumulativeScores(snapshots);

    console.log('');
    console.log('✅ 복원 완료!');
    console.log('다음 단계: Phase 1-1 (10월 10일 스냅샷 삭제)');

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

main();
