/**
 * Phase 2: 데이터 백업 및 문제 범위 분석 스크립트
 *
 * 목적:
 * 1. 전체 CUMULATIVE_SCORE 백업
 * 2. 리더보드 스냅샷 백업
 * 3. 2배 중복 사용자 분석
 * 4. 누락 사용자 확인
 */

import { DynamoDBClient, ScanCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import * as fs from 'fs';
import * as path from 'path';

const ddbClient = new DynamoDBClient({ region: "ap-northeast-2" });
const TABLE_NAME = "nasun-leaderboard-data";

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
  event1Score?: number;
  event2Score?: number;
  targetBookmarkCount?: number;
  targetRetweetCount?: number;
  totalTargetBookmarkBonus?: number;
  totalTargetRetweetBonus?: number;
}

interface AnalysisReport {
  timestamp: string;
  totalUsers: number;
  suspectedDoubledUsers: Array<{
    userId: string;
    username: string;
    totalScore: number;
    totalLikes: number;
    suspectedOriginalScore: number;
    reason: string;
  }>;
  missingDataUsers: Array<{
    userId: string;
    username?: string;
    missingFields: string[];
  }>;
  statistics: {
    averageScore: number;
    medianScore: number;
    maxScore: number;
    minScore: number;
    totalScoreSum: number;
  };
}

async function backupCumulativeScores(): Promise<CumulativeScoreRecord[]> {
  console.log("📦 CUMULATIVE_SCORE 데이터 백업 시작...");

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

  console.log(`✅ CUMULATIVE_SCORE 백업 완료: ${allScores.length}개 레코드`);
  return allScores;
}

