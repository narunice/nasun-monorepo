/**
 * Verification Service for NFT Event
 *
 * 3-Tier Hybrid Verification:
 *   Tier 1: DynamoDB Task Cache — already-verified users (X API 0 calls)
 *   Tier 2: Engagement Cache — DynamoDB polling cache (X API 0 calls)
 *   Tier 3: X API — userTimeline + likedTweets (Post objects, cost-optimized)
 *
 * Cost optimization (2026-03): switched from User-object endpoints ($0.01)
 * to Post-object endpoints ($0.005). Per-user cost: $0.75 → $0.15.
 */

import { XApiClient, XApiConfig } from './xApiClient';
import { TaskTracker } from './taskTracker';
import { EngagementCache } from './engagementCache';
import { EventTask, TaskType, TaskStatus, VerifyEligibilityResponse } from '../types';

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

      // === Tier 1: DynamoDB Task Cache (with soft TTL) ===
      const cacheMaxAgeMs = parseInt(process.env.CACHE_MAX_AGE_HOURS || '24', 10) * 3600 * 1000;
      const isFresh = (task: EventTask): boolean => {
        if (!task.completedAt) return false;
        return Date.now() - new Date(task.completedAt).getTime() < cacheMaxAgeMs;
      };

      const existingTasks = await this.taskTracker.getAllTasks(walletAddress);
      const cachedLike = existingTasks.find((t) => t.taskType === 'LIKE' && t.completed && isFresh(t));
      const cachedRepost = existingTasks.find((t) => t.taskType === 'REPOST' && t.completed && isFresh(t));

      let hasLiked: boolean | undefined = cachedLike ? true : undefined;
      let hasReposted: boolean | undefined = cachedRepost ? true : undefined;

      if (cachedLike && cachedRepost) {
        console.log(`[VerificationService] Tier 1 HIT: All tasks cached, skipping API`);
      } else {
        console.log(`[VerificationService] Tier 1: Like=${cachedLike ? 'cached' : 'miss'}, Repost=${cachedRepost ? 'cached' : 'miss'}`);

        // === Tier 2: Engagement Polling Cache ===
        const needLike = hasLiked === undefined;
        const needRepost = hasReposted === undefined;

        if (needLike || needRepost) {
          const cacheResult = await this.engagementCache.checkBoth(xUserId);

          if (needLike && cacheResult.likeFound) {
            hasLiked = true;
            console.log(`[VerificationService] Tier 2 HIT: Like found in engagement cache`);
          }
          if (needRepost && cacheResult.repostFound) {
            hasReposted = true;
            console.log(`[VerificationService] Tier 2 HIT: Repost found in engagement cache`);
          }
        }

        // === Tier 3: X API Fallback ===
        const stillNeedLike = hasLiked === undefined;
        const stillNeedRepost = hasReposted === undefined;

        if (stillNeedLike || stillNeedRepost) {
          console.log(`[VerificationService] Tier 3: Like=${stillNeedLike ? 'API' : 'resolved'}, Repost=${stillNeedRepost ? 'API' : 'resolved'}, hasUserToken=${Boolean(xAccessToken)}`);

          const apiPromises: Promise<boolean>[] = [];
          const apiLabels: string[] = [];

          // Unified API: xAccessToken is passed directly (uses User Context
          // when available, App-Only Bearer Token as fallback)
          if (stillNeedLike) {
            apiPromises.push(this.xApiClient.checkLiked(xUserId, xAccessToken));
            apiLabels.push('LIKE');
          }
          if (stillNeedRepost) {
            apiPromises.push(this.xApiClient.checkReposted(xUserId, xAccessToken));
            apiLabels.push('REPOST');
          }

          const results = await Promise.allSettled(apiPromises);
          const errors: string[] = [];

          results.forEach((result, i) => {
            const label = apiLabels[i];
            if (result.status === 'fulfilled') {
              if (label === 'LIKE') hasLiked = result.value;
              if (label === 'REPOST') hasReposted = result.value;
            } else {
              const reason = result.reason?.message || 'Unknown error';
              if (reason === 'PROTECTED_ACCOUNT') {
                errors.push(`${label}: Protected account requires X re-authentication`);
              } else if (reason === 'RATE_LIMIT_EXCEEDED') {
                errors.push(`${label}: Temporarily unavailable, please retry in a few minutes`);
              } else {
                errors.push(`${label}: ${reason}`);
              }
            }
          });

          if (errors.length > 0) {
            console.warn(`[VerificationService] Tier 3 errors: ${errors.join('; ')}`);
          }
        }
      }

      // Save results to DynamoDB (Tier 1 cache for next time)
      // Save when: no cache exists, or cache was stale and re-verified via API
      const savePromises: Promise<any>[] = [];

      if (!cachedLike && hasLiked !== undefined) {
        savePromises.push(
          this.taskTracker.saveTaskStatus(walletAddress, xUserId, 'LIKE', hasLiked, {
            xUsername,
            verifiedAt: new Date().toISOString(),
          })
        );
      }

      if (!cachedRepost && hasReposted !== undefined) {
        savePromises.push(
          this.taskTracker.saveTaskStatus(walletAddress, xUserId, 'REPOST', hasReposted, {
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
            ? 'Like any @Nasun_io post to complete this task'
            : 'Like verification failed. Please reconnect your X account and retry.',
        },
        {
          taskType: 'REPOST',
          completed: hasReposted === true,
          message: hasReposted === true
            ? undefined
            : hasReposted === false
            ? 'Repost (retweet or quote tweet) any @Nasun_io post to complete this task'
            : 'Repost verification failed. Please reconnect your X account and retry.',
        },
      ];

      const eligible = hasLiked === true && hasReposted === true;
      const hasVerificationErrors = hasLiked === undefined || hasReposted === undefined;

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
      const repostTask = allTasks.find((t) => t.taskType === 'REPOST');

      const tasks: TaskStatus[] = [
        {
          taskType: 'LIKE',
          completed: likeTask?.completed || false,
          message: likeTask?.completed ? undefined : 'Like any @Nasun_io post to complete this task',
        },
        {
          taskType: 'REPOST',
          completed: repostTask?.completed || false,
          message: repostTask?.completed ? undefined : 'Repost (retweet or quote tweet) any @Nasun_io post to complete this task',
        },
      ];

      return tasks;
    } catch (error: any) {
      console.error('[VerificationService] Error getting stored tasks:', error);
      throw error;
    }
  }
}
