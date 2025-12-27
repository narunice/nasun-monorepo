/**
 * UserProfiles 테이블 관리 유틸리티
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';

interface UserProfile {
  identityId: string;
  username: string;
  provider: string;
  walletAddress: string;
  profileImageUrl?: string;
  linkedAccounts?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/**
 * UserProfile 조회
 */
export async function getUserProfile(identityId: string): Promise<UserProfile | null> {
  try {
    const command = new GetCommand({
      TableName: tableName,
      Key: { identityId },
    });

    const result = await dynamoClient.send(command);
    return result.Item as UserProfile | null;
  } catch (error) {
    console.error('Failed to get user profile:', error);
    throw error;
  }
}

/**
 * MetaMask 사용자 프로필 생성 또는 업데이트
 */
export async function createOrUpdateMetaMaskProfile(
  identityId: string,
  walletAddress: string
): Promise<void> {
  try {
    // 기존 프로필 확인
    const existingProfile = await getUserProfile(identityId);

    const now = new Date().toISOString();

    if (existingProfile) {
      // 기존 프로필이 있으면 walletAddress와 updatedAt만 업데이트
      console.log(`Updating existing profile for identityId: ${identityId}`);

      const updateCommand = new PutCommand({
        TableName: tableName,
        Item: {
          ...existingProfile,
          walletAddress: walletAddress.toLowerCase(),
          updatedAt: now,
        },
      });

      await dynamoClient.send(updateCommand);
    } else {
      // 신규 프로필 생성
      console.log(`Creating new MetaMask profile for identityId: ${identityId}`);

      const newProfile: UserProfile = {
        identityId,
        username: `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`, // 0x1234...abcd 형태
        provider: 'MetaMask',
        walletAddress: walletAddress.toLowerCase(),
        linkedAccounts: {},
        createdAt: now,
        updatedAt: now,
      };

      const putCommand = new PutCommand({
        TableName: tableName,
        Item: newProfile,
      });

      await dynamoClient.send(putCommand);
    }

    console.log(`User profile saved successfully for wallet: ${walletAddress}`);
  } catch (error) {
    console.error('Failed to save user profile:', error);
    throw error;
  }
}
