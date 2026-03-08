import {
  CognitoIdentityClient,
  GetOpenIdTokenForDeveloperIdentityCommand,
} from '@aws-sdk/client-cognito-identity';

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
  try {
    // Use nasun_ prefix to distinguish from metamask_ (Ethereum) identities
    const developerUserIdentifier = `nasun_${walletAddress.toLowerCase()}`;

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
