// #3b link-account compute handlers. Faithful box-only port of the nasun-common-link-account lambda
// (lambda-src/link-account/index.ts), read in full. The box (:3211 nasun-identity) is ALREADY the
// authoritative SoT for every write this flow makes (IDENTITY_WRITE_FLIP_ROUTES has link-sync /
// attributes-sync / linked-account-merge), so this de-Lambda only (a) drops the parallel DynamoDB write
// half and (b) moves the HTTP termination box-local. Reads come from the box (by-identity / by-twitter-id),
// writes go to the box (link-sync multi-row UPSERT + attributes-sync), all box-only PG, NO DynamoDB.
//
// Intentional divergences from the lambda (design SSOT, each verified safe):
//   - D2 xHistory (DDB-only audit list) DROPPED: no consumer reads it + already skipped for box-only primaries.
//   - D4 MetaMask manual-dedup + Genesis-Pass allowlist cleanup DROPPED: the only path that set
//     linkedAccounts.metamask.manualEntry===true (register-evm) is 410-disabled, so the by-metamask-address
//     scan is provably empty (dead no-op); the box has no genesis allowlist data.
//   - R8=B secondary optimistic-lock CAS DROPPED: link-sync UPSERTs unconditionally (last-writer-wins). The
//     twitter-uniqueness (Sybil anchor) + transfer-confirm gates run BEFORE the write and ARE preserved; the
//     lost CAS only affects a rare concurrent same-google/metamask double-link. So the lambda's secondary-CAS
//     409 ("just linked by another user") is NOT reproduced. The twitter/confirm 409s ARE preserved.
//   - D1=A onboarding-bonus referral gate DELEGATED to explorer-api (the box cannot read nasun-referrals DDB).
//
// The handler returns { status, body } (server.ts maps it via send()); client-error 4xx throw RouteAbort.

import { RouteAbort } from './http';
import {
  readProfileByIdentityRaw,
  readProfileByTwitterId,
  linkSyncBox,
  syncProfileAttributes,
  grantOnboardingBonus,
} from './clients';

// All primary/secondary/oldPrimary/caller reads use the RAW box row (POST /profile/batch single id), NOT the
// merged /profile/by-identity. The link/unlink/transfer flow writes promoted columns (twitter_handle/twitter_id)
// back via the unconditional link-sync UPSERT, so it MUST read raw column truth -- /profile/by-identity's
// linked-secondary back-fill (server.mjs:993-1001) would otherwise persist a secondary-derived value the lambda
// (raw DynamoDB GetItem) left NULL, and pollute the by-twitter-id anti-Sybil index. See clients.readProfileByIdentityRaw.

// dal-reload's promoted UserProfiles keys (-> dedicated box columns). Everything NOT in this set is folded
// into the box `attributes` JSONB. Byte-parity with link-account/index.ts:51-54 (PROMOTED_PROFILE_KEYS) so a
// freshly-mirrored secondary's attributes match what link-sync inserts.
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

// Box-mirror projection of a UserProfiles row after link/unlink mutates it. Byte-parity with the lambda
// linkSyncRow (index.ts:24-45): full POST-write truth of the dal-reload-mapped columns (not a delta), so the
// box link-sync full-column UPSERT does not wipe an unchanged column. is_telegram_member/telegram_user_id are
// intentionally absent (link-sync leaves them untouched on conflict). attributes set ONLY for a possible FRESH
// INSERT (the auto-created secondary) -- the box ignores it on conflict for existing rows.
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
  if (attributes !== undefined) row.attributes = attributes;
  return row;
}

type HandlerResult = { status: number; body: Record<string, unknown> };

/**
 * Unlink flow (POST /compute/link/unlink). Parity with index.ts:167-377. authenticatedIdentityId is the
 * verified JWT sub (server.ts already verified it). Box-only: reads primary+secondary from the box, removes
 * the provider link both directions, and mirrors the resulting-state rows via link-sync (+ attributes-sync
 * for the dropped non-promoted keys). MED-1 RESOLVED: the secondary read is box-native (the box is SoT), so
 * a box-only secondary's reverse-link IS cleaned (the lambda's DDB-only secondary read skipped box-only ones).
 */
