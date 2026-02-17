/**
 * Whitelist Service for Check Registration Status Lambda
 *
 * @description
 * DynamoDB NftWhitelist 테이블 조회 서비스
 *
 * @features
 * - findByWalletAddress: 지갑 주소로 조회
 *
 * @author Claude Code
 * @created 2025-11-02
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NftWhitelist } from '../types';
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
   * 지갑 주소로 화이트리스트 조회
   *
   * @param walletAddress - 지갑 주소
   * @returns 화이트리스트 정보 (없으면 null)
   */
  async findByWalletAddress(walletAddress: string): Promise<NftWhitelist | null> {
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
        console.log(`[WhitelistService] Wallet address not found`);
        return null;
      }

      console.log(`[WhitelistService] Wallet address found:`, result.Item);
      return result.Item as NftWhitelist;
    } catch (error: any) {
      console.error('[WhitelistService] Error finding by wallet address:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * X User ID로 화이트리스트 조회 (GSI)
   */
  async findByXUserId(xUserId: string): Promise<NftWhitelist | null> {
    try {
      console.log(`[WhitelistService] Finding by xUserId: ${xUserId}`);

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'xUserId-index',
          KeyConditionExpression: 'xUserId = :xUserId',
          ExpressionAttributeValues: {
            ':xUserId': xUserId,
          },
          Limit: 1,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        console.log(`[WhitelistService] xUserId not found`);
        return null;
      }

      console.log(`[WhitelistService] xUserId found:`, result.Items[0]);
      return result.Items[0] as NftWhitelist;
    } catch (error: any) {
      console.error('[WhitelistService] Error finding by xUserId:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * Ethereum 주소 정규화 (소문자 변환)
   *
   * @param address - 지갑 주소
   * @returns 정규화된 주소
   */
  private normalizeAddress(address: string): string {
    try {
      // ethers.js로 주소 검증 및 체크섬 변환
      const checksumAddress = ethers.getAddress(address);
      // DynamoDB PK는 소문자 저장
      return checksumAddress.toLowerCase();
    } catch (error: any) {
      console.error('[WhitelistService] Invalid Ethereum address:', error);
      throw new Error('INVALID_WALLET_ADDRESS');
    }
  }
}
