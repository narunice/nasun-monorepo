import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

// JWKS singleton for Cognito JWT verification
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
    );
  }
  return jwksInstance;
}

/**
 * Verify a Bearer token and extract identityId from Cognito JWT.
 * Returns undefined if verification fails.
 */
async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('COGNITO_IDENTITY_POOL_ID is not set');
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch (error) {
    console.error('JWT verification failed:', error);
    return undefined;
  }
}

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  console.log('[UserProfile] Request:', {
    httpMethod: event.httpMethod,
    path: event.path,
    hasBody: !!event.body,
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
                        const fieldsToMerge = ['email', 'twitterHandle', 'originalTwitterHandle', 'twitterId', 'profileImageUrl', 'username', 'walletAddress'];
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
      // Authenticate: require valid Cognito JWT for profile creation
      const authHeader = event.headers.Authorization || event.headers.authorization;
      const authenticatedIdentityId = await verifyToken(authHeader);

      if (!authenticatedIdentityId) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Authentication required' }),
        };
      }

      // Create user profile
      let postData;

      if (event.body) {
        try {
          postData = JSON.parse(event.body);
        } catch {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Invalid JSON body' }),
          };
        }
      } else {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Request body is required' }),
        };
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

      // Authorize: identityId in body must match the authenticated identity
      if (postData.identityId !== authenticatedIdentityId) {
        console.warn(`Authorization failed: token identity ${authenticatedIdentityId} does not match body identity ${postData.identityId}`);
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. Identity mismatch.' }),
        };
      }

      if (!postData.provider || !postData.username) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'provider and username are required for creating profile' }),
        };
      }

      // Block direct creation of social-only profiles.
      // Social providers should only exist as linked secondary profiles,
      // created exclusively by the link-account Lambda.
      const BLOCKED_PROVIDERS = ['google', 'twitter'];
      if (BLOCKED_PROVIDERS.includes(postData.provider?.toLowerCase?.().trim())) {
        console.warn(`Blocked social provider profile creation: provider=${postData.provider}, identityId=${postData.identityId}`);
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({
            message: 'Social provider profiles cannot be created directly. Use account linking.',
          }),
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

      // Prevent overwriting existing profiles — only allow creation of new ones.
      // Profile updates should go through dedicated endpoints (link-account, etc.)
      const putCommand = new PutItemCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(identityId)',
      });

      try {
        await dynamoClient.send(putCommand);
      } catch (putError: unknown) {
        const putErr = putError as { name?: string };
        if (putErr.name === 'ConditionalCheckFailedException') {
          return {
            statusCode: 409,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Profile already exists' }),
          };
        }
        throw putError;
      }

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({
          message: 'User profile created successfully',
          success: true
        }),
      };

    } else if (event.httpMethod === 'PATCH') {
      // Update display name (authenticated users only)
      const authHeader = event.headers.Authorization || event.headers.authorization;
      const authenticatedIdentityId = await verifyToken(authHeader);

      if (!authenticatedIdentityId) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Authentication required' }),
        };
      }

      let patchData: Record<string, unknown>;
      try {
        patchData = JSON.parse(event.body || '{}');
      } catch {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Invalid JSON body' }),
        };
      }

      // Field allowlist: only displayName is allowed
      const allowedFields = ['displayName'];
      const updateFields: Record<string, string> = {};
      for (const field of allowedFields) {
        if (field in patchData && typeof patchData[field] === 'string') {
          updateFields[field] = (patchData[field] as string).trim();
        }
      }

      if (Object.keys(updateFields).length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'No valid fields to update' }),
        };
      }

      // Validate displayName length
      if (updateFields.displayName !== undefined) {
        if (updateFields.displayName.length < 2 || updateFields.displayName.length > 30) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Display name must be 2-30 characters' }),
          };
        }
      }

      const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';
      try {
        await dynamoClient.send(new UpdateItemCommand({
          TableName: tableName,
          Key: { identityId: { S: authenticatedIdentityId } },
          UpdateExpression: 'SET customDisplayName = :name, displayNameUpdatedAt = :now, updatedAt = :now',
          ExpressionAttributeValues: {
            ':name': { S: updateFields.displayName },
            ':now': { S: new Date().toISOString() },
          },
          ConditionExpression: 'attribute_exists(identityId)',
        }));
      } catch (updateError: unknown) {
        const updateErr = updateError as { name?: string };
        if (updateErr.name === 'ConditionalCheckFailedException') {
          return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'User profile not found' }),
          };
        }
        throw updateError;
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };

  } catch (error: unknown) {
    console.error('Error handling user profile:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};