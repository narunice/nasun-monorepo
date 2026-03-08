/**
 * UserProfiles 테이블 관리 유틸리티 — Nasun Wallet (Sui) 전용
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
 * Nasun Wallet (Sui) 사용자 프로필 생성 또는 업데이트
 * Sui 주소: 0x + 64 hex chars (66자 total)
 */
export async function createOrUpdateSuiProfile(
  identityId: string,
  walletAddress: string
): Promise<void> {
  try {
    const existingProfile = await getUserProfile(identityId);

    const now = new Date().toISOString();
    const addr = walletAddress.toLowerCase();

    if (existingProfile) {
      console.log(`Updating existing profile for identityId: ${identityId}`);

      const updateCommand = new PutCommand({
        TableName: tableName,
        Item: {
          ...existingProfile,
          walletAddress: addr,
          updatedAt: now,
        },
      });

      await dynamoClient.send(updateCommand);
    } else {
      console.log(`Creating new Nasun Wallet profile for identityId: ${identityId}`);

      // Display 0x1234...abcd (first 6 + last 4 chars)
      const displayAddr = `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;

      const newProfile: UserProfile = {
        identityId,
        username: displayAddr,
        provider: 'Nasun Wallet',
        walletAddress: addr,
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
