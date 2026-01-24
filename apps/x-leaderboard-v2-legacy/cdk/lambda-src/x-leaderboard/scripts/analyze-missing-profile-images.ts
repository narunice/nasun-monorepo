#!/usr/bin/env npx tsx
// Phase 2.1.1: ProfileImageUrl 누락 문제 해결 - DynamoDB 스캔으로 누락 사용자 식별

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { ProfileValidators } from "../src/types/profile-v3";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.DYNAMODB_TABLE_NAME || "nasun-leaderboard-data";

interface ProfileAnalysis {
  totalUsers: number;
  usersWithProfileImage: number;
  usersWithoutProfileImage: number;
  usersWithInvalidProfileImage: number;
  profileImageCompletionRate: number;
  sampleMissingUsers: Array<{
    userId: string;
    username: string;
    displayName: string;
    profileImageUrl: any;
    followersCount?: number;
    lastUpdated: string;
  }>;
}

async function analyzeMissingProfileImages(): Promise<ProfileAnalysis> {
  console.log(`🔍 [PHASE2.1.1] 프로필 이미지 누락 분석 시작...`);
  console.log(`📋 테이블: ${tableName}`);
  
  const analysis: ProfileAnalysis = {
    totalUsers: 0,
    usersWithProfileImage: 0,
    usersWithoutProfileImage: 0,
    usersWithInvalidProfileImage: 0,
    profileImageCompletionRate: 0,
    sampleMissingUsers: []
  };

  let lastEvaluatedKey: Record<string, any> | undefined;
  let scannedCount = 0;

  do {
    try {
      const scanCommand = new ScanCommand({
        TableName: tableName,
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE"
        },
        Limit: 100, // 배치 크기
        ExclusiveStartKey: lastEvaluatedKey
      });

      const result = await dynamoClient.send(scanCommand);
      lastEvaluatedKey = result.LastEvaluatedKey;

      if (result.Items) {
        for (const item of result.Items) {
          analysis.totalUsers++;
          scannedCount++;
          
          const profileImageUrl = item.profileImageUrl;
          const userId = item.userId || 'unknown';
          const username = item.username || 'unknown';
          const displayName = item.displayName || username;

          // 프로필 이미지 상태 분석
          if (!profileImageUrl) {
            // 프로필 이미지 URL이 없는 경우
            analysis.usersWithoutProfileImage++;
            
            // 샘플 데이터 수집 (최대 20개)
            if (analysis.sampleMissingUsers.length < 20) {
              analysis.sampleMissingUsers.push({
                userId,
                username,
                displayName,
                profileImageUrl,
                followersCount: item.followersCount,
                lastUpdated: item.lastUpdated || 'unknown'
              });
            }
          } else if (!ProfileValidators.isValidProfileImageUrl(profileImageUrl)) {
            // 프로필 이미지 URL이 유효하지 않은 경우
            analysis.usersWithInvalidProfileImage++;
            
            console.log(`⚠️ 무효한 프로필 이미지 URL: ${userId} (${username}) - "${profileImageUrl}"`);
            
            // 무효한 URL도 샘플에 포함
            if (analysis.sampleMissingUsers.length < 20) {
              analysis.sampleMissingUsers.push({
                userId,
                username,
                displayName,
                profileImageUrl,
                followersCount: item.followersCount,
                lastUpdated: item.lastUpdated || 'unknown'
              });
            }
          } else {
            // 유효한 프로필 이미지 URL이 있는 경우
            analysis.usersWithProfileImage++;
          }

          // 진행 상황 로깅 (100명마다)
          if (scannedCount % 100 === 0) {
            console.log(`📊 진행 상황: ${scannedCount}명 처리 완료...`);
          }
        }
      }

    } catch (error) {
      console.error(`❌ 스캔 실패:`, error);
      break;
    }

  } while (lastEvaluatedKey);

  // 완성도 계산
  analysis.profileImageCompletionRate = analysis.totalUsers > 0 
    ? ((analysis.usersWithProfileImage / analysis.totalUsers) * 100)
    : 0;

  return analysis;
}

async function main() {
  try {
    const startTime = Date.now();
    
    const analysis = await analyzeMissingProfileImages();
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log(`\n🎯 ================ 프로필 이미지 분석 결과 ================`);
    console.log(`📊 전체 사용자: ${analysis.totalUsers.toLocaleString()}명`);
    console.log(`✅ 프로필 이미지 보유: ${analysis.usersWithProfileImage.toLocaleString()}명 (${(analysis.usersWithProfileImage / analysis.totalUsers * 100).toFixed(1)}%)`);
    console.log(`❌ 프로필 이미지 누락: ${analysis.usersWithoutProfileImage.toLocaleString()}명 (${(analysis.usersWithoutProfileImage / analysis.totalUsers * 100).toFixed(1)}%)`);
    console.log(`⚠️ 무효한 프로필 이미지: ${analysis.usersWithInvalidProfileImage.toLocaleString()}명 (${(analysis.usersWithInvalidProfileImage / analysis.totalUsers * 100).toFixed(1)}%)`);
    console.log(`📈 전체 완성도: ${analysis.profileImageCompletionRate.toFixed(1)}%`);
    
    const totalNeedingFix = analysis.usersWithoutProfileImage + analysis.usersWithInvalidProfileImage;
    console.log(`🔧 복구 필요 사용자: ${totalNeedingFix.toLocaleString()}명 (${(totalNeedingFix / analysis.totalUsers * 100).toFixed(1)}%)`);
    
    console.log(`\n⏱️ 분석 소요시간: ${(duration / 1000).toFixed(1)}초`);
    console.log(`⚡ 처리 속도: ${(analysis.totalUsers / (duration / 1000)).toFixed(1)}명/초`);

    console.log(`\n📝 누락/무효 프로필 이미지 샘플 (최대 20개):`);
    analysis.sampleMissingUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.username} (${user.userId})`);
      console.log(`     표시명: ${user.displayName}`);
      console.log(`     프로필 이미지: ${user.profileImageUrl || 'null/undefined'}`);
      console.log(`     팔로워: ${user.followersCount?.toLocaleString() || 'unknown'}명`);
      console.log(`     마지막 업데이트: ${user.lastUpdated}`);
      console.log('');
    });

    // Phase 2.1.2를 위한 추천사항
    console.log(`\n💡 Phase 2.1.2 복구 작업 추천사항:`);
    
    if (totalNeedingFix > 0) {
      const estimatedAPICallsNeeded = Math.min(totalNeedingFix, 300); // Twitter API 제한 고려
      console.log(`🔸 복구 우선순위: 팔로워 수 높은 순서로 ${estimatedAPICallsNeeded}명부터`);
      console.log(`🔸 예상 API 호출 수: ${estimatedAPICallsNeeded}회 (일일 한도 고려)`);
      console.log(`🔸 예상 복구 소요시간: ${Math.ceil(totalNeedingFix / 300)}일`);
      
      if (totalNeedingFix > 1000) {
        console.log(`⚠️ 주의: 복구 필요 사용자가 ${totalNeedingFix.toLocaleString()}명으로 많습니다. 배치 처리 권장.`);
      }
    } else {
      console.log(`🎉 모든 사용자가 유효한 프로필 이미지를 보유하고 있습니다!`);
    }

    console.log(`================================================================\n`);

  } catch (error) {
    console.error(`❌ 분석 실패:`, error);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  main();
}