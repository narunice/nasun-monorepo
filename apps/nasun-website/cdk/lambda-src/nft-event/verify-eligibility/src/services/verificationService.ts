/**
 * Verification Service for NFT Event
 *
 * @description
 * 사용자의 X 활동을 검증하고 태스크 완료 상태를 관리하는 서비스
 *
 * @features
 * - verifyAllTasks: 2가지 조건 병렬 검증 (좋아요, 리트윗)
 * - DynamoDB에 검증 결과 저장
 * - 상세한 검증 결과 반환
 * - 팔로우는 X API Basic Plan 제약으로 검증 제외 (프론트엔드에서 선택적 권장)
 *
 * @author Claude Code
 * @created 2025-10-25
 * @updated 2025-10-25 - Follow 검증 제거 (Basic Plan 미지원)
 */

import { XApiClient, XApiConfig } from './xApiClient';
import { TaskTracker } from './taskTracker';
import { TaskType, TaskStatus, VerifyEligibilityResponse } from '../types';

export interface VerificationServiceConfig {
  xApiConfig: XApiConfig;
  tasksTableName: string;
}

export class VerificationService {
  private xApiClient: XApiClient;
  private taskTracker: TaskTracker;

  constructor(config: VerificationServiceConfig) {
    this.xApiClient = new XApiClient(config.xApiConfig);
    this.taskTracker = new TaskTracker(config.tasksTableName);
  }

  /**
   * 모든 태스크를 병렬로 검증하고 결과를 DynamoDB에 저장
   *
   * @param xUserId - X 사용자 ID
   * @param walletAddress - 지갑 주소
   * @param xUsername - X 사용자명 (옵션)
   * @returns 검증 결과
   */
  async verifyAllTasks(
    xUserId: string,
    walletAddress: string,
    xUsername?: string
  ): Promise<VerifyEligibilityResponse> {
    try {
      console.log(`[VerificationService] Starting verification for user ${xUserId}`);

      // 0. DynamoDB cache check - skip X API for already-completed tasks
      const existingTasks = await this.taskTracker.getAllTasks(walletAddress);
      const cachedLike = existingTasks.find((t) => t.taskType === 'LIKE' && t.completed);
      const cachedRetweet = existingTasks.find((t) => t.taskType === 'RETWEET' && t.completed);

      if (cachedLike && cachedRetweet) {
        console.log(`[VerificationService] All tasks already completed in cache, skipping X API`);
      } else {
        console.log(`[VerificationService] Cache status - Like: ${cachedLike ? 'cached' : 'needs API'}, Retweet: ${cachedRetweet ? 'cached' : 'needs API'}`);
      }

      // 1. Only call X API for incomplete tasks
      let hasLiked: boolean | undefined = cachedLike ? true : undefined;
      let hasRetweeted: boolean | undefined = cachedRetweet ? true : undefined;
      let apiError: string | undefined;

      if (!cachedLike || !cachedRetweet) {
        // Build selective verification
        const apiPromises: Promise<boolean>[] = [];
        const apiLabels: string[] = [];

        if (!cachedLike) {
          apiPromises.push(this.xApiClient.checkLiked(xUserId));
          apiLabels.push('LIKE');
        }
        if (!cachedRetweet) {
          apiPromises.push(this.xApiClient.checkRetweeted(xUserId));
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
            errors.push(`${label} check failed: ${result.reason?.message || 'Unknown error'}`);
          }
        });

        if (errors.length > 0) {
          apiError = errors.join('; ');
        }
      }

      // 2. Save task results to DynamoDB (only newly verified tasks)
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

      // 3. Build task status list
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

      // 4. Check eligibility
      const eligible = hasLiked === true && hasRetweeted === true;
      const hasVerificationErrors = hasLiked === undefined || hasRetweeted === undefined;

      let message: string;
      if (eligible) {
        message = '모든 참여 조건을 충족했습니다!';
      } else if (hasVerificationErrors) {
        message = `일부 태스크 검증에 실패했습니다. 위 목록을 확인해주세요. ${apiError || ''}`.trim();
      } else {
        message = '일부 조건을 충족하지 못했습니다. 위 목록을 확인해주세요.';
      }

      console.log(`[VerificationService] Verification complete. Eligible: ${eligible}, HasErrors: ${hasVerificationErrors}`);

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
