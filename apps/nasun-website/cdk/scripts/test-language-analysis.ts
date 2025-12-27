import * as dotenv from "dotenv";
dotenv.config();

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LeaderboardGenerator } from "../lambda-src/x-leaderboard/src/services/leaderboard-generator";
import { getEnvConfigV2 } from "../lambda-src/x-leaderboard/src/utils/env";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"; // 🆕 SecretsManagerClient 임포트

const SECRETS_MANAGER_SECRET_NAME = "nasun-twitter-tokens"; // Secrets Manager 시크릿 이름

async function loadTwitterTokensFromSecretsManager() {
  console.log("🔄 Secrets Manager에서 Twitter API 토큰 로드 중...");
  const client = new SecretsManagerClient({});

  try {
    const response = await client.send(new GetSecretValueCommand({
      SecretId: SECRETS_MANAGER_SECRET_NAME,
    }));

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      process.env.TWITTER_BEARER_TOKEN = secrets.TWITTER_BEARER_TOKEN;
      process.env.TWITTER_API_KEY = secrets.TWITTER_API_KEY;
      process.env.TWITTER_API_SECRET = secrets.TWITTER_API_SECRET;
      process.env.TWITTER_ACCESS_TOKEN = secrets.TWITTER_ACCESS_TOKEN;
      process.env.TWITTER_ACCESS_TOKEN_SECRET = secrets.TWITTER_ACCESS_TOKEN_SECRET;
      process.env.OAUTH2_CLIENT_ID = secrets.OAUTH2_CLIENT_ID;
      process.env.OAUTH2_CLIENT_SECRET = secrets.OAUTH2_CLIENT_SECRET;
      process.env.OAUTH2_REDIRECT_URI = secrets.OAUTH2_REDIRECT_URI;
      console.log("✅ Twitter API 토큰 로드 완료");
    } else {
      console.warn("⚠️ Secrets Manager에서 토큰을 찾을 수 없습니다.");
    }
  } catch (error) {
    console.error("❌ Secrets Manager 토큰 로드 실패:", error);
    throw error; // 토큰 로드 실패 시 스크립트 중단
  }
}

async function testLanguageAnalysis() {
  console.log("🚀 언어 분석 테스트 스크립트 시작");

  // 🆕 Secrets Manager에서 토큰 로드
  await loadTwitterTokensFromSecretsManager();

  const config = getEnvConfigV2();
  const ddbClient = new DynamoDBClient({});
  const generator = new LeaderboardGenerator(ddbClient, config);

  const targetUserId = process.env.TARGET_USER_ID_FOR_TEST || "701404304683339776"; // @qpzmzm

  console.log(`🔍 사용자 ${targetUserId}의 현재 프로필 상태 확인...`);
  const currentProfile = await getLeaderboardEntry(ddbClient, config.cumulativeTableName, targetUserId);
  console.log("현재 프로필:", currentProfile);

  console.log(`🔄 사용자 ${targetUserId}의 프로필 복구 로직 강제 실행...`);
  // recoverMissingProfiles는 private 메서드이므로, getAllCumulativeScores를 통해 간접적으로 호출
  // getAllCumulativeScores는 recoverMissingProfiles를 호출하고, 이는 identifyIncompleteProfiles를 통해
  // dominantLanguage가 'unknown'인 사용자를 복구 대상으로 식별할 것임.
  await generator.getAllCumulativeScores();

  console.log(`✅ 사용자 ${targetUserId}의 업데이트된 프로필 상태 확인...`);
  const updatedProfile = await getLeaderboardEntry(ddbClient, config.cumulativeTableName, targetUserId);
  console.log("업데이트된 프로필:", updatedProfile);

  console.log("✅ 언어 분석 테스트 스크립트 완료");
}

// LEADERBOARD#CUMULATIVE에서 특정 사용자의 엔트리를 조회하는 헬퍼 함수
async function getLeaderboardEntry(ddbClient: DynamoDBClient, tableName: string, userId: string) {
  const allItems: any[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const result = await ddbClient.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: "pk = :pk AND userId = :userId",
      ExpressionAttributeValues: {
        ":pk": { S: "LEADERBOARD#CUMULATIVE" },
        ":userId": { S: userId }
      },
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (result.Items) {
      allItems.push(...result.Items.map(item => unmarshall(item)));
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (allItems.length > 0) {
    return allItems[0];
  } else {
    return null;
  }
}

testLanguageAnalysis().catch(console.error);
