
import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { appendXHistory } from './utils/xHistory';
import { grantIfReferralActivated } from './onboardingBonus';
import { verifyIdentityFromBearer } from '../_shared/auth/dual-jwks';
import { mirrorIdentityWrite, authoritativeIdentityWrite, readProfileFromBox, IDENTITY_ROUTES } from '../_shared/auth/identity-write';

// AWS-exit DAL read-flip gate (S2). When IDENTITY_READ_MODE=flip the read-before-write dedup checks
// query the box first and fall back to DynamoDB on a null box result (config unset / non-200 / error).
// Read at call time so a warm lambda picks up the value once it is wired; unset = DynamoDB only.
function identityReadFlip(): boolean {
  return (process.env.IDENTITY_READ_MODE || '').trim() === 'flip';
}

/**
 * AWS-exit DAL S2.A: build the box-mirrorable projection of a UserProfiles row after link-account
 * has mutated it. The box route (/profile/link-sync) does a full-column UPSERT of exactly these
 * dal-reload-mapped columns, so each value must be the row's POST-write DynamoDB truth (not just
 * the delta) or an unchanged column would be wiped. is_telegram_member / telegram_user_id /
 * attributes are intentionally absent (the box route leaves them untouched on conflict).
 */
function linkSyncRow(
  identityId: string,
  linkedAccounts: Record<string, any> | undefined,
  linkedToPrimaryId: string | null | undefined,
  twitterHandle: string | null | undefined,
  twitterId: string | null | undefined,
  walletAddressNull = false,
  attributes?: Record<string, any>,
): Record<string, any> {
  const row: Record<string, any> = {
    identityId,
    linkedAccounts: linkedAccounts ?? {},
    linkedToPrimaryId: linkedToPrimaryId ?? null,
    twitterHandle: twitterHandle ?? null,
    twitterId: twitterId ?? null,
  };
  if (walletAddressNull) row.walletAddressNull = true;
  // Only set for a row that may be a FRESH INSERT in the box (the auto-created secondary). The box
  // route populates attributes on INSERT and ignores it on conflict, so existing rows are unaffected.
  if (attributes !== undefined) row.attributes = attributes;
  return row;
}

// dal-reload's promoted UserProfiles keys (-> dedicated box columns). Everything NOT in this set is
// folded into the box `attributes` JSONB. Keep in sync with dal-reload.mjs JOBS.user_profiles.promoted
// so a freshly mirrored secondary's attributes byte-match what dal-reload would have synthesized from
// the flat DynamoDB item (dal-reload is permanently stopped and can no longer backfill).
const PROMOTED_PROFILE_KEYS = new Set([
  'identityId', 'walletAddress', 'twitterHandle', 'twitterId', 'telegramUserId',
  'isTelegramMember', 'linkedAccounts', 'linkedToPrimaryId', 'updatedAt', 'createdAt',
]);

function profileAttributes(item: Record<string, any>): Record<string, any> {
  const attrs: Record<string, any> = {};
  for (const [k, v] of Object.entries(item)) {
    if (v === undefined) continue;
    if (!PROMOTED_PROFILE_KEYS.has(k)) attrs[k] = v;
  }
  return attrs;
}

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const genesisPassAllowlistTable = process.env.GENESIS_PASS_ALLOWLIST_TABLE || '';

/**
 * Verify a Bearer token and extract identityId. Delegates to the shared dual-JWKS verifier
 * (Cognito + nasun-issuer during the AWS-exit grace window).
 */
