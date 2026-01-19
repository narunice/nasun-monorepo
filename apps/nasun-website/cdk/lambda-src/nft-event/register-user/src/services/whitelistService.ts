/**
 * Whitelist Service for NFT Event
 *
 * @description
 * DynamoDB NftWhitelist 테이블 관리 서비스
 *
 * @features
 * - registerUser: 화이트리스트 등록
 * - findByWalletAddress: 지갑 주소로 조회
 * - findByXUserId: X User ID로 조회 (중복 방지)
 * - checkDuplicate: 중복 등록 확인
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
import { NftWhitelist, RegisterUserRequest } from '../types';
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
   * 화이트리스트 등록
   *
   * @param request - 등록 요청 정보
   * @returns 등록된 화이트리스트 정보
   */
  async registerUser(request: RegisterUserRequest): Promise<NftWhitelist> {
    try {
      console.log(`[WhitelistService] Registering user: ${request.walletAddress}`);

      // 지갑 주소 정규화 (소문자)
      const normalizedAddress = this.normalizeAddress(request.walletAddress);

      const now = new Date().toISOString();
      const whitelist: NftWhitelist = {
        walletAddress: normalizedAddress,
        xUserId: request.xUserId,
        xUsername: request.xUsername,
        verifiedAt: now,
        engagementScore: 0,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: whitelist,
          // 중복 방지: walletAddress가 이미 존재하면 실패
          ConditionExpression: 'attribute_not_exists(walletAddress)',
        })
      );

      console.log(`[WhitelistService] User registered successfully: ${normalizedAddress}`);
      return whitelist;
    } catch (error: any) {
      // ConditionalCheckFailedException: 이미 등록된 지갑 주소
      if (error.name === 'ConditionalCheckFailedException') {
        throw new Error('ALREADY_REGISTERED: Wallet address already exists');
      }

      console.error('[WhitelistService] Error registering user:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
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
   * X User ID로 화이트리스트 조회 (중복 방지용)
   *
   * @param xUserId - X User ID
   * @returns 화이트리스트 정보 (없으면 null)
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
   * 중복 등록 확인
   *
   * @param walletAddress - 지갑 주소
   * @param xUserId - X User ID
   * @returns 중복 여부
   */
  async checkDuplicate(walletAddress: string, xUserId: string): Promise<boolean> {
    try {
      console.log(`[WhitelistService] Checking duplicate: ${walletAddress}, ${xUserId}`);

      // 지갑 주소 또는 X User ID가 이미 등록되어 있는지 확인
      const [byWallet, byXUserId] = await Promise.all([
        this.findByWalletAddress(walletAddress),
        this.findByXUserId(xUserId),
      ]);

      const isDuplicate = byWallet !== null || byXUserId !== null;
      console.log(`[WhitelistService] Duplicate check result: ${isDuplicate}`);

      return isDuplicate;
    } catch (error: any) {
      console.error('[WhitelistService] Error checking duplicate:', error);
      throw error;
    }
  }

  /**
   * 지갑 주소 정규화 (ethers.js 사용, 소문자 변환)
   *
   * @param address - 지갑 주소
   * @returns 정규화된 지갑 주소
   */
  private normalizeAddress(address: string): string {
    try {
      // ethers.getAddress()는 checksum address를 반환
      // 하지만 우리는 소문자로 저장
      return ethers.getAddress(address).toLowerCase();
    } catch (error) {
      throw new Error('INVALID_WALLET_ADDRESS: Invalid Ethereum address format');
    }
  }
}
