/**
 * DynamoDB 헬퍼 유틸리티
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';
import { WhitelistItem } from '@/types/whitelist';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.WHITELIST_TABLE_NAME || 'GenesisNftWhitelist';

/**
 * Whitelist 항목 조회
 */
export async function getWhitelistItem(
  walletAddress: string
): Promise<WhitelistItem | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { walletAddress: walletAddress.toLowerCase() }
      })
    );

    return result.Item as WhitelistItem | null;
  } catch (error) {
    console.error('getWhitelistItem error:', error);
    throw error;
  }
}

/**
 * Whitelist 항목 생성
 */
export async function putWhitelistItem(item: WhitelistItem): Promise<void> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        // 중복 방지: walletAddress가 이미 존재하면 실패
        ConditionExpression: 'attribute_not_exists(walletAddress)'
      })
    );
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('ALREADY_REGISTERED');
    }
    console.error('putWhitelistItem error:', error);
    throw error;
  }
}

/**
 * Whitelist 항목 업데이트 (Withdraw 시 사용)
 */
export async function updateWhitelistItem(
  walletAddress: string,
  withdrawnAt: string
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { walletAddress: walletAddress.toLowerCase() },
        UpdateExpression: 'SET withdrawnAt = :withdrawnAt, #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':withdrawnAt': withdrawnAt,
          ':status': 'WITHDRAWN'
        },
        // 존재하지 않으면 실패
        ConditionExpression: 'attribute_exists(walletAddress)'
      })
    );
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('NOT_FOUND');
    }
    console.error('updateWhitelistItem error:', error);
    throw error;
  }
}

/**
 * Whitelist 항목 삭제 (Hard Delete - 선택적 사용)
 */
export async function deleteWhitelistItem(walletAddress: string): Promise<void> {
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { walletAddress: walletAddress.toLowerCase() }
      })
    );
  } catch (error) {
    console.error('deleteWhitelistItem error:', error);
    throw error;
  }
}

/**
 * 전체 Whitelist 스캔 (Admin Export용)
 */
export async function scanAllItems(
  status?: 'ACTIVE' | 'WITHDRAWN' | 'ALL'
): Promise<WhitelistItem[]> {
  const items: WhitelistItem[] = [];
  let lastEvaluatedKey: any = undefined;

  try {
    do {
      const params: any = {
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastEvaluatedKey
      };

      // 상태 필터링
      if (status && status !== 'ALL') {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues = { ':status': status };
      }

      const result = await docClient.send(new ScanCommand(params));

      if (result.Items) {
        items.push(...(result.Items as WhitelistItem[]));
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  } catch (error) {
    console.error('scanAllItems error:', error);
    throw error;
  }
}

/**
 * GSI를 사용한 날짜별 조회 (Admin List용)
 */
export async function queryByStatus(
  status: 'ACTIVE' | 'WITHDRAWN',
  limit: number = 50,
  lastEvaluatedKey?: any
): Promise<{
  items: WhitelistItem[];
  lastEvaluatedKey?: any;
}> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'joinedAt-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status
        },
        ScanIndexForward: false, // 최신순
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey
      })
    );

    return {
      items: result.Items as WhitelistItem[],
      lastEvaluatedKey: result.LastEvaluatedKey
    };
  } catch (error) {
    console.error('queryByStatus error:', error);
    throw error;
  }
}

/**
 * 통계 계산
 */
export async function getStatistics(): Promise<{
  totalActive: number;
  totalWithdrawn: number;
  totalAll: number;
}> {
  try {
    const allItems = await scanAllItems('ALL');

    const totalActive = allItems.filter(item => item.status === 'ACTIVE').length;
    const totalWithdrawn = allItems.filter(item => item.status === 'WITHDRAWN').length;

    return {
      totalActive,
      totalWithdrawn,
      totalAll: allItems.length
    };
  } catch (error) {
    console.error('getStatistics error:', error);
    throw error;
  }
}
