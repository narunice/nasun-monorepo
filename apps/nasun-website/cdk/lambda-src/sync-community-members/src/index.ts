import { ScanCommand, QueryCommand, BatchWriteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const region = process.env.AWS_REGION || 'ap-northeast-2';
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const LEADERBOARD_TABLE = process.env.CUMULATIVE_TABLE_NAME || 'nasun-leaderboard-data';

/**
 * 기존 COMMUNITY_MEMBERS 전체 삭제
 */
async function deleteAllCommunityMembers(): Promise<number> {
  console.log('🗑️ [DELETE] 기존 커뮤니티 멤버 목록 삭제 시작...');

  const queryParams = {
    TableName: LEADERBOARD_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': 'COMMUNITY_MEMBERS'
    }
  };

  const result = await ddbClient.send(new QueryCommand(queryParams));

  if (!result.Items || result.Items.length === 0) {
    console.log('   ℹ️ 삭제할 항목 없음');
    return 0;
  }

  const totalItems = result.Items.length;
  console.log(`   🔍 ${totalItems}개 항목 발견`);

  let deletedCount = 0;
  for (let i = 0; i < totalItems; i += 25) {
    const batch = result.Items.slice(i, i + 25);
    const deleteRequests = batch.map(item => ({
      DeleteRequest: {
        Key: {
          pk: item.pk,
          sk: item.sk
        }
      }
    }));

    await ddbClient.send(new BatchWriteCommand({
      RequestItems: {
        [LEADERBOARD_TABLE]: deleteRequests
      }
    }));

    deletedCount += batch.length;
    console.log(`   ✓ ${deletedCount}/${totalItems} 삭제 완료`);
  }

  console.log(`✅ [DELETE] 전체 삭제 완료: ${deletedCount}개 항목`);
  return deletedCount;
}

/**
 * UserProfiles 테이블에서 모든 트위터 계정 정보 가져오기
 */
async function getAllTwitterAccounts(): Promise<Array<{ twitterId: string; twitterHandle: string }>> {
  const twitterAccounts: Array<{ twitterId: string; twitterHandle: string }> = [];
  let lastEvaluatedKey: any = undefined;
  let scanCount = 0;

  do {
    scanCount++;
    console.log(`🔍 [SCAN] UserProfiles 스캔 중... (${scanCount}번째)`);

    const params = {
      TableName: USER_PROFILES_TABLE,
      ExclusiveStartKey: lastEvaluatedKey
    };

    const result = await ddbClient.send(new ScanCommand(params));

    result.Items?.forEach(item => {
      if (item.twitterId && item.twitterHandle) {
        twitterAccounts.push({
          twitterId: item.twitterId,
          twitterHandle: item.twitterHandle
        });
      }
    });

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ [SCAN] 스캔 완료: ${scanCount}개 페이지, ${twitterAccounts.length}개 계정`);
  return twitterAccounts;
}

/**
 * 커뮤니티 멤버 DB에 저장 (BatchWrite 사용)
 */
async function saveCommunityMembers(accounts: Array<{ twitterId: string; twitterHandle: string }>) {
  const timestamp = new Date().toISOString();
  let savedCount = 0;

  for (let i = 0; i < accounts.length; i += 25) {
    const batch = accounts.slice(i, i + 25);
    console.log(`💾 [SAVE] ${i + 1}-${Math.min(i + 25, accounts.length)}번째 계정 저장 중...`);

    const putRequests = batch.map(account => ({
      PutRequest: {
        Item: {
          pk: 'COMMUNITY_MEMBERS',
          sk: `TWITTER#${account.twitterId}`,
          twitterId: account.twitterId,
          twitterHandle: account.twitterHandle,
          lastVerified: timestamp
        }
      }
    }));

    await ddbClient.send(new BatchWriteCommand({
      RequestItems: { [LEADERBOARD_TABLE]: putRequests }
    }));

    savedCount += batch.length;
    console.log(`   ✓ ${savedCount}/${accounts.length} 저장 완료`);
  }

  console.log(`✅ [SAVE] 전체 저장 완료: ${savedCount}개 계정`);
}

export const handler = async () => {
  console.log('🔄 [SYNC] 커뮤니티 멤버 DB 동기화 시작...');
  console.log(`📊 [SYNC] UserProfiles 테이블: ${USER_PROFILES_TABLE}`);
  console.log(`📊 [SYNC] Leaderboard 테이블: ${LEADERBOARD_TABLE}`);

  try {
    const deletedCount = await deleteAllCommunityMembers();
    const twitterAccounts = await getAllTwitterAccounts();
    console.log(`✅ [SYNC] ${twitterAccounts.length}명의 트위터 계정 발견`);

    if (twitterAccounts.length > 0) {
      await saveCommunityMembers(twitterAccounts);
      console.log('✅ [SYNC] 커뮤니티 멤버 DB 업데이트 완료');
    }

    console.log(`📈 [SYNC] 동기화 완료: 삭제 ${deletedCount}명, 추가 ${twitterAccounts.length}명`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Community members synced successfully',
        deletedCount,
        totalMembers: twitterAccounts.length,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('❌ [SYNC] 동기화 실패:', error);
    throw error;
  }
};