export async function handleUnlinkAccount(
  authenticatedIdentityId: string,
  body: Record<string, any>,
): Promise<HandlerResult> {
  const { primaryIdentityId, provider } = body;
  if (!primaryIdentityId || !provider) {
    throw new RouteAbort(400, { message: 'primaryIdentityId and provider are required' });
  }
  if (primaryIdentityId !== authenticatedIdentityId) {
    throw new RouteAbort(403, { message: 'Forbidden. You can only unlink your own accounts.' });
  }

  const primaryProfile = await readProfileByIdentityRaw(primaryIdentityId);
  if (!primaryProfile) {
    throw new RouteAbort(404, { message: 'User profile not found.' });
  }

  const linkedAccounts: Record<string, any> = primaryProfile.linkedAccounts || {};
  const providerKey = String(provider).toLowerCase();
  if (!linkedAccounts[providerKey]) {
    // Self-canon X: a canonicalized twitter shows as connected via the primary's PROMOTED columns
    // (twitter_handle/twitter_id) with no linkedAccounts.twitter entry (see the 0.5 affirm in
    // handleLinkAccount + the frontend's promoted-column display). Unlinking it must clear those
    // promoted columns rather than 404. Fall through to the normal twitter-strip path below (the
    // twitterStripped branch NULLs the promoted columns and drops the originalTwitterHandle/
    // profileImageUrl attrs) rather than duplicating it; the secondary-cleanup block self-skips since
    // there is no secondary identity. Guarded to a non-Twitter-login primary: for a Twitter-PROVIDER
    // primary the twitter id IS the login identity (and the UI shows no unlink action), so 404 as before.
    const promotedTwitterOnly = providerKey === 'twitter'
      && primaryProfile.provider !== 'Twitter'
      && !!(primaryProfile.twitterId || primaryProfile.twitterHandle);
    if (!promotedTwitterOnly) {
      throw new RouteAbort(404, { message: `No linked ${provider} account found.` });
    }
  }

  const unlinkedAccount = linkedAccounts[providerKey];
  const secondaryIdentityId: string | undefined = unlinkedAccount?.identityId;
  delete linkedAccounts[providerKey];

  // Provider-specific non-promoted attribute keys dropped from the primary (byte-parity index.ts:230-264).
  const attrRemoveKeys: string[] = [];
  let walletAddressNull = false;
  let twitterStripped = false;
  if (providerKey === 'google') {
    if (primaryProfile.provider === 'Twitter') attrRemoveKeys.push('email');
  } else if (providerKey === 'twitter') {
    if (primaryProfile.provider !== 'Twitter') {
      twitterStripped = true;
      attrRemoveKeys.push('originalTwitterHandle', 'profileImageUrl');
    }
  } else if (providerKey === 'metamask') {
    // Only NULL the top-level walletAddress when it IS the EVM being unlinked (a MetaMask-provider primary
    // whose login wallet is the EVM). For Nasun/Google/Twitter primaries the top-level walletAddress is the
    // Nasun login wallet and must never be removed here (index.ts:243-264).
    const unlinkedEvmAddr = typeof unlinkedAccount?.walletAddress === 'string'
      ? unlinkedAccount.walletAddress.toLowerCase() : null;
    const topLevelAddr = typeof primaryProfile.walletAddress === 'string'
      ? primaryProfile.walletAddress.toLowerCase() : null;
    if (unlinkedEvmAddr && topLevelAddr && unlinkedEvmAddr === topLevelAddr) walletAddressNull = true;
  }

  const mirrorRows: Record<string, any>[] = [];
  mirrorRows.push(linkSyncRow(
    primaryIdentityId,
    linkedAccounts,
    primaryProfile.linkedToPrimaryId ?? null,
    twitterStripped ? null : (primaryProfile.twitterHandle ?? null),
    twitterStripped ? null : (primaryProfile.twitterId ?? null),
    walletAddressNull,
  ));

  // Remove the reverse link + ownership marker from the secondary (box-native read; MED-1 fix). Box 404 =>
  // no secondary row => idempotent skip (matches the lambda's `if (secondaryProfile)` guard).
  if (secondaryIdentityId) {
    const secondaryProfile = await readProfileByIdentityRaw(secondaryIdentityId);
    if (secondaryProfile) {
      const secondaryLinkedAccounts: Record<string, any> = secondaryProfile.linkedAccounts || {};
      const primaryProviderKey = primaryProfile.provider?.toLowerCase() || 'unknown';
      delete secondaryLinkedAccounts[primaryProviderKey];
      // Only clear linkedToPrimaryId if it points to the primary doing the unlink (index.ts:323-328).
      const isCurrentOwner = secondaryProfile.linkedToPrimaryId === primaryIdentityId;
      mirrorRows.push(linkSyncRow(
        secondaryIdentityId,
        secondaryLinkedAccounts,
        isCurrentOwner ? null : (secondaryProfile.linkedToPrimaryId ?? null),
        secondaryProfile.twitterHandle ?? null,
        secondaryProfile.twitterId ?? null,
      ));
    }
  }

  // Authoritative box write (one tx, idempotent UPSERT). Then drop the non-promoted attribute keys (no-op
  // when none -- the box attributes-sync 400s on an empty set+remove, mirroring the lambda's early return).
  await linkSyncBox(mirrorRows);
  if (attrRemoveKeys.length > 0) {
    await syncProfileAttributes(primaryIdentityId, {}, attrRemoveKeys);
  }

  return { status: 200, body: { success: true, message: 'Account unlinked successfully.' } };
}

