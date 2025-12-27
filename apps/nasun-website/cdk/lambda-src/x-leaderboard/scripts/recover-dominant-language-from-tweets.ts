#!/usr/bin/env npx tsx
/**
 * 🔧 dominantLanguage 복구 스크립트 (RECENT# 트윗 언어 기반)
 *
 * 문제: 좋아요 수집 후 일부 사용자의 dominantLanguage가 'ko' → 'unknown'으로 변경됨
 * 원인: UserDelta 생성 시 기존 언어를 보존하지 않고, 좋아요는 lang 필드가 없어 'unknown' 설정
 * 해결: RECENT# 레코드의 실제 트윗 언어(engaging_tweet_lang)를 분석하여 정확하게 복구
 *
 * 실행 방법:
 * 1. 분석 모드 (DRY_RUN=true, 기본값):
 *    DYNAMODB_TABLE_NAME=nasun-leaderboard-data npx tsx scripts/recover-dominant-language-from-tweets.ts
 *
 * 2. 실제 복구 모드 (DRY_RUN=false):
 *    DYNAMODB_TABLE_NAME=nasun-leaderboard-data DRY_RUN=false npx tsx scripts/recover-dominant-language-from-tweets.ts
 *
 * @author Claude Code
 * @date 2025-10-17
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LanguageCode } from "../src/types/community";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const ddbClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "nasun-leaderboard-data";
const DRY_RUN = process.env.DRY_RUN !== 'false'; // 기본값: true (안전 모드)

interface UserLanguageAnalysis {
  userId: string;
  username: string;
  displayName?: string;
  currentLanguage: LanguageCode;
  inferredLanguage: LanguageCode;
  tweetLanguages: string[];
  languageDistribution: Record<string, number>;
  confidence: 'high' | 'medium' | 'low';
  shouldUpdate: boolean;
}

interface RecoveryStats {
  totalUsers: number;
  unknownLanguageUsers: number;
  analyzedUsers: number;
  recoverableUsers: number;
  recoveredUsers: number;
  unchangedUsers: number;
  failedUsers: number;
  languageDistribution: Record<LanguageCode, number>;
}

/**
 * displayName 또는 username에서 언어 추론 (fallback)
 */
function inferLanguageFromText(text: string | undefined): LanguageCode {
  if (!text) return 'unknown';

  // 한글 감지
  if (/[가-힣]/.test(text)) {
    return 'ko';
  }

  // 일본어 감지 (히라가나, 가타카나)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return 'ja';
  }

  // 중국어 감지 (한자만 있는 경우)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return 'zh';
  }

  // 한국 관련 키워드
  const lowerText = text.toLowerCase();
  const koreanKeywords = ['korea', 'korean', 'seoul', 'busan', 'kr', 'hangul'];
  if (koreanKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'ko';
  }

  // 일본 관련 키워드
  const japaneseKeywords = ['japan', 'japanese', 'tokyo', 'osaka', 'jp'];
  if (japaneseKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'ja';
  }

  // 중국 관련 키워드
  const chineseKeywords = ['china', 'chinese', 'beijing', 'shanghai', 'cn'];
  if (chineseKeywords.some(keyword => lowerText.includes(keyword))) {
    return 'zh';
  }

  return 'unknown';
}

/**
 * 사용자의 RECENT# 레코드에서 트윗 언어 수집
 */
