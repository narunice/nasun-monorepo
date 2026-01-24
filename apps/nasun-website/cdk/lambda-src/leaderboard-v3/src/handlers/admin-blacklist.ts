/**
 * Admin Blacklist Management Endpoints
 *
 * GET    /v3/admin/blacklist              - List banned accounts
 * POST   /v3/admin/blacklist              - Ban an account
 * DELETE  /v3/admin/blacklist/{accountId}  - Unban an account
 *
 * Authentication: Bearer token (LEADERBOARD_V3_ADMIN_PASSWORD)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BanAccountRequest, BannedAccountEntry, BannedAccountsResponse } from '../types';
import { banAccount, unbanAccount, getBannedAccounts, getAccountById } from '../services/dynamodb-client';

const ADMIN_PASSWORD = process.env.LEADERBOARD_V3_ADMIN_PASSWORD || '';

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Username',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function validateAuth(event: APIGatewayProxyEvent): boolean {
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  if (!authHeader || !ADMIN_PASSWORD) return false;
  const parts = authHeader.split(' ');
  return parts[0] === 'Bearer' && parts[1] === ADMIN_PASSWORD;
}

function getAdminUsername(event: APIGatewayProxyEvent): string {
  return event.headers['X-Admin-Username'] || event.headers['x-admin-username'] || 'unknown';
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  // Auth check
  if (!validateAuth(event)) {
    return createResponse(401, { success: false, error: 'Unauthorized' });
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return await handleList();
      case 'POST':
        return await handleBan(event);
      case 'DELETE':
        return await handleUnban(event);
      default:
        return createResponse(405, { success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin blacklist error:', error);
    return createResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

async function handleList(): Promise<APIGatewayProxyResult> {
  const accounts = await getBannedAccounts();

  const entries: BannedAccountEntry[] = accounts.map((a) => ({
    accountId: a.accountId,
    username: a.username,
    originalUsername: a.originalUsername,
    platform: a.platform,
    displayName: a.displayName,
    profileImageUrl: a.profileImageUrl,
    postCount: a.postCount,
    totalPostScore: a.totalPostScore,
    banReason: a.banReason,
    bannedAt: a.bannedAt,
    bannedBy: a.bannedBy,
  }));

  const response: BannedAccountsResponse = {
    success: true,
    accounts: entries,
    total: entries.length,
  };

  return createResponse(200, response);
}

async function handleBan(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body: BanAccountRequest = JSON.parse(event.body || '{}');

  if (!body.accountId) {
    return createResponse(400, { success: false, error: 'accountId is required' });
  }

  // Verify account exists
  const account = await getAccountById(body.accountId);
  if (!account) {
    return createResponse(404, { success: false, error: 'Account not found' });
  }

  if (account.isBanned) {
    return createResponse(409, { success: false, error: 'Account is already banned' });
  }

  const adminUsername = getAdminUsername(event);
  const updated = await banAccount({
    accountId: body.accountId,
    reason: body.reason,
    bannedBy: adminUsername,
  });

  return createResponse(200, {
    success: true,
    account: {
      accountId: updated.accountId,
      username: updated.username,
      banReason: updated.banReason,
      bannedAt: updated.bannedAt,
      bannedBy: updated.bannedBy,
    },
  });
}

async function handleUnban(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const accountId = event.pathParameters?.accountId;

  if (!accountId) {
    return createResponse(400, { success: false, error: 'accountId is required' });
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return createResponse(404, { success: false, error: 'Account not found' });
  }

  if (!account.isBanned) {
    return createResponse(409, { success: false, error: 'Account is not banned' });
  }

  const updated = await unbanAccount(accountId);

  return createResponse(200, {
    success: true,
    account: {
      accountId: updated.accountId,
      username: updated.username,
    },
  });
}