/**
 * Link flow (POST /compute/link root, or /compute/link/admin-link). Parity with index.ts:399-1157. Box-only:
 * reads secondary/primary/oldPrimary from the box, enforces ownership/admin + transfer-confirm +
 * twitter-uniqueness (anti-Sybil, fail-closed), then mirrors the resulting-state rows via link-sync
 * (+ attributes-sync for the non-promoted twitter keys). Onboarding-bonus delegated to explorer-api (D1=A).
 */
export async function handleLinkAccount(
  authenticatedIdentityId: string,
  isAdminLink: boolean,
  body: Record<string, any>,
): Promise<HandlerResult> {
  const {
    primaryIdentityId, secondaryIdentityId, secondaryProvider,
    secondaryUsername, secondaryEmail,
    secondaryTwitterHandle, secondaryTwitterId, secondaryProfileImageUrl,
    secondaryOriginalTwitterHandle,
    confirmTransfer,
  } = body;

  if (!primaryIdentityId || !secondaryIdentityId || !secondaryProvider) {
    throw new RouteAbort(400, { message: 'primaryIdentityId, secondaryIdentityId, and secondaryProvider are required' });
  }

  // Authorization: admin-link verifies the caller's box profile role==='ADMIN'; else ownership (index.ts:415-446).
  if (isAdminLink) {
    const callerProfile = await readProfileByIdentityRaw(authenticatedIdentityId);
    if (!callerProfile || callerProfile.role !== 'ADMIN') {
      throw new RouteAbort(403, { message: 'Forbidden. Admin access required.' });
    }
  } else if (primaryIdentityId !== authenticatedIdentityId) {
    throw new RouteAbort(403, { message: 'Forbidden. You can only link accounts to your own identity.' });
  }

  // 0.5 Self-canon X affirm. The AWS-exit identity migration canonicalized some users' twitter
  //     credential onto their own primary identity (issuer.identity_map twitter_<id> -> primaryId),
  //     so a fresh X OAuth now mints secondaryIdentityId === primaryIdentityId. Re-linking/Sync then
  //     sends secondary === primary, which the transfer-detection scan below (step 2.5) would
  //     misread as a conflict against the caller's OWN linked accounts (-> spurious LINK_NEEDS_CONFIRM
  //     or, after confirm, a self twitter-uniqueness 409). secondary === primary is itself PROOF the
  //     caller owns this twitter (the issuer minted it onto the JWT-sub primary), so there is nothing
  //     to link: affirm and return. We write NOTHING (no self-referential linkedAccounts.twitter,
  //     which would break unlink) -- the promoted twitter columns were already refreshed by the
  //     OAuth callback's twitter-primary mirror, and the x-link onboarding bonus already fired there.
  //     Scoped to non-admin twitter self-links only; admin-link and other providers are unaffected.
  if (!isAdminLink && primaryIdentityId === secondaryIdentityId
      && String(secondaryProvider).toLowerCase() === 'twitter') {
    return { status: 200, body: { success: true, selfAffirmed: true, message: 'X account already linked to this wallet.' } };
  }

  // 1. Secondary profile (box). Auto-create in-memory when absent; persisted via the final link-sync
  //    (which INSERTs with attributes on a fresh row, byte-parity with the lambda's auto-create + the
  //    R8=B last-writer-wins decision -- no separate conditional PutItem).
  let secondaryProfile = await readProfileByIdentityRaw(secondaryIdentityId);
  if (!secondaryProfile) {
    const created: Record<string, any> = {
      identityId: secondaryIdentityId,
      provider: secondaryProvider,
      username: secondaryUsername || secondaryIdentityId,
      linkedToPrimaryId: primaryIdentityId,
    };
    if (secondaryEmail) created.email = secondaryEmail;
    if (secondaryTwitterHandle) created.twitterHandle = secondaryTwitterHandle;
    if (typeof secondaryOriginalTwitterHandle === 'string' && secondaryOriginalTwitterHandle) created.originalTwitterHandle = secondaryOriginalTwitterHandle;
    if (secondaryTwitterId) created.twitterId = secondaryTwitterId;
    if (typeof secondaryProfileImageUrl === 'string' && secondaryProfileImageUrl) created.profileImageUrl = secondaryProfileImageUrl;
    secondaryProfile = created;
  }

  // 2. Primary profile (box).
  const primaryProfile = await readProfileByIdentityRaw(primaryIdentityId);
  if (!primaryProfile) {
    throw new RouteAbort(404, { message: 'Primary user profile not found.' });
  }

  // 2.5 Auto-transfer detection: linkedToPrimaryId as primary source, reverse-link as v1 fallback (index.ts:532-559).
  const currentOwnerId: string | undefined = secondaryProfile.linkedToPrimaryId;
  let oldPrimaryId: string | undefined;
  let oldPrimaryMirrorRow: Record<string, any> | null = null;
  const oldPrimaryAttrRemoveKeys: string[] = [];

  if (currentOwnerId && currentOwnerId !== primaryIdentityId) {
    oldPrimaryId = currentOwnerId;
  } else if (!currentOwnerId) {
    const existingSecondaryLinks: Record<string, any> = secondaryProfile.linkedAccounts || {};
    const conflictingLink = Object.entries(existingSecondaryLinks)
      .find(([, info]: [string, any]) => info?.identityId && info.identityId !== primaryIdentityId);
    if (conflictingLink) oldPrimaryId = (conflictingLink[1] as any).identityId;
  }

  if (oldPrimaryId) {
    const oldPrimary = await readProfileByIdentityRaw(oldPrimaryId);
    if (oldPrimary) {
      const oldLinked: Record<string, any> = oldPrimary.linkedAccounts || {};
      const matchingKey = Object.keys(oldLinked).find((k) => oldLinked[k]?.identityId === secondaryIdentityId);
      if (matchingKey) {
        // Twitter is uniqueness-enforced: never auto-transfer, even with confirmTransfer (index.ts:578-598).
        if (matchingKey === 'twitter' && !isAdminLink) {
          throw new RouteAbort(409, {
            code: 'TWITTER_ALREADY_LINKED',
            message: 'This X account is already linked to another wallet. Unlink it from the other wallet first.',
            existingPrimary: {
              identityId: oldPrimaryId,
              walletAddress: typeof oldPrimary.walletAddress === 'string' ? oldPrimary.walletAddress : null,
              username: oldPrimary.customDisplayName || oldPrimary.username || null,
            },
          });
        }
        // Other providers: require explicit confirmation before transferring (index.ts:604-625).
        if (!isAdminLink && confirmTransfer !== true) {
          throw new RouteAbort(409, {
            code: 'LINK_NEEDS_CONFIRM',
            message: `This ${secondaryProvider} account is already linked to another wallet.`,
            existingPrimary: {
              identityId: oldPrimaryId,
              walletAddress: typeof oldPrimary.walletAddress === 'string' ? oldPrimary.walletAddress : null,
              username: oldPrimary.customDisplayName || oldPrimary.username || null,
            },
          });
        }

        delete oldLinked[matchingKey];
        let oldTwitterStripped = false;
        let oldWalletNull = false;
        if (matchingKey === 'twitter' && oldPrimary.provider !== 'Twitter') {
          oldTwitterStripped = true;
          oldPrimaryAttrRemoveKeys.push('originalTwitterHandle', 'profileImageUrl');
        } else if (matchingKey === 'google' && oldPrimary.provider === 'Twitter') {
          oldPrimaryAttrRemoveKeys.push('email');
        } else if (matchingKey === 'metamask' && oldPrimary.provider === 'MetaMask') {
          oldWalletNull = true;
        }
        oldPrimaryMirrorRow = linkSyncRow(
          oldPrimaryId,
          oldLinked,
          oldPrimary.linkedToPrimaryId ?? null,
          oldTwitterStripped ? null : (oldPrimary.twitterHandle ?? null),
          oldTwitterStripped ? null : (oldPrimary.twitterId ?? null),
          oldWalletNull,
        );
      }
    }
  }

  // 3. Build the linked account info (index.ts:675-707).
  const providerKey = String(secondaryProvider).toLowerCase();
  const linkedInfo: Record<string, any> = {
    identityId: secondaryIdentityId,
    username: secondaryProfile.username || 'N/A',
    linkedAt: new Date().toISOString(),
  };
  if (secondaryProfile.twitterHandle) linkedInfo.twitterHandle = secondaryProfile.twitterHandle;
  if (secondaryProfile.originalTwitterHandle) linkedInfo.originalTwitterHandle = secondaryProfile.originalTwitterHandle;
  if (secondaryProfile.twitterId) linkedInfo.twitterId = secondaryProfile.twitterId;
  if (secondaryProfile.email) linkedInfo.email = secondaryProfile.email;
  if (secondaryProfile.profileImageUrl) linkedInfo.profileImageUrl = secondaryProfile.profileImageUrl;
  if (secondaryProfile.walletAddress) linkedInfo.walletAddress = secondaryProfile.walletAddress;

  // 4. Merge into the primary's linkedAccounts (mutates primaryProfile.linkedAccounts in place, like the lambda).
  const primaryLinkedAccounts: Record<string, any> = primaryProfile.linkedAccounts || {};
  primaryLinkedAccounts[providerKey] = linkedInfo;

  // 5. Twitter uniqueness (anti-Sybil) -- a twitterId already linked to a different (non-self) primary cannot
  //    be re-linked (index.ts:720-815). FAIL-CLOSED: a box read error -> 503 (never silently "no conflict").
  if (providerKey === 'twitter' && secondaryProfile.twitterId && !isAdminLink) {
    const primaryLinked: Record<string, any> = primaryProfile.linkedAccounts || {};
    const selfIds = new Set<string>([
      primaryIdentityId,
      secondaryIdentityId,
      ...Object.values(primaryLinked).map((v: any) => v?.identityId).filter(Boolean),
    ]);
    let conflict: { identityId: string; walletAddress: string | null; displayName: string | null } | null = null;
    try {
      const matches = await readProfileByTwitterId(secondaryProfile.twitterId);
      for (const m of matches) {
        if (!m?.identityId || selfIds.has(m.identityId)) continue;
        conflict = {
          identityId: m.identityId,
          walletAddress: typeof m.walletAddress === 'string' ? m.walletAddress : null,
          displayName: (m.customDisplayName || m.username || null) as string | null,
        };
        break;
      }
    } catch (e) {
      console.warn('[compute] twitter uniqueness query failed:', e instanceof Error ? e.message : e);
      throw new RouteAbort(503, {
        code: 'TWITTER_UNIQUENESS_CHECK_FAILED',
        message: 'Could not verify X account uniqueness. Please try again.',
      });
    }
    if (conflict) {
      throw new RouteAbort(409, {
        code: 'TWITTER_ALREADY_LINKED',
        message: 'This X account is already linked to another wallet. Unlink it from the other wallet first.',
        existingPrimary: {
          identityId: conflict.identityId,
          walletAddress: conflict.walletAddress,
          username: conflict.displayName,
        },
      });
    }
  }

  // (D4) MetaMask manual-dedup + Genesis-Pass cleanup DROPPED -- dead path (no manualEntry=true rows exist).

  // 6. Reverse link info for the secondary (index.ts:1023-1037).
  const primaryProviderKey = primaryProfile.provider?.toLowerCase() || 'unknown';
  const reverseLinkInfo: Record<string, any> = {
    identityId: primaryIdentityId,
    username: primaryProfile.username || 'N/A',
    linkedAt: new Date().toISOString(),
  };
  if (primaryProfile.email) reverseLinkInfo.email = primaryProfile.email;
  if (primaryProfile.twitterHandle) reverseLinkInfo.twitterHandle = primaryProfile.twitterHandle;
  if (primaryProfile.originalTwitterHandle) reverseLinkInfo.originalTwitterHandle = primaryProfile.originalTwitterHandle;
  if (primaryProfile.twitterId) reverseLinkInfo.twitterId = primaryProfile.twitterId;
  if (primaryProfile.profileImageUrl) reverseLinkInfo.profileImageUrl = primaryProfile.profileImageUrl;
  if (primaryProfile.walletAddress) reverseLinkInfo.walletAddress = primaryProfile.walletAddress;

  // 7. Secondary linkedAccounts + owner (R8=B: unconditional, folded into link-sync below).
  const secondaryLinkedAccounts: Record<string, any> = secondaryProfile.linkedAccounts || {};
  secondaryLinkedAccounts[primaryProviderKey] = reverseLinkInfo;

  // Onboarding bonus (D1=A: explorer-api gates referral-activated). Best-effort, never blocks the link.
  if (providerKey === 'google') {
    await grantOnboardingBonus({
      identityId: primaryIdentityId,
      walletAddress: primaryProfile.walletAddress ?? null,
      kind: 'google-link',
      externalId: secondaryIdentityId,
    });
  } else if (providerKey === 'twitter' && secondaryProfile.twitterId) {
    await grantOnboardingBonus({
      identityId: primaryIdentityId,
      walletAddress: primaryProfile.walletAddress ?? null,
      kind: 'x-link',
      externalId: secondaryProfile.twitterId,
    });
  }

  // (D2) xHistory DROPPED -- DDB-only audit, no consumer, already skipped for box-only primaries.

  // Authoritative box write: old primary (transfer) + primary + secondary, full resulting-state, one tx
  // (index.ts:1080-1117). The primary's promoted twitter columns reflect the just-linked twitter when the
  // provider is twitter (index.ts:1089-1094). The secondary carries attributes ONLY on a fresh INSERT.
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
  linkMirrorRows.push(linkSyncRow(
    secondaryIdentityId,
    secondaryLinkedAccounts,
    primaryIdentityId,
    secondaryProfile.twitterHandle ?? null,
    secondaryProfile.twitterId ?? null,
    false,
    profileAttributes(secondaryProfile),
  ));
  await linkSyncBox(linkMirrorRows);

  // A twitter link copies the secondary's originalTwitterHandle/profileImageUrl onto the PRIMARY as
  // non-promoted attribute keys (index.ts:1119-1141). typeof==='string' guard: the box attributes-sync 400s
  // on a non-string (byte-parity with the lambda's same guard). No-op when empty.
  if (providerKey === 'twitter') {
    const twitterAttrs: Record<string, string> = {};
    if (typeof secondaryProfile.originalTwitterHandle === 'string' && secondaryProfile.originalTwitterHandle) twitterAttrs.originalTwitterHandle = secondaryProfile.originalTwitterHandle;
    if (typeof secondaryProfile.profileImageUrl === 'string' && secondaryProfile.profileImageUrl) twitterAttrs.profileImageUrl = secondaryProfile.profileImageUrl;
    if (Object.keys(twitterAttrs).length > 0) {
      await syncProfileAttributes(primaryIdentityId, twitterAttrs, []);
    }
  }

  // On a transfer-unlink the OLD primary dropped non-promoted keys (index.ts:1143-1149). No-op unless populated.
  if (oldPrimaryId && oldPrimaryAttrRemoveKeys.length > 0) {
    await syncProfileAttributes(oldPrimaryId, {}, oldPrimaryAttrRemoveKeys);
  }

  return { status: 200, body: { success: true, message: 'Accounts linked successfully.' } };
}
