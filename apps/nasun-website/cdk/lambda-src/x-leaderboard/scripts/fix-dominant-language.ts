/**
 * 기존 사용자의 dominantLanguage를 displayName 기반으로 재분류
 *
 * 실행:
 * DYNAMODB_TABLE_NAME=nasun-leaderboard-data npx tsx scripts/fix-dominant-language.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LanguageCode } from "../src/types/community";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const ddbClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "nasun-leaderboard-data";

/**
 * displayName 또는 username에서 언어 추론
 */
function inferLanguageFromText(text: string | undefined): LanguageCode {
  if (!text) return 'unknown';

  // 한글 감지
  if (/[가-힣]/.test(text)) {
    return 'ko';
  }

  // 일본어 감지 (히라가나, 가타카나, 한자)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return 'ja';
  }

  // 중국어 간체자 감지
  if (/[\u4E00-\u9FFF]/.test(text)) {
    // 일본어와 겹치므로 추가 휴리스틱 필요
    // 간단히 중국어로 분류
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

  // 기본값: 영어
  return 'en';
}

async function main() {
  console.log(`🔍 CUMULATIVE_SCORE 레코드 조회 시작...`);

  const scanResult = await ddbClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: "sk = :sk",
    ExpressionAttributeValues: {
      ":sk": "CUMULATIVE_SCORE"
    }
  }));

  const users = scanResult.Items || [];
  console.log(`📊 총 ${users.length}명 사용자 발견\n`);

  let updatedCount = 0;
  let unchangedCount = 0;
  const languageStats: Record<string, number> = {};

  for (const user of users) {
    const userId = user.userId;
    const username = user.username;
    const displayName = user.displayName;
    const currentLang = user.dominantLanguage || 'unknown';

    // displayName 우선, 없으면 username 사용
    const inferredLang = inferLanguageFromText(displayName || username);

    // 통계 수집
    languageStats[inferredLang] = (languageStats[inferredLang] || 0) + 1;

    console.log(`👤 ${username} (${userId})`);
    console.log(`   displayName: "${displayName}"`);
    console.log(`   현재: ${currentLang} → 추론: ${inferredLang}`);

    if (inferredLang === currentLang) {
      console.log(`   ✅ 변경 불필요\n`);
      unchangedCount++;
      continue;
    }

    // DynamoDB 업데이트
    try {
      await ddbClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `USER#${userId}`,
          sk: "CUMULATIVE_SCORE"
        },
        UpdateExpression: "SET dominantLanguage = :lang",
        ExpressionAttributeValues: {
          ":lang": inferredLang
        }
      }));

      console.log(`   🔄 업데이트 완료: ${currentLang} → ${inferredLang}\n`);
      updatedCount++;
    } catch (error) {
      console.error(`   ❌ 업데이트 실패:`, error);
    }
  }

  console.log(`\n✅ 작업 완료!`);
  console.log(`   - 업데이트: ${updatedCount}명`);
  console.log(`   - 변경 없음: ${unchangedCount}명`);
  console.log(`\n📊 언어 분포:`);
  Object.entries(languageStats).sort((a, b) => b[1] - a[1]).forEach(([lang, count]) => {
    console.log(`   ${lang}: ${count}명`);
  });
}

main().catch(console.error);
