/**
 * Admin Edit Post Handler
 *
 * Allows admins to edit post fields before the next snapshot is generated.
 * Score delta adjustments are applied to season and cumulative aggregates.
 * Derived scores (userScore, rawScore) will be recalculated at next snapshot (09:00 KST daily).
 *
 * Note: Changing username/platform updates the post record only.
 * The post remains associated with the original account (accountId is immutable).
 * To reassign a post to a different account, delete and re-create it.
 *
 * Endpoint:
 * - PATCH /v3/admin/posts/{postId}  Update post fields
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AccountLanguage, AccountRole, ContentSignal, Platform, Post } from '../types';
import { getAccountById, getPostById, updateAccountLanguageData, updatePostAndAdjustScores } from '../services/dynamodb-client';
import { corsHeaders } from '../utils/cors';

let _requestOrigin: string | undefined;

const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(_requestOrigin),
    body: JSON.stringify(body),
  };
}

function validateAdmin(event: APIGatewayProxyEvent): boolean {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (!authHeader || !ADMIN_PASSWORD) return false;
  const [bearer, password] = authHeader.split(' ');
  return bearer?.toLowerCase() === 'bearer' && password === ADMIN_PASSWORD;
}

const VALID_PLATFORMS: Platform[] = ['twitter', 'discord', 'farcaster'];
const VALID_ROLES: AccountRole[] = ['kol', 'proactive_ct', 'default'];
const VALID_SIGNALS: ContentSignal[] = ['standard', 'insight', 'creative', 'high_reach'];
const VALID_LANGUAGES: AccountLanguage[] = ['en', 'zh', 'ja', 'ko'];

interface EditPostRequest {
  platform?: Platform;
  username?: string;
  originalUsername?: string;
  postScore?: number;
  contentSignals?: ContentSignal[];
  accountRole?: AccountRole;
  // Account-level fields (updates Account record, not Post)
  language?: AccountLanguage;
  followerCount?: number;
}

function validateEditRequest(body: unknown): { valid: boolean; data?: EditPostRequest; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a non-empty object' };
  }

  const req = body as Record<string, unknown>;

  if (req.platform !== undefined && !VALID_PLATFORMS.includes(req.platform as Platform)) {
    return { valid: false, error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` };
  }

  if (req.accountRole !== undefined && !VALID_ROLES.includes(req.accountRole as AccountRole)) {
    return { valid: false, error: `Invalid accountRole. Must be one of: ${VALID_ROLES.join(', ')}` };
  }

  if (req.contentSignals !== undefined) {
    if (!Array.isArray(req.contentSignals)) {
      return { valid: false, error: 'contentSignals must be an array' };
    }
    for (const signal of req.contentSignals) {
      if (!VALID_SIGNALS.includes(signal as ContentSignal)) {
        return { valid: false, error: `Invalid signal: ${signal}. Must be one of: ${VALID_SIGNALS.join(', ')}` };
      }
    }
  }

  if (req.postScore !== undefined) {
    if (typeof req.postScore !== 'number' || req.postScore < 0 || req.postScore > 10) {
      return { valid: false, error: 'postScore must be a number between 0 and 10' };
    }
    // Normalize to 3 decimal places for consistency with score calculator
    req.postScore = Math.round(req.postScore * 1000) / 1000;
  }

  if (req.username !== undefined) {
    if (typeof req.username !== 'string' || req.username.trim() === '' || req.username.length > 100) {
      return { valid: false, error: 'username must be a non-empty string (max 100 chars)' };
    }
  }

  if (req.originalUsername !== undefined) {
    if (typeof req.originalUsername !== 'string' || req.originalUsername.trim() === '' || req.originalUsername.length > 100) {
      return { valid: false, error: 'originalUsername must be a non-empty string (max 100 chars)' };
    }
  }

  if (req.language !== undefined && !VALID_LANGUAGES.includes(req.language as AccountLanguage)) {
    return { valid: false, error: `Invalid language. Must be one of: ${VALID_LANGUAGES.join(', ')}` };
  }

  if (req.followerCount !== undefined) {
    if (typeof req.followerCount !== 'number' || !Number.isInteger(req.followerCount) || req.followerCount < 0 || req.followerCount > 100_000_000) {
      return { valid: false, error: 'followerCount must be a non-negative integer (max 100,000,000)' };
    }
  }

  return {
    valid: true,
    data: {
      platform: req.platform as Platform | undefined,
      username: req.username as string | undefined,
      originalUsername: req.originalUsername as string | undefined,
      postScore: req.postScore as number | undefined,
      contentSignals: req.contentSignals as ContentSignal[] | undefined,
      accountRole: req.accountRole as AccountRole | undefined,
      language: req.language as AccountLanguage | undefined,
      followerCount: req.followerCount as number | undefined,
    },
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  _requestOrigin = event.headers?.origin || event.headers?.Origin;
  // Log request metadata only (exclude headers to avoid logging credentials)
  console.log('Admin Edit Post request:', JSON.stringify({
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
    body: event.body,
  }, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  if (!validateAdmin(event)) {
    return createResponse(401, { error: 'Unauthorized' });
  }

  const postId = event.pathParameters?.postId;
  if (!postId) {
    return createResponse(400, { error: 'Missing postId path parameter' });
  }

  if (event.httpMethod !== 'PATCH') {
    return createResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const validation = validateEditRequest(body);
    if (!validation.valid) {
      return createResponse(400, { error: validation.error });
    }

    // Separate account-level fields from post-level fields
    const { language, followerCount, ...postUpdates } = validation.data!;
    const hasPostUpdates = Object.keys(postUpdates).some(k => postUpdates[k as keyof typeof postUpdates] !== undefined);
    const hasAccountUpdates = language !== undefined || followerCount !== undefined;

    let updatedPost: Post;
    if (hasPostUpdates) {
      // updatePostAndAdjustScores handles existence check + update + score delta
      updatedPost = await updatePostAndAdjustScores({ postId, updates: postUpdates });
    } else {
      // Account-only update: just fetch the post for accountId reference
      const existingPost = await getPostById(postId);
      if (!existingPost) {
        return createResponse(404, { error: `Post ${postId} not found` });
      }
      updatedPost = existingPost;
    }

    // Update Account-level fields if provided
    let updatedAccount;
    if (hasAccountUpdates) {
      try {
        const account = await getAccountById(updatedPost.accountId);
        if (account) {
          updatedAccount = await updateAccountLanguageData({
            accountId: updatedPost.accountId,
            language: language ?? account.language ?? 'en',
            followerCount: followerCount ?? account.followerCount ?? 0,
          });
        }
      } catch (accountError) {
        console.error('Account update failed (post update succeeded):', accountError);
        return createResponse(207, {
          success: true,
          post: updatedPost,
          warning: 'Post updated but account update failed. Retry the account fields.',
        });
      }
    }

    return createResponse(200, {
      success: true,
      post: updatedPost,
      ...(updatedAccount && { account: updatedAccount }),
    });
  } catch (error) {
    console.error('Admin Edit Post error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    // Return specific messages for known errors, generic for unexpected ones
    const isKnownError = message.includes('not found');
    return createResponse(
      isKnownError ? 404 : 500,
      { error: isKnownError ? message : 'Internal server error' }
    );
  }
};
