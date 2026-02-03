import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  console.log('User Profile API called:', {
    httpMethod: event.httpMethod,
    queryParams: event.queryStringParameters,
    hasBody: !!event.body,
    path: event.path
  });

  try {
    const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';
    let identityId: string | undefined;

    if (event.httpMethod === 'GET') {
      // For GET requests, read identityId from query parameters
      const queryParams = event.queryStringParameters || {};
      identityId = queryParams.identityId;

      if (!identityId) {
        console.error('Missing identityId parameter in GET request');
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'identityId is required' }),
        };
      }

      // Get user profile
      const getCommand = new GetItemCommand({
        TableName: tableName,
        Key: {
          identityId: { S: identityId }
        }
      });

      const result = await dynamoClient.send(getCommand);
      console.log('DynamoDB GET result:', result);
      
      if (result.Item) {
        // DynamoDB 아이템을 일반 객체로 변환 (linkedAccounts 제외)
        const baseProfile: any = {};
        for (const [key, value] of Object.entries(result.Item)) {
          if (key === 'linkedAccounts' && value.M) {
            // linkedAccounts는 Map 구조 그대로 변환
            baseProfile.linkedAccounts = {};
            for (const [provider, providerData] of Object.entries(value.M)) {
              if (providerData.M) {
                baseProfile.linkedAccounts[provider] = {};
                for (const [field, fieldValue] of Object.entries(providerData.M)) {
                  baseProfile.linkedAccounts[provider][field] = Object.values(fieldValue)[0];
                }
              }
            }
          } else {
            baseProfile[key] = Object.values(value)[0];
          }
        }

        let unifiedProfile = { ...baseProfile };

        // linkedAccounts에 저장된 identityId로 추가 정보 조회 및 병합
        if (baseProfile.linkedAccounts) {
            for (const provider in baseProfile.linkedAccounts) {
                const linkedIdentityId = baseProfile.linkedAccounts[provider]?.identityId;
                if (linkedIdentityId) {
                    const linkedProfileResult = await dynamoClient.send(new GetItemCommand({
                        TableName: tableName,
                        Key: { identityId: { S: linkedIdentityId } }
                    }));

                    if (linkedProfileResult.Item) {
                        const linkedProfile = Object.fromEntries(
                          Object.entries(linkedProfileResult.Item)
                            .filter(([key]) => key !== 'linkedAccounts')
                            .map(([key, value]) => [key, Object.values(value)[0]])
                        );

                        // 선택적 필드만 병합 (identityId, provider, createdAt, updatedAt, linkedAccounts는 덮어쓰지 않음)
                        const fieldsToMerge = ['email', 'twitterHandle', 'originalTwitterHandle', 'twitterId', 'profileImageUrl', 'username'];
                        fieldsToMerge.forEach(field => {
                          if (linkedProfile[field] && !unifiedProfile[field]) {
                            unifiedProfile[field] = linkedProfile[field];
                          }
                        });
                    }
                }
            }
        }

        console.log('Returning unified user profile:', unifiedProfile);
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify(unifiedProfile),
        };
      } else {
        console.log('User profile not found for identityId:', identityId);
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'User profile not found' }),
        };
      }

    } else if (event.httpMethod === 'POST') {
      // Create or update user profile
      let postData;

      // Handle both JSON and form-urlencoded data
      if (event.body) {
        try {
          postData = JSON.parse(event.body);
        } catch (e) {
          // If JSON parsing fails, assume it's form-urlencoded
          const urlParams = new URLSearchParams(event.body);
          postData = {
            identityId: urlParams.get('identityId'),
            provider: urlParams.get('provider'),
            username: urlParams.get('username'),
            email: urlParams.get('email'),
            xHandle: urlParams.get('xHandle')
          };
        }
      } else {
        const queryParams = event.queryStringParameters || {};
        postData = queryParams;
      }

      // Validate required fields for POST
      if (!postData.identityId) {
        console.error('Missing identityId in POST body');
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'identityId is required' }),
        };
      }

      if (!postData.provider || !postData.username) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'provider and username are required for creating profile' }),
        };
      }

      // Build Item with conditional fields
      const item: any = {
        identityId: { S: postData.identityId },
        username: { S: postData.username },
        provider: { S: postData.provider },
        createdAt: { S: new Date().toISOString() },
        updatedAt: { S: new Date().toISOString() }
      };

      // Add optional fields only if they exist
      if (postData.email) item.email = { S: postData.email };
      if (postData.xHandle) item.xHandle = { S: postData.xHandle };
      if (postData.twitterHandle) item.twitterHandle = { S: postData.twitterHandle };
      if (postData.twitterId) item.twitterId = { S: postData.twitterId };
      if (postData.profileImageUrl) item.profileImageUrl = { S: postData.profileImageUrl };

      const putCommand = new PutItemCommand({
        TableName: tableName,
        Item: item
      });

      await dynamoClient.send(putCommand);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ 
          message: 'User profile created/updated successfully',
          success: true 
        }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };

  } catch (error: any) {
    console.error('Error handling user profile:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error', error: error.message }),
    };
  }
};