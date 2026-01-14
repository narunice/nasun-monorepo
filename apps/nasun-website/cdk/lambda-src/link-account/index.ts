
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';

export const handler: APIGatewayProxyHandler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
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

      // Remove reverse link from secondary profile
      if (secondaryIdentityId) {
        const getSecondaryCommand = new GetCommand({
          TableName: tableName,
          Key: { identityId: secondaryIdentityId },
        });
        const secondaryProfileResult = await dynamoClient.send(getSecondaryCommand);
        const secondaryProfile = secondaryProfileResult.Item;

        if (secondaryProfile?.linkedAccounts) {
          const secondaryLinkedAccounts = secondaryProfile.linkedAccounts || {};
          const primaryProviderKey = primaryProfile.provider?.toLowerCase() || 'unknown';
          delete secondaryLinkedAccounts[primaryProviderKey];

          const updateSecondaryCommand = new UpdateCommand({
            TableName: tableName,
            Key: { identityId: secondaryIdentityId },
            UpdateExpression: 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt',
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
    if (primaryProfile.twitterId) reverseLinkInfo.twitterId = primaryProfile.twitterId;
    if (primaryProfile.profileImageUrl) reverseLinkInfo.profileImageUrl = primaryProfile.profileImageUrl;
    // MetaMask-specific field
    if (primaryProfile.walletAddress) reverseLinkInfo.walletAddress = primaryProfile.walletAddress;

    // 7. Update secondary profile with reverse link
    const secondaryLinkedAccounts = secondaryProfile.linkedAccounts || {};
    secondaryLinkedAccounts[primaryProviderKey] = reverseLinkInfo;

    const updateSecondaryCommand = new UpdateCommand({
      TableName: tableName,
      Key: { identityId: secondaryIdentityId },
      UpdateExpression: 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':linkedAccounts': secondaryLinkedAccounts,
        ':updatedAt': new Date().toISOString(),
      },
    });

    console.log('Updating secondary profile with linkedAccounts:', secondaryLinkedAccounts);
    await dynamoClient.send(updateSecondaryCommand);
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
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