async function backupLeaderboardSnapshot(): Promise<any[]> {
  console.log("📸 리더보드 스냅샷 백업 시작...");

  const allEntries: any[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const result = await ddbClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: {
        ":pk": { S: "LEADERBOARD#CUMULATIVE" },
        ":sk": { S: "RANK#" }
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));

    if (result.Items) {
      const entries = result.Items.map(item => unmarshall(item));
      allEntries.push(...entries);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  console.log(`✅ 리더보드 스냅샷 백업 완료: ${allEntries.length}개 엔트리`);
  return allEntries;
}

function analyzeSuspectedDoubledScores(scores: CumulativeScoreRecord[]): AnalysisReport['suspectedDoubledUsers'] {
  console.log("🔍 2배 중복 의심 사용자 분석 중...");

  const suspectedDoubled: AnalysisReport['suspectedDoubledUsers'] = [];

  // 점수 분포 분석을 위한 통계
  const sortedScores = scores.map(s => s.totalScore).sort((a, b) => a - b);
  const median = sortedScores[Math.floor(sortedScores.length / 2)] || 0;
  const q3 = sortedScores[Math.floor(sortedScores.length * 0.75)] || 0;
  const iqr = q3 - median;
  const upperBound = q3 + (1.5 * iqr);

  console.log(`  📊 점수 분포 통계:`);
  console.log(`     중앙값: ${median.toFixed(2)}`);
  console.log(`     3사분위수: ${q3.toFixed(2)}`);
  console.log(`     이상치 상한선: ${upperBound.toFixed(2)}`);

  for (const score of scores) {
    const reasons: string[] = [];

    // 1. 활동 수 대비 점수가 비정상적으로 높음
    const totalActivities =
      (score.totalLikes || 0) +
      (score.totalReplies || 0) +
      (score.totalReposts || 0) +
      (score.totalQuotes || 0) +
      (score.totalMentions || 0);

    const avgScorePerActivity = totalActivities > 0 ? score.totalScore / totalActivities : 0;

    // 일반적인 활동당 점수: likes=1, replies=5, reposts=3, quotes=4, mentions=5
    // 평균적으로 2-3점 정도가 정상, 6점 이상이면 의심
    if (avgScorePerActivity > 6) {
      reasons.push(`활동당 평균 ${avgScorePerActivity.toFixed(2)}점 (정상: 2-3점)`);
    }

    // 2. 통계적 이상치 (상위 1.5 IQR 초과)
    if (score.totalScore > upperBound) {
      reasons.push(`통계적 이상치 (점수: ${score.totalScore.toFixed(2)}, 상한: ${upperBound.toFixed(2)})`);
    }

    if (reasons.length > 0) {
      suspectedDoubled.push({
        userId: score.userId,
        username: score.username,
        totalScore: score.totalScore,
        totalLikes: score.totalLikes,
        suspectedOriginalScore: score.totalScore / 2,
        reason: reasons.join('; ')
      });
    }
  }

  console.log(`✅ 2배 중복 의심 사용자: ${suspectedDoubled.length}명`);
  return suspectedDoubled.sort((a, b) => b.totalScore - a.totalScore);
}

function analyzeMissingData(scores: CumulativeScoreRecord[]): AnalysisReport['missingDataUsers'] {
  console.log("🔍 데이터 누락 사용자 분석 중...");

  const missingDataUsers: AnalysisReport['missingDataUsers'] = [];

  for (const score of scores) {
    const missingFields: string[] = [];

    if (!score.username || score.username === score.userId || score.username === 'unknown') {
      missingFields.push('username');
    }

    if (score.targetBookmarkCount === undefined || score.targetBookmarkCount === null) {
      missingFields.push('targetBookmarkCount');
    }

    if (score.targetRetweetCount === undefined || score.targetRetweetCount === null) {
      missingFields.push('targetRetweetCount');
    }

    if (missingFields.length > 0) {
      missingDataUsers.push({
        userId: score.userId,
        username: score.username,
        missingFields
      });
    }
  }

  console.log(`✅ 데이터 누락 사용자: ${missingDataUsers.length}명`);
  return missingDataUsers;
}

function calculateStatistics(scores: CumulativeScoreRecord[]): AnalysisReport['statistics'] {
  console.log("📊 통계 계산 중...");

  const sortedScores = scores.map(s => s.totalScore).sort((a, b) => a - b);
  const totalScoreSum = sortedScores.reduce((sum, score) => sum + score, 0);

  return {
    averageScore: totalScoreSum / scores.length,
    medianScore: sortedScores[Math.floor(sortedScores.length / 2)] || 0,
    maxScore: sortedScores[sortedScores.length - 1] || 0,
    minScore: sortedScores[0] || 0,
    totalScoreSum
  };
}

async function main() {
  console.log("🎯 Phase 2: 데이터 백업 및 분석 시작");
  console.log("=" .repeat(60));

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(__dirname, '../backups');

  // 출력 디렉토리 생성
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // 1. CUMULATIVE_SCORE 백업
    const cumulativeScores = await backupCumulativeScores();
    const cumulativeBackupPath = path.join(outputDir, `cumulative-scores-${timestamp}.json`);
    fs.writeFileSync(cumulativeBackupPath, JSON.stringify(cumulativeScores, null, 2));
    console.log(`💾 CUMULATIVE_SCORE 백업 저장: ${cumulativeBackupPath}`);

    // 2. 리더보드 스냅샷 백업
    const leaderboardSnapshot = await backupLeaderboardSnapshot();
    const leaderboardBackupPath = path.join(outputDir, `leaderboard-snapshot-${timestamp}.json`);
    fs.writeFileSync(leaderboardBackupPath, JSON.stringify(leaderboardSnapshot, null, 2));
    console.log(`💾 리더보드 스냅샷 백업 저장: ${leaderboardBackupPath}`);

    // 3. 문제 분석
    const suspectedDoubledUsers = analyzeSuspectedDoubledScores(cumulativeScores);
    const missingDataUsers = analyzeMissingData(cumulativeScores);
    const statistics = calculateStatistics(cumulativeScores);

    // 4. 분석 리포트 생성
    const report: AnalysisReport = {
      timestamp: new Date().toISOString(),
      totalUsers: cumulativeScores.length,
      suspectedDoubledUsers,
      missingDataUsers,
      statistics
    };

    const reportPath = path.join(outputDir, `analysis-report-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 분석 리포트 저장: ${reportPath}`);

    // 5. 요약 출력
    console.log("\n" + "=".repeat(60));
    console.log("📋 분석 요약");
    console.log("=".repeat(60));
    console.log(`총 사용자 수: ${report.totalUsers}명`);
    console.log(`\n점수 통계:`);
    console.log(`  평균: ${statistics.averageScore.toFixed(2)}점`);
    console.log(`  중앙값: ${statistics.medianScore.toFixed(2)}점`);
    console.log(`  최대: ${statistics.maxScore.toFixed(2)}점`);
    console.log(`  최소: ${statistics.minScore.toFixed(2)}점`);
    console.log(`  총합: ${statistics.totalScoreSum.toFixed(2)}점`);

    console.log(`\n2배 중복 의심 사용자: ${suspectedDoubledUsers.length}명`);
    if (suspectedDoubledUsers.length > 0) {
      console.log(`  상위 5명:`);
      suspectedDoubledUsers.slice(0, 5).forEach((user, idx) => {
        console.log(`    ${idx + 1}. ${user.username} (${user.userId})`);
        console.log(`       현재 점수: ${user.totalScore.toFixed(2)}점 → 예상 원본: ${user.suspectedOriginalScore.toFixed(2)}점`);
        console.log(`       사유: ${user.reason}`);
      });
    }

    console.log(`\n데이터 누락 사용자: ${missingDataUsers.length}명`);
    if (missingDataUsers.length > 0) {
      console.log(`  샘플 10명:`);
      missingDataUsers.slice(0, 10).forEach((user, idx) => {
        console.log(`    ${idx + 1}. ${user.username || user.userId} (${user.userId})`);
        console.log(`       누락 필드: ${user.missingFields.join(', ')}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ Phase 2 완료!");
    console.log(`\n백업 파일:`);
    console.log(`  - ${cumulativeBackupPath}`);
    console.log(`  - ${leaderboardBackupPath}`);
    console.log(`  - ${reportPath}`);

  } catch (error) {
    console.error("❌ 백업/분석 실패:", error);
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

export { main as backupAndAnalyze };
