/**
 * Admin authorization helper.
 *
 * Verifies the request bearer is a Cognito identity AND that the matching
 * UserProfiles row has role=ADMIN. Used by privileged ecosystem endpoints
 * (e.g. ecosystem-ban) so the nasun-website admin UI can call directly
 * without going through a separate AdminStack proxy.
 *
 * Cognito admin JWT is the only accepted credential. The previous
 * X-Internal-Auth shared-secret bypass was removed: it had no caller
 * (ban-users.ts hits the points DB directly, chat-server uses the separate
 * banned-users feed) and exposed a single-secret admin bypass on an
 * internet-facing path.
 */

import type { MiddlewareHandler } from 'hono';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { verifyCognitoToken } from './cognito.js';

const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

let _ddb: DynamoDBClient | null = null;
function ddb(): DynamoDBClient {
  if (!_ddb) _ddb = new DynamoDBClient({ region: AWS_REGION });
  return _ddb;
}

export interface AdminContext {
  source: 'cognito-admin';
  identityId?: string;
  email?: string;
}

async function isCognitoAdmin(identityId: string): Promise<{ ok: boolean; email?: string }> {
  try {
    const r = await ddb().send(
      new GetItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: { S: identityId } },
      }),
    );
    const role = r.Item?.role?.S;
    if (role !== 'ADMIN') return { ok: false };
    return { ok: true, email: r.Item?.email?.S };
  } catch {
    return { ok: false };
  }
}

/**
 * Hono middleware: requires `Authorization: Bearer <Cognito JWT>` whose
 * UserProfiles row has role=ADMIN.
 *
 * Sets `c.get('admin')` with the resolved AdminContext on success.
 */
export const requireAdmin: MiddlewareHandler<{
  Variables: { admin: AdminContext };
}> = async (c, next) => {
  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const cognito = await verifyCognitoToken(token);
  if (!cognito) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const adminCheck = await isCognitoAdmin(cognito.identityId);
  if (!adminCheck.ok) {
    return c.json({ error: 'forbidden', message: 'admin role required' }, 403);
  }
  c.set('admin', {
    source: 'cognito-admin',
    identityId: cognito.identityId,
    email: adminCheck.email,
  });
  await next();
};
