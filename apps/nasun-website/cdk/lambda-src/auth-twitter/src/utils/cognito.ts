import { 
  CognitoIdentityClient, 
  GetIdCommand, 
  GetOpenIdTokenForDeveloperIdentityCommand 
} from '@aws-sdk/client-cognito-identity';
import { TwitterUser } from './twitter-api';

export interface CognitoIdentity {
  identityId: string;
  token?: string;
}

export class CognitoService {
  private client: CognitoIdentityClient;
  private identityPoolId: string;
  private developerProviderName: string;

  constructor(identityPoolId: string, developerProviderName: string, region: string = 'ap-northeast-2') {
    this.client = new CognitoIdentityClient({ region });
    this.identityPoolId = identityPoolId;
    this.developerProviderName = developerProviderName;
  }

  /**
   * Get Cognito Identity ID using Twitter user information
   * Uses Developer Identity Provider method
   */
  async getCognitoIdentityId(twitterUser: TwitterUser): Promise<CognitoIdentity> {
    try {
      // Use Twitter user ID as the developer user identifier
      const developerUserIdentifier = `twitter_${twitterUser.id}`;

      const command = new GetOpenIdTokenForDeveloperIdentityCommand({
        IdentityPoolId: this.identityPoolId,
        Logins: {
          [this.developerProviderName]: developerUserIdentifier,
        },
        // Optional: Set token duration (default is 15 minutes, max is 24 hours)
        TokenDuration: 86400, // 24 hours — admin sessions for 2-person team
      });

      const response = await this.client.send(command);

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

  /**
   * Alternative method using standard GetId command
   * This method can be used if you have valid Twitter OAuth token
   */
  async getCognitoIdentityIdWithToken(twitterAccessToken: string): Promise<string> {
    try {
      const command = new GetIdCommand({
        IdentityPoolId: this.identityPoolId,
        Logins: {
          'api.twitter.com': twitterAccessToken,
        },
      });

      const response = await this.client.send(command);

      if (!response.IdentityId) {
        throw new Error('Failed to get Cognito Identity ID');
      }

      return response.IdentityId;
    } catch (error) {
      console.error('Error getting Cognito Identity ID with token:', error);
      throw new Error('Failed to authenticate with Cognito Identity Pool');
    }
  }
}