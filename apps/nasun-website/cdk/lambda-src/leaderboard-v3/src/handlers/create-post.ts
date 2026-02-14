/**
 * POST /v3/posts - Create a new post entry
 *
 * Admin-only endpoint for registering social media posts to the leaderboard.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AccountLanguage,
  AccountRole,
  ContentSignal,
  CreatePostRequest,
  CreatePostResponse,
  PostType,
} from '../types';
import { normalizeUrl } from '../utils/url-normalizer';
import { createPost, getPostByUrl, getAccountByUsername } from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';

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

  // Validate language (optional, for new users)
  const validLanguages: AccountLanguage[] = ['en', 'zh', 'ja', 'ko'];
  let language: AccountLanguage | undefined;
  if (req.language !== undefined) {
    if (!validLanguages.includes(req.language as AccountLanguage)) {
      return {
        valid: false,
        error: `language must be one of: ${validLanguages.join(', ')}`,
      };
    }
    language = req.language as AccountLanguage;
  }

  // Validate followerCount (optional, for new users)
  let followerCount: number | undefined;
  if (req.followerCount !== undefined) {
    if (typeof req.followerCount !== 'number' || req.followerCount < 0) {
      return {
        valid: false,
        error: 'followerCount must be a non-negative number',
      };
    }
    followerCount = req.followerCount;
  }

  return {
    valid: true,
    data: {
      postUrl: req.postUrl as string,
      accountRole: req.accountRole as AccountRole,
      contentSignals: signals,
      postType,
      language,
      followerCount,
    },
  };
}

/**
 * Create CORS response
 */
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
    return respond(200, { success: true });
  }

  try {
    // Validate auth
    const admin = await authenticateAdmin(event);
    if (!admin) {
      return respond(401, {
        success: false,
        error: 'Unauthorized',
      });
    }

    // Parse body
    let body: unknown;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, {
        success: false,
        error: 'Invalid JSON in request body',
      });
    }

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid || !validation.data) {
      return respond(400, {
        success: false,
        error: validation.error,
      });
    }

    const { postUrl, accountRole, contentSignals, postType, language, followerCount } = validation.data;

    // Normalize URL
    const normalized = normalizeUrl(postUrl);
    if (!normalized.isValid) {
      return respond(400, {
        success: false,
        error: normalized.error || 'Invalid URL',
      });
    }

    // Check if account is banned
    const existingAccount = await getAccountByUsername(normalized.platform, normalized.username);
    if (existingAccount?.isBanned) {
      return respond(403, {
        success: false,
        error: 'This account is banned and cannot register posts',
        // @ts-ignore - CreatePostResponse doesn't explicitly include username but it's useful for debugging
        username: normalized.username,
      });
    }

    // Check for duplicate
    const existingPost = await getPostByUrl(normalized.normalizedUrl);
    if (existingPost) {
      return respond(409, {
        success: false,
        error: 'This post has already been registered',
        isDuplicate: true,
        post: existingPost,
      });
    }

    // Get admin username from authenticated admin
    const adminUsername = admin.email || admin.username || 'admin';

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
      language, // For new users: CT market language
      followerCount, // For new users: X follower count
    });

    return respond(201, {
      success: true,
      post,
      account,
    });
  } catch (error) {
    console.error('Error creating post:', error);

    return respond(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};
