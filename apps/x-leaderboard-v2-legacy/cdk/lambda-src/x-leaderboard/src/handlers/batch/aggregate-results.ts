import { Context } from 'aws-lambda';
import { DynamoDBDocumentClient, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { getEnvConfigV2, validateEnvConfigV2 } from '../../utils/env';
import { EngagementData, AggregateResultsOutput } from '../../types/cumulative';

const region = process.env.AWS_REGION || 'ap-northeast-2';
const dynamoClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudWatchClient = new CloudWatchClient({ region });

async function saveEngagementsToV2Table(tableName: string, engagements: EngagementData[]): Promise<void> {
  if (engagements.length === 0) return;

  // Remove duplicates by using Map with composite key (pk + sk)
  const uniqueEngagements = new Map<string, EngagementData>();
  for (const e of engagements) {
    const pk = `USER#${e.engaging_user_id}`;
    const sk = `RECENT#${e.tweet_id}#${e.engagement_type}`;
    const compositeKey = `${pk}#${sk}`;
    if (!uniqueEngagements.has(compositeKey)) {
      uniqueEngagements.set(compositeKey, e);
    }
  }

  const putRequests = Array.from(uniqueEngagements.values()).map(e => ({
    PutRequest: {
      Item: {
        pk: `USER#${e.engaging_user_id}`,
        sk: `RECENT#${e.tweet_id}#${e.engagement_type}`,
        tweet_id: e.tweet_id,
        engagement_type: e.engagement_type,
        user_id: e.engaging_user_id,
        username: e.engaging_username,
        display_name: e.engaging_display_name,
        profile_image_url: e.engaging_profile_image_url,
        followers_count: e.engaging_followers_count,
        added_at: e.added_at,
        tweet_created_at: e.tweet_created_at,
        score_value: e.score_value,
        ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60)
      }
    }
  }));

  console.log(`💾 [DEDUPE] Original: ${engagements.length}, Unique: ${putRequests.length}`);

  for (let i = 0; i < putRequests.length; i += 25) {
    const batch = putRequests.slice(i, i + 25);
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [tableName]: batch }
    }));
  }
}

