import { isIssuerMintEnabled, mintViaIssuer } from '../../../_shared/auth/issuer-mint';

export interface CognitoIdentity {
  identityId: string;
  token?: string;
}

/**
 * Mint an identity token (identityId + JWT) for an EVM wallet from the self-hosted issuer.
 * The Cognito Identity Pool fallback was removed after the AWS-exit P3 decommission (Pool
 * 312bb111 deleted 2026-06-18); the box issuer is the only mint path. The function name and
 * return shape stay unchanged for the verify/connect-verify handlers.
 * @param walletAddress 이더리움 지갑 주소
 */
export async function getCognitoIdentityId(
  walletAddress: string
): Promise<CognitoIdentity> {
  // metamask_ prefix mirrors the legacy Cognito developer identifier and is the lookup key in
  // issuer.identity_map (seeded from the Stage 1 Cognito export), so it must stay identical.
  const developerUserIdentifier = `metamask_${walletAddress.toLowerCase()}`;

  if (!isIssuerMintEnabled()) {
    throw new Error('ISSUER_MINT_URL not configured; Cognito Identity Pool is decommissioned');
  }

  try {
    return await mintViaIssuer(developerUserIdentifier, 'metamask');
  } catch (error) {
    console.error('Error minting identity from issuer:', error);
    throw new Error('Failed to authenticate with identity issuer');
  }
}
