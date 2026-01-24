import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { getEnvConfigV2 } from "../src/utils/env";

const DRY_RUN = process.env.DRY_RUN === 'true';
const ddbClient = new DynamoDBClient({});
const config = getEnvConfigV2();

interface DynamoDBItem {
  pk: { S: string };
  sk: { S: string };
  [key: string]: any;
}

async function deleteAllCumulativeScores() {
  console.log('🗑️  CUMULATIVE_SCORE 레코드 삭제 중...');

  let deletedCount = 0;
  let lastEvaluatedKey: any = undefined;

  do {
    const scanCommand = new ScanCommand({
      TableName: config.cumulativeTableName,
      FilterExpression: 'sk = :sk',
      ExpressionAttributeValues: {
        ':sk': { S: 'CUMULATIVE_SCORE' }
      },
      ExclusiveStartKey: lastEvaluatedKey
    });

    const result = await ddbClient.send(scanCommand);

    if (result.Items && result.Items.length > 0) {
      console.log(`  발견: ${result.Items.length}개 레코드`);

      if (DRY_RUN) {
        console.log('  🔍 DRY_RUN: 삭제 건너뜀');
        const samples = result.Items.slice(0, 3).map((item: DynamoDBItem) => {
          const data = unmarshall(item);
          return `${data.username || 'unknown'} (${data.userId})`;
        });
        console.log(`  샘플: ${samples.join(', ')}`);
        deletedCount += result.Items.length;
      } else {
        // Batch delete (최대 25개씩)
        const batchSize = 25;
        for (let i = 0; i < result.Items.length; i += batchSize) {
          const batch = result.Items.slice(i, i + batchSize);

          const deleteRequests = batch.map((item: DynamoDBItem) => ({
            DeleteRequest: {
              Key: {
                pk: item.pk,
                sk: item.sk
              }
            }
          }));

          const deleteCommand = new BatchWriteItemCommand({
            RequestItems: {
              [config.cumulativeTableName]: deleteRequests
            }
          });

          await ddbClient.send(deleteCommand);
          deletedCount += batch.length;
          console.log(`  ✅ ${deletedCount}개 삭제 완료...`);
        }
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ CUMULATIVE_SCORE 삭제 완료: ${deletedCount}개`);
  return deletedCount;
}

async function deleteAllSnapshots() {
  console.log('🗑️  리더보드 스냅샷 삭제 중...');

  let deletedCount = 0;
  let lastEvaluatedKey: any = undefined;

  do {
    const scanCommand = new ScanCommand({
      TableName: config.cumulativeTableName,
      FilterExpression: 'begins_with(pk, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': { S: 'LEADERBOARD#' }
      },
      ExclusiveStartKey: lastEvaluatedKey
    });

    const result = await ddbClient.send(scanCommand);

    if (result.Items && result.Items.length > 0) {
      console.log(`  발견: ${result.Items.length}개 스냅샷 레코드`);

      if (DRY_RUN) {
        console.log('  🔍 DRY_RUN: 삭제 건너뜀');
        const samples = result.Items.slice(0, 3).map((item: DynamoDBItem) => {
          const data = unmarshall(item);
          return `${data.pk}#${data.sk}`;
        });
        console.log(`  샘플: ${samples.join(', ')}`);
        deletedCount += result.Items.length;
      } else {
        // Batch delete (최대 25개씩)
        const batchSize = 25;
        for (let i = 0; i < result.Items.length; i += batchSize) {
          const batch = result.Items.slice(i, i + batchSize);

          const deleteRequests = batch.map((item: DynamoDBItem) => ({
            DeleteRequest: {
              Key: {
                pk: item.pk,
                sk: item.sk
              }
            }
          }));

          const deleteCommand = new BatchWriteItemCommand({
            RequestItems: {
              [config.cumulativeTableName]: deleteRequests
            }
          });

          await ddbClient.send(deleteCommand);
          deletedCount += batch.length;
          console.log(`  ✅ ${deletedCount}개 삭제 완료...`);
        }
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ 스냅샷 삭제 완료: ${deletedCount}개`);
  return deletedCount;
}

async function verifyCleanTable() {
  console.log('🔍 테이블 클린 상태 검증 중...');

  // Check CUMULATIVE_SCORE
  const scoreCheck = await ddbClient.send(new ScanCommand({
    TableName: config.cumulativeTableName,
    FilterExpression: 'sk = :sk',
    ExpressionAttributeValues: {
      ':sk': { S: 'CUMULATIVE_SCORE' }
    },
    Limit: 1
  }));

  // Check LEADERBOARD snapshots
  const snapshotCheck = await ddbClient.send(new ScanCommand({
    TableName: config.cumulativeTableName,
    FilterExpression: 'begins_with(pk, :prefix)',
    ExpressionAttributeValues: {
      ':prefix': { S: 'LEADERBOARD#' }
    },
    Limit: 1
  }));

  const cumulativeCount = scoreCheck.Items?.length || 0;
  const snapshotCount = snapshotCheck.Items?.length || 0;

  console.log(`  CUMULATIVE_SCORE 남은 레코드: ${cumulativeCount}`);
  console.log(`  LEADERBOARD 스냅샷 남은 레코드: ${snapshotCount}`);

  if (cumulativeCount === 0 && snapshotCount === 0) {
    console.log('✅ 테이블 완전 클린 확인!');
    return true;
  } else {
    console.log('⚠️  일부 데이터가 남아있습니다.');
    return false;
  }
}

async function main() {
  console.log('🔄 리더보드 완전 초기화 시작');
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`테이블: ${config.cumulativeTableName}`);
  console.log('---');

  try {
    // Phase 1: Delete CUMULATIVE_SCORE
    const cumulativeDeleted = await deleteAllCumulativeScores();
    console.log('');

    // Phase 2: Delete LEADERBOARD snapshots
    const snapshotsDeleted = await deleteAllSnapshots();
    console.log('');

    // Phase 3: Verify
    if (!DRY_RUN) {
      const isClean = await verifyCleanTable();
      console.log('');

      if (isClean) {
        console.log('✅ 리더보드 완전 초기화 성공!');
        console.log(`총 삭제: ${cumulativeDeleted + snapshotsDeleted}개 레코드`);
        console.log('');
        console.log('다음 단계: 파이프라인 수동 실행으로 클린 스타트');
      } else {
        console.log('⚠️  초기화 검증 실패 - 재시도 필요');
        process.exit(1);
      }
    } else {
      console.log('🔍 DRY_RUN 완료');
      console.log(`예상 삭제: ${cumulativeDeleted + snapshotsDeleted}개 레코드`);
      console.log('');
      console.log('실제 실행: DRY_RUN=false npm run tsx scripts/complete-clean-leaderboard.ts');
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error);
    process.exit(1);
  }
}

main();
