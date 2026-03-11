/**
 * POST /v3/admin/adjust-score - Manually adjust a user's leaderboard score
 *
 * Admin-only endpoint for granting/deducting points for contributions
 * not captured by post registration (e.g., reposts, event participation).
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAccountByUsername,
  getActiveSeason,
  getSeasonById,
  adjustAccountAdjustmentScore,
  adjustSeasonAdjustmentScore,
} from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';

interface AdjustScoreRequest {
  username: string;
  score: number;
  reason: string;
  seasonId?: string;
}

const SCORE_MIN = -5.0;
const SCORE_MAX = 5.0;
const REASON_MAX_LENGTH = 500;

function validateRequest(body: unknown): {
  valid: boolean;
  data?: AdjustScoreRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const req = body as Record<string, unknown>;

  // Validate username
  if (!req.username || typeof req.username !== 'string') {
    return { valid: false, error: 'username is required' };
  }
  const username = req.username.trim().replace(/^@/, '').toLowerCase();
  if (username.length === 0 || username.length > 50) {
    return { valid: false, error: 'Invalid username format' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return { valid: false, error: 'Username must contain only letters, numbers, and underscores' };
  }

  // Validate score
  if (req.score === undefined || typeof req.score !== 'number' || isNaN(req.score)) {
    return { valid: false, error: 'score is required and must be a number' };
  }
  if (req.score < SCORE_MIN || req.score > SCORE_MAX) {
    return { valid: false, error: `score must be between ${SCORE_MIN} and ${SCORE_MAX}` };
  }
  // Round to 1 decimal place to avoid floating point issues
  const score = Math.round(req.score * 10) / 10;

  // Validate reason
  if (!req.reason || typeof req.reason !== 'string' || req.reason.trim().length === 0) {
    return { valid: false, error: 'reason is required' };
  }
  if (req.reason.length > REASON_MAX_LENGTH) {
    return { valid: false, error: `reason must be ${REASON_MAX_LENGTH} characters or less` };
  }

  // Optional seasonId
  const seasonId = typeof req.seasonId === 'string' ? req.seasonId.trim() : undefined;

  return {
    valid: true,
    data: { username, score, reason: req.reason.trim(), seasonId },
  };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return respond(200, { success: true });
  }

  try {
    // Admin auth
    const admin = await authenticateAdmin(event);
    if (!admin) {
      return respond(401, { success: false, error: 'Unauthorized' });
    }

    // Parse body
    let body: unknown;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { success: false, error: 'Invalid JSON in request body' });
    }

    // Validate
    const validation = validateRequest(body);
    if (!validation.valid || !validation.data) {
      return respond(400, { success: false, error: validation.error });
    }

    const { username, score, reason, seasonId: requestedSeasonId } = validation.data;

    // Look up account
    const account = await getAccountByUsername('twitter', username);
    if (!account) {
      return respond(404, {
        success: false,
        error: `Account not found: @${username}. Register a post first to create the account.`,
      });
    }

    // Ban check
    if (account.isBanned) {
      return respond(400, {
        success: false,
        error: `Account @${username} is banned: ${account.banReason || 'No reason provided'}`,
      });
    }

    // Determine season
    let seasonId: string;
    if (requestedSeasonId) {
      const season = await getSeasonById(requestedSeasonId);
      if (!season) {
        return respond(404, { success: false, error: `Season not found: ${requestedSeasonId}` });
      }
      seasonId = season.seasonId;
    } else {
      const activeSeason = await getActiveSeason();
      if (!activeSeason) {
        return respond(400, { success: false, error: 'No active season found' });
      }
      seasonId = activeSeason.seasonId;
    }

    // Apply adjustments
    await adjustAccountAdjustmentScore(account.accountId, score);
    await adjustSeasonAdjustmentScore(seasonId, account.accountId, score, {
      username: account.username,
      platform: account.platform,
      originalUsername: account.originalUsername,
      displayName: account.displayName,
      profileImageUrl: account.profileImageUrl,
      isRegistered: account.isRegistered,
      isTelegramMember: account.isTelegramMember,
    });

    console.log(
      `Score adjusted: @${username} ${score > 0 ? '+' : ''}${score} by admin. Reason: ${reason}. Season: ${seasonId}`
    );

    return respond(200, {
      success: true,
      data: {
        accountId: account.accountId,
        username: account.originalUsername || username,
        adjustedScore: score,
        reason,
        seasonId,
      },
    });
  } catch (error) {
    console.error('Error adjusting score:', error);
    return respond(500, {
      success: false,
      error: 'Internal server error',
    });
  }
};
