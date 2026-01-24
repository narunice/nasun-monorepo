// V2 누적 점수 시스템 - 점수 관리 서비스

import { DynamoDBDocumentClient, GetCommand, PutCommand, BatchWriteCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { UserDelta } from "./delta-calculator";
import { CumulativeUserScore } from "../types/cumulative";
import { CommunityType } from "../types/community";
import { ProfileValidators } from "../types/profile";
import { getEnvConfigV2 } from "../utils/env";

export interface ScoreUpdateResult {
  updatedUsers: number;
  totalScoreChanges: number;
  newUsers: number;
  updatedUserIds: string[];
  errors: string[];
  communityStats?: {
    koreanUsers: number;
    globalUsers: number;
    averageWeight: number;
    totalWeightedScore: number;
  };
}

export class CumulativeScoreManager {
  private dynamoClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(dynamoClient: DynamoDBDocumentClient, tableName: string) {
    this.dynamoClient = dynamoClient;
    this.tableName = tableName;
  }

  /**
   * 사용자 Delta를 기반으로 누적 점수 업데이트
   * @param userDeltas 사용자별 변화량
   * @param updateDate 업데이트 날짜
   * @param forceRecalculation true면 기존 점수를 덮어쓰기, false면 누적 (기본값: false)
   * @returns 업데이트 결과
   */
  async updateCumulativeScores(userDeltas: UserDelta[], updateDate: string, forceRecalculation: boolean = false): Promise<ScoreUpdateResult> {
    console.log(`📊 누적 점수 업데이트 시작 - ${userDeltas.length}명 처리`);
    
    const result: ScoreUpdateResult = {
      updatedUsers: 0,
      totalScoreChanges: 0,
      newUsers: 0,
      updatedUserIds: [],
      errors: [],
      communityStats: {
        koreanUsers: 0,
        globalUsers: 0,
        averageWeight: 0,
        totalWeightedScore: 0
      }
    };

    // 커뮤니티 통계 계산용 변수
    let totalWeightSum = 0;
    let weightedScoreSum = 0;

    // 각 사용자별로 점수 업데이트 처리
    for (const userDelta of userDeltas) {
      try {
        console.log(`👤 처리 중: ${userDelta.username} (${userDelta.userId}) - 점수 변화: ${userDelta.scoreChange}`);

        const updateResult = await this.updateUserCumulativeScore(userDelta, updateDate, forceRecalculation);
        
        result.updatedUsers++;
        result.totalScoreChanges += Math.abs(userDelta.scoreChange);
        result.updatedUserIds.push(userDelta.userId);
        
        if (updateResult.isNewUser) {
          result.newUsers++;
        }

        // 커뮤니티 통계 업데이트
        if (userDelta.communityType) {
          if (userDelta.communityType === 'korean') {
            result.communityStats!.koreanUsers++;
          } else {
            result.communityStats!.globalUsers++;
          }
        }
        
        if (userDelta.communityWeight) {
          totalWeightSum += userDelta.communityWeight;
          weightedScoreSum += userDelta.scoreChange;
        }

        console.log(`  ✅ 완료 - 현재 총점: ${updateResult.newTotalScore}${userDelta.communityWeight ? ` (가중치: ${userDelta.communityWeight})` : ''}`);

      } catch (error: any) {
        console.error(`❌ 사용자 ${userDelta.userId} 점수 업데이트 실패:`, error);
        result.errors.push(`User ${userDelta.userId}: ${error.message}`);
      }
    }

    // 커뮤니티 통계 최종 계산
    if (result.communityStats && result.updatedUsers > 0) {
      result.communityStats.averageWeight = totalWeightSum / result.updatedUsers;
      result.communityStats.totalWeightedScore = weightedScoreSum;
    }

    // 주간 점수 스냅샷도 함께 저장
    await this.saveWeeklySnapshots(userDeltas, updateDate);

    // 커뮤니티 가중치 감사 로깅
    await this.logCommunityWeightAudit(userDeltas, updateDate);

    console.log(`🎉 누적 점수 업데이트 완료:`);
    console.log(`  - 업데이트된 사용자: ${result.updatedUsers}명`);
    console.log(`  - 신규 사용자: ${result.newUsers}명`);
    console.log(`  - 총 점수 변화량: ${result.totalScoreChanges}`);
    console.log(`  - 오류: ${result.errors.length}개`);
    
    if (result.communityStats) {
      console.log(`  - 한국 커뮤니티: ${result.communityStats.koreanUsers}명`);
      console.log(`  - 글로벌 커뮤니티: ${result.communityStats.globalUsers}명`);
      console.log(`  - 평균 가중치: ${result.communityStats.averageWeight.toFixed(2)}`);
    }

    return result;
  }

  /**
   * 개별 사용자의 누적 점수 업데이트
   */
  private async updateUserCumulativeScore(userDelta: UserDelta, updateDate: string, forceRecalculation: boolean = false): Promise<{
    isNewUser: boolean;
    newTotalScore: number;
    previousScore: number;
  }> {
    // 기존 누적 점수 조회
    const existingScoreResult = await this.dynamoClient.send(new GetCommand({
      TableName: this.tableName,
      Key: {
        pk: `USER#${userDelta.userId}`,
        sk: "CUMULATIVE_SCORE"
      }
    }));

    const isNewUser = !existingScoreResult.Item;
    let currentScore: CumulativeUserScore;

    if (isNewUser) {
      // 신규 사용자 - 초기 점수 생성
      console.log(`  🆕 신규 사용자 생성: ${userDelta.username}`);
      currentScore = {
        pk: `USER#${userDelta.userId}`,
        sk: "CUMULATIVE_SCORE",
        userId: userDelta.userId,
        username: userDelta.username,
        displayName: userDelta.displayName || userDelta.username,
        totalScore: 0,
        totalLikes: 0,
        totalReplies: 0,
        totalReposts: 0,
        totalQuotes: 0,
        totalMentions: 0,
        firstActivity: updateDate,
        lastUpdated: new Date().toISOString(),
        version: "v2"
      };
    } else {
      // 기존 사용자 - 현재 점수 로드
      currentScore = existingScoreResult.Item as CumulativeUserScore;
    }

    const previousScore = currentScore.totalScore;

    // 🎯 이벤트 기간 확인 (EVENT1/EVENT2) - RESTORED from commit 3b64e43
    const config = getEnvConfigV2();
    const isInEvent1 = this.isDateInRange(updateDate, config.event1StartDate, config.event1EndDate);
    const isInEvent2 = this.isDateInRange(updateDate, config.event2StartDate, config.event2EndDate);

    // 점수 업데이트 - forceRecalculation 플래그에 따라 덮어쓰기 vs 누적
    if (forceRecalculation) {
      // 🔥 재계산 모드: 기존 점수 무시하고 새로 계산된 값으로 덮어쓰기 (중복 계산 방지)
      console.log(`🔄 [RECALC_OVERWRITE] ${userDelta.userId}: ${currentScore.totalScore} → ${userDelta.scoreChange}`);
      currentScore.totalScore = userDelta.scoreChange;
      currentScore.totalLikes = userDelta.likesChange;
      currentScore.totalReplies = userDelta.repliesChange;
      currentScore.totalReposts = userDelta.repostsChange;
      currentScore.totalQuotes = userDelta.quotesChange;
      currentScore.totalMentions = userDelta.mentionsChange;
    } else {
      // ✅ 일반 모드: 점수 누적
      currentScore.totalScore += userDelta.scoreChange;
      currentScore.totalLikes += userDelta.likesChange;
      currentScore.totalReplies += userDelta.repliesChange;
      currentScore.totalReposts += userDelta.repostsChange;
      currentScore.totalQuotes += userDelta.quotesChange;
      currentScore.totalMentions += userDelta.mentionsChange;
    }



    // 🔧 Phase 1.3.1: 프로필 보존 로직 - 기존 유효 정보가 있으면 새 정보가 null/무효인 경우 보존
    
    // 사용자명 업데이트 (개선된 로직)
    if (userDelta.username && userDelta.username !== 'unknown' && ProfileValidators.isValidUsername(userDelta.username)) {
      // 새로운 유효한 사용자명이 있으면 업데이트
      if (currentScore.username !== userDelta.username) {
        console.log(`  🔄 [PROFILE_PRESERVE] 사용자명 업데이트: "${currentScore.username}" → "${userDelta.username}" (사용자: ${userDelta.userId})`);
        currentScore.username = userDelta.username;
      }
    } else if (!currentScore.username || currentScore.username === 'unknown' || !ProfileValidators.isValidUsername(currentScore.username)) {
      // 기존 사용자명이 없거나 무효한 경우에만 업데이트 시도
      if (userDelta.username && userDelta.username !== 'unknown') {
        console.log(`  ⚠️ [PROFILE_PRESERVE] 사용자명 부분 업데이트: "${currentScore.username || 'N/A'}" → "${userDelta.username}" (사용자: ${userDelta.userId})`);
        currentScore.username = userDelta.username;
      }
    } else {
      // 기존에 유효한 사용자명이 있고, 새 정보가 null/무효하면 기존 값 보존
      if (userDelta.username === 'unknown' || !ProfileValidators.isValidUsername(userDelta.username)) {
        console.log(`  🛡️ [PROFILE_PRESERVE] 사용자명 보존: "${currentScore.username}" (새 값이 무효: "${userDelta.username}") (사용자: ${userDelta.userId})`);
      }
    }
    
    // 표시명 업데이트 (개선된 로직)
    if (userDelta.displayName && userDelta.displayName !== 'unknown' && ProfileValidators.isValidDisplayName(userDelta.displayName)) {
      // 새로운 유효한 표시명이 있으면 업데이트
      if (currentScore.displayName !== userDelta.displayName) {
        console.log(`  🔄 [PROFILE_PRESERVE] 표시명 업데이트: "${currentScore.displayName}" → "${userDelta.displayName}" (사용자: ${userDelta.userId})`);
        currentScore.displayName = userDelta.displayName;
      }
    } else if (!currentScore.displayName || currentScore.displayName === 'unknown' || !ProfileValidators.isValidDisplayName(currentScore.displayName)) {
      // 기존 표시명이 없거나 무효한 경우에만 업데이트 시도
      if (userDelta.displayName && userDelta.displayName !== 'unknown') {
        console.log(`  ⚠️ [PROFILE_PRESERVE] 표시명 부분 업데이트: "${currentScore.displayName || 'N/A'}" → "${userDelta.displayName}" (사용자: ${userDelta.userId})`);
        currentScore.displayName = userDelta.displayName;
      }
    } else {
      // 기존에 유효한 표시명이 있고, 새 정보가 null/무효하면 기존 값 보존
      if (userDelta.displayName === 'unknown' || !ProfileValidators.isValidDisplayName(userDelta.displayName)) {
        console.log(`  🛡️ [PROFILE_PRESERVE] 표시명 보존: "${currentScore.displayName}" (새 값이 무효: "${userDelta.displayName}") (사용자: ${userDelta.userId})`);
      }
    }

    // 🔧 Phase 1.3.1: 프로필 이미지 URL 보존 로직
    const currentProfileImageUrl = (currentScore as any).profileImageUrl;
    if (userDelta.profileImageUrl && ProfileValidators.isValidProfileImageUrl(userDelta.profileImageUrl)) {
      // 새로운 유효한 프로필 이미지가 있으면 업데이트
      if (currentProfileImageUrl !== userDelta.profileImageUrl) {
        console.log(`  🔄 [PROFILE_PRESERVE] 프로필 이미지 업데이트: "${currentProfileImageUrl || 'N/A'}" → "${userDelta.profileImageUrl}" (사용자: ${userDelta.userId})`);
        (currentScore as any).profileImageUrl = userDelta.profileImageUrl;
      }
    } else if (!currentProfileImageUrl || !ProfileValidators.isValidProfileImageUrl(currentProfileImageUrl)) {
      // 기존 프로필 이미지가 없거나 무효한 경우에만 업데이트 시도
      if (userDelta.profileImageUrl) {
        console.log(`  ⚠️ [PROFILE_PRESERVE] 프로필 이미지 부분 업데이트: "${currentProfileImageUrl || 'N/A'}" → "${userDelta.profileImageUrl}" (사용자: ${userDelta.userId})`);
        (currentScore as any).profileImageUrl = userDelta.profileImageUrl;
      }
    } else {
      // 기존에 유효한 프로필 이미지가 있고, 새 정보가 무효하면 기존 값 보존
      if (!ProfileValidators.isValidProfileImageUrl(userDelta.profileImageUrl)) {
        console.log(`  🛡️ [PROFILE_PRESERVE] 프로필 이미지 보존: "${currentProfileImageUrl}" (새 값이 무효: "${userDelta.profileImageUrl}") (사용자: ${userDelta.userId})`);
      }
    }

    // 🔧 Phase 1.3.1: 팔로워 수 보존 로직 (개선된 버전)
    const currentFollowersCount = (currentScore as any).followersCount;
    if (userDelta.followersCount !== undefined && ProfileValidators.isValidFollowersCount(userDelta.followersCount)) {
      // 새로운 유효한 팔로워 수가 있으면 업데이트 (0도 유효한 값)
      if (currentFollowersCount !== userDelta.followersCount) {
        console.log(`  🔄 [PROFILE_PRESERVE] 팔로워 수 업데이트: ${currentFollowersCount || 'N/A'} → ${userDelta.followersCount} (사용자: ${userDelta.userId})`);
        (currentScore as any).followersCount = userDelta.followersCount;
        (currentScore as any).followersCountUpdatedAt = new Date().toISOString();
      }
    } else if (currentFollowersCount === undefined || !ProfileValidators.isValidFollowersCount(currentFollowersCount)) {
      // 기존 팔로워 수가 없거나 무효한 경우에만 업데이트 시도
      if (userDelta.followersCount !== undefined && userDelta.followersCount >= 0) {
        console.log(`  ⚠️ [PROFILE_PRESERVE] 팔로워 수 부분 업데이트: ${currentFollowersCount || 'N/A'} → ${userDelta.followersCount} (사용자: ${userDelta.userId})`);
        (currentScore as any).followersCount = userDelta.followersCount;
        (currentScore as any).followersCountUpdatedAt = new Date().toISOString();
      }
    } else {
      // 기존에 유효한 팔로워 수가 있고, 새 정보가 무효하면 기존 값 보존
      if (!ProfileValidators.isValidFollowersCount(userDelta.followersCount)) {
        console.log(`  🛡️ [PROFILE_PRESERVE] 팔로워 수 보존: ${currentFollowersCount} (새 값이 무효: ${userDelta.followersCount}) (사용자: ${userDelta.userId})`);
      }
    }

    // 커뮤니티 가중치 메타데이터 추가 (있는 경우에만)
    if (userDelta.communityWeight !== undefined) {
      (currentScore as any).communityWeight = userDelta.communityWeight;
    }
    if (userDelta.communityType !== undefined) {
      (currentScore as any).communityType = userDelta.communityType;
    }
    // dominantLanguage 저장
    if (userDelta.dominantLanguage !== undefined) {
      (currentScore as any).dominantLanguage = userDelta.dominantLanguage;
    }
    if (userDelta.logBase !== undefined) {
      (currentScore as any).logBase = userDelta.logBase;
    }
    if (userDelta.languageMultiplier !== undefined) {
      (currentScore as any).languageMultiplier = userDelta.languageMultiplier;
    }
    if (userDelta.originalScore !== undefined) {
      (currentScore as any).originalScore = userDelta.originalScore;
    }
    if (userDelta.cappedAtMax !== undefined) {
      (currentScore as any).cappedAtMax = userDelta.cappedAtMax;
    }
    
    // 가중치 적용 시간 기록
    if (userDelta.communityWeight !== undefined) {
      (currentScore as any).weightAppliedAt = new Date().toISOString();
    }

    // 점수가 음수가 되지 않도록 보정
    currentScore.totalScore = Math.max(0, currentScore.totalScore);
    currentScore.totalLikes = Math.max(0, currentScore.totalLikes);
    currentScore.totalReplies = Math.max(0, currentScore.totalReplies);
    currentScore.totalReposts = Math.max(0, currentScore.totalReposts);
    currentScore.totalQuotes = Math.max(0, currentScore.totalQuotes);
    currentScore.totalMentions = Math.max(0, currentScore.totalMentions);

    // GSI 파티션 키 추가
    (currentScore as any).leaderboardIdentifier = 'SCORE_RECORD';

    // DynamoDB에 저장
    await this.dynamoClient.send(new PutCommand({
      TableName: this.tableName,
      Item: currentScore
    }));

    return {
      isNewUser,
      newTotalScore: currentScore.totalScore,
      previousScore
    };
  }

  /**
   * 주간 점수 스냅샷 저장 (rolling window용)
   */
  private async saveWeeklySnapshots(userDeltas: UserDelta[], updateDate: string): Promise<void> {
    console.log(`📸 주간 점수 스냅샷 저장 중... (날짜: ${updateDate})`);
    
    const snapshots = userDeltas.map(delta => ({
      pk: `USER#${delta.userId}`,
      sk: `WEEKLY_SCORE#${updateDate}`,
      user_id: delta.userId,
      username: delta.username,
      daily_score: delta.scoreChange,
      date: updateDate,
      version: "1.0"
    }));

    // 25개씩 배치 처리
    for (let i = 0; i < snapshots.length; i += 25) {
      const batch = snapshots.slice(i, i + 25);
      const putRequests = batch.map(snapshot => ({
        PutRequest: { Item: snapshot }
      }));

      await this.dynamoClient.send(new BatchWriteCommand({
        RequestItems: { [this.tableName]: putRequests }
      }));
    }

    console.log(`✅ 주간 스냅샷 ${snapshots.length}개 저장 완료`);
  }

  /**
   * 특정 사용자의 현재 누적 점수 조회
   */
  async getUserCumulativeScore(userId: string): Promise<CumulativeUserScore | null> {
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: `USER#${userId}`,
          sk: "CUMULATIVE_SCORE"
        }
      }));

      return result.Item as CumulativeUserScore || null;
    } catch (error) {
      console.error(`❌ 사용자 ${userId} 점수 조회 실패:`, error);
      return null;
    }
  }

  /**
   * 상위 N명의 리더보드 조회
   */
  async getTopUsers(limit: number = 50): Promise<CumulativeUserScore[]> {
    try {
      // GSI를 사용한 점수순 정렬 조회 (leaderboard-rank-index)
      // 실제 구현에서는 별도 리더보드 테이블이나 GSI 필요
      
      // 현재는 스캔으로 전체 조회 후 정렬 (개발용)
      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE"
        },
        Limit: 1000 // 최대 1000명까지 조회
      }));

      if (!result.Items) return [];

      const users = result.Items as CumulativeUserScore[];
      return users
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, limit);

    } catch (error) {
      console.error(`❌ 상위 사용자 조회 실패:`, error);
      return [];
    }
  }

  /**
   * 커뮤니티 가중치 감사 로깅
   * @param userDeltas 사용자 변화량 배열
   * @param updateDate 업데이트 날짜
   */
  private async logCommunityWeightAudit(userDeltas: UserDelta[], updateDate: string): Promise<void> {
    try {
      console.log(`📝 [AUDIT] 커뮤니티 가중치 감사 로깅 시작 (${updateDate})`);
      
      // 가중치가 적용된 사용자들만 필터링
      const weightedUsers = userDeltas.filter(delta => delta.communityWeight !== undefined);
      
      if (weightedUsers.length === 0) {
        console.log(`📝 [AUDIT] 가중치 적용된 사용자 없음 - 로깅 스킵`);
        return;
      }

      // 감사 로그 엔트리 생성
      const auditEntries = weightedUsers.map(delta => ({
        pk: `AUDIT#COMMUNITY_WEIGHT`,
        sk: `${updateDate}#${delta.userId}#${Date.now()}`,
        
        // 기본 정보
        userId: delta.userId,
        username: delta.username,
        updateDate,
        timestamp: new Date().toISOString(),
        
        // 점수 정보
        originalScore: delta.originalScore || 0,
        finalScore: delta.scoreChange,
        scoreChange: delta.scoreChange - (delta.originalScore || 0),
        
        // 커뮤니티 가중치 정보
        communityType: delta.communityType,
        communityWeight: delta.communityWeight,
        logBase: delta.logBase,
        languageMultiplier: delta.languageMultiplier,
        followerWeight: delta.followerWeight,
        cappedAtMax: delta.cappedAtMax,
        
        // 인게이지먼트 변화
        likesChange: delta.likesChange,
        repliesChange: delta.repliesChange,
        repostsChange: delta.repostsChange,
        quotesChange: delta.quotesChange,
        mentionsChange: delta.mentionsChange,
        
        // 메타데이터
        version: 'v2',
        auditType: 'COMMUNITY_WEIGHT_APPLICATION'
      }));

      // 25개씩 배치로 저장
      for (let i = 0; i < auditEntries.length; i += 25) {
        const batch = auditEntries.slice(i, i + 25);
        const putRequests = batch.map(entry => ({
          PutRequest: { Item: entry }
        }));

        await this.dynamoClient.send(new BatchWriteCommand({
          RequestItems: { [this.tableName]: putRequests }
        }));
      }

      console.log(`✅ [AUDIT] 커뮤니티 가중치 감사 로그 ${auditEntries.length}개 저장 완료`);
      
      // 요약 통계 로깅
      const koreanUsers = weightedUsers.filter(d => d.communityType === 'korean').length;
      const globalUsers = weightedUsers.filter(d => d.communityType === 'global').length;
      const averageWeight = weightedUsers.reduce((sum, d) => sum + (d.communityWeight || 0), 0) / weightedUsers.length;
      
      console.log(`📊 [AUDIT] 가중치 적용 요약:`);
      console.log(`  - 한국 커뮤니티: ${koreanUsers}명`);
      console.log(`  - 글로벌 커뮤니티: ${globalUsers}명`);
      console.log(`  - 평균 가중치: ${averageWeight.toFixed(3)}`);

    } catch (error) {
      console.error(`❌ [AUDIT] 커뮤니티 가중치 감사 로깅 실패:`, error);
      // 감사 로깅 실패는 전체 프로세스를 중단시키지 않음
    }
  }

  /**
   * 특정 사용자의 커뮤니티 가중치 히스토리 조회
   * @param userId 사용자 ID
   * @param limit 조회할 최대 개수
   * @returns 가중치 히스토리
   */
  async getUserCommunityWeightHistory(userId: string, limit: number = 10): Promise<any[]> {
    try {
      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "pk = :pk AND userId = :userId",
        ExpressionAttributeValues: {
          ":pk": "AUDIT#COMMUNITY_WEIGHT",
          ":userId": userId
        },
        Limit: limit
      }));

      if (!result.Items) return [];

      return result.Items
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
        
    } catch (error) {
      console.error(`❌ 사용자 ${userId} 가중치 히스토리 조회 실패:`, error);
      return [];
    }
  }

  /**
   * 날짜가 특정 범위 내에 있는지 확인
   * @param date 확인할 날짜 (YYYY-MM-DD)
   * @param startDate 시작 날짜 (YYYY-MM-DD)
   * @param endDate 종료 날짜 (YYYY-MM-DD)
   * @returns 범위 내 여부
   */
  private isDateInRange(date: string, startDate: string, endDate: string): boolean {
    const target = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);

    // 시간 부분 제거 (날짜만 비교)
    target.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    return target >= start && target <= end;
  }

  /**
   * 커뮤니티별 점수 통계 조회
   * @param updateDate 특정 날짜 (선택사항)
   * @returns 커뮤니티별 통계
   */
  async getCommunityScoreStats(updateDate?: string): Promise<{
    korean: { users: number; totalScore: number; averageWeight: number };
    global: { users: number; totalScore: number; averageWeight: number };
  }> {
    try {
      let filterExpression = "pk = :pk";
      const expressionValues: any = { ":pk": "AUDIT#COMMUNITY_WEIGHT" };
      
      if (updateDate) {
        filterExpression += " AND begins_with(sk, :date)";
        expressionValues[":date"] = updateDate;
      }

      const result = await this.dynamoClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionValues
      }));

      if (!result.Items) {
        return {
          korean: { users: 0, totalScore: 0, averageWeight: 0 },
          global: { users: 0, totalScore: 0, averageWeight: 0 }
        };
      }

      const koreanEntries = result.Items.filter(item => item.communityType === 'korean');
      const globalEntries = result.Items.filter(item => item.communityType === 'global');

      const calculateStats = (entries: any[]) => {
        if (entries.length === 0) return { users: 0, totalScore: 0, averageWeight: 0 };
        
        const totalScore = entries.reduce((sum, item) => sum + (item.finalScore || 0), 0);
        const averageWeight = entries.reduce((sum, item) => sum + (item.communityWeight || 0), 0) / entries.length;
        
        return {
          users: entries.length,
          totalScore,
          averageWeight
        };
      };

      return {
        korean: calculateStats(koreanEntries),
        global: calculateStats(globalEntries)
      };
      
    } catch (error) {
      console.error(`❌ 커뮤니티 점수 통계 조회 실패:`, error);
      return {
        korean: { users: 0, totalScore: 0, averageWeight: 0 },
        global: { users: 0, totalScore: 0, averageWeight: 0 }
      };
    }
  }

  public async getAllUsers(): Promise<CumulativeUserScore[]> {
    console.log("🔍 [Backfill] 모든 사용자의 누적 점수 데이터 조회 시작 (Scan)");
    let lastEvaluatedKey;
    const allScores: CumulativeUserScore[] = [];

    do {
      const result: any = await this.dynamoClient.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: "sk = :sk",
        ExpressionAttributeValues: {
          ":sk": "CUMULATIVE_SCORE"
        },
        ExclusiveStartKey: lastEvaluatedKey
      }));

      if (result.Items) {
        allScores.push(...result.Items as CumulativeUserScore[]);
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`✅ [Backfill] 전체 사용자 조회 완료: ${allScores.length}명`);
    return allScores;
  }
}