async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  return verifyIdentityFromBearer(authHeader);
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
  const isRegisterEvm = path.includes('/register-evm');
  const isAdminLink = path.endsWith('/admin-link');

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

      const unlinkedAccount = linkedAccounts[providerKey];
      const secondaryIdentityId = unlinkedAccount.identityId;

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
        // Remove promoted Twitter fields from primary profile (any non-Twitter provider)
        if (primaryProfile.provider !== 'Twitter') {
          removeExpression = 'REMOVE twitterHandle, originalTwitterHandle, twitterId, profileImageUrl';
        }
      } else if (providerKey === 'metamask') {
        // MetaMask unlink signature verification REMOVED for better UX
        // Users should be able to unlink lost wallets without signing
        // Authentication is already handled by API Gateway (or identity check)
        //
        // Only strip the top-level walletAddress when it is the EVM address
        // being unlinked (a MetaMask-provider primary whose login wallet IS the
        // EVM). For Nasun Wallet / Google / Twitter primaries the top-level
        // walletAddress is the Nasun login wallet and must never be removed
        // here. The EVM address lives in linkedAccounts.metamask, already
        // removed above. Blindly removing it wiped the Nasun login wallet from
        // the profile on every EVM unlink.
        const unlinkedEvmAddr = typeof unlinkedAccount?.walletAddress === 'string'
          ? unlinkedAccount.walletAddress.toLowerCase()
          : null;
        const topLevelAddr = typeof primaryProfile.walletAddress === 'string'
          ? primaryProfile.walletAddress.toLowerCase()
          : null;
        if (unlinkedEvmAddr && topLevelAddr && unlinkedEvmAddr === topLevelAddr) {
          removeExpression = 'REMOVE walletAddress';
        }
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

      // AWS-exit DAL S2.A: collect the box-mirror projection of every UserProfiles row this
      // unlink mutates (primary now, secondary below), then push once after both DDB writes.
      const unlinkMirrorRows: Record<string, any>[] = [];
      const twitterStripped = providerKey === 'twitter' && primaryProfile.provider !== 'Twitter';
      unlinkMirrorRows.push(linkSyncRow(
        primaryIdentityId,
        linkedAccounts,
        primaryProfile.linkedToPrimaryId ?? null,
        twitterStripped ? null : (primaryProfile.twitterHandle ?? null),
        twitterStripped ? null : (primaryProfile.twitterId ?? null),
        removeExpression === 'REMOVE walletAddress',
      ));

      // Record X unlink history (non-blocking, best-effort).
      // Placed after DB update succeeds to avoid phantom history on failure.
      if (providerKey === 'twitter') {
        appendXHistory(dynamoClient, tableName, primaryIdentityId, {
          changeType: 'unlink',
          oldHandle:    primaryProfile.twitterHandle,
          oldTwitterId: primaryProfile.twitterId,
        }).catch((e) => console.warn('[xHistory] append failed', e));
      }

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

          unlinkMirrorRows.push(linkSyncRow(
            secondaryIdentityId,
            secondaryLinkedAccounts,
            isCurrentOwner ? null : (secondaryProfile.linkedToPrimaryId ?? null),
            secondaryProfile.twitterHandle ?? null,
            secondaryProfile.twitterId ?? null,
          ));
        }
      }

      // AWS-exit DAL 3d-S1: carry the unlink result to the box (DynamoDB writes above are
      // authoritative-FIRST). When /profile/link-sync is in IDENTITY_WRITE_FLIP_ROUTES the box write
      // is AUTHORITATIVE (retry+throw), dual-authoritative with DynamoDB so box == DDB. The box route
      // upserts the full resulting-state rows in one tx (ON CONFLICT DO UPDATE), so the retry is
      // idempotent. Otherwise S2.A best-effort follower.
      {
        const flipRoutes = (process.env.IDENTITY_WRITE_FLIP_ROUTES || '').split(',').map((s) => s.trim());
        if (flipRoutes.includes(IDENTITY_ROUTES.profileLinkSync)) {
          await authoritativeIdentityWrite(IDENTITY_ROUTES.profileLinkSync, { rows: unlinkMirrorRows });
        } else {
          await mirrorIdentityWrite(IDENTITY_ROUTES.profileLinkSync, { rows: unlinkMirrorRows });
        }
      }

      console.log('Account unlinking successful');

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Account unlinked successfully.' }),
      };
    } else if (isRegisterEvm) {
      // Manual EVM address registration is permanently disabled. Pasting an
      // address without an ownership proof let any logged-in user attach an
      // arbitrary wallet (including high-value third-party addresses) to
      // their profile, contaminating NFT allowlists, leaderboards, and
      // dashboards that key off `linkedAccounts.metamask.walletAddress`.
      // All mobile flows now go through the MetaMask SDK with a signed
      // challenge (see /metamask/challenge + /metamask/connect-verify).
      console.warn(
        `Blocked manual EVM registration attempt by ${authenticatedIdentityId} (endpoint deprecated).`,
      );
      return {
        statusCode: 410,
        headers: corsHeaders,
        body: JSON.stringify({
          message:
            'Manual EVM wallet registration has been disabled. Link your wallet through MetaMask so we can verify ownership.',
        }),
      };
    }

    // Link flow
    const { primaryIdentityId, secondaryIdentityId, secondaryProvider,
            secondaryUsername, secondaryEmail,
            secondaryTwitterHandle, secondaryTwitterId, secondaryProfileImageUrl,
            secondaryOriginalTwitterHandle,
            confirmTransfer } = JSON.parse(event.body || '{}');

    if (!primaryIdentityId || !secondaryIdentityId || !secondaryProvider) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'primaryIdentityId, secondaryIdentityId, and secondaryProvider are required' }),
      };
    }

    // Authorization: admin-link bypasses ownership check with admin role verification
    if (isAdminLink) {
      // Admin authorization: verify caller has ADMIN role in UserProfiles
      // NOTE: DocumentClient auto-unmarshals, so .role is a plain string, NOT .role?.S
      const callerProfile = await dynamoClient.send(new GetCommand({
        TableName: tableName,
        Key: { identityId: authenticatedIdentityId },
      }));
      if (!callerProfile.Item || callerProfile.Item.role !== 'ADMIN') {
        console.warn(`Admin auth failed: ${authenticatedIdentityId} attempted admin-link`);
        return {
          statusCode: 403,
          headers: corsHeaders,
          body: JSON.stringify({ message: 'Forbidden. Admin access required.' }),
        };
      }
      console.log(JSON.stringify({
        event: 'ADMIN_MERGE_IDENTITIES',
        adminId: authenticatedIdentityId,
        primaryIdentityId,
        secondaryIdentityId,
        secondaryProvider,
        timestamp: new Date().toISOString(),
      }));
    } else if (primaryIdentityId !== authenticatedIdentityId) {
      // Regular user: ensure the authenticated user owns the primary account
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
    let secondaryProfile = secondaryProfileResult.Item;

    if (!secondaryProfile) {
      // Auto-create minimal secondary profile with ownership already set.
      // linkedToPrimaryId is set atomically to prevent orphan profiles.
      const newSecondaryProfile: Record<string, any> = {
        identityId: secondaryIdentityId,
        provider: secondaryProvider,
        username: secondaryUsername || secondaryIdentityId,
        linkedToPrimaryId: primaryIdentityId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (secondaryEmail) newSecondaryProfile.email = secondaryEmail;
      if (secondaryTwitterHandle) newSecondaryProfile.twitterHandle = secondaryTwitterHandle;
      // originalTwitterHandle/profileImageUrl come from the untrusted request body and flow into the
      // box `attributes` JSONB (the secondary's link-sync attributes + the primary's attributes-sync
      // mirror below). The box attributes-sync route accepts only string values, so guard on
      // typeof==='string' (still non-empty, matching the prior truthiness) -- a malformed non-string is
      // dropped, never stored to DDB and never mirrored, keeping box == DDB (no post-STOP drift).
      if (typeof secondaryOriginalTwitterHandle === 'string' && secondaryOriginalTwitterHandle) newSecondaryProfile.originalTwitterHandle = secondaryOriginalTwitterHandle;
      if (secondaryTwitterId) newSecondaryProfile.twitterId = secondaryTwitterId;
      if (typeof secondaryProfileImageUrl === 'string' && secondaryProfileImageUrl) newSecondaryProfile.profileImageUrl = secondaryProfileImageUrl;

      try {
        await dynamoClient.send(new PutCommand({
          TableName: tableName,
          Item: newSecondaryProfile,
          ConditionExpression: 'attribute_not_exists(identityId)',
        }));
        console.log(JSON.stringify({
          event: 'SECONDARY_PROFILE_AUTO_CREATED',
          secondaryIdentityId,
          primaryIdentityId,
          provider: secondaryProvider,
        }));
        secondaryProfile = newSecondaryProfile;
      } catch (putErr: any) {
        if (putErr.name === 'ConditionalCheckFailedException') {
          // Race condition: profile was created between Get and Put. Re-fetch.
          const retryResult = await dynamoClient.send(new GetCommand({
            TableName: tableName,
            Key: { identityId: secondaryIdentityId },
          }));
          if (!retryResult.Item) {
            return {
              statusCode: 500,
              headers: corsHeaders,
              body: JSON.stringify({ message: 'Failed to create or retrieve secondary profile.' }),
            };
          }
          secondaryProfile = retryResult.Item;
        } else {
          throw putErr;
        }
      }
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
    // AWS-exit DAL S2.A: box-mirror projection of the old primary, set only if a transfer-unlink runs.
    let oldPrimaryMirrorRow: Record<string, any> | null = null;

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
          // Twitter is uniqueness-enforced: never auto-transfer, even with
          // confirmTransfer. User must explicitly unlink X from the other
          // wallet first. (Bots used to pass referral verification by clicking
          // through the confirm modal with the same X reused on a new wallet.)
          if (matchingKey === 'twitter' && !isAdminLink) {
            console.log(JSON.stringify({
              event: 'LINK_TWITTER_TRANSFER_BLOCKED',
              oldPrimaryId,
              newPrimaryId: primaryIdentityId,
              secondaryId: secondaryIdentityId,
            }));
            return {
              statusCode: 409,
              headers: corsHeaders,
              body: JSON.stringify({
                code: 'TWITTER_ALREADY_LINKED',
                message: 'This X account is already linked to another wallet. Unlink it from the other wallet first.',
                existingPrimary: {
                  identityId: oldPrimaryId,
                  walletAddress: typeof oldPrimary.walletAddress === 'string' ? oldPrimary.walletAddress : null,
                  username: oldPrimary.customDisplayName || oldPrimary.username || null,
                },
              }),
            };
          }

          // Other providers: require explicit user confirmation before
          // transferring a linked account away from another wallet. Admin-link
          // bypasses the gate because identity merges are an intentional admin
          // operation.
          if (!isAdminLink && confirmTransfer !== true) {
            console.log(JSON.stringify({
              event: 'LINK_NEEDS_CONFIRM',
              oldPrimaryId,
              newPrimaryId: primaryIdentityId,
              secondaryId: secondaryIdentityId,
              provider: matchingKey,
            }));
            return {
              statusCode: 409,
              headers: corsHeaders,
              body: JSON.stringify({
                code: 'LINK_NEEDS_CONFIRM',
                message: `This ${secondaryProvider} account is already linked to another wallet.`,
                existingPrimary: {
                  identityId: oldPrimaryId,
                  walletAddress: typeof oldPrimary.walletAddress === 'string' ? oldPrimary.walletAddress : null,
                  username: oldPrimary.customDisplayName || oldPrimary.username || null,
                },
              }),
            };
          }

          delete oldLinked[matchingKey];

          let unlinkExpr = 'SET linkedAccounts = :la, updatedAt = :ua';
          if (matchingKey === 'twitter' && oldPrimary.provider !== 'Twitter') {
            unlinkExpr += ' REMOVE twitterHandle, originalTwitterHandle, twitterId, profileImageUrl';
          } else if (matchingKey === 'google' && oldPrimary.provider === 'Twitter') {
            unlinkExpr += ' REMOVE email';
          } else if (matchingKey === 'metamask' && oldPrimary.provider === 'MetaMask') {
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

          const oldTwitterStripped = matchingKey === 'twitter' && oldPrimary.provider !== 'Twitter';
          oldPrimaryMirrorRow = linkSyncRow(
            oldPrimaryId,
            oldLinked,
            oldPrimary.linkedToPrimaryId ?? null,
            oldTwitterStripped ? null : (oldPrimary.twitterHandle ?? null),
            oldTwitterStripped ? null : (oldPrimary.twitterId ?? null),
            matchingKey === 'metamask' && oldPrimary.provider === 'MetaMask',
          );

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

    // 5. Update the primary user's profile (promote Twitter fields to top-level for GSI/filter compatibility)
    let linkUpdateExpression = 'SET linkedAccounts = :linkedAccounts, updatedAt = :updatedAt';
    const linkExpressionValues: Record<string, any> = {
      ':linkedAccounts': primaryLinkedAccounts,
      ':updatedAt': new Date().toISOString(),
    };

    // Hard-reject: a twitterId already linked to a different (non-self) primary
    // profile cannot be re-linked. Silent transfer used to be allowed here; bots
    // exploited it to recycle one X account across many wallets to pass referral
    // verification. Legitimate migration must go through explicit unlink first.
    // Admin-link bypasses this gate (admin-driven identity merges).
    if (providerKey === 'twitter' && secondaryProfile.twitterId && !isAdminLink) {
      // "self" = the caller's own primary, the Twitter-side Cognito secondary, and anything already
      // linked to the caller (linkedAccounts.*.identityId). A match on any of these is not a conflict.
      const primaryLinked = (primaryProfile.linkedAccounts || {}) as Record<string, any>;
      const selfIds = new Set<string>([
        primaryIdentityId,
        secondaryIdentityId,
        ...Object.values(primaryLinked).map((v) => v?.identityId).filter(Boolean),
      ]);
      let conflict: { identityId: string; walletAddress: string | null; displayName: string | null } | null = null;
      try {
        // AWS-exit DAL read-flip (S2): /profile/by-twitter-id returns every row with this twitter_id
        // and the fields the 409 needs (walletAddress + username/customDisplayName) in one call,
        // replacing the twitterId-index Query + per-conflict GetItem. readProfileFromBox never throws
        // (null on config-unset / non-200 / error), so a box failure transparently falls back to the
        // DynamoDB path below -- box errors never fail-close, only an unreachable DynamoDB does.
        const box = identityReadFlip()
          ? await readProfileFromBox('/profile/by-twitter-id', { twitterId: secondaryProfile.twitterId })
          : null;
        if (box && Array.isArray(box.matches)) {
          for (const m of box.matches as Array<Record<string, any>>) {
            if (!m?.identityId || selfIds.has(m.identityId)) continue;
            conflict = {
              identityId: m.identityId,
              walletAddress: typeof m.walletAddress === 'string' ? m.walletAddress : null,
              displayName: (m.customDisplayName || m.username || null) as string | null,
            };
            break;
          }
        } else {
          // DynamoDB path (default, or box fallback). twitterId-index is KEYS_ONLY, so fetch the full
          // record via GetItem only once a real (non-self) conflict is identified.
          const dedupResult = await dynamoClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'twitterId-index',
            KeyConditionExpression: 'twitterId = :tid',
            ExpressionAttributeValues: { ':tid': secondaryProfile.twitterId },
            ProjectionExpression: 'identityId',
          }));
          for (const item of dedupResult.Items || []) {
            const dupId = item.identityId as string;
            if (selfIds.has(dupId)) continue;
            const dupRecord = await dynamoClient.send(new GetCommand({
              TableName: tableName,
              Key: { identityId: dupId },
              ProjectionExpression: 'walletAddress, username, customDisplayName',
            }));
            const dupItem = dupRecord.Item || {};
            conflict = {
              identityId: dupId,
              walletAddress: typeof dupItem.walletAddress === 'string' ? dupItem.walletAddress : null,
              displayName: (dupItem.customDisplayName || dupItem.username || null) as string | null,
            };
            break;
          }
        }
      } catch (dedupError) {
        console.warn('Twitter uniqueness query failed:', dedupError);
        // Fail closed: if we cannot verify uniqueness, refuse the link.
        return {
          statusCode: 503,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'TWITTER_UNIQUENESS_CHECK_FAILED',
            message: 'Could not verify X account uniqueness. Please try again.',
          }),
        };
      }
      if (conflict) {
        console.log(JSON.stringify({
          event: 'LINK_TWITTER_ALREADY_LINKED',
          twitterId: secondaryProfile.twitterId,
          otherPrimaryId: conflict.identityId,
          attemptedPrimaryId: primaryIdentityId,
          secondaryId: secondaryIdentityId,
        }));
        return {
          statusCode: 409,
          headers: corsHeaders,
          body: JSON.stringify({
            code: 'TWITTER_ALREADY_LINKED',
            message: 'This X account is already linked to another wallet. Unlink it from the other wallet first.',
            existingPrimary: {
              identityId: conflict.identityId,
              walletAddress: conflict.walletAddress,
              username: conflict.displayName,
            },
          }),
        };
      }
    }

    // MetaMask dedup: revoke manual registrations of the same wallet address
    if (providerKey === 'metamask' && secondaryProfile.walletAddress) {
      const signedWalletAddress = secondaryProfile.walletAddress.toLowerCase();

      try {
        // AWS-exit DAL read-flip (S2): /profile/by-metamask-address mirrors this dedup's DynamoDB
        // Scan (linkedAccounts.metamask.walletAddress == addr AND .manualEntry == true), returning
        // {identityId, linkedAccounts} per match -- byte-parity with the Scan's projection. The box
        // route lower-cases the address (the caller already did) and matches the JSON boolean via
        // ->>'manualEntry'='true'. readProfileFromBox never throws (null on unset/non-200/error), so a
        // box failure transparently falls back to the Scan below. A 200 {matches:[]} is an
        // authoritative "no manual duplicates" and correctly skips cleanup.
        const box = identityReadFlip()
          ? await readProfileFromBox('/profile/by-metamask-address', { walletAddress: signedWalletAddress })
          : null;
        let dupItems: Array<{ identityId: string; linkedAccounts: Record<string, any> }>;
        if (box && Array.isArray(box.matches)) {
          dupItems = (box.matches as Array<Record<string, any>>).map((m) => ({
            identityId: m.identityId as string,
            linkedAccounts: (m.linkedAccounts as Record<string, any>) || {},
          }));
        } else {
          const scanResult = await dynamoClient.send(new ScanCommand({
            TableName: tableName,
            FilterExpression:
              'linkedAccounts.metamask.walletAddress = :addr ' +
              'AND linkedAccounts.metamask.manualEntry = :manual',
            ExpressionAttributeValues: {
              ':addr': signedWalletAddress,
              ':manual': true,
            },
            ProjectionExpression: 'identityId, linkedAccounts',
          }));
          dupItems = (scanResult.Items || []).map((it) => ({
            identityId: it.identityId as string,
            linkedAccounts: (it.linkedAccounts as Record<string, any>) || {},
          }));
        }

        // Cap cumulative box-write time across all imposters: the loop awaits sequentially and the
        // imposter count is unbounded (multi-account paste-linking is the abuse dedup cleans), so an
        // N-imposter dead/slow-box case would be N x ~5.4s and could blow the 10s lambda timeout -> a
        // 504 that fails the link (the exact outcome this non-blocking block must avoid). The budget
        // keeps total box spend bounded (~6s) regardless of N: a healthy box (~330ms/write) keeps the
        // early writes retry-hardened (budget stays above the 5.4s retry floor for the first ~2 fast
        // writes, then downgrades to single-attempt -- harmless on a healthy box), while a dead box
        // burns one retrying attempt then skips the rest.
        // A skipped/failed mirror is left to reconcile/self-heal (same backstop as any best-effort miss).
        const dedupBoxDeadlineMs = Date.now() + 6000;
        for (const item of dupItems) {
          const dupId = item.identityId;
          if (dupId === primaryIdentityId || dupId === secondaryIdentityId) continue;

          try {
            // 1. Remove linkedAccounts.metamask from the imposter profile
            const dupLinked = item.linkedAccounts || {};
            delete dupLinked.metamask;

            await dynamoClient.send(new UpdateCommand({
              TableName: tableName,
              Key: { identityId: dupId },
              UpdateExpression: 'SET linkedAccounts = :la, updatedAt = :ua',
              ExpressionAttributeValues: {
                ':la': dupLinked,
                ':ua': new Date().toISOString(),
              },
            }));

            // 2. Clean up Genesis Pass allowlist entry owned by this identity
            if (genesisPassAllowlistTable) {
              const gsiResult = await dynamoClient.send(new QueryCommand({
                TableName: genesisPassAllowlistTable,
                IndexName: 'identityId-index',
                KeyConditionExpression: 'identityId = :id',
                ExpressionAttributeValues: { ':id': dupId },
                Limit: 1,
              }));

              const allowlistEntry = gsiResult.Items?.[0];
              if (allowlistEntry && allowlistEntry.status === 'ACTIVE') {
                await dynamoClient.send(new DeleteCommand({
                  TableName: genesisPassAllowlistTable,
                  Key: { walletAddress: allowlistEntry.walletAddress as string },
                  ConditionExpression: 'identityId = :id',
                  ExpressionAttributeValues: { ':id': dupId },
                }));
              }
            }

            // 3. AWS-exit DAL: mirror the metamask-link revocation to the box. The DDB update above
            // persists the imposter's linkedAccounts minus metamask; the box route removes only the
            // metamask sub-key (jsonb - 'metamask'), byte-equivalent since metamask is the sole removed
            // key. Done LAST so a box failure does not skip the DDB-side cleanup above. Retry-hardened
            // best-effort: authoritativeIdentityWrite retries a transient box blip (reducing post-STOP
            // box<->DDB drift on the imposter row), but its final throw is swallowed by the enclosing
            // non-blocking catch -- intentional, because the whole dedup cleanup (incl. the DDB writes)
            // is a best-effort side effect of linking that must never fail the link. Bounded by the
            // per-loop budget: retry only while >=5.4s of budget remains (room for a full 2-attempt
            // worst case), a single attempt while >=0.8s remains, and skip once exhausted. A skipped or
            // failed mirror is surfaced by the daily reconcile/alert and self-heals on the next link
            // touching this address.
            const boxBudgetMs = dedupBoxDeadlineMs - Date.now();
            if (boxBudgetMs >= 800) {
              await authoritativeIdentityWrite(
                IDENTITY_ROUTES.linkedAccountMerge,
                { identityId: dupId, provider: 'metamask' },
                { timeoutMs: Math.min(2500, boxBudgetMs), retries: boxBudgetMs >= 5400 ? 1 : 0 },
              );
            }

            console.log(JSON.stringify({
              event: 'METAMASK_DEDUP_CLEANUP',
              cleanedProfileId: dupId,
              walletAddress: signedWalletAddress,
              newOwnerId: primaryIdentityId,
            }));
          } catch (condErr: any) {
            if (condErr.name !== 'ConditionalCheckFailedException') {
              console.warn('MetaMask dedup cleanup failed for', dupId, condErr);
            }
          }
        }
      } catch (dedupError) {
        console.warn('MetaMask dedup scan failed (non-blocking):', dedupError);
      }
    }

    if (providerKey === 'twitter') {
      if (secondaryProfile.twitterHandle) {
        linkUpdateExpression += ', twitterHandle = :th';
        linkExpressionValues[':th'] = secondaryProfile.twitterHandle;
      }
      if (secondaryProfile.originalTwitterHandle) {
        linkUpdateExpression += ', originalTwitterHandle = :oth';
        linkExpressionValues[':oth'] = secondaryProfile.originalTwitterHandle;
      }
      if (secondaryProfile.twitterId) {
        linkUpdateExpression += ', twitterId = :tid';
        linkExpressionValues[':tid'] = secondaryProfile.twitterId;
      }
      if (secondaryProfile.profileImageUrl) {
        linkUpdateExpression += ', profileImageUrl = :img';
        linkExpressionValues[':img'] = secondaryProfile.profileImageUrl;
      }
    }

    const updatePrimaryCommand = new UpdateCommand({
      TableName: tableName,
      Key: { identityId: primaryIdentityId },
      UpdateExpression: linkUpdateExpression,
      ExpressionAttributeValues: linkExpressionValues,
    });

    console.log('Updating primary profile with linkedAccounts:', primaryLinkedAccounts);
    await dynamoClient.send(updatePrimaryCommand);

    // Onboarding bonus grants. PG UNIQUE on (tx_digest, activity_type, event_seq)
    // dedupes (auth-twitter callback also grants x-link on X re-login), so only
    // the first INSERT for a given twitterId wins. Both entrypoints needed to
    // cover X-as-primary (callback) and X-as-secondary (this path) flows.
    if (process.env.EXPLORER_API_URL) {
      const onboardingCommon = {
        ddbClient: dynamoClient,
        referralsTable: process.env.REFERRALS_TABLE || 'nasun-referrals',
        explorerApiUrl: process.env.EXPLORER_API_URL,
        apiKey: process.env.ONBOARDING_BONUS_API_KEY || '',
        identityId: primaryIdentityId,
        walletAddress: primaryProfile.walletAddress ?? null,
      };
      if (providerKey === 'google') {
        // Google externalId = secondary Cognito identityId (stable per Google account).
        await grantIfReferralActivated({
          ...onboardingCommon,
          kind: 'google-link',
          externalId: secondaryIdentityId,
        }).catch((e) => console.warn('[onboarding-bonus] google-link non-fatal', e));
      } else if (providerKey === 'twitter' && secondaryProfile.twitterId) {
        await grantIfReferralActivated({
          ...onboardingCommon,
          kind: 'x-link',
          externalId: secondaryProfile.twitterId,
        }).catch((e) => console.warn('[onboarding-bonus] x-link non-fatal', e));
      }
    }

    // Record X link history (non-blocking, best-effort)
    if (providerKey === 'twitter') {
      const xChangeType = primaryProfile.twitterHandle ? 'account_switch' : 'initial_link';
      appendXHistory(dynamoClient, tableName, primaryIdentityId, {
        changeType:   xChangeType,
        oldHandle:    primaryProfile.twitterHandle,
        newHandle:    secondaryProfile.twitterHandle,
        oldTwitterId: primaryProfile.twitterId,
        newTwitterId: secondaryProfile.twitterId,
      }).catch((e) => console.warn('[xHistory] append failed', e));
    }

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

    // AWS-exit DAL S2.A: mirror the link result to the box. Every UserProfiles row this flow
    // mutated (old primary on transfer, primary, secondary) is sent as its full post-write
    // projection in one tx. Metamask manual-entry dedup rows (rare) are left to dal-reload.
    const linkMirrorRows: Record<string, any>[] = [];
    if (oldPrimaryMirrorRow) linkMirrorRows.push(oldPrimaryMirrorRow);
    linkMirrorRows.push(linkSyncRow(
      primaryIdentityId,
      primaryLinkedAccounts,
      primaryProfile.linkedToPrimaryId ?? null,
      providerKey === 'twitter'
        ? (secondaryProfile.twitterHandle || primaryProfile.twitterHandle || null)
        : (primaryProfile.twitterHandle ?? null),
      providerKey === 'twitter'
        ? (secondaryProfile.twitterId || primaryProfile.twitterId || null)
        : (primaryProfile.twitterId ?? null),
    ));
    // Secondary is the only row this flow can freshly INSERT into the box (auto-created above when it
    // had no profile). Carry its attributes = omit(item, promoted) so a brand-new secondary lands with
    // provider/username/email populated instead of NULL (the box ignores it on conflict for existing rows).
    linkMirrorRows.push(linkSyncRow(
      secondaryIdentityId,
      secondaryLinkedAccounts,
      primaryIdentityId,
      secondaryProfile.twitterHandle ?? null,
      secondaryProfile.twitterId ?? null,
      false,
      profileAttributes(secondaryProfile),
    ));
    // AWS-exit DAL 3d-S1: authoritative box write when /profile/link-sync is flipped (see unlink
    // path above for rationale); dual-authoritative with the DynamoDB link writes, idempotent upsert.
    {
      const flipRoutes = (process.env.IDENTITY_WRITE_FLIP_ROUTES || '').split(',').map((s) => s.trim());
      if (flipRoutes.includes(IDENTITY_ROUTES.profileLinkSync)) {
        await authoritativeIdentityWrite(IDENTITY_ROUTES.profileLinkSync, { rows: linkMirrorRows });
      } else {
        await mirrorIdentityWrite(IDENTITY_ROUTES.profileLinkSync, { rows: linkMirrorRows });
      }
    }

    // AWS-exit DAL: a twitter link copies the secondary's originalTwitterHandle/profileImageUrl onto
    // the PRIMARY item as top-level keys (twitter branch above). Both are NON-promoted, so dal-reload
    // would have folded them into the box `attributes` JSONB -- but the primary's link-sync row
    // intentionally omits attributes (preserved on conflict) and dal-reload is permanently stopped, so
    // without this the box attributes lag forever (post-STOP persistent drift). Mirror exactly the keys
    // the primary just gained via /profile/attributes-sync, which MERGEs them into attributes
    // (provider/username/telegramUsername preserved). Authoritative when flipped (matching the link-sync
    // mirror above): a box failure already fails the link there, so this adds no new failure surface;
    // idempotent merge -> retry-safe. Runs AFTER link-sync so the primary row exists (attributes-sync is
    // a no-op on a missing row). Only the link path is mirrored here; the unlink REMOVE of these keys is
    // a separate gap tracked by the attributes-mirror audit.
    if (providerKey === 'twitter') {
      // typeof==='string' (not bare truthiness): the box attributes-sync route 400s on a non-string
      // value, which -- being authoritative when flipped -- would throw and fail the whole link while
      // leaving the committed DDB write unmirrored (the exact post-STOP drift this fix prevents). The
      // auto-create path already drops non-strings (above); this guards a legacy non-string read back
      // from an existing secondary's DynamoDB row. Byte-parity holds: same non-empty-string condition
      // the primary DDB write used for these keys.
      const twitterAttrs: Record<string, string> = {};
      if (typeof secondaryProfile.originalTwitterHandle === 'string' && secondaryProfile.originalTwitterHandle) twitterAttrs.originalTwitterHandle = secondaryProfile.originalTwitterHandle;
      if (typeof secondaryProfile.profileImageUrl === 'string' && secondaryProfile.profileImageUrl) twitterAttrs.profileImageUrl = secondaryProfile.profileImageUrl;
      if (Object.keys(twitterAttrs).length > 0) {
        const attrFlipRoutes = (process.env.IDENTITY_WRITE_FLIP_ROUTES || '').split(',').map((s) => s.trim());
        const attrPayload = { identityId: primaryIdentityId, set: twitterAttrs };
        if (attrFlipRoutes.includes(IDENTITY_ROUTES.profileAttributesSync)) {
          await authoritativeIdentityWrite(IDENTITY_ROUTES.profileAttributesSync, attrPayload);
        } else {
          await mirrorIdentityWrite(IDENTITY_ROUTES.profileAttributesSync, attrPayload);
        }
      }
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
