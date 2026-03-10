
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

// JWKS singleton for token verification
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

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const corsHeaders = {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  const path = event.path || event.resource || '';
  const isUnlink = path.includes('/unlink');

  // Authentication: Verify JWT token
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const authenticatedIdentityId = await verifyToken(authHeader);

  if (!authenticatedIdentityId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Unauthorized. Valid authentication token required.' }),
    };
  }

  try {
    if (isUnlink) {
      // Unlink flow
      const { primaryIdentityId, provider } = JSON.parse(event.body || '{}');

      if (!primaryIdentityId || !provider) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'primaryIdentityId and provider are required' }),
        };
      }

      // Authorization: Ensure the authenticated user owns the primary account
      if (primaryIdentityId !== authenticatedIdentityId) {
        console.warn(`Authorization failed: ${authenticatedIdentityId} attempted to unlink from ${primaryIdentityId}`);
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. You can only unlink your own accounts.' }),
        };
      }

      // Get primary user profile
      const getPrimaryCommand = new GetCommand({
        TableName: tableName,
        Key: { identityId: primaryIdentityId },
      });
      const primaryProfileResult = await dynamoClient.send(getPrimaryCommand);
      const primaryProfile = primaryProfileResult.Item;

      if (!primaryProfile) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'User profile not found.' }),
        };
      }

      const linkedAccounts = primaryProfile.linkedAccounts || {};
      const providerKey = provider.toLowerCase();

      if (!linkedAccounts[providerKey]) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ message: `No linked ${provider} account found.` }),
        };
      }

      const secondaryIdentityId = linkedAccounts[providerKey].identityId;

      // Remove from primary profile
      delete linkedAccounts[providerKey];

      // Determine which fields to remove based on the unlinked provider
      let updateExpression = 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt';
      let removeExpression = '';
      const expressionValues: any = {
        ':linkedAccounts': linkedAccounts,
        ':updatedAt': new Date().toISOString(),
      };

      // Remove provider-specific fields that were merged from the unlinked account
      if (providerKey === 'google') {
        // If unlinking Google and primary is Twitter, remove email
        if (primaryProfile.provider === 'Twitter') {
          removeExpression = 'REMOVE email';
        }
      } else if (providerKey === 'twitter') {
        // If unlinking Twitter and primary is Google, remove Twitter-specific fields
        if (primaryProfile.provider === 'Google') {
          removeExpression = 'REMOVE twitterHandle, twitterId, profileImageUrl';
        }
      } else if (providerKey === 'metamask') {
        // MetaMask unlink signature verification REMOVED for better UX
        // Users should be able to unlink lost wallets without signing
        // Authentication is already handled by API Gateway (or identity check)
        removeExpression = 'REMOVE walletAddress';
      }

      // Combine expressions
      if (removeExpression) {
        updateExpression = `${updateExpression} ${removeExpression}`;
      }

      const updatePrimaryCommand = new UpdateCommand({
        TableName: tableName,
        Key: { identityId: primaryIdentityId },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
      });

      await dynamoClient.send(updatePrimaryCommand);

      // Remove reverse link and ownership marker from secondary profile
      if (secondaryIdentityId) {
        const getSecondaryCommand = new GetCommand({
          TableName: tableName,
          Key: { identityId: secondaryIdentityId },
        });
        const secondaryProfileResult = await dynamoClient.send(getSecondaryCommand);
        const secondaryProfile = secondaryProfileResult.Item;

        if (secondaryProfile) {
          const secondaryLinkedAccounts = secondaryProfile.linkedAccounts || {};
          const primaryProviderKey = primaryProfile.provider?.toLowerCase() || 'unknown';
          delete secondaryLinkedAccounts[primaryProviderKey];

          // Only remove linkedToPrimaryId if it points to the primary doing the unlink.
          // Otherwise, a stale unlink could wipe ownership set by the current legitimate owner.
          const isCurrentOwner = secondaryProfile.linkedToPrimaryId === primaryIdentityId;
          const unlinkUpdateExpr = isCurrentOwner
            ? 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt REMOVE linkedToPrimaryId'
            : 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt';

          const updateSecondaryCommand = new UpdateCommand({
            TableName: tableName,
            Key: { identityId: secondaryIdentityId },
            UpdateExpression: unlinkUpdateExpr,
            ExpressionAttributeValues: {
              ':linkedAccounts': secondaryLinkedAccounts,
              ':updatedAt': new Date().toISOString(),
            },
          });

          await dynamoClient.send(updateSecondaryCommand);
        }
      }

      console.log('Account unlinking successful');

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Account unlinked successfully.' }),
      };
    }

    // Link flow
    const { primaryIdentityId, secondaryIdentityId, secondaryProvider } = JSON.parse(event.body || '{}');

    if (!primaryIdentityId || !secondaryIdentityId || !secondaryProvider) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'primaryIdentityId, secondaryIdentityId, and secondaryProvider are required' }),
      };
    }

    // Authorization: Ensure the authenticated user owns the primary account
    if (primaryIdentityId !== authenticatedIdentityId) {
      console.warn(`Authorization failed: ${authenticatedIdentityId} attempted to link to ${primaryIdentityId}`);
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Forbidden. You can only link accounts to your own identity.' }),
      };
    }

    // 1. Get the secondary user's profile to get their details
    const getCommand = new GetCommand({
      TableName: tableName,
      Key: { identityId: secondaryIdentityId },
    });
    const secondaryProfileResult = await dynamoClient.send(getCommand);
    const secondaryProfile = secondaryProfileResult.Item;

    if (!secondaryProfile) {
        return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'Secondary user profile not found.' }),
        };
    }

    // 2. Get the primary user's current profile
    const getPrimaryCommand = new GetCommand({
      TableName: tableName,
      Key: { identityId: primaryIdentityId },
    });
    const primaryProfileResult = await dynamoClient.send(getPrimaryCommand);
    const primaryProfile = primaryProfileResult.Item;

    if (!primaryProfile) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'Primary user profile not found.' }),
      };
    }

    // 2.5. Auto-transfer: linkedToPrimaryId as primary source, reverse link as v1 fallback
    const currentOwnerId = secondaryProfile.linkedToPrimaryId;
    let oldPrimaryId: string | undefined;

    console.log(JSON.stringify({
      event: 'AUTO_TRANSFER_CHECK',
      currentOwnerId: currentOwnerId || null,
      primaryIdentityId,
      secondaryIdentityId,
    }));

    if (currentOwnerId && currentOwnerId !== primaryIdentityId) {
      // V2: linkedToPrimaryId points to a different owner → transfer needed
      oldPrimaryId = currentOwnerId;
    } else if (!currentOwnerId) {
      // V1 fallback: legacy data without linkedToPrimaryId → check reverse links
      const existingSecondaryLinks = secondaryProfile.linkedAccounts || {};
      const conflictingLink = Object.entries(existingSecondaryLinks)
        .find(([, info]: [string, any]) => info?.identityId && info.identityId !== primaryIdentityId);
      if (conflictingLink) {
        oldPrimaryId = (conflictingLink[1] as any).identityId;
      }
    }

    if (oldPrimaryId) {
      const oldPrimaryResult = await dynamoClient.send(new GetCommand({
        TableName: tableName,
        Key: { identityId: oldPrimaryId },
      }));
      const oldPrimary = oldPrimaryResult.Item;

      if (oldPrimary) {
        const oldLinked = oldPrimary.linkedAccounts || {};
        const matchingKey = Object.keys(oldLinked)
          .find(k => oldLinked[k]?.identityId === secondaryIdentityId);

        if (matchingKey) {
          delete oldLinked[matchingKey];

          let unlinkExpr = 'SET linkedAccounts = :la, updatedAt = :ua';
          if (matchingKey === 'twitter' && oldPrimary.provider === 'Google') {
            unlinkExpr += ' REMOVE twitterHandle, twitterId, profileImageUrl';
          } else if (matchingKey === 'google' && oldPrimary.provider === 'Twitter') {
            unlinkExpr += ' REMOVE email';
          } else if (matchingKey === 'metamask') {
            unlinkExpr += ' REMOVE walletAddress';
          }

          await dynamoClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { identityId: oldPrimaryId },
            UpdateExpression: unlinkExpr,
            ExpressionAttributeValues: {
              ':la': oldLinked,
              ':ua': new Date().toISOString(),
            },
          }));

          console.log(JSON.stringify({
            event: 'AUTO_TRANSFER_UNLINK',
            oldPrimaryId,
            newPrimaryId: primaryIdentityId,
            secondaryId: secondaryIdentityId,
            provider: matchingKey,
          }));
        }
      }
    }

    // 3. Build the linked account info
    const providerKey = secondaryProvider.toLowerCase(); // e.g., 'twitter' or 'google'

    console.log('Linking accounts:', { primaryIdentityId, secondaryIdentityId, providerKey });

    const linkedInfo: any = {
      identityId: secondaryIdentityId,
      username: secondaryProfile.username || 'N/A',
      linkedAt: new Date().toISOString(),
    };

    // Add optional fields if they exist
    if (secondaryProfile.twitterHandle) {
      linkedInfo.twitterHandle = secondaryProfile.twitterHandle;
    }
    if (secondaryProfile.originalTwitterHandle) {
      linkedInfo.originalTwitterHandle = secondaryProfile.originalTwitterHandle;
    }
    if (secondaryProfile.twitterId) {
      linkedInfo.twitterId = secondaryProfile.twitterId;
    }
    if (secondaryProfile.email) {
      linkedInfo.email = secondaryProfile.email;
    }
    if (secondaryProfile.profileImageUrl) {
      linkedInfo.profileImageUrl = secondaryProfile.profileImageUrl;
    }
    // MetaMask-specific field
    if (secondaryProfile.walletAddress) {
      linkedInfo.walletAddress = secondaryProfile.walletAddress;
    }

    console.log('Built linkedInfo:', JSON.stringify(linkedInfo, null, 2));

    // 4. Merge with existing linkedAccounts in primary profile
    const primaryLinkedAccounts = primaryProfile.linkedAccounts || {};
    primaryLinkedAccounts[providerKey] = linkedInfo;

    // 5. Update the primary user's profile
    const updatePrimaryCommand = new UpdateCommand({
      TableName: tableName,
      Key: { identityId: primaryIdentityId },
      UpdateExpression: 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':linkedAccounts': primaryLinkedAccounts,
        ':updatedAt': new Date().toISOString(),
      },
    });

    console.log('Updating primary profile with linkedAccounts:', primaryLinkedAccounts);
    await dynamoClient.send(updatePrimaryCommand);

    // 6. Build reverse link info for secondary profile
    const primaryProviderKey = primaryProfile.provider?.toLowerCase() || 'unknown';
    const reverseLinkInfo: any = {
      identityId: primaryIdentityId,
      username: primaryProfile.username || 'N/A',
      linkedAt: new Date().toISOString(),
    };

    if (primaryProfile.email) reverseLinkInfo.email = primaryProfile.email;
    if (primaryProfile.twitterHandle) reverseLinkInfo.twitterHandle = primaryProfile.twitterHandle;
    if (primaryProfile.originalTwitterHandle) reverseLinkInfo.originalTwitterHandle = primaryProfile.originalTwitterHandle;
    if (primaryProfile.twitterId) reverseLinkInfo.twitterId = primaryProfile.twitterId;
    if (primaryProfile.profileImageUrl) reverseLinkInfo.profileImageUrl = primaryProfile.profileImageUrl;
    // MetaMask-specific field
    if (primaryProfile.walletAddress) reverseLinkInfo.walletAddress = primaryProfile.walletAddress;

    // 7. Update secondary profile with reverse link
    const secondaryLinkedAccounts = secondaryProfile.linkedAccounts || {};
    secondaryLinkedAccounts[primaryProviderKey] = reverseLinkInfo;

    // Optimistic lock: only write if linkedToPrimaryId hasn't changed since we read it
    const readOwner = secondaryProfile.linkedToPrimaryId;
    const conditionExpr = readOwner
      ? 'linkedToPrimaryId = :expectedOwner'
      : 'attribute_not_exists(linkedToPrimaryId)';

    const secondaryExprValues: Record<string, any> = {
      ':linkedAccounts': secondaryLinkedAccounts,
      ':owner': primaryIdentityId,
      ':updatedAt': new Date().toISOString(),
    };
    if (readOwner) {
      secondaryExprValues[':expectedOwner'] = readOwner;
    }

    const updateSecondaryCommand = new UpdateCommand({
      TableName: tableName,
      Key: { identityId: secondaryIdentityId },
      UpdateExpression: 'SET linkedAccounts = :linkedAccounts, linkedToPrimaryId = :owner, updatedAt = :updatedAt',
      ConditionExpression: conditionExpr,
      ExpressionAttributeValues: secondaryExprValues,
    });

    console.log('Updating secondary profile with linkedAccounts:', secondaryLinkedAccounts);
    try {
      await dynamoClient.send(updateSecondaryCommand);
    } catch (err: any) {
      if (err.name === 'ConditionalCheckFailedException') {
        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'This account was just linked by another user. Please try again.' }),
        };
      }
      throw err;
    }
    console.log('Bidirectional account linking successful');

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: 'Accounts linked successfully.' }),
    };

  } catch (error: any) {
    console.error('Error linking accounts:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
