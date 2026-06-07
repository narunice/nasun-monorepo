import {
  CognitoIdentityClient,
  GetOpenIdTokenForDeveloperIdentityCommand,
} from '@aws-sdk/client-cognito-identity';
import { isIssuerMintEnabled, mintViaIssuer } from '../../../_shared/auth/issuer-mint';

const client = new CognitoIdentityClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID!;
const developerProviderName = process.env.COGNITO_DEVELOPER_PROVIDER_NAME || 'nasun.io';

export interface CognitoIdentity {
  identityId: string;
  token?: string;
}

/**
 * Cognito Developer Identity를 발급하여 identityId와 토큰 반환
 * @param walletAddress Sui 지갑 주소 (0x + 64 hex chars)
 */
export async function getCognitoIdentityId(
  walletAddress: string
): Promise<CognitoIdentity> {
  // Use nasun_ prefix to distinguish from metamask_ (Ethereum) identities. This is also the lookup
  // key in issuer.identity_map (seeded from the Stage 1 Cognito export), so it must stay identical.
  const developerUserIdentifier = `nasun_${walletAddress.toLowerCase()}`;

  // AWS-exit grace: mint from the self-hosted issuer when wired, otherwise fall back to Cognito.
  if (isIssuerMintEnabled()) {
    try {
      return await mintViaIssuer(developerUserIdentifier, 'sui');
    } catch (error) {
      console.error('Error minting identity from issuer:', error);
      throw new Error('Failed to authenticate with identity issuer');
    }
  }

  try {
    const command = new GetOpenIdTokenForDeveloperIdentityCommand({
      IdentityPoolId: identityPoolId,
      Logins: {
        [developerProviderName]: developerUserIdentifier,
      },
      TokenDuration: 86400, // 24 hours — extended admin sessions
    });

    const response = await client.send(command);

    if (!response.IdentityId) {
      throw new Error('Failed to get Cognito Identity ID');
    }

    return {
      identityId: response.IdentityId,
      token: response.Token,
    };
  } catch (error) {
    console.error('Error getting Cognito Identity ID:', error);
    throw new Error('Failed to authenticate with Cognito Identity Pool');
  }
}
