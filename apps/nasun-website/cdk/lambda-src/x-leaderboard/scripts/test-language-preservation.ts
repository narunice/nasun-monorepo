#!/usr/bin/env npx tsx
/**
 * 🧪 언어 보존 로직 디버그 검증 헬퍼
 *
 * 목적: delta-calculator.ts의 dominantLanguage 보존 로직이 실제로 작동하는지 테스트
 *
 * 동작:
 * 1. 특정 사용자의 RECENT# 레코드 중 1개의 lastProcessedDate를 제거
 * 2. 해당 좋아요를 "신규"로 만들어 다음 파이프라인 실행 시 재처리되도록 설정
 * 3. 파이프라인 실행 후 CloudWatch 로그에서 언어 보존 로그 확인
 *
 * 실행 방법:
 * 1. 테스트 설정 (lastProcessedDate 제거):
 *    TARGET_USER_ID=1737308647926231040 \
 *    DYNAMODB_TABLE_NAME=nasun-leaderboard-data \
 *    npx tsx scripts/test-language-preservation.ts
 *
 * 2. 파이프라인 수동 실행:
 *    aws stepfunctions start-execution \
 *      --state-machine-arn arn:aws:states:ap-northeast-2:135808943968:stateMachine:nasun-leaderboard-pipeline \
 *      --name "language-preservation-test-$(date +%Y%m%d-%H%M%S)"
 *
 * 3. CloudWatch 로그 확인:
 *    - 🔄 [LANGUAGE_PRESERVATION] 1737308647926231040의 기존 언어 보존: ko
 *    - 🔒 [LANGUAGE_PRESERVATION] 1737308647926231040의 기존 언어 유지: ko
 *
 * 4. 원복 (선택사항):
 *    TARGET_USER_ID=1737308647926231040 RESTORE=true \
 *    npx tsx scripts/test-language-preservation.ts
 *
 * @author Claude Code
 * @date 2025-10-17
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const ddbClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "nasun-leaderboard-data";
const TARGET_USER_ID = process.env.TARGET_USER_ID || "";
const RESTORE = process.env.RESTORE === 'true';

interface RecentEngagement {
  pk: string;
  sk: string;
  engagement_type: string;
  tweet_id: string;
  lastProcessedDate?: string;
  originalLastProcessedDate?: string;
}

/**
 * 사용자의 RECENT# 레코드 조회
 */
async function getUserRecentEngagements(userId: string): Promise<RecentEngagement[]> {
  console.log(`🔍 [QUERY] USER#${userId}의 RECENT# 레코드 조회 중...`);

  const engagements: RecentEngagement[] = [];

  try {
    const queryResult = await ddbClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RECENT#'
      }
    }));

    if (queryResult.Items) {
      for (const item of queryResult.Items) {
        engagements.push({
          pk: item.pk,
          sk: item.sk,
          engagement_type: item.engagement_type,
          tweet_id: item.tweet_id || item.tweetId,
          lastProcessedDate: item.lastProcessedDate,
          originalLastProcessedDate: item.originalLastProcessedDate
        });
      }
    }

    console.log(`✅ [QUERY] ${engagements.length}개 RECENT# 레코드 발견`);
  } catch (error) {
    console.error(`❌ [QUERY] 조회 실패:`, error);
    throw error;
  }

  return engagements;
}

/**
 * 좋아요 인게이지먼트를 "신규"로 만들기 (lastProcessedDate 제거)
 */
async function makeEngagementNew(engagement: RecentEngagement): Promise<void> {
  console.log(`🔧 [UPDATE] ${engagement.sk}의 lastProcessedDate 제거 중...`);

  try {
    await ddbClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: engagement.pk,
        sk: engagement.sk
      },
      UpdateExpression: "REMOVE lastProcessedDate SET originalLastProcessedDate = :date",
      ExpressionAttributeValues: {
        ':date': engagement.lastProcessedDate || new Date().toISOString().split('T')[0]
      }
    }));

    console.log(`✅ [UPDATE] lastProcessedDate 제거 완료 (백업: originalLastProcessedDate)`);
  } catch (error) {
    console.error(`❌ [UPDATE] 업데이트 실패:`, error);
    throw error;
  }
}

/**
 * 원복 (lastProcessedDate 복구)
 */
async function restoreEngagement(engagement: RecentEngagement): Promise<void> {
  console.log(`🔄 [RESTORE] ${engagement.sk}의 lastProcessedDate 복구 중...`);

  if (!engagement.originalLastProcessedDate) {
    console.warn(`⚠️ [RESTORE] originalLastProcessedDate 없음 - 복구 불가`);
    return;
  }

  try {
    await ddbClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: engagement.pk,
        sk: engagement.sk
      },
      UpdateExpression: "SET lastProcessedDate = :date REMOVE originalLastProcessedDate",
      ExpressionAttributeValues: {
        ':date': engagement.originalLastProcessedDate
      }
    }));

    console.log(`✅ [RESTORE] lastProcessedDate 복구 완료`);
  } catch (error) {
    console.error(`❌ [RESTORE] 복구 실패:`, error);
    throw error;
  }
}

/**
 * 사용자 프로필 확인
 */
async function checkUserProfile(userId: string): Promise<void> {
  console.log(`\n👤 [PROFILE] USER#${userId} 프로필 확인:`);

  try {
    const queryResult = await ddbClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND sk = :sk',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'CUMULATIVE_SCORE'
      }
    }));

    if (queryResult.Items && queryResult.Items.length > 0) {
      const profile = queryResult.Items[0];
      console.log(`   username: ${profile.username}`);
      console.log(`   displayName: ${profile.displayName}`);
      console.log(`   dominantLanguage: ${profile.dominantLanguage || 'undefined'} ${profile.dominantLanguage === 'ko' ? '✅' : '⚠️'}`);
      console.log(`   score: ${profile.score || 0}`);
    } else {
      console.log(`   ❌ 프로필 없음`);
    }
  } catch (error) {
    console.error(`❌ [PROFILE] 조회 실패:`, error);
  }
}

