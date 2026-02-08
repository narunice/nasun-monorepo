/**
 * Verification Service for NFT Event
 *
 * @description
 * 3-Tier Hybrid Verification for 100+ participants:
 *   Tier 1: DynamoDB Task Cache — already-verified users (X API 0 calls)
 *   Tier 2: Engagement Cache — DynamoDB cache lookup (X API 0 calls)
 *   Tier 3: User Context OAuth Fallback — per-user rate limits (app rate limit 0 consumption)
 *
 * @author Claude Code
 * @created 2025-10-25
 * @updated 2026-01-31 - 3-tier hybrid verification for 100+ participants
 */

import { XApiClient, XApiConfig } from './xApiClient';
import { TaskTracker } from './taskTracker';
import { EngagementCache } from './engagementCache';
import { TaskType, TaskStatus, VerifyEligibilityResponse } from '../types';

export interface VerificationServiceConfig {
  xApiConfig: XApiConfig;
  tasksTableName: string;
}

export class VerificationService {
  private xApiClient: XApiClient;
  private taskTracker: TaskTracker;
  private engagementCache: EngagementCache;

  constructor(config: VerificationServiceConfig) {
    this.xApiClient = new XApiClient(config.xApiConfig);
    this.taskTracker = new TaskTracker(config.tasksTableName);
    this.engagementCache = new EngagementCache(config.tasksTableName);
  }

