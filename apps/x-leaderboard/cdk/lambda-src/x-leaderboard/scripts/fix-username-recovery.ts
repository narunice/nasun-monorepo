/**
 * CUMULATIVE_SCORE 데이터의 누락된 username 복구 스크립트
 * 
 * 배경: 커뮤니티 가중치 재계산 과정에서 username 필드가 손실됨
 * 목적: RECENT_ACTIVITY 데이터에서 username을 복구하여 CUMULATIVE_SCORE에 업데이트
 * 
 * 실행 방법:
 * cd cdk/lambda-src/x-leaderboard
 * npx tsx scripts/fix-username-recovery.ts
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({ region: "ap-northeast-2" });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const TABLE_NAME = "nasun-leaderboard-data";

// 관리자 계정 매핑 (하드코딩)
const ADMIN_USER_MAPPING: Record<string, string> = {
  "1503536552164556804": "overclocksalmon",
  // 필요시 추가 관리자 계정 매핑
};

interface CumulativeScoreRecord {
  userId: string;
  username?: string;
  totalScore: number;
  displayName?: string;
  profileImageUrl?: string;
}

interface RecentActivityRecord {
  pk: string;
  sk: string;
  engaging_username?: string;
  username?: string;
  user_id?: string;
}

async function fixUsernameForAllUsers() {
  console.log("🔧 CUMULATIVE_SCORE 데이터의 누락된 username 복구 시작");
  console.log(`📅 실행 시간: ${new Date().toISOString()}`);
  
  // 1. 모든 CUMULATIVE_SCORE 데이터 조회
  console.log("📊 1단계: 모든 CUMULATIVE_SCORE 데이터 조회");
  let lastEvaluatedKey;
  const allScores: CumulativeScoreRecord[] = [];
  
  do {
    const result: any = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "sk = :sk",
      ExpressionAttributeValues: {
        ":sk": "CUMULATIVE_SCORE"
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));
    
    if (result.Items) {
      allScores.push(...result.Items as CumulativeScoreRecord[]);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    console.log(`  📋 진행 상황: ${allScores.length}개 레코드 수집됨`);
  } while (lastEvaluatedKey);
  
  console.log(`✅ 총 ${allScores.length}개의 CUMULATIVE_SCORE 레코드 발견`);
  
  // 2. username이 누락된 사용자들 찾기
  console.log("🔍 2단계: username 누락 사용자 분류");
  const usersNeedingFix = allScores.filter(score => 
    !score.username || 
    score.username === score.userId || 
    score.username === "undefined"
  );
  
  const usersWithUsername = allScores.filter(score => 
    score.username && 
    score.username !== score.userId && 
    score.username !== "undefined"
  );
  
  console.log(`  ⚠️  username 복구 필요: ${usersNeedingFix.length}명`);
  console.log(`  ✅ username 정상: ${usersWithUsername.length}명`);
  
  if (usersNeedingFix.length === 0) {
    console.log("🎉 모든 사용자의 username이 정상입니다. 복구 작업이 필요하지 않습니다.");
    return;
  }
  
  // 3. 각 사용자별로 username 복구
  console.log("🛠️  3단계: username 복구 작업 시작");
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < usersNeedingFix.length; i++) {
    const score = usersNeedingFix[i];
    const progress = `[${i + 1}/${usersNeedingFix.length}]`;
    
    console.log(`${progress} 🔍 사용자 ${score.userId} username 복구 시도`);
    
    try {
      let recoveredUsername: string | null = null;
      
      // 3.1. 관리자 계정 우선 확인
      if (ADMIN_USER_MAPPING[score.userId]) {
        recoveredUsername = ADMIN_USER_MAPPING[score.userId];
        console.log(`  🔧 관리자 계정 매핑: ${score.userId} → ${recoveredUsername}`);
      } else {
        // 3.2. RECENT_ACTIVITY 데이터에서 username 조회
        const activityResult = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk_prefix)",
          ExpressionAttributeValues: {
            ":pk": `USER#${score.userId}`,
            ":sk_prefix": "RECENT_ACTIVITY#"
          },
          Limit: 5, // 여러 개 조회해서 신뢰성 높이기
          ScanIndexForward: false // 최신부터
        }));
        
        if (activityResult.Items && activityResult.Items.length > 0) {
          // 가장 신뢰할 만한 username 찾기
          for (const activity of activityResult.Items as RecentActivityRecord[]) {
            const candidateUsername = activity.engaging_username || activity.username;
            if (candidateUsername && 
                candidateUsername !== score.userId && 
                candidateUsername !== "undefined" &&
                candidateUsername.length > 0) {
              recoveredUsername = candidateUsername;
              break;
            }
          }
          
          if (recoveredUsername) {
            console.log(`  ✅ RECENT_ACTIVITY에서 username 발견: ${recoveredUsername}`);
          } else {
            console.log(`  ⚠️  RECENT_ACTIVITY에 유효한 username 없음`);
          }
        } else {
          console.log(`  ❌ RECENT_ACTIVITY 데이터 없음`);
        }
      }
      
      // 3.3. username 업데이트
      if (recoveredUsername && recoveredUsername !== score.userId) {
        await docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: {
            pk: `USER#${score.userId}`,
            sk: "CUMULATIVE_SCORE"
          },
          UpdateExpression: "SET username = :username, lastUsernameUpdate = :timestamp",
          ExpressionAttributeValues: {
            ":username": recoveredUsername,
            ":timestamp": new Date().toISOString()
          }
        }));
        
        console.log(`  🎉 username 복구 성공: ${score.userId} → ${recoveredUsername}`);
        successCount++;
      } else {
        console.log(`  ❌ username 복구 실패: ${score.userId} (유효한 username을 찾을 수 없음)`);
        failCount++;
      }
      
    } catch (error) {
      console.log(`  💥 username 복구 중 오류: ${score.userId}`, error instanceof Error ? error.message : error);
      failCount++;
    }
    
    // 진행 상황 중간 보고
    if ((i + 1) % 10 === 0 || i === usersNeedingFix.length - 1) {
      console.log(`  📊 중간 집계: 성공 ${successCount}명, 실패 ${failCount}명`);
    }
  }
  
  // 4. 최종 결과 리포트
  console.log("\n🎯 최종 결과 리포트:");
  console.log(`  📈 복구 성공: ${successCount}명`);
  console.log(`  📉 복구 실패: ${failCount}명`);
  console.log(`  📊 전체 처리: ${usersNeedingFix.length}명`);
  console.log(`  ⏱️  완료 시간: ${new Date().toISOString()}`);
  
  if (successCount > 0) {
    console.log("\n✅ username 복구가 완료되었습니다!");
    console.log("🔄 이제 리더보드를 재생성하여 변경사항을 반영하세요:");
    console.log("aws lambda invoke --function-name nasun-leaderboard-generator /tmp/result.json");
  } else {
    console.log("\n⚠️  복구된 username이 없습니다. 추가 조사가 필요할 수 있습니다.");
  }
}

// 메인 실행
if (require.main === module) {
  fixUsernameForAllUsers()
    .then(() => {
      console.log("\n🏁 스크립트 실행 완료");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 스크립트 실행 중 오류:", error);
      process.exit(1);
    });
}