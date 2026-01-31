/**
 * Whitelist Service for NFT Event Withdraw
 *
 * @description
 * DynamoDB NftWhitelist 테이블 관리 서비스
 * Withdraw 전용 메서드 제공
 *
 * @author Claude Code
 * @created 2025-11-01
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { NftWhitelist, ErrorCode, NftEventError } from '../types';
import { ethers } from 'ethers';

export class WhitelistService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * 지갑 주소 정규화 (소문자)
   */
  private normalizeAddress(address: string): string {
    return ethers.getAddress(address).toLowerCase();
  }

  /**
   * 화이트리스트에서 사용자 제거 (Hard Delete)
   *
   * @param walletAddress - 지갑 주소
   * @throws {NftEventError} USER_NOT_FOUND - 사용자가 등록되지 않음
   */
  async withdrawUser(walletAddress: string): Promise<void> {
    try {
      const normalizedAddress = this.normalizeAddress(walletAddress);
      console.log(`[WhitelistService] Withdrawing user: ${normalizedAddress}`);

      // 1. 사용자 존재 여부 확인
      const user = await this.findByWalletAddress(normalizedAddress);

      if (!user) {
        throw new NftEventError(
          'User not found in whitelist',
          ErrorCode.USER_NOT_FOUND,
          404
        );
      }

      // 2. Soft Delete: status를 WITHDRAWN으로 업데이트
      const now = new Date().toISOString();
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            walletAddress: normalizedAddress,
          },
          UpdateExpression: 'SET #status = :withdrawn, withdrawnAt = :now',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':withdrawn': 'WITHDRAWN',
            ':now': now,
          },
        })
      );

      console.log(`[WhitelistService] User withdrawn successfully: ${normalizedAddress}`);
    } catch (error: any) {
      // NftEventError는 그대로 throw
      if (error instanceof NftEventError) {
        throw error;
      }

      console.error('[WhitelistService] Error withdrawing user:', error);
      throw new NftEventError(
        `DynamoDB Error: ${error.message}`,
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }
  }

  /**
   * 지갑 주소로 화이트리스트 조회
   *
   * @param walletAddress - 지갑 주소
   * @returns 화이트리스트 정보 (없으면 null)
   */
  private async findByWalletAddress(walletAddress: string): Promise<NftWhitelist | null> {
    try {
      const normalizedAddress = this.normalizeAddress(walletAddress);
      console.log(`[WhitelistService] Finding by wallet address: ${normalizedAddress}`);

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            walletAddress: normalizedAddress,
          },
        })
      );

      if (!result.Item) {
        console.log(`[WhitelistService] User not found: ${normalizedAddress}`);
        return null;
      }

      return result.Item as NftWhitelist;
    } catch (error: any) {
      console.error('[WhitelistService] Error finding user:', error);
      throw new NftEventError(
        `DynamoDB Error: ${error.message}`,
        ErrorCode.INTERNAL_ERROR,
        500
      );
    }
  }
}
