/**
 * POST /v3/posts - Create a new post entry
 *
 * Admin-only endpoint for registering social media posts to the leaderboard.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AccountRole,
  ContentSignal,
  CreatePostRequest,
  CreatePostResponse,
  PostType,
} from '../types';
import { normalizeUrl } from '../utils/url-normalizer';
import { createPost, getPostByUrl, getAccountByUsername } from '../services/dynamodb-client';

// Admin password from environment
const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

/**
 * Validate admin authentication
 */
function validateAuth(event: APIGatewayProxyEvent): boolean {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];

  if (!authHeader || !ADMIN_PASSWORD) {
    return false;
  }

  // Expect: "Bearer {password}"
  const [type, password] = authHeader.split(' ');

  if (type !== 'Bearer' || password !== ADMIN_PASSWORD) {
    return false;
  }

  return true;
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): {
  valid: boolean;
  data?: CreatePostRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const req = body as Record<string, unknown>;

  // Validate postUrl
  if (!req.postUrl || typeof req.postUrl !== 'string') {
    return { valid: false, error: 'postUrl is required' };
  }

  // Validate accountRole
  const validRoles: AccountRole[] = ['kol', 'proactive_ct', 'default'];
  if (!req.accountRole || !validRoles.includes(req.accountRole as AccountRole)) {
    return {
      valid: false,
      error: `accountRole must be one of: ${validRoles.join(', ')}`,
    };
  }

  // Validate contentSignals
  const validSignals: ContentSignal[] = ['standard', 'insight', 'creative', 'high_reach'];
  if (!Array.isArray(req.contentSignals)) {
    return { valid: false, error: 'contentSignals must be an array' };
  }

  for (const signal of req.contentSignals) {
    if (!validSignals.includes(signal as ContentSignal)) {
      return {
        valid: false,
        error: `Invalid signal: ${signal}. Must be one of: ${validSignals.join(', ')}`,
      };
    }
  }

  // Ensure 'standard' is always included
  let signals = req.contentSignals as ContentSignal[];
  if (!signals.includes('standard')) {
    signals = ['standard', ...signals];
  }

  // Phase 9: Validate postType (optional, defaults to 'original')
  const validPostTypes: PostType[] = ['original', 'quote', 'reply'];
  let postType: PostType = 'original';
  if (req.postType !== undefined) {
    if (!validPostTypes.includes(req.postType as PostType)) {
      return {
        valid: false,
        error: `postType must be one of: ${validPostTypes.join(', ')}`,
      };
    }
    postType = req.postType as PostType;
  }

  return {
    valid: true,
    data: {
      postUrl: req.postUrl as string,
      accountRole: req.accountRole as AccountRole,
      contentSignals: signals,
      postType,
    },
  };
}

/**
 * Create CORS response
 */
function createResponse(statusCode: number, body: CreatePostResponse): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { success: true });
  }

  try {
    // Validate auth
    if (!validateAuth(event)) {
      return createResponse(401, {
        success: false,
        error: 'Unauthorized. Invalid or missing admin password.',
      });
    }

    // Parse body
    let body: unknown;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return createResponse(400, {
        success: false,
        error: 'Invalid JSON in request body',
      });
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid || !validation.data) {
      return createResponse(400, {
        success: false,
        error: validation.error,
      });
    }

    const { postUrl, accountRole, contentSignals, postType } = validation.data;

    // Normalize URL
    const normalized = normalizeUrl(postUrl);
    if (!normalized.isValid) {
      return createResponse(400, {
        success: false,
        error: normalized.error || 'Invalid URL',
      });
    }

    // Check if account is banned
    const existingAccount = await getAccountByUsername(normalized.platform, normalized.username);
    if (existingAccount?.isBanned) {
      return createResponse(403, {
        success: false,
        error: 'This account is banned and cannot register posts',
        // @ts-ignore - CreatePostResponse doesn't explicitly include username but it's useful for debugging
        username: normalized.username,
      });
    }

    // Check for duplicate
    const existingPost = await getPostByUrl(normalized.normalizedUrl);
    if (existingPost) {
      return createResponse(409, {
        success: false,
        error: 'This post has already been registered',
        isDuplicate: true,
        post: existingPost,
      });
    }

    // Get admin username from header or use default
    const adminUsername =
      event.headers['X-Admin-Username'] ||
      event.headers['x-admin-username'] ||
      'admin';

    // Create post
    const { post, account } = await createPost({
      normalizedUrl: normalized.normalizedUrl,
      rawUrl: postUrl,
      platform: normalized.platform,
      username: normalized.username,
      originalUsername: normalized.originalUsername,
      accountRole,
      contentSignals,
      postType, // Phase 9: Post type differentiation
      createdBy: adminUsername,
    });

    return createResponse(201, {
      success: true,
      post,
      account,
    });
  } catch (error) {
    console.error('Error creating post:', error);

    return createResponse(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};
