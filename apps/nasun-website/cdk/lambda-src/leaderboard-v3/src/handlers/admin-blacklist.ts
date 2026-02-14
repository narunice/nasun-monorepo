/**
 * Admin Blacklist Management Endpoints
 *
 * GET    /v3/admin/blacklist              - List banned accounts
 * POST   /v3/admin/blacklist              - Ban an account
 * DELETE  /v3/admin/blacklist/{accountId}  - Unban an account
 *
 * Authentication: Cognito JWT token
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { BanAccountRequest, BannedAccountEntry, BannedAccountsResponse } from '../types';
import { banAccount, unbanAccount, getBannedAccounts, getAccountById } from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';
import { authenticateAdmin } from '../utils/admin-auth';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
  }

  // Auth check
  const admin = await authenticateAdmin(event);
  if (!admin) {
    return respond(401, { success: false, error: 'Unauthorized' });
  }

  try {
    switch (event.httpMethod) {
      case 'GET':
        return await handleList(respond);
      case 'POST':
        return await handleBan(event, respond, admin.email || admin.username || 'admin');
      case 'DELETE':
        return await handleUnban(event, respond);
      default:
        return respond(405, { success: false, error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Admin blacklist error:', error);
    return respond(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
};

type Respond = (status: number, body: object) => APIGatewayProxyResult;

async function handleList(respond: Respond): Promise<APIGatewayProxyResult> {
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

  return respond(200, response);
}

async function handleBan(event: APIGatewayProxyEvent, respond: Respond, adminUsername: string): Promise<APIGatewayProxyResult> {
  const body: BanAccountRequest = JSON.parse(event.body || '{}');

  if (!body.accountId) {
    return respond(400, { success: false, error: 'accountId is required' });
  }

  // Verify account exists
  const account = await getAccountById(body.accountId);
  if (!account) {
    return respond(404, { success: false, error: 'Account not found' });
  }

  if (account.isBanned) {
    return respond(409, { success: false, error: 'Account is already banned' });
  }
  const updated = await banAccount({
    accountId: body.accountId,
    reason: body.reason,
    bannedBy: adminUsername,
  });

  return respond(200, {
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

async function handleUnban(event: APIGatewayProxyEvent, respond: Respond): Promise<APIGatewayProxyResult> {
  const accountId = event.pathParameters?.accountId;

  if (!accountId) {
    return respond(400, { success: false, error: 'accountId is required' });
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return respond(404, { success: false, error: 'Account not found' });
  }

  if (!account.isBanned) {
    return respond(409, { success: false, error: 'Account is not banned' });
  }

  const updated = await unbanAccount(accountId);

  return respond(200, {
    success: true,
    account: {
      accountId: updated.accountId,
      username: updated.username,
    },
  });
}
