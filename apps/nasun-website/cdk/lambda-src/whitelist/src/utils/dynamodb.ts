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
 * Whitelist 항목 재활성화 (WITHDRAWN -> ACTIVE 재등록 시 사용)
 */
export async function reactivateWhitelistItem(
  walletAddress: string,
  signature: string,
  message: string,
  timestamp: string,
  joinedAt: string
): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { walletAddress: walletAddress.toLowerCase() },
        UpdateExpression: 'SET signature = :signature, message = :message, #timestamp = :timestamp, joinedAt = :joinedAt, #status = :status REMOVE withdrawnAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#timestamp': 'timestamp'
        },
        ExpressionAttributeValues: {
          ':signature': signature,
          ':message': message,
          ':timestamp': timestamp,
          ':joinedAt': joinedAt,
          ':status': 'ACTIVE',
          ':withdrawn': 'WITHDRAWN'
        },
        // WITHDRAWN 상태인 경우에만 재활성화 허용
        ConditionExpression: 'attribute_exists(walletAddress) AND #status = :withdrawn'
      })
    );
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      throw new Error('NOT_WITHDRAWN');
    }
    console.error('reactivateWhitelistItem error:', error);
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
 * 통계 계산 (캐싱 적용)
 *
 * NOTE: 대규모 데이터셋에서는 전체 스캔이 비효율적입니다.
 * 개선 방안:
 * 1. DynamoDB Streams + Lambda로 실시간 카운터 테이블 유지
 * 2. CloudWatch Metrics로 추적 (PutMetricData)
 * 3. Redis/ElastiCache에 캐싱
 *
 * 현재는 간단한 인메모리 캐싱 적용 (5분 TTL)
 */

let statisticsCache: {
  data: { totalActive: number; totalWithdrawn: number; totalAll: number } | null;
  timestamp: number;
} = { data: null, timestamp: 0 };

const STATISTICS_CACHE_TTL_MS = 5 * 60 * 1000; // 5분

export async function getStatistics(): Promise<{
  totalActive: number;
  totalWithdrawn: number;
  totalAll: number;
}> {
  try {
    // 캐시 확인
    const now = Date.now();
    if (statisticsCache.data && (now - statisticsCache.timestamp) < STATISTICS_CACHE_TTL_MS) {
      return statisticsCache.data;
    }

    // 캐시 만료 또는 미존재 시 재계산
    const allItems = await scanAllItems('ALL');

    const totalActive = allItems.filter(item => item.status === 'ACTIVE').length;
    const totalWithdrawn = allItems.filter(item => item.status === 'WITHDRAWN').length;

    const stats = {
      totalActive,
      totalWithdrawn,
      totalAll: allItems.length
    };

    // 캐시 업데이트
    statisticsCache = {
      data: stats,
      timestamp: now
    };

    return stats;
  } catch (error) {
    console.error('getStatistics error:', error);
    throw error;
  }
}

/**
 * 서명이 이미 사용되었는지 확인 (replay attack 방지)
 * 현재는 WhitelistItem에 저장된 signature와 비교
 */
export async function isSignatureUsed(
  walletAddress: string,
  signature: string
): Promise<boolean> {
  try {
    const item = await getWhitelistItem(walletAddress);
    // 동일한 서명이 이미 저장되어 있으면 재사용으로 간주
    return item !== null && item.signature === signature;
  } catch (error) {
    console.error('isSignatureUsed error:', error);
    throw error;
  }
}