/**
 * 메인 실행
 */
async function main() {
  try {
    console.log(`🧪 언어 보존 로직 테스트 헬퍼`);
    console.log(`📋 테이블: ${TABLE_NAME}`);
    console.log(`👤 대상 사용자: ${TARGET_USER_ID || '지정 안 됨'}`);
    console.log(`🔧 모드: ${RESTORE ? 'RESTORE (원복)' : 'SETUP (테스트 준비)'}\n`);

    if (!TARGET_USER_ID) {
      console.error(`❌ TARGET_USER_ID 환경변수를 지정해주세요!`);
      console.log(`\n예시:`);
      console.log(`   TARGET_USER_ID=1737308647926231040 npx tsx scripts/test-language-preservation.ts\n`);
      process.exit(1);
    }

    // 1. 사용자 프로필 확인
    await checkUserProfile(TARGET_USER_ID);

    // 2. RECENT# 레코드 조회
    const engagements = await getUserRecentEngagements(TARGET_USER_ID);

    if (engagements.length === 0) {
      console.log(`\n⚠️ RECENT# 레코드가 없습니다. 테스트 불가.`);
      return;
    }

    // 3. 좋아요 인게이지먼트 찾기
    const likeEngagements = engagements.filter(e => e.engagement_type === 'like');

    if (likeEngagements.length === 0) {
      console.log(`\n⚠️ 좋아요 인게이지먼트가 없습니다. 테스트 불가.`);
      console.log(`\n💡 다른 타입 인게이지먼트:`);
      engagements.forEach(e => {
        console.log(`   - ${e.engagement_type}: ${e.sk}`);
      });
      return;
    }

    console.log(`\n📊 [ANALYSIS] 좋아요 인게이지먼트: ${likeEngagements.length}개`);

    if (RESTORE) {
      // 원복 모드
      console.log(`\n🔄 [RESTORE MODE] 원복 시작...`);

      const toRestore = likeEngagements.filter(e => e.originalLastProcessedDate);

      if (toRestore.length === 0) {
        console.log(`✅ 원복할 레코드가 없습니다.`);
        return;
      }

      console.log(`\n📝 원복 대상: ${toRestore.length}개`);

      for (const engagement of toRestore) {
        console.log(`\n${'-'.repeat(60)}`);
        console.log(`SK: ${engagement.sk}`);
        console.log(`originalLastProcessedDate: ${engagement.originalLastProcessedDate}`);
        await restoreEngagement(engagement);
      }

      console.log(`\n✅ 원복 완료!`);

    } else {
      // 테스트 준비 모드
      console.log(`\n🔧 [SETUP MODE] 테스트 준비 시작...`);

      // lastProcessedDate가 있는 좋아요 1개만 선택
      const target = likeEngagements.find(e => e.lastProcessedDate);

      if (!target) {
        console.log(`\n⚠️ lastProcessedDate가 있는 좋아요가 없습니다.`);
        console.log(`\n💡 좋아요 인게이지먼트 상태:`);
        likeEngagements.slice(0, 5).forEach(e => {
          console.log(`   - ${e.sk}: lastProcessedDate=${e.lastProcessedDate || 'undefined'}`);
        });
        return;
      }

      console.log(`\n📝 선택된 테스트 대상:`);
      console.log(`   SK: ${target.sk}`);
      console.log(`   Tweet ID: ${target.tweet_id}`);
      console.log(`   lastProcessedDate: ${target.lastProcessedDate}`);

      // lastProcessedDate 제거
      await makeEngagementNew(target);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ 테스트 준비 완료!`);
      console.log(`${'='.repeat(80)}\n`);

      console.log(`📋 다음 단계:`);
      console.log(`\n1️⃣  파이프라인 수동 실행:`);
      console.log(`   aws stepfunctions start-execution \\`);
      console.log(`     --state-machine-arn arn:aws:states:ap-northeast-2:135808943968:stateMachine:nasun-leaderboard-pipeline \\`);
      console.log(`     --name "language-preservation-test-$(date +%Y%m%d-%H%M%S)"`);

      console.log(`\n2️⃣  CloudWatch 로그에서 다음 메시지 확인:`);
      console.log(`   🔄 [LANGUAGE_PRESERVATION] ${TARGET_USER_ID}의 기존 언어 보존: ko`);
      console.log(`   🔒 [LANGUAGE_PRESERVATION] ${TARGET_USER_ID}의 기존 언어 유지: ko`);

      console.log(`\n3️⃣  프로필 언어 확인:`);
      console.log(`   aws dynamodb query \\`);
      console.log(`     --table-name ${TABLE_NAME} \\`);
      console.log(`     --key-condition-expression "pk = :pk AND sk = :sk" \\`);
      console.log(`     --expression-attribute-values '{"` + `:pk":{"S":"USER#${TARGET_USER_ID}"},":sk":{"S":"CUMULATIVE_SCORE"}` + `}' \\`);
      console.log(`     --query 'Items[0].dominantLanguage.S'`);

      console.log(`\n4️⃣  테스트 후 원복 (선택사항):`);
      console.log(`   TARGET_USER_ID=${TARGET_USER_ID} RESTORE=true npx tsx scripts/test-language-preservation.ts\n`);
    }

  } catch (error) {
    console.error(`❌ 스크립트 실행 실패:`, error);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
}
