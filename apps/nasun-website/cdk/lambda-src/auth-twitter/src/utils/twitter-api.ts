import axios, { AxiosResponse } from 'axios';

export interface TwitterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  verified?: boolean;
}

export interface TwitterUserResponse {
  data: TwitterUser;
}

export class TwitterAPI {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string, 
    verifier: string, 
    redirectUri: string
  ): Promise<TwitterTokenResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response: AxiosResponse<TwitterTokenResponse> = await axios.post(
      'https://api.x.com/2/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
      }
    );

    return response.data;
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken: string): Promise<TwitterUser> {
    const response: AxiosResponse<TwitterUserResponse> = await axios.get(
      'https://api.twitter.com/2/users/me',
      {
        params: {
          'user.fields': 'id,name,username,profile_image_url,verified'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    return response.data.data;
  }

  /**
   * Generate Twitter OAuth authorization URL
   */
  generateAuthUrl(
    redirectUri: string,
    codeChallenge: string,
    state: string,
    scopes: string[] = ['tweet.read', 'users.read']
  ): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }
}