async function getTweetLanguages(userId: string): Promise<string[]> {
  const languages: string[] = [];

  try {
    const queryResult = await ddbClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RECENT#'
      },
      ProjectionExpression: 'engaging_tweet_lang, engagement_type'
    }));

    if (queryResult.Items) {
      for (const item of queryResult.Items) {
        // reply, quote, mention만 engaging_tweet_lang 필드를 가짐
        if (item.engaging_tweet_lang &&
            (item.engagement_type === 'reply' ||
             item.engagement_type === 'quote' ||
             item.engagement_type === 'mention')) {
          languages.push(item.engaging_tweet_lang);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️ ${userId}의 트윗 언어 조회 실패:`, error);
  }

  return languages;
}

/**
 * 언어 배열에서 다수결로 dominantLanguage 결정
 */
function inferLanguageFromTweets(
  tweetLanguages: string[],
  displayName?: string,
  username?: string
): { language: LanguageCode; confidence: 'high' | 'medium' | 'low'; distribution: Record<string, number> } {

  const distribution: Record<string, number> = {};

  // 1. 트윗 언어 분포 계산
  for (const lang of tweetLanguages) {
    distribution[lang] = (distribution[lang] || 0) + 1;
  }

  // 2. 트윗 언어가 있으면 다수결
  if (tweetLanguages.length > 0) {
    const sortedLangs = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    const topLang = sortedLangs[0][0] as LanguageCode;
    const topCount = sortedLangs[0][1];
    const totalCount = tweetLanguages.length;

    // 신뢰도 계산
    const ratio = topCount / totalCount;
    let confidence: 'high' | 'medium' | 'low';

    if (ratio >= 0.7 && totalCount >= 5) {
      confidence = 'high';
    } else if (ratio >= 0.5 && totalCount >= 3) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { language: topLang, confidence, distribution };
  }

  // 3. 트윗 언어가 없으면 displayName/username 기반 추론
  const inferredFromDisplay = inferLanguageFromText(displayName);
  if (inferredFromDisplay !== 'unknown') {
    return { language: inferredFromDisplay, confidence: 'low', distribution };
  }

  const inferredFromUsername = inferLanguageFromText(username);
  if (inferredFromUsername !== 'unknown') {
    return { language: inferredFromUsername, confidence: 'low', distribution };
  }

  return { language: 'unknown', confidence: 'low', distribution };
}

/**
 * dominantLanguage='unknown' 사용자 분석
 */
async function analyzeUnknownLanguageUsers(): Promise<UserLanguageAnalysis[]> {
  console.log(`🔍 [ANALYSIS] dominantLanguage='unknown' 사용자 조회 중...`);

  const analyses: UserLanguageAnalysis[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  let scannedCount = 0;

  do {
    try {
      const scanResult = await ddbClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "sk = :sk AND dominantLanguage = :unknown",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE",
          ":unknown": "unknown"
        },
        Limit: 50,
        ExclusiveStartKey: lastEvaluatedKey
      }));

      lastEvaluatedKey = scanResult.LastEvaluatedKey;

      if (scanResult.Items) {
        for (const user of scanResult.Items) {
          scannedCount++;
          const userId = user.userId;
          const username = user.username || userId;
          const displayName = user.displayName;
          const currentLanguage = user.dominantLanguage || 'unknown';

          // 진행 상황 로깅
          if (scannedCount % 10 === 0) {
            console.log(`📊 진행: ${scannedCount}명 처리 중...`);
          }

          // 트윗 언어 수집
          const tweetLanguages = await getTweetLanguages(userId);

          // 언어 추론
          const { language: inferredLanguage, confidence, distribution } = inferLanguageFromTweets(
            tweetLanguages,
            displayName,
            username
          );

          const shouldUpdate = inferredLanguage !== 'unknown' && inferredLanguage !== currentLanguage;

          analyses.push({
            userId,
            username,
            displayName,
            currentLanguage,
            inferredLanguage,
            tweetLanguages,
            languageDistribution: distribution,
            confidence,
            shouldUpdate
          });
        }
      }

    } catch (error) {
      console.error(`❌ 스캔 실패:`, error);
      break;
    }

  } while (lastEvaluatedKey);

  console.log(`✅ [ANALYSIS] 분석 완료: ${analyses.length}명`);
  return analyses;
}

/**
 * 언어 복구 실행
 */
async function recoverLanguages(analyses: UserLanguageAnalysis[]): Promise<RecoveryStats> {
  const stats: RecoveryStats = {
    totalUsers: analyses.length,
    unknownLanguageUsers: analyses.length,
    analyzedUsers: analyses.length,
    recoverableUsers: analyses.filter(a => a.shouldUpdate).length,
    recoveredUsers: 0,
    unchangedUsers: 0,
    failedUsers: 0,
    languageDistribution: { ko: 0, en: 0, ja: 0, zh: 0, unknown: 0 }
  };

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔧 [RECOVERY] ${DRY_RUN ? 'DRY_RUN 모드' : '실제 복구 모드'}`);
  console.log(`${'='.repeat(80)}\n`);

  for (const analysis of analyses) {
    const { userId, username, displayName, currentLanguage, inferredLanguage,
            tweetLanguages, languageDistribution, confidence, shouldUpdate } = analysis;

    console.log(`\n👤 ${username} (${userId})`);
    console.log(`   표시명: "${displayName || 'N/A'}"`);
    console.log(`   현재 언어: ${currentLanguage}`);
    console.log(`   추론 언어: ${inferredLanguage} (신뢰도: ${confidence})`);
    console.log(`   트윗 언어: ${tweetLanguages.length}개 - ${JSON.stringify(languageDistribution)}`);

    if (!shouldUpdate) {
      console.log(`   ⏭️  변경 불필요 (언어 판정 실패 또는 동일)`);
      stats.unchangedUsers++;
      stats.languageDistribution[currentLanguage]++;
      continue;
    }

    console.log(`   🔄 ${currentLanguage} → ${inferredLanguage}`);

    if (DRY_RUN) {
      console.log(`   ✅ DRY_RUN: 업데이트 시뮬레이션 성공`);
      stats.recoveredUsers++;
      stats.languageDistribution[inferredLanguage]++;
    } else {
      try {
        await ddbClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${userId}`,
            sk: "CUMULATIVE_SCORE"
          },
          UpdateExpression: "SET dominantLanguage = :lang",
          ExpressionAttributeValues: {
            ":lang": inferredLanguage
          }
        }));

        console.log(`   ✅ 업데이트 완료`);
        stats.recoveredUsers++;
        stats.languageDistribution[inferredLanguage]++;
      } catch (error) {
        console.error(`   ❌ 업데이트 실패:`, error);
        stats.failedUsers++;
        stats.languageDistribution[currentLanguage]++;
      }
    }
  }

  return stats;
}

/**
 * 결과 출력
 */
function printResults(stats: RecoveryStats, analyses: UserLanguageAnalysis[]) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 복구 결과 요약`);
  console.log(`${'='.repeat(80)}\n`);

  console.log(`전체 분석 대상: ${stats.analyzedUsers}명`);
  console.log(`복구 가능: ${stats.recoverableUsers}명`);
  console.log(`복구 ${DRY_RUN ? '예정' : '완료'}: ${stats.recoveredUsers}명`);
  console.log(`변경 불필요: ${stats.unchangedUsers}명`);
  if (stats.failedUsers > 0) {
    console.log(`실패: ${stats.failedUsers}명`);
  }

  console.log(`\n📈 언어 분포 (복구 ${DRY_RUN ? '예정' : '후'}):`);
  Object.entries(stats.languageDistribution)
    .sort((a, b) => b[1] - a[1])
    .forEach(([lang, count]) => {
      if (count > 0) {
        console.log(`   ${lang}: ${count}명`);
      }
    });

  // 신뢰도별 통계
  const confidenceStats = analyses.filter(a => a.shouldUpdate).reduce((acc, a) => {
    acc[a.confidence] = (acc[a.confidence] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log(`\n🎯 신뢰도 분포 (복구 대상):`);
  Object.entries(confidenceStats).forEach(([conf, count]) => {
    console.log(`   ${conf}: ${count}명`);
  });

  // 샘플 출력
  const samples = analyses.filter(a => a.shouldUpdate).slice(0, 10);
  if (samples.length > 0) {
    console.log(`\n📝 복구 대상 샘플 (최대 10개):`);
    samples.forEach((sample, index) => {
      console.log(`\n  ${index + 1}. ${sample.username} (${sample.userId})`);
      console.log(`     표시명: "${sample.displayName || 'N/A'}"`);
      console.log(`     ${sample.currentLanguage} → ${sample.inferredLanguage} (신뢰도: ${sample.confidence})`);
      console.log(`     트윗: ${JSON.stringify(sample.languageDistribution)}`);
    });
  }

  console.log(`\n${'='.repeat(80)}\n`);

  if (DRY_RUN) {
    console.log(`💡 실제 복구를 실행하려면:`);
    console.log(`   DRY_RUN=false npx tsx scripts/recover-dominant-language-from-tweets.ts\n`);
  } else {
    console.log(`✅ 복구 완료!\n`);
  }
}

/**
 * 메인 실행
 */
async function main() {
  try {
    const startTime = Date.now();

    console.log(`🚀 dominantLanguage 복구 스크립트 시작`);
    console.log(`📋 테이블: ${TABLE_NAME}`);
    console.log(`🔧 모드: ${DRY_RUN ? 'DRY_RUN (시뮬레이션)' : '실제 복구'}\n`);

    // 1. 분석
    const analyses = await analyzeUnknownLanguageUsers();

    if (analyses.length === 0) {
      console.log(`✅ dominantLanguage='unknown' 사용자가 없습니다!`);
      return;
    }

    // 2. 복구
    const stats = await recoverLanguages(analyses);

    // 3. 결과 출력
    printResults(stats, analyses);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`⏱️  소요 시간: ${duration.toFixed(1)}초`);

  } catch (error) {
    console.error(`❌ 스크립트 실행 실패:`, error);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
}
