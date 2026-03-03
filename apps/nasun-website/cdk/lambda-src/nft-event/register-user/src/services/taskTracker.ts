/**
 * Task Tracker for NFT Event
 *
 * @description
 * DynamoDB EventTasks 테이블에 사용자의 태스크 완료 상태를 저장하고 조회
 *
 * @features
 * - saveTaskStatus: 태스크 완료 상태 저장
 * - getTaskStatus: 태스크 완료 상태 조회
 * - getAllTasks: 특정 사용자의 모든 태스크 조회
 *
 * @author Claude Code
 * @created 2025-10-25
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { TaskType, EventTask } from '../types';

export class TaskTracker {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * 태스크 완료 상태 저장
   *
   * @param walletAddress - 사용자 지갑 주소
   * @param xUserId - X User ID
   * @param taskType - 태스크 타입 (FOLLOW, LIKE, REPOST)
   * @param completed - 완료 여부
   * @param metadata - 추가 메타데이터
   */
  async saveTaskStatus(
    walletAddress: string,
    xUserId: string,
    taskType: TaskType,
    completed: boolean,
    metadata?: any
  ): Promise<void> {
    try {
      console.log(`[TaskTracker] Saving task status: ${walletAddress} - ${taskType} - ${completed}`);

      const task: EventTask = {
        walletAddress: walletAddress.toLowerCase(),
        taskType,
        completed,
        completedAt: completed ? new Date().toISOString() : undefined,
        xUserId,
        metadata,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: task,
        })
      );

      console.log(`[TaskTracker] Task status saved successfully`);
    } catch (error: any) {
      console.error('[TaskTracker] Error saving task status:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * 태스크 완료 상태 조회
   *
   * @param walletAddress - 사용자 지갑 주소
   * @param taskType - 태스크 타입
   * @returns 태스크 정보 (없으면 null)
   */
  async getTaskStatus(
    walletAddress: string,
    taskType: TaskType
  ): Promise<EventTask | null> {
    try {
      console.log(`[TaskTracker] Getting task status: ${walletAddress} - ${taskType}`);

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            walletAddress: walletAddress.toLowerCase(),
            taskType,
          },
        })
      );

      if (!result.Item) {
        console.log(`[TaskTracker] Task not found`);
        return null;
      }

      console.log(`[TaskTracker] Task found:`, result.Item);
      return result.Item as EventTask;
    } catch (error: any) {
      console.error('[TaskTracker] Error getting task status:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * 특정 사용자의 모든 태스크 조회
   *
   * @param walletAddress - 사용자 지갑 주소
   * @returns 모든 태스크 목록
   */
  async getAllTasks(walletAddress: string): Promise<EventTask[]> {
    try {
      console.log(`[TaskTracker] Getting all tasks for: ${walletAddress}`);

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'walletAddress = :walletAddress',
          ExpressionAttributeValues: {
            ':walletAddress': walletAddress.toLowerCase(),
          },
        })
      );

      const tasks = (result.Items || []) as EventTask[];
      console.log(`[TaskTracker] Found ${tasks.length} tasks`);

      return tasks;
    } catch (error: any) {
      console.error('[TaskTracker] Error getting all tasks:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * 모든 태스크가 완료되었는지 확인
   *
   * @param walletAddress - 사용자 지갑 주소 (또는 xUserId)
   * @returns 모든 태스크 완료 여부
   */
  async areAllTasksCompleted(walletAddress: string): Promise<boolean> {
    try {
      const tasks = await this.getAllTasks(walletAddress);

      // 2가지 태스크 (LIKE, REPOST)가 모두 있고, 모두 completed = true인지 확인
      // Follow는 X API 비용 비효율로 제외
      const requiredTasks: TaskType[] = ['LIKE', 'REPOST'];

      for (const taskType of requiredTasks) {
        const task = tasks.find((t) => t.taskType === taskType);
        if (!task || !task.completed) {
          console.log(`[TaskTracker] Task ${taskType} not completed`);
          return false;
        }
      }

      console.log(`[TaskTracker] All tasks completed for ${walletAddress}`);
      return true;
    } catch (error: any) {
      console.error('[TaskTracker] Error checking all tasks:', error);
      throw error;
    }
  }

  /**
   * xUserId로 저장된 태스크를 실제 walletAddress로 복사
   *
   * @param xUserId - X User ID (임시 walletAddress로 사용됨)
   * @param walletAddress - 실제 지갑 주소
   * @param xUsername - X Username
   */
  async copyTasks(xUserId: string, walletAddress: string, xUsername?: string): Promise<void> {
    try {
      console.log(`[TaskTracker] Copying tasks from ${xUserId} to ${walletAddress}`);

      // 1. xUserId로 저장된 태스크 조회
      const tasks = await this.getAllTasks(xUserId);

      if (tasks.length === 0) {
        console.log(`[TaskTracker] No tasks found for ${xUserId}`);
        return;
      }

      // 2. 각 태스크를 walletAddress로 복사
      const copyPromises = tasks.map((task) =>
        this.saveTaskStatus(
          walletAddress,
          task.xUserId,
          task.taskType,
          task.completed,
          {
            ...task.metadata, // 기존 metadata 복사
            verifiedAt: task.completedAt || new Date().toISOString(),
            copiedFrom: xUserId,
          }
        )
      );

      await Promise.all(copyPromises);

      console.log(`[TaskTracker] Successfully copied ${tasks.length} tasks to ${walletAddress}`);
    } catch (error: any) {
      console.error('[TaskTracker] Error copying tasks:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }
}
