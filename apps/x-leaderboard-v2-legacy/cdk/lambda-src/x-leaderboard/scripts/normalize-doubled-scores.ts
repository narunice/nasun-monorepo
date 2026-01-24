/**
 * Phase 3: 점수 정규화 스크립트 (2배 중복 제거)
 *
 * 목적:
 * - 2배로 부풀려진 점수를 원래대로 복구 (1/2로 조정)
 * - 모든 점수 관련 필드 정규화
 *
 * 안전장치:
 * - DRY_RUN 모드 지원
 * - 배치별 진행 상황 로깅
 * - 롤백용 원본 데이터 저장
 */

import { DynamoDBClient, ScanCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import * as fs from 'fs';
import * as path from 'path';

const ddbClient = new DynamoDBClient({ region: "ap-northeast-2" });
const TABLE_NAME = "nasun-leaderboard-data";
const DRY_RUN = process.env.DRY_RUN === 'true';

interface CumulativeScoreRecord {
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
  totalTargetRetweetBonus?: number;
  event1Score?: number;
  event2Score?: number;
  event1Activities?: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
  event2Activities?: {
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
    mentions: number;
  };
  [key: string]: any;
}

async function loadAllCumulativeScores(): Promise<CumulativeScoreRecord[]> {
  console.log("📦 CUMULATIVE_SCORE 데이터 로드 중...");

  const allScores: CumulativeScoreRecord[] = [];
  let lastEvaluatedKey: any = undefined;
  let pageCount = 0;

  do {
    const result = await ddbClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "sk = :sk",
      ExpressionAttributeValues: {
        ":sk": { S: "CUMULATIVE_SCORE" }
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));

    if (result.Items) {
      const scores = result.Items.map(item => unmarshall(item) as CumulativeScoreRecord);
      allScores.push(...scores);
      pageCount++;
      console.log(`  📄 Page ${pageCount}: ${scores.length}개 레코드 (누적: ${allScores.length}개)`);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ 데이터 로드 완료: ${allScores.length}개 레코드`);
  return allScores;
}

function normalizeScore(score: CumulativeScoreRecord): CumulativeScoreRecord {
  const normalized = { ...score };

  // 모든 점수 관련 필드를 1/2로 조정
  normalized.totalScore = score.totalScore / 2;
  normalized.totalLikes = Math.round(score.totalLikes / 2);
  normalized.totalReplies = Math.round(score.totalReplies / 2);
  normalized.totalReposts = Math.round(score.totalReposts / 2);
  normalized.totalQuotes = Math.round(score.totalQuotes / 2);
  normalized.totalMentions = Math.round(score.totalMentions / 2);

  // 보너스 점수도 1/2로 조정
  if (score.totalTargetBookmarkBonus !== undefined) {
    normalized.totalTargetBookmarkBonus = score.totalTargetBookmarkBonus / 2;
  }
  if (score.totalTargetRetweetBonus !== undefined) {
    normalized.totalTargetRetweetBonus = score.totalTargetRetweetBonus / 2;
  }

  // 이벤트 점수도 1/2로 조정
  if (score.event1Score !== undefined) {
    normalized.event1Score = score.event1Score / 2;
  }
  if (score.event2Score !== undefined) {
    normalized.event2Score = score.event2Score / 2;
  }

  // 이벤트 활동 카운트도 1/2로 조정
  if (score.event1Activities) {
    normalized.event1Activities = {
      likes: Math.round(score.event1Activities.likes / 2),
      replies: Math.round(score.event1Activities.replies / 2),
      reposts: Math.round(score.event1Activities.reposts / 2),
      quotes: Math.round(score.event1Activities.quotes / 2),
      mentions: Math.round(score.event1Activities.mentions / 2)
    };
  }

  if (score.event2Activities) {
    normalized.event2Activities = {
      likes: Math.round(score.event2Activities.likes / 2),
      replies: Math.round(score.event2Activities.replies / 2),
      reposts: Math.round(score.event2Activities.reposts / 2),
      quotes: Math.round(score.event2Activities.quotes / 2),
      mentions: Math.round(score.event2Activities.mentions / 2)
    };
  }

  // 타임스탬프 업데이트
  normalized.lastUpdated = new Date().toISOString();
  normalized.normalizedAt = new Date().toISOString();
  normalized.normalizationReason = "2배 중복 카운팅 수정";

  return normalized;
}

async function updateBatch(batch: CumulativeScoreRecord[]): Promise<void> {
  const writeRequests = batch.map(score => ({
    PutRequest: {
      Item: marshall(score, { removeUndefinedValues: true })
    }
  }));

  if (DRY_RUN) {
    console.log(`  [DRY RUN] 배치 업데이트 시뮬레이션: ${batch.length}개 레코드`);
    return;
  }

  await ddbClient.send(new BatchWriteItemCommand({
    RequestItems: {
      [TABLE_NAME]: writeRequests
    }
  }));
}

async function main() {
  console.log("🎯 Phase 3: 점수 정규화 시작");
  console.log("=" .repeat(60));
  console.log(`모드: ${DRY_RUN ? '🔍 DRY RUN (시뮬레이션)' : '⚠️  LIVE (실제 수정)'}`);
  console.log("=".repeat(60));

  if (!DRY_RUN) {
    console.log("\n⚠️  경고: 실제 데이터를 수정합니다!");
    console.log("⚠️  계속하려면 10초 대기 중...\n");
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(__dirname, '../backups');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 1. 모든 CUMULATIVE_SCORE 로드
    const allScores = await loadAllCumulativeScores();

    // 2. 정규화 전 통계
    const beforeStats = {
      totalUsers: allScores.length,
      totalScoreSum: allScores.reduce((sum, s) => sum + s.totalScore, 0),
      averageScore: allScores.reduce((sum, s) => sum + s.totalScore, 0) / allScores.length,
      maxScore: Math.max(...allScores.map(s => s.totalScore)),
      minScore: Math.min(...allScores.map(s => s.totalScore))
    };

    console.log("\n📊 정규화 전 통계:");
    console.log(`  총 사용자: ${beforeStats.totalUsers}명`);
    console.log(`  총 점수 합계: ${beforeStats.totalScoreSum.toFixed(2)}점`);
    console.log(`  평균 점수: ${beforeStats.averageScore.toFixed(2)}점`);
    console.log(`  최대 점수: ${beforeStats.maxScore.toFixed(2)}점`);
    console.log(`  최소 점수: ${beforeStats.minScore.toFixed(2)}점`);

    // 3. 모든 점수 정규화 (1/2로 조정)
    console.log("\n🔧 점수 정규화 중...");
    const normalizedScores = allScores.map(normalizeScore);

    // 4. 정규화 후 통계
    const afterStats = {
      totalUsers: normalizedScores.length,
      totalScoreSum: normalizedScores.reduce((sum, s) => sum + s.totalScore, 0),
      averageScore: normalizedScores.reduce((sum, s) => sum + s.totalScore, 0) / normalizedScores.length,
      maxScore: Math.max(...normalizedScores.map(s => s.totalScore)),
      minScore: Math.min(...normalizedScores.map(s => s.totalScore))
    };

    console.log("\n📊 정규화 후 통계:");
    console.log(`  총 사용자: ${afterStats.totalUsers}명`);
    console.log(`  총 점수 합계: ${afterStats.totalScoreSum.toFixed(2)}점 (변화: ${((afterStats.totalScoreSum / beforeStats.totalScoreSum - 1) * 100).toFixed(1)}%)`);
    console.log(`  평균 점수: ${afterStats.averageScore.toFixed(2)}점 (변화: ${((afterStats.averageScore / beforeStats.averageScore - 1) * 100).toFixed(1)}%)`);
    console.log(`  최대 점수: ${afterStats.maxScore.toFixed(2)}점 (변화: ${((afterStats.maxScore / beforeStats.maxScore - 1) * 100).toFixed(1)}%)`);
    console.log(`  최소 점수: ${afterStats.minScore.toFixed(2)}점 (변화: ${((afterStats.minScore / beforeStats.minScore - 1) * 100).toFixed(1)}%)`);

    // 5. 샘플 확인 (상위 5명)
    const sortedNormalized = normalizedScores.sort((a, b) => b.totalScore - a.totalScore);
    console.log("\n📋 정규화 샘플 (상위 5명):");
    sortedNormalized.slice(0, 5).forEach((score, idx) => {
      const original = allScores.find(s => s.userId === score.userId)!;
      console.log(`  ${idx + 1}. ${score.username} (${score.userId})`);
      console.log(`     ${original.totalScore.toFixed(2)}점 → ${score.totalScore.toFixed(2)}점 (${original.totalLikes}→${score.totalLikes} likes, ${original.totalReplies}→${score.totalReplies} replies)`);
    });

    // 6. 롤백용 원본 데이터 저장
    const rollbackPath = path.join(outputDir, `rollback-before-normalization-${timestamp}.json`);
    fs.writeFileSync(rollbackPath, JSON.stringify(allScores, null, 2));
    console.log(`\n💾 롤백용 원본 데이터 저장: ${rollbackPath}`);

    // 7. DynamoDB 업데이트 (배치 처리)
    console.log("\n📝 DynamoDB 업데이트 중...");
    const batchSize = 25; // DynamoDB BatchWrite 제한
    let processedCount = 0;

    for (let i = 0; i < normalizedScores.length; i += batchSize) {
      const batch = normalizedScores.slice(i, i + batchSize);
      await updateBatch(batch);
      processedCount += batch.length;
      console.log(`  진행: ${processedCount}/${normalizedScores.length} (${((processedCount / normalizedScores.length) * 100).toFixed(1)}%)`);
    }

    // 8. 결과 저장
    const resultPath = path.join(outputDir, `normalization-result-${timestamp}.json`);
    fs.writeFileSync(resultPath, JSON.stringify({
      mode: DRY_RUN ? 'DRY_RUN' : 'LIVE',
      timestamp: new Date().toISOString(),
      beforeStats,
      afterStats,
      processedUsers: normalizedScores.length,
      rollbackFile: rollbackPath
    }, null, 2));
    console.log(`\n💾 결과 저장: ${resultPath}`);

    console.log("\n" + "=".repeat(60));
    if (DRY_RUN) {
      console.log("✅ Phase 3 시뮬레이션 완료!");
      console.log("\n실제 수정을 실행하려면:");
      console.log("  DRY_RUN=false npx tsx scripts/normalize-doubled-scores.ts");
    } else {
      console.log("✅ Phase 3 완료! 점수 정규화 성공!");
      console.log("\n롤백이 필요한 경우:");
      console.log(`  롤백 파일: ${rollbackPath}`);
    }

  } catch (error) {
    console.error("❌ 점수 정규화 실패:", error);
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

export { main as normalizeScores };
