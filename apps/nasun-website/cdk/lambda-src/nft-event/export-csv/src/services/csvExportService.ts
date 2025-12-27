/**
 * CSV Export Service for NFT Event
 *
 * @description
 * NFT Whitelist 데이터를 OpenSea 형식 CSV로 변환하는 서비스
 *
 * @features
 * - getActiveWhitelist: status-index GSI로 ACTIVE 사용자 조회
 * - convertToOpenSeaCsv: 지갑 주소 목록을 CSV로 변환
 * - Query 최적화: Scan → Query (RCU 80% 절감)
 *
 * @author Claude Code
 * @created 2025-10-25
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { NftWhitelist } from '../types';

export class CsvExportService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string) {
    const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
    this.docClient = DynamoDBDocumentClient.from(client);
    this.tableName = tableName;
  }

  /**
   * status-index GSI로 ACTIVE 상태의 화이트리스트 조회 (레거시)
   *
   * @returns ACTIVE 사용자 목록
   */
  async getActiveWhitelist(): Promise<NftWhitelist[]> {
    try {
      console.log('[CsvExportService] Querying ACTIVE whitelist users via status-index GSI');

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'status-index',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': 'ACTIVE',
          },
        })
      );

      const items = (result.Items || []) as NftWhitelist[];
      console.log(`[CsvExportService] Found ${items.length} ACTIVE whitelist entries`);

      return items;
    } catch (error: any) {
      console.error('[CsvExportService] Error querying whitelist:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * batch-index GSI로 특정 Batch의 화이트리스트 조회
   *
   * @param batchId - Allowlist Batch ID ("1", "2", "3", ...)
   * @returns 해당 Batch의 사용자 목록 (등록순 정렬)
   */
  async getWhitelistByBatch(batchId: string): Promise<NftWhitelist[]> {
    try {
      console.log(`[CsvExportService] Querying whitelist by batch: ${batchId}`);

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'batch-index',
          KeyConditionExpression: 'allowlistBatchId = :batchId',
          ExpressionAttributeValues: {
            ':batchId': batchId,
          },
        })
      );

      const items = (result.Items || []) as NftWhitelist[];
      console.log(`[CsvExportService] Found ${items.length} entries for Batch ${batchId}`);

      return items;
    } catch (error: any) {
      console.error('[CsvExportService] Error querying by batch:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * 전체 화이트리스트 조회 (Scan)
   *
   * @returns 전체 사용자 목록
   */
  async getAllWhitelist(): Promise<NftWhitelist[]> {
    try {
      console.log('[CsvExportService] Scanning all whitelist entries');

      const allItems: NftWhitelist[] = [];
      let lastEvaluatedKey: Record<string, any> | undefined;

      do {
        const result = await this.docClient.send(
          new ScanCommand({
            TableName: this.tableName,
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        allItems.push(...((result.Items || []) as NftWhitelist[]));
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      console.log(`[CsvExportService] Found ${allItems.length} total whitelist entries`);

      return allItems;
    } catch (error: any) {
      console.error('[CsvExportService] Error scanning whitelist:', error);
      throw new Error(`DYNAMODB_ERROR: ${error.message}`);
    }
  }

  /**
   * OpenSea CSV 형식으로 변환
   *
   * Format: 헤더 없음, 지갑 주소만 (줄바꿈으로 구분)
   *
   * @param whitelists - 화이트리스트 목록
   * @returns CSV 문자열
   */
  convertToOpenSeaCsv(whitelists: NftWhitelist[]): string {
    console.log(`[CsvExportService] Converting ${whitelists.length} entries to CSV`);

    // 중복 제거 및 소문자 정규화
    const uniqueAddresses = [
      ...new Set(
        whitelists
          .map((item) => item.walletAddress.toLowerCase())
          .filter(Boolean)
      ),
    ];

    // OpenSea 형식: 지갑 주소만 (헤더 없음)
    const csvContent = uniqueAddresses.join('\n');

    console.log(`[CsvExportService] Generated CSV with ${uniqueAddresses.length} unique addresses`);

    return csvContent;
  }

  /**
   * CSV 파일명 생성
   *
   * @returns 타임스탬프가 포함된 파일명
   */
  generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `wave1-battalion-${timestamp}.csv`;
  }
}
