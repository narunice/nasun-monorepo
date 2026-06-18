import { TwitterUser } from './twitter-api';
import { isIssuerMintEnabled, mintViaIssuer } from '../../../_shared/auth/issuer-mint';

export interface CognitoIdentity {
  identityId: string;
  token?: string;
}

export class CognitoService {
  /**
   * Mint an identity token (identityId + JWT) for a Twitter user from the self-hosted issuer.
   * The Cognito Identity Pool fallback was removed after the AWS-exit P3 decommission (Pool
   * 312bb111 deleted 2026-06-18); the box issuer is the only mint path.
   */
  async getCognitoIdentityId(twitterUser: TwitterUser): Promise<CognitoIdentity> {
    // Use Twitter user ID as the developer user identifier. This is also the lookup key in
    // issuer.identity_map (seeded from the Stage 1 Cognito export), so it must stay identical.
    const developerUserIdentifier = `twitter_${twitterUser.id}`;

    if (!isIssuerMintEnabled()) {
      throw new Error('ISSUER_MINT_URL not configured; Cognito Identity Pool is decommissioned');
    }

    try {
      return await mintViaIssuer(developerUserIdentifier, 'twitter');
    } catch (error) {
      console.error('Error minting identity from issuer:', error);
      throw new Error('Failed to authenticate with identity issuer');
    }
  }
}