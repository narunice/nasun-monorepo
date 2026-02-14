/**
 * GET /v3/accounts/{username} - Get account details
 *
 * Used by Admin UI for:
 * 1. Auto-prefill of account role when URL is entered
 * 2. Viewing account history and statistics
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetAccountResponse, Platform } from '../types';
import {
  getAccountByUsername,
  getPostsByAccountId,
} from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, { found: false });
  }

  try {
    // Get username from path parameters
    const username = event.pathParameters?.username;

    if (!username) {
      return respond(400, {
        error: 'Username is required',
      });
    }

    // Get platform from query params (default to twitter)
    const platform =
      (event.queryStringParameters?.platform as Platform) || 'twitter';

    // Find account
    const account = await getAccountByUsername(platform, username.toLowerCase());

    if (!account) {
      return respond(200, {
        found: false,
      });
    }

    // Get recent posts if requested
    const includeRecentPosts =
      event.queryStringParameters?.includePosts === 'true';

    let recentPosts;
    if (includeRecentPosts) {
      recentPosts = await getPostsByAccountId(account.accountId, 10);
      // Sort by createdAt descending
      recentPosts.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const response: GetAccountResponse = {
      found: true,
      account,
      recentPosts,
    };

    return respond(200, response);
  } catch (error) {
    console.error('Error getting account:', error);

    return respond(500, {
      error: 'Internal server error',
    });
  }
};