export const handler = async (event: any, context: Context): Promise<AggregateResultsOutput> => {
  const startTime = Date.now();
  console.log("Lambda context:", context);
  console.log("🎯 Received raw event from Parallel state:", JSON.stringify(event, null, 2));

  const allEngagements: EngagementData[] = [];
  const engagementsCollected = { likes: 0, replies: 0, reposts: 0, quotes: 0, mentions: 0, total: 0 };
  let totalApiCalls = 0;
  let collectionDate = "unknown";

  try {
    const config = getEnvConfigV2();
    validateEnvConfigV2(config);

    // 🎯 Fixed: event.parallelResults 구조 분석
    // parallelResults 구조: [ [배치1결과, 배치2결과, ...], mentionsBranch ]
    // parallelResults[0]은 Map State 출력으로 배열 안의 배열
    const parallelResults = event.parallelResults || [];
    const batchResults = parallelResults?.[0] || []; // Map State의 모든 배치 결과
    const mentionsBranch = parallelResults?.[1]; // 두 번째 브랜치 (mentions)

    console.log("📦 Branch extraction:");
    console.log(`  - batchResults length: ${Array.isArray(batchResults) ? batchResults.length : 0}`);
    console.log(`  - mentionsBranch exists: ${!!mentionsBranch}`);

    // collectionDate를 가장 신뢰할 수 있는 소스에서 추출
    // Priority 1: GetTargetTweetsResult (가장 신뢰할 수 있는 소스 - 항상 존재)
    if (event?.getTargetTweetsResult?.Payload?.collectionDate) {
      collectionDate = event.getTargetTweetsResult.Payload.collectionDate;
      console.log(`✅ collectionDate from getTargetTweetsResult: ${collectionDate}`);
    }
    // Priority 2: batchResults (passive engagement 경로)
    else if (batchResults?.[0]?.collectionDate) {
      collectionDate = batchResults[0].collectionDate;
      console.log(`✅ collectionDate from batchResults: ${collectionDate}`);
    }
    // Priority 3: mentionCollectorResult (active engagement 경로 - 경로 수정!)
    else if (mentionsBranch?.mentionCollectorResult?.Payload?.collectionDate) {
      collectionDate = mentionsBranch.mentionCollectorResult.Payload.collectionDate;
      console.log(`✅ collectionDate from mentionCollectorResult: ${collectionDate}`);
    }
    // Priority 4: highEngagementReplyResult (고참여 답글 경로)
    else if (event?.highEngagementReplyResult?.Payload?.collectionDate) {
      collectionDate = event.highEngagementReplyResult.Payload.collectionDate;
      console.log(`✅ collectionDate from highEngagementReplyResult: ${collectionDate}`);
    }
    // Fail: 에러 로깅
    else {
      console.error(`❌ CRITICAL: collectionDate를 추출할 수 없음!`);
      console.error(`Debug - event.getTargetTweetsResult: ${!!event?.getTargetTweetsResult}`);
      console.error(`Debug - batchResults length: ${Array.isArray(batchResults) ? batchResults.length : 0}`);
      console.error(`Debug - mentionsBranch keys: ${mentionsBranch ? Object.keys(mentionsBranch).join(', ') : 'null'}`);
    }

    const processCollectedData = (collectedData: any, type: keyof typeof engagementsCollected) => {
      if (collectedData && Array.isArray(collectedData) && collectedData.length > 0) {
        console.log(`  ✅ Processing ${type}: ${collectedData.length} items`);
        allEngagements.push(...collectedData);
        (engagementsCollected as any)[type] += collectedData.length;
      } else {
        console.log(`  ⚪ No ${type} data`);
      }
    };

    // 🔥 핵심 수정: 모든 배치 결과를 순회하면서 데이터 수집
    console.log("📊 Processing engagement data from all batches:");
    if (Array.isArray(batchResults) && batchResults.length > 0) {
      console.log(`🔄 Iterating through ${batchResults.length} batches...`);
      for (let i = 0; i < batchResults.length; i++) {
        const batch = batchResults[i];
        console.log(`\n  === Batch ${i + 1}/${batchResults.length} ===`);

        processCollectedData(batch.likeResult?.Payload?.likesCollected, 'likes');
        processCollectedData(batch.retweetResult?.Payload?.retweetsCollected, 'reposts');
        processCollectedData(batch.quoteResult?.Payload?.quotesCollected, 'quotes');

        // API calls 카운트
        totalApiCalls += batch.likeResult?.Payload?.apiCallsUsed || 0;
        totalApiCalls += batch.retweetResult?.Payload?.apiCallsUsed || 0;
        totalApiCalls += batch.quoteResult?.Payload?.apiCallsUsed || 0;
      }
    } else {
      console.log("⚠️ No batch results found in parallelResults[0]");
    }

    // Mentions 데이터 처리 (MentionBatchesMap 결과)
    // mentionDetailsResults는 배열: [{ Payload: { mentions: [...] } }, ...]
    const mentionDetailsResults = event.mentionDetailsResults || [];
    if (Array.isArray(mentionDetailsResults) && mentionDetailsResults.length > 0) {
      console.log(`\n  === Mentions Branch (${mentionDetailsResults.length} batches) ===`);

      for (let i = 0; i < mentionDetailsResults.length; i++) {
        const mentionBatch = mentionDetailsResults[i];
        const mentions = mentionBatch?.Payload?.mentions || [];

        if (mentions.length > 0) {
          console.log(`  ✅ Mention batch ${i + 1}: ${mentions.length} mentions`);
          allEngagements.push(...mentions);
          engagementsCollected.mentions += mentions.length;
        }

        totalApiCalls += mentionBatch?.Payload?.apiCallCount || 0;
      }

      console.log(`  📊 Total mentions collected: ${engagementsCollected.mentions}`);
    } else {
      console.log("\n  === Mentions Branch ===");
      console.log("  ⚪ No mention batches found");
    }

    // High Engagement Replies 데이터 처리
    const highEngagementReplyResult = event.highEngagementReplyResult;
    if (highEngagementReplyResult?.Payload?.repliesData) {
      console.log(`\n  === High Engagement Replies Branch ===`);
      processCollectedData(highEngagementReplyResult.Payload.repliesData, 'replies');
    } else {
      console.log("\n  === High Engagement Replies Branch ===");
      console.log("  ⚪ No high engagement replies found");
    }

    engagementsCollected.total = allEngagements.length;
    console.log(`✅ Total engagements aggregated: ${engagementsCollected.total}`);

    if (engagementsCollected.total > 0) {
      console.log(`📦 인게이지먼트 수집 완료: ${allEngagements.length}개 (DB 저장은 ScoreCalculator에서 Delta 계산 후 수행)`);
    }

    // 족적 추적 3단계: 데이터 취합 직후 engaging_tweet_lang 필드 확인
    const qpzmzmData = allEngagements.filter(e => e.engaging_user_id === '701404304683339776');
    if (qpzmzmData.length > 0) {
      console.log('[족적-qpzmzm] 3. aggregate-results: 취합 완료 후 데이터:', JSON.stringify(qpzmzmData, null, 2));
    }

    const processingTime = Date.now() - startTime;

    // Send CloudWatch metrics
    try {
      await cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: 'NASUN/StepFunctions',
        MetricData: [
          { MetricName: 'SuccessCount', Value: 1, Unit: 'Count' },
          { MetricName: 'EngagementsAggregated', Value: engagementsCollected.total, Unit: 'Count' },
          { MetricName: 'Duration', Value: processingTime, Unit: 'Milliseconds' }
        ]
      }));
    } catch (metricError) {
      console.warn('Failed to send CloudWatch metrics:', metricError);
    }

    return {
      success: true,
      collectionDate: collectionDate,
      tweetsProcessed: engagementsCollected.total > 0 ? allEngagements.map(e => e.tweet_id).filter((v, i, a) => a.indexOf(v) === i).length : 0,
      engagementsCollected,
      collectedEngagements: allEngagements,
      processingTime: `${processingTime}ms`,
      nextSteps: engagementsCollected.total > 0 ? ["점수 계산 및 리더보드 생성을 진행합니다."] : ["수집된 신규 인게이지먼트가 없어 다음 단계를 건너뜁니다."],
      executedAt: new Date().toISOString(),
    };

  } catch (error: any) {
    console.error("❌ [AGGREGATE] 치명적인 집계 오류 발생:", error);
    return {
        success: false,
        collectionDate,
        tweetsProcessed: 0,
        engagementsCollected,
        processingTime: `${Date.now() - startTime}ms`,
        nextSteps: [`오류 발생: ${error.message}`],
        executedAt: new Date().toISOString(),
    };
  }
};