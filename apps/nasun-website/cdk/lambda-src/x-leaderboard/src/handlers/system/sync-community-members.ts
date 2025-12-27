import { DynamoDB } from 'aws-sdk';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const dynamodb = new DynamoDB.DocumentClient();
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-northeast-2' }));

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const LEADERBOARD_TABLE = process.env.CUMULATIVE_TABLE_NAME || 'nasun-leaderboard-data';

/**
 * 기존 COMMUNITY_MEMBERS 전체 삭제
 * - 회원 탈퇴/연동 해제 사용자 제거
 * - 매일 최신 상태로 갱신
 */
async function deleteAllCommunityMembers(): Promise<number> {
  console.log('🗑️ [DELETE] 기존 커뮤니티 멤버 목록 삭제 시작...');

  // Step 1: COMMUNITY_MEMBERS 쿼리
  const result = await dynamodb.query({
    TableName: LEADERBOARD_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': 'COMMUNITY_MEMBERS'
    }
  }).promise();

  if (!result.Items || result.Items.length === 0) {
    console.log('   ℹ️ 삭제할 항목 없음');
    return 0;
  }

  const totalItems = result.Items.length;
  console.log(`   🔍 ${totalItems}개 항목 발견`);

  // Step 2: BatchWrite로 25개씩 삭제
  let deletedCount = 0;
  for (let i = 0; i < result.Items.length; i += 25) {
    const batch = result.Items.slice(i, i + 25);

    await dynamodb.batchWrite({
      RequestItems: {
        [LEADERBOARD_TABLE]: batch.map(item => ({
          DeleteRequest: {
            Key: {
              pk: item.pk,
              sk: item.sk
            }
          }
        }))
      }
    }).promise();

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

    const params: any = {
      TableName: USER_PROFILES_TABLE
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.scan(params).promise();

    result.Items?.forEach(item => {
      // Twitter로 직접 로그인한 경우
      if (item.twitterId && item.twitterHandle) {
        twitterAccounts.push({
          twitterId: item.twitterId,
          twitterHandle: item.twitterHandle
        });
        console.log(`   ✓ @${item.twitterHandle} (${item.twitterId})`);
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

  // BatchWrite는 최대 25개씩만 처리 가능
  for (let i = 0; i < accounts.length; i += 25) {
    const batch = accounts.slice(i, i + 25);

    console.log(`💾 [SAVE] ${i + 1}-${Math.min(i + 25, accounts.length)}번째 계정 저장 중...`);

    await dynamodb.batchWrite({
      RequestItems: {
        [LEADERBOARD_TABLE]: batch.map(account => ({
          PutRequest: {
            Item: {
              pk: 'COMMUNITY_MEMBERS',
              sk: `TWITTER#${account.twitterId}`,
              twitterId: account.twitterId,
              twitterHandle: account.twitterHandle,
              lastVerified: timestamp
            }
          }
        }))
      }
    }).promise();

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
    // Step 1: 기존 목록 전체 삭제
    const deletedCount = await deleteAllCommunityMembers();

    // Step 2: UserProfiles에서 최신 트위터 계정 정보 가져오기
    const twitterAccounts = await getAllTwitterAccounts();
    console.log(`✅ [SYNC] ${twitterAccounts.length}명의 트위터 계정 발견`);

    if (twitterAccounts.length === 0) {
      console.warn('⚠️ [SYNC] 트위터 계정이 하나도 없습니다. 동기화를 건너뜁니다.');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No Twitter accounts found',
          deletedCount,
          totalMembers: 0
        })
      };
    }

    // Step 3: 커뮤니티 멤버 DB에 저장
    await saveCommunityMembers(twitterAccounts);
    console.log('✅ [SYNC] 커뮤니티 멤버 DB 업데이트 완료');

    // Step 4: 통계 출력
    console.log(`📈 [SYNC] 동기화 완료: 삭제 ${deletedCount}명, 추가 ${twitterAccounts.length}명`);
    twitterAccounts.slice(0, 5).forEach(account => {
      console.log(`   - @${account.twitterHandle} (${account.twitterId})`);
    });
    if (twitterAccounts.length > 5) {
      console.log(`   ... 외 ${twitterAccounts.length - 5}명`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Community members synced successfully',
        deletedCount,      // 🆕 삭제된 수
        totalMembers: twitterAccounts.length,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('❌ [SYNC] 동기화 실패:', error);
    throw error;
  }
};