  /**
   * 3-Tier verification: Task Cache → Engagement Cache → User Context API
   *
   * @param xUserId - X User ID
   * @param walletAddress - Wallet address
   * @param xUsername - X username (optional)
   * @param xAccessToken - User's OAuth 2.0 access token (optional, for Tier 3)
   */
  async verifyAllTasks(
    xUserId: string,
    walletAddress: string,
    xUsername?: string,
    xAccessToken?: string
  ): Promise<VerifyEligibilityResponse> {
    try {
      console.log(`[VerificationService] Starting 3-tier verification for user ${xUserId}`);

      // === Tier 1: DynamoDB Task Cache ===
      const existingTasks = await this.taskTracker.getAllTasks(walletAddress);
      const cachedLike = existingTasks.find((t) => t.taskType === 'LIKE' && t.completed);
      const cachedRetweet = existingTasks.find((t) => t.taskType === 'RETWEET' && t.completed);

      let hasLiked: boolean | undefined = cachedLike ? true : undefined;
      let hasRetweeted: boolean | undefined = cachedRetweet ? true : undefined;

      if (cachedLike && cachedRetweet) {
        console.log(`[VerificationService] Tier 1 HIT: All tasks cached, skipping API`);
      } else {
        console.log(`[VerificationService] Tier 1: Like=${cachedLike ? 'cached' : 'miss'}, Retweet=${cachedRetweet ? 'cached' : 'miss'}`);

        // === Tier 2: Engagement Polling Cache ===
        const needLike = hasLiked === undefined;
        const needRetweet = hasRetweeted === undefined;

        if (needLike || needRetweet) {
          const cacheResult = await this.engagementCache.checkBoth(xUserId);

          if (needLike && cacheResult.likeFound) {
            hasLiked = true;
            console.log(`[VerificationService] Tier 2 HIT: Like found in engagement cache`);
          }
          if (needRetweet && cacheResult.retweetFound) {
            hasRetweeted = true;
            console.log(`[VerificationService] Tier 2 HIT: Retweet found in engagement cache`);
          }
        }

        // === Tier 3: X API Fallback ===
        const stillNeedLike = hasLiked === undefined;
        const stillNeedRetweet = hasRetweeted === undefined;

        if (stillNeedLike || stillNeedRetweet) {
          console.log(`[VerificationService] Tier 3: Like=${stillNeedLike ? 'API' : 'resolved'}, Retweet=${stillNeedRetweet ? 'API' : 'resolved'}, hasUserToken=${Boolean(xAccessToken)}`);

          const apiPromises: Promise<boolean>[] = [];
          const apiLabels: string[] = [];

          if (stillNeedLike) {
            // Prefer User Context (per-user rate limit) over App-Only
            const likePromise = xAccessToken
              ? this.xApiClient.checkLikedUserContext(xUserId, xAccessToken)
              : this.xApiClient.checkLiked(xUserId);
            apiPromises.push(likePromise);
            apiLabels.push('LIKE');
          }
          if (stillNeedRetweet) {
            const retweetPromise = xAccessToken
              ? this.xApiClient.checkRetweetedUserContext(xUserId, xAccessToken)
              : this.xApiClient.checkRetweeted(xUserId);
            apiPromises.push(retweetPromise);
            apiLabels.push('RETWEET');
          }

          const results = await Promise.allSettled(apiPromises);
          const errors: string[] = [];

          results.forEach((result, i) => {
            const label = apiLabels[i];
            if (result.status === 'fulfilled') {
              if (label === 'LIKE') hasLiked = result.value;
              if (label === 'RETWEET') hasRetweeted = result.value;
            } else {
              errors.push(`${label}: ${result.reason?.message || 'Unknown error'}`);
            }
          });

          if (errors.length > 0) {
            console.warn(`[VerificationService] Tier 3 errors: ${errors.join('; ')}`);
          }
        }
      }

      // Save newly verified results to DynamoDB (Tier 1 cache for next time)
      const savePromises: Promise<any>[] = [];

      if (!cachedLike && hasLiked !== undefined) {
        savePromises.push(
          this.taskTracker.saveTaskStatus(walletAddress, xUserId, 'LIKE', hasLiked, {
            xUsername,
            verifiedAt: new Date().toISOString(),
          })
        );
      }

      if (!cachedRetweet && hasRetweeted !== undefined) {
        savePromises.push(
          this.taskTracker.saveTaskStatus(walletAddress, xUserId, 'RETWEET', hasRetweeted, {
            xUsername,
            verifiedAt: new Date().toISOString(),
          })
        );
      }

      await Promise.allSettled(savePromises);

      // Build response
      const tasks: TaskStatus[] = [
        {
          taskType: 'LIKE',
          completed: hasLiked === true,
          message: hasLiked === true
            ? undefined
            : hasLiked === false
            ? '이벤트 트윗 좋아요가 필요합니다'
            : 'Like 검증을 완료할 수 없습니다 (X API 오류)',
        },
        {
          taskType: 'RETWEET',
          completed: hasRetweeted === true,
          message: hasRetweeted === true
            ? undefined
            : hasRetweeted === false
            ? '이벤트 트윗 리트윗이 필요합니다'
            : 'Retweet 검증을 완료할 수 없습니다 (X API 오류)',
        },
      ];

      const eligible = hasLiked === true && hasRetweeted === true;
      const hasVerificationErrors = hasLiked === undefined || hasRetweeted === undefined;

      let message: string;
      if (eligible) {
        message = '모든 참여 조건을 충족했습니다!';
      } else if (hasVerificationErrors) {
        message = '일부 태스크 검증에 실패했습니다. 잠시 후 다시 시도해주세요.';
      } else {
        message = '일부 조건을 충족하지 못했습니다. 위 목록을 확인해주세요.';
      }

      console.log(`[VerificationService] Done. Eligible: ${eligible}, Errors: ${hasVerificationErrors}`);

      return {
        success: !hasVerificationErrors,
        eligible,
        tasks,
        message,
      };
    } catch (error: any) {
      console.error('[VerificationService] Error during verification:', error);

      return {
        success: false,
        eligible: false,
        tasks: [],
        message: `검증 중 오류가 발생했습니다: ${error.message}`,
      };
    }
  }

  /**
   * 저장된 태스크 상태를 조회하여 반환 (Follow 제외)
   *
   * @param walletAddress - 지갑 주소
   * @returns 태스크 상태 목록
   */
  async getStoredTaskStatus(walletAddress: string): Promise<TaskStatus[]> {
    try {
      console.log(`[VerificationService] Getting stored tasks for ${walletAddress}`);

      const allTasks = await this.taskTracker.getAllTasks(walletAddress);

      const likeTask = allTasks.find((t) => t.taskType === 'LIKE');
      const retweetTask = allTasks.find((t) => t.taskType === 'RETWEET');

      const tasks: TaskStatus[] = [
        {
          taskType: 'LIKE',
          completed: likeTask?.completed || false,
          message: likeTask?.completed ? undefined : '이벤트 트윗 좋아요가 필요합니다',
        },
        {
          taskType: 'RETWEET',
          completed: retweetTask?.completed || false,
          message: retweetTask?.completed ? undefined : '이벤트 트윗 리트윗이 필요합니다',
        },
      ];

      return tasks;
    } catch (error: any) {
      console.error('[VerificationService] Error getting stored tasks:', error);
      throw error;
    }
  }
}
